const express = require('express');
const http = require('http');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { connectDB, disconnectDB } = require('./db');

const User = require('../models/User');
const Coach = require('../models/Coach');
const Assessment = require('../models/Assessment');
const assessmentRoutes = require('../routes/assessmentRoutes');

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

async function runAssessmentApiTests() {
  console.log('===========================================================');
  console.log('   TalentScope Phase 7: Assessment APIs Full Test Suite   ');
  console.log('===========================================================');

  let mongod;
  let server;

  try {
    mongod = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongod.getUri();
    process.env.JWT_SECRET = 'test_jwt_secret_assessment_apis_2026';

    await connectDB(1, 1000);

    const app = express();
    app.use(express.json());
    app.use('/api/assessments', assessmentRoutes);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    console.log(`[Test Server]: Running on http://127.0.0.1:${port}`);

    // SETUP: Create Athlete 1, Athlete 2, Coach
    console.log('\n[Setup] Seeding test athletes and coaches in MongoDB...');
    const athlete1 = await User.create({
      name: 'Felix Vanderwaal',
      phone: '+919876543501',
      password: 'Password123',
      role: 'athlete',
      primarySport: 'Sprinting',
      overallPerformanceScore: 85
    });

    const athlete2 = await User.create({
      name: 'Other Athlete',
      phone: '+919876543502',
      password: 'Password123',
      role: 'athlete',
      primarySport: 'Athletics'
    });

    const coachUser = await User.create({
      name: 'Dr. Marcus Vance',
      phone: '+919876543503',
      password: 'Password123',
      role: 'coach'
    });

    const coach = await Coach.create({
      userId: coachUser._id,
      name: coachUser.name,
      title: 'Olympic Biomechanics Specialist',
      assignedAthletes: [athlete1._id]
    });

    const athlete1Token = jwt.sign({ id: athlete1._id, role: 'athlete' }, process.env.JWT_SECRET);
    const athlete2Token = jwt.sign({ id: athlete2._id, role: 'athlete' }, process.env.JWT_SECRET);
    const coachToken = jwt.sign({ id: coachUser._id, role: 'coach' }, process.env.JWT_SECRET);

    console.log(`✅ Seeded Athlete 1, Athlete 2, and Assigned Coach.`);

    // 1. TEST CREATE ASSESSMENT (POST /api/assessments)
    console.log('\n[Test 1] Testing Create Assessment (POST /api/assessments)...');
    const createRes = await makeRequest(
      server,
      'POST',
      '/api/assessments',
      {
        sport: 'Athletics',
        testType: 'unilateral_squat',
        videoUrl: 'https://storage.talentscope.ai/uploads/vid-001.mp4',
        videoMetadata: { durationSeconds: 12.5, fps: 60, resolution: '1080x1920' }
      },
      athlete1Token
    );
    if (createRes.status !== 201 || !createRes.body.data.assessmentCode) {
      throw new Error(`Create assessment failed: ${JSON.stringify(createRes.body)}`);
    }
    const assessment1 = createRes.body.data;
    console.log(`✅ Assessment Created (201 Created): Code = ${assessment1.assessmentCode}, Status = ${assessment1.status}`);

    // 2. TEST RETRIEVE ASSESSMENT (GET /api/assessments/:id)
    console.log('\n[Test 2] Testing Retrieve Assessment by ID and Code...');
    const getByIdRes = await makeRequest(server, 'GET', `/api/assessments/${assessment1._id}`, null, athlete1Token);
    if (getByIdRes.status !== 200 || getByIdRes.body.data.assessmentCode !== assessment1.assessmentCode) {
      throw new Error(`Retrieve by ID failed: ${JSON.stringify(getByIdRes.body)}`);
    }
    console.log(`✅ Retrieved by MongoDB ID: "${getByIdRes.body.data.assessmentCode}" • Athlete: "${getByIdRes.body.data.athleteId.name}"`);

    const getByCodeRes = await makeRequest(server, 'GET', `/api/assessments/${assessment1.assessmentCode}`, null, athlete1Token);
    if (getByCodeRes.status !== 200 || getByCodeRes.body.data._id !== assessment1._id) {
      throw new Error(`Retrieve by Code failed: ${JSON.stringify(getByCodeRes.body)}`);
    }
    console.log(`✅ Retrieved by Assessment Code: "${getByCodeRes.body.data.assessmentCode}"`);

    // 3. TEST UPDATE ASSESSMENT STATUS (PATCH /api/assessments/:id/status)
    console.log('\n[Test 3] Testing Update Assessment Status (uploading -> processing)...');
    const statusRes = await makeRequest(
      server,
      'PATCH',
      `/api/assessments/${assessment1._id}/status`,
      { status: 'processing' },
      athlete1Token
    );
    if (statusRes.status !== 200 || statusRes.body.data.status !== 'processing') {
      throw new Error(`Status update failed: ${JSON.stringify(statusRes.body)}`);
    }
    console.log(`✅ Status Transitioned to 'processing': "${statusRes.body.message}"`);

    // 4. TEST SAVE ASSESSMENT ANALYSIS RESULTS (PUT /api/assessments/:id/results)
    console.log('\n[Test 4] Testing Save AI Analysis Results (PUT /api/assessments/:id/results)...');
    const aiResultsPayload = {
      overallScore: 88,
      speed: 9.8,
      power: 1.4,
      endurance: 82,
      previousScoreComparison: 4.2,
      percentileRank: 'Top 5%',
      biometricsBreakdown: {
        movementQuality: 92,
        jointAlignment: 85,
        landingMechanics: 78,
        balanceStability: 94
      },
      jointKinematics: {
        kneeFlexionAngle: 118,
        kneeFlexionStatus: 'Optimal',
        spineAngle: 4.2,
        spineAlignmentStatus: 'Neutral',
        hipAsymmetryPercentage: 1.8
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
      injuryRiskClassification: {
        riskStatus: 'Low',
        riskPercentage: 12,
        asymmetryScore: 8,
        fatigueIndex: 15
      },
      recommendations: [
        {
          title: 'Banded Glute Clamshells',
          desc: 'Strengthens hip abduction and stabilizes lateral knee vector.',
          sets: '3 Sets',
          reps: '15 Reps'
        }
      ],
      status: 'completed'
    };

    const saveRes = await makeRequest(server, 'PUT', `/api/assessments/${assessment1._id}/results`, aiResultsPayload, athlete1Token);
    if (saveRes.status !== 200 || saveRes.body.data.overallScore !== 88) {
      throw new Error(`Save analysis results failed: ${JSON.stringify(saveRes.body)}`);
    }
    console.log(`✅ AI Results Persisted: Score = ${saveRes.body.data.overallScore}/100, Risk = ${saveRes.body.data.injuryRiskClassification.riskStatus} (${saveRes.body.data.injuryRiskClassification.riskPercentage}%)`);

    // Verify Athlete aggregate performance score updated
    const updatedAthlete = await User.findById(athlete1._id);
    if (updatedAthlete.overallPerformanceScore !== 88 || updatedAthlete.totalAssessmentsCount !== 1) {
      throw new Error('Athlete profile was not synchronized with new assessment score!');
    }
    console.log(`✅ Athlete Profile Synchronized: overallPerformanceScore = ${updatedAthlete.overallPerformanceScore}, totalAssessments = ${updatedAthlete.totalAssessmentsCount}`);

    // 5. TEST CREATE SECOND ASSESSMENT & MARK FAILED (PATCH /api/assessments/:id/fail)
    console.log('\n[Test 5] Testing Failed Assessment Handling (PATCH /api/assessments/:id/fail)...');
    const create2Res = await makeRequest(
      server,
      'POST',
      '/api/assessments',
      { testType: 'sprint_acceleration' },
      athlete1Token
    );
    const assessment2 = create2Res.body.data;

    const failRes = await makeRequest(
      server,
      'PATCH',
      `/api/assessments/${assessment2._id}/fail`,
      {
        code: 'OCCLUSION_ERROR',
        message: 'Subject stepped outside bounding box during capture.',
        failedStep: 'tracker_inference'
      },
      athlete1Token
    );
    if (failRes.status !== 200 || failRes.body.data.status !== 'failed' || !failRes.body.data.errorDetails) {
      throw new Error(`Mark failed failed: ${JSON.stringify(failRes.body)}`);
    }
    console.log(`✅ Assessment 2 Marked as Failed: Error Code = ${failRes.body.data.errorDetails.code}, Message = "${failRes.body.data.errorDetails.message}"`);

    // 6. TEST RETRIEVE ATHLETE ASSESSMENT HISTORY (GET /api/assessments/history)
    console.log('\n[Test 6] Testing Retrieve Athlete Assessment History (GET /api/assessments/history)...');
    const historyRes = await makeRequest(server, 'GET', '/api/assessments/history', null, athlete1Token);
    if (historyRes.status !== 200 || historyRes.body.count !== 2) {
      throw new Error(`History retrieval failed: ${JSON.stringify(historyRes.body)}`);
    }
    console.log(`✅ History Retrieved: ${historyRes.body.count} assessments found for Athlete 1 in descending order.`);

    // 7. TEST RETRIEVE ATHLETE LATEST COMPLETED ASSESSMENT (GET /api/assessments/latest)
    console.log('\n[Test 7] Testing Retrieve Athlete Latest Completed Assessment (GET /api/assessments/latest)...');
    const latestRes = await makeRequest(server, 'GET', '/api/assessments/latest', null, athlete1Token);
    if (latestRes.status !== 200 || latestRes.body.data.assessmentCode !== assessment1.assessmentCode) {
      throw new Error(`Latest assessment retrieval failed: ${JSON.stringify(latestRes.body)}`);
    }
    console.log(`✅ Latest Completed Assessment: Code = ${latestRes.body.data.assessmentCode}, Score = ${latestRes.body.data.overallScore}`);

    // 8. TEST SECURITY & ACCESS CONTROL
    console.log('\n[Test 8] Testing Security & Unauthorized Access Controls...');
    // Athlete 2 trying to access Athlete 1's assessment
    const unauthAthleteRes = await makeRequest(server, 'GET', `/api/assessments/${assessment1._id}`, null, athlete2Token);
    if (unauthAthleteRes.status !== 403) {
      throw new Error(`Unauthorized athlete access was permitted! Status: ${unauthAthleteRes.status}`);
    }
    console.log(`✅ Unauthorized Athlete Access Blocked (403 Forbidden): "${unauthAthleteRes.body.message}"`);

    // Authorized Coach accessing Athlete 1's assessment
    const authCoachRes = await makeRequest(server, 'GET', `/api/assessments/${assessment1._id}`, null, coachToken);
    if (authCoachRes.status !== 200) {
      throw new Error(`Authorized coach was rejected! Status: ${authCoachRes.status}`);
    }
    console.log(`✅ Authorized Coach Access Granted (200 OK): Code = ${authCoachRes.body.data.assessmentCode}`);

    // Missing Assessment ID
    const fakeId = new mongoose.Types.ObjectId();
    const missingRes = await makeRequest(server, 'GET', `/api/assessments/${fakeId}`, null, athlete1Token);
    if (missingRes.status !== 404) {
      throw new Error(`Missing assessment did not return 404! Status: ${missingRes.status}`);
    }
    console.log(`✅ Missing Assessment correctly returned 404 Not Found: "${missingRes.body.message}"`);

    // Teardown
    server.close();
    await disconnectDB();
    await mongod.stop();

    console.log('\n🎉 ALL 8 ASSESSMENT API LIFECYCLE & SECURITY TESTS PASSED 100%!');
    console.log('===========================================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ ASSESSMENT API TEST FAILED:', error);
    if (server) server.close();
    if (mongod) await mongod.stop();
    process.exit(1);
  }
}

runAssessmentApiTests();
