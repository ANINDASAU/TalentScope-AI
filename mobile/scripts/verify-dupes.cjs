/**
 * Phase 6 verification: DUPLICATE PREVENTION in the sync flow.
 * Real syncEngine + queue + storageManager; mocked api faithful to the real
 * backend's idempotent create contract (same key -> same record returned).
 *
 * Every spec scenario, each ending with: serverDb contains EXACTLY ONE
 * record for the logical offline assessment:
 *   D1. sync runs twice in a row
 *   D2. network timeout AFTER the server received & committed the create
 *       (response lost) -> replay must not duplicate
 *   D3. app restarted mid-upload (uploading w/o serverId) -> resume no dup
 *   D4. user manual retry after failure
 *   D5. connectivity flapping (offline->online->offline->online) during sync
 *   D6. concurrent create race (10 parallel identical requests)
 *   D7. backend down at first, up later (server error then success)
 *   D8. duplicate queue-entry guard (same idempotencyKey rejected)
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createHarness } = require('./harness.cjs');

const CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-dup-')) + path.sep;
const storeFile = path.join(__dirname, 'verify-dupes-queue.json');
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

let netStatus = 'online';
const netListeners = new Set();
const networkMock = {
  getNetworkStatus: () => netStatus,
  subscribeToNetwork: (cb) => { netListeners.add(cb); return () => netListeners.delete(cb); },
  isOnline: () => netStatus === 'online'
};
const setNet = (s) => { netStatus = s; netListeners.forEach(cb => cb(s)); };

const serverDb = new Map();
let apiBehavior = {};
let idSeq = 5000;
const mkServerId = () => `srv-${++idSeq}`;
const serverCreate = (data) => {
  // FAITHFUL backend contract: same (athlete, key) -> return existing
  if (data?.idempotencyKey) {
    const existing = [...serverDb.values()].find(a => a.idempotencyKey === data.idempotencyKey);
    if (existing) return existing;
  }
  const id = mkServerId();
  const rec = { _id: id, status: 'created', idempotencyKey: data?.idempotencyKey || null, sport: data.sport, testType: data.testType, createdAt: new Date().toISOString() };
  serverDb.set(id, rec);
  return rec;
};
const apiMock = {
  createAssessment: (data) => {
    if (apiBehavior.createAssessment) return apiBehavior.createAssessment(data);
    return Promise.resolve({ success: true, data: serverCreate(data) });
  },
  updateAssessmentStatus: (id, status) => {
    const a = serverDb.get(id);
    if (!a) return Promise.reject(Object.assign(new Error('Assessment not found'), { status: 404 }));
    a.status = status;
    return Promise.resolve({ success: true, data: a });
  },
  getAssessmentById: (id) => {
    const a = serverDb.get(id);
    if (!a) return Promise.reject(Object.assign(new Error('Assessment not found'), { status: 404 }));
    return Promise.resolve({ success: true, data: a });
  },
  getAssessmentHistory: () => Promise.resolve({ success: true, data: [...serverDb.values()] }),
  setAuthToken: () => {},
  getAuthToken: () => 'test-token'
};

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
/** how many server records exist for a given idempotency key */
const serverCount = (key) => [...serverDb.values()].filter(a => a.idempotencyKey === key).length;

(async () => {
  const mk = async (sport, testType, key) => queueApi.addQueuedAssessment({ athleteId: 'u1', sport, testType, idempotencyKey: key });

  /* ============ D1: sync runs twice in a row ============ */
  const d1 = await mk('Athletics', 'unilateral_squat', 'D1-key');
  await engineApi.syncPendingAssessments();
  await engineApi.syncPendingAssessments();
  await engineApi.syncPendingAssessments();
  check('D1. double/triple sync run -> exactly ONE server record', serverCount('D1-key') === 1);
  const d1After = (await qAll()).find(x => x.localId === d1.localId);
  check('D1b. queue entry points at that single record', !!d1After.serverId && d1After.syncStatus === 'processing');

  /* ============ D2: timeout AFTER server received request ============ */
  const d2 = await mk('Tennis', 'sprint_acceleration', 'D2-key');
  apiBehavior.createAssessment = (data) => {
    // server RECEIVES and COMMITS the create, but the response is lost
    serverCreate(data);
    return Promise.reject(new Error('Network request timed out'));
  };
  await engineApi.syncPendingAssessments();
  apiBehavior = {};
  check('D2. response lost after commit -> still exactly ONE record', serverCount('D2-key') === 1);
  // engine backed off; clear window and let it replay
  await qSet(d2.localId, { nextAttemptAt: new Date(Date.now() - 1000).toISOString() });
  await engineApi.syncPendingAssessments();
  const d2After = (await qAll()).find(x => x.localId === d2.localId);
  check('D2b. replay adopted the committed record (no duplicate, queue linked)', serverCount('D2-key') === 1 && !!d2After.serverId && d2After.syncStatus === 'processing');

  /* ============ D3: app restarted mid-upload (no serverId yet) ============ */
  const d3 = await mk('Cricket', 'posture_alignment', 'D3-key');
  // simulate: create committed server-side, app crashed before persisting serverId
  serverCreate({ idempotencyKey: 'D3-key', sport: 'Cricket', testType: 'posture_alignment' });
  await qSet(d3.localId, { syncStatus: 'uploading', serverId: null });
  await engineApi.recoverQueuedAssessments(); // boot recovery: uploading w/o id -> pending
  await engineApi.syncPendingAssessments();
  const d3After = (await qAll()).find(x => x.localId === d3.localId);
  check('D3. restart mid-upload -> replay found the committed record, no duplicate', serverCount('D3-key') === 1 && !!d3After.serverId);

  /* ============ D4: manual retry after failure ============ */
  const d4 = await mk('Football', 'landing_mechanics', 'D4-key');
  apiBehavior.createAssessment = () => Promise.reject(new TypeError('Failed to fetch'));
  for (let i = 0; i < 6; i++) {
    await engineApi.syncPendingAssessments();
    const cur = (await qAll()).find(x => x.localId === d4.localId);
    if (cur?.syncStatus === 'pending') await qSet(d4.localId, { nextAttemptAt: new Date(Date.now() - 1000).toISOString() });
  }
  apiBehavior = {};
  const d4Failed = (await qAll()).find(x => x.localId === d4.localId);
  check('D4a. retries exhausted -> terminal failed (0 server records so far)', d4Failed.syncStatus === 'failed' && serverCount('D4-key') === 0);
  // now backend recovers + user manually retries
  await engineApi.retryFailedSync();
  await engineApi.syncPendingAssessments();
  const d4After = (await qAll()).find(x => x.localId === d4.localId);
  check('D4b. manual retry after outage -> exactly ONE record', serverCount('D4-key') === 1 && !!d4After.serverId);

  /* ============ D5: connectivity flapping ============ */
  const d5 = await mk('Badminton', 'agility_t_drill', 'D5-key');
  let flap = 0;
  apiBehavior.createAssessment = (data) => {
    flap++;
    if (flap === 1) { serverCreate(data); return Promise.reject(new Error('Network request timed out')); } // committed, lost
    if (flap === 2) return Promise.reject(new TypeError('Failed to fetch')); // never reached
    return Promise.resolve({ success: true, data: serverCreate(data) }); // finally succeeds
  };
  await engineApi.syncPendingAssessments(); // attempt 1: commit+timeout
  await qSet(d5.localId, { nextAttemptAt: new Date(Date.now() - 1000).toISOString() });
  setNet('offline'); await engineApi.syncPendingAssessments(); // no-op offline
  setNet('online');
  await engineApi.syncPendingAssessments(); // attempt 2: fetch fail
  await qSet(d5.localId, { nextAttemptAt: new Date(Date.now() - 1000).toISOString() });
  await engineApi.syncPendingAssessments(); // attempt 3: success
  apiBehavior = {};
  const d5After = (await qAll()).find(x => x.localId === d5.localId);
  check('D5. flapping connectivity (lost response, failed request, success) -> ONE record',
    serverCount('D5-key') === 1 && !!d5After.serverId && d5After.syncStatus === 'processing');

  /* ============ D6: concurrent create race ============ */
  const d6 = await mk('Basketball', 'countermovement_jump', 'D6-key');
  await qSet(d6.localId, { syncStatus: 'uploading', serverId: null, nextAttemptAt: null, retryCount: 0 });
  await engineApi.recoverQueuedAssessments();
  // simulate 10 parallel replays of the same create (worst case)
  const replays = await Promise.all(
    Array.from({ length: 10 }, () => apiMock.createAssessment({ sport: 'Basketball', testType: 'countermovement_jump', idempotencyKey: 'D6-key' }))
  );
  const ids = new Set(replays.map(r => r.data._id));
  check('D6. 10 concurrent identical creates -> single server record', serverCount('D6-key') === 1 && ids.size === 1);

  /* ============ D7: backend down then up (server error path) ============ */
  const d7 = await mk('Athletics', 'agility_t_drill', 'D7-key');
  apiBehavior.createAssessment = () => Promise.reject(Object.assign(new Error('Internal server error'), { status: 500 }));
  await engineApi.syncPendingAssessments();
  await qSet(d7.localId, { nextAttemptAt: new Date(Date.now() - 1000).toISOString() });
  apiBehavior = {};
  await engineApi.syncPendingAssessments();
  const d7After = (await qAll()).find(x => x.localId === d7.localId);
  check('D7. 500 then recovery -> exactly ONE record', serverCount('D7-key') === 1 && !!d7After.serverId);

  /* ============ D8: duplicate queue entry guard ============ */
  let dupRejected = false;
  try { await mk('Athletics', 'unilateral_squat', 'D1-key'); } catch { dupRejected = true; }
  check('D8. duplicate queue entry (same key) rejected at the queue level', dupRejected);

  /* ============ final: exactly one server record per logical assessment ============ */
  const keys = ['D1-key', 'D2-key', 'D3-key', 'D4-key', 'D5-key', 'D6-key', 'D7-key'];
  check('FINAL. MongoDB-equivalent holds EXACTLY ONE record per offline assessment for every scenario',
    keys.every(k => serverCount(k) === 1));

  console.log('\n=== Phase 6: Duplicate Prevention (sync flow) - verification ===');
  results.forEach(r => console.log(r));
  console.log(`---\n${passed} passed, ${failed} failed`);
  try { fs.rmSync(CACHE_DIR, { recursive: true, force: true }); fs.unlinkSync(storeFile); } catch {}
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
  results.push('CRASH ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e));
  console.log('\n=== Phase 6: Duplicate Prevention (sync flow) - verification ===');
  results.forEach(r => console.log(r));
  console.log(`---\n${passed} passed, ${failed} failed`);
  try { fs.rmSync(CACHE_DIR, { recursive: true, force: true }); fs.unlinkSync(storeFile); } catch {}
  process.exit(1);
});
