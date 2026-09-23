import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchIbkrFlexReport } from "./ibkrFlexClient.js";

const SEND_REQUEST_OK = `<FlexStatementResponse timestamp="23 September, 2026 09:00 AM EDT">
<Status>Success</Status>
<ReferenceCode>1234567890</ReferenceCode>
<Url>https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement</Url>
</FlexStatementResponse>`;

const IN_PROGRESS = `<FlexStatementResponse timestamp="23 September, 2026 09:00 AM EDT">
<Status>Warn</Status>
<ErrorCode>1019</ErrorCode>
<ErrorMessage>Statement generation in progress. Please try again shortly.</ErrorMessage>
</FlexStatementResponse>`;

const TOKEN_EXPIRED = `<FlexStatementResponse timestamp="23 September, 2026 09:00 AM EDT">
<Status>Fail</Status>
<ErrorCode>1012</ErrorCode>
<ErrorMessage>Token has expired.</ErrorMessage>
</FlexStatementResponse>`;

const CSV = `"ClientAccountID","Date/Time","Symbol"\n"U1","2026-08-31 07:48:24 EDT","WEBN"\n`;

function mockFetchResponses(bodies: string[]) {
  const fetchMock = vi.fn();
  for (const body of bodies) {
    fetchMock.mockResolvedValueOnce(new Response(body, { status: 200 }));
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function runWithTimers<T>(promise: Promise<T>): Promise<T> {
  const settled = promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await vi.runAllTimersAsync();
  const out = await settled;
  if (!out.ok) {
    throw out.error;
  }
  return out.value;
}

describe("fetchIbkrFlexReport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("polls until the statement is ready and returns the CSV", async () => {
    const fetchMock = mockFetchResponses([SEND_REQUEST_OK, IN_PROGRESS, CSV]);
    const csv = await runWithTimers(fetchIbkrFlexReport("tok", "42"));
    expect(csv).toBe(CSV);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const statementUrl = new URL(String(fetchMock.mock.calls[2]?.[0]));
    expect(statementUrl.pathname).toMatch(/GetStatement$/);
    expect(statementUrl.searchParams.get("q")).toBe("1234567890");
  });

  it("fails on a non-retryable SendRequest error", async () => {
    mockFetchResponses([TOKEN_EXPIRED]);
    await expect(
      runWithTimers(fetchIbkrFlexReport("tok", "42")),
    ).rejects.toThrow(
      "IBKR Flex SendRequest failed (1012): Token has expired.",
    );
  });

  it("rejects XML reports", async () => {
    mockFetchResponses([
      SEND_REQUEST_OK,
      "<FlexQueryResponse></FlexQueryResponse>",
    ]);
    await expect(
      runWithTimers(fetchIbkrFlexReport("tok", "42")),
    ).rejects.toThrow("set its format to CSV");
  });
});
