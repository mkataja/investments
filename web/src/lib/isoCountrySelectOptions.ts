import { ISO_3166_1_ALPHA2_CODES } from "@investments/lib/geo/iso3166Alpha2CountryCodes";

const dn = new Intl.DisplayNames(["en"], { type: "region" });

type IsoCountryOption = { value: string; label: string };

/** ISO 3166-1 alpha-2 codes sorted by English region name. */
export function sortedIsoCountryOptions(): IsoCountryOption[] {
  const codes = [...ISO_3166_1_ALPHA2_CODES].sort((a, b) =>
    (dn.of(a) ?? a).localeCompare(dn.of(b) ?? b, "en", {
      sensitivity: "base",
    }),
  );
  return codes.map((value) => ({
    value,
    label: `${dn.of(value) ?? value} (${value})`,
  }));
}
