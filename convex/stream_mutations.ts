// @ts-nocheck
import { v } from "convex/values"
import { internalMutation } from "./_generated/server"
import type { Doc, Id } from './_generated/dataModel'

// Helper to resolve either a Clerk user ID (identity.subject like "user_xxx")
// or a Convex users._id into a Convex Id<"users">. Returns null if not found.
async function resolveUserId(ctx: any, maybeId: string): Promise<Id<"users"> | null> {
  if (!maybeId) return null as any
  // Try Clerk ID via by_clerk_id index
  try {
    const byClerk = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", maybeId))
      .unique()
    if (byClerk) return byClerk._id as Id<"users">
  } catch {}
  // Try direct Convex Id
  try {
    const asConvexId = maybeId as unknown as Id<"users">
    const doc = await ctx.db.get(asConvexId)
    if (doc) return asConvexId
  } catch {}
  return null as any
}

// Internal mutation to store call metadata
export const storeCallMetadata = internalMutation({
  args: {
    streamCallId: v.string(),
    callType: v.string(),
    createdBy: v.string(),
    participants: v.array(v.string()),
    settings: v.any(),
    streamResponse: v.any(),
  },
  handler: async (ctx, args) => {
    // Check if videoCalls table exists and has streamCallId field
    const existingCall = await ctx.db
      .query("videoCalls")
      .filter(q => q.eq(q.field("roomId"), args.streamCallId))
      .first()

    if (existingCall) {
      // Update existing call with Stream metadata
      await ctx.db.patch(existingCall._id, {
        platform: "stream",
        streamCallId: args.streamCallId,
        streamCallType: args.callType,
        streamMetadata: args.streamResponse,
      })
    } else {
      // Resolve IDs to Convex users._id
      const initiatorId = await resolveUserId(ctx, args.createdBy)
      const participantIdsRaw = await Promise.all(
        (args.participants || []).map((p) => resolveUserId(ctx, p))
      )
      const participantIds = (participantIdsRaw.filter(Boolean) as Id<"users">[])
      // Ensure we have at least one participant
      const participantsToUse = participantIds.length > 0
        ? participantIds
        : (initiatorId ? [initiatorId] : [])

      // Create new video call record with schema-compliant fields
      await ctx.db.insert("videoCalls", {
        roomId: args.streamCallId,
        platform: "stream",
        streamCallId: args.streamCallId,
        streamCallType: args.callType,
        initiatorId: (initiatorId || participantsToUse[0]) as Id<"users">,
        participants: participantsToUse as Id<"users">[],
        callType: "consultation",
        status: "scheduled",
        scheduledAt: Date.now(),
        startTime: Date.now(),
        settings: args.settings,
        streamMetadata: args.streamResponse,
      })
    }
  },
})

// Internal mutation to update call status
export const updateCallStatus = internalMutation({
  args: {
    streamCallId: v.string(),
    status: v.string(),
    endedBy: v.optional(v.string()),
    endedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db
      .query("videoCalls")
      .filter(q => q.eq(q.field("streamCallId"), args.streamCallId))
      .first()

    if (call) {
      const endedById = args.endedBy ? await resolveUserId(ctx, args.endedBy) : null
      await ctx.db.patch(call._id, {
        status: args.status as any,
        endTime: args.endedAt,
        ...(endedById ? { endedBy: endedById as Id<"users"> } : {}),
      })
    }
  },
})
