const RedisMock = require('ioredis-mock');
const { MongoMemoryServer } = require('mongodb-memory-server');
const http = require('http');
const express = require('express');
const { connectDB, disconnectDB } = require('./db');
const { setRedisClient, disconnectRedis } = require('./redis');
const RedisService = require('../services/redisService');
const User = require('../models/User');
const athleteRoutes = require('../routes/athleteRoutes');
const jwt = require('jsonwebtoken');

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

async function runRedisSetupTests() {
  console.log('================================================================');
  console.log('         TalentScope Phase 10: Redis Setup & Fallback Suite     ');
  console.log('================================================================');

  let mongod;
  let server;

  try {
    // 1. SETUP IN-MEMORY REDIS CLIENT
    console.log('\n[Step 1] Initializing In-Memory Redis Engine...');
    const mockRedis = new RedisMock();
    setRedisClient(mockRedis);
    console.log('✅ Redis Client Connected & Ready.');

    // 2. TEST SET OPERATION
    console.log('\n[Step 2] Testing Redis SET operation (Strings and Complex JSON)...');
    const athleteCacheSample = {
      id: 'ath-942',
      name: 'Felix Vanderwaal',
      overallScore: 88,
      tier: 'Elite Pro'
    };

    const setStr = await RedisService.set('test:string_key', 'TalentScope BioKinematics v2', 60);
    const setObj = await RedisService.set('athlete:profile:ath-942', athleteCacheSample, 120);

    if (!setStr || !setObj) {
      throw new Error('Redis set operation returned false');
    }
    console.log('✅ Stored string and complex athlete JSON object in Redis.');

    // 3. TEST GET OPERATION
    console.log('\n[Step 3] Testing Redis GET operation & JSON Deserialization...');
    const retrievedStr = await RedisService.get('test:string_key');
    const retrievedObj = await RedisService.get('athlete:profile:ath-942');

    if (retrievedStr !== 'TalentScope BioKinematics v2') {
      throw new Error(`Expected string match, got ${retrievedStr}`);
    }
    if (!retrievedObj || retrievedObj.name !== 'Felix Vanderwaal' || retrievedObj.overallScore !== 88) {
      throw new Error(`Expected object match, got ${JSON.stringify(retrievedObj)}`);
    }
    console.log(`✅ Retrieved & Parsed: "${retrievedObj.name}" • Score: ${retrievedObj.overallScore} • Tier: "${retrievedObj.tier}"`);

    // 4. TEST TTL SUPPORT
    console.log('\n[Step 4] Testing TTL (Time-To-Live) support...');
    await RedisService.set('temp:short_lived_token', 'temp-session-token', 10);
    const remainingTtl = await RedisService.ttl('temp:short_lived_token');

    if (remainingTtl <= 0 || remainingTtl > 10) {
      throw new Error(`Invalid TTL returned: ${remainingTtl}`);
    }
    console.log(`✅ TTL Verified: Key has ${remainingTtl}s remaining expiration.`);

    // 5. TEST DELETE & PATTERN DELETE
    console.log('\n[Step 5] Testing DELETE and Pattern Invalidation (delByPattern)...');
    await RedisService.set('athlete:telemetry:1', { sample: 1 }, 60);
    await RedisService.set('athlete:telemetry:2', { sample: 2 }, 60);

    const delSingle = await RedisService.del('test:string_key');
    const getAfterDel = await RedisService.get('test:string_key');
    if (!delSingle || getAfterDel !== null) {
      throw new Error('Single key deletion failed');
    }
    console.log('✅ Single key deleted successfully.');

    await RedisService.delByPattern('athlete:telemetry:*');
    const item1 = await RedisService.get('athlete:telemetry:1');
    const item2 = await RedisService.get('athlete:telemetry:2');
    if (item1 !== null || item2 !== null) {
      throw new Error('Pattern invalidation failed');
    }
    console.log('✅ Pattern matching invalidation cleared all matching keys.');

    // 6. TEST REDIS UNAVAILABLE FALLBACK (Fault Tolerance)
    console.log('\n[Step 6] Testing Redis UNAVAILABLE Fallback (Client = null)...');
    setRedisClient(null); // Simulate total Redis outage

    const fallbackGet = await RedisService.get('any:key');
    const fallbackSet = await RedisService.set('any:key', { test: true }, 60);
    const fallbackDel = await RedisService.del('any:key');

    if (fallbackGet !== null || fallbackSet !== false || fallbackDel !== false) {
      throw new Error('Fallback operations did not return expected safe defaults');
    }
    console.log('✅ Redis Outage Handled: get() returned null, set() returned false without throwing errors.');

    // 7. TEST BACKEND STARTUP & API FUNCTIONALITY WITHOUT REDIS
    console.log('\n[Step 7] Testing Backend Startup & MongoDB Execution with Redis Offline...');
    mongod = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongod.getUri();
    process.env.JWT_SECRET = 'redis_fallback_jwt_secret_2026';
    process.env.REDIS_ENABLED = 'false'; // Explicitly disable Redis

    await connectDB(1, 1000);

    const app = express();
    app.use(express.json());
    app.use('/api/athletes', athleteRoutes);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    const athlete = await User.create({
      name: 'Resilient Athlete',
      phone: '+919876543801',
      password: 'Password123',
      role: 'athlete',
      overallPerformanceScore: 91
    });
    const token = jwt.sign({ id: athlete._id, role: 'athlete' }, process.env.JWT_SECRET);

    // Call Athlete Dashboard endpoint while Redis is completely disabled
    const dashRes = await makeRequest(server, 'GET', '/api/athletes/dashboard', null, token);
    if (dashRes.status !== 200 || dashRes.body.data.athlete.name !== 'Resilient Athlete') {
      throw new Error('Backend failed to serve MongoDB request when Redis was offline');
    }
    console.log(`✅ Backend operates seamlessly with MongoDB as sole source of truth (Status: ${dashRes.status}, Athlete: "${dashRes.body.data.athlete.name}")`);

    // Teardown
    server.close();
    await disconnectDB();
    await disconnectRedis();
    await mongod.stop();

    console.log('\n================================================================');
    console.log('🎉 ALL 7 REDIS SETUP & FAULT-TOLERANCE TESTS PASSED 100%!');
    console.log('================================================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ REDIS SETUP TEST FAILED:', error);
    if (server) server.close();
    if (mongod) await mongod.stop();
    process.exit(1);
  }
}

runRedisSetupTests();
