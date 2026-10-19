/**
 * Phase 5 verification: synchronization engine LOGIC (v2 — new harness).
 * Real syncEngine + assessmentQueue + storageManager; mocked api + network.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createHarness } = require('./harness.cjs');

const CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-sync-')) + path.sep;
const storeFile = path.join(__dirname, 'verify-sync-queue.json');
if (fs.existsSync(storeFile)) fs.unlinkSync(storeFile);
const memStore = {};
const asyncStorageMock = {
  setItem: async (k, v) => { memStore[k] = v; fs.writeFileSync(storeFile, JSON.stringify(memStore)); },
  getItem: async (k) => (k in memStore ? memStore[k] : null),
  removeItem: async (k) => { delete memStore[k]; fs.writeFileSync(storeFile, JSON.stringify(memStore)); },
  multiRemove: async (ks) => { ks.forEach(k => delete memStore[k]); }
};
let simulatedFreeBytes = 10 * 1024 * 1024 * 1024;
const toFsPath = uri => decodeURIComponent(String(uri).replace(/^file:\/\//, ''));
const fsMock = {
  get cacheDirectory() { return `file://${CACHE_DIR}`; },
  makeDirectoryAsync: async (uri) => { fs.mkdirSync(toFsPath(uri), { recursive: true }); },
  writeAsStringAsync: async (uri, content) => { fs.writeFileSync(toFsPath(uri), content); },
  readAsStringAsync: async (uri) => fs.readFileSync(toFsPath(uri), 'utf8'),
  deleteAsync: async (uri) => { try { fs.unlinkSync(toFsPath(uri)); } catch {} },
  moveAsync: async ({ from, to }) => { fs.renameSync(toFsPath(from), toFsPath(to)); },
  getInfoAsync: async (uri) => {
    try { const st = fs.statSync(toFsPath(uri)); return { exists: true, isDirectory: st.isDirectory(), size: st.size }; }
    catch { return { exists: false, isDirectory: false, size: undefined }; }
  },
  readDirectoryAsync: async (uri) => fs.readdirSync(toFsPath(uri)),
  getFreeDiskStorageAsync: async () => simulatedFreeBytes
};

/* ---------------- mock network ---------------- */
let netStatus = 'online';
const netListeners = new Set();
const networkMock = {
  getNetworkStatus: () => netStatus,
  subscribeToNetwork: (cb) => { netListeners.add(cb); return () => netListeners.delete(cb); },
  isOnline: () => netStatus === 'online'
};
const setNet = (s) => { netStatus = s; netListeners.forEach(cb => cb(s)); };

/* ---------------- mock api ---------------- */
const serverDb = new Map();
let apiBehavior = {};
const apiCalls = [];
let idSeq = 1000;
const mkServerId = () => `srv-${++idSeq}`;
const call = (name, fn) => {
  apiCalls.push({ name, at: Date.now() });
  const override = apiBehavior[name];
  if (override) return override();
  return fn();
};
const apiMock = {
  createAssessment: (data) => call('createAssessment', () => {
    // FAITHFUL to the real backend (Phase 6): a record with the same
    // (athleteId, idempotencyKey) is RETURNED, never duplicated.
    if (data?.idempotencyKey) {
      const existing = [...serverDb.values()].find(a => a.idempotencyKey === data.idempotencyKey);
      if (existing) return Promise.resolve({ success: true, data: existing });
    }
    const id = mkServerId();
    serverDb.set(id, { _id: id, status: 'created', idempotencyKey: data?.idempotencyKey || null, sport: data.sport, testType: data.testType, createdAt: new Date().toISOString() });
    return Promise.resolve({ success: true, data: { _id: id } });
  }),
  updateAssessmentStatus: (id, status) => call('updateAssessmentStatus', () => {
    const a = serverDb.get(id);
    if (!a) return Promise.reject(Object.assign(new Error('Assessment not found'), { status: 404 }));
    a.status = status;
    return Promise.resolve({ success: true, data: a });
  }),
  getAssessmentById: (id) => call('getAssessmentById', () => {
    const a = serverDb.get(id);
    if (!a) return Promise.reject(Object.assign(new Error('Assessment not found'), { status: 404 }));
    return Promise.resolve({ success: true, data: a });
  }),
  getAssessmentHistory: () => call('getAssessmentHistory', () =>
    Promise.resolve({ success: true, data: [...serverDb.values()].sort((x, y) => y.createdAt.localeCompare(x.createdAt)) })),
  setAuthToken: () => {},
  getAuthToken: () => 'test-token'
};

/* ---------------- load real services through harness ---------------- */
const { loadTs } = createHarness({ asyncStorageMock, fsMock, platformOS: 'ios', apiMock, networkMock });
const SVC = path.resolve(__dirname, '../src/services');
const queueApi = loadTs(path.join(SVC, 'assessmentQueue'));
const storageApi = loadTs(path.join(SVC, 'storageManager'));
const engineApi = loadTs(path.join(SVC, 'syncEngine'));

let passed = 0, failed = 0;
const results = [];
const check = (name, cond) => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`); cond ? passed++ : failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const qAll = () => queueApi.getQueuedAssessments();
const qSet = (localId, patch) => queueApi.updateQueuedAssessment(localId, patch);

(async () => {
  const mk = async (sport, testType, key) => queueApi.addQueuedAssessment({ athleteId: 'u1', sport, testType, idempotencyKey: key });

  /* ============ R1-R6: happy path single entry ============ */
  const e1 = await mk('Athletics', 'unilateral_squat', 'k1');
  const s1 = await storageApi.saveRecording(e1.idempotencyKey, e1.localId, { kind: 'rec', n: 1 });
  await qSet(e1.localId, { localVideoUri: s1.uri });

  const run1 = await engineApi.syncPendingAssessments();
  const e1After = (await qAll()).find(x => x.localId === e1.localId);
  check('R1/R4: entry synced, serverId persisted', run1.synced === 1 && !!e1After.serverId && e1After.syncStatus === 'processing');
  check('R3/R6: upload success ends at processing (not completed)', e1After.syncStatus === 'processing' && serverDb.get(e1After.serverId).status === 'processing');
  check('R5: entry + video kept before server completion', !!(await qAll()).find(x => x.localId === e1.localId) && fs.existsSync(toFsPath(s1.uri)));

  const createCallsBefore = apiCalls.filter(c => c.name === 'createAssessment').length;
  await engineApi.syncPendingAssessments();
  check('idempotent rerun: no duplicate create (serverId short-circuit)', apiCalls.filter(c => c.name === 'createAssessment').length === createCallsBefore);

  /* reconciliation: server completes */
  const srv = serverDb.get(e1After.serverId);
  srv.status = 'completed'; srv.completedAt = new Date().toISOString();
  await engineApi.syncPendingAssessments();
  check('reconcile: server completed -> queue entry removed + video deleted',
    !(await qAll()).find(x => x.localId === e1.localId) && !fs.existsSync(toFsPath(s1.uri)));

  /* ============ R7: multiple entries one-at-a-time ============ */
  const m1 = await mk('Tennis', 'sprint_acceleration', 'k2');
  const m2 = await mk('Cricket', 'posture_alignment', 'k3');
  const m3 = await mk('Football', 'landing_mechanics', 'k4');
  apiBehavior.createAssessment = () => sleep(30).then(() => {
    const id = mkServerId();
    serverDb.set(id, { _id: id, status: 'created', createdAt: new Date().toISOString() });
    return { success: true, data: { _id: id } };
  });
  await engineApi.syncPendingAssessments();
  apiBehavior = {};
  const qm = await qAll();
  check('R7: all three synced with serverIds', [m1, m2, m3].every(x => qm.find(y => y.localId === x.localId && y.serverId && y.syncStatus === 'processing')));

  /* ============ R8: resume after restart ============ */
  const m2Cur = qm.find(x => x.localId === m2.localId);
  await qSet(m1.localId, { syncStatus: 'uploading', serverId: null, nextAttemptAt: null, retryCount: 0 });
  await qSet(m2.localId, { syncStatus: 'uploading', nextAttemptAt: null, retryCount: 0 });
  await engineApi.recoverQueuedAssessments();
  const m1Rec = (await qAll()).find(x => x.localId === m1.localId);
  const m2Rec = (await qAll()).find(x => x.localId === m2.localId);
  check('R8: uploading w/o serverId -> pending', m1Rec.syncStatus === 'pending' && !m1Rec.serverId);
  check('R8b: uploading w/ serverId -> processing', m2Rec.syncStatus === 'processing' && m2Rec.serverId === m2Cur.serverId);
  const createBefore = apiCalls.filter(c => c.name === 'createAssessment').length;
  await engineApi.syncPendingAssessments();
  const m1Final = (await qAll()).find(x => x.localId === m1.localId);
  check('R8c: recovered entry re-created exactly once', !!m1Final.serverId &&
    apiCalls.filter(c => c.name === 'createAssessment').length === createBefore + 1);

  /* ============ R9/R10: network loss mid-run + resume ============ */
  const n1 = await mk('Badminton', 'agility_t_drill', 'k5');
  const n2 = await mk('Basketball', 'countermovement_jump', 'k6');
  let createCount = 0;
  apiBehavior.createAssessment = () => {
    createCount++;
    if (createCount === 1) {
      const id = mkServerId();
      serverDb.set(id, { _id: id, status: 'created', createdAt: new Date().toISOString() });
      return Promise.resolve({ success: true, data: { _id: id } });
    }
    setNet('offline');
    return Promise.reject(new TypeError('Failed to fetch'));
  };
  await engineApi.syncPendingAssessments();
  apiBehavior = {};
  const n1After = (await qAll()).find(x => x.localId === n1.localId);
  const n2After = (await qAll()).find(x => x.localId === n2.localId);
  check('R9: mid-run network loss — first entry synced', !!n1After.serverId);
  check('R9b: remaining entry untouched (pending)', n2After.syncStatus === 'pending' && !n2After.serverId);
  setNet('online');
  // the engine legitimately applied a 30s backoff after the network failure;
  // simulate the window passing, then resume
  await qSet(n2.localId, { nextAttemptAt: new Date(Date.now() - 1000).toISOString() });
  await engineApi.syncPendingAssessments();
  const n2Final = (await qAll()).find(x => x.localId === n2.localId);
  check('R10: connectivity returns -> pending entry synced', !!n2Final.serverId && n2Final.syncStatus === 'processing');

  /* ============ bounded retries ============ */
  const b1 = await mk('Athletics', 'sprint_acceleration', 'k7');
  apiBehavior.createAssessment = () => Promise.reject(new TypeError('Failed to fetch'));
  const MAX = 5;
  for (let i = 0; i < MAX + 3; i++) {
    await engineApi.syncPendingAssessments();
    const cur = (await qAll()).find(x => x.localId === b1.localId);
    if (cur && cur.syncStatus === 'pending') await qSet(b1.localId, { nextAttemptAt: new Date(Date.now() - 1000).toISOString() });
  }
  apiBehavior = {};
  const b1Final = (await qAll()).find(x => x.localId === b1.localId);
  check('bounded retries: terminal failed after MAX attempts', b1Final.syncStatus === 'failed' && b1Final.retryCount === MAX);
  await engineApi.retryFailedSync();
  const b1Retry = (await qAll()).find(x => x.localId === b1.localId);
  check('manual retry resets budget and re-attempts',
    b1Retry && (b1Retry.syncStatus === 'failed' || b1Retry.syncStatus === 'processing' || b1Retry.syncStatus === 'pending') &&
    (b1Retry.retryCount || 0) <= 2);

  /* ============ auth expiration ============ */
  const a1 = await mk('Tennis', 'agility_t_drill', 'k8');
  apiBehavior.createAssessment = () => Promise.reject(Object.assign(new Error('Not authorized'), { status: 401 }));
  let authEvent = false;
  const unsub = engineApi.subscribeSyncEvents(e => { if (e.type === 'auth-expired') authEvent = true; });
  await engineApi.syncPendingAssessments();
  apiBehavior = {};
  const a1After = (await qAll()).find(x => x.localId === a1.localId);
  check('auth expiration: failed + kept + event, run stopped', a1After.syncStatus === 'failed' && a1After.errorCategory === 'auth' && authEvent);
  unsub();

  /* ============ unknown-outcome adoption (timeout + malformed) ============ */
  const d1 = await mk('Cricket', 'landing_mechanics', 'k9');
  let timeoutSrv = null;
  apiBehavior.createAssessment = () => {
    timeoutSrv = mkServerId();
    serverDb.set(timeoutSrv, { _id: timeoutSrv, status: 'created', sport: 'Cricket', testType: 'landing_mechanics', createdAt: new Date().toISOString() });
    return Promise.reject(new Error('Network request timed out'));
  };
  await engineApi.syncPendingAssessments();
  apiBehavior = {};
  const d1After = (await qAll()).find(x => x.localId === d1.localId);
  check('timeout after server success: ADOPTED, not duplicated', d1After.serverId === timeoutSrv);
  check('adoption: exactly ONE server record for that assessment',
    [...serverDb.values()].filter(a => a.sport === 'Cricket' && a.testType === 'landing_mechanics').length === 1);

  const d2 = await mk('Football', 'posture_alignment', 'k10');
  let malformedSrv = null;
  apiBehavior.createAssessment = () => {
    malformedSrv = mkServerId();
    serverDb.set(malformedSrv, { _id: malformedSrv, status: 'created', sport: 'Football', testType: 'posture_alignment', createdAt: new Date().toISOString() });
    return Promise.resolve({ success: true, data: {} });
  };
  await engineApi.syncPendingAssessments();
  apiBehavior = {};
  const d2After = (await qAll()).find(x => x.localId === d2.localId);
  check('malformed response: adopted instead of duplicate create', d2After.serverId === malformedSrv);

  /* ============ missing local video ============ */
  const v1 = await mk('Basketball', 'unilateral_squat', 'k11');
  await qSet(v1.localId, { localVideoUri: 'file://nowhere/missing.json' });
  await engineApi.syncPendingAssessments();
  const v1After = (await qAll()).find(x => x.localId === v1.localId);
  check('missing video: failed with recoverable reason',
    v1After.syncStatus === 'failed' &&
    /no longer available|damaged|reference is invalid/i.test(v1After.error || ''));
  await engineApi.retryFailedSync();
  const v1Final = (await qAll()).find(x => x.localId === v1.localId);
  check('missing video + manual retry: syncs metadata-only', !!v1Final.serverId && v1Final.localVideoUri === null);

  /* ============ backend processing failure + completion ============ */
  const f1 = await mk('Athletics', 'countermovement_jump', 'k12');
  await engineApi.syncPendingAssessments();
  let f1Cur = (await qAll()).find(x => x.localId === f1.localId);
  check('processing entry waits for analysis', f1Cur.syncStatus === 'processing');
  const fsrv = serverDb.get(f1Cur.serverId);
  fsrv.status = 'failed'; fsrv.errorDetails = { message: 'Pose estimation error' };
  await engineApi.syncPendingAssessments();
  f1Cur = (await qAll()).find(x => x.localId === f1.localId);
  check('backend processing failure mirrored locally', f1Cur.syncStatus === 'failed' && /Pose estimation error/.test(f1Cur.error));

  const c1 = await mk('Tennis', 'unilateral_squat', 'k13');
  await engineApi.syncPendingAssessments();
  const c1Cur = (await qAll()).find(x => x.localId === c1.localId);
  const csrv = serverDb.get(c1Cur.serverId);
  csrv.status = 'completed'; csrv.completedAt = new Date().toISOString();
  await engineApi.syncPendingAssessments();
  check('backend completion -> full lifecycle done (entry removed)', !(await qAll()).find(x => x.localId === c1.localId));

  /* ============ ghost serverId ============ */
  const g1 = await mk('Cricket', 'sprint_acceleration', 'k14');
  await engineApi.syncPendingAssessments();
  let g1Cur = (await qAll()).find(x => x.localId === g1.localId);
  serverDb.delete(g1Cur.serverId);
  // first re-attempt discovers the 404, forgets the id and applies a backoff;
  // clear the window and run once more to complete re-creation
  await qSet(g1.localId, { syncStatus: 'pending', nextAttemptAt: null });
  await engineApi.syncPendingAssessments();
  await qSet(g1.localId, { nextAttemptAt: new Date(Date.now() - 1000).toISOString() });
  await engineApi.syncPendingAssessments();
  g1Cur = (await qAll()).find(x => x.localId === g1.localId);
  check('ghost serverId: re-created after server record vanished',
    !!g1Cur.serverId && (g1Cur.syncStatus === 'processing' || g1Cur.syncStatus === 'pending'));

  /* ============ single-flight lock ============ */
  const [r1, r2] = await Promise.all([engineApi.syncPendingAssessments(), engineApi.syncPendingAssessments()]);
  check('single-flight: concurrent runs do not double-process', r2.processed === 0);

  console.log('\n=== Phase 5: Sync Engine (logic) - verification ===');
  results.forEach(r => console.log(r));
  console.log(`---\n${passed} passed, ${failed} failed`);
  try { fs.rmSync(CACHE_DIR, { recursive: true, force: true }); fs.unlinkSync(storeFile); } catch {}
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
  results.push('CRASH ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e));
  console.log('\n=== Phase 5: Sync Engine (logic) - verification ===');
  results.forEach(r => console.log(r));
  console.log(`---\n${passed} passed, ${failed} failed`);
  try { fs.rmSync(CACHE_DIR, { recursive: true, force: true }); fs.unlinkSync(storeFile); } catch {}
  process.exit(1);
});
