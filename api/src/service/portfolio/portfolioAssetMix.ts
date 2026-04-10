import { equitySectorsForDisplay } from "@investments/lib/distribution/equitySectorsForDisplay";
import type { DistributionPayload } from "@investments/lib/distributionPayload";
import { MIN_PORTFOLIO_ALLOCATION_FRACTION } from "@investments/lib/minPortfolioAllocationFraction";
import type { InferSelectModel } from "drizzle-orm";
import { classifyNonCashInstrument } from "./nonCashAssetClass.js";
import type { InstrumentRow } from "./valuation.js";

type DistributionRow = InferSelectModel<
  typeof import("@investments/db").distributions
>;

/** Unknown sector bucket for value-weighted portfolio sector merge. */
const PORTFOLIO_UNKNOWN_SECTOR = "__portfolio_unknown__";

function stripCashFromSectorWeights(
  sectors: Record<string, number> | undefined,
): Record<string, number> {
  if (!sectors) {
    return {};
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(sectors)) {
    if (k === "cash") {
      continue;
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = v;
    }
  }
  return out;
}

function sumSectorWeights(sectors: Record<string, number>): number {
  let s = 0;
  for (const v of Object.values(sectors)) {
    s += v;
  }
  return s;
}

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

/**
 * Embedded fund cash fraction and principal (non-cash position value minus embedded cash).
 */
export function embeddedCashAndPrincipalEur(
  valueEur: number,
  payload: DistributionPayload | undefined,
): { cashFrac: number; embeddedCashEur: number; principalEur: number } {
  const cashFracRaw =
    payload?.sectors && typeof payload.sectors.cash === "number"
      ? payload.sectors.cash
      : 0;
  const cashFrac = Math.min(1, Math.max(0, cashFracRaw));
  const embeddedCashEur = valueEur * cashFrac;
  const principalEur = Math.max(0, valueEur - embeddedCashEur);
  return { cashFrac, embeddedCashEur, principalEur };
}

/**
 * One non-cash position's value-weighted contribution to merged sector weights (cash stripped).
 * Mutates `sectors`. Returns updated `missingSectorW` (unknown sector mass before normalization).
 */
export function applyValuedRowToMergedSectors(
  sectors: Record<string, number>,
  missingSectorW: number,
  w: number,
  instrumentId: number,
  payload: DistributionPayload | undefined,
  onSectorContrib?: (
    sectorKey: string,
    instrumentId: number,
    delta: number,
  ) => void,
): number {
  const nonCashSectors = stripCashFromSectorWeights(payload?.sectors);
  const nonCashSectorSum = sumSectorWeights(nonCashSectors);
  if (payload?.sectors && Object.keys(payload.sectors).length > 0) {
    if (nonCashSectorSum >= MIN_PORTFOLIO_ALLOCATION_FRACTION) {
      mergeWeighted(sectors, nonCashSectors, w);
      if (onSectorContrib) {
        for (const [s, v] of Object.entries(nonCashSectors)) {
          onSectorContrib(s, instrumentId, w * v);
        }
      }
    }
  } else {
    if (onSectorContrib) {
      onSectorContrib(PORTFOLIO_UNKNOWN_SECTOR, instrumentId, w);
    }
    return missingSectorW + w;
  }
  return missingSectorW;
}

/**
 * Renormalize merged sector weights to sum to 1 including unknown-sector mass, then drop tiny slices.
 */
export function finalizeMergedSectorWeights(
  sectors: Record<string, number>,
  missingSectorW: number,
): Record<string, number> {
  const sectorMassRaw =
    Object.values(sectors).reduce((a, b) => a + b, 0) + missingSectorW;
  let unknownMass = missingSectorW;
  if (sectorMassRaw >= MIN_PORTFOLIO_ALLOCATION_FRACTION) {
    for (const k of Object.keys(sectors)) {
      const v = sectors[k];
      if (v !== undefined) {
        sectors[k] = v / sectorMassRaw;
      }
    }
    unknownMass /= sectorMassRaw;
  }
  if (unknownMass >= MIN_PORTFOLIO_ALLOCATION_FRACTION) {
    sectors[PORTFOLIO_UNKNOWN_SECTOR] = unknownMass;
  }
  return filterWeightsByMinFraction(sectors);
}

/** Bond sector keys on merged portfolio `sectors` (same semantics as web `distributionDisplay`). */
const BOND_DISTRIBUTION_SECTOR_IDS = [
  "long_government_bonds",
  "long_corporate_bonds",
  "short_bonds",
  "ultrashort_bonds",
] as const;

const COMMODITY_DISTRIBUTION_SECTOR_IDS = [
  "commodity_gold",
  "commodity_silver",
  "commodity_other",
] as const;

function commodityPrincipalEurForMergedKey(
  principalEur: number,
  mergedSectors: Record<string, number>,
  key: (typeof COMMODITY_DISTRIBUTION_SECTOR_IDS)[number],
): number {
  const v = mergedSectors[key];
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
    return 0;
  }
  return principalEur * v;
}

export function sumCommoditySectorWeights(
  sectors: Record<string, number>,
): number {
  let s = 0;
  for (const id of COMMODITY_DISTRIBUTION_SECTOR_IDS) {
    const v = sectors[id];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      s += v;
    }
  }
  return s;
}

export function sumBondSectorWeights(sectors: Record<string, number>): number {
  let s = 0;
  for (const id of BOND_DISTRIBUTION_SECTOR_IDS) {
    const v = sectors[id];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      s += v;
    }
  }
  return s;
}

export function bondPrincipalShareFromMergedSectors(
  sectors: Record<string, number>,
): number {
  const w = sumBondSectorWeights(sectors);
  return Math.min(1, Math.max(0, w));
}

export function commodityPrincipalShareFromMergedSectors(
  sectors: Record<string, number>,
): number {
  const w = sumCommoditySectorWeights(sectors);
  return Math.min(1, Math.max(0, w));
}

type AssetMixEur = {
  equitiesEur: number;
  bondsTotalEur: number;
  commodityGoldEur: number;
  commoditySilverEur: number;
  commodityOtherEur: number;
  cashInFundsEur: number;
  cashExcessEur: number;
};

/**
 * Value-weighted merged sector weights and non-cash principal (same merge as
 * `getPortfolioDistributions`), for a fixed set of position values and distribution snapshots.
 */
export function buildMergedSectorsForAssetMix(
  valued: Array<{ inst: { kind: string; id: number }; valueEur: number }>,
  distMap: Map<number, DistributionRow>,
): {
  mergedSectors: Record<string, number>;
  nonCashPrincipalEur: number;
  cashInFundsEur: number;
} {
  const nonCashValueEur = valued.reduce(
    (s, x) => s + (x.inst.kind === "cash_account" ? 0 : x.valueEur),
    0,
  );

  const sectors: Record<string, number> = {};
  let missingSectorW = 0;
  let nonCashPrincipalEur = 0;
  let cashInFundsEur = 0;

  for (const row of valued) {
    const { inst } = row;
    if (inst.kind === "cash_account") {
      continue;
    }
    const w = nonCashValueEur > 0 ? row.valueEur / nonCashValueEur : 0;
    const cached = distMap.get(inst.id);
    const payload = cached?.payload as DistributionPayload | undefined;
    const { embeddedCashEur, principalEur } = embeddedCashAndPrincipalEur(
      row.valueEur,
      payload,
    );
    cashInFundsEur += embeddedCashEur;
    nonCashPrincipalEur += principalEur;

    missingSectorW = applyValuedRowToMergedSectors(
      sectors,
      missingSectorW,
      w,
      inst.id,
      payload,
    );
  }

  const mergedSectors = finalizeMergedSectorWeights(sectors, missingSectorW);
  return {
    mergedSectors,
    nonCashPrincipalEur,
    cashInFundsEur,
  };
}

/**
 * Equity sleeve only: position value in EUR per instrument, keyed by instrument id string.
 * Same `classifyNonCashInstrument` rules as portfolio `positions[].assetClass` (Yahoo bond ETFs, etc.).
 */
export function equityHoldingsEurFromValuedPositions(
  valued: Array<{ inst: InstrumentRow; valueEur: number }>,
  yahooRawById: ReadonlyMap<number, unknown>,
  seligsonNameById: ReadonlyMap<number, string>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { inst, valueEur } of valued) {
    if (inst.kind === "cash_account") {
      continue;
    }
    if (
      typeof valueEur !== "number" ||
      !Number.isFinite(valueEur) ||
      valueEur <= 0
    ) {
      continue;
    }
    const yahooRaw = yahooRawById.get(inst.id) ?? null;
    const seligsonName =
      inst.seligsonFundId != null
        ? (seligsonNameById.get(inst.seligsonFundId) ?? null)
        : null;
    if (classifyNonCashInstrument(inst, yahooRaw, seligsonName) !== "equity") {
      continue;
    }
    out[String(inst.id)] = valueEur;
  }
  return out;
}

/**
 * EUR per equity-sector bucket (same keys as web `equitySectorsForDisplay` on merged sectors),
 * using the equity sleeve from `computeAssetMixEur`.
 */
export function equitySectorsEurFromSnapshot(input: {
  nonCashPrincipalEur: number;
  mergedSectors: Record<string, number>;
  cashInFundsEur: number;
  cashExcessEur: number;
}): Record<string, number> {
  const mix = computeAssetMixEur(input);
  const weights = equitySectorsForDisplay(input.mergedSectors);
  const out: Record<string, number> = {};
  for (const [k, w] of Object.entries(weights)) {
    const eur = mix.equitiesEur * w;
    if (typeof eur === "number" && Number.isFinite(eur) && eur > 0) {
      out[k] = eur;
    }
  }
  return out;
}

export function computeAssetMixEur(input: {
  nonCashPrincipalEur: number;
  mergedSectors: Record<string, number>;
  cashInFundsEur: number;
  cashExcessEur: number;
}): AssetMixEur {
  const bondW = bondPrincipalShareFromMergedSectors(input.mergedSectors);
  const commodityW = commodityPrincipalShareFromMergedSectors(
    input.mergedSectors,
  );
  const p = input.nonCashPrincipalEur;
  return {
    equitiesEur: p * Math.max(0, 1 - bondW - commodityW),
    bondsTotalEur: p * bondW,
    commodityGoldEur: commodityPrincipalEurForMergedKey(
      p,
      input.mergedSectors,
      "commodity_gold",
    ),
    commoditySilverEur: commodityPrincipalEurForMergedKey(
      p,
      input.mergedSectors,
      "commodity_silver",
    ),
    commodityOtherEur: commodityPrincipalEurForMergedKey(
      p,
      input.mergedSectors,
      "commodity_other",
    ),
    cashInFundsEur: input.cashInFundsEur,
    cashExcessEur: input.cashExcessEur,
  };
}

type BondMixSlice = {
  sectorId: string;
  /** Share within the bond sleeve (0–1); slices sum to 1 when non-empty. */
  weight: number;
};

/**
 * Bond-type split within merged `sectors`, renormalized to 100% among bond keys only
 * (same as web `bondMixForDisplay` / bond mix pie).
 */
export function computeBondMix(
  mergedSectors: Record<string, number>,
): BondMixSlice[] {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(mergedSectors)) {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      continue;
    }
    if (!(BOND_DISTRIBUTION_SECTOR_IDS as readonly string[]).includes(k)) {
      continue;
    }
    out[k] = v;
  }
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  if (sum < MIN_PORTFOLIO_ALLOCATION_FRACTION) {
    return [];
  }
  const slices: BondMixSlice[] = [];
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (v !== undefined) {
      const weight = v / sum;
      if (weight >= MIN_PORTFOLIO_ALLOCATION_FRACTION) {
        slices.push({ sectorId: k, weight });
      }
    }
  }
  slices.sort((a, b) => b.weight - a.weight);
  return slices;
}
