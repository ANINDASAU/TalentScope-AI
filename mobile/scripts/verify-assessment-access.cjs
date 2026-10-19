/**
 * STEP 7 backend verification: assessment access control (live backend + MongoDB).
 *   - owner reads own assessment -> 200
 *   - second athlete reads another's -> 403 (athletes isolated)
 *   - mutation of another's assessment -> 403 (no write-through)
 *   - unknown ID / unknown code -> 404 (invalid ID handled)
 *   - no token -> 401 (unauthorized handled)
 *   - history/latest scoped per athlete (no cross-athlete leakage)
 * Does not mutate the primary test athlete's data: the denied mutation is
 * attempted by athlete2 (rejected before any write).
 */
const API = 'http://localhost:5000/api';
const results = [];
let passed = 0, failed = 0;
const check = (name, cond) => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`); cond ? passed++ : failed++; };
const req = async (method, path, token, body) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, json };
};

(async () => {
  try {
    // primary athlete (existing seed user)
    const login1 = await req('POST', '/auth/login', null, { phone: '+919999000011', password: 'secret123' });
    check('setup: athlete1 login works', login1.status === 200 && !!login1.json?.token);
    const t1 = login1.json?.token;

    // second athlete (isolated principal)
    const phone2 = `+91999900${String(Date.now()).slice(-4)}`;
    const reg2 = await req('POST', '/auth/register', null, { name: 'Step7 Probe', phone: phone2, password: 'secret123' });
    check('setup: athlete2 registered', reg2.status === 201 && !!reg2.json?.token);
    const t2 = reg2.json?.token;

    // athlete1 creates a private assessment
    const key = `step7-access-${Date.now()}`;
    const created = await req('POST', '/assessments', t1, { testType: 'unilateral_squat', idempotencyKey: key });
    check('setup: athlete1 probe created', (created.status === 201 || created.status === 200) && !!created.json?.data?._id);
    const id = created.json?.data?._id;
    const code = created.json?.data?.assessmentCode;

    // owner read
    const own = await req('GET', `/assessments/${id}`, t1);
    check('A1. owner reads own assessment -> 200, same record', own.status === 200 && own.json?.data?._id === id);

    // cross-athlete read denied
    const cross = await req('GET', `/assessments/${id}`, t2);
    check('A2. athlete2 reads athlete1 assessment -> 403', cross.status === 403);

    // cross-athlete read by code denied too
    const crossCode = await req('GET', `/assessments/${code}`, t2);
    check('A3. athlete2 reads by assessment code -> 403', crossCode.status === 403);

    // cross-athlete mutation denied (rejected before any write)
    const crossPut = await req('PUT', `/assessments/${id}/results`, t2, { overallScore: 1 });
    check('A4. athlete2 writes results to athlete1 assessment -> 403', crossPut.status === 403);
    const crossComplete = await req('PATCH', `/assessments/${id}/complete`, t2);
    check('A5. athlete2 completes athlete1 assessment -> 403', crossComplete.status === 403);

    // invalid / unknown IDs
    const badId = await req('GET', '/assessments/000000000000000000000000', t1);
    check('A6. unknown ObjectId -> 404', badId.status === 404);
    const badCode = await req('GET', '/assessments/TS-000-ZZZZ', t1);
    check('A7. unknown assessment code -> 404', badCode.status === 404);

    // unauthenticated
    const noAuth = await req('GET', `/assessments/${id}`, null);
    check('A8. no token -> 401', noAuth.status === 401);
    const noAuthHist = await req('GET', '/assessments/history', null);
    check('A9. no token on history -> 401', noAuthHist.status === 401);

    // scoping: athlete2 sees none of athlete1's records
    const hist2 = await req('GET', '/assessments/history', t2);
    const leaked = (hist2.json?.data || []).some(a => String(a.athleteId) !== String(hist2.json?.data?.[0]?.athleteId) || [id, key].includes(String(a._id)) || a.idempotencyKey === key);
    check('A10. athlete2 history contains zero athlete1 records', hist2.status === 200 && !leaked);
    const latest2 = await req('GET', '/assessments/latest', t2);
    check('A11. athlete2 latest is null (nothing leaked across athletes)',
      latest2.status === 200 && (latest2.json?.data === null || latest2.json?.data === undefined));

    // owner history/latest intact
    const hist1 = await req('GET', '/assessments/history', t1);
    check('A12. owner history includes the probe', hist1.status === 200 && (hist1.json?.data || []).some(a => String(a._id) === String(id)));
  } catch (e) {
    results.push('CRASH ' + String(e?.stack || e).split('\n').slice(0, 3).join(' | '));
    failed++;
  }
  console.log('\n=== STEP 7: assessment access control ===');
  results.forEach(r => console.log(r));
  console.log(`---\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
