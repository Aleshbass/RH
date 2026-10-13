"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";
import { appLink } from "../../helpers/appUrl";
import { escapeHtml, plainSubject } from "../../helpers/escapeHtml";

/**
 * Send an appointment rescheduled email to the patient (patient-facing).
 * Internal: scheduled by appointment/booking mutations, never callable from a browser.
 */
export const sendAppointmentRescheduledPatientEmail = internalAction({
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
        subject: args.subjectOverride ? plainSubject(args.subjectOverride) : undefined,
        template: 'APPOINTMENT_RESCHEDULED',
        data: {
          patientName: escapeHtml(args.patientName),
          physiotherapistName: escapeHtml(args.physiotherapistName),
          oldDate: args.oldDate,
          oldTime: escapeHtml(args.oldTime),
          newDate: args.newDate,
          newTime: escapeHtml(args.newTime),
          viewLink: appLink(args.viewLink),
        },
      });
      return { success: result.success, messageId: result.messageId, error: result.error };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  },
});
