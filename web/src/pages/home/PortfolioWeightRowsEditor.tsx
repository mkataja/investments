import { Button } from "../../components/Button";
import { instrumentSelectUiLabel } from "../../lib/instrumentSelectUiLabel";
import type { BenchmarkWeightFormRow, HomeInstrument } from "./types";

type PortfolioWeightRowsEditorProps = {
  rows: BenchmarkWeightFormRow[];
  onRowsChange: (rows: BenchmarkWeightFormRow[]) => void;
  instruments: HomeInstrument[];
};

export function PortfolioWeightRowsEditor({
  rows,
  onRowsChange,
  instruments,
}: PortfolioWeightRowsEditorProps) {
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
                  const next = rows.map((r, i) =>
                    i === idx ? { ...r, weightStr: t } : r,
                  );
                  onRowsChange(next);
                }}
              />
            </label>
            <Button
              type="button"
              className="shrink-0 w-full sm:w-auto"
              onClick={() => {
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
