import type { DegiroNeedsInstruments, DegiroOk } from "../pages/import/types";

type ParseDegiroImportResult =
  | { outcome: "needsInstruments"; value: DegiroNeedsInstruments }
  | { outcome: "ok"; value: DegiroOk }
  | { outcome: "unexpected" };

export function parseDegiroImportResponse(
  data: unknown,
): ParseDegiroImportResult {
  if (
    data &&
    typeof data === "object" &&
    "ok" in data &&
    (data as { ok: unknown }).ok === false &&
    "needsInstruments" in data &&
    (data as { needsInstruments: unknown }).needsInstruments === true &&
    "proposals" in data
  ) {
    return {
      outcome: "needsInstruments",
      value: data as DegiroNeedsInstruments,
    };
  }
  if (
    data &&
    typeof data === "object" &&
    "ok" in data &&
    (data as { ok: unknown }).ok === true &&
    "processed" in data &&
    "changed" in data &&
    "unchanged" in data
  ) {
    return { outcome: "ok", value: data as DegiroOk };
  }
  return { outcome: "unexpected" };
}

/** Shared success shape for DEGIRO-style import JSON (IBKR, Seligson success). */
export function parseImportOkResponse(data: unknown): DegiroOk | null {
  if (
    data &&
    typeof data === "object" &&
    "ok" in data &&
    (data as { ok: unknown }).ok === true &&
    "processed" in data &&
    "changed" in data &&
    "unchanged" in data
  ) {
    return data as DegiroOk;
  }
  return null;
}
