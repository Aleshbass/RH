"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";

/**
 * Send an appointment canceled email to the physiotherapist (provider-facing).
 */
export const sendAppointmentCanceledProviderEmail = action({
  args: {
    to: v.string(),
    patientName: v.string(),
    physiotherapistName: v.string(),
    appointmentDate: v.union(v.string(), v.number()),
    appointmentTime: v.string(),
    cancellationReason: v.optional(v.string()),
    viewLink: v.string(),
    subjectOverride: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    try {
      const result = await sendEmail({
        to: args.to,
        subject: args.subjectOverride,
        template: 'APPOINTMENT_CANCELED_PROVIDER',
        data: {
          patientName: args.patientName,
          physiotherapistName: args.physiotherapistName,
          appointmentDate: args.appointmentDate,
          appointmentTime: args.appointmentTime,
          cancellationReason: args.cancellationReason,
          viewLink: args.viewLink,
        },
      });
      return { success: result.success, messageId: result.messageId, error: result.error };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  },
});
