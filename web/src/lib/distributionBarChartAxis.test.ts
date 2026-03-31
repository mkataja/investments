import { describe, expect, it } from "vitest";
import {
  distributionBarYAxisFromMax,
  secondLargestMainPortfolioBarValue,
} from "./distributionBarChartAxis";

describe("secondLargestMainPortfolioBarValue", () => {
  it("returns the second-largest value in single mode", () => {
    expect(
      secondLargestMainPortfolioBarValue(
        [{ value: 0.5 }, { value: 0.3 }, { value: 0.1 }],
        false,
      ),
    ).toBe(0.3);
  });

  it("returns undefined when fewer than two values", () => {
    expect(secondLargestMainPortfolioBarValue([{ value: 0.5 }], false)).toBe(
      undefined,
    );
  });

  it("uses only primary in compare mode, ignoring compare portfolio", () => {
    expect(
      secondLargestMainPortfolioBarValue(
        [
          { primary: 0.6, compare: 0.55 },
          { primary: 0.1, compare: 0.5 },
        ],
        true,
      ),
    ).toBe(0.1);
  });
});

describe("distributionBarYAxisFromMax", () => {
  it("rounds domain up to nice ticks for a second-max target", () => {
    const axis = distributionBarYAxisFromMax(0.3, 5);
    expect(axis.domain[1]).toBeGreaterThanOrEqual(0.3);
    expect(axis.ticks[axis.ticks.length - 1]).toBe(axis.domain[1]);
  });
});
