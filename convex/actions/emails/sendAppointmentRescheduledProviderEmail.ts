"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";

/**
 * Send an appointment rescheduled email to the physiotherapist (provider-facing).
 */
export const sendAppointmentRescheduledProviderEmail = action({
  args: {
    to: v.string(),
    patientName: v.string(),
    physiotherapistName: v.string(),
    oldDate: v.union(v.string(), v.number()),
    oldTime: v.string(),
    newDate: v.union(v.string(), v.number()),
    newTime: v.string(),
    viewLink: v.string(),
    subjectOverride: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    try {
      const result = await sendEmail({
        to: args.to,
        subject: args.subjectOverride,
        template: 'APPOINTMENT_RESCHEDULED_PROVIDER',
        data: {
          patientName: args.patientName,
          physiotherapistName: args.physiotherapistName,
          oldDate: args.oldDate,
          oldTime: args.oldTime,
          newDate: args.newDate,
          newTime: args.newTime,
          viewLink: args.viewLink,
        },
      });
      return { success: result.success, messageId: result.messageId, error: result.error };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  },
});
