import {
  type DistributionPayload,
  instrumentTickerDisplay,
} from "@investments/db";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGet } from "../api";
import { Button, ButtonLink } from "../components/Button";
import { ErrorAlert } from "../components/ErrorAlert";
import {
  CashAccountDistributionSummary,
  DistributionSummary,
} from "../components/InstrumentDistributionSummary";
import {
  PortfolioViewSkeleton,
  TransactionsTableSkeleton,
} from "../components/PortfolioViewSkeleton";
import { formatInstantForDisplay } from "../lib/dateTimeFormat";
import {
  allCountriesChartData,
  formatPercentWidth4From01,
  portfolioRegionBarRows,
  portfolioSectorBarRows,
} from "../lib/distributionDisplay";
import {
  formatTransactionTotalValueForDisplay,
  formatTransactionUnitPriceForDisplay,
  formatUnitPriceForDisplay,
  roundQuantityForDisplay,
} from "../lib/numberFormat";
import { NewTransactionModal } from "./home/NewTransactionModal";

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
  cashGeoKey?: string | null;
  distribution: {
    fetchedAt: string;
    source: string;
    payload: DistributionPayload;
  } | null;
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
  countries: Record<string, number>;
  regions: Record<string, number>;
  sectors: Record<string, number>;
  totalValueEur: number;
  mixedCurrencyWarning: boolean;
  assetAllocation: {
    equitiesEur: number;
    bondsEur: number;
    cashExcessEur: number;
    emergencyFundSliceEur: number;
    emergencyFundTargetEur: number;
    cashTotalEur: number;
    cashBelowEmergencyTarget: boolean;
  };
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

const ASSET_MIX_COLORS = {
  equities: "#0f766e",
  bonds: "#6d28d9",
  cashExcess: "#0369a1",
  emergency: "#15803d",
} as const;

function EmergencyFundWarningIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      role="img"
    >
      <title>Warning</title>
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const HOLDING_DIST_TOOLTIP_OFFSET = 12;

function holdingDistributionTooltipBody(
  inst: Instrument | undefined,
  displayNameFallback: string,
): ReactNode {
  const name = inst?.displayName ?? displayNameFallback;
  const equityTicker =
    inst != null && (inst.kind === "etf" || inst.kind === "stock")
      ? instrumentTickerDisplay(inst)
      : null;
  const showEquityTicker =
    typeof equityTicker === "string" && equityTicker.trim().length > 0;

  const heading = (
    <div className="mb-2 border-b border-slate-200 pb-2 font-sans">
      <p className="font-semibold text-slate-900 text-sm leading-snug">
        {name}
      </p>
      {showEquityTicker ? (
        <p className="text-xs text-slate-600 tabular-nums mt-0.5">
          {equityTicker}
        </p>
      ) : null}
    </div>
  );

  if (inst == null) {
    return (
      <>
        {heading}
        <span className="text-slate-400 text-xs font-sans">
          No instrument data
        </span>
      </>
    );
  }
  if (inst.kind === "cash_account") {
    return (
      <>
        {heading}
        <div className="font-mono">
          <CashAccountDistributionSummary cashGeoKey={inst.cashGeoKey ?? ""} />
        </div>
      </>
    );
  }
  if (inst.distribution) {
    return (
      <>
        {heading}
        <div className="font-mono">
          <DistributionSummary payload={inst.distribution.payload} />
        </div>
      </>
    );
  }
  return (
    <>
      {heading}
      <span className="text-slate-400 text-xs font-sans">No cache yet</span>
    </>
  );
}

function instrumentTickerCell(
  instrumentId: number,
  instrumentById: Map<number, Instrument>,
  instrumentTickerById: Map<number, string | null>,
): string {
  const inst = instrumentById.get(instrumentId);
  if (inst?.seligsonFund != null) return "-";
  return instrumentTickerById.get(instrumentId) ?? "-";
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

  const assetMixPieData = useMemo(() => {
    if (!portfolio) return [];
    const aa = portfolio.assetAllocation;
    return [
      {
        name: "Equities",
        value: aa.equitiesEur,
        fill: ASSET_MIX_COLORS.equities,
      },
      { name: "Bonds", value: aa.bondsEur, fill: ASSET_MIX_COLORS.bonds },
      {
        name: "Cash (excess)",
        value: aa.cashExcessEur,
        fill: ASSET_MIX_COLORS.cashExcess,
      },
      {
        name: "Emergency fund",
        value: aa.emergencyFundSliceEur,
        fill: ASSET_MIX_COLORS.emergency,
      },
    ].filter((d) => d.value > 1e-9);
  }, [portfolio]);

  useEffect(() => {
    void load();
  }, [load]);

  const [txnModalOpen, setTxnModalOpen] = useState(false);

  const [holdingTooltip, setHoldingTooltip] = useState<null | {
    instrumentId: number;
    displayName: string;
    x: number;
    y: number;
  }>(null);
  const holdingTooltipActiveId = holdingTooltip?.instrumentId ?? null;

  useEffect(() => {
    if (holdingTooltipActiveId == null) return;
    const onMove = (e: MouseEvent) => {
      setHoldingTooltip((t) =>
        t != null ? { ...t, x: e.clientX, y: e.clientY } : null,
      );
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [holdingTooltipActiveId]);

  return (
    <div className="w-full min-w-0 space-y-6">
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

      <NewTransactionModal
        open={txnModalOpen}
        onClose={() => setTxnModalOpen(false)}
        brokers={brokers}
        onTransactionAdded={load}
        onError={setError}
      />

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
          {portfolio.totalValueEur > 0 && assetMixPieData.length > 0 ? (
            <div className="max-w-md">
              <h3 className="text-sm font-medium text-slate-700 mb-1">
                Asset mix
              </h3>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={assetMixPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={68}
                      paddingAngle={1}
                    >
                      {assetMixPieData.map((d) => (
                        <Cell key={d.name} fill={d.fill} stroke="#fff" />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) =>
                        `${v.toFixed(2)} EUR (${(
                          (v / portfolio.totalValueEur) * 100
                        ).toFixed(1)}%)`
                      }
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={52}
                      wrapperStyle={{ fontSize: "12px" }}
                      formatter={(value) => {
                        if (
                          value === "Emergency fund" &&
                          portfolio.assetAllocation.cashBelowEmergencyTarget
                        ) {
                          return (
                            <span
                              className="inline-flex items-center gap-1 text-slate-700"
                              title="Cash is below emergency fund target"
                            >
                              {value}
                              <EmergencyFundWarningIcon className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            </span>
                          );
                        }
                        return value;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="h-64">
              <h3 className="text-sm font-medium text-slate-700 mb-2">
                Regions
              </h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={portfolioRegionBarRows(portfolio.regions)}>
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
                <BarChart data={portfolioSectorBarRows(portfolio.sectors)}>
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
                  <Bar dataKey="value" fill="#334155" name="Weight" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="h-64">
            <h3 className="text-sm font-medium text-slate-700 mb-2">
              Countries
            </h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={allCountriesChartData(portfolio.countries)}>
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
                <Bar dataKey="value" fill="#0369a1" name="Weight" />
              </BarChart>
            </ResponsiveContainer>
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
                      onMouseEnter={(e) => {
                        setHoldingTooltip({
                          instrumentId: p.instrumentId,
                          displayName: p.displayName,
                          x: e.clientX,
                          y: e.clientY,
                        });
                      }}
                      onMouseLeave={() => {
                        setHoldingTooltip((t) =>
                          t?.instrumentId === p.instrumentId ? null : t,
                        );
                      }}
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
          {holdingTooltip != null
            ? createPortal(
                <div
                  role="tooltip"
                  style={{
                    position: "fixed",
                    left: holdingTooltip.x + HOLDING_DIST_TOOLTIP_OFFSET,
                    top: holdingTooltip.y + HOLDING_DIST_TOOLTIP_OFFSET,
                    zIndex: 50,
                    pointerEvents: "none",
                  }}
                  className="max-w-md max-h-[min(70vh,28rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-lg text-left"
                >
                  {holdingDistributionTooltipBody(
                    instrumentById.get(holdingTooltip.instrumentId),
                    holdingTooltip.displayName,
                  )}
                </div>,
                document.body,
              )
            : null}
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
                    <th className="text-right p-2 font-medium">Value</th>
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
                      <td className="p-2 text-right tabular-nums">
                        {formatTransactionTotalValueForDisplay(
                          t.side,
                          t.quantity,
                          t.unitPrice,
                          t.currency,
                          instrumentById.get(t.instrumentId)?.kind,
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
