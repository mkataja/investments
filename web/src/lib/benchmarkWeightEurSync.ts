import { parseDecimalInputLoose, roundEurToCents } from "./decimalInput";

type BenchmarkWeightRowLike = {
  instrumentId: number | "";
  weightStr: string;
};

/**
 * Parses portfolio total EUR from the benchmark total field. Returns null if invalid.
 */
export function parseBenchmarkTotalEur(s: string): number | null {
  const t = parseDecimalInputLoose(s);
  if (!Number.isFinite(t) || t <= 0) {
    return null;
  }
  return t;
}

function contributingRawWeight(row: BenchmarkWeightRowLike): number | null {
  if (row.instrumentId === "") {
    return null;
  }
  const w = Number.parseFloat(row.weightStr.trim().replace(",", "."));
  if (!Number.isFinite(w) || w <= 0) {
    return null;
  }
  return w;
}

/**
 * Sum of other rows' positive raw weights (excluding `excludeIndex`).
 */
export function sumOtherContributingRawWeights(
  rows: BenchmarkWeightRowLike[],
  excludeIndex: number,
): number {
  let c = 0;
  for (let j = 0; j < rows.length; j++) {
    if (j === excludeIndex) {
      continue;
    }
    const row = rows[j];
    if (row === undefined) {
      continue;
    }
    const w = contributingRawWeight(row);
    if (w != null) {
      c += w;
    }
  }
  return c;
}

/**
 * EUR for one row given total T and normalized share among contributing rows.
 */
export function eurForRowIndex(
  rows: BenchmarkWeightRowLike[],
  rowIndex: number,
  totalEur: number | null,
): number | null {
  if (totalEur == null || totalEur <= 0) {
    return null;
  }
  const row = rows[rowIndex];
  if (row === undefined) {
    return null;
  }
  const wi = contributingRawWeight(row);
  if (wi == null) {
    return null;
  }
  let s = 0;
  for (const r of rows) {
    const w = contributingRawWeight(r);
    if (w != null) {
      s += w;
    }
  }
  if (s <= 0) {
    return null;
  }
  return totalEur * (wi / s);
}

/** Percent weight string with at most three decimal places. */
export function formatWeightMaxThreeDecimals(w: number): string {
  if (!Number.isFinite(w)) {
    return "0";
  }
  const r = Math.round(w * 1000) / 1000;
  const s = r.toFixed(3).replace(/\.?0+$/, "");
  return s === "" ? "0" : s;
}

/** Normalizes a positive weight field to at most three decimal places. */
export function normalizeWeightInputMax3Decimals(weightStr: string): string {
  const trimmed = weightStr.trim();
  if (trimmed === "") {
    return weightStr;
  }
  const w = Number.parseFloat(trimmed.replace(",", "."));
  if (!Number.isFinite(w) || w <= 0) {
    return weightStr;
  }
  return formatWeightMaxThreeDecimals(w);
}

/**
 * Percent weights (0–100 each) matching EUR shares; values sum to 100 when parsed as numbers.
 * Each weight uses at most three decimal places.
 */
export function weightStringsSummingTo100(
  eurAmounts: number[],
  totalEur: number,
): string[] {
  const n = eurAmounts.length;
  if (n === 0) {
    return [];
  }
  if (n === 1) {
    return ["100"];
  }
  const ideal = eurAmounts.map((e) => (100 * e) / totalEur);
  const out: string[] = [];
  let sumParsed = 0;
  for (let i = 0; i < n - 1; i++) {
    const iv = ideal[i];
    if (iv === undefined) {
      throw new Error("weightStringsSummingTo100: missing share");
    }
    const s = formatWeightMaxThreeDecimals(iv);
    out.push(s);
    sumParsed += Number.parseFloat(s);
  }
  out.push(formatWeightMaxThreeDecimals(100 - sumParsed));
  return out;
}

/**
 * Applies an absolute EUR target for one row: other rows keep the same EUR; portfolio
 * total and all row weights update so shares match the new EUR split.
 */
export function applyAbsoluteEurEdit(
  eurStr: string,
  rowIndex: number,
  rows: BenchmarkWeightRowLike[],
  totalEur: number | null,
):
  | { ok: true; rows: BenchmarkWeightRowLike[]; benchmarkTotalEur: number }
  | { ok: false; message: string } {
  const t = totalEur;
  if (t == null || !Number.isFinite(t) || t <= 0) {
    return { ok: false, message: "Set a valid portfolio total (EUR) first." };
  }
  const row = rows[rowIndex];
  if (row === undefined) {
    return { ok: false, message: "Invalid row." };
  }
  if (row.instrumentId === "") {
    return { ok: false, message: "Select an instrument first." };
  }
  const parsedEur = Number.parseFloat(eurStr.trim().replace(",", "."));
  if (!Number.isFinite(parsedEur) || parsedEur <= 0) {
    return { ok: false, message: "Enter a positive EUR amount." };
  }
  const eurINew = roundEurToCents(parsedEur);
  if (eurINew <= 0) {
    return { ok: false, message: "Enter a positive EUR amount." };
  }

  const eurByIndex = new Map<number, number>();
  for (let j = 0; j < rows.length; j++) {
    const e = eurForRowIndex(rows, j, t);
    if (e != null) {
      eurByIndex.set(j, e);
    }
  }

  const orderedIndices = [...new Set([rowIndex, ...eurByIndex.keys()])].sort(
    (a, b) => a - b,
  );
  const eurAmounts = orderedIndices.map((j) =>
    j === rowIndex ? eurINew : roundEurToCents(eurByIndex.get(j) ?? 0),
  );
  const tNew = roundEurToCents(eurAmounts.reduce((a, b) => a + b, 0));
  if (!Number.isFinite(tNew) || tNew <= 0) {
    return { ok: false, message: "Invalid portfolio total." };
  }
  const weightStrs = weightStringsSummingTo100(eurAmounts, tNew);
  const weightByIndex = new Map<number, string>();
  orderedIndices.forEach((j, i) => {
    const ws = weightStrs[i];
    if (ws !== undefined) {
      weightByIndex.set(j, ws);
    }
  });

  const nextRows = rows.map((r, j) => {
    const ws = weightByIndex.get(j);
    if (ws !== undefined) {
      return { ...r, weightStr: ws };
    }
    return r;
  });

  return { ok: true, rows: nextRows, benchmarkTotalEur: tNew };
}

/**
 * Removes one row as if its EUR were set to zero: every other row keeps the same EUR;
 * portfolio total becomes the sum of remaining line EUR (cent-rounded); weights rescale to 100.
 */
export function removeBenchmarkRowKeepingPeerEur(
  removeIndex: number,
  rows: BenchmarkWeightRowLike[],
  totalEur: number | null,
):
  | { ok: true; rows: BenchmarkWeightRowLike[]; benchmarkTotalEur: number }
  | { ok: false } {
  const t = totalEur;
  if (t == null || !Number.isFinite(t) || t <= 0) {
    return { ok: false };
  }
  if (rows[removeIndex] === undefined) {
    return { ok: false };
  }

  const remaining = rows.filter((_, i) => i !== removeIndex);

  const positive: Array<{ k: number; eur: number }> = [];
  for (let k = 0; k < remaining.length; k++) {
    const oldJ = k < removeIndex ? k : k + 1;
    const e = roundEurToCents(eurForRowIndex(rows, oldJ, t) ?? 0);
    if (e > 0) {
      positive.push({ k, eur: e });
    }
  }

  if (positive.length === 0) {
    return {
      ok: true,
      rows: remaining.map((r) => ({ ...r, weightStr: "" })),
      benchmarkTotalEur: 0,
    };
  }

  const eurAmounts = positive.map((p) => p.eur);
  const tNew = roundEurToCents(eurAmounts.reduce((a, b) => a + b, 0));
  if (!Number.isFinite(tNew) || tNew <= 0) {
    return {
      ok: true,
      rows: remaining.map((r) => ({ ...r, weightStr: "" })),
      benchmarkTotalEur: 0,
    };
  }

  const weightStrs = weightStringsSummingTo100(eurAmounts, tNew);
  const weightByK = new Map<number, string>();
  positive.forEach((p, i) => {
    const ws = weightStrs[i];
    if (ws !== undefined) {
      weightByK.set(p.k, ws);
    }
  });

  const nextRows = remaining.map((r, k) => {
    const ws = weightByK.get(k);
    if (ws !== undefined) {
      return { ...r, weightStr: ws };
    }
    return { ...r, weightStr: "" };
  });

  return { ok: true, rows: nextRows, benchmarkTotalEur: tNew };
}
