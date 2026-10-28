/**
 * Web push devices and admin push messages.
 *
 * A device is a browser or home-screen app where someone turned notifications on
 * (components/pwa). Sending happens in actions/push.ts, which needs the VAPID keys in the
 * Convex environment: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (from `npx web-push
 * generate-vapid-keys`), optionally VAPID_SUBJECT (a mailto: or https: contact).
 */
import { v, ConvexError } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getViewer, requireAdmin, requireViewer } from "./helpers/partnerAccess";
import { queuePush, type PushMessage } from "./helpers/pushNotify";
import { PUSH_CATEGORY_IDS } from "./helpers/pushCategories";

const MAX_DEVICES_PER_USER = 10;
const BROADCAST_CHUNK = 100;

// Plain reference: the generated api type is at TypeScript's depth limit (TS2589)
const sendToDevicesRef = makeFunctionReference<
  "action",
  { subscriptionIds: Id<"pushSubscriptions">[]; message: PushMessage },
  null
>("actions/push:sendToDevices");

const audienceValidator = v.union(
  v.literal("physiotherapists"),
  v.literal("clinics"),
  v.literal("patients"),
  v.literal("everyone")
);
type Audience = "physiotherapists" | "clinics" | "patients" | "everyone";

function inAudience(role: Doc<"users">["role"], audience: Audience): boolean {
  if (audience === "everyone") return true;
  if (audience === "physiotherapists") return role === "physiotherapist";
  if (audience === "clinics") return role === "clinic_owner" || role === "clinic_staff";
  return role === "patient";
}

/** The public key the browser subscribes with, and how many devices the viewer has on. */
export const config = query({
  args: {},
  handler: async (ctx) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY || null;
    const viewer = await getViewer(ctx);
    if (!viewer?.user) return { publicKey, devices: 0 };
    const devices = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", viewer.user!._id))
      .take(MAX_DEVICES_PER_USER + 1);
    return { publicKey, devices: devices.length };
  },
});

/** Save this device for the signed-in user (a device that changes hands moves to the new user). */
export const subscribe = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
    installed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    if (!viewer.user) throw new ConvexError("Finish setting up your account first.");
    const userId = viewer.user._id;
    if (!/^https:\/\//.test(args.endpoint) || args.endpoint.length > 2048) {
      throw new ConvexError("This browser gave an invalid notification address.");
    }
    if (args.p256dh.length > 256 || args.auth.length > 64) throw new ConvexError("Invalid notification keys.");

    const fields = {
      userId,
      p256dh: args.p256dh,
      auth: args.auth,
      userAgent: args.userAgent?.slice(0, 300),
      installed: args.installed,
      failures: 0,
    };
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return { ok: true };
    }
    await ctx.db.insert("pushSubscriptions", { ...fields, endpoint: args.endpoint, createdAt: Date.now() });

    // Keep the newest few devices per person
    const devices = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const extra = devices.sort((a, b) => b.createdAt - a.createdAt).slice(MAX_DEVICES_PER_USER);
    for (const device of extra) await ctx.db.delete(device._id);
    return { ok: true };
  },
});

/** Forget this device (notifications turned off, or the browser dropped its subscription). */
export const unsubscribe = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const viewer = await requireViewer(ctx);
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .first();
    if (existing && (existing.userId === viewer.user?._id || viewer.isAdmin)) await ctx.db.delete(existing._id);
    return { ok: true };
  },
});

/** The viewer's phone notification settings (no row yet: everything on, no quiet hours). */
export const myPreferences = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer?.user) return null;
    const prefs = await ctx.db
      .query("pushPreferences")
      .withIndex("by_user", (q) => q.eq("userId", viewer.user!._id))
      .first();
    return { off: prefs?.off ?? [], quietHours: prefs?.quietHours ?? null };
  },
});

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const savePreferences = mutation({
  args: {
    off: v.array(v.string()),
    quietHours: v.union(v.null(), v.object({ start: v.string(), end: v.string() })),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    if (!viewer.user) throw new ConvexError("Finish setting up your account first.");
    const off = [...new Set(args.off.filter((id) => (PUSH_CATEGORY_IDS as string[]).includes(id)))];
    if (args.quietHours && (!HHMM.test(args.quietHours.start) || !HHMM.test(args.quietHours.end))) {
      throw new ConvexError("Choose a start and end time for quiet hours.");
    }
    const fields = { off, quietHours: args.quietHours ?? undefined, updatedAt: Date.now() };
    const existing = await ctx.db
      .query("pushPreferences")
      .withIndex("by_user", (q) => q.eq("userId", viewer.user!._id))
      .first();
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("pushPreferences", { userId: viewer.user._id, ...fields });
    return { ok: true };
  },
});

/** "Send a test" from the app setup prompt. */
export const sendTest = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (!viewer.user) throw new ConvexError("Finish setting up your account first.");
    await queuePush(ctx, viewer.user._id, {
      title: "Notifications are on",
      body: "You'll hear from Rehabify here when a new patient or message comes in.",
      url: "/dashboard",
      tag: "rehabify-test",
    });
    return { ok: true };
  },
});

export const devicesForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) =>
    ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MAX_DEVICES_PER_USER),
});

export const devicesByIds = internalQuery({
  args: { ids: v.array(v.id("pushSubscriptions")) },
  handler: async (ctx, { ids }) => {
    const rows = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return rows.filter((row): row is Doc<"pushSubscriptions"> => row !== null);
  },
});

/** Delivery results: gone devices are removed, ones that keep failing are dropped after 5 tries. */
export const recordDelivery = internalMutation({
  args: {
    sent: v.array(v.id("pushSubscriptions")),
    gone: v.array(v.id("pushSubscriptions")),
    failed: v.array(v.id("pushSubscriptions")),
  },
  handler: async (ctx, { sent, gone, failed }) => {
    const now = Date.now();
    for (const id of sent) {
      const row = await ctx.db.get(id);
      if (row) await ctx.db.patch(id, { lastSentAt: now, failures: 0 });
    }
    for (const id of gone) {
      if (await ctx.db.get(id)) await ctx.db.delete(id);
    }
    for (const id of failed) {
      const row = await ctx.db.get(id);
      if (!row) continue;
      const failures = (row.failures ?? 0) + 1;
      if (failures >= 5) await ctx.db.delete(id);
      else await ctx.db.patch(id, { failures });
    }
  },
});

/** Every device with its owner's role. */
async function devicesWithRoles(ctx: Parameters<typeof requireAdmin>[0]) {
  const devices = await ctx.db.query("pushSubscriptions").collect();
  const roles = new Map<Id<"users">, Doc<"users">["role"]>();
  for (const device of devices) {
    if (!roles.has(device.userId)) roles.set(device.userId, (await ctx.db.get(device.userId))?.role);
  }
  return devices.map((device) => ({ device, role: roles.get(device.userId) }));
}

/** Admin: people and devices with notifications on, per audience, plus recent push messages. */
export const adminOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const all = await devicesWithRoles(ctx);
    const audiences: Audience[] = ["physiotherapists", "clinics", "patients", "everyone"];
    const counts = {} as Record<Audience, { people: number; devices: number }>;
    for (const audience of audiences) {
      const devices = all.filter((d) => inAudience(d.role, audience)).map((d) => d.device);
      counts[audience] = { people: new Set(devices.map((d) => d.userId)).size, devices: devices.length };
    }
    const recent = await ctx.db.query("pushBroadcasts").withIndex("by_created").order("desc").take(20);
    return {
      configured: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
      counts,
      recent: recent.map((b) => ({
        _id: b._id,
        title: b.title,
        body: b.body,
        url: b.url,
        audience: b.audience,
        devices: b.devices,
        createdAt: b.createdAt,
      })),
    };
  },
});

/** Admin: send a push message to everyone in an audience who has notifications on. */
export const broadcast = mutation({
  args: {
    audience: audienceValidator,
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const title = args.title.trim();
    const body = args.body.trim();
    const url = args.url?.trim() || undefined;
    if (!title || title.length > 80) throw new ConvexError("Write a title of up to 80 characters.");
    if (!body || body.length > 240) throw new ConvexError("Write a message of up to 240 characters.");
    if (url && !url.startsWith("/")) throw new ConvexError("The link must be a Rehabify page, starting with /.");

    const devices = (await devicesWithRoles(ctx))
      .filter((d) => inAudience(d.role, args.audience))
      .map((d) => d.device);
    if (devices.length === 0) throw new ConvexError("Nobody in this group has notifications on yet.");
    const message: PushMessage = { title, body, url: url ?? "/dashboard" };
    for (let i = 0; i < devices.length; i += BROADCAST_CHUNK) {
      await ctx.scheduler.runAfter(0, sendToDevicesRef, {
        subscriptionIds: devices.slice(i, i + BROADCAST_CHUNK).map((d) => d._id),
        message,
      });
    }
    await ctx.db.insert("pushBroadcasts", {
      title,
      body,
      url,
      audience: args.audience,
      devices: devices.length,
      sentBy: admin.user._id,
      createdAt: Date.now(),
    });
    return { devices: devices.length };
  },
});
