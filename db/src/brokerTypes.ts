/**
 * Broker classification: drives which instrument kinds are allowed at manual entry.
 */
export const BROKER_TYPES = ["exchange", "seligson", "cash_account"] as const;

export type BrokerType = (typeof BROKER_TYPES)[number];

export const BROKER_TYPE_DISPLAY: Record<BrokerType, string> = {
  exchange: "Exchange",
  seligson: "Seligson",
  cash_account: "Cash account",
};
