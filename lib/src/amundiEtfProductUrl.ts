import { normalizeIsinForStorage } from "./isin.js";

/**
 * Hostnames for Amundi ETF country sites (`www.amundietf.nl`, `www.amundietf.co.uk`, ...).
 * Excludes bare `amundietf.com` marketing domains without per-country product API.
 */
export function isAmundiEtfProductSiteHostname(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "amundietf.com" || h === "www.amundietf.com") {
    return false;
  }
  return (
    /^www\.amundietf\.[a-z0-9.-]+$/i.test(h) ||
    /^amundietf\.[a-z0-9.-]+$/i.test(h)
  );
}

/**
 * Extracts fund **ISIN** from an Amundi ETF product page URL (last path segment), e.g.
 * `.../products/equity/foo/ie0003xja0j9` → `IE0003XJA0J9`.
 * Path must contain `/products/` (individual or professional).
 */
export function parseAmundiEtfProductPageIsin(urlStr: string): string | null {
  let u: URL;
  try {
    u = new URL(urlStr.trim());
  } catch {
    return null;
  }
  if (!isAmundiEtfProductSiteHostname(u.hostname)) {
    return null;
  }
  if (!u.pathname.toLowerCase().includes("/products/")) {
    return null;
  }
  const segments = u.pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return null;
  }
  const last = segments[segments.length - 1] ?? "";
  return normalizeIsinForStorage(last);
}
