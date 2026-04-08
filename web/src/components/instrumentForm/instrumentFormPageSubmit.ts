import type { CommoditySectorStorage } from "@investments/lib/commodity";
import type { CashCurrencyCode } from "@investments/lib/currencies";
import { normalizeCashAccountIsoCountryCode } from "@investments/lib/geo/iso3166Alpha2CountryCodes";
import {
  validateHoldingsDistributionUrl,
  validateProviderBreakdownDataUrl,
} from "@investments/lib/holdingsUrl";
import type { FormEvent } from "react";
import type { NavigateFunction } from "react-router-dom";
import { apiGet, apiPatch, apiPost } from "../../api/client";
import {
  buildCreateCashAccountBody,
  buildCreateCommodityBody,
  buildCreateCustomCompositeBody,
  buildCreateCustomSeligsonBody,
  buildCreateEtfStockBody,
  buildPatchEtfStockUrlsBody,
  computeCashAccountInstrumentPatch,
  computeCommodityInstrumentPatch,
} from "../../api/instrumentMutations";
import {
  type SeligsonFundPageCompositePreviewResponse,
  postSeligsonFundPageCompositePreview,
} from "../../api/seligsonFundPageCompositePreview";
import { mapYahooInstrumentFormError } from "../../lib/yahooInstrumentFormError";
import { routes } from "../../routes";
import type {
  InstrumentDetail,
  InstrumentKind,
  InstrumentRow,
  SeligsonCompositeMappedRow,
  YahooLookupResponse,
} from "./types";

export async function previewYahooInstrument(params: {
  yahooSymbol: string;
  setError: (e: string | null) => void;
  setYahooPreviewError: (e: string | null) => void;
  setYahooPreview: (v: YahooLookupResponse | null) => void;
}) {
  const { yahooSymbol, setError, setYahooPreviewError, setYahooPreview } =
    params;
  setError(null);
  setYahooPreviewError(null);
  setYahooPreview(null);
  const s = yahooSymbol.trim();
  if (!s) {
    setYahooPreviewError("Enter a Yahoo symbol.");
    return;
  }
  try {
    const data = await apiGet<YahooLookupResponse>(
      `/instruments/lookup-yahoo?symbol=${encodeURIComponent(s)}`,
    );
    setYahooPreview(data);
  } catch (err) {
    setYahooPreviewError(mapYahooInstrumentFormError(err));
  }
}

export async function submitNewInstrument(params: {
  navigate: NavigateFunction;
  kind: InstrumentKind | null;
  setError: (e: string | null) => void;
  setYahooPreviewError: (e: string | null) => void;
  setCreateSubmitting: (v: boolean) => void;
  yahooSymbol: string;
  holdingsDistributionUrl: string;
  providerBreakdownDataUrl: string;
  commoditySector: CommoditySectorStorage;
  commodityCountryIso: string;
  seligsonFundPageUrl: string;
  customBrokerId: number | "";
  seligsonCompositeMappedRows: SeligsonCompositeMappedRow[];
  cashDisplayName: string;
  cashGeoKey: string;
  cashBrokerId: number | "";
  cashCurrency: CashCurrencyCode;
  e: FormEvent;
}) {
  const {
    navigate,
    kind,
    setError,
    setYahooPreviewError,
    setCreateSubmitting,
    yahooSymbol,
    holdingsDistributionUrl,
    providerBreakdownDataUrl,
    commoditySector,
    commodityCountryIso,
    seligsonFundPageUrl,
    customBrokerId,
    seligsonCompositeMappedRows,
    cashDisplayName,
    cashGeoKey,
    cashBrokerId,
    cashCurrency,
    e,
  } = params;
  e.preventDefault();
  setError(null);
  setYahooPreviewError(null);
  setCreateSubmitting(true);
  try {
    if (kind === "etf" || kind === "stock") {
      const s = yahooSymbol.trim();
      if (!s) {
        setYahooPreviewError("Enter a Yahoo symbol.");
        return;
      }
      const urlRaw = holdingsDistributionUrl.trim();
      const breakdownRaw = providerBreakdownDataUrl.trim();
      const holdingsV = validateHoldingsDistributionUrl(
        urlRaw.length > 0 ? urlRaw : null,
      );
      const breakdownV = validateProviderBreakdownDataUrl(
        breakdownRaw.length > 0 ? breakdownRaw : null,
      );
      if (!holdingsV.ok) {
        setError(holdingsV.message);
        return;
      }
      if (!breakdownV.ok) {
        setError(breakdownV.message);
        return;
      }
      if (
        breakdownV.normalized &&
        (!holdingsV.normalized || holdingsV.provider !== "jpm_xlsx")
      ) {
        setError(
          "Provider breakdown data URL is only supported with a J.P. Morgan daily ETF holdings XLSX URL in Provider holdings URL.",
        );
        return;
      }
      await apiPost<InstrumentRow>(
        "/instruments",
        buildCreateEtfStockBody({
          kind,
          yahooSymbol: s,
          holdingsDistributionUrl: urlRaw,
          providerBreakdownDataUrl: breakdownRaw,
        }),
      );
    } else if (kind === "commodity") {
      const s = yahooSymbol.trim();
      if (!s) {
        setYahooPreviewError("Enter a Yahoo symbol.");
        return;
      }
      const countryRaw = commodityCountryIso.trim();
      const countryIso =
        countryRaw.length === 0
          ? undefined
          : normalizeCashAccountIsoCountryCode(countryRaw);
      if (countryIso == null && countryRaw.length > 0) {
        setError("Country must be a valid ISO code or blank.");
        return;
      }
      await apiPost<InstrumentRow>(
        "/instruments",
        buildCreateCommodityBody({
          yahooSymbol: s,
          commoditySector,
          ...(countryIso != null ? { commodityCountryIso: countryIso } : {}),
        }),
      );
    } else if (kind === "custom") {
      const urlRaw = seligsonFundPageUrl.trim();
      if (!urlRaw) {
        setError("Enter the Seligson fund page URL.");
        return;
      }
      let fundPageUrl: string;
      try {
        const u = new URL(urlRaw);
        if (u.hostname !== "www.seligson.fi") {
          setError("URL must be on www.seligson.fi.");
          return;
        }
        fundPageUrl = u.href;
      } catch {
        setError("Enter a valid URL.");
        return;
      }
      if (customBrokerId === "" || typeof customBrokerId !== "number") {
        setError(
          "Select a Seligson-type broker (add one under Brokers if needed).",
        );
        return;
      }
      let livePreview: SeligsonFundPageCompositePreviewResponse;
      try {
        livePreview = await postSeligsonFundPageCompositePreview(fundPageUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
      if (livePreview.composite === true) {
        const prev = livePreview;
        let mappingRows = seligsonCompositeMappedRows;
        if (mappingRows.length !== prev.rows.length) {
          mappingRows = prev.rows.map((r) => ({
            targetInstrumentId:
              r.suggestedInstrumentId != null
                ? String(r.suggestedInstrumentId)
                : "",
            pseudoKey: r.suggestedPseudoKey ?? "",
          }));
        }
        for (let i = 0; i < prev.rows.length; i++) {
          const m = mappingRows[i];
          if (m == null) {
            setError("Complete allocation mapping for each sleeve.");
            return;
          }
          const tid = m.targetInstrumentId.trim();
          const pk = m.pseudoKey.trim();
          const idNum = Number.parseInt(tid, 10);
          const hasInst = tid !== "" && Number.isFinite(idNum) && idNum > 0;
          const hasPk = pk !== "";
          if (hasInst === hasPk) {
            setError(
              "Each sleeve must map to exactly one instrument id or one generic allocation line.",
            );
            return;
          }
        }
        await apiPost<InstrumentRow>(
          "/instruments",
          buildCreateCustomCompositeBody({
            brokerId: customBrokerId,
            seligsonFundPageUrl: fundPageUrl,
            constituents: prev.rows.map((r, i) => {
              const m = mappingRows[i];
              if (m == null) {
                throw new Error("Missing composite mapping row");
              }
              const pk = m.pseudoKey.trim();
              if (pk !== "") {
                return {
                  rawLabel: r.rawLabel,
                  weightOfFund: r.pctOfFund,
                  pseudoKey: pk,
                };
              }
              const tid = m.targetInstrumentId.trim();
              return {
                rawLabel: r.rawLabel,
                weightOfFund: r.pctOfFund,
                targetInstrumentId: Number.parseInt(tid, 10),
              };
            }),
          }),
        );
      } else {
        await apiPost<InstrumentRow>(
          "/instruments",
          buildCreateCustomSeligsonBody({
            brokerId: customBrokerId,
            seligsonFundPageUrl: fundPageUrl,
          }),
        );
      }
    } else if (kind === "cash_account") {
      const name = cashDisplayName.trim();
      if (!name) {
        setError("Enter a display name.");
        return;
      }
      const geoIso = normalizeCashAccountIsoCountryCode(cashGeoKey);
      if (geoIso == null) {
        setError(
          "Enter a valid ISO 3166-1 alpha-2 country code (e.g. FI, US).",
        );
        return;
      }
      if (cashBrokerId === "" || typeof cashBrokerId !== "number") {
        setError(
          "Select a cash-account-type broker (add one under Brokers if needed).",
        );
        return;
      }
      await apiPost<InstrumentRow>(
        "/instruments",
        buildCreateCashAccountBody({
          brokerId: cashBrokerId,
          displayName: name,
          currency: cashCurrency,
          cashGeoKey: geoIso,
        }),
      );
    } else {
      setError("Choose an instrument type.");
      return;
    }
    navigate(routes.instruments.list, { replace: true });
  } catch (err) {
    if (kind === "etf" || kind === "stock" || kind === "commodity") {
      setYahooPreviewError(mapYahooInstrumentFormError(err));
    } else {
      setError(mapYahooInstrumentFormError(err));
    }
  } finally {
    setCreateSubmitting(false);
  }
}

export async function submitEditCash(params: {
  e: FormEvent;
  navigate: NavigateFunction;
  setError: (e: string | null) => void;
  initial: InstrumentDetail | null;
  editInstrumentId: number | null;
  cashDisplayName: string;
  cashBrokerId: number | "";
  cashCurrency: CashCurrencyCode;
  cashGeoKey: string;
}) {
  const {
    e,
    navigate,
    setError,
    initial,
    editInstrumentId,
    cashDisplayName,
    cashBrokerId,
    cashCurrency,
    cashGeoKey,
  } = params;
  e.preventDefault();
  setError(null);
  if (!initial || initial.kind !== "cash_account" || editInstrumentId == null) {
    return;
  }

  const built = computeCashAccountInstrumentPatch({
    initial: {
      displayName: initial.displayName,
      brokerId: initial.brokerId,
      cashCurrency: initial.cashCurrency,
      cashGeoKey: initial.cashGeoKey,
    },
    cashDisplayName,
    cashBrokerId,
    cashCurrency,
    cashGeoKey,
  });
  if (!built.ok) {
    setError(built.error);
    return;
  }
  if (Object.keys(built.patch).length === 0) {
    navigate(routes.instruments.list);
    return;
  }

  try {
    await apiPatch(`/instruments/${editInstrumentId}`, built.patch);
    navigate(routes.instruments.list);
  } catch (err) {
    setError(String(err));
  }
}

export async function submitEditEtfStock(params: {
  e: FormEvent;
  navigate: NavigateFunction;
  setError: (e: string | null) => void;
  initial: InstrumentDetail | null;
  editInstrumentId: number | null;
  holdingsDistributionUrl: string;
  providerBreakdownDataUrl: string;
}) {
  const {
    e,
    navigate,
    setError,
    initial,
    editInstrumentId,
    holdingsDistributionUrl,
    providerBreakdownDataUrl,
  } = params;
  e.preventDefault();
  setError(null);
  if (
    !initial ||
    (initial.kind !== "etf" && initial.kind !== "stock") ||
    editInstrumentId == null
  ) {
    return;
  }
  const holdingsV = validateHoldingsDistributionUrl(
    holdingsDistributionUrl.trim() || null,
  );
  const breakdownV = validateProviderBreakdownDataUrl(
    providerBreakdownDataUrl.trim() || null,
  );
  if (!holdingsV.ok) {
    setError(holdingsV.message);
    return;
  }
  if (!breakdownV.ok) {
    setError(breakdownV.message);
    return;
  }
  if (
    breakdownV.normalized &&
    (!holdingsV.normalized || holdingsV.provider !== "jpm_xlsx")
  ) {
    setError(
      "Provider breakdown data URL is only supported with a J.P. Morgan daily ETF holdings XLSX URL in Provider holdings URL.",
    );
    return;
  }
  const prevH = initial.holdingsDistributionUrl ?? null;
  const nextH = holdingsV.normalized;
  const prevB = initial.providerBreakdownDataUrl ?? null;
  const nextB = breakdownV.normalized;
  if (prevH === nextH && prevB === nextB) {
    navigate(routes.instruments.list);
    return;
  }
  try {
    await apiPatch(
      `/instruments/${editInstrumentId}`,
      buildPatchEtfStockUrlsBody({
        holdingsDistributionUrl: nextH,
        providerBreakdownDataUrl: nextB,
      }),
    );
    navigate(routes.instruments.list);
  } catch (err) {
    setError(String(err));
  }
}

export async function submitEditCommodity(params: {
  e: FormEvent;
  navigate: NavigateFunction;
  setError: (e: string | null) => void;
  initial: InstrumentDetail | null;
  editInstrumentId: number | null;
  commoditySector: CommoditySectorStorage;
  commodityCountryIso: string;
}) {
  const {
    e,
    navigate,
    setError,
    initial,
    editInstrumentId,
    commoditySector,
    commodityCountryIso,
  } = params;
  e.preventDefault();
  setError(null);
  if (!initial || initial.kind !== "commodity" || editInstrumentId == null) {
    return;
  }
  const built = computeCommodityInstrumentPatch({
    initial: {
      commoditySector: initial.commoditySector,
      commodityCountryIso: initial.commodityCountryIso,
    },
    commoditySector,
    commodityCountryIso,
  });
  if (!built.ok) {
    setError(built.error);
    return;
  }
  if (Object.keys(built.patch).length === 0) {
    navigate(routes.instruments.list);
    return;
  }
  try {
    await apiPatch(`/instruments/${editInstrumentId}`, built.patch);
    navigate(routes.instruments.list);
  } catch (err) {
    setError(String(err));
  }
}
