/**
 * Shared date/time formatting for UI (tables, forms, cache timestamps).
 */
import { APP_LOCALE } from "./locale";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(APP_LOCALE, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DATE_ONLY_UTC_FORMATTER = new Intl.DateTimeFormat(APP_LOCALE, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC",
});

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
 * Local wall time as **YYYY-MM-DD HH:mm** (24-hour), for text fields that should match
 * {@link formatInstantForDisplay} with time.
 */
export function formatLocalDateTimeYmdHm(d: Date): string {
  return `${formatYmdUtc(d.getFullYear(), d.getMonth() + 1, d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Parses **YYYY-MM-DD HH:mm** or **YYYY-MM-DDTHH:mm** in local time. Returns `null` if invalid.
 */
export function parseLocalDateTimeYmdHm(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) {
    return null;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const h = Number(m[4]);
  const min = Number(m[5]);
  if (
    mo < 1 ||
    mo > 12 ||
    day < 1 ||
    day > 31 ||
    h < 0 ||
    h > 23 ||
    min < 0 ||
    min > 59
  ) {
    return null;
  }
  const d = new Date(y, mo - 1, day, h, min, 0, 0);
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== day) {
    return null;
  }
  return d;
}

/**
 * Formats a parseable date string for display:
 * - `YYYY-MM-DD` → localized calendar date (same **UTC** day, no time).
 * - An instant at **UTC midnight** → **date only** (avoids bogus local times when the stored
 *   value means “calendar day”, e.g. `normalizeTradeDate` / imports without time of day).
 * - Any other valid instant → localized date + time in the **local** time zone.
 */
export function formatInstantForDisplay(raw: string): string {
  const t = raw.trim();
  if (t === "") {
    return t;
  }

  const ymdOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (ymdOnly) {
    const y = Number(ymdOnly[1]);
    const m = Number(ymdOnly[2]);
    const d = Number(ymdOnly[3]);
    return DATE_ONLY_UTC_FORMATTER.format(new Date(Date.UTC(y, m - 1, d)));
  }

  const d = new Date(t);
  if (Number.isNaN(d.getTime())) {
    return t;
  }

  if (isUtcMidnight(d)) {
    return DATE_ONLY_UTC_FORMATTER.format(d);
  }

  return DATE_TIME_FORMATTER.format(d);
}

function isUtcMidnight(d: Date): boolean {
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}
