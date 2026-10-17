/**
 * PIN-protected links to a home exercise programme, for sending on WhatsApp.
 *
 * - The link is /x/<token>. Only the token's SHA-256 hash is stored, so a link can't be
 *   recovered from the database; sharing again makes a new link.
 * - The PIN is the last 4 digits of the patient's phone number, or a 4-digit PIN the physio sets
 *   and passes on separately. It is never put in the WhatsApp message, so a forwarded message
 *   doesn't open the programme.
 * - 5 wrong PINs lock the link for 15 minutes; 10 lock it for good (the physio sends a new one).
 * - A correct PIN creates a device session that lasts until the link expires.
 * - Links expire 7 days after the patient's treatment plan ends, or after 30 days when there's no
 *   end date. The care team can revoke or extend them.
 */
import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { publicAppUrl } from "./helpers/appUrl";
import { phoneLast4, pinHash, randomToken, sha256Hex } from "./helpers/exerciseCrypto";
import { displayName, linkByCode, linkState, requireCareTeam, resolveShareSession } from "./helpers/exerciseAccess";
import { programView, startOfLagosDay } from "./exercisePrograms";

const DAY = 86_400_000;
const MAX_DAYS = 180;
const SOFT_LOCK_AFTER = 5;
const HARD_LOCK_AFTER = 10;
const SOFT_LOCK_MS = 15 * 60_000;

/** wa.me wants the international number without "+"; Nigerian local numbers start with 0. */
function whatsappNumber(phone?: string | null) {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = `234${digits.slice(1)}`;
  else if (digits.length === 10 && /^[789]/.test(digits)) digits = `234${digits}`;
  return digits.length >= 10 ? digits : null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "16 November 2026" in Lagos time (UTC+1, no DST), without relying on Intl time zone data. */
function formatDay(ms: number) {
  const d = new Date(ms + 3_600_000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Care team
// ─────────────────────────────────────────────────────────────────────────────

export const prepareLink = internalQuery({
  args: { programId: v.id("exercisePrograms") },
  handler: async (ctx, args) => {
    const program = await ctx.db.get(args.programId);
    if (!program || program.status !== "active") throw new ConvexError("This programme isn't active.");
    const team = await requireCareTeam(ctx, program.patientId, { write: true });
    const patient = await ctx.db.get(program.patientId);
    const plan = program.treatmentPlanId ? await ctx.db.get(program.treatmentPlanId) : null;
    return {
      senderName: team.senderName,
      patientFirstName: patient?.firstName ?? null,
      phone: patient?.phoneNumber ?? null,
      planEndsAt: plan?.status === "active" && plan.endDate ? plan.endDate : null,
    };
  },
});

export const insertLink = internalMutation({
  args: {
    programId: v.id("exercisePrograms"),
    tokenHash: v.string(),
    pinSalt: v.string(),
    pinHash: v.string(),
    pinSource: v.union(v.literal("phone"), v.literal("custom")),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const program = await ctx.db.get(args.programId);
    if (!program) throw new ConvexError("Programme not found.");
    const team = await requireCareTeam(ctx, program.patientId, { write: true });
    await ctx.db.insert("exerciseShareLinks", {
      ...args,
      patientId: program.patientId,
      createdBy: team.user._id,
      failedPins: 0,
      openCount: 0,
      createdAt: Date.now(),
    });
  },
});

/**
 * Makes a new link. Returns the link (once; only its hash is kept), a WhatsApp message and a
 * wa.me URL addressed to the patient.
 */
export const createShareLink = action({
  args: {
    programId: v.id("exercisePrograms"),
    expiresInDays: v.optional(v.number()),
    untilPlanEnds: v.optional(v.boolean()),
    customPin: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    url: string;
    message: string;
    whatsappUrl: string;
    expiresAt: number;
    pinSource: "phone" | "custom";
    pinHint: string;
  }> => {
    const info: { senderName: string; patientFirstName: string | null; phone: string | null; planEndsAt: number | null } =
      await ctx.runQuery(internal.exerciseShareLinks.prepareLink, { programId: args.programId });

    let pin: string;
    let pinSource: "phone" | "custom";
    if (args.customPin !== undefined) {
      if (!/^\d{4}$/.test(args.customPin)) throw new ConvexError("The PIN must be 4 digits.");
      pin = args.customPin;
      pinSource = "custom";
    } else {
      const last4 = phoneLast4(info.phone);
      if (!last4) throw new ConvexError("This patient has no phone number on file. Set a 4-digit PIN instead.");
      pin = last4;
      pinSource = "phone";
    }

    const now = Date.now();
    let expiresAt: number;
    if (args.untilPlanEnds && info.planEndsAt && info.planEndsAt > now) {
      expiresAt = info.planEndsAt + 7 * DAY;
    } else {
      const days = Math.round(args.expiresInDays ?? 30);
      if (days < 1 || days > MAX_DAYS) throw new ConvexError(`Choose between 1 and ${MAX_DAYS} days.`);
      expiresAt = now + days * DAY;
    }
    expiresAt = Math.min(expiresAt, now + MAX_DAYS * DAY);

    const token = randomToken(18);
    const salt = randomToken(16);
    await ctx.runMutation(internal.exerciseShareLinks.insertLink, {
      programId: args.programId,
      tokenHash: await sha256Hex(token),
      pinSalt: salt,
      pinHash: await pinHash(salt, pin),
      pinSource,
      expiresAt,
    });

    const url = `${publicAppUrl()}/x/${token}`;
    const greeting = info.patientFirstName ? `Hi ${info.patientFirstName}` : "Hi";
    const pinLine =
      pinSource === "phone"
        ? "To open them, enter the last 4 digits of your phone number."
        : `To open them, enter the 4-digit PIN ${info.senderName} gives you.`;
    const message = [
      `${greeting}, ${info.senderName} has sent you your home exercises on Rehabify.`,
      "",
      `Open them here: ${url}`,
      "",
      pinLine,
      `The link works until ${formatDay(expiresAt)}.`,
    ].join("\n");
    const number = whatsappNumber(info.phone);
    const whatsappUrl = `https://wa.me/${number ?? ""}?text=${encodeURIComponent(message)}`;
    return {
      url,
      message,
      whatsappUrl,
      expiresAt,
      pinSource,
      pinHint: pinSource === "phone" ? `last 4 digits of their phone (…${pin})` : `the PIN you set (${pin}); tell them separately`,
    };
  },
});

export const revokeShareLink = mutation({
  args: { linkId: v.id("exerciseShareLinks") },
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new ConvexError("Link not found.");
    await requireCareTeam(ctx, link.patientId, { write: true });
    await ctx.db.patch(args.linkId, { revokedAt: Date.now() });
    for (const s of await ctx.db.query("exerciseShareSessions").withIndex("by_link", (q) => q.eq("linkId", args.linkId)).collect()) {
      await ctx.db.delete(s._id);
    }
  },
});

/** Pushes the expiry out (from now) and clears a temporary lock. */
export const extendShareLink = mutation({
  args: { linkId: v.id("exerciseShareLinks"), days: v.number() },
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new ConvexError("Link not found.");
    await requireCareTeam(ctx, link.patientId, { write: true });
    if (link.revokedAt || link.lockedOut) throw new ConvexError("This link can't be reopened. Send a new one.");
    const days = Math.round(args.days);
    if (days < 1 || days > MAX_DAYS) throw new ConvexError(`Choose between 1 and ${MAX_DAYS} days.`);
    const expiresAt = Date.now() + days * DAY;
    await ctx.db.patch(args.linkId, { expiresAt, lockedUntil: undefined, failedPins: 0 });
    for (const s of await ctx.db.query("exerciseShareSessions").withIndex("by_link", (q) => q.eq("linkId", args.linkId)).collect()) {
      await ctx.db.patch(s._id, { expiresAt });
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Patient (no account): open, unlock, view
// ─────────────────────────────────────────────────────────────────────────────

/** What the link page shows before the PIN. Nothing about the patient or their condition. */
export const linkStatus = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const link = await linkByCode(ctx, args.code);
    const state = linkState(link);
    if (state !== "ok" || !link) return { state };
    const program = await ctx.db.get(link.programId);
    if (!program || program.status !== "active") return { state: "revoked" as const };
    const clinic = program.clinicId ? await ctx.db.get(program.clinicId) : null;
    const senderName = clinic?.name ?? displayName(await ctx.db.get(program.createdBy));
    const lockedUntil = link.lockedUntil && link.lockedUntil > Date.now() ? link.lockedUntil : null;
    return { state: lockedUntil ? ("cooldown" as const) : ("needs_pin" as const), senderName, pinSource: link.pinSource, lockedUntil, expiresAt: link.expiresAt };
  },
});

export const verifyPin = internalMutation({
  args: { code: v.string(), pin: v.string(), sessionHash: v.string() },
  handler: async (ctx, args) => {
    const link = await linkByCode(ctx, args.code);
    const state = linkState(link);
    if (state !== "ok" || !link) return { ok: false as const, reason: state };
    const now = Date.now();
    if (link.lockedUntil && link.lockedUntil > now) return { ok: false as const, reason: "cooldown" as const, lockedUntil: link.lockedUntil };

    if ((await pinHash(link.pinSalt, args.pin)) !== link.pinHash) {
      const failedPins = link.failedPins + 1;
      const lockedOut = failedPins >= HARD_LOCK_AFTER;
      const lockedUntil = !lockedOut && failedPins % SOFT_LOCK_AFTER === 0 ? now + SOFT_LOCK_MS : undefined;
      await ctx.db.patch(link._id, { failedPins, lockedOut: lockedOut || undefined, lockedUntil });
      if (lockedOut) return { ok: false as const, reason: "locked" as const };
      if (lockedUntil) return { ok: false as const, reason: "cooldown" as const, lockedUntil };
      return { ok: false as const, reason: "wrong_pin" as const, attemptsLeft: SOFT_LOCK_AFTER - (failedPins % SOFT_LOCK_AFTER) };
    }

    await ctx.db.patch(link._id, { failedPins: 0, lockedUntil: undefined });
    await ctx.db.insert("exerciseShareSessions", { linkId: link._id, sessionHash: args.sessionHash, expiresAt: link.expiresAt, createdAt: now });
    return { ok: true as const };
  },
});

/** Checks the PIN; on success returns a device session for this link (kept in the browser). */
export const unlockShareLink = action({
  args: { code: v.string(), pin: v.string() },
  handler: async (ctx, args): Promise<
    | { ok: true; session: string }
    | { ok: false; reason: string; attemptsLeft?: number; lockedUntil?: number }
  > => {
    if (!/^\d{4}$/.test(args.pin)) return { ok: false, reason: "wrong_pin" };
    const session = randomToken(32);
    const result = await ctx.runMutation(internal.exerciseShareLinks.verifyPin, {
      code: args.code,
      pin: args.pin,
      sessionHash: await sha256Hex(session),
    });
    return result.ok ? { ok: true, session } : result;
  },
});

/** The programme behind an unlocked link. */
export const sharedProgram = query({
  args: { code: v.string(), session: v.string() },
  handler: async (ctx, args) => {
    const res = await resolveShareSession(ctx, args.code, args.session);
    if (!res.ok) return { ok: false as const, reason: res.reason };
    const today = await ctx.db
      .query("exerciseProgramLogs")
      .withIndex("by_program", (q) => q.eq("programId", res.program._id).gt("createdAt", startOfLagosDay()))
      .collect();
    const patient = await ctx.db.get(res.program.patientId);
    return {
      ok: true as const,
      patientFirstName: patient?.firstName ?? null,
      expiresAt: res.link.expiresAt,
      program: await programView(ctx, res.program),
      doneToday: [...new Set(today.map((l) => l.itemIndex))],
    };
  },
});
