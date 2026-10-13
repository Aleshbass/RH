// @ts-nocheck
import { v } from "convex/values"
import { query, internalQuery } from "./_generated/server"
import type { Doc, Id } from './_generated/dataModel'

// Query to get call metadata
/**
 * Call details for the call page. Only participants (or an admin) get them; anyone else,
 * including a signed-out visitor, gets null. Participant emails are shown to admins only.
 */
export const getCallMetadata = query({
  args: {
    callId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const viewer = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first()
    if (!viewer) return null
    const metadata = await loadCallMetadata(ctx, args.callId)
    if (!metadata) return null
    const isAdmin = viewer.role === "admin"
    const isParty =
      metadata.participants.includes(viewer._id) ||
      metadata.initiatorId === viewer._id ||
      metadata.patientId === viewer._id ||
      metadata.physiotherapistId === viewer._id
    if (!isParty && !isAdmin) return null
    return {
      ...metadata,
      participantDetails: metadata.participantDetails.map((p) => (isAdmin ? p : { ...p, email: undefined })),
    }
  },
})

/** Server-side lookup (e.g. RSVP updates after an invitation email): no auth, internal only. */
export const getCallMetadataInternal = internalQuery({
  args: { callId: v.string() },
  handler: async (ctx, args) => loadCallMetadata(ctx, args.callId),
})

async function loadCallMetadata(ctx, callId: string) {
    const args = { callId }
    const call = await ctx.db
      .query("videoCalls")
      .filter(q => 
        q.or(
          q.eq(q.field("roomId"), args.callId),
          q.eq(q.field("streamCallId"), args.callId)
        )
      )
      .first()

    if (!call) {
      return null
    }

    // Get participant details
    const participants = await Promise.all(
      call.participants.map(async (userId) => {
        const user = await ctx.db.get(userId)
        return user ? {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          imageUrl: user.imageUrl,
        } : null
      })
    )

    return {
      ...call,
      participantDetails: participants.filter(Boolean),
    }
}

// Query to get user's Stream calls
export const getUserStreamCalls = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Unauthorized")
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject))
      .unique()
    
    if (!user) {
      throw new Error("User not found")
    }

    const limit = args.limit || 20

    // Get Stream calls where user is a participant
    const calls = await ctx.db
      .query("videoCalls")
      .filter(q => 
        q.and(
          q.eq(q.field("platform"), "stream"),
          q.or(
            q.eq(q.field("initiatorId"), user._id),
            // Note: This won't work with array contains, need to fetch all and filter
          )
        )
      )
      .order("desc")
      .take(limit)

    // Filter calls where user is actually a participant
    const userCalls = calls.filter(call => 
      call.participants.includes(user._id) || call.initiatorId === user._id
    )

    // Get participant details
    const callsWithDetails = await Promise.all(
      userCalls.map(async (call) => {
        const participants = await Promise.all(
          call.participants.map(async (userId) => {
            const participant = await ctx.db.get(userId)
            return participant ? {
              id: participant._id,
              firstName: participant.firstName,
              lastName: participant.lastName,
              email: participant.email,
              imageUrl: participant.imageUrl,
            } : null
          })
        )

        return {
          ...call,
          participantDetails: participants.filter(Boolean),
        }
      })
    )

    return callsWithDetails
  },
})
