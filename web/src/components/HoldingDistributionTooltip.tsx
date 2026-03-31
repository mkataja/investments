import {
  type DistributionPayload,
  instrumentTickerDisplay,
} from "@investments/lib";
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useEffect,
} from "react";
import { createPortal } from "react-dom";
import {
  CashAccountDistributionSummary,
  DistributionSummary,
} from "./InstrumentDistributionSummary";

const HOLDING_DIST_TOOLTIP_OFFSET = 12;

export type HoldingDistributionTooltipState = {
  instrumentId: number;
  displayName: string;
  x: number;
  y: number;
};

export type HoldingTooltipInstrument = {
  kind: string;
  displayName: string;
  yahooSymbol: string | null;
  seligsonFund: { id: number; fid: number; name: string } | null;
  cashGeoKey?: string | null;
  distribution: {
    fetchedAt: string;
    source: string;
    payload: DistributionPayload;
  } | null;
};

function HoldingDistributionTooltipBody(
  inst: HoldingTooltipInstrument | undefined,
  displayNameFallback: string,
): ReactNode {
  const name = inst?.displayName ?? displayNameFallback;
  const equityTicker =
    inst != null && (inst.kind === "etf" || inst.kind === "stock")
      ? instrumentTickerDisplay(inst)
      : null;
  const showEquityTicker =
    typeof equityTicker === "string" && equityTicker.trim().length > 0;

  const heading = (
    <div className="mb-2 border-b border-slate-200 pb-2 font-sans">
      <p className="font-bold text-slate-900 text-md leading-snug">{name}</p>
      {showEquityTicker ? (
        <p className="text-xs text-slate-600 tabular-nums mt-0.5">
          {equityTicker}
        </p>
      ) : null}
    </div>
  );

  if (inst == null) {
    return (
      <>
        {heading}
        <span className="text-slate-400 text-xs font-sans">
          No instrument data
        </span>
      </>
    );
  }
  if (inst.kind === "cash_account") {
    return (
      <>
        {heading}
        <div className="font-mono">
          <CashAccountDistributionSummary cashGeoKey={inst.cashGeoKey ?? ""} />
        </div>
      </>
    );
  }
  if (inst.distribution) {
    return (
      <>
        {heading}
        <div className="font-mono">
          <DistributionSummary payload={inst.distribution.payload} />
        </div>
      </>
    );
  }
  return (
    <>
      {heading}
      <span className="text-slate-400 text-xs font-sans">No cache yet</span>
    </>
  );
}

export function HoldingDistributionTooltipLayer({
  tooltip,
  setTooltip,
  resolveInstrument,
}: {
  tooltip: HoldingDistributionTooltipState | null;
  setTooltip: Dispatch<SetStateAction<HoldingDistributionTooltipState | null>>;
  resolveInstrument: (id: number) => HoldingTooltipInstrument | undefined;
}) {
  const activeId = tooltip?.instrumentId ?? null;

  useEffect(() => {
    if (activeId == null) return;
    const onMove = (e: MouseEvent) => {
      setTooltip((t) =>
        t != null ? { ...t, x: e.clientX, y: e.clientY } : null,
      );
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [activeId, setTooltip]);

  if (tooltip == null) return null;

  return createPortal(
    <div
      role="tooltip"
      style={{
        position: "fixed",
        left: tooltip.x + HOLDING_DIST_TOOLTIP_OFFSET,
        top: tooltip.y + HOLDING_DIST_TOOLTIP_OFFSET,
        zIndex: 50,
        pointerEvents: "none",
      }}
      className="max-w-md max-h-[min(70vh,28rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-lg text-left"
    >
      {HoldingDistributionTooltipBody(
        resolveInstrument(tooltip.instrumentId),
        tooltip.displayName,
      )}
    </div>,
    document.body,
  );
}
