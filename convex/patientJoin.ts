/**
 * Patients join from their physio's WhatsApp message, without email (owner, 11 Nov 2026).
 *
 * 1. Personal link /j/<code>: the physio or clinic adds the patient (name + phone), then taps
 *    "Send on WhatsApp". Their own WhatsApp opens with a ready message carrying the link, so no
 *    Joy and no Meta approval. The patient checks their name, chooses a 4-digit PIN, taps
 *    "Accept and start" and is signed in. Sending again later gives a "choose a new PIN" link.
 * 2. Physio's own link /join/<slug> (their booking slug): new patients type their own name and
 *    phone. A phone and name matching someone the physio already added is never merged: typed
 *    details aren't proof, so the physio is asked to send that patient their personal link.
 * 3. Phone + PIN sign-in (/sign-in): the PIN is checked here, then a one-time Clerk sign-in
 *    ticket opens the session. Clerk only sees a private placeholder address
 *    (lib/auth/joyLoginEmail.ts pinLoginEmail): no paid Clerk phone sign-in.
 *
 * The Clerk calls and the PIN hashing (PBKDF2) live in actions/patientJoin.ts; this file holds
 * the records and the rules.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { displayName, requireCareTeam } from "./helpers/exerciseAccess";
import { currentUser, findRelationship, isApproved } from "./helpers/careAccess";
import { requireClinicWrite } from "./clinicTools";
import { isPlaceholderUser, patientsByPhone } from "./helpers/whatsappLink";
import { normalizePhone } from "./helpers/partnerShared";
import { insertNotification } from "./helpers/pushNotify";
import { recordMissingPolicyAcceptances } from "./helpers/policyAcceptance";
import { ensureUserNumbers } from "./helpers/rehabifyIds";
import { isJoyLoginEmail } from "../lib/auth/joyLoginEmail";
import { accountKind, patientJoinStatus, pinLoginOf } from "./helpers/patientJoinStatus";
import { PATIENT_CONSENT_POLICIES } from "../lib/policies";

const DAY = 86_400_000;
export const JOIN_LINK_DAYS = 30;
const SOFT_LOCK_AFTER = 5;
const HARD_LOCK_AFTER = 10;
const SOFT_LOCK_MS = 15 * 60_000;
const PHYSIO_LINK_JOINS_PER_DAY = 50;
// No 0/O or 1/I/L: the code may be read off a screen
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const JOIN_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/;

/** "k7p3-xq2m ab" → "K7P3XQ2MAB" */
function cleanCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function cleanName(value: string | undefined, max = 60) {
  const text = (value ?? "").trim().replace(/\s+/g, " ");
  return text ? text.slice(0, max) : "";
}

/** "paul francis" or "PAUL FRANCIS" → "Paul Francis"; names typed in mixed case are left alone. */
function properName(name: string) {
  if (name !== name.toLowerCase() && name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

function niceName(user: Doc<"users"> | null | undefined, fallback?: string) {
  return properName(displayName(user, fallback));
}

function firstNameOf(user: Pick<Doc<"users">, "firstName"> | null | undefined) {
  const name = (user?.firstName ?? "").trim();
  return name && name !== "Patient" ? properName(name) : null;
}

/** +2348031234567 → 0803 123 4567; other numbers as stored. */
function localPhone(phone?: string | null) {
  const e164 = normalizePhone(phone ?? "");
  if (!e164) return phone ?? "";
  if (!e164.startsWith("+234")) return e164;
  const local = `0${e164.slice(4)}`;
  return local.length === 11 ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : local;
}

type LinkState = "ok" | "used" | "expired" | "not_found";

function linkState(link: Doc<"patientJoinLinks"> | null, now = Date.now()): LinkState {
  if (!link) return "not_found";
  if (link.usedAt) return "used";
  if (link.expiresAt <= now) return "expired";
  return "ok";
}

async function linkByCode(ctx: QueryCtx | MutationCtx, raw: string) {
  const code = cleanCode(raw);
  if (!JOIN_CODE.test(code)) return null;
  return await ctx.db.query("patientJoinLinks").withIndex("by_code", (q) => q.eq("code", code)).first();
}

async function liveLink(ctx: QueryCtx | MutationCtx, patientId: Id<"users">) {
  const now = Date.now();
  const rows = await ctx.db
    .query("patientJoinLinks")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .order("desc")
    .take(5);
  return rows.find((row) => linkState(row, now) === "ok") ?? null;
}

/** Who the patient sees on the join page: their physio, and the clinic for a clinic's patient. */
async function senderFor(ctx: QueryCtx | MutationCtx, physioId?: Id<"users">, clinicId?: Id<"clinics">) {
  const physio = physioId ? await ctx.db.get(physioId) : null;
  const clinic = clinicId ? await ctx.db.get(clinicId) : null;
  return {
    physioName: physio ? niceName(physio) : null,
    physioImageUrl: physio?.imageUrl ?? null,
    clinicName: clinic?.name ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. The care team sends the personal link
// ─────────────────────────────────────────────────────────────────────────────

/** Care-team check for sending a link, plus what the message needs. */
export const prepareInvite = internalQuery({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    const team = await requireCareTeam(ctx, args.patientId, { write: false });
    let physioId: Id<"users"> | undefined;
    if (team.kind === "physio") {
      // A physio whose care of this patient has ended can't send it any more
      const rel = await findRelationship(ctx, team.user._id, args.patientId);
      if (rel?.status !== "active") throw new ConvexError("This patient isn't in your care.");
      physioId = team.user._id;
    } else {
      await requireClinicWrite(ctx, "patients");
      const rels = (
        await ctx.db
          .query("patientPhysiotherapistRelationships")
          .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
          .collect()
      ).filter((r) => r.status === "active" && r.clinicId === team.clinicId);
      physioId = (rels.find((r) => r.isPrimaryPhysiotherapist) ?? rels[0])?.physiotherapistId;
    }
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.role !== "patient") throw new ConvexError("Patient not found.");
    const live = await liveLink(ctx, args.patientId);
    return {
      userId: team.user._id,
      fromClinic: team.kind === "clinic",
      senderName: team.kind === "clinic" ? team.senderName : niceName(team.user),
      physioId,
      clinicId: team.clinicId,
      patientFirstName: firstNameOf(patient),
      phone: patient.phoneNumber ?? null,
      access: await accountKind(ctx, patient),
      live: live ? { code: live.code, purpose: live.purpose, expiresAt: live.expiresAt } : null,
    };
  },
});

/** Stores a new link (the code is made in the action) and retires the patient's older live ones. */
export const storeInviteLink = internalMutation({
  args: {
    patientId: v.id("users"),
    createdBy: v.id("users"),
    physioId: v.optional(v.id("users")),
    clinicId: v.optional(v.id("clinics")),
    purpose: v.union(v.literal("join"), v.literal("reset")),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const old of await ctx.db.query("patientJoinLinks").withIndex("by_patient", (q) => q.eq("patientId", args.patientId)).collect()) {
      if (!old.usedAt && old.expiresAt > now) await ctx.db.patch(old._id, { expiresAt: now });
    }
    const expiresAt = now + JOIN_LINK_DAYS * DAY;
    await ctx.db.insert("patientJoinLinks", { ...args, createdAt: now, expiresAt });
    return { expiresAt };
  },
});

/** "Send on WhatsApp" was tapped: shows as Invited on the patient lists. */
export const markInviteSent = mutation({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    await requireCareTeam(ctx, args.patientId, { write: false });
    const live = await liveLink(ctx, args.patientId);
    if (live) await ctx.db.patch(live._id, { sentAt: Date.now() });
    return null;
  },
});

/** The invite status of one patient, for the workspace header and record pages. */
export const getJoinStatus = query({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    const viewer = await currentUser(ctx);
    if (!viewer) return null;
    try {
      await requireCareTeam(ctx, args.patientId, { write: false });
    } catch {
      return null;
    }
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.role !== "patient") return null;
    return await patientJoinStatus(ctx, patient);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. The patient opens /j/<code>
// ─────────────────────────────────────────────────────────────────────────────

/** What /j/<code> shows. The link went to the patient's own WhatsApp, so it shows their name and number. */
export const getJoinPage = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const link = await linkByCode(ctx, args.code);
    const state = linkState(link);
    if (!link) return { state: "not_found" as const };
    const sender = await senderFor(ctx, link.physioId, link.clinicId);
    if (state !== "ok") return { state, ...sender };
    const patient = await ctx.db.get(link.patientId);
    if (!patient || patient.role !== "patient") return { state: "not_found" as const };
    const viewer = await currentUser(ctx);
    const access = await accountKind(ctx, patient);
    return {
      state: "ok" as const,
      ...sender,
      purpose: link.purpose,
      access,
      viewer: viewer ? (viewer._id === patient._id ? ("this_patient" as const) : ("someone_else" as const)) : ("signed_out" as const),
      patient: {
        firstName: firstNameOf(patient) ?? "",
        lastName: patient.lastName ?? "",
        phone: localPhone(patient.phoneNumber),
      },
    };
  },
});

/** The page was opened (from the browser, so WhatsApp's link preview doesn't count). */
export const markJoinOpened = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const link = await linkByCode(ctx, args.code);
    if (link && linkState(link) === "ok" && !link.openedAt) await ctx.db.patch(link._id, { openedAt: Date.now() });
    return null;
  },
});

/** What the join action needs before it creates the Clerk login. */
export const joinContext = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const link = await linkByCode(ctx, args.code);
    const state = linkState(link);
    if (!link || state !== "ok") return { ok: false as const, reason: state };
    const patient = await ctx.db.get(link.patientId);
    if (!patient || patient.role !== "patient") return { ok: false as const, reason: "not_found" as const };
    return {
      ok: true as const,
      patientId: patient._id,
      access: await accountKind(ctx, patient),
      clerkId: patient.clerkId,
    };
  },
});

const pinArgs = {
  clerkUserId: v.string(),
  firstName: v.string(),
  lastName: v.string(),
  phone: v.string(),
  pinSalt: v.string(),
  pinHash: v.string(),
  accepted: v.record(v.string(), v.string()),
};

type PinAccountInput = {
  clerkUserId: string;
  firstName: string;
  lastName: string;
  phone: string;
  pinSalt: string;
  pinHash: string;
  accepted: Record<string, string>;
};

/**
 * Gives the record its login and PIN. A placeholder record takes the new Clerk user (a stray row
 * the Clerk webhook made for it first is removed); a record that already has a Rehabify-made
 * login keeps it and just gets the new PIN.
 */
async function attachPinLogin(
  ctx: MutationCtx,
  patient: Doc<"users">,
  input: PinAccountInput,
  context: { type: string; id: string }
): Promise<{ ok: true } | { ok: false; reason: "own_account" | "clash" | "bad_phone" }> {
  const kind = await accountKind(ctx, patient);
  if (kind === "own_account") return { ok: false, reason: "own_account" };
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, reason: "bad_phone" };

  if (kind === "placeholder") {
    const clash = await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", input.clerkUserId)).first();
    if (clash && clash._id !== patient._id) {
      // The Clerk webhook can arrive before this and insert an empty row for the new login
      const stray = !clash.role && !clash.onboarded && (!clash.email || isJoyLoginEmail(clash.email));
      if (!stray) return { ok: false, reason: "clash" };
      await ctx.db.delete(clash._id);
    }
    await ctx.db.patch(patient._id, { clerkId: input.clerkUserId, onboarded: true });
  } else if (patient.clerkId !== input.clerkUserId) {
    return { ok: false, reason: "clash" };
  }

  const firstName = cleanName(input.firstName);
  const lastName = cleanName(input.lastName);
  await ctx.db.patch(patient._id, {
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    phoneNumber: phone,
  });

  const now = Date.now();
  const existing = await pinLoginOf(ctx, patient._id);
  const pin = { phone, pinSalt: input.pinSalt, pinHash: input.pinHash, failedPins: 0, lockedUntil: undefined, lockedOut: undefined, updatedAt: now };
  if (existing) await ctx.db.patch(existing._id, pin);
  else await ctx.db.insert("patientPinLogins", { ...pin, userId: patient._id, createdAt: now });

  const fresh = await ctx.db.get(patient._id);
  if (fresh) {
    await recordMissingPolicyAcceptances(ctx, {
      user: { ...fresh, email: isJoyLoginEmail(fresh.email) ? undefined : fresh.email },
      documents: PATIENT_CONSENT_POLICIES,
      accepted: input.accepted,
      channel: "web",
      contextType: context.type,
      contextId: context.id,
    });
  }
  return { ok: true };
}

async function tellPhysioJoined(ctx: MutationCtx, physioId: Id<"users"> | undefined, patient: Doc<"users">, how: "invite" | "link") {
  if (!physioId) return;
  const name = niceName(patient, "Your patient");
  await insertNotification(ctx, {
    userId: physioId,
    type: "patient_joined",
    priority: "medium",
    status: "pending",
    createdAt: Date.now(),
    payload: {
      title: how === "link" ? `${name} joined with your link` : `${name} joined Rehabify`,
      body: "They can now see their exercises, appointments and messages from you.",
      data: { entityId: String(patient._id), entityType: "patient" },
      link: `/dashboard/physiotherapist/patients/${patient._id}`,
    },
  });
}

/** Finishes /j/<code>: the PIN is set, the link is used up, and the physio hears they joined. */
export const finishJoin = internalMutation({
  args: { code: v.string(), ...pinArgs },
  handler: async (ctx, args) => {
    const link = await linkByCode(ctx, args.code);
    const state = linkState(link);
    if (!link || state !== "ok") return { ok: false as const, reason: state };
    const patient = await ctx.db.get(link.patientId);
    if (!patient || patient.role !== "patient") return { ok: false as const, reason: "not_found" as const };
    const wasPlaceholder = isPlaceholderUser(patient);
    const { code: _code, ...input } = args;
    const result = await attachPinLogin(ctx, patient, input, { type: "physio_invite", id: String(link._id) });
    if (!result.ok) return result;
    const now = Date.now();
    await ctx.db.patch(link._id, { usedAt: now, openedAt: link.openedAt ?? now });
    if (wasPlaceholder) {
      const joined = await ctx.db.get(patient._id);
      if (joined) await tellPhysioJoined(ctx, link.physioId, joined, "invite");
    }
    return { ok: true as const };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. The physio's own link: /join/<slug>
// ─────────────────────────────────────────────────────────────────────────────

async function physioBySlug(ctx: QueryCtx | MutationCtx, slug: string) {
  const clean = slug.trim().toLowerCase();
  if (!clean || clean.length > 80) return null;
  const profile = await ctx.db
    .query("physiotherapistProfiles")
    .withIndex("by_bookingSlug", (q) => q.eq("bookingSlug", clean))
    .first();
  const physio = profile ? await ctx.db.get(profile.userId) : null;
  if (!physio || physio.role !== "physiotherapist") return null;
  if (!(await isApproved(ctx, physio._id))) return null;
  return physio;
}

/** What /join/<slug> shows: the physio, and who is signed in on this device. */
export const getPhysioLinkPage = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const physio = await physioBySlug(ctx, args.slug);
    if (!physio) return { state: "not_found" as const };
    const clinic = physio.clinicId ? await ctx.db.get(physio.clinicId) : null;
    const viewer = await currentUser(ctx);
    let signedIn: { role: string | null; firstName: string | null; alreadyLinked: boolean } | null = null;
    if (viewer) {
      const rel = viewer.role === "patient" ? await findRelationship(ctx, physio._id, viewer._id) : null;
      signedIn = { role: viewer.role ?? null, firstName: firstNameOf(viewer), alreadyLinked: rel?.status === "active" };
    }
    return {
      state: "ok" as const,
      physioName: niceName(physio),
      physioImageUrl: physio.imageUrl ?? null,
      clinicName: clinic?.name ?? null,
      signedIn,
    };
  },
});

/** Everything the /join/<slug> action needs to decide: existing PIN logins on this number, and a match in this physio's care. */
export const physioLinkContext = internalQuery({
  args: { slug: v.string(), phone: v.string(), firstName: v.string() },
  handler: async (ctx, args) => {
    const physio = await physioBySlug(ctx, args.slug);
    if (!physio) return { ok: false as const, reason: "not_found" as const };

    const since = Date.now() - DAY;
    const recent = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physio._id))
      .order("desc")
      .take(200);
    const joinedToday = recent.filter((r) => r.source === "physio_link" && r.startDate > since).length;

    const logins = await ctx.db.query("patientPinLogins").withIndex("by_phone", (q) => q.eq("phone", args.phone)).collect();
    const pinRows = [];
    for (const row of logins) {
      const user = await ctx.db.get(row.userId);
      if (!user || user.role !== "patient" || isPlaceholderUser(user)) continue;
      pinRows.push({
        loginId: row._id,
        userId: row.userId,
        clerkUserId: user.clerkId,
        pinSalt: row.pinSalt,
        pinHash: row.pinHash,
        lockedOut: Boolean(row.lockedOut),
        lockedUntil: row.lockedUntil ?? null,
      });
    }

    // Someone with this number and first name already in this physio's care, without a login yet
    const first = cleanName(args.firstName).toLowerCase();
    let inCare: { mode: "reuse" | "already_added"; patientId: Id<"users"> } | null = null;
    for (const candidate of await patientsByPhone(ctx, args.phone)) {
      if (!isPlaceholderUser(candidate) || (candidate.firstName ?? "").trim().toLowerCase() !== first) continue;
      const rel = await findRelationship(ctx, physio._id, candidate._id);
      if (rel?.status !== "active") continue;
      // An earlier try on this page that stopped half way: carry on with it
      inCare = { mode: rel.source === "physio_link" ? "reuse" : "already_added", patientId: candidate._id };
      break;
    }

    return {
      ok: true as const,
      physioId: physio._id,
      physioName: niceName(physio),
      busy: joinedToday >= PHYSIO_LINK_JOINS_PER_DAY,
      pinRows,
      inCare,
    };
  },
});

/** A new patient from the physio's link: a record in their care, like "Add patient" makes. */
export const createPhysioLinkPatient = internalMutation({
  args: { physioId: v.id("users"), firstName: v.string(), lastName: v.string(), phone: v.string(), email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const physio = await ctx.db.get(args.physioId);
    if (!physio) throw new ConvexError("This link isn't working right now.");
    const clinicId = physio.clinicId ?? undefined;
    const clinic = clinicId ? await ctx.db.get(clinicId) : null;
    const firstName = cleanName(args.firstName);
    const lastName = cleanName(args.lastName);
    if (!firstName || !lastName) throw new ConvexError("Enter your first and last name.");
    const phone = normalizePhone(args.phone);
    if (!phone) throw new ConvexError("Check your phone number.");

    // A typed email is kept as a contact only (never trusted for sign-in), and only if it's free
    let email = args.email?.trim().toLowerCase() || undefined;
    if (email && !/^\S+@\S+\.\S+$/.test(email)) email = undefined;
    if (email && (await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email!)).first())) email = undefined;

    const now = Date.now();
    const prefix = clinicId ? "clinic_patient_" : "physio_patient_";
    const patientId = await ctx.db.insert("users", {
      clerkId: `${prefix}${now}_${Math.random().toString(36).substring(2, 7)}`,
      email,
      firstName,
      lastName,
      phoneNumber: phone,
      role: "patient",
      onboarded: true,
      clinicId,
      status: "active",
      joinedAt: now,
    });
    await ensureUserNumbers(ctx, patientId);
    const profileId = await ctx.db.insert("patientProfiles", {
      userId: patientId,
      clinicId,
      gender: "prefer_not_to_say",
      city: clinic?.city,
    });
    await ctx.db.patch(patientId, { patientProfileId: profileId });
    await ctx.db.insert("patientPhysiotherapistRelationships", {
      patientId,
      physiotherapistId: physio._id,
      clinicId,
      isPrimaryPhysiotherapist: true,
      startDate: now,
      status: "active",
      source: "physio_link",
    });
    return patientId;
  },
});

/** Finishes a /join/<slug> sign-up once the Clerk login exists. */
export const finishPhysioLinkJoin = internalMutation({
  args: { patientId: v.id("users"), physioId: v.id("users"), ...pinArgs },
  handler: async (ctx, args) => {
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.role !== "patient") return { ok: false as const, reason: "not_found" as const };
    const { patientId: _p, physioId, ...input } = args;
    const result = await attachPinLogin(ctx, patient, input, { type: "physio_link", id: String(physioId) });
    if (!result.ok) return result;
    const joined = await ctx.db.get(patient._id);
    if (joined) await tellPhysioJoined(ctx, physioId, joined, "link");
    return { ok: true as const };
  },
});

/** Puts an existing patient account in this physio's care (from their link). */
async function linkToPhysio(ctx: MutationCtx, patient: Doc<"users">, physio: Doc<"users">) {
  const rel = await findRelationship(ctx, physio._id, patient._id);
  if (rel?.status === "active") return { added: false };
  const now = Date.now();
  if (rel) {
    await ctx.db.patch(rel._id, { status: "active", startDate: now, endDate: undefined, source: rel.source ?? "physio_link" });
  } else {
    const hasPrimary = (
      await ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_primary_physiotherapist", (q) => q.eq("patientId", patient._id).eq("isPrimaryPhysiotherapist", true))
        .collect()
    ).some((r) => r.status === "active");
    await ctx.db.insert("patientPhysiotherapistRelationships", {
      patientId: patient._id,
      physiotherapistId: physio._id,
      clinicId: physio.clinicId ?? undefined,
      isPrimaryPhysiotherapist: !hasPrimary,
      startDate: now,
      status: "active",
      source: "physio_link",
    });
  }
  await tellPhysioJoined(ctx, physio._id, patient, "link");
  return { added: true };
}

/** Phone + PIN matched an existing account on /join/<slug>: add this physio to it. */
export const linkExistingToPhysio = internalMutation({
  args: { patientId: v.id("users"), physioId: v.id("users") },
  handler: async (ctx, args) => {
    const patient = await ctx.db.get(args.patientId);
    const physio = await ctx.db.get(args.physioId);
    if (!patient || patient.role !== "patient" || !physio) return { added: false };
    return await linkToPhysio(ctx, patient, physio);
  },
});

/** A signed-in patient taps "Join" on /join/<slug>. */
export const joinPhysioSignedIn = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const viewer = await currentUser(ctx);
    if (!viewer) throw new ConvexError("Sign in to continue.");
    if (viewer.role !== "patient") throw new ConvexError("Only patient accounts can join a physiotherapist.");
    const physio = await physioBySlug(ctx, args.slug);
    if (!physio) throw new ConvexError("This link isn't working any more. Ask your physiotherapist for a new one.");
    return await linkToPhysio(ctx, viewer, physio);
  },
});

/** Someone the physio already added tried their general link: ask the physio to send the personal one. */
export const askPhysioToSendLink = internalMutation({
  args: { patientId: v.id("users"), physioId: v.id("users") },
  handler: async (ctx, args) => {
    const patient = await ctx.db.get(args.patientId);
    if (!patient) return null;
    // Once a day per patient is enough
    const recent = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_type", (q) => q.eq("userId", args.physioId).eq("type", "patient_join_request"))
      .order("desc")
      .take(30);
    const key = `send_link:${args.patientId}`;
    if (recent.some((n) => (n.payload?.data as { key?: string } | undefined)?.key === key && n.createdAt > Date.now() - DAY)) {
      return null;
    }
    const name = niceName(patient, "A patient");
    await insertNotification(ctx, {
      userId: args.physioId,
      type: "patient_join_request",
      priority: "high",
      status: "pending",
      createdAt: Date.now(),
      payload: {
        title: `${name} wants to join Rehabify`,
        body: "They tried your patient link. You've already added them, so send them their personal link on WhatsApp.",
        data: { entityId: String(patient._id), entityType: "patient", key },
        link: `/dashboard/physiotherapist/patients/${patient._id}?invite=1`,
      },
    });
    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Phone + PIN sign-in
// ─────────────────────────────────────────────────────────────────────────────

/** PIN logins on this number (E.164), with what the action needs to check the PIN. */
export const pinLoginRows = internalQuery({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("patientPinLogins").withIndex("by_phone", (q) => q.eq("phone", args.phone)).collect();
    const out = [];
    for (const row of rows) {
      const user = await ctx.db.get(row.userId);
      if (!user || user.role !== "patient" || isPlaceholderUser(user)) continue;
      out.push({
        loginId: row._id,
        clerkUserId: user.clerkId,
        firstName: firstNameOf(user) ?? "Patient",
        pinSalt: row.pinSalt,
        pinHash: row.pinHash,
        lockedOut: Boolean(row.lockedOut),
        lockedUntil: row.lockedUntil ?? null,
      });
    }
    return out;
  },
});

/**
 * Counts a PIN attempt. A match clears the count; otherwise every login tried on this number
 * gets a strike: 15 minutes' pause after every 5th, locked after 10 until a new link arrives.
 */
export const recordPinAttempt = internalMutation({
  args: { loginIds: v.array(v.id("patientPinLogins")), matchedLoginIds: v.array(v.id("patientPinLogins")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.matchedLoginIds.length > 0) {
      for (const id of args.matchedLoginIds) {
        const row = await ctx.db.get(id);
        // Locked meanwhile by another attempt: the match doesn't count
        if (!row || row.lockedOut || (row.lockedUntil && row.lockedUntil > now)) continue;
        await ctx.db.patch(id, { failedPins: 0, lockedUntil: undefined });
      }
      return { reason: "ok" as const };
    }
    let worst: { reason: "wrong_pin" | "cooldown" | "locked"; attemptsLeft?: number; lockedUntil?: number } = { reason: "wrong_pin" };
    for (const id of args.loginIds) {
      const row = await ctx.db.get(id);
      if (!row) continue;
      const failedPins = row.failedPins + 1;
      const lockedOut = failedPins >= HARD_LOCK_AFTER;
      const lockedUntil = !lockedOut && failedPins % SOFT_LOCK_AFTER === 0 ? now + SOFT_LOCK_MS : row.lockedUntil;
      await ctx.db.patch(id, { failedPins, lockedOut: lockedOut || undefined, lockedUntil, updatedAt: now });
      if (lockedOut) worst = { reason: "locked" };
      else if (lockedUntil && lockedUntil > now && worst.reason !== "locked") worst = { reason: "cooldown", lockedUntil };
      else if (worst.reason === "wrong_pin") {
        const left = SOFT_LOCK_AFTER - (failedPins % SOFT_LOCK_AFTER);
        worst = { reason: "wrong_pin", attemptsLeft: Math.min(worst.attemptsLeft ?? left, left) };
      }
    }
    return worst;
  },
});

/** After a successful PIN sign-in. */
export const markPinSignIn = internalMutation({
  args: { loginId: v.id("patientPinLogins") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.loginId);
    if (row) await ctx.db.patch(row._id, { lastSignInAt: Date.now() });
    return null;
  },
});

/** Settings: does this patient sign in with phone + PIN (and on which number)? */
export const myPinLogin = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await currentUser(ctx);
    if (!viewer || viewer.role !== "patient") return null;
    const row = await pinLoginOf(ctx, viewer._id);
    return row ? { phone: localPhone(row.phone) } : null;
  },
});
