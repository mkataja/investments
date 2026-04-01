import { sortByTransactionInstrumentSelectLabel } from "@investments/lib";
import {
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiGet, apiPatch, apiPut, normalizeWeightRowsForApi } from "../../api";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { parseDecimalInputLoose } from "../../lib/decimalInput";
import { instrumentSelectUiLabel } from "../../lib/instrumentSelectUiLabel";
import {
  type BenchmarkWeightFormRow,
  weightRowsEqual,
} from "../../lib/portfolioBenchmarkWeights";
import {
  PortfolioFormBenchmarkTotalField,
  PortfolioFormDivider,
  PortfolioFormEmergencyFundBlock,
  PortfolioFormNameField,
} from "./PortfolioFormFields";
import type { HomeInstrument, PortfolioEntity } from "./types";

type EditPortfolioModalProps = {
  open: boolean;
  onClose: () => void;
  portfolio: PortfolioEntity | null;
  instruments: HomeInstrument[];
  onSaved: () => void | Promise<void>;
  onError: (message: string | null) => void;
};

export function EditPortfolioModal({
  open,
  onClose,
  portfolio,
  instruments,
  onSaved,
  onError,
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
  const [busy, setBusy] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const kind = portfolio?.kind ?? "live";
  const isBenchmark = kind === "benchmark";

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
    if ((portfolio.kind ?? "live") === "benchmark") {
      setWeightsLoadToken((t) => t + 1);
    } else {
      setWeightRows([{ instrumentId: "", weightStr: "" }]);
      setInitialWeightRows([]);
    }
  }, [open, portfolio]);

  useEffect(() => {
    if (!open || portfolio == null || !isBenchmark) {
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
      } catch (e) {
        if (!cancelled) {
          onError(String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, portfolio, isBenchmark, weightsLoadToken, onError]);

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
    let emergencyFundEurForPatch: number;
    let benchmarkTotalEurForPatch: number | undefined;
    if (isBenchmark) {
      const v = portfolio.emergencyFundEur;
      emergencyFundEurForPatch = Number.isFinite(v) ? v : 0;
      const bt = Number.parseFloat(benchmarkTotal.trim().replace(",", "."));
      if (!Number.isFinite(bt) || bt <= 0) {
        onError("Total amount must be a positive number.");
        return;
      }
      benchmarkTotalEurForPatch = bt;
    } else {
      const efParsed = Number.parseFloat(
        emergencyFund.trim().replace(",", "."),
      );
      if (!Number.isFinite(efParsed) || efParsed < 0) {
        onError("Emergency fund must be a non-negative number.");
        return;
      }
      emergencyFundEurForPatch = efParsed;
    }
    setBusy(true);
    onError(null);
    try {
      if (isBenchmark) {
        let apiWeights: Array<{ instrumentId: number; weight: number }>;
        try {
          apiWeights = normalizeWeightRowsForApi(weightRows);
        } catch (err) {
          onError(String(err));
          setBusy(false);
          return;
        }
        await apiPut(`/portfolios/${portfolio.id}/benchmark-weights`, {
          weights: apiWeights,
        });
      }
      await apiPatch<PortfolioEntity>(`/portfolios/${portfolio.id}`, {
        name: trimmed,
        emergencyFundEur: emergencyFundEurForPatch,
        ...(isBenchmark && benchmarkTotalEurForPatch != null
          ? { benchmarkTotalEur: benchmarkTotalEurForPatch }
          : {}),
      });
      onClose();
      await onSaved();
    } catch (err) {
      onError(String(err));
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
      (!isBenchmark &&
        parseDecimalInputLoose(emergencyFund) !==
          (Number.isFinite(portfolio.emergencyFundEur)
            ? portfolio.emergencyFundEur
            : 0)) ||
      (isBenchmark &&
        (parseDecimalInputLoose(benchmarkTotal) !==
          portfolioBenchmarkTotalEur ||
          !weightRowsEqual(weightRows, initialWeightRows))));

  return (
    <Modal
      title="Edit portfolio"
      open={open}
      onClose={onClose}
      confirmBeforeClose={portfolioDirty}
      dialogClassName={isBenchmark ? "max-w-3xl" : undefined}
    >
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-5">
        <PortfolioFormNameField
          name={name}
          onNameChange={setName}
          inputRef={nameInputRef}
        />

        {isBenchmark ? (
          <>
            <PortfolioFormDivider />
            <div className="flex flex-col gap-4">
              <PortfolioFormBenchmarkTotalField
                value={benchmarkTotal}
                onChange={setBenchmarkTotal}
              />
              <hr />
              <p className="text-sm text-slate-600 leading-relaxed">
                Target weights for comparison charts. Use any positive numbers;
                they are normalized to 100%.
              </p>
              <div className="flex flex-col gap-3">
                {weightRows.map((row, idx) => (
                  <div
                    key={`${idx}-${row.instrumentId === "" ? "e" : row.instrumentId}`}
                    className="flex flex-col gap-3 sm:flex-row sm:flex-nowrap sm:items-end sm:gap-3"
                  >
                    <label className="block text-sm min-w-0 w-full sm:flex-1">
                      Instrument
                      <select
                        className="mt-1 block w-full min-w-0 border border-slate-300 rounded px-2 py-1 text-sm bg-white"
                        value={
                          row.instrumentId === ""
                            ? ""
                            : String(row.instrumentId)
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          setWeightRows((prev) => {
                            const next = [...prev];
                            const cur = next[idx];
                            if (!cur) return prev;
                            next[idx] = {
                              ...cur,
                              instrumentId:
                                v === "" ? "" : Number.parseInt(v, 10),
                            };
                            return next;
                          });
                        }}
                      >
                        <option value="" />
                        {instrumentsSorted.map((i) => (
                          <option key={i.id} value={i.id}>
                            {instrumentSelectUiLabel(i)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm w-full shrink-0 sm:w-28">
                      Weight
                      <input
                        className="mt-1 block w-full border border-slate-300 rounded px-2 py-1 tabular-nums"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={row.weightStr}
                        onChange={(e) => {
                          const t = e.target.value;
                          setWeightRows((prev) => {
                            const next = [...prev];
                            const cur = next[idx];
                            if (!cur) return prev;
                            next[idx] = { ...cur, weightStr: t };
                            return next;
                          });
                        }}
                      />
                    </label>
                    <Button
                      type="button"
                      className="shrink-0 w-full sm:w-auto"
                      onClick={() => {
                        setWeightRows((prev) =>
                          prev.filter((_, j) => j !== idx),
                        );
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
              <div>
                <Button
                  type="button"
                  onClick={() =>
                    setWeightRows((prev) => [
                      ...prev,
                      { instrumentId: "", weightStr: "" },
                    ])
                  }
                >
                  Add line
                </Button>
              </div>
            </div>
          </>
        ) : (
          <PortfolioFormEmergencyFundBlock
            value={emergencyFund}
            onChange={setEmergencyFund}
          />
        )}

        <PortfolioFormDivider />
        <div>
          <Button type="submit" disabled={busy}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
