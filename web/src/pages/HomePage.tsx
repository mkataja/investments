import {
  DEFAULT_CASH_CURRENCY,
  SUPPORTED_CASH_CURRENCY_CODES,
  instrumentTickerDisplay,
  transactionInstrumentSelectLabel,
} from "@investments/db";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Button, ButtonLink } from "../components/Button";
import { ErrorAlert } from "../components/ErrorAlert";
import { Modal } from "../components/Modal";
import {
  PortfolioViewSkeleton,
  TransactionsTableSkeleton,
} from "../components/PortfolioViewSkeleton";
import {
  formatDateTimeLocalInputValue,
  formatInstantForDisplay,
} from "../lib/dateTimeFormat";
import { formatPercentWidth4From01 } from "../lib/distributionDisplay";
import {
  formatTransactionUnitPriceForDisplay,
  formatUnitPriceForDisplay,
  roundQuantityForDisplay,
} from "../lib/numberFormat";

type Broker = {
  id: number;
  name: string;
  brokerType: string;
};
type Instrument = {
  id: number;
  kind: string;
  displayName: string;
  yahooSymbol: string | null;
  seligsonFund: { id: number; fid: number; name: string } | null;
  cashCurrency?: string | null;
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

function transactionSideLabel(side: string, instrumentKind?: string): string {
  if (instrumentKind === "cash_account") {
    if (side === "buy") return "Deposit";
    if (side === "sell") return "Withdrawal";
  }
  if (side === "buy") return "Buy";
  if (side === "sell") return "Sell";
  return side;
}

type Portfolio = {
  regions: Record<string, number>;
  sectors: Record<string, number>;
  totalValueEur: number;
  mixedCurrencyWarning: boolean;
  positions: Array<{
    instrumentId: number;
    displayName: string;
    quantity: number;
    unitPriceEur: number | null;
    weight: number;
    valueEur: number;
    valuationSource: string;
  }>;
};

function toChartData(rec: Record<string, number>) {
  return Object.entries(rec).map(([name, value]) => ({ name, value }));
}

function instrumentTickerCell(
  instrumentId: number,
  instrumentById: Map<number, Instrument>,
  instrumentTickerById: Map<number, string | null>,
): string {
  const inst = instrumentById.get(instrumentId);
  if (inst?.seligsonFund != null) return "-";
  return instrumentTickerById.get(instrumentId) ?? "—";
}

export function HomePage() {
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [b, t, inst, p] = await Promise.all([
        apiGet<Broker[]>("/brokers"),
        apiGet<Transaction[]>("/transactions"),
        apiGet<Instrument[]>("/instruments"),
        apiGet<Portfolio>("/portfolio/distributions"),
      ]);
      setBrokers(b);
      setTransactions(t);
      setInstruments(inst);
      setPortfolio(p);
    } catch (e) {
      setError(String(e));
    } finally {
      setInitialLoad(false);
    }
  }, []);

  const instrumentNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const i of instruments) {
      m.set(i.id, i.displayName);
    }
    return m;
  }, [instruments]);

  const instrumentById = useMemo(() => {
    const m = new Map<number, Instrument>();
    for (const i of instruments) {
      m.set(i.id, i);
    }
    return m;
  }, [instruments]);

  const instrumentTickerById = useMemo(() => {
    const m = new Map<number, string | null>();
    for (const i of instruments) {
      m.set(i.id, instrumentTickerDisplay(i));
    }
    return m;
  }, [instruments]);

  const holdingsSortedByWeight = useMemo(() => {
    if (!portfolio) return [];
    return [...portfolio.positions].sort((a, b) => b.weight - a.weight);
  }, [portfolio]);

  useEffect(() => {
    void load();
  }, [load]);

  const [txnModalOpen, setTxnModalOpen] = useState(false);
  const [txnInstruments, setTxnInstruments] = useState<Instrument[]>([]);
  const [txnInstrumentsLoading, setTxnInstrumentsLoading] = useState(false);
  const brokerSelectRef = useRef<HTMLSelectElement>(null);

  const [txnForm, setTxnForm] = useState({
    brokerId: 1,
    tradeDate: formatDateTimeLocalInputValue(new Date()),
    side: "buy" as "buy" | "sell",
    instrumentId: 0,
    quantity: "1",
    unitPrice: "0",
    currency: "EUR",
    unitPriceEur: "",
  });

  useEffect(() => {
    if (!txnModalOpen) {
      return;
    }
    let cancelled = false;
    setTxnInstrumentsLoading(true);
    setTxnInstruments([]);
    void (async () => {
      try {
        const list = await apiGet<Instrument[]>(
          `/instruments?brokerId=${txnForm.brokerId}`,
        );
        if (cancelled) {
          return;
        }
        setTxnInstruments(list);
        const first = list[0];
        const firstIsCash = first?.kind === "cash_account";
        setTxnForm((f) => ({
          ...f,
          instrumentId: first?.id ?? 0,
          quantity: firstIsCash ? "" : "1",
          unitPrice: firstIsCash ? "1" : "0",
          currency: firstIsCash
            ? (first?.cashCurrency?.trim().toUpperCase() ??
              DEFAULT_CASH_CURRENCY)
            : "EUR",
          side: "buy",
          unitPriceEur: "",
        }));
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
        }
      } finally {
        if (!cancelled) {
          setTxnInstrumentsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [txnModalOpen, txnForm.brokerId]);

  const selectedTxnInstrument = useMemo(
    () => txnInstruments.find((i) => i.id === txnForm.instrumentId),
    [txnInstruments, txnForm.instrumentId],
  );
  const isCashTxn = selectedTxnInstrument?.kind === "cash_account";
  const cashSumValid = useMemo(() => {
    if (!isCashTxn) return true;
    const s = Number.parseFloat(txnForm.quantity.replace(",", "."));
    return Number.isFinite(s) && s > 0;
  }, [isCashTxn, txnForm.quantity]);

  useEffect(() => {
    if (!txnModalOpen) {
      return;
    }
    brokerSelectRef.current?.focus();
  }, [txnModalOpen]);

  async function submitTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (txnForm.instrumentId < 1 || txnInstruments.length === 0) {
      return;
    }
    if (isCashTxn && !cashSumValid) {
      return;
    }
    setError(null);
    try {
      const body: Record<string, unknown> = {
        brokerId: txnForm.brokerId,
        tradeDate: new Date(txnForm.tradeDate).toISOString(),
        instrumentId: txnForm.instrumentId,
        currency: txnForm.currency.trim().toUpperCase(),
      };
      if (isCashTxn) {
        const sum = Number.parseFloat(txnForm.quantity.replace(",", "."));
        body.side = txnForm.side;
        body.quantity = String(sum);
        body.unitPrice = "1";
      } else {
        body.side = txnForm.side;
        body.quantity = txnForm.quantity;
        body.unitPrice = txnForm.unitPrice;
        if (txnForm.unitPriceEur) {
          body.unitPriceEur = txnForm.unitPriceEur;
        }
      }
      await apiPost<Transaction>("/transactions", body);
      await load();
      setTxnModalOpen(false);
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="w-full min-w-0 space-y-10">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold text-slate-900">Portfolio</h1>
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink to="/import">Import transactions</ButtonLink>
            <Button type="button" onClick={() => setTxnModalOpen(true)}>
              Add transaction
            </Button>
          </div>
        </div>
        {error ? <ErrorAlert>{error}</ErrorAlert> : null}
      </header>

      <Modal
        title="New transaction"
        open={txnModalOpen}
        onClose={() => setTxnModalOpen(false)}
      >
        <form onSubmit={(e) => void submitTransaction(e)} className="space-y-3">
          <label className="block text-sm">
            Broker
            <select
              ref={brokerSelectRef}
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
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Date and time
            <input
              type="datetime-local"
              className="mt-1 block w-full border rounded px-2 py-1"
              value={txnForm.tradeDate}
              onChange={(e) =>
                setTxnForm({ ...txnForm, tradeDate: e.target.value })
              }
            />
          </label>
          <label className="block text-sm">
            {isCashTxn ? "Cash account" : "Instrument"}
            <select
              className="mt-1 block w-full border rounded px-2 py-1"
              disabled={txnInstrumentsLoading || txnInstruments.length === 0}
              value={
                txnInstruments.some((i) => i.id === txnForm.instrumentId)
                  ? txnForm.instrumentId
                  : ""
              }
              onChange={(e) => {
                const id = Number.parseInt(e.target.value, 10);
                const inst = txnInstruments.find((i) => i.id === id);
                const isCash = inst?.kind === "cash_account";
                setTxnForm((f) => ({
                  ...f,
                  instrumentId: id,
                  quantity: isCash ? "" : "1",
                  unitPrice: isCash ? "1" : f.unitPrice,
                  currency: isCash
                    ? (inst?.cashCurrency?.trim().toUpperCase() ??
                      DEFAULT_CASH_CURRENCY)
                    : f.currency,
                  side: "buy",
                }));
              }}
            >
              {txnInstrumentsLoading ? (
                <option value="">Loading instruments…</option>
              ) : txnInstruments.length === 0 ? (
                <option value="">No instruments for this broker</option>
              ) : (
                txnInstruments.map((i) => (
                  <option key={i.id} value={i.id}>
                    {transactionInstrumentSelectLabel({
                      kind: i.kind,
                      displayName: i.displayName,
                      yahooSymbol: i.yahooSymbol,
                      seligsonFund: i.seligsonFund
                        ? { name: i.seligsonFund.name }
                        : null,
                    })}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="block text-sm">
            {isCashTxn ? "Deposit / withdrawal" : "Side"}
            <select
              className="mt-1 block w-full border rounded px-2 py-1"
              value={
                isCashTxn
                  ? txnForm.side === "buy"
                    ? "deposit"
                    : "withdrawal"
                  : txnForm.side
              }
              onChange={(e) => {
                const v = e.target.value;
                if (isCashTxn) {
                  setTxnForm({
                    ...txnForm,
                    side: v === "deposit" ? "buy" : "sell",
                  });
                } else {
                  setTxnForm({
                    ...txnForm,
                    side: v as "buy" | "sell",
                  });
                }
              }}
            >
              {isCashTxn ? (
                <>
                  <option value="deposit">deposit</option>
                  <option value="withdrawal">withdrawal</option>
                </>
              ) : (
                <>
                  <option value="buy">buy</option>
                  <option value="sell">sell</option>
                </>
              )}
            </select>
          </label>
          {isCashTxn ? (
            <>
              <label className="block text-sm">
                Sum
                <input
                  className="mt-1 block w-full border rounded px-2 py-1"
                  inputMode="decimal"
                  value={txnForm.quantity}
                  onChange={(e) =>
                    setTxnForm({ ...txnForm, quantity: e.target.value })
                  }
                />
              </label>
              <label className="block text-sm">
                Currency
                <select
                  className="mt-1 block w-full border rounded px-2 py-1"
                  value={txnForm.currency}
                  onChange={(e) =>
                    setTxnForm({ ...txnForm, currency: e.target.value })
                  }
                >
                  {SUPPORTED_CASH_CURRENCY_CODES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <>
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
            </>
          )}
          <Button
            type="submit"
            disabled={
              txnInstrumentsLoading ||
              txnInstruments.length === 0 ||
              txnForm.instrumentId < 1 ||
              (isCashTxn && !cashSumValid)
            }
          >
            Add transaction
          </Button>
        </form>
      </Modal>

      {initialLoad ? (
        <PortfolioViewSkeleton />
      ) : portfolio ? (
        <section className="space-y-4">
          <h2 className="text-xl font-medium text-slate-800">
            Distributions (value-weighted)
          </h2>
          <p className="text-slate-600 text-sm">
            Total estimated EUR:{" "}
            <span className="tabular-nums">
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
                  <YAxis tickFormatter={(v) => formatPercentWidth4From01(v)} />
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
                  <YAxis tickFormatter={(v) => formatPercentWidth4From01(v)} />
                  <Tooltip
                    formatter={(v: number) => formatPercentWidth4From01(v)}
                  />
                  <Legend />
                  <Bar dataKey="value" fill="#334155" name="Weight" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <h3 className="text-lg font-medium text-slate-800 mb-2">Holdings</h3>
          <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-sm text-sm">
            <table className="min-w-full">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="text-left p-2 font-medium">Instrument</th>
                  <th className="text-left p-2 font-medium">Ticker</th>
                  <th className="text-right p-2 font-medium">Qty</th>
                  <th className="text-right p-2 font-medium">Unit EUR</th>
                  <th className="text-right p-2 font-medium">Value EUR</th>
                  <th className="text-right p-2 font-medium">Weight</th>
                </tr>
              </thead>
              <tbody>
                {holdingsSortedByWeight.map((p) => {
                  const ticker = instrumentTickerCell(
                    p.instrumentId,
                    instrumentById,
                    instrumentTickerById,
                  );
                  return (
                    <tr
                      key={p.instrumentId}
                      className="border-t border-slate-100"
                    >
                      <td className="p-2 text-left min-w-[12rem] font-medium text-slate-900">
                        {p.displayName}
                      </td>
                      <td className="p-2 text-left tabular-nums text-slate-700">
                        {ticker}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {roundQuantityForDisplay(String(p.quantity))}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {p.unitPriceEur == null
                          ? "—"
                          : formatUnitPriceForDisplay(String(p.unitPriceEur))}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {p.valueEur.toFixed(2)}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {formatPercentWidth4From01(p.weight)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-xl font-medium text-slate-800 mb-2">
          Transactions
        </h2>
        {initialLoad ? (
          <TransactionsTableSkeleton />
        ) : (
          <>
            <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-sm text-sm">
              <table className="min-w-full">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="text-left p-2 font-medium">Date/time</th>
                    <th className="text-left p-2 font-medium">Side</th>
                    <th className="text-left p-2 font-medium">Instrument</th>
                    <th className="text-left p-2 font-medium">Ticker</th>
                    <th className="text-right p-2 font-medium">Qty</th>
                    <th className="text-right p-2 font-medium">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id} className="border-t border-slate-100">
                      <td className="p-2">
                        {formatInstantForDisplay(t.tradeDate)}
                      </td>
                      <td className="p-2">
                        {transactionSideLabel(
                          t.side,
                          instrumentById.get(t.instrumentId)?.kind,
                        )}
                      </td>
                      <td className="p-2 text-left min-w-[12rem] font-medium text-slate-900">
                        {instrumentNameById.get(t.instrumentId) ??
                          `#${t.instrumentId}`}
                      </td>
                      <td className="p-2 text-left tabular-nums text-slate-700">
                        {instrumentTickerCell(
                          t.instrumentId,
                          instrumentById,
                          instrumentTickerById,
                        )}
                      </td>
                      <td className="p-2 text-right">
                        {instrumentById.get(t.instrumentId)?.kind ===
                        "cash_account"
                          ? formatUnitPriceForDisplay(t.quantity)
                          : roundQuantityForDisplay(t.quantity)}
                      </td>
                      <td className="p-2 text-right">
                        {instrumentById.get(t.instrumentId)?.kind ===
                        "cash_account" ? (
                          "—"
                        ) : (
                          <>
                            {formatTransactionUnitPriceForDisplay(
                              t.side,
                              t.unitPrice,
                            )}{" "}
                            {t.currency}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-sm text-slate-600 tabular-nums">
              {transactions.length}{" "}
              {transactions.length === 1 ? "transaction" : "transactions"}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
