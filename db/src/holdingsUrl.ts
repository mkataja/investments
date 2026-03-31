export type HoldingsProviderKind =
  | "ishares_csv"
  | "ssga_xlsx"
  | "xtrackers_xlsx"
  | "jpm_xlsx"
  | "sec_13f_xml";

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
  if (hostnameMatches(host, "dws.com")) {
    return "xtrackers_xlsx";
  }
  if (hostnameMatches(host, "jpmorgan.com")) {
    return "jpm_xlsx";
  }
  if (hostnameMatches(host, "sec.gov")) {
    const p = u.pathname.toLowerCase();
    if (
      p.includes("/archives/edgar/data/") &&
      (p.endsWith(".xml") || p.endsWith(".xml/"))
    ) {
      return "sec_13f_xml";
    }
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
        "Unsupported holdings URL host. Use iShares (ishares.com), SPDR / SSGA (ssga.com), Xtrackers / DWS (dws.com), J.P. Morgan (am.jpmorgan.com), or an SEC EDGAR 13F information table XML (sec.gov …/Archives/edgar/data/…/*.xml).",
    };
  }
  return { ok: true, normalized: u.toString(), provider };
}

const JPM_PRODUCT_DATA_PATH = "/fundsmarketinghandler/product-data";

export type ValidateProviderBreakdownUrlResult =
  | { ok: true; normalized: string | null }
  | { ok: false; message: string };

/**
 * Empty/null clears. Non-empty must be HTTPS `am.jpmorgan.com` … `/FundsMarketingHandler/product-data` (JSON).
 */
export function validateProviderBreakdownDataUrl(
  raw: string | null | undefined,
): ValidateProviderBreakdownUrlResult {
  if (raw == null) {
    return { ok: true, normalized: null };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: true, normalized: null };
  }
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return { ok: false, message: "Invalid provider breakdown data URL" };
  }
  if (u.protocol !== "https:") {
    return {
      ok: false,
      message: "Provider breakdown data URL must use HTTPS",
    };
  }
  if (!hostnameMatches(u.hostname, "jpmorgan.com")) {
    return {
      ok: false,
      message:
        "Unsupported provider breakdown URL. Use J.P. Morgan AM JSON: https://am.jpmorgan.com/FundsMarketingHandler/product-data?… (see AGENTS.md).",
    };
  }
  const pathLower = u.pathname.toLowerCase();
  if (!pathLower.endsWith(JPM_PRODUCT_DATA_PATH)) {
    return {
      ok: false,
      message:
        "Provider breakdown URL path must be /FundsMarketingHandler/product-data",
    };
  }
  return { ok: true, normalized: u.toString() };
}
