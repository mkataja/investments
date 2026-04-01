export const PORTFOLIO_ASSET_MIX_COLORS = {
  equities: "#ACDDF6",
  bonds: "#6B7FD7",
  commodityGold: "#D4A574",
  commoditySilver: "#B0B8C8",
  commodityOther: "#9A7B5C",
  cashInFunds: "#C2EABA",
  cashExcess: "#8BCB7A",
} as const;

/** Bond sleeve mix pie — darker → lighter periwinkle (same hue family as `#6B7FD7`). */
export const PORTFOLIO_BOND_MIX_PIE_COLORS: Record<string, string> = {
  long_corporate_bonds: "#4A54B8",
  long_government_bonds: "#5E6BC8",
  short_bonds: "#6B7FD7",
  ultrashort_bonds: "#C8D2F5",
};

/** Region, sector, and country bar charts — saturated blue primary vs lighter blue compare. */
export const PORTFOLIO_DISTRIBUTION_BAR_COLORS = {
  regionPrimary: "#3B7FD4",
  regionCompare: "#8EC0F2",
  sectorPrimary: "#3B7FD4",
  sectorCompare: "#8EC0F2",
  countryPrimary: "#3B7FD4",
  countryCompare: "#8EC0F2",
} as const;
