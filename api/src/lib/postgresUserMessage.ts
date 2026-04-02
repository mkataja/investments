function readPgConstraint(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "constraint" in error &&
    typeof (error as { constraint: unknown }).constraint === "string"
  ) {
    return (error as { constraint: string }).constraint;
  }
  return null;
}

/**
 * Maps Postgres driver errors to short API messages. Returns `null` when unknown.
 */
export function userFacingMessageFromDbError(error: unknown): string | null {
  const msg = error instanceof Error ? error.message : String(error);
  const constraint = readPgConstraint(error);

  if (
    constraint === "seligson_distribution_cache_html_source_ck" ||
    msg.includes("seligson_distribution_cache_html_source_ck")
  ) {
    return "Seligson HTML cache must include line-by-line holdings, or bond allocation and country pages together, or a single allocation table (not an empty snapshot).";
  }

  return null;
}

/** Unique index `instruments_seligson_fund_id_uidx` (concurrent insert race). */
export function duplicateSeligsonFundInstrumentMessage(
  error: unknown,
): string | null {
  const msg = error instanceof Error ? error.message : String(error);
  const constraint = readPgConstraint(error);
  if (
    constraint === "instruments_seligson_fund_id_uidx" ||
    msg.includes("instruments_seligson_fund_id_uidx")
  ) {
    return "An instrument for this Seligson fund already exists.";
  }
  return null;
}
