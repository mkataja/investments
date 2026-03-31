import type { BrokerType } from "./brokerTypes.js";

/**
 * Which `instruments.kind` values are allowed for manual transactions at a given broker.
 * Exchange → ETF/stock. Seligson → custom (mutual funds). Cash-account brokers → cash only.
 */
export function isInstrumentKindAllowedForBrokerType(
  brokerType: BrokerType,
  kind: string,
): boolean {
  switch (brokerType) {
    case "exchange":
      return kind === "etf" || kind === "stock";
    case "seligson":
      return kind === "custom";
    case "cash_account":
      return kind === "cash_account";
    default:
      return false;
  }
}
