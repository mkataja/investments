import type { ChartResultArray } from "yahoo-finance2/modules/chart";
import { yahooFinance } from "./yahooClient.js";
import { acquireYahooIntervalSlot, withYahooRetries } from "./yahooUpstream.js";

/** Daily bars (`interval: 1d`, `return: "array"`). Serialized with other Yahoo traffic. */
export async function fetchYahooChartDailyBars(
  symbol: string,
  options: {
    period1: Date | string | number;
    period2?: Date | string | number;
  },
): Promise<ChartResultArray> {
  await acquireYahooIntervalSlot();
  return withYahooRetries(() =>
    yahooFinance.chart(symbol, {
      ...options,
      interval: "1d",
      return: "array",
    }),
  ) as Promise<ChartResultArray>;
}
