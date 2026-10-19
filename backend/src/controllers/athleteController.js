const User = require('../models/User');
const Assessment = require('../models/Assessment');
const RedisService = require('../services/redisService');

/**
 * @desc    Get complete Athlete Dashboard data derived from real MongoDB records (with Redis Cache-Aside)
 * @route   GET /api/athletes/dashboard
 * @access  Private (Athlete)
 */
exports.getAthleteDashboard = async (req, res) => {
  try {
    const athleteId = req.user._id;
    const cacheKey = RedisService.getDashboardKey(athleteId);

    // 1. Check Redis Cache
    const cachedDashboard = await RedisService.get(cacheKey);
    if (cachedDashboard) {
      return res.status(200).json({
        success: true,
        cached: true,
        data: cachedDashboard
      });
    }

    // 2. Cache Miss -> Query MongoDB Primary Source of Truth
    // Fetch latest completed assessment
    const latestCompleted = await Assessment.findOne({
      athleteId,
      status: 'completed'
    }).sort({ createdAt: -1 });

    // Count total & completed assessments
    const totalAssessments = await Assessment.countDocuments({ athleteId });
    const completedCount = await Assessment.countDocuments({ athleteId, status: 'completed' });

    // Fetch completed assessments in chronological order for metric trajectory
    const recentCompleted = await Assessment.find({
      athleteId,
      status: 'completed',
      overallScore: { $ne: null }
    })
      .sort({ createdAt: 1 })
      .limit(8)
      .select('assessmentCode overallScore testType createdAt biometricsBreakdown injuryRiskClassification');

    const metricVelocity = recentCompleted.map((a) => ({
      assessmentCode: a.assessmentCode,
      date: a.createdAt.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase(),
      value: a.overallScore,
      testType: a.testType
    }));

    // Build payload derived strictly from stored data
    const dashboardData = {
      athlete: {
        id: req.user._id,
        name: req.user.name,
        rank: req.user.regionalRank ? `#${req.user.regionalRank}` : null,
        tier: req.user.tier || 'Elite Pro',
        primarySport: req.user.primarySport || 'Athletics',
        specialization: req.user.specialization || 'Sprinting & Biometrics',
        affiliation: req.user.affiliation || null,
        avatar: req.user.avatar || null
      },
      counts: {
        totalAssessments,
        totalCompletedAssessments: completedCount,
        hasAssessments: totalAssessments > 0
      },
      latestAssessment: latestCompleted
        ? {
            id: latestCompleted._id,
            assessmentCode: latestCompleted.assessmentCode,
            testType: latestCompleted.testType,
            overallScore: latestCompleted.overallScore,
            speed: latestCompleted.speed,
            power: latestCompleted.power,
            endurance: latestCompleted.endurance,
            percentileRank: latestCompleted.percentileRank || null,
            previousScoreComparison: latestCompleted.previousScoreComparison || null,
            injuryRisk: latestCompleted.injuryRiskClassification
              ? {
                  level: latestCompleted.injuryRiskClassification.riskStatus,
                  percentage: latestCompleted.injuryRiskClassification.riskPercentage,
                  asymmetry: latestCompleted.injuryRiskClassification.asymmetryScore,
                  fatigue: latestCompleted.injuryRiskClassification.fatigueIndex,
                  jointStress: latestCompleted.injuryRiskClassification.jointStress,
                  movementDeficiency: latestCompleted.injuryRiskClassification.movementDeficiency
                }
              : null,
            biometrics: latestCompleted.biometricsBreakdown || null,
            jointKinematics: latestCompleted.jointKinematics || null,
            criticalWarnings: latestCompleted.criticalWarnings || [],
            recommendations: latestCompleted.recommendations || [],
            completedAt: latestCompleted.completedAt || latestCompleted.createdAt
          }
        : null,
      metricVelocity
    };

    // 3. Store result in Redis with 5 minute TTL (300 seconds)
    await RedisService.set(cacheKey, dashboardData, 300);

    return res.status(200).json({
      success: true,
      cached: false,
      data: dashboardData
    });
  } catch (error) {
    console.error('[Athlete Dashboard Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error retrieving athlete dashboard'
    });
  }
};

/**
 * @desc    Get athlete progress trajectory, longitudinal metrics, peak score & history (with Redis Cache-Aside)
 * @route   GET /api/athletes/progress
 * @access  Private (Athlete)
 */
exports.computeProgressData = async (athleteId) => {
  const cacheKey = RedisService.getProgressKey(athleteId);

  // 1. Check Redis Cache
  const cachedProgress = await RedisService.get(cacheKey);
  if (cachedProgress) {
    return {
      cached: true,
      data: cachedProgress
    };
  }

    // 2. Cache Miss -> Query MongoDB
    const allAssessments = await Assessment.find({ athleteId }).sort({ createdAt: -1 });

    const completedList = allAssessments.filter(
      (a) => a.status === 'completed' && typeof a.overallScore === 'number'
    );

    const completedCount = completedList.length;

    let peakScore = null;
    let latestScore = null;
    let previousScore = null;
    let scoreDifferential = null;

    if (completedCount > 0) {
      const scores = completedList.map((a) => a.overallScore);
      peakScore = Math.max(...scores);
      latestScore = completedList[0].overallScore;

      if (completedCount >= 2) {
        previousScore = completedList[1].overallScore;
        scoreDifferential = Number((latestScore - previousScore).toFixed(1));
      }
    }

    const chronologicalTrend = [...completedList].reverse().map((a) => ({
      assessmentCode: a.assessmentCode,
      date: a.createdAt.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase(),
      fullDate: a.createdAt.toISOString(),
      score: a.overallScore,
      speed: a.speed || null,
      power: a.power || null,
      movementQuality: a.biometricsBreakdown?.movementQuality ?? null,
      jointAlignment: a.biometricsBreakdown?.jointAlignment ?? null,
      landingMechanics: a.biometricsBreakdown?.landingMechanics ?? null,
      balanceStability: a.biometricsBreakdown?.balanceStability ?? null,
      testType: a.testType,
      isPeak: a.overallScore === peakScore
    }));

    let historicalAverages = null;
    if (completedCount > 0) {
      let totalQuality = 0;
      let totalAlignment = 0;
      let totalLanding = 0;
      let totalStability = 0;
      let countWithBiometrics = 0;

      completedList.forEach((a) => {
        if (a.biometricsBreakdown) {
          totalQuality += a.biometricsBreakdown.movementQuality || 0;
          totalAlignment += a.biometricsBreakdown.jointAlignment || 0;
          totalLanding += a.biometricsBreakdown.landingMechanics || 0;
          totalStability += a.biometricsBreakdown.balanceStability || 0;
          countWithBiometrics++;
        }
      });

      if (countWithBiometrics > 0) {
        historicalAverages = {
          avgMovementQuality: Math.round(totalQuality / countWithBiometrics),
          avgJointAlignment: Math.round(totalAlignment / countWithBiometrics),
          avgLandingMechanics: Math.round(totalLanding / countWithBiometrics),
          avgBalanceStability: Math.round(totalStability / countWithBiometrics)
        };
      }
    }

    const unlockedBadges = [];
    if (completedList.some((a) => a.testType === 'unilateral_squat' && a.overallScore >= 88)) {
      unlockedBadges.push({
        badgeId: 'squat_master',
        name: 'Squat Master',
        icon: '🏋️',
        desc: 'Achieved 88+ score on Unilateral Squat Depth'
      });
    }
    if (completedList.some((a) => a.testType === 'sprint_acceleration' && a.overallScore >= 90)) {
      unlockedBadges.push({
        badgeId: 'sprint_form',
        name: 'Sprint Form',
        icon: '⚡',
        desc: 'Achieved 90+ score on Sprint Form Velocity'
      });
    }
    if (completedList.length >= 3 && completedList.every((a) => a.injuryRiskClassification?.riskPercentage <= 15)) {
      unlockedBadges.push({
        badgeId: 'injury_proof',
        name: 'Injury Proof',
        icon: '🛡️',
        desc: 'Maintained Low Injury Risk (<15%) across 3+ assessments'
      });
    }
    if (peakScore && peakScore >= 90) {
      unlockedBadges.push({
        badgeId: 'velocity_king',
        name: 'Velocity King',
        icon: '👑',
        desc: 'Surpassed 90+ Aggregate Form Score'
      });
    }

    const assessmentHistory = allAssessments.map((a) => ({
      id: a._id,
      assessmentCode: a.assessmentCode,
      date: a.createdAt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      testType: a.testType,
      score: a.overallScore,
      status: a.status,
      injuryRisk: a.injuryRiskClassification?.riskStatus || null
    }));

    const progressData = {
      totalAssessments: allAssessments.length,
      completedAssessmentsCount: completedCount,
      peakScore,
      latestScore,
      previousScore,
      scoreDifferential,
      chronologicalTrend,
      historicalAverages,
      unlockedBadges,
      assessmentHistory
    };

    // 3. Store result in Redis with 5 minute TTL (300 seconds)
    await RedisService.set(cacheKey, progressData, 300);

    return {
      cached: false,
      data: progressData
    };
};

exports.getAthleteProgress = async (req, res) => {
  try {
    const { cached, data } = await exports.computeProgressData(req.user._id);
    return res.status(200).json({
      success: true,
      cached,
      data
    });
  } catch (error) {
    console.error('[Athlete Progress Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error retrieving athlete progress'
    });
  }
};

/**
 * @desc    Get athlete dashboard summary stats (Backwards-compatibility route)
 * @route   GET /api/athletes/stats
 * @access  Private (Athlete)
 */
exports.getAthleteStats = async (req, res) => {
  try {
    const athleteId = req.user._id;

    const latestCompleted = await Assessment.findOne({
      athleteId,
      status: 'completed'
    }).sort({ createdAt: -1 });

    const totalCount = await Assessment.countDocuments({ athleteId });
    const completedCount = await Assessment.countDocuments({ athleteId, status: 'completed' });

    const recentCompleted = await Assessment.find({ athleteId, status: 'completed' })
      .sort({ createdAt: 1 })
      .limit(6);

    const metricVelocity = recentCompleted.map((a) => ({
      date: a.createdAt.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase(),
      value: a.overallScore,
      testType: a.testType
    }));

    return res.status(200).json({
      success: true,
      data: {
        score: latestCompleted?.overallScore || req.user.overallPerformanceScore || null,
        percentile: latestCompleted?.percentileRank || (req.user.overallPerformanceScore >= 80 ? 'TOP 5%' : null),
        injuryRisk: latestCompleted?.injuryRiskClassification
          ? `${latestCompleted.injuryRiskClassification.riskStatus} (${latestCompleted.injuryRiskClassification.riskPercentage}%)`
          : null,
        rank: req.user.regionalRank ? `#${req.user.regionalRank}` : null,
        tier: req.user.tier || 'Elite Pro',
        totalAssessments: totalCount,
        totalCompletedAssessments: completedCount,
        metricVelocity
      }
    });
  } catch (error) {
    console.error('[Athlete Stats Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error retrieving athlete statistics'
    });
  }
};

/**
 * @desc    Update authenticated athlete profile
 * @route   PUT /api/athletes/profile
 * @access  Private (Athlete)
 */
exports.updateAthleteProfile = async (req, res) => {
  try {
    const allowedFields = [
      'name',
      'age',
      'gender',
      'weight',
      'height',
      'preferredSports',
      'primarySport',
      'specialization',
      'affiliation',
      'avatar',
      'settings'
    ];

    const updates = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    // 1. Update MongoDB first (Source of Truth)
    const updatedUser = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true
    }).select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'Athlete not found'
      });
    }

    // 2. Invalidate relevant Redis cache
    await RedisService.invalidateAthleteCache(req.user._id);

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('[Athlete Update Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error updating athlete profile'
    });
  }
};

/**
 * @desc    Get athlete by ID (e.g. for coaches/scouts)
 * @route   GET /api/athletes/:id
 * @access  Private
 */
exports.getAthleteById = async (req, res) => {
  try {
    const athlete = await User.findById(req.params.id).select('-password');

    if (!athlete) {
      return res.status(404).json({
        success: false,
        message: 'Athlete not found'
      });
    }

    return res.status(200).json({
      success: true,
      athlete
    });
  } catch (error) {
    console.error('[Get Athlete By ID Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error retrieving athlete'
    });
  }
};
