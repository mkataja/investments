import {
  type CashCurrencyCode,
  type CommoditySectorStorage,
  DEFAULT_CASH_CURRENCY,
  isCompositePseudoKey,
  normalizeCashAccountIsoCountryCode,
  validateHoldingsDistributionUrl,
  validateProviderBreakdownDataUrl,
} from "@investments/lib";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  apiGet,
  apiPatch,
  apiPost,
  buildCreateCashAccountBody,
  buildCreateCommodityBody,
  buildCreateCustomCompositeBody,
  buildCreateCustomSeligsonBody,
  buildCreateEtfStockBody,
  buildPatchEtfStockUrlsBody,
  computeCashAccountInstrumentPatch,
  computeCommodityInstrumentPatch,
  fetchCompositePreviewAndNonCashInstruments,
} from "../../api";
import { mapYahooInstrumentFormError } from "../../lib/yahooInstrumentFormError";
import type { CompositePreviewRow } from "./SeligsonCompositeModal";
import type {
  BrokerRow,
  InstrumentDetail,
  InstrumentFormPageProps,
  InstrumentKind,
  InstrumentRow,
  YahooLookupResponse,
} from "./types";

export function useInstrumentFormPage(props: InstrumentFormPageProps) {
  const navigate = useNavigate();
  const mode = props.mode;
  const editInstrumentId = props.mode === "edit" ? props.instrumentId : null;

  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<InstrumentKind | null>(null);

  const [brokers, setBrokers] = useState<BrokerRow[]>([]);
  const [brokersLoading, setBrokersLoading] = useState(true);

  const [initial, setInitial] = useState<InstrumentDetail | null>(null);

  const yahooSymbolInputRef = useRef<HTMLInputElement>(null);
  const seligsonFidInputRef = useRef<HTMLInputElement>(null);
  const compositeTableUrlInputRef = useRef<HTMLInputElement>(null);
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

  const [seligsonFid, setSeligsonFid] = useState("");

  const [useCompositeAllocation, setUseCompositeAllocation] = useState(false);
  const [compositeTableUrl, setCompositeTableUrl] = useState("");
  const [compositeFundDisplayName, setCompositeFundDisplayName] = useState("");
  const [compositePreview, setCompositePreview] = useState<{
    asOfDate: string | null;
    fundName: string | null;
    rows: CompositePreviewRow[];
    notes: string[];
  } | null>(null);
  const [compositeSelectionByRow, setCompositeSelectionByRow] = useState<
    Record<number, string>
  >({});
  const [instrumentOptionsForComposite, setInstrumentOptionsForComposite] =
    useState<
      Array<{
        id: number;
        kind: string;
        displayName: string;
        yahooSymbol: string | null;
        seligsonFund: { id: number; fid: number; name: string } | null;
      }>
    >([]);
  const [compositionLoading, setCompositionLoading] = useState(false);

  const [cashDisplayName, setCashDisplayName] = useState("");
  const [cashCurrency, setCashCurrency] = useState<CashCurrencyCode>(
    DEFAULT_CASH_CURRENCY,
  );
  const [cashGeoKey, setCashGeoKey] = useState("");

  const [commoditySector, setCommoditySector] =
    useState<CommoditySectorStorage>("gold");
  const [commodityCountryIso, setCommodityCountryIso] = useState("");

  useEffect(() => {
    setBrokersLoading(true);
    void apiGet<BrokerRow[]>("/brokers")
      .then(setBrokers)
      .catch((e) => setError(String(e)))
      .finally(() => setBrokersLoading(false));
  }, []);

  useEffect(() => {
    if (mode !== "edit" || editInstrumentId == null) {
      return;
    }
    setError(null);
    void apiGet<InstrumentDetail>(`/instruments/${editInstrumentId}`)
      .then((row) => {
        setInitial(row);
        if (row.kind === "cash_account") {
          setCashDisplayName(row.displayName);
          setCashBrokerId(row.brokerId ?? "");
          setCashCurrency(
            (row.cashCurrency as CashCurrencyCode) ?? DEFAULT_CASH_CURRENCY,
          );
          setCashGeoKey(row.cashGeoKey ?? "");
        }
        if (row.kind === "etf" || row.kind === "stock") {
          setHoldingsDistributionUrl(row.holdingsDistributionUrl ?? "");
          setProviderBreakdownDataUrl(row.providerBreakdownDataUrl ?? "");
        }
        if (row.kind === "commodity") {
          const s = row.commoditySector;
          setCommoditySector(
            s === "silver" || s === "other" || s === "gold" ? s : "gold",
          );
          setCommodityCountryIso(row.commodityCountryIso ?? "");
        }
      })
      .catch((e) => setError(String(e)));
  }, [mode, editInstrumentId]);

  useEffect(() => {
    if (mode !== "new") {
      return;
    }
    if (kind === "etf" || kind === "stock") {
      yahooSymbolInputRef.current?.focus();
    } else if (kind === "custom") {
      if (useCompositeAllocation) {
        compositeTableUrlInputRef.current?.focus();
      } else {
        seligsonFidInputRef.current?.focus();
      }
    } else if (kind === "commodity") {
      yahooSymbolInputRef.current?.focus();
    } else if (kind === "cash_account") {
      cashDisplayNameInputRef.current?.focus();
    }
  }, [mode, kind, useCompositeAllocation]);

  useEffect(() => {
    if (mode !== "new") {
      return;
    }
    const seligsonBrokers = brokers.filter((b) => b.brokerType === "seligson");
    const first = seligsonBrokers[0];
    if (kind === "custom" && first != null && customBrokerId === "") {
      setCustomBrokerId(first.id);
    }
  }, [mode, kind, brokers, customBrokerId]);

  const prevCashBrokerIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (mode !== "new") {
      prevCashBrokerIdRef.current = null;
      return;
    }
    if (kind !== "cash_account") {
      prevCashBrokerIdRef.current = null;
      return;
    }
    if (cashBrokerId === "" || typeof cashBrokerId !== "number") {
      return;
    }
    const broker = brokers.find(
      (b) => b.id === cashBrokerId && b.brokerType === "cash_account",
    );
    if (!broker) {
      return;
    }
    const prevId = prevCashBrokerIdRef.current;
    if (prevId === cashBrokerId) {
      return;
    }
    const prevBroker =
      prevId != null ? brokers.find((b) => b.id === prevId) : null;
    const shouldSync =
      cashDisplayName === "" ||
      (prevBroker != null && cashDisplayName === prevBroker.name);
    if (shouldSync) {
      setCashDisplayName(broker.name);
    }
    prevCashBrokerIdRef.current = cashBrokerId;
  }, [mode, kind, cashBrokerId, brokers, cashDisplayName]);

  useEffect(() => {
    if (mode !== "new") {
      return;
    }
    const cashBrokers = brokers.filter((b) => b.brokerType === "cash_account");
    const first = cashBrokers[0];
    if (kind === "cash_account" && first != null && cashBrokerId === "") {
      setCashBrokerId(first.id);
    }
  }, [mode, kind, brokers, cashBrokerId]);

  const clearCompositeAllocationState = useCallback(() => {
    setCompositePreview(null);
    setCompositeSelectionByRow({});
    setCompositeFundDisplayName("");
  }, []);

  useEffect(() => {
    if (mode !== "new") {
      return;
    }
    if (!useCompositeAllocation) {
      clearCompositeAllocationState();
    }
  }, [mode, useCompositeAllocation, clearCompositeAllocationState]);

  async function previewYahoo() {
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
    } catch (e) {
      setYahooPreviewError(mapYahooInstrumentFormError(e));
    }
  }

  async function loadCompositeComposition() {
    setError(null);
    const u = compositeTableUrl.trim();
    if (!u) {
      setError("Enter the allocation table URL.");
      return;
    }
    setCompositionLoading(true);
    try {
      const { preview, instruments: instList } =
        await fetchCompositePreviewAndNonCashInstruments(u);
      setCompositePreview(preview);
      setCompositeFundDisplayName(preview.fundName?.trim() ?? "");
      setInstrumentOptionsForComposite(instList);
      const sel: Record<number, string> = {};
      preview.rows.forEach((r, i) => {
        if (r.suggestedPseudoKey) {
          sel[i] = `pseudo:${r.suggestedPseudoKey}`;
        } else if (r.suggestedInstrumentId != null) {
          sel[i] = String(r.suggestedInstrumentId);
        } else {
          sel[i] = "";
        }
      });
      setCompositeSelectionByRow(sel);
    } catch (e) {
      setError(mapYahooInstrumentFormError(e));
    } finally {
      setCompositionLoading(false);
    }
  }

  async function confirmCompositeCreate() {
    const rows = compositePreview?.rows;
    if (!rows || rows.length === 0) {
      return;
    }
    for (let i = 0; i < rows.length; i++) {
      const v = compositeSelectionByRow[i];
      if (v == null || v === "") {
        setError("Select a match for every row.");
        return;
      }
    }
    setError(null);
    const displayName = compositeFundDisplayName.trim();
    if (!displayName) {
      setError("Enter a fund name.");
      return;
    }
    if (customBrokerId === "" || typeof customBrokerId !== "number") {
      setError(
        "Select a Seligson-type broker (add one under Brokers if needed).",
      );
      return;
    }
    const constituents: Array<{
      rawLabel: string;
      weightOfFund: number;
      targetInstrumentId?: number;
      pseudoKey?: string;
    }> = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r) {
        continue;
      }
      const v = compositeSelectionByRow[i] ?? "";
      const w = r.pctOfFund;
      if (v.startsWith("pseudo:")) {
        const pseudo = v.slice(7);
        if (!isCompositePseudoKey(pseudo)) {
          setError("Invalid pseudo selection.");
          return;
        }
        constituents.push({
          rawLabel: r.rawLabel,
          weightOfFund: w,
          pseudoKey: pseudo,
        });
      } else {
        constituents.push({
          rawLabel: r.rawLabel,
          weightOfFund: w,
          targetInstrumentId: Number.parseInt(v, 10),
        });
      }
    }
    try {
      await apiPost<InstrumentRow>(
        "/instruments",
        buildCreateCustomCompositeBody({
          brokerId: customBrokerId,
          displayName,
          constituents,
        }),
      );
      navigate("/instruments");
    } catch (e) {
      setError(mapYahooInstrumentFormError(e));
    }
  }

  async function submitNew(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setYahooPreviewError(null);
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
        if (useCompositeAllocation) {
          setError(
            "Use Load composition to confirm constituents and create the instrument.",
          );
          return;
        }
        const fid = Number.parseInt(seligsonFid, 10);
        if (!Number.isFinite(fid) || fid <= 0) {
          setError("Enter a valid Seligson FID (positive integer).");
          return;
        }
        if (customBrokerId === "" || typeof customBrokerId !== "number") {
          setError(
            "Select a Seligson-type broker (add one under Brokers if needed).",
          );
          return;
        }
        await apiPost<InstrumentRow>(
          "/instruments",
          buildCreateCustomSeligsonBody({
            brokerId: customBrokerId,
            seligsonFid: fid,
          }),
        );
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
      navigate("/instruments");
    } catch (err) {
      if (kind === "etf" || kind === "stock" || kind === "commodity") {
        setYahooPreviewError(mapYahooInstrumentFormError(err));
      } else {
        setError(mapYahooInstrumentFormError(err));
      }
    }
  }

  async function submitEditCash(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (
      !initial ||
      initial.kind !== "cash_account" ||
      editInstrumentId == null
    ) {
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
      navigate("/instruments");
      return;
    }

    try {
      await apiPatch(`/instruments/${editInstrumentId}`, built.patch);
      navigate("/instruments");
    } catch (err) {
      setError(String(err));
    }
  }

  async function submitEditEtfStock(e: React.FormEvent) {
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
      navigate("/instruments");
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
      navigate("/instruments");
    } catch (err) {
      setError(String(err));
    }
  }

  async function submitEditCommodity(e: React.FormEvent) {
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
      navigate("/instruments");
      return;
    }
    try {
      await apiPatch(`/instruments/${editInstrumentId}`, built.patch);
      navigate("/instruments");
    } catch (err) {
      setError(String(err));
    }
  }

  const seligsonBrokers = brokers.filter((b) => b.brokerType === "seligson");
  const cashBrokers = brokers.filter((b) => b.brokerType === "cash_account");

  return {
    mode,
    editInstrumentId,
    error,
    setError,
    kind,
    setKind,
    brokersLoading,
    initial,
    yahooSymbolInputRef,
    seligsonFidInputRef,
    compositeTableUrlInputRef,
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
    seligsonFid,
    setSeligsonFid,
    useCompositeAllocation,
    setUseCompositeAllocation,
    compositeTableUrl,
    setCompositeTableUrl,
    compositeFundDisplayName,
    setCompositeFundDisplayName,
    compositePreview,
    compositeSelectionByRow,
    setCompositeSelectionByRow,
    instrumentOptionsForComposite,
    compositionLoading,
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
    loadCompositeComposition,
    confirmCompositeCreate,
    submitNew,
    submitEditCash,
    submitEditEtfStock,
    submitEditCommodity,
    clearCompositeAllocationState,
    seligsonBrokers,
    cashBrokers,
  };
}
