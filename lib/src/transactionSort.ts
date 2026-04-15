/** Zero-padded ordinal for `trade_order_key` (best-effort display order within a calendar day). */
export const TRADE_ORDER_ORDINAL_PAD = 6;

export function formatTradeOrderOrdinal(index: number): string {
  if (!Number.isFinite(index) || index < 0 || index > 999_999) {
    throw new RangeError("trade order ordinal out of range");
  }
  return String(Math.trunc(index)).padStart(TRADE_ORDER_ORDINAL_PAD, "0");
}

/**
 * Mutates `rows` in array order: sets `tradeOrderKey` from a per-**calendar day** counter (UTC
 * `yyyy-mm-dd` from `tradeDate.slice(0, 10)`). First row encountered for that day gets `000000`.
 */
export function assignTradeOrderKeysInEncounterOrder<
  T extends { tradeDate: string; tradeOrderKey?: string },
>(rows: T[]): void {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const day = r.tradeDate.slice(0, 10);
    const n = counts.get(day) ?? 0;
    counts.set(day, n + 1);
    r.tradeOrderKey = formatTradeOrderOrdinal(n);
  }
}

export type TransactionSortTiebreak = {
  tradeDate: string;
  tradeOrderKey?: string | null;
  id: number;
};

/** Newest `tradeDate` first; then source encounter order within a day; then higher `id`. */
export function compareTransactionsNewestFirst(
  a: TransactionSortTiebreak,
  b: TransactionSortTiebreak,
): number {
  const td = b.tradeDate.localeCompare(a.tradeDate);
  if (td !== 0) {
    return td;
  }
  const ka = a.tradeOrderKey ?? null;
  const kb = b.tradeOrderKey ?? null;
  if (ka != null && kb != null) {
    const c = ka.localeCompare(kb);
    if (c !== 0) {
      return c;
    }
  } else if ((ka != null) !== (kb != null)) {
    return ka != null ? -1 : 1;
  }
  return b.id - a.id;
}

/** Oldest `tradeDate` first; then reverse encounter order within a day; then lower `id`. */
export function compareTransactionsChronological(
  a: TransactionSortTiebreak,
  b: TransactionSortTiebreak,
): number {
  const td = a.tradeDate.localeCompare(b.tradeDate);
  if (td !== 0) {
    return td;
  }
  const ka = a.tradeOrderKey ?? null;
  const kb = b.tradeOrderKey ?? null;
  if (ka != null && kb != null) {
    const c = kb.localeCompare(ka);
    if (c !== 0) {
      return c;
    }
  } else if ((ka != null) !== (kb != null)) {
    return ka != null ? -1 : 1;
  }
  return a.id - b.id;
}
