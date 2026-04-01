import { HttpError } from "./client";

type IbkrImportErrorAction =
  | { kind: "ambiguousIsins"; isins: string[]; message: string }
  | {
      kind: "missingSymbols";
      symbols: string[];
      missingIsins: string[] | null;
      message: string;
    }
  | { kind: "ambiguousSymbols"; symbols: string[]; message: string }
  | { kind: "message"; message: string };

export function classifyIbkrImportHttpError(
  err: unknown,
): IbkrImportErrorAction | null {
  if (
    !(err instanceof HttpError) ||
    err.body === null ||
    typeof err.body !== "object"
  ) {
    return null;
  }
  const o = err.body as {
    message?: string;
    missingSymbols?: string[];
    ambiguousSymbols?: string[];
    ambiguousIsins?: string[];
    missingIsins?: string[];
  };
  const message = o.message ?? err.message;
  if (o.ambiguousIsins && o.ambiguousIsins.length > 0) {
    return { kind: "ambiguousIsins", isins: o.ambiguousIsins, message };
  }
  if (o.missingSymbols && o.missingSymbols.length > 0) {
    return {
      kind: "missingSymbols",
      symbols: o.missingSymbols,
      missingIsins:
        o.missingIsins && o.missingIsins.length > 0 ? o.missingIsins : null,
      message,
    };
  }
  if (o.ambiguousSymbols && o.ambiguousSymbols.length > 0) {
    return { kind: "ambiguousSymbols", symbols: o.ambiguousSymbols, message };
  }
  return { kind: "message", message };
}

type SeligsonImportErrorAction =
  | { kind: "missingFunds"; names: string[]; message: string }
  | { kind: "ambiguousFunds"; names: string[]; message: string }
  | { kind: "message"; message: string };

export function classifySeligsonImportHttpError(
  err: unknown,
): SeligsonImportErrorAction | null {
  if (
    !(err instanceof HttpError) ||
    err.body === null ||
    typeof err.body !== "object"
  ) {
    return null;
  }
  const o = err.body as {
    message?: string;
    missingFundNames?: string[];
    ambiguousFundNames?: string[];
  };
  const message =
    o.message ?? (err instanceof Error ? err.message : String(err));
  if (o.missingFundNames && o.missingFundNames.length > 0) {
    return { kind: "missingFunds", names: o.missingFundNames, message };
  }
  if (o.ambiguousFundNames && o.ambiguousFundNames.length > 0) {
    return {
      kind: "ambiguousFunds",
      names: o.ambiguousFundNames,
      message,
    };
  }
  return { kind: "message", message };
}
