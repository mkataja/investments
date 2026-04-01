import type { BrokerType, CompositePseudoKey } from "@investments/lib";

export type InstrumentKind =
  | "etf"
  | "stock"
  | "commodity"
  | "custom"
  | "cash_account";

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
  commoditySector: string | null;
  commodityCountryIso: string | null;
};

export type BrokerRow = {
  id: number;
  name: string;
  brokerType: BrokerType;
};

export type InstrumentFormPageProps =
  | { mode: "new" }
  | { mode: "edit"; instrumentId: number };

/** One row from Seligson composite table preview (map to instruments or pseudo-keys). */
export type CompositePreviewRow = {
  rawLabel: string;
  pctOfFund: number;
  suggestedInstrumentId: number | null;
  suggestedPseudoKey: CompositePseudoKey | null;
};
