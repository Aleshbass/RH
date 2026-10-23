// @ts-nocheck
"use node"

import { v } from "convex/values"
import { action } from "./_generated/server"
import { StreamClient } from "@stream-io/node-sdk"
import { api, internal } from "./_generated/api"
import type { Doc, Id } from './_generated/dataModel'
import { assertServerCaller } from "./helpers/serverSecret"
import { StreamChat } from 'stream-chat'

/** How long video and chat tokens last. A session that runs longer fetches a new one on rejoin. */
const TOKEN_TTL_SECONDS = 4 * 60 * 60

// Stream token generation action - securely generates tokens server-side.
// With `callId`, the video token only works for that call (and only for people on it).
export const getStreamToken = action({
  args: {
    userId: v.string(),
    userName: v.string(),
    userImage: v.optional(v.string()),
    callId: v.optional(v.string()),
    callType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Unauthorized")
    }

    // Verify the userId matches the authenticated user
    if (identity.subject !== args.userId) {
      throw new Error("User ID mismatch")
    }

    if (args.callId) {
      const access = await ctx.runQuery(internal.stream_mutations.getCallAccess, { callId: args.callId, clerkId: identity.subject })
      // A room with no record yet is a new one this user is about to host
      if (access.exists && !access.canJoin) throw new Error("You're not on this call")
    }

    // Get Stream credentials from environment
    const apiKey = process.env.STREAM_API_KEY
    const apiSecret = process.env.STREAM_SECRET

    if (!apiKey || !apiSecret) {
      throw new Error("Stream credentials not configured")
    }

    try {
      // Initialize Stream client (Video)
      const client = new StreamClient(apiKey, apiSecret)
      const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS

      const token = args.callId
        ? client.generateCallToken({
            user_id: args.userId,
            call_cids: [`${args.callType || 'default'}:${args.callId}`],
            exp,
          })
        : client.generateUserToken({
            user_id: args.userId,
            validity_in_seconds: TOKEN_TTL_SECONDS,
          })


      // Optionally update/create user in Stream (Video)
      await client.upsertUsers([{
        id: args.userId,
        name: args.userName,
        image: args.userImage,
        role: 'user',
      }])

      // Generate Chat token with the same credentials (expires with the video token)
      let chatToken: string | undefined
      try {
        const chatServer = StreamChat.getInstance(apiKey, apiSecret)
        chatToken = chatServer.createToken(args.userId, exp)
      } catch (e) {
        console.warn('Failed to create Stream Chat token, falling back to video token for chat auth')
      }

      return {
        token,
        apiKey,
        userId: args.userId,
        chatToken,
      }
    } catch (error) {
      console.error("Failed to generate Stream token:", error)
      throw new Error("Failed to generate Stream token")
    }
  },
})

// Create or get a Stream call. Members and settings come from our records (planStreamCall);
// `participants` are only requests, honoured for people the caller may invite, and `settings`
// can only shorten the call.
export const createStreamCall = action({
  args: {
    callId: v.string(),
    callType: v.optional(v.union(
      v.literal("default"),
      v.literal("livestream"),
      v.literal("audio_room"),
      v.literal("development")
    )),
    participants: v.array(v.object({
      userId: v.string(),
      userName: v.string(),
      userImage: v.optional(v.string()),
      role: v.optional(v.union(v.literal("host"), v.literal("participant"))),
    })),
    settings: v.optional(v.object({
      recordingEnabled: v.optional(v.boolean()),
      transcriptionEnabled: v.optional(v.boolean()),
      maxDuration: v.optional(v.number()), // in seconds
      geoFencing: v.optional(v.boolean()),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Unauthorized")
    }

    const plan = await ctx.runQuery(internal.stream_mutations.planStreamCall, {
      callId: args.callId,
      clerkId: identity.subject,
      requested: args.participants.map((p) => p.userId),
    })
    if (!plan.canJoin) {
      throw new Error("You're not on this call")
    }

    const apiKey = process.env.STREAM_API_KEY
    const apiSecret = process.env.STREAM_SECRET

    if (!apiKey || !apiSecret) {
      throw new Error("Stream credentials not configured")
    }

    try {
      const client = new StreamClient(apiKey, apiSecret)

      // Create call with specified type
      const callType = args.callType || 'default'
      const call = client.video.call(callType, args.callId)

      const streamUserIds = Array.from(new Set([identity.subject, ...plan.memberClerkIds]))
      const maxDuration = Math.min(Math.max(Number(args.settings?.maxDuration) || 7200, 600), 4 * 60 * 60)

      // Get or create the call
      const response = await call.getOrCreate({
        data: {
          created_by_id: identity.subject,
          members: streamUserIds.map(uid => ({
            user_id: uid,
            role: uid === identity.subject ? 'host' : 'user',
          })),
          settings_override: {
            recording: {
              mode: plan.recordingEnabled ? 'available' : 'disabled',
              audio_only: false,
              quality: '720p',
            },
            transcription: {
              mode: 'disabled',
            },
            limits: {
              max_duration_seconds: maxDuration,
              max_participants: plan.maxParticipants,
            },
          },
        },
      })

      // Members added after the call was first created (e.g. someone newly invited)
      if (!response.created && plan.memberClerkIds.length > 0) {
        try {
          await call.updateCallMembers({
            update_members: plan.memberClerkIds.map((uid) => ({ user_id: uid })),
          })
        } catch (e) {
          console.warn("Failed to update Stream call members", args.callId)
        }
      }

      // Create/ensure a Chat channel for this call with same members
      try {
        const chatServer = StreamChat.getInstance(apiKey, apiSecret)
        const channel = chatServer.channel('messaging', args.callId, {
          name: `Call ${args.callId}`,
          created_by_id: identity.subject,
        })
        try {
          await channel.create()
        } catch (e) {
          // Ignore if channel already exists
        }
        if (streamUserIds.length > 0) {
          try {
            await channel.addMembers(streamUserIds)
          } catch (e) {
            // Ignore addMembers errors (e.g., already a member)
          }
        }
      } catch (e) {
        console.warn("Failed to upsert chat channel for call", args.callId)
      }

      // Store call metadata in Convex
      await ctx.runMutation(internal.stream_mutations.storeCallMetadata, {
        streamCallId: args.callId,
        callType,
        createdBy: identity.subject,
        participants: streamUserIds,
        settings: { recordingEnabled: plan.recordingEnabled, transcriptionEnabled: false, maxDuration },
        streamResponse: {
          id: response.call.id,
          cid: response.call.cid,
          created_at: response.call.created_at ? new Date(response.call.created_at).toISOString() : new Date().toISOString(),
        },
      })

      return {
        callId: args.callId,
        callType,
        cid: response.call.cid,
        created: response.created,
      }
    } catch (error) {
      console.error("Failed to create Stream call:", error)
      throw new Error("Failed to create Stream call")
    }
  },
})

// End a Stream call
export const endStreamCall = action({
  args: {
    callId: v.string(),
    callType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Unauthorized")
    }

    const access = await ctx.runQuery(internal.stream_mutations.getCallAccess, { callId: args.callId, clerkId: identity.subject })
    if (!access.canEnd) {
      throw new Error("Only the people on this call can end it")
    }

    const apiKey = process.env.STREAM_API_KEY
    const apiSecret = process.env.STREAM_SECRET

    if (!apiKey || !apiSecret) {
      throw new Error("Stream credentials not configured")
    }

    try {
      const client = new StreamClient(apiKey, apiSecret)
      const callType = args.callType || 'default'
      const call = client.video.call(callType, args.callId)
      
      // End the call
      await call.end()

      // Update call metadata in Convex
      await ctx.runMutation(internal.stream_mutations.updateCallStatus, {
        streamCallId: args.callId,
        status: 'ended',
        endedBy: identity.subject,
        endedAt: Date.now(),
      })

      return { success: true }
    } catch (error) {
      console.error("Failed to end Stream call:", error)
      throw new Error("Failed to end Stream call")
    }
  },
})



// Ensure the current authenticated user is a member of the chat channel for this call.
// `userId` is ignored (kept so older clients still validate): only the signed-in caller is added.
export const ensureChatMembership = action({
  args: { callId: v.string(), userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Unauthorized')
    const access = await ctx.runQuery(internal.stream_mutations.getCallAccess, { callId: args.callId, clerkId: identity.subject })
    if (!access.exists || !access.canJoin) throw new Error("You're not on this call")

    const apiKey = process.env.STREAM_API_KEY
    const apiSecret = process.env.STREAM_SECRET
    if (!apiKey || !apiSecret) throw new Error('Stream credentials not configured')

    try {
      const memberId = identity.subject

      const chatServer = StreamChat.getInstance(apiKey, apiSecret)
      const channel = chatServer.channel('messaging', args.callId)
      try { await channel.create() } catch {}
      try { await channel.addMembers([memberId]) } catch {}
      return { success: true }
    } catch (e) {
      console.error('Failed to ensure chat membership:', e)
      throw new Error('Failed to ensure chat membership')
    }
  }
})

// Joy (WhatsApp) patients have no Clerk login, so the booking code in their
// short link is the credential. Failures are returned rather than thrown because
// Convex hides thrown messages from clients in production.
type JoyPatientCallToken =
  | { ok: false; reason: 'not_found' | 'cancelled' | 'too_early' | 'ended' }
  | { ok: true; apiKey: string; token: string; userId: string; userName: string; callId: string; clinicianName: string }

export const getJoyPatientCallToken = action({
  args: { code: v.string() },
  handler: async (ctx, args): Promise<JoyPatientCallToken> => {
    const join = await ctx.runQuery(internal.joyIntegration.resolveJoyPatientJoin, { code: args.code, now: Date.now() })
    if (!join.ok) return { ok: false as const, reason: join.reason }

    const apiKey = process.env.STREAM_API_KEY
    const apiSecret = process.env.STREAM_SECRET
    if (!apiKey || !apiSecret) {
      throw new Error("Stream credentials not configured")
    }

    const client = new StreamClient(apiKey, apiSecret)
    // Namespaced so a patient seat can never collide with a Clerk user ID.
    const userId = `joy-patient-${join.patientId}`
    await client.upsertUsers([{ id: userId, name: join.patientName, role: 'user' }])
    // The patient often arrives first; make sure the room exists for them.
    await client.video.call('default', join.callId).getOrCreate({ data: { created_by_id: userId } })

    // Scoped to this one call and expiring with the join window.
    const token = client.generateCallToken({
      user_id: userId,
      call_cids: [`default:${join.callId}`],
      exp: Math.floor(join.closesAt / 1000),
    })

    // Lets the physio see on the Joy handoff that the patient made it to the call (once per booking)
    await ctx.runMutation(internal.joyHandoff.recordJourneyEvent, {
      patientId: join.patientId, bookingId: join.bookingId, stage: 'call_joined', eventKey: `call-joined-${join.bookingId}`,
    })

    return {
      ok: true as const,
      apiKey,
      token,
      userId,
      userName: join.patientName,
      callId: join.callId,
      clinicianName: join.clinicianName,
    }
  },
})

// Generate a Stream token for an AwaDoc guest patient. Server only: /api/awadoc/validate-guest
// checks the guest token first, then calls this with CONVEX_SERVER_SECRET.
export const getGuestStreamToken = action({
  args: {
    guestUserId: v.string(),
    guestUserName: v.string(),
    serverSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertServerCaller(args.serverSecret)
    // Enforce guest-only namespace to prevent collision with Clerk user IDs
    if (!args.guestUserId.startsWith('awadoc-guest-')) {
      throw new Error("Invalid guest user ID format: must start with 'awadoc-guest-'")
    }

    const apiKey = process.env.STREAM_API_KEY
    const apiSecret = process.env.STREAM_SECRET

    if (!apiKey || !apiSecret) {
      throw new Error("Stream credentials not configured")
    }

    try {
      const client = new StreamClient(apiKey, apiSecret)

      // Generate token for the guest user
      const token = client.generateUserToken({
        user_id: args.guestUserId,
        validity_in_seconds: 4 * 60 * 60, // 4 hours (shorter for guests)
      })

      // Create/update guest user in Stream (namespaced ID prevents collisions)
      await client.upsertUsers([{
        id: args.guestUserId,
        name: args.guestUserName,
        role: 'user',
      }])

      return {
        token,
        apiKey,
        userId: args.guestUserId,
      }
    } catch (error) {
      console.error("Failed to generate guest Stream token:", error)
      throw new Error("Failed to generate guest Stream token")
    }
  },
})
