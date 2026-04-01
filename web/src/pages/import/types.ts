export type DegiroOk = {
  ok: true;
  processed: number;
  changed: number;
  unchanged: number;
  skippedRows?: number;
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

export type DegiroProposalErr = {
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
