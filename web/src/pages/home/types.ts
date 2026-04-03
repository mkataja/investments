import type { DistributionPayload } from "@investments/lib/distributionPayload";

export type HomeBroker = {
  id: number;
  name: string;
  brokerType: string;
};

export type HomeInstrument = {
  id: number;
  kind: string;
  displayName: string;
  yahooSymbol: string | null;
  seligsonFund: { id: number; fid: number; name: string } | null;
  cashCurrency?: string | null;
  cashGeoKey?: string | null;
  distribution: {
    fetchedAt: string;
    source: string;
    payload: DistributionPayload;
  } | null;
};

export type HomeTransaction = {
  id: number;
  portfolioId: number;
  brokerId: number;
  tradeDate: string;
  side: string;
  instrumentId: number;
  quantity: string;
  unitPrice: string;
  currency: string;
};

type PortfolioKind = "live" | "benchmark";

export type PortfolioEntity = {
  id: number;
  userId: number;
  name: string;
  kind: PortfolioKind;
  emergencyFundEur: number;
  /** Synthetic total EUR for benchmark distributions; meaningful when `kind === "benchmark"`. */
  benchmarkTotalEur: number;
  createdAt: string;
  updatedAt: string;
};

/** Weekly series from `GET /portfolio/asset-mix-history` (same sleeves as `assetMix`). */
export type AssetMixHistoryPoint = {
  date: string;
  /** Equity sleeve EUR per sector key (same breakdown as the sectors bar chart). */
  equitySectorsEur: Record<string, number>;
  /** Cumulative virtual leverage when `variant=hodl`; 0 for actual history. */
  virtualLeverageEur: number;
} & PortfolioDistributions["assetMix"];

export type BucketTopHolding = {
  instrumentId: number;
  displayName: string;
  /** Yahoo symbol for ETF/stock when applicable; null otherwise. */
  tickerSymbol: string | null;
  /** Share of this bucket (0–1) from this holding. */
  pctOfBucket: number;
};

export type PortfolioDistributions = {
  countries: Record<string, number>;
  regions: Record<string, number>;
  sectors: Record<string, number>;
  totalValueEur: number;
  /** Sum of (position EUR − embedded fund cash) for non–cash-account holdings. */
  nonCashPrincipalEur: number;
  cashInFundsEur: number;
  cashExcessEur: number;
  emergencyFundSliceEur: number;
  emergencyFundTargetEur: number;
  cashTotalEur: number;
  cashBelowEmergencyTarget: boolean;
  assetMix: {
    equitiesEur: number;
    bondsTotalEur: number;
    commodityGoldEur: number;
    commoditySilverEur: number;
    commodityOtherEur: number;
    cashInFundsEur: number;
    cashExcessEur: number;
  };
  bondMix: Array<{ sectorId: string; weight: number }>;
  positions: Array<{
    instrumentId: number;
    displayName: string;
    quantity: number;
    unitPriceEur: number | null;
    weight: number;
    valueEur: number;
    valuationSource: string;
    assetClass: "equity" | "bond" | "commodity" | "cash_account";
  }>;
  bucketTopHoldings: {
    regions: Record<string, BucketTopHolding[]>;
    sectors: Record<string, BucketTopHolding[]>;
    countries: Record<string, BucketTopHolding[]>;
  };
};

/** One row in the benchmark portfolio weight editor (Edit portfolio modal). */
export type BenchmarkWeightFormRow = {
  instrumentId: number | "";
  weightStr: string;
};

/**
 * Exact equality of form rows (same length; same instrument id and weight text per index).
 * Used in Edit portfolio to compare current rows to the snapshot loaded from the API for
 * dirty state and confirm-before-close.
 */
export function weightRowsEqual(
  a: BenchmarkWeightFormRow[],
  b: BenchmarkWeightFormRow[],
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined || y === undefined) {
      return false;
    }
    if (x.instrumentId !== y.instrumentId || x.weightStr !== y.weightStr) {
      return false;
    }
  }
  return true;
}
