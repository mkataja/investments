import {
  type CashCurrencyCode,
  DEFAULT_CASH_CURRENCY,
  isCompositePseudoKey,
  normalizeCashAccountIsoCountryCode,
  validateHoldingsDistributionUrl,
  validateProviderBreakdownDataUrl,
} from "@investments/lib";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiGet, apiPatch, apiPost } from "../api";
import { ButtonLink } from "../components/Button";
import { ErrorAlert } from "../components/ErrorAlert";
import { CashAccountFormFields } from "../components/instrumentForm/CashAccountFormFields";
import { EditInstrumentMode } from "../components/instrumentForm/EditInstrumentMode";
import { InstrumentKindPicker } from "../components/instrumentForm/InstrumentKindPicker";
import { NewCustomSeligsonSection } from "../components/instrumentForm/NewCustomSeligsonSection";
import { NewYahooEtfStockSection } from "../components/instrumentForm/NewYahooEtfStockSection";
import type { CompositePreviewRow } from "../components/instrumentForm/SeligsonCompositeModal";
import { INSTRUMENT_FORM_CANCEL_LINK_CLASS } from "../components/instrumentForm/cancelLinkClass";
import type {
  BrokerRow,
  InstrumentDetail,
  InstrumentFormPageProps,
  InstrumentKind,
  InstrumentRow,
  YahooLookupResponse,
} from "../components/instrumentForm/types";
import { mapYahooInstrumentFormError } from "../lib/yahooInstrumentFormError";

function InstrumentFormPage(props: InstrumentFormPageProps) {
  const navigate = useNavigate();
  const mode = props.mode;
  const editInstrumentId = props.mode === "edit" ? props.instrumentId : null;

  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<InstrumentKind | null>(null);

  const [brokers, setBrokers] = useState<BrokerRow[]>([]);
  const [brokersLoading, setBrokersLoading] = useState(true);

  const [loadingEdit, setLoadingEdit] = useState(mode === "edit");
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
    setLoadingEdit(true);
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
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingEdit(false));
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
      const [preview, instList] = await Promise.all([
        apiPost<{
          asOfDate: string | null;
          fundName: string | null;
          rows: CompositePreviewRow[];
          notes: string[];
        }>("/instruments/composite-preview", {
          source: "seligson_pharos_table",
          url: u,
        }),
        apiGet<
          Array<{
            id: number;
            kind: string;
            displayName: string;
            yahooSymbol: string | null;
            seligsonFund: { id: number; fid: number; name: string } | null;
          }>
        >("/instruments"),
      ]);
      setCompositePreview(preview);
      setCompositeFundDisplayName(preview.fundName?.trim() ?? "");
      setInstrumentOptionsForComposite(
        instList.filter((i) => i.kind !== "cash_account"),
      );
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
      await apiPost<InstrumentRow>("/instruments", {
        kind: "custom",
        brokerId: customBrokerId,
        displayName,
        constituents,
      });
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
        await apiPost<InstrumentRow>("/instruments", {
          kind,
          yahooSymbol: s,
          ...(urlRaw.length > 0 ? { holdingsDistributionUrl: urlRaw } : {}),
          ...(breakdownRaw.length > 0
            ? { providerBreakdownDataUrl: breakdownRaw }
            : {}),
        });
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
        await apiPost<InstrumentRow>("/instruments", {
          kind: "custom",
          brokerId: customBrokerId,
          seligsonFid: fid,
        });
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
        await apiPost<InstrumentRow>("/instruments", {
          kind: "cash_account",
          brokerId: cashBrokerId,
          displayName: name,
          currency: cashCurrency,
          cashGeoKey: geoIso,
        });
      } else {
        setError("Choose an instrument type.");
        return;
      }
      navigate("/instruments");
    } catch (err) {
      if (kind === "etf" || kind === "stock") {
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

    const patch: Record<string, string | number> = {};

    if (cashDisplayName.trim() !== initial.displayName) {
      patch.displayName = cashDisplayName.trim();
    }
    if (
      cashBrokerId !== "" &&
      typeof cashBrokerId === "number" &&
      cashBrokerId !== initial.brokerId
    ) {
      patch.brokerId = cashBrokerId;
    }
    if (cashCurrency !== (initial.cashCurrency ?? DEFAULT_CASH_CURRENCY)) {
      patch.cashCurrency = cashCurrency;
    }
    const geoIso = normalizeCashAccountIsoCountryCode(cashGeoKey);
    if (geoIso == null) {
      setError("Enter a valid ISO 3166-1 alpha-2 country code (e.g. FI, US).");
      return;
    }
    if (geoIso !== (initial.cashGeoKey ?? "")) {
      patch.cashGeoKey = geoIso;
    }

    if (Object.keys(patch).length === 0) {
      navigate("/instruments");
      return;
    }

    try {
      await apiPatch(`/instruments/${editInstrumentId}`, patch);
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
      await apiPatch(`/instruments/${editInstrumentId}`, {
        holdingsDistributionUrl: nextH,
        providerBreakdownDataUrl: nextB,
      });
      navigate("/instruments");
    } catch (err) {
      setError(String(err));
    }
  }

  const seligsonBrokers = brokers.filter((b) => b.brokerType === "seligson");
  const cashBrokers = brokers.filter((b) => b.brokerType === "cash_account");

  if (mode === "edit") {
    return (
      <EditInstrumentMode
        loadingEdit={loadingEdit}
        initial={initial}
        error={error}
        holdingsDistributionUrl={holdingsDistributionUrl}
        setHoldingsDistributionUrl={setHoldingsDistributionUrl}
        providerBreakdownDataUrl={providerBreakdownDataUrl}
        setProviderBreakdownDataUrl={setProviderBreakdownDataUrl}
        submitEditEtfStock={submitEditEtfStock}
        submitEditCash={submitEditCash}
        onClearUrlError={() => setError(null)}
        brokersLoading={brokersLoading}
        cashBrokers={cashBrokers}
        cashBrokerId={cashBrokerId}
        setCashBrokerId={setCashBrokerId}
        cashDisplayName={cashDisplayName}
        setCashDisplayName={setCashDisplayName}
        cashCurrency={cashCurrency}
        setCashCurrency={setCashCurrency}
        cashGeoKey={cashGeoKey}
        setCashGeoKey={setCashGeoKey}
      />
    );
  }

  return (
    <div className="w-full min-w-0 page-stack">
      <header className="page-header-stack">
        <Link
          to="/instruments"
          className="text-sm text-emerald-800 hover:underline"
        >
          ← Instruments
        </Link>
        <h1>New instrument</h1>
        {error ? <ErrorAlert>{error}</ErrorAlert> : null}
      </header>

      <form onSubmit={(e) => void submitNew(e)} className="page-stack">
        <InstrumentKindPicker
          kind={kind}
          onKindChange={(value) => {
            setKind(value);
            setError(null);
            setYahooPreviewError(null);
          }}
        />

        {kind === "etf" || kind === "stock" ? (
          <NewYahooEtfStockSection
            kind={kind}
            yahooSymbol={yahooSymbol}
            setYahooSymbol={(v) => {
              setYahooSymbol(v);
              setYahooPreviewError(null);
            }}
            yahooSymbolInputRef={yahooSymbolInputRef}
            onPreviewYahoo={previewYahoo}
            holdingsDistributionUrl={holdingsDistributionUrl}
            setHoldingsDistributionUrl={setHoldingsDistributionUrl}
            providerBreakdownDataUrl={providerBreakdownDataUrl}
            setProviderBreakdownDataUrl={setProviderBreakdownDataUrl}
            yahooPreview={yahooPreview}
            yahooPreviewError={yahooPreviewError}
          />
        ) : null}

        {kind === "custom" ? (
          <NewCustomSeligsonSection
            brokersLoading={brokersLoading}
            seligsonBrokers={seligsonBrokers}
            customBrokerId={customBrokerId}
            setCustomBrokerId={setCustomBrokerId}
            seligsonFid={seligsonFid}
            setSeligsonFid={setSeligsonFid}
            seligsonFidInputRef={seligsonFidInputRef}
            useCompositeAllocation={useCompositeAllocation}
            setUseCompositeAllocation={setUseCompositeAllocation}
            compositeTableUrl={compositeTableUrl}
            setCompositeTableUrl={setCompositeTableUrl}
            compositeTableUrlInputRef={compositeTableUrlInputRef}
            onLoadComposition={() => void loadCompositeComposition()}
            compositionLoading={compositionLoading}
            compositePreview={compositePreview}
            compositeFundDisplayName={compositeFundDisplayName}
            setCompositeFundDisplayName={setCompositeFundDisplayName}
            compositeSelectionByRow={compositeSelectionByRow}
            onCompositeSelectionChange={(rowIndex, value) => {
              setCompositeSelectionByRow((prev) => ({
                ...prev,
                [rowIndex]: value,
              }));
            }}
            instrumentOptionsForComposite={instrumentOptionsForComposite}
            onConfirmCompositeAllocation={() => void confirmCompositeCreate()}
            confirmCompositeDisabled={
              compositePreview == null ||
              compositePreview.rows.length === 0 ||
              compositeFundDisplayName.trim() === "" ||
              compositePreview.rows.some((_, i) => {
                const v = compositeSelectionByRow[i];
                return v == null || v === "";
              })
            }
            onClearCompositeAllocation={clearCompositeAllocationState}
          />
        ) : null}

        {kind === "cash_account" ? (
          <CashAccountFormFields
            brokersLoading={brokersLoading}
            cashBrokers={cashBrokers}
            cashBrokerId={cashBrokerId}
            setCashBrokerId={setCashBrokerId}
            cashDisplayName={cashDisplayName}
            setCashDisplayName={setCashDisplayName}
            cashDisplayNameInputRef={cashDisplayNameInputRef}
            cashCurrency={cashCurrency}
            setCashCurrency={setCashCurrency}
            cashGeoKey={cashGeoKey}
            setCashGeoKey={setCashGeoKey}
          />
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={
              !kind ||
              (brokersLoading &&
                (kind === "custom" || kind === "cash_account")) ||
              (kind === "custom" && useCompositeAllocation)
            }
            className="bg-emerald-700 disabled:bg-slate-300 text-white px-4 py-2 rounded"
          >
            Create instrument
          </button>
          <Link to="/instruments" className={INSTRUMENT_FORM_CANCEL_LINK_CLASS}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

export function NewInstrumentPage() {
  return <InstrumentFormPage mode="new" />;
}

export function EditInstrumentPage() {
  const { id: idParam } = useParams();
  const id = Number.parseInt(idParam ?? "", 10);

  if (!Number.isFinite(id) || id < 1) {
    return (
      <div className="w-full min-w-0 page-section">
        <ErrorAlert>Invalid instrument id.</ErrorAlert>
        <ButtonLink to="/instruments">Back to instruments</ButtonLink>
      </div>
    );
  }

  return <InstrumentFormPage mode="edit" instrumentId={id} />;
}
