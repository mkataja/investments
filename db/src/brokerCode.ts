/**
 * Default code when the user does not supply one: uppercase, non-alphanumeric → underscore.
 */
export function brokerCodeFromDefaultName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return "BROKER";
  }
  const normalized = trimmed
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.length > 0 ? normalized : "BROKER";
}
