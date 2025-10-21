"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";

/**
 * Send an appointment reminder email to the patient (patient-facing).
 */
export const sendAppointmentReminderEmail = action({
  args: {
    to: v.string(),
    patientName: v.string(),
    physiotherapistName: v.string(),
    appointmentDate: v.union(v.number(), v.string()),
    appointmentTime: v.string(),
    clinicName: v.string(),
    confirmLink: v.string(),
    rescheduleLink: v.string(),
    subjectOverride: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    try {
      const result = await sendEmail({
        to: args.to,
        subject: args.subjectOverride,
        template: 'APPOINTMENT_REMINDER',
        data: {
          patientName: args.patientName,
          physiotherapistName: args.physiotherapistName,
          appointmentDate: args.appointmentDate,
          appointmentTime: args.appointmentTime,
          clinicName: args.clinicName,
          confirmLink: args.confirmLink,
          rescheduleLink: args.rescheduleLink,
        },
      });
      return { success: result.success, messageId: result.messageId, error: result.error };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  },
});
