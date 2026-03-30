import {
  type BrokerType,
  type CashCurrencyCode,
  DEFAULT_CASH_CURRENCY,
  SUPPORTED_CASH_CURRENCY_CODES,
  normalizeCashAccountIsoCountryCode,
} from "@investments/db";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiGet, apiPatch } from "../api";
import { ButtonLink } from "../components/Button";

type SeligsonFundSummary = {
  id: number;
  fid: number;
  name: string;
};

type InstrumentDetail = {
  id: number;
  kind: string;
  displayName: string;
  yahooSymbol: string | null;
  isin: string | null;
  seligsonFundId: number | null;
  brokerId: number | null;
  broker: {
    id: number;
    name: string;
    brokerType: string;
  } | null;
  cashGeoKey: string | null;
  cashCurrency: string | null;
  cashInterestType: string | null;
  markPriceEur: string | null;
  seligsonFund: SeligsonFundSummary | null;
};

type BrokerRow = {
  id: number;
  name: string;
  brokerType: BrokerType;
};

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

export function EditInstrumentPage() {
  const navigate = useNavigate();
  const { id: idParam } = useParams();
  const id = Number.parseInt(idParam ?? "", 10);

  const yahooSymbolInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initial, setInitial] = useState<InstrumentDetail | null>(null);
  const [brokers, setBrokers] = useState<BrokerRow[]>([]);

  const [displayName, setDisplayName] = useState("");
  const [yahooSymbol, setYahooSymbol] = useState("");
  const [isin, setIsin] = useState("");
  const [markPriceEur, setMarkPriceEur] = useState("");

  const [customBrokerId, setCustomBrokerId] = useState<number | "">("");
  const [cashBrokerId, setCashBrokerId] = useState<number | "">("");
  const [cashCurrency, setCashCurrency] = useState<CashCurrencyCode>(
    DEFAULT_CASH_CURRENCY,
  );
  const [cashGeoKey, setCashGeoKey] = useState("");
  const [cashInterestType, setCashInterestType] = useState("");

  const [yahooPreview, setYahooPreview] = useState<YahooLookupResponse | null>(
    null,
  );

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
        setDisplayName(row.displayName);
        setYahooSymbol(row.yahooSymbol ?? "");
        setIsin(row.isin ?? "");
        setMarkPriceEur(row.markPriceEur ?? "");
        if (row.kind === "custom") {
          setCustomBrokerId(row.brokerId ?? "");
        }
        if (row.kind === "cash_account") {
          setCashBrokerId(row.brokerId ?? "");
          setCashCurrency(
            (row.cashCurrency as CashCurrencyCode) ?? DEFAULT_CASH_CURRENCY,
          );
          setCashGeoKey(row.cashGeoKey ?? "");
          setCashInterestType(row.cashInterestType ?? "");
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (initial?.kind === "etf" || initial?.kind === "stock") {
      yahooSymbolInputRef.current?.focus();
    }
  }, [initial?.kind]);

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!initial) {
      return;
    }

    const patch: Record<string, string | number | null> = {};

    if (initial.kind === "etf" || initial.kind === "stock") {
      if (displayName.trim() !== initial.displayName) {
        patch.displayName = displayName.trim();
      }
      const sym = yahooSymbol.trim();
      const normInitial = (initial.yahooSymbol ?? "").trim();
      if (sym !== normInitial) {
        patch.yahooSymbol = sym;
      }
      const isinTrim = isin.trim();
      const initialIsin = initial.isin ?? "";
      if (isinTrim !== initialIsin) {
        if (isinTrim === "") {
          patch.isin = null;
        } else if (isinTrim.length === 12) {
          patch.isin = isinTrim;
        } else {
          setError("ISIN must be exactly 12 characters or empty.");
          return;
        }
      }
      const markTrim = markPriceEur.trim();
      const initialMark = (initial.markPriceEur ?? "").trim();
      if (markTrim !== initialMark) {
        patch.markPriceEur = markTrim === "" ? null : markTrim;
      }
    } else if (initial.kind === "custom") {
      if (displayName.trim() !== initial.displayName) {
        patch.displayName = displayName.trim();
      }
      if (
        customBrokerId !== "" &&
        typeof customBrokerId === "number" &&
        customBrokerId !== initial.brokerId
      ) {
        patch.brokerId = customBrokerId;
      }
      const isinTrim = isin.trim();
      const initialIsin = initial.isin ?? "";
      if (isinTrim !== initialIsin) {
        if (isinTrim === "") {
          patch.isin = null;
        } else if (isinTrim.length === 12) {
          patch.isin = isinTrim;
        } else {
          setError("ISIN must be exactly 12 characters or empty.");
          return;
        }
      }
      const markTrim = markPriceEur.trim();
      const initialMark = (initial.markPriceEur ?? "").trim();
      if (markTrim !== initialMark) {
        patch.markPriceEur = markTrim === "" ? null : markTrim;
      }
    } else if (initial.kind === "cash_account") {
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
        setError(
          "Enter a valid ISO 3166-1 alpha-2 country code (e.g. FI, US).",
        );
        return;
      }
      if (geoIso !== (initial.cashGeoKey ?? "")) {
        patch.cashGeoKey = geoIso;
      }
      const interestTrim = cashInterestType.trim();
      const initialInterest = initial.cashInterestType ?? "";
      if (interestTrim !== initialInterest) {
        patch.cashInterestType = interestTrim === "" ? null : interestTrim;
      }
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

  const seligsonBrokers = brokers.filter((b) => b.brokerType === "seligson");
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
          Edit instrument
        </h1>
        {error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}
      </header>

      <form onSubmit={(e) => void submit(e)} className="space-y-6">
        <p className="text-sm text-slate-600">
          {initial.kind === "etf"
            ? "ETF"
            : initial.kind === "stock"
              ? "Stock"
              : initial.kind === "custom"
                ? "Custom (Seligson)"
                : "Cash account"}
        </p>

        {initial.kind === "etf" || initial.kind === "stock" ? (
          <div className="space-y-3 border border-slate-200 rounded-lg p-4 bg-white">
            <label className="block text-sm">
              Display name
              <input
                className="mt-1 block w-full border rounded px-2 py-1"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              Yahoo symbol
              <input
                ref={yahooSymbolInputRef}
                className="mt-1 block w-full border rounded px-2 py-1 font-mono"
                value={yahooSymbol}
                onChange={(e) => setYahooSymbol(e.target.value)}
                required
              />
            </label>
            <button
              type="button"
              className="text-sm text-emerald-800 underline"
              onClick={() => void previewYahoo()}
            >
              Preview from Yahoo
            </button>
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
              </div>
            )}
            <label className="block text-sm">
              ISIN
              <input
                className="mt-1 block w-full border rounded px-2 py-1 font-mono"
                value={isin}
                onChange={(e) => setIsin(e.target.value)}
                placeholder="12 characters or leave empty"
                maxLength={12}
              />
            </label>
            <label className="block text-sm">
              Mark price (EUR)
              <input
                className="mt-1 block w-full border rounded px-2 py-1 font-mono"
                value={markPriceEur}
                onChange={(e) => setMarkPriceEur(e.target.value)}
                placeholder="Optional manual mark"
              />
            </label>
          </div>
        ) : null}

        {initial.kind === "custom" ? (
          <div className="space-y-3 border border-slate-200 rounded-lg p-4 bg-white">
            {initial.seligsonFund ? (
              <p className="text-sm text-slate-700">
                Seligson fund:{" "}
                <span className="font-medium">{initial.seligsonFund.name}</span>{" "}
                (FID {initial.seligsonFund.fid})
              </p>
            ) : null}
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
                    No Seligson-type broker — add one under Brokers
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
              Display name
              <input
                className="mt-1 block w-full border rounded px-2 py-1"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              ISIN
              <input
                className="mt-1 block w-full border rounded px-2 py-1 font-mono"
                value={isin}
                onChange={(e) => setIsin(e.target.value)}
                placeholder="Optional, 12 characters"
                maxLength={12}
              />
            </label>
            <label className="block text-sm">
              Mark price (EUR)
              <input
                className="mt-1 block w-full border rounded px-2 py-1 font-mono"
                value={markPriceEur}
                onChange={(e) => setMarkPriceEur(e.target.value)}
                placeholder="Optional manual mark"
              />
            </label>
          </div>
        ) : null}

        {initial.kind === "cash_account" ? (
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
              Country
              <input
                className="mt-1 block w-full border rounded px-2 py-1"
                required
                value={cashGeoKey}
                onChange={(e) => setCashGeoKey(e.target.value)}
                placeholder="ISO 2-letter code (e.g. FI)"
              />
            </label>
            <label className="block text-sm">
              Interest type
              <input
                className="mt-1 block w-full border rounded px-2 py-1"
                value={cashInterestType}
                onChange={(e) => setCashInterestType(e.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>
        ) : null}

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
