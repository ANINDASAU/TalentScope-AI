const express = require('express');
const http = require('http');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('./db');

const authRoutes = require('../routes/authRoutes');
const athleteRoutes = require('../routes/athleteRoutes');

// Helper to make local HTTP requests to the test app
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
        path,
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

async function runAuthAthleteTests() {
  console.log('=====================================================');
  console.log('   TalentScope Phase 3: Auth & Athlete DB Test Suite ');
  console.log('=====================================================');

  let mongod;
  let server;

  try {
    mongod = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongod.getUri();
    process.env.JWT_SECRET = 'test_jwt_secret_phase_3_2026';

    await connectDB(1, 1000);

    // Setup Test Express Server
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/athletes', athleteRoutes);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    console.log(`[Test Server]: Running on http://127.0.0.1:${port}`);

    // TEST 1: Athlete Registration
    console.log('\n[Test 1] Testing Athlete Registration (POST /api/auth/register)...');
    const athletePayload = {
      name: 'Felix Vanderwaal',
      email: 'felix@talentscope.ai',
      phone: '+919876543210',
      password: 'StrongPassword123',
      role: 'athlete',
      age: 22,
      gender: 'male',
      weight: 74,
      height: 182,
      preferredSports: ['Athletics', 'Sprinting'],
      primarySport: 'Sprinting',
      specialization: 'Sprinting & Biometrics',
      affiliation: 'Elite Track Global'
    };

    const regRes = await makeRequest(server, 'POST', '/api/auth/register', athletePayload);
    if (regRes.status !== 201 || !regRes.body.token || !regRes.body.user) {
      throw new Error(`Registration failed: ${JSON.stringify(regRes.body)}`);
    }
    if (regRes.body.user.password) {
      throw new Error('SECURITY VIOLATION: Password hash returned in registration response!');
    }
    const token = regRes.body.token;
    console.log(`✅ Registration Success (201 Created) - Token received.`);
    console.log(`- Athlete Name: ${regRes.body.user.name}, Phone: ${regRes.body.user.phone}`);
    console.log(`- Password Omission Verified: ${regRes.body.user.password === undefined}`);

    // TEST 2: Duplicate Registration Prevention
    console.log('\n[Test 2] Testing Duplicate Registration Prevention...');
    const dupRes = await makeRequest(server, 'POST', '/api/auth/register', athletePayload);
    if (dupRes.status !== 400 || dupRes.body.success !== false) {
      throw new Error(`Duplicate registration was not blocked! Status: ${dupRes.status}`);
    }
    console.log(`✅ Duplicate Blocked (400 Bad Request): "${dupRes.body.message}"`);

    // TEST 3: Invalid Input Validation (Short password / missing phone)
    console.log('\n[Test 3] Testing Input Validation Failure Handling...');
    const invalidRes = await makeRequest(server, 'POST', '/api/auth/register', {
      name: 'Bad User',
      phone: '',
      password: '123' // too short
    });
    if (invalidRes.status !== 400 || !invalidRes.body.errors) {
      throw new Error(`Invalid input was not caught! Status: ${invalidRes.status}`);
    }
    console.log(`✅ Validation Errors Caught (400 Bad Request):`, invalidRes.body.errors);

    // TEST 4: Athlete Login
    console.log('\n[Test 4] Testing Athlete Login (POST /api/auth/login)...');
    const loginRes = await makeRequest(server, 'POST', '/api/auth/login', {
      phone: '+919876543210',
      password: 'StrongPassword123'
    });
    if (loginRes.status !== 200 || !loginRes.body.token) {
      throw new Error(`Login failed: ${JSON.stringify(loginRes.body)}`);
    }
    if (loginRes.body.user.password) {
      throw new Error('SECURITY VIOLATION: Password hash returned in login response!');
    }
    console.log(`✅ Login Success (200 OK) - Authenticated with phone.`);

    // TEST 5: Invalid Credentials Login
    console.log('\n[Test 5] Testing Invalid Credentials Login...');
    const badLoginRes = await makeRequest(server, 'POST', '/api/auth/login', {
      phone: '+919876543210',
      password: 'WrongPassword'
    });
    if (badLoginRes.status !== 401 || badLoginRes.body.success !== false) {
      throw new Error(`Invalid password was accepted! Status: ${badLoginRes.status}`);
    }
    console.log(`✅ Invalid Password Rejected (401 Unauthorized): "${badLoginRes.body.message}"`);

    // TEST 6: Profile Retrieval (Authenticated)
    console.log('\n[Test 6] Testing Profile Retrieval (GET /api/auth/profile)...');
    const profRes = await makeRequest(server, 'GET', '/api/auth/profile', null, token);
    if (profRes.status !== 200 || profRes.body.user.name !== 'Felix Vanderwaal') {
      throw new Error(`Profile retrieval failed: ${JSON.stringify(profRes.body)}`);
    }
    console.log(`✅ Profile Retrieved (200 OK): Name = "${profRes.body.user.name}", Sport = "${profRes.body.user.primarySport}"`);

    // TEST 7: Unauthorized Profile Access
    console.log('\n[Test 7] Testing Unauthorized Access without Token...');
    const unauthRes = await makeRequest(server, 'GET', '/api/auth/profile', null, null);
    if (unauthRes.status !== 401) {
      throw new Error(`Unauthorized request was allowed! Status: ${unauthRes.status}`);
    }
    console.log(`✅ Unauthorized Request Blocked (401 Unauthorized): "${unauthRes.body.message}"`);

    // TEST 8: Athlete Profile Update
    console.log('\n[Test 8] Testing Athlete Profile Update (PUT /api/athletes/profile)...');
    const updatePayload = {
      weight: 76.5,
      affiliation: 'National Olympic Track Team',
      settings: {
        darkMode: true,
        compactTelemetryView: true,
        injuryAlerts: true,
        sessionReminders: true
      }
    };
    const updateRes = await makeRequest(server, 'PUT', '/api/athletes/profile', updatePayload, token);
    if (updateRes.status !== 200 || updateRes.body.user.weight !== 76.5) {
      throw new Error(`Profile update failed: ${JSON.stringify(updateRes.body)}`);
    }
    console.log(`✅ Profile Updated (200 OK): New Weight = ${updateRes.body.user.weight}kg, Affiliation = "${updateRes.body.user.affiliation}"`);

    // TEST 9: Athlete Stats Retrieval
    console.log('\n[Test 9] Testing Athlete Dashboard Stats (GET /api/athletes/stats)...');
    const statsRes = await makeRequest(server, 'GET', '/api/athletes/stats', null, token);
    if (statsRes.status !== 200 || !statsRes.body.data.score) {
      throw new Error(`Athlete stats failed: ${JSON.stringify(statsRes.body)}`);
    }
    console.log(`✅ Dashboard Stats Retrieved (200 OK): Score = ${statsRes.body.data.score}, Rank = "${statsRes.body.data.rank}", Injury Risk = "${statsRes.body.data.injuryRisk}"`);

    // Teardown
    server.close();
    await disconnectDB();
    await mongod.stop();

    console.log('\n🎉 ALL 9 AUTH & ATHLETE DATABASE TESTS PASSED WITH 100% SUCCESS!');
    console.log('=====================================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ AUTH & ATHLETE TEST FAILED:', error);
    if (server) server.close();
    if (mongod) await mongod.stop();
    process.exit(1);
  }
}

runAuthAthleteTests();
