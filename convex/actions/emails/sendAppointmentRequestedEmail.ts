"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";

/**
 * Send an appointment requested email to the physiotherapist.
 */
export const sendAppointmentRequestedEmail = action({
  args: {
    to: v.string(),
    patientName: v.string(),
    physiotherapistName: v.string(),
    appointmentDate: v.union(v.string(), v.number()),
    appointmentTime: v.string(),
    clinicName: v.optional(v.string()),
    clinicAddress: v.optional(v.string()),
    viewLink: v.string(),
    approveLink: v.optional(v.string()),
    subjectOverride: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    try {
      const result = await sendEmail({
        to: args.to,
        subject: args.subjectOverride,
        template: 'APPOINTMENT_REQUESTED',
        data: {
          patientName: args.patientName,
          physiotherapistName: args.physiotherapistName,
          appointmentDate: args.appointmentDate,
          appointmentTime: args.appointmentTime,
          clinicName: args.clinicName,
          clinicAddress: args.clinicAddress,
          viewLink: args.viewLink,
          approveLink: args.approveLink,
        },
      });
      return { success: result.success, messageId: result.messageId, error: result.error };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  },
});
