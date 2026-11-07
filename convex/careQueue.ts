/**
 * Patients looking for care (Admin › Patients looking for care). The team hears at once when:
 *   - a patient has paid and is waiting for the physio to accept (marketplace/booking.ts);
 *   - a patient started a booking but hasn't paid after 20 minutes (sweep);
 *   - Joy has triaged a patient, shown matches, or found no physio (joyHandoff.logJourney);
 *   - a signed-in patient is browsing Find a Physio without a recent booking (noteBrowsing);
 *   - a patient signed up on the website and nobody is linked to them yet (sweep, "no_physio").
 * Physios are nudged halfway through the time they have to accept and 30 minutes before it ends,
 * and an admin can nudge them any time. Signals close themselves when the booking moves on.
 */
import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { CARE_QUEUE_PATH, closeCareSignal, raiseCareSignal } from "./helpers/careSignals";
import { appLink } from "./helpers/appUrl";
import { lagosDateTime, lagosTime } from "./helpers/lagosTime";
import { requireAdmin } from "./helpers/partnerAccess";
import { factsRow, patientFacts, personName } from "./helpers/patientFacts";
import { recentPatientViews, recordPatientView, validPhysioIds } from "./helpers/patientViews";
import { insertNotification } from "./helpers/pushNotify";
import { getService } from "../lib/rehabify-services";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const UNPAID_AFTER = 20 * MINUTE;
const UNPAID_UNTIL = 6 * 60 * MINUTE;
const SIGNAL_EXPIRES = 3 * DAY;
// New sign-ups with no physio: give them 10 minutes to book themselves, look back 3 days
const NO_PHYSIO_AFTER = 10 * MINUTE;
const NO_PHYSIO_WITHIN = 3 * DAY;

/** Someone is looking after them: an active physio link, or a booking of their own. */
async function hasPhysioOrBooking(ctx: MutationCtx, patientId: Id<"users">) {
  const links = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .take(20);
  if (links.some((link) => link.status === "active")) return true;
  const booking = await ctx.db
    .query("marketplaceBookings")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .first();
  return Boolean(booking);
}

const sendEmail = makeFunctionReference<
  "action",
  { to: string; subject: string; greetingName?: string; heading: string; paragraphs: string[]; buttonLabel?: string; buttonUrl?: string }
>("actions/emails/sendPatientCareEmail:sendPatientCareEmail");

function serviceLabel(booking: Doc<"marketplaceBookings">) {
  const service = booking.serviceId ? getService(booking.serviceId) : undefined;
  return service?.name ?? "a session";
}

/** What a booking is, in one line: service, time and place. */
export function bookingLine(booking: Doc<"marketplaceBookings">) {
  return [
    serviceLabel(booking),
    booking.sessionDate ? lagosDateTime(booking.sessionDate) : null,
    booking.isOnline ? "video" : booking.travelZoneName ? `home visit, ${booking.travelZoneName}` : "home visit",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Remind the physio to answer a paid patient's request. */
async function nudgePhysio(ctx: MutationCtx, booking: Doc<"marketplaceBookings">, by: "auto" | "admin") {
  if (!booking.physiotherapistId) return false;
  const physio = await ctx.db.get(booking.physiotherapistId);
  const due = booking.providerResponseDueAt;
  const body = `${bookingLine(booking)}. The patient has paid.${due ? ` Accept by ${lagosTime(due)} or it goes to another physio.` : " Please accept or decline now."}`;
  await insertNotification(ctx, {
    userId: booking.physiotherapistId,
    type: "booking_request",
    priority: "urgent",
    status: "pending",
    payload: {
      title: "A patient is waiting for your answer",
      body,
      link: "/dashboard/physiotherapist/appointments",
      data: { entityType: "marketplace_booking", entityId: booking._id, actionUrl: "/dashboard/physiotherapist/appointments" },
    },
    createdAt: Date.now(),
  });
  if (physio?.email) {
    await ctx.scheduler.runAfter(0, sendEmail, {
      to: physio.email,
      subject: "A patient is waiting for your answer",
      greetingName: physio.firstName,
      heading: "A paid patient is waiting for you",
      paragraphs: [body, by === "admin" ? "The Rehabify team asked us to remind you." : "Open your schedule to accept or decline."],
      buttonLabel: "Answer now",
      buttonUrl: appLink("/dashboard/physiotherapist/appointments"),
    });
  }
  await ctx.db.patch(booking._id, { providerNudgeCount: (booking.providerNudgeCount ?? 0) + 1, updatedAt: Date.now() });
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signals from the website
// ─────────────────────────────────────────────────────────────────────────────

/** Find a Physio: a signed-in patient browsing without a recent booking (once a day per patient). */
export const noteBrowsing = mutation({
  // viewed: physio profiles opened in this browser, maybe before they signed in
  args: { looking: v.optional(v.string()), viewed: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { noted: false };
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user || user.role !== "patient") return { noted: false };
    for (const physioId of await validPhysioIds(ctx, args.viewed)) {
      const seen = await ctx.db
        .query("patientPhysioViews")
        .withIndex("by_patient_and_physio", (q) => q.eq("patientId", user._id).eq("physiotherapistId", physioId))
        .first();
      if (!seen) await recordPatientView(ctx, user._id, physioId);
    }
    // They already asked for help choosing: that item says more than "browsing"
    const asked = await ctx.db
      .query("careSignals")
      .withIndex("by_patient_kind", (q) => q.eq("patientId", user._id).eq("kind", "help_choosing"))
      .order("desc")
      .first();
    if (asked?.status === "open") return { noted: false };
    const recent = await ctx.db
      .query("marketplaceBookings")
      .withIndex("by_patient", (q) => q.eq("patientId", user._id))
      .order("desc")
      .first();
    if (recent && recent.createdAt > Date.now() - 7 * DAY) return { noted: false };
    const looking = args.looking?.trim().slice(0, 100);
    await raiseCareSignal(ctx, {
      kind: "browsing",
      patientId: user._id,
      detail: looking ? `browsing Find a Physio (${looking}) without booking` : "browsing Find a Physio without booking",
    });
    return { noted: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Every 10 minutes
// ─────────────────────────────────────────────────────────────────────────────

export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let unpaid = 0;
    let nudged = 0;
    let closed = 0;

    // 1. Started booking, not paid after 20 minutes (up to 6 hours)
    const pending = await ctx.db
      .query("marketplaceBookings")
      .withIndex("by_payment_status", (q) => q.eq("paymentStatus", "pending"))
      .order("desc")
      .take(300);
    for (const booking of pending) {
      if (booking.bookingStatus !== "pending_payment") continue;
      const age = now - booking.createdAt;
      if (age < UNPAID_AFTER || age > UNPAID_UNTIL) continue;
      await raiseCareSignal(ctx, {
        kind: "unpaid_checkout",
        bookingId: booking._id,
        patientId: booking.patientId,
        physiotherapistId: booking.physiotherapistId ?? undefined,
        guestName: booking.guestName ?? undefined,
        guestPhone: booking.guestPhone ?? undefined,
        detail: `started ${bookingLine(booking)} but hasn't paid`,
      });
      unpaid++;
    }

    // 2. Nudge physios: halfway through their time to accept, and 30 minutes before it ends
    const waiting = await ctx.db
      .query("marketplaceBookings")
      .withIndex("by_booking_status", (q) => q.eq("bookingStatus", "awaiting_physio"))
      .take(300);
    for (const booking of waiting) {
      const due = booking.providerResponseDueAt;
      if (booking.providerResponse !== "pending" || !due || due <= now) continue;
      const start = booking.paidAt ?? booking.createdAt;
      const count = booking.providerNudgeCount ?? 0;
      const halfway = start + (due - start) / 2;
      const lastCall = due - 30 * MINUTE;
      if ((count === 0 && now >= halfway) || (count <= 1 && now >= lastCall && due - start > 45 * MINUTE)) {
        if (await nudgePhysio(ctx, booking, "auto")) nudged++;
      }
    }

    // 3. New patients nobody is linked to (website sign-ups): someone has to pair them
    let unlinked = 0;
    const newest = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "patient"))
      .order("desc")
      .take(60);
    for (const patient of newest) {
      if (now - patient._creationTime > NO_PHYSIO_WITHIN || patient.deletedAt) continue;
      if (now - patient._creationTime < NO_PHYSIO_AFTER) continue;
      if (await hasPhysioOrBooking(ctx, patient._id)) continue;
      // Once per patient: an earlier signal (open or handled) is enough, and Joy has its own
      const earlier = await ctx.db
        .query("careSignals")
        .withIndex("by_patient_kind", (q) => q.eq("patientId", patient._id))
        .first();
      if (earlier) continue;
      const viaJoy = String(patient.clerkId ?? "").startsWith("joy-whatsapp:");
      await raiseCareSignal(ctx, {
        kind: "no_physio",
        patientId: patient._id,
        detail: viaJoy ? "started on Joy and has no physio yet" : "signed up on the website and has no physio yet",
      });
      unlinked++;
    }

    // 4. Close signals whose booking moved on, and old ones
    const open = await ctx.db
      .query("careSignals")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .take(300);
    for (const signal of open) {
      if (now - signal.createdAt > SIGNAL_EXPIRES) {
        await closeCareSignal(ctx, signal, "Closed after 3 days");
        closed++;
        continue;
      }
      if (signal.bookingId) {
        const booking = await ctx.db.get(signal.bookingId);
        const note = !booking
          ? "Booking removed"
          : booking.bookingStatus === "cancelled"
            ? "Booking cancelled"
            : signal.kind === "unpaid_checkout" && booking.paymentStatus === "completed"
              ? null // paid: becomes "waiting for the physio" (raised by the booking itself)
              : signal.kind === "awaiting_physio" && booking.providerResponse !== "pending"
                ? `Physio ${booking.providerResponse === "accepted" ? "accepted" : "answered"}`
                : booking.bookingStatus === "confirmed" || booking.bookingStatus === "completed"
                  ? "Booking confirmed"
                  : null;
        if (note) {
          await closeCareSignal(ctx, signal, note);
          closed++;
        }
      } else if (signal.patientId && signal.kind === "no_physio") {
        if (await hasPhysioOrBooking(ctx, signal.patientId)) {
          await closeCareSignal(ctx, signal, "Linked to a physio");
          closed++;
        }
      } else if (signal.patientId) {
        // Joy or browsing: closed once the patient has a paid booking made after it
        const booked = await ctx.db
          .query("marketplaceBookings")
          .withIndex("by_patient", (q) => q.eq("patientId", signal.patientId!))
          .order("desc")
          .first();
        if (booked && booked.createdAt >= signal.createdAt && booked.paymentStatus === "completed") {
          await closeCareSignal(ctx, signal, "Patient booked and paid");
          closed++;
        }
      }
    }
    return { unpaid, nudged, unlinked, closed };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin
// ─────────────────────────────────────────────────────────────────────────────

const KIND_ORDER: Record<string, number> = { awaiting_physio: 0, help_choosing: 1, joy_matching: 2, no_physio: 3, unpaid_checkout: 4, browsing: 5 };

/** Open signals (most urgent first) and the last day's handled ones. */
export const adminList = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const open = await ctx.db
      .query("careSignals")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .order("desc")
      .take(200);
    const handled = await ctx.db
      .query("careSignals")
      .withIndex("by_status", (q) => q.eq("status", "handled").gte("createdAt", Date.now() - DAY))
      .order("desc")
      .take(50);

    const rows = [];
    const physioNames = new Map<string, Promise<string>>();
    const physioName = (id: Id<"users">) => {
      if (!physioNames.has(id)) physioNames.set(id, ctx.db.get(id).then((u) => personName(u, "Physiotherapist")));
      return physioNames.get(id)!;
    };
    for (const signal of [...open, ...handled]) {
      const patient = signal.patientId ? await ctx.db.get(signal.patientId) : null;
      // Who they are and what they need, so the team can act without phoning first
      const facts = patient && patient.role === "patient" ? factsRow(await patientFacts(ctx, patient, physioName)) : null;
      // Who they were considering: their own record, else what the browser sent with a guest request
      const viewed = patient
        ? (await recentPatientViews(ctx, patient._id, 5)).map((v) => ({ physioId: v.physioId, name: v.name, at: v.lastViewedAt }))
        : await Promise.all(
            (signal.request?.viewedPhysioIds ?? []).slice(0, 5).map(async (id) => ({ physioId: id, name: await physioName(id), at: null as number | null }))
          );
      const physio = signal.physiotherapistId ? await ctx.db.get(signal.physiotherapistId) : null;
      const booking = signal.bookingId ? await ctx.db.get(signal.bookingId) : null;
      const handler = signal.handledBy ? await ctx.db.get(signal.handledBy) : null;
      const name = patient ? [patient.firstName, patient.lastName].filter(Boolean).join(" ") : signal.guestName ?? null;
      rows.push({
        id: signal._id,
        kind: signal.kind,
        status: signal.status,
        detail: signal.detail,
        createdAt: signal.createdAt,
        lastSeenAt: signal.lastSeenAt,
        dueAt: signal.dueAt ?? booking?.providerResponseDueAt ?? null,
        patient: {
          userId: patient?._id ?? null,
          name: name || null,
          rehabifyId: patient?.patientNumber ?? null,
          phone: patient?.phoneNumber ?? signal.guestPhone ?? booking?.guestPhone ?? null,
          email: facts?.email ?? booking?.guestEmail ?? null,
        },
        facts,
        request: signal.request ?? null,
        viewed,
        // Joy patients stay under Joy whatever stage they reach (a Joy booking waiting on a physio too)
        fromJoy: Boolean(facts?.fromJoy || booking?.joyServiceMode || signal.kind === "joy_matching"),
        physio: physio ? { userId: physio._id, name: [physio.firstName, physio.lastName].filter(Boolean).join(" ") || "Physiotherapist", phone: physio.phoneNumber ?? null } : null,
        booking: booking
          ? {
              id: booking._id,
              line: bookingLine(booking),
              paid: booking.paymentStatus === "completed",
              awaitingPhysio: booking.bookingStatus === "awaiting_physio" && booking.providerResponse === "pending",
              nudges: booking.providerNudgeCount ?? 0,
            }
          : null,
        nudgedAt: signal.nudgedAt ?? null,
        handledAt: signal.handledAt ?? null,
        handledNote: signal.handledNote ?? null,
        handledBy: handler ? [handler.firstName, handler.lastName].filter(Boolean).join(" ") || "Admin" : null,
      });
    }
    return rows.sort((a, b) =>
      a.status !== b.status ? (a.status === "open" ? -1 : 1) : (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || b.createdAt - a.createdAt
    );
  },
});

export const adminMarkHandled = mutation({
  args: { signalId: v.id("careSignals"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx);
    const signal = await ctx.db.get(args.signalId);
    if (!signal) throw new ConvexError("Not found.");
    await closeCareSignal(ctx, signal, args.note?.trim() || "Handled by the team", user._id);
    return { ok: true };
  },
});

export const adminNudgePhysio = mutation({
  args: { signalId: v.id("careSignals") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const signal = await ctx.db.get(args.signalId);
    const booking = signal?.bookingId ? await ctx.db.get(signal.bookingId) : null;
    if (!signal || !booking) throw new ConvexError("This one has no booking to nudge about.");
    if (!booking.physiotherapistId) throw new ConvexError("No physio is on this booking yet. Assign one first.");
    if (signal.nudgedAt && Date.now() - signal.nudgedAt < 10 * MINUTE) {
      throw new ConvexError("The physio was nudged less than 10 minutes ago.");
    }
    await nudgePhysio(ctx, booking, "admin");
    await ctx.db.patch(signal._id, { nudgedAt: Date.now(), nudgeCount: (signal.nudgeCount ?? 0) + 1 });
    return { ok: true };
  },
});

/** Count for the admin nav badge. */
export async function openCareSignalCount(ctx: { db: MutationCtx["db"] | any }, cap: number): Promise<number> {
  const rows = await ctx.db
    .query("careSignals")
    .withIndex("by_status", (q: any) => q.eq("status", "open"))
    .take(cap);
  return rows.length;
}

export type CareSignalId = Id<"careSignals">;
export { CARE_QUEUE_PATH };
