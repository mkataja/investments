import type { CommoditySectorStorage } from "@investments/lib/commodity";
import {
  type CashCurrencyCode,
  DEFAULT_CASH_CURRENCY,
} from "@investments/lib/currencies";
import { type FormEvent, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SeligsonFundPageCompositePreviewResponse } from "../../api/seligsonFundPageCompositePreview";
import type { InstrumentListItem } from "../../pages/instruments/types";
import {
  areCompositeMappingsComplete,
  normalizeWwwSeligsonFundPageUrl,
} from "./instrumentFormPageSeligson";
import {
  previewYahooInstrument,
  submitEditCash as runSubmitEditCash,
  submitEditCommodity as runSubmitEditCommodity,
  submitEditEtfStock as runSubmitEditEtfStock,
  submitNewInstrument,
} from "./instrumentFormPageSubmit";
import type {
  BrokerRow,
  InstrumentDetail,
  InstrumentFormPageProps,
  InstrumentKind,
  SeligsonCompositeMappedRow,
  YahooLookupResponse,
} from "./types";
import {
  useCashDisplayNameSyncFromBrokerEffect,
  useCompositeInstrumentOptionsEffect,
  useDefaultCashBrokerEffect,
  useDefaultSeligsonBrokerEffect,
  useEditInstrumentLoadEffect,
  useKindFocusEffect,
  useLoadBrokersEffect,
  useSeligsonCompositePreviewEffect,
} from "./useInstrumentFormPageEffects";

export function useInstrumentFormPage(props: InstrumentFormPageProps) {
  const navigate = useNavigate();
  const mode = props.mode;
  const editInstrumentId = props.mode === "edit" ? props.instrumentId : null;

  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<InstrumentKind | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const [brokers, setBrokers] = useState<BrokerRow[]>([]);
  const [brokersLoading, setBrokersLoading] = useState(true);

  const [initial, setInitial] = useState<InstrumentDetail | null>(null);

  const yahooSymbolInputRef = useRef<HTMLInputElement>(null);
  const seligsonFundPageUrlInputRef = useRef<HTMLInputElement>(null);
  const cashDisplayNameInputRef = useRef<HTMLInputElement>(null);

  const [customBrokerId, setCustomBrokerId] = useState<number | "">("");
  const [cashBrokerId, setCashBrokerId] = useState<number | "">("");

  const [yahooSymbol, setYahooSymbol] = useState("");
  const [holdingsDistributionUrl, setHoldingsDistributionUrl] = useState("");
  const [providerBreakdownDataUrl, setProviderBreakdownDataUrl] = useState("");
  const [yahooPreview, setYahooPreview] = useState<YahooLookupResponse | null>(
    null,
  );
  const [yahooPreviewError, setYahooPreviewError] = useState<string | null>(
    null,
  );

  const [seligsonFundPageUrl, setSeligsonFundPageUrl] = useState("");
  const [seligsonCompositePreview, setSeligsonCompositePreview] =
    useState<SeligsonFundPageCompositePreviewResponse | null>(null);
  const [seligsonCompositePreviewLoading, setSeligsonCompositePreviewLoading] =
    useState(false);
  const [seligsonCompositePreviewError, setSeligsonCompositePreviewError] =
    useState<string | null>(null);
  const [seligsonCompositeMappedRows, setSeligsonCompositeMappedRows] =
    useState<SeligsonCompositeMappedRow[]>([]);
  const [
    seligsonCompositeInstrumentOptions,
    setSeligsonCompositeInstrumentOptions,
  ] = useState<InstrumentListItem[]>([]);
  const [
    seligsonCompositeInstrumentOptionsLoading,
    setSeligsonCompositeInstrumentOptionsLoading,
  ] = useState(false);
  const [
    seligsonCompositeInstrumentOptionsError,
    setSeligsonCompositeInstrumentOptionsError,
  ] = useState<string | null>(null);

  const seligsonFundPageUrlRef = useRef(seligsonFundPageUrl);
  seligsonFundPageUrlRef.current = seligsonFundPageUrl;

  const [cashDisplayName, setCashDisplayName] = useState("");
  const [cashCurrency, setCashCurrency] = useState<CashCurrencyCode>(
    DEFAULT_CASH_CURRENCY,
  );
  const [cashGeoKey, setCashGeoKey] = useState("");

  const [commoditySector, setCommoditySector] =
    useState<CommoditySectorStorage>("gold");
  const [commodityCountryIso, setCommodityCountryIso] = useState("");

  useLoadBrokersEffect(setBrokers, setBrokersLoading, setError);
  useCompositeInstrumentOptionsEffect(
    mode,
    kind,
    setSeligsonCompositeInstrumentOptions,
    setSeligsonCompositeInstrumentOptionsLoading,
    setSeligsonCompositeInstrumentOptionsError,
  );
  useEditInstrumentLoadEffect(
    mode,
    editInstrumentId,
    setError,
    setInitial,
    setCashDisplayName,
    setCashBrokerId,
    setCashCurrency,
    setCashGeoKey,
    setHoldingsDistributionUrl,
    setProviderBreakdownDataUrl,
    setCommoditySector,
    setCommodityCountryIso,
  );
  useKindFocusEffect(
    mode,
    kind,
    yahooSymbolInputRef,
    seligsonFundPageUrlInputRef,
    cashDisplayNameInputRef,
  );
  useDefaultSeligsonBrokerEffect(
    mode,
    kind,
    brokers,
    customBrokerId,
    setCustomBrokerId,
  );
  useSeligsonCompositePreviewEffect(
    mode,
    kind,
    seligsonFundPageUrl,
    seligsonFundPageUrlRef,
    setSeligsonCompositePreview,
    setSeligsonCompositePreviewError,
    setSeligsonCompositeMappedRows,
    setSeligsonCompositePreviewLoading,
  );
  useCashDisplayNameSyncFromBrokerEffect(
    mode,
    kind,
    cashBrokerId,
    brokers,
    cashDisplayName,
    setCashDisplayName,
  );
  useDefaultCashBrokerEffect(
    mode,
    kind,
    brokers,
    cashBrokerId,
    setCashBrokerId,
  );

  async function previewYahoo() {
    await previewYahooInstrument({
      yahooSymbol,
      setError,
      setYahooPreviewError,
      setYahooPreview,
    });
  }

  async function submitNew(e: FormEvent) {
    await submitNewInstrument({
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
    });
  }

  async function submitEditCash(e: FormEvent) {
    await runSubmitEditCash({
      e,
      navigate,
      setError,
      initial,
      editInstrumentId,
      cashDisplayName,
      cashBrokerId,
      cashCurrency,
      cashGeoKey,
    });
  }

  async function submitEditEtfStock(e: FormEvent) {
    await runSubmitEditEtfStock({
      e,
      navigate,
      setError,
      initial,
      editInstrumentId,
      holdingsDistributionUrl,
      providerBreakdownDataUrl,
    });
  }

  async function submitEditCommodity(e: FormEvent) {
    await runSubmitEditCommodity({
      e,
      navigate,
      setError,
      initial,
      editInstrumentId,
      commoditySector,
      commodityCountryIso,
    });
  }

  const seligsonBrokers = brokers.filter((b) => b.brokerType === "seligson");
  const cashBrokers = brokers.filter((b) => b.brokerType === "cash_account");

  const canSubmitCustomSeligson = useMemo(() => {
    if (brokersLoading) {
      return false;
    }
    if (customBrokerId === "" || typeof customBrokerId !== "number") {
      return false;
    }
    const raw = seligsonFundPageUrl.trim();
    if (!raw) {
      return false;
    }
    if (normalizeWwwSeligsonFundPageUrl(raw) == null) {
      return false;
    }
    if (seligsonCompositePreviewLoading) {
      return false;
    }
    if (seligsonCompositePreview === null) {
      return false;
    }
    if (seligsonCompositePreview.composite === true) {
      if (seligsonCompositeInstrumentOptionsLoading) {
        return false;
      }
      return areCompositeMappingsComplete(
        seligsonCompositePreview,
        seligsonCompositeMappedRows,
      );
    }
    return true;
  }, [
    brokersLoading,
    customBrokerId,
    seligsonFundPageUrl,
    seligsonCompositePreviewLoading,
    seligsonCompositePreview,
    seligsonCompositeMappedRows,
    seligsonCompositeInstrumentOptionsLoading,
  ]);

  return {
    mode,
    editInstrumentId,
    error,
    setError,
    kind,
    setKind,
    createSubmitting,
    brokersLoading,
    initial,
    yahooSymbolInputRef,
    seligsonFundPageUrlInputRef,
    cashDisplayNameInputRef,
    customBrokerId,
    setCustomBrokerId,
    cashBrokerId,
    setCashBrokerId,
    yahooSymbol,
    setYahooSymbol,
    holdingsDistributionUrl,
    setHoldingsDistributionUrl,
    providerBreakdownDataUrl,
    setProviderBreakdownDataUrl,
    yahooPreview,
    yahooPreviewError,
    setYahooPreviewError,
    seligsonFundPageUrl,
    setSeligsonFundPageUrl,
    seligsonCompositePreview,
    seligsonCompositePreviewLoading,
    seligsonCompositePreviewError,
    seligsonCompositeMappedRows,
    setSeligsonCompositeMappedRows,
    seligsonCompositeInstrumentOptions,
    seligsonCompositeInstrumentOptionsLoading,
    seligsonCompositeInstrumentOptionsError,
    canSubmitCustomSeligson,
    cashDisplayName,
    setCashDisplayName,
    cashCurrency,
    setCashCurrency,
    cashGeoKey,
    setCashGeoKey,
    commoditySector,
    setCommoditySector,
    commodityCountryIso,
    setCommodityCountryIso,
    previewYahoo,
    submitNew,
    submitEditCash,
    submitEditEtfStock,
    submitEditCommodity,
    seligsonBrokers,
    cashBrokers,
  };
}
