const express = require('express');
const router = express.Router();
const {
  getAthleteDashboard,
  getAthleteProgress,
  getAthleteStats,
  updateAthleteProfile,
  getAthleteById
} = require('../controllers/athleteController');
const { protect } = require('../middlewares/authMiddleware');

router.get('/dashboard', protect, getAthleteDashboard);
router.get('/progress', protect, getAthleteProgress);
router.get('/stats', protect, getAthleteStats);
router.put('/profile', protect, updateAthleteProfile);
router.get('/:id', protect, getAthleteById);

module.exports = router;
