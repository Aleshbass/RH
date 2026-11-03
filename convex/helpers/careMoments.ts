/**
 * Relationship moments, shared by Convex (careMoments.ts) and the app: when a patient's birthday,
 * care anniversary ("a year since your first visit") or 3-month post-discharge check-in falls, and
 * the words sent for each. Dates are Lagos calendar days ("YYYY-MM-DD"). Plain TypeScript.
 */

export type CareMomentKind = "birthday" | "care_anniversary" | "discharge_checkin" | "team_birthday";

/** Who a wish is for: a patient, or someone who works on the platform (Rehabify wishes them). */
export type MomentRecipient = "patient" | "physiotherapist" | "clinic_owner" | "clinic_staff";

/** How far ahead Home shows moments, and the planner writes them. */
export const MOMENT_WINDOW_DAYS = 14;
export const DISCHARGE_CHECKIN_DAYS = 90;

export const MOMENT_LABELS: Record<CareMomentKind, string> = {
  birthday: "Birthday",
  care_anniversary: "Care anniversary",
  discharge_checkin: "3-month check-in",
  team_birthday: "Team birthday",
};

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const pad = (n: number) => String(n).padStart(2, "0");

/** Days in a month; February has 29 when the year is unknown (a birthday can be the 29th). */
export function daysInMonth(month: number, year?: number) {
  if (month === 2) return year === undefined || isLeap(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** "MM-DD" for a real calendar day, or null. */
export function toMonthDay(month: number, day: number, year?: number): string | null {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(month, year)) return null;
  return `${pad(month)}-${pad(day)}`;
}

type BirthdayFields = { dateOfBirth?: string | null; birthdayMonthDay?: string | null } | null | undefined;

/**
 * The patient's confirmed birthday ("MM-DD"), or null. Sign-up used to ask for an age and store
 * 1 January of that year, so a 1 January date of birth only counts once someone confirms it.
 */
export function birthdayMonthDay(profile: BirthdayFields): string | null {
  if (profile?.birthdayMonthDay && MONTH_DAY.test(profile.birthdayMonthDay)) return profile.birthdayMonthDay;
  const dob = profile?.dateOfBirth?.slice(0, 10);
  if (!dob || !DATE_KEY.test(dob)) return null;
  const monthDay = dob.slice(5);
  return monthDay !== "01-01" && MONTH_DAY.test(monthDay) ? monthDay : null;
}

/** The birth year, when the date of birth is the confirmed birthday (for "turns 34"). */
export function birthYear(profile: BirthdayFields): number | null {
  const monthDay = birthdayMonthDay(profile);
  const dob = profile?.dateOfBirth?.slice(0, 10);
  if (!monthDay || !dob || !DATE_KEY.test(dob) || dob.slice(5) !== monthDay) return null;
  const year = Number(dob.slice(0, 4));
  return year > 1900 ? year : null;
}

/** The day an "MM-DD" falls in `year`: 29 February is celebrated on the 28th in other years. */
export function dayInYear(monthDay: string, year: number): string {
  return `${year}-${monthDay === "02-29" && !isLeap(year) ? "02-28" : monthDay}`;
}

/** The next time "MM-DD" comes round on or after `fromKey`. */
export function nextYearly(monthDay: string, fromKey: string): { date: string; year: number } {
  const year = Number(fromKey.slice(0, 4));
  const thisYear = dayInYear(monthDay, year);
  return thisYear >= fromKey ? { date: thisYear, year } : { date: dayInYear(monthDay, year + 1), year: year + 1 };
}

const utcOf = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export function addDays(dateKey: string, days: number): string {
  return new Date(utcOf(dateKey) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((utcOf(toKey) - utcOf(fromKey)) / 86_400_000);
}

/** "Today", "Tomorrow", or "Thu 6 Nov". */
export function momentDayLabel(dateKey: string, todayKey: string): string {
  const diff = daysBetween(todayKey, dateKey);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return new Date(utcOf(dateKey)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

const yearsText = (years?: number | null) => (years && years > 1 ? `${years} years` : "a year");

/** What a moment is, for the care team: "Birthday · turns 34", "2 years since their first visit". */
export function momentSummary(kind: CareMomentKind, years?: number | null): string {
  if (kind === "birthday") return years ? `Birthday · turns ${years}` : "Birthday";
  if (kind === "team_birthday") return years ? `Team birthday · turns ${years}` : "Birthday · on your team";
  if (kind === "care_anniversary") return `${yearsText(years)} since their first visit`.replace(/^a/, "A");
  return "3 months since discharge · check in";
}

/** The patient-facing title of a wish or check-in. */
export function momentTitle(kind: CareMomentKind, firstName?: string | null, years?: number | null): string {
  const name = firstName?.trim();
  if (kind === "birthday" || kind === "team_birthday") return `Happy birthday${name ? `, ${name}` : ""}!`;
  if (kind === "care_anniversary") return `${yearsText(years)} since your first visit`.replace(/^a/, "A");
  return "How are you getting on?";
}

export const BIRTHDAY_TEMPLATE_HINT = "Use {firstName} for their first name and {sender} for your clinic or name.";

/**
 * The message for a moment. `template` is the care team's own birthday message for patients, with
 * {firstName} and {sender} filled in. `recipient` words Rehabify's wishes to the people who work
 * on the platform.
 */
export function momentMessage(
  kind: CareMomentKind,
  {
    firstName,
    sender,
    years,
    recipient = "patient",
  }: { firstName?: string | null; sender: string; years?: number | null; recipient?: MomentRecipient },
  template?: string | null
): string {
  const name = firstName?.trim() || "";
  const hello = `Happy birthday${name ? `, ${name}` : ""}!`;
  if (kind === "team_birthday") {
    return `${hello} Thank you for everything you do for our patients and for the team. Wishing you a wonderful year ahead.`;
  }
  if (kind === "birthday" && recipient === "physiotherapist") {
    return `${hello} Thank you for the care you give your patients every day. Everyone at ${sender} is wishing you a wonderful year ahead.`;
  }
  if (kind === "birthday" && recipient === "clinic_owner") {
    return `${hello} Thank you for everything you and your team do for your patients. Everyone at ${sender} is wishing you a wonderful year ahead.`;
  }
  if (kind === "birthday" && recipient === "clinic_staff") {
    return `${hello} Thank you for helping patients get the care they need. Everyone at ${sender} is wishing you a wonderful year ahead.`;
  }
  if (kind === "birthday" && template?.trim()) {
    return template.trim().replace(/\{firstName\}/g, name || "there").replace(/\{sender\}/g, sender);
  }
  if (kind === "birthday") {
    return `Happy birthday${name ? `, ${name}` : ""}! Everyone at ${sender} is wishing you a wonderful year ahead, full of good health and strength. Thank you for letting us be part of your care.`;
  }
  if (kind === "care_anniversary") {
    return `${name ? `${name}, it's` : "It's"} ${yearsText(years)} since your first visit with ${sender}. We hope you're moving well. If anything has come back, or you'd like a check-up, we're here for you.`;
  }
  return `Hi ${name || "there"}, it's been 3 months since you finished your treatment with ${sender}. How are you getting on? If you've had any pain or stiffness, reply here or book a check-up and we'll help.`;
}

/** A wa.me link with the message filled in, for a number in +234… (or any international) form. */
export function whatsappHref(phone: string | null | undefined, text: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
