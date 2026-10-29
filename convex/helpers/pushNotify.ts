/**
 * Web push for in-app notifications. Every notifications row is written through
 * insertNotification, which also sends it to the phones and browsers where the user turned
 * notifications on (push.ts, sent by actions/push.ts).
 */
import { makeFunctionReference } from "convex/server";
import type { WithoutSystemFields } from "convex/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { inQuietHours, pushCategoryFor, URGENT_PUSH_TYPES, type PushCategory } from "./pushCategories";
import { zonedTimeKey } from "./lagosTime";

export type PushMessage = {
  title: string;
  body: string;
  /** App path opened when the notification is tapped */
  url?: string;
  /** Notifications with the same tag replace each other on the device (e.g. one chat) */
  tag?: string;
  /** Red count on the home-screen app icon (filled in by queuePush) */
  badge?: number;
};

// Plain reference: the generated api type is at TypeScript's depth limit (TS2589)
const sendToUserRef = makeFunctionReference<"action", { userId: Id<"users">; message: PushMessage }, null>(
  "actions/push:sendToUser"
);

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Unread notifications plus unread chat messages: the same counts as the bell
 * (notifications/core getMyUnreadCount) and the Messages tab (chat getUnreadCount).
 */
async function unreadBadgeCount(ctx: Pick<MutationCtx, "db">, userId: Id<"users">): Promise<number> {
  const [notifications, asFirst, asSecond] = await Promise.all([
    ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) => q.eq("userId", userId).eq("readAt", undefined))
      .take(100),
    ctx.db.query("conversations").withIndex("by_participant1", (q) => q.eq("participant1Id", userId)).take(300),
    ctx.db.query("conversations").withIndex("by_participant2", (q) => q.eq("participant2Id", userId)).take(300),
  ]);
  const messages =
    asFirst.reduce((sum, c) => sum + (c.unreadCount1 ?? 0), 0) +
    asSecond.reduce((sum, c) => sum + (c.unreadCount2 ?? 0), 0);
  return notifications.length + messages;
}

/** False if the person switched this category off, or it's their quiet hours and it can wait. */
async function wantsPush(
  ctx: Pick<MutationCtx, "db">,
  userId: Id<"users">,
  category: PushCategory,
  urgent: boolean
): Promise<boolean> {
  const prefs = await ctx.db
    .query("pushPreferences")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (!prefs) return true;
  if (prefs.off.includes(category)) return false;
  // Quiet hours: it stays in the bell; only urgent alerts reach the phone
  if (prefs.quietHours && !urgent && inQuietHours(zonedTimeKey(Date.now()), prefs.quietHours)) return false;
  return true;
}

/**
 * Push to the user's devices, if they turned notifications on. Never throws.
 * `category` applies their settings (null: bell only, never pushed); without one (a test
 * notification) it always goes. `urgent` alerts still go during quiet hours.
 */
export async function queuePush(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  userId: Id<"users">,
  message: PushMessage,
  options: { category?: PushCategory | null; urgent?: boolean } = {}
): Promise<void> {
  try {
    if (options.category === null) return;
    const device = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!device) return;
    if (options.category && !(await wantsPush(ctx, userId, options.category, options.urgent === true))) return;
    await ctx.scheduler.runAfter(0, sendToUserRef, {
      userId,
      message: {
        title: clip(message.title, 80),
        body: clip(message.body, 240),
        url: message.url,
        tag: message.tag,
        badge: message.badge ?? (await unreadBadgeCount(ctx, userId)),
      },
    });
  } catch (error) {
    console.error("push: could not queue", error instanceof Error ? error.message : "unknown");
  }
}

const MESSAGES_PATH: Partial<Record<NonNullable<Doc<"users">["role"]>, string>> = {
  physiotherapist: "/dashboard/physiotherapist/messages",
  clinic_owner: "/dashboard/clinic/messages",
  clinic_staff: "/dashboard/clinic/messages",
  patient: "/dashboard/patient/messages",
};

/**
 * Push for a new chat message. Only the sender's name is shown, never the message itself:
 * notifications can appear on a locked screen. `senderLabel` is how they appear
 * (helpers/displayIdentity.ts: the clinic for its owner, "Mary — Clinic" for a clinician).
 */
export async function pushNewMessage(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  args: {
    sender: Pick<Doc<"users">, "firstName" | "lastName">;
    senderLabel?: string;
    receiver: Pick<Doc<"users">, "_id" | "role">;
    conversationId: Id<"conversations">;
    contentType: "text" | "image" | "file" | "audio";
  }
): Promise<void> {
  const name = args.senderLabel || [args.sender.firstName, args.sender.lastName].filter(Boolean).join(" ") || "Your care team";
  const what =
    args.contentType === "image" ? "a photo" : args.contentType === "file" ? "a file" : args.contentType === "audio" ? "a voice note" : "a message";
  await queuePush(
    ctx,
    args.receiver._id,
    {
      title: name,
      body: `Sent you ${what}. Open Rehabify to read and reply.`,
      url: (args.receiver.role && MESSAGES_PATH[args.receiver.role]) || "/dashboard",
      tag: `chat-${args.conversationId}`,
    },
    { category: "messages" }
  );
}

/** Where a notification's link points, from the current or the legacy fields. */
function linkOf(doc: WithoutSystemFields<Doc<"notifications">>): string | undefined {
  const data = (doc.payload?.data ?? doc.data) as { actionUrl?: unknown; link?: unknown } | undefined;
  const link = doc.payload?.link ?? data?.actionUrl ?? data?.link;
  return typeof link === "string" && link ? link : undefined;
}

/** An optional `data.pushTag`: a newer notification with the same tag replaces the older one. */
function pushTagOf(doc: WithoutSystemFields<Doc<"notifications">>): string | undefined {
  const data = (doc.payload?.data ?? doc.data) as { pushTag?: unknown } | undefined;
  return typeof data?.pushTag === "string" ? data.pushTag : undefined;
}

/** ctx.db.insert("notifications", ...) that also pushes the notification to the user's devices. */
export async function insertNotification(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  doc: WithoutSystemFields<Doc<"notifications">>
): Promise<Id<"notifications">> {
  // Older callers write title/message/data at the top level. The bell (and the phone) read
  // `payload`, so fill it in from those fields; otherwise the notification shows up blank.
  if (!doc.payload && doc.title) {
    const link = linkOf(doc);
    doc = { ...doc, payload: { title: doc.title, body: doc.message ?? "", data: doc.data, ...(link ? { link } : {}) } };
  }
  const id = await ctx.db.insert("notifications", doc);
  const title = doc.payload?.title ?? doc.title;
  if (title) {
    await queuePush(
      ctx,
      doc.userId,
      {
        title,
        body: doc.payload?.body ?? doc.message ?? "",
        url: linkOf(doc) ?? "/dashboard/notifications",
        tag: pushTagOf(doc),
      },
      {
        category: pushCategoryFor(doc.type),
        urgent: URGENT_PUSH_TYPES.has(doc.type) || doc.priority === "urgent",
      }
    );
    await tellCareCircle(ctx, doc, title);
  }
  return id;
}

/** News about a patient's care that their family and caregivers also hear (never messages or notes). */
const CARE_CIRCLE_TYPES = /appointment|booking|visit|payment|invoice|program|programme|care_plan|discharge|follow_up|questionnaire/;

/**
 * A patient's care news also goes to their care circle (convex/careCircle.ts): "Ada: Visit
 * confirmed for Tue 10:00". Payments only reach people allowed to pay. This is how a caregiver
 * looking after someone without a phone hears about their care at all.
 */
async function tellCareCircle(ctx: Pick<MutationCtx, "db" | "scheduler">, doc: WithoutSystemFields<Doc<"notifications">>, title: string) {
  if (!CARE_CIRCLE_TYPES.test(doc.type) || doc.type.startsWith("care_circle")) return;
  const grants = await ctx.db
    .query("familyAccessGrants")
    .withIndex("by_patient_user_id", (q) => q.eq("patientUserId", doc.userId))
    .take(20);
  const now = Date.now();
  const live = grants.filter((g) => g.status === "active" && (!g.expiresAt || g.expiresAt > now));
  if (live.length === 0) return;
  const patient = await ctx.db.get(doc.userId);
  if (!patient || patient.role !== "patient") return;
  const name = patient.firstName?.trim() || "Your family member";
  const money = /payment|invoice/.test(doc.type);
  const link = `/dashboard/family?person=${patient._id}`;
  for (const grant of live) {
    if (money && !grant.permissions.includes("pay")) continue;
    await insertNotification(ctx, {
      userId: grant.familyMemberUserId,
      type: `care_circle:${doc.type}`,
      priority: doc.priority,
      status: "pending",
      payload: { title: `${name}: ${title}`, body: doc.payload?.body ?? doc.message ?? "", link, data: { actionUrl: link } },
      createdAt: now,
    });
  }
}
