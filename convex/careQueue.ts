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
import { CARE_QUEUE_PATH, closeCareSignal, phoneKey, raiseCareSignal } from "./helpers/careSignals";
import { appLink } from "./helpers/appUrl";
import { lagosDateTime, lagosTime } from "./helpers/lagosTime";
import { requireAdmin } from "./helpers/partnerAccess";
import { factsRow, patientFacts, personName } from "./helpers/patientFacts";
import { recentPatientViews, recordPatientView, validPhysioIds } from "./helpers/patientViews";
import { insertNotification } from "./helpers/pushNotify";
import { getService } from "../lib/rehabify-services";
import { CARE_OUTCOME_LABEL } from "../lib/careOutcomes";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const UNPAID_AFTER = 20 * MINUTE;
const UNPAID_UNTIL = 6 * 60 * MINUTE;
const SIGNAL_EXPIRES = 3 * DAY;
// New sign-ups with no physio: give them 10 minutes to book themselves, look back 3 days
const NO_PHYSIO_AFTER = 10 * MINUTE;
const NO_PHYSIO_WITHIN = 3 * DAY;

/** Someone is looking after them: an active physio link, or a booking of their own. */
/** People a caregiver manages (Joy "book for someone I care for", Care circle): their care counts as the caregiver's. */
async function managedPeople(ctx: MutationCtx, caregiverId: Id<"users">) {
  const grants = await ctx.db
    .query("familyAccessGrants")
    .withIndex("by_family_member_user_id", (q) => q.eq("familyMemberUserId", caregiverId))
    .take(10);
  const people: { person: Doc<"users">; relationship: string }[] = [];
  for (const grant of grants) {
    if (!grant.managed || grant.status !== "active") continue;
    const person = await ctx.db.get(grant.patientUserId);
    if (person && !person.deletedAt) people.push({ person, relationship: grant.relationship });
  }
  return people;
}

const isManagedProfile = (user: Doc<"users">) => String(user.clerkId ?? "").startsWith("managed_");

/** The patient, or anyone they manage, already has a physio or a booking. */
async function careUnderway(ctx: MutationCtx, patientId: Id<"users">) {
  if (await hasPhysioOrBooking(ctx, patientId)) return true;
  for (const { person } of await managedPeople(ctx, patientId)) {
    if (await hasPhysioOrBooking(ctx, person._id)) return true;
  }
  return false;
}

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
      // Someone a caregiver added has no phone or email of their own: their caregiver's signal
      // covers them (it names the person), so the queue doesn't show one family twice
      if (isManagedProfile(patient)) continue;
      if (await careUnderway(ctx, patient._id)) continue;
      // Once per patient: an earlier signal (open or handled) is enough, and Joy has its own
      const earlier = await ctx.db
        .query("careSignals")
        .withIndex("by_patient_kind", (q) => q.eq("patientId", patient._id))
        .first();
      if (earlier) continue;
      const viaJoy = String(patient.clerkId ?? "").startsWith("joy-whatsapp:");
      const forWhom = (await managedPeople(ctx, patient._id))
        .map(({ person, relationship }) => `${relationship} ${person.firstName ?? ""} (${person.patientNumber ?? "no ID"})`.replace(/\s+/g, " "))
        .join(", ");
      await raiseCareSignal(ctx, {
        kind: "no_physio",
        patientId: patient._id,
        detail: `${viaJoy ? "started on Joy" : "signed up on the website"} and has no physio yet${forWhom ? `, looking for care for their ${forWhom}` : ""}`,
      });
      unlinked++;
    }

    // 4. Close signals whose booking moved on, and old ones
    const open = await ctx.db
      .query("careSignals")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .take(300);
    for (const signal of open) {
      // 3 days after the patient was last seen looking (a reopened case counts from the reopen)
      if (now - Math.max(signal.createdAt, signal.lastSeenAt) > SIGNAL_EXPIRES) {
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
        const person = await ctx.db.get(signal.patientId);
        if (person && isManagedProfile(person)) {
          await closeCareSignal(ctx, signal, "Added by a caregiver: their caregiver's entry covers them");
          closed++;
        } else if (await careUnderway(ctx, signal.patientId)) {
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
// Resolved cases stay on the page for a week, so the team can see who was reached and how it went
const RESOLVED_WITHIN = 7 * DAY;
const MAX_FOLLOW_UPS = 30;

const outcomeValidator = v.union(
  v.literal("booked"),
  v.literal("book_later"),
  v.literal("just_looking"),
  v.literal("no_response"),
  v.literal("feedback"),
  v.literal("not_suitable"),
  v.literal("other")
);

/** The keys that make two signals the same person: their account, phone number or email. */
function personKeys(row: { patient: { userId: string | null; phone: string | null; email: string | null } }) {
  const keys: string[] = [];
  if (row.patient.userId) keys.push(`u:${row.patient.userId}`);
  const phone = phoneKey(row.patient.phone);
  if (phone) keys.push(`p:${phone}`);
  const email = row.patient.email?.trim().toLowerCase();
  if (email) keys.push(`e:${email}`);
  return keys;
}

/**
 * One row per person looking for care, newest first (owner, 24 Nov 2026: strict time order, no
 * patient listed twice). A person with several open signals (signed up, then browsing, then asked
 * for help) is one row under the most urgent one, with the others named. Resolved cases from the
 * last week stay listed, and every row carries the team's follow-up notes about that person.
 */
export const adminList = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "careQueue:adminList");
    const now = Date.now();
    const open = await ctx.db
      .query("careSignals")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .order("desc")
      .take(200);
    const handled = (
      await ctx.db
        .query("careSignals")
        .withIndex("by_status", (q) => q.eq("status", "handled").gte("createdAt", now - 30 * DAY))
        .order("desc")
        .take(150)
    ).filter((s) => (s.handledAt ?? s.createdAt) >= now - RESOLVED_WITHIN);

    const names = new Map<string, Promise<string>>();
    const nameOf = (id: Id<"users">, fallback: string) => {
      if (!names.has(id)) names.set(id, ctx.db.get(id).then((u) => personName(u, fallback)));
      return names.get(id)!;
    };
    const physioName = (id: Id<"users">) => nameOf(id, "Physiotherapist");
    const factsCache = new Map<string, Promise<ReturnType<typeof factsRow> | null>>();

    const signalRows = [];
    for (const signal of [...open, ...handled]) {
      const patient = signal.patientId ? await ctx.db.get(signal.patientId) : null;
      // Who they are and what they need, so the team can act without phoning first
      let facts: ReturnType<typeof factsRow> | null = null;
      if (patient && patient.role === "patient") {
        if (!factsCache.has(patient._id)) factsCache.set(patient._id, patientFacts(ctx, patient, physioName).then(factsRow));
        facts = await factsCache.get(patient._id)!;
      }
      const booking = signal.bookingId ? await ctx.db.get(signal.bookingId) : null;
      const name = patient ? [patient.firstName, patient.lastName].filter(Boolean).join(" ") : signal.guestName ?? null;
      signalRows.push({
        signal,
        patientDoc: patient,
        booking,
        facts,
        patient: {
          userId: (patient?._id as string | undefined) ?? null,
          name: name || null,
          rehabifyId: patient?.patientNumber ?? null,
          phone: patient?.phoneNumber ?? signal.guestPhone ?? booking?.guestPhone ?? null,
          email: facts?.email ?? booking?.guestEmail ?? null,
        },
      });
    }

    // Group the signals by person: any shared account, phone number or email joins them
    const parent = signalRows.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const firstWithKey = new Map<string, number>();
    signalRows.forEach((row, i) => {
      for (const key of personKeys(row)) {
        const j = firstWithKey.get(key);
        if (j === undefined) firstWithKey.set(key, i);
        else parent[find(i)] = find(j);
      }
    });
    const groups = new Map<number, typeof signalRows>();
    signalRows.forEach((row, i) => {
      const root = find(i);
      groups.set(root, [...(groups.get(root) ?? []), row]);
    });

    const rows = [];
    for (const members of groups.values()) {
      const openMembers = members.filter((m) => m.signal.status === "open");
      const isOpen = openMembers.length > 0;
      // The row is about what's open now; once everything is resolved, about the latest resolution
      const current = isOpen ? openMembers : members;
      const primary = isOpen
        ? [...openMembers].sort((a, b) => (KIND_ORDER[a.signal.kind] ?? 9) - (KIND_ORDER[b.signal.kind] ?? 9) || b.signal.createdAt - a.signal.createdAt)[0]
        : [...members].sort((a, b) => (b.signal.handledAt ?? 0) - (a.signal.handledAt ?? 0))[0];
      const { signal, booking, facts, patient, patientDoc } = primary;
      // Who they were considering: their own record, else what the browser sent with a guest request
      const viewed = patientDoc
        ? (await recentPatientViews(ctx, patientDoc._id, 5)).map((v) => ({ physioId: v.physioId, name: v.name, at: v.lastViewedAt }))
        : await Promise.all(
            (signal.request?.viewedPhysioIds ?? []).slice(0, 5).map(async (id) => ({ physioId: id, name: await physioName(id), at: null as number | null }))
          );
      const physio = signal.physiotherapistId ? await ctx.db.get(signal.physiotherapistId) : null;
      // The team's notes about this person, from every case of theirs on the page, newest first
      const notes = members
        .flatMap((m) => (m.signal.followUps ?? []).map((f) => ({ ...f, signalId: m.signal._id })))
        .sort((a, b) => b.at - a.at)
        .slice(0, 12);
      const followUps = await Promise.all(
        notes.map(async (f) => ({ at: f.at, by: f.by ? await nameOf(f.by, "Admin") : null, outcome: f.outcome ?? null, text: f.text }))
      );
      const others = current.filter((m) => m !== primary);
      rows.push({
        id: signal._id,
        // Every open signal of this person: resolving the row closes them all
        openIds: openMembers.map((m) => m.signal._id),
        kind: signal.kind,
        otherKinds: [...new Set(others.map((m) => m.signal.kind).filter((k) => k !== signal.kind))],
        status: isOpen ? ("open" as const) : ("handled" as const),
        detail: signal.detail,
        otherDetails: [...new Set(others.map((m) => m.signal.detail).filter((d) => d !== signal.detail))].slice(0, 3),
        // The newest moment this person asked for care: what the list is sorted by and shows
        createdAt: Math.max(...current.map((m) => m.signal.createdAt)),
        signedUpAt: patientDoc?._creationTime ?? null,
        lastSeenAt: Math.max(...current.map((m) => m.signal.lastSeenAt)),
        dueAt: signal.dueAt ?? booking?.providerResponseDueAt ?? null,
        patient,
        facts,
        request: signal.request ?? null,
        viewed,
        // Joy patients stay under Joy whatever stage they reach (a Joy booking waiting on a physio too)
        fromJoy: current.some((m) => Boolean(m.facts?.fromJoy || m.booking?.joyServiceMode || m.signal.kind === "joy_matching")),
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
        followUps,
        lastFollowUpAt: followUps[0]?.at ?? null,
        handledAt: isOpen ? null : signal.handledAt ?? null,
        handledNote: isOpen ? null : signal.handledNote ?? null,
        handledBy: !isOpen && signal.handledBy ? await nameOf(signal.handledBy, "Admin") : null,
        resolution: isOpen ? null : signal.resolution ?? null,
        // Closed by the system (booking moved on, or 3 days passed) rather than by the team
        closedAutomatically: !isOpen && !signal.handledBy,
      });
    }
    // Strictly newest first, so "2 minutes ago" is always above "3 days ago"
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Adds a follow-up note to a case (a call, a WhatsApp, what the patient said), capped per case. */
async function addFollowUp(
  ctx: MutationCtx,
  signal: Doc<"careSignals">,
  entry: { by: Id<"users">; outcome?: string; text: string }
) {
  const followUps = [...(signal.followUps ?? []), { at: Date.now(), by: entry.by, outcome: entry.outcome, text: entry.text.slice(0, 1000) }];
  await ctx.db.patch(signal._id, { followUps: followUps.slice(-MAX_FOLLOW_UPS) });
}

/**
 * Resolves a case: closes the person's open signals (`signalIds`, the row's openIds) with how it
 * went, and logs the note. Old pages send only `signalId`.
 */
export const adminMarkHandled = mutation({
  args: {
    signalId: v.id("careSignals"),
    signalIds: v.optional(v.array(v.id("careSignals"))),
    outcome: v.optional(outcomeValidator),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "careQueue:adminMarkHandled");
    const ids = [...new Set([args.signalId, ...(args.signalIds ?? [])])].slice(0, 20);
    const note = args.note?.trim().slice(0, 1000) ?? "";
    const label = args.outcome ? CARE_OUTCOME_LABEL[args.outcome] : null;
    const summary = [label, note].filter(Boolean).join(": ") || "Resolved by the team";
    if (!(await ctx.db.get(args.signalId))) throw new ConvexError("That case isn't there any more.");
    for (const id of ids) {
      const signal = await ctx.db.get(id);
      if (!signal) continue;
      // The note goes in the log once, on the row's own case
      if (id === args.signalId && (note || label)) {
        await addFollowUp(ctx, signal, { by: user._id, outcome: args.outcome, text: note || `Resolved: ${label}` });
      }
      if (signal.status === "open") await closeCareSignal(ctx, signal, summary, user._id, args.outcome);
    }
    return { ok: true };
  },
});

/** Logs a follow-up without resolving the case: "Called, no answer", "Will book after payday". */
export const adminAddNote = mutation({
  args: { signalId: v.id("careSignals"), outcome: v.optional(outcomeValidator), text: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "careQueue:adminAddNote");
    const signal = await ctx.db.get(args.signalId);
    if (!signal) throw new ConvexError("That case isn't there any more.");
    const text = args.text.trim() || (args.outcome ? CARE_OUTCOME_LABEL[args.outcome] : "");
    if (!text) throw new ConvexError("Write what happened, or pick how it went.");
    await addFollowUp(ctx, signal, { by: user._id, outcome: args.outcome, text });
    return { ok: true };
  },
});

/** Puts a resolved case back in the queue (the patient got back in touch, or it was resolved by mistake). */
export const adminReopen = mutation({
  args: { signalId: v.id("careSignals") },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "careQueue:adminReopen");
    const signal = await ctx.db.get(args.signalId);
    if (!signal) throw new ConvexError("That case isn't there any more.");
    if (signal.status === "open") return { ok: true };
    await ctx.db.patch(signal._id, {
      status: "open",
      handledAt: undefined,
      handledBy: undefined,
      handledNote: undefined,
      resolution: undefined,
      // The 3-day automatic close counts from now
      lastSeenAt: Date.now(),
    });
    await addFollowUp(ctx, (await ctx.db.get(signal._id))!, { by: user._id, text: "Reopened" });
    return { ok: true };
  },
});

export const adminNudgePhysio = mutation({
  args: { signalId: v.id("careSignals") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, "careQueue:adminNudgePhysio");
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

/** Count for the admin nav badge: people waiting, not signals (one person can have several). */
export async function openCareSignalCount(ctx: { db: MutationCtx["db"] | any }, cap: number): Promise<number> {
  const rows: Doc<"careSignals">[] = await ctx.db
    .query("careSignals")
    .withIndex("by_status", (q: any) => q.eq("status", "open"))
    .take(Math.min(300, cap * 3));
  const people = new Set(rows.map((s) => s.patientId ?? (phoneKey(s.guestPhone) ? `p:${phoneKey(s.guestPhone)}` : s._id)));
  return Math.min(people.size, cap);
}

export type CareSignalId = Id<"careSignals">;
export { CARE_QUEUE_PATH };
