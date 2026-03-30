/**
 * True when an iShares / SSGA holdings row is cash or cash-equivalent (not a geographic allocation).
 */
export function isCashAssetLabel(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (!s) {
    return false;
  }
  if (s === "cash") {
    return true;
  }
  if (s.includes("money market")) {
    return true;
  }
  if (s.includes("cash equivalent")) {
    return true;
  }
  if (s.includes("short-term investment")) {
    return true;
  }
  return false;
}
