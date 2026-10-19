/**
 * Phase 11 verification: safe storage cleanup.
 * Real storageManager + queue + syncEngine over real disk files.
 *
 * Contract under test:
 *   DELETE only when: server confirmed upload (completed) + valid serverId +
 *   entry no longer needs the video + path is managed.
 *   NEVER delete: pending / uploading / failed-retryable / video needed for
 *   pending synchronization.
 *   Orphans reclaimed safely; no aggressive deletion; cleanup failure leaves
 *   the assessment valid + synchronized; storage does not grow indefinitely.
 *
 * Scenarios (spec):
 *   C1 successful sync -> video + entry cleaned
 *   C2 failed sync -> video + entry KEPT
 *   C3 retry after failure -> succeeds -> cleaned then
 *   C4 app restart -> cleanup still safe; nothing lost
 *   C5 cleanup after successful synchronization (sweep path)
 *   C6 guards: pending/uploading/failed/orphan-ref/shared-file/unmanaged path
 *   C7 cleanup failure resilience (delete throws -> entry stays valid)
 *   C8 storage growth prevention across many lifecycle cycles
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createHarness } = require('./harness.cjs');

const CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-clean-')) + path.sep;
const storeFile = path.join(__dirname, 'verify-cleanup-queue.json');
if (fs.existsSync(storeFile)) fs.unlinkSync(storeFile);
const memStore = {};
const asyncStorageMock = {
  setItem: async (k, v) => { memStore[k] = v; fs.writeFileSync(storeFile, JSON.stringify(memStore)); },
  getItem: async (k) => (k in memStore ? memStore[k] : null),
  removeItem: async (k) => { delete memStore[k]; fs.writeFileSync(storeFile, JSON.stringify(memStore)); },
  multiRemove: async (ks) => { ks.forEach(k => delete memStore[k]); }
};
let simulatedFreeBytes = 10 * 1024 * 1024 * 1024;
/** injection point: make file deletion fail on demand */
let failDeletes = false;
const toFsPath = uri => decodeURIComponent(String(uri).replace(/^file:\/\//, ''));
const fsMock = {
  get cacheDirectory() { return `file://${CACHE_DIR}`; },
  makeDirectoryAsync: async (uri) => { fs.mkdirSync(toFsPath(uri), { recursive: true }); },
  writeAsStringAsync: async (uri, content) => { fs.writeFileSync(toFsPath(uri), content); },
  readAsStringAsync: async (uri) => fs.readFileSync(toFsPath(uri), 'utf8'),
  deleteAsync: async (uri) => {
    if (failDeletes) throw new Error('EACCES: permission denied (simulated)');
    try { fs.unlinkSync(toFsPath(uri)); } catch {}
  },
  moveAsync: async ({ from, to }) => { fs.renameSync(toFsPath(from), toFsPath(to)); },
  getInfoAsync: async (uri) => {
    try { const st = fs.statSync(toFsPath(uri)); return { exists: true, isDirectory: st.isDirectory(), size: st.size }; }
    catch { return { exists: false, isDirectory: false, size: undefined }; }
  },
  readDirectoryAsync: async (uri) => fs.readdirSync(toFsPath(uri)),
  getFreeDiskStorageAsync: async () => simulatedFreeBytes
};

let netStatus = 'online';
const networkMock = {
  getNetworkStatus: () => netStatus,
  subscribeToNetwork: () => () => {},
  isOnline: () => netStatus === 'online'
};
const serverDb = new Map();
const apiMock = {
  createAssessment: (data) => {
    if (data?.idempotencyKey) {
      const ex = [...serverDb.values()].find(a => a.idempotencyKey === data.idempotencyKey);
      if (ex) return Promise.resolve({ success: true, data: ex });
    }
    const id = 'srv-' + Math.random().toString(36).slice(2, 8);
    serverDb.set(id, { _id: id, status: 'created', idempotencyKey: data?.idempotencyKey || null, createdAt: new Date().toISOString() });
    return Promise.resolve({ success: true, data: { _id: id } });
  },
  updateAssessmentStatus: (id, status) => {
    const a = serverDb.get(id); if (!a) return Promise.reject(Object.assign(new Error('nf'), { status: 404 }));
    a.status = status; return Promise.resolve({ success: true, data: a });
  },
  getAssessmentById: (id) => {
    const a = serverDb.get(id); if (!a) return Promise.reject(Object.assign(new Error('nf'), { status: 404 }));
    return Promise.resolve({ success: true, data: a });
  },
  getAssessmentHistory: () => Promise.resolve({ success: true, data: [...serverDb.values()] }),
  setAuthToken: () => {}, getAuthToken: () => 't'
};

const { loadTs } = createHarness({ asyncStorageMock, fsMock, platformOS: 'ios', apiMock, networkMock });
const SVC = path.resolve(__dirname, '../src/services');
const queueApi = loadTs(path.join(SVC, 'assessmentQueue'));
const storageApi = loadTs(path.join(SVC, 'storageManager'));
const engineApi = loadTs(path.join(SVC, 'syncEngine'));
/** fresh engine instance = app restart */
const rebootEngine = () => loadTs(path.join(SVC, 'syncEngine'));

let passed = 0, failed = 0;
const results = [];
const check = (name, cond) => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`); cond ? passed++ : failed++; };
const exists = uri => fs.existsSync(toFsPath(uri));
const qAll = () => queueApi.getQueuedAssessments();

(async () => {
  const DIR = path.join(CACHE_DIR, 'offline-assessments');
  fs.mkdirSync(DIR, { recursive: true });

  /* ============ C1: successful sync -> cleaned ============ */
  const e1 = await queueApi.addQueuedAssessment({ athleteId: 'u1', sport: 'A', testType: 'unilateral_squat', idempotencyKey: 'C1' });
  const s1 = await storageApi.saveRecording('C1', e1.localId, { n: 1 });
  await queueApi.updateQueuedAssessment(e1.localId, { localVideoUri: s1.uri });
  await engineApi.syncPendingAssessments();
  // server completes analysis
  let qe = (await qAll()).find(x => x.localId === e1.localId);
  serverDb.get(qe.serverId).status = 'completed';
  await engineApi.syncPendingAssessments(); // reconciliation + cleanup
  const e1After = (await qAll()).find(x => x.localId === e1.localId);
  check('C1. successful sync: entry removed + video file deleted after server confirmation',
    e1After === undefined && !exists(s1.uri));

  /* ============ C2: failed sync -> KEPT ============ */
  const e2 = await queueApi.addQueuedAssessment({ athleteId: 'u1', sport: 'B', testType: 'sprint_acceleration', idempotencyKey: 'C2' });
  const s2 = await storageApi.saveRecording('C2', e2.localId, { n: 2 });
  await queueApi.updateQueuedAssessment(e2.localId, { localVideoUri: s2.uri });
  // simulate sync failure: server 500 on create via direct status manipulation
  const origCreate = apiMock.createAssessment;
  apiMock.createAssessment = () => Promise.reject(Object.assign(new Error('boom'), { status: 500 }));
  await engineApi.syncPendingAssessments();
  apiMock.createAssessment = origCreate;
  const e2After = (await qAll()).find(x => x.localId === e2.localId);
  check('C2. failed sync: entry kept (pending/failed) + video file KEPT',
    !!e2After && e2After.syncStatus !== 'completed' && exists(s2.uri));

  /* ============ C3: retry after failure -> cleaned ============ */
  // engine backs off; fast-forward and run again with healthy backend
  await queueApi.updateQueuedAssessment(e2.localId, { nextAttemptAt: new Date(Date.now() - 1000).toISOString() });
  await engineApi.syncPendingAssessments();
  let e2Now = (await qAll()).find(x => x.localId === e2.localId);
  check('C3a. retry succeeds: serverId assigned (upload completed)', !!e2Now.serverId && e2Now.syncStatus === 'processing');
  serverDb.get(e2Now.serverId).status = 'completed';
  await engineApi.syncPendingAssessments();
  e2Now = (await qAll()).find(x => x.localId === e2.localId);
  check('C3b. after retry + completion: entry removed + video deleted',
    e2Now === undefined && !exists(s2.uri));

  /* ============ C4: app restart mid-lifecycle -> cleanup safe ============ */
  const engine2 = rebootEngine(); // fresh = restart
  const e4 = await queueApi.addQueuedAssessment({ athleteId: 'u1', sport: 'C', testType: 'posture_alignment', idempotencyKey: 'C4' });
  const s4 = await storageApi.saveRecording('C4', e4.localId, { n: 4 });
  await queueApi.updateQueuedAssessment(e4.localId, { localVideoUri: s4.uri });
  await engine2.recoverQueuedAssessments();
  await storageApi.verifyQueueIntegrity();
  await storageApi.cleanupOrphanedVideos();
  const e4After = (await qAll()).find(x => x.localId === e4.localId);
  check('C4. restart before sync: entry + video intact (cleanup never touches pending)',
    !!e4After && e4After.syncStatus === 'pending' && exists(s4.uri));

  /* ============ C5: cleanup-after-success sweep (growth prevention) ============ */
  // entry reaches 'completed' INSIDE the queue (e.g. cleanup failed earlier)
  const e5 = await queueApi.addQueuedAssessment({ athleteId: 'u1', sport: 'D', testType: 'agility_t_drill', idempotencyKey: 'C5' });
  const s5 = await storageApi.saveRecording('C5', e5.localId, { n: 5 });
  await queueApi.updateQueuedAssessment(e5.localId, { localVideoUri: s5.uri, syncStatus: 'completed', serverId: 'srv-c5' });
  const cleaned = await storageApi.cleanupCompletedEntries();
  const e5After = (await qAll()).find(x => x.localId === e5.localId);
  check('C5. completed-in-queue entry: video reclaimed, reference dropped (entry remains, data valid)',
    cleaned === 1 && !exists(s5.uri) && !!e5After && e5After.localVideoUri === null);

  /* ============ C6: never-delete guards ============ */
  // pending
  const g1 = await queueApi.addQueuedAssessment({ athleteId: 'u1', sport: 'E', testType: 'landing_mechanics', idempotencyKey: 'C6a' });
  const g1s = await storageApi.saveRecording('C6a', g1.localId, { n: 6 });
  await queueApi.updateQueuedAssessment(g1.localId, { localVideoUri: g1s.uri }); // pending
  const del1 = await storageApi.deleteVideoForServerId('srv-nonexistent');
  // uploading
  const g2 = await queueApi.addQueuedAssessment({ athleteId: 'u1', sport: 'F', testType: 'countermovement_jump', idempotencyKey: 'C6b' });
  const g2s = await storageApi.saveRecording('C6b', g2.localId, { n: 7 });
  await queueApi.updateQueuedAssessment(g2.localId, { localVideoUri: g2s.uri, syncStatus: 'uploading' });
  // failed-retryable
  const g3 = await queueApi.addQueuedAssessment({ athleteId: 'u1', sport: 'G', testType: 'unilateral_squat', idempotencyKey: 'C6c' });
  const g3s = await storageApi.saveRecording('C6c', g3.localId, { n: 8 });
  await queueApi.updateQueuedAssessment(g3.localId, { localVideoUri: g3s.uri, syncStatus: 'failed', errorCategory: 'network', error: 'x' });
  // shared-file guard: two entries referencing the same URI
  await queueApi.updateQueuedAssessment(g2.localId, { localVideoUri: g1s.uri, syncStatus: 'pending' });
  check('C6a. pending video NOT deletable (deleteVideoIfSafe refuses)',
    (await storageApi.deleteVideoIfSafe(g1s.uri)) === false && exists(g1s.uri));
  // uploading entry: refuse cleanup through deleteVideoForServerId without confirm
  const g2guard = await storageApi.deleteVideoForServerId('srv-x', {});
  // processing entry with serverId: guard refuses unless confirmed
  await queueApi.updateQueuedAssessment(g2.localId, { syncStatus: 'processing', serverId: 'srv-g2' });
  const guardProcessing = await storageApi.deleteVideoForServerId('srv-g2'); // no confirmCompleted
  check('C6b. processing entry without server confirmation: cleanup REFUSED, video kept',
    guardProcessing === false && exists(g1s.uri) && g2guard === false);
  // failed-retryable video
  check('C6c. failed-retryable video kept (orphan cleanup never touches referenced files)',
    exists(g3s.uri));
  // unmanaged path never touched
  const foreign = path.join(CACHE_DIR, 'outside-user-file.json');
  fs.writeFileSync(foreign, 'user data');
  await storageApi.cleanupOrphanedVideos();
  check('C6d. files outside the managed dir NEVER deleted (user data safe)', fs.existsSync(foreign));
  // cleanup of referenced (failed) entry via cleanupCompletedEntries: untouched
  await storageApi.cleanupCompletedEntries();
  check('C6e. cleanupCompletedEntries touches ONLY completed (failed entry video still there)',
    exists(g3s.uri));
  // restore g2 ref
  await queueApi.updateQueuedAssessment(g2.localId, { localVideoUri: g2s.uri });

  /* ============ C7: cleanup failure resilience ============ */
  const e7 = await queueApi.addQueuedAssessment({ athleteId: 'u1', sport: 'H', testType: 'sprint_acceleration', idempotencyKey: 'C7' });
  const s7 = await storageApi.saveRecording('C7', e7.localId, { n: 9 });
  await queueApi.updateQueuedAssessment(e7.localId, { localVideoUri: s7.uri, syncStatus: 'completed', serverId: 'srv-c7' });
  failDeletes = true; // make every deletion throw
  const cleanedFail = await storageApi.cleanupCompletedEntries();
  const e7DuringFail = (await qAll()).find(x => x.localId === e7.localId);
  check('C7a. cleanup failure: entry remains VALID (completed + synchronized), reference + file kept for retry',
    cleanedFail === 0 && !!e7DuringFail && e7DuringFail.syncStatus === 'completed' &&
    e7DuringFail.localVideoUri === s7.uri && exists(s7.uri));
  failDeletes = false;
  await storageApi.cleanupCompletedEntries(); // next sweep succeeds
  const e7After = (await qAll()).find(x => x.localId === e7.localId);
  check('C7b. next sweep reclaims the file once deletion works again',
    !exists(s7.uri) && e7After && e7After.localVideoUri === null);

  /* ============ C8: storage growth prevention over many cycles ============ */
  let filesBefore = 0;
  const countFiles = () => fs.readdirSync(DIR).filter(f => !f.endsWith('.tmp')).length;
  filesBefore = countFiles();
  for (let i = 0; i < 5; i++) {
    const e = await queueApi.addQueuedAssessment({ athleteId: 'u1', sport: 'I', testType: 'unilateral_squat', idempotencyKey: `C8-${i}` });
    const s = await storageApi.saveRecording(`C8-${i}`, e.localId, { n: i });
    await queueApi.updateQueuedAssessment(e.localId, { localVideoUri: s.uri });
    await engineApi.syncPendingAssessments();
    const qe8 = (await qAll()).find(x => x.localId === e.localId);
    serverDb.get(qe8.serverId).status = 'completed';
    await engineApi.syncPendingAssessments(); // reconcile + cleanup
  }
  const filesAfter = countFiles();
  check('C8. five full lifecycle cycles: zero net video-file growth',
    filesAfter === filesBefore,
    );

  console.log('\n=== Phase 11: Storage Cleanup - verification ===');
  results.forEach(r => console.log(r));
  console.log(`---\n${passed} passed, ${failed} failed`);
  try { fs.rmSync(CACHE_DIR, { recursive: true, force: true }); fs.unlinkSync(storeFile); } catch {}
  process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  results.push('CRASH ' + (err && err.stack ? err.stack.split('\n').slice(0, 5).join(' | ') : err));
  console.log('\n=== Phase 11: Storage Cleanup - verification ===');
  results.forEach(r => console.log(r));
  console.log(`---\n${passed} passed, ${failed} failed`);
  try { fs.rmSync(CACHE_DIR, { recursive: true, force: true }); fs.unlinkSync(storeFile); } catch {}
  process.exit(1);
});
