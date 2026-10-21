// @ts-nocheck
import { internalQuery, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

/**
 * INVOICE PAYMENT REMINDERS
 * Send reminders for unpaid invoices with smart limits
 */

export const getUnpaidInvoices = internalQuery({
  handler: async (ctx) => {
    const now = Date.now();
    const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;

    // Get invoices that are:
    // 1. Status = 'sent' (not paid)
    // 2. Due date has passed OR created more than 3 days ago
    // 3. Not cancelled
    const unpaidInvoices = await ctx.db
      .query("invoices")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "sent"),
          q.or(
            q.lt(q.field("dueDate"), now),
            q.lt(q.field("createdAt"), threeDaysAgo)
          )
        )
      )
      .collect();

    return unpaidInvoices;
  },
});

export const countInvoiceReminders = internalQuery({
  args: {
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args) => {
    const reminders = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_type", (q) =>
        q.eq("userId", args.invoiceId as any).eq("type", "invoice_payment_reminder")
      )
      .collect();

    return reminders.length;
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
          { invoiceId: invoice._id }
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
 * Send reminders for upcoming appointments with smart timing
 */

export const getUpcomingAppointments = internalQuery({
  handler: async (ctx) => {
    const now = Date.now();
    const twentyFourHoursFromNow = now + 24 * 60 * 60 * 1000;
    const fortyEightHoursFromNow = now + 48 * 60 * 60 * 1000;

    // Get appointments that are:
    // 1. Status = 'scheduled' or 'confirmed'
    // 2. Start time is within next 24-48 hours
    const upcomingAppointments = await ctx.db
      .query("appointments")
      .filter((q) =>
        q.and(
          q.or(
            q.eq(q.field("status"), "scheduled"),
            q.eq(q.field("status"), "confirmed")
          ),
          q.gte(q.field("startTime"), now),
          q.lte(q.field("startTime"), fortyEightHoursFromNow)
        )
      )
      .collect();

    return upcomingAppointments;
  },
});

export const countAppointmentReminders = internalQuery({
  args: {
    appointmentId: v.id("appointments"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().split("T")[0];
    const startOfDay = new Date(today).setHours(0, 0, 0, 0);

    const reminders = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_type", (q) =>
        q.eq("userId", args.userId).eq("type", "appointment_reminder")
      )
      .filter((q) =>
        q.and(
          q.gte(q.field("createdAt"), startOfDay),
          q.eq(
            q.field("payload.data.appointmentId"),
            String(args.appointmentId)
          )
        )
      )
      .collect();

    return reminders.length;
  },
});

export const sendAppointmentReminders = internalAction({
  handler: async (ctx) => {
    const upcomingAppointments = await ctx.runQuery(
      internal.reminderSystem.getUpcomingAppointments
    );
    const today = new Date().toISOString().split("T")[0];

    let remindersSent = 0;
    let remindersSkipped = 0;

    for (const appointment of upcomingAppointments) {
      try {
        const hoursUntilAppointment = Math.floor(
          (appointment.startTime - Date.now()) / (60 * 60 * 1000)
        );

        // Send reminder at specific intervals:
        // - 24 hours before
        // - 2 hours before
        const shouldSendReminder =
          (hoursUntilAppointment <= 24 && hoursUntilAppointment >= 23) ||
          (hoursUntilAppointment <= 2 && hoursUntilAppointment >= 1);

        if (!shouldSendReminder) continue;

        // Get patient and physiotherapist
        const patient = await ctx.runQuery(internal.reminderSystem.getUserById, {
          userId: appointment.patientId,
        });
        
        if (!patient) continue;
        
        const physio = await ctx.runQuery(internal.reminderSystem.getUserById, {
          userId: appointment.physiotherapistId,
        });

        if (!physio) continue;

        // Check if reminder already sent today for this appointment - MAX 2 per day
        const patientReminderCount = await ctx.runQuery(
          internal.reminderSystem.countAppointmentReminders,
          {
            appointmentId: appointment._id,
            userId: appointment.patientId,
          }
        );

        const physioReminderCount = await ctx.runQuery(
          internal.reminderSystem.countAppointmentReminders,
          {
            appointmentId: appointment._id,
            userId: appointment.physiotherapistId,
          }
        );

        // Send to patient (max 2 reminders per appointment), unless they switched reminders off
        if (patientReminderCount < 2 && patient.notificationPreferences?.appointmentReminders !== false) {
          await ctx.runMutation(
            internal.notifications.core.createNotificationWithDeduplication,
            {
              userId: appointment.patientId,
              type: "appointment_reminder",
              priority: hoursUntilAppointment <= 2 ? "high" : "medium",
              payload: {
                title:
                  hoursUntilAppointment <= 2
                    ? "Appointment Starting Soon!"
                    : "Appointment Reminder",
                body: `Your appointment with ${physio?.firstName} ${physio?.lastName} is in ${hoursUntilAppointment} hours`,
                data: {
                  appointmentId: String(appointment._id),
                  hoursUntil: hoursUntilAppointment,
                  appointmentType: appointment.appointmentType,
                  reminderDate: today,
                },
                link: `/dashboard/patient/appointments`,
              },
              deduplicationWindowMs: 12 * 60 * 60 * 1000, // 12 hours
            }
          );
          remindersSent++;
        }

        // Send to physiotherapist (max 2 reminders per appointment)
        if (physioReminderCount < 2) {
          await ctx.runMutation(
            internal.notifications.core.createNotificationWithDeduplication,
            {
              userId: appointment.physiotherapistId,
              type: "appointment_reminder",
              priority: hoursUntilAppointment <= 2 ? "high" : "medium",
              payload: {
                title:
                  hoursUntilAppointment <= 2
                    ? "Appointment Starting Soon!"
                    : "Appointment Reminder",
                body: `Appointment with ${patient?.firstName} ${patient?.lastName} is in ${hoursUntilAppointment} hours`,
                data: {
                  appointmentId: String(appointment._id),
                  hoursUntil: hoursUntilAppointment,
                  appointmentType: appointment.appointmentType,
                  reminderDate: today,
                },
                link: `/dashboard/physiotherapist/appointments`,
              },
              deduplicationWindowMs: 12 * 60 * 60 * 1000, // 12 hours
            }
          );
          remindersSent++;
        }

      } catch (e) {
        console.error(
          `Failed to send appointment reminder for ${appointment._id}:`,
          e
        );
      }
    }

    return {
      success: true,
      remindersSent,
      remindersSkipped,
      totalUpcoming: upcomingAppointments.length,
    };
  },
});

/**
 * Helper query to get user by ID (for internal use)
 */
export const getUserById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});
