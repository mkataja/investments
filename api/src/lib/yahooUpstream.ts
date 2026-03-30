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
