const express = require('express');
const http = require('http');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { connectDB, disconnectDB } = require('./db');

const User = require('../models/User');
const Coach = require('../models/Coach');
const Assessment = require('../models/Assessment');
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

async function runCoachDbTests() {
  console.log('===========================================================');
  console.log('   TalentScope Phase 5: Coach Database & Access Test Suite ');
  console.log('===========================================================');

  let mongod;
  let server;

  try {
    mongod = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongod.getUri();
    process.env.JWT_SECRET = 'test_jwt_secret_coach_phase_5_2026';

    await connectDB(1, 1000);

    const app = express();
    app.use(express.json());
    app.use('/api/coaches', coachRoutes);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    console.log(`[Test Server]: Running on http://127.0.0.1:${port}`);

    // SETUP: Seed Coach 1 (Dr. Marcus Vance), Coach 2 (Elena Rostova), Athlete 1 (Authorized), Athlete 2 (Unauthorized)
    console.log('\n[Setup] Seeding test coaches and athletes in MongoDB...');
    const coach1User = await User.create({
      name: 'Dr. Marcus Vance',
      phone: '+919876543301',
      password: 'Password123',
      role: 'coach'
    });

    const coach1 = await Coach.create({
      userId: coach1User._id,
      name: coach1User.name,
      title: 'Olympic Biomechanics & Sprint Specialist',
      rating: 4.95,
      reviewsCount: 48,
      hourlyRate: '$120/hr',
      verified: true,
      specialties: ['Sprint Mechanics', 'Force Plate Analysis', 'ACL Rehab'],
      bio: 'Olympic track biomechanist specializing in high-speed camera joint angle analysis.',
      credentials: ['Ph.D. Biomechanics (Stanford)', 'CSCS', 'EXOS Specialist']
    });

    const coach2User = await User.create({
      name: 'Elena Rostova',
      phone: '+919876543302',
      password: 'Password123',
      role: 'coach'
    });

    const coach2 = await Coach.create({
      userId: coach2User._id,
      name: coach2User.name,
      title: 'Functional Movement & Joint Rehab Coach',
      rating: 4.88,
      reviewsCount: 32,
      hourlyRate: '$90/hr',
      verified: true,
      specialties: ['Postural Correction', 'Flexibility', 'Plyometrics'],
      bio: 'Specialist in asymmetric load prevention and core kinetic linkage.'
    });

    const athlete1 = await User.create({
      name: 'Felix Vanderwaal',
      phone: '+919876543303',
      password: 'Password123',
      role: 'athlete'
    });

    const athlete2 = await User.create({
      name: 'Private Athlete',
      phone: '+919876543304',
      password: 'Password123',
      role: 'athlete'
    });

    // Create an assessment for Athlete 1 and Athlete 2
    await Assessment.create({
      assessmentCode: 'TS-ATH1-001',
      athleteId: athlete1._id,
      testType: 'sprint_acceleration',
      overallScore: 92
    });

    await Assessment.create({
      assessmentCode: 'TS-ATH2-001',
      athleteId: athlete2._id,
      testType: 'unilateral_squat',
      overallScore: 78
    });

    const coach1Token = jwt.sign({ id: coach1User._id, role: 'coach' }, process.env.JWT_SECRET);
    console.log(`✅ Seeded 2 Coaches and 2 Athletes.`);

    // TEST 1: Coach Retrieval (GET /api/coaches)
    console.log('\n[Test 1] Testing Coach Retrieval (GET /api/coaches)...');
    const getRes = await makeRequest(server, 'GET', '/api/coaches');
    if (getRes.status !== 200 || getRes.body.count !== 2) {
      throw new Error(`Coach retrieval failed: ${JSON.stringify(getRes.body)}`);
    }
    console.log(`✅ Retrieved ${getRes.body.count} coaches from MongoDB.`);

    // TEST 2: Coach Profile by ID (GET /api/coaches/:id)
    console.log('\n[Test 2] Testing Coach Profile Retrieval (GET /api/coaches/:id)...');
    const profRes = await makeRequest(server, 'GET', `/api/coaches/${coach1._id}`);
    if (profRes.status !== 200 || profRes.body.data.name !== 'Dr. Marcus Vance') {
      throw new Error(`Coach profile failed: ${JSON.stringify(profRes.body)}`);
    }
    console.log(`✅ Retrieved Coach: "${profRes.body.data.name}" • Rating: ${profRes.body.data.rating} • Specialties: ${profRes.body.data.specialties.join(', ')}`);

    // TEST 3: Coach Search & Filter
    console.log('\n[Test 3] Testing Search & Specialty Filters...');
    const searchRes = await makeRequest(server, 'GET', '/api/coaches?search=Elena');
    if (searchRes.status !== 200 || searchRes.body.count !== 1 || searchRes.body.data[0].name !== 'Elena Rostova') {
      throw new Error(`Search filter failed: ${JSON.stringify(searchRes.body)}`);
    }
    console.log(`✅ Search by keyword 'Elena' returned exact match: "${searchRes.body.data[0].name}"`);

    const filterRes = await makeRequest(server, 'GET', '/api/coaches?specialty=Sprint Mechanics');
    if (filterRes.status !== 200 || filterRes.body.count !== 1 || filterRes.body.data[0].name !== 'Dr. Marcus Vance') {
      throw new Error(`Specialty filter failed: ${JSON.stringify(filterRes.body)}`);
    }
    console.log(`✅ Specialty filter 'Sprint Mechanics' returned exact match: "${filterRes.body.data[0].name}"`);

    // TEST 4: Missing Coach (404 Handling)
    console.log('\n[Test 4] Testing Missing Coach Request (GET /api/coaches/nonexistent_id)...');
    const fakeCoachId = new mongoose.Types.ObjectId();
    const missingRes = await makeRequest(server, 'GET', `/api/coaches/${fakeCoachId}`);
    if (missingRes.status !== 404 || missingRes.body.success !== false) {
      throw new Error(`Missing coach did not return 404! Status: ${missingRes.status}`);
    }
    console.log(`✅ Missing Coach correctly returned 404 Not Found: "${missingRes.body.message}"`);

    // TEST 5: Unauthorized Athlete Access (Coach 1 trying to access unassigned Athlete 2)
    console.log('\n[Test 5] Testing Unauthorized Athlete Access (Coach 1 trying to view unassigned Athlete 2)...');
    const unauthAccessRes = await makeRequest(
      server,
      'GET',
      `/api/coaches/${coach1._id}/athletes/${athlete2._id}/assessments`,
      null,
      coach1Token
    );
    if (unauthAccessRes.status !== 403 || unauthAccessRes.body.success !== false) {
      throw new Error(`Unauthorized coach access was permitted! Status: ${unauthAccessRes.status}`);
    }
    console.log(`✅ Unauthorized Access Blocked (403 Forbidden): "${unauthAccessRes.body.message}"`);

    // TEST 6: Authorized Athlete Access (Authorizing Athlete 1, then Coach 1 retrieving records)
    console.log('\n[Test 6] Testing Authorized Athlete Access...');
    // Authorize Athlete 1 for Coach 1
    const authAthleteRes = await makeRequest(
      server,
      'POST',
      `/api/coaches/${coach1._id}/authorize-athlete`,
      { athleteId: athlete1._id },
      coach1Token
    );
    if (authAthleteRes.status !== 200 || authAthleteRes.body.success !== true) {
      throw new Error(`Athlete authorization failed: ${JSON.stringify(authAthleteRes.body)}`);
    }
    console.log(`✅ Athlete 1 authorized: "${authAthleteRes.body.message}"`);

    // Retrieve Athlete 1's assessments as Coach 1
    const authRecordRes = await makeRequest(
      server,
      'GET',
      `/api/coaches/${coach1._id}/athletes/${athlete1._id}/assessments`,
      null,
      coach1Token
    );
    if (authRecordRes.status !== 200 || authRecordRes.body.count !== 1) {
      throw new Error(`Authorized assessment retrieval failed: ${JSON.stringify(authRecordRes.body)}`);
    }
    console.log(`✅ Authorized Coach successfully retrieved ${authRecordRes.body.count} assessment(s) for Athlete '${athlete1.name}': Code = ${authRecordRes.body.data[0].assessmentCode}, Score = ${authRecordRes.body.data[0].overallScore}`);

    // Teardown
    server.close();
    await disconnectDB();
    await mongod.stop();

    console.log('\n🎉 ALL 6 COACH DATABASE & ACCESS CONTROL TESTS PASSED 100%!');
    console.log('===========================================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ COACH DB TEST FAILED:', error);
    if (server) server.close();
    if (mongod) await mongod.stop();
    process.exit(1);
  }
}

runCoachDbTests();
