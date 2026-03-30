export type HoldingsProviderKind = "ishares_csv" | "ssga_xlsx";

function hostnameMatches(host: string, rootDomain: string): boolean {
  const h = host.toLowerCase();
  const r = rootDomain.toLowerCase();
  return h === r || h.endsWith(`.${r}`);
}

export function resolveHoldingsProviderKind(
  urlStr: string,
): HoldingsProviderKind | null {
  let u: URL;
  try {
    u = new URL(urlStr.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") {
    return null;
  }
  const host = u.hostname;
  if (hostnameMatches(host, "ishares.com")) {
    return "ishares_csv";
  }
  if (hostnameMatches(host, "ssga.com")) {
    return "ssga_xlsx";
  }
  return null;
}

export type ValidateHoldingsUrlResult =
  | {
      ok: true;
      normalized: string | null;
      provider: HoldingsProviderKind | null;
    }
  | { ok: false; message: string };

/**
 * Empty/null clears the URL. Non-empty must be HTTPS with a supported provider host.
 */
export function validateHoldingsDistributionUrl(
  raw: string | null | undefined,
): ValidateHoldingsUrlResult {
  if (raw == null) {
    return { ok: true, normalized: null, provider: null };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: true, normalized: null, provider: null };
  }
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return { ok: false, message: "Invalid holdings URL" };
  }
  if (u.protocol !== "https:") {
    return { ok: false, message: "Holdings URL must use HTTPS" };
  }
  const provider = resolveHoldingsProviderKind(u.href);
  if (!provider) {
    return {
      ok: false,
      message:
        "Unsupported holdings URL host. Use iShares (ishares.com) or SPDR / SSGA (ssga.com).",
    };
  }
  return { ok: true, normalized: u.toString(), provider };
}
