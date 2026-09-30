import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatDateTime, parseDisplayDate, localDateIso } from '../src/services/dateFormat.ts';
import { normalizeTextScale } from '../src/services/displayPreferences.ts';

test('dates civiles : jour-mois-année sans conversion de fuseau', () => {
  for (const timezone of ['Indian/Antananarivo', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
    const previous = process.env.TZ;
    try {
      process.env.TZ = timezone;
      assert.equal(formatDate('2025-10-23'), '23-10-2025');
      assert.equal(formatDate('2008-01-01'), '01-01-2008');
      assert.equal(formatDate(new Date(2025, 9, 23, 12)), '23-10-2025');
      assert.equal(localDateIso(new Date(2025, 9, 23, 0, 30)), '2025-10-23');
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  }
});

test('saisie française : années bissextiles, saisie partielle et dates impossibles', () => {
  assert.equal(parseDisplayDate('23-10-2025'), '2025-10-23');
  assert.equal(parseDisplayDate('1/2/2025'), '2025-02-01');
  assert.equal(parseDisplayDate('29-02-2024'), '2024-02-29');
  for (const value of ['29-02-2025', '31-04-2025', '00-10-2025', '23-13-2025', '23-10-20', '2025-10-23', '']) {
    assert.equal(parseDisplayDate(value), '', value);
  }
});

test('valeurs manquantes ou corrompues : aucun Invalid Date dans les documents', () => {
  for (const value of [undefined, null, '', '2025-02-31', 'n/a', new Date(NaN)]) assert.equal(formatDate(value), '—');
  assert.equal(formatDate(undefined, ''), '');
  assert.equal(formatDate('23/10/2025'), '23-10-2025');
  assert.equal(formatDateTime('invalid'), '—');
  assert.equal(formatDateTime(new Date(2025, 9, 23, 9, 5)), '23-10-2025 09:05');
});

test('préférence de lisibilité : limites et stockage corrompu', () => {
  assert.equal(normalizeTextScale('125'), 125);
  assert.equal(normalizeTextScale(150), 150);
  for (const value of [null, undefined, 'invalid', 0, 99, 151, Infinity]) assert.equal(normalizeTextScale(value), 100);
});
