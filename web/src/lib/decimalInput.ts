/** Parses a user-entered decimal field; commas as decimal separator allowed. */
export function parseDecimalInputLoose(s: string): number {
  const p = Number.parseFloat(s.trim().replace(",", "."));
  return Number.isFinite(p) ? p : 0;
}
