export const PORTFOLIO_KINDS = ["live", "benchmark"] as const;
export type PortfolioKind = (typeof PORTFOLIO_KINDS)[number];

export function isPortfolioKind(s: string): s is PortfolioKind {
  return (PORTFOLIO_KINDS as readonly string[]).includes(s);
}
