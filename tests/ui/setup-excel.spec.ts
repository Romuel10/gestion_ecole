import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import * as XLSX from 'xlsx';
import { INITIAL_DATA, BASE_INITIAL_DATA } from '../../src/data/initialData';
import { buildSimulationDatabase } from '../../src/data/simulationData';
import {
  makeTeacherPackage,
  readTeacherPackage,
  teacherResultsWorkbook,
} from '../../src/shared/teacherExchange';

const mime: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://sekoly.test') return route.abort();
    const path = resolve(
      'dist',
      url.pathname === '/'
        ? 'index.html'
        : decodeURIComponent(url.pathname.slice(1)),
    );
    if (!path.startsWith(resolve('dist') + '/')) return route.abort();
    try {
      await route.fulfill({
        body: await readFile(path),
        contentType: mime[extname(path)] || 'application/octet-stream',
      });
    } catch {
      await route.fulfill({ status: 404, body: 'Not found' });
    }
  });
});
const next = (page: Page) =>
  page.getByRole('button', { name: 'Enregistrer et continuer' }).click();
async function identity(page: Page) {
  await page.getByLabel('Nom de l’établissement').fill('École de test');
  await page.getByLabel('Sigle de l’école').fill('EDT');
  await page.getByLabel('Ville', { exact: false }).fill('Antsirabe');
}
const stored = (page: Page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem('SEKOLY_BROWSER_CACHE_V1')!),
  );
async function navigate(page: Page, name: string) {
  await page
    .getByRole('complementary', { name: 'Navigation principale' })
    .getByRole('button', { name, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name, exact: true }).first(),
  ).toBeVisible();
}
function bookFile(rows: Record<string, unknown>[], name: string) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), name);
  return {
    name: `${name}.xlsx`,
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(XLSX.write(book, { bookType: 'xlsx', type: 'array' })),
  };
}

for (const width of [390, 800, 1366]) {
  test(`assistant de première utilisation complet, reprise et thèmes / ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('https://sekoly.test');
    await expect(
      page.getByRole('heading', { name: 'Configurons votre école' }),
    ).toBeVisible();
    await expect(page.locator('.app-shell')).toHaveCount(0);
    await page.keyboard.press('Control+n');
    await expect(
      page.getByRole('heading', { name: 'Configurons votre école' }),
    ).toBeVisible();
    await identity(page);
    await page.getByRole('button', { name: 'Changer le thème' }).click();
    await next(page);
    await expect(
      page.getByRole('heading', { name: 'Année scolaire', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Année scolaire', exact: true }),
    ).toBeVisible();
    expect((await stored(page)).schoolConfig.name).toBe('École de test');
    await next(page);
    await page
      .getByRole('button', { name: 'Ajouter une classe', exact: true })
      .click();
    await page.getByLabel('Code', { exact: true }).fill('6A');
    await page
      .getByLabel('Nom de la classe', { exact: true })
      .fill('Sixième A');
    await page.getByLabel(/Écolage mensuel/).fill('30000');
    await next(page);
    await page
      .getByRole('button', { name: 'Ajouter une matière', exact: true })
      .click();
    await page.getByLabel('Code matière', { exact: true }).fill('MAT');
    await page
      .getByLabel('Nom de la matière', { exact: true })
      .fill('Mathématiques');
    await next(page);
    await expect(
      page.getByRole('heading', { name: 'Vérification', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/setup-review-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Terminer la configuration' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Tableau de bord', exact: true }),
    ).toBeVisible();
    const db = await stored(page);
    expect(db.schoolConfig.setupState.completedAt).toBeTruthy();
    expect(db.schoolConfig.offlineExchangeId).toBeTruthy();
    expect(db.classes[0].subjects[0].subjectId).toBe(db.subjects[0].id);
    expect(db.matriculeConfig.prefix).toBe('EDT');
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Tableau de bord', exact: true }),
    ).toBeVisible();
  });
}

test('assistant : échec SQLite garde la saisie et permet de réessayer', async ({
  page,
}) => {
  await page.addInitScript((db) => {
    (window as any).saved = db;
    (window as any).failWrite = true;
    (window as any).__TAURI__ = {
      core: {
        invoke: async (command: string, args: any) => {
          if (command === 'load_database')
            return JSON.stringify((window as any).saved);
          if (command === 'save_database') {
            if ((window as any).failWrite) throw new Error('DISK_FULL');
            (window as any).saved = JSON.parse(args.json);
          }
          if (command.includes('backup')) return 'backup.json';
        },
      },
    };
  }, INITIAL_DATA);
  await page.goto('https://sekoly.test');
  await expect(
    page.getByRole('heading', { name: 'Configurons votre école' }),
  ).toBeVisible();
  await identity(page);
  await next(page);
  await expect(page.getByRole('alert')).toContainText('DISK_FULL');
  await expect(page.getByLabel('Nom de l’établissement')).toHaveValue(
    'École de test',
  );
  await expect(
    page.getByRole('heading', { name: 'Votre école', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as any).failWrite = false;
  });
  await next(page);
  await expect(
    page.getByRole('heading', { name: 'Année scolaire', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as any).saved.schoolConfig.setupState.step,
    ),
  ).toBe(1);
});

test('enseignants : modèle téléchargeable, erreur visible puis import et fichier de préparation', async ({
  page,
}) => {
  const db = buildSimulationDatabase(structuredClone(BASE_INITIAL_DATA));
  db.schoolConfig.offlineExchangeId = 'school-ui-test';
  await page.addInitScript(
    (data) =>
      localStorage.setItem('SEKOLY_BROWSER_CACHE_V1', JSON.stringify(data)),
    db,
  );
  await page.goto('https://sekoly.test');
  await expect(
    page.getByRole('heading', { name: 'Tableau de bord', exact: true }),
  ).toBeVisible();
  await navigate(page, 'Enseignants');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Modèle enseignants' }).click();
  const template = XLSX.read(await readFile((await (await download).path())!));
  expect(template.Sheets.Enseignants).toBeTruthy();
  const input = page.getByLabel('Fichier Excel des enseignants');
  await input.setInputFiles(
    bookFile(
      [{ Nom: 'PROFEXCEL', Prénoms: 'Essai', Sexe: 'F', Classes: 'INCONNUE' }],
      'Enseignants',
    ),
  );
  await expect(page.getByRole('dialog')).toContainText('INCONNUE');
  await expect(
    page.getByRole('button', { name: /Importer \d+ enseignant/ }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await input.setInputFiles(
    bookFile(
      [
        {
          Matricule: 'PROF-EXCEL-UI',
          Nom: 'PROFEXCEL',
          Prénoms: 'Essai',
          Sexe: 'F',
          Classes: db.classes[0].code,
          Matières: db.subjects.find(
            (item) => item.id === db.classes[0].subjects[0].subjectId,
          )!.code,
        },
      ],
      'Enseignants',
    ),
  );
  await page
    .getByRole('button', { name: 'Importer 1 enseignant(s)', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    (await stored(page)).teachers.filter(
      (item: any) => item.matricule === 'PROF-EXCEL-UI',
    ),
  ).toHaveLength(1);
  // Explicit class assignments take priority over a teacher's declared specialties.
  const teacher = db.teachers.find((item) =>
    db.classes.some((cls) =>
      cls.subjects.some((subject) => subject.teacherId === item.id),
    ),
  )!;
  const row = page.getByRole('row').filter({ hasText: teacher.matricule });
  const packageDownload = page.waitForEvent('download');
  await row.getByRole('button', { name: 'Fichier de l’école' }).click();
  const parsed = readTeacherPackage(
    XLSX.read(await readFile((await (await packageDownload).path())!)),
  );
  expect(parsed.teacher.id).toBe(teacher.id);
  expect(parsed.school.id).toBe('school-ui-test');
});

test('retour professeur : notes et appels importés deux fois avec les mêmes identifiants', async ({
  page,
}) => {
  const db = buildSimulationDatabase(structuredClone(BASE_INITIAL_DATA));
  db.schoolConfig.offlineExchangeId = 'school-ui-exchange';
  const teacher = db.teachers.find((item) =>
    db.classes.some((cls) =>
      cls.subjects.some((subject) => subject.teacherId === item.id),
    ),
  )!;
  const data = makeTeacherPackage(db, teacher);
  const assignment = data.assignments.find((item) =>
    data.students.some((student) => student.classId === item.classId),
  )!;
  const student = data.students.find(
    (item) => item.classId === assignment.classId,
  )!;
  const term = data.terms.find((item) => !item.isLocked)!;
  const initial = data.grades.find(
    (item) =>
      item.studentId === student.id &&
      item.subjectId === assignment.subjectId &&
      item.termCode === term.code,
  );
  const workbook = teacherResultsWorkbook(
    data,
    [
      {
        studentId: student.id,
        subjectId: assignment.subjectId,
        termCode: term.code,
        evaluations: [0, 13.5, 16],
        evaluationWeights: [1, 2, 1],
        examGrade: 18,
        baseFingerprint: initial?.baseFingerprint || 'ABSENT',
      },
    ],
    [
      {
        studentId: student.id,
        classId: assignment.classId,
        date: db.schoolYears.find((item) => item.id === db.currentSchoolYearId)!
          .startDate,
        type: 'RETARD',
        minutesLate: 12,
        reason: 'Transport',
        baseFingerprint:
          data.attendance.find(
            (item) =>
              item.studentId === student.id &&
              item.date ===
                db.schoolYears.find(
                  (year) => year.id === db.currentSchoolYearId,
                )!.startDate,
          )?.baseFingerprint || 'ABSENT',
      },
    ],
  );
  const upload = {
    name: 'RETOUR_PROF.xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(
      XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }),
    ),
  };
  await page.addInitScript((data) => {
    if (!localStorage.getItem('SEKOLY_BROWSER_CACHE_V1'))
      localStorage.setItem('SEKOLY_BROWSER_CACHE_V1', JSON.stringify(data));
  }, db);
  await page.goto('https://sekoly.test');
  await expect(
    page.getByRole('heading', { name: 'Tableau de bord', exact: true }),
  ).toBeVisible();
  await navigate(page, 'Notes et bulletins');
  for (let index = 0; index < 2; index++) {
    await page
      .locator('input[type="file"][accept=".xlsx,.xls"]')
      .setInputFiles(upload);
    await page
      .getByRole('button', { name: 'Importer 1 note(s)', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  let saved = await stored(page);
  const grades = saved.grades.filter(
    (item: any) =>
      item.studentId === student.id &&
      item.subjectId === assignment.subjectId &&
      item.termCode === term.code &&
      item.schoolYearId === data.schoolYear.id,
  );
  expect(grades).toHaveLength(1);
  expect(grades[0].evaluations).toEqual([0, 13.5, 16]);
  await navigate(page, 'Vie scolaire');
  for (let index = 0; index < 2; index++) {
    await page.getByLabel('Fichier Excel des appels').setInputFiles(upload);
    await page
      .getByRole('button', { name: 'Importer 1 appel(s)', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  saved = await stored(page);
  const records = saved.attendanceRecords.filter(
    (item: any) =>
      item.studentId === student.id &&
      item.date === data.schoolYear.startDate &&
      item.schoolYearId === data.schoolYear.id,
  );
  expect(records).toHaveLength(1);
  expect(records[0].minutesLate).toBe(12);
});
