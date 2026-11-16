import { addDays, startOfDay } from 'date-fns';

/**
 * ISO bounds for one LOCAL calendar day. Using an exclusive next-day bound
 * avoids missing late-night orders and handles daylight saving transitions.
 */
export function orderDayBounds(day: Date): { from: string; toExclusive: string } {
  const start = startOfDay(day);
  return {
    from: start.toISOString(),
    toExclusive: addDays(start, 1).toISOString(),
  };
}
