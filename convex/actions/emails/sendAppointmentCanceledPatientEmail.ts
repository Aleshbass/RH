"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";
import { appLink } from "../../helpers/appUrl";
import { escapeHtml, escapeOptional, plainSubject } from "../../helpers/escapeHtml";

/**
 * Send an appointment canceled email to the patient (patient-facing).
 * Internal: scheduled by appointment/booking mutations, never callable from a browser.
 */
export const sendAppointmentCanceledPatientEmail = internalAction({
  args: {
    to: v.string(),
    patientName: v.string(),
    physiotherapistName: v.string(),
    appointmentDate: v.union(v.string(), v.number()),
    appointmentTime: v.string(),
    cancellationReason: v.optional(v.string()),
    rescheduleLink: v.string(),
    subjectOverride: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    try {
      const result = await sendEmail({
        to: args.to,
        subject: args.subjectOverride ? plainSubject(args.subjectOverride) : undefined,
        template: 'APPOINTMENT_CANCELED',
        data: {
          patientName: escapeHtml(args.patientName),
          physiotherapistName: escapeHtml(args.physiotherapistName),
          appointmentDate: args.appointmentDate,
          appointmentTime: escapeHtml(args.appointmentTime),
          cancellationReason: escapeOptional(args.cancellationReason),
          rescheduleLink: appLink(args.rescheduleLink),
        },
      });
      return { success: result.success, messageId: result.messageId, error: result.error };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  },
});
