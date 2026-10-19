const RedisMock = require('ioredis-mock');
const { MongoMemoryServer } = require('mongodb-memory-server');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { connectDB, disconnectDB } = require('./db');
const { setRedisClient, disconnectRedis } = require('./redis');
const RedisService = require('../services/redisService');

const User = require('../models/User');
const Assessment = require('../models/Assessment');
const athleteRoutes = require('../routes/athleteRoutes');
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

async function runRedisCachingTests() {
  console.log('================================================================');
  console.log('      TalentScope Phase 11: Redis Caching & Invalidation Suite  ');
  console.log('================================================================');

  let mongod;
  let server;
  let mockRedis;

  try {
    // 1. SETUP MONGO & IN-MEMORY REDIS
    console.log('\n[Setup] Initializing MongoDB and Redis Cache-Aside Layer...');
    mongod = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongod.getUri();
    process.env.JWT_SECRET = 'redis_caching_test_secret_phase11_2026';

    await connectDB(1, 1000);

    mockRedis = new RedisMock();
    setRedisClient(mockRedis);

    const app = express();
    app.use(express.json());
    app.use('/api/athletes', athleteRoutes);
    app.use('/api/assessments', assessmentRoutes);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    console.log(`[Test Server]: Running on http://127.0.0.1:${port}`);

    // Seed Athlete
    const athlete = await User.create({
      name: 'Felix Vanderwaal',
      phone: '+919876543901',
      password: 'Password123',
      role: 'athlete',
      primarySport: 'Sprinting',
      overallPerformanceScore: 85,
      regionalRank: 42
    });
    const token = jwt.sign({ id: athlete._id, role: 'athlete' }, process.env.JWT_SECRET);

    // Create Initial Assessment
    const assessment = await Assessment.create({
      assessmentCode: 'TS-942-AXL',
      athleteId: athlete._id,
      testType: 'unilateral_squat',
      status: 'completed',
      overallScore: 85,
      injuryRiskClassification: { riskStatus: 'Low', riskPercentage: 12 }
    });

    console.log('✅ Baseline Athlete & Assessment Created in MongoDB.');

    // 2. TEST CACHE MISS
    console.log('\n[Test 1] Testing Dashboard CACHE MISS (Cold Cache -> MongoDB Query)...');
    const res1 = await makeRequest(server, 'GET', '/api/athletes/dashboard', null, token);
    if (res1.status !== 200 || res1.body.cached !== false || res1.body.data.latestAssessment.overallScore !== 85) {
      throw new Error(`Cache miss test failed: ${JSON.stringify(res1.body)}`);
    }
    console.log(`✅ Cache Miss Handled: cached = false • Query routed to MongoDB • Stored in Redis with 300s TTL.`);

    // Verify key was populated in Redis
    const cacheKey = RedisService.getDashboardKey(athlete._id);
    const inRedis = await RedisService.get(cacheKey);
    if (!inRedis || inRedis.athlete.name !== 'Felix Vanderwaal') {
      throw new Error('Redis key was not populated on cache miss');
    }
    console.log(`✅ Redis Verification: Key "${cacheKey}" successfully populated.`);

    // 3. TEST CACHE HIT
    console.log('\n[Test 2] Testing Dashboard CACHE HIT (Hot Cache -> Instant Redis Response)...');
    const res2 = await makeRequest(server, 'GET', '/api/athletes/dashboard', null, token);
    if (res2.status !== 200 || res2.body.cached !== true || res2.body.data.latestAssessment.overallScore !== 85) {
      throw new Error(`Cache hit test failed: ${JSON.stringify(res2.body)}`);
    }
    console.log(`✅ Cache Hit Handled: cached = true • Served directly from Redis memory.`);

    // 4. TEST CACHE INVALIDATION ON WRITE (New Assessment Result Update)
    console.log('\n[Test 3] Testing Cache Invalidation on Assessment Result Update...');
    // Write new assessment score 93 to MongoDB
    const saveRes = await makeRequest(
      server,
      'PUT',
      `/api/assessments/${assessment._id}/results`,
      {
        overallScore: 93,
        injuryRiskClassification: { riskStatus: 'Low', riskPercentage: 8 }
      },
      token
    );
    if (saveRes.status !== 200 || saveRes.body.data.overallScore !== 93) {
      throw new Error(`Assessment update failed: ${JSON.stringify(saveRes.body)}`);
    }
    console.log(`✅ MongoDB Assessment updated to score 93 • Invalidation triggered on Redis.`);

    // Verify Redis cache key was purged
    const cacheAfterWrite = await RedisService.get(cacheKey);
    if (cacheAfterWrite !== null) {
      throw new Error('Cache was NOT invalidated after assessment result update!');
    }
    console.log(`✅ Redis Cache Invalidation Verified: Key "${cacheKey}" is purged (null).`);

    // 5. TEST RE-POPULATION AFTER INVALIDATION
    console.log('\n[Test 4] Testing Dashboard Re-population after Invalidation...');
    const res3 = await makeRequest(server, 'GET', '/api/athletes/dashboard', null, token);
    if (res3.status !== 200 || res3.body.cached !== false || res3.body.data.latestAssessment.overallScore !== 93) {
      throw new Error(`Re-population failed: ${JSON.stringify(res3.body)}`);
    }
    console.log(`✅ Fresh Cache Re-population: cached = false • Refreshed score = 93.`);

    // 6. TEST CACHE INVALIDATION ON PROFILE UPDATE
    console.log('\n[Test 5] Testing Cache Invalidation on Profile Update (PUT /api/athletes/profile)...');
    await makeRequest(server, 'PUT', '/api/athletes/profile', { affiliation: 'Olympic Sprint Team' }, token);
    const cacheAfterProfile = await RedisService.get(cacheKey);
    if (cacheAfterProfile !== null) {
      throw new Error('Cache was NOT invalidated after profile update!');
    }
    console.log('✅ Profile Update Invalidation Verified: Cache successfully purged on profile edit.');

    // 7. TEST TTL (Time-To-Live)
    console.log('\n[Test 6] Testing TTL Verification on Cached Keys...');
    await makeRequest(server, 'GET', '/api/athletes/dashboard', null, token);
    const ttl = await RedisService.ttl(cacheKey);
    if (ttl <= 0 || ttl > 300) {
      throw new Error(`Invalid TTL: ${ttl}`);
    }
    console.log(`✅ TTL Verified: Key "${cacheKey}" has ${ttl}s remaining before expiration.`);

    // 8. TEST FAULT TOLERANCE: REDIS OUTAGE FALLBACK
    console.log('\n[Test 7] Testing Redis OUTAGE Fallback (Simulating Redis Server Crash)...');
    setRedisClient(null); // Simulate sudden Redis disconnect

    const resOffline = await makeRequest(server, 'GET', '/api/athletes/dashboard', null, token);
    if (resOffline.status !== 200 || resOffline.body.cached !== false || resOffline.body.data.latestAssessment.overallScore !== 93) {
      throw new Error('API failed when Redis was offline');
    }
    console.log(`✅ Fault Tolerance Verified: API served MongoDB records seamlessly (cached: false) during Redis outage.`);

    // 9. VERIFY MONGODB REMAINS PERMANENT SOURCE OF TRUTH
    console.log('\n[Test 8] Verifying MongoDB Data Integrity...');
    const mongoAthlete = await User.findById(athlete._id);
    const mongoAssessment = await Assessment.findById(assessment._id);

    if (mongoAthlete.overallPerformanceScore !== 93 || mongoAssessment.overallScore !== 93) {
      throw new Error('MongoDB data inconsistency detected');
    }
    console.log(`✅ MongoDB Integrity Verified: Source of truth intact with score = ${mongoAthlete.overallPerformanceScore}.`);

    // Teardown
    server.close();
    await disconnectDB();
    await disconnectRedis();
    await mongod.stop();

    console.log('\n================================================================');
    console.log('🎉 ALL 8 REDIS CACHING & INVALIDATION TESTS PASSED 100%!');
    console.log('================================================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ REDIS CACHING TEST FAILED:', error);
    if (server) server.close();
    if (mongod) await mongod.stop();
    process.exit(1);
  }
}

runRedisCachingTests();
