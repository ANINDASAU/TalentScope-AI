const mongoose = require('mongoose');
const Consultation = require('../models/Consultation');
const Coach = require('../models/Coach');

/**
 * @desc    Athlete books a consultation with a coach
 * @route   POST /api/consultations
 * @access  Private (Athlete)
 */
exports.createBooking = async (req, res) => {
  try {
    const athleteId = req.user._id;
    const { coachId, assessmentId, athleteNotes, scheduledDate } = req.body;

    if (!coachId || !mongoose.Types.ObjectId.isValid(coachId)) {
      return res.status(400).json({ success: false, message: 'A valid coachId is required' });
    }

    const coach = await Coach.findById(coachId);
    if (!coach) {
      return res.status(404).json({ success: false, message: 'Coach not found' });
    }

    const booking = await Consultation.create({
      athleteId,
      coachId,
      assessmentId: assessmentId || null,
      athleteNotes: athleteNotes || undefined,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
      status: 'requested'
    });

    return res.status(201).json({
      success: true,
      message: `Consultation requested with ${coach.name}`,
      data: booking
    });
  } catch (error) {
    console.error('[Create Booking Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Server error creating booking' });
  }
};

/**
 * @desc    Get the signed-in athlete's bookings (populated with coach info)
 * @route   GET /api/consultations/mine
 * @access  Private (Athlete)
 */
exports.getMyBookings = async (req, res) => {
  try {
    const bookings = await Consultation.find({ athleteId: req.user._id })
      .populate('coachId', 'name specialization hourlyRate avatar')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings
    });
  } catch (error) {
    console.error('[Get Bookings Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Server error fetching bookings' });
  }
};

/**
 * @desc    List consultations belonging to the logged-in coach
 * @route   GET /api/coaches/me/consultations
 * @access  Private (Coach)
 */
exports.getCoachConsultations = async (req, res) => {
  try {
    const Coach = require('../models/Coach');
    const coach = await Coach.findOne({ userId: req.user._id });
    if (!coach) {
      return res.status(404).json({ success: false, message: 'No coach profile linked to this account' });
    }

    const bookings = await Consultation.find({ coachId: coach._id })
      .populate('athleteId', 'name avatar primarySport tier')
      .populate('assessmentId', 'assessmentCode overallScore')
      .sort({ scheduledDate: -1, createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings
    });
  } catch (error) {
    console.error('[Get Coach Consultations Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Server error retrieving consultations' });
  }
};
