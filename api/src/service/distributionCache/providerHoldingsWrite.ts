import {
  instruments,
  providerHoldingsCache,
  yahooFinanceCache,
} from "@investments/db";
import {
  parseVanguardUkProfessionalHoldingsPortId,
  validateHoldingsDistributionUrl,
  validateProviderBreakdownDataUrl,
} from "@investments/lib/holdingsUrl";
import { eq } from "drizzle-orm";
import { db } from "../../db.js";
import { buildDistributionFromSec13FInfoTableXml } from "../../distributions/buildSec13fDistribution.js";
import { fetchAmundiHoldingsCompositionJson } from "../../distributions/fetchAmundiHoldingsComposition.js";
import { fetchJpmProductDataJson } from "../../distributions/fetchJpmProductData.js";
import { fetchProviderHoldingsBytes } from "../../distributions/fetchProviderHoldings.js";
import { fetchVanguardUkGpxHoldings } from "../../distributions/fetchVanguardUkGpxHoldings.js";
import { parseAmundiHoldingsCompositionJson } from "../../distributions/parseAmundiHoldingsComposition.js";
import { parseIsharesHoldingsCsv } from "../../distributions/parseIsharesHoldingsCsv.js";
import {
  parseJpmHoldingsXlsx,
  parseJpmHoldingsXlsxCountriesAndCashWeight,
} from "../../distributions/parseJpmHoldingsXlsx.js";
import { parseJpmProductDataSectorBreakdown } from "../../distributions/parseJpmProductDataSectorBreakdown.js";
import { parseSsgaHoldingsXlsx } from "../../distributions/parseSsgaHoldingsXlsx.js";
import { parseVanguardUkGpxHoldingsJson } from "../../distributions/parseVanguardUkGpxHoldings.js";
import { parseXtrackersHoldingsXlsx } from "../../distributions/parseXtrackersHoldingsXlsx.js";
import {
  assertProviderDocumentMatchesInstrument,
  extractHoldingsUrlIdentifiers,
  extractJpmProductDataUrlIdentifiers,
  extractJpmXlsxMetadataIdentifiers,
  extractSsgaXlsxMetadataIdentifiers,
  mergeProviderDocumentIdentifiers,
  vanguardIdentifiersFromFundName,
} from "../../distributions/providerDocumentIdentity.js";
import { roundWeights } from "../../distributions/roundWeights.js";
import { calendarDateUtcFromInstant } from "../../lib/calendarDateUtc.js";
import { upsertDistributionSnapshot } from "../instrument/priceDistributionWrite.js";

export async function writeProviderHoldingsDistributionCache(
  instrumentId: number,
  url: string,
  fetchedAt: Date = new Date(),
  options?: { providerBreakdownDataUrl?: string | null },
): Promise<void> {
  const v = validateHoldingsDistributionUrl(url);
  if (!v.ok || !v.normalized || !v.provider) {
    throw new Error(v.ok ? "Holdings URL is missing or invalid" : v.message);
  }

  const [instrumentRow] = await db
    .select({
      displayName: instruments.displayName,
      yahooSymbol: instruments.yahooSymbol,
      isin: instruments.isin,
    })
    .from(instruments)
    .where(eq(instruments.id, instrumentId))
    .limit(1);
  if (!instrumentRow) {
    throw new Error("Instrument not found");
  }
  const matchFields = {
    displayName: instrumentRow.displayName,
    yahooSymbol: instrumentRow.yahooSymbol,
    isin: instrumentRow.isin,
  };

  let payload: {
    countries: Record<string, number>;
    sectors: Record<string, number>;
  };
  let source: string;
  let raw: string;

  if (v.provider === "vanguard_uk_gpx") {
    const portId = parseVanguardUkProfessionalHoldingsPortId(v.normalized);
    if (!portId) {
      throw new Error("Invalid Vanguard UK professional product URL");
    }
    const { items, snapshot, fundFullName } =
      await fetchVanguardUkGpxHoldings(portId);
    assertProviderDocumentMatchesInstrument(
      matchFields,
      mergeProviderDocumentIdentifiers(
        extractHoldingsUrlIdentifiers(v.normalized, "vanguard_uk_gpx"),
        vanguardIdentifiersFromFundName(fundFullName),
      ),
    );
    payload = parseVanguardUkGpxHoldingsJson(items);
    source = "vanguard_uk_gpx";
    raw = JSON.stringify(snapshot);
  } else if (v.provider === "amundi_etf_api") {
    const { json, rawText } = await fetchAmundiHoldingsCompositionJson(
      v.normalized,
    );
    assertProviderDocumentMatchesInstrument(
      matchFields,
      extractHoldingsUrlIdentifiers(v.normalized, "amundi_etf_api"),
    );
    payload = parseAmundiHoldingsCompositionJson(json);
    source = "amundi_etf_composition_api";
    raw = rawText;
  } else {
    const bytes = await fetchProviderHoldingsBytes(v.normalized);

    if (v.provider === "ishares_csv") {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      payload = parseIsharesHoldingsCsv(text);
      source = "ishares_holdings_csv";
      raw = text;
    } else if (v.provider === "sec_13f_xml") {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      assertProviderDocumentMatchesInstrument(
        matchFields,
        mergeProviderDocumentIdentifiers(
          extractHoldingsUrlIdentifiers(v.normalized, "sec_13f_xml"),
        ),
      );
      payload = await buildDistributionFromSec13FInfoTableXml(text);
      source = "sec_13f_infotable_xml";
      raw = text;
    } else if (v.provider === "xtrackers_xlsx") {
      payload = parseXtrackersHoldingsXlsx(bytes);
      source = "xtrackers_holdings_xlsx";
      raw = Buffer.from(bytes).toString("base64");
    } else if (v.provider === "jpm_xlsx") {
      raw = Buffer.from(bytes).toString("base64");
      const breakdownRaw = options?.providerBreakdownDataUrl?.trim();
      let breakdownNormalized: string | null = null;
      if (breakdownRaw) {
        const bv = validateProviderBreakdownDataUrl(breakdownRaw);
        if (!bv.ok || !bv.normalized) {
          throw new Error(
            bv.ok ? "Invalid provider breakdown URL" : bv.message,
          );
        }
        breakdownNormalized = bv.normalized;
      }
      const jpmIdParts = [
        extractHoldingsUrlIdentifiers(v.normalized, "jpm_xlsx"),
        extractJpmXlsxMetadataIdentifiers(bytes),
      ];
      if (breakdownNormalized) {
        jpmIdParts.push(
          extractJpmProductDataUrlIdentifiers(breakdownNormalized),
        );
      }
      assertProviderDocumentMatchesInstrument(
        matchFields,
        mergeProviderDocumentIdentifiers(...jpmIdParts),
      );
      if (breakdownNormalized) {
        const json = await fetchJpmProductDataJson(breakdownNormalized);
        const sectorsFromApi = parseJpmProductDataSectorBreakdown(json);
        const { countries, cashWeight: cashW } =
          parseJpmHoldingsXlsxCountriesAndCashWeight(bytes);
        const sectors = { ...sectorsFromApi };
        if (cashW > 0) {
          sectors.cash = (sectors.cash ?? 0) + cashW;
        }
        payload = { countries, sectors };
        source = "jpm_holdings_xlsx";
      } else {
        payload = parseJpmHoldingsXlsx(bytes);
        source = "jpm_holdings_xlsx";
      }
    } else {
      assertProviderDocumentMatchesInstrument(
        matchFields,
        mergeProviderDocumentIdentifiers(
          extractHoldingsUrlIdentifiers(v.normalized, "ssga_xlsx"),
          extractSsgaXlsxMetadataIdentifiers(bytes),
        ),
      );
      payload = parseSsgaHoldingsXlsx(bytes);
      source = "ssga_holdings_xlsx";
      raw = Buffer.from(bytes).toString("base64");
    }
  }

  const rounded = {
    countries: roundWeights(payload.countries),
    sectors: roundWeights(payload.sectors),
  };

  await db.transaction(async (tx) => {
    await tx
      .insert(providerHoldingsCache)
      .values({
        instrumentId,
        fetchedAt,
        source,
        raw,
      })
      .onConflictDoUpdate({
        target: providerHoldingsCache.instrumentId,
        set: {
          fetchedAt,
          source,
          raw,
        },
      });
    await tx
      .delete(yahooFinanceCache)
      .where(eq(yahooFinanceCache.instrumentId, instrumentId));
    await upsertDistributionSnapshot(tx, {
      instrumentId,
      snapshotDate: calendarDateUtcFromInstant(fetchedAt),
      fetchedAt,
      source,
      payload: rounded,
    });
  });
}
