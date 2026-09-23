const FLEX_BASE_URL =
  "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";

/** IBKR rejects Flex Web Service requests without a User-Agent header. */
const FLEX_USER_AGENT = "investments-tracker/1.0";

/** Error codes meaning "report not ready yet" or throttling; the request may be retried. */
const RETRYABLE_ERROR_CODES = new Set(["1001", "1009", "1018", "1019", "1021"]);

/** Keeps polling under the Flex Web Service limit of 10 requests per minute per token. */
const STATEMENT_POLL_DELAY_MS = 7_000;
const STATEMENT_POLL_MAX_ATTEMPTS = 17;

type FlexStatusResponse = {
  status: string | null;
  referenceCode: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  for (let attempt = 1; attempt <= STATEMENT_POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(STATEMENT_POLL_DELAY_MS);
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
