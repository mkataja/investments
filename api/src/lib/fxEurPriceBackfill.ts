import { fxBackfillQueue, instruments, prices } from "@investments/db";
import {
  eurPerUnitOfForeignFromYahooPrice,
  fxYahooPairConfigForForeign,
} from "@investments/lib";
import { and, asc, eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "../db.js";
import {
  extractYahooPriceFromQuoteSummaryRaw,
  fetchYahooQuoteSummaryRaw,
} from "../distributions/yahoo.js";
import { upsertPriceForDate } from "./priceDistributionWrite.js";
import { formatYahooUpstreamError } from "./yahooUpstream.js";

type InstrumentRow = InferSelectModel<typeof instruments>;

async function findOrCreateFxInstrument(
  foreignIso: string,
): Promise<InstrumentRow | null> {
  const conf = fxYahooPairConfigForForeign(foreignIso);
  if (!conf) {
    console.warn(
      `[fx] No Yahoo pair configured for foreign currency ${JSON.stringify(foreignIso)}`,
    );
    return null;
  }
  const upper = foreignIso.trim().toUpperCase();
  const [existing] = await db
    .select()
    .from(instruments)
    .where(
      and(eq(instruments.kind, "fx"), eq(instruments.fxForeignCurrency, upper)),
    )
    .limit(1);
  if (existing) {
    return existing;
  }
  const displayName = `FX ${upper}/EUR`;
  const [inserted] = await db
    .insert(instruments)
    .values({
      kind: "fx",
      displayName,
      yahooSymbol: conf.yahooSymbol,
      fxForeignCurrency: upper,
    })
    .returning();
  return inserted ?? null;
}

async function fxInstrumentHasCloseOnDate(
  fxInstrumentId: number,
  priceDate: string,
): Promise<boolean> {
  const [row] = await db
    .select({ priceType: prices.priceType })
    .from(prices)
    .where(
      and(
        eq(prices.instrumentId, fxInstrumentId),
        eq(prices.priceDate, priceDate),
        eq(prices.priceType, "close"),
      ),
    )
    .limit(1);
  return row != null;
}

async function processOneQueueRow(row: {
  foreignCurrency: string;
  priceDate: string;
  priceType: "intraday" | "close";
  triggerFetchedAt: Date | null;
}): Promise<void> {
  const conf = fxYahooPairConfigForForeign(row.foreignCurrency);
  if (!conf) {
    await db
      .delete(fxBackfillQueue)
      .where(
        and(
          eq(fxBackfillQueue.foreignCurrency, row.foreignCurrency),
          eq(fxBackfillQueue.priceDate, row.priceDate),
        ),
      );
    return;
  }

  const fxInst = await findOrCreateFxInstrument(row.foreignCurrency);
  if (!fxInst) {
    await db
      .delete(fxBackfillQueue)
      .where(
        and(
          eq(fxBackfillQueue.foreignCurrency, row.foreignCurrency),
          eq(fxBackfillQueue.priceDate, row.priceDate),
        ),
      );
    return;
  }

  if (await fxInstrumentHasCloseOnDate(fxInst.id, row.priceDate)) {
    await db
      .delete(fxBackfillQueue)
      .where(
        and(
          eq(fxBackfillQueue.foreignCurrency, row.foreignCurrency),
          eq(fxBackfillQueue.priceDate, row.priceDate),
        ),
      );
    return;
  }

  let raw: Awaited<ReturnType<typeof fetchYahooQuoteSummaryRaw>>;
  try {
    raw = await fetchYahooQuoteSummaryRaw(conf.yahooSymbol);
  } catch (e) {
    const { message } = formatYahooUpstreamError(e);
    console.error(
      `[fx] Yahoo fetch failed for ${conf.yahooSymbol} (${row.foreignCurrency}): ${message}`,
    );
    return;
  }

  const extracted = extractYahooPriceFromQuoteSummaryRaw(raw);
  if (!extracted) {
    console.warn(
      `[fx] No price in quoteSummary for ${conf.yahooSymbol} (${row.foreignCurrency})`,
    );
    return;
  }

  const eurPerUnit = eurPerUnitOfForeignFromYahooPrice(
    extracted.price,
    conf.invertToEurPerUnit,
  );
  if (!Number.isFinite(eurPerUnit) || !(eurPerUnit > 0)) {
    console.warn(
      `[fx] Invalid EUR/unit from Yahoo for ${conf.yahooSymbol}: ${extracted.price}`,
    );
    return;
  }

  await upsertPriceForDate(db, {
    instrumentId: fxInst.id,
    priceDate: row.priceDate,
    quotedPrice: String(eurPerUnit),
    currency: "EUR",
    fetchedAt: new Date(),
    source: "yahoo_fx_cross",
    priceType: extracted.priceType,
    skipFxEnqueue: true,
  });

  await db
    .delete(fxBackfillQueue)
    .where(
      and(
        eq(fxBackfillQueue.foreignCurrency, row.foreignCurrency),
        eq(fxBackfillQueue.priceDate, row.priceDate),
      ),
    );
}

/**
 * Drains pending FX rows (call after transactions that enqueue, and optionally on startup).
 */
export async function processFxBackfillQueue(maxRows = 100): Promise<void> {
  const pending = await db
    .select()
    .from(fxBackfillQueue)
    .orderBy(asc(fxBackfillQueue.createdAt))
    .limit(maxRows);

  for (const row of pending) {
    try {
      await processOneQueueRow({
        foreignCurrency: row.foreignCurrency,
        priceDate: row.priceDate,
        priceType: row.priceType,
        triggerFetchedAt: row.triggerFetchedAt,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[fx] processFxBackfillQueue row ${row.foreignCurrency} ${row.priceDate}: ${msg}`,
      );
    }
  }
}
