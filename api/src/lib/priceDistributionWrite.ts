import { distributions, prices } from "@investments/db";
import type { DistributionPayload } from "@investments/lib";
import { and, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "../db.js";

type PriceType = "intraday" | "close";

const ISSUER_SCRAPE_SOURCES = new Set<string>(["seligson_scrape"]);

function isIssuerScrapeSource(source: string): boolean {
  return ISSUER_SCRAPE_SOURCES.has(source);
}

function shouldApplyDistributionWrite(
  existing: { source: string; fetchedAt: Date },
  incoming: { source: string; fetchedAt: Date },
): boolean {
  if (existing.source === "composite" && incoming.source !== "composite") {
    return false;
  }
  if (existing.source !== "composite" && incoming.source === "composite") {
    return true;
  }
  if (existing.source === "composite" && incoming.source === "composite") {
    return (
      incoming.fetchedAt.getTime() > new Date(existing.fetchedAt).getTime()
    );
  }
  const exIss = isIssuerScrapeSource(existing.source);
  const inIss = isIssuerScrapeSource(incoming.source);
  if (exIss && !inIss) {
    return false;
  }
  if (!exIss && inIss) {
    return true;
  }
  return incoming.fetchedAt.getTime() > new Date(existing.fetchedAt).getTime();
}

/**
 * One row per `(instrument_id, price_date)`. `close` does not get replaced by `intraday`.
 */
export async function upsertPriceForDate(
  d: DbOrTx,
  input: {
    instrumentId: number;
    priceDate: string;
    quotedPrice: string;
    currency: string;
    fetchedAt: Date;
    source: string;
    priceType: PriceType;
  },
): Promise<void> {
  await d
    .insert(prices)
    .values({
      instrumentId: input.instrumentId,
      priceDate: input.priceDate,
      quotedPrice: input.quotedPrice,
      currency: input.currency,
      priceType: input.priceType,
      fetchedAt: input.fetchedAt,
      source: input.source,
    })
    .onConflictDoUpdate({
      target: [prices.instrumentId, prices.priceDate],
      set: {
        quotedPrice: sql`excluded.quoted_price`,
        currency: sql`excluded.currency`,
        priceType: sql`excluded.price_type`,
        fetchedAt: sql`excluded.fetched_at`,
        source: sql`excluded.source`,
        updatedAt: new Date(),
      },
      setWhere: sql`NOT (${prices.priceType} = 'close' AND excluded.price_type = 'intraday'::price_type)`,
    });
}

export async function upsertDistributionSnapshot(
  d: DbOrTx,
  input: {
    instrumentId: number;
    snapshotDate: string;
    fetchedAt: Date;
    source: string;
    payload: DistributionPayload;
  },
): Promise<void> {
  const [existing] = await d
    .select()
    .from(distributions)
    .where(
      and(
        eq(distributions.instrumentId, input.instrumentId),
        eq(distributions.snapshotDate, input.snapshotDate),
      ),
    )
    .limit(1);
  if (!existing) {
    await d.insert(distributions).values({
      instrumentId: input.instrumentId,
      snapshotDate: input.snapshotDate,
      fetchedAt: input.fetchedAt,
      source: input.source,
      payload: input.payload,
    });
    return;
  }
  if (
    !shouldApplyDistributionWrite(
      {
        source: existing.source,
        fetchedAt: new Date(existing.fetchedAt),
      },
      { source: input.source, fetchedAt: input.fetchedAt },
    )
  ) {
    return;
  }
  await d
    .update(distributions)
    .set({
      fetchedAt: input.fetchedAt,
      source: input.source,
      payload: input.payload,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(distributions.instrumentId, input.instrumentId),
        eq(distributions.snapshotDate, input.snapshotDate),
      ),
    );
}
