const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('./db');

const User = require('../models/User');
const Assessment = require('../models/Assessment');

async function runAssessmentDbTests() {
  console.log('===========================================================');
  console.log('   TalentScope Phase 4: Assessment Database Test Suite     ');
  console.log('===========================================================');

  let mongod;

  try {
    mongod = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongod.getUri();

    await connectDB(1, 1000);

    // STEP 1: Create an Athlete
    console.log('\n[Step 1] Creating baseline Athlete (User)...');
    const athlete = await User.create({
      name: 'Felix Vanderwaal',
      email: 'felix.assessments@talentscope.ai',
      phone: '+919876543220',
      password: 'SecurePassword123',
      role: 'athlete',
      age: 22,
      primarySport: 'Sprinting'
    });
    console.log(`✅ Athlete created with ID: ${athlete._id} (${athlete.name})`);

    // STEP 2: Create Multiple Assessments for this Athlete (1-to-N Concept)
    console.log('\n[Step 2] Creating Multiple Assessments for the same Athlete (1-to-N relationship)...');
    
    // Assessment 1: Unilateral Squat
    const assessment1 = await Assessment.create({
      assessmentCode: 'TS-942-AXL',
      athleteId: athlete._id,
      sport: 'Athletics',
      testType: 'unilateral_squat',
      status: 'completed',
      overallScore: 88,
      speed: 9.8,
      power: 1.4,
      endurance: 82,
      previousScoreComparison: 4.2,
      percentileRank: 'Top 5%',
      videoUrl: 'https://storage.talentscope.ai/assessments/vid-ts-942.mp4',
      keyframeSnapshotUrl: 'https://storage.talentscope.ai/keyframes/kf-ts-942.jpg',
      videoMetadata: {
        durationSeconds: 15.4,
        resolution: '1080x1920',
        fps: 60,
        fileSizeBytes: 24500000
      },
      biometricsBreakdown: {
        movementQuality: 92,
        jointAlignment: 85,
        landingMechanics: 78,
        balanceStability: 94,
        sprintSpeed: 9.8,
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
        { joint: 'Right Knee', strainScore: 78, riskColor: '#ba1a1a' }
      ],
      injuryRiskClassification: {
        riskStatus: 'Low',
        riskPercentage: 12,
        asymmetryScore: 8,
        fatigueIndex: 15,
        jointStress: 10,
        movementDeficiency: 5
      },
      recommendations: [
        {
          title: 'Banded Glute Clamshells',
          desc: 'Strengthens hip abduction and stabilizes lateral knee vector.',
          sets: '3 Sets',
          reps: '15 Reps',
          priority: 'High'
        }
      ],
      aiMetadata: {
        confidenceScore: 98.4,
        modelVersion: 'v2.4-fastapi-mediapipe'
      }
    });

    // Assessment 2: Sprint Acceleration
    const assessment2 = await Assessment.create({
      assessmentCode: 'TS-943-SPR',
      athleteId: athlete._id,
      sport: 'Athletics',
      testType: 'sprint_acceleration',
      status: 'completed',
      overallScore: 92,
      speed: 10.4,
      power: 1.6,
      endurance: 88,
      previousScoreComparison: 2.1,
      percentileRank: 'Top 3%',
      videoUrl: 'https://storage.talentscope.ai/assessments/vid-ts-943.mp4',
      biometricsBreakdown: {
        movementQuality: 95,
        jointAlignment: 92,
        landingMechanics: 89,
        balanceStability: 96
      },
      injuryRiskClassification: {
        riskStatus: 'Low',
        riskPercentage: 8,
        asymmetryScore: 4,
        fatigueIndex: 10
      }
    });

    // Assessment 3: Countermovement Jump (in processing state)
    const assessment3 = await Assessment.create({
      assessmentCode: 'TS-944-CMJ',
      athleteId: athlete._id,
      sport: 'Athletics',
      testType: 'countermovement_jump',
      status: 'processing',
      videoUrl: 'https://storage.talentscope.ai/assessments/vid-ts-944.mp4'
    });

    console.log(`✅ Created Assessment 1: Code = ${assessment1.assessmentCode}, Score = ${assessment1.overallScore}`);
    console.log(`✅ Created Assessment 2: Code = ${assessment2.assessmentCode}, Score = ${assessment2.overallScore}`);
    console.log(`✅ Created Assessment 3: Code = ${assessment3.assessmentCode}, Status = ${assessment3.status}`);

    // STEP 3: Query & Verify Athlete Assessments List
    console.log('\n[Step 3] Querying all assessments belonging to athlete...');
    const athleteAssessments = await Assessment.find({ athleteId: athlete._id }).sort({ createdAt: -1 });
    if (athleteAssessments.length !== 3) {
      throw new Error(`Expected 3 assessments, got ${athleteAssessments.length}`);
    }
    console.log(`✅ Retrieved ${athleteAssessments.length} assessments for athlete '${athlete.name}'.`);
    athleteAssessments.forEach((a, i) => {
      console.log(`   [${i + 1}] ${a.assessmentCode} • Test: ${a.testType} • Status: ${a.status} • Score: ${a.overallScore ?? 'N/A'}`);
    });

    // STEP 4: Update Assessment (Transition processing -> completed)
    console.log('\n[Step 4] Updating Assessment 3 (Transitioning processing -> completed with scores)...');
    const updatedAssessment3 = await Assessment.findByIdAndUpdate(
      assessment3._id,
      {
        status: 'completed',
        overallScore: 86,
        speed: 8.9,
        power: 1.5,
        biometricsBreakdown: {
          movementQuality: 88,
          jointAlignment: 84,
          landingMechanics: 80,
          balanceStability: 90
        }
      },
      { new: true, runValidators: true }
    );
    if (updatedAssessment3.status !== 'completed' || updatedAssessment3.overallScore !== 86 || !updatedAssessment3.completedAt) {
      throw new Error('Assessment update failed or completedAt not set!');
    }
    console.log(`✅ Updated Assessment 3: Status = ${updatedAssessment3.status}, Score = ${updatedAssessment3.overallScore}, completedAt = ${updatedAssessment3.completedAt.toISOString()}`);

    // STEP 5: Test Error Handling for Failed Assessment
    console.log('\n[Step 5] Creating a Failed Assessment Record with Error Details...');
    const failedAssessment = await Assessment.create({
      assessmentCode: 'TS-945-ERR',
      athleteId: athlete._id,
      testType: 'landing_mechanics',
      status: 'failed',
      errorDetails: {
        code: 'INSUFFICIENT_KEYPOINTS',
        message: 'Camera angle obstructed lower limbs during ground contact.',
        failedStep: 'pose_estimation_mediapipe',
        occurredAt: new Date()
      }
    });
    console.log(`✅ Failed Assessment Stored: Code = ${failedAssessment.assessmentCode}, Error Code = ${failedAssessment.errorDetails.code}, Message = "${failedAssessment.errorDetails.message}"`);

    // STEP 6: Test Athlete Ownership Constraint (Rejecting nonexistent athlete ID)
    console.log('\n[Step 6] Testing Athlete Ownership Integrity (Rejecting invalid/nonexistent athlete ID)...');
    const fakeAthleteId = new mongoose.Types.ObjectId();
    let constraintPassed = false;
    try {
      await Assessment.create({
        assessmentCode: 'TS-FAKE-001',
        athleteId: fakeAthleteId,
        testType: 'unilateral_squat',
        overallScore: 75
      });
    } catch (err) {
      constraintPassed = true;
      console.log(`✅ Nonexistent Athlete Rejected: "${err.message}"`);
    }
    if (!constraintPassed) {
      throw new Error('SECURITY VIOLATION: Assessment allowed referencing a nonexistent athlete ID!');
    }

    // STEP 7: Test Assessment Deletion / Cleanup
    console.log('\n[Step 7] Testing Assessment Deletion / Cleanup...');
    await Assessment.findByIdAndDelete(failedAssessment._id);
    const deletedCheck = await Assessment.findById(failedAssessment._id);
    if (deletedCheck !== null) {
      throw new Error('Assessment deletion failed!');
    }
    console.log(`✅ Assessment ${failedAssessment.assessmentCode} successfully deleted and cleaned up.`);

    // Teardown
    await disconnectDB();
    await mongod.stop();

    console.log('\n🎉 ALL 7 ASSESSMENT DATABASE TESTS PASSED WITH 100% SUCCESS!');
    console.log('===========================================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ ASSESSMENT DB TEST FAILED:', error);
    if (mongod) await mongod.stop();
    process.exit(1);
  }
}

runAssessmentDbTests();
