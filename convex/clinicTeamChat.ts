/**
 * Clinic team chat: staff only, never shown to patients.
 * - "team": one group per clinic for the owner and every active clinician.
 * - "patient": one thread per patient, for the owner and the clinicians who look (or looked)
 *   after them at the clinic. The owner uses it to ask about a patient's treatment without
 *   treating them; clinicians use it to hand over or ask the owner.
 * Membership isn't stored: it follows the clinic team and the patient's care, so someone who
 * leaves the clinic loses access and a new clinician gains it.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getClinicMemberOrNull, resolveClinicMember, assertPatientInClinic, type ClinicMember } from "./clinicTools";
import { getAuthenticatedUser } from "./auth";
import { insertNotification } from "./helpers/pushNotify";
import { personName, senderIdentity } from "./helpers/displayIdentity";

type Ctx = QueryCtx | MutationCtx;

const MAX_BODY = 4000;

/** The signed-in owner or clinician (front desk and people outside a clinic get nothing). */
async function teamMember(ctx: Ctx): Promise<ClinicMember | null> {
  const member = await getClinicMemberOrNull(ctx);
  if (!member || member.kind === "front_desk") return null;
  if (!member.isOwner && member.user.status && member.user.status !== "active") return null;
  return member;
}

/** Clinicians who look (or looked) after this patient at the clinic, plus the owner. */
async function patientThreadMemberIds(ctx: Ctx, clinic: Doc<"clinics">, patientId: Id<"users">) {
  const rels = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .collect();
  const ids = new Set<Id<"users">>([clinic.ownerId]);
  for (const rel of rels) if (rel.clinicId === clinic._id) ids.add(rel.physiotherapistId);
  return ids;
}

/** Active clinicians of the clinic, plus the owner. */
async function teamMemberIds(ctx: Ctx, clinic: Doc<"clinics">) {
  const profiles = await ctx.db
    .query("physiotherapistProfiles")
    .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
    .collect();
  const ids = new Set<Id<"users">>([clinic.ownerId]);
  for (const profile of profiles) {
    const user = await ctx.db.get(profile.userId);
    if (user && user.clinicId === clinic._id && user.role === "physiotherapist" && (!user.status || user.status === "active")) {
      ids.add(user._id);
    }
  }
  return ids;
}

async function canSeeThread(ctx: Ctx, member: ClinicMember, thread: Doc<"clinicThreads">) {
  if (thread.clinicId !== member.clinic._id) return false;
  if (thread.kind === "team" || member.isOwner) return true;
  return thread.patientId ? (await patientThreadMemberIds(ctx, member.clinic, thread.patientId)).has(member.user._id) : false;
}

async function lastReadAt(ctx: Ctx, userId: Id<"users">, threadId: Id<"clinicThreads">) {
  const row = await ctx.db
    .query("clinicThreadReads")
    .withIndex("by_user_and_thread", (q) => q.eq("userId", userId).eq("threadId", threadId))
    .first();
  return row?.lastReadAt ?? 0;
}

/** The team chat and the patient threads this person is in, newest first, with unread counts. */
export const getMyTeamThreads = query({
  args: {},
  handler: async (ctx) => {
    const member = await teamMember(ctx);
    if (!member) return null;
    const threads = await ctx.db
      .query("clinicThreads")
      .withIndex("by_clinic_and_last", (q) => q.eq("clinicId", member.clinic._id))
      .order("desc")
      .take(100);
    const rows = [];
    let hasTeam = false;
    for (const thread of threads) {
      if (!(await canSeeThread(ctx, member, thread))) continue;
      if (thread.kind === "team") hasTeam = true;
      const patient = thread.patientId ? await ctx.db.get(thread.patientId) : null;
      const readAt = await lastReadAt(ctx, member.user._id, thread._id);
      const unread =
        thread.lastMessageAt > readAt && thread.lastSenderId !== member.user._id
          ? (
              await ctx.db
                .query("clinicThreadMessages")
                .withIndex("by_thread", (q) => q.eq("threadId", thread._id).gt("createdAt", readAt))
                .take(20)
            ).filter((m) => m.senderId !== member.user._id).length
          : 0;
      rows.push({
        _id: thread._id as string,
        kind: thread.kind,
        patientId: thread.patientId ?? null,
        title: thread.kind === "team" ? `${member.clinic.name} team` : personName(patient, "Patient"),
        preview: thread.lastMessagePreview ?? null,
        lastMessageAt: thread.lastMessageAt,
        unread,
      });
    }
    // The team chat is always there, even before anyone has written in it
    if (!hasTeam) {
      rows.push({
        _id: "team",
        kind: "team" as const,
        patientId: null,
        title: `${member.clinic.name} team`,
        preview: null,
        lastMessageAt: 0,
        unread: 0,
      });
    }
    return { clinicName: member.clinic.name, isOwner: member.isOwner, threads: rows };
  },
});

/** Unread team-chat messages, for the Messages badge. */
export const getTeamUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const member = await teamMember(ctx);
    if (!member) return 0;
    const threads = await ctx.db
      .query("clinicThreads")
      .withIndex("by_clinic_and_last", (q) => q.eq("clinicId", member.clinic._id))
      .order("desc")
      .take(50);
    let count = 0;
    for (const thread of threads) {
      if (thread.lastSenderId === member.user._id) continue;
      const readAt = await lastReadAt(ctx, member.user._id, thread._id);
      if (thread.lastMessageAt <= readAt || !(await canSeeThread(ctx, member, thread))) continue;
      count += 1;
    }
    return count;
  },
});

/**
 * A thread's messages, oldest first. `threadId` "team" is the team chat; `patientId` opens that
 * patient's thread (it may not exist yet: then there are no messages).
 */
export const getThreadMessages = query({
  args: { threadId: v.optional(v.string()), patientId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const member = await teamMember(ctx);
    if (!member) return null;
    const thread = await findThread(ctx, member, args);
    if (thread && !(await canSeeThread(ctx, member, thread))) return null;
    if (args.patientId) {
      await assertPatientInClinic(ctx, member.clinic, args.patientId);
      if (!member.isOwner && !(await patientThreadMemberIds(ctx, member.clinic, args.patientId)).has(member.user._id)) return null;
    }
    const patient = args.patientId ? await ctx.db.get(args.patientId) : thread?.patientId ? await ctx.db.get(thread.patientId) : null;
    const messages = thread
      ? await ctx.db
          .query("clinicThreadMessages")
          .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
          .order("desc")
          .take(200)
      : [];
    const people = new Map<string, { name: string; subtitle: string | null; imageUrl: string | null }>();
    const shown = [];
    for (const message of messages.reverse()) {
      let who = people.get(message.senderId);
      if (!who) {
        const sender = await ctx.db.get(message.senderId);
        // Inside the team everyone is themselves; the owner shows as "{name} · Owner"
        who = sender
          ? sender._id === member.clinic.ownerId
            ? { name: personName(sender, member.clinic.name), subtitle: "Owner", imageUrl: sender.imageUrl ?? null }
            : { name: personName(sender, "Clinician"), subtitle: "Clinician", imageUrl: sender.imageUrl ?? null }
          : { name: "Former team member", subtitle: null, imageUrl: null };
        people.set(message.senderId, who);
      }
      shown.push({ _id: message._id, body: message.body, createdAt: message.createdAt, mine: message.senderId === member.user._id, sender: who });
    }
    return {
      threadId: thread?._id ?? null,
      kind: thread?.kind ?? (args.patientId ? "patient" : "team"),
      title: (thread?.kind ?? (args.patientId ? "patient" : "team")) === "team" ? `${member.clinic.name} team` : personName(patient, "Patient"),
      patientId: patient?._id ?? null,
      messages: shown,
    };
  },
});

async function findThread(ctx: Ctx, member: ClinicMember, args: { threadId?: string; patientId?: Id<"users"> }) {
  if (args.patientId) {
    return await ctx.db
      .query("clinicThreads")
      .withIndex("by_clinic_kind_patient", (q) => q.eq("clinicId", member.clinic._id).eq("kind", "patient").eq("patientId", args.patientId))
      .first();
  }
  if (!args.threadId || args.threadId === "team") {
    return await ctx.db
      .query("clinicThreads")
      .withIndex("by_clinic_kind_patient", (q) => q.eq("clinicId", member.clinic._id).eq("kind", "team").eq("patientId", undefined))
      .first();
  }
  const id = ctx.db.normalizeId("clinicThreads", args.threadId);
  return id ? await ctx.db.get(id) : null;
}

/** Write in the team chat or a patient's thread (created on the first message). */
export const sendTeamMessage = mutation({
  args: { threadId: v.optional(v.string()), patientId: v.optional(v.id("users")), body: v.string() },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const member = await resolveClinicMember(ctx, user);
    if (!member || member.kind === "front_desk") throw new ConvexError("Team chat is for the clinic owner and clinicians.");
    if (!member.isOwner && user.status && user.status !== "active") {
      throw new ConvexError("Your access to this clinic has been suspended. Contact the clinic owner.");
    }
    const body = args.body.trim();
    if (!body) throw new ConvexError("Write a message first.");
    if (body.length > MAX_BODY) throw new ConvexError("That message is too long. Split it into a few shorter ones.");

    let thread = await findThread(ctx, member, args);
    if (thread && !(await canSeeThread(ctx, member, thread))) throw new ConvexError("You're not part of this conversation.");
    if (args.patientId) {
      await assertPatientInClinic(ctx, member.clinic, args.patientId);
      if (!member.isOwner && !(await patientThreadMemberIds(ctx, member.clinic, args.patientId)).has(user._id)) {
        throw new ConvexError("Only this patient's clinicians and the clinic owner can talk about them here.");
      }
    }
    const now = Date.now();
    if (!thread) {
      const id = await ctx.db.insert("clinicThreads", {
        clinicId: member.clinic._id,
        kind: args.patientId ? "patient" : "team",
        patientId: args.patientId,
        createdBy: user._id,
        createdAt: now,
        lastMessageAt: now,
      });
      thread = (await ctx.db.get(id))!;
    }
    await ctx.db.insert("clinicThreadMessages", { threadId: thread._id, clinicId: member.clinic._id, senderId: user._id, body, createdAt: now });
    await ctx.db.patch(thread._id, { lastMessageAt: now, lastMessagePreview: body.slice(0, 140), lastSenderId: user._id });
    await markRead(ctx, user._id, thread._id, now);

    // Tell the others in it (by name, never the message: phones show notifications when locked)
    const recipients = thread.kind === "team" ? await teamMemberIds(ctx, member.clinic) : await patientThreadMemberIds(ctx, member.clinic, thread.patientId!);
    const patient = thread.patientId ? await ctx.db.get(thread.patientId) : null;
    const from = personName(user, (await senderIdentity(ctx, user)).name);
    for (const recipientId of recipients) {
      if (recipientId === user._id) continue;
      const recipient = await ctx.db.get(recipientId);
      if (!recipient) continue;
      const path = recipient.role === "clinic_owner" ? "/dashboard/clinic/messages" : "/dashboard/physiotherapist/messages";
      await insertNotification(ctx, {
        userId: recipientId,
        type: "clinic_team_message",
        priority: "medium",
        status: "pending",
        createdAt: now,
        payload: {
          title: thread.kind === "team" ? `${from} in ${member.clinic.name} team` : `${from} about ${personName(patient, "a patient")}`,
          body: "Open Rehabify to read and reply.",
          data: { entityId: String(thread._id), entityType: "clinic_thread" },
          link: `${path}?team=${thread.kind === "team" ? "team" : `patient:${thread.patientId}`}`,
        },
      });
    }
    return { threadId: thread._id };
  },
});

async function markRead(ctx: MutationCtx, userId: Id<"users">, threadId: Id<"clinicThreads">, at: number) {
  const row = await ctx.db
    .query("clinicThreadReads")
    .withIndex("by_user_and_thread", (q) => q.eq("userId", userId).eq("threadId", threadId))
    .first();
  if (row) await ctx.db.patch(row._id, { lastReadAt: at });
  else await ctx.db.insert("clinicThreadReads", { userId, threadId, lastReadAt: at });
}

/** Opening a thread marks it read. */
export const markTeamThreadRead = mutation({
  args: { threadId: v.id("clinicThreads") },
  handler: async (ctx, args) => {
    const member = await teamMember(ctx);
    if (!member) return null;
    const thread = await ctx.db.get(args.threadId);
    if (!thread || !(await canSeeThread(ctx, member, thread))) return null;
    await markRead(ctx, member.user._id, thread._id, Date.now());
    return null;
  },
});
