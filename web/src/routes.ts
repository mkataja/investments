const portfolioBase = "/portfolio";
const instrumentsBase = "/instruments";

/** Resolved URL paths for `Link`, `Navigate`, and `navigate()`. */
export const routes = {
  root: "/",
  portfolio: {
    import: `${portfolioBase}/import`,
    distributions: `${portfolioBase}/distributions`,
    holdings: `${portfolioBase}/holdings`,
    transactions: `${portfolioBase}/transactions`,
  },
  instruments: {
    list: instrumentsBase,
    new: `${instrumentsBase}/new`,
  },
  brokers: "/brokers",
  importLegacy: "/import",
} as const;

/** React Router `<Route path>` values (include `:param` segments). */
export const pattern = {
  root: "/",
  portfolioImport: `${portfolioBase}/import`,
  portfolioIndex: portfolioBase,
  portfolioSection: `${portfolioBase}/:section`,
  instrumentsList: instrumentsBase,
  instrumentsNew: `${instrumentsBase}/new`,
  instrumentEdit: `${instrumentsBase}/:id/edit`,
  brokers: "/brokers",
  importLegacy: "/import",
} as const;

const PORTFOLIO_SECTION_IDS = [
  "distributions",
  "holdings",
  "transactions",
] as const;

export type PortfolioSection = (typeof PORTFOLIO_SECTION_IDS)[number];

export function isPortfolioSection(
  s: string | undefined,
): s is PortfolioSection {
  return s === "distributions" || s === "holdings" || s === "transactions";
}

export function instrumentEditPath(id: number): string {
  return `${instrumentsBase}/${id}/edit`;
}

export function pathnameIsUnderPortfolio(pathname: string): boolean {
  return (
    pathname === routes.root ||
    pathname === portfolioBase ||
    pathname.startsWith(`${portfolioBase}/`)
  );
}

export function pathnameIsUnderInstruments(pathname: string): boolean {
  return (
    pathname === instrumentsBase || pathname.startsWith(`${instrumentsBase}/`)
  );
}
