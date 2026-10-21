/**
 * Wall-clock time helpers for Africa/Lagos (WAT, UTC+1, no DST), shared by Convex and the app.
 * Convex runs in UTC and a browser can be in any zone, so a "YYYY-MM-DD" + "HH:MM" from a
 * schedule is always converted through the schedule's zone, and times shown to people are
 * always formatted in Lagos time.
 */
export const LAGOS_TIME_ZONE = "Africa/Lagos";

const LAGOS_OFFSET_MS = 60 * 60 * 1000;

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The zone's offset from UTC at `utcMs`, in ms (Lagos: +1 hour). */
export function timeZoneOffsetMs(utcMs: number, timeZone: string = LAGOS_TIME_ZONE): number {
  try {
    const parts = partsFormatter(timeZone).formatToParts(new Date(utcMs));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
    return asUtc - Math.floor(utcMs / 1000) * 1000;
  } catch {
    // Unknown zone name: treat the schedule as Lagos time
    return timeZone === LAGOS_TIME_ZONE ? LAGOS_OFFSET_MS : timeZoneOffsetMs(utcMs, LAGOS_TIME_ZONE);
  }
}

/** UTC timestamp of a wall-clock date ("YYYY-MM-DD") and time ("HH:MM") in `timeZone`. */
export function zonedDateTimeToUtc(date: string, time: string, timeZone: string = LAGOS_TIME_ZONE): number {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, day, hours || 0, minutes || 0);
  // Correct once more in case the first guess lands across a DST change (not needed for Lagos)
  const first = wall - timeZoneOffsetMs(wall, timeZone);
  const offset = timeZoneOffsetMs(first, timeZone);
  return wall - offset;
}

/** "YYYY-MM-DD" of `utcMs` in `timeZone`. */
export function zonedDateKey(utcMs: number, timeZone: string = LAGOS_TIME_ZONE): string {
  const shifted = new Date(utcMs + timeZoneOffsetMs(utcMs, timeZone));
  return shifted.toISOString().slice(0, 10);
}

/** "HH:MM" (24-hour) of `utcMs` in `timeZone`. */
export function zonedTimeKey(utcMs: number, timeZone: string = LAGOS_TIME_ZONE): string {
  const shifted = new Date(utcMs + timeZoneOffsetMs(utcMs, timeZone));
  return shifted.toISOString().slice(11, 16);
}

/** UTC timestamp of midnight starting the zone's day that contains `utcMs`. */
export function startOfZonedDay(utcMs: number, timeZone: string = LAGOS_TIME_ZONE): number {
  return zonedDateTimeToUtc(zonedDateKey(utcMs, timeZone), "00:00", timeZone);
}

/** Formats `utcMs` in Lagos time with the given Intl options. */
export function formatLagos(utcMs: number, options: Intl.DateTimeFormatOptions, locale = "en-GB"): string {
  return new Date(utcMs).toLocaleString(locale, { ...options, timeZone: LAGOS_TIME_ZONE });
}

/** "10:30 AM" in Lagos time. */
export function lagosTime(utcMs: number): string {
  return formatLagos(utcMs, { hour: "numeric", minute: "2-digit", hour12: true }, "en-US");
}

/** "10:30 AM – 11:30 AM" in Lagos time. */
export function lagosTimeRange(startMs: number, endMs: number): string {
  return `${lagosTime(startMs)} – ${lagosTime(endMs)}`;
}

/** "Wednesday, 21 October 2026" in Lagos time. */
export function lagosDate(utcMs: number): string {
  return formatLagos(utcMs, { weekday: "long", day: "numeric", month: "long", year: "numeric" }, "en-NG");
}

/** "Wed, 21 Oct" in Lagos time. */
export function lagosShortDate(utcMs: number): string {
  return formatLagos(utcMs, { weekday: "short", day: "numeric", month: "short" }, "en-NG");
}

/** "Wed, 21 Oct at 10:30 AM" in Lagos time. */
export function lagosDateTime(utcMs: number): string {
  return `${lagosShortDate(utcMs)} at ${lagosTime(utcMs)}`;
}
