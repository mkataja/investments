import {
  compareTransactionInstrumentSelectLabel,
  sortByTransactionInstrumentSelectLabel,
} from "@investments/lib/instrumentSelectLabel";
import {
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiPost, apiPut } from "../../api/client";
import {
  buildCreateBacktestPortfolioBody,
  buildCreatePortfolioBody,
  normalizeWeightRowsForApi,
} from "../../api/portfolios";
import { Button } from "../../components/Button";
import { ErrorAlert } from "../../components/ErrorAlert";
import { Modal } from "../../components/Modal";
import {
  formatEurAmountForInput,
  parseDecimalInputLoose,
} from "../../lib/decimalInput";
import {
  PortfolioFormBenchmarkTotalField,
  PortfolioFormDivider,
  PortfolioFormEmergencyFundBlock,
  PortfolioFormNameField,
} from "./PortfolioFormFields";
import { PortfolioWeightRowsEditor } from "./PortfolioWeightRowsEditor";
import type {
  BenchmarkWeightFormRow,
  HomeInstrument,
  PortfolioDistributions,
  PortfolioEntity,
} from "./types";

export type NewPortfolioPrefill = {
  name: string;
  emergencyFundEur: number;
  benchmarkTotalEur: number;
  weightRows: BenchmarkWeightFormRow[];
  /** Copy source is backtest; otherwise static (including when copying a live portfolio). */
  targetKind: "static" | "backtest";
  /** YYYY-MM-DD when {@link targetKind} is backtest. */
  simulationStartDate?: string;
};

export function buildBenchmarkWeightRowsFromCurrentPortfolio(
  currentPortfolio: PortfolioDistributions,
  instruments: HomeInstrument[],
): BenchmarkWeightFormRow[] {
  const validInstrumentIds = new Set(instruments.map((i) => i.id));
  const instrumentById = new Map(instruments.map((i) => [i.id, i] as const));
  const rows = currentPortfolio.positions.flatMap((p) => {
    if (
      !Number.isFinite(p.weight) ||
      p.weight <= 0 ||
      !validInstrumentIds.has(p.instrumentId)
    ) {
      return [];
    }
    const pctHundredths = Math.round(p.weight * 10000);
    if (pctHundredths <= 0) {
      return [];
    }
    return [
      {
        instrumentId: p.instrumentId,
        weightStr: (pctHundredths / 100).toFixed(2),
      } satisfies BenchmarkWeightFormRow,
    ];
  });
  return [...rows].sort((a, b) => {
    const ia = instrumentById.get(a.instrumentId);
    const ib = instrumentById.get(b.instrumentId);
    if (ia == null && ib == null) {
      return 0;
    }
    if (ia == null) {
      return 1;
    }
    if (ib == null) {
      return -1;
    }
    return compareTransactionInstrumentSelectLabel(ia, ib);
  });
}

type NewPortfolioModalProps = {
  open: boolean;
  onClose: () => void;
  instruments: HomeInstrument[];
  currentPortfolio: PortfolioDistributions | null;
  /** When set while opening, seeds new portfolio fields (copy portfolio flow). */
  prefill: NewPortfolioPrefill | null;
  onCreated: (portfolio: PortfolioEntity) => void | Promise<void>;
};

export function NewPortfolioModal({
  open,
  onClose,
  instruments,
  currentPortfolio,
  prefill,
  onCreated,
}: NewPortfolioModalProps) {
  const [name, setName] = useState("");
  const [emergencyFund, setEmergencyFund] = useState("0");
  const [kind, setKind] = useState<"live" | "static" | "backtest">("live");
  const [benchmarkTotal, setBenchmarkTotal] = useState("10000");
  const [simulationStartDate, setSimulationStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [weightRows, setWeightRows] = useState<BenchmarkWeightFormRow[]>([
    { instrumentId: "", weightStr: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const instrumentsSorted = useMemo(
    () => sortByTransactionInstrumentSelectLabel(instruments),
    [instruments],
  );
  const isSynthetic = kind === "static" || kind === "backtest";

  function copyWeightsFromCurrentPortfolio(): void {
    if (!currentPortfolio || currentPortfolio.positions.length === 0) {
      setError("Current portfolio has no positions to copy.");
      return;
    }
    const nextRows = buildBenchmarkWeightRowsFromCurrentPortfolio(
      currentPortfolio,
      instruments,
    );
    if (nextRows.length === 0) {
      setError("Current portfolio has no copyable instrument weights.");
      return;
    }
    setWeightRows(nextRows);
    setError(null);
  }

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    setBusy(false);
    setError(null);
    if (prefill != null) {
      setName(prefill.name);
      setEmergencyFund(formatEurAmountForInput(prefill.emergencyFundEur));
      setKind(prefill.targetKind);
      setBenchmarkTotal(formatEurAmountForInput(prefill.benchmarkTotalEur));
      const start =
        prefill.targetKind === "backtest" &&
        prefill.simulationStartDate != null &&
        /^\d{4}-\d{2}-\d{2}$/.test(prefill.simulationStartDate.trim())
          ? prefill.simulationStartDate.trim()
          : new Date().toISOString().slice(0, 10);
      setSimulationStartDate(start);
      setWeightRows(
        prefill.weightRows.length > 0
          ? prefill.weightRows
          : [{ instrumentId: "", weightStr: "" }],
      );
      return;
    }
    setName("");
    setEmergencyFund("0");
    setKind("live");
    setBenchmarkTotal("10000");
    setSimulationStartDate(new Date().toISOString().slice(0, 10));
    setWeightRows([{ instrumentId: "", weightStr: "" }]);
  }, [open, prefill]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return;
    }
    const efParsed = Number.parseFloat(emergencyFund.trim().replace(",", "."));
    if (!Number.isFinite(efParsed) || efParsed < 0) {
      setError("Emergency fund must be a non-negative number.");
      return;
    }
    let benchmarkTotalEur: number | undefined;
    if (isSynthetic) {
      const bt = Number.parseFloat(benchmarkTotal.trim().replace(",", "."));
      if (!Number.isFinite(bt) || bt <= 0) {
        setError("Total amount must be a positive number.");
        return;
      }
      benchmarkTotalEur = bt;
    }
    if (kind === "backtest") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(simulationStartDate.trim())) {
        setError("Start date must be YYYY-MM-DD.");
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      if (kind === "backtest") {
        const apiWeights = normalizeWeightRowsForApi(weightRows);
        if (apiWeights.length === 0) {
          setError("Add at least one weight row.");
          setBusy(false);
          return;
        }
        const row = await apiPost<PortfolioEntity>(
          "/portfolios/backtest",
          buildCreateBacktestPortfolioBody({
            name: trimmed,
            emergencyFundEur: efParsed,
            benchmarkTotalEur: benchmarkTotalEur ?? 10_000,
            simulationStartDate: simulationStartDate.trim(),
            weights: apiWeights,
          }),
        );
        onClose();
        await onCreated(row);
        return;
      }
      const row = await apiPost<PortfolioEntity>(
        "/portfolios",
        buildCreatePortfolioBody({
          name: trimmed,
          kind,
          emergencyFundEur: efParsed,
          ...(benchmarkTotalEur != null ? { benchmarkTotalEur } : {}),
        }),
      );
      if (kind === "static") {
        const apiWeights = normalizeWeightRowsForApi(weightRows);
        await apiPut(`/portfolios/${row.id}/benchmark-weights`, {
          weights: apiWeights,
        });
      }
      onClose();
      await onCreated(row);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const dirty =
    name.trim() !== "" ||
    parseDecimalInputLoose(emergencyFund) !== 0 ||
    kind !== "live" ||
    parseDecimalInputLoose(benchmarkTotal) !== 10000 ||
    simulationStartDate !== new Date().toISOString().slice(0, 10) ||
    weightRows.some((r) => r.instrumentId !== "" || r.weightStr.trim() !== "");

  return (
    <Modal
      title="New portfolio"
      open={open}
      onClose={onClose}
      confirmBeforeClose={dirty}
      dialogClassName="max-w-3xl"
    >
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-5">
        <PortfolioFormNameField
          name={name}
          onNameChange={setName}
          inputRef={nameInputRef}
        />
        <PortfolioFormDivider />
        <div className="flex flex-col gap-2">
          <label className="block text-sm">
            Type
            <select
              className="mt-1 block w-full border border-slate-300 rounded px-2 py-1 text-sm bg-white"
              value={kind}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "static" || v === "backtest") {
                  setKind(v);
                  return;
                }
                setKind("live");
              }}
            >
              <option value="live">Live (transactions)</option>
              <option value="static">Static (target weights)</option>
              <option value="backtest">Backtest (simulated P/L)</option>
            </select>
          </label>
        </div>

        {isSynthetic ? (
          <>
            <PortfolioFormDivider />
            {kind === "backtest" ? (
              <label className="block text-sm max-w-xs">
                Backtest start date
                <input
                  className="mt-1 block w-full border border-slate-300 rounded px-2 py-1 tabular-nums"
                  type="date"
                  value={simulationStartDate}
                  onChange={(e) => setSimulationStartDate(e.target.value)}
                />
              </label>
            ) : null}
            <PortfolioFormBenchmarkTotalField
              value={benchmarkTotal}
              onChange={setBenchmarkTotal}
              label={
                kind === "backtest"
                  ? "Initial invested sum (EUR)"
                  : "Synthetic portfolio total value (EUR)"
              }
            />
            <hr />
            <div>
              <Button
                type="button"
                disabled={busy}
                onClick={copyWeightsFromCurrentPortfolio}
              >
                Copy weights from current portfolio
              </Button>
            </div>
            <PortfolioWeightRowsEditor
              rows={weightRows}
              onRowsChange={setWeightRows}
              instruments={instrumentsSorted}
            />
          </>
        ) : null}

        <PortfolioFormEmergencyFundBlock
          value={emergencyFund}
          onChange={setEmergencyFund}
        />

        <PortfolioFormDivider />

        <div className="flex flex-col gap-3">
          {error ? <ErrorAlert>{error}</ErrorAlert> : null}
          <div>
            <Button type="submit" disabled={busy}>
              Create
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
