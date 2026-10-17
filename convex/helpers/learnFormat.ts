/**
 * Rehabify Learn cohort dates and prices, shared by Convex and the /learn pages so a
 * cohort reads the same on the site, in the admin console and in emails.
 *
 * Cohort dates are calendar dates ("2026-11-02"), not instants: they are never shifted
 * by the viewer's time zone. Deadlines are judged in Lagos time (WAT, UTC+1, no DST).
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CalendarDate = { year: number; month: number; day: number };

/** "2026-11-02" → { year: 2026, month: 11, day: 2 }, or null for anything that is not a real date. */
export function parseCalendarDate(value: string | undefined | null): CalendarDate | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function isCalendarDate(value: string | undefined | null): boolean {
  return parseCalendarDate(value) !== null;
}

/** "November 2, 2026" */
export function formatCohortDate(value: string): string {
  const date = parseCalendarDate(value);
  if (!date) return value;
  return `${MONTHS[date.month - 1]} ${date.day}, ${date.year}`;
}

/** "November 2" */
export function formatCohortDay(value: string): string {
  const date = parseCalendarDate(value);
  if (!date) return value;
  return `${MONTHS[date.month - 1]} ${date.day}`;
}

/** "November 2–30, 2026", "November 23 – December 21, 2026" or "December 28, 2026 – January 25, 2027". */
export function formatCohortRange(start: string, end: string): string {
  const a = parseCalendarDate(start);
  const b = parseCalendarDate(end);
  if (!a || !b) return [start, end].filter(Boolean).join(" – ");
  if (a.year === b.year && a.month === b.month) {
    return a.day === b.day
      ? formatCohortDate(start)
      : `${MONTHS[a.month - 1]} ${a.day}–${b.day}, ${a.year}`;
  }
  if (a.year === b.year) {
    return `${MONTHS[a.month - 1]} ${a.day} – ${MONTHS[b.month - 1]} ${b.day}, ${a.year}`;
  }
  return `${formatCohortDate(start)} – ${formatCohortDate(end)}`;
}

/** "November 2026 cohort" — the name a cohort gets when the admin leaves it blank. */
export function defaultCohortLabel(startDate: string): string {
  const date = parseCalendarDate(startDate);
  return date ? `${MONTHS[date.month - 1]} ${date.year} cohort` : "Next cohort";
}

/** The last millisecond of a calendar day in Lagos. */
export function endOfLagosDay(value: string): number | null {
  const date = parseCalendarDate(value);
  if (!date) return null;
  return Date.UTC(date.year, date.month - 1, date.day) + DAY_MS - LAGOS_OFFSET_MS - 1;
}

/** Today's calendar date in Lagos, as "YYYY-MM-DD". */
export function lagosToday(now: number = Date.now()): string {
  return new Date(now + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** "₦5,000" from kobo. */
export function formatNairaFromKobo(kobo: number): string {
  return `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;
}
