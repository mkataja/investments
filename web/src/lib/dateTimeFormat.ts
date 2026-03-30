/**
 * Shared date/time formatting for UI (tables, forms, cache timestamps).
 * Calendar dates use **YYYY-MM-DD**; with time: **YYYY-MM-DD HH:mm** (local, 24-hour).
 */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** ISO 8601 calendar date (UTC year/month/day). */
function formatYmdUtc(year: number, month1: number, day: number): string {
  return `${year}-${pad2(month1)}-${pad2(day)}`;
}

/**
 * `value` string for `<input type="datetime-local" />` from a `Date` in local time.
 */
export function formatDateTimeLocalInputValue(d: Date): string {
  return `${formatYmdUtc(d.getFullYear(), d.getMonth() + 1, d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Formats a parseable date string for display:
 * - `YYYY-MM-DD` → same **UTC** calendar date (no time).
 * - An instant at **UTC midnight** → **date only** (avoids bogus local times when the stored
 *   value means “calendar day”, e.g. `normalizeTradeDate` / imports without time of day).
 * - Any other valid instant → **YYYY-MM-DD HH:mm** in the **local** time zone.
 */
export function formatInstantForDisplay(raw: string): string {
  const t = raw.trim();
  if (t === "") {
    return t;
  }

  const ymdOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (ymdOnly) {
    return formatYmdUtc(
      Number(ymdOnly[1]),
      Number(ymdOnly[2]),
      Number(ymdOnly[3]),
    );
  }

  const d = new Date(t);
  if (Number.isNaN(d.getTime())) {
    return t;
  }

  if (isUtcMidnight(d)) {
    return formatYmdUtc(
      d.getUTCFullYear(),
      d.getUTCMonth() + 1,
      d.getUTCDate(),
    );
  }

  return `${formatYmdUtc(d.getFullYear(), d.getMonth() + 1, d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function isUtcMidnight(d: Date): boolean {
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}
