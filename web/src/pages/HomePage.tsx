import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiGet, apiPost } from "../api";
import { Button, ButtonLink } from "../components/Button";
import { ErrorAlert } from "../components/ErrorAlert";
import { Modal } from "../components/Modal";
import { parseDecimalInputLoose } from "../lib/decimalInput";
import {
  readStoredComparePortfolioId,
  readStoredPortfolioId,
  writeStoredComparePortfolioId,
  writeStoredPortfolioId,
} from "../lib/portfolioSelection";
import {
  EditPortfolioModal,
  PORTFOLIO_EMERGENCY_FUND_NOTE,
} from "./home/EditPortfolioModal";
import { HoldingsTable } from "./home/HoldingsTable";
import { NewTransactionModal } from "./home/NewTransactionModal";
import { PortfolioCharts } from "./home/PortfolioCharts";
import { TransactionsTable } from "./home/TransactionsTable";
import { buildInstrumentTickerById } from "./home/instrumentTickerCell";
import type {
  HomeInstrument,
  HomeTransaction,
  PortfolioDistributions,
  PortfolioEntity,
} from "./home/types";

type Broker = {
  id: number;
  name: string;
  brokerType: string;
};

export function HomePage() {
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [transactions, setTransactions] = useState<HomeTransaction[]>([]);
  const [instruments, setInstruments] = useState<HomeInstrument[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioDistributions | null>(
    null,
  );
  const [comparePortfolio, setComparePortfolio] =
    useState<PortfolioDistributions | null>(null);
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
  const [newPortfolioOpen, setNewPortfolioOpen] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [newPortfolioEmergencyFund, setNewPortfolioEmergencyFund] =
    useState("0");
  const [newPortfolioKind, setNewPortfolioKind] = useState<
    "live" | "benchmark"
  >("live");
  const [newPortfolioBenchmarkTotal, setNewPortfolioBenchmarkTotal] =
    useState("10000");
  const [newPortfolioBusy, setNewPortfolioBusy] = useState(false);
  const [editPortfolioOpen, setEditPortfolioOpen] = useState(false);
  const newPortfolioNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!newPortfolioOpen) return;
    const id = requestAnimationFrame(() => {
      newPortfolioNameInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [newPortfolioOpen]);

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
        apiGet<HomeTransaction[]>(`/transactions?portfolioId=${pid}`),
        apiGet<HomeInstrument[]>("/instruments"),
        apiGet<PortfolioDistributions>(
          `/portfolio/distributions?portfolioId=${pid}`,
        ),
        cmpId != null
          ? apiGet<PortfolioDistributions>(
              `/portfolio/distributions?portfolioId=${cmpId}`,
            )
          : Promise.resolve(null),
      ]);
      setBrokers(b);
      setTransactions(t);
      setInstruments(inst);
      setPortfolio(p);
      setComparePortfolio(pCmp);
    } catch (e) {
      setError(String(e));
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
    const m = new Map<number, HomeInstrument>();
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

  useEffect(() => {
    void load();
  }, [load]);

  const [txnModalOpen, setTxnModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<HomeTransaction | null>(null);

  async function submitNewPortfolio(e: FormEvent) {
    e.preventDefault();
    const name = newPortfolioName.trim();
    if (name.length === 0) {
      return;
    }
    const efParsed =
      newPortfolioKind === "benchmark"
        ? 0
        : Number.parseFloat(newPortfolioEmergencyFund.trim().replace(",", "."));
    if (!Number.isFinite(efParsed) || efParsed < 0) {
      setError("Emergency fund must be a non-negative number.");
      return;
    }
    let benchmarkTotalEur: number | undefined;
    if (newPortfolioKind === "benchmark") {
      const bt = Number.parseFloat(
        newPortfolioBenchmarkTotal.trim().replace(",", "."),
      );
      if (!Number.isFinite(bt) || bt <= 0) {
        setError("Total amount must be a positive number.");
        return;
      }
      benchmarkTotalEur = bt;
    }
    setNewPortfolioBusy(true);
    setError(null);
    try {
      const row = await apiPost<PortfolioEntity>("/portfolios", {
        name,
        kind: newPortfolioKind,
        emergencyFundEur: efParsed,
        ...(benchmarkTotalEur != null ? { benchmarkTotalEur } : {}),
      });
      setPortfolioEntities((prev) =>
        [...prev, row].sort((a, b) => a.id - b.id),
      );
      setSelectedPortfolioId(row.id);
      writeStoredPortfolioId(row.id);
      setNewPortfolioOpen(false);
      setNewPortfolioName("");
      setNewPortfolioEmergencyFund("0");
      setNewPortfolioKind("live");
      setNewPortfolioBenchmarkTotal("10000");
      if ((row.kind ?? "live") === "benchmark") {
        setEditPortfolioOpen(true);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setNewPortfolioBusy(false);
    }
  }

  function openNewPortfolioModal() {
    setNewPortfolioName("");
    setNewPortfolioEmergencyFund("0");
    setNewPortfolioKind("live");
    setNewPortfolioBenchmarkTotal("10000");
    setNewPortfolioOpen(true);
  }

  const newPortfolioDirty =
    newPortfolioName.trim() !== "" ||
    parseDecimalInputLoose(newPortfolioEmergencyFund) !== 0 ||
    newPortfolioKind !== "live";

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
                      setSelectedPortfolioId(
                        id != null && Number.isFinite(id) ? id : null,
                      );
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
            <Button type="button" onClick={openNewPortfolioModal}>
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

      <Modal
        title="New portfolio"
        open={newPortfolioOpen}
        onClose={() => setNewPortfolioOpen(false)}
        confirmBeforeClose={newPortfolioDirty}
      >
        <form
          onSubmit={(e) => void submitNewPortfolio(e)}
          className="flex flex-col gap-5"
        >
          <div className="flex flex-col gap-2">
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
          </div>
          <hr className="border-slate-200 w-full" />
          <div className="flex flex-col gap-2">
            <label className="block text-sm">
              Type
              <select
                className="mt-1 block w-full border border-slate-300 rounded px-2 py-1 text-sm bg-white"
                value={newPortfolioKind}
                onChange={(e) => {
                  const v = e.target.value;
                  setNewPortfolioKind(v === "benchmark" ? "benchmark" : "live");
                }}
              >
                <option value="live">Live (transactions)</option>
                <option value="benchmark">Benchmark (target weights)</option>
              </select>
            </label>
          </div>
          {newPortfolioKind === "benchmark" ? (
            <>
              <hr className="border-slate-200 w-full" />
              <label className="block text-sm max-w-xs">
                Synthetic portfolio value total value (EUR)
                <input
                  className="mt-1 block w-full border border-slate-300 rounded px-2 py-1 tabular-nums"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={newPortfolioBenchmarkTotal}
                  onChange={(e) =>
                    setNewPortfolioBenchmarkTotal(e.target.value)
                  }
                />
              </label>
            </>
          ) : null}
          {newPortfolioKind === "live" ? (
            <>
              <hr className="border-slate-200 w-full" />
              <div className="field-note-stack gap-2">
                <label className="block text-sm">
                  Emergency fund (EUR)
                  <input
                    className="mt-1 block w-full border border-slate-300 rounded px-2 py-1 tabular-nums"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={newPortfolioEmergencyFund}
                    onChange={(e) =>
                      setNewPortfolioEmergencyFund(e.target.value)
                    }
                  />
                </label>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {PORTFOLIO_EMERGENCY_FUND_NOTE}
                </p>
              </div>
            </>
          ) : null}
          <hr className="border-slate-200 w-full" />
          <div>
            <Button type="submit" disabled={newPortfolioBusy}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

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
