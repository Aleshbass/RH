import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { publicAppUrl } from "../helpers/appUrl";
import { lagosTimeRange, startOfZonedDay } from "../helpers/lagosTime";

/**
 * Send appointment reminders for all appointments happening tomorrow (Lagos day window).
 * Runs daily via cron. Creates notifications that send emails via the router.
 */
export const sendDailyAppointmentReminders = internalMutation({
  args: {},
  // Explicit return type: inferring it through the generated api types is too deep (TS2589).
  handler: async (ctx): Promise<{ success: boolean; count: number }> => {
    const DAY = 24 * 60 * 60 * 1000;

    // Tomorrow's start/end in Lagos time (Convex runs in UTC); names kept from the UTC version
    const startOfTomorrowUTC = startOfZonedDay(Date.now()) + DAY;
    const endOfTomorrowUTC = startOfTomorrowUTC + DAY - 1;

    // Query appointments scheduled for tomorrow that are not cancelled
    const appointments = await ctx.db
      .query("appointments")
      .filter((q) =>
        q.and(
          q.gte(q.field("startTime"), startOfTomorrowUTC),
          q.lte(q.field("startTime"), endOfTomorrowUTC),
          q.neq(q.field("status"), "cancelled_by_patient"),
          q.neq(q.field("status"), "cancelled_by_therapist")
        )
      )
      .collect();

    const appUrl = publicAppUrl();

    for (const appt of appointments) {
      try {
        const patient = await ctx.db.get(appt.patientId);
        const physio = await ctx.db.get(appt.physiotherapistId);
        if (!patient || !physio || !patient.email) continue;
        // Patients can switch reminders off in their settings
        if (patient.notificationPreferences?.appointmentReminders === false) continue;

        // Compute names and strings
        const patientName = `${patient.firstName || ""} ${patient.lastName || ""}`.trim() || patient.email;
        const physiotherapistName = `${physio.firstName || ""} ${physio.lastName || ""}`.trim() || "Physiotherapist";
        const appointmentTime = lagosTimeRange(appt.startTime, appt.endTime);

        // Resolve clinic name best-effort
        let clinicName = "Rehabify Health";
        if (physio.physiotherapistProfileId) {
          const profile = await ctx.db.get(physio.physiotherapistProfileId);
          const clinicId = (profile as any)?.clinicId || physio.clinicId;
          if (clinicId) {
            const clinic = await ctx.db.get(clinicId);
            if (clinic) clinicName = (clinic as any).name || clinicName;
          }
        } else if (physio.clinicId) {
          const clinic = await ctx.db.get(physio.clinicId);
          if (clinic) clinicName = (clinic as any).name || clinicName;
        }

        const confirmLink = `${appUrl}/dashboard/patient/appointments`;
        const rescheduleLink = `${appUrl}/dashboard/patient/appointments`;

        // Create the notification directly
        const notificationId = await ctx.db.insert("notifications", {
          userId: patient._id,
          type: "appointment_reminder" as any,
          priority: "medium" as any,
          status: "pending" as any,
          payload: {
            title: "Appointment Reminder",
            body: `Reminder: Your appointment with ${physiotherapistName} is tomorrow at ${appointmentTime}.`,
            data: {
              entityId: String(appt._id),
              entityType: "appointment",
              actionUrl: "/dashboard/patient/appointments",
              metadata: {
                patientName,
                physiotherapistName,
                appointmentDate: appt.startTime,
                appointmentTime,
                clinicName,
                confirmLink,
                rescheduleLink,
              },
            },
          },
          createdAt: Date.now(),
        });

        // Schedule email processing via the email router
        await ctx.scheduler.runAfter(0, internal.notifications.email.processEmailForNotification, {
          notificationId,
          retryOnFailure: true,
          maxRetries: 3,
        });
      } catch (err) {
        console.error("Failed to schedule reminder for appointment", appt._id, err);
      }
    }

    return { success: true, count: appointments.length };
  },
});
