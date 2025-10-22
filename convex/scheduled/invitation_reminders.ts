// @ts-nocheck
import { internalAction, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { internal } from "../_generated/api";

/**
 * Send reminder emails for pending patient invitations that are approaching expiry.
 * Criteria: status === 'pending' AND expiresAt within next 3 days AND createdAt older than 24h.
 */
export const sendPendingInvitationReminders = internalAction({
  args: {
    lookaheadDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const lookaheadMs = (args.lookaheadDays ?? 3) * 24 * 60 * 60 * 1000;
    const soonCutoff = now + lookaheadMs;
    const createdBefore = now - (24 * 60 * 60 * 1000); // at least 24h old

    // Collect pending invitations expiring soon
    const pending = await ctx.runQuery(internal.scheduled.invitation_reminders.getPendingInvitations, {
      soonCutoff,
      createdBefore,
    });

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://rehabifyhealth.com').replace(/\/$/, '');

    let sent = 0;
    for (const inv of pending) {
      try {
        const physio = await ctx.runQuery(internal.scheduled.invitation_reminders.getPhysiotherapist, {
          physiotherapistId: inv.physiotherapistId,
        });
        const physiotherapistName = `${physio?.firstName || ''} ${physio?.lastName || ''}`.trim() || physio?.email || 'Your Physiotherapist';
        const invitationLink = `${appUrl}/patient-invite/${inv.code}`;

        // Use the dedicated reminder email action
        await ctx.runAction(api.actions.emails.sendInvitationEmail.sendInvitationReminderEmail as any, {
          patientEmail: inv.patientEmail,
          patientName: inv.patientName,
          physiotherapistName,
          invitationCode: inv.code,
          invitationLink,
          expiresAt: inv.expiresAt,
        });
        sent += 1;
      } catch (e) {
        console.error('Failed to send invitation reminder for code', inv.code, e);
      }
    }

    return { success: true, remindersSent: sent, totalCandidates: pending.length };
  },
});

/**
 * Helper query to get pending invitations
 */
export const getPendingInvitations = internalQuery({
  args: {
    soonCutoff: v.number(),
    createdBefore: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("patientInvitations")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "pending"),
          q.lte(q.field("expiresAt"), args.soonCutoff),
          q.lt(q.field("createdAt"), args.createdBefore)
        )
      )
      .collect();
  },
});

/**
 * Helper query to get physiotherapist by ID
 */
export const getPhysiotherapist = internalQuery({
  args: {
    physiotherapistId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.physiotherapistId);
  },
});
