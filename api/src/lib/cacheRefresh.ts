import {
  distributions,
  instruments,
  prices,
  seligsonDistributionCache,
  seligsonFunds,
  yahooFinanceCache,
} from "@investments/db";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db.js";
import { roundWeights } from "../distributions/roundWeights.js";
import {
  fetchSeligsonHtml,
  parseSeligsonDistributions,
} from "../distributions/seligson.js";
import { upsertSeligsonFundValuesFromPage } from "../distributions/seligsonFundValues.js";
import type { YahooQuoteSummaryRaw } from "../distributions/yahoo.js";
import {
  extractYahooPriceFromQuoteSummaryRaw,
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
    await tx
      .insert(distributions)
      .values({
        instrumentId,
        fetchedAt,
        source: "yahoo",
        payload,
      })
      .onConflictDoUpdate({
        target: distributions.instrumentId,
        set: {
          fetchedAt,
          source: "yahoo",
          payload,
        },
      });
    if (priceExtract) {
      await tx
        .insert(prices)
        .values({
          instrumentId,
          quotedPrice: String(priceExtract.price),
          currency: priceExtract.currency,
          fetchedAt,
          source: "yahoo_quote_summary",
        })
        .onConflictDoUpdate({
          target: prices.instrumentId,
          set: {
            quotedPrice: String(priceExtract.price),
            currency: priceExtract.currency,
            fetchedAt,
            source: "yahoo_quote_summary",
          },
        });
    }
  });
}

export async function writeSeligsonDistributionCache(
  instrumentId: number,
  fid: number,
  fetchedAt: Date = new Date(),
): Promise<void> {
  const [otherDistributionHtml, countryHtml] = await Promise.all([
    fetchSeligsonHtml(fid, 40),
    fetchSeligsonHtml(fid, 20),
  ]);
  const { payload: rawPayload } = parseSeligsonDistributions(
    otherDistributionHtml,
    countryHtml,
  );
  const payload = {
    countries: roundWeights(rawPayload.countries),
    sectors: roundWeights(rawPayload.sectors),
  };

  await db.transaction(async (tx) => {
    await tx
      .insert(seligsonDistributionCache)
      .values({
        instrumentId,
        fetchedAt,
        countryHtml,
        otherDistributionHtml,
      })
      .onConflictDoUpdate({
        target: seligsonDistributionCache.instrumentId,
        set: {
          fetchedAt,
          countryHtml,
          otherDistributionHtml,
        },
      });
    await tx
      .delete(yahooFinanceCache)
      .where(eq(yahooFinanceCache.instrumentId, instrumentId));
    await tx
      .insert(distributions)
      .values({
        instrumentId,
        fetchedAt,
        source: "seligson_scrape",
        payload,
      })
      .onConflictDoUpdate({
        target: distributions.instrumentId,
        set: {
          fetchedAt,
          source: "seligson_scrape",
          payload,
        },
      });
  });

  await upsertSeligsonFundValuesFromPage(db, fetchedAt);
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

  const [distRow] = await db
    .select()
    .from(distributions)
    .where(eq(distributions.instrumentId, instrumentId));
  if (distRow?.source === "manual") {
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
      .from(distributions)
      .where(eq(distributions.instrumentId, inst.id));

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
