/** Bond sector keys on merged portfolio `sectors` (same semantics as web `distributionDisplay`). */
const BOND_DISTRIBUTION_SECTOR_IDS = [
  "long_government_bonds",
  "long_corporate_bonds",
  "short_bonds",
  "ultrashort_bonds",
] as const;

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

export type AssetMixEur = {
  equitiesEur: number;
  bondsTotalEur: number;
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
  const p = input.nonCashPrincipalEur;
  return {
    equitiesEur: p * (1 - bondW),
    bondsTotalEur: p * bondW,
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
  if (sum < 1e-12) {
    return [];
  }
  const slices: BondMixSlice[] = [];
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (v !== undefined) {
      slices.push({ sectorId: k, weight: v / sum });
    }
  }
  slices.sort((a, b) => b.weight - a.weight);
  return slices;
}
