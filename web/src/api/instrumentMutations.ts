import type { CommoditySectorStorage } from "@investments/lib/commodity";
import { DEFAULT_CASH_CURRENCY } from "@investments/lib/currencies";
import { normalizeCashAccountIsoCountryCode } from "@investments/lib/geo/iso3166Alpha2CountryCodes";
import type { InstrumentDetail } from "../components/instrumentForm/types";

type CustomCompositeConstituent = {
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

type InstrumentPatchResult<T extends Record<string, unknown>> =
  | { ok: true; patch: T }
  | { ok: false; error: string };

export function computeCashAccountInstrumentPatch(args: {
  initial: Pick<
    InstrumentDetail,
    "displayName" | "brokerId" | "cashCurrency" | "cashGeoKey"
  >;
  cashDisplayName: string;
  cashBrokerId: number | "";
  cashCurrency: string;
  cashGeoKey: string;
}): InstrumentPatchResult<Record<string, string | number>> {
  const patch: Record<string, string | number> = {};
  const { initial } = args;
  if (args.cashDisplayName.trim() !== initial.displayName) {
    patch.displayName = args.cashDisplayName.trim();
  }
  if (
    args.cashBrokerId !== "" &&
    typeof args.cashBrokerId === "number" &&
    args.cashBrokerId !== initial.brokerId
  ) {
    patch.brokerId = args.cashBrokerId;
  }
  if (args.cashCurrency !== (initial.cashCurrency ?? DEFAULT_CASH_CURRENCY)) {
    patch.cashCurrency = args.cashCurrency;
  }
  const geoIso = normalizeCashAccountIsoCountryCode(args.cashGeoKey);
  if (geoIso == null) {
    return {
      ok: false,
      error: "Enter a valid ISO 3166-1 alpha-2 country code (e.g. FI, US).",
    };
  }
  if (geoIso !== (initial.cashGeoKey ?? "")) {
    patch.cashGeoKey = geoIso;
  }
  return { ok: true, patch };
}

export function computeCommodityInstrumentPatch(args: {
  initial: Pick<InstrumentDetail, "commoditySector" | "commodityCountryIso">;
  commoditySector: CommoditySectorStorage;
  commodityCountryIso: string;
}): InstrumentPatchResult<Record<string, string | null>> {
  const patch: Record<string, string | null> = {};
  if (args.commoditySector !== args.initial.commoditySector) {
    patch.commoditySector = args.commoditySector;
  }
  const nextCountry = args.commodityCountryIso.trim();
  const prevCountry = (args.initial.commodityCountryIso ?? "").trim();
  if (nextCountry !== prevCountry) {
    patch.commodityCountryIso = nextCountry.length === 0 ? null : nextCountry;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: true, patch };
  }
  if (
    patch.commodityCountryIso != null &&
    patch.commodityCountryIso.length > 0
  ) {
    const iso = normalizeCashAccountIsoCountryCode(patch.commodityCountryIso);
    if (iso == null) {
      return {
        ok: false,
        error: "Country must be a valid ISO code or blank.",
      };
    }
    patch.commodityCountryIso = iso;
  }
  return { ok: true, patch };
}
