import {
  instruments,
  seligsonDistributionCache,
  seligsonFunds,
  yahooFinanceCache,
} from "@investments/db";
import type { DistributionPayload } from "@investments/lib/distributionPayload";
import { compositePseudoKeyToSyntheticPayload } from "@investments/lib/instrumentComposite";
import { eq } from "drizzle-orm";
import { db } from "../../db.js";
import { roundWeights } from "../../distributions/roundWeights.js";
import {
  SELIGSON_BOND_ALLOCATION_VIEW,
  SELIGSON_BOND_COUNTRY_VIEW,
  SELIGSON_HOLDINGS_VIEW,
  fetchSeligsonHtml,
  isSeligsonBondAllocationPage,
  parseSeligsonBondFundDistributions,
  parseSeligsonFundName,
  stripSeligsonFundViewerTitleSuffix,
} from "../../distributions/seligson.js";
import { upsertSeligsonFundValuesFromPage } from "../../distributions/seligsonFundValues.js";
import { buildResolvedSeligsonHoldingsPayload } from "../../distributions/seligsonHoldingsResolve.js";
import {
  fetchSeligsonPublicPageHtml,
  parseSeligsonPharosAllocationTable,
} from "../../distributions/seligsonPharosAllocationTable.js";
import { calendarDateUtcFromInstant } from "../../lib/calendarDateUtc.js";
import { mergeCompositeDistributionPayload } from "../instrument/compositeDistribution.js";
import {
  suggestBestInstrumentId,
  suggestPseudoKeyForLabel,
} from "../instrument/compositeInstrumentMatch.js";
import { loadInstrumentMatchCandidates } from "../instrument/instrumentMatchCandidates.js";
import { loadLatestDistributionPayloadsByInstrumentIds } from "../instrument/latestPriceDistribution.js";
import { upsertDistributionSnapshot } from "../instrument/priceDistributionWrite.js";
import { isSeligsonFundViewerUrl } from "../seligson/seligsonFundIntroPage.js";

/** Updates `seligson_funds.name` from FundViewer HTML and syncs matching `instruments.display_name`. */
async function updateSeligsonFundNameFromViewerHtml(
  fid: number,
  ...htmlParts: string[]
): Promise<void> {
  const [existing] = await db
    .select()
    .from(seligsonFunds)
    .where(eq(seligsonFunds.fid, fid))
    .limit(1);
  if (!existing) {
    return;
  }
  let name: string | null = null;
  for (const html of htmlParts) {
    name = parseSeligsonFundName(html);
    if (name) {
      break;
    }
  }
  if (!name) {
    return;
  }
  const previousFundName = existing.name;
  if (name !== previousFundName) {
    await db
      .update(seligsonFunds)
      .set({ name })
      .where(eq(seligsonFunds.fid, fid));
  }
  const linked = await db
    .select({ id: instruments.id, displayName: instruments.displayName })
    .from(instruments)
    .where(eq(instruments.seligsonFundId, existing.id));
  for (const row of linked) {
    const mirrorsFundRow = row.displayName === previousFundName;
    const mirrorsParsedTitle =
      stripSeligsonFundViewerTitleSuffix(row.displayName) === name;
    if ((mirrorsFundRow || mirrorsParsedTitle) && row.displayName !== name) {
      await db
        .update(instruments)
        .set({ displayName: name })
        .where(eq(instruments.id, row.id));
    }
  }
}

/**
 * Funds with a stored public allocation table URL (resolved once at create from “Rahaston sijoitukset”):
 * fetch that page, parse Pharos-style rows, and merge child instrument distributions. Returns
 * `false` if the page is missing or not parseable as that format (caller falls back to FundViewer
 * bond / holdings).
 */
async function tryWriteSeligsonAllocationFromPublicTablePage(
  instrumentId: number,
  fid: number,
  publicAllocationPageUrl: string,
  fetchedAt: Date,
): Promise<boolean> {
  if (isSeligsonFundViewerUrl(publicAllocationPageUrl)) {
    return false;
  }
  let tableHtml: string;
  try {
    tableHtml = await fetchSeligsonPublicPageHtml(publicAllocationPageUrl);
  } catch {
    return false;
  }
  const parsed = parseSeligsonPharosAllocationTable(tableHtml);
  if (parsed.rows.length === 0) {
    return false;
  }
  const candidates = await loadInstrumentMatchCandidates();
  type RowResolution =
    | { weight: number; kind: "ready"; payload: DistributionPayload }
    | { weight: number; kind: "child"; childId: number };
  const resolutions: RowResolution[] = [];
  for (const r of parsed.rows) {
    const pseudo = suggestPseudoKeyForLabel(r.rawLabel);
    if (pseudo) {
      resolutions.push({
        weight: r.pctOfFund,
        kind: "ready",
        payload: compositePseudoKeyToSyntheticPayload(pseudo),
      });
      continue;
    }
    const childId = suggestBestInstrumentId(r.rawLabel, candidates);
    if (childId == null) {
      resolutions.push({
        weight: r.pctOfFund,
        kind: "ready",
        payload: { countries: {}, sectors: { other: 1 } },
      });
      continue;
    }
    resolutions.push({ weight: r.pctOfFund, kind: "child", childId });
  }
  const childIds = resolutions
    .filter(
      (x): x is { weight: number; kind: "child"; childId: number } =>
        x.kind === "child",
    )
    .map((x) => x.childId);
  const distById = await loadLatestDistributionPayloadsByInstrumentIds(
    db,
    childIds,
  );
  const items: Array<{ weight: number; payload: DistributionPayload | null }> =
    resolutions.map((x) =>
      x.kind === "ready"
        ? { weight: x.weight, payload: x.payload }
        : { weight: x.weight, payload: distById.get(x.childId) ?? null },
    );
  const payload = mergeCompositeDistributionPayload(items);
  await db.transaction(async (tx) => {
    await tx
      .insert(seligsonDistributionCache)
      .values({
        instrumentId,
        fetchedAt,
        holdingsHtml: null,
        allocationHtml: tableHtml,
        countryHtml: null,
      })
      .onConflictDoUpdate({
        target: seligsonDistributionCache.instrumentId,
        set: {
          fetchedAt,
          holdingsHtml: null,
          allocationHtml: tableHtml,
          countryHtml: null,
        },
      });
    await tx
      .delete(yahooFinanceCache)
      .where(eq(yahooFinanceCache.instrumentId, instrumentId));
    await upsertDistributionSnapshot(tx, {
      instrumentId,
      snapshotDate: calendarDateUtcFromInstant(fetchedAt),
      fetchedAt,
      source: "seligson_scrape",
      payload,
    });
  });
  await updateSeligsonFundNameFromViewerHtml(fid, tableHtml);
  await upsertSeligsonFundValuesFromPage(db, fetchedAt);
  return true;
}

export async function writeSeligsonDistributionCache(
  instrumentId: number,
  fid: number,
  fetchedAt: Date = new Date(),
): Promise<void> {
  const [sfRow] = await db
    .select()
    .from(seligsonFunds)
    .where(eq(seligsonFunds.fid, fid))
    .limit(1);
  const publicAllocationUrl = sfRow?.publicAllocationPageUrl?.trim();
  if (publicAllocationUrl) {
    const wrote = await tryWriteSeligsonAllocationFromPublicTablePage(
      instrumentId,
      fid,
      publicAllocationUrl,
      fetchedAt,
    );
    if (wrote) {
      return;
    }
  }

  const allocationHtml = await fetchSeligsonHtml(
    fid,
    SELIGSON_BOND_ALLOCATION_VIEW,
  );
  let payload: {
    countries: Record<string, number>;
    sectors: Record<string, number>;
  };

  if (isSeligsonBondAllocationPage(allocationHtml)) {
    const countryHtml = await fetchSeligsonHtml(
      fid,
      SELIGSON_BOND_COUNTRY_VIEW,
    );
    const { payload: rawPayload } = parseSeligsonBondFundDistributions(
      allocationHtml,
      countryHtml,
    );
    payload = {
      countries: roundWeights(rawPayload.countries),
      sectors: roundWeights(rawPayload.sectors),
    };
    await db.transaction(async (tx) => {
      await tx
        .insert(seligsonDistributionCache)
        .values({
          instrumentId,
          fetchedAt,
          holdingsHtml: null,
          allocationHtml,
          countryHtml,
        })
        .onConflictDoUpdate({
          target: seligsonDistributionCache.instrumentId,
          set: {
            fetchedAt,
            holdingsHtml: null,
            allocationHtml,
            countryHtml,
          },
        });
      await tx
        .delete(yahooFinanceCache)
        .where(eq(yahooFinanceCache.instrumentId, instrumentId));
      await upsertDistributionSnapshot(tx, {
        instrumentId,
        snapshotDate: calendarDateUtcFromInstant(fetchedAt),
        fetchedAt,
        source: "seligson_scrape",
        payload,
      });
    });
    await updateSeligsonFundNameFromViewerHtml(
      fid,
      allocationHtml,
      countryHtml,
    );
    await upsertSeligsonFundValuesFromPage(db, fetchedAt);
    return;
  }

  const holdingsHtml = await fetchSeligsonHtml(fid, SELIGSON_HOLDINGS_VIEW);
  const { payload: rawPayload } = await buildResolvedSeligsonHoldingsPayload(
    holdingsHtml,
    fetchedAt,
  );
  payload = {
    countries: roundWeights(rawPayload.countries),
    sectors: roundWeights(rawPayload.sectors),
  };

  await db.transaction(async (tx) => {
    await tx
      .insert(seligsonDistributionCache)
      .values({
        instrumentId,
        fetchedAt,
        holdingsHtml,
        allocationHtml: null,
        countryHtml: null,
      })
      .onConflictDoUpdate({
        target: seligsonDistributionCache.instrumentId,
        set: {
          fetchedAt,
          holdingsHtml,
          allocationHtml: null,
          countryHtml: null,
        },
      });
    await tx
      .delete(yahooFinanceCache)
      .where(eq(yahooFinanceCache.instrumentId, instrumentId));
    await upsertDistributionSnapshot(tx, {
      instrumentId,
      snapshotDate: calendarDateUtcFromInstant(fetchedAt),
      fetchedAt,
      source: "seligson_scrape",
      payload,
    });
  });

  await updateSeligsonFundNameFromViewerHtml(fid, holdingsHtml);
  await upsertSeligsonFundValuesFromPage(db, fetchedAt);
}
