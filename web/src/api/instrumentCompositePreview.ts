import type { CompositePreviewRow } from "../components/instrumentForm/types";
import { apiGet, apiPost } from "./client";

type CompositePreviewResponse = {
  asOfDate: string | null;
  fundName: string | null;
  rows: CompositePreviewRow[];
  notes: string[];
};

type InstrumentOptionForComposite = {
  id: number;
  kind: string;
  displayName: string;
  yahooSymbol: string | null;
  seligsonFund: { id: number; fid: number; name: string } | null;
};

/**
 * Loads Seligson table preview and the instrument list used for mapping rows,
 * excluding cash accounts (same contract as the instrument form composite flow).
 */
export async function fetchCompositePreviewAndNonCashInstruments(
  tableUrl: string,
): Promise<{
  preview: CompositePreviewResponse;
  instruments: InstrumentOptionForComposite[];
}> {
  const [preview, instList] = await Promise.all([
    apiPost<CompositePreviewResponse>("/instruments/composite-preview", {
      source: "seligson_pharos_table",
      url: tableUrl,
    }),
    apiGet<InstrumentOptionForComposite[]>("/instruments"),
  ]);
  return {
    preview,
    instruments: instList.filter((i) => i.kind !== "cash_account"),
  };
}
