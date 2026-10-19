const express = require('express');
const router = express.Router();
const {
  getCoaches,
  getCoachById,
  authorizeAthlete,
  getCoachAthleteAssessments,
  getCoachMe,
  getCoachDashboard,
  getMyAthletes,
  getCoachAthleteOverview,
  getMyAthlete,
  getMyAthleteAssessments,
  getMyAthleteProgress,
  getMyAthleteInjuryRisk
} = require('../controllers/coachController');
const { getCoachConsultations } = require('../controllers/consultationController');
const { protect } = require('../middlewares/authMiddleware');

router.get('/', getCoaches);

// Coach-self routes (identity always derived from JWT; must be registered before /:id)
router.get('/me/dashboard', protect, getCoachDashboard);
router.get('/me/consultations', protect, getCoachConsultations);
router.get('/me/athletes/:athleteId/overview', protect, getCoachAthleteOverview);
router.get('/me/athletes/:athleteId/progress', protect, getMyAthleteProgress);
router.get('/me/athletes/:athleteId/injury-risk', protect, getMyAthleteInjuryRisk);
router.get('/me/athletes/:athleteId/assessments', protect, getMyAthleteAssessments);
router.get('/me/athletes/:athleteId', protect, getMyAthlete);
router.get('/me/athletes', protect, getMyAthletes);
router.get('/me', protect, getCoachMe);

router.get('/:id', getCoachById);
router.post('/:coachId/authorize-athlete', protect, authorizeAthlete);
router.get('/:coachId/athletes/:athleteId/assessments', protect, getCoachAthleteAssessments);

module.exports = router;
