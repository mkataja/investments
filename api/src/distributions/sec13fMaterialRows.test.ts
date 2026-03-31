import { describe, expect, it } from "vitest";
import type { Sec13FInfoTableRow } from "./parseSec13FInfoTableXml.js";
import { filterSec13FRowsByMinFilingWeight } from "./sec13fMaterialRows.js";

function row(cusip: string, valueRaw: number): Sec13FInfoTableRow {
  return {
    nameOfIssuer: "",
    cusip,
    valueRaw,
    putCall: null,
  };
}

describe("filterSec13FRowsByMinFilingWeight", () => {
  it("drops rows below 0.25% of filing total", () => {
    const rows = [
      row("111111111", 990_000),
      row("222222222", 9_900),
      row("333333333", 100),
    ];
    const out = filterSec13FRowsByMinFilingWeight(rows);
    expect(out.map((r) => r.cusip).sort()).toEqual(["111111111", "222222222"]);
  });

  it("returns all rows when every line would be filtered (fallback)", () => {
    const rows = [row("111111111", 100), row("222222222", 100)];
    const out = filterSec13FRowsByMinFilingWeight(rows);
    expect(out).toHaveLength(2);
  });
});
