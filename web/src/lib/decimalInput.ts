/** Parses a user-entered decimal field; commas as decimal separator allowed. */
export function parseDecimalInputLoose(s: string): number {
  const p = Number.parseFloat(s.trim().replace(",", "."));
  return Number.isFinite(p) ? p : 0;
}

/** Rounds a EUR amount to two decimal places (cents). */
export function roundEurToCents(eur: number): number {
  if (!Number.isFinite(eur)) {
    return 0;
  }
  return Math.round(eur * 100) / 100;
}

/** Rounds to cents and formats for EUR text inputs (avoids float string artifacts). */
export function formatEurAmountForInput(eur: number): string {
  if (!Number.isFinite(eur)) {
    return "0";
  }
  const cents = Math.round(eur * 100);
  const sign = cents < 0 ? "-" : "";
  const absCents = Math.abs(cents);
  const wholePart = Math.floor(absCents / 100);
  const frac = absCents % 100;
  if (frac === 0) {
    return `${sign}${wholePart}`;
  }
  return `${sign}${wholePart}.${String(frac).padStart(2, "0")}`;
}
