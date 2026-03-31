import type { BrokerType } from "@investments/lib";

export type InstrumentKind = "etf" | "stock" | "custom" | "cash_account";

export type YahooLookupResponse = {
  lookup: {
    symbol: string;
    shortName: string | null;
    longName: string | null;
    isin: string | null;
    sector: string | null;
    industry: string | null;
    country: string | null;
    quoteType: string | null;
  };
  displayName: string;
};

export type InstrumentRow = {
  id: number;
  kind: string;
  displayName: string;
};

export type InstrumentDetail = {
  id: number;
  kind: string;
  displayName: string;
  yahooSymbol: string | null;
  brokerId: number | null;
  cashGeoKey: string | null;
  cashCurrency: string | null;
  holdingsDistributionUrl: string | null;
  providerBreakdownDataUrl: string | null;
};

export type BrokerRow = {
  id: number;
  name: string;
  brokerType: BrokerType;
};

export type InstrumentFormPageProps =
  | { mode: "new" }
  | { mode: "edit"; instrumentId: number };
