import type { DistributionPayload } from "@investments/lib";
import * as XLSX from "xlsx";
import {
  mapSectorLabelToCanonicalIdWithWarn,
  normalizeRegionWeightsToIsoKeys,
} from "./distributionNormalize.js";
import { isCashAssetLabel } from "./providerHoldingsCash.js";

/**
 * Xtrackers / DWS constituent export (`etf.dws.com` … `/excel/product/constituent/…`).
 * Sheet name is a snapshot date; header row includes ISIN, Country, Weighting (fraction 0–1).
 */
function findHeaderRow(data: unknown[][]): {
  rowIdx: number;
  col: Record<string, number>;
} {
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    if (!Array.isArray(row) || row.length === 0) {
      continue;
    }
    const col: Record<string, number> = {};
    for (let c = 0; c < row.length; c++) {
      const name = String(row[c] ?? "").trim();
      if (name) {
        col[name] = c;
      }
    }
    const need = ["ISIN", "Country", "Weighting", "Industry Classification"];
    if (need.every((k) => k in col) && "Type of Security" in col) {
      return { rowIdx: r, col };
    }
  }
  throw new Error(
    "Could not find Xtrackers holdings header row (ISIN, Country, Weighting, …)",
  );
}

function parseWeightCell(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    return v;
  }
  const s = String(v ?? "").trim();
  if (!s) {
    return null;
  }
  const n = Number.parseFloat(s.replace(/,/g, ""));
  if (!Number.isFinite(n) || !(n > 0)) {
    return null;
  }
  return n > 1 ? n / 100 : n;
}

export function parseXtrackersHoldingsXlsx(
  buf: Uint8Array,
): DistributionPayload {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error("Xtrackers workbook has no sheets");
  }
  const sh = wb.Sheets[sheetName];
  if (!sh) {
    throw new Error("Xtrackers workbook sheet missing");
  }
  const data = XLSX.utils.sheet_to_json(sh, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];

  const { rowIdx, col } = findHeaderRow(data);
  const countryAgg: Record<string, number> = {};
  const sectorAgg: Record<string, number> = {};

  const typeCol = col["Type of Security"];
  const countryCol = col.Country;
  const weightCol = col.Weighting;
  const industryCol = col["Industry Classification"];
  if (
    typeof typeCol !== "number" ||
    typeof countryCol !== "number" ||
    typeof weightCol !== "number" ||
    typeof industryCol !== "number"
  ) {
    throw new Error("Xtrackers header missing expected columns");
  }

  for (let r = rowIdx + 1; r < data.length; r++) {
    const row = data[r];
    if (!Array.isArray(row)) {
      continue;
    }
    const pct = parseWeightCell(row[weightCol]);
    if (pct == null) {
      continue;
    }
    const secType = String(row[typeCol] ?? "").trim();
    if (secType.toLowerCase() === "cash" || isCashAssetLabel(secType)) {
      sectorAgg.cash = (sectorAgg.cash ?? 0) + pct;
      continue;
    }
    const country = String(row[countryCol] ?? "").trim();
    if (!country || country === "-") {
      continue;
    }
    countryAgg[country] = (countryAgg[country] ?? 0) + pct;
    const industryLabel = String(row[industryCol] ?? "").trim();
    if (industryLabel) {
      const sid = mapSectorLabelToCanonicalIdWithWarn(industryLabel);
      sectorAgg[sid] = (sectorAgg[sid] ?? 0) + pct;
    }
  }

  return {
    countries: normalizeRegionWeightsToIsoKeys(countryAgg),
    sectors: sectorAgg,
  };
}
