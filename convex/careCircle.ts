/**
 * Care circle: family members and caregivers who help with a patient's care.
 *
 * Two ways in:
 * - Invite: the patient (or their clinic, or a caregiver who manages them) invites someone by
 *   link. Accepting gives that person access to the patient's care at the level chosen.
 * - Caregiver first: someone arranging care for a relative (e.g. an elderly parent without a
 *   smartphone) signs up as a caregiver and adds them. The caregiver manages that profile.
 *
 * Access levels (helpers/careCircleAccess.ts): view (visits, plan, progress), book_pay (also
 * ask for visits and pay), full (also message the care team). Caregivers see the care, never the
 * clinical notes. Joy on WhatsApp writes to the same table, so web and WhatsApp share one circle.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { currentUser, findRelationship, physioOrNull } from "./helpers/careAccess";
import { getClinicMemberOrNull, canUseArea, assertPatientInClinic } from "./clinicTools";
import { insertNotification } from "./helpers/pushNotify";
import { publicAppUrl } from "./helpers/appUrl";
import { activePaymentLink } from "./helpers/paymentLinks";
import { ensureUserNumbers } from "./helpers/rehabifyIds";
import { personName } from "./helpers/displayIdentity";
import { ensureUserRole } from "./auth";
import { recordPatientCheckIn, checkInArgs } from "./physioCare";
import { APPOINTMENT_STATUS_LABELS } from "./helpers/appointmentStatus";
import {
  CARE_ACCESS,
  activeCareGrant,
  careAccessLevel,
  liveCareGrantsFor,
  type CareAccessLevel,
} from "./helpers/careCircleAccess";

type Ctx = QueryCtx | MutationCtx;

const DAY = 86_400_000;
const INVITE_DAYS = 14;
const MAX_CIRCLE = 10;
const MAX_MANAGED = 6;
const LAGOS_OFFSET = 60 * 60 * 1000;

const accessValidator = v.union(v.literal("view"), v.literal("book_pay"), v.literal("full"));

const ACCESS_SENTENCE: Record<CareAccessLevel, string> = {
  view: "see their visits, care plan and progress",
  book_pay: "see their care, ask for visits and pay for them",
  full: "see their care, ask for visits, pay, and message their care team",
};

function newCode(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
}

function cleanText(value: string | undefined, max: number) {
  const text = value?.trim().replace(/\s+/g, " ");
  return text ? text.slice(0, max) : undefined;
}

function cleanPhone(value: string | undefined) {
  const phone = value?.trim();
  if (!phone) return undefined;
  if (phone.replace(/\D/g, "").length < 7) throw new ConvexError("Enter a valid phone number.");
  return phone.slice(0, 30);
}

function cleanEmail(value: string | undefined) {
  const email = value?.trim().toLowerCase();
  if (!email) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ConvexError("Enter a valid email address.");
  return email;
}

function firstName(user: Doc<"users"> | null | undefined, fallback = "them") {
  return user?.firstName?.trim() || fallback;
}

/** A row created for someone who hasn't signed in themselves (a clinic's or caregiver's placeholder). */
function hasOwnLogin(user: Doc<"users">) {
  const id = user.clerkId ?? "";
  return !id.startsWith("clinic_patient_") && !id.startsWith("physio_patient_") && !id.startsWith("managed_") && !id.startsWith("joy-");
}

/**
 * Who may manage this patient's circle (invite, change access, remove): the patient, a caregiver
 * who manages their profile, or their clinic (owner or a member with Patients access).
 */
async function circleManager(ctx: Ctx, me: Doc<"users">, patientId: Id<"users">) {
  if (me._id === patientId) return { kind: "patient" as const, clinic: null };
  const grant = await activeCareGrant(ctx, me._id, patientId);
  if (grant?.managed) return { kind: "caregiver" as const, clinic: null };
  const member = await getClinicMemberOrNull(ctx).catch(() => null);
  if (member && canUseArea(member, "patients")) {
    try {
      await assertPatientInClinic(ctx, member.clinic, patientId);
      return { kind: "clinic" as const, clinic: member.clinic };
    } catch {
      // Not this clinic's patient
    }
  }
  return null;
}

async function requireManager(ctx: MutationCtx, patientId: Id<"users">) {
  const me = await currentUser(ctx);
  if (!me) throw new ConvexError("Please sign in again.");
  const manager = await circleManager(ctx, me, patientId);
  if (!manager) throw new ConvexError("Only the patient, their clinic or the person who manages their profile can change this.");
  return { me, manager };
}

/** The signed-in caregiver's live grant for this patient. */
async function requireCaregiver(ctx: Ctx, patientId: Id<"users">, permission?: "book" | "pay" | "message") {
  const me = await currentUser(ctx);
  if (!me) throw new ConvexError("Please sign in again.");
  const grant = await activeCareGrant(ctx, me._id, patientId);
  if (!grant) throw new ConvexError("You're not in this person's care circle any more.");
  if (permission && !grant.permissions.includes(permission)) {
    throw new ConvexError("Your access doesn't include this. Ask them (or their clinic) to change it.");
  }
  const patient = await ctx.db.get(patientId);
  if (!patient) throw new ConvexError("This person's record is no longer available.");
  return { me, grant, patient };
}

/** People with an account of their own: being asked to care for someone makes a new account a caregiver. */
async function becomeCaregiverIfNew(ctx: MutationCtx, me: Doc<"users">) {
  if (!me.role || (me.role === "family_member" && !me.onboarded)) await ctx.db.patch(me._id, { role: "family_member", onboarded: true });
}

/**
 * Joy on WhatsApp gives family access to a placeholder account keyed by phone. When that person
 * signs in on the web with the same number, their access moves to the real account.
 */
async function adoptJoyFamilyAccess(ctx: MutationCtx, me: Doc<"users">) {
  if (!me.phoneNumber) return 0;
  const placeholders = (
    await ctx.db
      .query("users")
      .withIndex("by_phone_number", (q) => q.eq("phoneNumber", me.phoneNumber))
      .take(5)
  ).filter((u) => u._id !== me._id && (u.clerkId ?? "").startsWith("joy-family:"));
  let moved = 0;
  for (const placeholder of placeholders) {
    const grants = await ctx.db
      .query("familyAccessGrants")
      .withIndex("by_family_member_user_id", (q) => q.eq("familyMemberUserId", placeholder._id))
      .take(20);
    for (const grant of grants) {
      const existing = await activeCareGrant(ctx, me._id, grant.patientUserId);
      if (existing) continue;
      await ctx.db.patch(grant._id, { familyMemberUserId: me._id, source: grant.source ?? "joy", updatedAt: Date.now() });
      moved += 1;
    }
  }
  return moved;
}

async function notifyUser(ctx: MutationCtx, userId: Id<"users">, type: string, title: string, body: string, link: string) {
  const user = await ctx.db.get(userId);
  if (!user || !hasOwnLogin(user)) return;
  await insertNotification(ctx, {
    userId,
    type,
    priority: "medium",
    status: "pending",
    payload: { title, body, link, data: { actionUrl: link } },
    createdAt: Date.now(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Managing the circle (patient, clinic, managing caregiver)
// ─────────────────────────────────────────────────────────────────────────────

/** The patient's circle: who helps with their care and pending invites. Null for anyone else. */
export const getCareCircle = query({
  args: { patientId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const me = await currentUser(ctx);
    if (!me) return null;
    const patientId = args.patientId ?? me._id;
    const manager = await circleManager(ctx, me, patientId);
    if (!manager) return null;
    const patient = await ctx.db.get(patientId);
    if (!patient) return null;

    const grants = await liveCareGrantsFor(ctx, patientId);
    const members = await Promise.all(
      grants.map(async (grant) => {
        const user = await ctx.db.get(grant.familyMemberUserId);
        return {
          grantId: grant._id,
          userId: grant.familyMemberUserId,
          name: personName(user, "Family member"),
          phone: user?.phoneNumber ?? null,
          email: user?.email && !user.email.includes("@placeholder") ? user.email : null,
          imageUrl: user?.imageUrl ?? null,
          relationship: grant.relationship,
          access: careAccessLevel(grant.permissions),
          managed: Boolean(grant.managed),
          source: grant.source ?? "invite",
          since: grant.grantedAt,
          isMe: grant.familyMemberUserId === me._id,
        };
      })
    );

    const now = Date.now();
    const invites = (
      await ctx.db
        .query("careCircleInvites")
        .withIndex("by_patient", (q) => q.eq("patientUserId", patientId))
        .take(50)
    )
      .filter((i) => i.status === "pending" && i.expiresAt > now)
      .map((i) => ({
        inviteId: i._id,
        name: i.name,
        relationship: i.relationship,
        access: careAccessLevel(i.permissions),
        email: i.email ?? null,
        phone: i.phone ?? null,
        createdAt: i.createdAt,
        expiresAt: i.expiresAt,
        link: `${publicAppUrl()}/care-invite/${i.code}`,
      }));

    return {
      patient: { _id: patient._id, firstName: patient.firstName ?? null, lastName: patient.lastName ?? null },
      managedBy: manager.kind,
      clinicName: manager.clinic?.name ?? null,
      members: members.sort((a, b) => a.since - b.since),
      invites,
    };
  },
});

export const inviteToCareCircle = mutation({
  args: {
    /** Defaults to the signed-in patient */
    patientId: v.optional(v.id("users")),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    relationship: v.string(),
    access: accessValidator,
  },
  handler: async (ctx, args) => {
    const me = await currentUser(ctx);
    if (!me) throw new ConvexError("Please sign in again.");
    const patientId = args.patientId ?? me._id;
    const { manager } = await requireManager(ctx, patientId);
    const patient = await ctx.db.get(patientId);
    if (!patient) throw new ConvexError("This patient's record is no longer available.");

    const name = cleanText(args.name, 80);
    const relationship = cleanText(args.relationship, 40);
    if (!name) throw new ConvexError("Add their name.");
    if (!relationship) throw new ConvexError("Say how they're related, e.g. Daughter or Carer.");
    const email = cleanEmail(args.email);
    const phone = cleanPhone(args.phone);

    const now = Date.now();
    const existing = await ctx.db
      .query("careCircleInvites")
      .withIndex("by_patient", (q) => q.eq("patientUserId", patientId))
      .take(50);
    const pending = existing.filter((i) => i.status === "pending" && i.expiresAt > now);
    const members = await liveCareGrantsFor(ctx, patientId);
    // The same person invited again: the old link stops working, the new one is sent
    for (const old of pending) {
      if ((email && old.email === email) || (phone && old.phone && old.phone.replace(/\D/g, "") === phone.replace(/\D/g, ""))) {
        await ctx.db.patch(old._id, { status: "cancelled" });
      }
    }
    if (members.length + pending.length >= MAX_CIRCLE) {
      throw new ConvexError(`A care circle can have up to ${MAX_CIRCLE} people. Remove someone first.`);
    }

    const code = newCode();
    const inviteId = await ctx.db.insert("careCircleInvites", {
      patientUserId: patientId,
      code,
      name,
      email,
      phone,
      relationship,
      permissions: [...CARE_ACCESS[args.access]],
      invitedBy: me._id,
      clinicId: manager.clinic?._id,
      status: "pending",
      createdAt: now,
      expiresAt: now + INVITE_DAYS * DAY,
    });

    const link = `${publicAppUrl()}/care-invite/${code}`;
    const patientName = personName(patient, "your family member");
    const from = manager.clinic ? manager.clinic.name : manager.kind === "patient" ? patientName : personName(me, "A family member");
    if (email) {
      await ctx.scheduler.runAfter(0, internal.actions.emails.sendPatientCareEmail.sendPatientCareEmail, {
        to: email,
        subject: `${from} added you to ${manager.kind === "patient" ? "their" : `${firstName(patient)}'s`} care circle on Rehabify`,
        greetingName: name.split(" ")[0],
        heading: `Help with ${firstName(patient)}'s care`,
        paragraphs: [
          `${from} invited you as ${firstName(patient)}'s ${relationship.toLowerCase()}. With Rehabify you can ${ACCESS_SENTENCE[args.access]}.`,
          "You never see their private clinical notes. They (or their clinic) can change or end your access at any time.",
          `The link works for ${INVITE_DAYS} days.`,
        ],
        buttonLabel: "Accept the invite",
        buttonUrl: link,
      });
    }

    return {
      inviteId,
      link,
      whatsappText: `Hi ${name.split(" ")[0]}, ${manager.kind === "patient" ? "I've" : `${from} has`} added you to ${manager.kind === "patient" ? "my" : `${firstName(patient)}'s`} care circle on Rehabify so you can ${ACCESS_SENTENCE[args.access]}. Accept here: ${link}`,
    };
  },
});

export const cancelCareInvite = mutation({
  args: { inviteId: v.id("careCircleInvites") },
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) return { changed: false };
    await requireManager(ctx, invite.patientUserId);
    if (invite.status !== "pending") return { changed: false };
    await ctx.db.patch(invite._id, { status: "cancelled" });
    return { changed: true };
  },
});

export const updateCareAccess = mutation({
  args: { grantId: v.id("familyAccessGrants"), access: accessValidator, relationship: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const grant = await ctx.db.get(args.grantId);
    if (!grant || grant.status !== "active") throw new ConvexError("This person isn't in the care circle any more.");
    const { me } = await requireManager(ctx, grant.patientUserId);
    if (grant.familyMemberUserId === me._id) throw new ConvexError("You can't change your own access.");
    const relationship = cleanText(args.relationship, 40);
    await ctx.db.patch(grant._id, {
      permissions: [...CARE_ACCESS[args.access]],
      ...(relationship ? { relationship } : {}),
      updatedAt: Date.now(),
    });
    const patient = await ctx.db.get(grant.patientUserId);
    await notifyUser(
      ctx,
      grant.familyMemberUserId,
      "care_circle_access",
      `Your access to ${firstName(patient, "their")}'s care changed`,
      `You can now ${ACCESS_SENTENCE[args.access]}.`,
      `/dashboard/family?person=${grant.patientUserId}`
    );
    return { ok: true };
  },
});

/** The manager removes someone, or a caregiver leaves the circle themselves. */
export const removeFromCareCircle = mutation({
  args: { grantId: v.id("familyAccessGrants") },
  handler: async (ctx, args) => {
    const me = await currentUser(ctx);
    if (!me) throw new ConvexError("Please sign in again.");
    const grant = await ctx.db.get(args.grantId);
    if (!grant || grant.status !== "active") return { changed: false };
    const leaving = grant.familyMemberUserId === me._id;
    if (!leaving) await requireManager(ctx, grant.patientUserId);
    // The only person who can manage a profile they created can't leave it with nobody
    if (leaving && grant.managed) {
      const others = (await liveCareGrantsFor(ctx, grant.patientUserId)).filter((g) => g.managed && g._id !== grant._id);
      if (others.length === 0) throw new ConvexError("You manage this profile. Invite someone else to manage it before you leave.");
    }
    await ctx.db.patch(grant._id, { status: "revoked", updatedAt: Date.now() });
    const patient = await ctx.db.get(grant.patientUserId);
    if (!leaving) {
      await notifyUser(
        ctx,
        grant.familyMemberUserId,
        "care_circle_removed",
        `You're no longer in ${firstName(patient, "their")}'s care circle`,
        "You can't see their care on Rehabify any more. Ask them or their clinic if this is a mistake.",
        "/dashboard/family"
      );
    }
    return { changed: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Invite links
// ─────────────────────────────────────────────────────────────────────────────

/** What the invite page shows. Public (the link is the secret); the invitee's email is masked. */
export const getCareInvite = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("careCircleInvites")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (!invite) return null;
    const patient = await ctx.db.get(invite.patientUserId);
    const inviter = await ctx.db.get(invite.invitedBy);
    const clinic = invite.clinicId ? await ctx.db.get(invite.clinicId) : null;
    const me = await currentUser(ctx);
    const expired = invite.status === "pending" && invite.expiresAt <= Date.now();
    const alreadyIn = me ? Boolean(await activeCareGrant(ctx, me._id, invite.patientUserId)) : false;
    const [local, domain] = (invite.email ?? "").split("@");
    return {
      status: expired ? ("expired" as const) : invite.status,
      name: invite.name,
      relationship: invite.relationship,
      access: careAccessLevel(invite.permissions),
      accessSentence: ACCESS_SENTENCE[careAccessLevel(invite.permissions)],
      patientFirstName: firstName(patient, "Your family member"),
      patientName: personName(patient, "Your family member"),
      fromPatient: invite.invitedBy === invite.patientUserId,
      inviterName: clinic ? clinic.name : personName(inviter, "A family member"),
      clinic: clinic ? { name: clinic.name, logoUrl: clinic.logoUrl ?? null } : null,
      maskedEmail: local && domain ? `${local[0]}•••@${domain}` : null,
      signedIn: Boolean(me),
      isThePatient: me?._id === invite.patientUserId,
      alreadyIn,
    };
  },
});

export const acceptCareInvite = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const me = await currentUser(ctx);
    if (!me) throw new ConvexError("Please sign in to accept the invite.");
    const invite = await ctx.db
      .query("careCircleInvites")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (!invite) throw new ConvexError("This invite link isn't valid.");
    if (invite.status === "cancelled") throw new ConvexError("This invite was cancelled. Ask for a new one.");
    if (invite.status === "accepted" && invite.acceptedBy !== me._id) throw new ConvexError("This invite has already been used.");
    if (invite.status === "pending" && invite.expiresAt <= Date.now()) throw new ConvexError("This invite has expired. Ask for a new one.");
    if (invite.patientUserId === me._id) throw new ConvexError("This invite is for someone helping with your care, not for you.");

    await becomeCaregiverIfNew(ctx, me);
    const now = Date.now();
    const existing = await ctx.db
      .query("familyAccessGrants")
      .withIndex("by_patient_and_family_member", (q) => q.eq("patientUserId", invite.patientUserId).eq("familyMemberUserId", me._id))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "active",
        permissions: invite.permissions,
        relationship: invite.relationship,
        source: existing.source ?? "invite",
        invitedBy: invite.invitedBy,
        expiresAt: undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("familyAccessGrants", {
        patientUserId: invite.patientUserId,
        familyMemberUserId: me._id,
        relationship: invite.relationship,
        permissions: invite.permissions,
        status: "active",
        grantedAt: now,
        source: "invite",
        invitedBy: invite.invitedBy,
        updatedAt: now,
      });
    }
    if (invite.status === "pending") await ctx.db.patch(invite._id, { status: "accepted", acceptedBy: me._id, acceptedAt: now });
    await adoptJoyFamilyAccess(ctx, me);

    const patient = await ctx.db.get(invite.patientUserId);
    const who = personName(me, invite.name);
    for (const userId of new Set([invite.patientUserId, invite.invitedBy])) {
      if (userId === me._id) continue;
      const user = await ctx.db.get(userId);
      const isPatient = userId === invite.patientUserId;
      // A clinic member who sent it hears it in the clinic portal; the patient in theirs
      const link = isPatient ? "/dashboard/patient/care-circle" : user?.role === "patient" ? "/dashboard/patient/care-circle" : user?.role === "family_member" ? `/dashboard/family?person=${invite.patientUserId}` : `/dashboard/clinic/patients/${invite.patientUserId}`;
      await notifyUser(
        ctx,
        userId,
        "care_circle_joined",
        isPatient ? `${who} joined your care circle` : `${who} joined ${firstName(patient)}'s care circle`,
        `As ${isPatient ? "your" : `${firstName(patient)}'s`} ${invite.relationship.toLowerCase()}, they can ${ACCESS_SENTENCE[careAccessLevel(invite.permissions)]}.`,
        link
      );
    }
    return { patientId: invite.patientUserId };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Caregiver first: "I'm arranging care for someone"
// ─────────────────────────────────────────────────────────────────────────────

export const addPersonICareFor = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    relationship: v.string(),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"), v.literal("prefer_not_to_say"))),
    phone: v.optional(v.string()),
    city: v.optional(v.string()),
    condition: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await currentUser(ctx);
    if (!me) throw new ConvexError("Please sign in again.");
    const first = cleanText(args.firstName, 60);
    const last = cleanText(args.lastName, 60);
    const relationship = cleanText(args.relationship, 40);
    if (!first || !last) throw new ConvexError("Add their first and last name.");
    if (!relationship) throw new ConvexError("Say how you're related, e.g. Daughter or Carer.");
    const phone = cleanPhone(args.phone);

    const managed = (
      await ctx.db
        .query("familyAccessGrants")
        .withIndex("by_family_member_user_id", (q) => q.eq("familyMemberUserId", me._id))
        .take(50)
    ).filter((g) => g.managed && g.status === "active");
    if (managed.length >= MAX_MANAGED) throw new ConvexError(`You can manage up to ${MAX_MANAGED} people.`);

    await becomeCaregiverIfNew(ctx, me);
    const now = Date.now();
    const patientId = await ctx.db.insert("users", {
      clerkId: `managed_${newCode()}`,
      firstName: first,
      lastName: last,
      phoneNumber: phone,
      role: "patient",
      onboarded: true,
      status: "active",
      joinedAt: now,
    });
    await ensureUserNumbers(ctx, patientId);
    const profileId = await ctx.db.insert("patientProfiles", {
      userId: patientId,
      dateOfBirth: cleanText(args.dateOfBirth, 20),
      gender: args.gender,
      city: cleanText(args.city, 60),
      medicalHistorySummary: cleanText(args.condition, 500),
    });
    await ctx.db.patch(patientId, { patientProfileId: profileId });
    await ctx.db.insert("familyAccessGrants", {
      patientUserId: patientId,
      familyMemberUserId: me._id,
      relationship,
      permissions: [...CARE_ACCESS.full],
      status: "active",
      grantedAt: now,
      managed: true,
      source: "caregiver",
      updatedAt: now,
    });
    await adoptJoyFamilyAccess(ctx, me);
    return { patientId };
  },
});

/**
 * "Give them their own login": the caregiver adds the person's email; when they sign up with it,
 * Clerk verifies the address and users.claimPlaceholderPatient hands this profile to their new
 * login (visits, plan and history included). The caregiver keeps their access.
 */
export const inviteToOwnLogin = mutation({
  args: { patientId: v.id("users"), email: v.string(), phone: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { me, grant, patient } = await requireCaregiver(ctx, args.patientId);
    if (!grant.managed || hasOwnLogin(patient)) throw new ConvexError(`${firstName(patient, "They")} already has their own login.`);
    const email = cleanEmail(args.email);
    if (!email) throw new ConvexError("Add their email address.");
    const phone = cleanPhone(args.phone);
    const taken = (
      await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .take(5)
    ).find((u) => u._id !== patient._id);
    if (taken) {
      throw new ConvexError(
        hasOwnLogin(taken)
          ? "This email already has a Rehabify account. Use another one, or ask them to sign in and you can invite them to the care circle instead."
          : "This email is already waiting for another Rehabify profile. Use a different one."
      );
    }
    await ctx.db.patch(patient._id, { email, ...(phone ? { phoneNumber: phone } : {}) });

    const link = `${publicAppUrl()}/sign-up?as=patient&redirect_url=${encodeURIComponent("/dashboard/patient")}`;
    const caregiver = personName(me, "Your family member");
    await ctx.scheduler.runAfter(0, internal.actions.emails.sendPatientCareEmail.sendPatientCareEmail, {
      to: email,
      subject: `${caregiver} set up Rehabify for you`,
      greetingName: patient.firstName ?? undefined,
      heading: "Your own Rehabify login",
      paragraphs: [
        `${caregiver} has been arranging your physiotherapy on Rehabify. Create your own login to see your visits, home exercises and progress yourself.`,
        `Sign up with this email address (${email}) and everything ${caregiver.split(" ")[0]} set up is waiting for you. ${caregiver.split(" ")[0]} keeps helping unless you change it.`,
      ],
      buttonLabel: "Create my login",
      buttonUrl: link,
    });
    return {
      link,
      whatsappText: `Hi ${firstName(patient, "")}, I've set up Rehabify for your physiotherapy. Create your own login with ${email} to see your visits and exercises: ${link}`,
    };
  },
});

/** Joy (WhatsApp) access given to this person's phone number moves to their web account. */
export const linkJoyFamilyAccess = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await currentUser(ctx);
    if (!me) return { moved: 0 };
    return { moved: await adoptJoyFamilyAccess(ctx, me) };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// The caregiver's view
// ─────────────────────────────────────────────────────────────────────────────

const UPCOMING = new Set(["scheduled", "confirmed", "pending_confirmation", "pending_patient_confirmation"]);

/** Active relationships and the clinic (if any) behind the patient's care. */
async function careTeamOf(ctx: Ctx, patientId: Id<"users">) {
  const rels = (
    await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .collect()
  ).filter((r) => r.status === "active");
  const clinicIds = [...new Set(rels.map((r) => r.clinicId).filter((id): id is Id<"clinics"> => Boolean(id)))];
  const clinics = (await Promise.all(clinicIds.map((id) => ctx.db.get(id)))).filter((c): c is Doc<"clinics"> => Boolean(c));
  const clinicians = [];
  for (const rel of rels) {
    const clinic = clinics.find((c) => c._id === rel.clinicId) ?? null;
    // The owner holds patients waiting for a clinician; they don't treat
    if (clinic && rel.physiotherapistId === clinic.ownerId) continue;
    const physio = await ctx.db.get(rel.physiotherapistId);
    if (!physio) continue;
    clinicians.push({ userId: physio._id, name: personName(physio, "Physiotherapist"), imageUrl: physio.imageUrl ?? null, clinicName: clinic?.name ?? null });
  }
  return { rels, clinics, clinicians };
}

/** The people this signed-in caregiver looks after. */
export const getMyCaredFor = query({
  args: {},
  handler: async (ctx) => {
    const me = await currentUser(ctx);
    if (!me) return null;
    const now = Date.now();
    const grants = (
      await ctx.db
        .query("familyAccessGrants")
        .withIndex("by_family_member_user_id", (q) => q.eq("familyMemberUserId", me._id))
        .take(50)
    ).filter((g) => g.status === "active" && (!g.expiresAt || g.expiresAt > now));
    const people = await Promise.all(
      grants.map(async (grant) => {
        const patient = await ctx.db.get(grant.patientUserId);
        if (!patient) return null;
        const next = (
          await ctx.db
            .query("appointments")
            .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", patient._id).gte("startTime", now))
            .take(20)
        ).find((a) => UPCOMING.has(a.status) && !a.isRecordOnly);
        return {
          patientId: patient._id,
          firstName: patient.firstName ?? "",
          lastName: patient.lastName ?? "",
          imageUrl: patient.imageUrl ?? null,
          relationship: grant.relationship,
          access: careAccessLevel(grant.permissions),
          managed: Boolean(grant.managed),
          nextVisitAt: next?.startTime ?? null,
        };
      })
    );
    return {
      me: { firstName: me.firstName ?? null, role: me.role ?? null },
      people: people.filter((p): p is NonNullable<typeof p> => p !== null).sort((a, b) => a.firstName.localeCompare(b.firstName)),
    };
  },
});

/** Everything a caregiver sees for one person: visits, care team, plan, progress and payments. */
export const getCaredForOverview = query({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await currentUser(ctx);
    if (!me) return null;
    const grant = await activeCareGrant(ctx, me._id, args.patientId);
    if (!grant) return null;
    const patient = await ctx.db.get(args.patientId);
    if (!patient) return null;
    const now = Date.now();
    const profile = await ctx.db
      .query("patientProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", patient._id))
      .first();

    const { clinics, clinicians } = await careTeamOf(ctx, patient._id);
    const clinic = clinics[0] ?? null;

    // Visits
    const appointments = (
      await ctx.db
        .query("appointments")
        .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", patient._id).gte("startTime", now - 60 * DAY))
        .take(100)
    ).filter((a) => !a.isRecordOnly);
    const nameCache = new Map<string, string>();
    const clinicianName = async (id: Id<"users">) => {
      if (!nameCache.has(id)) nameCache.set(id, personName(await ctx.db.get(id), "Physiotherapist"));
      return nameCache.get(id)!;
    };
    const visit = async (a: Doc<"appointments">) => ({
      _id: a._id,
      startTime: a.startTime,
      endTime: a.endTime,
      status: a.status,
      statusLabel: (APPOINTMENT_STATUS_LABELS as Record<string, string>)[a.status] ?? a.status,
      online: Boolean(a.isOnline) || a.appointmentType === "telehealth",
      service: a.serviceType ?? "Physiotherapy",
      clinician: await clinicianName(a.physiotherapistId),
    });
    const upcoming = await Promise.all(
      appointments
        .filter((a) => a.startTime >= now - 30 * 60 * 1000 && UPCOMING.has(a.status))
        .sort((a, b) => a.startTime - b.startTime)
        .slice(0, 4)
        .map(visit)
    );
    const recent = await Promise.all(
      appointments
        .filter((a) => a.startTime < now && a.status === "completed")
        .sort((a, b) => b.startTime - a.startTime)
        .slice(0, 3)
        .map(visit)
    );

    // Care plan (no clinical notes: a summary for the family)
    const plans = (
      await ctx.db
        .query("treatmentPlans")
        .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
        .collect()
    ).filter((p) => p.status === "active");
    const plan = plans.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;

    // Home programme and how much was done in the last 7 days (one session per exercise per day)
    const programs = (
      await ctx.db
        .query("exercisePrograms")
        .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
        .collect()
    ).filter((p) => p.status === "active");
    const exercises = programs.reduce((n, p) => n + p.items.filter((i) => i.kind !== "education").length, 0);
    const since = now - 7 * DAY;
    const logs = await ctx.db
      .query("exerciseProgramLogs")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id).gte("createdAt", since))
      .collect();
    const programIds = new Set<string>(programs.map((p) => p._id));
    const done = new Set(
      logs
        .filter((l) => programIds.has(l.programId) && l.itemIndex >= 0)
        .map((l) => `${l.programId}:${l.itemIndex}:${Math.floor((l.createdAt + LAGOS_OFFSET) / DAY)}`)
    ).size;
    const expected = exercises * 7;

    // Check-ins
    const checkIns = await ctx.db
      .query("patientCheckIns")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .order("desc")
      .take(10);
    const startOfDay = Math.floor((now + LAGOS_OFFSET) / DAY) * DAY - LAGOS_OFFSET;

    // Payments: only with "pay" access
    const canPay = grant.permissions.includes("pay");
    const invoices = canPay
      ? (
          await ctx.db
            .query("invoices")
            .withIndex("by_patient_id", (q) => q.eq("patientId", patient._id))
            .order("desc")
            .take(50)
        ).filter((i) => i.status === "sent" || i.status === "partial_payment" || i.status === "overdue")
      : [];
    const payee = async (i: Doc<"invoices">) =>
      i.clinicId ? (await ctx.db.get(i.clinicId))?.name ?? "Clinic" : i.physiotherapistId ? await clinicianName(i.physiotherapistId) : "Rehabify";

    const dob = profile?.dateOfBirth ? new Date(profile.dateOfBirth) : null;
    const age = dob && !Number.isNaN(dob.getTime()) ? Math.floor((now - dob.getTime()) / (365.25 * DAY)) : null;

    return {
      person: {
        _id: patient._id,
        firstName: patient.firstName ?? "",
        lastName: patient.lastName ?? "",
        imageUrl: patient.imageUrl ?? null,
        phone: patient.phoneNumber ?? null,
        patientNumber: patient.patientNumber ?? null,
        age: age !== null && age >= 0 && age < 130 ? age : null,
        city: profile?.city ?? null,
        condition: grant.managed ? profile?.medicalHistorySummary ?? null : null,
        hasOwnLogin: hasOwnLogin(patient),
      },
      access: {
        level: careAccessLevel(grant.permissions),
        relationship: grant.relationship,
        managed: Boolean(grant.managed),
        canBook: grant.permissions.includes("book"),
        canPay,
        canMessage: grant.permissions.includes("message"),
      },
      clinic: clinic ? { name: clinic.name, phone: clinic.contactPhone ?? null, logoUrl: clinic.logoUrl ?? null, address: [clinic.address, clinic.city].filter(Boolean).join(", ") || null } : null,
      clinicians,
      upcoming,
      recent,
      plan: plan
        ? {
            title: plan.title,
            goals: plan.goals.map((g) => ({ description: g.description, achieved: Boolean(g.achieved) })),
            sessionFrequency: plan.sessionFrequency ?? null,
            reviewDate: plan.reviewDate ?? null,
            precautions: plan.precautions ?? null,
            updatedAt: plan.updatedAt,
          }
        : null,
      programme:
        programs.length > 0
          ? {
              titles: programs.map((p) => p.title),
              exercises,
              done: Math.min(done, expected),
              expected,
              rate: expected > 0 ? Math.min(100, Math.round((done / expected) * 100)) : null,
              lastLoggedAt: logs.length ? Math.max(...logs.map((l) => l.createdAt)) : null,
            }
          : null,
      checkIns: checkIns.map((c) => ({ _id: c._id, painScore: c.painScore, mood: c.mood ?? null, exercisesDone: c.exercisesDone, createdAt: c.createdAt })),
      checkedInToday: checkIns.some((c) => c.createdAt >= startOfDay),
      invoices: await Promise.all(
        invoices.map(async (i) => ({
          _id: i._id,
          invoiceNumber: i.invoiceNumber,
          amountKobo: (i.feeBreakdown?.total ?? i.totalAmount) - (i.paidAmount ?? 0),
          service: i.items?.[0]?.description ?? "Physiotherapy",
          dueDate: i.dueDate,
          overdue: i.dueDate < now,
          payee: await payee(i),
          payLink: activePaymentLink(i),
        }))
      ),
    };
  },
});

/** A check-in sent by a caregiver for the person they look after. */
export const submitCheckInFor = mutation({
  args: { patientId: v.id("users"), ...checkInArgs },
  handler: async (ctx, { patientId, ...args }) => {
    const { me, grant, patient } = await requireCaregiver(ctx, patientId);
    return await recordPatientCheckIn(ctx, patient, args, { name: personName(me, "A family member"), relationship: grant.relationship });
  },
});

/**
 * "Ask for a visit": goes to their clinic's Requests (a clinic patient) or straight to their
 * physio. With no care team yet, the page offers Joy on WhatsApp to find a physio.
 */
export const requestVisitFor = mutation({
  args: { patientId: v.id("users"), message: v.optional(v.string()), preferredTimes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { me, grant, patient } = await requireCaregiver(ctx, args.patientId, "book");
    const message = cleanText(args.message, 500);
    const preferredTimes = cleanText(args.preferredTimes, 200);
    const who = `${personName(me, "A family member")} (${grant.relationship.toLowerCase()})`;
    const { rels, clinics } = await careTeamOf(ctx, patient._id);
    const now = Date.now();

    const clinic = clinics[0];
    if (clinic) {
      const open = (
        await ctx.db
          .query("clinicBookingRequests")
          .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
          .take(20)
      ).filter((r) => r.status === "open");
      if (open.length >= 3) throw new ConvexError(`${clinic.name} already has ${open.length} requests for ${firstName(patient)}. They'll be in touch.`);
      await ctx.db.insert("clinicBookingRequests", {
        clinicId: clinic._id,
        patientId: patient._id,
        kind: "appointment",
        message: `From ${who}${message ? `: ${message}` : ""}`,
        preferredTimes,
        status: "open",
        createdAt: now,
      });
      await insertNotification(ctx, {
        userId: clinic.ownerId,
        type: "clinic_booking_request",
        priority: "high",
        status: "pending",
        payload: {
          title: `Visit requested for ${personName(patient, "a patient")}`,
          body: `${who} asked for a visit${preferredTimes ? ` (${preferredTimes})` : ""}.`,
          link: "/dashboard/clinic/appointments?requests=1",
          data: { actionUrl: "/dashboard/clinic/appointments?requests=1" },
        },
        createdAt: now,
      });
      return { route: "clinic" as const, to: clinic.name };
    }

    const rel = rels[0];
    if (rel) {
      await insertNotification(ctx, {
        userId: rel.physiotherapistId,
        type: "care_circle_visit_request",
        priority: "high",
        status: "pending",
        payload: {
          title: `Visit requested for ${personName(patient, "your patient")}`,
          body: `${who} asked for a visit${preferredTimes ? ` (${preferredTimes})` : ""}${message ? `: "${message}"` : "."}`,
          link: `/dashboard/physiotherapist/patients/${patient._id}`,
          data: { actionUrl: `/dashboard/physiotherapist/patients/${patient._id}` },
        },
        createdAt: now,
      });
      return { route: "physio" as const, to: personName(await ctx.db.get(rel.physiotherapistId), "their physio") };
    }
    return { route: "joy" as const, to: null };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Staff and admin views
// ─────────────────────────────────────────────────────────────────────────────

/** Family and caregivers for a patient, for their physio or clinic (to call, or to know who helps). */
export const getPatientCareCircleForStaff = query({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await currentUser(ctx);
    if (!me) return null;
    const physio = await physioOrNull(ctx);
    let allowed = Boolean(physio && (await findRelationship(ctx, physio._id, args.patientId)));
    if (!allowed) allowed = (await circleManager(ctx, me, args.patientId))?.kind === "clinic";
    if (!allowed) return null;
    const grants = await liveCareGrantsFor(ctx, args.patientId);
    return await Promise.all(
      grants.map(async (g) => {
        const user = await ctx.db.get(g.familyMemberUserId);
        return {
          grantId: g._id,
          name: personName(user, "Family member"),
          relationship: g.relationship,
          phone: user?.phoneNumber ?? null,
          access: careAccessLevel(g.permissions),
          managed: Boolean(g.managed),
        };
      })
    );
  },
});

/** Every care circle, newest first, for the admin Caregivers page. */
export const adminListCareCircles = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    await ensureUserRole(ctx, ["admin"]);
    const limit = Math.min(500, Math.max(1, Math.floor(args.limit ?? 200)));
    const grants = await ctx.db.query("familyAccessGrants").order("desc").take(limit);
    const rows = await Promise.all(
      grants.map(async (g) => {
        const [caregiver, patient] = await Promise.all([ctx.db.get(g.familyMemberUserId), ctx.db.get(g.patientUserId)]);
        return {
          grantId: g._id,
          status: g.status,
          caregiver: {
            _id: g.familyMemberUserId,
            name: personName(caregiver, "Family member"),
            phone: caregiver?.phoneNumber ?? null,
            email: caregiver?.email && !caregiver.email.includes("@placeholder") ? caregiver.email : null,
            onWeb: caregiver ? hasOwnLogin(caregiver) : false,
          },
          patient: { _id: g.patientUserId, name: personName(patient, "Patient"), patientNumber: patient?.patientNumber ?? null },
          relationship: g.relationship,
          access: careAccessLevel(g.permissions),
          managed: Boolean(g.managed),
          source: g.source ?? (caregiver?.clerkId?.startsWith("joy-") ? "joy" : "invite"),
          since: g.grantedAt,
        };
      })
    );
    const now = Date.now();
    const pendingInvites = (await ctx.db.query("careCircleInvites").order("desc").take(500)).filter(
      (i) => i.status === "pending" && i.expiresAt > now
    ).length;
    return { rows, pendingInvites };
  },
});
