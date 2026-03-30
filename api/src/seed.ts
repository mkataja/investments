import { type BrokerType, brokers } from "@investments/db";
import { db } from "./db.js";

const SEED: readonly { code: string; name: string; brokerType: BrokerType }[] =
  [
    { code: "SELIGSON", name: "Seligson", brokerType: "seligson" },
    { code: "DEGIRO", name: "Degiro", brokerType: "exchange" },
    { code: "IBKR", name: "Interactive Brokers", brokerType: "exchange" },
    { code: "SVEA", name: "Svea Bank", brokerType: "cash_account" },
  ];

export async function seedBrokers(): Promise<void> {
  for (const row of SEED) {
    await db
      .insert(brokers)
      .values(row)
      .onConflictDoNothing({ target: brokers.code });
  }
}
