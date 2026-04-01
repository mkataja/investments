import {
  COMPOSITE_PSEUDO_KEYS,
  type CompositePseudoKey,
  transactionInstrumentSelectLabel,
} from "@investments/lib";
import type { CompositePreviewRow } from "./types";

const PSEUDO_LABEL: Record<CompositePseudoKey, string> = {
  other_equities: "Other equities (unknown distribution)",
  other_long_government_bonds:
    "Other long government bonds (unknown country distribution)",
  other_long_corporate_bonds:
    "Other long corporate bonds (unknown country distribution)",
  other_short_government_bonds:
    "Other short government bonds (unknown country distribution)",
  other_short_corporate_bonds:
    "Other short corporate bonds (unknown country distribution)",
  other_ultrashort_bonds:
    "Other ultrashort bonds (unknown country distribution)",
  cash: "Cash",
};

type InstrumentOption = {
  id: number;
  kind: string;
  displayName: string;
  yahooSymbol: string | null;
  seligsonFund: { name: string } | null;
};

export type SeligsonCompositeAllocationPanelProps = {
  asOfDate: string | null;
  notes: string[];
  fundDisplayName: string;
  onFundDisplayNameChange: (value: string) => void;
  rows: CompositePreviewRow[];
  instrumentOptions: InstrumentOption[];
  selectionByRow: Record<number, string>;
  onChangeSelection: (rowIndex: number, value: string) => void;
  onConfirm: () => void;
  confirmDisabled: boolean;
  onClear: () => void;
};

export function SeligsonCompositeAllocationPanel({
  asOfDate,
  notes,
  fundDisplayName,
  onFundDisplayNameChange,
  rows,
  instrumentOptions,
  selectionByRow,
  onChangeSelection,
  onConfirm,
  confirmDisabled,
  onClear,
}: SeligsonCompositeAllocationPanelProps) {
  const headingId = "seligson-composite-allocation-heading";
  return (
    <section
      className="form-stack text-sm mt-4 pt-4 border-t border-slate-200"
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="text-heading-2 font-medium text-slate-800">
        Confirm composite allocation
      </h2>
      {asOfDate != null ? (
        <p className="text-slate-600">As of {asOfDate}</p>
      ) : null}
      {notes.length > 0 ? (
        <ul className="list-disc pl-5 text-amber-800 text-xs">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      <label className="block text-sm">
        Fund name
        <input
          type="text"
          className="mt-1 block w-full border rounded px-2 py-1"
          value={fundDisplayName}
          onChange={(e) => onFundDisplayNameChange(e.target.value)}
          placeholder="As on Seligson FundValues"
          required
          aria-required={true}
          autoComplete="off"
        />
      </label>
      <div className="overflow-x-auto border border-slate-200 rounded">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="p-2 font-medium">Line</th>
              <th className="p-2 font-medium">% of fund</th>
              <th className="p-2 font-medium">Match</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={`${row.rawLabel}-${i}`}
                className="border-b border-slate-100"
              >
                <td className="p-2 align-top max-w-[14rem]">{row.rawLabel}</td>
                <td className="p-2 align-top whitespace-nowrap">
                  {(row.pctOfFund * 100).toFixed(1)}%
                </td>
                <td className="p-2 align-top min-w-[12rem]">
                  <select
                    className="mt-0.5 w-full max-w-md border rounded px-2 py-1 text-sm"
                    value={selectionByRow[i] ?? ""}
                    onChange={(e) => onChangeSelection(i, e.target.value)}
                  >
                    <option value="">—</option>
                    {COMPOSITE_PSEUDO_KEYS.map((k) => (
                      <option key={k} value={`pseudo:${k}`}>
                        {PSEUDO_LABEL[k]}
                      </option>
                    ))}
                    {instrumentOptions.map((inst) => (
                      <option key={inst.id} value={String(inst.id)}>
                        {transactionInstrumentSelectLabel(inst)}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          className="button-primary"
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
          Create instrument
        </button>
        <button
          type="button"
          className="border border-slate-300 px-4 py-2 rounded"
          onClick={onClear}
        >
          Clear
        </button>
      </div>
    </section>
  );
}
