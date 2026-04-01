import { PORTFOLIO_ASSET_MIX_COLORS } from "../../../lib/portfolioChartPalette";
import { DISTRIBUTION_SECTOR_TITLES } from "../../../lib/sectorTitles";
import type { PortfolioDistributions } from "../types";

export function assetMixPieRowsFromAssetMix(
  assetMix: PortfolioDistributions["assetMix"],
) {
  const m = assetMix;
  return [
    {
      name: "Equities",
      value: m.equitiesEur,
      fill: PORTFOLIO_ASSET_MIX_COLORS.equities,
    },
    {
      name: "Bonds (total)",
      value: m.bondsTotalEur,
      fill: PORTFOLIO_ASSET_MIX_COLORS.bonds,
    },
    {
      name: DISTRIBUTION_SECTOR_TITLES.commodity_gold,
      value: m.commodityGoldEur,
      fill: PORTFOLIO_ASSET_MIX_COLORS.commodityGold,
    },
    {
      name: DISTRIBUTION_SECTOR_TITLES.commodity_silver,
      value: m.commoditySilverEur,
      fill: PORTFOLIO_ASSET_MIX_COLORS.commoditySilver,
    },
    {
      name: DISTRIBUTION_SECTOR_TITLES.commodity_other,
      value: m.commodityOtherEur,
      fill: PORTFOLIO_ASSET_MIX_COLORS.commodityOther,
    },
    {
      name: "Cash (in funds)",
      value: m.cashInFundsEur,
      fill: PORTFOLIO_ASSET_MIX_COLORS.cashInFunds,
    },
    {
      name: "Cash (in accounts - excluding emergency fund)",
      value: m.cashExcessEur,
      fill: PORTFOLIO_ASSET_MIX_COLORS.cashExcess,
    },
  ];
}
