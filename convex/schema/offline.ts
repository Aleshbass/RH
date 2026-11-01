import { defineTable } from "convex/server";
import { v } from "convex/values";

export const offlineTables = {
  // Phones that keep Rehabify data for offline use. Data on the phone is encrypted with a key that
  // is locked twice: by the person's PIN (offline unlock) and by this random secret, which the
  // signed-in owner fetches to unlock silently online and to recover a forgotten PIN. Revoking a
  // device withholds the secret and tells the phone to wipe its copy. No patient data here.
  // Functions in offline.ts, the phone side in lib/offline/.
  offlineDevices: defineTable({
    userId: v.id("users"),
    // Random id made on the phone (lib/offline/vault.ts)
    deviceId: v.string(),
    // 32 random bytes, base64
    wrapSecret: v.string(),
    // The phone's browser, so the owner can tell their devices apart
    label: v.optional(v.string()),
    createdAt: v.number(),
    lastSeenAt: v.number(),
    // Switched off: the secret is no longer given out and the phone wipes its copy
    revokedAt: v.optional(v.number()),
  })
    .index("by_user_and_device", ["userId", "deviceId"])
    .index("by_user", ["userId"]),
};
