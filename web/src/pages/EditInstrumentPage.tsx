import {
  type BrokerType,
  type CashCurrencyCode,
  DEFAULT_CASH_CURRENCY,
  SUPPORTED_CASH_CURRENCY_CODES,
  normalizeCashAccountIsoCountryCode,
} from "@investments/db";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiGet, apiPatch } from "../api";
import { ButtonLink } from "../components/Button";

type InstrumentDetail = {
  id: number;
  kind: string;
  displayName: string;
  brokerId: number | null;
  cashGeoKey: string | null;
  cashCurrency: string | null;
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

  const [displayName, setDisplayName] = useState("");
  const [cashBrokerId, setCashBrokerId] = useState<number | "">("");
  const [cashCurrency, setCashCurrency] = useState<CashCurrencyCode>(
    DEFAULT_CASH_CURRENCY,
  );
  const [cashGeoKey, setCashGeoKey] = useState("");

  useEffect(() => {
    void apiGet<BrokerRow[]>("/brokers")
      .then(setBrokers)
      .catch((e) => setError(String(e)));
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

  if (!Number.isFinite(id) || id < 1) {
    return (
      <div className="w-full min-w-0 space-y-4">
        <p className="text-red-600 text-sm">Invalid instrument id.</p>
        <ButtonLink to="/instruments">Back to instruments</ButtonLink>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full min-w-0 space-y-4">
        <p className="text-slate-600 text-sm">Loading…</p>
      </div>
    );
  }

  if (!initial) {
    return (
      <div className="w-full min-w-0 space-y-4">
        {error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}
        <ButtonLink to="/instruments">Back to instruments</ButtonLink>
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
          Only cash accounts can be edited here. ETF, stock, and Seligson fund
          instruments are loaded from their data source and are not updated
          through this form.
        </p>
        <ButtonLink to="/instruments">Back to instruments</ButtonLink>
      </div>
    );
  }

  const cashBrokers = brokers.filter((b) => b.brokerType === "cash_account");

  return (
    <div className="w-full min-w-0 space-y-8">
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
        {error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}
      </header>

      <form onSubmit={(e) => void submit(e)} className="space-y-6">
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
                  No cash-account-type broker — add one under Brokers
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
