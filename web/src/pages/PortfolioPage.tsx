import { useCallback, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Button, ButtonLink } from "../components/Button";
import { ErrorAlert } from "../components/ErrorAlert";
import {
  writeStoredComparePortfolioId,
  writeStoredPortfolioId,
} from "../lib/portfolioSelection";
import { type PortfolioSection, isPortfolioSection, routes } from "../routes";
import { EditPortfolioModal } from "./home/EditPortfolioModal";
import { HoldingsTable } from "./home/HoldingsTable";
import {
  NewPortfolioModal,
  type NewPortfolioPrefill,
  buildBenchmarkWeightRowsFromCurrentPortfolio,
} from "./home/NewPortfolioModal";
import { NewTransactionModal } from "./home/NewTransactionModal";
import { PortfolioTabStrip } from "./home/PortfolioTabStrip";
import { TransactionsTable } from "./home/TransactionsTable";
import { buildInstrumentTickerById } from "./home/instrumentTickerCell";
import { PortfolioCharts } from "./home/portfolioCharts/PortfolioCharts";
import type {
  AssetMixHistoryPoint,
  HomeInstrument,
  HomeTransaction,
  PortfolioDistributions,
} from "./home/types";
import { useHomeData } from "./home/useHomeData";

type PortfolioTabPanelsProps = {
  activeTab: PortfolioSection;
  portfolio: PortfolioDistributions;
  comparePortfolio: PortfolioDistributions | null;
  showDistributionCompare: boolean;
  selectedPortfolioLabel: string;
  comparePortfolioLabel: string;
  assetMixHistoryPoints: AssetMixHistoryPoint[];
  selectedPortfolioId: number | null;
  portfolioHasSellTransactions: boolean;
  selectedIsStatic: boolean;
  selectedIsSynthetic: boolean;
  instrumentById: Map<number, HomeInstrument>;
  instrumentTickerById: Map<number, string | null>;
  instrumentNameById: Map<number, string>;
  brokerNameById: Map<number, string>;
  transactions: HomeTransaction[];
  load: () => void | Promise<void>;
  setError: (message: string | null) => void;
  onEditTransaction: (t: HomeTransaction) => void;
};

function PortfolioTabPanels({
  activeTab,
  portfolio,
  comparePortfolio,
  showDistributionCompare,
  selectedPortfolioLabel,
  comparePortfolioLabel,
  assetMixHistoryPoints,
  selectedPortfolioId,
  portfolioHasSellTransactions,
  selectedIsStatic,
  selectedIsSynthetic,
  instrumentById,
  instrumentTickerById,
  instrumentNameById,
  brokerNameById,
  transactions,
  load,
  setError,
  onEditTransaction,
}: PortfolioTabPanelsProps) {
  return (
    <div className="page-section">
      {activeTab === "distributions" ? (
        <div
          role="tabpanel"
          id="portfolio-panel-distributions"
          aria-labelledby="portfolio-tab-distributions"
          className="min-w-0"
        >
          <PortfolioCharts
            portfolio={portfolio}
            comparePortfolio={comparePortfolio}
            showDistributionCompare={showDistributionCompare}
            selectedPortfolioLabel={selectedPortfolioLabel}
            comparePortfolioLabel={comparePortfolioLabel}
            assetMixHistoryPoints={assetMixHistoryPoints}
            portfolioId={selectedPortfolioId}
            portfolioHasSellTransactions={portfolioHasSellTransactions}
            hideSectionTitle
          />
        </div>
      ) : null}
      {activeTab === "holdings" ? (
        <div
          role="tabpanel"
          id="portfolio-panel-holdings"
          aria-labelledby="portfolio-tab-holdings"
          className="min-w-0"
        >
          <HoldingsTable
            portfolio={portfolio}
            instrumentById={instrumentById}
            instrumentTickerById={instrumentTickerById}
            hideQtyAndUnitEur={selectedIsStatic}
            hideSectionTitle
          />
        </div>
      ) : null}
      {activeTab === "transactions" ? (
        <div
          role="tabpanel"
          id="portfolio-panel-transactions"
          aria-labelledby="portfolio-tab-transactions"
          className="min-w-0"
        >
          <TransactionsTable
            transactions={transactions}
            brokerNameById={brokerNameById}
            instrumentById={instrumentById}
            instrumentNameById={instrumentNameById}
            instrumentTickerById={instrumentTickerById}
            onEdit={onEditTransaction}
            onDeleted={load}
            onError={setError}
            readOnly={selectedIsSynthetic}
            hideSectionTitle
          />
        </div>
      ) : null}
    </div>
  );
}

export function PortfolioPage() {
  const { section } = useParams<{ section: string }>();

  const {
    brokers,
    transactions,
    instruments,
    assetMixHistoryPoints,
    portfolio,
    comparePortfolio,
    setComparePortfolio,
    portfolioEntities,
    setPortfolioEntities,
    selectedPortfolioId,
    setSelectedPortfolioId,
    comparePortfolioId,
    setComparePortfolioId,
    error,
    setError,
    load,
  } = useHomeData();

  const [newPortfolioOpen, setNewPortfolioOpen] = useState(false);
  const [newPortfolioPrefill, setNewPortfolioPrefill] =
    useState<NewPortfolioPrefill | null>(null);
  const [editPortfolioOpen, setEditPortfolioOpen] = useState(false);

  const closeNewPortfolioModal = useCallback(() => {
    setNewPortfolioOpen(false);
    setNewPortfolioPrefill(null);
  }, []);

  const portfolioHasSellTransactions = useMemo(
    () => transactions.some((t) => t.side === "sell"),
    [transactions],
  );

  const instrumentNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const i of instruments) {
      m.set(i.id, i.displayName);
    }
    return m;
  }, [instruments]);

  const instrumentById = useMemo(() => {
    const m = new Map<number, (typeof instruments)[number]>();
    for (const i of instruments) {
      m.set(i.id, i);
    }
    return m;
  }, [instruments]);

  const instrumentTickerById = useMemo(
    () => buildInstrumentTickerById(instruments),
    [instruments],
  );

  const brokerNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const b of brokers) {
      m.set(b.id, b.name);
    }
    return m;
  }, [brokers]);

  const portfolioEntitiesSortedAlphabetically = useMemo(
    () =>
      [...portfolioEntities].sort((a, b) => {
        const byName = a.name.localeCompare(b.name, undefined, {
          sensitivity: "base",
        });
        return byName !== 0 ? byName : a.id - b.id;
      }),
    [portfolioEntities],
  );

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

  const selectedPortfolioEntity = useMemo(() => {
    if (selectedPortfolioId == null) return null;
    return portfolioEntities.find((p) => p.id === selectedPortfolioId) ?? null;
  }, [selectedPortfolioId, portfolioEntities]);

  const buildCopyPortfolioPrefill =
    useCallback((): NewPortfolioPrefill | null => {
      if (portfolio == null || selectedPortfolioEntity == null) {
        return null;
      }
      const weightRows = buildBenchmarkWeightRowsFromCurrentPortfolio(
        portfolio,
        instruments,
      );
      const totalEur =
        Number.isFinite(portfolio.totalValueEur) && portfolio.totalValueEur > 0
          ? portfolio.totalValueEur
          : Number.isFinite(selectedPortfolioEntity.benchmarkTotalEur) &&
              selectedPortfolioEntity.benchmarkTotalEur > 0
            ? selectedPortfolioEntity.benchmarkTotalEur
            : null;
      if (weightRows.length === 0 || totalEur == null) {
        return null;
      }
      const sourceKind = selectedPortfolioEntity.kind ?? "live";
      const simulationStartDate =
        sourceKind === "backtest" &&
        selectedPortfolioEntity.simulationStartDate != null &&
        /^\d{4}-\d{2}-\d{2}$/.test(
          selectedPortfolioEntity.simulationStartDate.trim(),
        )
          ? selectedPortfolioEntity.simulationStartDate.trim()
          : undefined;
      return {
        name: `${selectedPortfolioEntity.name} (copy)`,
        emergencyFundEur: Number.isFinite(
          selectedPortfolioEntity.emergencyFundEur,
        )
          ? selectedPortfolioEntity.emergencyFundEur
          : 0,
        benchmarkTotalEur: totalEur,
        weightRows,
        targetKind: sourceKind === "backtest" ? "backtest" : "static",
        simulationStartDate,
      };
    }, [portfolio, selectedPortfolioEntity, instruments]);

  const copyPortfolioEnabled = useMemo(
    () => buildCopyPortfolioPrefill() != null,
    [buildCopyPortfolioPrefill],
  );

  const selectedIsSynthetic =
    selectedPortfolioEntity?.kind === "static" ||
    selectedPortfolioEntity?.kind === "backtest";
  const selectedIsStatic = selectedPortfolioEntity?.kind === "static";

  const [txnModalOpen, setTxnModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<HomeTransaction | null>(null);

  if (!isPortfolioSection(section)) {
    return <Navigate to={routes.portfolio.distributions} replace />;
  }

  const activeTab: PortfolioSection = section;

  return (
    <div className="w-full min-w-0 page-stack">
      <header className="page-header-stack page-header-sticky">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 min-w-0">
            <h1 className="shrink-0">Portfolio</h1>
            {portfolioEntities.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm text-slate-700 flex items-center gap-2">
                  <span className="whitespace-nowrap">View</span>
                  <select
                    className="border border-slate-300 rounded px-2 py-1 text-sm bg-white min-w-[10rem]"
                    value={selectedPortfolioId ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const id = v === "" ? null : Number.parseInt(v, 10);
                      const nextId =
                        id != null && Number.isFinite(id) ? id : null;
                      if (
                        nextId != null &&
                        comparePortfolioId != null &&
                        comparePortfolioId === nextId
                      ) {
                        const formerViewId = selectedPortfolioId;
                        setComparePortfolioId(formerViewId);
                        writeStoredComparePortfolioId(formerViewId);
                        setComparePortfolio(null);
                      }
                      setSelectedPortfolioId(nextId);
                    }}
                  >
                    {portfolioEntitiesSortedAlphabetically.map((pe) => (
                      <option key={pe.id} value={pe.id}>
                        {(pe.kind ?? "live") === "static"
                          ? `${pe.name} (static)`
                          : (pe.kind ?? "live") === "backtest"
                            ? `${pe.name} (backtest)`
                            : pe.name}
                      </option>
                    ))}
                  </select>
                </label>
                {portfolioEntities.length > 1 ? (
                  <label className="text-sm text-slate-700 flex items-center gap-2">
                    <span className="whitespace-nowrap">Compare</span>
                    <select
                      className="border border-slate-300 rounded px-2 py-1 text-sm bg-white min-w-[10rem]"
                      value={comparePortfolioId ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        const id = v === "" ? null : Number.parseInt(v, 10);
                        const next =
                          id != null && Number.isFinite(id) ? id : null;
                        setComparePortfolioId(next);
                        writeStoredComparePortfolioId(next);
                        setComparePortfolio(null);
                      }}
                    >
                      <option value="">None</option>
                      {portfolioEntitiesSortedAlphabetically
                        .filter((pe) => pe.id !== selectedPortfolioId)
                        .map((pe) => (
                          <option key={pe.id} value={pe.id}>
                            {(pe.kind ?? "live") === "static"
                              ? `${pe.name} (static)`
                              : (pe.kind ?? "live") === "backtest"
                                ? `${pe.name} (backtest)`
                                : pe.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => {
                setNewPortfolioPrefill(null);
                setNewPortfolioOpen(true);
              }}
            >
              New portfolio
            </Button>
            <Button
              type="button"
              disabled={!copyPortfolioEnabled}
              onClick={() => {
                const prefill = buildCopyPortfolioPrefill();
                if (prefill == null) {
                  return;
                }
                setNewPortfolioPrefill(prefill);
                setNewPortfolioOpen(true);
              }}
            >
              Copy portfolio
            </Button>
            <Button
              type="button"
              disabled={selectedPortfolioId == null}
              onClick={() => {
                if (selectedPortfolioEntity == null) {
                  return;
                }
                setEditPortfolioOpen(true);
              }}
            >
              Edit portfolio
            </Button>
            {selectedIsSynthetic ? null : (
              <>
                <ButtonLink to={routes.portfolio.import}>
                  Import transactions
                </ButtonLink>
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
              </>
            )}
          </div>
        </div>
        {error ? <ErrorAlert>{error}</ErrorAlert> : null}
        {portfolio && selectedPortfolioId != null ? (
          <PortfolioTabStrip activeTab={activeTab} />
        ) : null}
      </header>

      <NewPortfolioModal
        open={newPortfolioOpen}
        onClose={closeNewPortfolioModal}
        instruments={instruments}
        currentPortfolio={portfolio}
        prefill={newPortfolioPrefill}
        onCreated={(row) => {
          setPortfolioEntities((prev) =>
            [...prev, row].sort((a, b) => a.id - b.id),
          );
          setSelectedPortfolioId(row.id);
          writeStoredPortfolioId(row.id);
        }}
      />

      <EditPortfolioModal
        key={
          editPortfolioOpen ? `p-${selectedPortfolioId ?? "x"}` : "edit-closed"
        }
        open={editPortfolioOpen}
        onClose={() => setEditPortfolioOpen(false)}
        portfolio={selectedPortfolioEntity}
        instruments={instruments}
        onSaved={load}
        onDeleted={async () => {
          const deletedId = selectedPortfolioId;
          await load();
          if (deletedId == null) {
            return;
          }
          const nextList = portfolioEntities.filter((p) => p.id !== deletedId);
          const nextSelected = nextList[0]?.id ?? null;
          setSelectedPortfolioId(nextSelected);
          if (nextSelected != null) {
            writeStoredPortfolioId(nextSelected);
          }
          if (comparePortfolioId === deletedId) {
            setComparePortfolioId(null);
            writeStoredComparePortfolioId(null);
            setComparePortfolio(null);
          }
        }}
      />

      <NewTransactionModal
        key={txnModalOpen ? (editingTransaction?.id ?? "new") : "txn-closed"}
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

      {portfolio && selectedPortfolioId != null ? (
        <PortfolioTabPanels
          key={selectedPortfolioId}
          activeTab={activeTab}
          portfolio={portfolio}
          comparePortfolio={comparePortfolio}
          showDistributionCompare={showDistributionCompare}
          selectedPortfolioLabel={selectedPortfolioLabel}
          comparePortfolioLabel={comparePortfolioLabel}
          assetMixHistoryPoints={assetMixHistoryPoints}
          selectedPortfolioId={selectedPortfolioId}
          portfolioHasSellTransactions={portfolioHasSellTransactions}
          selectedIsStatic={selectedIsStatic}
          selectedIsSynthetic={selectedIsSynthetic}
          instrumentById={instrumentById}
          instrumentTickerById={instrumentTickerById}
          instrumentNameById={instrumentNameById}
          brokerNameById={brokerNameById}
          transactions={transactions}
          load={load}
          setError={setError}
          onEditTransaction={(t) => {
            setEditingTransaction(t);
            setTxnModalOpen(true);
          }}
        />
      ) : null}
    </div>
  );
}
