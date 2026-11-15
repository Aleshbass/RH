/**
 * Wall-clock time helpers, shared by Convex and the app. Africa/Lagos (WAT, UTC+1, no DST) unless
 * told otherwise. Convex runs in UTC and a browser can be in any zone, so a "YYYY-MM-DD" + "HH:MM"
 * from a schedule is always converted through the schedule's zone.
 *
 * Times shown to people use the display zone: Lagos, except in the browser for a physio practising
 * outside Nigeria and their patients, where the portal sets their zone (lib/practiceDisplay.ts →
 * setDisplayTimeZone; e.g. Africa/Accra for Ghana). Convex never sets it, so on the server it is
 * always Lagos; server messages about such a physio pass their zone explicitly.
 */
export const LAGOS_TIME_ZONE = "Africa/Lagos";

const LAGOS_OFFSET_MS = 60 * 60 * 1000;

let displayZone = LAGOS_TIME_ZONE;

/** Browser only: the zone the signed-in person's times are shown in (null/undefined = Lagos). */
export function setDisplayTimeZone(zone?: string | null) {
  displayZone = zone || LAGOS_TIME_ZONE;
}

/** The zone times are shown and scheduled in when a caller doesn't name one. */
export function displayTimeZone(): string {
  return displayZone;
}

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
export function timeZoneOffsetMs(utcMs: number, timeZone: string = displayZone): number {
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
export function zonedDateTimeToUtc(date: string, time: string, timeZone: string = displayZone): number {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, day, hours || 0, minutes || 0);
  // Correct once more in case the first guess lands across a DST change (not needed for Lagos)
  const first = wall - timeZoneOffsetMs(wall, timeZone);
  const offset = timeZoneOffsetMs(first, timeZone);
  return wall - offset;
}

/** "YYYY-MM-DD" of `utcMs` in `timeZone`. */
export function zonedDateKey(utcMs: number, timeZone: string = displayZone): string {
  const shifted = new Date(utcMs + timeZoneOffsetMs(utcMs, timeZone));
  return shifted.toISOString().slice(0, 10);
}

/** "HH:MM" (24-hour) of `utcMs` in `timeZone`. */
export function zonedTimeKey(utcMs: number, timeZone: string = displayZone): string {
  const shifted = new Date(utcMs + timeZoneOffsetMs(utcMs, timeZone));
  return shifted.toISOString().slice(11, 16);
}

/** UTC timestamp of midnight starting the zone's day that contains `utcMs`. */
export function startOfZonedDay(utcMs: number, timeZone: string = displayZone): number {
  return zonedDateTimeToUtc(zonedDateKey(utcMs, timeZone), "00:00", timeZone);
}

/** Formats `utcMs` in the display zone (Lagos unless set) with the given Intl options. */
export function formatLagos(
  utcMs: number,
  options: Intl.DateTimeFormatOptions,
  locale = "en-GB",
  timeZone: string = displayZone
): string {
  return new Date(utcMs).toLocaleString(locale, { ...options, timeZone });
}

/** "10:30 AM" in the display zone (or `timeZone`). */
export function lagosTime(utcMs: number, timeZone: string = displayZone): string {
  return formatLagos(utcMs, { hour: "numeric", minute: "2-digit", hour12: true }, "en-US", timeZone);
}

/** "10:30 AM – 11:30 AM" in the display zone (or `timeZone`). */
export function lagosTimeRange(startMs: number, endMs: number, timeZone: string = displayZone): string {
  return `${lagosTime(startMs, timeZone)} – ${lagosTime(endMs, timeZone)}`;
}

/** "Wednesday, 21 October 2026" in the display zone (or `timeZone`). */
export function lagosDate(utcMs: number, timeZone: string = displayZone): string {
  return formatLagos(utcMs, { weekday: "long", day: "numeric", month: "long", year: "numeric" }, "en-NG", timeZone);
}

/** "Wed, 21 Oct" in the display zone (or `timeZone`). */
export function lagosShortDate(utcMs: number, timeZone: string = displayZone): string {
  return formatLagos(utcMs, { weekday: "short", day: "numeric", month: "short" }, "en-NG", timeZone);
}

/** "Wed, 21 Oct at 10:30 AM" in the display zone (or `timeZone`). */
export function lagosDateTime(utcMs: number, timeZone: string = displayZone): string {
  return `${lagosShortDate(utcMs, timeZone)} at ${lagosTime(utcMs, timeZone)}`;
}
