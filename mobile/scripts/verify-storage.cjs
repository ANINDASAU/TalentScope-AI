/**
 * Phase 3 verification: local video storage (storageManager).
 * Uses REAL disk files (OS temp dir) for the expo-file-system mock, so
 * existence/size/persistence across "restarts" (fresh module instances with
 * the same disk + AsyncStorage file) are genuine.
 *
 * Covers: save->exists->reference->restart->valid, corrupted file, overwrite
 * protection, delete guards (pending keeps, failed keeps, completed deletes),
 * foreign-path refusal, tmp/orphan cleanup, insufficient storage, invalid
 * URIs, integrity check marking, user-removal cleanup, storage report.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createHarness } = require('./harness.cjs');

const CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-storage-')) + path.sep;
fs.mkdirSync(path.join(CACHE_DIR, 'offline-assessments'), { recursive: true });

/* AsyncStorage mock persisted to a real file (survives "restart") */
const storeFile = path.join(__dirname, 'verify-storage-queue.json');
if (fs.existsSync(storeFile)) fs.unlinkSync(storeFile);
const memStore = fs.existsSync(storeFile) ? JSON.parse(fs.readFileSync(storeFile, 'utf8')) : {};
const asyncStorageMock = {
  setItem: async (k, v) => { memStore[k] = v; fs.writeFileSync(storeFile, JSON.stringify(memStore)); },
  getItem: async (k) => (k in memStore ? memStore[k] : null),
  removeItem: async (k) => { delete memStore[k]; fs.writeFileSync(storeFile, JSON.stringify(memStore)); },
  multiRemove: async (ks) => { ks.forEach(k => delete memStore[k]); }
};

/* expo-file-system mock over real disk */
let simulatedFreeBytes = 10 * 1024 * 1024 * 1024;
const toFsPath = uri => decodeURIComponent(String(uri).replace(/^file:\/\//, '').replace(/^file:/, ''));
const fsMock = {
  get cacheDirectory() { return `file://${CACHE_DIR}`; },
  makeDirectoryAsync: async (uri) => { fs.mkdirSync(toFsPath(uri), { recursive: true }); },
  writeAsStringAsync: async (uri, content) => { fs.writeFileSync(toFsPath(uri), content); },
  readAsStringAsync: async (uri) => fs.readFileSync(toFsPath(uri), 'utf8'),
  deleteAsync: async (uri) => { try { fs.unlinkSync(toFsPath(uri)); } catch {} },
  moveAsync: async ({ from, to }) => { fs.renameSync(toFsPath(from), toFsPath(to)); },
  getInfoAsync: async (uri) => {
    try {
      const st = fs.statSync(toFsPath(uri));
      return { exists: true, isDirectory: st.isDirectory(), size: st.size };
    } catch { return { exists: false, isDirectory: false, size: undefined }; }
  },
  readDirectoryAsync: async (uri) => fs.readdirSync(toFsPath(uri)),
  getFreeDiskStorageAsync: async () => simulatedFreeBytes
};

const { loadTs } = createHarness({ asyncStorageMock, fsMock, platformOS: 'ios' });

let passed = 0, failed = 0;
const results = [];
const check = (name, cond) => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`); cond ? passed++ : failed++; };

(async () => {
  let SM = loadTs(path.resolve('src/services/storageManager'));
  let Q = loadTs(path.resolve('src/services/assessmentQueue'));
  const payload = (n) => ({ kind: 'talentscope-offline-recording', n, durationMs: 30000 });

  /* 1. Record -> save succeeds -> file exists on disk -> reference stored in queue */
  const e1 = await Q.addQueuedAssessment({ athleteId: 'u1', sport: 'Athletics', testType: 'unilateral_squat', idempotencyKey: 'u1:unilateral_squat:1000' });
  const s1 = await SM.saveRecording(e1.idempotencyKey, e1.localId, payload(1));
  check('1. saveRecording returns ok with managed URI', s1.ok === true && typeof s1.uri === 'string');
  await Q.updateQueuedAssessment(e1.localId, { localVideoUri: s1.uri });
  const q1 = await Q.getQueuedAssessmentById(e1.localId);
  check('1b. queue entry references the video URI', q1.localVideoUri === s1.uri);
  check('1c. video file physically exists on disk', fs.existsSync(toFsPath(s1.uri)));
  const probe1 = await SM.probeVideoReference(s1.uri);
  check('1d. probe reports ok', probe1.status === 'ok' && probe1.size > 0);

  /* 2. Stable reference: same key+localId -> same path */
  const s1b = await SM.saveRecording(e1.idempotencyKey, e1.localId, payload(1));
  check('2. stable reference: re-save maps to the identical URI', s1b.uri === s1.uri);

  /* 3. No overwrite between assessments */
  const e2 = await Q.addQueuedAssessment({ athleteId: 'u1', sport: 'Tennis', testType: 'sprint_acceleration', idempotencyKey: 'u1:sprint_acceleration:2000' });
  const s2 = await SM.saveRecording(e2.idempotencyKey, e2.localId, payload(2));
  await Q.updateQueuedAssessment(e2.localId, { localVideoUri: s2.uri });
  check('3. different assessments -> different video files', s2.uri !== s1.uri && fs.existsSync(toFsPath(s2.uri)));

  /* 4. App restart: fresh module instances, same disk + storage -> valid */
  SM = loadTs(path.resolve('src/services/storageManager'));
  Q = loadTs(path.resolve('src/services/assessmentQueue'));
  const qAfterRestart = await Q.getQueuedAssessmentById(e1.localId);
  const probeAfterRestart = await SM.probeVideoReference(qAfterRestart.localVideoUri);
  check('4. after restart: queue reference intact', qAfterRestart.localVideoUri === s1.uri);
  check('4b. after restart: probe still ok (file exists AND parses)', probeAfterRestart.status === 'ok');
  check('4c. after restart: second entry video also intact',
    (await SM.probeVideoReference((await Q.getQueuedAssessmentById(e2.localId)).localVideoUri)).status === 'ok');

  /* 5. Delete guard: pending entry's video NOT deletable */
  const delPending = await SM.deleteVideoIfSafe(qAfterRestart.localVideoUri);
  check('5. pending assessment: video NOT deleted', delPending === false && fs.existsSync(toFsPath(s1.uri)));

  /* 6. Failed entry: video kept */
  await Q.updateQueuedAssessment(e2.localId, { syncStatus: 'failed', error: 'network', errorCategory: 'network' });
  const delFailed = await SM.deleteVideoIfSafe((await Q.getQueuedAssessmentById(e2.localId)).localVideoUri);
  check('6. failed assessment: video kept until retry/removal policy', delFailed === false && fs.existsSync(toFsPath(s2.uri)));

  /* 7. Completed entry: deleted after confirmation */
  await Q.updateQueuedAssessment(e1.localId, { syncStatus: 'completed' });
  const delCompleted = await SM.deleteVideoIfSafe(s1.uri);
  check('7. completed assessment: video deleted after confirmation', delCompleted === true && !fs.existsSync(toFsPath(s1.uri)));

  /* 8. Unmanaged path refusal */
  const foreign = `file://${CACHE_DIR}..${path.sep}..${path.sep}outside-ref.json`;
  fs.writeFileSync(toFsPath(foreign), 'x');
  const delForeign = await SM.deleteVideoIfSafe(foreign);
  check('8. delete refused for paths outside the managed directory', delForeign === false && fs.existsSync(toFsPath(foreign)));

  /* 9. Corrupted file detection */
  const e3 = await Q.addQueuedAssessment({ athleteId: 'u1', sport: 'Cricket', testType: 'posture_alignment', idempotencyKey: 'u1:posture:3000' });
  const s3 = await SM.saveRecording(e3.idempotencyKey, e3.localId, payload(3));
  await Q.updateQueuedAssessment(e3.localId, { localVideoUri: s3.uri });
  fs.writeFileSync(toFsPath(s3.uri), '{ this is truncated');
  check('9. corrupted file detected (status corrupt)', (await SM.probeVideoReference(s3.uri)).status === 'corrupt');

  /* 10. verifyQueueIntegrity marks broken entries */
  const integrity = await SM.verifyQueueIntegrity();
  const q3after = await Q.getQueuedAssessmentById(e3.localId);
  check('10. integrity check marks corrupt entry failed with honest error',
    integrity.broken.some(b => b.localId === e3.localId) && q3after.syncStatus === 'failed' && /damaged/i.test(q3after.error));

  /* 11. Missing file detection */
  const e4 = await Q.addQueuedAssessment({ athleteId: 'u1', sport: 'Badminton', testType: 'agility_t_drill', idempotencyKey: 'u1:agility:4000' });
  const s4 = await SM.saveRecording(e4.idempotencyKey, e4.localId, payload(4));
  await Q.updateQueuedAssessment(e4.localId, { localVideoUri: s4.uri });
  fs.unlinkSync(toFsPath(s4.uri));
  check('11. missing file detected', (await SM.probeVideoReference(s4.uri)).status === 'missing');

  /* 12. Invalid URI handling */
  check('12a. null URI -> invalid_uri', (await SM.probeVideoReference(null)).status === 'invalid_uri');
  check('12b. outside-directory URI -> invalid_uri', (await SM.probeVideoReference('file:///etc/passwd')).status === 'invalid_uri');
  const sBad = await SM.saveRecording('weird key with spaces & symbols!', 'local-id 42', payload(5));
  check('12c. odd keys still produce a valid save', sBad.ok === true);

  /* 13. Temp artifacts + orphans cleaned */
  fs.writeFileSync(path.join(CACHE_DIR, 'offline-assessments', 'interrupted.tmp'), 'partial');
  fs.writeFileSync(path.join(CACHE_DIR, 'offline-assessments', 'orphan-123.json'), '{}');
  const removed = await SM.cleanupOrphanedVideos();
  check('13. orphan + tmp artifacts removed',
    !fs.existsSync(path.join(CACHE_DIR, 'offline-assessments', 'interrupted.tmp')) &&
    !fs.existsSync(path.join(CACHE_DIR, 'offline-assessments', 'orphan-123.json')) && removed >= 2);

  /* 14. Insufficient storage refused BEFORE writing */
  simulatedFreeBytes = 10 * 1024 * 1024;
  const e5 = await Q.addQueuedAssessment({ athleteId: 'u1', sport: 'Football', testType: 'landing_mechanics', idempotencyKey: 'u1:landing:5000' });
  const s5 = await SM.saveRecording(e5.idempotencyKey, e5.localId, payload(6));
  check('14. insufficient storage: save refused with clear error', s5.ok === false && s5.error === 'insufficient_storage');
  simulatedFreeBytes = 10 * 1024 * 1024 * 1024;

  /* 15. User removal -> leftover video becomes orphan -> cleaned */
  await Q.removeQueuedAssessment(e3.localId);
  await SM.cleanupOrphanedVideos();
  check('15. after user removal, leftover video cleaned as orphan', !fs.existsSync(toFsPath(s3.uri)));

  /* 16. Storage report API */
  const report = await SM.getOfflineStorageSummary();
  check('16. storage summary counts remaining videos', report.queuedVideos >= 0 && report.freeBytes > 0);

  console.log('\n=== Phase 3: Local Video Storage - verification ===');
  results.forEach(r => console.log(r));
  console.log(`---\n${passed} passed, ${failed} failed`);
  try { fs.rmSync(CACHE_DIR, { recursive: true, force: true }); fs.unlinkSync(storeFile); } catch {}
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
  results.push('CRASH ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
  console.log('\n=== Phase 3: Local Video Storage - verification ===');
  results.forEach(r => console.log(r));
  console.log(`---\n${passed} passed, ${failed} failed`);
  try { fs.rmSync(CACHE_DIR, { recursive: true, force: true }); fs.unlinkSync(storeFile); } catch {}
  process.exit(1);
});
