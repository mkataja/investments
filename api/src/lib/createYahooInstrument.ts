import {
  instruments,
  normalizeIsinForStorage,
  normalizeYahooSymbolForStorage,
  validateHoldingsDistributionUrl,
} from "@investments/db";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import {
  buildYahooInstrumentLookup,
  displayNameFromYahooLookup,
  fetchYahooQuoteSummaryRaw,
} from "../distributions/yahoo.js";
import {
  upsertYahooPriceFromQuoteSummaryRaw,
  writeProviderHoldingsDistributionCache,
  writeYahooDistributionCache,
} from "./cacheRefresh.js";
import type { InstrumentRow } from "./valuation.js";

/**
 * Insert an etf/stock row and distribution cache from Yahoo `quoteSummary` and/or provider holdings URL.
 * Used by `POST /instruments` and Degiro import when creating instruments from proposals.
 * ISIN is taken from Yahoo when present (`extractIsinFromQuoteSummaryRaw`); optional **`isinOverride`**
 * (e.g. Degiro CSV) wins when valid.
 */
export async function insertEtfStockFromYahoo(
  kind: "etf" | "stock",
  yahooSymbol: string,
  options?: {
    isinOverride?: string | null;
    holdingsDistributionUrl?: string | null;
  },
): Promise<InstrumentRow> {
  const symbol = normalizeYahooSymbolForStorage(yahooSymbol);
  const raw = await fetchYahooQuoteSummaryRaw(symbol);
  const lookup = buildYahooInstrumentLookup(raw, symbol);
  const displayName = displayNameFromYahooLookup(lookup, symbol);
  const isinOverrideNorm = normalizeIsinForStorage(
    options?.isinOverride ?? null,
  );
  const isinLookupNorm = normalizeIsinForStorage(lookup.isin ?? null);
  const isin = isinOverrideNorm ?? isinLookupNorm;

  let holdingsUrl: string | null = null;
  if (
    options?.holdingsDistributionUrl != null &&
    options.holdingsDistributionUrl.trim().length > 0
  ) {
    const v = validateHoldingsDistributionUrl(options.holdingsDistributionUrl);
    if (!v.ok || !v.normalized) {
      throw new Error(v.ok ? "Invalid holdings URL" : v.message);
    }
    holdingsUrl = v.normalized;
  }

  const [row] = await db
    .insert(instruments)
    .values({
      kind,
      displayName,
      yahooSymbol: symbol,
      isin: isin ?? undefined,
      holdingsDistributionUrl: holdingsUrl,
    })
    .returning();
  if (!row) {
    throw new Error("Failed to insert instrument");
  }
  try {
    if (holdingsUrl) {
      await writeProviderHoldingsDistributionCache(row.id, holdingsUrl);
      await upsertYahooPriceFromQuoteSummaryRaw(row.id, raw);
    } else {
      await writeYahooDistributionCache(row.id, raw, symbol);
    }
  } catch (e) {
    await db.delete(instruments).where(eq(instruments.id, row.id));
    throw e;
  }
  return row;
}
