import { useMemo } from "react";
import { CopyToClipboardButton } from "../../components/CopyToClipboardButton";
import { Modal } from "../../components/Modal";
import { formatToPercentage } from "../../lib/numberFormat";
import { instrumentTickerCell } from "./instrumentTickerCell";
import type { HomeInstrument, PortfolioDistributions } from "./types";

type PortfolioPosition = PortfolioDistributions["positions"][number];

type ExportHoldingsModalProps = {
  open: boolean;
  onClose: () => void;
  positions: PortfolioDistributions["positions"];
  instrumentById: Map<number, HomeInstrument>;
  instrumentTickerById: Map<number, string | null>;
};

function holdingExportLabel(
  p: PortfolioPosition,
  instrumentById: Map<number, HomeInstrument>,
  instrumentTickerById: Map<number, string | null>,
): string {
  const t = instrumentTickerCell(
    p.instrumentId,
    instrumentById,
    instrumentTickerById,
  );
  return t !== "-" ? `${p.displayName} (${t})` : p.displayName;
}

type HoldingsExportRow = { label: string; valueEur: number };

function buildHoldingsExportRows(
  positions: PortfolioPosition[],
  instrumentById: Map<number, HomeInstrument>,
  instrumentTickerById: Map<number, string | null>,
): HoldingsExportRow[] {
  if (positions.length === 0) {
    return [];
  }
  const nonCash = positions.filter((p) => p.assetClass !== "cash_account");
  const cashPositions = positions.filter(
    (p) => p.assetClass === "cash_account",
  );
  const cashValueEur = cashPositions.reduce((s, p) => s + p.valueEur, 0);
  const rows: HoldingsExportRow[] = nonCash.map((p) => ({
    label: holdingExportLabel(p, instrumentById, instrumentTickerById),
    valueEur: p.valueEur,
  }));
  if (cashPositions.length > 0) {
    rows.push({ label: "Cash", valueEur: cashValueEur });
  }
  return rows.sort((a, b) => b.valueEur - a.valueEur);
}

function buildHoldingsExportText(
  positions: PortfolioPosition[],
  instrumentById: Map<number, HomeInstrument>,
  instrumentTickerById: Map<number, string | null>,
): string {
  const open = positions.filter((p) => Math.abs(p.valueEur) >= 0.01);
  if (open.length === 0) {
    return "No holdings.";
  }
  const totalEur = open.reduce((s, p) => s + p.valueEur, 0);
  const rows = buildHoldingsExportRows(
    open,
    instrumentById,
    instrumentTickerById,
  );
  return rows
    .map((r) => {
      const w01 = totalEur > 0 ? r.valueEur / totalEur : 0;
      return `${r.label}\t${formatToPercentage(w01, { decimalPlaces: 1 })}`;
    })
    .join("\n");
}

export function ExportHoldingsModal({
  open,
  onClose,
  positions,
  instrumentById,
  instrumentTickerById,
}: ExportHoldingsModalProps) {
  const text = useMemo(
    () =>
      buildHoldingsExportText(positions, instrumentById, instrumentTickerById),
    [positions, instrumentById, instrumentTickerById],
  );

  return (
    <Modal
      title="Export holdings"
      open={open}
      onClose={onClose}
      dialogClassName="max-w-4xl"
    >
      <div className="flex justify-end mb-2">
        <CopyToClipboardButton text={text} />
      </div>
      <textarea
        readOnly
        rows={20}
        className="form-control font-mono text-sm min-h-[16rem] resize-y"
        value={text}
        onFocus={(e) => {
          e.currentTarget.select();
        }}
      />
    </Modal>
  );
}
