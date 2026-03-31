import { describe, expect, it } from "vitest";
import {
  bondPrincipalShareFromMergedSectors,
  computeAssetMixEur,
  computeBondMix,
  sumBondSectorWeights,
} from "./portfolioAssetMix.js";

describe("sumBondSectorWeights", () => {
  it("sums the four bond distribution keys", () => {
    expect(
      sumBondSectorWeights({
        long_government_bonds: 0.1,
        long_corporate_bonds: 0.05,
        short_bonds: 0.02,
        ultrashort_bonds: 0.03,
        technology: 0.8,
      }),
    ).toBeCloseTo(0.2);
  });

  it("ignores non-bond keys and non-positive values", () => {
    expect(
      sumBondSectorWeights({
        long_government_bonds: 0.5,
        technology: 0.5,
        short_bonds: 0,
        long_corporate_bonds: -1,
      }),
    ).toBeCloseTo(0.5);
  });
});

describe("bondPrincipalShareFromMergedSectors", () => {
  it("equals the sum of bond sector weights when in [0, 1]", () => {
    const sectors = {
      long_government_bonds: 0.35,
      technology: 0.65,
    };
    expect(bondPrincipalShareFromMergedSectors(sectors)).toBeCloseTo(0.35);
    expect(bondPrincipalShareFromMergedSectors(sectors)).toBeCloseTo(
      sumBondSectorWeights(sectors),
    );
  });

  it("is 0 when merged sectors carry no bond keys", () => {
    expect(bondPrincipalShareFromMergedSectors({ technology: 1 })).toBe(0);
    expect(bondPrincipalShareFromMergedSectors({})).toBe(0);
  });

  it("clamps to [0, 1] if bond weights sum above 1", () => {
    expect(
      bondPrincipalShareFromMergedSectors({
        long_government_bonds: 0.6,
        long_corporate_bonds: 0.6,
      }),
    ).toBe(1);
  });
});

describe("computeAssetMixEur", () => {
  it("splits principal into bonds and equities without loss", () => {
    const principalEur = 48_250.75;
    const mix = computeAssetMixEur({
      nonCashPrincipalEur: principalEur,
      mergedSectors: {
        long_government_bonds: 0.22,
        short_bonds: 0.11,
      },
      cashInFundsEur: 0,
      cashExcessEur: 0,
    });
    expect(mix.equitiesEur + mix.bondsTotalEur).toBeCloseTo(principalEur);
    expect(mix.bondsTotalEur / principalEur).toBeCloseTo(0.33);
  });

  it("passes through cash slices", () => {
    const mix = computeAssetMixEur({
      nonCashPrincipalEur: 1000,
      mergedSectors: { technology: 1 },
      cashInFundsEur: 50,
      cashExcessEur: 200,
    });
    expect(mix.cashInFundsEur).toBe(50);
    expect(mix.cashExcessEur).toBe(200);
    expect(mix.equitiesEur).toBe(1000);
    expect(mix.bondsTotalEur).toBe(0);
  });
});

describe("computeBondMix", () => {
  it("renormalizes bond keys to sum to 1 and sorts by weight desc", () => {
    const slices = computeBondMix({
      long_government_bonds: 0.2,
      short_bonds: 0.1,
      technology: 0.7,
    });
    expect(slices).toHaveLength(2);
    expect(slices[0]?.sectorId).toBe("long_government_bonds");
    expect(slices[0]?.weight).toBeCloseTo(2 / 3);
    expect(slices[1]?.sectorId).toBe("short_bonds");
    expect(slices[1]?.weight).toBeCloseTo(1 / 3);
    expect(slices.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1);
  });

  it("returns empty when no bond mass", () => {
    expect(computeBondMix({ technology: 1 })).toEqual([]);
    expect(computeBondMix({})).toEqual([]);
  });
});
