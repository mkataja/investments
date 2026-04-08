import { sortByTransactionInstrumentSelectLabel } from "@investments/lib/instrumentSelectLabel";
import {
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiDelete, apiGet, apiPatch, apiPut } from "../../api/client";
import {
  buildPatchPortfolioBody,
  normalizeWeightRowsForApi,
} from "../../api/portfolios";
import { Button } from "../../components/Button";
import { ErrorAlert } from "../../components/ErrorAlert";
import { Modal } from "../../components/Modal";
import { parseDecimalInputLoose } from "../../lib/decimalInput";
import {
  PortfolioFormBenchmarkTotalField,
  PortfolioFormDivider,
  PortfolioFormEmergencyFundBlock,
  PortfolioFormNameField,
} from "./PortfolioFormFields";
import { PortfolioWeightRowsEditor } from "./PortfolioWeightRowsEditor";
import {
  type BenchmarkWeightFormRow,
  type HomeInstrument,
  type PortfolioEntity,
  weightRowsEqual,
} from "./types";

type EditPortfolioModalProps = {
  open: boolean;
  onClose: () => void;
  portfolio: PortfolioEntity | null;
  instruments: HomeInstrument[];
  onSaved: () => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
};

export function EditPortfolioModal({
  open,
  onClose,
  portfolio,
  instruments,
  onSaved,
  onDeleted,
}: EditPortfolioModalProps) {
  const [name, setName] = useState(() => portfolio?.name ?? "");
  const [emergencyFund, setEmergencyFund] = useState(() =>
    portfolio != null && Number.isFinite(portfolio.emergencyFundEur)
      ? String(portfolio.emergencyFundEur)
      : "0",
  );
  const [benchmarkTotal, setBenchmarkTotal] = useState(() =>
    portfolio != null && Number.isFinite(portfolio.benchmarkTotalEur)
      ? String(portfolio.benchmarkTotalEur)
      : "10000",
  );
  const [weightRows, setWeightRows] = useState<BenchmarkWeightFormRow[]>([
    { instrumentId: "", weightStr: "" },
  ]);
  const [initialWeightRows, setInitialWeightRows] = useState<
    BenchmarkWeightFormRow[]
  >([]);
  const [weightsLoadToken, setWeightsLoadToken] = useState(0);
  const [weightsLoaded, setWeightsLoaded] = useState(false);
  const [simulationStartDate, setSimulationStartDate] = useState(
    () =>
      portfolio?.simulationStartDate ?? new Date().toISOString().slice(0, 10),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const kind = portfolio?.kind ?? "live";
  const isStatic = kind === "static";
  const isBacktest = kind === "backtest";
  const isSynthetic = isStatic || isBacktest;

  const instrumentsSorted = useMemo(
    () => sortByTransactionInstrumentSelectLabel(instruments),
    [instruments],
  );

  useLayoutEffect(() => {
    if (!open || portfolio == null) {
      return;
    }
    setName(portfolio.name);
    setEmergencyFund(
      Number.isFinite(portfolio.emergencyFundEur)
        ? String(portfolio.emergencyFundEur)
        : "0",
    );
    setBenchmarkTotal(
      Number.isFinite(portfolio.benchmarkTotalEur)
        ? String(portfolio.benchmarkTotalEur)
        : "10000",
    );
    setSimulationStartDate(
      portfolio.simulationStartDate ?? new Date().toISOString().slice(0, 10),
    );
    setError(null);
    if ((portfolio.kind ?? "live") !== "live") {
      setWeightsLoaded(false);
      setWeightsLoadToken((t) => t + 1);
    } else {
      setWeightRows([{ instrumentId: "", weightStr: "" }]);
      setInitialWeightRows([]);
      setWeightsLoaded(true);
    }
  }, [open, portfolio]);

  useEffect(() => {
    if (!open || portfolio == null || !isSynthetic) {
      return;
    }
    let cancelled = false;
    const id = portfolio.id;
    const token = weightsLoadToken;
    void (async () => {
      try {
        const res = await apiGet<{
          weights: Array<{ instrumentId: number; weight: number }>;
        }>(`/portfolios/${id}/benchmark-weights`);
        if (cancelled || token !== weightsLoadToken) {
          return;
        }
        const next: BenchmarkWeightFormRow[] =
          res.weights.length > 0
            ? res.weights.map((w) => ({
                instrumentId: w.instrumentId,
                weightStr: String(w.weight),
              }))
            : [{ instrumentId: "", weightStr: "" }];
        setWeightRows(next);
        setInitialWeightRows(
          next.map((r) => ({
            instrumentId: r.instrumentId,
            weightStr: r.weightStr,
          })),
        );
        setWeightsLoaded(true);
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          setWeightsLoaded(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, portfolio, isSynthetic, weightsLoadToken]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (portfolio == null) {
      return;
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return;
    }
    const efParsed = Number.parseFloat(emergencyFund.trim().replace(",", "."));
    if (!Number.isFinite(efParsed) || efParsed < 0) {
      setError("Emergency fund must be a non-negative number.");
      return;
    }
    const emergencyFundEurForPatch = efParsed;
    let benchmarkTotalEurForPatch: number | undefined;
    let simulationStartDateForPatch: string | undefined;
    let apiWeights: Array<{ instrumentId: number; weight: number }> = [];
    if (isSynthetic) {
      if (!weightsLoaded) {
        setError("Portfolio weights are still loading. Please wait a moment.");
        return;
      }
      const bt = Number.parseFloat(benchmarkTotal.trim().replace(",", "."));
      if (!Number.isFinite(bt) || bt <= 0) {
        setError("Total amount must be a positive number.");
        return;
      }
      benchmarkTotalEurForPatch = bt;
      try {
        apiWeights = normalizeWeightRowsForApi(weightRows);
      } catch (err) {
        setError(String(err));
        return;
      }
      if (apiWeights.length === 0) {
        setError("Add at least one weight row.");
        return;
      }
      if (isBacktest) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(simulationStartDate.trim())) {
          setError("Start date must be YYYY-MM-DD.");
          return;
        }
        simulationStartDateForPatch = simulationStartDate.trim();
      }
    }
    setBusy(true);
    setError(null);
    try {
      // Backtest date validation on PATCH uses currently stored weights.
      // Save weights first so date validation evaluates the latest edited set.
      if (isBacktest) {
        await apiPut(`/portfolios/${portfolio.id}/benchmark-weights`, {
          weights: apiWeights,
        });
      }
      await apiPatch<PortfolioEntity>(
        `/portfolios/${portfolio.id}`,
        buildPatchPortfolioBody({
          name: trimmed,
          emergencyFundEur: emergencyFundEurForPatch,
          ...(isSynthetic ? { kind } : {}),
          ...(isSynthetic && benchmarkTotalEurForPatch != null
            ? { benchmarkTotalEur: benchmarkTotalEurForPatch }
            : {}),
          ...(simulationStartDateForPatch != null
            ? { simulationStartDate: simulationStartDateForPatch }
            : {}),
        }),
      );
      if (isSynthetic && !isBacktest) {
        await apiPut(`/portfolios/${portfolio.id}/benchmark-weights`, {
          weights: apiWeights,
        });
      }
      onClose();
      await onSaved();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const portfolioBenchmarkTotalEur =
    portfolio != null && Number.isFinite(portfolio.benchmarkTotalEur)
      ? portfolio.benchmarkTotalEur
      : 10000;

  const portfolioDirty =
    portfolio != null &&
    (name.trim() !== portfolio.name.trim() ||
      parseDecimalInputLoose(emergencyFund) !==
        (Number.isFinite(portfolio.emergencyFundEur)
          ? portfolio.emergencyFundEur
          : 0) ||
      (isSynthetic &&
        (parseDecimalInputLoose(benchmarkTotal) !==
          portfolioBenchmarkTotalEur ||
          !weightRowsEqual(weightRows, initialWeightRows))) ||
      (isBacktest &&
        simulationStartDate.trim() !==
          (portfolio.simulationStartDate ?? "").trim()));

  return (
    <Modal
      title="Edit portfolio"
      open={open}
      onClose={onClose}
      confirmBeforeClose={portfolioDirty}
      dialogClassName={isSynthetic ? "max-w-3xl" : undefined}
    >
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-5">
        <PortfolioFormNameField
          name={name}
          onNameChange={setName}
          inputRef={nameInputRef}
        />

        {isSynthetic ? (
          <>
            <PortfolioFormDivider />
            <div className="flex flex-col gap-4">
              {isBacktest ? (
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
                label="Synthetic portfolio total value (EUR)"
              />
              <PortfolioFormDivider />
              <PortfolioWeightRowsEditor
                rows={weightRows}
                onRowsChange={setWeightRows}
                instruments={instrumentsSorted}
              />
            </div>
          </>
        ) : null}

        <PortfolioFormEmergencyFundBlock
          value={emergencyFund}
          onChange={setEmergencyFund}
        />

        <PortfolioFormDivider />

        <div className="flex flex-col gap-3">
          {error ? <ErrorAlert>{error}</ErrorAlert> : null}
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              className="action-delete"
              disabled={busy || portfolio == null}
              onClick={() => {
                if (portfolio == null) {
                  return;
                }
                if (
                  !window.confirm(
                    "Delete this portfolio and all its data? This cannot be undone.",
                  )
                ) {
                  return;
                }
                setError(null);
                void (async () => {
                  try {
                    setBusy(true);
                    await apiDelete(`/portfolios/${portfolio.id}`);
                    onClose();
                    await onDeleted();
                  } catch (err) {
                    setError(String(err));
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Delete
            </Button>
            <Button
              type="submit"
              disabled={busy || (isSynthetic && !weightsLoaded)}
            >
              Save
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
