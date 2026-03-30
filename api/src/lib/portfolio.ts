import {
  USER_ID,
  aggregateRegionsToGeoBuckets,
  distributions,
  instruments,
  portfolioSettings,
  seligsonFunds,
  yahooFinanceCache,
} from "@investments/db";
import type { DistributionPayload } from "@investments/db";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db.js";
import { classifyNonCashInstrument } from "./nonCashAssetClass.js";
import { loadOpenPositions } from "./positions.js";
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

export async function getPortfolioDistributions(): Promise<{
  /** Value-weighted merge of per-instrument country weights (ISO or resolvable labels), before geo bucketing. */
  countries: Record<string, number>;
  regions: Record<string, number>;
  sectors: Record<string, number>;
  totalValueEur: number;
  mixedCurrencyWarning: boolean;
  assetAllocation: {
    equitiesEur: number;
    bondsEur: number;
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
  const [psRow] = await db
    .select()
    .from(portfolioSettings)
    .where(eq(portfolioSettings.userId, USER_ID));
  const emergencyFundTargetEurRaw = psRow ? Number(psRow.emergencyFundEur) : 0;
  const emergencyFundTargetEur = Number.isFinite(emergencyFundTargetEurRaw)
    ? emergencyFundTargetEurRaw
    : 0;

  const emptyAssetAllocation = (): {
    equitiesEur: number;
    bondsEur: number;
    cashExcessEur: number;
    emergencyFundSliceEur: number;
    emergencyFundTargetEur: number;
    cashTotalEur: number;
    cashBelowEmergencyTarget: boolean;
  } => ({
    equitiesEur: 0,
    bondsEur: 0,
    cashExcessEur: 0,
    emergencyFundSliceEur: 0,
    emergencyFundTargetEur,
    cashTotalEur: 0,
    cashBelowEmergencyTarget: emergencyFundTargetEur > 0,
  });

  const pos = await loadOpenPositions();
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

  let equitiesEur = 0;
  let bondsEur = 0;
  let cashTotalEur = 0;
  for (const row of valued) {
    if (row.inst.kind === "cash_account") {
      cashTotalEur += row.valueEur;
      continue;
    }
    const cls = classifyNonCashInstrument(
      row.inst,
      yahooRawById.get(row.inst.id) ?? null,
      row.inst.seligsonFundId != null
        ? (seligsonNameById.get(row.inst.seligsonFundId) ?? null)
        : null,
    );
    if (cls === "bond") {
      bondsEur += row.valueEur;
    } else {
      equitiesEur += row.valueEur;
    }
  }

  const cashExcessEur = Math.max(0, cashTotalEur - emergencyFundTargetEur);
  const emergencyFundSliceEur = Math.min(cashTotalEur, emergencyFundTargetEur);
  const cashBelowEmergencyTarget =
    emergencyFundTargetEur > 0 && cashTotalEur < emergencyFundTargetEur;

  const nonCashValueEur = valued.reduce(
    (s, x) => s + (x.inst.kind === "cash_account" ? 0 : x.valueEur),
    0,
  );

  const countryWeights: Record<string, number> = {};
  const sectors: Record<string, number> = {};

  for (const row of valued) {
    const { inst } = row;

    if (inst.kind === "cash_account") {
      continue;
    }

    const w = nonCashValueEur > 0 ? row.valueEur / nonCashValueEur : 0;

    const [cached] = await db
      .select()
      .from(distributions)
      .where(eq(distributions.instrumentId, inst.id));

    const payload = cached?.payload as DistributionPayload | undefined;
    if (payload?.countries && Object.keys(payload.countries).length > 0) {
      mergeWeighted(countryWeights, payload.countries, w);
    }
    if (payload?.sectors && Object.keys(payload.sectors).length > 0) {
      mergeWeighted(sectors, payload.sectors, w);
    }
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
      cashExcessEur,
      emergencyFundSliceEur,
      emergencyFundTargetEur,
      cashTotalEur,
      cashBelowEmergencyTarget,
    },
    positions,
  };
}
