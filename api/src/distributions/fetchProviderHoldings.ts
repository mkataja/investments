const MAX_BYTES = 20 * 1024 * 1024;
const USER_AGENT = "Mozilla/5.0 (compatible; investments-tracker/1.0)";

export async function fetchProviderHoldingsBytes(
  url: string,
): Promise<Uint8Array> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": USER_AGENT },
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
