import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(
  new URL('../web/family-portal/enrollment/index.html', import.meta.url),
  'utf8'
);

test('le portail famille contient le rendu par sections', () => {
  assert.match(html, /id="familySections"/);
  assert.match(html, /data-child-sections/);
  assert.match(html, /function schemaSections\(scope\)/);
  assert.match(html, /function renderScopeSections\(scope,root\)/);
  assert.match(html, /document\.createElement\('fieldset'\)/);
});

test('le JavaScript intégré du portail famille est syntaxiquement valide', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length > 0, 'aucun script intégré trouvé');
  for (const [, source] of scripts) {
    assert.doesNotThrow(() => new vm.Script(source));
  }
});

test('le formulaire conserve les quatre étapes et les hôtes dynamiques', () => {
  assert.match(html, /1 · Famille/);
  assert.match(html, /2 · Enfant\(s\)/);
  assert.match(html, /3 · Pièces/);
  assert.match(html, /4 · Vérifier/);
  assert.match(html, /id="customFamilyFields"/);
  assert.match(html, /data-custom-child-fields/);
});


test('les pièces justificatives sont rendues depuis le schéma et envoyées par code', () => {
  assert.match(html, /function schemaDocuments\(scope\)/);
  assert.match(html, /data-family-doc-code/);
  assert.match(html, /data-doc-code/);
  assert.match(html, /fd\.append\('documentCode',documentCode\|\|''\)/);
  assert.doesNotMatch(html, /data-family-doc="CIN_PRIMARY"/);
});
