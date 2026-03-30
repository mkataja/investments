import { useState } from "react";
import { apiBase } from "../api";

export function DevPage() {
  const [symbol, setSymbol] = useState("VWCE.DE");
  const [fid, setFid] = useState("800");
  const [yahooOut, setYahooOut] = useState<string>("");
  const [seligsonOut, setSeligsonOut] = useState<string>("");
  const [loading, setLoading] = useState<string | null>(null);

  async function fetchYahoo() {
    setLoading("yahoo");
    setYahooOut("");
    try {
      const res = await fetch(
        `${apiBase}/dev/yahoo?${new URLSearchParams({ symbol })}`,
      );
      const text = await res.text();
      setYahooOut(text);
    } catch (e) {
      setYahooOut(String(e));
    } finally {
      setLoading(null);
    }
  }

  async function fetchSeligson() {
    setLoading("seligson");
    setSeligsonOut("");
    try {
      const res = await fetch(
        `${apiBase}/dev/seligson?${new URLSearchParams({ fid })}`,
      );
      const text = await res.text();
      setSeligsonOut(text);
    } catch (e) {
      setSeligsonOut(String(e));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <h1 className="text-2xl font-semibold text-slate-800">Data checks</h1>
      <p className="text-slate-600">
        Requires API in development mode and{" "}
        <code className="bg-slate-100 px-1 rounded">/dev</code> routes.
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Yahoo Finance</h2>
        <div className="flex gap-2 flex-wrap items-center">
          <input
            className="border rounded px-2 py-1"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="Symbol"
          />
          <button
            type="button"
            className="bg-slate-800 text-white px-3 py-1 rounded disabled:opacity-50"
            onClick={() => void fetchYahoo()}
            disabled={loading !== null}
          >
            Fetch
          </button>
        </div>
        <pre className="bg-slate-900 text-slate-100 p-4 rounded text-xs overflow-auto max-h-96">
          {yahooOut || "(empty)"}
        </pre>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Seligson FundViewer</h2>
        <div className="flex gap-2 flex-wrap items-center">
          <input
            className="border rounded px-2 py-1"
            value={fid}
            onChange={(e) => setFid(e.target.value)}
            placeholder="fid"
          />
          <button
            type="button"
            className="bg-slate-800 text-white px-3 py-1 rounded disabled:opacity-50"
            onClick={() => void fetchSeligson()}
            disabled={loading !== null}
          >
            Fetch
          </button>
        </div>
        <pre className="bg-slate-900 text-slate-100 p-4 rounded text-xs overflow-auto max-h-96">
          {seligsonOut || "(empty)"}
        </pre>
      </section>
    </div>
  );
}
