export function buildDegiroImportFormData(args: {
  file: File;
  portfolioId: number | null;
  brokerId?: number | null;
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
  if (args.brokerId != null) {
    form.append("brokerId", String(args.brokerId));
  }
  if (args.createInstruments != null) {
    form.append("createInstruments", JSON.stringify(args.createInstruments));
  }
  return form;
}

export function buildIbkrImportFormData(args: {
  file: File;
  portfolioId: number | null;
  brokerId?: number | null;
}): FormData {
  const form = new FormData();
  form.append("file", args.file);
  if (args.portfolioId != null) {
    form.append("portfolioId", String(args.portfolioId));
  }
  if (args.brokerId != null) {
    form.append("brokerId", String(args.brokerId));
  }
  return form;
}

export function buildSeligsonImportFormData(args: {
  file: File;
  portfolioId: number | null;
  brokerId?: number | null;
  skipMissingInstruments?: boolean;
}): FormData {
  const form = new FormData();
  form.append("file", args.file);
  if (args.portfolioId != null) {
    form.append("portfolioId", String(args.portfolioId));
  }
  if (args.brokerId != null) {
    form.append("brokerId", String(args.brokerId));
  }
  if (args.skipMissingInstruments === true) {
    form.append("skipMissingInstruments", "true");
  }
  return form;
}

export function buildSveaImportFormData(args: {
  file: File;
  portfolioId: number | null;
  brokerId?: number | null;
  instrumentId?: number | null;
}): FormData {
  const form = new FormData();
  form.append("file", args.file);
  if (args.portfolioId != null) {
    form.append("portfolioId", String(args.portfolioId));
  }
  if (args.brokerId != null) {
    form.append("brokerId", String(args.brokerId));
  }
  if (args.instrumentId != null) {
    form.append("instrumentId", String(args.instrumentId));
  }
  return form;
}
