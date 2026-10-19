const BASE = 'http://localhost:5000/api';
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const api = async (path, token) => {
  const res = await fetch(BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
};

(async () => {
  await wait(6000);

  // Identities
  const vance = (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '+910000000101', password: 'coach123' }) })).json());
  const elena = (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '+910000000102', password: 'coach123' }) })).json());
  const demo = (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '+919999000011', password: 'secret123' }) })).json());

  const coachesPublic = await (await fetch(`${BASE}/coaches`)).json();
  const vanceCoachId = coachesPublic.data.find(c => c.name === 'Dr. Marcus Vance')._id;
  const elenaCoachId = coachesPublic.data.find(c => c.name === 'Elena Rodriguez')._id;

  const vanceAthletes = await api('/coaches/me/athletes', vance.token);
  console.log('setup athletes endpoint:', vanceAthletes.status, JSON.stringify(vanceAthletes.body).slice(0, 150));
  const AUTHORIZED_ATHLETE = vanceAthletes.body?.data?.[0]?._id;           // Demo Athlete
  // An athlete NOT assigned to Vance: register a fresh one via the public API
  const freshPhone = '+9188' + String(Math.floor(10000000 + Math.random() * 89999999));
  const reg = await (await fetch(`${BASE}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Unauthorized Probe', phone: freshPhone, password: 'probe123' }) })).json();
  const UNAUTHORIZED_ATHLETE = reg.user?._id || reg.data?.user?._id || reg.data?.athlete?._id;
  console.log('setup:', {
    vance: !!vance.token, elena: !!elena.token,
    authorizedAthlete: !!AUTHORIZED_ATHLETE, unauthorizedAthlete: !!UNAUTHORIZED_ATHLETE
  });

  const PATHS = (id) => [
    [`individual`, `/coaches/me/athletes/${id}`],
    [`assessments`, `/coaches/me/athletes/${id}/assessments`],
    [`progress`, `/coaches/me/athletes/${id}/progress`],
    [`injury-risk`, `/coaches/me/athletes/${id}/injury-risk`],
    [`overview`, `/coaches/me/athletes/${id}/overview`]
  ];

  let pass = 0, fail = 0;
  const check = (name, cond, detail) => {
    if (cond) { pass++; console.log(`  PASS ${name}`); }
    else { fail++; console.log(`  FAIL ${name} -> ${detail}`); }
  };

  console.log('\n[1] Authorized coach + authorized athlete (expect all 200)');
  for (const [name, p] of PATHS(AUTHORIZED_ATHLETE)) {
    const r = await api(p, vance.token);
    check(name, r.status === 200 && r.body?.success !== false, `${r.status} ${JSON.stringify(r.body).slice(0, 90)}`);
  }

  console.log('[1b] Progress data is real');
  const prog = await api(`/coaches/me/athletes/${AUTHORIZED_ATHLETE}/progress`, vance.token);
  check('trend points', prog.body?.data?.chronologicalTrend?.length === 3, JSON.stringify(prog.body).slice(0, 120));

  console.log('[2] Authorized coach + UNauthorized athlete (expect all 403)');
  for (const [name, p] of PATHS(UNAUTHORIZED_ATHLETE)) {
    const r = await api(p, vance.token);
    check(name, r.status === 403, `${r.status} ${JSON.stringify(r.body).slice(0, 90)}`);
  }

  console.log('[3] Unauthenticated requests (expect all 401)');
  for (const [name, p] of PATHS(AUTHORIZED_ATHLETE)) {
    const r = await api(p, null);
    check(name, r.status === 401, `${r.status}`);
  }

  console.log('[4] Invalid athlete ID format (expect all 400)');
  for (const [name, p] of PATHS('not-a-valid-id')) {
    const r = await api(p, vance.token);
    check(name, r.status === 400, `${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
  }

  console.log('[4b] Valid-format but nonexistent athlete ID (expect all 404)');
  const fake = '5f8a7d50a7e5ff7b76826544';
  for (const [name, p] of PATHS(fake)) {
    const r = await api(p, vance.token);
    check(name, r.status === 404 || r.status === 403, `${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
  }

  console.log('[5] Invalid coach ID on legacy client-supplied route (expect 403/404)');
  const legacyWrong = await api(`/coaches/${vanceCoachId.replace(/.$/, c => c === 'a' ? 'b' : 'a')}/athletes/${AUTHORIZED_ATHLETE}/assessments`, elena.token);
  check('wrong-coach legacy', legacyWrong.status === 403 || legacyWrong.status === 404, `${legacyWrong.status}`);
  const legacyNotOwner = await api(`/coaches/${vanceCoachId}/athletes/${AUTHORIZED_ATHLETE}/assessments`, elena.token);
  check('not-owner legacy', legacyNotOwner.status === 403, `${legacyNotOwner.status}`);

  console.log('[6] Coach with NO athletes');
  const elenaList = await api('/coaches/me/athletes', elena.token);
  check('empty list', elenaList.status === 200 && elenaList.body.count === 0, `${elenaList.status} count=${elenaList.body?.count}`);
  const elenaOverview = await api(`/coaches/me/athletes/${AUTHORIZED_ATHLETE}/overview`, elena.token);
  check('overview blocked', elenaOverview.status === 403, `${elenaOverview.status}`);

  console.log('[6b] Athlete-side behavior unchanged (athlete can still access own data)');
  const ownDash = await api('/athletes/dashboard', demo.token);
  check('own dashboard', ownDash.status === 200, `${ownDash.status}`);
  const ownProgress = await api('/athletes/progress', demo.token);
  check('own progress', ownProgress.status === 200 && ownProgress.body?.data?.chronologicalTrend?.length === 3, `${ownProgress.status}`);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
})().catch(e => { console.error('[FATAL]', e); process.exit(1); });
