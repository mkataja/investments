import {
  aggregateRegionsToGeoBuckets,
  distributions,
  instruments,
  seligsonFunds,
  yahooFinanceCache,
} from "@investments/db";
import type { DistributionPayload } from "@investments/db";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db.js";
import { classifyNonCashInstrument } from "./nonCashAssetClass.js";
import { loadPortfolioOwnedByUser } from "./portfolioAccess.js";
import { loadOpenPositionsForPortfolio } from "./positions.js";
import { valuePortfolioRowsEur } from "./valuation.js";

function mergeWeighted(
  acc: Record<string, number>,
  weights: Record<string, number>,
  w: number,
): void {
  for (const [k, v] of Object.entries(weights)) {
    acc[k] = (acc[k] ?? 0) + w * v;
  }
}

/** Sector weights without `cash` (embedded fund cash is shown in asset mix instead). */
function stripCashFromSectorWeights(
  sectors: Record<string, number> | undefined,
): Record<string, number> {
  if (!sectors) {
    return {};
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(sectors)) {
    if (k === "cash") {
      continue;
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = v;
    }
  }
  return out;
}

function sumSectorWeights(sectors: Record<string, number>): number {
  let s = 0;
  for (const v of Object.values(sectors)) {
    s += v;
  }
  return s;
}

export async function getPortfolioDistributions(portfolioId: number): Promise<{
  /** Value-weighted merge of per-instrument country weights (ISO or resolvable labels), before geo bucketing. */
  countries: Record<string, number>;
  regions: Record<string, number>;
  sectors: Record<string, number>;
  totalValueEur: number;
  mixedCurrencyWarning: boolean;
  assetAllocation: {
    equitiesEur: number;
    bondsEur: number;
    /** Embedded cash from ETF/fund sector weights (`sectors.cash` × position value). */
    cashInFundsEur: number;
    /** `max(0, cashTotalEur - emergencyFundTargetEur)`. */
    cashExcessEur: number;
    /** `min(cashTotalEur, emergencyFundTargetEur)` — EF slice of cash. */
    emergencyFundSliceEur: number;
    emergencyFundTargetEur: number;
    cashTotalEur: number;
    cashBelowEmergencyTarget: boolean;
  };
  positions: Array<{
    instrumentId: number;
    displayName: string;
    quantity: number;
    /** EUR per one unit (position value ÷ quantity); null if not meaningful. */
    unitPriceEur: number | null;
    weight: number;
    valueEur: number;
    valuationSource: string;
  }>;
}> {
  const pfRow = await loadPortfolioOwnedByUser(portfolioId);
  const emergencyFundTargetEurRaw = pfRow ? Number(pfRow.emergencyFundEur) : 0;
  const emergencyFundTargetEur = Number.isFinite(emergencyFundTargetEurRaw)
    ? emergencyFundTargetEurRaw
    : 0;

  const emptyAssetAllocation = (): {
    equitiesEur: number;
    bondsEur: number;
    cashInFundsEur: number;
    cashExcessEur: number;
    emergencyFundSliceEur: number;
    emergencyFundTargetEur: number;
    cashTotalEur: number;
    cashBelowEmergencyTarget: boolean;
  } => ({
    equitiesEur: 0,
    bondsEur: 0,
    cashInFundsEur: 0,
    cashExcessEur: 0,
    emergencyFundSliceEur: 0,
    emergencyFundTargetEur,
    cashTotalEur: 0,
    cashBelowEmergencyTarget: emergencyFundTargetEur > 0,
  });

  const pos = await loadOpenPositionsForPortfolio(portfolioId);
  if (pos.length === 0) {
    return {
      countries: {},
      regions: {},
      sectors: {},
      totalValueEur: 0,
      mixedCurrencyWarning: false,
      assetAllocation: emptyAssetAllocation(),
      positions: [],
    };
  }

  const instRows = await db
    .select()
    .from(instruments)
    .where(
      inArray(
        instruments.id,
        pos.map((p) => p.instrumentId),
      ),
    );

  const rows: Array<{
    inst: (typeof instRows)[0];
    qty: number;
  }> = [];
  for (const p of pos) {
    const inst = instRows.find((i) => i.id === p.instrumentId);
    if (!inst) {
      continue;
    }
    rows.push({ inst, qty: p.quantity });
  }

  const valuedResults = await valuePortfolioRowsEur(rows);
  const valued = rows.map((row, i) => {
    const v = valuedResults[i];
    return {
      inst: row.inst,
      qty: row.qty,
      valueEur: v?.valueEur ?? 0,
      source: v?.source ?? "none",
    };
  });

  const totalValueEur = valued.reduce((s, x) => s + x.valueEur, 0);
  const mixedCurrencyWarning = false;

  const yahooInstrumentIds = [
    ...new Set(
      valued
        .filter((r) => r.inst.kind === "etf" || r.inst.kind === "stock")
        .map((r) => r.inst.id),
    ),
  ];
  const yfcRows =
    yahooInstrumentIds.length === 0
      ? []
      : await db
          .select()
          .from(yahooFinanceCache)
          .where(inArray(yahooFinanceCache.instrumentId, yahooInstrumentIds));
  const yahooRawById = new Map(yfcRows.map((r) => [r.instrumentId, r.raw]));

  const seligsonIds = [
    ...new Set(
      valued
        .filter(
          (r) => r.inst.kind === "custom" && r.inst.seligsonFundId != null,
        )
        .map((r) => r.inst.seligsonFundId as number),
    ),
  ];
  const sfRows =
    seligsonIds.length === 0
      ? []
      : await db
          .select()
          .from(seligsonFunds)
          .where(inArray(seligsonFunds.id, seligsonIds));
  const seligsonNameById = new Map(sfRows.map((s) => [s.id, s.name] as const));

  const nonCashValueEur = valued.reduce(
    (s, x) => s + (x.inst.kind === "cash_account" ? 0 : x.valueEur),
    0,
  );

  const countryWeights: Record<string, number> = {};
  const sectors: Record<string, number> = {};
  let missingCountryW = 0;
  let missingSectorW = 0;

  let equitiesEur = 0;
  let bondsEur = 0;
  let cashTotalEur = 0;
  let cashInFundsEur = 0;

  for (const row of valued) {
    const { inst } = row;

    if (inst.kind === "cash_account") {
      cashTotalEur += row.valueEur;
      continue;
    }

    const w = nonCashValueEur > 0 ? row.valueEur / nonCashValueEur : 0;

    const [cached] = await db
      .select()
      .from(distributions)
      .where(eq(distributions.instrumentId, inst.id));

    const payload = cached?.payload as DistributionPayload | undefined;
    const cashFracRaw =
      payload?.sectors && typeof payload.sectors.cash === "number"
        ? payload.sectors.cash
        : 0;
    const cashFrac = Math.min(1, Math.max(0, cashFracRaw));
    const embeddedCashEur = row.valueEur * cashFrac;
    cashInFundsEur += embeddedCashEur;

    const cls = classifyNonCashInstrument(
      inst,
      yahooRawById.get(inst.id) ?? null,
      inst.seligsonFundId != null
        ? (seligsonNameById.get(inst.seligsonFundId) ?? null)
        : null,
    );
    const principalEur = Math.max(0, row.valueEur - embeddedCashEur);
    if (cls === "bond") {
      bondsEur += principalEur;
    } else {
      equitiesEur += principalEur;
    }

    const geoScale = 1 - cashFrac;
    if (payload?.countries && Object.keys(payload.countries).length > 0) {
      mergeWeighted(countryWeights, payload.countries, w * geoScale);
    } else {
      missingCountryW += w * geoScale;
    }

    const nonCashSectors = stripCashFromSectorWeights(payload?.sectors);
    const nonCashSectorSum = sumSectorWeights(nonCashSectors);
    if (payload?.sectors && Object.keys(payload.sectors).length > 0) {
      if (nonCashSectorSum > 1e-9) {
        mergeWeighted(sectors, nonCashSectors, w);
      }
    } else {
      missingSectorW += w;
    }
  }

  const cashExcessEur = Math.max(0, cashTotalEur - emergencyFundTargetEur);
  const emergencyFundSliceEur = Math.min(cashTotalEur, emergencyFundTargetEur);
  const cashBelowEmergencyTarget =
    emergencyFundTargetEur > 0 && cashTotalEur < emergencyFundTargetEur;

  if (missingCountryW > 0) {
    countryWeights.__portfolio_unknown__ = missingCountryW;
  }

  const sectorMassRaw =
    Object.values(sectors).reduce((a, b) => a + b, 0) + missingSectorW;
  if (sectorMassRaw > 1e-12) {
    for (const k of Object.keys(sectors)) {
      sectors[k] /= sectorMassRaw;
    }
    missingSectorW /= sectorMassRaw;
  }
  if (missingSectorW > 0) {
    sectors.__portfolio_unknown__ = missingSectorW;
  }

  const positions = valued.map((row) => {
    const qty = row.qty;
    const valueEur = row.valueEur;
    const unitPriceEur =
      Math.abs(qty) > 1e-12 && Number.isFinite(valueEur)
        ? valueEur / qty
        : null;
    return {
      instrumentId: row.inst.id,
      displayName: row.inst.displayName,
      quantity: qty,
      unitPriceEur,
      weight: totalValueEur > 0 ? valueEur / totalValueEur : 0,
      valueEur,
      valuationSource: row.source,
    };
  });

  const regionsBucketed: Record<string, number> = {};
  const merged = aggregateRegionsToGeoBuckets(countryWeights);
  for (const [k, v] of Object.entries(merged)) {
    if (v > 0) {
      regionsBucketed[k] = v;
    }
  }

  return {
    countries: countryWeights,
    regions: regionsBucketed,
    sectors,
    totalValueEur,
    mixedCurrencyWarning,
    assetAllocation: {
      equitiesEur,
      bondsEur,
      cashInFundsEur,
      cashExcessEur,
      emergencyFundSliceEur,
      emergencyFundTargetEur,
      cashTotalEur,
      cashBelowEmergencyTarget,
    },
    positions,
  };
}
