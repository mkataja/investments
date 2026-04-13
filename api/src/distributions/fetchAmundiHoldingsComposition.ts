import { parseAmundiEtfProductPageIsin } from "@investments/lib/holdingsUrl";
import { inferAmundiApiContext } from "./inferAmundiApiContext.js";

const GET_PRODUCTS_DATA_PATH = "/mapi/ProductAPI/getProductsData";

const COMPOSITION_FIELDS = [
  "date",
  "type",
  "bbg",
  "isin",
  "name",
  "weight",
  "quantity",
  "currency",
  "sector",
  "country",
  "countryOfRisk",
] as const;

export type AmundiCompositionApiRow = {
  weight?: number;
  compositionCharacteristics?: {
    weight?: number;
    type?: string;
    name?: string;
    sector?: string;
    country?: string;
    countryOfRisk?: string;
  };
};

export type AmundiGetProductsDataResponse = {
  products?: Array<{
    productId?: string;
    composition?: {
      totalNumberOfInstruments?: number;
      compositionData?: AmundiCompositionApiRow[];
    };
  }>;
};

/**
 * Fetches full fund composition from Amundi `getProductsData` (same JSON as the on-site XLSX export).
 */
export async function fetchAmundiHoldingsCompositionJson(
  productPageUrl: string,
): Promise<{ json: AmundiGetProductsDataResponse; rawText: string }> {
  const isin = parseAmundiEtfProductPageIsin(productPageUrl);
  if (!isin) {
    throw new Error(
      "Invalid Amundi ETF product URL: expected .../products/.../{ISIN} on an amundietf.* host",
    );
  }
  const page = new URL(productPageUrl);
  const apiUrl = new URL(
    GET_PRODUCTS_DATA_PATH,
    `${page.protocol}//${page.host}`,
  );
  const context = inferAmundiApiContext(productPageUrl);
  const body = {
    context,
    productIds: [isin],
    productType: "PRODUCT",
    composition: {
      compositionFields: [...COMPOSITION_FIELDS],
    },
  };

  const res = await fetch(apiUrl.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; investments-tracker/1.0)",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(
      `Amundi getProductsData failed (HTTP ${res.status}): ${rawText.slice(0, 500)}`,
    );
  }
  let json: AmundiGetProductsDataResponse;
  try {
    json = JSON.parse(rawText) as AmundiGetProductsDataResponse;
  } catch {
    throw new Error("Amundi getProductsData returned non-JSON");
  }
  const rows = json.products?.[0]?.composition?.compositionData;
  if (!rows || rows.length === 0) {
    throw new Error(
      "Amundi getProductsData returned no composition rows for this fund/context",
    );
  }
  return { json, rawText };
}
