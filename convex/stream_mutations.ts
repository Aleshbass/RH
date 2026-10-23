// @ts-nocheck
import { v } from "convex/values"
import { internalMutation, internalQuery } from "./_generated/server"
import type { Doc, Id } from './_generated/dataModel'
import { callMemberIds, canEndVideoCall, canJoinVideoCall, findCallByRoomId, isPrivateCall, mayInviteToCall } from "./helpers/callAccess"
import { isOpenAppointment } from "./helpers/appointmentStatus"

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
  } catch { }
  // Try direct Convex Id
  try {
    const asConvexId = ctx.db.normalizeId("users", maybeId)
    if (asConvexId && (await ctx.db.get(asConvexId))) return asConvexId
  } catch { }
  return null as any
}

// Internal mutation to store call metadata. `participants` were checked by planStreamCall.
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
    const existingCall = await findCallByRoomId(ctx, args.streamCallId)

    const participantIds = (await Promise.all((args.participants || []).map((p) => resolveUserId(ctx, p)))).filter(
      Boolean
    ) as Id<"users">[]

    if (existingCall) {
      // Update existing call with Stream metadata, keeping anyone newly invited by the host
      const merged = [...new Set([...existingCall.participants, ...participantIds])]
      await ctx.db.patch(existingCall._id, {
        platform: "stream",
        streamCallId: args.streamCallId,
        streamCallType: args.callType,
        streamMetadata: args.streamResponse,
        ...(merged.length !== existingCall.participants.length ? { participants: merged } : {}),
      })
    } else {
      const initiatorId = await resolveUserId(ctx, args.createdBy)
      const participantsToUse = participantIds.length > 0 ? participantIds : initiatorId ? [initiatorId] : []

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
    const call =
      (await ctx.db.query("videoCalls").withIndex("by_stream_call_id", (q) => q.eq("streamCallId", args.streamCallId)).first()) ??
      (await findCallByRoomId(ctx, args.streamCallId))

    if (call) {
      const endedById = args.endedBy ? await resolveUserId(ctx, args.endedBy) : null
      await ctx.db.patch(call._id, {
        status: args.status as any,
        endTime: args.endedAt,
        ...(endedById ? { endedBy: endedById as Id<"users"> } : {}),
      })

      // A call ending completes its visit, but only a visit that is still going ahead and has started
      if (args.status === 'ended' && call.appointmentId) {
        try {
          const appointment = await ctx.db.get(call.appointmentId)
          if (appointment && isOpenAppointment(appointment.status) && appointment.startTime <= Date.now()) {
            await ctx.db.patch(call.appointmentId, {
              status: 'completed',
            })
          }
        } catch (error) {
          console.error('Failed to update appointment status:', error)
        }
      }
    }
  },
})

// Whether a signed-in Clerk user may join / end a Stream call; used by the Node actions in stream.ts.
// A room with no record yet is a new ad-hoc call, which anyone signed in may start (as its host).
export const getCallAccess = internalQuery({
  args: { callId: v.string(), clerkId: v.string() },
  handler: async (ctx, args) => {
    const call = await findCallByRoomId(ctx, args.callId)
    if (!call) return { exists: false, canJoin: true, canEnd: false }
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first()
    if (!user) return { exists: true, canJoin: false, canEnd: false }
    return {
      exists: true,
      canJoin: await canJoinVideoCall(ctx, call, user),
      canEnd: await canEndVideoCall(ctx, call, user),
    }
  },
})

/**
 * Who goes on a Stream call and with which settings, decided from our records rather than the
 * browser. Existing calls: their members (plus anyone the host newly asks for and may invite).
 * New ad-hoc rooms: the caller as host, plus requested people the caller may invite.
 * Recording follows the call record (off unless the call was set up with it).
 */
export const planStreamCall = internalQuery({
  args: { callId: v.string(), clerkId: v.string(), requested: v.array(v.string()) },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first()
    if (!caller) return { canJoin: false, memberClerkIds: [] as string[], addedParticipantIds: [] as string[], recordingEnabled: false, maxParticipants: 10 }

    const call = await findCallByRoomId(ctx, args.callId)
    if (call && !(await canJoinVideoCall(ctx, call, caller))) {
      return { canJoin: false, memberClerkIds: [], addedParticipantIds: [], recordingEnabled: false, maxParticipants: 10 }
    }

    const memberIds = new Set<Id<"users">>(call ? await callMemberIds(ctx, call) : [caller._id])
    memberIds.add(caller._id)

    // Only the host of a room (or someone booked on a private call) may bring people in
    const mayAdd = !call || call.initiatorId === caller._id || caller.role === "admin" || (isPrivateCall(call) && memberIds.has(caller._id))
    const added: Id<"users">[] = []
    if (mayAdd) {
      for (const raw of args.requested) {
        const id = await resolveUserId(ctx, raw)
        if (!id || memberIds.has(id)) continue
        const target = await ctx.db.get(id)
        if (target && (await mayInviteToCall(ctx, caller, target))) {
          memberIds.add(id)
          added.push(id)
        }
      }
    }

    const memberClerkIds: string[] = []
    for (const id of memberIds) {
      const member = await ctx.db.get(id)
      if (member?.clerkId) memberClerkIds.push(member.clerkId)
    }
    return {
      canJoin: true,
      memberClerkIds,
      addedParticipantIds: added as string[],
      recordingEnabled: Boolean(call?.settings?.recordingEnabled),
      maxParticipants: Math.min(Math.max(Number(call?.settings?.maxParticipants) || 10, 2), 50),
    }
  },
})
