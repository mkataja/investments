import { instruments, seligsonFunds } from "@investments/db";
import { eq, notInArray } from "drizzle-orm";
import { db } from "../../db.js";
import type { InstrumentMatchCandidate } from "./compositeInstrumentMatch.js";

export async function loadInstrumentMatchCandidates(): Promise<
  InstrumentMatchCandidate[]
> {
  const joined = await db
    .select({
      id: instruments.id,
      displayName: instruments.displayName,
      yahooSymbol: instruments.yahooSymbol,
      sfName: seligsonFunds.name,
    })
    .from(instruments)
    .leftJoin(seligsonFunds, eq(instruments.seligsonFundId, seligsonFunds.id))
    .where(notInArray(instruments.kind, ["cash_account", "fx"]));

  return joined.map((r) => ({
    id: r.id,
    labels: [r.displayName, r.yahooSymbol, r.sfName].filter(
      (x): x is string => x != null && String(x).trim().length > 0,
    ),
  }));
}
