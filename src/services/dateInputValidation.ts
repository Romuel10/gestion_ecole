export function reportInvalidDates(): boolean {
  const invalid = document.querySelector<HTMLInputElement>('.date-input > input:invalid');
  if (!invalid) return false;
  invalid.reportValidity();
  invalid.focus();
  return true;
}
