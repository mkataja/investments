/**
 * Vanguard UK Professional site loads holdings from GPX GraphQL (`/gpx/graphql`, `x-consumer-id: uk2`).
 * See bundled UK app config and `FundsHoldingsQuery` in their public JS.
 */

const VANGUARD_UK_GPX_URL = "https://www.vanguard.co.uk/gpx/graphql";
const VANGUARD_UK_CONSUMER_ID = "uk2";

/**
 * BORS security-type filters aligned with the UK Professional UI (equity + mutual fund lines).
 * Lines with only other types (e.g. some derivatives) are omitted from the API response for this set.
 */
export const VANGUARD_UK_GPX_HOLDINGS_SECURITY_TYPES = [
  "EQ.DRCPT",
  "EQ.ETF",
  "EQ.FSH",
  "EQ.PREF",
  "EQ.PSH",
  "EQ.REIT",
  "EQ.STOCK",
  "EQ.RIGHT",
  "EQ.WRT",
  "MF.MF",
] as const;

const HOLDINGS_QUERY = `
query FundsHoldingsQuery($portIds: [String!], $securityTypes: [String!], $lastItemKey: String) {
  funds(portIds: $portIds) {
    profile {
      fundFullName
      fundCurrency
      primarySectorEquityClassification
    }
  }
  borHoldings(portIds: $portIds) {
    holdings(limit: 1500, securityTypes: $securityTypes, lastItemKey: $lastItemKey) {
      items {
        issuerName
        securityLongDescription
        gicsSectorDescription
        icbSectorDescription
        icbIndustryDescription
        marketValuePercentage
        sedol1
        quantity
        ticker
        securityType
        finalMaturity
        effectiveDate
        marketValueBaseCurrency
        bloombergIsoCountry
        couponRate
      }
      totalHoldings
      lastItemKey
    }
  }
}
`.trim();

export type VanguardGpxHoldingItem = {
  issuerName?: string | null;
  securityLongDescription?: string | null;
  gicsSectorDescription?: string | null;
  icbSectorDescription?: string | null;
  icbIndustryDescription?: string | null;
  marketValuePercentage?: number | null;
  bloombergIsoCountry?: string | null;
  securityType?: string | null;
};

type GpxGraphqlError = { message?: string };
type GpxHoldingsResponse = {
  data?: {
    funds?: Array<{
      profile?: { fundFullName?: string | null };
    } | null>;
    borHoldings?: Array<{
      holdings?: {
        totalHoldings?: number | null;
        lastItemKey?: string | null;
        items?: VanguardGpxHoldingItem[] | null;
      } | null;
    } | null>;
  };
  errors?: GpxGraphqlError[];
};

export type VanguardUkGpxFetchSnapshot = {
  portId: string;
  pages: unknown[];
};

/**
 * Fetches all holdings pages for a Vanguard UK **port id** (from the professional product URL).
 */
export async function fetchVanguardUkGpxHoldings(portId: string): Promise<{
  items: VanguardGpxHoldingItem[];
  snapshot: VanguardUkGpxFetchSnapshot;
  fundFullName: string | null;
}> {
  const pages: unknown[] = [];
  const items: VanguardGpxHoldingItem[] = [];
  let lastItemKey: string | null | undefined;
  let fundFullName: string | null = null;

  for (let i = 0; i < 64; i++) {
    const body = {
      query: HOLDINGS_QUERY,
      variables: {
        portIds: [portId],
        securityTypes: [...VANGUARD_UK_GPX_HOLDINGS_SECURITY_TYPES],
        lastItemKey: lastItemKey ?? null,
      },
    };

    const res = await fetch(VANGUARD_UK_GPX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-consumer-id": VANGUARD_UK_CONSUMER_ID,
        "User-Agent": "Mozilla/5.0 (compatible; investments-tracker/1.0)",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      throw new Error(`Vanguard GPX holdings failed (HTTP ${res.status})`);
    }

    const json = (await res.json()) as GpxHoldingsResponse;
    pages.push(json);

    const fn = json.data?.funds?.[0]?.profile?.fundFullName?.trim();
    if (fn && !fundFullName) {
      fundFullName = fn;
    }

    if (json.errors?.length) {
      const msg =
        json.errors
          .map((e) => e.message)
          .filter(Boolean)
          .join("; ") || "GraphQL error";
      throw new Error(`Vanguard GPX: ${msg}`);
    }

    const h = json.data?.borHoldings?.[0]?.holdings;
    if (!h) {
      throw new Error("Vanguard GPX: missing borHoldings.holdings");
    }

    const batch = h.items ?? [];
    for (const row of batch) {
      items.push(row);
    }

    const nextKey = h.lastItemKey;
    if (!nextKey || batch.length === 0) {
      break;
    }
    lastItemKey = nextKey;
  }

  return {
    items,
    snapshot: { portId, pages },
    fundFullName,
  };
}
