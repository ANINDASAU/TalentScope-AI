/**
 * Phase 6 BACKEND verification: duplicate-safe create API.
 * Runs against the REAL backend (localhost:5000) and counts documents in the
 * REAL MongoDB (localhost:27017, talentscope) via mongosh if available.
 *
 * Scenarios:
 *  1. same idempotencyKey twice (sequential)      -> ONE record, same _id both times
 *  2. same idempotencyKey x10 CONCURRENT          -> exactly ONE record
 *  3. no idempotencyKey (legacy client)           -> still creates (back-compat)
 *  4. same key, DIFFERENT athletes                -> both created (key scoped to athlete)
 *  5. direct Mongo count for the key              -> exactly 1
 */
const http = require('http');
const { execSync } = require('child_process');

const API = 'http://localhost:5000';
const PHONE = '+919999000011';
const PHONE2 = '+910000000102'; // second athlete (from seed data)
const PASS = 'secret123';

const req = (method, path, body, token) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const r = http.request(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
    }
  }, res => {
    let buf = '';
    res.on('data', c => buf += c);
    res.on('end', () => {
      try { resolve({ status: res.statusCode, json: JSON.parse(buf || '{}') }); }
      catch { resolve({ status: res.statusCode, json: {} }); }
    });
  });
  r.on('error', reject);
  if (data) r.write(data);
  r.end();
});

const login = async (phone) => {
  const r = await req('POST', '/api/auth/login', { phone, password: PASS });
  return r.json.token;
};

let passed = 0, failed = 0;
const results = [];
const check = (name, cond) => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`); cond ? passed++ : failed++; };
const key = () => `test-dupe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Direct MongoDB count via mongosh (optional; reports N/A if unavailable)
const mongoCount = (idemKey) => {
  try {
    const out = execSync(
      `mongosh --quiet --eval "db.assessments.countDocuments({idempotencyKey: '${idemKey}'})" talentscope`,
      { timeout: 20000, encoding: 'utf8' }
    ).trim();
    const n = parseInt(out, 10);
    return Number.isNaN(n) ? null : n;
  } catch { return null; }
};

(async () => {
  const token = await login(PHONE);
  check('login works', !!token);
  const token2 = await login(PHONE2).catch(() => null);

  /* 1. sequential replay: same key twice -> same record */
  const k1 = key();
  const r1a = await req('POST', '/api/assessments', { sport: 'Athletics', testType: 'unilateral_squat', idempotencyKey: k1 }, token);
  const r1b = await req('POST', '/api/assessments', { sport: 'Athletics', testType: 'unilateral_squat', idempotencyKey: k1 }, token);
  check('1a. first create -> 201', r1a.status === 201 && r1b.status !== undefined);
  check('1b. replay returns EXISTING record (200, same _id)',
    r1b.status === 200 && r1b.json?.data?._id === r1a.json?.data?._id);

  /* 2. concurrent x10 -> exactly one record */
  const k2 = key();
  const rs = await Promise.all(Array.from({ length: 10 }, () =>
    req('POST', '/api/assessments', { sport: 'Tennis', testType: 'sprint_acceleration', idempotencyKey: k2 }, token)));
  const ids = new Set(rs.map(r => r.json?.data?._id).filter(Boolean));
  check('2a. 10 concurrent creates -> all resolved to the SAME record', ids.size === 1);
  const all2xx = rs.every(r => [200, 201].includes(r.status));
  check('2b. every request succeeded (200 replay or 201 create)', all2xx);

  /* 3. legacy no-key still creates */
  const r3a = await req('POST', '/api/assessments', { sport: 'Athletics', testType: 'posture_alignment' }, token);
  const r3b = await req('POST', '/api/assessments', { sport: 'Athletics', testType: 'posture_alignment' }, token);
  check('3. no-key requests are NOT deduped (back-compat, distinct records)',
    r3a.status === 201 && r3b.status === 201 && r3a.json?.data?._id !== r3b.json?.data?._id);

  /* 4. same key different athletes -> both created (athlete-scoped) */
  const k4 = key();
  const r4a = await req('POST', '/api/assessments', { sport: 'Cricket', testType: 'agility_t_drill', idempotencyKey: k4 }, token);
  if (token2) {
    const r4b = await req('POST', '/api/assessments', { sport: 'Cricket', testType: 'agility_t_drill', idempotencyKey: k4 }, token2);
    check('4. same key, different athletes -> BOTH created (athlete-scoped dedup)',
      r4a.status === 201 && r4b.status === 201);
  } else {
    console.log('4. second athlete unavailable — skipped (N/A)');
  }

  /* 5. direct MongoDB counts */
  const c1 = mongoCount(k1);
  const c2 = mongoCount(k2);
  if (c1 === null || c2 === null) {
    console.log('5. mongosh unavailable — Mongo count check N/A (verified via API instead)');
    const h = await req('GET', '/api/assessments/history', null, token);
    const k1Count = h.json?.data?.filter(a => a.idempotencyKey === k1).length;
    const k2Count = h.json?.data?.filter(a => a.idempotencyKey === k2).length;
    check('5-api. history contains EXACTLY ONE record for k1', k1Count === 1);
    check('5-api. history contains EXACTLY ONE record for k2', k2Count === 1);
  } else {
    check('5-mongo. Mongo count(k1) === 1', c1 === 1);
    check('5-mongo. Mongo count(k2) === 1', c2 === 1);
  }

  console.log('\n=== Phase 6: Backend duplicate-prevention - verification ===');
  results.forEach(r => console.log(r));
  console.log(`---\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
  results.push('CRASH ' + (e?.stack || e).toString().split('\n').slice(0, 4).join(' | '));
  console.log('\n=== Phase 6: Backend duplicate-prevention - verification ===');
  results.forEach(r => console.log(r));
  console.log(`---\n${passed} passed, ${failed} failed`);
  process.exit(1);
});
