import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const sourceFiles = (dir: string): string[] => {
  const absolute = new URL(`../${dir}/`, import.meta.url);
  const entries = readdirSync(absolute, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relative = join(dir, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) return sourceFiles(relative);
    return /\.(ts|tsx)$/.test(entry.name) ? [relative] : [];
  });
};

test('la version Windows est une application GUI sans console secondaire', () => {
  const main = read('src-tauri/src/main.rs');
  assert.match(
    main,
    /#!\[cfg_attr\(not\(debug_assertions\), windows_subsystem = "windows"\)\]/
  );
});

test('Sekoly interdit les doubles instances et recentre la fenêtre existante', () => {
  const main = read('src-tauri/src/main.rs');
  const cargo = read('src-tauri/Cargo.toml');
  assert.match(cargo, /tauri-plugin-single-instance\s*=\s*"2"/);
  assert.match(main, /tauri_plugin_single_instance::init/);
  assert.match(main, /get_webview_window\("main"\)/);
  assert.match(main, /set_focus\(\)/);
});

test('la configuration desktop de production ne crée qu’une fenêtre et active la CSP', () => {
  const config = JSON.parse(read('src-tauri/tauri.conf.json'));
  assert.equal(config.app.windows.length, 1);
  assert.equal(config.app.windows[0].label, 'main');
  assert.ok(config.app.windows[0].minWidth <= 900);
  assert.ok(config.app.windows[0].minHeight <= 620);
  assert.ok(typeof config.app.security.csp === 'string' && config.app.security.csp.length > 20);
  assert.deepEqual(config.app.security.capabilities, ['main-capability']);
  assert.equal(config.bundle.windows.allowDowngrades, false);
});

test('les interfaces React n’utilisent plus les confirmations natives du navigateur', () => {
  const offenders = sourceFiles('src').filter((path) =>
    read(path).includes('window.confirm(')
  );
  assert.deepEqual(offenders, []);
});

test('les interfaces de production n’ouvrent pas de fenêtre navigateur secondaire', () => {
  const offenders = sourceFiles('src').filter((path) => {
    const source = read(path);
    return source.includes('window.open(') || /target=[\"']_blank[\"']/.test(source);
  });
  assert.deepEqual(offenders, []);
});

test('les modales ont les attributs de dialogue et un verrouillage de focus', () => {
  const modal = read('src/components/common/Modal.tsx');
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /focusableSelector/);
  assert.match(modal, /openModalCount/);
});

test('le démarrage desktop attend la base locale avant d’afficher les écrans métier', () => {
  const app = read('src/App.tsx');
  assert.match(app, /isStartupReady/);
  assert.match(app, /Chargement sécurisé des données de l’établissement/);
  assert.match(app, /hydrateDesktopDatabase/);
});

test('une erreur React affiche un écran de reprise au lieu d’un écran blanc', () => {
  const boundary = read('src/components/common/AppErrorBoundary.tsx');
  const main = read('src/main.tsx');
  assert.match(boundary, /getDerivedStateFromError/);
  assert.match(boundary, /Recharger Sekoly/);
  assert.match(main, /<AppErrorBoundary>/);
});
