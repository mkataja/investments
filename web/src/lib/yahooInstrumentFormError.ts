const SCHEMA_VALIDATION = "Failed Yahoo Schema validation";
const QUOTE_NOT_FOUND = "quote not found for symbol";

/** Maps common Yahoo upstream failures to a not-found style message for the add-instrument flow. */
export function mapYahooInstrumentFormError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (raw.includes(SCHEMA_VALIDATION) || lower.includes(QUOTE_NOT_FOUND)) {
    return "Not found";
  }
  return raw;
}
