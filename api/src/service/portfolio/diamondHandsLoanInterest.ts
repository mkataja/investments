/**
 * Reference index in `interest_rates` for Diamond Hands virtual loan APR
 * (annual fraction + `users.rate_margin`).
 */
export const DIAMOND_HANDS_LOAN_INTEREST_INDEX_NAME = "euribor_3m" as const;

const MS_PER_DAY = 86400000;

function utcNoonMs(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00.000Z`).getTime();
}

/** Absolute calendar distance in days between UTC `YYYY-MM-DD` strings. */
export function calendarDaysApartUtc(a: string, b: string): number {
  return Math.round(Math.abs(utcNoonMs(a) - utcNoonMs(b)) / MS_PER_DAY);
}

/**
 * Rate from the observation whose date is closest to `targetDate` (tie: earlier observation).
 * `observations` must be sorted ascending by `date`. Annual fraction (e.g. 0.035).
 */
export function closestObservationRateForDate(
  observations: readonly { date: string; rate: number }[],
  targetDate: string,
): number {
  const firstObs = observations[0];
  if (firstObs === undefined) {
    return 0;
  }
  let bestIdx = 0;
  let bestDist = calendarDaysApartUtc(targetDate, firstObs.date);
  for (let i = 1; i < observations.length; i++) {
    const row = observations[i];
    if (row === undefined) {
      continue;
    }
    const dist = calendarDaysApartUtc(targetDate, row.date);
    const prevBest = observations[bestIdx];
    if (
      prevBest !== undefined &&
      (dist < bestDist || (dist === bestDist && row.date < prevBest.date))
    ) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  const chosen = observations[bestIdx];
  if (chosen === undefined) {
    return 0;
  }
  return chosen.rate;
}
