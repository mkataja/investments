import { instruments, normalizeYahooSymbolForStorage } from "@investments/db";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import {
  buildYahooInstrumentLookup,
  displayNameFromYahooLookup,
  fetchYahooQuoteSummaryRaw,
} from "../distributions/yahoo.js";
import { writeYahooDistributionCache } from "./cacheRefresh.js";
import type { InstrumentRow } from "./valuation.js";

/**
 * Insert an etf/stock row and distribution cache from Yahoo `quoteSummary`.
 * Used by `POST /instruments` and Degiro import when creating instruments from proposals.
 */
export async function insertEtfStockFromYahoo(
  kind: "etf" | "stock",
  yahooSymbol: string,
  options?: { isinOverride?: string | null },
): Promise<InstrumentRow> {
  const symbol = normalizeYahooSymbolForStorage(yahooSymbol);
  const raw = await fetchYahooQuoteSummaryRaw(symbol);
  const lookup = buildYahooInstrumentLookup(raw, symbol);
  const displayName = displayNameFromYahooLookup(lookup, symbol);
  const isin =
    options?.isinOverride != null && options.isinOverride.trim().length > 0
      ? options.isinOverride.trim()
      : (lookup.isin ?? undefined);
  const [row] = await db
    .insert(instruments)
    .values({
      kind,
      displayName,
      yahooSymbol: symbol,
      isin: isin ?? undefined,
    })
    .returning();
  if (!row) {
    throw new Error("Failed to insert instrument");
  }
  try {
    await writeYahooDistributionCache(row.id, raw, symbol);
  } catch (e) {
    await db.delete(instruments).where(eq(instruments.id, row.id));
    throw e;
  }
  return row;
}
