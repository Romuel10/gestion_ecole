const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const repoRequire = createRequire(path.join(root, 'package.json'));
const ts = repoRequire('typescript');

function memoryStorage() {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key,value) => map.set(key,String(value)), removeItem: key => map.delete(key), clear: () => map.clear(), map };
}

function createHarness(globals = {}, overrides = {}) {
  const cache = new Map();
  const localStorage = globals.localStorage ?? memoryStorage();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename);
    const source = fs.readFileSync(filename,'utf8').replace(/import\.meta\.env/g, '({})');
    const code = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    const module = { exports: {} };
    const customRequire = id => {
      if (Object.hasOwn(overrides,id)) return overrides[id];
      if (id.startsWith('.')) {
        let resolved = path.resolve(path.dirname(filename),id);
        if (!path.extname(resolved)) resolved += '.ts';
        return load(path.relative(root,resolved));
      }
      return repoRequire(id);
    };
    cache.set(filename,module.exports);
    vm.runInNewContext(code, {
      exports: module.exports, module, require: customRequire, console: { log() {}, warn() {}, error() {} },
      Date, Math, Set, Map, JSON, Number, String, URL, Request, Response, Headers, File, FormData,
      TextEncoder, TextDecoder, structuredClone, crypto: globalThis.crypto, setTimeout, clearTimeout,
      localStorage, window: {}, ...globals,
    }, { filename });
    return module.exports;
  }
  return { load, localStorage };
}

function schoolFixture() {
  const { INITIAL_DATA } = createHarness().load('src/data/initialData.ts');
  const db = structuredClone(INITIAL_DATA);
  db.currentSchoolYearId='year-test'; db.currentTermCode='T1';
  db.schoolYears=[{id:'year-test',label:'2026-2027',startDate:'2026-09-01',endDate:'2027-06-30',isCurrent:true,status:'ACTIVE',terms:[{id:'term-test',code:'T1',label:'T1',startDate:'2026-09-01',endDate:'2026-12-31',weight:1,isLocked:false}]}];
  db.subjects=[{id:'math-test',code:'MAT',name:'Mathématiques',defaultCoeff:1}];
  db.teachers=[{id:'teacher-test',matricule:'PROF001',firstName:'Prof',lastName:'FICTIF',status:'ACTIF'}];
  db.classes=[{id:'class-test',code:'C1',name:'Classe fictive',room:'A',capacity:40,subjects:[{subjectId:'math-test',coefficient:1,teacherId:'teacher-test',weeklyHours:3}],monthlyTuitionFee:50000,registrationFee:0,reRegistrationFee:0}];
  db.students=[{id:'student-test',matricule:'TEST001',lastName:'FICTIF',firstName:'Eleve',classId:'class-test',schoolYearId:'year-test',status:'INSCRIT',birthDate:'2015-01-01'}];
  return db;
}
exports.createHarness=createHarness;
exports.memoryStorage=memoryStorage;
exports.schoolFixture=schoolFixture;
