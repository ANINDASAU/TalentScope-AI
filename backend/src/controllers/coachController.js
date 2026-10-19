const mongoose = require('mongoose');
const Coach = require('../models/Coach');
const User = require('../models/User');
const Assessment = require('../models/Assessment');

/**
 * @desc    Get all coaches with optional search & specialty filters
 * @route   GET /api/coaches
 * @access  Public
 */
exports.getCoaches = async (req, res) => {
  try {
    const { search, specialty, verified } = req.query;
    const filter = { availableForConsultation: true };

    if (verified !== undefined) {
      filter.verified = verified === 'true';
    }

    if (specialty && specialty !== 'All') {
      filter.specialties = { $in: [new RegExp(specialty, 'i')] };
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { specialties: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const coaches = await Coach.find(filter).sort({ rating: -1, reviewsCount: -1 });

    return res.status(200).json({
      success: true,
      count: coaches.length,
      data: coaches
    });
  } catch (error) {
    console.error('[Get Coaches Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error retrieving coaches'
    });
  }
};

/**
 * @desc    Get coach profile by ID
 * @route   GET /api/coaches/:id
 * @access  Public
 */
exports.getCoachById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        success: false,
        message: 'Coach not found (invalid ID format)'
      });
    }

    const coach = await Coach.findById(id);

    if (!coach) {
      return res.status(404).json({
        success: false,
        message: 'Coach not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: coach
    });
  } catch (error) {
    console.error('[Get Coach By ID Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error retrieving coach profile'
    });
  }
};

/**
 * @desc    Authorize an athlete for coach access
 * @route   POST /api/coaches/:coachId/authorize-athlete
 * @access  Private (Athlete or Admin)
 */
exports.authorizeAthlete = async (req, res) => {
  try {
    const { coachId } = req.params;
    const { athleteId } = req.body;

    const targetAthleteId = athleteId || req.user._id;

    const coach = await Coach.findById(coachId);
    if (!coach) {
      return res.status(404).json({
        success: false,
        message: 'Coach not found'
      });
    }

    const athlete = await User.findById(targetAthleteId);
    if (!athlete) {
      return res.status(404).json({
        success: false,
        message: 'Athlete not found'
      });
    }

    // Add to assignedAthletes if not already present
    if (!coach.assignedAthletes.some((id) => id.equals(targetAthleteId))) {
      coach.assignedAthletes.push(targetAthleteId);
      await coach.save();
    }

    return res.status(200).json({
      success: true,
      message: `Athlete '${athlete.name}' successfully authorized for Coach '${coach.name}'`,
      coach
    });
  } catch (error) {
    console.error('[Authorize Athlete Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error authorizing athlete'
    });
  }
};

/**
 * @desc    Get authorized athlete's assessments (Restricted to authorized coach)
 * @route   GET /api/coaches/:coachId/athletes/:athleteId/assessments
 * @access  Private (Authorized Coach)
 */
exports.getCoachAthleteAssessments = async (req, res) => {
  try {
    const { coachId, athleteId } = req.params;

    const coach = await Coach.findById(coachId);
    if (!coach) {
      return res.status(404).json({
        success: false,
        message: 'Coach not found'
      });
    }

    // Check authorization: requesting user must be the coach (or admin)
    const isOwnerCoach = req.user && req.user._id.equals(coach.userId);
    const isAdmin = req.user && req.user.role === 'admin';

    if (!isOwnerCoach && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized. You are not the assigned coach for this portal.'
      });
    }

    // Check if athlete is in coach's assigned list
    const isAssigned = coach.assignedAthletes.some((id) => id.toString() === athleteId.toString());

    if (!isAssigned) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access. This athlete has not granted access to their biomechanical records.'
      });
    }

    const assessments = await Assessment.find({ athleteId }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: assessments.length,
      data: assessments
    });
  } catch (error) {
    console.error('[Get Coach Athlete Assessments Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error retrieving athlete assessments'
    });
  }
};

/**
 * @desc    Get the logged-in coach's own profile
 * @route   GET /api/coaches/me
 * @access  Private (Coach)
 */
exports.getCoachMe = async (req, res) => {
  try {
    const coach = await Coach.findOne({ userId: req.user._id });
    if (!coach) {
      return res.status(404).json({ success: false, message: 'No coach profile linked to this account' });
    }
    return res.status(200).json({ success: true, data: coach });
  } catch (error) {
    console.error('[Get Coach Me Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Server error retrieving coach profile' });
  }
};

/**
 * Helper: resolve the Coach document owned by the requesting user (coaches & admins only)
 */
const resolveCoach = async (req) => {
  if (req.user.role === 'admin') {
    return await Coach.findById(req.query.coachId || req.params.coachId).catch(() => null);
  }
  return await Coach.findOne({ userId: req.user._id });
};

/**
 * @desc    Coach dashboard overview: athlete count, assessment totals, alert feed
 * @route   GET /api/coaches/me/dashboard
 * @access  Private (Coach)
 */
exports.getCoachDashboard = async (req, res) => {
  try {
    const coach = await resolveCoach(req);
    if (!coach) {
      return res.status(404).json({ success: false, message: 'No coach profile linked to this account' });
    }

    const athleteIds = coach.assignedAthletes;
    const athletes = await User.find({ _id: { $in: athleteIds } }).select(
      'name primarySport avatar tier overallPerformanceScore currentInjuryRiskLevel currentInjuryRiskPercentage totalAssessmentsCount lastAssessmentDate'
    );

    const assessments = await Assessment.find({ athleteId: { $in: athleteIds } })
      .sort({ createdAt: -1 })
      .limit(500);

    const completed = assessments.filter((a) => a.status === 'completed');
    const avgScore = completed.length
      ? Number((completed.reduce((s, a) => s + (a.overallScore || 0), 0) / completed.length).toFixed(1))
      : null;

    const highRisk = athletes.filter((a) => a.currentInjuryRiskLevel === 'High');
    const moderateRisk = athletes.filter((a) => a.currentInjuryRiskLevel === 'Moderate');

    const alerts = [];
    highRisk.forEach((a) =>
      alerts.push({
        type: 'injury_high',
        severity: 'high',
        athleteId: a._id,
        athleteName: a.name,
        message: `${a.name}: High injury risk (${a.currentInjuryRiskPercentage ?? '--'}%)`
      })
    );
    moderateRisk.forEach((a) =>
      alerts.push({
        type: 'injury_moderate',
        severity: 'medium',
        athleteId: a._id,
        athleteName: a.name,
        message: `${a.name}: Moderate injury risk (${a.currentInjuryRiskPercentage ?? '--'}%)`
      })
    );
    assessments
      .filter((a) => a.status === 'failed')
      .slice(0, 5)
      .forEach((a) =>
        alerts.push({
          type: 'assessment_failed',
          severity: 'medium',
          athleteId: a.athleteId,
          message: `Assessment ${a.assessmentCode} failed${a.errorDetails?.message ? `: ${a.errorDetails.message}` : ''}`
        })
      );

    return res.status(200).json({
      success: true,
      data: {
        coach,
        stats: {
          athletes: athletes.length,
          assessments: assessments.length,
          completedAssessments: completed.length,
          avgScore,
          highRiskAthletes: highRisk.length
        },
        topPerformers: [...athletes]
          .sort((a, b) => (b.overallPerformanceScore || 0) - (a.overallPerformanceScore || 0))
          .slice(0, 5),
        alerts: alerts.slice(0, 20)
      }
    });
  } catch (error) {
    console.error('[Coach Dashboard Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Server error building coach dashboard' });
  }
};

/**
 * @desc    List the coach's assigned athletes with performance summaries
 * @route   GET /api/coaches/me/athletes
 * @access  Private (Coach)
 */
exports.getMyAthletes = async (req, res) => {
  try {
    const coach = await resolveCoach(req);
    if (!coach) {
      return res.status(404).json({ success: false, message: 'No coach profile linked to this account' });
    }

    const athleteIds = coach.assignedAthletes;
    const athletes = await User.find({ _id: { $in: athleteIds } }).select('-password');

    const latestByAthlete = await Assessment.find({ athleteId: { $in: athleteIds }, status: 'completed' })
      .sort({ createdAt: -1 });

    const latestMap = new Map();
    const countMap = new Map();
    latestByAthlete.forEach((a) => {
      const key = a.athleteId.toString();
      if (!latestMap.has(key)) latestMap.set(key, a);
      countMap.set(key, (countMap.get(key) || 0) + 1);
    });

    const data = athletes.map((a) => {
      const key = a._id.toString();
      const latest = latestMap.get(key);
      return {
        _id: a._id,
        name: a.name,
        avatar: a.avatar,
        age: a.age,
        gender: a.gender,
        primarySport: a.primarySport,
        tier: a.tier,
        overallPerformanceScore: a.overallPerformanceScore,
        currentInjuryRiskLevel: a.currentInjuryRiskLevel,
        currentInjuryRiskPercentage: a.currentInjuryRiskPercentage,
        totalAssessmentsCount: countMap.get(key) || 0,
        lastAssessmentDate: latest?.createdAt || a.lastAssessmentDate,
        latestAssessment: latest
          ? {
              _id: latest._id,
              assessmentCode: latest.assessmentCode,
              overallScore: latest.overallScore,
              testType: latest.testType,
              status: latest.status,
              createdAt: latest.createdAt
            }
          : null
      };
    });

    return res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('[Get My Athletes Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Server error retrieving athletes' });
  }
};

/**
 * @desc    Full performance overview for one assigned athlete
 * @route   GET /api/coaches/me/athletes/:athleteId/overview
 * @access  Private (Assigned Coach or Admin)
 */
exports.getCoachAthleteOverview = async (req, res) => {
  try {
    const coach = await resolveCoach(req);
    if (!coach) {
      return res.status(404).json({ success: false, message: 'No coach profile linked to this account' });
    }

    const { athleteId } = req.params;
    const denied = assertAssignedAthlete(coach, athleteId, req.user.role === 'admin');
    if (denied) {
      return res.status(denied.status).json({ success: false, message: denied.message });
    }

    const athlete = await User.findById(athleteId).select('-password');
    if (!athlete) {
      return res.status(404).json({ success: false, message: 'Athlete not found' });
    }

    const allAssessments = await Assessment.find({ athleteId }).sort({ createdAt: -1 });
    const completedList = allAssessments.filter((a) => a.status === 'completed' && typeof a.overallScore === 'number');
    const latestCompleted = completedList[0] || null;

    let peakScore = null;
    let latestScore = null;
    let scoreDifferential = null;
    if (completedList.length > 0) {
      peakScore = Math.max(...completedList.map((a) => a.overallScore));
      latestScore = completedList[0].overallScore;
      if (completedList.length >= 2) {
        scoreDifferential = Number((latestScore - completedList[1].overallScore).toFixed(1));
      }
    }

    const chronologicalTrend = [...completedList].reverse().map((a) => ({
      assessmentCode: a.assessmentCode,
      date: a.createdAt.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase(),
      fullDate: a.createdAt.toISOString(),
      score: a.overallScore,
      speed: a.speed || null,
      power: a.power || null,
      testType: a.testType,
      isPeak: a.overallScore === peakScore
    }));

    return res.status(200).json({
      success: true,
      data: {
        athlete,
        latestAssessment: latestCompleted,
        summary: {
          totalAssessments: allAssessments.length,
          completedAssessments: completedList.length,
          peakScore,
          latestScore,
          scoreDifferential,
          injuryRiskLevel: athlete.currentInjuryRiskLevel,
          injuryRiskPercentage: athlete.currentInjuryRiskPercentage
        },
        trend: chronologicalTrend,
        history: allAssessments.map((a) => ({
          _id: a._id,
          assessmentCode: a.assessmentCode,
          sport: a.sport,
          testType: a.testType,
          status: a.status,
          overallScore: a.overallScore ?? null,
          speed: a.speed ?? null,
          power: a.power ?? null,
          injuryRiskLevel: a.injuryRiskClassification?.riskStatus ?? null,
          createdAt: a.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('[Coach Athlete Overview Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Server error retrieving athlete overview' });
  }
};

/**
 * Shared authorization: validate athleteId format and assignment for the resolved coach.
 * Returns { status, message } when access must be denied; null when allowed.
 * Coach identity always comes from authentication (JWT), never from client input.
 */
const assertAssignedAthlete = (coach, athleteId) => {
  if (!athleteId || !mongoose.Types.ObjectId.isValid(athleteId)) {
    return { status: 400, message: 'Invalid athlete ID' };
  }
  if (!coach) {
    return { status: 404, message: 'No coach profile linked to this account' };
  }
  const isAssigned = coach.assignedAthletes.some((id) => id.toString() === athleteId.toString());
  const isAdmin = arguments[2] === true;
  if (!isAssigned && !isAdmin) {
    return { status: 403, message: 'Access denied. This athlete has not authorized you as their coach.' };
  }
  return null;
};

const resolveCoachForRequest = async (req) => {
  return await resolveCoach(req);
};

/**
 * @desc    Get ONE accessible athlete's basic profile
 * @route   GET /api/coaches/me/athletes/:athleteId
 * @access  Private (Assigned Coach or Admin)
 */
exports.getMyAthlete = async (req, res) => {
  try {
    const coach = await resolveCoach(req);
    if (!coach) {
      return res.status(404).json({ success: false, message: 'No coach profile linked to this account' });
    }
    const denied = assertAssignedAthlete(coach, req.params.athleteId, req.user.role === 'admin');
    if (denied) {
      return res.status(denied.status).json({ success: false, message: denied.message });
    }
    const athlete = await User.findById(req.params.athleteId).select('-password');
    if (!athlete) {
      return res.status(404).json({ success: false, message: 'Athlete not found' });
    }
    return res.status(200).json({
      success: true,
      data: {
        _id: athlete._id,
        name: athlete.name,
        avatar: athlete.avatar,
        age: athlete.age,
        gender: athlete.gender,
        email: athlete.email || null,
        phone: athlete.phone,
        primarySport: athlete.primarySport,
        preferredSports: athlete.preferredSports,
        tier: athlete.tier,
        affiliation: athlete.affiliation,
        division: athlete.division,
        regionalRank: athlete.regionalRank,
        overallPerformanceScore: athlete.overallPerformanceScore,
        currentInjuryRiskLevel: athlete.currentInjuryRiskLevel,
        currentInjuryRiskPercentage: athlete.currentInjuryRiskPercentage,
        totalAssessmentsCount: athlete.totalAssessmentsCount,
        lastAssessmentDate: athlete.lastAssessmentDate,
        createdAt: athlete.createdAt
      }
    });
  } catch (error) {
    console.error('[Get My Athlete Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Server error retrieving athlete' });
  }
};

/**
 * @desc    Get an accessible athlete's assessments (identity-based route)
 * @route   GET /api/coaches/me/athletes/:athleteId/assessments
 * @access  Private (Assigned Coach or Admin)
 */
exports.getMyAthleteAssessments = async (req, res) => {
  try {
    const coach = await resolveCoach(req);
    if (!coach) {
      return res.status(404).json({ success: false, message: 'No coach profile linked to this account' });
    }
    const denied = assertAssignedAthlete(coach, req.params.athleteId, req.user.role === 'admin');
    if (denied) {
      return res.status(denied.status).json({ success: false, message: denied.message });
    }
    const assessments = await Assessment.find({ athleteId: req.params.athleteId }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: assessments.length, data: assessments });
  } catch (error) {
    console.error('[Get My Athlete Assessments Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Server error retrieving athlete assessments' });
  }
};

/**
 * @desc    Get an accessible athlete's progress (reuses the athlete-side computation & cache)
 * @route   GET /api/coaches/me/athletes/:athleteId/progress
 * @access  Private (Assigned Coach or Admin)
 */
exports.getMyAthleteProgress = async (req, res) => {
  try {
    const coach = await resolveCoach(req);
    if (!coach) {
      return res.status(404).json({ success: false, message: 'No coach profile linked to this account' });
    }
    const denied = assertAssignedAthlete(coach, req.params.athleteId, req.user.role === 'admin');
    if (denied) {
      return res.status(denied.status).json({ success: false, message: denied.message });
    }
    const { cached, data } = await require('./athleteController').computeProgressData(req.params.athleteId);
    return res.status(200).json({ success: true, cached, data });
  } catch (error) {
    console.error('[Get My Athlete Progress Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Server error retrieving athlete progress' });
  }
};

/**
 * @desc    Get an accessible athlete's latest injury-risk information
 * @route   GET /api/coaches/me/athletes/:athleteId/injury-risk
 * @access  Private (Assigned Coach or Admin)
 */
exports.getMyAthleteInjuryRisk = async (req, res) => {
  try {
    const coach = await resolveCoach(req);
    if (!coach) {
      return res.status(404).json({ success: false, message: 'No coach profile linked to this account' });
    }
    const denied = assertAssignedAthlete(coach, req.params.athleteId, req.user.role === 'admin');
    if (denied) {
      return res.status(denied.status).json({ success: false, message: denied.message });
    }

    const latestCompleted = await Assessment.findOne({
      athleteId: req.params.athleteId,
      status: 'completed'
    }).sort({ createdAt: -1 });

    const athlete = await User.findById(req.params.athleteId).select(
      'name currentInjuryRiskLevel currentInjuryRiskPercentage'
    );
    if (!athlete) {
      return res.status(404).json({ success: false, message: 'Athlete not found' });
    }

    const cls = latestCompleted?.injuryRiskClassification;
    return res.status(200).json({
      success: true,
      data: {
        athleteId: athlete._id,
        athleteName: athlete.name,
        source: latestCompleted ? 'assessment' : athlete.currentInjuryRiskPercentage != null ? 'profile' : 'none',
        lastAssessmentCode: latestCompleted?.assessmentCode || null,
        testType: latestCompleted?.testType || null,
        sport: latestCompleted?.sport || null,
        evaluatedAt: latestCompleted?.completedAt || null,
        risk: latestCompleted
          ? {
              level: cls.riskStatus,
              percentage: cls.riskPercentage,
              asymmetryScore: cls.asymmetryScore,
              fatigueIndex: cls.fatigueIndex,
              jointStress: cls.jointStress,
              movementDeficiency: cls.movementDeficiency
            }
          : {
              level: athlete.currentInjuryRiskLevel ?? null,
              percentage: athlete.currentInjuryRiskPercentage ?? null
            },
        criticalWarnings: latestCompleted?.criticalWarnings || [],
        // Joint-level strain data — passthrough of stored fields (no AI work
        // here): consumed by the finalized risk-visualization contract.
        heatmapSpots: latestCompleted?.heatmapSpots || [],
        jointKinematics: latestCompleted?.jointKinematics || null,
        aiMetadata: latestCompleted?.aiMetadata || null,
        aiInsights: latestCompleted?.aiInsights || []
      }
    });
  } catch (error) {
    console.error('[Get My Athlete Injury Risk Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Server error retrieving injury-risk data' });
  }
};
