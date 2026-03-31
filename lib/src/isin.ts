/**
 * Normalize to a 12-character uppercase ISO 6166 ISIN, or null if invalid / empty.
 */
export function normalizeIsinForStorage(
  raw: string | null | undefined,
): string | null {
  if (raw == null) {
    return null;
  }
  const s = raw.trim().toUpperCase();
  if (!/^[A-Z0-9]{12}$/.test(s)) {
    return null;
  }
  return s;
}
