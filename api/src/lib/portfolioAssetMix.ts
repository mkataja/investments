import { MIN_PORTFOLIO_ALLOCATION_FRACTION } from "@investments/lib";

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

export type AssetMixEur = {
  equitiesEur: number;
  bondsTotalEur: number;
  commodityGoldEur: number;
  commoditySilverEur: number;
  commodityOtherEur: number;
  cashInFundsEur: number;
  cashExcessEur: number;
};

/**
 * EUR slices for the portfolio asset mix pie from merged sectors + principal/cash inputs
 * (`GET /portfolio/distributions`).
 */
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

export type BondMixSlice = {
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
