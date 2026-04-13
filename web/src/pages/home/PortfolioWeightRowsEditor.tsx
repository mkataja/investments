import { useMemo, useState } from "react";
import { Button } from "../../components/Button";
import {
  applyAbsoluteEurEdit,
  eurForRowIndex,
  normalizeWeightInputMax3Decimals,
  parseBenchmarkTotalEur,
  removeBenchmarkRowKeepingPeerEur,
} from "../../lib/benchmarkWeightEurSync";
import {
  formatEurAmountForInput,
  parseDecimalInputLoose,
  roundEurToCents,
} from "../../lib/decimalInput";
import { instrumentSelectUiLabel } from "../../lib/instrumentSelectUiLabel";
import type { BenchmarkWeightFormRow, HomeInstrument } from "./types";

type PortfolioWeightRowsEditorProps = {
  rows: BenchmarkWeightFormRow[];
  onRowsChange: (rows: BenchmarkWeightFormRow[]) => void;
  instruments: HomeInstrument[];
  /** Static / backtest: show EUR column and two-way sync. */
  showEurColumn?: boolean;
  /** Parsed with portfolio total for EUR share (required when showEurColumn is true). */
  benchmarkTotalStr?: string;
  /** Called when an absolute EUR edit updates the synthetic portfolio total. */
  onBenchmarkTotalChange?: (nextTotalStr: string) => void;
  disabled?: boolean;
  /** Called when EUR blur cannot be applied (validation). */
  onEurSyncError?: (message: string | null) => void;
};

export function PortfolioWeightRowsEditor({
  rows,
  onRowsChange,
  instruments,
  showEurColumn = false,
  benchmarkTotalStr = "",
  onBenchmarkTotalChange,
  disabled = false,
  onEurSyncError,
}: PortfolioWeightRowsEditorProps) {
  const totalEur = useMemo(
    () => parseBenchmarkTotalEur(benchmarkTotalStr),
    [benchmarkTotalStr],
  );

  const [weightFocusSnapshot, setWeightFocusSnapshot] = useState<
    Map<number, number>
  >(() => new Map());
  const [focusedWeightIdx, setFocusedWeightIdx] = useState<number | null>(null);
  const [eurDraftByRow, setEurDraftByRow] = useState<Map<number, string>>(
    () => new Map(),
  );
  const [focusedEurIdx, setFocusedEurIdx] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600 leading-relaxed">
        Target weights for comparison charts. Use any positive numbers; they are
        normalized to 100%.
      </p>
      <div className="flex flex-col gap-3">
        {rows.map((row, idx) => (
          <div
            key={`${idx}-${row.instrumentId === "" ? "e" : row.instrumentId}`}
            className="flex flex-col gap-3 sm:flex-row sm:flex-nowrap sm:items-end sm:gap-3"
          >
            <label className="block text-sm min-w-0 w-full sm:flex-1">
              Instrument
              <select
                className="mt-1 block w-full min-w-0 border border-slate-300 rounded px-2 py-1 text-sm bg-white"
                disabled={disabled}
                value={row.instrumentId === "" ? "" : String(row.instrumentId)}
                onChange={(e) => {
                  const v = e.target.value;
                  const nextId: number | "" =
                    v === "" ? "" : Number.parseInt(v, 10);
                  const next = rows.map((r, i) =>
                    i === idx
                      ? {
                          ...r,
                          instrumentId: nextId,
                        }
                      : r,
                  );
                  onRowsChange(next);
                }}
              >
                <option value="" />
                {instruments.map((i) => (
                  <option key={i.id} value={i.id}>
                    {instrumentSelectUiLabel(i)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm w-full shrink-0 sm:w-20">
              Weight
              <input
                className="mt-1 block w-full border border-slate-300 rounded px-2 py-1 tabular-nums"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                disabled={disabled}
                value={row.weightStr}
                onChange={(e) => {
                  const t = e.target.value;
                  const next = rows.map((r, i) =>
                    i === idx ? { ...r, weightStr: t } : r,
                  );
                  onRowsChange(next);
                }}
                onFocus={() => {
                  const snap = eurForRowIndex(rows, idx, totalEur);
                  setFocusedWeightIdx(idx);
                  setWeightFocusSnapshot((prev) => {
                    const m = new Map(prev);
                    if (snap != null) {
                      m.set(idx, roundEurToCents(snap));
                    } else {
                      m.delete(idx);
                    }
                    return m;
                  });
                }}
                onBlur={() => {
                  setFocusedWeightIdx((cur) => (cur === idx ? null : cur));
                  setWeightFocusSnapshot((prev) => {
                    const m = new Map(prev);
                    m.delete(idx);
                    return m;
                  });
                  if (showEurColumn) {
                    const normalized = normalizeWeightInputMax3Decimals(
                      row.weightStr,
                    );
                    if (normalized !== row.weightStr) {
                      onRowsChange(
                        rows.map((r, i) =>
                          i === idx ? { ...r, weightStr: normalized } : r,
                        ),
                      );
                    }
                  }
                }}
              />
            </label>
            {showEurColumn ? (
              <label className="block text-sm w-full shrink-0 sm:w-28">
                EUR
                <input
                  className="mt-1 block w-full border border-slate-300 rounded px-2 py-1 tabular-nums"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  disabled={disabled || totalEur == null}
                  value={(() => {
                    if (focusedEurIdx === idx) {
                      return eurDraftByRow.get(idx) ?? "";
                    }
                    if (focusedWeightIdx === idx) {
                      const s = weightFocusSnapshot.get(idx);
                      return s != null ? formatEurAmountForInput(s) : "";
                    }
                    const e = eurForRowIndex(rows, idx, totalEur);
                    return e != null
                      ? formatEurAmountForInput(roundEurToCents(e))
                      : "";
                  })()}
                  placeholder={totalEur == null ? "—" : undefined}
                  onChange={(e) => {
                    const t = e.target.value;
                    setEurDraftByRow((prev) => {
                      const m = new Map(prev);
                      m.set(idx, t);
                      return m;
                    });
                  }}
                  onFocus={() => {
                    const e = eurForRowIndex(rows, idx, totalEur);
                    setFocusedEurIdx(idx);
                    setEurDraftByRow((prev) => {
                      const m = new Map(prev);
                      m.set(
                        idx,
                        e != null
                          ? formatEurAmountForInput(roundEurToCents(e))
                          : "",
                      );
                      return m;
                    });
                    onEurSyncError?.(null);
                  }}
                  onBlur={(e) => {
                    setFocusedEurIdx((cur) => (cur === idx ? null : cur));
                    const draft = e.currentTarget.value;
                    setEurDraftByRow((prev) => {
                      const m = new Map(prev);
                      m.delete(idx);
                      return m;
                    });
                    const trimmed = draft.trim();
                    if (trimmed === "") {
                      onEurSyncError?.(null);
                      return;
                    }
                    const parsedDraft = parseDecimalInputLoose(trimmed);
                    if (!Number.isFinite(parsedDraft) || parsedDraft <= 0) {
                      onEurSyncError?.("Enter a positive EUR amount.");
                      return;
                    }
                    const result = applyAbsoluteEurEdit(
                      draft,
                      idx,
                      rows,
                      totalEur,
                    );
                    if (!result.ok) {
                      onEurSyncError?.(result.message);
                      return;
                    }
                    onEurSyncError?.(null);
                    onRowsChange(result.rows);
                    onBenchmarkTotalChange?.(
                      formatEurAmountForInput(result.benchmarkTotalEur),
                    );
                  }}
                />
              </label>
            ) : null}
            <Button
              type="button"
              className="shrink-0 w-full sm:w-auto"
              disabled={disabled}
              onClick={() => {
                if (showEurColumn && totalEur != null) {
                  const result = removeBenchmarkRowKeepingPeerEur(
                    idx,
                    rows,
                    totalEur,
                  );
                  if (result.ok) {
                    onRowsChange(result.rows);
                    onBenchmarkTotalChange?.(
                      formatEurAmountForInput(result.benchmarkTotalEur),
                    );
                    return;
                  }
                }
                onRowsChange(rows.filter((_, j) => j !== idx));
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
          disabled={disabled}
          onClick={() =>
            onRowsChange([...rows, { instrumentId: "", weightStr: "" }])
          }
        >
          Add line
        </Button>
      </div>
    </div>
  );
}
