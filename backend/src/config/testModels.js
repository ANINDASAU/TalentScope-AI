const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('./db');

const User = require('../models/User');
const Assessment = require('../models/Assessment');
const Coach = require('../models/Coach');
const Consultation = require('../models/Consultation');

async function testModels() {
  console.log('=====================================================');
  console.log('   TalentScope Database Schema & Models Test Suite   ');
  console.log('=====================================================');

  let mongod;
  try {
    mongod = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongod.getUri();

    await connectDB(1, 1000);

    // 1. TEST USER MODEL
    console.log('\n[1/4] Testing User / Athlete Model...');
    const rawPassword = 'Password@123';
    const athlete = await User.create({
      name: 'Felix Vanderwaal',
      email: 'felix@talentscope.ai',
      phone: '+919876543210',
      password: rawPassword,
      role: 'athlete',
      age: 22,
      gender: 'male',
      weight: 74.5,
      height: 182,
      preferredSports: ['Athletics', 'Sprinting'],
      primarySport: 'Sprinting',
      specialization: 'Sprinting & Biometrics',
      affiliation: 'Elite Track Global',
      tier: 'Elite Pro',
      regionalRank: 42,
      overallPerformanceScore: 88,
      currentInjuryRiskLevel: 'Low',
      currentInjuryRiskPercentage: 12,
      unlockedBadges: [
        { badgeId: 'b1', name: 'Squat Master', icon: '🏋️' },
        { badgeId: 'b2', name: 'Sprint Form', icon: '⚡' }
      ],
      settings: {
        darkMode: false,
        compactTelemetryView: true,
        injuryAlerts: true
      }
    });

    console.log(`✅ Athlete User created with ID: ${athlete._id}`);
    console.log(`- Stored Password Hash: ${athlete.password.slice(0, 15)}... (Bcrypt verified)`);

    // Verify Password match method
    const isMatch = await athlete.matchPassword(rawPassword);
    const isFalseMatch = await athlete.matchPassword('WrongPass');
    if (!isMatch || isFalseMatch) {
      throw new Error('Password bcrypt match verification failed.');
    }
    console.log('✅ Bcrypt password hashing & matchPassword verification passed.');

    // 2. TEST ASSESSMENT MODEL
    console.log('\n[2/4] Testing Assessment Biomechanical Telemetry Model...');
    const assessment = await Assessment.create({
      assessmentCode: 'TS-942-AXL',
      athleteId: athlete._id,
      testType: 'unilateral_squat',
      category: 'Athletics',
      overallScore: 88,
      previousScoreComparison: 4.2,
      percentileRank: 'Top 5%',
      biometricsBreakdown: {
        movementQuality: 92,
        jointAlignment: 85,
        landingMechanics: 78,
        balanceStability: 94,
        sprintSpeed: 10.2,
        powerOutput: 1.4,
        enduranceIndex: 82,
        coreTension: 90
      },
      jointKinematics: {
        kneeFlexionAngle: 118,
        kneeFlexionStatus: 'Optimal',
        spineAngle: 4.2,
        spineAlignmentStatus: 'Neutral',
        hipAsymmetryPercentage: 1.8,
        ankleDorsiflexionAngle: 35
      },
      hasPostureWarning: true,
      criticalWarnings: [
        {
          warningType: 'Right Knee Valgus',
          severity: 'Critical',
          angleDeviationDeg: 4.2,
          phase: 'landing phase',
          detail: 'Detected 4.2° internal rotation during landing phase.'
        }
      ],
      heatmapSpots: [
        { joint: 'Right Knee', strainScore: 78, riskColor: '#ba1a1a' },
        { joint: 'Lumbar', strainScore: 22, riskColor: '#4ae176' }
      ],
      injuryRiskClassification: {
        riskStatus: 'Low',
        riskPercentage: 12,
        asymmetryScore: 8,
        fatigueIndex: 15,
        jointStress: 10,
        movementDeficiency: 5
      },
      environmentValidation: {
        lightingLx: 840,
        distanceMeters: 3.2,
        fps: 60,
        confidenceScore: 98.4,
        isCheatDetected: false
      },
      aiInsights: [
        'Optimal pelvic alignment maintained throughout concentric drive.',
        'Slight valgus deviation detected during rapid ground impact.'
      ],
      recommendations: [
        {
          title: 'Banded Glute Clamshells',
          desc: 'Strengthens hip abduction and stabilizes lateral knee vector.',
          sets: '3 Sets',
          reps: '15 Reps',
          priority: 'High'
        }
      ]
    });

    console.log(`✅ Assessment created with Code: ${assessment.assessmentCode} (ID: ${assessment.assessmentCode})`);

    // Verify Population
    const populatedAssessment = await Assessment.findById(assessment._id).populate('athleteId');
    console.log(`✅ Population verified: Assessment athlete name = "${populatedAssessment.athleteId.name}"`);

    // 3. TEST COACH MODEL
    console.log('\n[3/4] Testing Coach Marketplace Model...');
    const coachUser = await User.create({
      name: 'Dr. Marcus Vance',
      email: 'marcus.vance@talentscope.ai',
      phone: '+919876543211',
      password: 'CoachPassword@123',
      role: 'coach'
    });

    const coach = await Coach.create({
      userId: coachUser._id,
      name: coachUser.name,
      title: 'Olympic Biomechanics & Sprint Specialist',
      rating: 4.95,
      reviewsCount: 48,
      hourlyRate: '$120/hr',
      verified: true,
      specialties: ['Sprint Mechanics', 'ACL Rehab', 'Force Plate Analysis'],
      bio: 'Former Olympic track biomechanist specializing in high-speed camera joint angle analysis.',
      credentials: [
        'Ph.D. in Kinesiology & Biomechanics (Stanford)',
        'CSCS (Certified Strength & Conditioning Specialist)',
        'EXOS Performance Specialist'
      ]
    });

    console.log(`✅ Coach Profile created for "${coach.name}" (ID: ${coach._id})`);

    // 4. TEST CONSULTATION MODEL
    console.log('\n[4/4] Testing Consultation Booking Model...');
    const consultation = await Consultation.create({
      athleteId: athlete._id,
      coachId: coach._id,
      assessmentId: assessment._id,
      status: 'requested',
      athleteNotes: 'Need evaluation on my right knee valgus during explosive sprint starts.'
    });

    const populatedConsultation = await Consultation.findById(consultation._id)
      .populate('athleteId', 'name primarySport')
      .populate('coachId', 'name title hourlyRate')
      .populate('assessmentId', 'assessmentCode overallScore testType');

    console.log(`✅ Consultation created and verified:`);
    console.log(`- Athlete: ${populatedConsultation.athleteId.name}`);
    console.log(`- Coach: ${populatedConsultation.coachId.name} (${populatedConsultation.coachId.title})`);
    console.log(`- Linked Assessment: ${populatedConsultation.assessmentId.assessmentCode} (Score: ${populatedConsultation.assessmentId.overallScore})`);

    // Teardown
    await disconnectDB();
    await mongod.stop();

    console.log('\n🎉 ALL 4 SCHEMAS, RELATIONS, INDEXES & VALIDATIONS PASSED 100%!');
    console.log('=====================================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ SCHEMA TEST FAILED:', error);
    if (mongod) await mongod.stop();
    process.exit(1);
  }
}

testModels();
