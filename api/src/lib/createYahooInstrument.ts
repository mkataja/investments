import { instruments } from "@investments/db";
import {
  type CommoditySectorStorage,
  normalizeIsinForStorage,
  normalizeYahooSymbolForStorage,
  validateHoldingsDistributionUrl,
  validateProviderBreakdownDataUrl,
} from "@investments/lib";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import {
  buildYahooInstrumentLookup,
  displayNameFromYahooLookup,
  fetchYahooQuoteSummaryRaw,
} from "../distributions/yahoo.js";
import {
  upsertCommodityCachesFromYahooRaw,
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
    providerBreakdownDataUrl?: string | null;
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

  let breakdownUrl: string | null = null;
  if (
    options?.providerBreakdownDataUrl != null &&
    options.providerBreakdownDataUrl.trim().length > 0
  ) {
    const v = validateProviderBreakdownDataUrl(
      options.providerBreakdownDataUrl,
    );
    if (!v.ok || !v.normalized) {
      throw new Error(v.ok ? "Invalid breakdown URL" : v.message);
    }
    breakdownUrl = v.normalized;
  }

  const [row] = await db
    .insert(instruments)
    .values({
      kind,
      displayName,
      yahooSymbol: symbol,
      isin: isin ?? undefined,
      holdingsDistributionUrl: holdingsUrl,
      providerBreakdownDataUrl: breakdownUrl,
    })
    .returning();
  if (!row) {
    throw new Error("Failed to insert instrument");
  }
  try {
    if (holdingsUrl) {
      await writeProviderHoldingsDistributionCache(
        row.id,
        holdingsUrl,
        new Date(),
        {
          providerBreakdownDataUrl: breakdownUrl,
        },
      );
      await upsertYahooPriceFromQuoteSummaryRaw(
        row.id,
        raw,
        new Date(),
        row.isin,
      );
    } else {
      await writeYahooDistributionCache(
        row.id,
        raw,
        symbol,
        new Date(),
        row.isin,
      );
    }
  } catch (e) {
    await db.delete(instruments).where(eq(instruments.id, row.id));
    throw e;
  }
  return row;
}

/**
 * Direct commodity (Yahoo symbol for pricing); sleeve and country are user-selected.
 */
export async function insertCommodityFromYahoo(
  yahooSymbol: string,
  commoditySector: CommoditySectorStorage,
  countryIso: string | null,
): Promise<InstrumentRow> {
  const symbol = normalizeYahooSymbolForStorage(yahooSymbol);
  const raw = await fetchYahooQuoteSummaryRaw(symbol);
  const lookup = buildYahooInstrumentLookup(raw, symbol);
  const displayName = displayNameFromYahooLookup(lookup, symbol);
  const isin = normalizeIsinForStorage(lookup.isin ?? null);

  const [row] = await db
    .insert(instruments)
    .values({
      kind: "commodity",
      displayName,
      yahooSymbol: symbol,
      isin: isin ?? undefined,
      commoditySector,
      commodityCountryIso: countryIso ?? undefined,
    })
    .returning();
  if (!row) {
    throw new Error("Failed to insert instrument");
  }
  try {
    await upsertCommodityCachesFromYahooRaw(
      row.id,
      raw,
      commoditySector,
      countryIso,
      new Date(),
      row.isin,
    );
  } catch (e) {
    await db.delete(instruments).where(eq(instruments.id, row.id));
    throw e;
  }
  return row;
}
