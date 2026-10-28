/**
 * Alerts that reach physiotherapists' and clinics' phones (and their bell): every one is a
 * notification written through insertNotification, so categories, quiet hours and the icon badge
 * apply (helpers/pushCategories.ts). Urgent ones still get through quiet hours.
 *
 *   booking_accept_expiring   10 minutes left to accept a website booking (scheduled per request)
 *   session_starting          an online session starts in 10 minutes (cron, every 5 minutes)
 *   patient_waiting_in_call   the patient has joined the video call (videoCalls / stream.ts)
 *   refund_issued             a patient was refunded (helpers/paymentRefunds.ts)
 *   agreement_to_sign         an agreement needs signing (agreements.ts)
 *   referral_assigned         Rehabify routed a referral to the clinic (adminReferrals.ts)
 *   licence_expiring          licence expires within 30 days, or has expired (daily cron)
 *   patient_inactive          a patient hasn't logged exercises for 7+ days (daily cron)
 *
 * Duplicates are prevented by looking for an earlier notification with the same `entityId`.
 */
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { insertNotification } from "./helpers/pushNotify";
import { isOpenAppointment } from "./helpers/appointmentStatus";
import { lagosDate, lagosDateTime, lagosTime, zonedDateKey } from "./helpers/lagosTime";
import { canUseArea, resolveClinicMember } from "./clinicTools";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function fullName(user: Pick<Doc<"users">, "firstName" | "lastName"> | null | undefined, fallback: string) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ") || fallback;
}

/** True if this person already has a notification of `type` about `entityId`. */
async function alreadySent(ctx: MutationCtx, userId: Id<"users">, type: string, entityId: string) {
  const recent = await ctx.db
    .query("notifications")
    .withIndex("by_user_and_type", (q) => q.eq("userId", userId).eq("type", type))
    .order("desc")
    .take(50);
  return recent.some((n) => (n.payload?.data as { entityId?: unknown } | undefined)?.entityId === entityId);
}

async function send(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    type: string;
    priority?: "urgent" | "high" | "medium" | "low";
    title: string;
    body: string;
    link: string;
    entityId: string;
    entityType?: string;
    pushTag?: string;
  }
) {
  await insertNotification(ctx, {
    userId: args.userId,
    type: args.type,
    priority: args.priority ?? "medium",
    status: "pending",
    payload: {
      title: args.title,
      body: args.body,
      data: {
        actionUrl: args.link,
        entityId: args.entityId,
        entityType: args.entityType,
        pushTag: args.pushTag,
      },
    },
    createdAt: Date.now(),
  });
}

/** The app path of an appointment's video call, from its meeting link. */
function callPath(apt: Doc<"appointments">): string {
  const link = apt.meetingLink;
  if (link) {
    try {
      const path = link.startsWith("/") ? link : new URL(link).pathname;
      if (path.startsWith("/video-call/")) return path;
    } catch {
      // Not a link we can open in the app
    }
  }
  return "/dashboard/physiotherapist/appointments";
}

// ── 10 minutes left to accept a booking ────────────────────────────────────────────────────────

const remindAcceptRef = makeFunctionReference<
  "mutation",
  { bookingId: Id<"marketplaceBookings">; physiotherapistId: Id<"users">; dueAt: number },
  null
>("pushAlerts:remindAcceptBooking");

/** Called whenever a physio is asked to accept a booking (marketplace/booking.ts askPhysioToRespond). */
export async function scheduleAcceptReminder(
  ctx: Pick<MutationCtx, "scheduler">,
  booking: Pick<Doc<"marketplaceBookings">, "_id" | "physiotherapistId">,
  dueAt: number
) {
  // The shortest window is 10 minutes: the request itself already says how long they have
  if (!booking.physiotherapistId || dueAt - Date.now() < 15 * MINUTE) return;
  await ctx.scheduler.runAt(dueAt - 10 * MINUTE, remindAcceptRef, {
    bookingId: booking._id,
    physiotherapistId: booking.physiotherapistId,
    dueAt,
  });
}

export const remindAcceptBooking = internalMutation({
  args: { bookingId: v.id("marketplaceBookings"), physiotherapistId: v.id("users"), dueAt: v.number() },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    // Still waiting on this physio, for this deadline (not accepted, declined, refunded or reassigned)
    if (
      !booking ||
      booking.bookingStatus !== "awaiting_physio" ||
      booking.providerResponse !== "pending" ||
      booking.physiotherapistId !== args.physiotherapistId ||
      booking.providerResponseDueAt !== args.dueAt ||
      args.dueAt <= Date.now()
    ) {
      return null;
    }
    const patient = await ctx.db.get(booking.patientId);
    const name = booking.guestName || fullName(patient, "A patient");
    await send(ctx, {
      userId: args.physiotherapistId,
      type: "booking_accept_expiring",
      priority: "urgent",
      title: "10 minutes left to accept a booking",
      body: `${name}'s booking${booking.sessionDate ? ` for ${lagosDateTime(booking.sessionDate)}` : ""} goes to another physiotherapist at ${lagosTime(args.dueAt)} unless you accept it.`,
      link: "/dashboard/physiotherapist/appointments",
      entityType: "marketplace_booking",
      entityId: `accept:${booking._id}:${args.dueAt}`,
      pushTag: `accept-${booking._id}`,
    });
    return null;
  },
});

// ── Online session starts in 10 minutes ────────────────────────────────────────────────────────

export const sessionStartingSoon = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // Runs every 5 minutes, so each session is seen twice; alreadySent keeps it to one alert
    const soon = await ctx.db
      .query("appointments")
      .withIndex("by_start_time", (q) => q.gte("startTime", now + 5 * MINUTE).lt("startTime", now + 15 * MINUTE))
      .take(300);
    for (const apt of soon) {
      if (!isOpenAppointment(apt.status) || apt.isRecordOnly) continue;
      if (!(apt.isOnline || apt.appointmentType === "telehealth")) continue;
      const entityId = `starting:${apt._id}`;
      if (await alreadySent(ctx, apt.physiotherapistId, "session_starting", entityId)) continue;
      const patient = await ctx.db.get(apt.patientId);
      await send(ctx, {
        userId: apt.physiotherapistId,
        type: "session_starting",
        priority: "urgent",
        title: "Session starts in 10 minutes",
        body: `${fullName(patient, "Your patient")} at ${lagosTime(apt.startTime)}, by video call. Tap to open the call.`,
        link: callPath(apt),
        entityType: "appointment",
        entityId,
        pushTag: `starting-${apt._id}`,
      });
    }
    return null;
  },
});

// ── Patient is waiting in the video call ───────────────────────────────────────────────────────

/** Once per session, from 15 minutes before the start until an hour after it. */
async function notifyPatientWaiting(
  ctx: MutationCtx,
  args: { physioId: Id<"users">; key: string; patientName: string; startTime?: number; link: string }
) {
  const now = Date.now();
  if (args.startTime !== undefined && (now < args.startTime - 15 * MINUTE || now > args.startTime + 60 * MINUTE)) return;
  const entityId = `waiting:${args.key}`;
  if (await alreadySent(ctx, args.physioId, "patient_waiting_in_call", entityId)) return;
  await send(ctx, {
    userId: args.physioId,
    type: "patient_waiting_in_call",
    priority: "urgent",
    title: `${args.patientName} is waiting in the video call`,
    body: args.startTime ? `Your ${lagosTime(args.startTime)} session. Tap to join.` : "Tap to join.",
    link: args.link,
    entityType: "appointment",
    entityId,
    pushTag: `waiting-${args.key}`,
  });
}

/** A signed-in patient joined (videoCalls.joinVideoCall): tell the physio unless they're in already. */
export async function patientJoinedCall(ctx: MutationCtx, call: Doc<"videoCalls">, user: Doc<"users">) {
  if (!call.appointmentId) return;
  const apt = await ctx.db.get(call.appointmentId);
  if (!apt || apt.patientId !== user._id || apt.physiotherapistId === user._id) return;
  const participants = await ctx.db
    .query("videoCallParticipants")
    .withIndex("by_call_id", (q) => q.eq("callId", call._id))
    .collect();
  if (participants.some((p) => p.userId === apt.physiotherapistId && !p.leftAt)) return;
  await notifyPatientWaiting(ctx, {
    physioId: apt.physiotherapistId,
    key: String(apt._id),
    patientName: fullName(user, "Your patient"),
    startTime: apt.startTime,
    link: `/video-call/${call.roomId}`,
  });
}

/** A Joy (WhatsApp) patient opened their call link (stream.ts getJoyPatientCallToken). */
export const joyPatientWaiting = internalMutation({
  args: { bookingId: v.id("marketplaceBookings"), callId: v.string() },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking?.physiotherapistId) return null;
    const patient = await ctx.db.get(booking.patientId);
    await notifyPatientWaiting(ctx, {
      physioId: booking.physiotherapistId,
      key: String(booking._id),
      patientName: booking.guestName || fullName(patient, "Your patient"),
      startTime: booking.sessionDate,
      link: `/video-call/${args.callId}`,
    });
    return null;
  },
});

// ── Refund issued ──────────────────────────────────────────────────────────────────────────────

/** A patient was refunded (helpers/paymentRefunds.ts, once per Paystack refund). */
export async function notifyRefundIssued(
  ctx: MutationCtx,
  args: {
    physioId?: Id<"users">;
    clinicId?: Id<"clinics">;
    patientId?: Id<"users">;
    patientName?: string;
    amountKobo: number;
    full: boolean;
    refundKey: string;
  }
) {
  const patient = args.patientId ? await ctx.db.get(args.patientId) : null;
  const name = args.patientName || fullName(patient, "A patient");
  const amount = `₦${Math.round(args.amountKobo / 100).toLocaleString("en-NG")}`;
  const recipients = new Map<Id<"users">, string>();
  if (args.physioId) recipients.set(args.physioId, "/dashboard/physiotherapist/billing");
  if (args.clinicId) {
    const clinic = await ctx.db.get(args.clinicId);
    if (clinic?.ownerId) recipients.set(clinic.ownerId, "/dashboard/clinic/billing");
  }
  for (const [userId, link] of recipients) {
    await send(ctx, {
      userId,
      type: "refund_issued",
      priority: "high",
      title: args.full ? "A booking was refunded" : "A partial refund was issued",
      body: `${name} was refunded ${amount}${args.full ? " in full" : ""}. See Billing for the details.`,
      link,
      entityType: "refund",
      entityId: `refund:${args.refundKey}`,
    });
  }
}

// ── Agreement to sign ──────────────────────────────────────────────────────────────────────────

/** An admin asked someone to sign, or voided their signature (agreements.ts). */
export async function notifyAgreementToSign(
  ctx: MutationCtx,
  args: { userId: Id<"users">; title: string; link: string; again?: boolean }
) {
  await send(ctx, {
    userId: args.userId,
    type: "agreement_to_sign",
    priority: "high",
    title: `Please sign the ${args.title}`,
    body: args.again
      ? "Your earlier signature needs to be done again. It takes about five minutes."
      : "It takes about five minutes: check your details, read it and sign online.",
    link: args.link,
    entityType: "agreement",
    entityId: `agreement:${args.title}:${Date.now()}`,
  });
}

// ── Referral routed to a clinic ────────────────────────────────────────────────────────────────

/** The owner and every team member who can see Referrals (adminReferrals.ts assignReferralToClinic). */
export async function notifyReferralAssigned(
  ctx: MutationCtx,
  clinic: Doc<"clinics">,
  referral: Doc<"inboundReferrals">
) {
  const recipients = new Set<Id<"users">>([clinic.ownerId]);
  const team = await ctx.db
    .query("users")
    .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
    .collect();
  for (const user of team) {
    if (user.role !== "clinic_staff" && user.role !== "physiotherapist") continue;
    const member = await resolveClinicMember(ctx, user);
    if (member && canUseArea(member, "referrals")) recipients.add(user._id);
  }
  const name = [referral.patientFirstName, referral.patientLastName].filter(Boolean).join(" ") || "A patient";
  for (const userId of recipients) {
    await send(ctx, {
      userId,
      type: "referral_assigned",
      priority: "high",
      title: `New referral: ${name}`,
      body: "Rehabify sent your clinic a new patient referral. Tap to see their details and get in touch.",
      link: "/dashboard/clinic/patients?filter=referred",
      entityType: "referral",
      entityId: `referral:${referral._id}:${clinic._id}`,
    });
  }
}

// ── Licence expiring or expired (daily) ────────────────────────────────────────────────────────

export const checkLicenceExpiry = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = Date.parse(`${zonedDateKey(Date.now())}T00:00:00Z`);
    const profiles = await ctx.db.query("physiotherapistProfiles").take(5000);
    for (const profile of profiles) {
      const date = profile.licenseExpiryDate?.slice(0, 10);
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !profile.userId) continue;
      const daysLeft = Math.round((Date.parse(`${date}T00:00:00Z`) - today) / DAY);
      // 30 days ahead, then on expiry (recent ones only: long-lapsed accounts aren't chased)
      const stage = daysLeft > 0 && daysLeft <= 30 ? "soon" : daysLeft <= 0 && daysLeft > -30 ? "expired" : null;
      if (!stage) continue;
      const entityId = `licence:${date}:${stage}`;
      if (await alreadySent(ctx, profile.userId, "licence_expiring", entityId)) continue;
      const when = lagosDate(Date.parse(`${date}T12:00:00Z`));
      await send(ctx, {
        userId: profile.userId,
        type: "licence_expiring",
        priority: "high",
        title: stage === "soon" ? `Your licence expires in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}` : "Your licence has expired",
        body:
          stage === "soon"
            ? `It expires on ${when}. Upload your renewed licence in Settings, Documents so patients can keep booking you.`
            : `It expired on ${when}. Upload your renewed licence in Settings, Documents to keep seeing patients.`,
        link: "/dashboard/physiotherapist/settings/documents",
        entityType: "licence",
        entityId,
      });
    }
    return null;
  },
});

// ── Patient hasn't exercised for 7 days (daily) ────────────────────────────────────────────────

export const checkExerciseInactivity = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const programs = await ctx.db
      .query("exercisePrograms")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(3000);

    // Patients with an active programme that has exercises (not only reading)
    const byPatient = new Map<Id<"users">, Doc<"exercisePrograms">[]>();
    for (const program of programs) {
      if (!program.items.some((item) => (item.kind ?? "exercise") === "exercise")) continue;
      byPatient.set(program.patientId, [...(byPatient.get(program.patientId) ?? []), program]);
    }

    for (const [patientId, list] of byPatient) {
      const lastLog = await ctx.db
        .query("exerciseProgramLogs")
        .withIndex("by_patient", (q) => q.eq("patientId", patientId))
        .order("desc")
        .first();
      const last = Math.max(lastLog?.createdAt ?? 0, ...list.map((p) => p.createdAt));
      const idleDays = Math.floor((now - last) / DAY);
      // 7 to 30 days: after a month the programme has simply been left, so we stop nudging
      if (idleDays < 7 || idleDays > 30) continue;

      const patient = await ctx.db.get(patientId);
      const name = fullName(patient, "A patient");
      // Same people as a high-pain report: whoever sent the programme and the current clinician
      const active = (
        await ctx.db
          .query("patientPhysiotherapistRelationships")
          .withIndex("by_patient", (q) => q.eq("patientId", patientId))
          .collect()
      ).filter((r) => r.status === "active");
      const current = active.find((r) => r.isPrimaryPhysiotherapist) ?? active.sort((a, b) => b.startDate - a.startDate)[0];
      const recipients = new Set<Id<"users">>(list.map((p) => p.createdBy));
      if (current) recipients.add(current.physiotherapistId);

      // One alert per quiet spell: a new log starts a new spell
      const entityId = `inactive:${patientId}:${last}`;
      for (const userId of recipients) {
        const recipient = await ctx.db.get(userId);
        if (!recipient || (await alreadySent(ctx, userId, "patient_inactive", entityId))) continue;
        await send(ctx, {
          userId,
          type: "patient_inactive",
          title: `${name} hasn't exercised for ${idleDays} days`,
          body: `Nothing logged since ${lagosDate(last)}. A quick message can help them get back on track.`,
          link:
            recipient.role === "physiotherapist"
              ? `/dashboard/physiotherapist/patients/${patientId}?tab=exercises`
              : "/dashboard/clinic/patients",
          entityType: "patient",
          entityId,
        });
      }
    }
    return null;
  },
});
