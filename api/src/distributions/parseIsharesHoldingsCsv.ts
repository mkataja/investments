import type { DistributionPayload } from "@investments/db";
import { parse } from "csv-parse/sync";
import { isCashAssetLabel } from "./providerHoldingsCash.js";
import {
  mapYahooSectorToCanonicalIdWithWarn,
  normalizeYahooCountriesToIsoKeys,
} from "./yahoo.js";

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function parseWeightPercentCell(s: string): number | null {
  const t = s.replace(/,/g, "").trim();
  if (!t || t === "-") {
    return null;
  }
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n) || !(n > 0)) {
    return null;
  }
  return n / 100;
}

/**
 * iShares fund holdings CSV (e.g. CSPX `.ajax?fileType=csv` export).
 */
export function parseIsharesHoldingsCsv(csvText: string): DistributionPayload {
  const text = stripBom(csvText.trimStart());
  const lines = text.split(/\r?\n/);
  let headerLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.includes("Ticker") && line.includes("Location")) {
      headerLineIdx = i;
      break;
    }
  }
  if (headerLineIdx < 0) {
    throw new Error(
      "Could not find iShares holdings header row (Ticker, Location)",
    );
  }
  const body = lines.slice(headerLineIdx).join("\n");
  const records = parse(body, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  }) as Record<string, string>[];

  const countryAgg: Record<string, number> = {};
  const sectorAgg: Record<string, number> = {};

  for (const row of records) {
    const w = parseWeightPercentCell(row["Weight (%)"] ?? "");
    if (w == null) {
      continue;
    }
    const assetClass = (row["Asset Class"] ?? "").trim();
    const sectorLabel = (row.Sector ?? "").trim();
    if (isCashAssetLabel(assetClass) || isCashAssetLabel(sectorLabel)) {
      sectorAgg.cash = (sectorAgg.cash ?? 0) + w;
      continue;
    }
    const loc = (row.Location ?? "").trim();
    if (!loc || loc === "-") {
      continue;
    }
    countryAgg[loc] = (countryAgg[loc] ?? 0) + w;
    if (sectorLabel) {
      const sid = mapYahooSectorToCanonicalIdWithWarn(sectorLabel);
      sectorAgg[sid] = (sectorAgg[sid] ?? 0) + w;
    }
  }

  return {
    countries: normalizeYahooCountriesToIsoKeys(countryAgg),
    sectors: sectorAgg,
  };
}
