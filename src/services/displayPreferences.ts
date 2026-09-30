const KEY = 'SEKOLY_TEXT_SCALE';
export const DEFAULT_TEXT_SCALE = 100;

export function normalizeTextScale(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 100 && parsed <= 150 ? Math.round(parsed / 5) * 5 : DEFAULT_TEXT_SCALE;
}

export function readTextScale(): number {
  try { return normalizeTextScale(localStorage.getItem(KEY)); } catch { return DEFAULT_TEXT_SCALE; }
}

export function applyTextScale(scale = readTextScale()): void {
  document.documentElement.style.setProperty('--text-scale', String(normalizeTextScale(scale) / 100));
}

export function saveTextScale(scale: number): void {
  const safe = normalizeTextScale(scale);
  applyTextScale(safe);
  try { localStorage.setItem(KEY, String(safe)); } catch { /* Still applied for this session. */ }
}
