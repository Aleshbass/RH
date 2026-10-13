"use node";

import { v, ConvexError } from "convex/values";
import { action, internalAction } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";
import { api, internal } from "../../_generated/api";
import { publicAppUrl } from "../../helpers/appUrl";
import { escapeHtml, escapeOptional, plainSubject } from "../../helpers/escapeHtml";

type InvitationResult = { success: boolean; messageId?: string; error?: string };

// Hosts a physiotherapist may paste as an external meeting link (Google Meet / Zoom).
const EXTERNAL_MEETING_HOSTS = [/^meet\.google\.com$/i, /^([a-z0-9-]+\.)*zoom\.us$/i];

/**
 * Classifies a call link: either one of our own /video-call/<roomId> links (the host is
 * ignored; the link is rebuilt from publicAppUrl) or an https Google Meet / Zoom link.
 * Anything else is rejected so the email cannot carry an arbitrary URL.
 */
function parseCallLink(link: string): { roomId: string } | { externalUrl: string } | null {
  let url: URL;
  try {
    // Accept a pasted "meet.google.com/abc-defg-hij" without a scheme.
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(link) ? link : `https://${link}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const match = url.pathname.match(/^\/video-call\/([A-Za-z0-9_-]+)\/?$/);
  if (match) return { roomId: match[1] };
  if (url.protocol === "https:" && EXTERNAL_MEETING_HOSTS.some((re) => re.test(url.hostname))) {
    return { externalUrl: url.toString() };
  }
  return null;
}

const invitationArgs = {
  patientEmail: v.string(),
  patientName: v.optional(v.string()),
  physiotherapistName: v.string(),
  callLink: v.string(),
  callTitle: v.optional(v.string()),
  scheduledAt: v.optional(v.union(v.string(), v.number())),
  message: v.optional(v.string()),
};

/**
 * Sends the invitation email, creates the in-app notification and marks the RSVP.
 * Internal: callers must already have authorised the recipient and the link
 * (createVideoCall for its own participants, or the public action below).
 */
export const deliverVideoCallInvitation = internalAction({
  args: {
    ...invitationArgs,
    recipientUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args): Promise<InvitationResult> => {
    try {
      const result = await sendEmail({
        to: args.patientEmail,
        subject: plainSubject(`Video Call Invitation from ${args.physiotherapistName}`),
        template: 'VIDEO_CALL_INVITATION',
        data: {
          patientName: escapeOptional(args.patientName),
          physiotherapistName: escapeHtml(args.physiotherapistName),
          callTitle: escapeOptional(args.callTitle),
          callLink: escapeHtml(args.callLink),
          scheduledAt: args.scheduledAt,
          message: escapeOptional(args.message),
        }
      });

      // Try to look up patient to send in-app notification and set RSVP
      try {
        const patientUser: any = args.recipientUserId
          ? { _id: args.recipientUserId }
          : await ctx.runQuery(api.users.getUserByEmail as any, { email: args.patientEmail })

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
              const call: any = await ctx.runQuery(internal.stream_queries.getCallMetadataInternal, { callId: roomId })

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

/**
 * Send a video call invitation email to a patient (called from the physiotherapist
 * video-calls dashboard). Public, so it is guarded: the caller must be signed in and be
 * an admin, the host of the call the link points to, or the patient's active
 * physiotherapist. The recipient address and both names come from the database; the
 * link must be one of our /video-call/ links (rebuilt on publicAppUrl) or a Google
 * Meet / Zoom link. `patientName` and `physiotherapistName` arguments are ignored.
 */
export const sendVideoCallInvitation = action({
  args: {
    ...invitationArgs,
    physiotherapistName: v.optional(v.string()),
    patientId: v.optional(v.id("users")),
  },
  handler: async (ctx, args): Promise<InvitationResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Please sign in to send invitations.");

    const parsed = parseCallLink(args.callLink.trim());
    if (!parsed) throw new ConvexError("Use a Rehabify video call link or a Google Meet / Zoom link.");

    const auth: any = await ctx.runQuery(internal.videoCalls.authorizeVideoCallInvitation, {
      callerClerkId: identity.subject,
      recipientId: args.patientId,
      recipientEmail: args.patientId ? undefined : args.patientEmail,
      roomId: "roomId" in parsed ? parsed.roomId : undefined,
    });
    if (!auth?.allowed) throw new ConvexError(auth?.reason || "Not allowed to send this invitation.");

    const callLink = "roomId" in parsed ? `${publicAppUrl()}/video-call/${parsed.roomId}` : parsed.externalUrl;

    return await ctx.runAction(internal.actions.emails.sendVideoCallInvitation.deliverVideoCallInvitation, {
      recipientUserId: auth.recipientId,
      patientEmail: auth.recipientEmail,
      patientName: auth.recipientName,
      physiotherapistName: auth.callerName || 'Your healthcare provider',
      callLink,
      callTitle: args.callTitle,
      scheduledAt: args.scheduledAt,
      message: args.message,
    });
  },
});
