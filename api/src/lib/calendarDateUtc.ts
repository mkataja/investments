/** UTC calendar date `YYYY-MM-DD` from an instant (matches DB `timestamptz` → date convention). */
export function calendarDateUtcFromInstant(d: Date): string {
  return d.toISOString().slice(0, 10);
}
