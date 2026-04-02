import {
  fetchSeligsonPublicPageHtml,
  parseSeligsonPharosAllocationTable,
  parseSeligsonPublicPageFundName,
} from "../distributions/seligsonPharosAllocationTable.js";
import {
  suggestBestInstrumentId,
  suggestPseudoKeyForLabel,
} from "./compositeInstrumentMatch.js";
import { loadInstrumentMatchCandidates } from "./instrumentMatchCandidates.js";
import {
  fetchSeligsonFundIntroPageHtml,
  isSeligsonFundViewerUrl,
  normalizeSeligsonFundPageToHttps,
  resolveRahastonSijoituksetTableUrl,
} from "./seligsonFundIntroPage.js";

type SeligsonFundPageCompositePreviewRow = {
  rawLabel: string;
  pctOfFund: number;
  suggestedInstrumentId: number | null;
  suggestedPseudoKey: "cash" | null;
};

type SeligsonFundPageCompositePreviewResult =
  | { composite: false }
  | {
      composite: true;
      fundName: string | null;
      asOfDate: string | null;
      notes: string[];
      rows: SeligsonFundPageCompositePreviewRow[];
    };

/**
 * Detects Pharos-style static “Osuus rahastosta” HTML tables linked as “Rahaston sijoitukset”.
 * Normal funds link to FundViewer instead; those are not composite here.
 */
export async function seligsonFundPageCompositePreview(
  pageUrl: string,
): Promise<SeligsonFundPageCompositePreviewResult> {
  const { href: introHref, html: introHtml } =
    await fetchSeligsonFundIntroPageHtml(pageUrl);
  const tableUrl = resolveRahastonSijoituksetTableUrl(introHtml, introHref);
  if (tableUrl == null) {
    return { composite: false };
  }
  const tableHttps = normalizeSeligsonFundPageToHttps(tableUrl);
  if (isSeligsonFundViewerUrl(tableHttps)) {
    return { composite: false };
  }
  let tableHtml: string;
  try {
    tableHtml = await fetchSeligsonPublicPageHtml(tableHttps);
  } catch {
    return { composite: false };
  }
  const parsed = parseSeligsonPharosAllocationTable(tableHtml);
  if (parsed.rows.length === 0) {
    return { composite: false };
  }
  // Fund name from the pasted landing page HTML, not the "Rahaston sijoitukset" table page.
  const fundName = parseSeligsonPublicPageFundName(introHtml);
  const asOfDate = parsed.asOfDate;
  const candidates = await loadInstrumentMatchCandidates();
  const rows: SeligsonFundPageCompositePreviewRow[] = parsed.rows.map((r) => {
    const pseudo = suggestPseudoKeyForLabel(r.rawLabel);
    const suggestedInstrumentId =
      pseudo == null ? suggestBestInstrumentId(r.rawLabel, candidates) : null;
    return {
      rawLabel: r.rawLabel,
      pctOfFund: r.pctOfFund,
      suggestedInstrumentId,
      suggestedPseudoKey: pseudo,
    };
  });
  return {
    composite: true,
    fundName,
    asOfDate,
    notes: parsed.notes,
    rows,
  };
}
