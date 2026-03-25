import { distributionCache, instruments, seligsonFunds } from "@investments/db";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db.js";
import { fetchSeligsonDistributions } from "../distributions/seligson.js";
import type { YahooQuoteSummaryRaw } from "../distributions/yahoo.js";
import {
  fetchYahooQuoteSummaryRaw,
  normalizeYahooDistribution,
} from "../distributions/yahoo.js";
import { loadOpenPositions } from "./positions.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function writeYahooDistributionCache(
  instrumentId: number,
  raw: YahooQuoteSummaryRaw,
  symbol: string,
  fetchedAt: Date = new Date(),
): Promise<void> {
  const { payload } = normalizeYahooDistribution(raw, symbol);
  await db
    .insert(distributionCache)
    .values({
      instrumentId,
      fetchedAt,
      source: "yahoo",
      payload,
    })
    .onConflictDoUpdate({
      target: distributionCache.instrumentId,
      set: {
        fetchedAt,
        source: "yahoo",
        payload,
      },
    });
}

export async function writeSeligsonDistributionCache(
  instrumentId: number,
  fid: number,
  fetchedAt: Date = new Date(),
): Promise<void> {
  const { payload } = await fetchSeligsonDistributions(fid);
  await db
    .insert(distributionCache)
    .values({
      instrumentId,
      fetchedAt,
      source: "seligson_scrape",
      payload,
    })
    .onConflictDoUpdate({
      target: distributionCache.instrumentId,
      set: {
        fetchedAt,
        source: "seligson_scrape",
        payload,
      },
    });
}

export type RefreshDistributionResult =
  | { ok: true }
  | { skipped: true; reason: "not_found" | "cash_account" | "manual" }
  | { error: string };

export async function refreshDistributionCacheForInstrumentId(
  instrumentId: number,
): Promise<RefreshDistributionResult> {
  const [inst] = await db
    .select()
    .from(instruments)
    .where(eq(instruments.id, instrumentId));
  if (!inst) {
    return { skipped: true, reason: "not_found" };
  }
  if (inst.kind === "cash_account") {
    return { skipped: true, reason: "cash_account" };
  }

  const [cached] = await db
    .select()
    .from(distributionCache)
    .where(eq(distributionCache.instrumentId, instrumentId));
  if (cached?.source === "manual") {
    return { skipped: true, reason: "manual" };
  }

  const now = new Date();

  try {
    if (inst.kind === "seligson_fund" && inst.seligsonFundId) {
      const [sf] = await db
        .select()
        .from(seligsonFunds)
        .where(eq(seligsonFunds.id, inst.seligsonFundId));
      if (!sf) {
        return { error: "Seligson fund row missing" };
      }
      await writeSeligsonDistributionCache(inst.id, sf.fid, now);
      return { ok: true };
    }

    if ((inst.kind === "etf" || inst.kind === "stock") && inst.yahooSymbol) {
      const raw = await fetchYahooQuoteSummaryRaw(inst.yahooSymbol);
      await writeYahooDistributionCache(inst.id, raw, inst.yahooSymbol, now);
      return { ok: true };
    }

    return { error: "Instrument has no external distribution source" };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { error: message };
  }
}

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
        await writeSeligsonDistributionCache(inst.id, sf.fid, now);
        continue;
      }

      if ((inst.kind === "etf" || inst.kind === "stock") && inst.yahooSymbol) {
        const raw = await fetchYahooQuoteSummaryRaw(inst.yahooSymbol);
        await writeYahooDistributionCache(inst.id, raw, inst.yahooSymbol, now);
      }
    } catch (e) {
      console.error(`distribution refresh failed for instrument ${inst.id}`, e);
    }
  }
}
