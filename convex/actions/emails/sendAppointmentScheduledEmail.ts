"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";
import { publicAppUrl } from "../../helpers/appUrl";
import { escapeHtml, plainSubject } from "../../helpers/escapeHtml";

/**
 * Send an appointment scheduled email. This action is intentionally simple and stateless:
 * all display data is passed in from the caller (Convex mutations) to avoid auth/DB constraints in actions.
 * Internal: scheduled by appointment/booking mutations, never callable from a browser.
 */
export const sendAppointmentScheduledEmail = internalAction({
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
      const baseUrl = publicAppUrl();
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
        subject: plainSubject(args.subjectOverride || `Your Appointment with ${args.physiotherapistName} has been scheduled`),
        template: 'APPOINTMENT_SCHEDULED',
        data: {
          patientName: escapeHtml(args.patientName),
          physiotherapistName: escapeHtml(args.physiotherapistName),
          appointmentDate: args.appointmentDate,
          appointmentTime: escapeHtml(args.appointmentTime),
          clinicName: escapeHtml(args.clinicName || 'Rehabify Health'),
          clinicAddress: escapeHtml(args.clinicAddress || ''),
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
