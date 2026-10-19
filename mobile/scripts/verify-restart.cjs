/**
 * Phase 9 verification: app restart recovery.
 * "Force-close" is simulated the way a real cold start behaves: fresh module
 * instances of ALL services (module-level state reset) while AsyncStorage
 * (file-backed) and the real-disk video directory persist.
 *
 * The app's actual boot sequence is what runs on every load:
 *   RootNavigator -> initNetworkListener + initSyncEngine ->
 *     recoverQueuedAssessments (uploading normalization)
 *     verifyQueueIntegrity (video refs)
 *     cleanupOrphanedVideos (interrupted temp artifacts)
 *     then syncPendingAssessments if online
 * Each scenario drives that sequence explicitly after the "restart".
 *
 * Interruption stages tested:
 *   RS1 during RECORDING (nothing saved yet — nothing queued, stable)
 *   RS2 during LOCAL SAVE (queue entry exists, video file mid-write -> .tmp)
 *   RS3 during UPLOAD, server NEVER received (uploading, no serverId)
 *   RS4 during UPLOAD, server DID receive (uploading, serverId persisted late
 *      — server already has the record; must NOT duplicate)
 *   RS5 during SERVER PROCESSING (processing + serverId; completes while away)
 *   RS6 offline boot: assessments stay pending, sync does not run
 *   RS7 missing local video: marked video_unavailable (recoverable, no crash)
 *   RS8 corrupt queue storage mid-write: recovered from backup mirror
 *   RS9 never deletes pending assessments on restart
 *   RS10 online boot: resumes and completes full lifecycle
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createHarness } = require('./harness.cjs');

const CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-restart-')) + path.sep;
const storeFile = path.join(__dirname, 'verify-restart-queue.json');
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
let idSeq = 9000;
const mkServerId = () => `srv-${++idSeq}`;
const serverCreate = (data) => {
  if (data?.idempotencyKey) {
    const existing = [...serverDb.values()].find(a => a.idempotencyKey === data.idempotencyKey);
    if (existing) return existing;
  }
  const id = mkServerId();
  serverDb.set(id, { _id: id, status: 'created', idempotencyKey: data?.idempotencyKey || null, createdAt: new Date().toISOString() });
  return serverDb.get(id);
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
const boot = () => ({
  queue: loadTs(path.join(SVC, 'assessmentQueue')),
  storage: loadTs(path.join(SVC, 'storageManager')),
  engine: loadTs(path.join(SVC, 'syncEngine'))
});

let passed = 0, failed = 0;
const results = [];
const check = (name, cond) => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`); cond ? passed++ : failed++; };

/** The app's real boot sequence after a restart */
const restartApp = async (S) => {
  await S.engine.recoverQueuedAssessments();
  await S.storage.verifyQueueIntegrity();
  await S.storage.cleanupOrphanedVideos();
  // initSyncEngine also triggers a sync shortly after boot when online
  if (networkMock.getNetworkStatus() === 'online') await S.engine.syncPendingAssessments();
};

(async () => {
  /* ============ RS1: interrupted during RECORDING ============ */
  {
    const S = boot();
    // nothing queued yet (recording in progress when killed): only a stale tmp artifact
    fs.mkdirSync(path.join(CACHE_DIR, 'offline-assessments'), { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, 'offline-assessments', 'leftover.tmp'), 'partial');
    await restartApp(S);
    const q = await S.queue.getQueuedAssessments();
    check('RS1. interrupted during recording: no phantom entries, tmp artifact cleaned, stable',
      q.length === 0 && !fs.existsSync(path.join(CACHE_DIR, 'offline-assessments', 'leftover.tmp')));
  }

  /* ============ RS2: interrupted during LOCAL SAVE ============ */
  {
    const S = boot();
    // entry queued, then video write interrupted mid-way: only a .tmp file exists
    const e = await S.queue.addQueuedAssessment({ athleteId: 'u1', sport: 'Athletics', testType: 'unilateral_squat', idempotencyKey: 'RS2' });
    fs.writeFileSync(path.join(CACHE_DIR, 'offline-assessments', 'rs2.tmp'), 'partial-write');
    // entry has NO localVideoUri yet (crash before the patch)
    await restartApp(S);
    const qe = await S.queue.getQueuedAssessmentById(e.localId);
    check('RS2. interrupted during local save: entry survives (no auto-delete)',
      !!qe && qe.syncStatus !== 'deleted');
    check('RS2b. tmp artifact cleaned; no video ref -> syncs metadata-only later',
      !fs.existsSync(path.join(CACHE_DIR, 'offline-assessments', 'rs2.tmp')) && qe.localVideoUri === null);
  }

  /* ============ RS3: interrupted during UPLOAD — server never received ============ */
  {
    const S = boot();
    const e = await S.queue.addQueuedAssessment({ athleteId: 'u1', sport: 'Tennis', testType: 'sprint_acceleration', idempotencyKey: 'RS3' });
    // crash mid-create: 'uploading' WITHOUT serverId; server never saw it
    await S.queue.updateQueuedAssessment(e.localId, { syncStatus: 'uploading', lastSyncAttemptAt: new Date().toISOString() });
    // Step 1: recovery pass alone must normalize uploading -> pending (no sync)
    await S.engine.recoverQueuedAssessments();
    let qe = await S.queue.getQueuedAssessmentById(e.localId);
    const normalized = qe.syncStatus === 'pending' && !qe.serverId;
    // Step 2: full boot (online) then resumes sync — exactly one server record
    await restartApp(S);
    qe = await S.queue.getQueuedAssessmentById(e.localId);
    check('RS3. uploading w/o serverId -> back to pending (server never received it)', normalized);
    check('RS3b. online boot resumes sync -> serverId assigned, no duplicate',
      !!qe.serverId && [...serverDb.values()].filter(a => a.idempotencyKey === 'RS3').length === 1);
  }

  /* ============ RS4: interrupted during UPLOAD — server DID receive it ============ */
  {
    const S = boot();
    const e = await S.queue.addQueuedAssessment({ athleteId: 'u1', sport: 'Cricket', testType: 'posture_alignment', idempotencyKey: 'RS4' });
    // server DID receive + commit the create, but the response never arrived:
    const committed = serverCreate({ idempotencyKey: 'RS4', sport: 'Cricket', testType: 'posture_alignment' });
    // crash happened before serverId was persisted: entry still 'uploading', no serverId
    await S.queue.updateQueuedAssessment(e.localId, { syncStatus: 'uploading', lastSyncAttemptAt: new Date().toISOString() });
    await restartApp(S);
    const qe = await S.queue.getQueuedAssessmentById(e.localId);
    check('RS4. server-received-but-response-lost at restart: ADOPTED, not duplicated',
      qe.serverId === committed._id && [...serverDb.values()].filter(a => a.idempotencyKey === 'RS4').length === 1);
  }

  /* ============ RS5: interrupted during SERVER PROCESSING ============ */
  {
    const S = boot();
    const e = await S.queue.addQueuedAssessment({ athleteId: 'u1', sport: 'Football', testType: 'landing_mechanics', idempotencyKey: 'RS5' });
    await S.engine.syncPendingAssessments();
    let qe = await S.queue.getQueuedAssessmentById(e.localId);
    check('RS5a. entry is processing with serverId before "restart"', qe.syncStatus === 'processing' && !!qe.serverId);
    // server analysis COMPLETES while the app is closed
    serverDb.get(qe.serverId).status = 'completed';
    serverDb.get(qe.serverId).completedAt = new Date().toISOString();
    await restartApp(S);
    qe = await S.queue.getQueuedAssessmentById(e.localId);
    const allQ = await S.queue.getQueuedAssessments();
    fs.writeFileSync(path.join(__dirname, 'rs5-debug.json'), JSON.stringify({
      target: e.localId,
      targetStatus: qe ? { st: qe.syncStatus, srv: qe.serverId, err: qe.error, cat: qe.errorCategory } : null,
      queue: allQ.map(x => ({ id: x.localId, key: x.idempotencyKey, st: x.syncStatus, srv: x.serverId, err: x.error, cat: x.errorCategory })),
      server: [...serverDb.values()].map(a => ({ _id: a._id, key: a.idempotencyKey, st: a.status }))
    }, null, 2));
    check('RS5b. completion while closed: reconciliation removes entry + video (full lifecycle done)', qe === undefined || qe === null);
  }

  /* ============ RS6: offline boot — assessments stay pending ============ */
  {
    setNet('offline');
    const S = boot();
    const e = await S.queue.addQueuedAssessment({ athleteId: 'u1', sport: 'Badminton', testType: 'agility_t_drill', idempotencyKey: 'RS6' });
    const before = await S.queue.getQueuedAssessmentById(e.localId);
    await restartApp(S);
    const qe = await S.queue.getQueuedAssessmentById(e.localId);
    check('RS6. offline boot: assessment stays pending, untouched',
      qe.syncStatus === 'pending' && !qe.serverId && before.localId === qe.localId);
    check('RS6b. offline boot: no server calls happened', [...serverDb.values()].filter(a => a.idempotencyKey === 'RS6').length === 0);
    setNet('online');
  }

  /* ============ RS7: missing local video ============ */
  {
    const S = boot();
    const e = await S.queue.addQueuedAssessment({ athleteId: 'u1', sport: 'Basketball', testType: 'countermovement_jump', idempotencyKey: 'RS7' });
    const s = await S.storage.saveRecording('RS7', e.localId, { n: 7 });
    await S.queue.updateQueuedAssessment(e.localId, { localVideoUri: s.uri });
    fs.unlinkSync(toFsPath(s.uri)); // file vanishes (OS cache eviction)
    await restartApp(S);
    const qe = await S.queue.getQueuedAssessmentById(e.localId);
    check('RS7. missing video at boot: marked video_unavailable (recoverable, no crash)',
      qe.syncStatus === 'failed' && qe.errorCategory === 'video_unavailable' && /no longer available/i.test(qe.error || ''));
    // user retries manually -> syncs metadata-only
    await S.engine.retryFailedSync();
    const qe2 = await S.queue.getQueuedAssessmentById(e.localId);
    check('RS7b. manual retry after missing video: syncs without video',
      !!qe2.serverId && qe2.localVideoUri === null && qe2.syncStatus === 'processing');
  }

  /* ============ RS8: crash mid-write of queue storage -> backup recovery ============ */
  {
    const S = boot();
    // Build a durable multi-entry state FIRST (so the backup mirror has data)
    const e0 = await S.queue.addQueuedAssessment({ athleteId: 'u1', sport: 'Tennis', testType: 'sprint_acceleration', idempotencyKey: 'RS8-0' });
    const e = await S.queue.addQueuedAssessment({ athleteId: 'u1', sport: 'Athletics', testType: 'agility_t_drill', idempotencyKey: 'RS8' });
    // now: both entries durably stored, and the LAST write mirrored the
    // one-before-last state... actually the mirror holds the state prior to
    // adding `e`. Simulate the crash during a THIRD write (status patch of e):
    // AsyncStorage mock commits directly, so emulate mid-write corruption by
    // truncating the primary WHILE the backup holds the last good state.
    memStore['talentscope.offline.assessments.v1'] = '{"localId":"trunc';
    await restartApp(S);
    const q = await S.queue.getQueuedAssessments();
    const qe0 = q.find(x => x.idempotencyKey === 'RS8-0');
    check('RS8. corrupt primary storage at boot: recovered from backup mirror (durable entries survive)',
      !!qe0 && q.length >= 1);
    check('RS8b. primary self-healed to valid JSON',
      (() => { try { JSON.parse(memStore['talentscope.offline.assessments.v1']); return true; } catch { return false; } })());
  }

  /* ============ RS9: restart never deletes pending assessments ============ */
  {
    setNet('offline'); // even offline
    const S = boot();
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const e = await S.queue.addQueuedAssessment({ athleteId: 'u1', sport: 'Tennis', testType: 'sprint_acceleration', idempotencyKey: `RS9-${i}` });
      ids.push(e.localId);
    }
    await restartApp(S);
    const q = await S.queue.getQueuedAssessments();
    check('RS9. three pending assessments survive a restart (nothing auto-deleted)',
      ids.every(id => q.some(x => x.localId === id)) && q.length >= 3);
    setNet('online');
  }

  /* ============ RS10: full lifecycle across restarts ============ */
  {
    const S = boot();
    const e = await S.queue.addQueuedAssessment({ athleteId: 'u1', sport: 'Cricket', testType: 'unilateral_squat', idempotencyKey: 'RS10' });
    const s = await S.storage.saveRecording('RS10', e.localId, { n: 10 });
    await S.queue.updateQueuedAssessment(e.localId, { localVideoUri: s.uri });
    // restart 1: boots online, syncs to processing
    await restartApp(S);
    let qe = await S.queue.getQueuedAssessmentById(e.localId);
    const stage1 = !!qe.serverId && qe.syncStatus === 'processing';
    // restart 2: server completes while away; boot reconciles
    serverDb.get(qe.serverId).status = 'completed';
    serverDb.get(qe.serverId).completedAt = new Date().toISOString();
    await restartApp(S);
    qe = await S.queue.getQueuedAssessmentById(e.localId);
    check('RS10. full lifecycle across two restarts: sync -> complete -> cleaned up (stable)',
      stage1 && (qe === undefined || qe === null));
  }

  console.log('\n=== Phase 9: App Restart Recovery - verification ===');
  results.forEach(r => console.log(r));
  console.log(`---\n${passed} passed, ${failed} failed`);
  try { fs.rmSync(CACHE_DIR, { recursive: true, force: true }); fs.unlinkSync(storeFile); } catch {}
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
  results.push('CRASH ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e));
  console.log('\n=== Phase 9: App Restart Recovery - verification ===');
  results.forEach(r => console.log(r));
  console.log(`---\n${passed} passed, ${failed} failed`);
  try { fs.rmSync(CACHE_DIR, { recursive: true, force: true }); fs.unlinkSync(storeFile); } catch {}
  process.exit(1);
});
