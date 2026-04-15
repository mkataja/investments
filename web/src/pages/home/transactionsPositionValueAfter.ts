import { formatUnitPriceForDisplay } from "../../lib/numberFormat";
import type { HomeInstrument, HomeTransaction } from "./types";

/** JSON may expose numeric columns as numbers; DB strings may use comma decimals. */
export function parseTransactionNumericField(raw: string | number): number {
  if (typeof raw === "number") {
    return raw;
  }
  const s = raw.trim().replace(/\s+/g, "").replace(",", ".");
  return Number.parseFloat(s);
}

/**
 * For each transaction (in chronological order), the approximate position value in trade
 * currency right after that row: running quantity times this row's unit price for non-cash
 * (mark to last trade); running cash balance for cash accounts (signed sum of quantity ×
 * unit price per row, matching the Value column and cash notional).
 */
export function positionValueAfterLabelByTransactionId(
  transactions: HomeTransaction[],
  instrumentById: Map<number, HomeInstrument>,
): Map<number, string> {
  const sorted = [...transactions].sort((a, b) => {
    const c = a.tradeDate.localeCompare(b.tradeDate);
    return c !== 0 ? c : a.id - b.id;
  });

  return sorted.reduce<{
    labels: Map<number, string>;
    runningQty: Map<number, number>;
  }>(
    (acc, t) => {
      const q = parseTransactionNumericField(t.quantity);
      const p = parseTransactionNumericField(t.unitPrice);
      const prev = acc.runningQty.get(t.instrumentId) ?? 0;
      const kind = instrumentById.get(t.instrumentId)?.kind;
      let next = prev;
      if (Number.isFinite(q) && Number.isFinite(p)) {
        if (kind === "cash_account") {
          const delta = q * p;
          next = prev + (t.side === "buy" ? delta : -delta);
        } else {
          next = prev + (t.side === "buy" ? q : -q);
        }
        acc.runningQty.set(t.instrumentId, next);
      }

      let label: string;
      if (!Number.isFinite(next)) {
        label = "-";
      } else if (kind === "cash_account") {
        label = `${formatUnitPriceForDisplay(String(next))} ${t.currency}`;
      } else if (!Number.isFinite(p)) {
        label = "-";
      } else {
        label = `${formatUnitPriceForDisplay(String(next * p))} ${t.currency}`;
      }
      acc.labels.set(t.id, label);
      return acc;
    },
    { labels: new Map(), runningQty: new Map() },
  ).labels;
}
