const RATE_LIMIT_MESSAGE =
  "Yahoo Finance rate limit or temporary block - try again later.";

function errorText(e: unknown): string {
  if (typeof e === "string") {
    return e;
  }
  if (e instanceof Error) {
    return e.message;
  }
  return String(e);
}

function httpStatusCode(e: unknown): number | undefined {
  if (
    e &&
    typeof e === "object" &&
    "code" in e &&
    typeof (e as { code: unknown }).code === "number"
  ) {
    return (e as { code: number }).code;
  }
  return undefined;
}

export function formatYahooUpstreamError(e: unknown): {
  message: string;
  status: 503 | 502;
} {
  const raw = errorText(e);
  const code = httpStatusCode(e);
  const haystack = `${raw} ${code ?? ""}`;
  const looksRateLimited =
    code === 429 ||
    /too many requests/i.test(haystack) ||
    (/not valid json/i.test(raw) && /too many/i.test(raw));
  if (looksRateLimited) {
    return { message: RATE_LIMIT_MESSAGE, status: 503 };
  }
  return {
    message: raw || "Yahoo Finance request failed",
    status: 502,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Same default as `YAHOO_MIN_INTERVAL_MS` in distribution cache refresh (ms between Yahoo calls). */
export function yahooRefreshGapMs(): number {
  const n = Number.parseInt(process.env.YAHOO_MIN_INTERVAL_MS ?? "900", 10);
  return Number.isFinite(n) && n >= 0 ? n : 900;
}

let yahooIntervalChain: Promise<void> = Promise.resolve();
let lastYahooCallMs = 0;

/**
 * Serializes Yahoo `quoteSummary` traffic and enforces a minimum gap between calls (equity + FX).
 */
export async function acquireYahooIntervalSlot(): Promise<void> {
  const gap = yahooRefreshGapMs();
  const run = async (): Promise<void> => {
    const now = Date.now();
    const wait = Math.max(0, lastYahooCallMs + gap - now);
    if (wait > 0) {
      await sleep(wait);
    }
    lastYahooCallMs = Date.now();
  };
  const next = yahooIntervalChain.then(run, run);
  yahooIntervalChain = next.catch(() => {});
  await next;
}

export async function withYahooRetries<T>(
  fn: () => Promise<T>,
  options?: { maxAttempts?: number },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  let last: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const { status } = formatYahooUpstreamError(e);
      if (status !== 503 || attempt === maxAttempts - 1) {
        throw e;
      }
      const base = 800 * 2 ** attempt;
      const jitter = Math.floor(Math.random() * 400);
      await sleep(base + jitter);
    }
  }
  throw last;
}
