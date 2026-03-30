/**
 * Whole-share display: nearest integer via Math.round (ties toward +∞), not truncating
 * (not Math.trunc, |0, or parseInt on fractional strings).
 * Decimal strings that are visually whole numbers use the integer part only to avoid FP drift.
 */
export function roundQuantityForDisplay(raw: string): number {
  const t = raw.trim();
  if (/^-?\d+(\.0+)?$/.test(t)) {
    const dot = t.indexOf(".");
    const intPart = dot === -1 ? t : t.slice(0, dot);
    return Number.parseInt(intPart, 10);
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}
