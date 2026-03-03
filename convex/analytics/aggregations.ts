// @ts-nocheck
/**
 * Pre-computed aggregate helpers for analytics.
 *
 * These utility functions are used by analytics queries to compute
 * common aggregations. They operate on arrays of documents fetched
 * from the database and return computed stats.
 *
 * If @convex-dev/aggregate is later adopted, these can be replaced
 * with component-backed aggregations for better performance at scale.
 */

/**
 * Count items grouped by a string key extracted from each item.
 */
export function countBy<T>(
  items: T[],
  keyFn: (item: T) => string
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * Group items by a date key (YYYY-MM-DD) extracted from a timestamp.
 */
export function groupByDay<T>(
  items: T[],
  timestampFn: (item: T) => number
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const ts = timestampFn(item);
    const dayKey = new Date(ts).toISOString().split("T")[0];
    if (!groups[dayKey]) {
      groups[dayKey] = [];
    }
    groups[dayKey].push(item);
  }
  return groups;
}

/**
 * Compute a percentage rate: numerator / denominator * 100, rounded to 1 decimal.
 */
export function computeRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * Compute the average of a list of numbers. Returns 0 for empty arrays.
 */
export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
