import { distributions } from "@investments/db";
import {
  normLabel,
  resolveRegionKeyToIso,
} from "@investments/lib/geo/countryIso";
import { MIN_PORTFOLIO_ALLOCATION_FRACTION } from "@investments/lib/minPortfolioAllocationFraction";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db.js";
import { SELIGSON_RESOLUTION_UNKNOWN_COUNTRY_ISO } from "../../distributions/seligson.js";

/** Same unmapped vs ISO rules as `aggregateRegionsToGeoBuckets`; ZZ tracked separately (maps to EM, not unknown bucket). */
function collectUnknownCountryIssueParts(
  countries: Record<string, number> | undefined,
): string[] {
  if (!countries) {
    return [];
  }
  const zz = SELIGSON_RESOLUTION_UNKNOWN_COUNTRY_ISO;
  const parts: string[] = [];
  for (const [rawKey, w] of Object.entries(countries)) {
    if (
      typeof w !== "number" ||
      !Number.isFinite(w) ||
      w < MIN_PORTFOLIO_ALLOCATION_FRACTION
    ) {
      continue;
    }
    const key = rawKey.trim();
    if (normLabel(key) === "european union") {
      continue;
    }
    const iso = resolveRegionKeyToIso(key);
    const pct = `${(w * 100).toFixed(2)}%`;
    if (iso === zz) {
      parts.push(`${JSON.stringify(rawKey)} ${pct} (${zz} unmapped country)`);
      continue;
    }
    if (iso) {
      continue;
    }
    parts.push(`${JSON.stringify(rawKey)} ${pct} (no ISO mapping)`);
  }
  return parts;
}

export async function warnIfRefreshedDistributionHasUnknownCountry(
  instrumentId: number,
  displayName: string,
): Promise<void> {
  const [row] = await db
    .select({ payload: distributions.payload })
    .from(distributions)
    .where(eq(distributions.instrumentId, instrumentId))
    .orderBy(desc(distributions.snapshotDate))
    .limit(1);
  const countries = row?.payload?.countries;
  const detailParts = collectUnknownCountryIssueParts(countries);
  if (detailParts.length === 0) {
    return;
  }
  console.warn(
    `[refresh-distribution] Instrument id=${instrumentId} (${displayName}) has unknown or unmapped country weight: ${detailParts.join("; ")}`,
  );
}
