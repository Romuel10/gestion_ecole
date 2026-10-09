import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { DatabaseSync } from 'node:sqlite';
import {
  createHarness,
  memoryStorage,
  schoolFixture,
} from './support/serviceLoader.cjs';

const loadExchange = () =>
  createHarness().load('src/shared/teacherExchange.ts');
const loadWorkspace = () =>
  createHarness().load('apps/teacher-mobile/src/shared/exchangeWorkspace.ts');
const fixture = () => {
  const db = schoolFixture();
  db.schoolConfig.offlineExchangeId = 'school-unique-test';
  db.schoolConfig.name = 'École fictive';
  return db;
};
function file(rows: Record<string, unknown>[], name: string) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), name);
  return workbookFile(book);
}
const workbookFile = (book: XLSX.WorkBook) => ({
  arrayBuffer: async () =>
    XLSX.write(book, { bookType: 'xlsx', type: 'array' }),
});
const grade = (patch: any = {}) => ({
  studentId: 'student-test',
  subjectId: 'math-test',
  termCode: 'T1',
  evaluations: [0, 12.5, 16],
  evaluationWeights: [1, 2, 3],
  examGrade: 14,
  teacherComment: 'Essai',
  baseFingerprint: 'ABSENT',
  ...patch,
});
const attendance = (patch: any = {}) => ({
  studentId: 'student-test',
  classId: 'class-test',
  date: '2026-10-09',
  type: 'RETARD',
  minutesLate: 10,
  reason: 'Transport',
  baseFingerprint: 'ABSENT',
  ...patch,
});

test('assistant : une installation neuve est guidée ; une école existante ou restaurée garde son accès', () => {
  const harness = createHarness();
  const { INITIAL_DATA } = harness.load('src/data/initialData.ts');
  const { needsFirstSetup } = harness.load('src/services/firstSetup.ts');
  assert.equal(needsFirstSetup(INITIAL_DATA), true);
  assert.equal(needsFirstSetup(fixture()), false);
  const configured = structuredClone(INITIAL_DATA);
  configured.schoolConfig.name = 'École déjà configurée';
  assert.equal(needsFirstSetup(configured), false);
  configured.schoolConfig.setupState = { step: 2 };
  assert.equal(needsFirstSetup(configured), true);
  configured.schoolConfig.setupState.completedAt = '2026-10-09T00:00:00Z';
  assert.equal(needsFirstSetup(configured), false);
});

test('assistant : dates, périodes, codes, effectifs et frais contrôlés avant validation', () => {
  const { setupErrors, finishFirstSetup, splitSetupTerms } =
    createHarness().load('src/services/firstSetup.ts');
  const db = fixture();
  db.schoolConfig.acronym = 'TEST';
  assert.equal(setupErrors(db, 4).length, 0);
  db.schoolYears[0].terms = splitSetupTerms(db.schoolYears[0]);
  assert.equal(db.schoolYears[0].terms[0].startDate, '2026-09-01');
  assert.equal(db.schoolYears[0].terms[2].endDate, '2027-06-30');
  const ready = finishFirstSetup(db);
  assert.ok(ready.schoolConfig.setupState.completedAt);
  assert.equal(
    ready.schoolConfig.offlineExchangeId,
    db.schoolConfig.offlineExchangeId,
  );
  assert.equal(ready.matriculeConfig.prefix, 'TEST');
  db.classes[0].monthlyTuitionFee = -1;
  assert.throws(() => finishFirstSetup(db), /frais scolaires/);
  db.classes[0].monthlyTuitionFee = 0;
  db.schoolYears[0].endDate = '2027-02-31';
  assert.throws(() => finishFirstSetup(db), /dates/);
});

test('enseignants : matricules générés, dates Excel civiles, listes de codes et décimales', async () => {
  const { parseTeachers } = createHarness().load(
    'src/services/teacherExcel.ts',
  );
  const db = fixture();
  const preview = await parseTeachers(
    file(
      [
        {
          Nom: 'Rakoto',
          Prénoms: 'Aina',
          Sexe: 'F',
          Contrat: 'VACATAIRE',
          Matières: 'MAT',
          Classes: 'C1',
          'Date embauche': new Date(2026, 8, 5),
          'Taux horaire': '12500,50',
          'Heures hebdomadaires': '3,5',
        },
        { Nom: 'Rabe', Prénoms: 'Solo', Sexe: 'M', Matricule: 'ENS-002' },
      ],
      'Enseignants',
    ),
    db,
  );
  assert.equal(preview.issues.length, 0);
  assert.equal(preview.teachers.length, 2);
  assert.equal(preview.teachers[0].hireDate, '2026-09-05');
  assert.equal(preview.teachers[0].hourlyRate, 12500.5);
  assert.equal(preview.teachers[0].weeklyAssignedHours, 3.5);
  assert.equal(preview.teachers[0].assignedClassIds[0], 'class-test');
  assert.equal(preview.teachers[0].specialtySubjectIds[0], 'math-test');
  assert.equal(preview.teachers[0].matricule, 'ENS-001');
});

test('enseignants : doublons, sexe, contrat, email, montant et codes inconnus bloquent tout import', async () => {
  const { parseTeachers } = createHarness().load(
    'src/services/teacherExcel.ts',
  );
  const preview = await parseTeachers(
    file(
      [
        {
          Matricule: 'PROF001',
          Nom: 'Test',
          Prénoms: 'A',
          Sexe: 'X',
          Contrat: 'INCONNU',
          Email: 'incorrect',
          Matières: 'ZZZ',
          Classes: 'Inconnue',
          'Salaire mensuel': '-50',
          'Date embauche': '31-02-2026',
        },
      ],
      'Enseignants',
    ),
    fixture(),
  );
  assert.equal(preview.teachers.length, 0);
  assert.ok(preview.issues.length >= 8);
  const duplicates = await parseTeachers(
    file(
      [
        { Matricule: 'NOUVEAU', Nom: 'Test', Prénoms: 'A', Sexe: 'F' },
        { Matricule: 'nouveau', Nom: 'Test', Prénoms: 'B', Sexe: 'M' },
      ],
      'Enseignants',
    ),
    fixture(),
  );
  assert.ok(
    duplicates.issues.some((item: any) => /déjà utilisé/.test(item.message)),
  );
});

test('enseignants : une modification entre prévisualisation et confirmation est protégée', async () => {
  const { parseTeachers } = createHarness().load(
    'src/services/teacherExcel.ts',
  );
  const db = fixture();
  const preview = await parseTeachers(
    file(
      [{ Matricule: 'ENS-100', Nom: 'Test', Prénoms: 'A', Sexe: 'F' }],
      'Enseignants',
    ),
    db,
  );
  db.teachers.push(preview.teachers[0]);
  assert.throws(() => preview.validateCurrent(db), /matricule/);
});

test('fichier de l’école : seulement les affectations du professeur, sans salaires ni contacts familiaux', () => {
  const exchange = loadExchange();
  const db = fixture();
  db.classes.push({
    ...db.classes[0],
    id: 'other-class',
    code: 'AUTRE',
    subjects: [
      { subjectId: 'math-test', coefficient: 1, teacherId: 'other-teacher' },
    ],
  });
  db.students.push({
    ...db.students[0],
    id: 'other-student',
    matricule: 'AUTRE',
    classId: 'other-class',
    fatherPhone: 'PRIVATE',
  });
  db.teachers[0].baseMonthlySalary = 1234567;
  db.teachers[0].cinNumber = 'SECRET';
  db.teachers[0].assignedClassIds = ['class-test', 'other-class'];
  db.teachers[0].specialtySubjectIds = ['math-test'];
  const data = exchange.makeTeacherPackage(db, db.teachers[0]);
  assert.equal(data.students.length, 1);
  assert.equal(data.assignments.length, 1);
  const decoded = exchange.readTeacherPackage(
    exchange.readExchangeWorkbook(
      XLSX.write(exchange.teacherPackageWorkbook(data), {
        bookType: 'xlsx',
        type: 'array',
      }),
    ),
  );
  assert.equal(decoded.school.id, 'school-unique-test');
  assert.equal(decoded.students[0].matricule, 'TEST001');
  assert.doesNotMatch(
    JSON.stringify(decoded),
    /1234567|SECRET|PRIVATE|other-student/,
  );
});

test('fichier de l’école : identifiant d’école, affectations et format requis', () => {
  const exchange = loadExchange();
  const db = fixture();
  delete db.schoolConfig.offlineExchangeId;
  assert.throws(
    () => exchange.makeTeacherPackage(db, db.teachers[0]),
    /identifiant/,
  );
  db.schoolConfig.offlineExchangeId = 'unique';
  db.classes[0].subjects[0].teacherId = 'autre';
  assert.throws(
    () => exchange.makeTeacherPackage(db, db.teachers[0]),
    /Affectez/,
  );
  assert.throws(
    () => exchange.readTeacherPackage(XLSX.utils.book_new()),
    /fichier de préparation/,
  );
});

test('échange de notes : zéro, décimales, trois contrôles et coefficients conservés ; import répété sans doublon', async () => {
  const exchange = loadExchange();
  const db = fixture();
  const data = exchange.makeTeacherPackage(db, db.teachers[0]);
  const workbook = exchange.teacherResultsWorkbook(data, [grade()], []);
  const { ExcelImportService } = createHarness().load(
    'src/services/excelImporter.ts',
  );
  const preview = await ExcelImportService.parseGrades(
    workbookFile(workbook),
    db,
  );
  assert.equal(preview.issues.length, 0);
  assert.equal(preview.grades.length, 1);
  assert.equal(JSON.stringify(preview.grades[0].evaluations), '[0,12.5,16]');
  assert.equal(JSON.stringify(preview.grades[0].evaluationWeights), '[1,2,3]');
  assert.equal(preview.grades[0].subjectAverage, 13.39);
  db.grades = preview.grades;
  const repeated = await ExcelImportService.parseGrades(
    workbookFile(workbook),
    db,
  );
  assert.equal(repeated.issues.length, 0);
  assert.equal(repeated.grades[0].id, db.grades[0].id);
});

test('échange : fichiers d’une autre école, année, enseignant ou classe refusés', () => {
  const exchange = loadExchange();
  const db = fixture();
  const data = exchange.makeTeacherPackage(db, db.teachers[0]);
  for (const property of ['school', 'schoolYear', 'teacher']) {
    const wrong = structuredClone(data);
    wrong[property].id = 'AUTRE';
    const result = exchange.parseTeacherResults(
      exchange.teacherResultsWorkbook(wrong, [grade()], []),
      db,
      'grades',
    );
    assert.ok(result.issues.length);
  }
  const workbook = exchange.teacherResultsWorkbook(data, [grade()], []);
  workbook.Sheets.Notes.C2.v = 'AUTRE';
  assert.ok(exchange.parseTeacherResults(workbook, db, 'grades').issues.length);
});

test('échange : contrôle >20, texte et période verrouillée refusés ; aucune cellule vide convertie en zéro', () => {
  const exchange = loadExchange();
  const db = fixture();
  const data = exchange.makeTeacherPackage(db, db.teachers[0]);
  for (const evaluations of [[21], ['erreur']])
    assert.ok(
      exchange.parseTeacherResults(
        exchange.teacherResultsWorkbook(data, [grade({ evaluations })], []),
        db,
        'grades',
      ).issues.length,
    );
  const empty = exchange.parseTeacherResults(
    exchange.teacherResultsWorkbook(
      data,
      [grade({ evaluations: [], examGrade: undefined })],
      [],
    ),
    db,
    'grades',
  );
  assert.equal(empty.grades.length, 0);
  assert.equal(empty.warnings.length, 1);
  db.schoolYears[0].terms[0].isLocked = true;
  assert.ok(
    exchange.parseTeacherResults(
      exchange.teacherResultsWorkbook(data, [grade()], []),
      db,
      'grades',
    ).issues.length,
  );
});

test('échange : modification locale concurrente et suppression d’une ancienne fiche protégées', () => {
  const exchange = loadExchange();
  const db = fixture();
  const data = exchange.makeTeacherPackage(db, db.teachers[0]);
  const workbook = exchange.teacherResultsWorkbook(data, [grade()], []);
  db.grades = [
    {
      ...grade({ evaluations: [17] }),
      id: 'local',
      classId: 'class-test',
      schoolYearId: db.currentSchoolYearId,
    },
  ];
  assert.match(
    exchange.parseTeacherResults(workbook, db, 'grades').issues[0].message,
    /modifiées/,
  );
  const baseline = exchange.makeTeacherPackage(db, db.teachers[0]);
  const entry = grade({ baseFingerprint: baseline.grades[0].baseFingerprint });
  db.grades = [];
  assert.ok(
    exchange.parseTeacherResults(
      exchange.teacherResultsWorkbook(baseline, [entry], []),
      db,
      'grades',
    ).issues.length,
  );
});

test('appels : date civile Excel, retard entier et mises à jour sans doublons', async () => {
  const { parseAttendance } = createHarness().load(
    'src/services/attendanceExcel.ts',
  );
  const db = fixture();
  const preview = await parseAttendance(
    file(
      [
        {
          Matricule: 'TEST001',
          Classe: 'C1',
          Date: new Date(2026, 9, 9),
          Statut: 'R',
          'Minutes retard': 10,
          Motif: 'Transport',
        },
      ],
      'Appels',
    ),
    db,
  );
  assert.equal(preview.issues.length, 0);
  assert.equal(preview.records[0].date, '2026-10-09');
  assert.equal(preview.records[0].type, 'RETARD');
  db.attendanceRecords = preview.records;
  const updated = await parseAttendance(
    file(
      [{ Matricule: 'TEST001', Classe: 'C1', Date: '09-10-2026', Statut: 'P' }],
      'Appels',
    ),
    db,
  );
  assert.equal(updated.records[0].id, db.attendanceRecords[0].id);
  assert.equal(updated.records[0].type, 'PRESENT');
});

test('appels : date impossible, statut inconnu, retard fractionnaire et doublons refusés', async () => {
  const { parseAttendance } = createHarness().load(
    'src/services/attendanceExcel.ts',
  );
  const base = {
    Matricule: 'TEST001',
    Classe: 'C1',
    Date: '09-10-2026',
    Statut: 'P',
  };
  for (const patch of [
    { Date: '31-02-2027' },
    { Statut: 'INCONNU' },
    { Statut: 'R', 'Minutes retard': 1.5 },
    { Date: '09-10-2025' },
  ])
    assert.ok(
      (
        await parseAttendance(
          file([{ ...base, ...patch }], 'Appels'),
          fixture(),
        )
      ).issues.length,
    );
  assert.ok(
    (await parseAttendance(file([base, base], 'Appels'), fixture())).issues
      .length,
  );
});

test('échange d’appels : répétition identique acceptée, correction concurrente protégée', async () => {
  const exchange = loadExchange();
  const db = fixture();
  const data = exchange.makeTeacherPackage(db, db.teachers[0]);
  const workbook = exchange.teacherResultsWorkbook(data, [], [attendance()]);
  const { parseAttendance } = createHarness().load(
    'src/services/attendanceExcel.ts',
  );
  const preview = await parseAttendance(workbookFile(workbook), db);
  assert.equal(preview.issues.length, 0);
  db.attendanceRecords = preview.records;
  assert.equal(
    (await parseAttendance(workbookFile(workbook), db)).issues.length,
    0,
  );
  db.attendanceRecords[0].type = 'PRESENT';
  assert.ok((await parseAttendance(workbookFile(workbook), db)).issues.length);
});

test('téléphone : export sans effacement, reprise après fermeture, confirmation par le nouveau fichier', () => {
  const exchange = loadExchange();
  const workspace = loadWorkspace();
  const db = fixture();
  const data = exchange.makeTeacherPackage(db, db.teachers[0]);
  let local = workspace.saveExcelGrades(workspace.emptyExcelWorkspace(data), [
    grade(),
  ]);
  local = workspace.saveExcelAttendance(local, [attendance()]);
  exchange.teacherResultsWorkbook(
    data,
    Object.values(local.grades),
    Object.values(local.attendance),
  );
  assert.equal(Object.keys(local.grades).length, 1);
  assert.equal(Object.keys(local.attendance).length, 1);
  const resumed = JSON.parse(JSON.stringify(local));
  assert.equal(
    workspace.refreshExcelWorkspace(resumed, data).grades[
      exchange.gradeKey(grade())
    ].evaluations[0],
    0,
  );
  const parsedGrades = exchange.parseTeacherResults(
    exchange.teacherResultsWorkbook(data, [grade()], []),
    db,
    'grades',
  );
  const parsedAttendance = exchange.parseTeacherResults(
    exchange.teacherResultsWorkbook(data, [], [attendance()]),
    db,
    'attendance',
  );
  db.grades = parsedGrades.grades;
  db.attendanceRecords = parsedAttendance.attendance;
  const confirmed = workspace.refreshExcelWorkspace(
    resumed,
    exchange.makeTeacherPackage(db, db.teachers[0]),
  );
  assert.equal(Object.keys(confirmed.grades).length, 0);
  assert.equal(Object.keys(confirmed.attendance).length, 0);
});

test('téléphone : actualisation concurrente conserve le travail et son empreinte ; changement d’école ne mélange rien', () => {
  const exchange = loadExchange();
  const workspace = loadWorkspace();
  const db = fixture();
  const data = exchange.makeTeacherPackage(db, db.teachers[0]);
  const local = workspace.saveExcelGrades(workspace.emptyExcelWorkspace(data), [
    grade(),
  ]);
  db.grades = [
    {
      ...grade({ evaluations: [19] }),
      id: 'local',
      classId: 'class-test',
      schoolYearId: db.currentSchoolYearId,
    },
  ];
  const refreshed = workspace.refreshExcelWorkspace(
    local,
    exchange.makeTeacherPackage(db, db.teachers[0]),
  );
  assert.equal(Object.values(refreshed.grades)[0].baseFingerprint, 'ABSENT');
  assert.equal(Object.values(refreshed.grades)[0].evaluations[0], 0);
  const wrong = structuredClone(data);
  wrong.school.id = 'autre';
  assert.throws(() => workspace.refreshExcelWorkspace(local, wrong), /autre/);
  const removed = structuredClone(data);
  removed.students = [];
  assert.throws(
    () => workspace.refreshExcelWorkspace(local, removed),
    /retire/,
  );
  assert.equal(Object.keys(local.grades).length, 1);
});

test('téléphone : SQLite persiste deux écoles séparément et une erreur ne détruit pas les données', () => {
  const sqlite = new DatabaseSync(':memory:');
  const wrapper = {
    execSync: (sql: string) => sqlite.exec(sql),
    runSync: (sql: string, args: any[]) => sqlite.prepare(sql).run(...args),
    getFirstSync: (sql: string, args: any[] = []) =>
      sqlite.prepare(sql).get(...args),
    getAllSync: (sql: string, args: any[] = []) =>
      sqlite.prepare(sql).all(...args),
    withTransactionSync: (callback: () => void) => {
      sqlite.exec('BEGIN');
      try {
        callback();
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  const overrides = { 'expo-sqlite': { openDatabaseSync: () => wrapper } };
  const exchange = loadExchange();
  const workspace = loadWorkspace();
  const db = fixture();
  const first = workspace.saveExcelGrades(
    workspace.emptyExcelWorkspace(
      exchange.makeTeacherPackage(db, db.teachers[0]),
    ),
    [grade()],
  );
  const { excelStore } = createHarness({}, overrides).load(
    'apps/teacher-mobile/src/lib/excelStore.ts',
  );
  excelStore.save(first);
  excelStore.setFileMode(true);
  const { excelStore: reopened } = createHarness({}, overrides).load(
    'apps/teacher-mobile/src/lib/excelStore.ts',
  );
  assert.equal(Object.keys(reopened.last().grades).length, 1);
  assert.equal(reopened.fileMode(), true);
  const second = structuredClone(first);
  second.package.school.id = 'autre';
  second.grades = {};
  reopened.save(second);
  assert.equal(reopened.list().length, 2);
  assert.equal(
    Object.keys(reopened.read(exchange.packageKey(first.package)).grades)
      .length,
    1,
  );
  const originalRun = wrapper.runSync;
  wrapper.runSync = () => {
    throw new Error('DISK_FULL');
  };
  assert.throws(() => reopened.save(first), /DISK_FULL/);
  wrapper.runSync = originalRun;
  assert.equal(reopened.last().package.school.id, 'autre');
  sqlite.close();
});

test('échange : garde vérifiée dans la file d’écriture SQLite avant publication', async () => {
  const storage = memoryStorage();
  const harness = createHarness({ localStorage: storage });
  const { StorageService } = harness.load('src/services/storage.ts');
  const exchange = loadExchange();
  const db = fixture();
  await StorageService.saveDatabase(db);
  const data = exchange.makeTeacherPackage(db, db.teachers[0]);
  const workbook = exchange.teacherResultsWorkbook(data, [grade()], []);
  const { ExcelImportService } = harness.load('src/services/excelImporter.ts');
  const preview = await ExcelImportService.parseGrades(
    workbookFile(workbook),
    db,
  );
  const concurrent = structuredClone(db);
  concurrent.grades = [
    {
      ...grade({ evaluations: [20] }),
      id: 'concurrent',
      classId: 'class-test',
      schoolYearId: db.currentSchoolYearId,
    },
  ];
  const firstWrite = StorageService.saveDatabase(concurrent, db);
  const secondWrite = StorageService.saveDatabase(
    { ...db, grades: preview.grades },
    db,
    false,
    preview.validateCurrent,
  );
  await firstWrite;
  await assert.rejects(secondWrite, /modifiées/);
  assert.equal(
    StorageService.getCurrentDatabase().grades[0].evaluations[0],
    20,
  );
});

test('téléphone : une correction après conflit exige une confirmation explicite', () => {
  const exchange = loadExchange(),
    workspace = loadWorkspace(),
    db = fixture();
  const data = exchange.makeTeacherPackage(db, db.teachers[0]);
  const local = workspace.saveExcelGrades(workspace.emptyExcelWorkspace(data), [
    grade(),
  ]);
  db.grades = [
    {
      ...grade({ evaluations: [19] }),
      id: 'local',
      classId: 'class-test',
      schoolYearId: db.currentSchoolYearId,
    },
  ];
  const refreshed = workspace.refreshExcelWorkspace(
    local,
    exchange.makeTeacherPackage(db, db.teachers[0]),
  );
  assert.equal(workspace.workspaceConflicts(refreshed, 'grades').length, 1);
  assert.match(
    workspace.workspaceConflicts(refreshed, 'grades')[0].schoolValue,
    /19/,
  );
  assert.throws(
    () => workspace.saveExcelGrades(refreshed, [grade()]),
    /confirmez/,
  );
  const resolved = workspace.saveExcelGrades(refreshed, [grade()], true);
  assert.equal(
    Object.values(resolved.grades)[0].baseFingerprint,
    refreshed.package.grades[0].baseFingerprint,
  );
});

test('échange : une fiche identique créée pendant la prévisualisation ne crée pas de doublon', async () => {
  const exchange = loadExchange(),
    db = fixture();
  const data = exchange.makeTeacherPackage(db, db.teachers[0]);
  const { ExcelImportService } = createHarness().load(
    'src/services/excelImporter.ts',
  );
  const preview = await ExcelImportService.parseGrades(
    workbookFile(exchange.teacherResultsWorkbook(data, [grade()], [])),
    db,
  );
  db.grades = [{ ...preview.grades[0], id: 'ajout-concurrent' }];
  assert.throws(() => preview.validateCurrent(db), /prévisualisation/);
});
