import { instruments, seligsonFunds, yahooFinanceCache } from "@investments/db";
import type { DistributionPayload } from "@investments/lib/distributionPayload";
import { resolveRegionKeyToIso } from "@investments/lib/geo/countryIso";
import { aggregateRegionsToGeoBuckets } from "@investments/lib/geo/geoBuckets";
import { instrumentTickerDisplay } from "@investments/lib/instrumentKind";
import { MIN_PORTFOLIO_ALLOCATION_FRACTION } from "@investments/lib/minPortfolioAllocationFraction";
import { type InferSelectModel, inArray } from "drizzle-orm";
import { db } from "../../db.js";
import { distributionGeoScaleForCountryMerge } from "../instrument/distributionGeoScale.js";
import { loadLatestDistributionRowsByInstrumentIds } from "../instrument/latestPriceDistribution.js";
import {
  BENCHMARK_TOTAL_EUR_DEFAULT,
  loadBenchmarkValuedRows,
} from "./benchmarkPortfolio.js";
import { emergencyFundTargetEurFromDb } from "./emergencyFundTargetEurFromDb.js";
import {
  type NonCashAssetClass,
  classifyNonCashInstrument,
} from "./nonCashAssetClass.js";
import { loadPortfolioOwnedByUser } from "./portfolioAccess.js";
import {
  applyValuedRowToMergedSectors,
  computeAssetMixEur,
  computeBondMix,
  embeddedCashAndPrincipalEur,
  finalizeMergedSectorWeights,
} from "./portfolioAssetMix.js";
import { loadOpenPositionsForPortfolio } from "./positions.js";
import { valuePortfolioRowsEur } from "./valuation.js";

const PORTFOLIO_UNKNOWN_COUNTRY = "__portfolio_unknown__";
/** Matches `UNMAPPED_COUNTRY_KEY` in web `distributionDisplay` after ISO normalization. */
const UNMAPPED_COUNTRY_ISO = "__unmapped__";

type TopHoldingRow = {
  instrumentId: number;
  displayName: string;
  /** Yahoo symbol for ETF/stock; null when not applicable (same rules as list ticker column). */
  tickerSymbol: string | null;
  /** Share of this bucket (0–1) from this holding. */
  pctOfBucket: number;
};

function tickerSymbolForTopHolding(inst: {
  kind: string;
  yahooSymbol: string | null;
  seligsonFundId: number | null;
}): string | null {
  return instrumentTickerDisplay({
    kind: inst.kind,
    yahooSymbol: inst.yahooSymbol,
    seligsonFund: inst.seligsonFundId != null ? { fid: 0 } : null,
  });
}

type ContribMap = Map<string, Map<number, number>>;

function filterWeightsByMinFraction(
  m: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(m)) {
    if (typeof v === "number" && v >= MIN_PORTFOLIO_ALLOCATION_FRACTION) {
      out[k] = v;
    }
  }
  return out;
}

function mergeWeighted(
  acc: Record<string, number>,
  weights: Record<string, number>,
  w: number,
): void {
  for (const [k, v] of Object.entries(weights)) {
    acc[k] = (acc[k] ?? 0) + w * v;
  }
}

function scaleCountryWeights(
  weights: Record<string, number>,
  factor: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(weights)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      out[k] = v * factor;
    }
  }
  return out;
}

/** Same key merge as web `normalizeCountryWeightsForDisplay` (ISO + `__unmapped__`). */
function normalizeCountryWeightsToIso(
  countries: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [rawKey, w] of Object.entries(countries)) {
    if (typeof w !== "number" || !Number.isFinite(w) || w <= 0) {
      continue;
    }
    const iso = resolveRegionKeyToIso(rawKey.trim());
    const k = iso ?? UNMAPPED_COUNTRY_ISO;
    out[k] = (out[k] ?? 0) + w;
  }
  return out;
}

function addContrib(
  map: ContribMap,
  bucketKey: string,
  instrumentId: number,
  delta: number,
): void {
  if (!Number.isFinite(delta) || delta < MIN_PORTFOLIO_ALLOCATION_FRACTION) {
    return;
  }
  let inner = map.get(bucketKey);
  if (!inner) {
    inner = new Map();
    map.set(bucketKey, inner);
  }
  inner.set(instrumentId, (inner.get(instrumentId) ?? 0) + delta);
}

function top5FromContribMap(
  inner: Map<number, number> | undefined,
  idToName: Map<number, string>,
  idToTicker: Map<number, string | null>,
): TopHoldingRow[] {
  if (!inner || inner.size === 0) {
    return [];
  }
  const total = [...inner.values()].reduce((a, b) => a + b, 0);
  const rows = [...inner.entries()].map(([instrumentId, amt]) => ({
    instrumentId,
    displayName: idToName.get(instrumentId) ?? "?",
    tickerSymbol: idToTicker.get(instrumentId) ?? null,
    pctOfBucket: total >= MIN_PORTFOLIO_ALLOCATION_FRACTION ? amt / total : 0,
  }));
  rows.sort((a, b) => b.pctOfBucket - a.pctOfBucket);
  return rows.slice(0, 5);
}

function contribMapToTopRecord(
  map: ContribMap,
  idToName: Map<number, string>,
  idToTicker: Map<number, string | null>,
): Record<string, TopHoldingRow[]> {
  const out: Record<string, TopHoldingRow[]> = {};
  for (const [bucketKey, inner] of map.entries()) {
    const top = top5FromContribMap(inner, idToName, idToTicker);
    if (top.length > 0) {
      out[bucketKey] = top;
    }
  }
  return out;
}

export async function getPortfolioDistributions(portfolioId: number): Promise<{
  /** Value-weighted merge of per-instrument country weights (ISO or resolvable labels), before geo bucketing. */
  countries: Record<string, number>;
  regions: Record<string, number>;
  sectors: Record<string, number>;
  totalValueEur: number;
  /** Sum of (position EUR − embedded fund cash) for non–`cash_account` holdings. */
  nonCashPrincipalEur: number;
  /** Embedded cash from ETF/fund sector weights (`sectors.cash` × position value). */
  cashInFundsEur: number;
  /** `max(0, cashTotalEur - emergencyFundTargetEur)`. */
  cashExcessEur: number;
  /** `min(cashTotalEur, emergencyFundTargetEur)` — EF slice of cash. */
  emergencyFundSliceEur: number;
  emergencyFundTargetEur: number;
  cashTotalEur: number;
  cashBelowEmergencyTarget: boolean;
  /** EUR slices for the asset mix pie (merged `sectors` bond share × `nonCashPrincipalEur` + cash). */
  assetMix: {
    equitiesEur: number;
    bondsTotalEur: number;
    commodityGoldEur: number;
    commoditySilverEur: number;
    commodityOtherEur: number;
    cashInFundsEur: number;
    cashExcessEur: number;
  };
  /** Bond sleeve split (weights within bonds only), for the bond mix pie. */
  bondMix: Array<{ sectorId: string; weight: number }>;
  positions: Array<{
    instrumentId: number;
    displayName: string;
    quantity: number;
    /** EUR per one unit (position value ÷ quantity); null if not meaningful. */
    unitPriceEur: number | null;
    weight: number;
    valueEur: number;
    valuationSource: string;
    /** UI grouping (Yahoo/Seligson heuristics); not used for merged distribution charts. */
    assetClass: NonCashAssetClass | "cash_account";
  }>;
  /** Top holdings per distribution bucket (region / sector / country key). */
  bucketTopHoldings: {
    regions: Record<string, TopHoldingRow[]>;
    sectors: Record<string, TopHoldingRow[]>;
    countries: Record<string, TopHoldingRow[]>;
  };
}> {
  const pfRow = await loadPortfolioOwnedByUser(portfolioId);
  const emergencyFundTargetEur = pfRow
    ? emergencyFundTargetEurFromDb(pfRow.emergencyFundEur)
    : 0;

  const emptyDistributions = () => {
    const cashInFundsEur = 0;
    const cashExcessEur = 0;
    return {
      nonCashPrincipalEur: 0,
      cashInFundsEur,
      cashExcessEur,
      emergencyFundSliceEur: 0,
      emergencyFundTargetEur,
      cashTotalEur: 0,
      cashBelowEmergencyTarget: emergencyFundTargetEur > 0,
      assetMix: computeAssetMixEur({
        nonCashPrincipalEur: 0,
        mergedSectors: {},
        cashInFundsEur,
        cashExcessEur,
      }),
      bondMix: [],
    };
  };

  let valued: Array<{
    inst: InferSelectModel<typeof instruments>;
    qty: number;
    valueEur: number;
    source: string;
  }>;

  if (pfRow?.kind === "benchmark") {
    const notionRaw = Number(pfRow.benchmarkTotalEur);
    const bench = await loadBenchmarkValuedRows(
      portfolioId,
      Number.isFinite(notionRaw) && notionRaw > 0
        ? notionRaw
        : BENCHMARK_TOTAL_EUR_DEFAULT,
    );
    if (bench.length === 0) {
      return {
        countries: {},
        regions: {},
        sectors: {},
        totalValueEur: 0,
        ...emptyDistributions(),
        positions: [],
        bucketTopHoldings: { regions: {}, sectors: {}, countries: {} },
      };
    }
    valued = bench;
  } else {
    const pos = await loadOpenPositionsForPortfolio(portfolioId);
    if (pos.length === 0) {
      return {
        countries: {},
        regions: {},
        sectors: {},
        totalValueEur: 0,
        ...emptyDistributions(),
        positions: [],
        bucketTopHoldings: { regions: {}, sectors: {}, countries: {} },
      };
    }

    const instRows = await db
      .select()
      .from(instruments)
      .where(
        inArray(
          instruments.id,
          pos.map((p) => p.instrumentId),
        ),
      );

    const rows: Array<{
      inst: (typeof instRows)[0];
      qty: number;
    }> = [];
    for (const p of pos) {
      const inst = instRows.find((i) => i.id === p.instrumentId);
      if (!inst) {
        continue;
      }
      rows.push({ inst, qty: p.quantity });
    }

    const valuedResults = await valuePortfolioRowsEur(rows);
    valued = rows.map((row, i) => {
      const v = valuedResults[i];
      return {
        inst: row.inst,
        qty: row.qty,
        valueEur: v?.valueEur ?? 0,
        source: v?.source ?? "none",
      };
    });
  }

  const totalValueEur = valued.reduce((s, x) => s + x.valueEur, 0);

  const yahooInstrumentIds = [
    ...new Set(
      valued
        .filter(
          (r) =>
            r.inst.kind === "etf" ||
            r.inst.kind === "stock" ||
            r.inst.kind === "commodity",
        )
        .map((r) => r.inst.id),
    ),
  ];
  const yfcRows =
    yahooInstrumentIds.length === 0
      ? []
      : await db
          .select()
          .from(yahooFinanceCache)
          .where(inArray(yahooFinanceCache.instrumentId, yahooInstrumentIds));
  const yahooRawById = new Map(yfcRows.map((r) => [r.instrumentId, r.raw]));

  const seligsonIds = [
    ...new Set(
      valued
        .filter(
          (r) => r.inst.kind === "custom" && r.inst.seligsonFundId != null,
        )
        .map((r) => r.inst.seligsonFundId as number),
    ),
  ];
  const sfRows =
    seligsonIds.length === 0
      ? []
      : await db
          .select()
          .from(seligsonFunds)
          .where(inArray(seligsonFunds.id, seligsonIds));
  const seligsonNameById = new Map(sfRows.map((s) => [s.id, s.name] as const));

  const nonCashValueEur = valued.reduce(
    (s, x) => s + (x.inst.kind === "cash_account" ? 0 : x.valueEur),
    0,
  );

  const countryWeights: Record<string, number> = {};
  const sectors: Record<string, number> = {};
  let missingCountryW = 0;
  let missingSectorW = 0;

  const regionContrib: ContribMap = new Map();
  const sectorContrib: ContribMap = new Map();
  const countryContrib: ContribMap = new Map();

  let nonCashPrincipalEur = 0;
  let cashTotalEur = 0;
  let cashInFundsEur = 0;

  const nonCashInstIdsForDist = [
    ...new Set(
      valued
        .filter((r) => r.inst.kind !== "cash_account")
        .map((r) => r.inst.id),
    ),
  ];
  const distMap = await loadLatestDistributionRowsByInstrumentIds(
    db,
    nonCashInstIdsForDist,
  );

  for (const row of valued) {
    const { inst } = row;

    if (inst.kind === "cash_account") {
      cashTotalEur += row.valueEur;
      continue;
    }

    const w = nonCashValueEur > 0 ? row.valueEur / nonCashValueEur : 0;

    const cached = distMap.get(inst.id);
    const payload = cached?.payload as DistributionPayload | undefined;
    const { cashFrac, embeddedCashEur, principalEur } =
      embeddedCashAndPrincipalEur(row.valueEur, payload);
    cashInFundsEur += embeddedCashEur;
    nonCashPrincipalEur += principalEur;

    const geoScale = distributionGeoScaleForCountryMerge(payload, cashFrac);
    if (inst.kind !== "commodity") {
      if (payload?.countries && Object.keys(payload.countries).length > 0) {
        mergeWeighted(countryWeights, payload.countries, w * geoScale);
        const scaledCountries = scaleCountryWeights(
          payload.countries,
          w * geoScale,
        );
        const regionalBuckets = aggregateRegionsToGeoBuckets(scaledCountries);
        for (const [bucket, val] of Object.entries(regionalBuckets)) {
          if (val >= MIN_PORTFOLIO_ALLOCATION_FRACTION) {
            addContrib(regionContrib, bucket, inst.id, val);
          }
        }
        const isoNorm = normalizeCountryWeightsToIso(scaledCountries);
        for (const [isoKey, val] of Object.entries(isoNorm)) {
          if (val >= MIN_PORTFOLIO_ALLOCATION_FRACTION) {
            addContrib(countryContrib, isoKey, inst.id, val);
          }
        }
      } else {
        missingCountryW += w * geoScale;
        const instUnknown: Record<string, number> = {
          [PORTFOLIO_UNKNOWN_COUNTRY]: w * geoScale,
        };
        const regionalBuckets = aggregateRegionsToGeoBuckets(instUnknown);
        for (const [bucket, val] of Object.entries(regionalBuckets)) {
          if (val >= MIN_PORTFOLIO_ALLOCATION_FRACTION) {
            addContrib(regionContrib, bucket, inst.id, val);
          }
        }
        const isoNorm = normalizeCountryWeightsToIso(instUnknown);
        for (const [isoKey, val] of Object.entries(isoNorm)) {
          if (val >= MIN_PORTFOLIO_ALLOCATION_FRACTION) {
            addContrib(countryContrib, isoKey, inst.id, val);
          }
        }
      }
    }

    missingSectorW = applyValuedRowToMergedSectors(
      sectors,
      missingSectorW,
      w,
      inst.id,
      payload,
      (sectorKey, instrumentId, delta) =>
        addContrib(sectorContrib, sectorKey, instrumentId, delta),
    );
  }

  const cashExcessEur = Math.max(0, cashTotalEur - emergencyFundTargetEur);
  const emergencyFundSliceEur = Math.min(cashTotalEur, emergencyFundTargetEur);
  const cashBelowEmergencyTarget =
    emergencyFundTargetEur > 0 && cashTotalEur < emergencyFundTargetEur;

  if (missingCountryW >= MIN_PORTFOLIO_ALLOCATION_FRACTION) {
    countryWeights[PORTFOLIO_UNKNOWN_COUNTRY] = missingCountryW;
  }

  const sectorsForResponse = finalizeMergedSectorWeights(
    sectors,
    missingSectorW,
  );

  const positions = valued.map((row) => {
    const qty = row.qty;
    const valueEur = row.valueEur;
    const unitPriceEur =
      Math.abs(qty) > 1e-12 && Number.isFinite(valueEur)
        ? valueEur / qty
        : null;
    const assetClass: NonCashAssetClass | "cash_account" =
      row.inst.kind === "cash_account"
        ? "cash_account"
        : classifyNonCashInstrument(
            row.inst,
            yahooRawById.get(row.inst.id) ?? null,
            row.inst.seligsonFundId != null
              ? (seligsonNameById.get(row.inst.seligsonFundId) ?? null)
              : null,
          );
    return {
      instrumentId: row.inst.id,
      displayName: row.inst.displayName,
      quantity: qty,
      unitPriceEur,
      weight: totalValueEur > 0 ? valueEur / totalValueEur : 0,
      valueEur,
      valuationSource: row.source,
      assetClass,
    };
  });

  const regionsBucketed: Record<string, number> = {};
  const merged = aggregateRegionsToGeoBuckets(countryWeights);
  for (const [k, v] of Object.entries(merged)) {
    if (v >= MIN_PORTFOLIO_ALLOCATION_FRACTION) {
      regionsBucketed[k] = v;
    }
  }

  const idToName = new Map<number, string>(
    valued.map((r) => [r.inst.id, r.inst.displayName] as const),
  );
  const idToTicker = new Map<number, string | null>(
    valued.map((r) => [r.inst.id, tickerSymbolForTopHolding(r.inst)] as const),
  );

  const countriesForResponse = filterWeightsByMinFraction(countryWeights);

  return {
    countries: countriesForResponse,
    regions: regionsBucketed,
    sectors: sectorsForResponse,
    totalValueEur,
    nonCashPrincipalEur,
    cashInFundsEur,
    cashExcessEur,
    emergencyFundSliceEur,
    emergencyFundTargetEur,
    cashTotalEur,
    cashBelowEmergencyTarget,
    assetMix: computeAssetMixEur({
      nonCashPrincipalEur,
      mergedSectors: sectorsForResponse,
      cashInFundsEur,
      cashExcessEur,
    }),
    bondMix: computeBondMix(sectorsForResponse),
    positions,
    bucketTopHoldings: {
      regions: contribMapToTopRecord(regionContrib, idToName, idToTicker),
      sectors: contribMapToTopRecord(sectorContrib, idToName, idToTicker),
      countries: contribMapToTopRecord(countryContrib, idToName, idToTicker),
    },
  };
}
