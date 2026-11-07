/**
 * What the care team needs to know about a patient at a glance, gathered from wherever it lives:
 * the profile (and what admins filled in), Joy's intake, referrals and the physios they're linked
 * to. Used by Admin › All patients, Patients looking for care and the patient drawer
 * (adminPatients.ts, careQueue.ts), so a patient reads the same everywhere.
 */
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isJoyLoginEmail } from "../../lib/auth/joyLoginEmail";

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
export function ageOf(profile: Doc<"patientProfiles"> | null, now = Date.now()): number | null {
  const dob = profile?.dateOfBirth?.trim();
  if (dob) {
    const born = /^\d{4}-\d{2}-\d{2}/.test(dob) ? Date.parse(dob.slice(0, 10)) : Number(dob);
    if (Number.isFinite(born) && born > 0 && born < now) {
      const years = Math.floor((now - born) / YEAR);
      if (years >= 0 && years < 120) return years;
    }
  }
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
    isJoyLoginEmail(user.email) ||
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
    formatFromCareSetting(referral?.preferredCareMode);
  const age = ageOf(profile);
  const phone = user.phoneNumber ?? referral?.patientPhone ?? null;
  const redFlags = (intake?.redFlags ?? []).filter((flag) => flag.flagged).map((flag) => flag.question);

  const missing: string[] = [];
  if (age === null) missing.push("age");
  if (!profile?.state) missing.push("state");
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
    state: profile?.state ?? null,
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
