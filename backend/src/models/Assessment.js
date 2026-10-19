const mongoose = require('mongoose');

const CriticalWarningSchema = new mongoose.Schema(
  {
    warningType: { type: String, required: true }, // e.g. 'Right Knee Valgus', 'Lumbar Shear'
    severity: { type: String, enum: ['Low', 'Moderate', 'Critical'], default: 'Moderate' },
    angleDeviationDeg: { type: Number, default: 0 },
    phase: { type: String, default: 'landing phase' },
    detail: { type: String, required: true }
  },
  { _id: false }
);

const HeatmapSpotSchema = new mongoose.Schema(
  {
    joint: { type: String, required: true }, // e.g. 'Right Knee', 'Lumbar'
    strainScore: { type: Number, min: 0, max: 100, default: 50 },
    riskColor: { type: String, default: '#ff4d4f' }
  },
  { _id: false }
);

const RecommendationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true }, // e.g. 'Banded Glute Clamshells'
    desc: { type: String, required: true },
    sets: { type: String, default: '3 Sets' },
    reps: { type: String, default: '15 Reps' },
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'High' }
  },
  { _id: false }
);

const VideoMetadataSchema = new mongoose.Schema(
  {
    durationSeconds: { type: Number, default: null },
    resolution: { type: String, default: '1080x1920' },
    fps: { type: Number, default: 60 },
    fileSizeBytes: { type: Number, default: null },
    format: { type: String, default: 'mp4' }
  },
  { _id: false }
);

const AiMetadataSchema = new mongoose.Schema(
  {
    confidenceScore: { type: Number, min: 0, max: 100, default: 98.4 },
    modelVersion: { type: String, default: 'v2.4-fastapi-mediapipe' },
    analysisTimestamp: { type: Date, default: Date.now }
  },
  { _id: false }
);

const ProcessingErrorSchema = new mongoose.Schema(
  {
    code: { type: String, default: null },
    message: { type: String, default: null },
    failedStep: { type: String, default: null },
    occurredAt: { type: Date, default: null }
  },
  { _id: false }
);

const AssessmentSchema = new mongoose.Schema(
  {
    // IDENTIFICATION
    assessmentCode: {
      type: String,
      required: [true, 'Assessment code is required'],
      unique: true,
      uppercase: true,
      trim: true
    },
    athleteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Assessment must belong to a valid athlete']
    },
    sport: {
      type: String,
      default: 'Athletics'
    },
    testType: {
      type: String,
      enum: [
        'unilateral_squat',
        'sprint_acceleration',
        'countermovement_jump',
        'agility_t_drill',
        'landing_mechanics',
        'posture_alignment'
      ],
      default: 'unilateral_squat'
    },
    category: {
      type: String,
      default: 'Athletics'
    },
    /**
     * Idempotency key supplied by offline clients (client-generated stable
     * identifier for ONE logical assessment). Uniquely enforced (sparse: older
     * records without a key are unaffected). Retrying a create with the same
     * key returns the EXISTING record instead of creating a duplicate.
     * The compound index is declared at the schema level below (see
     * ASSESSMENT_IDEMPOTENCY_INDEX) and ensured at server startup, so it is
     * created even for pre-existing collections.
     */
    idempotencyKey: {
      type: String,
      trim: true,
      default: null
    },

    // STATUS
    status: {
      type: String,
      enum: ['created', 'pending', 'uploading', 'processing', 'completed', 'failed'],
      default: 'completed'
    },

    // VIDEO & MEDIA REFERENCES (References / URLs only - binary NOT stored in Mongo)
    videoUrl: {
      type: String,
      default: null
    },
    keyframeSnapshotUrl: {
      type: String,
      default: null
    },
    videoMetadata: {
      type: VideoMetadataSchema,
      default: () => ({})
    },

    // PERFORMANCE SCORES
    overallScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null
    },
    speed: {
      type: Number, // in m/s (e.g. 10.2)
      default: null
    },
    power: {
      type: Number, // in kW/kg (e.g. 1.4)
      default: null
    },
    endurance: {
      type: Number, // 0-100 (e.g. 82)
      default: null
    },
    previousScoreComparison: {
      type: Number,
      default: 0.0 // e.g. +4.2%
    },
    percentileRank: {
      type: String,
      default: 'Top 5%'
    },

    // BIOMECHANICS & KINEMATICS
    biometricsBreakdown: {
      movementQuality: { type: Number, min: 0, max: 100, default: 90 },
      jointAlignment: { type: Number, min: 0, max: 100, default: 85 },
      landingMechanics: { type: Number, min: 0, max: 100, default: 78 },
      balanceStability: { type: Number, min: 0, max: 100, default: 92 },
      sprintSpeed: { type: Number, default: 9.8 },
      powerOutput: { type: Number, default: 1.4 },
      enduranceIndex: { type: Number, min: 0, max: 100, default: 80 },
      coreTension: { type: Number, min: 0, max: 100, default: 88 }
    },
    jointKinematics: {
      kneeFlexionAngle: { type: Number, default: 118 },
      kneeFlexionStatus: { type: String, enum: ['Optimal', 'Hyperextended', 'Insufficient Depth'], default: 'Optimal' },
      spineAngle: { type: Number, default: 4.2 },
      spineAlignmentStatus: { type: String, enum: ['Neutral', 'Excessive Forward Lean', 'Lateral Shift'], default: 'Neutral' },
      hipAsymmetryPercentage: { type: Number, default: 1.8 },
      ankleDorsiflexionAngle: { type: Number, default: 35 },
      jointAnglesRaw: { type: Map, of: Number, default: {} }
    },
    hasPostureWarning: {
      type: Boolean,
      default: false
    },
    criticalWarnings: {
      type: [CriticalWarningSchema],
      default: []
    },
    heatmapSpots: {
      type: [HeatmapSpotSchema],
      default: []
    },

    // INJURY RISK CLASSIFICATION
    injuryRiskClassification: {
      riskStatus: { type: String, enum: ['Low', 'Moderate', 'High'], default: 'Low' },
      riskPercentage: { type: Number, min: 0, max: 100, default: 12 },
      asymmetryScore: { type: Number, min: 0, max: 100, default: 8 },
      fatigueIndex: { type: Number, min: 0, max: 100, default: 15 },
      jointStress: { type: Number, min: 0, max: 100, default: 10 },
      movementDeficiency: { type: Number, min: 0, max: 100, default: 5 }
    },
    recommendations: {
      type: [RecommendationSchema],
      default: []
    },

    // AI METADATA & EXPLAINABILITY
    aiMetadata: {
      type: AiMetadataSchema,
      default: () => ({})
    },
    aiInsights: {
      type: [String],
      default: [
        'Optimal pelvic alignment maintained throughout concentric drive.',
        'Slight valgus deviation detected during rapid ground impact.'
      ]
    },
    environmentValidation: {
      lightingLx: { type: Number, default: 840 },
      distanceMeters: { type: Number, default: 3.2 },
      fps: { type: Number, default: 60 },
      confidenceScore: { type: Number, min: 0, max: 100, default: 98.4 },
      isCheatDetected: { type: Boolean, default: false }
    },

    // SAFE PROCESSING ERROR DETAILS (for failed analysis)
    errorDetails: {
      type: ProcessingErrorSchema,
      default: null
    },

    // TIMESTAMPS
    completedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Pre-save hook: Verify that athleteId refers to an existing User
AssessmentSchema.pre('save', async function (next) {
  if (this.isModified('athleteId')) {
    const User = mongoose.model('User');
    const athleteExists = await User.findById(this.athleteId);
    if (!athleteExists) {
      return next(new Error(`Cannot create assessment: Athlete with ID '${this.athleteId}' does not exist.`));
    }
  }

  // Set completedAt when status is completed
  if (this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }

  next();
});

// Pre-findOneAndUpdate hook: Ensure completedAt is populated on update to completed
AssessmentSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (update) {
    const isCompleted =
      update.status === 'completed' || (update.$set && update.$set.status === 'completed');
    if (isCompleted) {
      if (update.$set) {
        if (!update.$set.completedAt) update.$set.completedAt = new Date();
      } else {
        if (!update.completedAt) update.completedAt = new Date();
      }
    }
  }
  next();
});

// Optimized Compound Indexes (Carefully designed for ESR without write penalty)
AssessmentSchema.index({ athleteId: 1, createdAt: -1 });
AssessmentSchema.index({ athleteId: 1, status: 1, createdAt: -1 });
AssessmentSchema.index({ athleteId: 1, testType: 1, createdAt: -1 });
AssessmentSchema.index({ athleteId: 1, sport: 1, createdAt: -1 });
AssessmentSchema.index({ sport: 1, overallScore: -1 });
AssessmentSchema.index({ status: 1, createdAt: 1 });

/**
 * Duplicate-prevention index: one server assessment per (athlete, client
 * idempotency key). Partial (only documents WITH a key are indexed) so all
 * legacy records and no-key creates are unaffected.
 * Declared here AND ensured at server startup (models are compiled before
 * the connection's autoIndex may run on pre-existing collections).
 */
AssessmentSchema.index(
  { athleteId: 1, idempotencyKey: 1 },
  {
    unique: true,
    name: 'athleteId_1_idempotencyKey_1_unique',
    partialFilterExpression: { idempotencyKey: { $type: 'string' } }
  }
);

module.exports = mongoose.model('Assessment', AssessmentSchema);
