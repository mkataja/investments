/**
 * Which `instruments.kind` values are allowed for manual transactions at a given broker.
 * Seligson-only brokers hold mutual funds; other brokers use listed instruments and cash.
 */
const SELIGSON_EXCLUSIVE_BROKER_CODES = new Set(["SELIGSON"]);

export function isInstrumentKindAllowedForBrokerCode(
  brokerCode: string,
  kind: string,
): boolean {
  const code = brokerCode.trim().toUpperCase();
  if (SELIGSON_EXCLUSIVE_BROKER_CODES.has(code)) {
    return kind === "seligson_fund";
  }
  return kind !== "seligson_fund";
}
