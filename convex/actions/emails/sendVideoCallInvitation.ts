"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";
import { api, internal } from "../../_generated/api";

/**
 * Send a video call invitation email to a patient
 */
export const sendVideoCallInvitation = action({
  args: {
    patientEmail: v.string(),
    patientName: v.optional(v.string()),
    physiotherapistName: v.string(),
    callLink: v.string(),
    callTitle: v.optional(v.string()),
    scheduledAt: v.optional(v.union(v.string(), v.number())),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const result = await sendEmail({
        to: args.patientEmail,
        template: 'VIDEO_CALL_INVITATION',
        data: {
          patientName: args.patientName,
          physiotherapistName: args.physiotherapistName,
          callTitle: args.callTitle,
          callLink: args.callLink,
          scheduledAt: args.scheduledAt,
          message: args.message,
        }
      });

      // Try to look up patient by email to send in-app notification and set RSVP
      try {
        const patientUser = await ctx.runQuery(api.users.getUserByEmail as any, { email: args.patientEmail })

        if (patientUser) {
          // Create in-app notification
          await ctx.runMutation(api["notifications/core"].createNotificationWithDeduplication as any, {
            userId: patientUser._id,
            type: "video_call_scheduled",
            payload: {
              title: "Video Call Invitation",
              body: `${args.physiotherapistName} invited you to a video call${args.callTitle ? `: ${args.callTitle}` : ''}.`,
              data: {
                actionUrl: args.callLink,
                metadata: {
                  callTitle: args.callTitle,
                  scheduledAt: args.scheduledAt,
                }
              }
            }
          });

          // Parse roomId from callLink (expects /video-call/{roomId})
          try {
            const parts = args.callLink.split('/');
            const roomId = parts[parts.length - 1] || '';
            if (roomId) {
              // Find call metadata (works with roomId or streamCallId)
              const call = await ctx.runQuery(api.stream_queries.getCallMetadata as any, { callId: roomId })

              if (call && call._id) {
                await ctx.runMutation(internal.videoCalls.setParticipantRsvp, {
                  callId: call._id,
                  userId: patientUser._id,
                  status: "invited",
                });
              }
            }
          } catch {}
        }
      } catch (e) {
        console.warn('[sendVideoCallInvitation] Skipping in-app notification/RSVP:', e instanceof Error ? e.message : e);
      }

      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      };
    } catch (error) {
      console.error('Failed to send video call invitation email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
});
