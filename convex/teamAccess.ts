/**
 * Blog writer and Learn instructor access, given by an admin with just an email address or a
 * WhatsApp number (Admin › Platform › Blog & Learn access).
 *
 *  - The email or number belongs to an account: it becomes the role straight away (after the
 *    admin confirms, when the account already has another role). The old role is kept on the
 *    invite row and put back if the access is removed.
 *  - No account yet: a "pending" invite with a one-time link (/team-invite/<code>, 14 days). An
 *    email invite is emailed; a WhatsApp invite is sent by the admin from their own WhatsApp
 *    (the page opens it with the message ready). Whoever opens the link and signs in, with any
 *    login, accepts it (acceptTeamInvite). An email invite also applies by itself when someone
 *    signs up with that verified email (claimTeamInvite, called from both sign-up paths).
 *
 * Only the SHA-256 of a link code is stored; sending a link again makes a new one.
 * Blog writers see only the blog (convex/blog.ts); Learn instructors only Learn › Video courses
 * (convex/learn.ts). Both need an admin to publish.
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { publicAppUrl } from "./helpers/appUrl";
import { randomToken, sha256Hex } from "./helpers/exerciseCrypto";
import { requireAdmin } from "./helpers/partnerAccess";
import { normalizePhone } from "./helpers/partnerShared";
import { insertNotification } from "./helpers/pushNotify";
import { logSecurityEvent } from "./helpers/securityLog";
import { isJoyLoginEmail } from "../lib/auth/joyLoginEmail";

export const TEAM_ROLES = ["blog_editor", "learn_instructor"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
const teamRole = v.union(v.literal("blog_editor"), v.literal("learn_instructor"));

const ROLE_LABEL: Record<TeamRole, string> = { blog_editor: "Blog writer", learn_instructor: "Learn instructor" };
const ROLE_HOME: Record<TeamRole, string> = { blog_editor: "/dashboard/admin/blog", learn_instructor: "/dashboard/admin/learn/courses" };
const isTeamRole = (role: unknown): role is TeamRole => role === "blog_editor" || role === "learn_instructor";

/** Roles that can be put back when access is removed (never admin or another team role). */
const RESTORABLE = new Set(["physiotherapist", "clinic_owner", "patient", "family_member", "doctor", "partner", "clinic_staff"]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LINK_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

const sendTeamEmailRef = makeFunctionReference<
  "action",
  { kind: "invite" | "granted"; to: string; role: TeamRole; name?: string; link?: string },
  { success: boolean; error?: string }
>("actions/emails/sendTeamEmails:sendTeamEmail");

const personName = (u: Doc<"users"> | null) =>
  u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "Someone" : "Someone";

type Contact = { kind: "email"; email: string } | { kind: "phone"; phone: string };

/** An email address or a phone number, as typed by the admin. */
function readContact(raw: string): Contact {
  const value = raw.trim();
  if (value.includes("@")) {
    const email = value.toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 200) throw new ConvexError("Enter a valid email address.");
    if (isJoyLoginEmail(email)) throw new ConvexError("That is an internal WhatsApp login address. Use the person's real email or number.");
    return { kind: "email", email };
  }
  const phone = normalizePhone(value);
  if (!phone) throw new ConvexError("Enter a valid email address or WhatsApp number (for example 0803 123 4567 or +234 803 123 4567).");
  return { kind: "phone", phone };
}

/** The real account (a Clerk login, not a WhatsApp-only placeholder) with this email or number. */
async function accountFor(ctx: MutationCtx, contact: Contact) {
  const found: Doc<"users">[] = [];
  if (contact.kind === "email") {
    found.push(...(await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", contact.email)).take(5)));
  } else {
    // Numbers are stored as they arrived; try the usual spellings of the same Nigerian number
    const e164 = contact.phone;
    const spellings = new Set([e164, e164.slice(1), e164.startsWith("+234") ? `0${e164.slice(4)}` : e164]);
    for (const phone of spellings) {
      found.push(...(await ctx.db.query("users").withIndex("by_phone_number", (q) => q.eq("phoneNumber", phone)).take(5)));
    }
  }
  const real = found.filter((u) => !u.deletedAt && u.clerkId.startsWith("user_"));
  return real.sort((a, b) => b._creationTime - a._creationTime)[0] ?? null;
}

async function invitesFor(ctx: MutationCtx, contact: Contact) {
  return contact.kind === "email"
    ? await ctx.db.query("teamInvites").withIndex("by_email", (q) => q.eq("email", contact.email)).take(50)
    : await ctx.db.query("teamInvites").withIndex("by_phone", (q) => q.eq("phone", contact.phone)).take(50);
}

const newest = <T extends { updatedAt: number }>(rows: T[]) => rows.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;

/** A fresh one-time link for this invite (the previous link stops working). */
async function newLink(ctx: MutationCtx, inviteId: Id<"teamInvites">) {
  const code = randomToken(32);
  await ctx.db.patch(inviteId, { codeHash: await sha256Hex(code), codeExpiresAt: Date.now() + LINK_DAYS * DAY_MS });
  return `${publicAppUrl()}/team-invite/${code}`;
}

async function notify(ctx: MutationCtx, userId: Id<"users">, title: string, message: string, actionUrl: string) {
  const now = Date.now();
  await insertNotification(ctx, {
    userId,
    type: "system_alert",
    title,
    message,
    data: { actionUrl },
    status: "pending",
    priority: "medium",
    createdAt: now,
    updatedAt: now,
  });
}

/** Switches an account to a team role, remembering the role it had. */
async function giveRole(
  ctx: MutationCtx,
  target: Doc<"users">,
  role: TeamRole,
  opts: { by?: Id<"users">; via: string; previousRole?: string; inviteId?: Id<"teamInvites">; contact?: Contact }
) {
  const now = Date.now();
  const previousRole = isTeamRole(target.role) ? opts.previousRole : (target.role ?? undefined);
  await ctx.db.patch(target._id, { role, onboarded: true });
  await logSecurityEvent(ctx, "role_changed", {
    userId: target._id,
    details: { from: target.role ?? null, to: role, by: opts.by ?? null, via: opts.via },
  });
  if (opts.inviteId) {
    await ctx.db.patch(opts.inviteId, { status: "accepted", userId: target._id, previousRole, acceptedAt: now, updatedAt: now });
  } else {
    await ctx.db.insert("teamInvites", {
      ...(opts.contact?.kind === "email" ? { email: opts.contact.email } : {}),
      ...(opts.contact?.kind === "phone" ? { phone: opts.contact.phone } : {}),
      role,
      status: "accepted",
      invitedBy: opts.by ?? target._id,
      userId: target._id,
      previousRole,
      acceptedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin
// ─────────────────────────────────────────────────────────────────────────────

/** Everyone with blog or Learn access now, and the invites still waiting. */
export const adminTeamAccess = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const acceptedRows = await ctx.db.query("teamInvites").withIndex("by_status", (q) => q.eq("status", "accepted")).order("desc").take(1000);
    const members = [];
    for (const role of TEAM_ROLES) {
      const users = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", role)).take(300);
      for (const u of users) {
        if (u.deletedAt) continue;
        const accepted = newest(acceptedRows.filter((i) => i.userId === u._id && i.role === role));
        members.push({
          userId: u._id,
          name: personName(u),
          email: u.email && !isJoyLoginEmail(u.email) ? u.email : null,
          phone: u.phoneNumber ?? null,
          role,
          since: accepted?.acceptedAt ?? null,
          previousRole: accepted?.previousRole ?? null,
        });
      }
    }
    const now = Date.now();
    const pendingRows = await ctx.db.query("teamInvites").withIndex("by_status", (q) => q.eq("status", "pending")).order("desc").take(300);
    const pending = [];
    for (const invite of pendingRows) {
      pending.push({
        inviteId: invite._id,
        email: invite.email ?? null,
        phone: invite.phone ?? null,
        role: invite.role,
        invitedBy: personName(await ctx.db.get(invite.invitedBy)),
        createdAt: invite.createdAt,
        emailedAt: invite.emailedAt ?? null,
        linkExpired: !invite.codeExpiresAt || invite.codeExpiresAt < now,
      });
    }
    return { members: members.sort((a, b) => a.name.localeCompare(b.name)), pending };
  },
});

/**
 * Give someone blog or Learn access by email or WhatsApp number. Returns "confirm" (with their
 * current role) instead of switching an account that already has another role, until the admin
 * confirms. A new invite comes back with its one-time link, for WhatsApp.
 */
export const adminGrantTeamRole = mutation({
  args: { contact: v.string(), role: teamRole, confirm: v.optional(v.boolean()) },
  handler: async (
    ctx,
    args
  ): Promise<{
    status: "granted" | "invited" | "already" | "confirm";
    name?: string;
    currentRole?: string;
    channel?: "email" | "phone";
    phone?: string;
    link?: string;
  }> => {
    const { user: admin } = await requireAdmin(ctx);
    const contact = readContact(args.contact);
    const now = Date.now();
    const target = await accountFor(ctx, contact);
    const invites = await invitesFor(ctx, contact);

    if (target) {
      if (target.role === "admin") throw new ConvexError(`${personName(target)} is an administrator and can already use the blog and Learn.`);
      if (target.role === args.role) return { status: "already", name: personName(target) };
      if (target.role && !args.confirm) return { status: "confirm", name: personName(target), currentRole: target.role };
      for (const open of invites.filter((i) => i.status === "pending")) {
        await ctx.db.patch(open._id, { status: "revoked", revokedAt: now, updatedAt: now, codeHash: undefined });
      }
      const earlier = newest(invites.filter((i) => i.status !== "pending"));
      await giveRole(ctx, target, args.role, { by: admin._id, via: "team_access", previousRole: earlier?.previousRole, contact });
      await notify(ctx, target._id, `You're now a ${ROLE_LABEL[args.role]}`, `${personName(admin)} gave you ${ROLE_LABEL[args.role].toLowerCase()} access on Rehabify.`, ROLE_HOME[args.role]);
      if (target.email && !isJoyLoginEmail(target.email)) {
        await ctx.scheduler.runAfter(0, sendTeamEmailRef, { kind: "granted", to: target.email, role: args.role, name: target.firstName });
      }
      return { status: "granted", name: personName(target) };
    }

    const open = newest(invites.filter((i) => i.status === "pending"));
    let inviteId: Id<"teamInvites">;
    if (open) {
      await ctx.db.patch(open._id, { role: args.role, invitedBy: admin._id, updatedAt: now });
      inviteId = open._id;
    } else {
      inviteId = await ctx.db.insert("teamInvites", {
        ...(contact.kind === "email" ? { email: contact.email } : { phone: contact.phone }),
        role: args.role,
        status: "pending",
        invitedBy: admin._id,
        createdAt: now,
        updatedAt: now,
      });
    }
    const link = await newLink(ctx, inviteId);
    if (contact.kind === "email") {
      await ctx.db.patch(inviteId, { emailedAt: now });
      await ctx.scheduler.runAfter(0, sendTeamEmailRef, { kind: "invite", to: contact.email, role: args.role, link });
      return { status: "invited", channel: "email", link };
    }
    return { status: "invited", channel: "phone", phone: contact.phone, link };
  },
});

/**
 * A fresh one-time link for a waiting invite (the old one stops working). Emailed again for an
 * email invite; returned for the admin to send on WhatsApp or copy.
 */
export const adminInviteLink = mutation({
  args: { inviteId: v.id("teamInvites"), email: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ link: string; phone: string | null; role: TeamRole }> => {
    await requireAdmin(ctx);
    const invite = await ctx.db.get(args.inviteId);
    if (!invite || invite.status !== "pending") throw new ConvexError("That invite is no longer waiting.");
    const link = await newLink(ctx, invite._id);
    await ctx.db.patch(invite._id, { updatedAt: Date.now() });
    if (args.email && invite.email) {
      await ctx.db.patch(invite._id, { emailedAt: Date.now() });
      await ctx.scheduler.runAfter(0, sendTeamEmailRef, { kind: "invite", to: invite.email, role: invite.role, link });
    }
    return { link, phone: invite.phone ?? null, role: invite.role };
  },
});

/** Cancel an invite, or take the access away from an account (its old role comes back). */
export const adminRemoveTeamAccess = mutation({
  args: { inviteId: v.optional(v.id("teamInvites")), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const { user: admin } = await requireAdmin(ctx);
    const now = Date.now();
    if (args.inviteId) {
      const invite = await ctx.db.get(args.inviteId);
      if (invite && invite.status === "pending") {
        await ctx.db.patch(invite._id, { status: "revoked", revokedAt: now, updatedAt: now, codeHash: undefined });
      }
      return null;
    }
    if (!args.userId) throw new ConvexError("Choose who to remove.");
    const target = await ctx.db.get(args.userId);
    if (!target || !isTeamRole(target.role)) throw new ConvexError("That account doesn't have blog or Learn access.");
    const accepted = (await ctx.db.query("teamInvites").withIndex("by_status", (q) => q.eq("status", "accepted")).take(1000))
      .filter((i) => i.userId === target._id)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const restore = accepted.find((i) => i.previousRole && RESTORABLE.has(i.previousRole))?.previousRole;
    // With no earlier role they choose one again the next time they sign in
    await ctx.db.patch(target._id, restore ? { role: restore as Doc<"users">["role"] } : { role: undefined, onboarded: false });
    for (const row of accepted) await ctx.db.patch(row._id, { status: "revoked", revokedAt: now, updatedAt: now });
    await logSecurityEvent(ctx, "role_changed", {
      userId: target._id,
      details: { from: target.role, to: restore ?? null, by: admin._id, via: "team_access" },
    });
    return { restoredRole: restore ?? null };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// The invite link (/team-invite/<code>)
// ─────────────────────────────────────────────────────────────────────────────

async function inviteByCode(ctx: QueryCtx | MutationCtx, code: string) {
  if (!/^[A-Za-z0-9]{20,64}$/.test(code)) return null;
  const hash = await sha256Hex(code);
  return await ctx.db.query("teamInvites").withIndex("by_code_hash", (q) => q.eq("codeHash", hash)).first();
}

/** What a link offers, for the page before it is accepted. Says nothing about who it is for. */
export const teamInvitePreview = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const invite = await inviteByCode(ctx, args.code);
    // Already accepted (e.g. it applied by itself when they signed up with the invited email)
    if (invite && invite.status === "accepted") return { state: "accepted" as const, role: invite.role, roleLabel: ROLE_LABEL[invite.role] };
    if (!invite || invite.status !== "pending") return { state: "invalid" as const };
    if (!invite.codeExpiresAt || invite.codeExpiresAt < Date.now()) return { state: "expired" as const };
    const inviter = await ctx.db.get(invite.invitedBy);
    return { state: "ok" as const, role: invite.role, roleLabel: ROLE_LABEL[invite.role], invitedBy: inviter?.firstName?.trim() || "The Rehabify team" };
  },
});

/** The signed-in person accepts the invite in the link. */
export const acceptTeamInvite = mutation({
  args: { code: v.string(), confirm: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ status: "accepted" | "confirm" | "not_ready"; home?: string; currentRole?: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Sign in first, then open the link again.");
    const user = await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject)).unique();
    // A brand-new login gets its account a moment after sign-up (SyncUserWithConvex)
    if (!user) return { status: "not_ready" };
    const invite = await inviteByCode(ctx, args.code);
    if (!invite || invite.status !== "pending") throw new ConvexError("This invite link has been used or cancelled. Ask the Rehabify team for a new one.");
    if (!invite.codeExpiresAt || invite.codeExpiresAt < Date.now()) throw new ConvexError("This invite link has expired. Ask the Rehabify team to send a new one.");
    if (user.role === "admin") throw new ConvexError("You're signed in as an administrator, who can already use the blog and Learn.");
    if (user.role === invite.role) {
      await ctx.db.patch(invite._id, { status: "accepted", userId: user._id, acceptedAt: Date.now(), updatedAt: Date.now() });
      return { status: "accepted", home: ROLE_HOME[invite.role] };
    }
    if (user.role && !args.confirm) return { status: "confirm", currentRole: user.role };
    await giveRole(ctx, user, invite.role, { via: "team_invite_link", inviteId: invite._id });
    await notify(
      ctx,
      invite.invitedBy,
      `${ROLE_LABEL[invite.role]} joined`,
      `${personName(user)} accepted the invite and now has ${ROLE_LABEL[invite.role].toLowerCase()} access.`,
      "/dashboard/admin/team-access"
    );
    return { status: "accepted", home: ROLE_HOME[invite.role] };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// One-time "New" pop-up for admins (featureIntros, shared with other features)
// ─────────────────────────────────────────────────────────────────────────────

const ACCESS_INTRO = "team_access";

/** Whether this admin still needs to see the one-time introduction to Blog & Learn access. */
export const accessIntro = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { show: false };
    const user = await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject)).unique();
    if (!user || user.role !== "admin") return { show: false };
    const seen = await ctx.db
      .query("featureIntros")
      .withIndex("by_user_and_key", (q) => q.eq("userId", user._id).eq("key", ACCESS_INTRO))
      .first();
    return { show: !seen };
  },
});

export const dismissAccessIntro = mutation({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireAdmin(ctx);
    const seen = await ctx.db
      .query("featureIntros")
      .withIndex("by_user_and_key", (q) => q.eq("userId", user._id).eq("key", ACCESS_INTRO))
      .first();
    if (!seen) await ctx.db.insert("featureIntros", { userId: user._id, key: ACCESS_INTRO, seenAt: Date.now() });
    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Sign-up
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A new account whose verified email has a pending invite becomes that role. Called from both
 * places an account is first stored (the Clerk webhook and the browser's first sign-in), and only
 * for an account that has no role yet, so it never overrides one someone already chose.
 */
export async function claimTeamInvite(ctx: MutationCtx, userId: Id<"users">, verifiedEmail: string | null | undefined) {
  const email = verifiedEmail?.trim().toLowerCase();
  if (!email) return false;
  const invite = newest((await ctx.db.query("teamInvites").withIndex("by_email", (q) => q.eq("email", email)).take(50)).filter((i) => i.status === "pending"));
  if (!invite) return false;
  const user = await ctx.db.get(userId);
  if (!user || user.role) return false;
  await giveRole(ctx, user, invite.role, { via: "team_invite_email", inviteId: invite._id });
  await notify(
    ctx,
    invite.invitedBy,
    `${ROLE_LABEL[invite.role]} joined`,
    `${personName(user)} (${email}) signed up and now has ${ROLE_LABEL[invite.role].toLowerCase()} access.`,
    "/dashboard/admin/team-access"
  );
  return true;
}
