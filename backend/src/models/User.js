const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UnlockedBadgeSchema = new mongoose.Schema(
  {
    badgeId: { type: String, required: true },
    name: { type: String, required: true },
    icon: { type: String, default: '🏅' },
    unlockedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const UserSettingsSchema = new mongoose.Schema(
  {
    darkMode: { type: Boolean, default: false },
    compactTelemetryView: { type: Boolean, default: false },
    injuryAlerts: { type: Boolean, default: true },
    sessionReminders: { type: Boolean, default: true }
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters']
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email address'
      ]
    },
    phone: {
      type: String,
      required: [true, 'Please provide a phone number'],
      unique: true,
      trim: true
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false
    },
    role: {
      type: String,
      enum: ['athlete', 'coach', 'admin', 'scout'],
      default: 'athlete'
    },
    avatar: {
      type: String,
      default: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'pending_verification'],
      default: 'active'
    },

    // Athlete Demographics & Physical Attributes
    age: {
      type: Number,
      min: [5, 'Age must be at least 5'],
      max: [100, 'Age cannot exceed 100']
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      default: 'male'
    },
    weight: {
      type: Number, // in kg
      min: [20, 'Weight must be at least 20 kg'],
      max: [300, 'Weight cannot exceed 300 kg']
    },
    height: {
      type: Number, // in cm
      min: [50, 'Height must be at least 50 cm'],
      max: [260, 'Height cannot exceed 260 cm']
    },
    preferredSports: {
      type: [String],
      default: ['Athletics']
    },
    primarySport: {
      type: String,
      default: 'Athletics'
    },
    specialization: {
      type: String,
      default: 'Sprinting & Biometrics'
    },
    affiliation: {
      type: String,
      default: 'Independent Athlete'
    },
    tier: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced', 'Elite Pro'],
      default: 'Elite Pro'
    },
    regionalRank: {
      type: Number,
      default: null
    },
    division: {
      type: String,
      default: 'National Division A'
    },

    // Aggregated Performance & Injury Health
    overallPerformanceScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 85
    },
    currentInjuryRiskLevel: {
      type: String,
      enum: ['Low', 'Moderate', 'High'],
      default: 'Low'
    },
    currentInjuryRiskPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 12
    },
    totalAssessmentsCount: {
      type: Number,
      default: 0
    },
    lastAssessmentDate: {
      type: Date,
      default: null
    },
    unlockedBadges: {
      type: [UnlockedBadgeSchema],
      default: []
    },

    // User Preferences
    settings: {
      type: UserSettingsSchema,
      default: () => ({})
    }
  },
  {
    timestamps: true
  }
);

// Indexes
UserSchema.index({ role: 1, overallPerformanceScore: -1 });
UserSchema.index({ regionalRank: 1 });

// Hash password prior to saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare candidate password with stored hash
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
