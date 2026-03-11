/**
 * Shabbat-aware business day calculator.
 *
 * Business days = Sunday–Friday (Saturday is skipped entirely).
 * Deadline is set to end of business day: 5pm Israel time.
 *
 * Uses Intl.DateTimeFormat to correctly resolve Israel's timezone
 * including DST transitions (UTC+2 standard / UTC+3 daylight).
 */

const ISRAEL_TZ = "Asia/Jerusalem";
const END_OF_BUSINESS_HOUR_ISRAEL = 17; // 5pm Israel local time

/**
 * Get the day of the week (0=Sun, 6=Sat) in Israel timezone.
 */
function getIsraelDayOfWeek(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ISRAEL_TZ,
    weekday: "short",
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return dayMap[weekday ?? ""] ?? 0;
}

/**
 * Get the current hour in Israel timezone.
 */
function getIsraelHour(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ISRAEL_TZ,
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);

  const hour = parts.find((p) => p.type === "hour")?.value;
  return parseInt(hour ?? "0", 10);
}

/**
 * Get the Israel UTC offset in hours for a given date (handles DST).
 * Returns 2 for standard time, 3 for daylight saving time.
 */
function getIsraelUtcOffset(date: Date): number {
  const utcParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);
  const utcHour = parseInt(utcParts.find((p) => p.type === "hour")?.value ?? "0", 10);

  const israelParts = new Intl.DateTimeFormat("en-US", {
    timeZone: ISRAEL_TZ,
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);
  const israelHour = parseInt(israelParts.find((p) => p.type === "hour")?.value ?? "0", 10);

  let offset = israelHour - utcHour;
  if (offset < 0) offset += 24; // Handle day boundary
  return offset;
}

/**
 * Add N business days to a timestamp, skipping Saturdays (Shabbat).
 * Returns the deadline timestamp (end of business day = 5pm Israel on the Nth day).
 */
export function addBusinessDays(fromTimestamp: number, days: number): number {
  const date = new Date(fromTimestamp);

  let added = 0;

  while (added < days) {
    date.setUTCDate(date.getUTCDate() + 1);

    const dayOfWeek = getIsraelDayOfWeek(date);

    // Skip Saturday (Shabbat)
    if (dayOfWeek === 6) continue;

    added++;
  }

  // Set to end of business day: 5pm Israel time
  // Calculate the correct UTC hour accounting for DST
  const offset = getIsraelUtcOffset(date);
  const endOfBusinessUtc = END_OF_BUSINESS_HOUR_ISRAEL - offset;
  date.setUTCHours(endOfBusinessUtc, 0, 0, 0);

  return date.getTime();
}
