"use node";

/**
 * The parts of patient joining that need Node: Clerk logins, sign-in tickets and PIN hashing.
 * The records and rules are in convex/patientJoin.ts.
 */
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { v } from "convex/values";
import { action, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { publicAppUrl } from "../helpers/appUrl";
import { normalizePhone } from "../helpers/partnerShared";
import { pinLoginEmail } from "../../lib/auth/joyLoginEmail";
import { weakPinReason } from "../../lib/auth/pin";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;
const SIGN_IN_TOKEN_TTL_SECONDS = 10 * 60;
// Stored as "pbkdf2$<iterations>$<hex>" so the cost can be raised later without breaking old PINs
const PIN_ITERATIONS = 120_000;

function newCode() {
  const limit = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;
  let code = "";
  while (code.length < CODE_LENGTH) {
    for (const byte of randomBytes(CODE_LENGTH * 2)) {
      if (byte >= limit) continue;
      code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (code.length === CODE_LENGTH) break;
    }
  }
  return code;
}

function hashPin(pin: string, salt: string, iterations = PIN_ITERATIONS) {
  return `pbkdf2$${iterations}$${pbkdf2Sync(pin, salt, iterations, 32, "sha256").toString("hex")}`;
}

function pinMatches(pin: string, salt: string, stored: string) {
  const [scheme, rounds, hex] = stored.split("$");
  const iterations = Number(rounds);
  if (scheme !== "pbkdf2" || !Number.isFinite(iterations) || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  const actual = pbkdf2Sync(pin, salt, iterations, 32, "sha256");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** wa.me wants the international number without "+". */
function waNumber(phone?: string | null) {
  const e164 = normalizePhone(phone ?? "");
  return e164 ? e164.slice(1) : null;
}

async function clerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw Object.assign(new Error("CLERK_SECRET_KEY is not set"), { name: "ClerkNotConfigured" });
  const { createClerkClient } = await import("@clerk/backend");
  return createClerkClient({ secretKey });
}

/** Clerk's error code only; messages can echo personal details, which must stay out of logs. */
function clerkErrorCode(error: unknown) {
  const errors = (error as { errors?: { code?: string }[] })?.errors;
  return errors?.[0]?.code ?? (error instanceof Error ? error.name : "unknown");
}

type Clerk = Awaited<ReturnType<typeof clerkClient>>;

/** The patient's Clerk login on its private address; reuses one an earlier, interrupted try made. */
async function ensureClerkLogin(clerk: Clerk, patientId: string, firstName: string, lastName: string) {
  const email = pinLoginEmail(patientId);
  const { data: existing } = await clerk.users.getUserList({ emailAddress: [email] });
  const found = existing.find((user) => user.externalId === patientId);
  if (found) return { id: found.id, created: false };
  const created = await clerk.users.createUser({
    emailAddress: [email],
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    skipPasswordRequirement: true,
    externalId: patientId,
    publicMetadata: { role: "patient", source: "pin_login" },
  });
  return { id: created.id, created: true };
}

async function signInTicket(clerk: Clerk, clerkUserId: string) {
  const token = await clerk.signInTokens.createSignInToken({ userId: clerkUserId, expiresInSeconds: SIGN_IN_TOKEN_TTL_SECONDS });
  return token.token;
}

type Fail = { ok: false; reason: string; message?: string; attemptsLeft?: number; lockedUntil?: number; physioName?: string };
type Ticket = { ok: true; ticket: string } | { ok: true; ticket: null; reason: "signin_failed" };

function checkDetails(args: { firstName: string; lastName: string; phone: string; pin: string }): Fail | { phone: string } {
  if (!args.firstName.trim() || !args.lastName.trim()) return { ok: false, reason: "name", message: "Enter your first and last name." };
  const phone = normalizePhone(args.phone);
  if (!phone) return { ok: false, reason: "phone", message: "Check your phone number, e.g. 0803 123 4567." };
  const weak = weakPinReason(args.pin, phone);
  if (weak) return { ok: false, reason: "pin", message: weak };
  return { phone };
}

/** Mints the sign-in ticket; a Clerk hiccup here still leaves a working phone + PIN login. */
async function ticketFor(clerkUserId: string): Promise<Ticket> {
  try {
    return { ok: true, ticket: await signInTicket(await clerkClient(), clerkUserId) };
  } catch (error) {
    console.error("patient_join_sign_in_token_failed", { reason: clerkErrorCode(error) });
    return { ok: true, ticket: null, reason: "signin_failed" };
  }
}

/**
 * Creates (or reuses) the Clerk login for a placeholder record and runs `finish`. If finishing
 * fails, a login made just now is removed again so nothing is left behind.
 */
async function withNewLogin(
  patientId: string,
  names: { firstName: string; lastName: string },
  finish: (clerkUserId: string) => Promise<{ ok: true } | { ok: false; reason: string }>
): Promise<{ ok: true; clerkUserId: string } | Fail> {
  let clerk: Clerk;
  let login: { id: string; created: boolean };
  try {
    clerk = await clerkClient();
    login = await ensureClerkLogin(clerk, patientId, names.firstName, names.lastName);
  } catch (error) {
    console.error("patient_join_clerk_user_failed", { reason: clerkErrorCode(error) });
    return { ok: false, reason: "unavailable" };
  }
  const result = await finish(login.id);
  if (!result.ok) {
    if (login.created) await clerk.users.deleteUser(login.id).catch(() => undefined);
    return { ok: false, reason: result.reason };
  }
  return { ok: true, clerkUserId: login.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// The care team: "Send on WhatsApp"
// ─────────────────────────────────────────────────────────────────────────────

type InviteLink =
  | {
      ok: true;
      url: string;
      message: string;
      whatsappUrl: string;
      hasPhone: boolean;
      purpose: "join" | "reset";
      expiresAt: number;
    }
  | { ok: false; reason: "own_account" };

/**
 * The patient's personal link and a ready WhatsApp message to send from the physio's own phone.
 * A live link is reused, so every message sent stays valid until one is used.
 */
export const createInviteLink = action({
  args: { patientId: v.id("users") },
  handler: async (ctx, args): Promise<InviteLink> => {
    const info = await ctx.runQuery(internal.patientJoin.prepareInvite, { patientId: args.patientId });
    if (info.access === "own_account") return { ok: false, reason: "own_account" };
    const purpose: "join" | "reset" = info.access === "placeholder" ? "join" : "reset";

    let code = info.live && info.live.purpose === purpose ? info.live.code : null;
    let expiresAt = info.live?.expiresAt ?? 0;
    if (!code) {
      code = newCode();
      const stored = await ctx.runMutation(internal.patientJoin.storeInviteLink, {
        patientId: args.patientId,
        createdBy: info.userId,
        physioId: info.physioId,
        clinicId: info.clinicId,
        purpose,
        code,
      });
      expiresAt = stored.expiresAt;
    }

    const url = `${publicAppUrl().replace(/\/$/, "")}/j/${code}`;
    const hi = info.patientFirstName ? `Hi ${info.patientFirstName}` : "Hi";
    const message =
      purpose === "join"
        ? [
            info.fromClinic
              ? `${hi}, it's ${info.senderName}. We've added you to Rehabify so you can see your exercises and appointments, and message us.`
              : `${hi}, it's ${info.senderName}, your physiotherapist. I've added you to Rehabify so you can see your exercises and appointments, and message me.`,
            "",
            "Tap this link to join. It takes a minute and you don't need an email:",
            url,
          ].join("\n")
        : [`${hi}, here's your new Rehabify link. Tap it to choose a new PIN and sign in:`, url].join("\n");
    const number = waNumber(info.phone);
    return {
      ok: true,
      url,
      message,
      whatsappUrl: `https://wa.me/${number ?? ""}?text=${encodeURIComponent(message)}`,
      hasPhone: Boolean(number),
      purpose,
      expiresAt,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// The patient: /j/<code>
// ─────────────────────────────────────────────────────────────────────────────

const joinArgs = {
  firstName: v.string(),
  lastName: v.string(),
  phone: v.string(),
  pin: v.string(),
  // The Terms and Privacy versions the page showed
  accepted: v.record(v.string(), v.string()),
};

/** "Accept and start" on /j/<code>: sets up the login and PIN, then returns a sign-in ticket. */
export const completeJoin = action({
  args: { code: v.string(), ...joinArgs },
  handler: async (ctx, args): Promise<Ticket | Fail> => {
    const checked = checkDetails(args);
    if ("ok" in checked) return checked;
    const context = await ctx.runQuery(internal.patientJoin.joinContext, { code: args.code });
    if (!context.ok) return { ok: false, reason: context.reason };
    if (context.access === "own_account") return { ok: false, reason: "own_account" };

    const pinSalt = randomBytes(16).toString("hex");
    const record = {
      firstName: args.firstName,
      lastName: args.lastName,
      phone: checked.phone,
      pinSalt,
      pinHash: hashPin(args.pin, pinSalt),
      accepted: args.accepted,
    };
    const finish = (clerkUserId: string) =>
      ctx.runMutation(internal.patientJoin.finishJoin, { code: args.code, clerkUserId, ...record });

    let clerkUserId: string;
    if (context.access === "placeholder") {
      const made = await withNewLogin(context.patientId, args, finish);
      if (!made.ok) return made;
      clerkUserId = made.clerkUserId;
    } else {
      const result = await finish(context.clerkId);
      if (!result.ok) return { ok: false, reason: result.reason };
      clerkUserId = context.clerkId;
    }
    return await ticketFor(clerkUserId);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// The physio's own link: /join/<slug>
// ─────────────────────────────────────────────────────────────────────────────

type PinRow = { loginId: Id<"patientPinLogins">; clerkUserId: string; pinSalt: string; pinHash: string; lockedOut: boolean; lockedUntil: number | null };

type PinFail = { reason: string; attemptsLeft?: number; lockedUntil?: number };

/** Checks a PIN against the logins on a number and records the attempt. */
async function tryPin<T extends PinRow>(ctx: ActionCtx, rows: T[], pin: string): Promise<{ matched: T[]; fail: PinFail | null }> {
  const now = Date.now();
  const usable = rows.filter((row) => !row.lockedOut && !(row.lockedUntil && row.lockedUntil > now));
  if (usable.length === 0) {
    if (rows.some((row) => row.lockedOut)) return { matched: [], fail: { reason: "locked" } };
    return { matched: [], fail: { reason: "cooldown", lockedUntil: Math.min(...rows.map((row) => row.lockedUntil ?? now)) } };
  }
  const matched = usable.filter((row) => pinMatches(pin, row.pinSalt, row.pinHash));
  const result: PinFail = await ctx.runMutation(internal.patientJoin.recordPinAttempt, {
    loginIds: usable.map((row) => row.loginId),
    matchedLoginIds: matched.map((row) => row.loginId),
  });
  return { matched, fail: matched.length > 0 ? null : result };
}

/**
 * "Accept and start" on /join/<slug>. A number that already has a PIN login must enter that PIN
 * (then this physio is added to it); someone the physio already added is asked to wait for their
 * personal link; anyone else gets a new record in the physio's care.
 */
export const joinWithPhysioLink = action({
  args: { slug: v.string(), email: v.optional(v.string()), ...joinArgs },
  handler: async (ctx, args): Promise<(Ticket & { existing?: boolean }) | Fail> => {
    const checked = checkDetails(args);
    if ("ok" in checked) return checked;
    const context = await ctx.runQuery(internal.patientJoin.physioLinkContext, {
      slug: args.slug,
      phone: checked.phone,
      firstName: args.firstName,
    });
    if (!context.ok) return { ok: false, reason: context.reason };

    const pinRows: (PinRow & { userId: Id<"users"> })[] = context.pinRows;
    if (pinRows.length > 0) {
      const { matched, fail } = await tryPin(ctx, pinRows, args.pin);
      if (fail && fail.reason !== "wrong_pin") return { ok: false, ...fail };
      // This number already has an account: only its PIN adds this physio to it
      if (matched.length === 0) return { ok: false, reason: "phone_taken" };
      const row = matched[0];
      await ctx.runMutation(internal.patientJoin.linkExistingToPhysio, { patientId: row.userId, physioId: context.physioId });
      await ctx.runMutation(internal.patientJoin.markPinSignIn, { loginId: row.loginId });
      return { ...(await ticketFor(row.clerkUserId)), existing: true };
    }

    if (context.inCare?.mode === "already_added") {
      await ctx.runMutation(internal.patientJoin.askPhysioToSendLink, { patientId: context.inCare.patientId, physioId: context.physioId });
      return { ok: false, reason: "already_added", physioName: context.physioName };
    }
    if (context.busy && !context.inCare) return { ok: false, reason: "busy" };

    const patientId: Id<"users"> =
      context.inCare?.patientId ??
      (await ctx.runMutation(internal.patientJoin.createPhysioLinkPatient, {
        physioId: context.physioId,
        firstName: args.firstName,
        lastName: args.lastName,
        phone: checked.phone,
        email: args.email,
      }));

    const pinSalt = randomBytes(16).toString("hex");
    const made = await withNewLogin(patientId, args, (clerkUserId) =>
      ctx.runMutation(internal.patientJoin.finishPhysioLinkJoin, {
        patientId,
        physioId: context.physioId,
        clerkUserId,
        firstName: args.firstName,
        lastName: args.lastName,
        phone: checked.phone,
        pinSalt,
        pinHash: hashPin(args.pin, pinSalt),
        accepted: args.accepted,
      })
    );
    if (!made.ok) return made;
    return await ticketFor(made.clerkUserId);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Sign in with phone + PIN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Phone + PIN on /sign-in. Returns a one-time Clerk ticket. When two accounts on one number
 * (a family sharing a phone) have the same PIN, it returns their first names to choose from.
 */
export const signInWithPin = action({
  args: { phone: v.string(), pin: v.string(), loginId: v.optional(v.id("patientPinLogins")) },
  handler: async (
    ctx,
    args
  ): Promise<{ ok: true; ticket: string } | { ok: false; reason: "choose"; choices: { loginId: Id<"patientPinLogins">; firstName: string }[] } | Fail> => {
    const phone = normalizePhone(args.phone);
    if (!phone || !/^\d{4}$/.test(args.pin)) return { ok: false, reason: "wrong_pin" };
    const all: (PinRow & { firstName: string })[] = await ctx.runQuery(internal.patientJoin.pinLoginRows, { phone });
    const rows = args.loginId ? all.filter((row) => row.loginId === args.loginId) : all;
    if (rows.length === 0) return { ok: false, reason: "wrong_pin" };

    const { matched, fail } = await tryPin(ctx, rows, args.pin);
    if (fail || matched.length === 0) return { ok: false, ...(fail ?? { reason: "wrong_pin" }) };
    if (matched.length > 1) {
      return {
        ok: false,
        reason: "choose",
        choices: matched.map((row) => ({ loginId: row.loginId, firstName: all.find((r) => r.loginId === row.loginId)?.firstName ?? "Patient" })),
      };
    }
    await ctx.runMutation(internal.patientJoin.markPinSignIn, { loginId: matched[0].loginId });
    const ticket = await ticketFor(matched[0].clerkUserId);
    return ticket.ticket ? { ok: true, ticket: ticket.ticket } : { ok: false, reason: "unavailable" };
  },
});
