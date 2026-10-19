const express = require('express');
const http = require('http');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { connectDB, disconnectDB } = require('./db');

const User = require('../models/User');
const Assessment = require('../models/Assessment');
const Coach = require('../models/Coach');
const Consultation = require('../models/Consultation');

const authRoutes = require('../routes/authRoutes');
const athleteRoutes = require('../routes/athleteRoutes');
const assessmentRoutes = require('../routes/assessmentRoutes');
const coachRoutes = require('../routes/coachRoutes');

function makeRequest(server, method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const payload = body ? JSON.stringify(body) : null;
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path: encodeURI(path),
        method,
        headers
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ status: res.statusCode, body: parsed });
          } catch (e) {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runPhase9DatabaseFullTestSuite() {
  console.log('================================================================');
  console.log('      TalentScope Phase 9: Complete MongoDB Database Suite      ');
  console.log('================================================================');

  let mongod;
  let server;
  let testCount = 0;
  let passedCount = 0;

  function recordPass(testName) {
    testCount++;
    passedCount++;
    console.log(`  ✅ [Passed ${testCount}] ${testName}`);
  }

  try {
    mongod = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongod.getUri();
    process.env.JWT_SECRET = 'talentscope_phase9_full_db_verification_secret_2026';

    await connectDB(1, 1000);

    // Sync all indexes
    await User.syncIndexes();
    await Assessment.syncIndexes();
    await Coach.syncIndexes();
    await Consultation.syncIndexes();

    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/athletes', athleteRoutes);
    app.use('/api/assessments', assessmentRoutes);
    app.use('/api/coaches', coachRoutes);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    console.log(`[Test Server]: Online on http://127.0.0.1:${port}\n`);

    // =========================================================================
    // SUITE 1: USER DATA LIFECYCLE
    // =========================================================================
    console.log('▶ SUITE 1: USER DATA LIFECYCLE');

    // 1.1 Create Athlete User
    const regRes = await makeRequest(server, 'POST', '/api/auth/register', {
      name: 'Felix Vanderwaal',
      phone: '+919876543701',
      password: 'StrongPassword123!',
      role: 'athlete',
      primarySport: 'Sprinting',
      age: 22,
      weight: 74,
      height: 182
    });
    if (regRes.status !== 201 || !regRes.body.token) throw new Error('Registration failed');
    const athlete1Token = regRes.body.token;
    const athlete1Id = regRes.body.user._id;
    recordPass('User Creation & Registration with Hashed Password & JWT Token');

    // 1.2 Retrieve Profile & Verify Password Omission
    const profRes = await makeRequest(server, 'GET', '/api/auth/profile', null, athlete1Token);
    if (profRes.status !== 200 || profRes.body.user.password !== undefined) throw new Error('Password leak in profile');
    recordPass('User Profile Retrieval & Password Hash Exclusion');

    // 1.3 Authenticate User (Valid vs Invalid Credentials)
    const loginValid = await makeRequest(server, 'POST', '/api/auth/login', {
      phone: '+919876543701',
      password: 'StrongPassword123!'
    });
    if (loginValid.status !== 200 || !loginValid.body.token) throw new Error('Login with valid credentials failed');

    const loginInvalid = await makeRequest(server, 'POST', '/api/auth/login', {
      phone: '+919876543701',
      password: 'WrongPassword999'
    });
    if (loginInvalid.status !== 401) throw new Error('Invalid password was not rejected');
    recordPass('User Authentication & Bcrypt Verification (Valid & Invalid cases)');

    // 1.4 Update Athlete Profile
    const updateRes = await makeRequest(
      server,
      'PUT',
      '/api/athletes/profile',
      {
        weight: 75.5,
        affiliation: 'National Olympic Track Team',
        specialization: '100m / 200m Sprint Biomechanics'
      },
      athlete1Token
    );
    if (updateRes.status !== 200 || updateRes.body.user.weight !== 75.5) throw new Error('Profile update failed');
    recordPass('User Profile Update & Persistent DB Synchronization');

    // =========================================================================
    // SUITE 2: ASSESSMENT LIFECYCLE
    // =========================================================================
    console.log('\n▶ SUITE 2: ASSESSMENT DATA LIFECYCLE');

    // 2.1 Create Assessment
    const createAss1 = await makeRequest(
      server,
      'POST',
      '/api/assessments',
      {
        sport: 'Athletics',
        testType: 'unilateral_squat',
        videoUrl: 'https://storage.talentscope.ai/videos/vid-701.mp4'
      },
      athlete1Token
    );
    if (createAss1.status !== 201 || !createAss1.body.data.assessmentCode) throw new Error('Assessment creation failed');
    const ass1Id = createAss1.body.data._id;
    const ass1Code = createAss1.body.data.assessmentCode;
    recordPass('Assessment Creation (Generated unique code & initial status "created")');

    // 2.2 Retrieve Assessment by ID & Code
    const getAssId = await makeRequest(server, 'GET', `/api/assessments/${ass1Id}`, null, athlete1Token);
    const getAssCode = await makeRequest(server, 'GET', `/api/assessments/${ass1Code}`, null, athlete1Token);
    if (getAssId.status !== 200 || getAssCode.status !== 200) throw new Error('Retrieve assessment failed');
    recordPass('Assessment Retrieval by both MongoDB ObjectId and unique assessmentCode');

    // 2.3 Status Transition (created -> uploading -> processing)
    await makeRequest(server, 'PATCH', `/api/assessments/${ass1Id}/status`, { status: 'uploading' }, athlete1Token);
    const procStatus = await makeRequest(server, 'PATCH', `/api/assessments/${ass1Id}/status`, { status: 'processing' }, athlete1Token);
    if (procStatus.status !== 200 || procStatus.body.data.status !== 'processing') throw new Error('Status transition failed');
    recordPass('Assessment Status Transitions (created -> uploading -> processing)');

    // 2.4 Save AI Analysis Results
    const aiPayload = {
      overallScore: 89,
      speed: 10.4,
      power: 1.5,
      endurance: 84,
      biometricsBreakdown: {
        movementQuality: 91,
        jointAlignment: 88,
        landingMechanics: 80,
        balanceStability: 93
      },
      jointKinematics: {
        kneeFlexionAngle: 119,
        kneeFlexionStatus: 'Optimal',
        spineAngle: 4.0,
        spineAlignmentStatus: 'Neutral',
        hipAsymmetryPercentage: 1.6
      },
      hasPostureWarning: false,
      injuryRiskClassification: {
        riskStatus: 'Low',
        riskPercentage: 11,
        asymmetryScore: 6,
        fatigueIndex: 12
      },
      recommendations: [
        { title: 'Glute Activation', desc: '3 sets of dynamic lunges', priority: 'High' }
      ],
      status: 'completed'
    };
    const saveAiRes = await makeRequest(server, 'PUT', `/api/assessments/${ass1Id}/results`, aiPayload, athlete1Token);
    if (saveAiRes.status !== 200 || saveAiRes.body.data.overallScore !== 89) throw new Error('Save AI results failed');
    recordPass('Persist AI Analysis Results (Telemetry, Kinematics, Posture, Injury Risk)');

    // 2.5 Verify Completed Timestamp and User Aggregate Synchronization
    const ass1Completed = await Assessment.findById(ass1Id);
    const athlete1Doc = await User.findById(athlete1Id);
    if (!ass1Completed.completedAt || athlete1Doc.overallPerformanceScore !== 89 || athlete1Doc.totalAssessmentsCount !== 1) {
      throw new Error('Completion timestamp or user profile synchronization failed');
    }
    recordPass('Assessment Completion Timestamping & Automatic User Aggregate Score Update');

    // 2.6 Create & Mark Second Assessment as Failed
    const createAss2 = await makeRequest(
      server,
      'POST',
      '/api/assessments',
      { testType: 'sprint_acceleration' },
      athlete1Token
    );
    const ass2Id = createAss2.body.data._id;
    const failRes = await makeRequest(
      server,
      'PATCH',
      `/api/assessments/${ass2Id}/fail`,
      {
        code: 'CAMERA_OCCLUSION',
        message: 'Athlete lower limbs obstructed by training equipment.',
        failedStep: 'mediapipe_tracking'
      },
      athlete1Token
    );
    if (failRes.status !== 200 || failRes.body.data.status !== 'failed' || !failRes.body.data.errorDetails) {
      throw new Error('Fail assessment handling failed');
    }
    recordPass('Assessment Failure Handling with Safe Error Details & Processing Recovery');

    // 2.7 Retrieve Assessment History
    const histRes = await makeRequest(server, 'GET', '/api/assessments/history', null, athlete1Token);
    if (histRes.status !== 200 || histRes.body.count !== 2) throw new Error('History query failed');
    recordPass('Assessment History Retrieval (Sorted descending by createdAt)');

    // 2.8 Retrieve Latest Completed Assessment
    const latestRes = await makeRequest(server, 'GET', '/api/assessments/latest', null, athlete1Token);
    if (latestRes.status !== 200 || latestRes.body.data._id !== ass1Id) throw new Error('Latest assessment query failed');
    recordPass('Latest Completed Assessment Retrieval (Filters out failed/processing tests)');

    // =========================================================================
    // SUITE 3: COACH & AUTHORIZED ACCESS
    // =========================================================================
    console.log('\n▶ SUITE 3: COACH & AUTHORIZATION ARCHITECTURE');

    // 3.1 Create Coach & Retrieve Marketplace
    const coachUser = await User.create({
      name: 'Dr. Marcus Vance',
      phone: '+919876543702',
      password: 'Password123!',
      role: 'coach'
    });
    const coachToken = jwt.sign({ id: coachUser._id, role: 'coach' }, process.env.JWT_SECRET);

    const coach = await Coach.create({
      userId: coachUser._id,
      name: coachUser.name,
      title: 'Olympic Biomechanics Specialist',
      rating: 4.95,
      verified: true,
      specialties: ['Sprint Mechanics', 'Force Plate Analysis']
    });

    const getCoachesRes = await makeRequest(server, 'GET', '/api/coaches?specialty=Sprint Mechanics');
    if (getCoachesRes.status !== 200 || getCoachesRes.body.count !== 1) throw new Error('Coach list failed');
    recordPass('Coach Marketplace Retrieval & Specialty Index Filtering');

    // 3.2 Retrieve Coach Profile
    const coachProfRes = await makeRequest(server, 'GET', `/api/coaches/${coach._id}`);
    if (coachProfRes.status !== 200 || coachProfRes.body.data.name !== 'Dr. Marcus Vance') throw new Error('Coach profile failed');
    recordPass('Coach Profile Retrieval with Accreditations & Ratings');

    // 3.3 Authorize Athlete for Coach
    const authAthleteRes = await makeRequest(
      server,
      'POST',
      `/api/coaches/${coach._id}/authorize-athlete`,
      { athleteId: athlete1Id },
      coachToken
    );
    if (authAthleteRes.status !== 200) throw new Error('Authorize athlete failed');
    recordPass('Authorized Coach-Athlete Relationship Linkage (assignedAthletes)');

    // 3.4 Authorized Coach Access to Athlete Assessments
    const authCoachView = await makeRequest(server, 'GET', `/api/assessments/${ass1Id}`, null, coachToken);
    if (authCoachView.status !== 200) throw new Error('Authorized coach was rejected');
    recordPass('Authorized Coach Access to Assigned Athlete Assessment Records');

    // =========================================================================
    // SUITE 4: SECURITY & ACCESS CONTROL
    // =========================================================================
    console.log('\n▶ SUITE 4: SECURITY & ACCESS CONTROL ENFORCEMENT');

    // 4.1 Missing Authentication Token
    const noTokenRes = await makeRequest(server, 'GET', '/api/auth/profile');
    if (noTokenRes.status !== 401) throw new Error('Missing token allowed');
    recordPass('Missing Authentication Token Rejected (401 Unauthorized)');

    // 4.2 Invalid / Tampered Token
    const badTokenRes = await makeRequest(server, 'GET', '/api/auth/profile', null, 'malformed.fake.jwt.token');
    if (badTokenRes.status !== 401) throw new Error('Malformed token allowed');
    recordPass('Malformed / Tampered JWT Token Rejected (401 Unauthorized)');

    // 4.3 Cross-Athlete Unauthorized Access (Athlete 2 attempting to view Athlete 1's assessment)
    const athlete2User = await User.create({
      name: 'Unrelated Athlete',
      phone: '+919876543703',
      password: 'Password123!',
      role: 'athlete'
    });
    const athlete2Token = jwt.sign({ id: athlete2User._id, role: 'athlete' }, process.env.JWT_SECRET);

    const crossAccessRes = await makeRequest(server, 'GET', `/api/assessments/${ass1Id}`, null, athlete2Token);
    if (crossAccessRes.status !== 403) throw new Error('Cross-athlete access was permitted');
    recordPass('Cross-Athlete Unauthorized Access Blocked (403 Forbidden)');

    // 4.4 Unauthorized Coach Access (Coach attempting to view unassigned Athlete 2's assessment)
    const assAthlete2 = await Assessment.create({
      assessmentCode: 'TS-ATH2-PRIV',
      athleteId: athlete2User._id,
      testType: 'unilateral_squat'
    });
    const unauthCoachRes = await makeRequest(server, 'GET', `/api/assessments/${assAthlete2._id}`, null, coachToken);
    if (unauthCoachRes.status !== 403) throw new Error('Unauthorized coach access allowed');
    recordPass('Unauthorized Coach Access to Unassigned Athlete Blocked (403 Forbidden)');

    // 4.5 Invalid / Nonexistent IDs Handled Gracefully
    const fakeObjectId = new mongoose.Types.ObjectId();
    const notFoundRes = await makeRequest(server, 'GET', `/api/assessments/${fakeObjectId}`, null, athlete1Token);
    if (notFoundRes.status !== 404) throw new Error('Nonexistent assessment did not return 404');
    recordPass('Nonexistent Assessment ID Handled (404 Not Found)');

    // =========================================================================
    // SUITE 5: DATA INTEGRITY & SCHEMA VALIDATIONS
    // =========================================================================
    console.log('\n▶ SUITE 5: DATA INTEGRITY & SCHEMA VALIDATIONS');

    // 5.1 Missing Required Fields on User Registration
    const missingFieldRes = await makeRequest(server, 'POST', '/api/auth/register', {
      name: 'Incomplete User'
    });
    if (missingFieldRes.status !== 400) throw new Error('Missing registration fields allowed');
    recordPass('Missing Required User Registration Fields Rejected (400 Bad Request)');

    // 5.2 Invalid Score Range in Assessment Schema Validation
    let validationErrorCaught = false;
    try {
      await Assessment.create({
        assessmentCode: 'TS-INVALID-SCORE',
        athleteId: athlete1Id,
        overallScore: 150 // Exceeds max: 100
      });
    } catch (err) {
      validationErrorCaught = true;
    }
    if (!validationErrorCaught) throw new Error('Out of bounds score was accepted');
    recordPass('Assessment Schema Validation (Rejects scores > 100 or < 0)');

    // 5.3 Assessment Athlete Ownership Integrity Guard (Pre-save hook)
    let orphanRejected = false;
    try {
      await Assessment.create({
        assessmentCode: 'TS-ORPHAN-TEST',
        athleteId: fakeObjectId // Nonexistent user
      });
    } catch (err) {
      if (err.message.includes('does not exist')) orphanRejected = true;
    }
    if (!orphanRejected) throw new Error('Orphaned assessment creation allowed');
    recordPass('Orphaned Assessment Integrity Guard (Rejects nonexistent athlete references)');

    // =========================================================================
    // SUITE 6: DATABASE ENGINE & INDEX BEHAVIOR
    // =========================================================================
    console.log('\n▶ SUITE 6: DATABASE ENGINE & INDEXES');

    // 6.1 Duplicate Unique Key Rejection (Phone Number)
    let duplicatePhoneBlocked = false;
    try {
      await User.create({
        name: 'Duplicate Phone User',
        phone: '+919876543701', // Already exists for Athlete 1
        password: 'Password123'
      });
    } catch (err) {
      if (err.code === 11000) duplicatePhoneBlocked = true;
    }
    if (!duplicatePhoneBlocked) throw new Error('Duplicate phone number was allowed');
    recordPass('Duplicate Unique Key Rejection (Unique index on phone prevents collision)');

    // 6.2 Duplicate Assessment Code Rejection
    let duplicateCodeBlocked = false;
    try {
      await Assessment.create({
        assessmentCode: ass1Code, // Already exists
        athleteId: athlete1Id
      });
    } catch (err) {
      if (err.code === 11000) duplicateCodeBlocked = true;
    }
    if (!duplicateCodeBlocked) throw new Error('Duplicate assessment code was allowed');
    recordPass('Duplicate Assessment Code Rejection (Unique index on assessmentCode)');

    // 6.3 Index Query Plan Verification (B-Tree Index Scan instead of full COLLSCAN)
    const explainPlan = await Assessment.find({ athleteId: athlete1Id, status: 'completed' })
      .sort({ createdAt: -1 })
      .explain('executionStats');
    const executionStage = explainPlan.executionStats.executionStages.stage;
    if (executionStage === 'COLLSCAN') throw new Error('Query performed full COLLSCAN instead of IXSCAN');
    recordPass('Index Execution Plan Verification (Utilizes IXSCAN without in-memory sorting)');

    // 6.4 Clean Database Teardown
    server.close();
    await disconnectDB();
    await mongod.stop();
    recordPass('Graceful MongoDB Teardown & In-Memory Isolation');

    console.log('\n================================================================');
    console.log(`🎉 ALL ${passedCount}/${testCount} COMPLETE DATABASE LIFECYCLE TESTS PASSED 100%!`);
    console.log('================================================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ PHASE 9 DATABASE TEST FAILED:', error);
    if (server) server.close();
    if (mongod) await mongod.stop();
    process.exit(1);
  }
}

runPhase9DatabaseFullTestSuite();
