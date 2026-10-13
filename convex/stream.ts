// @ts-nocheck
"use node"

import { v } from "convex/values"
import { action } from "./_generated/server"
import { StreamClient } from "@stream-io/node-sdk"
import { api, internal } from "./_generated/api"
import type { Doc, Id } from './_generated/dataModel'
import { assertServerCaller } from "./helpers/serverSecret"
import { StreamChat } from 'stream-chat'

// Stream token generation action - securely generates tokens server-side
export const getStreamToken = action({
  args: {
    userId: v.string(),
    userName: v.string(),
    userImage: v.optional(v.string()),
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

    // Get Stream credentials from environment
    const apiKey = process.env.STREAM_API_KEY
    const apiSecret = process.env.STREAM_SECRET
    
    if (!apiKey || !apiSecret) {
      throw new Error("Stream credentials not configured")
    }

    try {
      // Initialize Stream client (Video)
      const client = new StreamClient(apiKey, apiSecret)
      
      // Generate token for the user
      const token = client.generateUserToken({
        user_id: args.userId,
        validity_in_seconds: 24 * 60 * 60, // 24 hours
      })


      // Optionally update/create user in Stream (Video)
      await client.upsertUsers([{
        id: args.userId,
        name: args.userName,
        image: args.userImage,
        role: 'user',
      }])

      // Generate Chat token with the same credentials
      let chatToken: string | undefined
      try {
        const chatServer = StreamChat.getInstance(apiKey, apiSecret)
        chatToken = chatServer.createToken(args.userId)
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

// Create or get a Stream call
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
      
      // Helper to ensure video/chat user IDs are Clerk IDs (Stream expects those)
      const toStreamUserId = async (maybeId: string): Promise<string> => {
        // If it's already a Clerk user id, pass through
        if (typeof maybeId === 'string' && maybeId.startsWith('user_')) return maybeId
        // Otherwise treat it as Convex users._id and convert to clerkId via a query
        try {
          const asConvexId = maybeId as unknown as Id<"users">
          const userDoc = await ctx.runQuery(api.users.getUserById as any, { userId: asConvexId })
          if (userDoc?.clerkId) return userDoc.clerkId as string
        } catch {}
        // Fallback to original if lookup fails
        return maybeId
      }

      // Build Stream user id list (host + participants)
      const streamUserIdsSet = new Set<string>()
      streamUserIdsSet.add(identity.subject)
      for (const p of args.participants) {
        const sid = await toStreamUserId(p.userId)
        streamUserIdsSet.add(sid)
      }
      const streamUserIds = Array.from(streamUserIdsSet)

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
              mode: args.settings?.recordingEnabled ? 'available' : 'disabled',
              audio_only: false,
              quality: '720p',
            },
            transcription: {
              mode: args.settings?.transcriptionEnabled ? 'available' : 'disabled',
            },
            limits: {
              max_duration_seconds: args.settings?.maxDuration || 7200, // 2 hours default
              max_participants: 50,
            },
            geofencing: {
              names: args.settings?.geoFencing ? ['european_union', 'united_states'] : [],
            },
          },
        },
      })

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
        console.warn("Failed to upsert chat channel for call", args.callId, e)
      }

      // Store call metadata in Convex
      await ctx.runMutation(internal.stream_mutations.storeCallMetadata, {
        streamCallId: args.callId,
        callType,
        createdBy: identity.subject,
        participants: streamUserIds,
        settings: args.settings || {},
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



// Ensure the current authenticated user is a member of the chat channel for this call
export const ensureChatMembership = action({
  args: { callId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const apiKey = process.env.STREAM_API_KEY
    const apiSecret = process.env.STREAM_SECRET
    if (!apiKey || !apiSecret) throw new Error('Stream credentials not configured')

    try {
      const identity = await ctx.auth.getUserIdentity().catch(() => null)
      const memberId = identity?.subject || args.userId
      if (!memberId) throw new Error('Unauthorized')

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
