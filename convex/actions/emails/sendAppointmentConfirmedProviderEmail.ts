"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";
import { publicAppUrl } from "../../helpers/appUrl";

/**
 * Send an appointment confirmed email to the physiotherapist (provider-facing).
 */
export const sendAppointmentConfirmedProviderEmail = action({
  args: {
    to: v.string(),
    patientName: v.string(),
    physiotherapistName: v.string(),
    appointmentDate: v.union(v.string(), v.number()),
    appointmentTime: v.string(),
    viewLink: v.string(),
    subjectOverride: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    try {
      const baseUrl = publicAppUrl();
      const viewLink = args.viewLink.startsWith('http') ? args.viewLink : `${baseUrl}${args.viewLink}`;
      const result = await sendEmail({
        to: args.to,
        subject: args.subjectOverride,
        template: 'APPOINTMENT_CONFIRMED_PROVIDER',
        data: {
          patientName: args.patientName,
          physiotherapistName: args.physiotherapistName,
          appointmentDate: args.appointmentDate,
          appointmentTime: args.appointmentTime,
          viewLink,
        },
      });
      return { success: result.success, messageId: result.messageId, error: result.error };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  },
});
