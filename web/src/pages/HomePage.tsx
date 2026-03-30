import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGet, apiPost } from "../api";
import { formatPercentWidth4From01 } from "../lib/distributionDisplay";

type Broker = { id: number; code: string; name: string };
type Instrument = {
  id: number;
  kind: string;
  displayName: string;
  yahooSymbol: string | null;
  seligsonFundId: number | null;
  cashGeoKey: string | null;
  cashCurrency: string | null;
  cashInterestType: string | null;
  markPriceEur: string | null;
};
type Transaction = {
  id: number;
  brokerId: number;
  tradeDate: string;
  side: string;
  instrumentId: number;
  quantity: string;
  unitPrice: string;
  currency: string;
};

type Portfolio = {
  regions: Record<string, number>;
  sectors: Record<string, number>;
  totalValueEur: number;
  mixedCurrencyWarning: boolean;
  positions: Array<{
    instrumentId: number;
    displayName: string;
    weight: number;
    valueEur: number;
    valuationSource: string;
  }>;
};

function toChartData(rec: Record<string, number>) {
  return Object.entries(rec).map(([name, value]) => ({ name, value }));
}

export function HomePage() {
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [b, i, t, p] = await Promise.all([
        apiGet<Broker[]>("/brokers"),
        apiGet<Instrument[]>("/instruments"),
        apiGet<Transaction[]>("/transactions"),
        apiGet<Portfolio>("/portfolio/distributions"),
      ]);
      setBrokers(b);
      setInstruments(i);
      setTransactions(t);
      setPortfolio(p);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const [txnForm, setTxnForm] = useState({
    brokerId: 1,
    tradeDate: new Date().toISOString().slice(0, 10),
    side: "buy" as "buy" | "sell",
    instrumentId: 1,
    quantity: "1",
    unitPrice: "0",
    currency: "EUR",
    unitPriceEur: "",
  });

  async function submitTransaction(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const body: Record<string, unknown> = {
        brokerId: txnForm.brokerId,
        tradeDate: txnForm.tradeDate,
        side: txnForm.side,
        instrumentId: txnForm.instrumentId,
        quantity: txnForm.quantity,
        unitPrice: txnForm.unitPrice,
        currency: txnForm.currency,
      };
      if (txnForm.unitPriceEur) {
        body.unitPriceEur = txnForm.unitPriceEur;
      }
      await apiPost<Transaction>("/transactions", body);
      await load();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="w-full min-w-0 space-y-10">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold text-slate-900">Portfolio</h1>
          <div className="flex flex-wrap gap-4 text-sm font-medium">
            <Link
              to="/instruments"
              className="text-emerald-800 hover:underline"
            >
              Instruments
            </Link>
            <Link
              to="/instruments/new"
              className="text-emerald-800 hover:underline"
            >
              New instrument
            </Link>
          </div>
        </div>
        {error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}
      </header>

      <section>
        <form
          onSubmit={(e) => void submitTransaction(e)}
          className="space-y-3 border border-slate-200 rounded-lg p-4 bg-white shadow-sm"
        >
          <h2 className="font-medium text-slate-800">New transaction</h2>
          <label className="block text-sm">
            Broker
            <select
              className="mt-1 block w-full border rounded px-2 py-1"
              value={txnForm.brokerId}
              onChange={(e) =>
                setTxnForm({
                  ...txnForm,
                  brokerId: Number.parseInt(e.target.value, 10),
                })
              }
            >
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Date
            <input
              type="date"
              className="mt-1 block w-full border rounded px-2 py-1"
              value={txnForm.tradeDate}
              onChange={(e) =>
                setTxnForm({ ...txnForm, tradeDate: e.target.value })
              }
            />
          </label>
          <label className="block text-sm">
            Side
            <select
              className="mt-1 block w-full border rounded px-2 py-1"
              value={txnForm.side}
              onChange={(e) =>
                setTxnForm({
                  ...txnForm,
                  side: e.target.value as "buy" | "sell",
                })
              }
            >
              <option value="buy">buy</option>
              <option value="sell">sell</option>
            </select>
          </label>
          <label className="block text-sm">
            Instrument
            <select
              className="mt-1 block w-full border rounded px-2 py-1"
              value={txnForm.instrumentId}
              onChange={(e) =>
                setTxnForm({
                  ...txnForm,
                  instrumentId: Number.parseInt(e.target.value, 10),
                })
              }
            >
              {instruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.id} — {i.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Quantity
            <input
              className="mt-1 block w-full border rounded px-2 py-1"
              value={txnForm.quantity}
              onChange={(e) =>
                setTxnForm({ ...txnForm, quantity: e.target.value })
              }
            />
          </label>
          <label className="block text-sm">
            Unit price
            <input
              className="mt-1 block w-full border rounded px-2 py-1"
              value={txnForm.unitPrice}
              onChange={(e) =>
                setTxnForm({ ...txnForm, unitPrice: e.target.value })
              }
            />
          </label>
          <label className="block text-sm">
            Currency
            <input
              className="mt-1 block w-full border rounded px-2 py-1"
              value={txnForm.currency}
              onChange={(e) =>
                setTxnForm({ ...txnForm, currency: e.target.value })
              }
            />
          </label>
          <label className="block text-sm">
            Unit price EUR (optional)
            <input
              className="mt-1 block w-full border rounded px-2 py-1"
              value={txnForm.unitPriceEur}
              onChange={(e) =>
                setTxnForm({ ...txnForm, unitPriceEur: e.target.value })
              }
            />
          </label>
          <button
            type="submit"
            className="bg-slate-800 text-white px-4 py-2 rounded"
          >
            Add transaction
          </button>
        </form>
      </section>

      {portfolio && (
        <section className="space-y-4">
          <h2 className="text-xl font-medium text-slate-800">
            Distributions (value-weighted)
          </h2>
          <p className="text-slate-600 text-sm">
            Total estimated EUR:{" "}
            <span className="font-mono">
              {portfolio.totalValueEur.toFixed(2)}
            </span>
            {portfolio.mixedCurrencyWarning && (
              <span className="text-amber-700 ml-2">
                Mixed-currency warning (see API).
              </span>
            )}
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="h-64">
              <h3 className="text-sm font-medium text-slate-700 mb-2">
                Regions
              </h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={toChartData(portfolio.regions)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    angle={-35}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis
                    tickFormatter={(v) => formatPercentWidth4From01(v)}
                    tick={{ fontFamily: "ui-monospace, monospace" }}
                  />
                  <Tooltip
                    formatter={(v: number) => formatPercentWidth4From01(v)}
                  />
                  <Bar dataKey="value" fill="#0f766e" name="Weight" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="h-64">
              <h3 className="text-sm font-medium text-slate-700 mb-2">
                Sectors
              </h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={toChartData(portfolio.sectors)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    angle={-35}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis
                    tickFormatter={(v) => formatPercentWidth4From01(v)}
                    tick={{ fontFamily: "ui-monospace, monospace" }}
                  />
                  <Tooltip
                    formatter={(v: number) => formatPercentWidth4From01(v)}
                  />
                  <Legend />
                  <Bar dataKey="value" fill="#334155" name="Weight" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-2">Instrument</th>
                  <th className="text-right p-2">Weight</th>
                  <th className="text-right p-2">Value EUR</th>
                  <th className="text-left p-2">Valuation</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.positions.map((p) => (
                  <tr key={p.instrumentId} className="border-t">
                    <td className="p-2">{p.displayName}</td>
                    <td className="p-2 text-right font-mono">
                      {formatPercentWidth4From01(p.weight)}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {p.valueEur.toFixed(2)}
                    </td>
                    <td className="p-2 text-slate-600">{p.valuationSource}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xl font-medium text-slate-800 mb-2">
          Transactions
        </h2>
        <div className="overflow-x-auto border rounded-lg text-sm">
          <table className="min-w-full">
            <thead className="bg-slate-100">
              <tr>
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Side</th>
                <th className="text-right p-2">Instrument</th>
                <th className="text-right p-2">Qty</th>
                <th className="text-right p-2">Price</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="p-2">{t.tradeDate}</td>
                  <td className="p-2">{t.side}</td>
                  <td className="p-2 text-right">{t.instrumentId}</td>
                  <td className="p-2 text-right font-mono">{t.quantity}</td>
                  <td className="p-2 text-right font-mono">
                    {t.unitPrice} {t.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
