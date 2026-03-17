"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";

/**
 * Send an appointment scheduled email. This action is intentionally simple and stateless:
 * all display data is passed in from the caller (Convex mutations) to avoid auth/DB constraints in actions.
 */
export const sendAppointmentScheduledEmail = action({
  args: {
    to: v.string(),
    patientName: v.string(),
    physiotherapistName: v.string(),
    appointmentDate: v.union(v.string(), v.number()),
    appointmentTime: v.string(),
    clinicName: v.optional(v.string()),
    clinicAddress: v.optional(v.string()),
    calendarLink: v.optional(v.string()),
    rescheduleLink: v.optional(v.string()),
    subjectOverride: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://physioaroundme.com';
      const absolutize = (url?: string) => {
        if (!url) return '#';
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        if (url.startsWith('/')) return `${baseUrl}${url}`;
        return url;
      };

      const calendarLink = absolutize(args.calendarLink);
      const rescheduleLink = absolutize(args.rescheduleLink);

      const result = await sendEmail({
        to: args.to,
        subject: args.subjectOverride,
        template: 'APPOINTMENT_SCHEDULED',
        data: {
          patientName: args.patientName,
          physiotherapistName: args.physiotherapistName,
          appointmentDate: args.appointmentDate,
          appointmentTime: args.appointmentTime,
          clinicName: args.clinicName || 'Rehabify Health',
          clinicAddress: args.clinicAddress || '',
          calendarLink,
          rescheduleLink,
        },
      });

      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
});
