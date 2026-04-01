import {
  readStoredPortfolioId,
  writeStoredPortfolioId,
} from "../../lib/portfolioSelection";
import type { PortfolioEntity } from "../home/types";

type ImportPortfolioPickerProps = {
  portfolios: PortfolioEntity[];
  livePortfolios: PortfolioEntity[];
  importPortfolioId: number | null;
  onImportPortfolioIdChange: (id: number | null) => void;
};

export function ImportPortfolioPicker({
  portfolios,
  livePortfolios,
  importPortfolioId,
  onImportPortfolioIdChange,
}: ImportPortfolioPickerProps) {
  if (livePortfolios.length > 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block text-sm text-slate-700">
          Import into portfolio
          <select
            className="mt-1 block w-full max-w-md border border-slate-300 rounded px-2 py-1.5 text-sm bg-white"
            value={importPortfolioId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              const id = v === "" ? null : Number.parseInt(v, 10);
              if (id != null && Number.isFinite(id)) {
                onImportPortfolioIdChange(id);
                writeStoredPortfolioId(id);
              }
            }}
          >
            {livePortfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }
  if (portfolios.length > 0) {
    return (
      <p className="text-sm text-slate-600">
        Add a live portfolio before importing (benchmark portfolios cannot hold
        transactions).
      </p>
    );
  }
  return null;
}

export function pickInitialImportPortfolioId(
  list: PortfolioEntity[],
): number | null {
  const stored = readStoredPortfolioId();
  const storedRow = list.find((p) => p.id === stored);
  return storedRow && (storedRow.kind ?? "live") !== "benchmark"
    ? storedRow.id
    : (list.find((p) => (p.kind ?? "live") !== "benchmark")?.id ?? null);
}
