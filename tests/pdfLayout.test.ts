import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeInstitutionHeaderLayout,
  type PdfLogoPlacement,
} from '../src/services/pdfGenerator.ts';

test('logo PDF centré : le texte institutionnel commence sous le logo', () => {
  const logo: PdfLogoPlacement = {
    position: 'CENTER',
    x: 85,
    y: 8,
    width: 40,
    height: 15,
  };
  const layout = computeInstitutionHeaderLayout(210, logo);

  assert.ok(layout.institutionNameY >= logo.y + logo.height + 4);
  assert.ok(layout.regionalLineY > layout.institutionNameY);
  assert.ok(layout.contactLineY > layout.regionalLineY);
  assert.ok(layout.separatorY > layout.contactLineY);
  assert.ok(layout.documentTitleY > layout.separatorY);
});

test('logo PDF latéral : une zone de texte sûre est réservée sur les reçus étroits', () => {
  const logo: PdfLogoPlacement = {
    position: 'LEFT',
    x: 14,
    y: 8,
    width: 29.6,
    height: 12,
  };
  const layout = computeInstitutionHeaderLayout(148, logo);

  assert.ok(layout.institutionMaxWidth >= 48);
  assert.ok(layout.institutionMaxWidth < 120);
  assert.equal(layout.institutionNameY, 12);
});
