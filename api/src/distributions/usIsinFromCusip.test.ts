import { describe, expect, it } from "vitest";
import { computeUsIsinFromCusip9 } from "./usIsinFromCusip.js";

describe("computeUsIsinFromCusip9", () => {
  it("maps Apple CUSIP to the known US ISIN", () => {
    expect(computeUsIsinFromCusip9("037833100")).toBe("US0378331005");
  });

  it("returns null for invalid CUSIP", () => {
    expect(computeUsIsinFromCusip9("bad")).toBeNull();
  });
});
