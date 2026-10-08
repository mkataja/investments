const FLEX_BASE_URL =
  "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";

/** IBKR rejects Flex Web Service requests without a User-Agent header. */
const FLEX_USER_AGENT = "investments-tracker/1.0";

/** Error codes meaning "report not ready yet" or throttling; the request may be retried. */
const RETRYABLE_ERROR_CODES = new Set(["1001", "1009", "1018", "1019", "1021"]);

/** Flex Web Service limits per token: one request per second and 10 requests per minute. */
const RATE_LIMIT_MIN_GAP_MS = 1_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;

/** Delays before each GetStatement poll; the last one repeats until the timeout. */
const STATEMENT_POLL_DELAYS_MS = [1_000, 2_000, 3_000, 5_000];
const STATEMENT_POLL_TIMEOUT_MS = 120_000;

const requestTimesByToken = new Map<string, number[]>();

type FlexStatusResponse = {
  status: string | null;
  referenceCode: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Waits until a request for `token` fits the rate limits, then records it. */
async function acquireRequestSlot(token: string): Promise<void> {
  for (;;) {
    const now = Date.now();
    const recent = (requestTimesByToken.get(token) ?? []).filter(
      (t) => t > now - RATE_LIMIT_WINDOW_MS,
    );
    const last = recent.at(-1);
    const oldest = recent[0];
    const waitMs = Math.max(
      last === undefined ? 0 : last + RATE_LIMIT_MIN_GAP_MS - now,
      oldest !== undefined && recent.length >= RATE_LIMIT_MAX_REQUESTS
        ? oldest + RATE_LIMIT_WINDOW_MS - now
        : 0,
    );
    if (waitMs <= 0) {
      requestTimesByToken.set(token, [...recent, now]);
      return;
    }
    requestTimesByToken.set(token, recent);
    await sleep(waitMs);
  }
}

function readXmlTag(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
  return m?.[1]?.trim() ?? null;
}

function parseFlexStatusResponse(xml: string): FlexStatusResponse | null {
  if (!xml.trimStart().startsWith("<FlexStatementResponse")) {
    return null;
  }
  return {
    status: readXmlTag(xml, "Status"),
    referenceCode: readXmlTag(xml, "ReferenceCode"),
    errorCode: readXmlTag(xml, "ErrorCode"),
    errorMessage: readXmlTag(xml, "ErrorMessage"),
  };
}

function flexErrorMessage(step: string, res: FlexStatusResponse): string {
  return `IBKR Flex ${step} failed (${res.errorCode ?? "no code"}): ${res.errorMessage ?? "unknown error"}`;
}

async function flexGet(
  endpoint: "SendRequest" | "GetStatement",
  token: string,
  q: string,
): Promise<string> {
  const url = new URL(`${FLEX_BASE_URL}/${endpoint}`);
  url.searchParams.set("t", token);
  url.searchParams.set("q", q);
  url.searchParams.set("v", "3");
  await acquireRequestSlot(token);
  const res = await fetch(url, { headers: { "User-Agent": FLEX_USER_AGENT } });
  if (!res.ok) {
    throw new Error(`IBKR Flex ${endpoint} returned HTTP ${res.status}`);
  }
  return res.text();
}

async function requestReferenceCode(
  token: string,
  queryId: string,
): Promise<string> {
  const xml = await flexGet("SendRequest", token, queryId);
  const res = parseFlexStatusResponse(xml);
  if (res === null) {
    throw new Error("IBKR Flex SendRequest returned an unexpected response");
  }
  if (res.status !== "Success" || res.referenceCode === null) {
    throw new Error(flexErrorMessage("SendRequest", res));
  }
  return res.referenceCode;
}

/** Runs a saved Flex Query and returns its report text (CSV when the query is set to CSV). */
export async function fetchIbkrFlexReport(
  token: string,
  queryId: string,
): Promise<string> {
  const referenceCode = await requestReferenceCode(token, queryId);
  const deadline = Date.now() + STATEMENT_POLL_TIMEOUT_MS;
  for (let attempt = 0; Date.now() < deadline; attempt++) {
    await sleep(
      STATEMENT_POLL_DELAYS_MS[attempt] ?? STATEMENT_POLL_DELAYS_MS.at(-1) ?? 0,
    );
    const body = await flexGet("GetStatement", token, referenceCode);
    const res = parseFlexStatusResponse(body);
    if (res === null) {
      if (body.trimStart().startsWith("<")) {
        throw new Error(
          `IBKR Flex Query ${queryId} returned XML; set its format to CSV`,
        );
      }
      return body;
    }
    if (res.errorCode === null || !RETRYABLE_ERROR_CODES.has(res.errorCode)) {
      throw new Error(flexErrorMessage("GetStatement", res));
    }
  }
  throw new Error(`IBKR Flex Query ${queryId} report was not ready in time`);
}
