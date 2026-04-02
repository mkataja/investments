import {
  distributions,
  instrumentCompositeConstituents,
  seligsonDistributionCache,
  yahooFinanceCache,
} from "@investments/db";
import type { DistributionPayload } from "@investments/lib/distributionPayload";
import {
  compositePseudoKeyToSyntheticPayload,
  isCompositePseudoKey,
} from "@investments/lib/instrumentComposite";
import { MIN_PORTFOLIO_ALLOCATION_FRACTION } from "@investments/lib/minPortfolioAllocationFraction";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "../../db.js";
import { calendarDateUtcFromInstant } from "../../lib/calendarDateUtc.js";
import { mergeCompositeDistributionPayload } from "../instrument/compositeDistribution.js";
import { upsertDistributionSnapshot } from "../instrument/priceDistributionWrite.js";

export async function instrumentHasCompositeConstituents(
  instrumentId: number,
): Promise<boolean> {
  const [r] = await db
    .select({ id: instrumentCompositeConstituents.id })
    .from(instrumentCompositeConstituents)
    .where(eq(instrumentCompositeConstituents.parentInstrumentId, instrumentId))
    .limit(1);
  return r != null;
}

/**
 * Writes `distributions` from weighted constituent payloads (and pseudo unknown slices).
 * Clears Seligson FundViewer HTML cache for this instrument so stale scrape data is not shown.
 */
export async function writeCompositeDistributionCache(
  instrumentId: number,
  fetchedAt: Date = new Date(),
): Promise<void> {
  const rows = await db
    .select()
    .from(instrumentCompositeConstituents)
    .where(eq(instrumentCompositeConstituents.parentInstrumentId, instrumentId))
    .orderBy(asc(instrumentCompositeConstituents.sortOrder));

  if (rows.length === 0) {
    throw new Error("No composite constituents for instrument");
  }

  const items: Array<{ weight: number; payload: DistributionPayload | null }> =
    [];
  for (const row of rows) {
    const w = Number.parseFloat(String(row.weight));
    if (!Number.isFinite(w) || w <= 0) {
      continue;
    }
    if (row.pseudoKey) {
      if (!isCompositePseudoKey(row.pseudoKey)) {
        throw new Error(`Invalid composite pseudo_key: ${row.pseudoKey}`);
      }
      items.push({
        weight: w,
        payload: compositePseudoKeyToSyntheticPayload(row.pseudoKey),
      });
      continue;
    }
    if (row.targetInstrumentId != null) {
      const [dist] = await db
        .select()
        .from(distributions)
        .where(eq(distributions.instrumentId, row.targetInstrumentId))
        .orderBy(desc(distributions.snapshotDate))
        .limit(1);
      const payload = (dist?.payload as DistributionPayload | undefined) ?? {
        countries: {},
        sectors: {},
      };
      items.push({ weight: w, payload });
    }
  }

  if (items.length === 0) {
    throw new Error("No valid composite constituent rows");
  }

  const sumW = items.reduce((s, it) => s + it.weight, 0);
  if (sumW >= MIN_PORTFOLIO_ALLOCATION_FRACTION) {
    for (const it of items) {
      it.weight /= sumW;
    }
  }

  const payload = mergeCompositeDistributionPayload(items);

  await db.transaction(async (tx) => {
    await tx
      .delete(seligsonDistributionCache)
      .where(eq(seligsonDistributionCache.instrumentId, instrumentId));
    await tx
      .delete(yahooFinanceCache)
      .where(eq(yahooFinanceCache.instrumentId, instrumentId));
    await upsertDistributionSnapshot(tx, {
      instrumentId,
      snapshotDate: calendarDateUtcFromInstant(fetchedAt),
      fetchedAt,
      source: "composite",
      payload,
    });
  });
}
