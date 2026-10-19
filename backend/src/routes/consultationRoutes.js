const express = require('express');
const router = express.Router();
const { createBooking, getMyBookings } = require('../controllers/consultationController');
const { protect } = require('../middlewares/authMiddleware');

router.post('/', protect, createBooking);
router.get('/mine', protect, getMyBookings);

module.exports = router;
