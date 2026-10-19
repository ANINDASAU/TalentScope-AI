const express = require('express');
const router = express.Router();
const {
  createAssessment,
  getAssessmentById,
  updateAssessmentStatus,
  saveAnalysisResult,
  markCompleted,
  markFailed,
  getAthleteAssessmentHistory,
  getAthleteLatestAssessment
} = require('../controllers/assessmentController');
const { protect } = require('../middlewares/authMiddleware');

// Athlete Specific History & Latest (Placed before :id parameterized route)
router.get('/history', protect, getAthleteAssessmentHistory);
router.get('/latest', protect, getAthleteLatestAssessment);

// Assessment Lifecycle CRUD
router.post('/', protect, createAssessment);
router.get('/:id', protect, getAssessmentById);
router.patch('/:id/status', protect, updateAssessmentStatus);
router.put('/:id/results', protect, saveAnalysisResult);
router.patch('/:id/complete', protect, markCompleted);
router.patch('/:id/fail', protect, markFailed);

module.exports = router;
