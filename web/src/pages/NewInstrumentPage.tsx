import {
  type CashCurrencyCode,
  DEFAULT_CASH_CURRENCY,
  SUPPORTED_CASH_CURRENCY_CODES,
} from "@investments/db";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../api";

type Kind = "etf" | "stock" | "seligson_fund" | "cash_account";

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

export function NewInstrumentPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);

  const yahooSymbolInputRef = useRef<HTMLInputElement>(null);
  const seligsonFidInputRef = useRef<HTMLInputElement>(null);
  const cashDisplayNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (kind === "etf" || kind === "stock") {
      yahooSymbolInputRef.current?.focus();
    } else if (kind === "seligson_fund") {
      seligsonFidInputRef.current?.focus();
    } else if (kind === "cash_account") {
      cashDisplayNameInputRef.current?.focus();
    }
  }, [kind]);

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
      } else if (kind === "seligson_fund") {
        const fid = Number.parseInt(seligsonFid, 10);
        if (!Number.isFinite(fid) || fid <= 0) {
          setError("Enter a valid Seligson FID (positive integer).");
          return;
        }
        await apiPost<InstrumentRow>("/instruments", {
          kind: "seligson_fund",
          seligsonFid: fid,
        });
      } else if (kind === "cash_account") {
        const name = cashDisplayName.trim();
        if (!name) {
          setError("Enter a display name.");
          return;
        }
        const geo = cashGeoKey.trim();
        if (!geo) {
          setError("Enter a geo key (e.g. country code).");
          return;
        }
        await apiPost<InstrumentRow>("/instruments", {
          kind: "cash_account",
          displayName: name,
          currency: cashCurrency,
          cashGeoKey: geo,
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
                ["seligson_fund", "Seligson fund"],
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

        {kind === "seligson_fund" ? (
          <div className="space-y-3 border border-slate-200 rounded-lg p-4 bg-white">
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
              Geo key
              <input
                className="mt-1 block w-full border rounded px-2 py-1"
                required
                value={cashGeoKey}
                onChange={(e) => setCashGeoKey(e.target.value)}
                placeholder="e.g. FI or United States"
              />
            </label>
            <p className="text-xs text-slate-500">
              Not used for distribution calculations.
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
