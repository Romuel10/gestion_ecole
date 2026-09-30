/** Keep ISO dates in storage; format only at the presentation boundary. */
export function parseDisplayDate(value: string): string {
  const match = value.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (!match) return '';
  const [, day, month, year] = match;
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : '';
}

export function localDateIso(date = new Date()): string {
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatDate(value: string | Date | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  // A civil date must never move to the previous/next day through a time zone conversion.
  const raw = value instanceof Date ? localDateIso(value) : value.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : parseDisplayDate(raw);
  if (!iso) return fallback;
  const [year, month, day] = iso.split('-');
  return parseDisplayDate(`${day}-${month}-${year}`) ? `${day}-${month}-${year}` : fallback;
}

export function formatDateTime(value: string | Date | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return `${formatDate(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
