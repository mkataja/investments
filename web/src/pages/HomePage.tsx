import {
  type DistributionPayload,
  instrumentTickerDisplay,
} from "@investments/db";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { apiDelete, apiGet, apiPatch, apiPost } from "../api";
import { Button, ButtonLink } from "../components/Button";
import { ErrorAlert } from "../components/ErrorAlert";
import {
  HoldingDistributionTooltipLayer,
  type HoldingDistributionTooltipState,
} from "../components/HoldingDistributionTooltip";
import { Modal } from "../components/Modal";
import {
  DistributionBarChartTooltip,
  assetMixPieTooltipFormatter,
} from "../components/PortfolioChartTooltips";
import {
  PortfolioViewSkeleton,
  TransactionsTableSkeleton,
} from "../components/PortfolioViewSkeleton";
import { formatInstantForDisplay } from "../lib/dateTimeFormat";
import {
  allCountriesChartData,
  allCountriesChartDataDual,
  formatPercentWidth4From01,
  portfolioRegionBarRows,
  portfolioRegionBarRowsDual,
  portfolioSectorBarRows,
  portfolioSectorBarRowsDual,
} from "../lib/distributionDisplay";
import {
  formatTransactionTotalValueForDisplay,
  formatTransactionUnitPriceForDisplay,
  formatUnitPriceForDisplay,
  roundQuantityForDisplay,
} from "../lib/numberFormat";
import {
  readStoredComparePortfolioId,
  readStoredPortfolioId,
  writeStoredComparePortfolioId,
  writeStoredPortfolioId,
} from "../lib/portfolioSelection";
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
  portfolioId: number;
  brokerId: number;
  tradeDate: string;
  side: string;
  instrumentId: number;
  quantity: string;
  unitPrice: string;
  currency: string;
  unitPriceEur?: string | null;
};

type PortfolioEntity = {
  id: number;
  userId: number;
  name: string;
  emergencyFundEur: number;
  createdAt: string;
  updatedAt: string;
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
} as const;

const DIST_CHART_COLORS = {
  regionPrimary: "#0369a1",
  regionCompare: "#38bdf8",
  sectorPrimary: "#0369a1",
  sectorCompare: "#38bdf8",
  countryPrimary: "#0369a1",
  countryCompare: "#38bdf8",
} as const;

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
  const [comparePortfolio, setComparePortfolio] = useState<Portfolio | null>(
    null,
  );
  const [portfolioEntities, setPortfolioEntities] = useState<PortfolioEntity[]>(
    [],
  );
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(
    null,
  );
  const [comparePortfolioId, setComparePortfolioId] = useState<number | null>(
    () => readStoredComparePortfolioId(),
  );
  const [error, setError] = useState<string | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [newPortfolioOpen, setNewPortfolioOpen] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [newPortfolioEmergencyFund, setNewPortfolioEmergencyFund] =
    useState("0");
  const [newPortfolioBusy, setNewPortfolioBusy] = useState(false);
  const [editPortfolioOpen, setEditPortfolioOpen] = useState(false);
  const [editPortfolioName, setEditPortfolioName] = useState("");
  const [editPortfolioEmergencyFund, setEditPortfolioEmergencyFund] =
    useState("0");
  const [editPortfolioBusy, setEditPortfolioBusy] = useState(false);
  const newPortfolioNameInputRef = useRef<HTMLInputElement>(null);
  const editPortfolioNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!newPortfolioOpen) return;
    const id = requestAnimationFrame(() => {
      newPortfolioNameInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [newPortfolioOpen]);

  useEffect(() => {
    if (!editPortfolioOpen) return;
    const id = requestAnimationFrame(() => {
      editPortfolioNameInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [editPortfolioOpen]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const plist = await apiGet<PortfolioEntity[]>("/portfolios");
      setPortfolioEntities(plist);
      const stored = readStoredPortfolioId();
      let pid = selectedPortfolioId;
      if (pid == null || !plist.some((x) => x.id === pid)) {
        pid = plist.find((x) => x.id === stored)?.id ?? plist[0]?.id ?? null;
      }
      if (pid !== selectedPortfolioId) {
        setSelectedPortfolioId(pid);
        return;
      }
      let cmpId = comparePortfolioId;
      if (pid == null) {
        cmpId = null;
        if (comparePortfolioId != null) {
          writeStoredComparePortfolioId(null);
        }
      } else if (
        cmpId != null &&
        (cmpId === pid || !plist.some((x) => x.id === cmpId))
      ) {
        cmpId = null;
        writeStoredComparePortfolioId(null);
      }
      if (cmpId !== comparePortfolioId) {
        setComparePortfolioId(cmpId);
        return;
      }
      if (pid == null) {
        setBrokers([]);
        setTransactions([]);
        setInstruments([]);
        setPortfolio(null);
        setComparePortfolio(null);
        return;
      }
      writeStoredPortfolioId(pid);
      const [b, t, inst, p, pCmp] = await Promise.all([
        apiGet<Broker[]>("/brokers"),
        apiGet<Transaction[]>(`/transactions?portfolioId=${pid}`),
        apiGet<Instrument[]>("/instruments"),
        apiGet<Portfolio>(`/portfolio/distributions?portfolioId=${pid}`),
        cmpId != null
          ? apiGet<Portfolio>(`/portfolio/distributions?portfolioId=${cmpId}`)
          : Promise.resolve(null),
      ]);
      setBrokers(b);
      setTransactions(t);
      setInstruments(inst);
      setPortfolio(p);
      setComparePortfolio(pCmp);
    } catch (e) {
      setError(String(e));
    } finally {
      setInitialLoad(false);
    }
  }, [selectedPortfolioId, comparePortfolioId]);

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

  const showDistributionCompare =
    comparePortfolioId != null && comparePortfolioId !== selectedPortfolioId;

  const selectedPortfolioLabel = useMemo(() => {
    if (selectedPortfolioId == null) {
      return "Portfolio";
    }
    return (
      portfolioEntities.find((p) => p.id === selectedPortfolioId)?.name ??
      "Portfolio"
    );
  }, [selectedPortfolioId, portfolioEntities]);

  const comparePortfolioLabel = useMemo(() => {
    if (comparePortfolioId == null) {
      return "Compare";
    }
    return (
      portfolioEntities.find((p) => p.id === comparePortfolioId)?.name ??
      "Compare"
    );
  }, [comparePortfolioId, portfolioEntities]);

  const regionBarChartData = useMemo(() => {
    if (!portfolio) {
      return [];
    }
    if (!showDistributionCompare) {
      return portfolioRegionBarRows(portfolio.regions);
    }
    return portfolioRegionBarRowsDual(
      portfolio.regions,
      comparePortfolio?.regions ?? {},
    );
  }, [portfolio, comparePortfolio, showDistributionCompare]);

  const sectorBarChartData = useMemo(() => {
    if (!portfolio) {
      return [];
    }
    if (!showDistributionCompare) {
      return portfolioSectorBarRows(portfolio.sectors);
    }
    return portfolioSectorBarRowsDual(
      portfolio.sectors,
      comparePortfolio?.sectors ?? {},
    );
  }, [portfolio, comparePortfolio, showDistributionCompare]);

  const countryBarChartData = useMemo(() => {
    if (!portfolio) {
      return [];
    }
    if (!showDistributionCompare) {
      return allCountriesChartData(portfolio.countries);
    }
    return allCountriesChartDataDual(
      portfolio.countries,
      comparePortfolio?.countries ?? {},
    );
  }, [portfolio, comparePortfolio, showDistributionCompare]);

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
    ].filter((d) => d.value > 1e-9);
  }, [portfolio]);

  const assetMixPieTotalEur = useMemo(
    () => assetMixPieData.reduce((s, d) => s + d.value, 0),
    [assetMixPieData],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const [txnModalOpen, setTxnModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);

  async function submitNewPortfolio(e: FormEvent) {
    e.preventDefault();
    const name = newPortfolioName.trim();
    if (name.length === 0) {
      return;
    }
    const efParsed = Number.parseFloat(
      newPortfolioEmergencyFund.trim().replace(",", "."),
    );
    if (!Number.isFinite(efParsed) || efParsed < 0) {
      setError("Emergency fund must be a non-negative number.");
      return;
    }
    setNewPortfolioBusy(true);
    setError(null);
    try {
      const row = await apiPost<PortfolioEntity>("/portfolios", {
        name,
        emergencyFundEur: efParsed,
      });
      setPortfolioEntities((prev) =>
        [...prev, row].sort((a, b) => a.id - b.id),
      );
      setSelectedPortfolioId(row.id);
      writeStoredPortfolioId(row.id);
      setNewPortfolioOpen(false);
      setNewPortfolioName("");
      setNewPortfolioEmergencyFund("0");
    } catch (err) {
      setError(String(err));
    } finally {
      setNewPortfolioBusy(false);
    }
  }

  async function submitEditPortfolio(e: FormEvent) {
    e.preventDefault();
    if (selectedPortfolioId == null) {
      return;
    }
    const name = editPortfolioName.trim();
    if (name.length === 0) {
      return;
    }
    const efParsed = Number.parseFloat(
      editPortfolioEmergencyFund.trim().replace(",", "."),
    );
    if (!Number.isFinite(efParsed) || efParsed < 0) {
      setError("Emergency fund must be a non-negative number.");
      return;
    }
    setEditPortfolioBusy(true);
    setError(null);
    try {
      const row = await apiPatch<PortfolioEntity>(
        `/portfolios/${selectedPortfolioId}`,
        { name, emergencyFundEur: efParsed },
      );
      setPortfolioEntities((prev) =>
        prev.map((p) => (p.id === row.id ? row : p)),
      );
      setEditPortfolioOpen(false);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setEditPortfolioBusy(false);
    }
  }

  function openNewPortfolioModal() {
    setNewPortfolioName("");
    setNewPortfolioEmergencyFund("0");
    setNewPortfolioOpen(true);
  }

  const [holdingTooltip, setHoldingTooltip] =
    useState<HoldingDistributionTooltipState | null>(null);

  return (
    <div className="w-full min-w-0 space-y-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold text-slate-900">Portfolio</h1>
          <div className="flex flex-wrap items-center gap-2">
            {portfolioEntities.length > 0 ? (
              <label className="text-sm text-slate-700 flex items-center gap-2">
                <span className="whitespace-nowrap">View</span>
                <select
                  className="border border-slate-300 rounded px-2 py-1 text-sm bg-white min-w-[10rem]"
                  value={selectedPortfolioId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    const id = v === "" ? null : Number.parseInt(v, 10);
                    setSelectedPortfolioId(
                      id != null && Number.isFinite(id) ? id : null,
                    );
                  }}
                >
                  {portfolioEntities.map((pe) => (
                    <option key={pe.id} value={pe.id}>
                      {pe.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {portfolioEntities.length > 1 ? (
              <label className="text-sm text-slate-700 flex items-center gap-2">
                <span className="whitespace-nowrap">Compare</span>
                <select
                  className="border border-slate-300 rounded px-2 py-1 text-sm bg-white min-w-[10rem]"
                  value={comparePortfolioId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    const id = v === "" ? null : Number.parseInt(v, 10);
                    const next = id != null && Number.isFinite(id) ? id : null;
                    setComparePortfolioId(next);
                    writeStoredComparePortfolioId(next);
                    setComparePortfolio(null);
                  }}
                >
                  <option value="">None</option>
                  {portfolioEntities
                    .filter((pe) => pe.id !== selectedPortfolioId)
                    .map((pe) => (
                      <option key={pe.id} value={pe.id}>
                        {pe.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            <Button type="button" onClick={openNewPortfolioModal}>
              New portfolio
            </Button>
            <Button
              type="button"
              disabled={selectedPortfolioId == null}
              onClick={() => {
                const pe = portfolioEntities.find(
                  (p) => p.id === selectedPortfolioId,
                );
                if (pe == null) {
                  return;
                }
                setEditPortfolioName(pe.name);
                setEditPortfolioEmergencyFund(
                  Number.isFinite(pe.emergencyFundEur)
                    ? String(pe.emergencyFundEur)
                    : "0",
                );
                setEditPortfolioOpen(true);
              }}
            >
              Edit portfolio
            </Button>
            <ButtonLink to="/import">Import transactions</ButtonLink>
            <Button
              type="button"
              disabled={selectedPortfolioId == null}
              onClick={() => {
                setEditingTransaction(null);
                setTxnModalOpen(true);
              }}
            >
              Add transaction
            </Button>
          </div>
        </div>
        {error ? <ErrorAlert>{error}</ErrorAlert> : null}
      </header>

      <Modal
        title="New portfolio"
        open={newPortfolioOpen}
        onClose={() => setNewPortfolioOpen(false)}
      >
        <form
          onSubmit={(e) => void submitNewPortfolio(e)}
          className="space-y-3"
        >
          <label className="block text-sm">
            Name
            <input
              ref={newPortfolioNameInputRef}
              className="mt-1 block w-full border border-slate-300 rounded px-2 py-1"
              value={newPortfolioName}
              onChange={(e) => setNewPortfolioName(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            Emergency fund (EUR)
            <input
              className="mt-1 block w-full border border-slate-300 rounded px-2 py-1 tabular-nums"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={newPortfolioEmergencyFund}
              onChange={(e) => setNewPortfolioEmergencyFund(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={newPortfolioBusy}>
            Create
          </Button>
        </form>
      </Modal>

      <Modal
        title="Edit portfolio"
        open={editPortfolioOpen}
        onClose={() => setEditPortfolioOpen(false)}
      >
        <form
          onSubmit={(e) => void submitEditPortfolio(e)}
          className="space-y-3"
        >
          <label className="block text-sm">
            Name
            <input
              ref={editPortfolioNameInputRef}
              className="mt-1 block w-full border border-slate-300 rounded px-2 py-1"
              value={editPortfolioName}
              onChange={(e) => setEditPortfolioName(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            Emergency fund (EUR)
            <input
              className="mt-1 block w-full border border-slate-300 rounded px-2 py-1 tabular-nums"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={editPortfolioEmergencyFund}
              onChange={(e) => setEditPortfolioEmergencyFund(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={editPortfolioBusy}>
            Save
          </Button>
        </form>
      </Modal>

      <NewTransactionModal
        key={txnModalOpen ? (editingTransaction?.id ?? "new") : "closed"}
        open={txnModalOpen}
        onClose={() => {
          setTxnModalOpen(false);
          setEditingTransaction(null);
        }}
        brokers={brokers}
        portfolioId={selectedPortfolioId ?? 0}
        editTransaction={editingTransaction}
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
            Total estimated:{" "}
            <span className="tabular-nums">
              {portfolio.totalValueEur.toFixed(2)}
            </span>{" "}
            EUR (incl.{" "}
            <span className="tabular-nums">
              {portfolio.assetAllocation.emergencyFundSliceEur.toFixed(2)}
            </span>{" "}
            EUR emergency fund)
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
                      formatter={assetMixPieTooltipFormatter(
                        assetMixPieTotalEur,
                      )}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={52}
                      wrapperStyle={{ fontSize: "12px" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="h-[32rem]">
              <h3 className="text-sm font-medium text-slate-700 mb-2">
                Regions
              </h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={regionBarChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    angle={-35}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis tickFormatter={(v) => formatPercentWidth4From01(v)} />
                  <DistributionBarChartTooltip />
                  {showDistributionCompare ? (
                    <>
                      <Bar
                        dataKey="primary"
                        fill={DIST_CHART_COLORS.regionPrimary}
                        name={selectedPortfolioLabel}
                      />
                      <Bar
                        dataKey="compare"
                        fill={DIST_CHART_COLORS.regionCompare}
                        name={comparePortfolioLabel}
                      />
                      <Legend
                        verticalAlign="top"
                        height={28}
                        wrapperStyle={{ fontSize: "12px" }}
                      />
                    </>
                  ) : (
                    <Bar
                      dataKey="value"
                      fill={DIST_CHART_COLORS.regionPrimary}
                      name="Weight"
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="h-[32rem]">
              <h3 className="text-sm font-medium text-slate-700 mb-2">
                Sectors
              </h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectorBarChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    angle={-35}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis tickFormatter={(v) => formatPercentWidth4From01(v)} />
                  <DistributionBarChartTooltip />
                  {showDistributionCompare ? (
                    <>
                      <Bar
                        dataKey="primary"
                        fill={DIST_CHART_COLORS.sectorPrimary}
                        name={selectedPortfolioLabel}
                      />
                      <Bar
                        dataKey="compare"
                        fill={DIST_CHART_COLORS.sectorCompare}
                        name={comparePortfolioLabel}
                      />
                      <Legend
                        verticalAlign="top"
                        height={28}
                        wrapperStyle={{ fontSize: "12px" }}
                      />
                    </>
                  ) : (
                    <Bar
                      dataKey="value"
                      fill={DIST_CHART_COLORS.sectorPrimary}
                      name="Weight"
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="h-[48rem]">
            <h3 className="text-sm font-medium text-slate-700 mb-2">
              Countries
            </h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={countryBarChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-35}
                  textAnchor="end"
                  height={80}
                />
                <YAxis tickFormatter={(v) => formatPercentWidth4From01(v)} />
                <DistributionBarChartTooltip />
                {showDistributionCompare ? (
                  <>
                    <Bar
                      dataKey="primary"
                      fill={DIST_CHART_COLORS.countryPrimary}
                      name={selectedPortfolioLabel}
                    />
                    <Bar
                      dataKey="compare"
                      fill={DIST_CHART_COLORS.countryCompare}
                      name={comparePortfolioLabel}
                    />
                    <Legend
                      verticalAlign="top"
                      height={28}
                      wrapperStyle={{ fontSize: "12px" }}
                    />
                  </>
                ) : (
                  <Bar
                    dataKey="value"
                    fill={DIST_CHART_COLORS.countryPrimary}
                    name="Weight"
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <h2 className="text-xl font-medium text-slate-800 mb-2">Holdings</h2>
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
                          ? "-"
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
          <HoldingDistributionTooltipLayer
            tooltip={holdingTooltip}
            setTooltip={setHoldingTooltip}
            resolveInstrument={(id) => instrumentById.get(id)}
          />
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
                    <th className="text-left p-2 font-medium w-40">Actions</th>
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
                          "-"
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
                      <td className="p-2 space-x-3 whitespace-nowrap">
                        <button
                          type="button"
                          className="text-emerald-800 underline text-sm"
                          onClick={() => {
                            setEditingTransaction(t);
                            setTxnModalOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-red-700 underline text-sm"
                          onClick={() => {
                            if (
                              !window.confirm(
                                "Delete this transaction? This cannot be undone.",
                              )
                            ) {
                              return;
                            }
                            setError(null);
                            void (async () => {
                              try {
                                await apiDelete(`/transactions/${t.id}`);
                                await load();
                              } catch (err) {
                                setError(String(err));
                              }
                            })();
                          }}
                        >
                          Delete
                        </button>
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
