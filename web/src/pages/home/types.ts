import type { DistributionPayload } from "@investments/db";

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

export type PortfolioEntity = {
  id: number;
  userId: number;
  name: string;
  emergencyFundEur: number;
  createdAt: string;
  updatedAt: string;
};

export type PortfolioDistributions = {
  countries: Record<string, number>;
  regions: Record<string, number>;
  sectors: Record<string, number>;
  totalValueEur: number;
  mixedCurrencyWarning: boolean;
  assetAllocation: {
    equitiesEur: number;
    bondsEur: number;
    cashExcessEur: number;
    emergencyFundSliceEur: number;
    emergencyFundTargetEur: number;
    cashTotalEur: number;
    cashBelowEmergencyTarget: boolean;
  };
  positions: Array<{
    instrumentId: number;
    displayName: string;
    quantity: number;
    unitPriceEur: number | null;
    weight: number;
    valueEur: number;
    valuationSource: string;
  }>;
};
