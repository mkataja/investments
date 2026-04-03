/**
 * `portfolios.emergency_fund_eur` is numeric in Postgres; Drizzle may surface it as string.
 */
export function emergencyFundTargetEurFromDb(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  if (typeof raw === "string") {
    const n = Number.parseFloat(raw.trim());
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
