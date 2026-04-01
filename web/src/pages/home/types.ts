import type { DistributionPayload } from "@investments/lib";

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
  unitPriceEur?: string | null;
};

export type PortfolioKind = "live" | "benchmark";

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
  mixedCurrencyWarning: boolean;
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
