const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../models/User');
const Coach = require('../models/Coach');
const Assessment = require('../models/Assessment');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/talentscope';

const ASSESSMENT_SEEDS = [
  {
    assessmentCode: 'TS-901-SPT',
    testType: 'sprint_acceleration',
    overallScore: 84,
    speed: 10.2,
    power: 1.3,
    endurance: 78,
    percentileRank: 'Top 12%',
    previousScoreComparison: 2.1,
    biometricsBreakdown: {
      movementQuality: 82,
      jointAlignment: 80,
      landingMechanics: 78,
      balanceStability: 85,
      coreTension: 84
    },
    injuryRiskClassification: {
      riskStatus: 'Low',
      riskPercentage: 11,
      asymmetryScore: 0.4,
      fatigueIndex: 12,
      jointStress: 9,
      movementDeficiency: 5
    },
    aiMetadata: { confidenceScore: 97.8, modelVersion: 'v2.4-fastapi-mediapipe' },
    environmentValidation: { lightingLx: 840, distanceMeters: 3.2, fps: 60, isCheatDetected: false }
  },
  {
    assessmentCode: 'TS-902-USS',
    testType: 'unilateral_squat',
    overallScore: 88,
    speed: null,
    power: 1.4,
    endurance: 82,
    percentileRank: 'Top 6%',
    previousScoreComparison: 4.2,
    biometricsBreakdown: {
      movementQuality: 92,
      jointAlignment: 85,
      landingMechanics: 78,
      balanceStability: 94,
      coreTension: 90
    },
    injuryRiskClassification: {
      riskStatus: 'Low',
      riskPercentage: 12,
      asymmetryScore: 0.4,
      fatigueIndex: 15,
      jointStress: 10,
      movementDeficiency: 5
    },
    criticalWarnings: [
      {
        warningType: 'Right Knee Valgus',
        severity: 'Critical',
        angleDeviationDeg: 4.2,
        phase: 'landing phase',
        detail: 'Detected 4.2° internal rotation during landing phase. High risk for ACL fatigue.'
      }
    ],
    heatmapSpots: [
      { joint: 'Right Knee', strainScore: 62, riskColor: '#ff4d4f' },
      { joint: 'Lumbar', strainScore: 38, riskColor: '#faad14' }
    ],
    jointKinematics: {
      kneeFlexionAngle: 128.4,
      kneeFlexionStatus: 'Optimal',
      spineAngle: 2.1,
      spineAlignmentStatus: 'Neutral',
      hipAsymmetryPercentage: 4.2,
      ankleDorsiflexionAngle: 38.5
    },
    recommendations: [
      { title: 'Banded Glute Clamshells', desc: 'Strengthen hip external rotators to stabilize knee alignment.', sets: '3 Sets', reps: '15 Reps', priority: 'High' },
      { title: 'Ankle Mobility Protocol', desc: 'Dynamic stretching before sprint sessions to maintain dorsiflexion gains.', sets: '3 Sets', reps: '12 Reps', priority: 'Medium' },
      { title: 'Eccentric Calf Raises', desc: 'Slow-eccentric loading to fortify Achilles tendon resilience.', sets: '2 Sets', reps: '10 Reps', priority: 'Medium' }
    ],
    aiMetadata: { confidenceScore: 98.4, modelVersion: 'v2.4-fastapi-mediapipe' },
    environmentValidation: { lightingLx: 840, distanceMeters: 3.2, fps: 60, isCheatDetected: false }
  },
  {
    assessmentCode: 'TS-903-CMJ',
    testType: 'countermovement_jump',
    overallScore: 92,
    speed: null,
    power: 1.7,
    endurance: 88,
    percentileRank: 'Top 3%',
    previousScoreComparison: 5.6,
    biometricsBreakdown: {
      movementQuality: 94,
      jointAlignment: 88,
      landingMechanics: 86,
      balanceStability: 96,
      coreTension: 93
    },
    injuryRiskClassification: {
      riskStatus: 'Low',
      riskPercentage: 9,
      asymmetryScore: 0.3,
      fatigueIndex: 10,
      jointStress: 8,
      movementDeficiency: 4
    },
    recommendations: [
      { title: 'Plyometric Depth Jumps', desc: 'Progressive rebound training to convert reactive strength into power.', sets: '4 Sets', reps: '6 Reps', priority: 'High' }
    ],
    aiMetadata: { confidenceScore: 99.1, modelVersion: 'v2.4-fastapi-mediapipe' },
    environmentValidation: { lightingLx: 860, distanceMeters: 3.4, fps: 60, isCheatDetected: false }
  }
];

const COACH_SEEDS = [
  {
    phone: '+910000000101',
    name: 'Dr. Marcus Vance',
    title: 'STRENGTH & CONDITIONING',
    rating: 4.9,
    reviewsCount: 128,
    hourlyRate: '$150/hr',
    specialties: ['Biometrics', 'Sprint Mechanics', 'NFL Prep'],
    bio: 'Optimizing metabolic thresholds through proprietary AI-driven biomechanical feedback loops.',
    credentials: ['Ph.D. in Kinesiology & Biomechanics', 'CSCS', 'EXOS Performance Specialist'],
    affiliation: 'Olympic Training Center'
  },
  {
    phone: '+910000000102',
    name: 'Elena Rodriguez',
    title: 'DATA ANALYSIS / SWIMMING',
    rating: 5.0,
    reviewsCount: 92,
    hourlyRate: '$125/hr',
    specialties: ['VO2 Max', 'Hydro-Dynamics', 'Olympic Level'],
    bio: 'Specializing in hydro-dynamic drag reduction and high-frequency stroke optimization.',
    credentials: ['M.Sc. Sports Science', 'NASM PES', 'USA Swimming Coach'],
    affiliation: 'National Aquatics Center'
  },
  {
    phone: '+910000000103',
    name: 'James Sterling',
    title: 'NEUROMUSCULAR RECOVERY',
    rating: 4.8,
    reviewsCount: 210,
    hourlyRate: '$190/hr',
    specialties: ['CNS Optimization', 'Sleep Tech', 'Recovery AI'],
    bio: 'Integrating CNS fatigue monitoring with elite recovery protocols for maximum longevity.',
    credentials: ['M.D. Sports Medicine', 'CSCS', 'Sleep Science Certified'],
    affiliation: 'Elite Recovery Institute'
  }
];

async function seed() {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  console.log('[Seed] Connected to MongoDB:', mongoose.connection.host, '/', mongoose.connection.name);

  const athlete = await User.findOne({ phone: '+919999000011' });
  let athleteId = athlete ? athlete._id : null;
  if (!athleteId) {
    const created = await User.create({
      name: 'Demo Athlete',
      phone: '+919999000011',
      password: await bcrypt.hash('secret123', 10),
      role: 'athlete',
      primarySport: 'Sprinting',
      preferredSports: ['Sprinting', 'Athletics'],
      specialization: 'Sprinting & Biometrics',
      affiliation: 'Independent Athlete',
      tier: 'Elite Pro',
      regionalRank: 42,
      overallPerformanceScore: 88,
      currentInjuryRiskLevel: 'Low',
      currentInjuryRiskPercentage: 12
    });
    athleteId = created._id;
    console.log('[Seed] Demo athlete created:', athleteId);
  } else {
    console.log('[Seed] Using existing demo athlete:', athleteId);
  }

  let seeded = 0;
  for (const a of ASSESSMENT_SEEDS) {
    const exists = await Assessment.findOne({ assessmentCode: a.assessmentCode });
    if (exists) continue;
    await Assessment.create({ ...a, athleteId, sport: 'Athletics', status: 'completed', completedAt: new Date() });
    seeded++;
  }
  console.log(`[Seed] Assessments seeded: ${seeded}`);

  for (const c of COACH_SEEDS) {
    const existingCoach = await Coach.findOne({ name: c.name });
    if (existingCoach) continue;
    let coachUser = await User.findOne({ phone: c.phone });
    if (!coachUser) {
      coachUser = await User.create({
        name: c.name,
        phone: c.phone,
        password: await bcrypt.hash('coach123', 10),
        role: 'coach',
        primarySport: 'Coaching'
      });
    }
    const { phone, ...coachData } = c;
    await Coach.create({ userId: coachUser._id, name: coachData.name, title: coachData.title, rating: coachData.rating, reviewsCount: coachData.reviewsCount, hourlyRate: coachData.hourlyRate, specialties: coachData.specialties, bio: coachData.bio, credentials: coachData.credentials, affiliation: coachData.affiliation });
    console.log('[Seed] Coach created:', coachData.name);
  }

  await mongoose.disconnect();
  console.log('[Seed] Done. MongoDB disconnected cleanly.');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[Seed] Error:', err.message);
    process.exit(1);
  });
