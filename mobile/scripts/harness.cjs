/**
 * Shared harness: compiles + loads the mobile TS services in Node with mocks.
 * v2: global require hook so NESTED compiled modules (storageManager requiring
 * ./assessmentQueue, syncEngine requiring ./api etc.) resolve through the same
 * mock/compile pipeline. Optional per-file mocks: { './api': apiMock, ... }
 */
const path = require('path');
const fs = require('fs');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..');

function createHarness({ asyncStorageMock, fsMock, platformOS = 'ios', apiMock = null, networkMock = null, extraPackageMocks = {} }) {
  global.__DEV__ = false;

  const mockModule = (id, exports) => {
    const m = new Module(id, null);
    m.filename = id; m.exports = exports; require.cache[id] = m;
  };
  // neutralize real packages (UI primitives as inert stubs — render-free testing)
  mockModule(path.join(ROOT, 'node_modules', 'expo-file-system'), fsMock);
  mockModule(path.join(ROOT, 'node_modules', 'react-native'), {
    Platform: { OS: platformOS },
    View: 'View', Text: 'Text', Image: 'Image', ScrollView: 'ScrollView',
    TouchableOpacity: 'TouchableOpacity', ActivityIndicator: 'ActivityIndicator',
    StyleSheet: { create: (s) => s, absoluteFillObject: {}, absoluteFill: {}, hairlineWidth: 1 },
    Dimensions: { get: () => ({ width: 390, height: 844 }) },
    useWindowDimensions: () => ({ width: 390, height: 844 }),
    Animated: { Value: function () {}, loop: () => ({ start: () => {}, stop: () => {} }), sequence: () => ({}), timing: () => ({}) },
    Easing: { linear: 'linear' }
  });
  mockModule(path.join(ROOT, 'node_modules', '@react-native-async-storage', 'async-storage'), asyncStorageMock);
  // optional extra package mocks, e.g. { 'react-native-svg': {...}, '@expo/vector-icons': {...} }
  for (const [name, exp] of Object.entries(extraPackageMocks)) {
    try { mockModule(require.resolve(path.join(ROOT, 'node_modules', name, 'package.json'), { paths: [ROOT] }).replace(/[\\/]package\.json$/, ''), exp); }
    catch { mockModule(path.join(ROOT, 'node_modules', name), exp); }
  }

  const babel = require(path.join(ROOT, 'node_modules', '@babel', 'core'));
  const tsPlugin = require(path.join(ROOT, 'node_modules', '@babel', 'plugin-transform-typescript'));
  const cjsPlugin = require(path.join(ROOT, 'node_modules', '@babel', 'plugin-transform-modules-commonjs'));

  const SERVICE_MOCKS = {
    './api': apiMock,
    './network': networkMock
  };

  const compileCache = new Map();

  const loadTs = (file) => {
    if (compileCache.has(file)) return compileCache.get(file).exports;
    // resolve .ts first, then .tsx
    let srcFile = null;
    if (fs.existsSync(file + '.ts')) srcFile = file + '.ts';
    else if (fs.existsSync(file + '.tsx')) srcFile = file + '.tsx';
    else throw new Error('no TS source for: ' + file);
    const src = fs.readFileSync(srcFile, 'utf8');
    const isTsx = srcFile.endsWith('.tsx');
    const plugins = [[tsPlugin, isTsx
      ? { allowDeclareFields: true, isTSX: true, allExtensions: true, jsxPragma: 'React' }
      : { allowDeclareFields: true }],
      [cjsPlugin, { strictNamespace: false }]];
    if (isTsx) {
      plugins.push(
        [require(path.join(ROOT, 'node_modules', '@babel', 'plugin-syntax-jsx'))],
        [require(path.join(ROOT, 'node_modules', '@babel', 'plugin-transform-react-jsx')), { runtime: 'classic' }]
      );
    }
    const { code } = babel.transformSync(src, {
      filename: path.basename(srcFile), presets: [],
      plugins,
      configFile: false, babelrc: false
    });
    const m = new Module(file + '.ts', null);
    m.filename = file + '.ts';
    m.paths = Module._nodeModulePaths(path.dirname(file + '.ts'));
    // hook THIS module's require: relative TS files (./ and ../), then mocks,
    // then real node_modules
    const origReq = m.require.bind(m);
    m.require = (request) => {
      if (request.startsWith('.')) {
        const base = path.join(path.dirname(m.filename), request);
        // mocked sibling?
        const mock = SERVICE_MOCKS[request];
        if (mock !== null && mock !== undefined) return mock;
        // real sibling .ts?
        if (fs.existsSync(base + '.ts')) return loadTs(base);
      }
      return origReq(request);
    };
    m._compile(code, m.filename);
    compileCache.set(file, m);
    return m.exports;
  };

  // global resolve: force known packages to the mocked cache entries
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...args) {
    if (request === 'expo-file-system') return path.join(ROOT, 'node_modules', 'expo-file-system');
    if (request === '@react-native-async-storage/async-storage') return path.join(ROOT, 'node_modules', '@react-native-async-storage', 'async-storage');
    if (request === 'react-native') return path.join(ROOT, 'node_modules', 'react-native');
    if (Object.prototype.hasOwnProperty.call(extraPackageMocks, request)) {
      return path.join(ROOT, 'node_modules', request);
    }
    return origResolve.call(this, request, ...args);
  };

  return { loadTs, mocks: { asyncStorageMock } };
}

module.exports = { createHarness };
