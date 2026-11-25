/**
 * What the care team needs to know about a patient at a glance, gathered from wherever it lives:
 * the profile (and what admins filled in), Joy's intake, referrals and the physios they're linked
 * to. Used by Admin › All patients, Patients looking for care and the patient drawer
 * (adminPatients.ts, careQueue.ts), so a patient reads the same everywhere.
 */
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isJoyLoginEmail, isJoyWhatsAppLoginEmail } from "../../lib/auth/joyLoginEmail";
import { stateForPlace } from "./startingZones";

/** Where a patient came from. A patient can carry more than one (Joy, then added by a clinic). */
export type PatientSource = "joy" | "doctor" | "partner" | "clinic" | "physio" | "find_a_physio" | "website";
export type CareFormat = "online" | "home_visit" | "clinic";

const YEAR = 365.25 * 24 * 60 * 60 * 1000;
const PHYSIO_ADDED = new Set(["existing_patient", "invite", "referred"]);
const FIND_A_PHYSIO = new Set(["marketplace", "booking_link"]);

export function personName(user: Pick<Doc<"users">, "firstName" | "lastName"> | null | undefined, fallback = "Patient") {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return name || fallback;
}

/** A real email to reach them on: Joy's placeholder logins aren't one. */
export function reachableEmail(email: string | null | undefined) {
  return email && !isJoyLoginEmail(email) ? email : null;
}

/** Age from the date of birth, else from an age the care team noted (grown by the years since). */
export function ageOf(profile: Pick<Doc<"patientProfiles">, "dateOfBirth" | "ageYears" | "ageRecordedAt"> | null, now = Date.now()): number | null {
  // Any shape it was saved in ("1991-01-03", a timestamp, "03/01/1991", "3 Jan 1991")
  const years = ageFromDateOfBirth(normalizeDateOfBirth(profile?.dateOfBirth, now), now);
  if (years !== null) return years;
  if (typeof profile?.ageYears === "number") {
    return profile.ageYears + Math.floor((now - (profile.ageRecordedAt ?? now)) / YEAR);
  }
  return null;
}

function formatFromCareSetting(setting: string | undefined | null): CareFormat | null {
  if (!setting) return null;
  const s = setting.toLowerCase();
  if (s === "home" || s === "home_visit" || s === "face_to_face" || s === "in_person") return "home_visit";
  if (s === "online" || s === "remote" || s === "virtual" || s === "video") return "online";
  if (s === "clinic") return "clinic";
  return null;
}

export async function loadPatientProfile(ctx: QueryCtx, user: Doc<"users">) {
  const linked = user.patientProfileId ? await ctx.db.get(user.patientProfileId) : null;
  return linked ?? (await ctx.db.query("patientProfiles").withIndex("by_user_id", (q) => q.eq("userId", user._id)).first());
}

export type PatientFacts = Awaited<ReturnType<typeof patientFacts>>;

/**
 * The patient at a glance. `physioName` is a lookup the caller can share across rows so a
 * physio's name is read once per request.
 */
export async function patientFacts(
  ctx: QueryCtx,
  user: Doc<"users">,
  physioName: (id: Id<"users">) => Promise<string> = async (id) => personName(await ctx.db.get(id), "Physiotherapist")
) {
  const [profile, relationships, intake, referral, journey, latestBooking] = await Promise.all([
    loadPatientProfile(ctx, user),
    ctx.db.query("patientPhysiotherapistRelationships").withIndex("by_patient", (q) => q.eq("patientId", user._id)).take(20),
    ctx.db.query("joyIntakes").withIndex("by_patient", (q) => q.eq("patientId", user._id)).order("desc").first(),
    ctx.db.query("inboundReferrals").withIndex("by_patient", (q) => q.eq("patientId", user._id)).order("desc").first(),
    ctx.db.query("joyJourneyEvents").withIndex("by_patient", (q) => q.eq("patientId", user._id)).first(),
    ctx.db.query("marketplaceBookings").withIndex("by_patient", (q) => q.eq("patientId", user._id)).order("desc").first(),
  ]);

  // Where they came from
  const sources: PatientSource[] = [];
  const add = (source: PatientSource) => {
    if (!sources.includes(source)) sources.push(source);
  };
  const fromJoy =
    String(user.clerkId ?? "").startsWith("joy-whatsapp:") ||
    user.referralAttributionSource === "joy" ||
    Boolean(intake || journey) ||
    relationships.some((r) => r.source === "joy_whatsapp") ||
    isJoyWhatsAppLoginEmail(user.email) ||
    Boolean(latestBooking?.joyServiceMode);
  if (fromJoy) add("joy");
  if (referral?.referringDoctorId || referral?.conversionSource === "doctor_referral" || relationships.some((r) => r.source === "referred")) add("doctor");
  if ((referral && !referral.referringDoctorId && referral.partnerId) || user.referralAttributionSource === "partner_referral" || user.referralAttributionSource === "referral_link") {
    add("partner");
  }
  if (profile?.clinicId || relationships.some((r) => r.clinicId)) add("clinic");
  if (relationships.some((r) => !r.clinicId && PHYSIO_ADDED.has(r.source ?? ""))) add("physio");
  if (relationships.some((r) => FIND_A_PHYSIO.has(r.source ?? "")) || (latestBooking && !latestBooking.joyServiceMode)) add("find_a_physio");
  if (sources.length === 0) add("website");

  // The physios they're with now (and who added them)
  const active = relationships.filter((r) => r.status === "active").sort((a, b) => Number(b.isPrimaryPhysiotherapist) - Number(a.isPrimaryPhysiotherapist) || b.startDate - a.startDate);
  const physios = await Promise.all(
    active.slice(0, 4).map(async (r) => ({
      physioId: r.physiotherapistId,
      name: await physioName(r.physiotherapistId),
      source: r.source ?? null,
      referredBy: r.referredBy ?? null,
      clinicId: r.clinicId ?? null,
      since: r.startDate,
      primary: r.isPrimaryPhysiotherapist,
    }))
  );

  // What they need
  const complaint =
    profile?.mainComplaint?.trim() ||
    intake?.chiefComplaint?.trim() ||
    referral?.condition?.trim() ||
    referral?.reason?.replace(/_/g, " ").trim() ||
    latestBooking?.conditionLabel?.trim() ||
    null;
  const format: CareFormat | null =
    profile?.preferredFormat ??
    latestBooking?.joyServiceMode ??
    (latestBooking ? (latestBooking.isOnline ? "online" : "home_visit") : null) ??
    formatFromCareSetting(referral?.careSetting) ??
    formatFromCareSetting(referral?.preferredCareMode) ??
    // Joy's first booking is always the online Initial Recovery Consultation (owner, 7 Nov 2026)
    (fromJoy ? "online" : null);
  const age = ageOf(profile);
  // Only a town on record (Joy asks where they are, not the state): the state it is in
  const state = profile?.state ?? stateForPlace(profile?.city) ?? stateForPlace(profile?.area);
  const phone = user.phoneNumber ?? referral?.patientPhone ?? null;
  const redFlags = (intake?.redFlags ?? []).filter((flag) => flag.flagged).map((flag) => flag.question);

  const missing: string[] = [];
  if (age === null) missing.push("age");
  if (!state) missing.push("state");
  if (!profile?.area && !profile?.city) missing.push("area");
  if (!complaint) missing.push("complaint");
  if (!format) missing.push("format");
  if (!phone) missing.push("phone");

  return {
    userId: user._id,
    name: personName(user),
    rehabifyId: user.patientNumber ?? null,
    imageUrl: user.imageUrl ?? null,
    phone,
    email: reachableEmail(user.email),
    joinedAt: user._creationTime,
    age,
    gender: profile?.gender ?? null,
    language: profile?.preferredLanguage ?? intake?.language ?? null,
    state: state ?? null,
    city: profile?.city ?? null,
    area: profile?.area ?? null,
    complaint,
    bodyAreas: intake?.bodyAreas ?? [],
    format,
    triageLevel: intake?.triageLevel ?? null,
    redFlags,
    sources,
    fromJoy,
    physios,
    hasPhysio: active.length > 0,
    missing,
    profile,
    intake,
    referral,
  };
}

/** The light version for lists: no raw documents. */
export function factsRow(facts: PatientFacts) {
  const { profile: _profile, intake: _intake, referral: _referral, ...row } = facts;
  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dates of birth. They were saved in several shapes over time: "1991-01-03" (date inputs),
// "1991-01-03T00:00:00.000Z", a timestamp, or typed by hand as "03/01/1991" or "3 Jan 1991".
// Everything that shows an age reads them through here, so older records show the same as new
// ones (clinic feedback, 24 Nov 2026).
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** A real calendar day between 1900 and today, as "YYYY-MM-DD", or null. */
function isoDay(year: number, month: number, day: number, now: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (date.getTime() > now) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function monthFromName(name: string) {
  const index = MONTHS.indexOf(name.slice(0, 3).toLowerCase());
  return index === -1 ? null : index + 1;
}

/** The stored date of birth as "YYYY-MM-DD", whatever shape it was saved in, or null. */
export function normalizeDateOfBirth(value: string | number | null | undefined, now = Date.now()): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;

  // 1991-01-03, with or without a time after it
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (m) return isoDay(Number(m[1]), Number(m[2]), Number(m[3]), now);

  // A timestamp (milliseconds; seconds when it's short). Read as the day in West Africa (UTC+1),
  // where a date input's midnight lands
  if (/^-?\d{9,14}$/.test(text)) {
    const n = Number(text);
    const ms = Math.abs(n) < 1e11 ? n * 1000 : n;
    const d = new Date(ms + 60 * 60 * 1000);
    return isoDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), now);
  }

  // 03/01/1991, 3-1-1991, 03.01.1991: day first, as written in Nigeria (and the UK)
  m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(text);
  if (m) {
    const first = Number(m[1]);
    const second = Number(m[2]);
    // Only month-first when day-first can't be a date (e.g. 12/25/1990)
    return isoDay(Number(m[3]), second, first, now) ?? (first <= 12 ? isoDay(Number(m[3]), first, second, now) : null);
  }

  // 1991/01/03
  m = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(text);
  if (m) return isoDay(Number(m[1]), Number(m[2]), Number(m[3]), now);

  // 3 Jan 1991, 3rd January, 1991
  m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})\.?,?\s+(\d{4})$/.exec(text);
  if (m) {
    const month = monthFromName(m[2]);
    return month ? isoDay(Number(m[3]), month, Number(m[1]), now) : null;
  }

  // January 3, 1991
  m = /^([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(text);
  if (m) {
    const month = monthFromName(m[1]);
    return month ? isoDay(Number(m[3]), month, Number(m[2]), now) : null;
  }

  return null;
}

/** Whole years from a "YYYY-MM-DD" date of birth to `now` (counted in West Africa Time), or null. */
export function ageFromDateOfBirth(isoDate: string | null, now = Date.now()): number | null {
  if (!isoDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return null;
  const today = new Date(now + 60 * 60 * 1000);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;
  const day = today.getUTCDate();
  const born = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  const hadBirthday = month > born.month || (month === born.month && day >= born.day);
  const age = year - born.year - (hadBirthday ? 0 : 1);
  return age >= 0 && age < 120 ? age : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The patient at a glance for the record header (physio workspace and the clinic's record):
// date of birth, age, gender, town and past medical history.
//
// Clinic feedback (24 Nov 2026): patients added recently showed all of it, older ones only a
// name. Their details were there, just not where the header looked: in a second profile
// document, in the old `patients` table, in Joy's intake, or typed into the first assessment
// ("Medical history: …", the note editor's one-tap heading). This gathers them, the profile first.
// ─────────────────────────────────────────────────────────────────────────────

type Gender = NonNullable<Doc<"patientProfiles">["gender"]>;

/** Where the medical history shown came from, when it isn't the patient's details. */
export type HistorySource = { kind: "note"; noteType: string; date: number } | { kind: "joy"; date: number } | null;

const HISTORY_HEADING = /^\s*(?:past\s+)?(?:medical\s+(?:history|hx|background)|pmhx?|p\.?m\.?h\.?)\s*[:\-–—]\s*(.*)$/i;
/** Another heading ("Medication: …", "Work & activity: …") ends the history */
const ANY_HEADING = /^\s*[A-Za-z][A-Za-z0-9 &’'/().-]{0,40}\s*:\s*/;
const MAX_HISTORY = 1_000;

/** The "Medical history: …" part of a note's text, or null. */
export function historyFromNoteText(text: string | undefined | null): string | null {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = HISTORY_HEADING.exec(lines[i]);
    if (!m) continue;
    const parts = [m[1].trim()];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line.trim() || ANY_HEADING.test(line)) break;
      parts.push(line.trim());
    }
    const found = parts.filter(Boolean).join("\n").trim();
    if (found) return found.length > MAX_HISTORY ? `${found.slice(0, MAX_HISTORY - 1)}…` : found;
  }
  return null;
}

function realGender(value: string | undefined | null): Gender | undefined {
  return value === "male" || value === "female" || value === "other" ? value : undefined;
}

/**
 * The header's facts for a patient. `notes` are the clinical notes the viewer may read, newest
 * first; `joyIntake` only when the patient agreed to share it with their clinician.
 */
export async function patientGlance(
  ctx: QueryCtx,
  patient: Doc<"users">,
  options: { notes: Doc<"sessionLogs">[]; joyIntake: Doc<"joyIntakes"> | null; now: number }
) {
  // Every profile document of theirs: the one linked to the account first
  const rows = await ctx.db
    .query("patientProfiles")
    .withIndex("by_user_id", (q) => q.eq("userId", patient._id))
    .take(5);
  const linked = patient.patientProfileId
    ? rows.find((r) => r._id === patient.patientProfileId) ?? (await ctx.db.get(patient.patientProfileId))
    : null;
  const profiles = [linked, ...rows.filter((r) => r._id !== linked?._id)].filter((p): p is Doc<"patientProfiles"> => Boolean(p));
  // The old patients table (before patientProfiles held these)
  const legacy = await ctx.db
    .query("patients")
    .withIndex("by_user_id", (q) => q.eq("userId", patient._id))
    .first();

  const text = (value: string | undefined | null) => value?.trim() || undefined;
  const first = <T>(values: (T | undefined | null)[]) => values.find((v) => v !== undefined && v !== null) ?? undefined;

  const storedBirth = first(profiles.map((p) => text(p.dateOfBirth))) ?? text(legacy?.dateOfBirth);
  const dateOfBirth = normalizeDateOfBirth(storedBirth, options.now);
  const noted = profiles.find((p) => typeof p.ageYears === "number");
  const ageYears = ageOf({ dateOfBirth: dateOfBirth ?? undefined, ageYears: noted?.ageYears, ageRecordedAt: noted?.ageRecordedAt }, options.now);
  const gender = first(profiles.map((p) => realGender(p.gender))) ?? realGender(legacy?.gender);
  const city = first(profiles.map((p) => text(p.city)));
  const emergencyContact = first(profiles.map((p) => p.emergencyContact)) ?? legacy?.emergencyContact;

  // Medical history: their details, else the old record, else what the first assessment noted,
  // else what they told Joy
  let medicalHistory = first(profiles.map((p) => text(p.medicalHistorySummary))) ?? text(legacy?.medicalHistory) ?? null;
  let medicalHistoryFrom: HistorySource = null;
  if (!medicalHistory) {
    // An initial assessment first (oldest first: where the history is taken), then any note
    const assessments = options.notes.filter((n) => n.noteType === "initial_assessment").reverse();
    const others = options.notes.filter((n) => n.noteType !== "initial_assessment");
    for (const note of [...assessments, ...others]) {
      const found = historyFromNoteText(note.subjectiveAssessment);
      if (found) {
        medicalHistory = found;
        medicalHistoryFrom = { kind: "note", noteType: note.noteType ?? "treatment_note", date: note.sessionDate };
        break;
      }
    }
  }
  if (!medicalHistory && options.joyIntake?.medicalHistory?.trim()) {
    medicalHistory = options.joyIntake.medicalHistory.trim();
    medicalHistoryFrom = { kind: "joy", date: options.joyIntake._creationTime };
  }

  if (profiles.length === 0 && !legacy && !medicalHistory) return null;
  return {
    // Always "YYYY-MM-DD" (or left out), whatever shape it was saved in
    dateOfBirth: dateOfBirth ?? undefined,
    ageYears,
    gender,
    medicalHistory,
    /** Set when the history shown was found in a note or Joy's intake, not the patient's details */
    medicalHistoryFrom,
    city: city ?? null,
    emergencyContact: emergencyContact ?? null,
  };
}
