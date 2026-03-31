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

  function openNewPortfolioModal() {
    setNewPortfolioName("");
    setNewPortfolioEmergencyFund("0");
    setNewPortfolioOpen(true);
  }

  return (
    <div className="w-full min-w-0 page-stack">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1>Portfolio</h1>
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
                if (selectedPortfolioEntity == null) {
                  return;
                }
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
          <div className="space-y-1">
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
            <p className="text-sm text-slate-600">
              {PORTFOLIO_EMERGENCY_FUND_NOTE}
            </p>
          </div>
          <Button type="submit" disabled={newPortfolioBusy}>
            Create
          </Button>
        </form>
      </Modal>

      <EditPortfolioModal
        open={editPortfolioOpen}
        onClose={() => setEditPortfolioOpen(false)}
        portfolio={selectedPortfolioEntity}
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
          />
        </div>
      ) : null}

      <TransactionsTable
        transactions={transactions}
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
    </div>
  );
}
