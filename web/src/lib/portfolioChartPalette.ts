export const PORTFOLIO_ASSET_MIX_COLORS = {
  equities: "#ACDDF6",
  bonds: "#6B7FD7",
  commodityGold: "#D4A574",
  commoditySilver: "#B0B8C8",
  commodityOther: "#9A7B5C",
  cashInFunds: "#C2EABA",
  cashExcess: "#8BCB7A",
  /** Virtual leverage sleeve (≤ 0) for Diamond hands HODL chart. */
  virtualLeverage: "#94A3B8",
  /** Accrued interest on virtual leverage — slightly darker than `virtualLeverage`. */
  virtualLeverageInterest: "#64748B",
} as const;

/** Bond sleeve mix pie — darker → lighter periwinkle (same hue family as `#6B7FD7`). */
export const PORTFOLIO_BOND_MIX_PIE_COLORS: Record<string, string> = {
  long_corporate_bonds: "#4A54B8",
  long_government_bonds: "#5E6BC8",
  short_bonds: "#6B7FD7",
  ultrashort_bonds: "#C8D2F5",
};

/** Region, sector, and country bar charts — saturated blue primary vs lighter blue compare. */
/** Cycle for multi-series line charts (e.g. sector share over time). */
const PORTFOLIO_SECTOR_TIMESERIES_COLORS = [
  "#3B7FD4",
  "#6B7FD7",
  "#8BCB7A",
  "#D4A574",
  "#ACDDF6",
  "#9A7B5C",
  "#4A54B8",
  "#8EC0F2",
  "#C2EABA",
  "#5E6BC8",
  "#B0B8C8",
  "#2D6A4F",
] as const;

export function portfolioSectorTimeseriesColor(index: number): string {
  const colors = PORTFOLIO_SECTOR_TIMESERIES_COLORS;
  return colors.at(index % colors.length) ?? colors[0];
}

export const PORTFOLIO_DISTRIBUTION_BAR_COLORS = {
  regionPrimary: "#3B7FD4",
  regionCompare: "#8EC0F2",
  sectorPrimary: "#3B7FD4",
  sectorCompare: "#8EC0F2",
  countryPrimary: "#3B7FD4",
  countryCompare: "#8EC0F2",
} as const;

/** Blend `#RRGGBB` toward white for compare portfolio doughnut rings. */
export function lightenPortfolioHex(hex: string, amount: number): string {
  const t = Math.min(1, Math.max(0, amount));
  const h = hex.replace("#", "").trim();
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) {
    return hex;
  }
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  return `#${[mix(r), mix(g), mix(b)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")}`;
}
