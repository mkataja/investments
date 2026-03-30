/**
 * Which `instruments.kind` values are allowed for manual transactions at a given broker.
 * Seligson → mutual funds only. Generic equity brokers → ETF/stock only. A small whitelist
 * may also use `cash_account` instruments (see `CASH_ACCOUNT_BROKER_CODES`).
 */
const SELIGSON_EXCLUSIVE_BROKER_CODES = new Set(["SELIGSON"]);
const CASH_ACCOUNT_BROKER_CODES = new Set(["SVEA"]);

export function isInstrumentKindAllowedForBrokerCode(
  brokerCode: string,
  kind: string,
): boolean {
  const code = brokerCode.trim().toUpperCase();
  if (SELIGSON_EXCLUSIVE_BROKER_CODES.has(code)) {
    return kind === "seligson_fund";
  }
  if (CASH_ACCOUNT_BROKER_CODES.has(code)) {
    return kind !== "seligson_fund";
  }
  return kind === "etf" || kind === "stock";
}
