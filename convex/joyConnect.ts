/**
 * Joy for patients already in care (owner, 10 Nov 2026).
 *
 * 1. Connect: the patient's physio or clinic sends them a WhatsApp link to Joy carrying a
 *    one-time code ("Hi Joy, connect me: K7P3XQ2M"). When the patient sends it, Joy calls
 *    joyOperations patient_connect, which binds that WhatsApp number to the patient's record,
 *    including records a physio or clinic created before the patient had a login. A phone number
 *    typed on the website is never enough on its own (a typo would expose someone's programme);
 *    the code proves the care team sent this person the link.
 * 2. Care summary (patient_care_summary): who their physio is, their programme today and next
 *    visit, so Joy greets them as someone in care instead of a new patient.
 * 3. Watch link: a PIN-protected /x/<token> link to the 3D programme player for Joy to send (the PIN
 *    is the last 4 digits of the WhatsApp number). Made in an action, where randomness is real.
 */
import { ConvexError, v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireCareTeam, displayName } from "./helpers/exerciseAccess";
import { findRelationship } from "./helpers/careAccess";
import { joyWhatsAppNumber, normalizePhone } from "./helpers/partnerShared";
import { phoneLast4, pinHash, randomToken, sha256Hex } from "./helpers/exerciseCrypto";
import { publicAppUrl } from "./helpers/appUrl";
import { isRehabifyCare } from "./rehabifyFollowUps";
import { recoveryPlanForJoy } from "./helpers/patientPlans";
import { patientProgramView } from "./exercisePrograms";
import { insertNotification, pushNewMessage } from "./helpers/pushNotify";
import { senderIdentity } from "./helpers/displayIdentity";

const DAY = 86_400_000;
const CONNECT_CODE_DAYS = 30;
const WATCH_LINK_DAYS = 30;
const CONNECT_ATTEMPTS_PER_HOUR = 10;
// No 0/O or 1/I/L: the code is read off a phone screen
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function connectCode(length = 8) {
  const limit = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;
  const buf = new Uint8Array(1);
  let out = "";
  while (out.length < length) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) out += CODE_ALPHABET[buf[0] % CODE_ALPHABET.length];
  }
  return out;
}

/** "k7p3 xq2m" → "K7P3XQ2M" */
export function cleanConnectCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function firstName(user: Pick<Doc<"users">, "firstName"> | null | undefined) {
  const name = (user?.firstName ?? "").trim();
  return name && name !== "Patient" ? name : null;
}

/** wa.me wants the international number without "+"; Nigerian local numbers start with 0. */
function waNumber(phone?: string | null) {
  const e164 = normalizePhone(phone ?? "");
  return e164 ? e164.slice(1) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. The care team sends the connect link
// ─────────────────────────────────────────────────────────────────────────────

export const prepareConnect = internalQuery({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    const team = await requireCareTeam(ctx, args.patientId, { write: false });
    // A physio whose care of this patient has ended can't send it any more
    if (team.kind === "physio") {
      const rel = await findRelationship(ctx, team.user._id, args.patientId);
      if (rel?.status !== "active") throw new ConvexError("This patient isn't in your care.");
    }
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.role !== "patient") throw new ConvexError("Patient not found.");
    return {
      userId: team.user._id,
      senderName: team.senderName,
      patientFirstName: firstName(patient),
      phone: patient.phoneNumber ?? null,
      connected: Boolean(patient.whatsappLinkedAt),
    };
  },
});

export const insertConnectCode = internalMutation({
  args: { patientId: v.id("users"), createdBy: v.id("users"), codeHash: v.string(), expiresAt: v.number() },
  handler: async (ctx, args) => {
    // One live code per patient: an older unused one stops working
    for (const old of await ctx.db.query("joyConnectCodes").withIndex("by_patient", (q) => q.eq("patientId", args.patientId)).collect()) {
      if (!old.usedAt && old.expiresAt > Date.now()) await ctx.db.patch(old._id, { expiresAt: Date.now() });
    }
    await ctx.db.insert("joyConnectCodes", { ...args, createdAt: Date.now() });
  },
});

/**
 * A "Connect to Joy" link for one patient: a WhatsApp message to send them (to their number when
 * we have it), with Joy's link and code inside.
 */
export const createConnectLink = action({
  args: { patientId: v.id("users") },
  handler: async (ctx, args): Promise<{ whatsappUrl: string; joyUrl: string; code: string; message: string; expiresAt: number; alreadyConnected: boolean }> => {
    const info: { userId: Id<"users">; senderName: string; patientFirstName: string | null; phone: string | null; connected: boolean } =
      await ctx.runQuery(internal.joyConnect.prepareConnect, { patientId: args.patientId });
    const code = connectCode();
    const expiresAt = Date.now() + CONNECT_CODE_DAYS * DAY;
    await ctx.runMutation(internal.joyConnect.insertConnectCode, {
      patientId: args.patientId,
      createdBy: info.userId,
      codeHash: await sha256Hex(code),
      expiresAt,
    });
    const joyUrl = `https://wa.me/${joyWhatsAppNumber()}?text=${encodeURIComponent(`Hi Joy, connect me: ${code}`)}`;
    const message = [
      `${info.patientFirstName ? `Hi ${info.patientFirstName}` : "Hi"}, ${info.senderName} has set you up with Joy, Rehabify's WhatsApp assistant.`,
      "",
      "Tap this link and send the message to get your exercises, daily reminders and bookings on WhatsApp:",
      joyUrl,
    ].join("\n");
    const number = waNumber(info.phone);
    return {
      whatsappUrl: `https://wa.me/${number ?? ""}?text=${encodeURIComponent(message)}`,
      joyUrl,
      code,
      message,
      expiresAt,
      alreadyConnected: info.connected,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. The patient sends the code to Joy (joyOperations patient_connect)
// ─────────────────────────────────────────────────────────────────────────────

/** Whoever looks after the patient now: their primary active relationship, else the newest. */
async function currentCare(ctx: QueryCtx, patientId: Id<"users">) {
  const rels = (
    await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .collect()
  ).filter((r) => r.status === "active");
  const rel = rels.find((r) => r.isPrimaryPhysiotherapist) ?? rels.sort((a, b) => b.startDate - a.startDate)[0] ?? null;
  if (!rel) return null;
  const physio = await ctx.db.get(rel.physiotherapistId);
  const clinic = rel.clinicId ? await ctx.db.get(rel.clinicId) : null;
  return { rel, physio, clinic };
}

export async function connectWithCode(
  ctx: MutationCtx,
  args: { code: string; phone: string; joyRecordId: Id<"users"> }
): Promise<
  | { connected: true; patient_id: Id<"users">; first_name: string | null; physio_name: string | null; clinic_name: string | null }
  | { connected: false; reason: "invalid" | "expired" | "used" | "rate_limited" }
> {
  const now = Date.now();
  const recent = await ctx.db
    .query("joyConnectAttempts")
    .withIndex("by_phone", (q) => q.eq("phone", args.phone).gt("createdAt", now - 3_600_000))
    .collect();
  if (recent.length >= CONNECT_ATTEMPTS_PER_HOUR) return { connected: false, reason: "rate_limited" };
  await ctx.db.insert("joyConnectAttempts", { phone: args.phone, createdAt: now });

  const code = cleanConnectCode(args.code);
  if (code.length < 6 || code.length > 12) return { connected: false, reason: "invalid" };
  const codeHash = await sha256Hex(code);
  const row = await ctx.db.query("joyConnectCodes").withIndex("by_code_hash", (q) => q.eq("codeHash", codeHash)).first();
  if (!row) return { connected: false, reason: "invalid" };
  if (row.usedAt) {
    // Sending the same code again from the same number is fine
    if (row.usedByPhone === args.phone) {
      const patient = await ctx.db.get(row.patientId);
      const care = await currentCare(ctx, row.patientId);
      return {
        connected: true,
        patient_id: row.patientId,
        first_name: firstName(patient),
        physio_name: care?.physio ? displayName(care.physio) : null,
        clinic_name: care?.clinic?.name ?? null,
      };
    }
    return { connected: false, reason: "used" };
  }
  if (row.expiresAt < now) return { connected: false, reason: "expired" };
  const patient = await ctx.db.get(row.patientId);
  if (!patient || patient.role !== "patient") return { connected: false, reason: "invalid" };

  // This number now belongs to this patient on Joy: any other record linked to it lets go
  for (const other of await ctx.db.query("users").withIndex("by_whatsapp_linked_phone", (q) => q.eq("whatsappLinkedPhone", args.phone)).collect()) {
    if (other._id !== patient._id) await ctx.db.patch(other._id, { whatsappLinkedAt: undefined, whatsappLinkedPhone: undefined });
  }
  await ctx.db.patch(patient._id, {
    whatsappLinkedAt: now,
    whatsappLinkedPhone: args.phone,
    ...(patient.phoneNumber ? {} : { phoneNumber: args.phone }),
  });
  await ctx.db.patch(row._id, { usedAt: now, usedByPhone: args.phone, joyRecordId: args.joyRecordId });
  const care = await currentCare(ctx, patient._id);
  return {
    connected: true,
    patient_id: patient._id,
    first_name: firstName(patient),
    physio_name: care?.physio ? displayName(care.physio) : null,
    clinic_name: care?.clinic?.name ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2b. Writing to the care team from WhatsApp (patient_message_physio, patient_request_visit)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A message from the patient into their Messages chat with their physio, tagged as WhatsApp, so the
 * physio's reply there comes back on WhatsApp (chat.ts). Pushed to the physio as usual.
 */
export async function messageCareTeam(ctx: MutationCtx, patient: Doc<"users">, physio: Doc<"users">, content: string) {
  const now = Date.now();
  let conversation: Doc<"conversations"> | null =
    (await ctx.db.query("conversations").withIndex("by_participants", (q) => q.eq("participant1Id", patient._id).eq("participant2Id", physio._id)).first()) ??
    (await ctx.db.query("conversations").withIndex("by_participants", (q) => q.eq("participant1Id", physio._id).eq("participant2Id", patient._id)).first());
  if (!conversation) {
    const conversationId = await ctx.db.insert("conversations", {
      participant1Id: patient._id, participant2Id: physio._id, lastMessageAt: now, unreadCount1: 0, unreadCount2: 0, createdAt: now, updatedAt: now,
    });
    conversation = await ctx.db.get(conversationId);
  }
  if (!conversation) return;
  await ctx.db.insert("messages", {
    conversationId: conversation._id, senderId: patient._id, receiverId: physio._id, content, contentType: "text",
    timestamp: now, isDelivered: false, isReadByReceiver: false, isRead: false, createdAt: now, updatedAt: now,
    metadata: { via: "whatsapp" },
  });
  const patientIsFirst = conversation.participant1Id === patient._id;
  await ctx.db.patch(conversation._id, {
    lastMessageAt: now, updatedAt: now,
    unreadCount1: patientIsFirst ? conversation.unreadCount1 : conversation.unreadCount1 + 1,
    unreadCount2: patientIsFirst ? conversation.unreadCount2 + 1 : conversation.unreadCount2,
  });
  await pushNewMessage(ctx, {
    sender: patient, senderLabel: (await senderIdentity(ctx, patient)).label, receiver: physio,
    conversationId: conversation._id, contentType: "text",
  });
}

/** A message to whoever looks after the patient now. */
export async function messageCurrentPhysio(ctx: MutationCtx, patient: Doc<"users">, text: string) {
  const content = text.replace(/\s+/g, " ").trim().slice(0, 1000);
  if (!content) return { sent: false as const, reason: "empty" };
  const care = await currentCare(ctx, patient._id);
  if (!care?.physio) return { sent: false as const, reason: "no_physio" };
  await messageCareTeam(ctx, patient, care.physio, content);
  return { sent: true as const, physio_name: displayName(care.physio) };
}

/**
 * The patient asked Joy for their next visit. A clinic's patient: a request in the clinic's
 * Appointments → Requests (as from the patient portal). Anyone else: a message to their physio,
 * who books it from their schedule (a Rehabify Care visit is then pay-to-confirm, as usual).
 * Never the ₦6,000 first consultation: that's for new patients.
 */
export async function requestVisitFromCare(ctx: MutationCtx, patient: Doc<"users">, args: { preferredTimes?: string; note?: string }) {
  const care = await currentCare(ctx, patient._id);
  if (!care?.physio) return { sent: false as const, reason: "no_physio" };
  const times = args.preferredTimes?.replace(/\s+/g, " ").trim().slice(0, 300) || undefined;
  const note = args.note?.replace(/\s+/g, " ").trim().slice(0, 500) || undefined;
  const now = Date.now();
  if (care.clinic) {
    const open = (await ctx.db.query("clinicBookingRequests").withIndex("by_patient", (q) => q.eq("patientId", patient._id)).collect())
      .filter((r) => r.status === "open" && r.clinicId === care.clinic!._id);
    if (open.length >= 3) return { sent: false as const, reason: "already_asked", to: "clinic" as const, name: care.clinic.name };
    const requestId = await ctx.db.insert("clinicBookingRequests", {
      clinicId: care.clinic._id,
      patientId: patient._id,
      kind: "appointment",
      message: [note, "Asked on WhatsApp (Joy)."].filter(Boolean).join(" "),
      preferredTimes: times,
      status: "open",
      createdAt: now,
    });
    const patientName = [patient.firstName, patient.lastName].filter(Boolean).join(" ") || "A patient";
    await insertNotification(ctx, {
      userId: care.clinic.ownerId,
      type: "clinic_booking_request",
      priority: "high",
      status: "pending",
      createdAt: now,
      payload: {
        title: "New request from a patient",
        body: `${patientName} asked on WhatsApp for another appointment${times ? ` (${times})` : ""}.`,
        data: { entityId: String(requestId), entityType: "clinic_booking_request" },
        link: "/dashboard/clinic/appointments?requests=1",
      },
    });
    return { sent: true as const, to: "clinic" as const, name: care.clinic.name, physio_name: displayName(care.physio) };
  }
  await messageCareTeam(
    ctx,
    patient,
    care.physio,
    ["📅 Visit request (sent from WhatsApp).", times ? `Times that suit me: ${times}.` : null, note].filter(Boolean).join(" ")
  );
  return { sent: true as const, to: "physio" as const, name: displayName(care.physio), physio_name: displayName(care.physio) };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. What Joy needs to greet a patient in care (joyOperations patient_care_summary)
// ─────────────────────────────────────────────────────────────────────────────

export async function careSummaryForJoy(ctx: QueryCtx, patient: Doc<"users">) {
  const care = await currentCare(ctx, patient._id);
  const programs = (
    await ctx.db
      .query("exercisePrograms")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .order("desc")
      .take(10)
  ).filter((p) => p.status === "active");
  const programme = programs[0] ? await patientProgramView(ctx, programs[0]) : null;
  const upcoming = (
    await ctx.db
      .query("appointments")
      .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", patient._id).gte("startTime", Date.now()))
      .take(20)
  ).find((a) => !a.isRecordOnly && (a.status === "scheduled" || a.status === "confirmed"));
  const nextPhysio = upcoming ? await ctx.db.get(upcoming.physiotherapistId) : null;

  let careType: "rehabify_care" | "clinic" | "independent" | null = null;
  if (care) {
    careType = care.clinic ? "clinic" : (await isRehabifyCare(ctx, patient._id, care.rel.physiotherapistId)) ? "rehabify_care" : "independent";
  }
  const plan = await recoveryPlanForJoy(ctx, patient._id);
  return {
    has_physio: Boolean(care?.physio),
    first_name: firstName(patient),
    physio_id: care?.rel.physiotherapistId ?? null,
    physio_name: care?.physio ? displayName(care.physio) : null,
    clinic_name: care?.clinic?.name ?? null,
    care_type: careType,
    programme: programme
      ? {
          programme_id: programme._id,
          title: programme.title,
          sender_name: programme.clinicName ?? programme.senderName,
          items: programme.items.length,
          done_today: programme.doneToday.length,
          finished_today: Boolean(programme.finishedToday),
          locked: Boolean(programme.plan?.locked),
        }
      : null,
    next_appointment: upcoming
      ? {
          start_time: upcoming.startTime,
          end_time: upcoming.endTime,
          online: upcoming.appointmentType === "telehealth" || Boolean(upcoming.isOnline),
          physio_name: nextPhysio ? displayName(nextPhysio) : null,
          status: upcoming.status,
        }
      : null,
    joy_reminders_allowed: plan.joy_reminders_allowed,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. A 3D link Joy can send (gateway route programme_watch_link)
// ─────────────────────────────────────────────────────────────────────────────

/** The patient's newest active programme, if this WhatsApp number may see it. */
export const watchLinkTarget = internalQuery({
  args: { patientId: v.string(), senderPhone: v.string() },
  handler: async (ctx, args) => {
    const patientId = ctx.db.normalizeId("users", args.patientId);
    const patient = patientId ? await ctx.db.get(patientId) : null;
    if (!patient || patient.role !== "patient") return { ok: false as const, reason: "not_found" };
    const phone = normalizePhone(args.senderPhone);
    const allowed =
      Boolean(phone) &&
      (patient.whatsappLinkedPhone === phone ||
        normalizePhone(patient.phoneNumber ?? "") === phone ||
        patient.clerkId.startsWith("joy-whatsapp:"));
    if (!allowed) return { ok: false as const, reason: "not_linked" };
    const program = (
      await ctx.db
        .query("exercisePrograms")
        .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
        .order("desc")
        .take(10)
    ).find((p) => p.status === "active");
    if (!program) return { ok: false as const, reason: "no_programme" };
    return { ok: true as const, programId: program._id, createdBy: program.createdBy, patientId: patient._id };
  },
});

export const insertJoyWatchLink = internalMutation({
  args: {
    programId: v.id("exercisePrograms"),
    patientId: v.id("users"),
    createdBy: v.id("users"),
    tokenHash: v.string(),
    pinSalt: v.string(),
    pinHash: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("exerciseShareLinks", {
      ...args,
      pinSource: "phone",
      failedPins: 0,
      openCount: 0,
      createdAt: Date.now(),
    });
  },
});

export const createWatchLinkForJoy = internalAction({
  args: { patientId: v.string(), senderPhone: v.string() },
  handler: async (ctx, args): Promise<{ ok: true; url: string; programme_id: string; expires_at: number } | { ok: false; reason: string }> => {
    const target = await ctx.runQuery(internal.joyConnect.watchLinkTarget, args);
    if (!target.ok) return target;
    const pin = phoneLast4(args.senderPhone);
    if (!pin) return { ok: false, reason: "no_phone" };
    const token = randomToken(18);
    const salt = randomToken(16);
    const expiresAt = Date.now() + WATCH_LINK_DAYS * DAY;
    await ctx.runMutation(internal.joyConnect.insertJoyWatchLink, {
      programId: target.programId,
      patientId: target.patientId,
      createdBy: target.createdBy,
      tokenHash: await sha256Hex(token),
      pinSalt: salt,
      pinHash: await pinHash(salt, pin),
      expiresAt,
    });
    return { ok: true, url: `${publicAppUrl()}/x/${token}`, programme_id: target.programId, expires_at: expiresAt };
  },
});
