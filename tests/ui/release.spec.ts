import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import * as XLSX from 'xlsx';
import { BASE_INITIAL_DATA } from '../../src/data/initialData';
import { buildSimulationDatabase } from '../../src/data/simulationData';

const fixture = buildSimulationDatabase(structuredClone(BASE_INITIAL_DATA));
const modules = ['Tableau de bord', 'Admissions', 'Élèves', 'Notes et bulletins', 'Emploi du temps', 'Vie scolaire', 'Enseignants', 'Finances', 'Paramètres'];
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

// Exercise the real production bundle without a development server or external calls.
test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://sekoly.test') return route.abort();
    const filename = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const path = resolve('dist', filename);
    if (!path.startsWith(resolve('dist') + '/')) return route.abort();
    try { await route.fulfill({ body: await readFile(path), contentType: mime[extname(path)] || 'application/octet-stream' }); }
    catch { await route.fulfill({ status: 404, body: 'Not found' }); }
  });
});

async function boot(page: Page, populated = false) {
  if (populated) await page.addInitScript((db) => {
    if (!localStorage.getItem('SEKOLY_BROWSER_CACHE_V1')) localStorage.setItem('SEKOLY_BROWSER_CACHE_V1', JSON.stringify(db));
  }, fixture);
  await page.goto('https://sekoly.test');
  await expect(page.getByRole('heading', { name: 'Tableau de bord', exact: true })).toBeVisible();
}
async function navigate(page: Page, name: string) {
  const nav = page.getByRole('complementary', { name: 'Navigation principale' });
  if (!await nav.isVisible()) await page.getByRole('button', { name: 'Navigation', exact: true }).click();
  await nav.getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true }).first()).toBeVisible();
  await expect(page.getByRole('status', { name: '' }).filter({ hasText: 'Ouverture du module…' })).toHaveCount(0);
}

for (const width of [390, 800, 1366]) {
  for (const populated of [false, true]) {
    test(`neuf modules / largeur ${width} / ${populated ? '200 élèves' : 'installation neuve'}`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await boot(page, populated);
      for (const theme of ['light', 'dark']) {
        if (theme === 'dark') await page.getByRole('button', { name: 'Changer de thème' }).click();
        for (const name of modules) {
          await navigate(page, name);
          await expect(page.getByRole('alert').filter({ hasText: 'Cette page n’a pas pu' })).toHaveCount(0);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
          expect(await page.locator('.app-main').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        }
      }
      expect(context.pages()).toHaveLength(1);
      expect(errors).toEqual([]);
    });
  }
}

test('animation 3D courte, ignorable, sans fenêtre supplémentaire', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('https://sekoly.test');
  await expect(page.locator('.startup-emblem')).toBeVisible();
  expect(await page.locator('.startup-emblem').evaluate((el) => getComputedStyle(el).transformStyle)).toBe('preserve-3d');
  await page.screenshot({ path: 'test-results/startup.png' });
  await page.getByRole('button', { name: 'Accéder à mon espace' }).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord', exact: true })).toBeVisible();
  expect(context.pages()).toHaveLength(1);
});

test('SQLite lent : pas de formulaire avant la fin de la lecture', async ({ page }) => {
  await page.addInitScript((db) => {
    (window as any).__TAURI__ = { core: { invoke: async (command: string) => {
      if (command === 'load_database') return new Promise((done) => { (window as any).finishLoading = () => done(JSON.stringify(db)); });
    } } };
  }, fixture);
  await page.goto('https://sekoly.test');
  await expect(page.getByRole('status')).toHaveText('Ouverture de votre établissement…');
  await expect(page.getByRole('button', { name: 'Accéder à mon espace' })).toHaveCount(0);
  await expect(page.locator('.app-shell')).toHaveCount(0);
  await page.evaluate(() => (window as any).finishLoading());
  await expect(page.getByRole('heading', { name: 'Tableau de bord', exact: true })).toBeVisible();
  await expect(page.locator('.dashboard-summary__cell').first()).toContainText(String(fixture.students.filter((student) => student.schoolYearId === fixture.currentSchoolYearId).length));
});

test('SQLite inaccessible : erreur explicite sans écraser les données', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).writes = 0;
    (window as any).__TAURI__ = { core: { invoke: async (command: string) => {
      if (command === 'load_database') throw new Error('Disk unavailable');
      if (command === 'save_database') (window as any).writes++;
    } } };
  });
  await page.goto('https://sekoly.test');
  await expect(page.getByRole('alert')).toContainText('Impossible de lire la base locale');
  await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).writes)).toBe(0);
  await expect(page.locator('.app-shell')).toHaveCount(0);
});

test('clavier : recherche, focus contenu, retour au déclencheur, raccourcis protégés', async ({ page }) => {
  await boot(page, true);
  const search = page.getByRole('button', { name: 'Rechercher', exact: true });
  await search.click();
  const dialog = page.getByRole('dialog', { name: 'Recherche globale' });
  await expect(dialog).toBeVisible();
  const field = dialog.getByRole('textbox');
  await field.fill(fixture.students[0].matricule);
  await expect(field).toBeFocused();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Control+n');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(search).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(dialog).toHaveCount(0);
});

test('création de classe, saisie stable, sauvegarde et persistance après rechargement', async ({ page }) => {
  await boot(page);
  await navigate(page, 'Paramètres');
  await page.getByRole('button', { name: 'Classes', exact: true }).click();
  await page.getByRole('button', { name: 'Ajouter une classe', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajouter une classe' });
  await dialog.getByLabel('Nom', { exact: true }).fill('6e A');
  await dialog.getByLabel('Salle', { exact: true }).fill('Salle 1');
  await expect(dialog.getByLabel('Salle', { exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('cell', { name: '6e A', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tableau de bord', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '6e A', exact: true })).toBeVisible();
});

test('dossier élève, certificat PDF et export Excel', async ({ page }) => {
  await boot(page, true);
  await navigate(page, 'Élèves');
  await page.getByTitle('Consulter le dossier complet').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const pdf = page.waitForEvent('download');
  await page.getByTitle('Imprimer Certificat de Scolarité').first().click();
  expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/i);
  const excel = page.waitForEvent('download');
  await page.getByRole('button', { name: /Exporter Excel/ }).click();
  expect((await excel).suggestedFilename()).toMatch(/\.xlsx$/i);
});

test('Encaisser reste opérationnel au premier chargement différé et à la réouverture', async ({ page }) => {
  await boot(page, true);
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Encaisser', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Encaisser un Écolage / Frais de Scolarité' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

test('admission gratuite : aucun tarif inventé, dossier sauvegardé sans paiement', async ({ page }) => {
  const db = structuredClone(fixture);
  db.classes.forEach((c) => { c.registrationFee = 0; c.capacity = 1000; });
  await page.addInitScript((data) => localStorage.setItem('SEKOLY_BROWSER_CACHE_V1', JSON.stringify(data)), db);
  await boot(page);
  await navigate(page, 'Admissions');
  await expect(page.getByLabel('Date de Naissance *', { exact: true })).toHaveValue('');
  await page.getByPlaceholder('Ex: RAKOTOMALALA', { exact: true }).fill('TESTPUBLICATION');
  await page.getByPlaceholder('Ex: Andry Sitraka', { exact: true }).fill('Fara');
  await page.getByLabel('Date de Naissance *', { exact: true }).fill('12-04-2014');
  await expect(page.getByText('Montant fixé : 0 Ar')).toBeVisible();
  await page.getByRole('button', { name: "Valider l'Inscription & Générer les Actes" }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('SEKOLY_BROWSER_CACHE_V1')!));
  expect(saved.students.length).toBe(db.students.length + 1);
  expect(saved.students[0].lastName).toBe('TESTPUBLICATION');
  expect(saved.tuitionPayments.length).toBe(db.tuitionPayments.length);
  expect(saved.cashTransactions.length).toBe(db.cashTransactions.length);
});

test('paramètres : toutes les sections à 390 px et impression des cartes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, true);
  await navigate(page, 'Paramètres');
  for (const name of ['Affichage', 'Établissement', 'Années et périodes', 'Clôture annuelle', 'Décisions annuelles', 'Documents', 'Classes', 'Matières', 'Matricules', 'Cloud & mobile', 'Données']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Cette page n’a pas pu' })).toHaveCount(0);
    expect(await page.locator('.app-main').evaluate((el) => el.scrollWidth <= el.clientWidth + 1), name).toBe(true);
  }
  await navigate(page, 'Élèves');
  await page.getByRole('button', { name: 'Cartes scolaires', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Cartes scolaires', exact: true })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  const area = page.locator('#printable-area');
  await expect(area).toBeVisible();
  expect(await page.locator('.app-dialog__content').evaluate((el) => getComputedStyle(el).overflow)).toBe('visible');
  await page.pdf({ path: 'test-results/carte-scolaire.pdf', format: 'A4' });
});

test('changement d’année : les dossiers ouverts et recherches respectent l’année choisie', async ({ page }) => {
  await boot(page, true);
  await navigate(page, 'Élèves');
  await page.getByTitle('Consulter le dossier complet').first().click();
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'Année scolaire', exact: true }).selectOption('sy-2024-2025');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
  const field = page.getByRole('dialog').getByRole('textbox');
  const archived = fixture.students.find((s) => s.schoolYearId === 'sy-2024-2025')!;
  await field.fill(archived.matricule);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toContainText(archived.lastName);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toContainText(archived.lastName);
});


test('import Excel : rejet d’une classe inconnue puis enregistrement d’un fichier valide', async ({ page }) => {
  await boot(page, true);
  await navigate(page, 'Élèves');
  const workbook = (schoolClass: string) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Nom', 'Prénoms', 'Sexe', 'Classe', 'Date naissance'],
      ['IMPORTTEST', 'Aina', 'F', schoolClass, '2013-03-15'],
    ]), 'Eleves');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  };
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: 'invalide.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: workbook('INCONNUE') });
  const dialog = page.getByRole('dialog', { name: 'Importer des élèves depuis Excel' });
  await expect(dialog.getByRole('button', { name: /^Importer [0-9]/ })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await input.setInputFiles({ name: 'valide.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: workbook(fixture.classes[0].code) });
  await expect(dialog.getByRole('button', { name: /^Importer 1/ })).toBeEnabled();
  await dialog.getByRole('button', { name: /^Importer 1/ }).click();
  await expect(page.getByRole('cell', { name: /IMPORTTEST/ }).first()).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('SEKOLY_BROWSER_CACHE_V1')!));
  expect(saved.students.filter((student: { lastName: string }) => student.lastName === 'IMPORTTEST')).toHaveLength(1);
});

for (const width of [390, 800, 1366]) {
  test(`textes à 150 % : tous les modules restent utilisables à ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await boot(page, true);
    await navigate(page, 'Paramètres');
    await page.getByRole('button', { name: 'Affichage', exact: true }).click();
    const heading = page.getByRole('heading', { name: 'Affichage et lisibilité' });
    const before = await heading.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    await page.getByRole('button', { name: '150 %', exact: true }).click();
    await expect(heading).toHaveCSS('font-size', `${before * 1.5}px`);
    for (const name of modules) {
      await navigate(page, name);
      expect(await page.locator('.app-main').evaluate((el) => el.scrollWidth <= el.clientWidth + 1), name).toBe(true);
    }
    await page.getByRole('button', { name: 'Affichage', exact: true }).click();
    await expect(page.getByRole('slider', { name: /Taille des textes/ })).toHaveValue('150');
    expect(await page.locator('.app-header').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    if (width === 1366) await page.screenshot({ path: 'test-results/affichage-150.png' });
    await page.reload();
    await expect(page.locator('.app-shell')).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('24px');
    await navigate(page, 'Élèves');
    await page.getByTitle('Consulter le dossier complet').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Cartes scolaires', exact: true }).click();
    await page.emulateMedia({ media: 'print' });
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('16px');
  });
}

test('dates JJ-MM-AAAA dans les dossiers, certificats, Excel et paramètres', async ({ page }) => {
  const db = structuredClone(fixture);
  db.students.forEach((student) => { student.birthDate = '2015-10-23'; });
  db.schoolConfig.logoUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAAAoCAIAAADmAupWAAAA2ElEQVR4nO2auw7EMAgEj1P+/5edgiYnnfIys5aAaVIkBavFxhDbGONTie/qANRs/jCztXEI8Fyu6rCTdT0f87ecwy04O9v1J6H8LQfKvUMn+KTy+SuNbIXgm0VeIxtfw0+PNPQRiBX8LnpUMyh4Jm5Oc7myRAmetwgyuR2OIMocwuR2ODstODstODuI4KiOh+ic2uEg5s2BGuN2OI4Zi7i5B+vwu7jRKQ+e0k+jp2daiiGea7hsffJMLZ0T2Tnn0s7y/3VdlrLzk9IV7gGUc9iW7yJiyjm8A/R0QlvEIJLIAAAAAElFTkSuQmCC';
  db.schoolConfig.documentLogoPosition = 'CENTER';
  db.schoolConfig.documentLogoWidthMm = 18;
  await page.addInitScript((data) => localStorage.setItem('SEKOLY_BROWSER_CACHE_V1', JSON.stringify(data)), db);
  await boot(page);
  await navigate(page, 'Élèves');
  await page.getByTitle('Consulter le dossier complet').first().click();
  await expect(page.getByRole('dialog')).toContainText('23-10-2015');
  await expect(page.getByRole('dialog')).not.toContainText('2015-10-23');
  await page.keyboard.press('Escape');
  const pdfDownload = page.waitForEvent('download');
  await page.getByTitle('Imprimer Certificat de Scolarité').first().click();
  const pdf = await pdfDownload;
  await pdf.saveAs('test-results/certificat-date.pdf');
  const raw = (await readFile((await pdf.path())!)).toString('latin1');
  expect(raw).toContain('23-10-2015');
  expect(raw).not.toContain('2015-10-23');
  expect(raw).toContain('/Subtype /Image');
  const excelDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Exporter Excel/ }).click();
  const book = XLSX.read(await readFile((await (await excelDownload).path())!));
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets['Élèves']);
  expect(rows[0]['Date de naissance']).toBe('23-10-2015');
  await navigate(page, 'Paramètres');
  await page.getByRole('button', { name: 'Années et périodes', exact: true }).click();
  const year = db.schoolYears[0];
  const [y, m, d] = year.startDate.split('-');
  await expect(page.locator('.app-main')).toContainText(`${d}-${m}-${y}`);
});

test('saisie JJ-MM-AAAA : date impossible bloquée puis stockage ISO préservé', async ({ page }) => {
  const db = structuredClone(fixture);
  db.classes.forEach((c) => { c.registrationFee = 0; c.capacity = 1000; });
  await page.addInitScript((data) => { if (!localStorage.getItem('SEKOLY_BROWSER_CACHE_V1')) localStorage.setItem('SEKOLY_BROWSER_CACHE_V1', JSON.stringify(data)); }, db);
  await boot(page);
  await navigate(page, 'Admissions');
  await page.getByPlaceholder('Ex: RAKOTOMALALA', { exact: true }).fill('TESTDATE');
  await page.getByPlaceholder('Ex: Andry Sitraka', { exact: true }).fill('Fara');
  const date = page.getByLabel('Date de Naissance *', { exact: true });
  await date.fill('31-02-2016');
  expect(await date.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
  await page.getByRole('button', { name: "Valider l'Inscription & Générer les Actes" }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('SEKOLY_BROWSER_CACHE_V1')!).students.length)).toBe(db.students.length);
  await date.fill('29-02-2016');
  await page.getByRole('button', { name: "Valider l'Inscription & Générer les Actes" }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('SEKOLY_BROWSER_CACHE_V1')!));
  expect(saved.students[0].birthDate).toBe('2016-02-29');
  await page.reload();
  await expect(page.locator('.app-shell')).toBeVisible();
  await navigate(page, 'Élèves');
  await page.getByTitle('Consulter le dossier complet').first().click();
  await expect(page.getByRole('dialog')).toContainText('29-02-2016');
});
