import {
  aggregateRegionsToGeoBuckets,
  distributions,
  instruments,
} from "@investments/db";
import type { DistributionPayload } from "@investments/db";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db.js";
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
  regions: Record<string, number>;
  sectors: Record<string, number>;
  totalValueEur: number;
  mixedCurrencyWarning: boolean;
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
  const pos = await loadOpenPositions();
  if (pos.length === 0) {
    return {
      regions: {},
      sectors: {},
      totalValueEur: 0,
      mixedCurrencyWarning: false,
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

  const nonCashValueEur = valued.reduce(
    (s, x) => s + (x.inst.kind === "cash_account" ? 0 : x.valueEur),
    0,
  );

  const regions: Record<string, number> = {};
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
      mergeWeighted(regions, payload.countries, w);
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
  const merged = aggregateRegionsToGeoBuckets(regions);
  for (const [k, v] of Object.entries(merged)) {
    if (v > 0) {
      regionsBucketed[k] = v;
    }
  }

  return {
    regions: regionsBucketed,
    sectors,
    totalValueEur,
    mixedCurrencyWarning,
    positions,
  };
}
