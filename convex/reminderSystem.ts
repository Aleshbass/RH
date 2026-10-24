// @ts-nocheck
import { internalQuery, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { lagosDateTime, lagosTime } from "./helpers/lagosTime";

// Note: typing this file fully (or reshaping the invoice functions) tips the Convex tsc over
// TypeScript's instantiation depth limit elsewhere (TS2589), so it stays @ts-nocheck for now.

const HOUR = 60 * 60 * 1000;

const fullName = (user: any, fallback: string) =>
  `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || fallback;

type ReminderRun = { success: boolean; remindersSent: number; remindersSkipped: number };

/**
 * INVOICE PAYMENT REMINDERS
 * Send reminders for unpaid invoices with smart limits
 */

export const getUnpaidInvoices = internalQuery({
  handler: async (ctx) => {
    const now = Date.now();
    const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;

    // Sent (not paid) invoices that are past due or were issued more than 3 days ago
    const sent = await ctx.db
      .query("invoices")
      .withIndex("by_status_and_due_date", (q) => q.eq("status", "sent"))
      .take(1000);

    return sent.filter(
      (invoice) => invoice.dueDate < now || (invoice.issueDate ?? invoice._creationTime) < threeDaysAgo
    );
  },
});

export const countInvoiceReminders = internalQuery({
  args: {
    invoiceId: v.id("invoices"),
    patientId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const reminders = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_type", (q) =>
        q.eq("userId", args.patientId).eq("type", "invoice_payment_reminder")
      )
      .order("desc")
      .take(200);

    return reminders.filter((n) => n.payload?.data?.invoiceId === String(args.invoiceId)).length;
  },
});

export const sendInvoicePaymentReminders = internalAction({
  handler: async (ctx) => {
    const unpaidInvoices = await ctx.runQuery(internal.reminderSystem.getUnpaidInvoices);
    const today = new Date().toISOString().split("T")[0];

    let remindersSent = 0;
    let remindersSkipped = 0;

    for (const invoice of unpaidInvoices) {
      try {
        if (!invoice.patientId) continue;

        // Get patient details
        const patient = await ctx.runQuery(internal.reminderSystem.getUserById, {
          userId: invoice.patientId,
        });

        if (!patient) continue;

        // Get physiotherapist details if available
        const physioId = (invoice as any).physiotherapistId;
        let physio = null;
        if (physioId) {
          physio = await ctx.runQuery(internal.reminderSystem.getUserById, {
            userId: physioId,
          });
        }

        if (!physio) continue;

        // Check reminder count - MAX 3 reminders per invoice
        const reminderCount = await ctx.runQuery(
          internal.reminderSystem.countInvoiceReminders,
          { invoiceId: invoice._id, patientId: invoice.patientId }
        );

        if (reminderCount >= 3) {
          remindersSkipped++;
          continue; // Skip if already sent 3 reminders
        }

        // Calculate days overdue
        const daysOverdue = Math.floor((Date.now() - invoice.dueDate) / (24 * 60 * 60 * 1000));
        const isOverdue = daysOverdue > 0;

        // Create in-app notification
        await ctx.runMutation(internal.notifications.core.createNotificationWithDeduplication, {
          userId: invoice.patientId,
          type: "invoice_payment_reminder",
          priority: isOverdue ? "high" : "medium",
          payload: {
            title: isOverdue
              ? `Payment Overdue: Invoice #${invoice.invoiceNumber}`
              : `Payment Reminder: Invoice #${invoice.invoiceNumber}`,
            body: isOverdue
              ? `Your invoice for ₦${(invoice.totalAmount / 100).toLocaleString()} is ${daysOverdue} days overdue. Please pay to avoid service interruption.`
              : `Reminder: Your invoice for ₦${(invoice.totalAmount / 100).toLocaleString()} is due soon.`,
            data: {
              invoiceId: String(invoice._id),
              invoiceNumber: invoice.invoiceNumber,
              amount: invoice.totalAmount,
              dueDate: invoice.dueDate,
              daysOverdue: isOverdue ? daysOverdue : 0,
              reminderCount: reminderCount + 1,
              reminderDate: today,
            },
            link: `/dashboard/patient/invoices/${invoice._id}`,
          },
          deduplicationWindowMs: 24 * 60 * 60 * 1000, // 24 hours
        });

        remindersSent++;

        // Log reminder sent
      } catch (e) {
        console.error(`Failed to send invoice reminder for ${invoice._id}:`, e);
      }
    }

    return {
      success: true,
      remindersSent,
      remindersSkipped,
      totalUnpaid: unpaidInvoices.length,
    };
  },
});

/**
 * APPOINTMENT REMINDERS
 * Patients and physios get a "starting soon" reminder 1-2 hours before a visit, and physios a
 * 24-hour one. The patient's day-ahead reminder is the daily email in
 * scheduled/appointment_reminders.ts, so it isn't repeated here.
 */

/** Scheduled or confirmed visits starting in [from, to). Defaults to the next 48 hours. */
export const getUpcomingAppointments = internalQuery({
  args: { from: v.optional(v.number()), to: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Doc<"appointments">[]> => {
    const from = args.from ?? Date.now();
    const to = args.to ?? from + 48 * HOUR;

    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_start_time", (q) => q.gte("startTime", from).lt("startTime", to))
      .take(1000);

    return appointments.filter((a) => a.status === "scheduled" || a.status === "confirmed");
  },
});

/** Whether this user already has the `kind` reminder for this visit. */
export const hasAppointmentReminder = internalQuery({
  args: {
    appointmentId: v.id("appointments"),
    userId: v.id("users"),
    kind: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const recent = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_type", (q) =>
        q.eq("userId", args.userId).eq("type", "appointment_reminder")
      )
      .order("desc")
      .take(50);

    return recent.some(
      (n) =>
        n.payload?.data?.appointmentId === String(args.appointmentId) &&
        n.payload?.data?.kind === args.kind
    );
  },
});

export const sendAppointmentReminders = internalAction({
  handler: async (ctx): Promise<ReminderRun & { totalUpcoming: number }> => {
    const now = Date.now();
    // Windows are a little wider than the hourly cron so no visit slips between two runs;
    // hasAppointmentReminder stops the overlap sending twice.
    const startingSoon = await ctx.runQuery(internal.reminderSystem.getUpcomingAppointments, {
      from: now + HOUR,
      to: now + 2 * HOUR + 5 * 60 * 1000,
    });
    const dayAhead = await ctx.runQuery(internal.reminderSystem.getUpcomingAppointments, {
      from: now + 23 * HOUR,
      to: now + 24 * HOUR + 5 * 60 * 1000,
    });

    let remindersSent = 0;
    let remindersSkipped = 0;

    const remind = async (
      appointment: any,
      userId: any,
      kind: "soon" | "day",
      title: string,
      body: string,
      link: string
    ) => {
      const already = await ctx.runQuery(internal.reminderSystem.hasAppointmentReminder, {
        appointmentId: appointment._id,
        userId,
        kind,
      });
      if (already) {
        remindersSkipped++;
        return;
      }
      await ctx.runMutation(internal.notifications.core.createNotificationWithDeduplication, {
        userId,
        type: "appointment_reminder",
        priority: kind === "soon" ? "high" : "medium",
        payload: {
          title,
          body,
          data: {
            appointmentId: String(appointment._id),
            kind,
            appointmentType: appointment.appointmentType,
          },
          link,
        },
        deduplicationWindowMs: 12 * HOUR,
      });
      remindersSent++;
    };

    for (const appointment of startingSoon) {
      try {
        const patient = await ctx.runQuery(internal.reminderSystem.getUserById, {
          userId: appointment.patientId,
        });
        const physio = await ctx.runQuery(internal.reminderSystem.getUserById, {
          userId: appointment.physiotherapistId,
        });
        if (!patient || !physio) continue;

        const at = lagosTime(appointment.startTime);
        // Patients can switch reminders off in their settings
        if (patient.notificationPreferences?.appointmentReminders !== false) {
          await remind(
            appointment,
            patient._id,
            "soon",
            "Appointment starting soon",
            `Your appointment with ${fullName(physio, "your physiotherapist")} starts at ${at}.`,
            "/dashboard/patient/appointments"
          );
        }
        await remind(
          appointment,
          physio._id,
          "soon",
          "Appointment starting soon",
          `Your appointment with ${fullName(patient, "your patient")} starts at ${at}.`,
          "/dashboard/physiotherapist/appointments"
        );
      } catch (e) {
        console.error(`Failed to send appointment reminder for ${appointment._id}:`, e);
      }
    }

    for (const appointment of dayAhead) {
      try {
        const patient = await ctx.runQuery(internal.reminderSystem.getUserById, {
          userId: appointment.patientId,
        });
        if (!patient) continue;

        await remind(
          appointment,
          appointment.physiotherapistId,
          "day",
          "Appointment in 24 hours",
          `Your appointment with ${fullName(patient, "your patient")} is on ${lagosDateTime(appointment.startTime)}.`,
          "/dashboard/physiotherapist/appointments"
        );
      } catch (e) {
        console.error(`Failed to send appointment reminder for ${appointment._id}:`, e);
      }
    }

    return {
      success: true,
      remindersSent,
      remindersSkipped,
      totalUpcoming: startingSoon.length + dayAhead.length,
    };
  },
});

/**
 * Helper query to get user by ID (for internal use)
 */
export const getUserById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<Doc<"users"> | null> => {
    return await ctx.db.get(args.userId);
  },
});
