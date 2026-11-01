/**
 * Phones that keep encrypted Rehabify data for offline use (schema/offline.ts; the phone side is
 * lib/offline/). The data key on each phone is locked twice: by the person's PIN, for offline, and
 * by a random secret kept here. Online, the signed-in owner gets the secret back, so the phone
 * unlocks without the PIN and a forgotten PIN can be replaced. Switching a phone off withholds the
 * secret and tells it to wipe its copy. Nothing here is patient data.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./auth";

/** lib/offline/vault.ts makes these: 24 random bytes, base64url */
const DEVICE_ID = /^[A-Za-z0-9_-]{16,64}$/;
/** More than this many phones per person is almost certainly a mistake or misuse */
const MAX_DEVICES = 10;
/** lastSeenAt is only rewritten this often, not on every app open */
const SEEN_EVERY_MS = 60 * 60 * 1000;
/** A phone not opened for this long is switched off when room is needed for a new one */
const STALE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;

function newSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw);
}

/**
 * This phone's unlock secret for the signed-in person, registering the phone the first time.
 * "revoked": the phone was switched off and must wipe its offline copy.
 */
export const unlockDevice = mutation({
  args: { deviceId: v.string(), label: v.optional(v.string()) },
  handler: async (ctx, { deviceId, label }) => {
    if (!DEVICE_ID.test(deviceId)) throw new ConvexError("This device can't be set up for offline use");
    const user = await getAuthenticatedUser(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("offlineDevices")
      .withIndex("by_user_and_device", (q) => q.eq("userId", user._id).eq("deviceId", deviceId))
      .unique();
    if (existing) {
      if (existing.revokedAt) return { status: "revoked" as const };
      if (now - existing.lastSeenAt > SEEN_EVERY_MS) await ctx.db.patch(existing._id, { lastSeenAt: now });
      return { status: "ok" as const, secret: existing.wrapSecret };
    }

    const devices = await ctx.db
      .query("offlineDevices")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    let active = devices.filter((device) => !device.revokedAt);
    if (active.length >= MAX_DEVICES) {
      // Phones not opened for 90 days (replaced, reset, browser data cleared) make room first
      for (const device of active.filter((device) => now - device.lastSeenAt > STALE_AFTER_MS)) {
        await ctx.db.patch(device._id, { revokedAt: now, wrapSecret: "" });
      }
      active = active.filter((device) => now - device.lastSeenAt <= STALE_AFTER_MS);
    }
    if (active.length >= MAX_DEVICES) {
      throw new ConvexError("Too many devices keep Rehabify offline. Switch one off in Settings first.");
    }
    const secret = newSecret();
    await ctx.db.insert("offlineDevices", {
      userId: user._id,
      deviceId,
      wrapSecret: secret,
      label: label?.slice(0, 120),
      createdAt: now,
      lastSeenAt: now,
    });
    return { status: "ok" as const, secret };
  },
});

/** The signed-in person's phones that keep offline data (never the secrets). */
export const listMyDevices = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    const devices = await ctx.db
      .query("offlineDevices")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return devices
      .filter((device) => !device.revokedAt)
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .map((device) => ({
        deviceId: device.deviceId,
        label: device.label ?? null,
        createdAt: device.createdAt,
        lastSeenAt: device.lastSeenAt,
      }));
  },
});

/** Switches one of the signed-in person's phones off (lost or replaced phone). */
export const revokeDevice = mutation({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const user = await getAuthenticatedUser(ctx);
    const device = await ctx.db
      .query("offlineDevices")
      .withIndex("by_user_and_device", (q) => q.eq("userId", user._id).eq("deviceId", deviceId))
      .unique();
    if (!device || device.revokedAt) return { revoked: false };
    await ctx.db.patch(device._id, { revokedAt: Date.now(), wrapSecret: "" });
    return { revoked: true };
  },
});
