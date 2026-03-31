const MAX_BYTES = 20 * 1024 * 1024;

function userAgentForHoldingsUrl(urlStr: string): string {
  const custom = process.env.SEC_EDGAR_USER_AGENT?.trim();
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    return "Mozilla/5.0 (compatible; investments-tracker/1.0)";
  }
  if (
    u.hostname.toLowerCase() === "www.sec.gov" ||
    u.hostname.toLowerCase() === "sec.gov"
  ) {
    return (
      custom ??
      "InvestmentsTracker/1.0 (set SEC_EDGAR_USER_AGENT to your org name and contact email per https://www.sec.gov/os/accessing-edgar-data)"
    );
  }
  return "Mozilla/5.0 (compatible; investments-tracker/1.0)";
}

export async function fetchProviderHoldingsBytes(
  url: string,
): Promise<Uint8Array> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": userAgentForHoldingsUrl(url) },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`Holdings download failed (HTTP ${res.status})`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) {
    throw new Error("Holdings file is too large");
  }
  if (buf.length === 0) {
    throw new Error("Holdings download was empty");
  }
  return buf;
}
