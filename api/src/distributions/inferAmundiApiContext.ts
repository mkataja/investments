/**
 * Builds `context` for Amundi `POST .../mapi/ProductAPI/getProductsData` from the product page URL.
 * Aligns with the site widget (`amundi-product-page-widget`); values are best-effort per hostname/path.
 */

type AmundiApiContext = {
  countryCode: string;
  countryName?: string;
  googleCountryCode?: string;
  domainName: string;
  bcp47Code: string;
  languageName: string;
  languageCode: string;
  userProfileName: string;
  userProfileSlug: string;
  gtmCode?: string;
  portalProfileName: null;
  portalProfileSlug: null;
};

const HOST_TO_COUNTRY: Record<
  string,
  { countryCode: string; googleCountryCode: string }
> = {
  "www.amundietf.nl": { countryCode: "NLD", googleCountryCode: "NL" },
  "amundietf.nl": { countryCode: "NLD", googleCountryCode: "NL" },
  "www.amundietf.co.uk": { countryCode: "GBR", googleCountryCode: "GB" },
  "amundietf.co.uk": { countryCode: "GBR", googleCountryCode: "GB" },
  "www.amundietf.fr": { countryCode: "FRA", googleCountryCode: "FR" },
  "amundietf.fr": { countryCode: "FRA", googleCountryCode: "FR" },
  "www.amundietf.de": { countryCode: "DEU", googleCountryCode: "DE" },
  "amundietf.de": { countryCode: "DEU", googleCountryCode: "DE" },
  "www.amundietf.se": { countryCode: "SWE", googleCountryCode: "SE" },
  "amundietf.se": { countryCode: "SWE", googleCountryCode: "SE" },
  "www.amundietf.fi": { countryCode: "FIN", googleCountryCode: "FI" },
  "amundietf.fi": { countryCode: "FIN", googleCountryCode: "FI" },
  "www.amundietf.ie": { countryCode: "IRL", googleCountryCode: "IE" },
  "amundietf.ie": { countryCode: "IRL", googleCountryCode: "IE" },
  "www.amundietf.lu": { countryCode: "LUX", googleCountryCode: "LU" },
  "amundietf.lu": { countryCode: "LUX", googleCountryCode: "LU" },
  "www.amundietf.be": { countryCode: "BEL", googleCountryCode: "BE" },
  "amundietf.be": { countryCode: "BEL", googleCountryCode: "BE" },
  "www.amundietf.at": { countryCode: "AUT", googleCountryCode: "AT" },
  "amundietf.at": { countryCode: "AUT", googleCountryCode: "AT" },
  "www.amundietf.es": { countryCode: "ESP", googleCountryCode: "ES" },
  "amundietf.es": { countryCode: "ESP", googleCountryCode: "ES" },
  "www.amundietf.it": { countryCode: "ITA", googleCountryCode: "IT" },
  "amundietf.it": { countryCode: "ITA", googleCountryCode: "IT" },
  "www.amundietf.pt": { countryCode: "PRT", googleCountryCode: "PT" },
  "amundietf.pt": { countryCode: "PRT", googleCountryCode: "PT" },
  "www.amundietf.no": { countryCode: "NOR", googleCountryCode: "NO" },
  "amundietf.no": { countryCode: "NOR", googleCountryCode: "NO" },
  "www.amundietf.dk": { countryCode: "DNK", googleCountryCode: "DK" },
  "amundietf.dk": { countryCode: "DNK", googleCountryCode: "DK" },
  "www.amundietf.pl": { countryCode: "POL", googleCountryCode: "PL" },
  "amundietf.pl": { countryCode: "POL", googleCountryCode: "PL" },
  "www.amundietf.cz": { countryCode: "CZE", googleCountryCode: "CZ" },
  "amundietf.cz": { countryCode: "CZE", googleCountryCode: "CZ" },
  "www.amundietf.ch": { countryCode: "CHE", googleCountryCode: "CH" },
  "amundietf.ch": { countryCode: "CHE", googleCountryCode: "CH" },
  "www.amundietf.com.hk": { countryCode: "HKG", googleCountryCode: "HK" },
  "amundietf.com.hk": { countryCode: "HKG", googleCountryCode: "HK" },
};

const PATH_LANG_TO_BCP47: Record<string, string> = {
  en: "en-GB",
  de: "de-DE",
  fr: "fr-FR",
  nl: "nl-NL",
  sv: "sv-SE",
  fi: "fi-FI",
  it: "it-IT",
  es: "es-ES",
  pt: "pt-PT",
  pl: "pl-PL",
  cs: "cs-CZ",
  zh: "zh-HK",
};

function pathLanguageCode(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  const first = parts[0]?.toLowerCase();
  if (first && /^[a-z]{2}$/.test(first)) {
    return first;
  }
  return null;
}

export function inferAmundiApiContext(
  productPageUrl: string,
): AmundiApiContext {
  const u = new URL(productPageUrl);
  const host = u.hostname.toLowerCase();
  const mapped = HOST_TO_COUNTRY[host] ?? {
    countryCode: "NLD",
    googleCountryCode: "NL",
  };
  const lang = pathLanguageCode(u.pathname) ?? "en";
  const bcp47 = PATH_LANG_TO_BCP47[lang] ?? "en-GB";
  const pathname = u.pathname.toLowerCase();
  const professional =
    pathname.includes("/professional/") && !pathname.includes("/individual/");
  const userProfileName = professional ? "INSTIT" : "RETAIL";
  const userProfileSlug = professional ? "professional" : "retail";

  const languageDisplayNames: Record<string, string> = {
    en: "English",
    de: "German",
    fr: "French",
    nl: "Dutch",
    sv: "Swedish",
    fi: "Finnish",
    it: "Italian",
    es: "Spanish",
    pt: "Portuguese",
    pl: "Polish",
    cs: "Czech",
    zh: "Chinese",
    no: "Norwegian",
    da: "Danish",
  };

  return {
    countryCode: mapped.countryCode,
    googleCountryCode: mapped.googleCountryCode,
    domainName: host,
    bcp47Code: bcp47,
    languageName: languageDisplayNames[lang] ?? "English",
    languageCode: lang,
    userProfileName,
    userProfileSlug,
    portalProfileName: null,
    portalProfileSlug: null,
  };
}
