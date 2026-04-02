import { distributions, instruments, seligsonFunds } from "@investments/db";
import { validateHoldingsDistributionUrl } from "@investments/lib/holdingsUrl";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db.js";
import { fetchYahooQuoteSummaryRaw } from "../../distributions/yahoo.js";
import { userFacingMessageFromDbError } from "../../lib/postgresUserMessage.js";
import { processFxBackfillQueue } from "../fx/fxEurPriceBackfill.js";
import { sectorRefreshStorage } from "../instrument/sectorRefreshContext.js";
import { loadOpenPositionsAggregateForUser } from "../portfolio/positions.js";
import {
  formatYahooUpstreamError,
  yahooRefreshGapMs,
} from "../yahoo/yahooUpstream.js";
import {
  instrumentHasCompositeConstituents,
  writeCompositeDistributionCache,
} from "./compositeDistributionWrite.js";
import { writeProviderHoldingsDistributionCache } from "./providerHoldingsWrite.js";
import { writeSeligsonDistributionCache } from "./seligsonDistributionWrite.js";
import { warnIfRefreshedDistributionHasUnknownCountry } from "./unknownCountryWarnings.js";
import {
  upsertCommodityCachesFromYahooRaw,
  upsertYahooPriceFromQuoteSummaryRaw,
  writeYahooDistributionCache,
} from "./yahooDistributionWrite.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type RefreshDistributionResult =
  | { ok: true }
  | { skipped: true; reason: "not_found" | "cash_account" | "manual" }
  | { error: string; status: 503 | 502 };

/** One global FIFO queue so only one distribution refresh runs at a time (HTTP + PATCH). */
let distributionRefreshQueueTail: Promise<void> = Promise.resolve();

export function refreshDistributionCacheForInstrumentId(
  instrumentId: number,
): Promise<RefreshDistributionResult> {
  const next = distributionRefreshQueueTail.then(() =>
    refreshDistributionCacheForInstrumentIdImpl(instrumentId),
  );
  distributionRefreshQueueTail = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function refreshDistributionCacheForInstrumentIdImpl(
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
    .where(eq(distributions.instrumentId, instrumentId))
    .orderBy(desc(distributions.snapshotDate))
    .limit(1);
  if (distRow?.source === "manual") {
    return { skipped: true, reason: "manual" };
  }

  const now = new Date();

  try {
    return await sectorRefreshStorage.run(
      { instrumentId, displayName: inst.displayName },
      async () => {
        if (await instrumentHasCompositeConstituents(instrumentId)) {
          await writeCompositeDistributionCache(instrumentId, now);
          await warnIfRefreshedDistributionHasUnknownCountry(
            instrumentId,
            inst.displayName,
          );
          return { ok: true };
        }

        if (inst.kind === "custom" && inst.seligsonFundId) {
          const [sf] = await db
            .select()
            .from(seligsonFunds)
            .where(eq(seligsonFunds.id, inst.seligsonFundId));
          if (!sf) {
            return { error: "Seligson fund row missing", status: 502 };
          }
          await writeSeligsonDistributionCache(inst.id, sf.fid, now);
          await warnIfRefreshedDistributionHasUnknownCountry(
            instrumentId,
            inst.displayName,
          );
          return { ok: true };
        }

        if (inst.kind === "commodity") {
          const sector = inst.commoditySector;
          if (!inst.yahooSymbol || sector == null) {
            return {
              error: "Commodity instrument is missing Yahoo symbol or sector",
              status: 502,
            };
          }
          if (sector !== "gold" && sector !== "silver" && sector !== "other") {
            return { error: "Invalid commodity sector", status: 502 };
          }
          const raw = await fetchYahooQuoteSummaryRaw(inst.yahooSymbol);
          await upsertCommodityCachesFromYahooRaw(
            inst.id,
            raw,
            sector,
            inst.commodityCountryIso ?? null,
            now,
            inst.isin,
          );
          return { ok: true };
        }

        if (inst.kind === "etf" || inst.kind === "stock") {
          const holdingsUrl = inst.holdingsDistributionUrl?.trim();
          if (holdingsUrl) {
            const validated = validateHoldingsDistributionUrl(holdingsUrl);
            if (!validated.ok || !validated.normalized) {
              return {
                error: validated.ok
                  ? "Invalid holdings URL"
                  : validated.message,
                status: 502,
              };
            }
            await writeProviderHoldingsDistributionCache(
              inst.id,
              validated.normalized,
              now,
              { providerBreakdownDataUrl: inst.providerBreakdownDataUrl },
            );
            if (inst.yahooSymbol) {
              const raw = await fetchYahooQuoteSummaryRaw(inst.yahooSymbol);
              await upsertYahooPriceFromQuoteSummaryRaw(
                inst.id,
                raw,
                now,
                inst.isin,
              );
            }
            await warnIfRefreshedDistributionHasUnknownCountry(
              instrumentId,
              inst.displayName,
            );
            return { ok: true };
          }
          if (inst.yahooSymbol) {
            const raw = await fetchYahooQuoteSummaryRaw(inst.yahooSymbol);
            await writeYahooDistributionCache(
              inst.id,
              raw,
              inst.yahooSymbol,
              now,
              inst.isin,
            );
            await warnIfRefreshedDistributionHasUnknownCountry(
              instrumentId,
              inst.displayName,
            );
            return { ok: true };
          }
          return {
            error: "Instrument has no external distribution source",
            status: 502,
          };
        }

        return {
          error: "Instrument has no external distribution source",
          status: 502,
        };
      },
    );
  } catch (e) {
    const dbMsg = userFacingMessageFromDbError(e);
    if (dbMsg) {
      return { error: dbMsg, status: 502 };
    }
    const { message, status } = formatYahooUpstreamError(e);
    return { error: message, status };
  }
}

export async function refreshStaleDistributionCaches(): Promise<void> {
  const positions = await loadOpenPositionsAggregateForUser();
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
      .where(eq(distributions.instrumentId, inst.id))
      .orderBy(desc(distributions.snapshotDate))
      .limit(1);

    if (cached?.source === "manual") {
      continue;
    }

    const needs = !cached || new Date(cached.fetchedAt) < staleBefore;

    if (!needs) {
      continue;
    }

    try {
      if (await instrumentHasCompositeConstituents(inst.id)) {
        await writeCompositeDistributionCache(inst.id, now);
        continue;
      }

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

      if (inst.kind === "commodity") {
        const sector = inst.commoditySector;
        if (!inst.yahooSymbol || sector == null) {
          continue;
        }
        if (sector !== "gold" && sector !== "silver" && sector !== "other") {
          continue;
        }
        yahooRefreshIndex++;
        if (yahooRefreshIndex > 1 && gapMs > 0) {
          await sleep(gapMs);
        }
        const raw = await fetchYahooQuoteSummaryRaw(inst.yahooSymbol);
        await upsertCommodityCachesFromYahooRaw(
          inst.id,
          raw,
          sector,
          inst.commodityCountryIso ?? null,
          now,
          inst.isin,
        );
        continue;
      }

      if (inst.kind === "etf" || inst.kind === "stock") {
        const holdingsUrl = inst.holdingsDistributionUrl?.trim();
        if (holdingsUrl) {
          const validated = validateHoldingsDistributionUrl(holdingsUrl);
          if (!validated.ok || !validated.normalized) {
            continue;
          }
          await writeProviderHoldingsDistributionCache(
            inst.id,
            validated.normalized,
            now,
            { providerBreakdownDataUrl: inst.providerBreakdownDataUrl },
          );
          if (inst.yahooSymbol) {
            yahooRefreshIndex++;
            if (yahooRefreshIndex > 1 && gapMs > 0) {
              await sleep(gapMs);
            }
            const raw = await fetchYahooQuoteSummaryRaw(inst.yahooSymbol);
            await upsertYahooPriceFromQuoteSummaryRaw(
              inst.id,
              raw,
              now,
              inst.isin,
            );
          }
          continue;
        }
        if (inst.yahooSymbol) {
          yahooRefreshIndex++;
          if (yahooRefreshIndex > 1 && gapMs > 0) {
            await sleep(gapMs);
          }
          const raw = await fetchYahooQuoteSummaryRaw(inst.yahooSymbol);
          await writeYahooDistributionCache(
            inst.id,
            raw,
            inst.yahooSymbol,
            now,
            inst.isin,
          );
        }
      }
    } catch (e) {
      console.error(`distribution refresh failed for instrument ${inst.id}`, e);
    }
  }
  await processFxBackfillQueue();
}
