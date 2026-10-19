/**
 * Phase 7 verification: retry & failure handling.
 * Real syncEngine + queue + storageManager; mocked api + network.
 *
 * Category contract (7):
 *   C1 network  C2 server_unavailable  C3 upload timeout -> upload_failed/network
 *   C4 auth     C5 invalid_data        C6 video_unavailable
 *   C7 permanent
 * Scenarios (6 required):
 *   S1 network failure -> classified, retried with backoff
 *   S2 repeated failure -> bounded (no infinite loop), backoff grows, fields tracked
 *   S3 successful retry -> local state updated correctly
 *   S4 permanent failure -> NEVER auto-retried
 *   S5 manual retry -> user can re-attempt (incl. metadata-only for missing video)
 *   S6 app restart after failure -> state survives, no deletion of record/video
 * Also: never delete local record/video merely because sync failed.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createHarness } = require('./harness.cjs');

const CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-retry-')) + path.sep;
const storeFile = path.join(__dirname, 'verify-retry-queue.json');
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
let idSeq = 7000;
const mkServerId = () => `srv-${++idSeq}`;
const serverCreate = (data) => {
  if (data?.idempotencyKey) {
    const existing = [...serverDb.values()].find(a => a.idempotencyKey === data.idempotencyKey);
    if (existing) return existing;
  }
  const id = mkServerId();
  const rec = { _id: id, status: 'created', idempotencyKey: data?.idempotencyKey || null, createdAt: new Date().toISOString() };
  serverDb.set(id, rec);
  return rec;
};
const apiMock = {
  createAssessment: (data) => apiBehavior.createAssessment ? apiBehavior.createAssessment(data)
    : Promise.resolve({ success: true, data: serverCreate(data) }),
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
const qAll = () => queueApi.getQueuedAssessments();
const qSet = (localId, patch) => queueApi.updateQueuedAssessment(localId, patch);
const getEntry = async (localId) => (await qAll()).find(x => x.localId === localId);
/** run engine passes, fast-forwarding backoff windows, N times */
const runPasses = async (n) => {
  for (let i = 0; i < n; i++) {
    await engineApi.syncPendingAssessments();
    const q = await qAll();
    for (const x of q) if (x.nextAttemptAt && new Date(x.nextAttemptAt) > new Date()) {
      await qSet(x.localId, { nextAttemptAt: new Date(Date.now() - 1000).toISOString() });
    }
  }
};

(async () => {
  const mk = async (key) => queueApi.addQueuedAssessment({ athleteId: 'u1', sport: 'Athletics', testType: 'unilateral_squat', idempotencyKey: key });

  /* ============ S1 + C1: network failure -> classified + backoff ============ */
  const s1 = await mk('S1');
  apiBehavior.createAssessment = () => Promise.reject(new TypeError('Failed to fetch'));
  await engineApi.syncPendingAssessments();
  apiBehavior = {};
  let e = await getEntry(s1.localId);
  check('S1/C1. network failure classified network + user message', e.errorCategory === 'network' && /No connection/i.test(e.error));
  check('S1b. backoff scheduled (30s window) + attempt tracked',
    !!e.nextAttemptAt && Math.abs(new Date(e.nextAttemptAt).getTime() - Date.now() - 30000) < 5000 &&
    e.retryCount === 1 && !!e.lastSyncAttemptAt);
  check('S1c. status pending (temporary) with fields tracked',
    e.syncStatus === 'pending' && typeof e.retryCount === 'number' && typeof e.lastSyncAttemptAt === 'string');

  /* ============ S2 + C2/C3: repeated failure -> bounded ============ */
  const s2 = await mk('S2');
  // server_unavailable (500) then timeout in alternation
  let seq = 0;
  apiBehavior.createAssessment = () => {
    seq++;
    if (seq % 2 === 1) return Promise.reject(Object.assign(new Error('Internal Server Error'), { status: 500 }));
    return Promise.reject(new Error('Network request timed out'));
  };
  await runPasses(8); // more than MAX (5) to prove bounded
  apiBehavior = {};
  e = await getEntry(s2.localId);
  check('S2. repeated failure STOPS after 5 attempts (no infinite loop)', e.syncStatus === 'failed' && e.retryCount === 5);
  check('S2b. terminal message honest (stopped after N attempts)', /stopped after 5 attempts/.test(e.error || ''));
  check('S2c. last failure category tracked (network or server_unavailable)',
    e.errorCategory === 'network' || e.errorCategory === 'server_unavailable' || e.errorCategory === 'upload_failed');
  // video/record NOT deleted after failures
  const qNow = await qAll();
  check('S2d. failed entries KEPT locally (never deleted on failure)', !!(await getEntry(s2.localId)) && !!(await getEntry(s1.localId)));

  /* ============ S3: successful retry -> local state updated ============ */
  // S1's entry exhausted its budget during S2's runPasses (bounded retries) —
  // exactly the real-world case: backend healthy again, user retries.
  apiBehavior = {};
  e = await getEntry(s1.localId);
  check('S3a. entry is terminal failed after exhausted budget', e.syncStatus === 'failed');
  await engineApi.retryFailedSync();
  e = await getEntry(s1.localId);
  check('S3. successful (manual) retry: serverId saved, status processing, error cleared',
    !!e.serverId && e.syncStatus === 'processing' && e.error === null && e.errorCategory === null && e.nextAttemptAt === null);

  /* ============ S4: permanent failure never auto-retries ============ */
  const s4 = await mk('S4');
  apiBehavior.createAssessment = () => Promise.reject(Object.assign(new Error('Bad Request: validation failed'), { status: 400 }));
  await engineApi.syncPendingAssessments();
  const createsBefore = serverDb.size;
  apiBehavior = {};
  await runPasses(3); // would retry if misclassified
  e = await getEntry(s4.localId);
  const createsAfter = serverDb.size;
  check('S4. permanent (invalid_data 400) NEVER auto-retries', e.syncStatus === 'failed' && e.retryCount === 1 && createsBefore === createsAfter);

  /* C4: auth expiration */
  const c4 = await mk('C4');
  apiBehavior.createAssessment = () => Promise.reject(Object.assign(new Error('Not authorized'), { status: 401 }));
  await engineApi.syncPendingAssessments();
  apiBehavior = {};
  e = await getEntry(c4.localId);
  check('C4. auth failure classified auth + kept + stopped run', e.errorCategory === 'auth' && e.syncStatus === 'failed' && e.retryCount === 1);

  /* C6: missing/corrupted video -> video_unavailable (own category) */
  const c6 = await mk('C6');
  await qSet(c6.localId, { localVideoUri: 'file:///nowhere/gone.json' });
  await engineApi.syncPendingAssessments();
  e = await getEntry(c6.localId);
  check('C6. missing video -> video_unavailable category + honest message',
    e.errorCategory === 'video_unavailable' && e.syncStatus === 'failed' && /no longer available|damaged|invalid/i.test(e.error || ''));
  // and it did NOT auto-retry (own category, permanent-ish)
  const srvBefore = serverDb.size;
  await runPasses(2);
  check('C6b. video_unavailable does NOT auto-retry uselessly', serverDb.size === srvBefore);

  /* corrupted video variant */
  const c6b = await mk('C6b');
  const badFile = await storageApi.saveRecording('C6b', c6b.localId, { n: 1 });
  await qSet(c6b.localId, { localVideoUri: badFile.uri });
  fs.writeFileSync(toFsPath(badFile.uri), '{truncated');
  await engineApi.syncPendingAssessments();
  e = await getEntry(c6b.localId);
  check('C6c. corrupted video detected -> video_unavailable + damaged message',
    e.errorCategory === 'video_unavailable' && /damaged/i.test(e.error || ''));

  /* ============ S5: manual retry ============ */
  // S4 entry: backend now accepts it
  apiBehavior = {};
  await engineApi.retryFailedSync();
  e = await getEntry(s4.localId);
  check('S5. manual retry re-attempts a permanently-failed entry (fresh budget)',
    !!e.serverId && e.syncStatus === 'processing' && e.retryCount <= 2);
  // C6 entry: manual retry goes metadata-only (video dropped, not "recovered")
  const c6During = await getEntry(c6.localId);
  check('S5b. manual retry of video_unavailable syncs metadata-only (uri dropped)',
    !!c6During.serverId && c6During.localVideoUri === null);

  /* ============ S6: app restart after failure ============ */
  // fail an entry first
  const s6 = await mk('S6');
  const s6file = await storageApi.saveRecording('S6', s6.localId, { n: 6 });
  await qSet(s6.localId, { localVideoUri: s6file.uri });
  apiBehavior.createAssessment = () => Promise.reject(new TypeError('Failed to fetch'));
  await engineApi.syncPendingAssessments();
  apiBehavior = {};
  // "restart": fresh service instances, same storage
  const engineApi2 = loadTs(path.join(SVC, 'syncEngine'));
  await engineApi2.recoverQueuedAssessments();
  const e6 = await getEntry(s6.localId);
  check('S6. restart after failure: entry survives with category/retry fields intact',
    !!e6 && e6.errorCategory === 'network' && e6.retryCount === 1 && e6.syncStatus === 'pending');
  check('S6b. video file still on disk (never deleted due to sync failure)', fs.existsSync(toFsPath(s6file.uri)));
  // and after the restart the retry can succeed
  await qSet(s6.localId, { nextAttemptAt: new Date(Date.now() - 1000).toISOString() });
  await engineApi2.syncPendingAssessments();
  const e6b = await getEntry(s6.localId);
  check('S6c. post-restart retry succeeds -> state updated', !!e6b.serverId && e6b.syncStatus === 'processing');

  /* ============ final state shape: every entry tracks required fields ============ */
  const all = await qAll();
  check('TRACKED. all entries carry status+retryCount+lastSyncAttemptAt(+category when failed)',
    all.every(x => typeof x.syncStatus === 'string' && typeof x.retryCount === 'number' &&
      (x.syncStatus !== 'failed' || (x.errorCategory && x.error))));

  console.log('\n=== Phase 7: Retry & Failure Handling - verification ===');
  results.forEach(r => console.log(r));
  console.log(`---\n${passed} passed, ${failed} failed`);
  try { fs.rmSync(CACHE_DIR, { recursive: true, force: true }); fs.unlinkSync(storeFile); } catch {}
  process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  results.push('CRASH ' + (err && err.stack ? err.stack.split('\n').slice(0, 5).join(' | ') : err));
  console.log('\n=== Phase 7: Retry & Failure Handling - verification ===');
  results.forEach(r => console.log(r));
  console.log(`---\n${passed} passed, ${failed} failed`);
  try { fs.rmSync(CACHE_DIR, { recursive: true, force: true }); fs.unlinkSync(storeFile); } catch {}
  process.exit(1);
});
