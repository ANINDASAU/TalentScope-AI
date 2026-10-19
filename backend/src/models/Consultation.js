const mongoose = require('mongoose');

const ConsultationSchema = new mongoose.Schema(
  {
    athleteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    coachId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coach',
      required: true
    },
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
      default: null
    },
    status: {
      type: String,
      enum: ['requested', 'confirmed', 'in_progress', 'completed', 'cancelled'],
      default: 'requested'
    },
    athleteNotes: {
      type: String,
      default: 'Biomechanical review requested for knee alignment and acceleration angles.'
    },
    coachFeedbackReport: {
      type: String,
      default: null
    },
    scheduledDate: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

ConsultationSchema.index({ athleteId: 1, createdAt: -1 });
ConsultationSchema.index({ coachId: 1, status: 1 });

module.exports = mongoose.model('Consultation', ConsultationSchema);
