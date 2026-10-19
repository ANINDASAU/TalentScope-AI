const mongoose = require('mongoose');

const CoachSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    name: {
      type: String,
      required: [true, 'Please provide the coach name'],
      trim: true
    },
    title: {
      type: String,
      required: [true, 'Please provide the coach title / specialty header'],
      default: 'Olympic Biomechanics Specialist'
    },
    rating: {
      type: Number,
      min: 1.0,
      max: 5.0,
      default: 5.0
    },
    reviewsCount: {
      type: Number,
      default: 0
    },
    hourlyRate: {
      type: String,
      default: '$100/hr'
    },
    verified: {
      type: Boolean,
      default: true
    },
    specialties: {
      type: [String],
      default: ['Sprint Mechanics', 'Force Plate Analysis', 'ACL Rehab']
    },
    bio: {
      type: String,
      default: 'Specializing in high-speed kinematic video analysis and explosive force production.'
    },
    credentials: {
      type: [String],
      default: [
        'Ph.D. in Kinesiology & Biomechanics',
        'CSCS (Certified Strength & Conditioning Specialist)',
        'EXOS Performance Specialist'
      ]
    },
    affiliation: {
      type: String,
      default: 'Olympic Training Center'
    },
    availableForConsultation: {
      type: Boolean,
      default: true
    },
    // Authorized Coach-Athlete Access Relationships
    assignedAthletes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ]
  },
  {
    timestamps: true
  }
);

// Optimized Indexes for marketplace search, ratings, and authorized athlete access
CoachSchema.index({ verified: 1, rating: -1 });
CoachSchema.index({ specialties: 1 });
CoachSchema.index({ assignedAthletes: 1 });

module.exports = mongoose.model('Coach', CoachSchema);
