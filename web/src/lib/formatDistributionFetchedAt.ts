/**
 * Formats a timestamp for UI: full date+time when the instant has a non-midnight local time;
 * otherwise date only. Date-only strings (`YYYY-MM-DD`) are shown as a local calendar date.
 */
export function formatDistributionFetchedAt(raw: string): string {
  const t = raw.trim();
  if (t === "") {
    return "";
  }

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    return dt.toLocaleDateString();
  }

  const d = new Date(t);
  if (Number.isNaN(d.getTime())) {
    return t;
  }

  if (
    d.getHours() === 0 &&
    d.getMinutes() === 0 &&
    d.getSeconds() === 0 &&
    d.getMilliseconds() === 0
  ) {
    return d.toLocaleDateString();
  }

  return d.toLocaleString();
}
