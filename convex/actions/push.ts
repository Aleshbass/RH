"use node";

/**
 * Sends web push notifications (push.ts has the devices and the setup notes).
 * The service worker (public/sw.js) shows them and opens `url` when tapped.
 */
import webpush from "web-push";
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalAction, type ActionCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { publicAppUrl } from "../helpers/appUrl";

// Plain references: the generated api type is at TypeScript's depth limit (TS2589)
const devicesForUserRef = makeFunctionReference<"query", { userId: Id<"users"> }, Doc<"pushSubscriptions">[]>(
  "push:devicesForUser"
);
const devicesByIdsRef = makeFunctionReference<"query", { ids: Id<"pushSubscriptions">[] }, Doc<"pushSubscriptions">[]>(
  "push:devicesByIds"
);
const recordDeliveryRef = makeFunctionReference<
  "mutation",
  { sent: Id<"pushSubscriptions">[]; gone: Id<"pushSubscriptions">[]; failed: Id<"pushSubscriptions">[] },
  null
>("push:recordDelivery");

const messageValidator = v.object({
  title: v.string(),
  body: v.string(),
  url: v.optional(v.string()),
  tag: v.optional(v.string()),
  badge: v.optional(v.number()),
});

function configured(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || publicAppUrl(), publicKey, privateKey);
  return true;
}

async function deliver(
  ctx: Pick<ActionCtx, "runMutation">,
  devices: Doc<"pushSubscriptions">[],
  message: { title: string; body: string; url?: string; tag?: string; badge?: number }
) {
  const payload = JSON.stringify(message);
  const sent: Id<"pushSubscriptions">[] = [];
  const gone: Id<"pushSubscriptions">[] = [];
  const failed: Id<"pushSubscriptions">[] = [];
  await Promise.all(
    devices.map(async (device) => {
      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          payload,
          { TTL: 60 * 60 * 24, urgency: "high" }
        );
        sent.push(device._id);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404/410: the browser dropped this subscription. Anything else is retried next time
        // and the device is dropped after 5 failures (push.recordDelivery).
        if (status === 404 || status === 410) gone.push(device._id);
        else {
          failed.push(device._id);
          console.error("push: send failed", status ?? (error instanceof Error ? error.message : "unknown"));
        }
      }
    })
  );
  if (sent.length || gone.length || failed.length) await ctx.runMutation(recordDeliveryRef, { sent, gone, failed });
}

export const sendToUser = internalAction({
  args: { userId: v.id("users"), message: messageValidator },
  handler: async (ctx, { userId, message }) => {
    if (!configured()) return null;
    const devices = await ctx.runQuery(devicesForUserRef, { userId });
    if (devices.length) await deliver(ctx, devices, message);
    return null;
  },
});

export const sendToDevices = internalAction({
  args: { subscriptionIds: v.array(v.id("pushSubscriptions")), message: messageValidator },
  handler: async (ctx, { subscriptionIds, message }) => {
    if (!configured()) return null;
    const devices = await ctx.runQuery(devicesByIdsRef, { ids: subscriptionIds });
    if (devices.length) await deliver(ctx, devices, message);
    return null;
  },
});
