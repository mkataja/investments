import {
  instruments,
  seligsonDistributionCache,
  yahooFinanceCache,
} from "@investments/db";
import {
  type CommoditySectorStorage,
  buildCommodityDistributionPayload,
} from "@investments/lib/commodity";
import { normalizeIsinForStorage } from "@investments/lib/isin";
import { eq } from "drizzle-orm";
import { db } from "../../db.js";
import { roundWeights } from "../../distributions/roundWeights.js";
import {
  type YahooQuoteSummaryRaw,
  extractIsinFromQuoteSummaryRaw,
  extractYahooPriceFromQuoteSummaryRaw,
  normalizeYahooDistribution,
  yahooQuoteCalendarDateUtc,
} from "../../distributions/yahoo.js";
import { processFxBackfillQueue } from "../fx/fxEurPriceBackfill.js";
import {
  upsertDistributionSnapshot,
  upsertPriceForDate,
} from "../instrument/priceDistributionWrite.js";

async function maybeBackfillInstrumentIsinFromYahooRaw(
  instrumentId: number,
  raw: YahooQuoteSummaryRaw,
  existingIsin: string | null | undefined,
): Promise<void> {
  if (normalizeIsinForStorage(existingIsin ?? null)) {
    return;
  }
  const fromYahoo = extractIsinFromQuoteSummaryRaw(raw);
  if (!fromYahoo) {
    return;
  }
  await db
    .update(instruments)
    .set({ isin: fromYahoo })
    .where(eq(instruments.id, instrumentId));
}

/** JSON-safe clone for `jsonb` (drops non-JSON values from Yahoo responses). */
function jsonCloneForStorage<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function writeYahooDistributionCache(
  instrumentId: number,
  raw: YahooQuoteSummaryRaw,
  symbol: string,
  fetchedAt: Date = new Date(),
  existingInstrumentIsin?: string | null,
): Promise<void> {
  const { payload: rawPayload } = normalizeYahooDistribution(raw, symbol);
  const payload = {
    countries: roundWeights(rawPayload.countries),
    sectors: roundWeights(rawPayload.sectors),
  };
  const rawJson = jsonCloneForStorage(raw);
  const priceExtract = extractYahooPriceFromQuoteSummaryRaw(raw);

  await db.transaction(async (tx) => {
    await tx
      .insert(yahooFinanceCache)
      .values({
        instrumentId,
        fetchedAt,
        raw: rawJson,
      })
      .onConflictDoUpdate({
        target: yahooFinanceCache.instrumentId,
        set: {
          fetchedAt,
          raw: rawJson,
        },
      });
    await tx
      .delete(seligsonDistributionCache)
      .where(eq(seligsonDistributionCache.instrumentId, instrumentId));
    const snapshotDate = yahooQuoteCalendarDateUtc(raw, fetchedAt);
    await upsertDistributionSnapshot(tx, {
      instrumentId,
      snapshotDate,
      fetchedAt,
      source: "yahoo",
      payload,
    });
    if (priceExtract) {
      await upsertPriceForDate(tx, {
        instrumentId,
        priceDate: snapshotDate,
        quotedPrice: String(priceExtract.price),
        currency: priceExtract.currency,
        fetchedAt,
        source: "yahoo_quote_summary",
        priceType: priceExtract.priceType,
      });
    }
  });

  await maybeBackfillInstrumentIsinFromYahooRaw(
    instrumentId,
    raw,
    existingInstrumentIsin,
  );
  await processFxBackfillQueue();
}

export async function upsertYahooPriceFromQuoteSummaryRaw(
  instrumentId: number,
  raw: YahooQuoteSummaryRaw,
  fetchedAt: Date = new Date(),
  existingInstrumentIsin?: string | null,
): Promise<void> {
  const priceExtract = extractYahooPriceFromQuoteSummaryRaw(raw);
  if (priceExtract) {
    await upsertPriceForDate(db, {
      instrumentId,
      priceDate: yahooQuoteCalendarDateUtc(raw, fetchedAt),
      quotedPrice: String(priceExtract.price),
      currency: priceExtract.currency,
      fetchedAt,
      source: "yahoo_quote_summary",
      priceType: priceExtract.priceType,
    });
  }
  await maybeBackfillInstrumentIsinFromYahooRaw(
    instrumentId,
    raw,
    existingInstrumentIsin,
  );
  await processFxBackfillQueue();
}

/** Yahoo price + quote cache; distribution from manual commodity sleeve and optional ISO country. */
export async function upsertCommodityCachesFromYahooRaw(
  instrumentId: number,
  raw: YahooQuoteSummaryRaw,
  commoditySector: CommoditySectorStorage,
  countryIso: string | null,
  fetchedAt: Date = new Date(),
  existingInstrumentIsin?: string | null,
): Promise<void> {
  const built = buildCommodityDistributionPayload(commoditySector, countryIso);
  const payload = {
    countries: roundWeights(built.countries),
    sectors: roundWeights(built.sectors),
  };
  const rawJson = jsonCloneForStorage(raw);
  const priceExtract = extractYahooPriceFromQuoteSummaryRaw(raw);

  await db.transaction(async (tx) => {
    await tx
      .insert(yahooFinanceCache)
      .values({
        instrumentId,
        fetchedAt,
        raw: rawJson,
      })
      .onConflictDoUpdate({
        target: yahooFinanceCache.instrumentId,
        set: {
          fetchedAt,
          raw: rawJson,
        },
      });
    await tx
      .delete(seligsonDistributionCache)
      .where(eq(seligsonDistributionCache.instrumentId, instrumentId));
    const snapshotDate = yahooQuoteCalendarDateUtc(raw, fetchedAt);
    await upsertDistributionSnapshot(tx, {
      instrumentId,
      snapshotDate,
      fetchedAt,
      source: "yahoo_commodity_manual",
      payload,
    });
    if (priceExtract) {
      await upsertPriceForDate(tx, {
        instrumentId,
        priceDate: snapshotDate,
        quotedPrice: String(priceExtract.price),
        currency: priceExtract.currency,
        fetchedAt,
        source: "yahoo_quote_summary",
        priceType: priceExtract.priceType,
      });
    }
  });

  await maybeBackfillInstrumentIsinFromYahooRaw(
    instrumentId,
    raw,
    existingInstrumentIsin,
  );
  await processFxBackfillQueue();
}
