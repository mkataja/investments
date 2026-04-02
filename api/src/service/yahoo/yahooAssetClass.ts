/**
 * Infer bond vs equity from cached Yahoo `quoteSummary` JSON (same shape as `yahoo_finance_cache.raw`).
 */
export function isBondLikeFromYahooQuoteSummaryRaw(raw: unknown): boolean {
  if (raw == null || typeof raw !== "object") {
    return false;
  }
  const r = raw as Record<string, unknown>;
  const fund = r.fundProfile as Record<string, unknown> | undefined;
  const cat =
    typeof fund?.categoryName === "string"
      ? fund.categoryName.toLowerCase()
      : "";
  if (cat.length > 0) {
    if (
      /\b(bond|fixed income|municipal|treasury|govt|government)\b/.test(cat)
    ) {
      return true;
    }
    if (cat.includes("income") && !cat.includes("equity")) {
      return true;
    }
  }
  const asset = r.assetProfile as Record<string, unknown> | undefined;
  const industry =
    typeof asset?.industry === "string" ? asset.industry.toLowerCase() : "";
  if (industry.includes("bond") || industry.includes("asset-backed")) {
    return true;
  }
  return false;
}
