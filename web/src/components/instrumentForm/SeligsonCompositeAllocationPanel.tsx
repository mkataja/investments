import {
  COMPOSITE_PSEUDO_HUMAN_LABEL,
  COMPOSITE_PSEUDO_KEYS,
  isCompositePseudoKey,
} from "@investments/lib/instrumentComposite";
import { useMemo } from "react";
import type { SeligsonFundPageCompositePreviewRow } from "../../api/seligsonFundPageCompositePreview";
import { instrumentSelectUiLabel } from "../../lib/instrumentSelectUiLabel";
import type { InstrumentListItem } from "../../pages/instruments/types";
import type { SeligsonCompositeMappedRow } from "./types";

const PSEUDO_PREFIX = "pseudo:";

function sortDropdownOptionsByLabel(
  opts: readonly { value: string; label: string }[],
): { value: string; label: string }[] {
  return [...opts].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );
}

function rowSelectValue(m: SeligsonCompositeMappedRow): string {
  const pk = m.pseudoKey.trim();
  if (pk !== "") {
    return `${PSEUDO_PREFIX}${pk}`;
  }
  const tid = m.targetInstrumentId.trim();
  if (tid !== "") {
    return tid;
  }
  return "";
}

function parseSelection(
  value: string,
): Pick<SeligsonCompositeMappedRow, "targetInstrumentId" | "pseudoKey"> {
  if (value === "") {
    return { targetInstrumentId: "", pseudoKey: "" };
  }
  if (value.startsWith(PSEUDO_PREFIX)) {
    const k = value.slice(PSEUDO_PREFIX.length);
    if (isCompositePseudoKey(k)) {
      return { targetInstrumentId: "", pseudoKey: k };
    }
    return { targetInstrumentId: "", pseudoKey: "" };
  }
  const idNum = Number.parseInt(value, 10);
  if (Number.isFinite(idNum) && idNum > 0) {
    return { targetInstrumentId: String(idNum), pseudoKey: "" };
  }
  return { targetInstrumentId: "", pseudoKey: "" };
}

export function SeligsonCompositeAllocationPanel({
  previewRows,
  mappedRows,
  onChangeMapped,
  fundName,
  notes,
  instrumentOptions,
  instrumentOptionsLoading,
  instrumentOptionsError,
}: {
  previewRows: SeligsonFundPageCompositePreviewRow[];
  mappedRows: SeligsonCompositeMappedRow[];
  onChangeMapped: (next: SeligsonCompositeMappedRow[]) => void;
  fundName: string | null;
  notes: string[];
  instrumentOptions: InstrumentListItem[];
  instrumentOptionsLoading: boolean;
  instrumentOptionsError: string | null;
}) {
  const pseudoAllocationDropdownOptions = useMemo(
    () =>
      sortDropdownOptionsByLabel(
        COMPOSITE_PSEUDO_KEYS.map((k) => ({
          value: `${PSEUDO_PREFIX}${k}`,
          label: COMPOSITE_PSEUDO_HUMAN_LABEL[k],
        })),
      ),
    [],
  );

  const instrumentDropdownOptions = useMemo(
    () =>
      sortDropdownOptionsByLabel(
        instrumentOptions.map((i) => ({
          value: String(i.id),
          label: instrumentSelectUiLabel(i),
        })),
      ),
    [instrumentOptions],
  );

  function patchRow(i: number, patch: Partial<SeligsonCompositeMappedRow>) {
    const next = mappedRows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    onChangeMapped(next);
  }

  return (
    <div className="form-stack border border-amber-200 rounded-lg p-4 bg-amber-50/40 mt-4">
      <h4>Composite allocation</h4>
      {fundName != null && fundName.length > 0 ? (
        <p className="text-xs text-slate-600">Fund: {fundName}</p>
      ) : null}
      {notes.length > 0 ? (
        <ul className="text-xs text-amber-900 list-disc pl-4 space-y-0.5">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-slate-600">
        Composite fund detected. Map each sleeve to an instrument or a generic
        allocation line.
      </p>
      {instrumentOptionsError != null && instrumentOptionsError !== "" ? (
        <p className="text-xs text-amber-900">{instrumentOptionsError}</p>
      ) : null}
      <div className="overflow-x-auto border border-slate-200 rounded bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-2 py-2 font-medium">Sleeve</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap">Share</th>
              <th className="px-2 py-2 font-medium">Instrument</th>
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, i) => {
              const m = mappedRows[i];
              if (m == null) {
                return null;
              }
              const rv = rowSelectValue(m);
              const valueResolved =
                rv === "" ||
                pseudoAllocationDropdownOptions.some((o) => o.value === rv) ||
                instrumentDropdownOptions.some((o) => o.value === rv)
                  ? rv
                  : "";
              return (
                <tr
                  key={`${row.rawLabel}-${i}`}
                  className="border-b border-slate-100"
                >
                  <td className="px-2 py-2 align-top text-slate-800">
                    {row.rawLabel}
                  </td>
                  <td className="px-2 py-2 align-top whitespace-nowrap tabular-nums">
                    {(row.pctOfFund * 100).toFixed(1)}%
                  </td>
                  <td className="px-2 py-2 align-top min-w-[12rem]">
                    <select
                      className="mt-0 block w-full max-w-md border rounded px-2 py-1 form-control"
                      disabled={instrumentOptionsLoading}
                      value={instrumentOptionsLoading ? "" : valueResolved}
                      onChange={(e) => {
                        patchRow(i, parseSelection(e.target.value));
                      }}
                    >
                      {instrumentOptionsLoading ? (
                        <option value="">Loading instruments...</option>
                      ) : (
                        <>
                          <option value="">—</option>
                          {pseudoAllocationDropdownOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                          <option disabled value="__sep__">
                            ───────────────────
                          </option>
                          {instrumentDropdownOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
