// @ts-nocheck
import { ConvexError, v } from "convex/values"
import { mutation, query, action, internalAction, internalMutation, internalQuery } from "./_generated/server"
import { api, internal } from "./_generated/api"
import { type ActionCtx, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { publicAppUrl } from './helpers/appUrl';
import { canJoinVideoCall, mayInviteToCall, staffClinicId } from './helpers/callAccess';
import { isOpenAppointment } from './helpers/appointmentStatus';
// Stream video imports will be handled in the action

// Hosts a physiotherapist may use as an external meeting link (Google Meet / Zoom).
const EXTERNAL_MEETING_HOSTS = [/^meet\.google\.com$/i, /^([a-z0-9-]+\.)*zoom\.us$/i];

/** True for our own /video-call/<roomId> link or an https Google Meet / Zoom link. */
function isInvitableCallLink(link: string): boolean {
  try {
    const url = new URL(link);
    if (/^\/video-call\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) && url.origin === new URL(publicAppUrl()).origin) return true;
    return url.protocol === "https:" && EXTERNAL_MEETING_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

async function isActivePhysiotherapistOf(ctx: QueryCtx | MutationCtx, physiotherapistId: Id<'users'>, patientId: Id<'users'>): Promise<boolean> {
  const relationships = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_patient_and_physiotherapist", (q) => q.eq("patientId", patientId).eq("physiotherapistId", physiotherapistId))
    .collect();
  return relationships.some((r) => r.status === "active");
}

const displayName = (u: { firstName?: string; lastName?: string } | null | undefined) =>
  `${u?.firstName ?? ""} ${u?.lastName ?? ""}`.trim();

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
  streamCallId: string;
  meetingLink: string;
  platform: string;
};

// Create a new video call with Stream integration
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
    }) as any // Avoid deep type instantiation

    if (!user) {
      throw new Error("User not found")
    }

    // The caller must be on the appointment, and may only bring in people they can reach
    const check = await ctx.runQuery(internal.videoCalls.authorizeCreateVideoCall, {
      callerId: user._id,
      participants: args.participants,
      appointmentId: args.appointmentId,
    })
    if (!check.allowed) throw new ConvexError(check.reason)

    return await createStreamCallFor(ctx, user, args)
  },
})

/**
 * Creates a Stream room hosted by `user`: the call record, participant rows and email
 * invitations. Shared by the signed-in action above and appointment booking (no signed-in user).
 */
async function createStreamCallFor(ctx: ActionCtx, user: any, args: CreateVideoCallInput): Promise<CreateVideoCallOutput> {
    // Verify user is authorized to create calls with these participants
    if (!args.participants.includes(user._id)) {
      args.participants.push(user._id) // Add creator to participants
    }

    // Generate Stream call ID
    const streamCallId = args.roomId || `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const appBase = publicAppUrl();
    const meetingLink = `${appBase}/video-call/${streamCallId}`;

    try {

      // Create video call record in database
      const callId: Id<"videoCalls"> = await ctx.runMutation(internal.videoCalls.createVideoCallRecord, {
        roomId: streamCallId,
        streamCallId: streamCallId,
        meetingLink: meetingLink,
        platform: 'stream',
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
        streamConfig: {
          callId: streamCallId,
          createdAt: new Date().toISOString(),
        },
      })

      // Create participant records and send email invitations
      for (const participantId of args.participants) {
        const participantUser = await ctx.runQuery(internal.videoCalls.getUserById, {
          userId: participantId
        })

        if (participantUser) {
          try {
            await ctx.runMutation(internal.videoCalls.createParticipantRecord, {
              callId,
              userId: participantId,
              role: participantId === user._id ? "host" : "participant",
            })

            // Send email invitation to participants (except the creator)
            if (participantId !== user._id && participantUser.email) {
              try {
                // The creator hosts this call and the link is our own room link.
                await ctx.runAction(internal.actions.emails.sendVideoCallInvitation.deliverVideoCallInvitation, {
                  recipientUserId: participantId,
                  patientEmail: participantUser.email,
                  patientName: `${participantUser.firstName || ''} ${participantUser.lastName || ''}`.trim() || undefined,
                  physiotherapistName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Your healthcare provider',
                  callLink: meetingLink,
                  callTitle: args.title,
                  message: `You have been invited to join a video call${args.title ? `: ${args.title}` : ''}.`,
                })
              } catch (emailErr) {
                console.error('❌ Failed to send email invitation:', {
                  error: emailErr instanceof Error ? emailErr.message : String(emailErr),
                  participantEmail: participantUser.email,
                })
              }
            }
          } catch (err) {
            console.error('❌ Failed to create participant record:', {
              error: err instanceof Error ? err.message : String(err),
              participantId,
            })
          }
        } else {
          console.error('❌ Participant not found in database:', participantId)
        }
      }

      return {
        callId,
        roomId: streamCallId,
        streamCallId: streamCallId,
        meetingLink: meetingLink,
        platform: 'stream',
      }
    } catch (error) {
      console.error("Failed to create video call:", error)
      throw new Error(`Failed to create video call: ${error instanceof Error ? error.message : String(error)}`)
    }
}

/**
 * Video room for a booked telehealth appointment. Runs from the scheduler, where there is no
 * signed-in user, so the host (the visit's physio) is passed in. The link is saved on the
 * appointment so the patient and physio both see it.
 */
export const createAppointmentVideoCall = internalAction({
  args: {
    appointmentId: v.id("appointments"),
    hostId: v.id("users"),
    participants: v.array(v.id("users")),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ meetingLink: string } | null> => {
    const host = await ctx.runQuery(internal.videoCalls.getUserById, { userId: args.hostId })
    const appointment = await ctx.runQuery(internal.videoCalls.getAppointmentForCall, { appointmentId: args.appointmentId })
    if (!host || !appointment) return null
    // Already has a room (or a link the physio added): keep it
    if (appointment.videoCallId || appointment.meetingLink) return { meetingLink: appointment.meetingLink ?? '' }

    const call = await createStreamCallFor(ctx, host, {
      appointmentId: args.appointmentId,
      participants: [...args.participants],
      callType: "appointment",
      title: args.title,
      settings: {
        recordingEnabled: false,
        chatEnabled: true,
        maxParticipants: 2,
        waitingRoomEnabled: false,
      },
    })
    await ctx.runMutation(internal.videoCalls.attachCallToAppointment, {
      appointmentId: args.appointmentId,
      callId: call.callId,
      meetingLink: call.meetingLink,
    })
    return { meetingLink: call.meetingLink }
  },
})

export const getAppointmentForCall = internalQuery({
  args: { appointmentId: v.id("appointments") },
  handler: async (ctx, args) => await ctx.db.get(args.appointmentId),
})

export const attachCallToAppointment = internalMutation({
  args: {
    appointmentId: v.id("appointments"),
    callId: v.id("videoCalls"),
    meetingLink: v.string(),
  },
  handler: async (ctx, args) => {
    const appointment = await ctx.db.get(args.appointmentId)
    if (!appointment || appointment.meetingLink) return
    await ctx.db.patch(args.appointmentId, {
      meetingLink: args.meetingLink,
      videoCallId: args.callId,
      isOnline: true,
    })
  },
})

// Set RSVP status for a specific participant (internal)
export const setParticipantRsvp = internalMutation({
  args: {
    callId: v.id("videoCalls"),
    userId: v.id("users"),
    status: v.union(
      v.literal("invited"),
      v.literal("accepted"),
      v.literal("declined"),
      v.literal("tentative")
    ),
  },
  handler: async (ctx, args) => {
    const participant = await ctx.db
      .query("videoCallParticipants")
      .withIndex("by_call_and_user", (q) => q.eq("callId", args.callId).eq("userId", args.userId))
      .unique()

    if (!participant) {
      // Create minimal participant record if missing
      await ctx.db.insert("videoCallParticipants", {
        callId: args.callId,
        userId: args.userId,
        joinedAt: Date.now(),
        role: "participant",
        permissions: {
          canSpeak: true,
          canVideo: true,
          canScreenShare: false,
          canChat: true,
          canRecord: false,
        },
        rsvpStatus: args.status,
        rsvpUpdatedAt: Date.now(),
      })
      return
    }

    await ctx.db.patch(participant._id, {
      rsvpStatus: args.status,
      rsvpUpdatedAt: Date.now(),
    })
  },
})

// Set my RSVP status for a call given its roomId (public)
export const setMyRsvpStatus = mutation({
  args: {
    roomId: v.string(),
    status: v.union(
      v.literal("invited"),
      v.literal("accepted"),
      v.literal("declined"),
      v.literal("tentative")
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
    if (!user) throw new Error("User not found")

    // Find call by roomId (Stream call id)
    let call = await ctx.db
      .query("videoCalls")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .unique()

    if (!call) {
      // Attempt legacy daily room name
      call = await ctx.db
        .query("videoCalls")
        .withIndex("by_daily_room_name", (q) => q.eq("dailyRoomName", args.roomId))
        .unique()
    }

    if (!call) throw new Error("Call not found")
    if (!(await canJoinVideoCall(ctx, call, user))) throw new Error("You're not on this call")

    const participant = await ctx.db
      .query("videoCallParticipants")
      .withIndex("by_call_and_user", (q) => q.eq("callId", call!._id).eq("userId", user._id))
      .unique()

    if (!participant) {
      await ctx.db.insert("videoCallParticipants", {
        callId: call!._id,
        userId: user._id,
        joinedAt: Date.now(),
        role: call!.initiatorId === user._id ? "host" : "participant",
        permissions: {
          canSpeak: true,
          canVideo: true,
          canScreenShare: call!.initiatorId === user._id,
          canChat: true,
          canRecord: call!.initiatorId === user._id,
        },
        rsvpStatus: args.status,
        rsvpUpdatedAt: Date.now(),
      })
      return { success: true }
    }

    await ctx.db.patch(participant._id, {
      rsvpStatus: args.status,
      rsvpUpdatedAt: Date.now(),
    })
    return { success: true }
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
      startTime: call.startTime || Date.now(),
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

    // Allow initiator to end the entire call; participants should only end their own participation
    if (!user) {
      throw new Error("Unauthorized")
    }

    // Check if user is a participant in the call
    if (!call.participants.includes(user._id) && call.initiatorId !== user._id) {
      throw new Error("You are not authorized to end this call")
    }

    // If the user is not the initiator, mark only their participation as ended
    if (call.initiatorId !== user._id) {
      const participant = await ctx.db
        .query("videoCallParticipants")
        .withIndex("by_call_and_user", (q) => q.eq("callId", args.callId).eq("userId", user._id))
        .unique()

      if (participant && !participant.leftAt) {
        await ctx.db.patch(participant._id, {
          leftAt: Date.now(),
        })
      }

      return { success: true, status: "left" as const }
    }

    // Initiator ends the entire call
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

    // Also update the associated appointment status to 'completed'
    if (call.appointmentId) {
      try {
        const appointment = await ctx.db.get(call.appointmentId)
        // Only a visit that is still going ahead and has started becomes completed
        if (appointment && isOpenAppointment(appointment.status) && appointment.startTime <= Date.now()) {
          await ctx.db.patch(call.appointmentId, {
            status: 'completed',
          })
        }
      } catch (error) {
        console.error('Failed to update appointment status after call end:', error)
      }
    }

    return { success: true, status: "ended" as const }
  },
})

// Cancel a video call
export const cancelVideoCall = mutation({
  args: {
    callId: v.id("videoCalls"),
    reason: v.optional(v.string()),
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

    if (!user) throw new Error("User not found")

    const call = await ctx.db.get(args.callId)
    if (!call) throw new Error("Call not found")

    // Allow initiator or any participant to cancel
    const isParticipant = (call.participants || []).includes(user._id) || call.initiatorId === user._id
    if (!isParticipant) throw new Error("Unauthorized to cancel this call")

    await ctx.db.patch(args.callId, {
      status: "cancelled",
      cancellationReason: args.reason,
      cancelledBy: user._id,
      cancelledAt: Date.now(),
    })

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

    // If no call exists, reject invalid join to meet frontend expectations
    if (!call) {
      throw new Error("Call not found for the provided roomId")
    } else {
      if (!(await canJoinVideoCall(ctx, call, user))) {
        throw new Error("You're not on this call")
      }
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

      // Do not immediately mark as active here; we'll set 'active' only after
      // we confirm at least two participants are in the room below.
    }

    // Daily.co integration removed; Stream handles room creation client-side

    // Ensure call is not null before proceeding
    if (!call) {
      throw new Error("Video call not found or could not be created")
    }

    // Update or create participant record and ensure a meeting token
    const existingParticipant = await ctx.db
      .query("videoCallParticipants")
      .withIndex("by_call_and_user", (q) => q.eq("callId", call._id).eq("userId", user._id))
      .unique()

    const tokenExp = call.dailyConfig?.roomExp || Math.floor(Date.now() / 1000) + (4 * 60 * 60)
    let meetingToken: string | undefined

    if (existingParticipant) {
      // Update join time and ensure token if missing
      let updates: any = {
        joinedAt: Date.now(),
        leftAt: undefined,
      }

      // No per-participant meeting token required for Stream SDK; keep previous token if present
      meetingToken = existingParticipant.dailyMeetingToken

      await ctx.db.patch(existingParticipant._id, updates)
    } else {
      // Create new participant record (no Daily token for Stream)
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
        dailyMeetingToken: meetingToken,
        dailyTokenExpiration: meetingToken ? tokenExp : undefined,
      })
    }

    // After ensuring a participant record, update call status if both parties are present
    try {
      const participantsNow = await ctx.db
        .query("videoCallParticipants")
        .withIndex("by_call_id", (q) => q.eq("callId", call._id))
        .collect()
      const activeCount = participantsNow.filter(p => !p.leftAt).length
      if (call.status === "scheduled" && activeCount >= 2) {
        await ctx.db.patch(call._id, {
          status: "active",
          startTime: call.startTime || Date.now(),
        })
      }
    } catch (e) {
      console.warn('[joinVideoCall] Failed to evaluate active participants:', e)
    }

    return {
      callId: call._id,
      roomId: call.roomId,
      participants: call.participants,
      dailyMeetingToken: meetingToken,
    }
  },
})

// ... (rest of the code remains the same)

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
    force: v.optional(v.boolean()),
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

    // Only for someone the caller looks after (their patient, or a patient of their clinic)
    const invitee = await ctx.db.get(args.patientId)
    if (!invitee || !(await mayInviteToCall(ctx, user, invitee))) {
      throw new ConvexError("You can only schedule calls with your own patients.")
    }
    if (args.clinicId && user.role !== "admin" && (await staffClinicId(ctx, user)) !== args.clinicId) {
      throw new ConvexError("You can only schedule calls for your own clinic.")
    }

    // Extract roomId from meetingLink if provided, otherwise generate one
    let roomId: string
    if (args.meetingLink) {
      // Extract roomId from URL like "https://domain.com/video-call/room_123_abc"
      const urlParts = args.meetingLink.split('/')
      const extractedRoomId = urlParts[urlParts.length - 1]
      roomId = extractedRoomId || `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    } else {
      // Generate a unique call ID compatible with Stream route
      roomId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }

    // Duplicate-check: look for other scheduled calls around this time with same patient or initiator
    try {
      const windowMinutes = args.duration || 30
      const halfWindowMs = Math.max(5, Math.min(180, windowMinutes)) * 60 * 1000 // clamp 5-180 minutes
      const windowStart = args.scheduledAt - halfWindowMs
      const windowEnd = args.scheduledAt + halfWindowMs

      const nearby = await ctx.db
        .query("videoCalls")
        .withIndex("by_patient_id_and_scheduled", (q) => q.eq("patientId", args.patientId))
        .collect()
      const conflicts = nearby.filter(c => c.status === 'scheduled' && typeof c.scheduledAt === 'number' && c.scheduledAt >= windowStart && c.scheduledAt <= windowEnd)
      if (conflicts.length > 0 && !args.force) {
        const err = new Error(`A scheduled call already exists close to this time (${new Date(conflicts[0].scheduledAt!).toISOString()}).`)
        // @ts-ignore add code for client handling
        err.code = 'DUPLICATE_SCHEDULED_CALL'
        // @ts-ignore include conflict id
        err.conflictCallId = conflicts[0]._id
        throw err
      }
    } catch (dupCheckErr) {
      if ((dupCheckErr as any)?.code === 'DUPLICATE_SCHEDULED_CALL') throw dupCheckErr
      console.warn('[scheduleVideoCall] Duplicate check failed, proceeding:', dupCheckErr)
    }

    // Set up participants - user (physiotherapist) and patient
    const participants = [user._id, args.patientId]

    const appBase = publicAppUrl()
    const computedMeetingLink = args.meetingLink || `${appBase}/video-call/${roomId}`

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
      meetingLink: computedMeetingLink,
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

    // Auto-send the invitation email to the patient (and create the in-app notification).
    // Only for the patient's own physiotherapist or an admin, and only with our own
    // /video-call/ link or a Google Meet / Zoom link, so this cannot be used to email
    // arbitrary users or arbitrary URLs from our domain. (Mutations cannot run actions,
    // so the email is scheduled.)
    try {
      const patientUser = await ctx.db.get(args.patientId)
      const mayInvite =
        Boolean(patientUser?.email) &&
        (user.role === "admin" || (await isActivePhysiotherapistOf(ctx, user._id, args.patientId)))
      if (mayInvite && isInvitableCallLink(computedMeetingLink)) {
        await ctx.scheduler.runAfter(0, internal.actions.emails.sendVideoCallInvitation.deliverVideoCallInvitation, {
          recipientUserId: args.patientId,
          patientEmail: patientUser.email,
          patientName: `${patientUser.firstName || ''} ${patientUser.lastName || ''}`.trim() || undefined,
          physiotherapistName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Your healthcare provider',
          callLink: computedMeetingLink,
          callTitle: args.title,
          scheduledAt: args.scheduledAt,
          message: args.notes || undefined,
        } as any)
      }
    } catch (inviteErr) {
      console.warn('Failed to auto-send scheduled call invitation:', inviteErr)
    }

    return { callId, roomId }
  },
})

// Internal mutations for Stream integration
export const createVideoCallRecord = internalMutation({
  args: {
    roomId: v.string(),
    streamCallId: v.optional(v.string()),
    meetingLink: v.optional(v.string()),
    platform: v.optional(v.union(
      v.literal("stream"),
      v.literal("daily"),
      v.literal("zoom"),
      v.literal("teams"),
      v.literal("internal"),
      v.literal("google_meet")
    )),
    dailyRoomName: v.optional(v.string()),
    dailyRoomUrl: v.optional(v.string()),
    dailyRoomId: v.optional(v.string()),
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
    dailyConfig: v.optional(v.object({
      roomExp: v.number(),
      roomProperties: v.any(),
    })),
    streamConfig: v.optional(v.object({
      callId: v.string(),
      createdAt: v.string(),
    })),
  },
  handler: async (ctx, args): Promise<Id<"videoCalls">> => {
    const callId = await ctx.db.insert("videoCalls", {
      roomId: args.roomId,
      dailyRoomName: args.dailyRoomName || args.streamCallId || args.roomId,
      dailyRoomUrl: args.dailyRoomUrl || args.meetingLink || '',
      dailyRoomId: args.dailyRoomId || args.streamCallId || args.roomId,
      title: args.title,
      appointmentId: args.appointmentId,
      initiatorId: args.initiatorId,
      participants: args.participants,
      status: "scheduled",
      scheduledAt: Date.now(),
      startTime: Date.now(),
      callType: args.callType,
      meetingLink: args.meetingLink || args.dailyRoomUrl || '',
      platform: args.platform || "stream",
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
      dailyConfig: args.dailyConfig ? {
        roomExp: args.dailyConfig.roomExp,
        meetingTokens: [],
        roomProperties: args.dailyConfig.roomProperties,
      } : undefined,
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
    streamToken: v.optional(v.string()),
    tokenExpiration: v.optional(v.number()),
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
      dailyMeetingToken: args.dailyMeetingToken || args.streamToken,
      dailyTokenExpiration: args.dailyTokenExpiration || args.tokenExpiration,
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
        roomExp: call.dailyConfig?.roomExp || Math.floor(Date.now() / 1000) + (24 * 60 * 60),
        roomProperties: call.dailyConfig?.roomProperties,
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
/**
 * Authorises an invitation sent from the physiotherapist video-calls dashboard
 * (actions/emails/sendVideoCallInvitation). Allowed for an admin, the host of the call the
 * link points to, or the recipient's active physiotherapist. The recipient address and
 * both names come from the database, never from the browser.
 */
export const authorizeVideoCallInvitation = internalQuery({
  args: {
    callerClerkId: v.string(),
    recipientId: v.optional(v.id("users")),
    recipientEmail: v.optional(v.string()),
    roomId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.callerClerkId))
      .first()
    if (!caller) return { allowed: false, reason: "Your account was not found." }

    let recipient = args.recipientId ? await ctx.db.get(args.recipientId) : null
    if (!recipient && args.recipientEmail) {
      const raw = args.recipientEmail.trim()
      recipient =
        (await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", raw)).first()) ??
        (await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", raw.toLowerCase())).first())
    }
    if (!recipient?.email) {
      return { allowed: false, reason: "The patient needs a Rehabify account with an email address before they can be invited." }
    }
    if (recipient._id === caller._id) return { allowed: false, reason: "You cannot invite yourself." }

    let allowed = caller.role === "admin"
    if (!allowed && args.roomId) {
      const call =
        (await ctx.db.query("videoCalls").withIndex("by_room_id", (q) => q.eq("roomId", args.roomId!)).first()) ??
        (await ctx.db.query("videoCalls").withIndex("by_stream_call_id", (q) => q.eq("streamCallId", args.roomId!)).first())
      if (call && call.status !== "ended" && call.status !== "cancelled") {
        allowed = call.initiatorId === caller._id || call.physiotherapistId === caller._id
      }
    }
    if (!allowed) allowed = await isActivePhysiotherapistOf(ctx, caller._id, recipient._id)
    if (!allowed) {
      return { allowed: false, reason: "You can only invite your own patients, or people to a call you host." }
    }
    return {
      allowed: true,
      recipientId: recipient._id,
      recipientEmail: recipient.email,
      recipientName: displayName(recipient) || undefined,
      callerName: displayName(caller) || undefined,
    }
  },
})

/**
 * Whether a signed-in user may start a call (createVideoCall). With an appointment, the caller
 * must be on it (its patient or physio, a team member of its clinic, or an admin). Everyone
 * invited must be on that appointment or someone the caller may reach (mayInviteToCall).
 */
export const authorizeCreateVideoCall = internalQuery({
  args: {
    callerId: v.id("users"),
    participants: v.array(v.id("users")),
    appointmentId: v.optional(v.id("appointments")),
  },
  handler: async (ctx, args): Promise<{ allowed: true } | { allowed: false; reason: string }> => {
    const caller = await ctx.db.get(args.callerId)
    if (!caller) return { allowed: false, reason: "Your account was not found." }
    const isAdmin = caller.role === "admin"

    let appointmentParties = new Set<string>()
    if (args.appointmentId) {
      const appointment = await ctx.db.get(args.appointmentId)
      if (!appointment) return { allowed: false, reason: "That appointment was not found." }
      appointmentParties = new Set([appointment.patientId, appointment.physiotherapistId])
      const onAppointment =
        isAdmin ||
        appointmentParties.has(caller._id) ||
        Boolean(appointment.clinicId && (await staffClinicId(ctx, caller)) === appointment.clinicId)
      if (!onAppointment) return { allowed: false, reason: "You can only start a call for your own appointments." }
    }

    for (const participantId of args.participants) {
      if (participantId === caller._id || appointmentParties.has(participantId)) continue
      const participant = await ctx.db.get(participantId)
      if (!participant || !(await mayInviteToCall(ctx, caller, participant))) {
        return { allowed: false, reason: "You can only invite your own patients or physiotherapist to a call." }
      }
    }
    return { allowed: true }
  },
})

export const getDailyRoomInfo = query({
  args: {
    callId: v.id("videoCalls"),
  },
  handler: async (ctx, args) => {

    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      console.error('❌ No user identity found')
      throw new Error("Unauthorized")
    }


    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()

    if (!user) {
      console.error('❌ User not found in database for clerkId:', identity.subject)
      throw new Error("User not found")
    }


    // Get the video call
    const call = await ctx.db.get(args.callId)
    if (!call) {
      console.error('❌ Call not found:', args.callId)
      throw new Error("Call not found")
    }


    // Check if user is authorized to access this call
    const isParticipant = call.participants.includes(user._id)
    const isInitiator = call.initiatorId === user._id


    if (!isParticipant && !isInitiator) {
      console.error('❌ User not authorized to access call')
      throw new Error("You are not authorized to access this call")
    }

    // Get participant record with meeting token
    const participant = await ctx.db
      .query("videoCallParticipants")
      .withIndex("by_call_and_user", (q) => q.eq("callId", args.callId).eq("userId", user._id))
      .unique()


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

    return result
  },
})

// Get my video calls (for dashboard pages)
export const getMyVideoCalls = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Not authenticated")
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()

    if (!user) {
      throw new Error("User not found")
    }

    // Calls the user started, was booked onto, has an appointment for, or has joined (by index;
    // appointment calls from marketplace/Joy bookings list the patient only as a participant)
    const calls = new Map<string, Doc<"videoCalls">>()
    const add = (call: Doc<"videoCalls"> | null) => { if (call) calls.set(call._id, call) }
    // Bounded to the most recent history, so the page stays fast for long-standing accounts
    for (const call of await ctx.db.query("videoCalls").withIndex("by_initiator", (q) => q.eq("initiatorId", user._id)).order("desc").take(200)) add(call)
    for (const call of await ctx.db.query("videoCalls").withIndex("by_patient_id_and_scheduled", (q) => q.eq("patientId", user._id)).order("desc").take(200)) add(call)
    const appointments = user.role === "physiotherapist"
      ? await ctx.db.query("appointments").withIndex("by_physiotherapist_id_and_time", (q) => q.eq("physiotherapistId", user._id)).order("desc").take(300)
      : await ctx.db.query("appointments").withIndex("by_patient_id_and_time", (q) => q.eq("patientId", user._id)).order("desc").take(300)
    for (const appointment of appointments) {
      if (!appointment.videoCallId && !appointment.meetingLink) continue
      for (const call of await ctx.db.query("videoCalls").withIndex("by_appointment", (q) => q.eq("appointmentId", appointment._id)).collect()) add(call)
    }
    for (const joined of await ctx.db.query("videoCallParticipants").withIndex("by_user_id", (q) => q.eq("userId", user._id)).order("desc").take(200)) {
      add(await ctx.db.get(joined.callId))
    }
    // Daily meeting tokens are per-participant secrets; never send them to the list
    const myCalls = [...calls.values()].map(({ dailyConfig: _dailyConfig, ...call }) => call)

    // Enrich calls with patient/physiotherapist data
    const enrichedCalls = await Promise.all(
      myCalls.map(async (call) => {
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
          } : undefined,
          physiotherapist: physiotherapist ? {
            _id: physiotherapist._id,
            firstName: physiotherapist.firstName,
            lastName: physiotherapist.lastName,
            email: physiotherapist.email,
          } : undefined,
        }
      })
    )

    // Sort by most recent first
    return enrichedCalls.sort((a, b) => {
      const aTime = a.scheduledAt || a.startTime || a.createdAt || 0
      const bTime = b.scheduledAt || b.startTime || b.createdAt || 0
      return bTime - aTime
    })
  },
})

// Get call details by room ID (for both legacy and Daily.co)
export const getCallByRoomId = query({
  args: {
    roomId: v.string(),
  },
  handler: async (ctx, args) => {

    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return null // Return null instead of throwing error for unauthorized access
    }


    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()

    if (!user) {
      return null
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

    if (!call) {
      return null
    }


    // Check if user is authorized to access this call
    const isParticipant = call.participants.includes(user._id)
    const isInitiator = call.initiatorId === user._id


    if (!isParticipant && !isInitiator) {
      return null
    }

    // Get participant record with meeting token
    const participant = await ctx.db
      .query("videoCallParticipants")
      .withIndex("by_call_and_user", (q) => q.eq("callId", call._id).eq("userId", user._id))
      .unique()


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

    return result
  },
})

export const getClinicVideoCalls = query({
  args: {
    clinicId: v.id("clinics"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    const viewer = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    // Only that clinic's owner and team (or an admin) see its calls
    if (!viewer || (viewer.role !== "admin" && (await staffClinicId(ctx, viewer)) !== args.clinicId)) {
      throw new ConvexError("You're not part of this clinic.");
    }

    const videoCalls = await ctx.db
      .query("videoCalls")
      .withIndex("by_clinic_id_and_scheduled", (q) => q.eq("clinicId", args.clinicId))
      .order("desc")
      .take(200);

    // Enrich with participant details
    const enrichedCalls = await Promise.all(
      videoCalls.map(async (call) => {
        const participants = await Promise.all(
          call.participants.map(async (userId) => {
            const user = await ctx.db.get(userId);
            return user ? { name: `${user.firstName} ${user.lastName}`, imageUrl: user.imageUrl } : null;
          })
        );

        return {
          ...call,
          participantDetails: participants.filter(Boolean),
        };
      })
    );

    return enrichedCalls;
  },
});