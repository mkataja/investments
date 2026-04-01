import type { CommoditySectorStorage } from "@investments/lib";

export type CustomCompositeConstituent = {
  rawLabel: string;
  weightOfFund: number;
  targetInstrumentId?: number;
  pseudoKey?: string;
};

export function buildCreateEtfStockBody(args: {
  kind: "etf" | "stock";
  yahooSymbol: string;
  holdingsDistributionUrl: string;
  providerBreakdownDataUrl: string;
}): Record<string, unknown> {
  return {
    kind: args.kind,
    yahooSymbol: args.yahooSymbol,
    ...(args.holdingsDistributionUrl.length > 0
      ? { holdingsDistributionUrl: args.holdingsDistributionUrl }
      : {}),
    ...(args.providerBreakdownDataUrl.length > 0
      ? { providerBreakdownDataUrl: args.providerBreakdownDataUrl }
      : {}),
  };
}

export function buildCreateCommodityBody(args: {
  yahooSymbol: string;
  commoditySector: CommoditySectorStorage;
  commodityCountryIso?: string;
}): Record<string, unknown> {
  return {
    kind: "commodity",
    yahooSymbol: args.yahooSymbol,
    commoditySector: args.commoditySector,
    ...(args.commodityCountryIso != null
      ? { commodityCountryIso: args.commodityCountryIso }
      : {}),
  };
}

export function buildCreateCustomSeligsonBody(args: {
  brokerId: number;
  seligsonFid: number;
}): Record<string, unknown> {
  return {
    kind: "custom",
    brokerId: args.brokerId,
    seligsonFid: args.seligsonFid,
  };
}

export function buildCreateCashAccountBody(args: {
  brokerId: number;
  displayName: string;
  currency: string;
  cashGeoKey: string;
}): Record<string, unknown> {
  return {
    kind: "cash_account",
    brokerId: args.brokerId,
    displayName: args.displayName,
    currency: args.currency,
    cashGeoKey: args.cashGeoKey,
  };
}

export function buildCreateCustomCompositeBody(args: {
  brokerId: number;
  displayName: string;
  constituents: CustomCompositeConstituent[];
}): Record<string, unknown> {
  return {
    kind: "custom",
    brokerId: args.brokerId,
    displayName: args.displayName,
    constituents: args.constituents,
  };
}

export function buildPatchEtfStockUrlsBody(args: {
  holdingsDistributionUrl: string | null;
  providerBreakdownDataUrl: string | null;
}): Record<string, unknown> {
  return {
    holdingsDistributionUrl: args.holdingsDistributionUrl,
    providerBreakdownDataUrl: args.providerBreakdownDataUrl,
  };
}
