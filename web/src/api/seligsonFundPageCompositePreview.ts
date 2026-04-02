import { apiPost } from "./client";

export type SeligsonFundPageCompositePreviewRow = {
  rawLabel: string;
  pctOfFund: number;
  suggestedInstrumentId: number | null;
  suggestedPseudoKey: "cash" | null;
};

export type SeligsonFundPageCompositePreviewResponse =
  | { composite: false }
  | {
      composite: true;
      fundName: string | null;
      asOfDate: string | null;
      notes: string[];
      rows: SeligsonFundPageCompositePreviewRow[];
    };

export function postSeligsonFundPageCompositePreview(
  seligsonFundPageUrl: string,
): Promise<SeligsonFundPageCompositePreviewResponse> {
  return apiPost<SeligsonFundPageCompositePreviewResponse>(
    "/instruments/seligson-fund-page-preview",
    { seligsonFundPageUrl },
  );
}
