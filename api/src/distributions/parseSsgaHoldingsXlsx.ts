import type { DistributionPayload } from "@investments/lib";
import * as XLSX from "xlsx";
import {
  mapSectorLabelToCanonicalIdWithWarn,
  normalizeRegionWeightsToIsoKeys,
} from "./distributionNormalize.js";
import { isCashAssetLabel } from "./providerHoldingsCash.js";

function findHeaderRow(data: unknown[][]): {
  rowIdx: number;
  col: Record<string, number>;
} {
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    if (!Array.isArray(row) || row.length === 0) {
      continue;
    }
    if (String(row[0]).trim() === "ISIN") {
      const col: Record<string, number> = {};
      for (let c = 0; c < row.length; c++) {
        const name = String(row[c] ?? "").trim();
        if (name) {
          col[name] = c;
        }
      }
      const need = [
        "Percent of Fund",
        "Trade Country Name",
        "Sector Classification",
      ];
      if (need.every((k) => k in col)) {
        return { rowIdx: r, col };
      }
    }
  }
  throw new Error(
    "Could not find SSGA holdings header row (ISIN, Percent of Fund, …)",
  );
}

function parsePercentCell(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    return v / 100;
  }
  const s = String(v ?? "").trim();
  if (!s) {
    return null;
  }
  const n = Number.parseFloat(s.replace(/,/g, ""));
  if (!Number.isFinite(n) || !(n > 0)) {
    return null;
  }
  return n / 100;
}

/**
 * SSGA / SPDR daily holdings XLSX (`holdings` sheet).
 */
export function parseSsgaHoldingsXlsx(buf: Uint8Array): DistributionPayload {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames.includes("holdings")
    ? "holdings"
    : wb.SheetNames[0];
  if (!sheetName) {
    throw new Error("SSGA workbook has no sheets");
  }
  const sh = wb.Sheets[sheetName];
  if (!sh) {
    throw new Error("SSGA workbook sheet missing");
  }
  const data = XLSX.utils.sheet_to_json(sh, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];

  const { rowIdx, col } = findHeaderRow(data);
  const countryAgg: Record<string, number> = {};
  const sectorAgg: Record<string, number> = {};

  const assetClassCol = col["Asset Class"];
  const securityTypeCol = col["Security Type"];

  for (let r = rowIdx + 1; r < data.length; r++) {
    const row = data[r];
    if (!Array.isArray(row)) {
      continue;
    }
    const pct = parsePercentCell(row[col["Percent of Fund"] ?? -1]);
    if (pct == null) {
      continue;
    }
    const sectorLabel = String(
      row[col["Sector Classification"] ?? -1] ?? "",
    ).trim();
    const assetClass =
      typeof assetClassCol === "number"
        ? String(row[assetClassCol] ?? "").trim()
        : "";
    const securityType =
      typeof securityTypeCol === "number"
        ? String(row[securityTypeCol] ?? "").trim()
        : "";
    if (
      isCashAssetLabel(assetClass) ||
      isCashAssetLabel(securityType) ||
      isCashAssetLabel(sectorLabel)
    ) {
      sectorAgg.cash = (sectorAgg.cash ?? 0) + pct;
      continue;
    }
    const country = String(row[col["Trade Country Name"] ?? -1] ?? "").trim();
    if (!country) {
      continue;
    }
    countryAgg[country] = (countryAgg[country] ?? 0) + pct;
    if (sectorLabel) {
      const sid = mapSectorLabelToCanonicalIdWithWarn(sectorLabel);
      sectorAgg[sid] = (sectorAgg[sid] ?? 0) + pct;
    }
  }

  return {
    countries: normalizeRegionWeightsToIsoKeys(countryAgg),
    sectors: sectorAgg,
  };
}
