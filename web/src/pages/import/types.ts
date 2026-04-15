export type DegiroOk = {
  ok: true;
  processed: number;
  changed: number;
  unchanged: number;
  /** Rows inserted (new external id for this broker/source). */
  added: number;
  /** Existing rows whose data was updated. */
  updated: number;
  skippedRows?: number;
  /** Present when import ran with delete-all-old for this broker or Svea account. */
  deletedOld?: number;
};

export type DegiroProposalOk = {
  isin: string;
  product: string;
  referenceExchange: string;
  venue: string;
  yahooSymbol: string;
  displayName: string;
  kind: "etf" | "stock";
  quoteType: string | null;
};

type DegiroProposalErr = {
  isin: string;
  product: string;
  referenceExchange: string;
  venue: string;
  error: string;
};

export type DegiroProposal = DegiroProposalOk | DegiroProposalErr;

export type DegiroNeedsInstruments = {
  ok: false;
  needsInstruments: true;
  proposals: DegiroProposal[];
};

export function isProposalOk(p: DegiroProposal): p is DegiroProposalOk {
  return "yahooSymbol" in p;
}

export function tryParseImportErrorJson(msg: string): {
  message?: string;
  missingFundNames?: string[];
  ambiguousFundNames?: string[];
} | null {
  const idx = msg.indexOf("{");
  if (idx < 0) {
    return null;
  }
  try {
    const v = JSON.parse(msg.slice(idx)) as unknown;
    if (v === null || typeof v !== "object") {
      return null;
    }
    return v as {
      message?: string;
      missingFundNames?: string[];
      ambiguousFundNames?: string[];
    };
  } catch {
    return null;
  }
}
