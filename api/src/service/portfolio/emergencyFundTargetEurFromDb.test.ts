import { describe, expect, it } from "vitest";
import { emergencyFundTargetEurFromDb } from "./emergencyFundTargetEurFromDb.js";

describe("emergencyFundTargetEurFromDb", () => {
  it("parses numeric strings from Postgres numeric", () => {
    expect(emergencyFundTargetEurFromDb("10000.00000000")).toBe(10000);
  });

  it("returns 0 for invalid values", () => {
    expect(emergencyFundTargetEurFromDb("")).toBe(0);
    expect(emergencyFundTargetEurFromDb(Number.NaN)).toBe(0);
    expect(emergencyFundTargetEurFromDb(-1)).toBe(0);
  });
});
