/**
 * Clock-in (convex/clinicAttendance.ts): the pure parts, shared by the server and the screens
 * (components/clock, components/clinic/attendance). Plain TypeScript: no Convex imports.
 */

export const CLOCK_DEFAULTS = {
  locationCheck: true,
  offsiteRule: "flag" as const,
  siteRadiusM: 150,
  graceMinutes: 10,
  remindClockIn: true,
  remindClockOut: true,
  ownerAlerts: "exceptions" as const,
};

export const RADIUS_CHOICES_M = [75, 150, 300, 500] as const;
export const GRACE_CHOICES_MIN = [0, 5, 10, 15, 30] as const;

/** A phone's fix counts for at most this much slack on top of the clinic's radius. */
export const MAX_ACCURACY_SLACK_M = 100;

/** Off-site reason and notes are short. */
export const CLOCK_REASON_MAX = 200;

export type ClockPoint = { lat: number; lng: number };

/** Distance in metres between two points (haversine). */
export function metresBetween(a: ClockPoint, b: ClockPoint): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * At the clinic: within its radius, give or take the phone's own accuracy (capped, so a laptop's
 * city-wide guess never counts as being there).
 */
export function isOnSite(distanceM: number, accuracyM: number | undefined, radiusM: number): boolean {
  const slack = Math.min(Math.max(accuracyM ?? 0, 0), MAX_ACCURACY_SLACK_M);
  return distanceM - slack <= radiusM;
}

/** "45 m" / "1.2 km" */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.max(1, Math.round(metres / 5) * 5)} m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}

/** "7h 32m" / "45m" / "0m" */
export function formatWorked(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** "7:32:05" for a running clock */
export function formatStopwatch(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Decimal hours for spreadsheets: 7.53 */
export function decimalHours(ms: number): number {
  return Math.round((Math.max(0, ms) / 3_600_000) * 100) / 100;
}

export type ClockBreak = { startAt: number; endAt?: number };

/** Time spent on breaks, counting an open break up to `now`. */
export function breakMs(breaks: ClockBreak[] | undefined, now: number): number {
  return (breaks ?? []).reduce((sum, b) => sum + Math.max(0, (b.endAt ?? now) - b.startAt), 0);
}

/** Time worked in a shift: clock-in to clock-out (or now), less breaks. */
export function workedMs(
  shift: { clockInAt: number; clockOutAt?: number | null; breaks?: ClockBreak[] },
  now: number
): number {
  const end = shift.clockOutAt ?? now;
  return Math.max(0, end - shift.clockInAt - breakMs(shift.breaks, Math.min(end, now)));
}

export const WEEK_DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

/** The weekday of a "YYYY-MM-DD" date. */
export function weekDayOf(dateKey: string): WeekDay {
  const [y, m, d] = dateKey.split("-").map(Number);
  return WEEK_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** "YYYY-MM-DD" plus `days` (may be negative). */
export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Monday of the week holding `dateKey`. */
export function mondayOf(dateKey: string): string {
  const day = WEEK_DAYS.indexOf(weekDayOf(dateKey));
  return addDays(dateKey, day === 0 ? -6 : 1 - day);
}

export const OFFSITE_REASON_NEEDED = "OFFSITE_REASON_NEEDED";
