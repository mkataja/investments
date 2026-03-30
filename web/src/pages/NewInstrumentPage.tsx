import {
  type BrokerType,
  type CashCurrencyCode,
  DEFAULT_CASH_CURRENCY,
  SUPPORTED_CASH_CURRENCY_CODES,
  normalizeCashAccountIsoCountryCode,
} from "@investments/db";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../api";

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

type BrokerRow = {
  id: number;
  name: string;
  brokerType: BrokerType;
};

export function NewInstrumentPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);

  const [brokers, setBrokers] = useState<BrokerRow[]>([]);

  const yahooSymbolInputRef = useRef<HTMLInputElement>(null);
  const seligsonFidInputRef = useRef<HTMLInputElement>(null);
  const cashDisplayNameInputRef = useRef<HTMLInputElement>(null);

  const [customBrokerId, setCustomBrokerId] = useState<number | "">("");
  const [cashBrokerId, setCashBrokerId] = useState<number | "">("");

  useEffect(() => {
    void apiGet<BrokerRow[]>("/brokers")
      .then(setBrokers)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (kind === "etf" || kind === "stock") {
      yahooSymbolInputRef.current?.focus();
    } else if (kind === "custom") {
      seligsonFidInputRef.current?.focus();
    } else if (kind === "cash_account") {
      cashDisplayNameInputRef.current?.focus();
    }
  }, [kind]);

  useEffect(() => {
    const seligsonBrokers = brokers.filter((b) => b.brokerType === "seligson");
    const first = seligsonBrokers[0];
    if (kind === "custom" && first != null && customBrokerId === "") {
      setCustomBrokerId(first.id);
    }
  }, [kind, brokers, customBrokerId]);

  useEffect(() => {
    const cashBrokers = brokers.filter((b) => b.brokerType === "cash_account");
    const first = cashBrokers[0];
    if (kind === "cash_account" && first != null && cashBrokerId === "") {
      setCashBrokerId(first.id);
    }
  }, [kind, brokers, cashBrokerId]);

  const [yahooSymbol, setYahooSymbol] = useState("");
  const [yahooPreview, setYahooPreview] = useState<YahooLookupResponse | null>(
    null,
  );

  const [seligsonFid, setSeligsonFid] = useState("");

  const [cashDisplayName, setCashDisplayName] = useState("");
  const [cashCurrency, setCashCurrency] = useState<CashCurrencyCode>(
    DEFAULT_CASH_CURRENCY,
  );
  const [cashGeoKey, setCashGeoKey] = useState("");

  const prevCashBrokerIdRef = useRef<number | null>(null);
  useEffect(() => {
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
  }, [kind, cashBrokerId, brokers, cashDisplayName]);

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
    try {
      if (kind === "etf" || kind === "stock") {
        const s = yahooSymbol.trim();
        if (!s) {
          setError("Enter a Yahoo symbol.");
          return;
        }
        await apiPost<InstrumentRow>("/instruments", {
          kind,
          yahooSymbol: s,
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

  const seligsonBrokers = brokers.filter((b) => b.brokerType === "seligson");
  const cashBrokers = brokers.filter((b) => b.brokerType === "cash_account");

  return (
    <div className="w-full min-w-0 space-y-8">
      <header className="space-y-2">
        <Link to="/" className="text-sm text-emerald-800 hover:underline">
          ← Portfolio
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">
          New instrument
        </h1>
        {error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}
      </header>

      <form onSubmit={(e) => void submit(e)} className="space-y-6">
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
                className="mt-1 block w-full border rounded px-2 py-1 font-mono"
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
        ) : null}

        {kind === "cash_account" ? (
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
            <p className="text-xs text-slate-500">
              Cash account country is not used for portfolio distribution
              calculations.
            </p>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!kind}
          className="bg-emerald-700 disabled:bg-slate-300 text-white px-4 py-2 rounded"
        >
          Create instrument
        </button>
      </form>
    </div>
  );
}
