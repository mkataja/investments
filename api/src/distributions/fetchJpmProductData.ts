const MAX_BYTES = 5 * 1024 * 1024;

export async function fetchJpmProductDataJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; investments-tracker/1.0)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`JPM product-data request failed (HTTP ${res.status})`);
  }
  const text = await res.text();
  if (text.length > MAX_BYTES) {
    throw new Error("JPM product-data response is too large");
  }
  if (text.length === 0) {
    throw new Error("JPM product-data response was empty");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("JPM product-data response is not valid JSON");
  }
}
