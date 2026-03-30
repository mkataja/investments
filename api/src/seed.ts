import { type BrokerType, brokers } from "@investments/db";
import { db } from "./db.js";

const SEED: readonly { name: string; brokerType: BrokerType }[] = [
  { name: "Seligson", brokerType: "seligson" },
  { name: "Degiro", brokerType: "exchange" },
  { name: "Interactive Brokers", brokerType: "exchange" },
  { name: "Svea Bank", brokerType: "cash_account" },
];

export async function seedBrokers(): Promise<void> {
  for (const row of SEED) {
    await db
      .insert(brokers)
      .values(row)
      .onConflictDoNothing({ target: brokers.name });
  }
}
