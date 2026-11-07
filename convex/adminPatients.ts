/**
 * Admin › patients: one record per patient with everything the care team needs to pair them
 * with a physio. The patient drawer opens from every list that names a patient (All patients,
 * Patients looking for care, bookings, referrals).
 *
 *   - directory: All patients, with where each came from (tags, not separate lists)
 *   - record: the full picture (profile, Joy's intake, referrals, physios, bookings, signals)
 *   - updateDetails: what the team learns on a call (age, state, area, complaint, format, notes)
 *   - suggestPhysios: network physios ranked for this patient, with their next free time
 *   - pairWithPhysio: link the patient to a physio, tell the physio, close the queue items
 */
import { makeFunctionReference, type WithoutSystemFields } from "convex/server";
import { ConvexError, v } from "convex/values";
import { action, internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin } from "./helpers/partnerAccess";
import { closeCareSignal } from "./helpers/careSignals";
import { insertNotification } from "./helpers/pushNotify";
import { appLink } from "./helpers/appUrl";
import { factsRow, patientFacts, personName, reachableEmail } from "./helpers/patientFacts";
import { recentPatientViews } from "./helpers/patientViews";
import { isJoyProviderEligible } from "./helpers/joyPricing";
import { zoneForArea } from "./helpers/rehabifyPricing";
import { controlledTags } from "./joyIntegration";
import { speaksLanguage } from "./joyMatching";
import { bookingLine } from "./careQueue";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const DIRECTORY_CAP = 400;

const format = v.union(v.literal("online"), v.literal("home_visit"), v.literal("clinic"));

const sendEmail = makeFunctionReference<
  "action",
  { to: string; subject: string; greetingName?: string; heading: string; paragraphs: string[]; buttonLabel?: string; buttonUrl?: string }
>("actions/emails/sendPatientCareEmail:sendPatientCareEmail");

/** A per-request cache so a physio's name is read once however many patients they have. */
function physioNameCache(ctx: { db: { get: (id: Id<"users">) => Promise<Doc<"users"> | null> } }) {
  const names = new Map<string, Promise<string>>();
  return (id: Id<"users">) => {
    let name = names.get(id);
    if (!name) {
      name = ctx.db.get(id).then((user) => personName(user, "Physiotherapist"));
      names.set(id, name);
    }
    return name;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lists and the record
// ─────────────────────────────────────────────────────────────────────────────

/** All patients (newest first), each with where they came from and what's still missing. */
export const directory = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "patient"))
      .order("desc")
      .take(DIRECTORY_CAP + 1);
    const open = await ctx.db
      .query("careSignals")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .take(300);
    const openKind = new Map<string, string>();
    for (const signal of open) if (signal.patientId && !openKind.has(signal.patientId)) openKind.set(signal.patientId, signal.kind);

    const physioName = physioNameCache(ctx);
    const rows = [];
    for (const user of users.slice(0, DIRECTORY_CAP)) {
      if (user.deletedAt) continue;
      const facts = await patientFacts(ctx, user, physioName);
      rows.push({ ...factsRow(facts), lookingForCare: openKind.get(user._id) ?? null });
    }
    return { rows, capped: users.length > DIRECTORY_CAP };
  },
});

/** Everything about one patient, for the drawer. */
export const record = query({
  args: { patientId: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const patientId = ctx.db.normalizeId("users", args.patientId);
    const user = patientId ? await ctx.db.get(patientId) : null;
    if (!user || user.role !== "patient") return null;

    const physioName = physioNameCache(ctx);
    const facts = await patientFacts(ctx, user, physioName);
    const { profile, intake, referral: _latestReferral, ...summary } = facts;
    const now = Date.now();

    const [referrals, bookings, upcoming, past, journey, signals, relationships] = await Promise.all([
      ctx.db.query("inboundReferrals").withIndex("by_patient", (q) => q.eq("patientId", user._id)).order("desc").take(5),
      ctx.db.query("marketplaceBookings").withIndex("by_patient", (q) => q.eq("patientId", user._id)).order("desc").take(8),
      ctx.db.query("appointments").withIndex("by_patient_id_and_time", (q) => q.eq("patientId", user._id).gte("startTime", now)).take(4),
      ctx.db.query("appointments").withIndex("by_patient_id_and_time", (q) => q.eq("patientId", user._id).lt("startTime", now)).order("desc").take(4),
      ctx.db.query("joyJourneyEvents").withIndex("by_patient", (q) => q.eq("patientId", user._id)).order("desc").take(12),
      ctx.db.query("careSignals").withIndex("by_patient_kind", (q) => q.eq("patientId", user._id)).take(30),
      ctx.db.query("patientPhysiotherapistRelationships").withIndex("by_patient", (q) => q.eq("patientId", user._id)).take(20),
    ]);

    const clinicIds = [...new Set([profile?.clinicId, ...relationships.map((r) => r.clinicId)].filter(Boolean))] as Id<"clinics">[];
    const clinics = await Promise.all(clinicIds.map((id) => ctx.db.get(id)));
    const clinicName = new Map(clinicIds.map((id, i) => [id as string, clinics[i]?.name ?? "Clinic"]));

    const referralRows = await Promise.all(
      referrals.map(async (r) => {
        const doctor = r.referringDoctorId ? await ctx.db.get(r.referringDoctorId) : null;
        return {
          id: r._id,
          from: doctor ? `Dr ${personName(doctor, "Doctor")}` : r.partnerId ? `Partner: ${r.partnerId}` : "Referral",
          condition: r.condition ?? null,
          reason: r.reason?.replace(/_/g, " ") ?? null,
          priority: r.priority ?? null,
          careSetting: r.careSetting ?? r.preferredCareMode ?? null,
          recommendedSessions: r.recommendedSessions ?? null,
          clinicalNotes: r.clinicalNotes ?? null,
          status: r.status,
          createdAt: r._creationTime,
        };
      })
    );

    const bookingRows = await Promise.all(
      bookings.map(async (b) => ({
        id: b._id,
        line: bookingLine(b),
        status: b.bookingStatus,
        paid: b.paymentStatus === "completed",
        test: b.paystackMode === "test",
        physioId: b.physiotherapistId ?? null,
        physioName: b.physiotherapistId ? await physioName(b.physiotherapistId) : null,
        awaitingPhysio: b.bookingStatus === "awaiting_physio" && b.providerResponse === "pending",
        dueAt: b.providerResponseDueAt ?? null,
        createdAt: b.createdAt,
      }))
    );

    const sessionRow = async (a: Doc<"appointments">) => ({
      id: a._id,
      startTime: a.startTime,
      status: a.status,
      online: Boolean(a.isOnline || a.appointmentType === "telehealth"),
      physioName: a.physiotherapistId ? await physioName(a.physiotherapistId) : null,
    });

    const updatedBy = profile?.careDetailsUpdatedBy ? await ctx.db.get(profile.careDetailsUpdatedBy) : null;
    // Joy's intake is clinical: the physio sees it only with the patient's consent, admins always
    const consentGiven = intake?.consent ? intake.consent.shareWithClinician : null;

    return {
      ...summary,
      address: profile?.address ?? null,
      dateOfBirth: profile?.dateOfBirth ?? null,
      ageYears: profile?.ageYears ?? null,
      medicalHistory: profile?.medicalHistorySummary ?? null,
      mainComplaint: profile?.mainComplaint ?? null,
      preferredFormat: profile?.preferredFormat ?? null,
      careTeamNotes: profile?.careTeamNotes ?? null,
      careDetailsUpdatedAt: profile?.careDetailsUpdatedAt ?? null,
      careDetailsUpdatedBy: updatedBy ? personName(updatedBy, "Admin") : null,
      emergencyContact: profile?.emergencyContact ?? null,
      clinicName: profile?.clinicId ? clinicName.get(profile.clinicId) ?? null : null,
      physios: summary.physios.map((p) => ({ ...p, clinicName: p.clinicId ? clinicName.get(p.clinicId) ?? null : null })),
      pastPhysios: await Promise.all(
        relationships
          .filter((r) => r.status !== "active")
          .slice(0, 4)
          .map(async (r) => ({ physioId: r.physiotherapistId, name: await physioName(r.physiotherapistId), source: r.source ?? null, endedAt: r.endDate ?? null }))
      ),
      intake: intake
        ? {
            receivedAt: intake.receivedAt,
            triageLevel: intake.triageLevel ?? null,
            chiefComplaint: intake.chiefComplaint ?? null,
            bodyAreas: intake.bodyAreas ?? [],
            painScore: intake.painScore ?? null,
            onset: intake.onset ?? null,
            duration: intake.duration ?? null,
            redFlags: intake.redFlags ?? [],
            goals: intake.goals ?? null,
            medicalHistory: intake.medicalHistory ?? null,
            medications: intake.medications ?? null,
            answers: intake.answers ?? [],
            clinicianSummary: intake.clinicianSummary ?? null,
            preferredTimes: intake.preferredTimes ?? null,
            language: intake.language ?? null,
            consentGiven,
          }
        : null,
      referrals: referralRows,
      bookings: bookingRows,
      upcoming: await Promise.all(upcoming.map(sessionRow)),
      past: await Promise.all(past.map(sessionRow)),
      journey: journey.map((e) => ({ stage: e.stage, occurredAt: e.occurredAt, note: e.note ?? null, source: e.source })),
      // Physio profiles they opened on Find a Physio, newest first
      viewedPhysios: await recentPatientViews(ctx, user._id, 8),
      // Their latest "Help me choose a physio" answers
      helpRequest: (() => {
        const asked = signals.filter((s) => s.kind === "help_choosing" && s.request).sort((a, b) => b.createdAt - a.createdAt)[0];
        return asked?.request ? { ...asked.request, askedAt: asked.createdAt, open: asked.status === "open" } : null;
      })(),
      signals: signals
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 6)
        .map((s) => ({ id: s._id, kind: s.kind, status: s.status, detail: s.detail, createdAt: s.createdAt, handledNote: s.handledNote ?? null })),
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// What the team learns on a call
// ─────────────────────────────────────────────────────────────────────────────

const clean = (value: string | undefined, max: number) => {
  const text = value?.trim().slice(0, max);
  return text ? text : undefined;
};

export const updateDetails = mutation({
  args: {
    patientId: v.id("users"),
    // Send only what changed; an empty string clears a field
    dateOfBirth: v.optional(v.string()),
    ageYears: v.optional(v.union(v.number(), v.null())),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"), v.literal("prefer_not_to_say"), v.null())),
    preferredLanguage: v.optional(v.string()),
    state: v.optional(v.string()),
    city: v.optional(v.string()),
    area: v.optional(v.string()),
    address: v.optional(v.string()),
    mainComplaint: v.optional(v.string()),
    preferredFormat: v.optional(v.union(format, v.null())),
    careTeamNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user: admin } = await requireAdmin(ctx);
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.role !== "patient") throw new ConvexError("Patient not found.");

    const patch: Partial<WithoutSystemFields<Doc<"patientProfiles">>> = {};
    const text = (key: "preferredLanguage" | "state" | "city" | "area" | "address" | "mainComplaint" | "careTeamNotes", max: number) => {
      const value = args[key];
      if (value !== undefined) (patch as Record<string, unknown>)[key] = clean(value, max);
    };
    text("preferredLanguage", 40);
    text("state", 40);
    text("city", 60);
    text("area", 80);
    text("address", 300);
    text("mainComplaint", 300);
    text("careTeamNotes", 2000);

    if (args.dateOfBirth !== undefined) {
      const dob = args.dateOfBirth.trim();
      if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) throw new ConvexError("Use a date like 1980-04-23.");
      if (dob && (Date.parse(dob) > Date.now() || Date.parse(dob) < Date.parse("1900-01-01"))) throw new ConvexError("That date of birth doesn't look right.");
      patch.dateOfBirth = dob || undefined;
    }
    if (args.ageYears !== undefined) {
      if (args.ageYears !== null && (!Number.isInteger(args.ageYears) || args.ageYears < 0 || args.ageYears > 120)) {
        throw new ConvexError("Age must be a whole number from 0 to 120.");
      }
      patch.ageYears = args.ageYears ?? undefined;
      patch.ageRecordedAt = args.ageYears === null ? undefined : Date.now();
    }
    if (args.gender !== undefined) patch.gender = args.gender ?? undefined;
    if (args.preferredFormat !== undefined) patch.preferredFormat = args.preferredFormat ?? undefined;
    patch.careDetailsUpdatedAt = Date.now();
    patch.careDetailsUpdatedBy = admin._id;

    const profile =
      (patient.patientProfileId ? await ctx.db.get(patient.patientProfileId) : null) ??
      (await ctx.db.query("patientProfiles").withIndex("by_user_id", (q) => q.eq("userId", patient._id)).first());
    if (profile) {
      await ctx.db.patch(profile._id, patch);
    } else {
      const profileId = await ctx.db.insert("patientProfiles", { userId: patient._id, country: "Nigeria", ...patch });
      await ctx.db.patch(patient._id, { patientProfileId: profileId });
    }
    return { ok: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Suggested physios
// ─────────────────────────────────────────────────────────────────────────────

type Candidate = {
  userId: Id<"users">;
  name: string;
  imageUrl: string | null;
  rehabifyId: string | null;
  location: string | null;
  specializations: string[];
  languages: string[];
  formats: string[];
  offersFormat: boolean;
  coversArea: boolean;
  sameState: boolean;
  speaksLanguage: boolean;
  specialtyMatch: boolean;
  booked7d: number;
  recentReferrals: number;
  acceptRate: number | null;
  rating: number | null;
  phone: string | null;
};

const norm = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
// "Orthopaedic" matches "Orthopedic" and the MSK_ORTHOPAEDIC tag; "Women's" matches "Womens"
const spelling = (value: string | null | undefined) =>
  norm(value).replace(/ae/g, "e").replace(/['’]/g, "").replace(/[\s_]+/g, " ");

/** Every network physio who could see patients, with how well they fit this one. */
export const candidatePool = internalQuery({
  args: { patientId: v.id("users"), format, specialty: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ patient: { state: string | null; city: string | null; area: string | null; language: string | null; zone: string | null }; candidates: Candidate[] }> => {
    const user = await ctx.db.get(args.patientId);
    if (!user || user.role !== "patient") throw new ConvexError("Patient not found.");
    const facts = await patientFacts(ctx, user);
    const zones = await ctx.db.query("travelZones").collect();
    // Travel zones are per city ("Lagos"); a patient may have given the city or only the state
    const activeZones = zones.filter((z) => z.active);
    const zone = facts.area
      ? zoneForArea(activeZones, facts.city ?? facts.state ?? "", facts.area) ?? (facts.state ? zoneForArea(activeZones, facts.state, facts.area) : null)
      : null;
    const now = Date.now();
    const want = spelling(args.specialty);
    const place = [facts.state, facts.city].map(norm).filter(Boolean);

    const profiles = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_marketplace_availability", (q) => q.eq("isAvailableOnMarketplace", true))
      .collect();
    const candidates: Candidate[] = [];
    for (const profile of profiles) {
      const physio = await ctx.db.get(profile.userId);
      if (!physio || physio.deletedAt || physio.role !== "physiotherapist" || physio.status === "suspended" || physio.status === "terminated") continue;
      if (!(await isJoyProviderEligible(ctx, profile))) continue;

      const formats =
        profile.joyServiceModes && profile.joyServiceModes.length
          ? [...profile.joyServiceModes]
          : [...(profile.offersOnlineSessions !== false ? ["online"] : []), ...(profile.offersInPersonSessions ? ["home_visit"] : [])];
      const location = profile.location ?? null;
      const servedPlaces = [location, ...(profile.joyServiceAreas ?? [])].map(norm).filter(Boolean);
      const specializations = (profile.specializations ?? []).slice(0, 6);
      const tags = controlledTags(profile).map((t) => t.toLowerCase());

      const upcoming = await ctx.db
        .query("appointments")
        .withIndex("by_physiotherapist_id_and_time", (q) => q.eq("physiotherapistId", profile.userId).gte("startTime", now).lt("startTime", now + 7 * DAY))
        .take(60);
      const bookings = await ctx.db
        .query("marketplaceBookings")
        .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", profile.userId))
        .order("desc")
        .take(100);
      const paid = bookings.filter((b) => b.paymentStatus === "completed" && b.paystackMode !== "test");
      const answered = paid.filter((b) => (b.paidAt ?? b.createdAt) >= now - 90 * DAY && (b.providerResponse === "accepted" || b.providerResponse === "rejected"));

      candidates.push({
        userId: profile.userId,
        name: personName(physio, "Physiotherapist"),
        imageUrl: physio.imageUrl ?? null,
        rehabifyId: physio.staffNumber ?? null,
        location,
        specializations,
        languages: profile.languagesSpoken ?? [],
        formats,
        offersFormat: formats.includes(args.format),
        coversArea: Boolean(zone && (profile.coveredZoneIds ?? []).includes(zone._id)),
        sameState: place.length > 0 && servedPlaces.some((p) => place.some((w) => p.includes(w) || w.includes(p))),
        speaksLanguage: speaksLanguage(profile.languagesSpoken, facts.language ?? undefined),
        specialtyMatch: Boolean(want) && [...specializations, ...tags].some((s) => spelling(s).includes(want)),
        booked7d: upcoming.filter((a) => a.status !== "cancelled_by_patient" && a.status !== "cancelled_by_therapist").length,
        recentReferrals: paid.filter((b) => (b.paidAt ?? b.createdAt) >= now - 30 * DAY).length,
        acceptRate: answered.length ? answered.filter((b) => b.providerResponse === "accepted").length / answered.length : null,
        rating: (profile.reviewCount ?? 0) >= 3 ? profile.averageRating ?? null : null,
        phone: physio.phoneNumber ?? null,
      });
    }
    return {
      patient: { state: facts.state, city: facts.city, area: facts.area, language: facts.language, zone: zone?.name ?? null },
      candidates,
    };
  },
});

const poolRef = makeFunctionReference<
  "query",
  { patientId: Id<"users">; format: "online" | "home_visit" | "clinic"; specialty?: string },
  { patient: { state: string | null; city: string | null; area: string | null; language: string | null; zone: string | null }; candidates: Candidate[] }
>("adminPatients:candidatePool");
const slotsRef = makeFunctionReference<
  "query",
  { physiotherapistId: Id<"users">; startDate: number; endDate: number; sessionDuration?: number },
  Array<{ start: number; end: number }>
>("calendar/availability:getAvailableSlotsInternal");
const requireAdminRef = makeFunctionReference<"query", Record<string, never>, { ok: boolean }>("adminPatients:assertAdmin");

export const assertAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return { ok: true };
  },
});

/**
 * Network physios for this patient, best first: offers the format, then local (travel zone for a
 * home visit, same state otherwise), specialty, the earliest free time in the next 7 days, spare
 * capacity, and fewer recent referrals on a tie (the owner's matching rules). Physios who don't
 * fit everything are still listed with what's missing, so the team can decide.
 */
export const suggestPhysios = action({
  args: { patientId: v.id("users"), format, specialty: v.optional(v.string()), withinDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await ctx.runQuery(requireAdminRef, {});
    const { patient, candidates } = await ctx.runQuery(poolRef, { patientId: args.patientId, format: args.format, specialty: args.specialty });
    const local = (c: Candidate) => (args.format === "home_visit" ? c.coversArea : c.coversArea || c.sameState);
    const shortlist = [...candidates]
      .sort(
        (a, b) =>
          Number(b.offersFormat) - Number(a.offersFormat) ||
          Number(local(b)) - Number(local(a)) ||
          Number(b.specialtyMatch) - Number(a.specialtyMatch) ||
          Number(b.speaksLanguage) - Number(a.speaksLanguage) ||
          a.recentReferrals - b.recentReferrals
      )
      .slice(0, 16);

    const now = Date.now();
    const start = now + 2 * HOUR + 5 * 60_000;
    const end = now + Math.min(Math.max(args.withinDays ?? 7, 1), 14) * DAY;
    const withSlots = [];
    for (const c of shortlist) {
      let slots: Array<{ start: number; end: number }> = [];
      try {
        slots = await ctx.runQuery(slotsRef, { physiotherapistId: c.userId, startDate: start, endDate: end });
      } catch {
        slots = [];
      }
      const free = slots.filter((s) => s.start >= start && s.start < end).sort((a, b) => a.start - b.start);
      withSlots.push({ ...c, nextSlot: free[0]?.start ?? null, freeSlots: free.length });
    }

    const ranked = withSlots.sort(
      (a, b) =>
        Number(b.offersFormat) - Number(a.offersFormat) ||
        Number(local(b)) - Number(local(a)) ||
        Number(b.specialtyMatch) - Number(a.specialtyMatch) ||
        Number(b.nextSlot !== null) - Number(a.nextSlot !== null) ||
        Math.floor((a.nextSlot ?? Infinity) / (2 * HOUR)) - Math.floor((b.nextSlot ?? Infinity) / (2 * HOUR)) ||
        a.booked7d - b.booked7d ||
        a.recentReferrals - b.recentReferrals
    );

    const formatWord = args.format === "home_visit" ? "home visits" : args.format === "clinic" ? "clinic visits" : "video sessions";
    return {
      patient,
      considered: candidates.length,
      physios: ranked.slice(0, 8).map((c) => {
        const fits: string[] = [];
        const gaps: string[] = [];
        (c.offersFormat ? fits : gaps).push(c.offersFormat ? `Offers ${formatWord}` : `Doesn't list ${formatWord}`);
        if (args.format === "home_visit") {
          if (c.coversArea) fits.push(`Covers ${patient.zone ?? patient.area}`);
          else gaps.push(patient.area ? `Doesn't cover ${patient.area}` : "Patient's area unknown");
        } else if (c.coversArea || c.sameState) fits.push("Near the patient");
        if (args.specialty) (c.specialtyMatch ? fits : gaps).push(c.specialtyMatch ? `${args.specialty} specialty` : `No ${args.specialty} specialty listed`);
        if (!c.speaksLanguage) gaps.push(`Doesn't list ${patient.language}`);
        if (c.nextSlot === null) gaps.push(`No free time in the next ${Math.round((end - now) / DAY)} days`);
        return {
          userId: c.userId,
          name: c.name,
          imageUrl: c.imageUrl,
          rehabifyId: c.rehabifyId,
          location: c.location,
          specializations: c.specializations,
          languages: c.languages,
          formats: c.formats,
          nextSlot: c.nextSlot,
          freeSlots: c.freeSlots,
          booked7d: c.booked7d,
          recentReferrals: c.recentReferrals,
          acceptRate: c.acceptRate,
          rating: c.rating,
          phone: c.phone,
          fits,
          gaps,
        };
      }),
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Pairing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pair a patient with a physio: an active link (Rehabify Care, so later sessions bill through
 * Rehabify), the physio told by app, phone and email with what we know, the patient told in the
 * app, and the patient's open "looking for care" items closed. A paid booking still waiting on a
 * physio is moved with Bookings › reassign instead, so its money goes with it.
 */
export const pairWithPhysio = mutation({
  args: { patientId: v.id("users"), physiotherapistId: v.id("users"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { user: admin } = await requireAdmin(ctx);
    const patient = await ctx.db.get(args.patientId);
    const physio = await ctx.db.get(args.physiotherapistId);
    if (!patient || patient.role !== "patient" || patient.deletedAt) throw new ConvexError("Patient not found.");
    if (!physio || physio.role !== "physiotherapist" || physio.deletedAt) throw new ConvexError("Physiotherapist not found.");
    if (physio.status === "suspended" || physio.status === "terminated") throw new ConvexError("This physiotherapist's account is suspended.");

    const facts = await patientFacts(ctx, patient);
    const note = args.note?.trim().slice(0, 300);
    const now = Date.now();
    const relationships = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .take(50);
    const existing = relationships.filter((r) => r.physiotherapistId === physio._id).sort((a, b) => b.startDate - a.startDate)[0];
    if (existing?.status === "active") throw new ConvexError(`${facts.name} is already with ${personName(physio, "this physio")}.`);
    const otherActive = relationships.some((r) => r.status === "active" && r.physiotherapistId !== physio._id);
    const pairedNote = `Paired by the Rehabify care team (${personName(admin, "Admin")})${note ? `: ${note}` : ""}`;
    const source = facts.fromJoy ? ("joy_whatsapp" as const) : ("marketplace" as const);

    if (existing) {
      await ctx.db.patch(existing._id, { status: "active", endDate: undefined, startDate: now, notes: pairedNote, ...(existing.clinicId ? {} : { source }) });
    } else {
      await ctx.db.insert("patientPhysiotherapistRelationships", {
        patientId: patient._id,
        physiotherapistId: physio._id,
        status: "active",
        isPrimaryPhysiotherapist: !otherActive,
        startDate: now,
        notes: pairedNote,
        source,
      });
    }

    // Tell the physio what we know, so they can call and book
    const facts1 = [
      facts.complaint ? `Complaint: ${facts.complaint}` : null,
      facts.age !== null ? `Age ${facts.age}` : null,
      [facts.area, facts.city, facts.state].filter(Boolean).join(", ") || null,
      facts.format ? (facts.format === "home_visit" ? "Wants a home visit" : facts.format === "online" ? "Wants a video session" : "Wants a clinic visit") : null,
      facts.phone ? `Phone ${facts.phone}` : null,
    ].filter(Boolean) as string[];
    const link = `/dashboard/physiotherapist/patients/${patient._id}`;
    const body = `${facts.name}${facts1.length ? ` · ${facts1.join(" · ")}` : ""}. Please contact them today and book their first session.`;
    await insertNotification(ctx, {
      userId: physio._id,
      type: "referral_assigned",
      priority: "high",
      status: "pending",
      payload: { title: "Rehabify paired you with a new patient", body, link, data: { entityType: "patient", entityId: patient._id, actionUrl: link } },
      createdAt: now,
    });
    const physioEmail = reachableEmail(physio.email);
    if (physioEmail) {
      await ctx.scheduler.runAfter(0, sendEmail, {
        to: physioEmail,
        subject: "Rehabify paired you with a new patient",
        greetingName: physio.firstName,
        heading: "You have a new patient",
        paragraphs: [
          `The Rehabify care team has paired you with ${facts.name}.`,
          ...facts1,
          ...(note ? [`From the care team: ${note}`] : []),
          "Please contact them today and book their first session.",
        ],
        buttonLabel: "Open their record",
        buttonUrl: appLink(link),
      });
    }
    await insertNotification(ctx, {
      userId: patient._id,
      type: "referral_assigned",
      priority: "medium",
      status: "pending",
      payload: {
        title: "We've found your physiotherapist",
        body: `${personName(physio, "Your physiotherapist")} will contact you to book your first session.`,
        link: "/dashboard/patient",
      },
      createdAt: now,
    });

    // The patient isn't waiting any more
    const signals = await ctx.db.query("careSignals").withIndex("by_patient_kind", (q) => q.eq("patientId", patient._id)).take(30);
    for (const signal of signals) {
      if (signal.status === "open" && signal.kind !== "awaiting_physio" && signal.kind !== "unpaid_checkout") {
        await closeCareSignal(ctx, signal, `Paired with ${personName(physio, "a physio")}`, admin._id);
      }
    }
    return { ok: true, physioName: personName(physio, "the physio") };
  },
});
