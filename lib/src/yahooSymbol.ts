/**
 * Canonical storage form for Yahoo tickers: trimmed and uppercased (e.g. `sxr8.de` → `SXR8.DE`).
 */
export function normalizeYahooSymbolForStorage(symbol: string): string {
  return symbol.trim().toUpperCase();
}
