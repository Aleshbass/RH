"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";

/**
 * Send Google Meet link email
 */
export const sendGoogleMeetLinkEmail = internalAction({
    args: {
        to: v.string(),
        displayName: v.string(),
        meetingLink: v.string(),
        calendarLink: v.optional(v.string()),
        appointmentDate: v.number(),
    },
    returns: v.object({
        success: v.boolean(),
        messageId: v.optional(v.string()),
        error: v.optional(v.string()),
    }),
    handler: async (_ctx, args) => {
        try {
            console.log('[EMAIL SERVICE] Sending Google Meet link to', args.to);

            const result = await sendEmail({
                to: args.to,
                subject: 'Your Google Meet Link is Ready',
                template: 'GOOGLE_MEET_LINK',
                data: {
                    recipientName: args.displayName,
                    meetingLink: args.meetingLink,
                    calendarLink: args.calendarLink || '#',
                    appointmentDate: args.appointmentDate,
                },
            });

            console.log('[EMAIL SERVICE] Google Meet link email sent successfully, messageId:', result.messageId);

            return {
                success: result.success,
                messageId: result.messageId,
                error: result.error,
            };
        } catch (error) {
            console.error('[EMAIL SERVICE] Failed to send Google Meet link email:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            };
        }
    },
});

