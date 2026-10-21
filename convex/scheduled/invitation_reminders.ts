// @ts-nocheck
import { internalAction, internalQuery, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { publicAppUrl } from "../helpers/appUrl";

/**
 * Send reminder emails for pending patient invitations that are approaching expiry.
 * Criteria: 
 * - status === 'pending' 
 * - expiresAt within next 3 days 
 * - createdAt older than 24h
 * - lastReminderSentAt is NOT set (only send ONE reminder per invitation)
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

    // Collect pending invitations expiring soon that haven't received a reminder yet
    const pending = await ctx.runQuery(internal.scheduled.invitation_reminders.getPendingInvitations, {
      soonCutoff,
      createdBefore,
    });

    const appUrl = publicAppUrl();

    let sent = 0;
    for (const inv of pending) {
      try {
        const physio = await ctx.runQuery(internal.scheduled.invitation_reminders.getPhysiotherapist, {
          physiotherapistId: inv.physiotherapistId,
        });
        const physiotherapistName = `${physio?.firstName || ''} ${physio?.lastName || ''}`.trim() || physio?.email || 'Your Physiotherapist';
        const invitationLink = `${appUrl}/patient-invite/${inv.code}`;

        // Use the dedicated reminder email action
        await ctx.runAction(internal.actions.emails.sendInvitationEmail.sendInvitationReminderEmail, {
          patientEmail: inv.patientEmail,
          patientName: inv.patientName,
          physiotherapistName,
          invitationCode: inv.code,
          invitationLink,
          expiresAt: inv.expiresAt,
        });

        // Mark the invitation as reminded to prevent duplicate sends
        await ctx.runMutation(internal.scheduled.invitation_reminders.markReminderSent, {
          invitationId: inv._id,
        });

        sent += 1;
      } catch (e) {
        console.error('Failed to send invitation reminder for invitation', inv._id, e);
      }
    }

    return { success: true, remindersSent: sent, totalCandidates: pending.length };
  },
});

/**
 * Helper query to get pending invitations that haven't received a reminder yet
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
          q.lt(q.field("createdAt"), args.createdBefore),
          // Only get invitations that haven't received a reminder yet
          q.eq(q.field("lastReminderSentAt"), undefined)
        )
      )
      .collect();
  },
});

/**
 * Mark an invitation as having received a reminder
 */
export const markReminderSent = internalMutation({
  args: {
    invitationId: v.id("patientInvitations"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.invitationId, {
      lastReminderSentAt: Date.now(),
    });
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
