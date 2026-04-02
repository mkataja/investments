import { MIN_PORTFOLIO_ALLOCATION_FRACTION } from "@investments/lib/minPortfolioAllocationFraction";
import {
  PORTFOLIO_ASSET_MIX_COLORS,
  PORTFOLIO_BOND_MIX_PIE_COLORS,
} from "../../../lib/portfolioChartPalette";
import { DISTRIBUTION_SECTOR_TITLES } from "../../../lib/sectorTitles";
import type { PortfolioDistributions } from "../types";

export const BOND_MIX_NO_BONDS_SECTOR_ID = "_no_bonds";
const BOND_MIX_NO_BONDS_LABEL = "No bonds";
/** slate-500 — synthetic slice when a portfolio has no bond sleeve (compare mode). */
const BOND_MIX_NO_BONDS_FILL = "#64748b";

type BondMixPieRow = {
  sectorId: string;
  name: string;
  value: number;
  fill: string;
};

export function computeBondMixPieData(args: {
  portfolio: PortfolioDistributions;
  comparePortfolio: PortfolioDistributions | null;
  showDistributionCompare: boolean;
}): BondMixPieRow[] {
  const { portfolio, comparePortfolio, showDistributionCompare } = args;

  const mapSlice = (s: { sectorId: string; weight: number }) => ({
    sectorId: s.sectorId,
    name:
      DISTRIBUTION_SECTOR_TITLES[
        s.sectorId as keyof typeof DISTRIBUTION_SECTOR_TITLES
      ] ?? s.sectorId,
    value: s.weight,
    fill:
      PORTFOLIO_BOND_MIX_PIE_COLORS[s.sectorId] ??
      PORTFOLIO_ASSET_MIX_COLORS.bonds,
  });

  if (!showDistributionCompare || !comparePortfolio) {
    return portfolio.bondMix.map(mapSlice);
  }

  const pList = portfolio.bondMix;
  const cList = comparePortfolio.bondMix ?? [];
  const pHas = pList.length > 0;
  const cHas = cList.length > 0;
  const pMap = new Map(pList.map((s) => [s.sectorId, s.weight]));
  const cMap = new Map(cList.map((s) => [s.sectorId, s.weight]));

  const sectorTitle = (sectorId: string) =>
    DISTRIBUTION_SECTOR_TITLES[
      sectorId as keyof typeof DISTRIBUTION_SECTOR_TITLES
    ] ?? sectorId;

  const sectorFill = (sectorId: string) =>
    PORTFOLIO_BOND_MIX_PIE_COLORS[sectorId] ?? PORTFOLIO_ASSET_MIX_COLORS.bonds;

  const noBondsRow = (primaryWeight: number) => ({
    sectorId: BOND_MIX_NO_BONDS_SECTOR_ID,
    name: BOND_MIX_NO_BONDS_LABEL,
    value: primaryWeight,
    fill: BOND_MIX_NO_BONDS_FILL,
  });

  if (pHas && cHas) {
    const sectorIds = [...new Set([...pMap.keys(), ...cMap.keys()])].filter(
      (id) =>
        (pMap.get(id) ?? 0) >= MIN_PORTFOLIO_ALLOCATION_FRACTION ||
        (cMap.get(id) ?? 0) >= MIN_PORTFOLIO_ALLOCATION_FRACTION,
    );
    sectorIds.sort((a, b) => {
      const ma = Math.max(pMap.get(a) ?? 0, cMap.get(a) ?? 0);
      const mb = Math.max(pMap.get(b) ?? 0, cMap.get(b) ?? 0);
      return mb - ma;
    });
    return sectorIds.map((sectorId) => ({
      sectorId,
      name: sectorTitle(sectorId),
      value: pMap.get(sectorId) ?? 0,
      fill: sectorFill(sectorId),
    }));
  }

  if (pHas && !cHas) {
    const sectorIds = [...pMap.keys()].filter(
      (id) => (pMap.get(id) ?? 0) >= MIN_PORTFOLIO_ALLOCATION_FRACTION,
    );
    sectorIds.sort((a, b) => (pMap.get(b) ?? 0) - (pMap.get(a) ?? 0));
    return [
      ...sectorIds.map((sectorId) => ({
        sectorId,
        name: sectorTitle(sectorId),
        value: pMap.get(sectorId) ?? 0,
        fill: sectorFill(sectorId),
      })),
      noBondsRow(0),
    ];
  }

  if (!pHas && cHas) {
    const sectorIds = [...cMap.keys()].filter(
      (id) => (cMap.get(id) ?? 0) >= MIN_PORTFOLIO_ALLOCATION_FRACTION,
    );
    sectorIds.sort((a, b) => (cMap.get(b) ?? 0) - (cMap.get(a) ?? 0));
    return [
      ...sectorIds.map((sectorId) => ({
        sectorId,
        name: sectorTitle(sectorId),
        value: 0,
        fill: sectorFill(sectorId),
      })),
      noBondsRow(1),
    ];
  }

  return [];
}
