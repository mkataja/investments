import { instruments, prices } from "@investments/db";
import {
  eurPerUnitOfForeignFromYahooPrice,
  fxYahooPairConfigForForeign,
} from "@investments/lib/fxYahooEurLeg";
import { normalizeYahooSymbolForStorage } from "@investments/lib/yahooSymbol";
import { and, asc, eq, exists, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { ChartResultArray } from "yahoo-finance2/modules/chart";
import { type DbOrTx, db } from "../../db.js";
import { calendarDateUtcFromInstant } from "../../lib/calendarDateUtc.js";
import { upsertPriceForDate } from "../instrument/priceDistributionWrite.js";
import { fetchYahooChartDailyBars } from "./yahooChartFetch.js";
import { YAHOO_FETCHED_PRICE_SOURCES } from "./yahooFetchedPriceSources.js";
import { formatYahooUpstreamError } from "./yahooUpstream.js";

export const YAHOO_CHART_BACKFILL_PRICE_SOURCE = "yahoo_chart_backfill";
const YAHOO_BACKFILL_PERIOD1 = "1970-01-01";

type InstrumentRow = InferSelectModel<typeof instruments>;

type YahooPriceBackfillInstrumentResult = {
  instrumentId: number;
  kind: string;
  yahooSymbol: string;
  /** Rows written or updated (skipped null closes excluded). */
  rowsUpserted: number;
  error?: string;
};

async function fetchDailyChartForSymbol(
  yahooSymbol: string,
): Promise<{ quotes: ChartResultArray["quotes"]; currency: string }> {
  const chart = await fetchYahooChartDailyBars(
    normalizeYahooSymbolForStorage(yahooSymbol),
    {
      period1: YAHOO_BACKFILL_PERIOD1,
      period2: new Date(),
    },
  );
  const cur = chart.meta.currency?.trim().toUpperCase();
  if (!cur || cur.length === 0) {
    throw new Error("Yahoo chart response missing meta.currency");
  }
  return { quotes: chart.quotes, currency: cur };
}

async function writeChartQuotesToPrices(
  tx: DbOrTx,
  instrumentId: number,
  quotes: ChartResultArray["quotes"],
  args: {
    fetchedAt: Date;
    currency: string;
    /** Return null to skip the bar (e.g. invalid FX conversion). */
    quotedPriceForBar: (close: number) => string | null;
  },
): Promise<number> {
  let n = 0;
  for (const q of quotes) {
    const close = q.close;
    if (
      close == null ||
      !Number.isFinite(close) ||
      !(close > 0) ||
      !(q.date instanceof Date) ||
      Number.isNaN(q.date.getTime())
    ) {
      continue;
    }
    const quotedPrice = args.quotedPriceForBar(close);
    if (quotedPrice === null) {
      continue;
    }
    const priceDate = calendarDateUtcFromInstant(q.date);
    await upsertPriceForDate(tx, {
      instrumentId,
      priceDate,
      quotedPrice,
      currency: args.currency,
      fetchedAt: args.fetchedAt,
      source: YAHOO_CHART_BACKFILL_PRICE_SOURCE,
      priceType: "close",
      skipFxEnqueue: true,
    });
    n += 1;
  }
  return n;
}

export async function backfillYahooPricesForInstrument(
  row: Pick<InstrumentRow, "id" | "kind" | "yahooSymbol" | "fxForeignCurrency">,
): Promise<YahooPriceBackfillInstrumentResult> {
  const sym = row.yahooSymbol?.trim();
  if (!sym) {
    return {
      instrumentId: row.id,
      kind: row.kind,
      yahooSymbol: "",
      rowsUpserted: 0,
      error: "Missing yahoo_symbol",
    };
  }

  const fetchedAt = new Date();

  try {
    if (row.kind === "fx") {
      const fc = row.fxForeignCurrency?.trim().toUpperCase();
      const conf = fc ? fxYahooPairConfigForForeign(fc) : null;
      if (!fc || !conf) {
        return {
          instrumentId: row.id,
          kind: row.kind,
          yahooSymbol: sym,
          rowsUpserted: 0,
          error: "FX instrument has no supported Yahoo foreign currency",
        };
      }
      const { quotes } = await fetchDailyChartForSymbol(sym);
      const rowsUpserted = await db.transaction(async (tx) =>
        writeChartQuotesToPrices(tx, row.id, quotes, {
          fetchedAt,
          currency: "EUR",
          quotedPriceForBar: (close) => {
            const eur = eurPerUnitOfForeignFromYahooPrice(
              close,
              conf.invertToEurPerUnit,
            );
            if (!Number.isFinite(eur) || !(eur > 0)) {
              return null;
            }
            return String(eur);
          },
        }),
      );
      return {
        instrumentId: row.id,
        kind: row.kind,
        yahooSymbol: sym,
        rowsUpserted,
      };
    }

    const { quotes, currency } = await fetchDailyChartForSymbol(sym);
    const rowsUpserted = await db.transaction(async (tx) =>
      writeChartQuotesToPrices(tx, row.id, quotes, {
        fetchedAt,
        currency,
        quotedPriceForBar: (close) => String(close),
      }),
    );
    return {
      instrumentId: row.id,
      kind: row.kind,
      yahooSymbol: sym,
      rowsUpserted,
    };
  } catch (e) {
    const { message } = formatYahooUpstreamError(e);
    return {
      instrumentId: row.id,
      kind: row.kind,
      yahooSymbol: sym,
      rowsUpserted: 0,
      error: message,
    };
  }
}

function yahooBackfillInstrumentWhere() {
  return and(
    inArray(instruments.kind, ["etf", "stock", "commodity", "fx"]),
    isNotNull(instruments.yahooSymbol),
    ne(sql`trim(${instruments.yahooSymbol})`, ""),
    exists(
      db
        .select({ instrumentId: prices.instrumentId })
        .from(prices)
        .where(
          and(
            eq(prices.instrumentId, instruments.id),
            inArray(prices.source, [...YAHOO_FETCHED_PRICE_SOURCES]),
          ),
        ),
    ),
  );
}

export async function loadYahooBackfillInstrumentRowById(
  instrumentId: number,
): Promise<Pick<
  InstrumentRow,
  "id" | "kind" | "yahooSymbol" | "fxForeignCurrency"
> | null> {
  const [row] = await db
    .select({
      id: instruments.id,
      kind: instruments.kind,
      yahooSymbol: instruments.yahooSymbol,
      fxForeignCurrency: instruments.fxForeignCurrency,
    })
    .from(instruments)
    .where(
      and(eq(instruments.id, instrumentId), yahooBackfillInstrumentWhere()),
    )
    .limit(1);
  return row ?? null;
}

async function loadYahooBackfillInstrumentRows(): Promise<
  Pick<InstrumentRow, "id" | "kind" | "yahooSymbol" | "fxForeignCurrency">[]
> {
  return db
    .select({
      id: instruments.id,
      kind: instruments.kind,
      yahooSymbol: instruments.yahooSymbol,
      fxForeignCurrency: instruments.fxForeignCurrency,
    })
    .from(instruments)
    .where(yahooBackfillInstrumentWhere())
    .orderBy(asc(instruments.id));
}

/**
 * Fetches Yahoo `chart` daily history per instrument and upserts `prices` (`price_type` close).
 * All writes use `skipFxEnqueue` so FX queue is not drained per row; FX instruments are filled
 * directly from the same chart series.
 */
export async function backfillAllYahooPricesFromHistory(): Promise<{
  instruments: YahooPriceBackfillInstrumentResult[];
}> {
  const rows = await loadYahooBackfillInstrumentRows();
  const perInstrument: YahooPriceBackfillInstrumentResult[] = [];
  for (const row of rows) {
    perInstrument.push(await backfillYahooPricesForInstrument(row));
  }
  return { instruments: perInstrument };
}
