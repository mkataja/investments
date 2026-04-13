import {
  isAmundiEtfProductSiteHostname,
  parseAmundiEtfProductPageIsin,
} from "./amundiEtfProductUrl.js";

export type HoldingsProviderKind =
  | "ishares_csv"
  | "ssga_xlsx"
  | "xtrackers_xlsx"
  | "jpm_xlsx"
  | "sec_13f_xml"
  | "vanguard_uk_gpx"
  | "amundi_etf_api";

export { isAmundiEtfProductSiteHostname, parseAmundiEtfProductPageIsin };

/** UK Professional fund page path: `/professional/product/{etf|fund|mf}/{assetClass}/{portId}/{slug}`. */
const VANGUARD_UK_PROFESSIONAL_PRODUCT_PATH =
  /^\/professional\/product\/(?:etf|fund|mf)\/[^/]+\/(\d+)\/[^/]+\/?$/;

/**
 * Returns Vanguard UK **port id** (e.g. `9678`) when `url` is a supported
 * `www.vanguard.co.uk` professional product URL; otherwise `null`.
 */
export function parseVanguardUkProfessionalHoldingsPortId(
  urlStr: string,
): string | null {
  let u: URL;
  try {
    u = new URL(urlStr.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") {
    return null;
  }
  if (u.hostname.toLowerCase() !== "www.vanguard.co.uk") {
    return null;
  }
  const m = u.pathname.match(VANGUARD_UK_PROFESSIONAL_PRODUCT_PATH);
  return m?.[1] ?? null;
}

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
  if (host.toLowerCase() === "www.vanguard.co.uk") {
    return parseVanguardUkProfessionalHoldingsPortId(u.href)
      ? "vanguard_uk_gpx"
      : null;
  }
  if (
    isAmundiEtfProductSiteHostname(host) &&
    parseAmundiEtfProductPageIsin(u.href)
  ) {
    return "amundi_etf_api";
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
      message: "Unsupported holdings URL",
    };
  }
  return { ok: true, normalized: u.toString(), provider };
}

const JPM_PRODUCT_DATA_PATH = "/fundsmarketinghandler/product-data";

export type ValidateProviderBreakdownUrlResult =
  | { ok: true; normalized: string | null }
  | { ok: false; message: string };

/**
 * Empty/null clears. Non-empty must be HTTPS `am.jpmorgan.com` ... `/FundsMarketingHandler/product-data` (JSON).
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
        "Unsupported provider breakdown URL. Use J.P. Morgan AM JSON: https://am.jpmorgan.com/FundsMarketingHandler/product-data?... (see AGENTS.md).",
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
