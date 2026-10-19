/**
 * Phase 2 verification: persistent local assessment queue.
 * Runs the REAL assessmentQueue.ts logic in Node with a mocked AsyncStorage
 * (localStorage-backed). "App restart" is simulated by re-importing the module
 * fresh (module-level state reset) while storage persists — exactly what a
 * cold app restart does.
 *
 * Covers spec: add, retrieve, update status, persistence across restart,
 * multiple assessments, duplicate prevention, individual lookup, remove,
 * clearCompleted, failed-entry preservation, concurrent mutation safety.
 *
 * Usage: node scripts/verify-queue.cjs   (from mobile/)
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');

/* Expo globals available at runtime under Metro */
(global).opencode = (global).opencode || {};
global.__DEV__ = true;

/* ------------------------------------------------ AsyncStorage mock (persistent) */
const storeFile = path.join(__dirname, 'verify-queue-storage.json');
if (fs.existsSync(storeFile)) fs.unlinkSync(storeFile);
const memStore = {};
const asyncStorageMock = {
  setItem: async (k, v) => { memStore[k] = v; fs.writeFileSync(storeFile, JSON.stringify(memStore)); },
  getItem: async (k) => (k in memStore ? memStore[k] : null),
  removeItem: async (k) => { delete memStore[k]; fs.writeFileSync(storeFile, JSON.stringify(memStore)); },
  multiRemove: async (ks) => { ks.forEach(k => delete memStore[k]); }
};

/* Inject mock into module cache BEFORE the service loads */
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === '@react-native-async-storage/async-storage') {
    return path.join(ROOT, 'node_modules', '@react-native-async-storage', 'async-storage');
  }
  return origResolve.call(this, request, ...args);
};
const mockModule = (id, exports) => {
  const m = new Module(id, null);
  m.filename = id;
  m.exports = exports;
  require.cache[id] = m;
};
mockModule(
  path.join(ROOT, 'node_modules', '@react-native-async-storage', 'async-storage'),
  asyncStorageMock
);

/* Compile + load assessmentQueue.ts (fresh instance = "restarted app") */
const babel = require(path.join(ROOT, 'node_modules', '@babel', 'core'));
const tsPlugin = require(path.join(ROOT, 'node_modules', '@babel', 'plugin-transform-typescript'));
const cjsPlugin = require(path.join(ROOT, 'node_modules', '@babel', 'plugin-transform-modules-commonjs'));

const loadFreshQueue = () => {
  delete require.cache[path.join(ROOT, 'src', 'services', 'assessmentQueue.ts')];
  const src = fs.readFileSync(path.join(ROOT, 'src', 'services', 'assessmentQueue.ts'), 'utf8');
  const { code } = babel.transformSync(src, {
    filename: 'assessmentQueue.ts',
    presets: [],
    plugins: [[tsPlugin, { allowDeclareFields: true }], [cjsPlugin, { strictNamespace: false }]],
    configFile: false,
    babelrc: false
  });
  const m = new Module('assessmentQueue.ts', null);
  m.filename = path.join(ROOT, 'src', 'services', 'assessmentQueue.ts');
  m.paths = [path.join(ROOT, 'node_modules')];
  m._compile(code, m.filename);
  return m.exports;
};

/* Assertions */
let passed = 0, failed = 0;
const results = [];
const check = (name, cond) => {
  results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  cond ? passed++ : failed++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let Q = loadFreshQueue();

  /* 1. add assessment */
  const a1 = await Q.addQueuedAssessment({
    athleteId: 'user-1',
    sport: 'Basketball',
    testType: 'countermovement_jump',
    localVideoUri: 'file:///cache/offline-assessments/k1.json',
    idempotencyKey: 'user-1:countermovement_jump:1'
  });
  check('1. add: returns entry with localId', typeof a1.localId === 'string' && a1.localId.length > 0);
  check('1b. add: initial state pending', a1.syncStatus === 'pending');
  check('1c. add: fields persisted (sport/testType/video/timestamps/retryCount)',
    a1.sport === 'Basketball' && a1.testType === 'countermovement_jump' &&
    a1.localVideoUri === 'file:///cache/offline-assessments/k1.json' &&
    !!a1.createdAt && a1.retryCount === 0 && a1.lastSyncAttemptAt === null && a1.error === null);

  /* 2. retrieve assessment (all + by id) */
  const all1 = await Q.getQueuedAssessments();
  check('2. getAssessments returns the entry', all1.length === 1 && all1[0].localId === a1.localId);
  const got = await Q.getQueuedAssessmentById(a1.localId);
  check('2b. getAssessmentById finds it', got !== null && got.idempotencyKey === 'user-1:countermovement_jump:1');
  const missing = await Q.getQueuedAssessmentById('nonexistent-id');
  check('2c. getAssessmentById returns null for unknown id', missing === null);

  /* 3. update status */
  const upd = await Q.updateQueuedAssessment(a1.localId, {
    syncStatus: 'uploading',
    retryCount: 1,
    lastSyncAttemptAt: new Date().toISOString(),
    error: 'connection lost mid-upload',
    errorCategory: 'network'
  });
  check('3. updateAssessment patches status/retry/error',
    upd.syncStatus === 'uploading' && upd.retryCount === 1 && upd.error === 'connection lost mid-upload');

  /* 4. multiple assessments supported */
  await Q.addQueuedAssessment({ athleteId: 'user-1', sport: 'Tennis', testType: 'sprint_acceleration', idempotencyKey: 'k2' });
  await Q.addQueuedAssessment({ athleteId: 'user-1', sport: 'Cricket', testType: 'posture_alignment', idempotencyKey: 'k3' });
  const all2 = await Q.getQueuedAssessments();
  check('4. multiple assessments coexist', all2.length === 3);

  /* 5. duplicate prevention */
  let dupRejected = false;
  try {
    await Q.addQueuedAssessment({ athleteId: 'user-1', sport: 'Tennis', testType: 'sprint_acceleration', idempotencyKey: 'k2' });
  } catch { dupRejected = true; }
  check('5. duplicate idempotencyKey rejected', dupRejected);
  const all3 = await Q.getQueuedAssessments();
  check('5b. queue unchanged after duplicate attempt', all3.length === 3);

  /* 6. concurrent adds (mutation lock) — no entry may be lost */
  await Promise.all([
    Q.addQueuedAssessment({ athleteId: 'user-1', sport: 'Athletics', testType: 'agility_t_drill', idempotencyKey: 'c1' }),
    Q.addQueuedAssessment({ athleteId: 'user-1', sport: 'Athletics', testType: 'landing_mechanics', idempotencyKey: 'c2' }),
    Q.addQueuedAssessment({ athleteId: 'user-1', sport: 'Athletics', testType: 'unilateral_squat', idempotencyKey: 'c3' })
  ]);
  const all4 = await Q.getQueuedAssessments();
  check('6. concurrent adds: no entries lost (lock works)', all4.length === 6);

  /* 7. close/reopen app: fresh module instance, storage persists */
  Q = loadFreshQueue(); // simulates restart
  const afterRestart = await Q.getQueuedAssessments();
  check('7. queue survives app restart', afterRestart.length === 6);
  const a1After = await Q.getQueuedAssessmentById(a1.localId);
  check('7b. entry content intact after restart (status still uploading, retryCount 1)',
    a1After !== null && a1After.syncStatus === 'uploading' && a1After.retryCount === 1);

  /* 8. state transitions through the lifecycle */
  await Q.updateQueuedAssessment(a1.localId, { syncStatus: 'processing', error: null, errorCategory: null });
  await Q.updateQueuedAssessment(a1.localId, { syncStatus: 'completed', serverId: 'srv-123' });
  const a1Done = await Q.getQueuedAssessmentById(a1.localId);
  check('8. lifecycle transitions work (completed + serverId)', a1Done.syncStatus === 'completed' && a1Done.serverId === 'srv-123');

  /* 9. failed entries preserved until explicit action */
  const failTarget = afterRestart.find(q => q.idempotencyKey === 'k2');
  await Q.updateQueuedAssessment(failTarget.localId, { syncStatus: 'failed', error: 'Server unavailable', errorCategory: 'server_unavailable' });
  const cleared1 = await Q.clearCompletedFromQueue();
  const afterClear = await Q.getQueuedAssessments();
  check('9. clearCompleted removes ONLY completed (failed preserved)',
    cleared1 === 1 && afterClear.length === 5 && afterClear.some(q => q.syncStatus === 'failed'));

  /* 10. remove individual assessment */
  const removed = await Q.removeQueuedAssessment(failTarget.localId);
  const afterRemove = await Q.getQueuedAssessments();
  check('10. removeAssessment removes exactly that entry', removed === true && afterRemove.length === 4 &&
    !afterRemove.some(q => q.localId === failTarget.localId));
  const removedAgain = await Q.removeQueuedAssessment(failTarget.localId);
  check('10b. removing nonexistent id returns false', removedAgain === false);

  /* 11. persistence of final state across another restart */
  Q = loadFreshQueue();
  const finalState = await Q.getQueuedAssessments();
  check('11. final state persists across second restart', finalState.length === 4);

  /* 12. countPendingQueued helper */
  const pending = await Q.countPendingQueued();
  check('12. countPendingQueued excludes completed', pending === 4);
})().catch(e => {
  results.push('CRASH ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
  failed++;
}).finally(() => {
  console.log('\n=== Phase 2: Local Assessment Queue - verification ===');
  results.forEach(r => console.log(r));
  console.log(`---\n${passed} passed, ${failed} failed`);
  try { fs.unlinkSync(storeFile); } catch {}
  process.exit(failed > 0 ? 1 : 0);
});
