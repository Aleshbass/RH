"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";
import { appLink } from "../../helpers/appUrl";
import { escapeHtml, escapeOptional, plainSubject } from "../../helpers/escapeHtml";

/**
 * Send an appointment requested email to the physiotherapist.
 * Internal: scheduled by appointment/booking mutations, never callable from a browser.
 */
export const sendAppointmentRequestedEmail = internalAction({
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
        subject: args.subjectOverride ? plainSubject(args.subjectOverride) : undefined,
        template: 'APPOINTMENT_REQUESTED',
        data: {
          patientName: escapeHtml(args.patientName),
          physiotherapistName: escapeHtml(args.physiotherapistName),
          appointmentDate: args.appointmentDate,
          appointmentTime: escapeHtml(args.appointmentTime),
          clinicName: escapeOptional(args.clinicName),
          clinicAddress: escapeOptional(args.clinicAddress),
          viewLink: appLink(args.viewLink),
          approveLink: args.approveLink ? appLink(args.approveLink) : undefined,
        },
      });
      return { success: result.success, messageId: result.messageId, error: result.error };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  },
});
