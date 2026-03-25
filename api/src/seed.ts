import { brokers } from "@investments/db";
import { db } from "./db.js";

const SEED = [
  { code: "SELIGSON", name: "Seligson" },
  { code: "DEGIRO", name: "Degiro" },
  { code: "IBKR", name: "Interactive Brokers" },
  { code: "SVEA", name: "Svea Bank" },
] as const;

export async function seedBrokers(): Promise<void> {
  for (const row of SEED) {
    await db
      .insert(brokers)
      .values(row)
      .onConflictDoNothing({ target: brokers.code });
  }
}
