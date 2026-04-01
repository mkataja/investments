import { useMemo, useState } from "react";
import { Button, ButtonLink } from "../components/Button";
import { ErrorAlert } from "../components/ErrorAlert";
import {
  writeStoredComparePortfolioId,
  writeStoredPortfolioId,
} from "../lib/portfolioSelection";
import { EditPortfolioModal } from "./home/EditPortfolioModal";
import { HoldingsTable } from "./home/HoldingsTable";
import { NewPortfolioModal } from "./home/NewPortfolioModal";
import { NewTransactionModal } from "./home/NewTransactionModal";
import { TransactionsTable } from "./home/TransactionsTable";
import { buildInstrumentTickerById } from "./home/instrumentTickerCell";
import { PortfolioCharts } from "./home/portfolioCharts";
import type { HomeTransaction } from "./home/types";
import { useHomeData } from "./home/useHomeData";

export function HomePage() {
  const {
    brokers,
    transactions,
    instruments,
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
  const [editPortfolioOpen, setEditPortfolioOpen] = useState(false);

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

  const selectedIsBenchmark = selectedPortfolioEntity?.kind === "benchmark";

  const [txnModalOpen, setTxnModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<HomeTransaction | null>(null);

  return (
    <div className="w-full min-w-0 page-stack">
      <header className="page-header-stack page-header-sticky">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 min-w-0">
            <h1 className="shrink-0">Portfolio</h1>
            {portfolioEntities.length > 0 ? (
              <div className="flex flex-wrap items-baseline gap-2">
                <label className="text-sm text-slate-700 flex items-baseline gap-2">
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
                    {portfolioEntities.map((pe) => (
                      <option key={pe.id} value={pe.id}>
                        {(pe.kind ?? "live") === "benchmark"
                          ? `${pe.name} (benchmark)`
                          : pe.name}
                      </option>
                    ))}
                  </select>
                </label>
                {portfolioEntities.length > 1 ? (
                  <label className="text-sm text-slate-700 flex items-baseline gap-2">
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
                      {portfolioEntities
                        .filter((pe) => pe.id !== selectedPortfolioId)
                        .map((pe) => (
                          <option key={pe.id} value={pe.id}>
                            {(pe.kind ?? "live") === "benchmark"
                              ? `${pe.name} (benchmark)`
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
            <Button type="button" onClick={() => setNewPortfolioOpen(true)}>
              New portfolio
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
            {selectedIsBenchmark ? null : (
              <>
                <ButtonLink to="/portfolio/import">
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
      </header>

      <NewPortfolioModal
        open={newPortfolioOpen}
        onClose={() => setNewPortfolioOpen(false)}
        onError={setError}
        onCreated={async (row) => {
          setPortfolioEntities((prev) =>
            [...prev, row].sort((a, b) => a.id - b.id),
          );
          setSelectedPortfolioId(row.id);
          writeStoredPortfolioId(row.id);
          if ((row.kind ?? "live") === "benchmark") {
            setEditPortfolioOpen(true);
          }
        }}
      />

      <EditPortfolioModal
        key={editPortfolioOpen ? `p-${selectedPortfolioId ?? "x"}` : "closed"}
        open={editPortfolioOpen}
        onClose={() => setEditPortfolioOpen(false)}
        portfolio={selectedPortfolioEntity}
        instruments={instruments}
        onSaved={load}
        onError={setError}
      />

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

      {portfolio ? (
        <div className="page-section">
          <PortfolioCharts
            portfolio={portfolio}
            comparePortfolio={comparePortfolio}
            showDistributionCompare={showDistributionCompare}
            selectedPortfolioLabel={selectedPortfolioLabel}
            comparePortfolioLabel={comparePortfolioLabel}
          />
          <HoldingsTable
            portfolio={portfolio}
            instrumentById={instrumentById}
            instrumentTickerById={instrumentTickerById}
            hideQtyAndUnitEur={selectedIsBenchmark}
          />
        </div>
      ) : null}

      {selectedIsBenchmark ? null : (
        <TransactionsTable
          transactions={transactions}
          brokerNameById={brokerNameById}
          instrumentById={instrumentById}
          instrumentNameById={instrumentNameById}
          instrumentTickerById={instrumentTickerById}
          onEdit={(t) => {
            setEditingTransaction(t);
            setTxnModalOpen(true);
          }}
          onDeleted={load}
          onError={setError}
        />
      )}
    </div>
  );
}
