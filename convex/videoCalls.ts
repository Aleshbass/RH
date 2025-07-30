import { v } from "convex/values"
import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server"
import { internal } from "./_generated/api"
import { type ActionCtx, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';

// Action input type
export type CreateVideoCallInput = {
  roomId?: string;
  appointmentId?: Id<'appointments'>;
  participants: Id<'users'>[];
  callType: 'appointment' | 'consultation' | 'emergency';
  settings?: {
    recordingEnabled: boolean;
    chatEnabled: boolean;
    maxParticipants: number;
    waitingRoomEnabled: boolean;
    screenShareEnabled?: boolean;
    durationMinutes?: number;
  };
  title?: string;
};

// Action output type
export type CreateVideoCallOutput = {
  callId: Id<'videoCalls'>;
  roomId: string;
  dailyRoomName: string;
  dailyRoomUrl: string;
  dailyRoomId: string;
};

// Create a new video call with Daily.co integration
export const createVideoCall = action({
  args: {
    roomId: v.optional(v.string()), // Legacy room ID for backward compatibility
    appointmentId: v.optional(v.id("appointments")),
    participants: v.array(v.id("users")),
    callType: v.union(
      v.literal("appointment"),
      v.literal("consultation"), 
      v.literal("emergency")
    ),
    settings: v.optional(v.object({
      recordingEnabled: v.boolean(),
      chatEnabled: v.boolean(),
      maxParticipants: v.number(),
      waitingRoomEnabled: v.boolean(),
      screenShareEnabled: v.optional(v.boolean()),
      durationMinutes: v.optional(v.number()),
    })),
    title: v.optional(v.string()),
  },
  handler: async (ctx: ActionCtx, args: CreateVideoCallInput): Promise<CreateVideoCallOutput> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Unauthorized")
    }

    // Get user from database
    const user = await ctx.runQuery(internal.videoCalls.getUserByClerkId, {
      clerkId: identity.subject
    }) as any
    
    if (!user) {
      throw new Error("User not found")
    }

    // Verify user is authorized to create calls with these participants
    if (!args.participants.includes(user._id)) {
      args.participants.push(user._id) // Add creator to participants
    }

    // Create Daily.co room
    const dailyApiKey = process.env.DAILY_API_KEY
    if (!dailyApiKey) {
      throw new Error("Daily.co API key not configured")
    }

    const roomConfig = {
      privacy: "private" as const,
      properties: {
        max_participants: args.settings?.maxParticipants || 10,
        enable_chat: args.settings?.chatEnabled ?? true,
        enable_screenshare: args.settings?.screenShareEnabled ?? true,
        enable_recording: args.settings?.recordingEnabled ?? false,
        enable_knocking: args.settings?.waitingRoomEnabled ?? true,
        enable_prejoin_ui: true,
        exp: args.settings?.durationMinutes 
          ? Math.floor(Date.now() / 1000) + (args.settings.durationMinutes * 60)
          : Math.floor(Date.now() / 1000) + (2 * 60 * 60), // 2 hours default
        eject_at_room_exp: true,
        lang: "en",
        geo: "us-west",
      },
    }

    try {
      // Create Daily.co room with timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
      
      const dailyResponse = await fetch("https://api.daily.co/v1/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${dailyApiKey}`,
        },
        body: JSON.stringify(roomConfig),
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)

      if (!dailyResponse.ok) {
        const errorData = await dailyResponse.json()
        throw new Error(`Failed to create Daily.co room: ${errorData.error || dailyResponse.statusText}`)
      }

      const dailyRoom = await dailyResponse.json()

      // Create video call record in database
      const callId: Id<"videoCalls"> = await ctx.runMutation(internal.videoCalls.createVideoCallRecord, {
        roomId: args.roomId || dailyRoom.name, // Use Daily room name as fallback
        dailyRoomName: dailyRoom.name,
        dailyRoomUrl: dailyRoom.url,
        dailyRoomId: dailyRoom.id,
      appointmentId: args.appointmentId,
      initiatorId: user._id,
      participants: args.participants,
      callType: args.callType,
        title: args.title,
        settings: {
          recordingEnabled: args.settings?.recordingEnabled ?? false,
          chatEnabled: args.settings?.chatEnabled ?? true,
          maxParticipants: args.settings?.maxParticipants || 10,
          waitingRoomEnabled: args.settings?.waitingRoomEnabled ?? true,
          screenShareEnabled: args.settings?.screenShareEnabled ?? true,
          prejoinUiEnabled: true,
          ejectAtRoomExp: true,
          language: "en",
          geo: "us-west",
        },
        dailyConfig: {
          roomExp: roomConfig.properties.exp,
          roomProperties: dailyRoom.config,
      },
    })

      // Create participant records and meeting tokens
      const meetingTokens = []
    for (const participantId of args.participants) {
        const participantUser = await ctx.runQuery(internal.videoCalls.getUserById, {
          userId: participantId
        })

        if (participantUser) {
          // Create meeting token for participant
          const tokenPayload = {
            
            properties: {
              room_name: dailyRoom.name,
              user_name: `${participantUser.firstName || ''} ${participantUser.lastName || ''}`.trim() || participantUser.email || 'Anonymous',
              user_id: participantUser._id,
              is_owner: participantId === user._id,
              exp: roomConfig.properties.exp,
              enable_screenshare: args.settings?.screenShareEnabled ?? true,
              enable_recording: args.settings?.recordingEnabled ?? false,
              start_video_off: false,
              start_audio_off: false,
            },
          }

          console.log('📡 Requesting Daily.co meeting token:', tokenPayload)
          
          const tokenController = new AbortController()
          const tokenTimeoutId = setTimeout(() => tokenController.abort(), 8000) // 8 second timeout
          
          const tokenResponse = await fetch("https://api.daily.co/v1/meeting-tokens", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${dailyApiKey}`,
            },
            body: JSON.stringify(tokenPayload),
            signal: tokenController.signal,
          })
          
          clearTimeout(tokenTimeoutId)

          let meetingToken: string | undefined = undefined
          if (tokenResponse.ok) {
            const tokenData = await tokenResponse.json()
            meetingToken = tokenData.token
            console.log('✅ Successfully generated meeting token for participant:', participantId)
          } else {
            const errorText = await tokenResponse.text()
            console.error('❌ Failed to generate meeting token:', {
              status: tokenResponse.status,
              statusText: tokenResponse.statusText,
              error: errorText,
              participantId
            })
          }

          // Create participant record
          await ctx.runMutation(internal.videoCalls.createParticipantRecord, {
        callId,
        userId: participantId,
        role: participantId === user._id ? "host" : "participant",
            dailyMeetingToken: meetingToken,
            dailyTokenExpiration: roomConfig.properties.exp,
          })

          if (meetingToken) {
            meetingTokens.push({
              userId: participantId,
              token: meetingToken,
              expiresAt: roomConfig.properties.exp,
              isOwner: participantId === user._id,
            })
          }
        } else {
          console.error('❌ Participant not found in database:', participantId)
        }
      }
      
      console.log('📊 Meeting tokens summary:', {
        totalParticipants: args.participants.length,
        tokensGenerated: meetingTokens.length,
        tokens: meetingTokens.map(t => ({ userId: t.userId, isOwner: t.isOwner, hasToken: !!t.token }))
      })

      // Update call with meeting tokens
      await ctx.runMutation(internal.videoCalls.updateCallWithTokens, {
        callId,
        meetingTokens,
      })

      return { 
        callId, 
        roomId: args.roomId || dailyRoom.name,
        dailyRoomName: dailyRoom.name,
        dailyRoomUrl: dailyRoom.url,
        dailyRoomId: dailyRoom.id,
      }
    } catch (error) {
      console.error("Failed to create Daily.co room:", error)
      
      // Retry logic for network errors
      if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('fetch'))) {
        console.log('Retrying Daily.co room creation...')
        try {
          // Simple retry without timeout for fallback
          const retryResponse = await fetch("https://api.daily.co/v1/rooms", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${dailyApiKey}`,
            },
            body: JSON.stringify(roomConfig),
          })
          
          if (retryResponse.ok) {
            const dailyRoom = await retryResponse.json()
            // Continue with the rest of the room creation logic...
            const callId: Id<"videoCalls"> = await ctx.runMutation(internal.videoCalls.createVideoCallRecord, {
              roomId: args.roomId || dailyRoom.name,
              dailyRoomName: dailyRoom.name,
              dailyRoomUrl: dailyRoom.url,
              dailyRoomId: dailyRoom.id,
              appointmentId: args.appointmentId,
              initiatorId: user._id,
              participants: args.participants,
              callType: args.callType,
              title: args.title,
              settings: {
                recordingEnabled: args.settings?.recordingEnabled ?? false,
                chatEnabled: args.settings?.chatEnabled ?? true,
                maxParticipants: args.settings?.maxParticipants || 10,
                waitingRoomEnabled: args.settings?.waitingRoomEnabled ?? true,
                screenShareEnabled: args.settings?.screenShareEnabled ?? true,
                prejoinUiEnabled: true,
                ejectAtRoomExp: true,
                language: "en",
                geo: "us-west",
              },
              dailyConfig: {
                roomExp: roomConfig.properties.exp,
                roomProperties: dailyRoom.config,
              },
            })
            
            return { 
              callId, 
              roomId: args.roomId || dailyRoom.name,
              dailyRoomName: dailyRoom.name,
              dailyRoomUrl: dailyRoom.url,
              dailyRoomId: dailyRoom.id,
            }
          }
        } catch (retryError) {
          console.error('Retry also failed:', retryError)
        }
      }
      
      throw new Error(`Failed to create video call: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
})

// Start a video call (change status from scheduled to active)
export const startVideoCall = mutation({
  args: {
    callId: v.id("videoCalls"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Unauthorized")
    }

    const call = await ctx.db.get(args.callId)
    if (!call) {
      throw new Error("Call not found")
    }

    // Verify user is the initiator or a participant
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()
    
    if (!user || (!call.participants.includes(user._id) && call.initiatorId !== user._id)) {
      throw new Error("Unauthorized to start this call")
    }

    await ctx.db.patch(args.callId, {
      status: "active",
      startTime: Date.now(),
    })

    return { success: true }
  },
})

// End a video call
export const endVideoCall = mutation({
  args: {
    callId: v.id("videoCalls"),
    duration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Unauthorized")
    }

    const call = await ctx.db.get(args.callId)
    if (!call) {
      throw new Error("Call not found")
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()
    
    // Allow initiator to end the entire call, or participants to end their own participation
    if (!user) {
      throw new Error("Unauthorized")
    }

    // Check if user is a participant in the call
    if (!call.participants.includes(user._id) && call.initiatorId !== user._id) {
      throw new Error("You are not authorized to end this call")
    }

    const endTime = Date.now()
    const duration = args.duration || (endTime - call.startTime) / 1000 // Convert to seconds

    await ctx.db.patch(args.callId, {
      status: "ended",
      endTime,
      duration,
    })

    // Update all participant records to mark them as left
    const participants = await ctx.db
      .query("videoCallParticipants")
      .withIndex("by_call_id", (q) => q.eq("callId", args.callId))
      .collect()

    for (const participant of participants) {
      if (!participant.leftAt) {
        await ctx.db.patch(participant._id, {
          leftAt: endTime,
        })
      }
    }

    return { success: true }
  },
})

// Join a video call (for participants) - supports both legacy and Daily.co rooms
export const joinVideoCall = mutation({
  args: {
    roomId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Unauthorized")
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()
    
    if (!user) {
      throw new Error("User not found")
    }

    // Find the call by room ID or Daily room name
    let call = await ctx.db
      .query("videoCalls")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .unique()
    
    if (!call) {
      // Try to find by Daily room name
      call = await ctx.db
        .query("videoCalls")
        .withIndex("by_daily_room_name", (q) => q.eq("dailyRoomName", args.roomId))
        .unique()
    }

    // If no call exists, create one on-the-fly for ad-hoc meetings
    if (!call) {
      console.log(`Creating ad-hoc video call for room: ${args.roomId}`)
      
      const now = Date.now()
      const callId = await ctx.db.insert("videoCalls", {
        roomId: args.roomId,
        title: `Ad-hoc Meeting - ${args.roomId}`,
        initiatorId: user._id,
        participants: [user._id], // Start with just the joining user
        status: "active",
        startTime: now,
        scheduledAt: now, // Add scheduledAt to prevent date formatting errors
        callType: "consultation",
        platform: "internal",
        createdAt: now,
        settings: {
          recordingEnabled: false,
          chatEnabled: true,
          maxParticipants: 10,
          waitingRoomEnabled: false,
        },
      })

      // Get the newly created call
      call = await ctx.db.get(callId)
      if (!call) {
        throw new Error("Failed to create call")
      }
    } else {
      // For existing calls, add user to participants if not already included
      if (!call.participants.includes(user._id)) {
        await ctx.db.patch(call._id, {
          participants: [...call.participants, user._id]
        })
        // Update our local call object
        call = { ...call, participants: [...call.participants, user._id] }
      }

      // Check if call is joinable
      if (call.status === "ended" || call.status === "cancelled") {
        throw new Error("This call has ended or been cancelled")
      }

      // Activate scheduled calls when someone joins
      if (call.status === "scheduled") {
        await ctx.db.patch(call._id, {
          status: "active",
          startTime: Date.now(),
        })
      }
    }

    // Update or create participant record
    const existingParticipant = await ctx.db
      .query("videoCallParticipants")
      .withIndex("by_call_and_user", (q) => q.eq("callId", call._id).eq("userId", user._id))
      .unique()

    if (existingParticipant) {
      // Update join time if rejoining
      await ctx.db.patch(existingParticipant._id, {
        joinedAt: Date.now(),
        leftAt: undefined, // Clear left time if rejoining
      })
    } else {
      // Create new participant record
      await ctx.db.insert("videoCallParticipants", {
        callId: call._id,
        userId: user._id,
        joinedAt: Date.now(),
        role: call.initiatorId === user._id ? "host" : "participant",
        permissions: {
          canSpeak: true,
          canVideo: true,
          canScreenShare: call.initiatorId === user._id, // Only host can screen share by default
          canChat: true,
          canRecord: call.initiatorId === user._id,
        },
      })
    }

    return { 
      callId: call._id,
      roomId: call.roomId,
      participants: call.participants,
    }
  },
})

// Leave a video call
export const leaveVideoCall = mutation({
  args: {
    callId: v.id("videoCalls"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Unauthorized")
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()
    
    if (!user) {
      throw new Error("User not found")
    }

    // Find participant record
    const participant = await ctx.db
      .query("videoCallParticipants")
      .withIndex("by_call_and_user", (q) => q.eq("callId", args.callId).eq("userId", user._id))
      .unique()

    if (participant) {
      await ctx.db.patch(participant._id, {
        leftAt: Date.now(),
      })
    }

    return { success: true }
  },
})

// Save chat message
export const saveVideoCallMessage = mutation({
  args: {
    callId: v.id("videoCalls"),
    message: v.string(),
    messageType: v.union(
      v.literal("text"),
      v.literal("system"),
      v.literal("file"),
      v.literal("emoji")
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Unauthorized")
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()
    
    if (!user) {
      throw new Error("User not found")
    }

    // Verify user is in the call
    const call = await ctx.db.get(args.callId)
    if (!call || !call.participants.includes(user._id)) {
      throw new Error("You are not in this call")
    }

    const messageId = await ctx.db.insert("videoCallMessages", {
      callId: args.callId,
      senderId: user._id,
      message: args.message,
      timestamp: Date.now(),
      messageType: args.messageType,
    })

    return { messageId }
  },
})

// Get video call details
export const getVideoCall = query({
  args: {
    roomId: v.string(),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db
      .query("videoCalls")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .unique()

    if (!call) {
      return null
    }

    // Get participant details
    const participants = await ctx.db
      .query("videoCallParticipants")
      .withIndex("by_call_id", (q) => q.eq("callId", call._id))
      .collect()

    // Get user details for participants
    const participantDetails = await Promise.all(
      participants.map(async (participant) => {
        const user = await ctx.db.get(participant.userId)
        return {
          ...participant,
          user: user ? {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            imageUrl: user.imageUrl,
          } : null,
        }
      })
    )

    return {
      ...call,
      participants: participantDetails,
    }
  },
})

// Get chat messages for a call
export const getVideoCallMessages = query({
  args: {
    callId: v.id("videoCalls"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50

    const messages = await ctx.db
      .query("videoCallMessages")
      .withIndex("by_call_id_and_timestamp", (q) => q.eq("callId", args.callId))
      .order("desc")
      .take(limit)

    // Get sender details
    const messagesWithUsers = await Promise.all(
      messages.map(async (message) => {
        const sender = await ctx.db.get(message.senderId)
        return {
          ...message,
          sender: sender ? {
            id: sender._id,
            firstName: sender.firstName,
            lastName: sender.lastName,
            email: sender.email,
            imageUrl: sender.imageUrl,
          } : null,
        }
      })
    )

    return messagesWithUsers.reverse() // Return in chronological order
  },
})

// Get user's call history
export const getUserCallHistory = query({
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
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()
    
    if (!user) {
      throw new Error("User not found")
    }

    const limit = args.limit || 20

    // Get calls where user was a participant
    const allCalls = await ctx.db
      .query("videoCalls")
      .order("desc")
      .collect()
    
    // Filter calls where user is a participant
    const userCalls = allCalls.filter(call => 
      call.participants.includes(user._id) || call.initiatorId === user._id
    )
    
    const calls = userCalls.slice(0, limit)

    // Get participant details for each call
    const callsWithDetails = await Promise.all(
      calls.map(async (call) => {
        const participants = await ctx.db
          .query("videoCallParticipants")
          .withIndex("by_call_id", (q) => q.eq("callId", call._id))
          .collect()

        const participantDetails = await Promise.all(
          participants.map(async (participant) => {
            const participantUser = await ctx.db.get(participant.userId)
            return {
              ...participant,
              user: participantUser ? {
                id: participantUser._id,
                firstName: participantUser.firstName,
                lastName: participantUser.lastName,
                email: participantUser.email,
                imageUrl: participantUser.imageUrl,
              } : null,
            }
          })
        )

        return {
          ...call,
          participants: participantDetails,
        }
      })
    )

    return callsWithDetails
  },
}) 

// Get video calls for a specific clinic (for clinic owners)
export const getClinicVideoCalls = query({
  args: {
    clinicId: v.id("clinics"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Unauthorized")
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()
    
    if (!user) {
      throw new Error("User not found")
    }

    // Verify user is clinic owner or admin
    if (user.role !== "clinic_owner" && user.role !== "admin") {
      throw new Error("Only clinic owners and admins can view clinic video calls")
    }

    // For clinic owners, verify they own this clinic
    if (user.role === "clinic_owner") {
      const clinic = await ctx.db.get(args.clinicId)
      if (!clinic || clinic.ownerId !== user._id) {
        throw new Error("You can only view video calls for your own clinic")
      }
    }

    const limit = args.limit || 50

    // Get calls for this clinic
    const calls = await ctx.db
      .query("videoCalls")
      .withIndex("by_clinic_id_and_scheduled", (q) => q.eq("clinicId", args.clinicId))
      .order("desc")
      .take(limit)

    // Get participant, patient, and physiotherapist details for each call
    const callsWithDetails = await Promise.all(
      calls.map(async (call) => {
        let patient = null
        let physiotherapist = null

        if (call.patientId) {
          patient = await ctx.db.get(call.patientId)
        }

        if (call.physiotherapistId) {
          physiotherapist = await ctx.db.get(call.physiotherapistId)
        }

        return {
          ...call,
          patient: patient ? {
            _id: patient._id,
            firstName: patient.firstName,
            lastName: patient.lastName,
            email: patient.email,
          } : null,
          physiotherapist: physiotherapist ? {
            _id: physiotherapist._id,
            firstName: physiotherapist.firstName,
            lastName: physiotherapist.lastName,
            email: physiotherapist.email,
          } : null,
        }
      })
    )

    return callsWithDetails
  },
})

// Cancel a video call (with proper authorization)
export const cancelVideoCall = mutation({
  args: {
    callId: v.id("videoCalls"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Unauthorized")
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()
    
    if (!user) {
      throw new Error("User not found")
    }

    const call = await ctx.db.get(args.callId)
    if (!call) {
      throw new Error("Call not found")
    }

    // Check authorization - user must be initiator, participant, clinic owner, or admin
    const isAuthorized = 
      call.initiatorId === user._id || 
      call.participants.includes(user._id) ||
      user.role === "admin" ||
      (user.role === "clinic_owner" && call.clinicId && await ctx.db.get(call.clinicId).then(clinic => clinic?.ownerId === user._id))

    if (!isAuthorized) {
      throw new Error("You are not authorized to cancel this call")
    }

    // Only allow cancellation of scheduled calls
    if (call.status !== "scheduled") {
      throw new Error("Only scheduled calls can be cancelled")
    }

    await ctx.db.patch(args.callId, {
      status: "cancelled",
      cancellationReason: args.reason,
      cancelledBy: user._id,
      cancelledAt: Date.now(),
    })

    return { success: true }
  },
}) 

// Alias for getUserCallHistory - for compatibility with frontend
export const getMyVideoCalls = query({
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
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()
    
    if (!user) {
      throw new Error("User not found")
    }

    const limit = args.limit || 20

    // Get calls where user was a participant
    const allCalls = await ctx.db
      .query("videoCalls")
      .order("desc")
      .collect()
    
    // Filter calls where user is a participant
    const userCalls = allCalls.filter(call => 
      call.participants.includes(user._id) || call.initiatorId === user._id
    )
    
    const calls = userCalls.slice(0, limit)

    // Get patient details for physiotherapist dashboard
    const callsWithDetails = await Promise.all(
      calls.map(async (call) => {
        let patient = null
        let physiotherapist = null

        if (call.patientId) {
          patient = await ctx.db.get(call.patientId)
        }

        if (call.physiotherapistId) {
          physiotherapist = await ctx.db.get(call.physiotherapistId)
        }

        return {
          ...call,
          patient: patient ? {
            _id: patient._id,
            firstName: patient.firstName,
            lastName: patient.lastName,
            email: patient.email,
          } : null,
          physiotherapist: physiotherapist ? {
            _id: physiotherapist._id,
            firstName: physiotherapist.firstName,
            lastName: physiotherapist.lastName,
            email: physiotherapist.email,
          } : null,
        }
      })
    )

    return callsWithDetails
  },
})

// Schedule a video call - alias for createVideoCall with specific formatting
export const scheduleVideoCall = mutation({
  args: {
    patientId: v.id("users"),
    scheduledAt: v.number(),
    title: v.string(),
    notes: v.optional(v.string()),
    platform: v.string(),
    duration: v.optional(v.number()),
    meetingLink: v.optional(v.string()),
    clinicId: v.optional(v.id("clinics")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Unauthorized")
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()
    
    if (!user) {
      throw new Error("User not found")
    }

    // Extract roomId from meetingLink if provided, otherwise generate one
    let roomId: string
    if (args.meetingLink) {
      // Extract roomId from URL like "https://domain.com/video/room_123_abc"
      const urlParts = args.meetingLink.split('/')
      const extractedRoomId = urlParts[urlParts.length - 1]
      roomId = extractedRoomId || `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    } else {
      // Generate a unique room ID
      roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }

    // Set up participants - user (physiotherapist) and patient
    const participants = [user._id, args.patientId]

    const callId = await ctx.db.insert("videoCalls", {
      roomId,
      title: args.title,
      initiatorId: user._id,
      participants,
      patientId: args.patientId,
      physiotherapistId: user._id,
      clinicId: args.clinicId,
      scheduledAt: args.scheduledAt,
      startTime: args.scheduledAt, // Will be updated when call actually starts
      platform: args.platform as "internal" | "google_meet" | "zoom",
      meetingLink: args.meetingLink,
      status: "scheduled",
      callType: "appointment",
      plannedDuration: args.duration || 30,
      notes: args.notes,
      createdAt: Date.now(),
      settings: {
        recordingEnabled: false,
        chatEnabled: true,
        maxParticipants: 2,
        waitingRoomEnabled: false,
      },
    })

    // Create participant records
    for (const participantId of participants) {
      await ctx.db.insert("videoCallParticipants", {
        callId,
        userId: participantId,
        joinedAt: args.scheduledAt,
        role: participantId === user._id ? "host" : "participant",
        permissions: {
          canSpeak: true,
          canVideo: true,
          canScreenShare: participantId === user._id, // Only host can screen share by default
          canChat: true,
          canRecord: participantId === user._id,
        },
      })
    }

    return { callId, roomId }
  },
}) 

// Internal mutations for Daily.co integration
export const createVideoCallRecord = internalMutation({
  args: {
    roomId: v.string(),
    dailyRoomName: v.string(),
    dailyRoomUrl: v.string(),
    dailyRoomId: v.string(),
    appointmentId: v.optional(v.id("appointments")),
    initiatorId: v.id("users"),
    participants: v.array(v.id("users")),
    callType: v.union(
      v.literal("appointment"),
      v.literal("consultation"), 
      v.literal("emergency")
    ),
    title: v.optional(v.string()),
    settings: v.object({
      recordingEnabled: v.boolean(),
      chatEnabled: v.boolean(),
      maxParticipants: v.number(),
      waitingRoomEnabled: v.boolean(),
      screenShareEnabled: v.boolean(),
      prejoinUiEnabled: v.boolean(),
      ejectAtRoomExp: v.boolean(),
      language: v.string(),
      geo: v.string(),
    }),
    dailyConfig: v.object({
      roomExp: v.number(),
      roomProperties: v.any(),
    }),
  },
  handler: async (ctx, args): Promise<Id<"videoCalls">> => {
    const callId = await ctx.db.insert("videoCalls", {
      roomId: args.roomId,
      dailyRoomName: args.dailyRoomName,
      dailyRoomUrl: args.dailyRoomUrl,
      dailyRoomId: args.dailyRoomId,
      title: args.title,
      appointmentId: args.appointmentId,
      initiatorId: args.initiatorId,
      participants: args.participants,
      status: "scheduled",
      scheduledAt: Date.now(), // Add missing scheduledAt field
      startTime: Date.now(),
      callType: args.callType,
      meetingLink: args.dailyRoomUrl,
      platform: "daily",
      createdAt: Date.now(),
      settings: {
        recordingEnabled: args.settings.recordingEnabled,
        chatEnabled: args.settings.chatEnabled,
        maxParticipants: args.settings.maxParticipants,
        waitingRoomEnabled: args.settings.waitingRoomEnabled,
        screenShareEnabled: args.settings.screenShareEnabled,
        prejoinUiEnabled: args.settings.prejoinUiEnabled,
        ejectAtRoomExp: args.settings.ejectAtRoomExp,
        ejectAfterElapsed: undefined,
        language: args.settings.language,
        geo: args.settings.geo,
      },
      dailyConfig: {
        roomExp: args.dailyConfig.roomExp,
        meetingTokens: [],
        roomProperties: args.dailyConfig.roomProperties,
      },
    })

    return callId
  },
})

export const createParticipantRecord = internalMutation({
  args: {
    callId: v.id("videoCalls"),
    userId: v.id("users"),
    role: v.union(
      v.literal("host"),
      v.literal("participant"),
      v.literal("observer")
    ),
    dailyMeetingToken: v.optional(v.string()),
    dailyTokenExpiration: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.insert("videoCallParticipants", {
      callId: args.callId,
      userId: args.userId,
      joinedAt: Date.now(),
      role: args.role,
      permissions: {
        canSpeak: true,
        canVideo: true,
        canScreenShare: args.role === "host",
        canChat: true,
        canRecord: args.role === "host",
      },
      dailyMeetingToken: args.dailyMeetingToken,
      dailyTokenExpiration: args.dailyTokenExpiration,
    })
  },
})

export const updateCallWithTokens = internalMutation({
  args: {
    callId: v.id("videoCalls"),
    meetingTokens: v.array(v.object({
      userId: v.id("users"),
      token: v.string(),
      expiresAt: v.number(),
      isOwner: v.boolean(),
    })),
  },
  handler: async (ctx, args): Promise<void> => {
    const call = await ctx.db.get(args.callId)
    if (!call) {
      throw new Error("Call not found")
    }

    await ctx.db.patch(args.callId, {
      dailyConfig: {
        ...call.dailyConfig,
        meetingTokens: args.meetingTokens,
      },
    })
  },
})

// Internal queries for Daily.co integration
export const getUserByClerkId = internalQuery({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique()
  },
})

export const getUserById = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<any> => {
    return await ctx.db.get(args.userId)
  },
})

// Get Daily.co room information and meeting token for current user
export const getDailyRoomInfo = query({
  args: {
    callId: v.id("videoCalls"),
  },
  handler: async (ctx, args) => {
    console.log('🔍 getDailyRoomInfo called with:', args)
    
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      console.error('❌ No user identity found')
      throw new Error("Unauthorized")
    }

    console.log('👤 User identity:', { subject: identity.subject })

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()
    
    if (!user) {
      console.error('❌ User not found in database for clerkId:', identity.subject)
      throw new Error("User not found")
    }

    console.log('✅ User found:', { userId: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email })

    // Get the video call
    const call = await ctx.db.get(args.callId)
    if (!call) {
      console.error('❌ Call not found:', args.callId)
      throw new Error("Call not found")
    }

    console.log('📞 Call found:', {
      callId: call._id,
      roomName: call.dailyRoomName,
      roomUrl: call.dailyRoomUrl,
      initiatorId: call.initiatorId,
      participants: call.participants,
      status: call.status
    })

    // Check if user is authorized to access this call
    const isParticipant = call.participants.includes(user._id)
    const isInitiator = call.initiatorId === user._id
    
    console.log('🔐 Authorization check:', {
      userId: user._id,
      isParticipant,
      isInitiator,
      authorized: isParticipant || isInitiator
    })
    
    if (!isParticipant && !isInitiator) {
      console.error('❌ User not authorized to access call')
      throw new Error("You are not authorized to access this call")
    }

    // Get participant record with meeting token
    const participant = await ctx.db
      .query("videoCallParticipants")
      .withIndex("by_call_and_user", (q) => q.eq("callId", args.callId).eq("userId", user._id))
      .unique()

    console.log('👥 Participant record:', {
      found: !!participant,
      hasToken: !!participant?.dailyMeetingToken,
      role: participant?.role
    })

    const result = {
      dailyRoomName: call.dailyRoomName,
      dailyRoomUrl: call.dailyRoomUrl,
      dailyRoomId: call.dailyRoomId,
      meetingToken: participant?.dailyMeetingToken,
      tokenExpiration: call.dailyConfig?.roomExp,
      isHost: call.initiatorId === user._id,
      callStatus: call.status,
      participants: call.participants,
    }
    
    console.log('📊 Returning room info:', result)
    return result
  },
})

// Get call details by room ID (for both legacy and Daily.co)
export const getCallByRoomId = query({
  args: {
    roomId: v.string(),
  },
  handler: async (ctx, args) => {
    console.log('🔍 getCallByRoomId called with roomId:', args.roomId)
    
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      console.log('❌ No user identity, returning null')
      return null // Return null instead of throwing error for unauthorized access
    }

    console.log('👤 User identity:', { subject: identity.subject })

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()
    
    if (!user) {
      console.log('❌ User not found, returning null')
      return null
    }

    console.log('✅ User found:', { userId: user._id, firstName: user.firstName, lastName: user.lastName })

    // Find the call by room ID or Daily room name
    let call = await ctx.db
      .query("videoCalls")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .unique()
    
    console.log('🔍 Search by roomId result:', !!call)
    
    if (!call) {
      // Try to find by Daily room name
      call = await ctx.db
        .query("videoCalls")
        .withIndex("by_daily_room_name", (q) => q.eq("dailyRoomName", args.roomId))
        .unique()
      
      console.log('🔍 Search by dailyRoomName result:', !!call)
    }

    if (!call) {
      console.log('❌ No call found for roomId:', args.roomId)
      return null
    }

    console.log('📞 Call found:', {
      callId: call._id,
      roomName: call.dailyRoomName,
      roomUrl: call.dailyRoomUrl,
      initiatorId: call.initiatorId,
      participants: call.participants,
      status: call.status
    })

    // Check if user is authorized to access this call
    const isParticipant = call.participants.includes(user._id)
    const isInitiator = call.initiatorId === user._id
    
    console.log('🔐 Authorization check:', {
      userId: user._id,
      isParticipant,
      isInitiator,
      authorized: isParticipant || isInitiator
    })
    
    if (!isParticipant && !isInitiator) {
      console.log('❌ User not authorized, returning null')
      return null
    }

    // Get participant record with meeting token
    const participant = await ctx.db
      .query("videoCallParticipants")
      .withIndex("by_call_and_user", (q) => q.eq("callId", call._id).eq("userId", user._id))
      .unique()

    console.log('👥 Participant record:', {
      found: !!participant,
      hasToken: !!participant?.dailyMeetingToken,
      role: participant?.role
    })

    const result = {
      _id: call._id,
      dailyRoomName: call.dailyRoomName,
      dailyRoomUrl: call.dailyRoomUrl,
      dailyRoomId: call.dailyRoomId,
      meetingToken: participant?.dailyMeetingToken,
      tokenExpiration: call.dailyConfig?.roomExp,
      isHost: call.initiatorId === user._id,
      callStatus: call.status,
      participants: call.participants,
    }
    
    console.log('📊 Returning call info:', result)
    return result
  },
}) 