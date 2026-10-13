"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";
import { publicAppUrl } from "../../helpers/appUrl";
import { escapeHtml, plainSubject } from "../../helpers/escapeHtml";

/**
 * Send an appointment confirmed email to the physiotherapist (provider-facing).
 * Internal: scheduled by appointment/booking mutations, never callable from a browser.
 */
export const sendAppointmentConfirmedProviderEmail = internalAction({
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
        subject: plainSubject(args.subjectOverride || `Appointment Confirmed by ${args.patientName}`),
        template: 'APPOINTMENT_CONFIRMED_PROVIDER',
        data: {
          patientName: escapeHtml(args.patientName),
          physiotherapistName: escapeHtml(args.physiotherapistName),
          appointmentDate: args.appointmentDate,
          appointmentTime: escapeHtml(args.appointmentTime),
          viewLink,
        },
      });
      return { success: result.success, messageId: result.messageId, error: result.error };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  },
});
