/**
 * Home-visit safety (owner 2026-11-14). For a physio going into a patient's home:
 *
 * 1. "On my way": the patient gets the physio's photo, name, licence number and a 4-digit door
 *    code (app notification, email, WhatsApp through Joy, and the /visit/<token> page).
 * 2. At the door the patient checks the face against the photo, then gives the physio the code.
 *    The physio enters it ("I've arrived") and the patient's page turns to "Checked in". Without
 *    the code they can still start, with a reason the care team sees.
 * 3. "Left safely" closes the visit. A visit still open 20 minutes after it should have ended
 *    gets "Are you OK?" (push + WhatsApp); 10 minutes with no answer alerts the care team.
 * 4. The help button (press and hold) alerts the care team at once with the physio's location,
 *    the address and both phone numbers. Only a person on the care team can close it.
 *
 * The care team hears through every admin's bell + phone push (always sent, even in quiet hours),
 * the team inboxes (ADMIN_EMAIL), and WhatsApp + SMS to SAFETY_ALERT_PHONES (comma-separated;
 * without it, admins' own phone numbers). A phone's location can be faked or missing: it helps
 * the care team find someone, it isn't proof. Positions are cleared after 30 days.
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalAction, internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { currentUser, requirePhysio } from "./helpers/careAccess";
import { requireAdmin } from "./helpers/partnerAccess";
import { insertNotification } from "./helpers/pushNotify";
import { platformAdminEmails } from "./helpers/adminRecipients";
import { appLink } from "./helpers/appUrl";
import { personName } from "./helpers/displayIdentity";
import { lagosTime } from "./helpers/lagosTime";
import { practiceZoneForPhysio } from "./helpers/practiceZone";
import { normalizePhone } from "./helpers/partnerShared";
import { randomToken } from "./helpers/exerciseCrypto";
import { linkableEmail } from "./helpers/whatsappLink";

type Ctx = QueryCtx | MutationCtx;
type Visit = Doc<"homeVisitSafety">;
type Alert = Doc<"safetyAlerts">;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "On my way" opens this long before the visit starts */
export const OPENS_BEFORE_MS = 4 * HOUR;
/** "Are you OK?" goes this long after the visit should have ended */
export const CHECK_AFTER_MS = 20 * MINUTE;
/** No answer this long after "Are you OK?": the care team is alerted */
export const ESCALATE_AFTER_MS = 10 * MINUTE;
/** "Need more time" adds this much, up to MAX_EXTENSIONS times */
export const EXTEND_MS = 30 * MINUTE;
const MAX_EXTENSIONS = 6;
/** Wrong door codes allowed before the physio has to start without it (and say why) */
const MAX_CODE_ATTEMPTS = 5;
/** Visits left open this long after their end are closed by the sweep */
const AUTO_CLOSE_AFTER_MS = DAY;
/** Positions are kept this long, then cleared */
const KEEP_POSITIONS_MS = 30 * DAY;
/** The patient's page stops showing the visit this long after it closed */
const PAGE_LIVE_AFTER_MS = 2 * HOUR;
/** Pings closer together than this are ignored (the phone sends every 30 s or 50 m) */
const MIN_PING_GAP_MS = 10_000;
const ADMIN_CAP = 25;

const PHYSIO_HOME = "/dashboard/physiotherapist";
const ADMIN_PAGE = "/dashboard/admin/safety";

const SKIP_REASONS = ["no_code", "family_answered", "code_wrong", "other"] as const;
const SKIP_LABELS: Record<(typeof SKIP_REASONS)[number], string> = {
  no_code: "The patient couldn't find the code",
  family_answered: "A family member let me in",
  code_wrong: "The code didn't work",
  other: "Something else",
};

const sendEmail = makeFunctionReference<
  "action",
  { to: string; subject: string; greetingName?: string; skipGreeting?: boolean; heading: string; paragraphs: string[]; buttonLabel?: string; buttonUrl?: string; footnote?: string }
>("actions/emails/sendPatientCareEmail:sendPatientCareEmail");
const sendSmsRef = makeFunctionReference<"action", { to: string[]; text: string }, null>("homeVisitSafety:sendSafetySms");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** A visit at the patient's home: in person, not at a clinic, and a real visit (not a record anchor). */
export function isHomeVisit(apt: Doc<"appointments">): boolean {
  if (apt.clinicId || apt.isRecordOnly) return false;
  if (apt.appointmentType === "telehealth" || apt.isOnline === true) return false;
  return true;
}

function fourDigitCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 10_000).padStart(4, "0");
}

const mapsLink = (lat: number, lng: number) => `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;

function validCoords(lat?: number, lng?: number): lat is number {
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

const positionArgs = {
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  accuracy: v.optional(v.number()),
};

async function physioProfile(ctx: Ctx, userId: Id<"users">) {
  return await ctx.db
    .query("physiotherapistProfiles")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .first();
}

/** The physio's open visit (on the way or arrived), if any. */
async function openVisitOf(ctx: Ctx, physioId: Id<"users">): Promise<Visit | null> {
  const arrived = await ctx.db
    .query("homeVisitSafety")
    .withIndex("by_physio_and_stage", (q) => q.eq("physiotherapistId", physioId).eq("stage", "arrived"))
    .first();
  if (arrived) return arrived;
  return await ctx.db
    .query("homeVisitSafety")
    .withIndex("by_physio_and_stage", (q) => q.eq("physiotherapistId", physioId).eq("stage", "on_the_way"))
    .first();
}

async function ownVisit(ctx: MutationCtx, visitId: Id<"homeVisitSafety">) {
  const physio = await requirePhysio(ctx);
  const visit = await ctx.db.get(visitId);
  if (!visit || visit.physiotherapistId !== physio._id) throw new ConvexError("We couldn't find that visit.");
  return { physio, visit };
}

/** Keeps the admin live map (physiotherapistLocations) in step with the visit. */
async function shareLocation(
  ctx: MutationCtx,
  physioId: Id<"users">,
  status: "in_transit" | "at_patient" | "idle",
  pos: { lat?: number; lng?: number; accuracy?: number }
) {
  const existing = await ctx.db
    .query("physiotherapistLocations")
    .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physioId))
    .first();
  const now = Date.now();
  if (validCoords(pos.lat, pos.lng)) {
    const row = { latitude: pos.lat, longitude: pos.lng as number, status, lastUpdated: now, accuracy: pos.accuracy };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("physiotherapistLocations", { physiotherapistId: physioId, ...row });
  } else if (existing) {
    await ctx.db.patch(existing._id, { status });
  }
}

/** Where safety messages go outside the app: SAFETY_ALERT_PHONES, else admins' own numbers. */
async function careTeamPhones(ctx: Ctx, admins: Doc<"users">[]): Promise<string[]> {
  const configured = (process.env.SAFETY_ALERT_PHONES ?? "")
    .split(",")
    .map((p) => normalizePhone(p))
    .filter((p): p is string => Boolean(p));
  const phones = configured.length > 0 ? configured : admins.map((a) => normalizePhone(a.phoneNumber)).filter((p): p is string => Boolean(p));
  return [...new Set(phones)].slice(0, 10);
}

async function adminsOf(ctx: Ctx) {
  return await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "admin"))
    .take(ADMIN_CAP);
}

/** WhatsApp text through Joy (same outbox and retry cron as Joy's other events). */
async function queueSafetyWhatsApp(ctx: MutationCtx, eventId: string, phones: string[], text: string) {
  if (phones.length === 0) return;
  const existing = await ctx.db.query("joyEventOutbox").withIndex("by_event_id", (q) => q.eq("eventId", eventId)).first();
  if (existing) return;
  const now = Date.now();
  const payload = {
    event_id: eventId,
    event_type: "safety.notify",
    api_version: "1",
    occurred_at: new Date(now).toISOString(),
    data: { recipients: phones, text: text.slice(0, 1500) },
  };
  await ctx.db.insert("joyEventOutbox", { eventId, eventType: "safety.notify", payload, status: "pending", attempts: 0, createdAt: now, updatedAt: now });
}

type AlertDetails = {
  physio: Doc<"users">;
  physioPhone: string | null;
  staffNumber: string | null;
  patient: Doc<"users"> | null;
  patientPhone: string | null;
  address: string | null;
  appointment: Doc<"appointments"> | null;
};

async function alertDetails(ctx: Ctx, alert: Pick<Alert, "physiotherapistId" | "patientId" | "appointmentId">): Promise<AlertDetails | null> {
  const physio = await ctx.db.get(alert.physiotherapistId);
  if (!physio) return null;
  const patient = alert.patientId ? await ctx.db.get(alert.patientId) : null;
  const appointment = alert.appointmentId ? await ctx.db.get(alert.appointmentId) : null;
  const patientProfile = patient
    ? await ctx.db
        .query("patientProfiles")
        .withIndex("by_user_id", (q) => q.eq("userId", patient._id))
        .first()
    : null;
  return {
    physio,
    physioPhone: normalizePhone(physio.phoneNumber),
    staffNumber: physio.staffNumber ?? null,
    patient,
    patientPhone: normalizePhone(patient?.phoneNumber ?? null),
    address: appointment?.location?.trim() || patientProfile?.address?.trim() || null,
    appointment,
  };
}

/** Tells the whole care team: bell + push for every admin, email, WhatsApp and SMS. */
async function alertCareTeam(ctx: MutationCtx, alert: Alert, lead: { title: string; line: string }) {
  const details = await alertDetails(ctx, alert);
  if (!details) return;
  const physioName = personName(details.physio, "A physio");
  const patientName = details.patient ? personName(details.patient, "the patient") : null;
  const where = alert.lat !== undefined && alert.lng !== undefined ? mapsLink(alert.lat, alert.lng) : null;
  const lines = [
    lead.line,
    `Physio: ${physioName}${details.staffNumber ? ` (${details.staffNumber})` : ""}${details.physioPhone ? `, ${details.physioPhone}` : ""}`,
    ...(patientName ? [`Patient: ${patientName}${details.patientPhone ? `, ${details.patientPhone}` : ""}`] : []),
    ...(details.address ? [`Address: ${details.address}`] : []),
    ...(where ? [`Phone location: ${where}`] : ["Phone location: not shared"]),
    `Open: ${appLink(ADMIN_PAGE)}`,
  ];

  const admins = await adminsOf(ctx);
  const now = Date.now();
  for (const admin of admins) {
    await insertNotification(ctx, {
      userId: admin._id,
      type: "safety_alert",
      priority: "urgent",
      status: "pending",
      payload: {
        title: lead.title,
        body: `${physioName}${details.physioPhone ? ` (${details.physioPhone})` : ""}${details.address ? ` at ${details.address}` : ""}. Call now.`,
        link: ADMIN_PAGE,
        data: { entityType: "safety_alert", entityId: alert._id, actionUrl: ADMIN_PAGE },
      },
      createdAt: now,
    });
  }
  for (const to of platformAdminEmails()) {
    await ctx.scheduler.runAfter(0, sendEmail, {
      to,
      subject: lead.title,
      skipGreeting: true,
      heading: lead.title,
      paragraphs: lines.slice(0, -1),
      buttonLabel: "Open Visit safety",
      buttonUrl: appLink(ADMIN_PAGE),
    });
  }
  const phones = await careTeamPhones(ctx, admins);
  const text = `🚨 ${lead.title}\n\n${lines.join("\n")}`;
  await queueSafetyWhatsApp(ctx, `safety-${alert._id}-${alert.kind}-${now}`, phones, text);
  if (phones.length > 0) await ctx.scheduler.runAfter(0, sendSmsRef, { to: phones, text: `${lead.title}. ${lines.slice(1).join(". ")}` });
}

/** A quieter follow-up for the care team (the physio says they're safe, or someone took it). */
async function updateCareTeam(ctx: MutationCtx, alert: Alert, title: string, body: string) {
  const admins = await adminsOf(ctx);
  const now = Date.now();
  for (const admin of admins) {
    await insertNotification(ctx, {
      userId: admin._id,
      type: "safety_alert_update",
      priority: "high",
      status: "pending",
      payload: { title, body, link: ADMIN_PAGE, data: { entityType: "safety_alert", entityId: alert._id, actionUrl: ADMIN_PAGE } },
      createdAt: now,
    });
  }
}

/** Closes a visit (left, next visit, care team, or the sweep). Also settles an open overdue alert. */
async function closeVisit(
  ctx: MutationCtx,
  visit: Visit,
  by: NonNullable<Visit["leftBy"]>,
  pos: { lat?: number; lng?: number } = {}
) {
  const now = Date.now();
  await ctx.db.patch(visit._id, {
    stage: "left",
    leftAt: now,
    leftBy: by,
    check: "ok",
    ...(validCoords(pos.lat, pos.lng) ? { leftLat: pos.lat, leftLng: pos.lng } : {}),
    updatedAt: now,
  });
  if (by === "physio" || by === "next_visit") await settleOverdueAlerts(ctx, visit, "The physio closed the visit in the app.");
}

/** The physio answered after an overdue alert went out: close it and tell the team. Help alerts stay open. */
async function settleOverdueAlerts(ctx: MutationCtx, visit: Visit, resolution: string) {
  const alerts = await ctx.db
    .query("safetyAlerts")
    .withIndex("by_visit", (q) => q.eq("visitId", visit._id))
    .take(10);
  const now = Date.now();
  for (const alert of alerts) {
    if (alert.status === "resolved") continue;
    if (alert.kind === "overdue") {
      await ctx.db.patch(alert._id, { status: "resolved", physioSafeAt: now, resolvedAt: now, resolution, updatedAt: now });
      const physio = await ctx.db.get(visit.physiotherapistId);
      await updateCareTeam(ctx, alert, `${personName(physio, "The physio")} is safe`, `${resolution} The overdue alert was closed.`);
    } else if (!alert.physioSafeAt) {
      await ctx.db.patch(alert._id, { physioSafeAt: now, updatedAt: now });
    }
  }
}

/** What the physio's screens show for a visit. */
async function visitView(ctx: Ctx, visit: Visit) {
  const appointment = await ctx.db.get(visit.appointmentId);
  const patient = await ctx.db.get(visit.patientId);
  const openHelp = await ctx.db
    .query("safetyAlerts")
    .withIndex("by_visit", (q) => q.eq("visitId", visit._id))
    .filter((q) => q.and(q.eq(q.field("kind"), "panic"), q.neq(q.field("status"), "resolved")))
    .first();
  return {
    _id: visit._id,
    appointmentId: visit.appointmentId,
    stage: visit.stage,
    onTheWayAt: visit.onTheWayAt,
    arrivedAt: visit.arrivedAt ?? null,
    leftAt: visit.leftAt ?? null,
    expectedEndAt: visit.expectedEndAt,
    extensions: visit.extensions ?? 0,
    canExtend: (visit.extensions ?? 0) < MAX_EXTENSIONS,
    doorCheck: visit.doorCheck ?? null,
    codeAttemptsLeft: Math.max(0, MAX_CODE_ATTEMPTS - visit.codeAttempts),
    check: visit.check,
    checkSentAt: visit.checkSentAt ?? null,
    patientFirstName: patient?.firstName?.trim() || "your patient",
    patientName: personName(patient, "Patient"),
    address: appointment?.location ?? null,
    startTime: appointment?.startTime ?? null,
    endTime: appointment?.endTime ?? null,
    help: openHelp ? { _id: openHelp._id, createdAt: openHelp.createdAt, status: openHelp.status, physioSafeAt: openHelp.physioSafeAt ?? null } : null,
  };
}

/** What the patient (and anyone they share the link with) sees: who is coming, and the code. */
async function identityView(ctx: Ctx, visit: Visit) {
  const physio = await ctx.db.get(visit.physiotherapistId);
  const profile = physio ? await physioProfile(ctx, physio._id) : null;
  const appointment = await ctx.db.get(visit.appointmentId);
  return {
    stage: visit.stage,
    onTheWayAt: visit.onTheWayAt,
    arrivedAt: visit.arrivedAt ?? null,
    leftAt: visit.leftAt ?? null,
    verified: visit.doorCheck === "code",
    doorCode: visit.doorCode,
    startTime: appointment?.startTime ?? null,
    endTime: appointment?.endTime ?? null,
    physio: {
      name: personName(physio, "Your physiotherapist"),
      firstName: physio?.firstName?.trim() || "your physio",
      imageUrl: physio?.imageUrl ?? null,
      staffNumber: physio?.staffNumber ?? null,
      licenseNumber: profile?.licenseNumber?.trim() || null,
      gender: profile?.gender ?? null,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Physio: queries
// ─────────────────────────────────────────────────────────────────────────────

/** The visit under way right now (for the safety bar on every page), or null. */
export const myActiveVisit = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user || user.role !== "physiotherapist") return null;
    const visit = await openVisitOf(ctx, user._id);
    if (visit) return await visitView(ctx, visit);
    // A help alert raised outside a visit still shows its "help is coming" state
    const help = await ctx.db
      .query("safetyAlerts")
      .withIndex("by_physio", (q) => q.eq("physiotherapistId", user._id))
      .order("desc")
      .first();
    if (help && help.kind === "panic" && help.status !== "resolved" && !help.visitId) {
      return { _id: null, stage: "help_only" as const, help: { _id: help._id, createdAt: help.createdAt, status: help.status, physioSafeAt: help.physioSafeAt ?? null } };
    }
    return null;
  },
});

/** Safety state for one appointment (the card in the appointment drawer). */
export const forAppointment = query({
  args: { appointmentId: v.id("appointments") },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (!user || user.role !== "physiotherapist") return null;
    const apt = await ctx.db.get(args.appointmentId);
    if (!apt || apt.physiotherapistId !== user._id || !isHomeVisit(apt)) return null;
    const visit = await ctx.db
      .query("homeVisitSafety")
      .withIndex("by_appointment", (q) => q.eq("appointmentId", apt._id))
      .first();
    const now = Date.now();
    const open = apt.status === "scheduled" || apt.status === "confirmed";
    return {
      visit: visit ? await visitView(ctx, visit) : null,
      canStart: !visit && open && now >= apt.startTime - OPENS_BEFORE_MS && now <= apt.endTime,
      opensAt: apt.startTime - OPENS_BEFORE_MS,
      tooLate: !visit && now > apt.endTime,
      open,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Physio: the visit
// ─────────────────────────────────────────────────────────────────────────────

/** "On my way": opens the visit's safety record and tells the patient who is coming. */
export const startVisit = mutation({
  args: { appointmentId: v.id("appointments"), ...positionArgs },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const apt = await ctx.db.get(args.appointmentId);
    if (!apt || apt.physiotherapistId !== physio._id) throw new ConvexError("We couldn't find that visit.");
    if (!isHomeVisit(apt)) throw new ConvexError("Visit safety is for home visits.");
    if (apt.status !== "scheduled" && apt.status !== "confirmed") throw new ConvexError("This visit isn't booked any more.");
    const now = Date.now();
    if (now < apt.startTime - OPENS_BEFORE_MS) throw new ConvexError(`You can start this from ${lagosTime(apt.startTime - OPENS_BEFORE_MS, await practiceZoneForPhysio(ctx, apt.physiotherapistId))}.`);
    if (now > apt.endTime) throw new ConvexError("This visit's time has passed. Suggest a new time instead.");

    const existing = await ctx.db
      .query("homeVisitSafety")
      .withIndex("by_appointment", (q) => q.eq("appointmentId", apt._id))
      .first();
    if (existing) {
      if (existing.stage === "left") throw new ConvexError("You already finished this visit.");
      return { visitId: existing._id };
    }

    // Starting the next visit means the last one is over
    const previous = await openVisitOf(ctx, physio._id);
    if (previous) await closeVisit(ctx, previous, "next_visit");

    const visitId = await ctx.db.insert("homeVisitSafety", {
      appointmentId: apt._id,
      physiotherapistId: physio._id,
      patientId: apt.patientId,
      doorCode: fourDigitCode(),
      publicToken: randomToken(24),
      stage: "on_the_way",
      onTheWayAt: now,
      expectedEndAt: apt.endTime,
      codeAttempts: 0,
      check: "ok",
      ...(validCoords(args.lat, args.lng) ? { lastLat: args.lat, lastLng: args.lng, lastAccuracy: args.accuracy, lastPingAt: now } : {}),
      updatedAt: now,
    });
    await shareLocation(ctx, physio._id, "in_transit", args);
    const visit = (await ctx.db.get(visitId))!;
    await tellPatientOnTheWay(ctx, visit, physio, apt);
    return { visitId };
  },
});

async function tellPatientOnTheWay(ctx: MutationCtx, visit: Visit, physio: Doc<"users">, apt: Doc<"appointments">) {
  const patient = await ctx.db.get(visit.patientId);
  if (!patient) return;
  const profile = await physioProfile(ctx, physio._id);
  // Times are where the visit happens: Lagos, or the physio's own zone outside Nigeria
  const tz = await practiceZoneForPhysio(ctx, physio._id);
  const name = personName(physio, "Your physiotherapist");
  const first = physio.firstName?.trim() || name;
  const licence = profile?.licenseNumber?.trim();
  const page = `/visit/${visit.publicToken}`;
  const now = Date.now();

  await insertNotification(ctx, {
    userId: patient._id,
    type: "visit_on_the_way",
    priority: "urgent",
    status: "pending",
    payload: {
      title: `${first} is on the way`,
      body: `Your physio for ${lagosTime(apt.startTime, tz)}. Check ${first}'s face against the photo, then give the code ${visit.doorCode}. Never give it to anyone else.`,
      link: page,
      data: { entityType: "home_visit", entityId: visit._id, actionUrl: page },
    },
    createdAt: now,
  });

  const email = linkableEmail(patient);
  if (email) {
    await ctx.scheduler.runAfter(0, sendEmail, {
      to: email,
      subject: `${first} is on the way to you`,
      greetingName: patient.firstName?.trim() || undefined,
      heading: `${name} is on the way`,
      paragraphs: [
        `${name} is coming for your home visit at ${lagosTime(apt.startTime, tz)}.`,
        `When they arrive, check their face matches the photo on the page below. Then give them this code: ${visit.doorCode}.`,
        ...(licence ? [`Their physiotherapy licence number is ${licence}.`] : []),
        "Only give the code to the person in the photo. If someone else comes, don't let them in, and call us or reply to Joy on WhatsApp.",
      ],
      buttonLabel: `See ${first}'s photo`,
      buttonUrl: appLink(page),
    });
  }

  // WhatsApp through Joy, for patients Joy can reach
  const reachable = patient.clerkId.startsWith("joy-whatsapp:") || Boolean(patient.whatsappLinkedAt);
  if (reachable) {
    const eventId = `visit-on-the-way-${visit._id}`;
    const existing = await ctx.db.query("joyEventOutbox").withIndex("by_event_id", (q) => q.eq("eventId", eventId)).first();
    if (!existing) {
      const payload = {
        event_id: eventId,
        event_type: "visit.on_the_way",
        api_version: "1",
        occurred_at: new Date(now).toISOString(),
        data: {
          patient_id: patient._id,
          physio_name: name,
          physio_first_name: first,
          licence_number: licence ?? null,
          staff_number: physio.staffNumber ?? null,
          door_code: visit.doorCode,
          start_time: apt.startTime,
          page_url: appLink(page),
        },
      };
      await ctx.db.insert("joyEventOutbox", { eventId, eventType: "visit.on_the_way", payload, status: "pending", attempts: 0, createdAt: now, updatedAt: now });
    }
  }
}

/** Position from the physio's phone while a visit is open (every 30 s or 50 m, and every 3 min). */
export const ping = mutation({
  args: { visitId: v.id("homeVisitSafety"), lat: v.number(), lng: v.number(), accuracy: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { physio, visit } = await ownVisit(ctx, args.visitId);
    const now = Date.now();
    if (!validCoords(args.lat, args.lng)) return null;
    // A help alert keeps following the phone, whatever the visit's stage
    const help = await ctx.db
      .query("safetyAlerts")
      .withIndex("by_visit", (q) => q.eq("visitId", visit._id))
      .filter((q) => q.and(q.eq(q.field("kind"), "panic"), q.neq(q.field("status"), "resolved")))
      .first();
    if (help) await ctx.db.patch(help._id, { lat: args.lat, lng: args.lng, accuracy: args.accuracy, locatedAt: now, updatedAt: now });
    if (visit.stage === "left") return null;
    if (!help && visit.lastPingAt && now - visit.lastPingAt < MIN_PING_GAP_MS) return null;
    await ctx.db.patch(visit._id, { lastLat: args.lat, lastLng: args.lng, lastAccuracy: args.accuracy, lastPingAt: now, updatedAt: now });
    await shareLocation(ctx, physio._id, visit.stage === "arrived" ? "at_patient" : "in_transit", args);
    return null;
  },
});

/**
 * "I've arrived": with the patient's door code, or without it and a reason. A wrong code returns
 * (doesn't throw) so the attempt is counted.
 */
export const arrive = mutation({
  args: {
    visitId: v.id("homeVisitSafety"),
    code: v.optional(v.string()),
    skipReason: v.optional(v.union(v.literal("no_code"), v.literal("family_answered"), v.literal("code_wrong"), v.literal("other"))),
    skipNote: v.optional(v.string()),
    ...positionArgs,
  },
  handler: async (ctx, args) => {
    const { physio, visit } = await ownVisit(ctx, args.visitId);
    if (visit.stage === "left") throw new ConvexError("You already finished this visit.");
    if (visit.stage === "arrived") return { ok: true as const };
    const now = Date.now();

    let doorCheck: "code" | "skipped";
    let doorSkipReason: string | undefined;
    if (args.code !== undefined) {
      if (visit.codeAttempts >= MAX_CODE_ATTEMPTS) {
        return { ok: false as const, attemptsLeft: 0, message: "Too many tries. Start without the code and tell us why." };
      }
      const code = args.code.replace(/\D/g, "");
      if (code !== visit.doorCode) {
        const attempts = visit.codeAttempts + 1;
        await ctx.db.patch(visit._id, { codeAttempts: attempts, updatedAt: now });
        const left = Math.max(0, MAX_CODE_ATTEMPTS - attempts);
        return {
          ok: false as const,
          attemptsLeft: left,
          message: left > 0 ? `That code doesn't match. ${left} ${left === 1 ? "try" : "tries"} left.` : "That code doesn't match. Start without the code and tell us why.",
        };
      }
      doorCheck = "code";
    } else if (args.skipReason) {
      doorCheck = "skipped";
      const note = args.skipNote?.trim().slice(0, 300);
      doorSkipReason = `${SKIP_LABELS[args.skipReason]}${note ? `: ${note}` : ""}`;
      if (args.skipReason === "other" && !note) throw new ConvexError("Tell us briefly why you're starting without the code.");
    } else {
      throw new ConvexError("Enter the patient's code, or say why you're starting without it.");
    }

    const apt = await ctx.db.get(visit.appointmentId);
    const duration = apt ? Math.max(15 * MINUTE, apt.endTime - apt.startTime) : HOUR;
    await ctx.db.patch(visit._id, {
      stage: "arrived",
      arrivedAt: now,
      doorCheck,
      doorSkipReason,
      // Arrived late: the visit still gets its full length before anyone checks
      expectedEndAt: Math.max(visit.expectedEndAt, now + duration),
      ...(validCoords(args.lat, args.lng)
        ? { arrivedLat: args.lat, arrivedLng: args.lng, lastLat: args.lat, lastLng: args.lng, lastAccuracy: args.accuracy, lastPingAt: now }
        : {}),
      updatedAt: now,
    });
    await shareLocation(ctx, physio._id, "at_patient", args);
    return { ok: true as const };
  },
});

/** "Need more time": pushes the check back 30 minutes. */
export const moreTime = mutation({
  args: { visitId: v.id("homeVisitSafety") },
  handler: async (ctx, args) => {
    const { visit } = await ownVisit(ctx, args.visitId);
    if (visit.stage === "left") throw new ConvexError("You already finished this visit.");
    const extensions = visit.extensions ?? 0;
    if (extensions >= MAX_EXTENSIONS) throw new ConvexError("That's the longest a visit can run. Tap Left safely when you go.");
    const now = Date.now();
    await ctx.db.patch(visit._id, {
      expectedEndAt: Math.max(visit.expectedEndAt, now) + EXTEND_MS,
      extensions: extensions + 1,
      check: "ok",
      checkSentAt: undefined,
      updatedAt: now,
    });
    if (visit.check !== "ok") await settleOverdueAlerts(ctx, visit, "The physio answered in the app and asked for more time.");
    return { expectedEndAt: Math.max(visit.expectedEndAt, now) + EXTEND_MS };
  },
});

/** "Left safely": closes the visit and stops sharing the location for it. */
export const leave = mutation({
  args: { visitId: v.id("homeVisitSafety"), ...positionArgs },
  handler: async (ctx, args) => {
    const { physio, visit } = await ownVisit(ctx, args.visitId);
    if (visit.stage === "left") return null;
    await closeVisit(ctx, visit, "physio", args);
    await shareLocation(ctx, physio._id, "idle", args);
    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Physio: help
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The help button. Raises an alert to the whole care team straight away; pressing again within
 * 10 minutes updates the same alert instead of starting another.
 */
export const sendHelp = mutation({
  args: { visitId: v.optional(v.id("homeVisitSafety")), ...positionArgs },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const visit = args.visitId ? await ctx.db.get(args.visitId) : await openVisitOf(ctx, physio._id);
    if (visit && visit.physiotherapistId !== physio._id) throw new ConvexError("We couldn't find that visit.");
    const now = Date.now();
    const pos = validCoords(args.lat, args.lng) ? { lat: args.lat, lng: args.lng, accuracy: args.accuracy, locatedAt: now } : {};

    const recent = await ctx.db
      .query("safetyAlerts")
      .withIndex("by_physio", (q) => q.eq("physiotherapistId", physio._id).gt("createdAt", now - 10 * MINUTE))
      .order("desc")
      .first();
    if (recent && recent.kind === "panic" && recent.status !== "resolved") {
      await ctx.db.patch(recent._id, { ...pos, physioSafeAt: undefined, updatedAt: now });
      return { alertId: recent._id };
    }

    const alertId = await ctx.db.insert("safetyAlerts", {
      kind: "panic",
      status: "open",
      physiotherapistId: physio._id,
      visitId: visit?._id,
      appointmentId: visit?.appointmentId,
      patientId: visit?.patientId,
      ...pos,
      createdAt: now,
      updatedAt: now,
    });
    if (visit && validCoords(args.lat, args.lng)) {
      await ctx.db.patch(visit._id, { lastLat: args.lat, lastLng: args.lng, lastAccuracy: args.accuracy, lastPingAt: now, updatedAt: now });
    }
    await shareLocation(ctx, physio._id, visit?.stage === "arrived" ? "at_patient" : "in_transit", args);
    const alert = (await ctx.db.get(alertId))!;
    await alertCareTeam(ctx, alert, {
      title: `HELP: ${personName(physio, "A physio")} pressed the help button`,
      line: visit ? "They pressed the help button during a home visit. Call them now." : "They pressed the help button. Call them now.",
    });
    return { alertId };
  },
});

/** The location arrived after the help alert went out (phones can take a few seconds). */
export const helpLocation = mutation({
  args: { alertId: v.id("safetyAlerts"), lat: v.number(), lng: v.number(), accuracy: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const alert = await ctx.db.get(args.alertId);
    if (!alert || alert.physiotherapistId !== physio._id || alert.status === "resolved") return null;
    if (!validCoords(args.lat, args.lng)) return null;
    const now = Date.now();
    const first = alert.lat === undefined;
    await ctx.db.patch(alert._id, { lat: args.lat, lng: args.lng, accuracy: args.accuracy, locatedAt: now, updatedAt: now });
    await shareLocation(ctx, physio._id, "at_patient", args);
    if (first) {
      await updateCareTeam(ctx, alert, `Location for ${personName(physio, "the physio")}`, `Their phone shared its location: ${mapsLink(args.lat, args.lng)}`);
    }
    return null;
  },
});

/**
 * "I'm safe": the physio answers "Are you OK?", or says a help alert is over. An overdue alert
 * closes; a help alert stays open until someone on the care team has spoken to them.
 */
export const imSafe = mutation({
  args: { visitId: v.optional(v.id("homeVisitSafety")), alertId: v.optional(v.id("safetyAlerts")), then: v.optional(v.union(v.literal("left"), v.literal("more_time"))) },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const now = Date.now();
    if (args.alertId) {
      const alert = await ctx.db.get(args.alertId);
      if (alert && alert.physiotherapistId === physio._id && alert.status !== "resolved" && !alert.physioSafeAt) {
        await ctx.db.patch(alert._id, { physioSafeAt: now, updatedAt: now });
        await updateCareTeam(ctx, alert, `${personName(physio, "The physio")} says they're safe`, "They pressed \"I'm safe\" in the app. Call them to confirm before you close the alert.");
      }
    }
    if (args.visitId) {
      const visit = await ctx.db.get(args.visitId);
      if (!visit || visit.physiotherapistId !== physio._id || visit.stage === "left") return null;
      if (args.then === "left") {
        await closeVisit(ctx, visit, "physio");
        await shareLocation(ctx, physio._id, "idle", {});
      } else {
        const extensions = visit.extensions ?? 0;
        await ctx.db.patch(visit._id, {
          check: "ok",
          checkSentAt: undefined,
          expectedEndAt: Math.max(visit.expectedEndAt, now) + EXTEND_MS,
          extensions: Math.min(MAX_EXTENSIONS, extensions + 1),
          updatedAt: now,
        });
        await settleOverdueAlerts(ctx, visit, "The physio answered \"Are you OK?\" in the app.");
      }
    }
    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Patient: who is at the door
// ─────────────────────────────────────────────────────────────────────────────

/** The "who's at your door" page: no sign-in, just the visit's unguessable link. */
export const visitByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!/^[A-Za-z0-9]{20,40}$/.test(args.token)) return null;
    const visit = await ctx.db
      .query("homeVisitSafety")
      .withIndex("by_token", (q) => q.eq("publicToken", args.token))
      .first();
    if (!visit) return null;
    const closedAt = visit.leftAt ?? null;
    if (closedAt !== null && Date.now() - closedAt > PAGE_LIVE_AFTER_MS) return { expired: true as const };
    const view = await identityView(ctx, visit);
    // Once the visit is over the code is no use to anyone
    return { expired: false as const, ...view, doorCode: visit.stage === "left" ? null : view.doorCode };
  },
});

/** The signed-in patient's visit that's on its way or under way (dashboard card), or null. */
export const myIncomingVisit = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return null;
    for (const stage of ["on_the_way", "arrived"] as const) {
      const visit = await ctx.db
        .query("homeVisitSafety")
        .withIndex("by_patient_and_stage", (q) => q.eq("patientId", user._id).eq("stage", stage))
        .order("desc")
        .first();
      if (visit) return { token: visit.publicToken, ...(await identityView(ctx, visit)) };
    }
    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Care team (admin)
// ─────────────────────────────────────────────────────────────────────────────

async function alertRow(ctx: QueryCtx, alert: Alert) {
  const details = await alertDetails(ctx, alert);
  const handler = alert.handledBy ? await ctx.db.get(alert.handledBy) : null;
  const resolver = alert.resolvedBy ? await ctx.db.get(alert.resolvedBy) : null;
  const visit = alert.visitId ? await ctx.db.get(alert.visitId) : null;
  return {
    _id: alert._id,
    kind: alert.kind,
    status: alert.status,
    createdAt: alert.createdAt,
    physioName: details ? personName(details.physio, "Physio") : "Physio",
    physioPhone: details?.physioPhone ?? null,
    physioImage: details?.physio.imageUrl ?? null,
    staffNumber: details?.staffNumber ?? null,
    patientName: details?.patient ? personName(details.patient, "Patient") : null,
    patientPhone: details?.patientPhone ?? null,
    address: details?.address ?? null,
    location: alert.lat !== undefined && alert.lng !== undefined ? { lat: alert.lat, lng: alert.lng, accuracy: alert.accuracy ?? null, at: alert.locatedAt ?? null } : null,
    lastPing: visit?.lastLat !== undefined && visit?.lastLng !== undefined ? { lat: visit.lastLat, lng: visit.lastLng, at: visit.lastPingAt ?? null } : null,
    physioSafeAt: alert.physioSafeAt ?? null,
    handledBy: handler ? personName(handler, "An admin") : null,
    handledAt: alert.handledAt ?? null,
    resolvedBy: resolver ? personName(resolver, "An admin") : null,
    resolvedAt: alert.resolvedAt ?? null,
    resolution: alert.resolution ?? null,
    falseAlarm: alert.falseAlarm ?? false,
  };
}

/** Visit safety page: open alerts, visits under way, and recent closed alerts. */
export const adminBoard = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "homeVisitSafety:adminBoard");
    const now = Date.now();
    const [open, handling] = await Promise.all([
      ctx.db.query("safetyAlerts").withIndex("by_status", (q) => q.eq("status", "open")).order("desc").take(50),
      ctx.db.query("safetyAlerts").withIndex("by_status", (q) => q.eq("status", "handling")).order("desc").take(50),
    ]);
    const resolved = await ctx.db.query("safetyAlerts").withIndex("by_status", (q) => q.eq("status", "resolved")).order("desc").take(20);

    const live: Visit[] = [];
    for (const stage of ["on_the_way", "arrived"] as const) {
      live.push(...(await ctx.db.query("homeVisitSafety").withIndex("by_stage_and_expected_end", (q) => q.eq("stage", stage)).take(200)));
    }
    const visits = await Promise.all(
      live
        .sort((a, b) => a.expectedEndAt - b.expectedEndAt)
        .map(async (visit) => {
          const physio = await ctx.db.get(visit.physiotherapistId);
          const patient = await ctx.db.get(visit.patientId);
          const appointment = await ctx.db.get(visit.appointmentId);
          return {
            _id: visit._id,
            stage: visit.stage,
            physioName: personName(physio, "Physio"),
            physioPhone: normalizePhone(physio?.phoneNumber),
            patientName: personName(patient, "Patient"),
            address: appointment?.location ?? null,
            onTheWayAt: visit.onTheWayAt,
            arrivedAt: visit.arrivedAt ?? null,
            expectedEndAt: visit.expectedEndAt,
            doorCheck: visit.doorCheck ?? null,
            doorSkipReason: visit.doorSkipReason ?? null,
            check: visit.check,
            overdue: now > visit.expectedEndAt,
            lastPing: visit.lastLat !== undefined && visit.lastLng !== undefined ? { lat: visit.lastLat, lng: visit.lastLng, at: visit.lastPingAt ?? null } : null,
          };
        })
    );
    return {
      alerts: await Promise.all([...open, ...handling].sort((a, b) => b.createdAt - a.createdAt).map((a) => alertRow(ctx, a))),
      visits,
      recent: await Promise.all(resolved.map((a) => alertRow(ctx, a))),
    };
  },
});

/** Open alerts, for the red banner across the admin console. */
export const adminOpenAlerts = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user || user.role !== "admin") return null;
    const open = await ctx.db.query("safetyAlerts").withIndex("by_status", (q) => q.eq("status", "open")).order("desc").take(10);
    if (open.length === 0) return { count: 0, newest: null };
    const physio = await ctx.db.get(open[0].physiotherapistId);
    return { count: open.length, newest: { kind: open[0].kind, physioName: personName(physio, "A physio"), createdAt: open[0].createdAt } };
  },
});

/** "I'm on it": the rest of the team sees who is handling it. */
export const handleAlert = mutation({
  args: { alertId: v.id("safetyAlerts") },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "homeVisitSafety:handleAlert");
    const alert = await ctx.db.get(args.alertId);
    if (!alert || alert.status !== "open") return null;
    const now = Date.now();
    await ctx.db.patch(alert._id, { status: "handling", handledBy: user._id, handledAt: now, updatedAt: now });
    const physio = await ctx.db.get(alert.physiotherapistId);
    await updateCareTeam(ctx, alert, `${personName(user, "An admin")} is handling it`, `The alert for ${personName(physio, "the physio")} is being handled.`);
    return null;
  },
});

/** Close an alert once someone has spoken to the physio. Closes the visit too if they've gone. */
export const resolveAlert = mutation({
  args: { alertId: v.id("safetyAlerts"), note: v.string(), falseAlarm: v.boolean(), closeVisit: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "homeVisitSafety:resolveAlert");
    const alert = await ctx.db.get(args.alertId);
    if (!alert || alert.status === "resolved") return null;
    const note = args.note.trim().slice(0, 1000);
    if (note.length < 3) throw new ConvexError("Write what happened before you close it.");
    const now = Date.now();
    await ctx.db.patch(alert._id, {
      status: "resolved",
      resolvedBy: user._id,
      resolvedAt: now,
      resolution: note,
      falseAlarm: args.falseAlarm,
      handledBy: alert.handledBy ?? user._id,
      handledAt: alert.handledAt ?? now,
      updatedAt: now,
    });
    if (args.closeVisit && alert.visitId) {
      const visit = await ctx.db.get(alert.visitId);
      if (visit && visit.stage !== "left") await closeVisit(ctx, visit, "care_team");
    }
    await insertNotification(ctx, {
      userId: alert.physiotherapistId,
      type: "safety_resolved",
      priority: "high",
      status: "pending",
      payload: { title: "The care team closed your alert", body: note, link: PHYSIO_HOME },
      createdAt: now,
    });
    return null;
  },
});

/** The care team closes a visit the physio forgot to close (after speaking to them). */
export const adminCloseVisit = mutation({
  args: { visitId: v.id("homeVisitSafety") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, "homeVisitSafety:adminCloseVisit");
    const visit = await ctx.db.get(args.visitId);
    if (!visit || visit.stage === "left") return null;
    await closeVisit(ctx, visit, "care_team");
    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Crons
// ─────────────────────────────────────────────────────────────────────────────

/** Every 2 minutes: "Are you OK?" for visits running over, then the care team if there's no answer. */
export const runSafetyChecks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    for (const stage of ["on_the_way", "arrived"] as const) {
      const due = await ctx.db
        .query("homeVisitSafety")
        .withIndex("by_stage_and_expected_end", (q) => q.eq("stage", stage).lt("expectedEndAt", now - CHECK_AFTER_MS))
        .take(100);
      for (const visit of due) {
        if (now - visit.expectedEndAt > AUTO_CLOSE_AFTER_MS) {
          await closeVisit(ctx, visit, "auto");
          continue;
        }
        if (visit.check === "ok") {
          await sendPhysioCheck(ctx, visit);
        } else if (visit.check === "check_sent" && visit.checkSentAt && now - visit.checkSentAt >= ESCALATE_AFTER_MS) {
          await escalate(ctx, visit);
        }
      }
    }
  },
});

async function sendPhysioCheck(ctx: MutationCtx, visit: Visit) {
  const now = Date.now();
  const physio = await ctx.db.get(visit.physiotherapistId);
  const patient = await ctx.db.get(visit.patientId);
  await ctx.db.patch(visit._id, { check: "check_sent", checkSentAt: now, updatedAt: now });
  if (!physio) return;
  const who = patient?.firstName?.trim() || "your patient";
  const body = `Your visit with ${who} was due to end at ${lagosTime(visit.expectedEndAt, await practiceZoneForPhysio(ctx, visit.physiotherapistId))}. Tap to tell us you're safe. If we don't hear from you in 10 minutes, the care team will call you.`;
  await insertNotification(ctx, {
    userId: physio._id,
    type: "safety_check",
    priority: "urgent",
    status: "pending",
    payload: { title: "Are you OK?", body, link: `${PHYSIO_HOME}?safety=1`, data: { entityType: "home_visit", entityId: visit._id, actionUrl: `${PHYSIO_HOME}?safety=1` } },
    createdAt: now,
  });
  const phone = normalizePhone(physio.phoneNumber);
  if (phone) {
    await queueSafetyWhatsApp(
      ctx,
      `safety-check-${visit._id}-${now}`,
      [phone],
      `Rehabify: are you OK? ${body.replace("Tap to", "Open the app to")}\n\n${appLink(`${PHYSIO_HOME}?safety=1`)}`
    );
  }
}

async function escalate(ctx: MutationCtx, visit: Visit) {
  const now = Date.now();
  await ctx.db.patch(visit._id, { check: "escalated", updatedAt: now });
  const alertId = await ctx.db.insert("safetyAlerts", {
    kind: "overdue",
    status: "open",
    physiotherapistId: visit.physiotherapistId,
    visitId: visit._id,
    appointmentId: visit.appointmentId,
    patientId: visit.patientId,
    ...(visit.lastLat !== undefined && visit.lastLng !== undefined ? { lat: visit.lastLat, lng: visit.lastLng, accuracy: visit.lastAccuracy, locatedAt: visit.lastPingAt } : {}),
    createdAt: now,
    updatedAt: now,
  });
  const physio = await ctx.db.get(visit.physiotherapistId);
  const alert = (await ctx.db.get(alertId))!;
  await alertCareTeam(ctx, alert, {
    title: `No answer from ${personName(physio, "a physio")} after a home visit`,
    line: `The visit was due to end at ${lagosTime(visit.expectedEndAt)}. They didn't answer "Are you OK?" for 10 minutes. Call them now.`,
  });
}

/** Daily: clears positions from visits closed more than 30 days ago (a 2-day window, so none are missed). */
export const purgeOldPositions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("homeVisitSafety")
      .withIndex("by_stage_and_expected_end", (q) =>
        q.eq("stage", "left").gt("expectedEndAt", now - KEEP_POSITIONS_MS - 2 * DAY).lt("expectedEndAt", now - KEEP_POSITIONS_MS)
      )
      .take(500);
    for (const row of rows) {
      if (row.lastLat === undefined && row.arrivedLat === undefined && row.leftLat === undefined) continue;
      await ctx.db.patch(row._id, {
        lastLat: undefined,
        lastLng: undefined,
        lastAccuracy: undefined,
        arrivedLat: undefined,
        arrivedLng: undefined,
        leftLat: undefined,
        leftLng: undefined,
      });
    }
  },
});

/** SMS to the care team for alerts, through Twilio when it's set up (plain REST: no Node runtime). */
export const sendSafetySms = internalAction({
  args: { to: v.array(v.string()), text: v.string() },
  handler: async (_ctx, args) => {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const service = process.env.TWILIO_MESSAGING_SERVICE_SID;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !token || (!service && !from)) return null;
    const auth = btoa(`${sid}:${token}`);
    for (const to of args.to.slice(0, 10)) {
      const body = new URLSearchParams({ To: to, Body: args.text.slice(0, 640) });
      if (service) body.set("MessagingServiceSid", service);
      else if (from) body.set("From", from);
      try {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
          method: "POST",
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        if (!res.ok) console.error("safety sms: Twilio refused", res.status);
      } catch {
        console.error("safety sms: could not reach Twilio");
      }
    }
    return null;
  },
});
