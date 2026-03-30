import type {
  DistributionPayload,
  DistributionSectorId,
} from "@investments/db";
import * as XLSX from "xlsx";
import {
  mapSectorLabelToCanonicalIdWithWarn,
  normalizeRegionWeightsToIsoKeys,
} from "./distributionNormalize.js";
import { isCashAssetLabel } from "./providerHoldingsCash.js";

/**
 * J.P. Morgan AM daily ETF holdings XLSX (`FundsMarketingHandler/excel?type=dailyETFHoldings&…`).
 * Sheet `Holdings`: Name, ISIN, Asset class, Country, Currency, Weight (fraction, may be negative for futures).
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
    if (String(row[0]).trim() !== "Name") {
      continue;
    }
    const col: Record<string, number> = {};
    for (let c = 0; c < row.length; c++) {
      const name = String(row[c] ?? "").trim();
      if (name) {
        col[name] = c;
      }
    }
    const need = ["ISIN", "Asset class", "Country", "Weight"];
    if (need.every((k) => k in col)) {
      return { rowIdx: r, col };
    }
  }
  throw new Error(
    "Could not find JPMorgan holdings header row (Name, ISIN, Asset class, Country, Weight, …)",
  );
}

function parseWeightCell(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v !== 0) {
    return Math.abs(v);
  }
  const s = String(v ?? "").trim();
  if (!s) {
    return null;
  }
  const n = Number.parseFloat(s.replace(/,/g, ""));
  if (!Number.isFinite(n) || n === 0) {
    return null;
  }
  const a = Math.abs(n);
  return a > 1 ? a / 100 : a;
}

function jpmAssetClassToSector(assetClass: string): DistributionSectorId {
  const s = assetClass.trim().toLowerCase();
  if (s === "common stock" || s === "futures") {
    return "other";
  }
  return mapSectorLabelToCanonicalIdWithWarn(assetClass);
}

export function parseJpmHoldingsXlsx(buf: Uint8Array): DistributionPayload {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames.includes("Holdings")
    ? "Holdings"
    : wb.SheetNames[0];
  if (!sheetName) {
    throw new Error("JPMorgan workbook has no sheets");
  }
  const sh = wb.Sheets[sheetName];
  if (!sh) {
    throw new Error("JPMorgan workbook sheet missing");
  }
  const data = XLSX.utils.sheet_to_json(sh, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];

  const { rowIdx, col } = findHeaderRow(data);
  const assetCol = col["Asset class"];
  const countryCol = col.Country;
  const weightCol = col.Weight;
  if (
    typeof assetCol !== "number" ||
    typeof countryCol !== "number" ||
    typeof weightCol !== "number"
  ) {
    throw new Error("JPMorgan header missing expected columns");
  }

  const countryAgg: Record<string, number> = {};
  const sectorAgg: Record<string, number> = {};

  for (let r = rowIdx + 1; r < data.length; r++) {
    const row = data[r];
    if (!Array.isArray(row)) {
      continue;
    }
    const pct = parseWeightCell(row[weightCol]);
    if (pct == null) {
      continue;
    }
    const assetClass = String(row[assetCol] ?? "").trim();
    if (!assetClass) {
      continue;
    }
    if (isCashAssetLabel(assetClass)) {
      sectorAgg.cash = (sectorAgg.cash ?? 0) + pct;
      continue;
    }
    const country = String(row[countryCol] ?? "").trim();
    if (!country) {
      continue;
    }
    countryAgg[country] = (countryAgg[country] ?? 0) + pct;
    const sid = jpmAssetClassToSector(assetClass);
    sectorAgg[sid] = (sectorAgg[sid] ?? 0) + pct;
  }

  return {
    countries: normalizeRegionWeightsToIsoKeys(countryAgg),
    sectors: sectorAgg,
  };
}
