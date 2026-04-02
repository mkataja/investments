import { instruments, seligsonFunds } from "@investments/db";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "../../db.js";
import { backfillSeligsonPricesFromArvohistoriaCsv } from "./seligsonArvohistoriaCsv.js";

type SeligsonCsvBackfillInstrumentResult = {
  instrumentId: number;
  rowsUpserted: number;
  error?: string;
};

/**
 * Custom Seligson instruments with a non-empty Arvohistoria CSV URL on the linked `seligson_funds` row.
 */
export async function loadSeligsonCsvBackfillInstrumentRowById(
  instrumentId: number,
): Promise<{ id: number; priceHistoryCsvUrl: string } | null> {
  const [row] = await db
    .select({
      id: instruments.id,
      priceHistoryCsvUrl: seligsonFunds.priceHistoryCsvUrl,
    })
    .from(instruments)
    .innerJoin(seligsonFunds, eq(instruments.seligsonFundId, seligsonFunds.id))
    .where(
      and(
        eq(instruments.id, instrumentId),
        eq(instruments.kind, "custom"),
        isNotNull(instruments.seligsonFundId),
        ne(sql`trim(${seligsonFunds.priceHistoryCsvUrl})`, ""),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function backfillSeligsonCsvPricesForInstrument(row: {
  id: number;
  priceHistoryCsvUrl: string;
}): Promise<SeligsonCsvBackfillInstrumentResult> {
  try {
    const { rowsUpserted } = await backfillSeligsonPricesFromArvohistoriaCsv(
      db,
      row.id,
      row.priceHistoryCsvUrl,
    );
    return { instrumentId: row.id, rowsUpserted };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { instrumentId: row.id, rowsUpserted: 0, error: message };
  }
}
