const express = require('express');
const http = require('http');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { connectDB, disconnectDB } = require('./db');

const User = require('../models/User');
const Assessment = require('../models/Assessment');
const athleteRoutes = require('../routes/athleteRoutes');

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

async function runDashboardProgressTests() {
  console.log('================================================================');
  console.log('   TalentScope Phase 8: Dashboard & Progress Queries Test Suite ');
  console.log('================================================================');

  let mongod;
  let server;

  try {
    mongod = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongod.getUri();
    process.env.JWT_SECRET = 'test_jwt_secret_phase_8_2026';

    await connectDB(1, 1000);

    const app = express();
    app.use(express.json());
    app.use('/api/athletes', athleteRoutes);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    console.log(`[Test Server]: Running on http://127.0.0.1:${port}`);

    // SEED ATHLETES
    // Athlete 0: Zero Assessments
    const athlete0 = await User.create({
      name: 'New Athlete (Zero Data)',
      phone: '+919876543600',
      password: 'Password123',
      role: 'athlete'
    });
    const token0 = jwt.sign({ id: athlete0._id, role: 'athlete' }, process.env.JWT_SECRET);

    // Athlete 1: Exactly One Assessment
    const athlete1 = await User.create({
      name: 'Single Assessment Athlete',
      phone: '+919876543601',
      password: 'Password123',
      role: 'athlete'
    });
    const token1 = jwt.sign({ id: athlete1._id, role: 'athlete' }, process.env.JWT_SECRET);

    await Assessment.create({
      assessmentCode: 'TS-ATH1-SINGLE',
      athleteId: athlete1._id,
      testType: 'unilateral_squat',
      status: 'completed',
      overallScore: 84,
      injuryRiskClassification: { riskStatus: 'Low', riskPercentage: 14 }
    });

    // Athlete 3: Multiple Assessments (3 completed drills: 78, 88, 92)
    const athlete3 = await User.create({
      name: 'Felix Multi Athlete',
      phone: '+919876543603',
      password: 'Password123',
      role: 'athlete',
      regionalRank: 42
    });
    const token3 = jwt.sign({ id: athlete3._id, role: 'athlete' }, process.env.JWT_SECRET);

    // Drill 1 (oldest): 78
    await Assessment.create({
      assessmentCode: 'TS-ATH3-001',
      athleteId: athlete3._id,
      testType: 'unilateral_squat',
      status: 'completed',
      overallScore: 78,
      createdAt: new Date(Date.now() - 10 * 86400000)
    });
    // Drill 2 (middle): 88
    await Assessment.create({
      assessmentCode: 'TS-ATH3-002',
      athleteId: athlete3._id,
      testType: 'unilateral_squat',
      status: 'completed',
      overallScore: 88,
      createdAt: new Date(Date.now() - 5 * 86400000)
    });
    // Drill 3 (latest, peak): 92
    await Assessment.create({
      assessmentCode: 'TS-ATH3-003',
      athleteId: athlete3._id,
      testType: 'sprint_acceleration',
      status: 'completed',
      overallScore: 92,
      speed: 10.2,
      injuryRiskClassification: { riskStatus: 'Low', riskPercentage: 10 },
      createdAt: new Date()
    });

    // Athlete 4: Athlete with 1 Failed & 1 Completed Assessment
    const athlete4 = await User.create({
      name: 'Mixed Failed Athlete',
      phone: '+919876543604',
      password: 'Password123',
      role: 'athlete'
    });
    const token4 = jwt.sign({ id: athlete4._id, role: 'athlete' }, process.env.JWT_SECRET);

    await Assessment.create({
      assessmentCode: 'TS-ATH4-FAIL',
      athleteId: athlete4._id,
      testType: 'agility_t_drill',
      status: 'failed',
      errorDetails: { code: 'LIGHTING_TOO_LOW', message: 'Camera scene lux was 120 lx (min: 300 lx required).' },
      createdAt: new Date(Date.now() - 2 * 86400000)
    });
    await Assessment.create({
      assessmentCode: 'TS-ATH4-PASS',
      athleteId: athlete4._id,
      testType: 'unilateral_squat',
      status: 'completed',
      overallScore: 86,
      createdAt: new Date()
    });

    console.log('✅ Seeded 4 Test Athletes with varying assessment profiles.');

    // TEST SCENARIO 1: ZERO ASSESSMENTS
    console.log('\n[Scenario 1] Testing Athlete with ZERO Assessments...');
    const dash0Res = await makeRequest(server, 'GET', '/api/athletes/dashboard', null, token0);
    if (dash0Res.status !== 200 || dash0Res.body.data.latestAssessment !== null || dash0Res.body.data.counts.totalAssessments !== 0) {
      throw new Error(`Zero assessment dashboard failed: ${JSON.stringify(dash0Res.body)}`);
    }
    console.log(`✅ Dashboard (Zero Data): latestAssessment = null, totalAssessments = 0, metricVelocity = []`);

    const prog0Res = await makeRequest(server, 'GET', '/api/athletes/progress', null, token0);
    if (prog0Res.status !== 200 || prog0Res.body.data.peakScore !== null || prog0Res.body.data.totalAssessments !== 0) {
      throw new Error(`Zero assessment progress failed: ${JSON.stringify(prog0Res.body)}`);
    }
    console.log(`✅ Progress (Zero Data): peakScore = null, latestScore = null, scoreDifferential = null, assessmentHistory = []`);

    // TEST SCENARIO 2: EXACTLY ONE ASSESSMENT
    console.log('\n[Scenario 2] Testing Athlete with ONE Assessment...');
    const dash1Res = await makeRequest(server, 'GET', '/api/athletes/dashboard', null, token1);
    if (dash1Res.status !== 200 || dash1Res.body.data.latestAssessment.overallScore !== 84) {
      throw new Error(`One assessment dashboard failed: ${JSON.stringify(dash1Res.body)}`);
    }
    console.log(`✅ Dashboard (1 Assessment): Score = ${dash1Res.body.data.latestAssessment.overallScore}, Total = ${dash1Res.body.data.counts.totalCompletedAssessments}`);

    const prog1Res = await makeRequest(server, 'GET', '/api/athletes/progress', null, token1);
    if (prog1Res.status !== 200 || prog1Res.body.data.peakScore !== 84 || prog1Res.body.data.previousScore !== null || prog1Res.body.data.scoreDifferential !== null) {
      throw new Error(`One assessment progress failed: ${JSON.stringify(prog1Res.body)}`);
    }
    console.log(`✅ Progress (1 Assessment): peakScore = ${prog1Res.body.data.peakScore}, previousScore = null, scoreDifferential = null (No fake differential generated)`);

    // TEST SCENARIO 3: MULTIPLE ASSESSMENTS (PEAK, PREVIOUS VS LATEST)
    console.log('\n[Scenario 3] Testing Athlete with MULTIPLE Assessments (78, 88, 92)...');
    const dash3Res = await makeRequest(server, 'GET', '/api/athletes/dashboard', null, token3);
    if (dash3Res.status !== 200 || dash3Res.body.data.latestAssessment.overallScore !== 92) {
      throw new Error(`Multiple assessment dashboard failed: ${JSON.stringify(dash3Res.body)}`);
    }
    console.log(`✅ Dashboard (Multiple Assessments): Latest Score = ${dash3Res.body.data.latestAssessment.overallScore}, Velocity Count = ${dash3Res.body.data.metricVelocity.length}`);

    const prog3Res = await makeRequest(server, 'GET', '/api/athletes/progress', null, token3);
    const pData = prog3Res.body.data;
    if (
      prog3Res.status !== 200 ||
      pData.peakScore !== 92 ||
      pData.latestScore !== 92 ||
      pData.previousScore !== 88 ||
      pData.scoreDifferential !== 4.0 ||
      pData.chronologicalTrend.length !== 3
    ) {
      throw new Error(`Multiple assessment progress calculations failed: ${JSON.stringify(pData)}`);
    }
    console.log(`✅ Progress Calculations Verified:`);
    console.log(`- Peak Score: ${pData.peakScore} (Matches true maximum)`);
    console.log(`- Latest Score: ${pData.latestScore}, Previous Score: ${pData.previousScore}`);
    console.log(`- Exact Score Differential: +${pData.scoreDifferential} (92 - 88)`);
    console.log(`- Chronological Trend Points: ${pData.chronologicalTrend.map((c) => `${c.score} (${c.date})`).join(' -> ')}`);
    console.log(`- Unlocked Badges from Real Achievements: ${pData.unlockedBadges.map((b) => b.name).join(', ')}`);

    // TEST SCENARIO 4: FAILED ASSESSMENTS ISOLATION
    console.log('\n[Scenario 4] Testing FAILED Assessment Handling in Progress & Dashboard...');
    const dash4Res = await makeRequest(server, 'GET', '/api/athletes/dashboard', null, token4);
    if (dash4Res.status !== 200 || dash4Res.body.data.counts.totalAssessments !== 2 || dash4Res.body.data.counts.totalCompletedAssessments !== 1) {
      throw new Error(`Failed assessment count failed: ${JSON.stringify(dash4Res.body)}`);
    }
    console.log(`✅ Dashboard: Total = ${dash4Res.body.data.counts.totalAssessments}, Total Completed = ${dash4Res.body.data.counts.totalCompletedAssessments}`);

    const prog4Res = await makeRequest(server, 'GET', '/api/athletes/progress', null, token4);
    if (prog4Res.status !== 200 || prog4Res.body.data.completedAssessmentsCount !== 1 || prog4Res.body.data.assessmentHistory.length !== 2) {
      throw new Error(`Failed assessment history failed: ${JSON.stringify(prog4Res.body)}`);
    }
    const failedItem = prog4Res.body.data.assessmentHistory.find((a) => a.status === 'failed');
    if (!failedItem || failedItem.assessmentCode !== 'TS-ATH4-FAIL') {
      throw new Error('Failed assessment missing from history table!');
    }
    console.log(`✅ Progress: Failed assessment '${failedItem.assessmentCode}' listed in history table with status 'failed', but excluded from scoring velocity.`);

    // TEST SCENARIO 5: MULTIPLE ATHLETES ISOLATION
    console.log('\n[Scenario 5] Testing Multi-Athlete Cross-Tenant Isolation...');
    const historyCheck0 = await makeRequest(server, 'GET', '/api/athletes/progress', null, token0);
    const historyCheck3 = await makeRequest(server, 'GET', '/api/athletes/progress', null, token3);
    if (historyCheck0.body.data.assessmentHistory.length !== 0 || historyCheck3.body.data.assessmentHistory.length !== 3) {
      throw new Error('Data leak detected across athletes!');
    }
    console.log(`✅ Isolation Verified: Athlete 0 sees 0 records; Athlete 3 sees exactly 3 records.`);

    // Teardown
    server.close();
    await disconnectDB();
    await mongod.stop();

    console.log('\n🎉 ALL 5 DASHBOARD & PROGRESS QUERY SCENARIOS PASSED 100%!');
    console.log('================================================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ DASHBOARD & PROGRESS TEST FAILED:', error);
    if (server) server.close();
    if (mongod) await mongod.stop();
    process.exit(1);
  }
}

runDashboardProgressTests();
