import { distributionCache, instruments, seligsonFunds } from "@investments/db";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db.js";
import { fetchSeligsonDistributions } from "../distributions/seligson.js";
import {
  fetchYahooQuoteSummaryRaw,
  normalizeYahooDistribution,
} from "../distributions/yahoo.js";
import { loadOpenPositions } from "./positions.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function refreshStaleDistributionCaches(): Promise<void> {
  const positions = await loadOpenPositions();
  if (positions.length === 0) {
    return;
  }
  const ids = positions.map((p) => p.instrumentId);
  const instRows = await db
    .select()
    .from(instruments)
    .where(inArray(instruments.id, ids));

  const now = new Date();
  const staleBefore = new Date(now.getTime() - DAY_MS);

  for (const inst of instRows) {
    if (inst.kind === "cash_account") {
      continue;
    }

    const [cached] = await db
      .select()
      .from(distributionCache)
      .where(eq(distributionCache.instrumentId, inst.id));

    if (cached?.source === "manual") {
      continue;
    }

    const needs = !cached || new Date(cached.fetchedAt) < staleBefore;

    if (!needs) {
      continue;
    }

    try {
      if (inst.kind === "seligson_fund" && inst.seligsonFundId) {
        const [sf] = await db
          .select()
          .from(seligsonFunds)
          .where(eq(seligsonFunds.id, inst.seligsonFundId));
        if (!sf) {
          continue;
        }
        const { payload } = await fetchSeligsonDistributions(sf.fid);
        await db
          .insert(distributionCache)
          .values({
            instrumentId: inst.id,
            fetchedAt: now,
            source: "seligson_scrape",
            payload,
          })
          .onConflictDoUpdate({
            target: distributionCache.instrumentId,
            set: {
              fetchedAt: now,
              source: "seligson_scrape",
              payload,
            },
          });
        continue;
      }

      if ((inst.kind === "etf" || inst.kind === "stock") && inst.yahooSymbol) {
        const raw = await fetchYahooQuoteSummaryRaw(inst.yahooSymbol);
        const { payload } = normalizeYahooDistribution(raw, inst.yahooSymbol);
        await db
          .insert(distributionCache)
          .values({
            instrumentId: inst.id,
            fetchedAt: now,
            source: "yahoo",
            payload,
          })
          .onConflictDoUpdate({
            target: distributionCache.instrumentId,
            set: {
              fetchedAt: now,
              source: "yahoo",
              payload,
            },
          });
      }
    } catch (e) {
      console.error(`distribution refresh failed for instrument ${inst.id}`, e);
    }
  }
}
