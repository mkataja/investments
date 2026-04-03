import i18nCountries from "i18n-iso-countries";

const { alpha2ToNumeric, getAlpha2Codes, numericToAlpha2 } = i18nCountries;

export { alpha2ToNumeric, numericToAlpha2 };

/** ISO 3166-1 alpha-2 codes from `i18n-iso-countries` (official assignments + territories). */
export const ISO_3166_1_ALPHA2_CODES: ReadonlySet<string> = new Set(
  Object.keys(getAlpha2Codes()),
);

/**
 * World-atlas / Natural Earth choropleth `feature.id` (ISO 3166-1 numeric) to uppercase alpha-2.
 * Delegates to `i18n-iso-countries` {@link numericToAlpha2} (zero-padded numeric lookup).
 */
export function numericAtlasIdToAlpha2Upper(atlasId: string): string | null {
  const a2 = numericToAlpha2(atlasId);
  if (typeof a2 !== "string" || a2.length !== 2) return null;
  return a2.toUpperCase();
}

/**
 * Returns uppercase ISO 3166-1 alpha-2 when `raw` is a valid code, otherwise `null`.
 */
export function normalizeCashAccountIsoCountryCode(raw: string): string | null {
  const t = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(t)) {
    return null;
  }
  return ISO_3166_1_ALPHA2_CODES.has(t) ? t : null;
}
