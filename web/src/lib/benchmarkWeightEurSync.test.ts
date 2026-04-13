import { describe, expect, it } from "vitest";
import {
  applyAbsoluteEurEdit,
  eurForRowIndex,
  formatWeightMaxThreeDecimals,
  normalizeWeightInputMax3Decimals,
  parseBenchmarkTotalEur,
  removeBenchmarkRowKeepingPeerEur,
  sumOtherContributingRawWeights,
  weightStringsSummingTo100,
} from "./benchmarkWeightEurSync";

const row = (
  instrumentId: number | "",
  weightStr: string,
): { instrumentId: number | ""; weightStr: string } => ({
  instrumentId,
  weightStr,
});

describe("parseBenchmarkTotalEur", () => {
  it("returns positive finite values", () => {
    expect(parseBenchmarkTotalEur("10000")).toBe(10000);
    expect(parseBenchmarkTotalEur("12,5")).toBe(12.5);
  });
  it("returns null for non-positive or invalid", () => {
    expect(parseBenchmarkTotalEur("0")).toBeNull();
    expect(parseBenchmarkTotalEur("-1")).toBeNull();
    expect(parseBenchmarkTotalEur("")).toBeNull();
  });
});

describe("eurForRowIndex", () => {
  it("splits total by raw weight share", () => {
    const rows = [row(1, "3"), row(2, "1")];
    expect(eurForRowIndex(rows, 0, 10000)).toBe(7500);
    expect(eurForRowIndex(rows, 1, 10000)).toBe(2500);
  });
  it("single contributing row gets full total", () => {
    const rows = [row(1, "42")];
    expect(eurForRowIndex(rows, 0, 10000)).toBe(10000);
  });
  it("returns null when total invalid or row not contributing", () => {
    const rows = [row(1, "1"), row(2, "1")];
    expect(eurForRowIndex(rows, 0, null)).toBeNull();
    expect(eurForRowIndex(rows, 0, 0)).toBeNull();
    expect(eurForRowIndex([row("", "1")], 0, 10000)).toBeNull();
    expect(eurForRowIndex([row(1, "0")], 0, 10000)).toBeNull();
  });
});

describe("sumOtherContributingRawWeights", () => {
  it("sums others only", () => {
    const rows = [row(1, "10"), row(2, "5"), row(3, "3")];
    expect(sumOtherContributingRawWeights(rows, 0)).toBe(8);
    expect(sumOtherContributingRawWeights(rows, 1)).toBe(13);
  });
});

describe("formatWeightMaxThreeDecimals", () => {
  it("limits to three decimal places", () => {
    expect(formatWeightMaxThreeDecimals(12.3456)).toBe("12.346");
    expect(formatWeightMaxThreeDecimals(10)).toBe("10");
  });
});

describe("normalizeWeightInputMax3Decimals", () => {
  it("leaves empty or invalid input unchanged", () => {
    expect(normalizeWeightInputMax3Decimals("")).toBe("");
    expect(normalizeWeightInputMax3Decimals("abc")).toBe("abc");
  });
});

describe("weightStringsSummingTo100", () => {
  it("returns one row as 100", () => {
    expect(weightStringsSummingTo100([5000], 5000)).toEqual(["100"]);
  });
  it("splits into parts that sum to 100", () => {
    const ws = weightStringsSummingTo100([7500, 2500], 10000);
    expect(ws.length).toBe(2);
    const sum = ws.reduce(
      (a, s) => a + Number.parseFloat(s.replace(",", ".")),
      0,
    );
    expect(sum).toBeCloseTo(100, 10);
  });
});

function sumParsedWeights(rows: { weightStr: string }[]): number {
  return rows.reduce(
    (a, r) => a + Number.parseFloat(r.weightStr.trim().replace(",", ".")),
    0,
  );
}

describe("applyAbsoluteEurEdit", () => {
  const t = 10000;
  it("keeps other rows EUR and raises total when one line EUR drops", () => {
    const rows = [row(1, "3"), row(2, "1")];
    const out = applyAbsoluteEurEdit("3000", 0, rows, t);
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.benchmarkTotalEur).toBe(5500);
    expect(eurForRowIndex(out.rows, 0, out.benchmarkTotalEur)).toBeCloseTo(
      3000,
      1,
    );
    expect(eurForRowIndex(out.rows, 1, out.benchmarkTotalEur)).toBeCloseTo(
      2500,
      1,
    );
    expect(sumParsedWeights(out.rows)).toBeCloseTo(100, 2);
  });
  it("keeps other EUR when one line EUR rises", () => {
    const rows = [row(1, "3"), row(2, "1")];
    const out = applyAbsoluteEurEdit("8000", 0, rows, t);
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.benchmarkTotalEur).toBe(10500);
    expect(eurForRowIndex(out.rows, 0, out.benchmarkTotalEur)).toBeCloseTo(
      8000,
      0,
    );
    expect(eurForRowIndex(out.rows, 1, out.benchmarkTotalEur)).toBeCloseTo(
      2500,
      1,
    );
    expect(sumParsedWeights(out.rows)).toBeCloseTo(100, 2);
  });
  it("single funded line sets total to entered EUR", () => {
    const rows = [row(1, "1")];
    const out = applyAbsoluteEurEdit("5000", 0, rows, t);
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.benchmarkTotalEur).toBe(5000);
    expect(eurForRowIndex(out.rows, 0, out.benchmarkTotalEur)).toBe(5000);
    expect(sumParsedWeights(out.rows)).toBeCloseTo(100, 2);
  });
  it("requires instrument", () => {
    expect(applyAbsoluteEurEdit("100", 0, [row("", "1")], t).ok).toBe(false);
  });
});

describe("removeBenchmarkRowKeepingPeerEur", () => {
  it("keeps other rows EUR and lowers total when removing first row", () => {
    const rows = [row(1, "3"), row(2, "1")];
    const out = removeBenchmarkRowKeepingPeerEur(0, rows, 10000);
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.rows.length).toBe(1);
    expect(out.benchmarkTotalEur).toBe(2500);
    expect(eurForRowIndex(out.rows, 0, out.benchmarkTotalEur)).toBeCloseTo(
      2500,
      1,
    );
  });
  it("keeps other rows EUR when removing second row", () => {
    const rows = [row(1, "3"), row(2, "1")];
    const out = removeBenchmarkRowKeepingPeerEur(1, rows, 10000);
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.benchmarkTotalEur).toBe(7500);
    expect(eurForRowIndex(out.rows, 0, out.benchmarkTotalEur)).toBeCloseTo(
      7500,
      1,
    );
  });
  it("returns not ok when total is invalid", () => {
    const rows = [row(1, "1")];
    expect(removeBenchmarkRowKeepingPeerEur(0, rows, null).ok).toBe(false);
  });
});
