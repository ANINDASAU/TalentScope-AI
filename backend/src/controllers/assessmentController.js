const mongoose = require('mongoose');
const Assessment = require('../models/Assessment');
const User = require('../models/User');
const Coach = require('../models/Coach');
const RedisService = require('../services/redisService');

/**
 * Helper to generate unique assessment code (e.g. TS-942-AXL)
 */
const generateAssessmentCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 3; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const num = Math.floor(100 + Math.random() * 900);
  return `TS-${num}-${rand}`;
};

/**
 * Helper to verify athlete or coach access to an assessment
 */
const checkAssessmentAccess = async (req, assessment) => {
  if (!req.user) return false;

  const rawAthleteId = assessment.athleteId?._id || assessment.athleteId;
  if (!rawAthleteId) return false;

  // 1. Athlete owner has direct access
  if (rawAthleteId.toString() === req.user._id.toString()) {
    return true;
  }

  // 2. Admin has global access
  if (req.user.role === 'admin') {
    return true;
  }

  // 3. Coach access: check if coach is assigned to this athlete
  if (req.user.role === 'coach') {
    const coach = await Coach.findOne({ userId: req.user._id });
    if (coach && coach.assignedAthletes.some((id) => id.toString() === rawAthleteId.toString())) {
      return true;
    }
  }

  return false;
};

/**
 * @desc    1. Create a new assessment record (idempotent for offline clients)
 * @route   POST /api/assessments
 * @access  Private (Athlete)
 *
 * Duplicate-safety contract:
 *  - If the request body carries an `idempotencyKey`, a record with that key
 *    already existing for this athlete is RETURNED (not duplicated). This
 *    makes retries safe when the original response was lost (timeout,
 *    app restart mid-upload, manual retry, flapping connectivity).
 *  - Concurrent duplicate requests are caught by the unique index (E11000)
 *    and resolved to the winning record.
 *  - Requests WITHOUT a key behave exactly as before (back-compat).
 */
exports.createAssessment = async (req, res) => {
  try {
    const athleteId = req.user._id;
    const { sport, testType, category, videoUrl, videoMetadata, idempotencyKey } = req.body;

    // 1. Replay lookup: an assessment with this client-generated key already
    //    exists -> return it instead of creating a second one.
    if (idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim()) {
      const existing = await Assessment.findOne({
        athleteId,
        idempotencyKey: idempotencyKey.trim()
      });
      if (existing) {
        return res.status(200).json({
          success: true,
          message: 'Assessment already exists for this idempotency key',
          data: existing
        });
      }
    }

    const assessmentCode = req.body.assessmentCode || generateAssessmentCode();

    let assessment;
    try {
      assessment = await Assessment.create({
        assessmentCode,
        athleteId,
        sport: sport || req.user.primarySport || 'Athletics',
        testType: testType || 'unilateral_squat',
        category: category || 'Athletics',
        status: 'created',
        videoUrl: videoUrl || null,
        videoMetadata: videoMetadata || {},
        idempotencyKey: idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim()
          ? idempotencyKey.trim()
          : null
      });
    } catch (raceError) {
      // 2. Unique-index race (two concurrent creates with the same key):
      //    resolve to the record that won.
      if (raceError?.code === 11000 || /duplicate key/i.test(String(raceError?.message || ''))) {
        const winner = await Assessment.findOne({
          athleteId,
          idempotencyKey: idempotencyKey.trim()
        });
        if (winner) {
          return res.status(200).json({
            success: true,
            message: 'Assessment already exists for this idempotency key',
            data: winner
          });
        }
      }
      throw raceError;
    }

    // Invalidate dashboard count cache
    await RedisService.invalidateAthleteCache(athleteId);

    return res.status(201).json({
      success: true,
      message: 'Assessment created successfully',
      data: assessment
    });
  } catch (error) {
    console.error('[Create Assessment Error]:', error.message);
    // Client-side data problems (validation, bad enum/refs) are 400s, not server errors
    const isValidationError = error.name === 'ValidationError' || /validation failed|is not a valid enum value|Cast to .* failed/i.test(error.message || '');
    return res.status(isValidationError ? 400 : 500).json({
      success: false,
      message: error.message || 'Server error creating assessment'
    });
  }
};

/**
 * @desc    2. Retrieve assessment by ID or assessmentCode
 * @route   GET /api/assessments/:id
 * @access  Private (Athlete Owner or Authorized Coach)
 */
exports.getAssessmentById = async (req, res) => {
  try {
    const { id } = req.params;
    let query;

    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { _id: id };
    } else {
      query = { assessmentCode: id.toUpperCase() };
    }

    const assessment = await Assessment.findOne(query).populate('athleteId', 'name primarySport tier avatar');

    if (!assessment) {
      return res.status(404).json({
        success: false,
        message: 'Assessment not found'
      });
    }

    const isAuthorized = await checkAssessmentAccess(req, assessment);
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized. You do not have permission to view this assessment.'
      });
    }

    return res.status(200).json({
      success: true,
      data: assessment
    });
  } catch (error) {
    console.error('[Get Assessment Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error retrieving assessment'
    });
  }
};

/**
 * @desc    3. Update assessment status (e.g. uploading -> processing)
 * @route   PATCH /api/assessments/:id/status
 * @access  Private (Athlete Owner or Authorized Worker)
 */
exports.updateAssessmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ['created', 'pending', 'uploading', 'processing', 'completed', 'failed'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status '${status}'. Allowed: ${allowedStatuses.join(', ')}`
      });
    }

    const assessment = await Assessment.findById(id);
    if (!assessment) {
      return res.status(404).json({
        success: false,
        message: 'Assessment not found'
      });
    }

    const isAuthorized = await checkAssessmentAccess(req, assessment);
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized. You do not have permission to modify this assessment.'
      });
    }

    assessment.status = status;
    if (status === 'completed' && !assessment.completedAt) {
      assessment.completedAt = new Date();
    }
    await assessment.save();

    return res.status(200).json({
      success: true,
      message: `Assessment status updated to '${status}'`,
      data: assessment
    });
  } catch (error) {
    console.error('[Update Status Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error updating status'
    });
  }
};

/**
 * @desc    4. Save assessment analysis results & persist AI outputs
 * @route   PUT /api/assessments/:id/results
 * @access  Private (Athlete Owner or AI Worker)
 */
exports.saveAnalysisResult = async (req, res) => {
  try {
    const { id } = req.params;
    const assessment = await Assessment.findById(id);

    if (!assessment) {
      return res.status(404).json({
        success: false,
        message: 'Assessment not found'
      });
    }

    const isAuthorized = await checkAssessmentAccess(req, assessment);
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized. You do not have permission to modify this assessment.'
      });
    }

    const {
      overallScore,
      speed,
      power,
      endurance,
      previousScoreComparison,
      percentileRank,
      biometricsBreakdown,
      jointKinematics,
      hasPostureWarning,
      criticalWarnings,
      heatmapSpots,
      injuryRiskClassification,
      recommendations,
      aiMetadata,
      aiInsights,
      environmentValidation,
      keyframeSnapshotUrl,
      videoUrl
    } = req.body;

    if (overallScore !== undefined) assessment.overallScore = overallScore;
    if (speed !== undefined) assessment.speed = speed;
    if (power !== undefined) assessment.power = power;
    if (endurance !== undefined) assessment.endurance = endurance;
    if (previousScoreComparison !== undefined) assessment.previousScoreComparison = previousScoreComparison;
    if (percentileRank !== undefined) assessment.percentileRank = percentileRank;
    if (biometricsBreakdown !== undefined) assessment.biometricsBreakdown = biometricsBreakdown;
    if (jointKinematics !== undefined) assessment.jointKinematics = jointKinematics;
    if (hasPostureWarning !== undefined) assessment.hasPostureWarning = hasPostureWarning;
    if (criticalWarnings !== undefined) assessment.criticalWarnings = criticalWarnings;
    if (heatmapSpots !== undefined) assessment.heatmapSpots = heatmapSpots;
    if (injuryRiskClassification !== undefined) assessment.injuryRiskClassification = injuryRiskClassification;
    if (recommendations !== undefined) assessment.recommendations = recommendations;
    if (aiMetadata !== undefined) assessment.aiMetadata = aiMetadata;
    if (aiInsights !== undefined) assessment.aiInsights = aiInsights;
    if (environmentValidation !== undefined) assessment.environmentValidation = environmentValidation;
    if (keyframeSnapshotUrl !== undefined) assessment.keyframeSnapshotUrl = keyframeSnapshotUrl;
    if (videoUrl !== undefined) assessment.videoUrl = videoUrl;

    assessment.status = req.body.status || 'completed';
    assessment.completedAt = new Date();

    // 1. Save to MongoDB (Permanent Source of Truth)
    await assessment.save();

    // 2. Synchronize aggregate performance stats on Athlete profile in MongoDB
    if (assessment.overallScore !== null && assessment.overallScore !== undefined) {
      await User.findByIdAndUpdate(assessment.athleteId, {
        overallPerformanceScore: assessment.overallScore,
        currentInjuryRiskLevel: assessment.injuryRiskClassification?.riskStatus || 'Low',
        currentInjuryRiskPercentage: assessment.injuryRiskClassification?.riskPercentage || 12,
        lastAssessmentDate: new Date(),
        $inc: { totalAssessmentsCount: 1 }
      });
    }

    // 3. Invalidate relevant Redis Cache
    await RedisService.invalidateAthleteCache(assessment.athleteId);

    return res.status(200).json({
      success: true,
      message: 'Assessment results saved and persisted successfully',
      data: assessment
    });
  } catch (error) {
    console.error('[Save Analysis Result Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error saving analysis result'
    });
  }
};

/**
 * @desc    5. Mark assessment completed
 * @route   PATCH /api/assessments/:id/complete
 * @access  Private (Athlete Owner or AI Worker)
 */
exports.markCompleted = async (req, res) => {
  try {
    const { id } = req.params;
    const assessment = await Assessment.findById(id);

    if (!assessment) {
      return res.status(404).json({
        success: false,
        message: 'Assessment not found'
      });
    }

    const isAuthorized = await checkAssessmentAccess(req, assessment);
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized. You do not have permission to modify this assessment.'
      });
    }

    assessment.status = 'completed';
    assessment.completedAt = new Date();
    await assessment.save();

    // Invalidate athlete cache in Redis
    await RedisService.invalidateAthleteCache(assessment.athleteId);

    return res.status(200).json({
      success: true,
      message: 'Assessment marked as completed',
      data: assessment
    });
  } catch (error) {
    console.error('[Mark Completed Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error marking assessment completed'
    });
  }
};

/**
 * @desc    6. Mark assessment failed with safe error details
 * @route   PATCH /api/assessments/:id/fail
 * @access  Private (Athlete Owner or AI Worker)
 */
exports.markFailed = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, message, failedStep } = req.body;

    const assessment = await Assessment.findById(id);
    if (!assessment) {
      return res.status(404).json({
        success: false,
        message: 'Assessment not found'
      });
    }

    const isAuthorized = await checkAssessmentAccess(req, assessment);
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized. You do not have permission to modify this assessment.'
      });
    }

    assessment.status = 'failed';
    assessment.errorDetails = {
      code: code || 'ANALYSIS_FAILED',
      message: message || 'Pose estimation analysis encountered an error.',
      failedStep: failedStep || 'processing',
      occurredAt: new Date()
    };

    await assessment.save();

    // Invalidate athlete cache in Redis
    await RedisService.invalidateAthleteCache(assessment.athleteId);

    return res.status(200).json({
      success: true,
      message: 'Assessment marked as failed',
      data: assessment
    });
  } catch (error) {
    console.error('[Mark Failed Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error marking assessment failed'
    });
  }
};

/**
 * @desc    7. Retrieve authenticated athlete's assessment history
 * @route   GET /api/assessments/history
 * @access  Private (Athlete)
 */
exports.getAthleteAssessmentHistory = async (req, res) => {
  try {
    const athleteId = req.user._id;
    const { sport, testType, status } = req.query;

    const filter = { athleteId };

    if (sport) filter.sport = sport;
    if (testType) filter.testType = testType;
    if (status) filter.status = status;

    const assessments = await Assessment.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: assessments.length,
      data: assessments
    });
  } catch (error) {
    console.error('[Get History Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error retrieving assessment history'
    });
  }
};

/**
 * @desc    8. Retrieve athlete's latest completed assessment (with Redis Cache-Aside)
 * @route   GET /api/assessments/latest
 * @access  Private (Athlete)
 */
exports.getAthleteLatestAssessment = async (req, res) => {
  try {
    const athleteId = req.user._id;
    const cacheKey = RedisService.getLatestAssessmentKey(athleteId);

    // 1. Check Redis Cache
    const cachedLatest = await RedisService.get(cacheKey);
    if (cachedLatest !== null && cachedLatest !== undefined) {
      return res.status(200).json({
        success: true,
        cached: true,
        data: cachedLatest
      });
    }

    // 2. Cache Miss -> Query MongoDB
    const latestAssessment = await Assessment.findOne({
      athleteId,
      status: 'completed'
    }).sort({ createdAt: -1 });

    // 3. Populate Redis with 5 minute TTL (300 seconds)
    if (latestAssessment) {
      await RedisService.set(cacheKey, latestAssessment, 300);
    }

    return res.status(200).json({
      success: true,
      cached: false,
      data: latestAssessment || null
    });
  } catch (error) {
    console.error('[Get Latest Assessment Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error retrieving latest assessment'
    });
  }
};
