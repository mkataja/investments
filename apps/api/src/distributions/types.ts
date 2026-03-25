import type { DistributionPayload } from "@investments/db";

export type { DistributionPayload };

function unwrapYahooNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value && typeof value === "object" && "raw" in value) {
    const raw = (value as { raw: unknown }).raw;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw;
    }
  }
  return null;
}

/** Merge Yahoo array-of-objects sector/country rows into one weight map */
export function mergeYahooWeightRows(rows: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Array.isArray(rows)) {
    return out;
  }
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }
    for (const [key, value] of Object.entries(row)) {
      const n = unwrapYahooNumber(value);
      if (n !== null) {
        out[key] = (out[key] ?? 0) + n;
      }
    }
  }
  return normalizeWeights(out);
}

/** Values may be 0–100 or 0–1 */
function normalizeWeights(w: Record<string, number>): Record<string, number> {
  const vals = Object.values(w);
  if (vals.length === 0) {
    return {};
  }
  const max = Math.max(...vals.map((x) => Math.abs(x)));
  const scale = max > 1.5 ? 0.01 : 1;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(w)) {
    out[k] = v * scale;
  }
  return out;
}

export function recordFromUnknownObject(obj: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const n = unwrapYahooNumber(v);
    if (n !== null) {
      out[k] = n;
    }
  }
  return normalizeWeights(out);
}
