import type { InstrumentKind } from "./types";

const OPTIONS: readonly { value: InstrumentKind; label: string }[] = [
  { value: "etf", label: "ETF" },
  { value: "stock", label: "Stock" },
  { value: "commodity", label: "Commodity" },
  { value: "custom", label: "Seligson" },
  { value: "cash_account", label: "Cash account" },
];

export function InstrumentKindPicker({
  kind,
  onKindChange,
}: {
  kind: InstrumentKind | null;
  onKindChange: (value: InstrumentKind) => void;
}) {
  return (
    <div className="page-header-stack">
      <p className="text-sm font-medium text-slate-800">Instrument type</p>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={`px-3 py-1.5 rounded border text-sm ${
              kind === value
                ? "bg-emerald-700 text-white border-emerald-800"
                : "bg-white border-slate-200 text-slate-800 hover:bg-slate-50"
            }`}
            onClick={() => onKindChange(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
