import i18nCountries from "i18n-iso-countries";

const { alpha2ToNumeric, getAlpha2Codes } = i18nCountries;

export { alpha2ToNumeric };

/** ISO 3166-1 alpha-2 codes from `i18n-iso-countries` (official assignments + territories). */
export const ISO_3166_1_ALPHA2_CODES: ReadonlySet<string> = new Set(
  Object.keys(getAlpha2Codes()),
);

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
