import {
  type BrokerType,
  type CashCurrencyCode,
  DEFAULT_CASH_CURRENCY,
  SUPPORTED_CASH_CURRENCY_CODES,
  normalizeCashAccountIsoCountryCode,
  validateHoldingsDistributionUrl,
  validateProviderBreakdownDataUrl,
} from "@investments/db";
import { type RefObject, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiGet, apiPatch, apiPost } from "../api";
import { ButtonLink } from "../components/Button";
import { ErrorAlert } from "../components/ErrorAlert";
import { ProviderHoldingsUrlHint } from "../components/ProviderHoldingsUrlHint";
import { EditInstrumentPageSkeleton } from "../components/listPageSkeletons";
import { FormFieldsCardSkeleton } from "../components/skeletonPrimitives";

type Kind = "etf" | "stock" | "custom" | "cash_account";

type YahooLookupResponse = {
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

type InstrumentRow = {
  id: number;
  kind: string;
  displayName: string;
};

type InstrumentDetail = {
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

type BrokerRow = {
  id: number;
  name: string;
  brokerType: BrokerType;
};

type InstrumentFormPageProps =
  | { mode: "new" }
  | { mode: "edit"; instrumentId: number };

function HoldingsBreakdownUrlFields({
  holdingsDistributionUrl,
  setHoldingsDistributionUrl,
  providerBreakdownDataUrl,
  setProviderBreakdownDataUrl,
  onClearError,
}: {
  holdingsDistributionUrl: string;
  setHoldingsDistributionUrl: (v: string) => void;
  providerBreakdownDataUrl: string;
  setProviderBreakdownDataUrl: (v: string) => void;
  onClearError?: () => void;
}) {
  return (
    <>
      <label className="block text-sm">
        Provider holdings URL (optional)
        <input
          className="mt-1 block w-full border rounded px-2 py-1 font-mono text-sm"
          value={holdingsDistributionUrl}
          onChange={(e) => {
            setHoldingsDistributionUrl(e.target.value);
            onClearError?.();
          }}
        />
      </label>
      <ProviderHoldingsUrlHint />
      <label className="block text-sm">
        Provider breakdown data URL (optional)
        <input
          className="mt-1 block w-full border rounded px-2 py-1 font-mono text-sm"
          value={providerBreakdownDataUrl}
          onChange={(e) => {
            setProviderBreakdownDataUrl(e.target.value);
            onClearError?.();
          }}
          placeholder="https://am.jpmorgan.com/FundsMarketingHandler/product-data?cusip=…"
        />
      </label>
    </>
  );
}

function CashAccountFormFields({
  brokersLoading,
  cashBrokers,
  cashBrokerId,
  setCashBrokerId,
  cashDisplayName,
  setCashDisplayName,
  cashDisplayNameInputRef,
  cashCurrency,
  setCashCurrency,
  cashGeoKey,
  setCashGeoKey,
  showDistributionHint,
}: {
  brokersLoading: boolean;
  cashBrokers: BrokerRow[];
  cashBrokerId: number | "";
  setCashBrokerId: (v: number | "") => void;
  cashDisplayName: string;
  setCashDisplayName: (v: string) => void;
  cashDisplayNameInputRef?: RefObject<HTMLInputElement | null>;
  cashCurrency: CashCurrencyCode;
  setCashCurrency: (v: CashCurrencyCode) => void;
  cashGeoKey: string;
  setCashGeoKey: (v: string) => void;
  showDistributionHint: boolean;
}) {
  if (brokersLoading) {
    return <FormFieldsCardSkeleton ariaLabel="Loading brokers" fields={4} />;
  }
  return (
    <div className="space-y-3 border border-slate-200 rounded-lg p-4 bg-white">
      <label className="block text-sm">
        Broker
        <select
          className="mt-1 block w-full border rounded px-2 py-1"
          value={cashBrokerId === "" ? "" : String(cashBrokerId)}
          onChange={(e) => {
            const v = e.target.value;
            setCashBrokerId(v === "" ? "" : Number.parseInt(v, 10));
          }}
          required
        >
          {cashBrokers.length === 0 ? (
            <option value="">
              No cash-account-type broker - add one under Brokers
            </option>
          ) : (
            cashBrokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))
          )}
        </select>
      </label>
      <label className="block text-sm">
        Display name
        <input
          ref={cashDisplayNameInputRef}
          className="mt-1 block w-full border rounded px-2 py-1"
          required
          value={cashDisplayName}
          onChange={(e) => setCashDisplayName(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Currency
        <select
          className="mt-1 block w-full border rounded px-2 py-1"
          value={cashCurrency}
          onChange={(e) => setCashCurrency(e.target.value as CashCurrencyCode)}
        >
          {SUPPORTED_CASH_CURRENCY_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Country code
        <input
          className="mt-1 block w-full border rounded px-2 py-1"
          required
          value={cashGeoKey}
          onChange={(e) => setCashGeoKey(e.target.value)}
          placeholder="ISO 2-letter code (e.g. FI)"
        />
      </label>
      {showDistributionHint ? (
        <p className="text-xs text-slate-500">
          Cash account country is not used for portfolio distribution
          calculations.
        </p>
      ) : null}
    </div>
  );
}

function InstrumentFormPage(props: InstrumentFormPageProps) {
  const navigate = useNavigate();
  const mode = props.mode;
  const editInstrumentId = props.mode === "edit" ? props.instrumentId : null;

  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);

  const [brokers, setBrokers] = useState<BrokerRow[]>([]);
  const [brokersLoading, setBrokersLoading] = useState(true);

  const [loadingEdit, setLoadingEdit] = useState(mode === "edit");
  const [initial, setInitial] = useState<InstrumentDetail | null>(null);

  const yahooSymbolInputRef = useRef<HTMLInputElement>(null);
  const seligsonFidInputRef = useRef<HTMLInputElement>(null);
  const cashDisplayNameInputRef = useRef<HTMLInputElement>(null);

  const [customBrokerId, setCustomBrokerId] = useState<number | "">("");
  const [cashBrokerId, setCashBrokerId] = useState<number | "">("");

  const [yahooSymbol, setYahooSymbol] = useState("");
  const [holdingsDistributionUrl, setHoldingsDistributionUrl] = useState("");
  const [providerBreakdownDataUrl, setProviderBreakdownDataUrl] = useState("");
  const [yahooPreview, setYahooPreview] = useState<YahooLookupResponse | null>(
    null,
  );

  const [seligsonFid, setSeligsonFid] = useState("");

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
      seligsonFidInputRef.current?.focus();
    } else if (kind === "cash_account") {
      cashDisplayNameInputRef.current?.focus();
    }
  }, [mode, kind]);

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

  async function previewYahoo() {
    setError(null);
    setYahooPreview(null);
    const s = yahooSymbol.trim();
    if (!s) {
      setError("Enter a Yahoo symbol.");
      return;
    }
    try {
      const data = await apiGet<YahooLookupResponse>(
        `/instruments/lookup-yahoo?symbol=${encodeURIComponent(s)}`,
      );
      setYahooPreview(data);
    } catch (e) {
      setError(String(e));
    }
  }

  async function submitNew(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (kind === "etf" || kind === "stock") {
        const s = yahooSymbol.trim();
        if (!s) {
          setError("Enter a Yahoo symbol.");
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
      setError(String(err));
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
    if (loadingEdit) {
      return <EditInstrumentPageSkeleton />;
    }

    if (!initial) {
      return (
        <div className="w-full min-w-0 space-y-4">
          {error ? <ErrorAlert>{error}</ErrorAlert> : null}
          <ButtonLink to="/instruments">Back to instruments</ButtonLink>
        </div>
      );
    }

    if (initial.kind === "custom") {
      return (
        <div className="w-full min-w-0 space-y-6">
          <header className="space-y-2">
            <Link
              to="/instruments"
              className="text-sm text-emerald-800 hover:underline"
            >
              ← Instruments
            </Link>
            <h1 className="text-2xl font-semibold text-slate-900">
              Edit instrument
            </h1>
          </header>
          <p className="text-slate-700 text-sm max-w-lg">
            Seligson-linked instruments are not edited here.
          </p>
          <ButtonLink to="/instruments">Back to instruments</ButtonLink>
        </div>
      );
    }

    if (initial.kind === "etf" || initial.kind === "stock") {
      return (
        <div className="w-full min-w-0 space-y-6">
          <header className="space-y-2">
            <Link
              to="/instruments"
              className="text-sm text-emerald-800 hover:underline"
            >
              ← Instruments
            </Link>
            <h1 className="text-2xl font-semibold text-slate-900">
              ETF / stock settings
            </h1>
            <p className="text-sm text-slate-600">
              <span className="font-mono text-slate-800">
                {initial.yahooSymbol ?? "-"}
              </span>{" "}
              - {initial.displayName}
            </p>
            {error ? <ErrorAlert>{error}</ErrorAlert> : null}
          </header>

          <form
            onSubmit={(e) => void submitEditEtfStock(e)}
            className="space-y-6"
          >
            <div className="space-y-3 border border-slate-200 rounded-lg p-4 bg-white">
              <HoldingsBreakdownUrlFields
                holdingsDistributionUrl={holdingsDistributionUrl}
                setHoldingsDistributionUrl={setHoldingsDistributionUrl}
                providerBreakdownDataUrl={providerBreakdownDataUrl}
                setProviderBreakdownDataUrl={setProviderBreakdownDataUrl}
                onClearError={() => setError(null)}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="bg-emerald-700 text-white px-4 py-2 rounded"
              >
                Save
              </button>
              <Link
                to="/instruments"
                className="inline-flex items-center justify-center text-sm font-medium rounded-md border border-slate-200 bg-white px-3 py-1.5 text-slate-800 shadow-sm hover:bg-slate-50"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      );
    }

    if (initial.kind !== "cash_account") {
      return (
        <div className="w-full min-w-0 space-y-6">
          <header className="space-y-2">
            <Link
              to="/instruments"
              className="text-sm text-emerald-800 hover:underline"
            >
              ← Instruments
            </Link>
            <h1 className="text-2xl font-semibold text-slate-900">
              Edit instrument
            </h1>
          </header>
          <p className="text-slate-700 text-sm max-w-lg">
            This instrument type cannot be edited here.
          </p>
          <ButtonLink to="/instruments">Back to instruments</ButtonLink>
        </div>
      );
    }

    return (
      <div className="w-full min-w-0 space-y-6">
        <header className="space-y-2">
          <Link
            to="/instruments"
            className="text-sm text-emerald-800 hover:underline"
          >
            ← Instruments
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">
            Edit cash account
          </h1>
          {error ? <ErrorAlert>{error}</ErrorAlert> : null}
        </header>

        <form onSubmit={(e) => void submitEditCash(e)} className="space-y-6">
          <CashAccountFormFields
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
            showDistributionHint={false}
          />

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={brokersLoading}
              className="bg-emerald-700 text-white px-4 py-2 rounded disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              Save
            </button>
            <Link
              to="/instruments"
              className="inline-flex items-center justify-center text-sm font-medium rounded-md border border-slate-200 bg-white px-3 py-1.5 text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <header className="space-y-2">
        <Link to="/" className="text-sm text-emerald-800 hover:underline">
          ← Portfolio
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">
          New instrument
        </h1>
        {error ? <ErrorAlert>{error}</ErrorAlert> : null}
      </header>

      <form onSubmit={(e) => void submitNew(e)} className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-800">Instrument type</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["etf", "ETF"],
                ["stock", "Stock"],
                ["custom", "Custom (Seligson)"],
                ["cash_account", "Cash account"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`px-3 py-1.5 rounded border text-sm ${
                  kind === value
                    ? "bg-emerald-700 text-white border-emerald-800"
                    : "bg-white border-slate-200 text-slate-800 hover:bg-slate-50"
                }`}
                onClick={() => {
                  setKind(value);
                  setError(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {kind === "etf" || kind === "stock" ? (
          <div className="space-y-3 border border-slate-200 rounded-lg p-4 bg-white">
            <label className="block text-sm">
              Yahoo symbol
              <input
                ref={yahooSymbolInputRef}
                className="mt-1 block w-full border rounded px-2 py-1"
                value={yahooSymbol}
                onChange={(e) => setYahooSymbol(e.target.value)}
                placeholder={kind === "stock" ? "BRK-B" : "SXR8.DE"}
              />
            </label>
            <button
              type="button"
              className="text-sm text-emerald-800 underline"
              onClick={() => void previewYahoo()}
            >
              Preview from Yahoo
            </button>
            <HoldingsBreakdownUrlFields
              holdingsDistributionUrl={holdingsDistributionUrl}
              setHoldingsDistributionUrl={setHoldingsDistributionUrl}
              providerBreakdownDataUrl={providerBreakdownDataUrl}
              setProviderBreakdownDataUrl={setProviderBreakdownDataUrl}
            />
            {yahooPreview && (
              <div className="text-sm text-slate-700 space-y-1 border-t pt-3 mt-2">
                <p>
                  <span className="text-slate-500">Name: </span>
                  {yahooPreview.displayName}
                </p>
                {yahooPreview.lookup.isin && (
                  <p>
                    <span className="text-slate-500">ISIN: </span>
                    {yahooPreview.lookup.isin}
                  </p>
                )}
                {(yahooPreview.lookup.sector ||
                  yahooPreview.lookup.country) && (
                  <p>
                    <span className="text-slate-500">Sector / country: </span>
                    {[yahooPreview.lookup.sector, yahooPreview.lookup.country]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : null}

        {kind === "custom" ? (
          brokersLoading ? (
            <FormFieldsCardSkeleton ariaLabel="Loading brokers" fields={3} />
          ) : (
            <div className="space-y-3 border border-slate-200 rounded-lg p-4 bg-white">
              <label className="block text-sm">
                Broker
                <select
                  className="mt-1 block w-full border rounded px-2 py-1"
                  value={customBrokerId === "" ? "" : String(customBrokerId)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCustomBrokerId(v === "" ? "" : Number.parseInt(v, 10));
                  }}
                  required
                >
                  {seligsonBrokers.length === 0 ? (
                    <option value="">
                      No Seligson-type broker - add one under Brokers
                    </option>
                  ) : (
                    seligsonBrokers.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="block text-sm">
                Seligson FID
                <input
                  ref={seligsonFidInputRef}
                  type="number"
                  min={1}
                  className="mt-1 block w-full border rounded px-2 py-1"
                  value={seligsonFid}
                  onChange={(e) => setSeligsonFid(e.target.value)}
                  placeholder="FundViewer fid=…"
                />
              </label>
              <p className="text-xs text-slate-500">
                The fund name is loaded from Seligson when you create the
                instrument.
              </p>
            </div>
          )
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
            showDistributionHint
          />
        ) : null}

        <button
          type="submit"
          disabled={
            !kind ||
            (brokersLoading && (kind === "custom" || kind === "cash_account"))
          }
          className="bg-emerald-700 disabled:bg-slate-300 text-white px-4 py-2 rounded"
        >
          Create instrument
        </button>
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
      <div className="w-full min-w-0 space-y-4">
        <ErrorAlert>Invalid instrument id.</ErrorAlert>
        <ButtonLink to="/instruments">Back to instruments</ButtonLink>
      </div>
    );
  }

  return <InstrumentFormPage mode="edit" instrumentId={id} />;
}
