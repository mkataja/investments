import {
  type BrokerType,
  type CashCurrencyCode,
  DEFAULT_CASH_CURRENCY,
  SUPPORTED_CASH_CURRENCY_CODES,
  normalizeCashAccountIsoCountryCode,
  validateHoldingsDistributionUrl,
  validateProviderBreakdownDataUrl,
} from "@investments/db";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiGet, apiPatch } from "../api";
import { ButtonLink } from "../components/Button";
import { ErrorAlert } from "../components/ErrorAlert";
import { ProviderHoldingsUrlHint } from "../components/ProviderHoldingsUrlHint";
import { EditInstrumentPageSkeleton } from "../components/listPageSkeletons";
import { FormFieldsCardSkeleton } from "../components/skeletonPrimitives";

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

export function EditInstrumentPage() {
  const navigate = useNavigate();
  const { id: idParam } = useParams();
  const id = Number.parseInt(idParam ?? "", 10);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initial, setInitial] = useState<InstrumentDetail | null>(null);
  const [brokers, setBrokers] = useState<BrokerRow[]>([]);
  const [brokersLoading, setBrokersLoading] = useState(true);

  const [displayName, setDisplayName] = useState("");
  const [cashBrokerId, setCashBrokerId] = useState<number | "">("");
  const [cashCurrency, setCashCurrency] = useState<CashCurrencyCode>(
    DEFAULT_CASH_CURRENCY,
  );
  const [cashGeoKey, setCashGeoKey] = useState("");
  const [holdingsUrl, setHoldingsUrl] = useState("");
  const [breakdownUrl, setBreakdownUrl] = useState("");

  useEffect(() => {
    setBrokersLoading(true);
    void apiGet<BrokerRow[]>("/brokers")
      .then(setBrokers)
      .catch((e) => setError(String(e)))
      .finally(() => setBrokersLoading(false));
  }, []);

  useEffect(() => {
    if (!Number.isFinite(id) || id < 1) {
      setError("Invalid instrument id.");
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    void apiGet<InstrumentDetail>(`/instruments/${id}`)
      .then((row) => {
        setInitial(row);
        if (row.kind === "cash_account") {
          setDisplayName(row.displayName);
          setCashBrokerId(row.brokerId ?? "");
          setCashCurrency(
            (row.cashCurrency as CashCurrencyCode) ?? DEFAULT_CASH_CURRENCY,
          );
          setCashGeoKey(row.cashGeoKey ?? "");
        }
        if (row.kind === "etf" || row.kind === "stock") {
          setHoldingsUrl(row.holdingsDistributionUrl ?? "");
          setBreakdownUrl(row.providerBreakdownDataUrl ?? "");
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!initial || initial.kind !== "cash_account") {
      return;
    }

    const patch: Record<string, string | number> = {};

    if (displayName.trim() !== initial.displayName) {
      patch.displayName = displayName.trim();
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
      await apiPatch(`/instruments/${id}`, patch);
      navigate("/instruments");
    } catch (err) {
      setError(String(err));
    }
  }

  async function submitEtfStock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!initial || (initial.kind !== "etf" && initial.kind !== "stock")) {
      return;
    }
    const holdingsV = validateHoldingsDistributionUrl(
      holdingsUrl.trim() || null,
    );
    const breakdownV = validateProviderBreakdownDataUrl(
      breakdownUrl.trim() || null,
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
      await apiPatch(`/instruments/${id}`, {
        holdingsDistributionUrl: nextH,
        providerBreakdownDataUrl: nextB,
      });
      navigate("/instruments");
    } catch (err) {
      setError(String(err));
    }
  }

  if (!Number.isFinite(id) || id < 1) {
    return (
      <div className="w-full min-w-0 space-y-4">
        <ErrorAlert>Invalid instrument id.</ErrorAlert>
        <ButtonLink to="/instruments">Back to instruments</ButtonLink>
      </div>
    );
  }

  if (loading) {
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

        <form onSubmit={(e) => void submitEtfStock(e)} className="space-y-6">
          <div className="space-y-3 border border-slate-200 rounded-lg p-4 bg-white">
            <label className="block text-sm">
              Provider holdings URL (optional)
              <input
                className="mt-1 block w-full border rounded px-2 py-1 font-mono text-sm"
                value={holdingsUrl}
                onChange={(e) => {
                  setHoldingsUrl(e.target.value);
                  setError(null);
                }}
              />
            </label>
            <ProviderHoldingsUrlHint showClearToYahooNote />
            <label className="block text-sm">
              Provider breakdown data URL (optional)
              <input
                className="mt-1 block w-full border rounded px-2 py-1 font-mono text-sm"
                value={breakdownUrl}
                onChange={(e) => {
                  setBreakdownUrl(e.target.value);
                  setError(null);
                }}
                placeholder="https://am.jpmorgan.com/FundsMarketingHandler/product-data?cusip=…"
              />
            </label>
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

  const cashBrokers = brokers.filter((b) => b.brokerType === "cash_account");

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

      <form onSubmit={(e) => void submit(e)} className="space-y-6">
        {brokersLoading ? (
          <FormFieldsCardSkeleton ariaLabel="Loading brokers" fields={4} />
        ) : (
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
                className="mt-1 block w-full border rounded px-2 py-1"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Currency
              <select
                className="mt-1 block w-full border rounded px-2 py-1"
                value={cashCurrency}
                onChange={(e) =>
                  setCashCurrency(e.target.value as CashCurrencyCode)
                }
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
          </div>
        )}

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
