/**
 * Accepts `YYYY-MM-DD` (calendar day as UTC midnight) or any string `Date` parses.
 */
export function normalizeTradeDateInputToDate(input: string): Date {
  const t = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    return new Date(`${t}T00:00:00.000Z`);
  }
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid tradeDate");
  }
  return d;
}
