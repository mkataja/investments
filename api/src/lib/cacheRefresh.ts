import { distributionCache, instruments, seligsonFunds } from "@investments/db";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db.js";
import {
  fetchSeligsonHtml,
  parseSeligsonDistributions,
} from "../distributions/seligson.js";
import type { YahooQuoteSummaryRaw } from "../distributions/yahoo.js";
import {
  fetchYahooQuoteSummaryRaw,
  normalizeYahooDistribution,
} from "../distributions/yahoo.js";
import { loadOpenPositions } from "./positions.js";
import { formatYahooUpstreamError } from "./yahooUpstream.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function yahooRefreshGapMs(): number {
  const n = Number.parseInt(process.env.YAHOO_MIN_INTERVAL_MS ?? "900", 10);
  return Number.isFinite(n) && n >= 0 ? n : 900;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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
): Promise<void> {
  const { payload } = normalizeYahooDistribution(raw, symbol);
  const rawPayload = jsonCloneForStorage(raw);
  await db
    .insert(distributionCache)
    .values({
      instrumentId,
      fetchedAt,
      source: "yahoo",
      payload,
      rawPayload,
    })
    .onConflictDoUpdate({
      target: distributionCache.instrumentId,
      set: {
        fetchedAt,
        source: "yahoo",
        payload,
        rawPayload,
      },
    });
}

export async function writeSeligsonDistributionCache(
  instrumentId: number,
  fid: number,
  fetchedAt: Date = new Date(),
): Promise<void> {
  const [html40, html20] = await Promise.all([
    fetchSeligsonHtml(fid, 40),
    fetchSeligsonHtml(fid, 20),
  ]);
  const { payload } = parseSeligsonDistributions(html40, html20);
  const rawPayload = { html40, html20 };
  await db
    .insert(distributionCache)
    .values({
      instrumentId,
      fetchedAt,
      source: "seligson_scrape",
      payload,
      rawPayload,
    })
    .onConflictDoUpdate({
      target: distributionCache.instrumentId,
      set: {
        fetchedAt,
        source: "seligson_scrape",
        payload,
        rawPayload,
      },
    });
}

export type RefreshDistributionResult =
  | { ok: true }
  | { skipped: true; reason: "not_found" | "cash_account" | "manual" }
  | { error: string; status: 503 | 502 };

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
    if (inst.kind === "custom" && inst.seligsonFundId) {
      const [sf] = await db
        .select()
        .from(seligsonFunds)
        .where(eq(seligsonFunds.id, inst.seligsonFundId));
      if (!sf) {
        return { error: "Seligson fund row missing", status: 502 };
      }
      await writeSeligsonDistributionCache(inst.id, sf.fid, now);
      return { ok: true };
    }

    if ((inst.kind === "etf" || inst.kind === "stock") && inst.yahooSymbol) {
      const raw = await fetchYahooQuoteSummaryRaw(inst.yahooSymbol);
      await writeYahooDistributionCache(inst.id, raw, inst.yahooSymbol, now);
      return { ok: true };
    }

    return {
      error: "Instrument has no external distribution source",
      status: 502,
    };
  } catch (e) {
    const { message, status } = formatYahooUpstreamError(e);
    return { error: message, status };
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
  const gapMs = yahooRefreshGapMs();
  let yahooRefreshIndex = 0;

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
      if (inst.kind === "custom" && inst.seligsonFundId) {
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
        yahooRefreshIndex++;
        if (yahooRefreshIndex > 1 && gapMs > 0) {
          await sleep(gapMs);
        }
        const raw = await fetchYahooQuoteSummaryRaw(inst.yahooSymbol);
        await writeYahooDistributionCache(inst.id, raw, inst.yahooSymbol, now);
      }
    } catch (e) {
      console.error(`distribution refresh failed for instrument ${inst.id}`, e);
    }
  }
}
