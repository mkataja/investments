export function buildDegiroImportFormData(args: {
  file: File;
  portfolioId: number | null;
  createInstruments?: Array<{
    isin: string;
    yahooSymbol: string;
    kind: "etf" | "stock";
  }>;
}): FormData {
  const form = new FormData();
  form.append("file", args.file);
  if (args.portfolioId != null) {
    form.append("portfolioId", String(args.portfolioId));
  }
  if (args.createInstruments != null) {
    form.append("createInstruments", JSON.stringify(args.createInstruments));
  }
  return form;
}

export function buildIbkrImportFormData(
  file: File,
  portfolioId: number | null,
): FormData {
  const form = new FormData();
  form.append("file", file);
  if (portfolioId != null) {
    form.append("portfolioId", String(portfolioId));
  }
  return form;
}

export function buildSeligsonImportFormData(args: {
  file: File;
  portfolioId: number | null;
  skipMissingInstruments?: boolean;
}): FormData {
  const form = new FormData();
  form.append("file", args.file);
  if (args.portfolioId != null) {
    form.append("portfolioId", String(args.portfolioId));
  }
  if (args.skipMissingInstruments === true) {
    form.append("skipMissingInstruments", "true");
  }
  return form;
}

export function buildSveaImportFormData(
  file: File,
  portfolioId: number | null,
): FormData {
  const form = new FormData();
  form.append("file", file);
  if (portfolioId != null) {
    form.append("portfolioId", String(portfolioId));
  }
  return form;
}
