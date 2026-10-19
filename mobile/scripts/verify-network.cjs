/**
 * Phase 1 verification: network connectivity detection.
 * Runs the REAL network.ts service logic in Node with mocked NetInfo/AppState.
 *
 * Covers: initial unknown state, startup reading, ONLINE->OFFLINE,
 * OFFLINE->ONLINE confirmation, flap suppression, foreground re-check,
 * unreachable-wifi, ambiguous readings, idempotent init, unsubscribe.
 *
 * Usage: node scripts/verify-network.cjs   (from mobile/)
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');

/* ------------------------------------------------------------------ mocks */
const netInfoSubscribers = []; // NetInfo supports multiple subscribers
const netInfoState = { isConnected: true, isInternetReachable: null };
const appStateHandlers = [];

const netinfoMock = {
  fetch: () => Promise.resolve({ ...netInfoState }),
  addEventListener: cb => {
    netInfoSubscribers.push(cb);
    return () => {
      const i = netInfoSubscribers.indexOf(cb);
      if (i >= 0) netInfoSubscribers.splice(i, 1);
    };
  }
};
const reactNativeMock = {
  AppState: {
    addEventListener: (evt, cb) => {
      if (evt === 'change') appStateHandlers.push(cb);
      return { remove: () => {} };
    }
  }
};

/* Inject mocks into the module cache BEFORE the service is loaded */
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === '@react-native-community/netinfo') {
    return path.join(ROOT, 'node_modules', '@react-native-community', 'netinfo');
  }
  if (request === 'react-native') {
    return path.join(ROOT, 'node_modules', 'react-native');
  }
  return origResolve.call(this, request, ...args);
};
const mockModule = (id, exports) => {
  const m = new Module(id, null);
  m.filename = id;
  m.exports = exports;
  require.cache[id] = m;
};
mockModule(path.join(ROOT, 'node_modules', '@react-native-community', 'netinfo'), netinfoMock);
mockModule(path.join(ROOT, 'node_modules', 'react-native'), reactNativeMock);
mockModule(path.join(ROOT, 'node_modules', 'react-native', 'index.js'), reactNativeMock);

/* ---------------------------------------------- compile + load network.ts */
const babel = require(path.join(ROOT, 'node_modules', '@babel', 'core'));
const tsPlugin = require(path.join(ROOT, 'node_modules', '@babel', 'plugin-transform-typescript'));
const cjsPlugin = require(path.join(ROOT, 'node_modules', '@babel', 'plugin-transform-modules-commonjs'));

const loadService = () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'services', 'network.ts'), 'utf8');
  const { code } = babel.transformSync(src, {
    filename: 'network.ts',
    presets: [],
    plugins: [
      [tsPlugin, { allowDeclareFields: true }],
      [cjsPlugin, { strictNamespace: false }]
    ],
    configFile: false,
    babelrc: false
  });
  const m = new Module('network.ts', null);
  m.filename = path.join(ROOT, 'src', 'services', 'network.ts');
  m.paths = [path.join(ROOT, 'node_modules')];
  m._compile(code, m.filename);
  return m.exports;
};

/* ------------------------------------------------------------- assertions */
let passed = 0, failed = 0;
const results = [];
const check = (name, cond) => {
  results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  cond ? passed++ : failed++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const net = loadService();
  const emit = () => netInfoSubscribers.forEach(cb => cb({ ...netInfoState }));

  /* 1. Initial network state is correct: unknown before any reading */
  check('1. initial state is unknown/initializing', net.getNetworkStatus() === 'unknown');
  check('1b. isOnline() false while unknown', net.isOnline() === false);

  /* 2. Startup: init resolves unknown -> online with a real reading */
  netInfoState.isInternetReachable = true; // definitive reading
  net.initNetworkListener();
  await sleep(20);
  check('2. startup reading promotes unknown -> online', net.getNetworkStatus() === 'online');

  /* 2d. startup with unresolved reachability (null — web/emulator): still online */
  const net2 = loadService();
  netInfoState.isConnected = true;
  netInfoState.isInternetReachable = null;
  net2.initNetworkListener();
  await sleep(30);
  check('2d. unresolved reachability at startup: treated as online candidate (never stuck unknown)',
    net2.getNetworkStatus() === 'online');

  /* 3. Disconnect updates state (ONLINE -> OFFLINE immediate) */
  let seen = [];
  const unsub = net.subscribeToNetwork(s => seen.push(s));
  netInfoState.isConnected = false;
  netInfoState.isInternetReachable = false;
  emit();
  check('3. ONLINE -> OFFLINE updates immediately',
    net.getNetworkStatus() === 'offline' && seen[seen.length - 1] === 'offline');

  /* 4. Reconnect updates state (OFFLINE -> ONLINE via confirmation) */
  netInfoState.isConnected = true;
  netInfoState.isInternetReachable = true;
  emit();
  await sleep(100);
  check('4a. OFFLINE -> ONLINE not applied before confirmation window', net.getNetworkStatus() === 'offline');
  await sleep(2100);
  check('4b. OFFLINE -> ONLINE applied after stable window', net.getNetworkStatus() === 'online');
  check('4c. listeners were notified of online transition', seen[seen.length - 1] === 'online');

  /* 5. Temporary interruption: flap during confirmation is suppressed */
  netInfoState.isConnected = false;
  netInfoState.isInternetReachable = false;
  emit();
  await sleep(30);
  netInfoState.isConnected = true;
  netInfoState.isInternetReachable = true;
  emit();
  await sleep(600);
  netInfoState.isConnected = false;
  netInfoState.isInternetReachable = false;
  emit();
  await sleep(50);
  check('5. brief interruption mid-confirmation stays offline (no flap)', net.getNetworkStatus() === 'offline');

  /* 6. Network restoration after longer outage (full confirmation cycle) */
  netInfoState.isConnected = true;
  netInfoState.isInternetReachable = true;
  emit();
  await sleep(2200);
  check('6. restoration after outage -> online', net.getNetworkStatus() === 'online');

  /* 7. App returning from background triggers a re-check */
  netInfoState.isConnected = false;
  netInfoState.isInternetReachable = false;
  emit();
  await sleep(30);
  check('7a. pre-background state offline', net.getNetworkStatus() === 'offline');
  netInfoState.isConnected = true;
  netInfoState.isInternetReachable = true;
  appStateHandlers.forEach(h => h('active')); // simulate foreground
  await sleep(2200);
  check('7b. foreground re-check restores online', net.getNetworkStatus() === 'online');

  /* 8. Connected wifi without internet => offline (captive portal case) */
  netInfoState.isConnected = true;
  netInfoState.isInternetReachable = false;
  emit();
  await sleep(30);
  check('8. connected-but-unreachable => offline', net.getNetworkStatus() === 'offline');

  /* 9. Ambiguous reading (reachability still resolving) keeps previous state */
  netInfoState.isConnected = true;
  netInfoState.isInternetReachable = true;
  emit();
  await sleep(2200);
  check('9a. back online before ambiguity test', net.getNetworkStatus() === 'online');
  netInfoState.isInternetReachable = null;
  emit();
  await sleep(50);
  check('9b. ambiguous reading keeps previous state (online)', net.getNetworkStatus() === 'online');

  /* 10. Idempotent init + unsubscribe work */
  check('10a. initNetworkListener is idempotent', (() => {
    const before = net.getNetworkStatus();
    net.initNetworkListener(); // second call must not throw / re-wire
    return net.getNetworkStatus() === before;
  })());
  const seenLen = seen.length;
  unsub();
  netInfoState.isConnected = false;
  netInfoState.isInternetReachable = false;
  emit();
  await sleep(30);
  check('10b. unsubscribed listener no longer receives updates', seen.length === seenLen);
  check('10c. service state still updates after unsubscribe (banner consumers intact)',
    net.getNetworkStatus() === 'offline');
})().catch(e => {
  results.push('CRASH ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
  failed++;
}).finally(() => {
  console.log('\n=== Phase 1: Network Connectivity - verification ===');
  results.forEach(r => console.log(r));
  console.log(`---\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
});
