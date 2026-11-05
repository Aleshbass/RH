/**
 * Joy → clinician handoff. Patients who book through Joy on WhatsApp arrive with an intake
 * (what Joy learned) and a journey (how far they got). This module stores both, links the
 * patient to the physio who takes the booking, and serves them to:
 *   - the physio, on the patient's page (getJoyHandoffForPhysio)
 *   - the patient, on their dashboard (getMyJoyJourney) and short link (getJoyBookingStatus)
 * Writes from Joy arrive through the signed gateway (joyGateway.ts → upsertJoyIntake,
 * recordJoyJourneyEventFromJoy). Rehabify records its own stages with logJourney().
 */
import { raiseCareSignal } from "./helpers/careSignals";
import { v } from "convex/values";
import { internalMutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { currentUser, findRelationship, physioOrNull } from "./helpers/careAccess";
import { tagPaidRehabifyRelationship } from "./helpers/rehabifySources";

type Ctx = QueryCtx | MutationCtx;
export type JourneyStage = Doc<"joyJourneyEvents">["stage"];

const BOOKING_CODE_LENGTH = 8;

/** Stages Joy may report. Payment, physio response, scheduling and calls are Rehabify's own record. */
const JOY_REPORTED_STAGES = new Set<JourneyStage>([
  "conversation_started",
  "referral_linked",
  "triage_completed",
  "eligibility_passed",
  "eligibility_blocked",
  "matches_shown",
  "payment_link_sent",
  "reminder_sent",
  "hold_expired",
  "abandoned",
  "cancelled",
  "handed_to_human",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Writing the journey and the care link (used by joyIntegration.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** Records one journey stage. Safe to call twice with the same eventKey. */
export async function logJourney(
  ctx: MutationCtx,
  event: {
    patientId: Id<"users">;
    bookingId?: Id<"marketplaceBookings">;
    stage: JourneyStage;
    eventKey: string;
    source?: "joy" | "rehabify";
    occurredAt?: number;
    note?: string;
  }
) {
  const existing = await ctx.db
    .query("joyJourneyEvents")
    .withIndex("by_event_key", (q) => q.eq("eventKey", event.eventKey))
    .first();
  if (existing) return existing._id;
  const id = await ctx.db.insert("joyJourneyEvents", {
    patientId: event.patientId,
    bookingId: event.bookingId,
    stage: event.stage,
    source: event.source ?? "rehabify",
    occurredAt: event.occurredAt ?? Date.now(),
    note: event.note?.slice(0, 200),
    eventKey: event.eventKey,
  });
  // Patients looking for a physio on Joy: the team can step in and help match (careQueue.ts)
  const lookingDetail: Partial<Record<string, string>> = {
    triage_completed: "finished triage with Joy and is looking for a physio",
    matches_shown: "was shown physios by Joy and hasn't booked yet",
    eligibility_blocked: "couldn't be matched with a physio on Joy",
  };
  const detail = lookingDetail[event.stage];
  if (detail) {
    await raiseCareSignal(ctx, { kind: "joy_matching", patientId: event.patientId, bookingId: event.bookingId, detail });
  }
  return id;
}

/** For actions (meeting links, call joins) that can't write to the database directly. */
export const recordJourneyEvent = internalMutation({
  args: {
    patientId: v.id("users"),
    bookingId: v.optional(v.id("marketplaceBookings")),
    stage: v.string(),
    eventKey: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logJourney(ctx, { ...args, stage: args.stage as JourneyStage });
  },
});

/** The patient's latest intake, preferring the one tied to this booking. */
async function intakeFor(ctx: Ctx, patientId: Id<"users">, bookingId?: Id<"marketplaceBookings">) {
  if (bookingId) {
    const linked = await ctx.db
      .query("joyIntakes")
      .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
      .order("desc")
      .first();
    if (linked) return linked;
  }
  return await ctx.db
    .query("joyIntakes")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .order("desc")
    .first();
}

function canShareWithClinician(intake: Doc<"joyIntakes"> | null) {
  return Boolean(intake && intake.consent?.shareWithClinician !== false);
}

/**
 * Called when a physio takes a Joy booking (provider accepted, or an admin scheduled a virtual
 * consultation). Puts the patient on the physio's list (relationship, source "joy_whatsapp"),
 * opens a course of care if none is open, and leaves a one-line note on the appointment so the
 * physio's calendar shows where the patient came from.
 */
export async function ensureJoyCareLink(
  ctx: MutationCtx,
  booking: Doc<"marketplaceBookings">,
  physiotherapistId: Id<"users">,
  appointmentId?: Id<"appointments">
) {
  const now = Date.now();
  const intake = await intakeFor(ctx, booking.patientId, booking._id);
  const shareable = canShareWithClinician(intake);

  const existing = await findRelationship(ctx, physiotherapistId, booking.patientId);
  let relationshipId: Id<"patientPhysiotherapistRelationships">;
  if (existing) {
    relationshipId = existing._id;
    if (existing.status !== "active") await ctx.db.patch(existing._id, { status: "active", endDate: undefined });
    await tagPaidRehabifyRelationship(ctx, existing, "joy_whatsapp");
  } else {
    const primary = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_primary_physiotherapist", (q) => q.eq("patientId", booking.patientId).eq("isPrimaryPhysiotherapist", true))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    relationshipId = await ctx.db.insert("patientPhysiotherapistRelationships", {
      patientId: booking.patientId,
      physiotherapistId,
      status: "active",
      isPrimaryPhysiotherapist: !primary,
      startDate: now,
      notes: "Booked through Joy on WhatsApp",
      source: "joy_whatsapp",
    });
  }
  await ctx.db.patch(booking._id, { patientPhysioRelationshipId: relationshipId, relationshipCreated: !existing, updatedAt: now });

  const openEpisode = await ctx.db
    .query("careEpisodes")
    .withIndex("by_patient_and_physiotherapist", (q) => q.eq("patientId", booking.patientId).eq("physiotherapistId", physiotherapistId))
    .filter((q) => q.eq(q.field("status"), "active"))
    .first();
  if (!openEpisode) {
    await ctx.db.insert("careEpisodes", {
      patientId: booking.patientId,
      physiotherapistId,
      status: "active",
      source: "joy_whatsapp",
      condition: shareable ? intake?.chiefComplaint?.slice(0, 200) : undefined,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (appointmentId) {
    const summary = shareable ? intake?.clinicianSummary || intake?.chiefComplaint : undefined;
    await ctx.db.patch(appointmentId, {
      notesForTherapist: (summary
        ? `Booked through Joy (WhatsApp). ${summary}`
        : "Booked through Joy (WhatsApp). Open the patient's page for Joy's handoff."
      ).slice(0, 1000),
    });
  }
  return relationshipId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes from Joy (signed gateway only)
// ─────────────────────────────────────────────────────────────────────────────

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function textList(value: unknown, maxItems: number, maxLength: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((item) => text(item, maxLength)).filter((item): item is string => Boolean(item));
  return items.length ? items.slice(0, maxItems) : undefined;
}

function answerList(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const question = text(row.question, 300);
      const answer = text(row.answer, 1000);
      return question && answer ? { question, answer } : null;
    })
    .filter((item): item is { question: string; answer: string } => item !== null);
  return items.length ? items.slice(0, maxItems) : undefined;
}

async function joyPatient(ctx: MutationCtx, rawPatientId: unknown) {
  const patientId = typeof rawPatientId === "string" ? ctx.db.normalizeId("users", rawPatientId) : null;
  const patient = patientId ? await ctx.db.get(patientId) : null;
  if (!patient || patient.role !== "patient") throw new Error("Patient not found");
  return patient;
}

async function joyBookingFor(ctx: MutationCtx, rawBookingId: unknown, patientId: Id<"users">) {
  if (rawBookingId === undefined || rawBookingId === null) return null;
  const bookingId = typeof rawBookingId === "string" ? ctx.db.normalizeId("marketplaceBookings", rawBookingId) : null;
  const booking = bookingId ? await ctx.db.get(bookingId) : null;
  if (!booking || booking.patientId !== patientId || booking.sourceSystem !== "joy_ai") throw new Error("Booking not found");
  return booking;
}

/** Joy's structured intake and summaries for one assessment revision. Re-sending a revision replaces it. */
export const upsertJoyIntake = internalMutation({
  args: { payload: v.any() },
  handler: async (ctx, { payload }) => {
    const data = (payload ?? {}) as Record<string, unknown>;
    const patient = await joyPatient(ctx, data.patient_id);
    const booking = await joyBookingFor(ctx, data.booking_id, patient._id);
    const conversationId = text(data.conversation_id, 200);
    const assessmentId = text(data.assessment_id, 200);
    const revision = typeof data.assessment_revision === "number" && Number.isInteger(data.assessment_revision) ? data.assessment_revision : null;
    if (!conversationId || !assessmentId || revision === null) throw new Error("conversation_id, assessment_id and assessment_revision are required");

    const triage = data.triage_level as Doc<"joyIntakes">["triageLevel"] | string | undefined;
    const pain = typeof data.pain_score === "number" && data.pain_score >= 0 && data.pain_score <= 10 ? Math.round(data.pain_score) : undefined;
    const redFlags = Array.isArray(data.red_flags)
      ? data.red_flags
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const row = item as Record<string, unknown>;
            const question = text(row.question, 300);
            const answer = text(row.answer, 300);
            return question && answer ? { question, answer, flagged: row.flagged === true } : null;
          })
          .filter((item): item is { question: string; answer: string; flagged: boolean } => item !== null)
          .slice(0, 30)
      : undefined;
    const consentRaw = data.consent && typeof data.consent === "object" ? (data.consent as Record<string, unknown>) : null;
    const consent =
      consentRaw && typeof consentRaw.share_with_clinician === "boolean"
        ? {
            shareWithClinician: consentRaw.share_with_clinician,
            policyVersion: text(consentRaw.policy_version, 100),
            acceptanceReference: text(consentRaw.acceptance_reference, 200),
            givenAt: typeof consentRaw.given_at === "number" ? consentRaw.given_at : Date.now(),
          }
        : undefined;

    const now = Date.now();
    const fields = {
      patientId: patient._id,
      bookingId: booking?._id,
      conversationId,
      assessmentId,
      assessmentRevision: revision,
      protocolVersion: text(data.protocol_version, 50),
      triageLevel: (triage === "green" || triage === "amber" || triage === "red" ? triage : undefined) as Doc<"joyIntakes">["triageLevel"],
      chiefComplaint: text(data.chief_complaint, 500),
      bodyAreas: textList(data.body_areas, 10, 60),
      painScore: pain,
      onset: text(data.onset, 300),
      duration: text(data.duration, 100),
      redFlags: redFlags?.length ? redFlags : undefined,
      aggravatingFactors: textList(data.aggravating_factors, 15, 200),
      easingFactors: textList(data.easing_factors, 15, 200),
      goals: text(data.goals, 1000),
      medicalHistory: text(data.medical_history, 2000),
      medications: text(data.medications, 1000),
      answers: answerList(data.answers, 60),
      clinicianSummary: text(data.clinician_summary, 4000),
      patientSummary: text(data.patient_summary, 2000),
      language: text(data.language, 30),
      preferredTimes: text(data.preferred_times, 300),
      consent,
      updatedAt: now,
    };

    const existing = await ctx.db
      .query("joyIntakes")
      .withIndex("by_assessment", (q) => q.eq("assessmentId", assessmentId).eq("assessmentRevision", revision))
      .filter((q) => q.eq(q.field("patientId"), patient._id))
      .first();
    let intakeId: Id<"joyIntakes">;
    if (existing) {
      await ctx.db.replace(existing._id, { ...fields, bookingId: fields.bookingId ?? existing.bookingId, receivedAt: existing.receivedAt });
      intakeId = existing._id;
    } else {
      intakeId = await ctx.db.insert("joyIntakes", { ...fields, receivedAt: now });
    }
    await logJourney(ctx, {
      patientId: patient._id,
      bookingId: booking?._id,
      stage: "triage_completed",
      source: "joy",
      eventKey: `joy-intake-${assessmentId}-${revision}`,
    });
    return { intake_id: intakeId, updated: Boolean(existing) };
  },
});

/** A stage Joy reached on WhatsApp (conversation started, matches shown, abandoned, ...). */
export const recordJoyJourneyEventFromJoy = internalMutation({
  args: { payload: v.any() },
  handler: async (ctx, { payload }) => {
    const data = (payload ?? {}) as Record<string, unknown>;
    const patient = await joyPatient(ctx, data.patient_id);
    const booking = await joyBookingFor(ctx, data.booking_id, patient._id);
    const stage = data.stage as JourneyStage;
    if (!JOY_REPORTED_STAGES.has(stage)) throw new Error("Unsupported stage");
    const eventId = text(data.event_id, 200);
    if (!eventId) throw new Error("event_id is required");
    const occurredAt =
      typeof data.occurred_at === "number" && data.occurred_at > 0 && data.occurred_at <= Date.now() + 5 * 60_000
        ? data.occurred_at
        : Date.now();
    const id = await logJourney(ctx, {
      patientId: patient._id,
      bookingId: booking?._id,
      stage,
      source: "joy",
      occurredAt,
      note: text(data.note, 200),
      eventKey: `joy-${eventId}`,
    });
    return { event_id: eventId, journey_event_id: id };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Reading it back
// ─────────────────────────────────────────────────────────────────────────────

type BookingState =
  | "awaiting_payment"
  | "payment_failed"
  | "expired"
  | "awaiting_physio"
  | "finding_new_physio"
  | "awaiting_schedule"
  | "confirmed"
  | "completed"
  | "missed"
  | "cancelled";

/** One plain state for a Joy booking, from its payment, provider and appointment fields. */
function bookingState(booking: Doc<"marketplaceBookings">, appointment: Doc<"appointments"> | null, now: number): BookingState {
  if (booking.bookingStatus === "cancelled") return "cancelled";
  if (appointment?.status === "cancelled_by_patient" || appointment?.status === "cancelled_by_therapist") return "cancelled";
  if (booking.bookingStatus === "completed" || appointment?.status === "completed") return "completed";
  if (booking.bookingStatus === "no_show" || appointment?.status === "no_show") return "missed";
  if (booking.bookingStatus === "pending_payment") {
    if (booking.paymentStatus === "failed") return "payment_failed";
    if ((booking.holdExpiresAt ?? Infinity) < now) return "expired";
    return "awaiting_payment";
  }
  if (booking.bookingStatus === "awaiting_admin_schedule") return "awaiting_schedule";
  if (booking.replacementStatus === "awaiting_patient_slot" || booking.replacementStatus === "admin_follow_up") return "finding_new_physio";
  if (appointment) return "confirmed";
  if (booking.paymentStatus === "completed" && booking.providerResponse === "pending") return "awaiting_physio";
  return booking.bookingStatus === "confirmed" ? "confirmed" : "awaiting_physio";
}

function serviceMode(booking: Doc<"marketplaceBookings">) {
  return booking.joyServiceMode ?? (booking.isOnline ? "online" : "clinic");
}

function personName(user: Doc<"users"> | null) {
  return user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || undefined : undefined;
}

async function joyBookingsFor(ctx: Ctx, patientId: Id<"users">) {
  const rows = await ctx.db.query("marketplaceBookings").withIndex("by_patient", (q) => q.eq("patientId", patientId)).collect();
  return rows.filter((b) => b.sourceSystem === "joy_ai").sort((a, b) => b.createdAt - a.createdAt);
}

async function timelineFor(ctx: Ctx, patientId: Id<"users">, limit: number) {
  const rows = await ctx.db
    .query("joyJourneyEvents")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .order("desc")
    .take(limit);
  return rows.map((e) => ({ _id: e._id, stage: e.stage, source: e.source, occurredAt: e.occurredAt, note: e.note, bookingId: e.bookingId }));
}

/**
 * The Joy handoff on a patient's page, for a physio the patient is linked to. Returns null when
 * the patient never came through Joy. The intake content is withheld if the patient declined
 * sharing it with a clinician.
 */
export const getJoyHandoffForPhysio = query({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    const physio = await physioOrNull(ctx);
    if (!physio) return null;
    if (!(await findRelationship(ctx, physio._id, args.patientId))) return null;

    const now = Date.now();
    const bookings = await joyBookingsFor(ctx, args.patientId);
    const intake = await intakeFor(ctx, args.patientId, bookings.find((b) => b.physiotherapistId === physio._id)?._id);
    if (bookings.length === 0 && !intake) return null;

    const mine = bookings.filter((b) => b.physiotherapistId === physio._id);
    const bookingRows = await Promise.all(
      mine.map(async (b) => {
        const appointment = b.appointmentId ? await ctx.db.get(b.appointmentId) : null;
        return {
          _id: b._id,
          state: bookingState(b, appointment, now),
          mode: serviceMode(b),
          sessionType: b.joyConsultationType ?? b.sessionType,
          startTime: appointment?.startTime ?? b.sessionDate ?? null,
          durationMinutes: b.sessionDuration,
          address: b.patientAddress ?? null,
          bookingCode: b.bookingCode ?? null,
          paidAt: b.paidAt ?? null,
          providerResponseDueAt: b.providerResponse === "pending" ? b.providerResponseDueAt ?? null : null,
          createdAt: b.createdAt,
        };
      })
    );

    // Journey stages for this physio's bookings plus conversation-level ones (no booking)
    const myBookingIds = new Set(mine.map((b) => b._id));
    const timeline = (await timelineFor(ctx, args.patientId, 60)).filter((e) => !e.bookingId || myBookingIds.has(e.bookingId));

    const shareable = canShareWithClinician(intake);
    return {
      bookings: bookingRows,
      currentStage: timeline[0]?.stage ?? null,
      timeline: timeline.slice(0, 25),
      intake: intake
        ? shareable
          ? {
              withheld: false as const,
              receivedAt: intake.receivedAt,
              triageLevel: intake.triageLevel ?? null,
              chiefComplaint: intake.chiefComplaint ?? null,
              bodyAreas: intake.bodyAreas ?? [],
              painScore: intake.painScore ?? null,
              onset: intake.onset ?? null,
              duration: intake.duration ?? null,
              redFlags: intake.redFlags ?? [],
              aggravatingFactors: intake.aggravatingFactors ?? [],
              easingFactors: intake.easingFactors ?? [],
              goals: intake.goals ?? null,
              medicalHistory: intake.medicalHistory ?? null,
              medications: intake.medications ?? null,
              answers: intake.answers ?? [],
              clinicianSummary: intake.clinicianSummary ?? null,
              language: intake.language ?? null,
              preferredTimes: intake.preferredTimes ?? null,
              consent: intake.consent ?? null,
            }
          : { withheld: true as const, receivedAt: intake.receivedAt }
        : null,
    };
  },
});

/** The signed-in patient's Joy bookings, what they told Joy, and where things stand. */
export const getMyJoyJourney = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user || user.role !== "patient") return null;
    const now = Date.now();
    const bookings = await joyBookingsFor(ctx, user._id);
    const intake = await intakeFor(ctx, user._id, bookings[0]?._id);
    if (bookings.length === 0 && !intake) return null;

    const rows = await Promise.all(
      bookings.slice(0, 10).map(async (b) => {
        const [appointment, physio] = await Promise.all([
          b.appointmentId ? ctx.db.get(b.appointmentId) : null,
          b.physiotherapistId ? ctx.db.get(b.physiotherapistId) : null,
        ]);
        return {
          _id: b._id,
          state: bookingState(b, appointment, now),
          mode: serviceMode(b),
          startTime: appointment?.startTime ?? b.sessionDate ?? null,
          durationMinutes: b.sessionDuration,
          physioName: personName(physio) ?? null,
          bookingCode: b.bookingCode ?? null,
          amountKobo: b.totalAmount,
          createdAt: b.createdAt,
        };
      })
    );
    const timeline = await timelineFor(ctx, user._id, 15);
    return {
      bookings: rows,
      currentStage: timeline[0]?.stage ?? null,
      timeline,
      intake: intake
        ? {
            receivedAt: intake.receivedAt,
            summary: intake.patientSummary ?? null,
            chiefComplaint: intake.chiefComplaint ?? null,
            bodyAreas: intake.bodyAreas ?? [],
            painScore: intake.painScore ?? null,
            goals: intake.goals ?? null,
            sharedWithClinician: canShareWithClinician(intake),
          }
        : null,
    };
  },
});

/**
 * What the patient's short link (/v/<code>) shows when there is no call to join yet, or the
 * visit is not online. The code is the credential, so this returns booking status only:
 * no clinical content, no contact details.
 */
export const getJoyBookingStatus = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
    if (code.length !== BOOKING_CODE_LENGTH) return null;
    const booking = await ctx.db.query("marketplaceBookings").withIndex("by_booking_code", (q) => q.eq("bookingCode", code)).first();
    if (!booking || booking.sourceSystem !== "joy_ai") return null;
    const [appointment, physio] = await Promise.all([
      booking.appointmentId ? ctx.db.get(booking.appointmentId) : null,
      booking.physiotherapistId ? ctx.db.get(booking.physiotherapistId) : null,
    ]);
    return {
      bookingCode: code,
      state: bookingState(booking, appointment, Date.now()),
      mode: serviceMode(booking),
      startTime: appointment?.startTime ?? booking.sessionDate ?? null,
      durationMinutes: booking.sessionDuration,
      clinicianName: personName(physio) ?? null,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// One-off repair
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Links patients from Joy bookings taken before the handoff existed to their physio.
 * Run once after deploying, for both statuses, repeating with the returned cursor until isDone:
 *   npx convex run joyHandoff:backfillJoyCareLinks '{"status":"confirmed"}' --prod
 *   npx convex run joyHandoff:backfillJoyCareLinks '{"status":"completed"}' --prod
 */
export const backfillJoyCareLinks = internalMutation({
  args: {
    status: v.union(v.literal("confirmed"), v.literal("completed")),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("marketplaceBookings")
      .withIndex("by_booking_status", (q) => q.eq("bookingStatus", args.status))
      .paginate({ cursor: args.cursor ?? null, numItems: 100 });
    let linked = 0;
    for (const booking of page.page) {
      if (booking.sourceSystem !== "joy_ai" || !booking.physiotherapistId || !booking.appointmentId) continue;
      if (booking.patientPhysioRelationshipId) continue;
      await ensureJoyCareLink(ctx, booking, booking.physiotherapistId);
      linked += 1;
    }
    return { linked, isDone: page.isDone, cursor: page.continueCursor };
  },
});
