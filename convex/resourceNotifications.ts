import { insertNotification } from "./helpers/pushNotify";
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Clinics that have an active resource with maintenance scheduled; only these need checking. */
async function clinicsWithScheduledMaintenance(ctx: any) {
  const resources = await ctx.db.query("resources").take(5000);
  const clinicIds = new Set<string>();
  for (const resource of resources) {
    if (resource.isActive && resource.maintenanceSchedule?.nextMaintenance) clinicIds.add(resource.clinicId);
  }
  return [...clinicIds];
}

async function activeClinicResources(ctx: any, clinicId: any) {
  const resources = await ctx.db
    .query("resources")
    .withIndex("by_clinic", (q: any) => q.eq("clinicId", clinicId))
    .take(1000);
  return resources.filter((resource: any) => resource.isActive);
}

/** Clinic admins and physiotherapists who receive resource alerts. */
async function clinicAlertRecipients(ctx: any, clinicId: any) {
  const users = await ctx.db
    .query("users")
    .withIndex("by_clinic_id", (q: any) => q.eq("clinicId", clinicId))
    .take(500);
  return users.filter((user: any) => user.role === "admin" || user.role === "physiotherapist");
}

/** True when this user already got a matching alert in the last day, so crons don't repeat it every run. */
async function alertedToday(ctx: any, userId: any, type: string, matches: (data: any) => boolean) {
  const recent = await ctx.db
    .query("notifications")
    .withIndex("by_user_and_type", (q: any) => q.eq("userId", userId).eq("type", type))
    .order("desc")
    .take(50);
  const since = Date.now() - 20 * HOUR;
  return recent.some((n: any) => n.createdAt >= since && matches(n.data ?? {}));
}

// Check maintenance for all clinics (called by daily cron job)
export const checkAllClinicsMaintenanceDaily = internalMutation({
  args: {},
  handler: async (ctx) => {
    try {
      for (const clinicId of await clinicsWithScheduledMaintenance(ctx)) {
        await ctx.scheduler.runAfter(0, internal.resourceNotifications.checkClinicMaintenance, {
          clinicId: clinicId as any,
        });
      }
    } catch (error) {
      console.error("Error in daily maintenance check:", error);
    }
  },
});

// Check conflicts for all clinics (called by hourly cron job)
export const checkAllClinicsConflictsHourly = internalMutation({
  args: {},
  handler: async (ctx) => {
    try {
      // Only run during business hours (8 AM - 6 PM UTC)
      const currentHour = new Date().getUTCHours();
      if (currentHour < 8 || currentHour >= 18) {
        return;
      }

      // Conflicts here are appointments that overlap a resource's maintenance window
      for (const clinicId of await clinicsWithScheduledMaintenance(ctx)) {
        await ctx.scheduler.runAfter(0, internal.resourceNotifications.checkClinicConflicts, {
          clinicId: clinicId as any,
        });
      }
    } catch (error) {
      console.error("Error in hourly conflict check:", error);
    }
  },
});

// Check maintenance for a specific clinic
export const checkClinicMaintenance = internalMutation({
  args: {
    clinicId: v.id("clinics"),
  },
  handler: async (ctx, args) => {
    try {
      const resources = await activeClinicResources(ctx, args.clinicId);

      const now = Date.now();
      const oneWeekFromNow = now + 7 * DAY;

      for (const resource of resources) {
        if (!resource.maintenanceSchedule || !resource.maintenanceSchedule.nextMaintenance) {
          continue;
        }

        const maintenance = resource.maintenanceSchedule;
        if (maintenance.nextMaintenance) {
          const maintenanceTime = new Date(maintenance.nextMaintenance).getTime();

          // Check for upcoming maintenance (within 1 week)
          if (maintenanceTime > now && maintenanceTime <= oneWeekFromNow) {
            await ctx.scheduler.runAfter(0, internal.resourceNotifications.sendMaintenanceAlert, {
              resourceId: resource._id,
              resourceName: resource.name,
              maintenanceType: "scheduled",
              scheduledDate: maintenanceTime,
              description: "Scheduled maintenance",
              clinicId: args.clinicId,
            });
          }

          // Check for overdue maintenance
          if (maintenanceTime < now) {
            await ctx.scheduler.runAfter(0, internal.resourceNotifications.sendMaintenanceAlert, {
              resourceId: resource._id,
              resourceName: resource.name,
              maintenanceType: "overdue",
              scheduledDate: maintenanceTime,
              description: "Overdue maintenance",
              clinicId: args.clinicId,
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error checking maintenance for clinic ${args.clinicId}:`, error);
    }
  },
});

// Check conflicts for a specific clinic
export const checkClinicConflicts = internalMutation({
  args: {
    clinicId: v.id("clinics"),
  },
  handler: async (ctx, args) => {
    try {
      const resources = (await activeClinicResources(ctx, args.clinicId)).filter(
        (resource: any) => resource.maintenanceSchedule?.nextMaintenance
      );
      if (resources.length === 0) return;

      // Upcoming appointments for the next 7 days
      const startTime = Date.now();
      const endTime = startTime + 7 * DAY;

      const appointments = (
        await ctx.db
          .query("appointments")
          .withIndex("by_clinic_id_and_time", (q) =>
            q.eq("clinicId", args.clinicId).gte("startTime", startTime).lte("startTime", endTime)
          )
          .take(2000)
      ).filter((a) => a.status !== "cancelled_by_patient" && a.status !== "cancelled_by_therapist");

      for (const appointment of appointments) {
        if (!appointment.selectedResources || appointment.selectedResources.length === 0) {
          continue;
        }

        for (const resourceId of appointment.selectedResources) {
          const resource = resources.find((r: any) => r._id === resourceId);
          if (!resource) continue;

          const maintenanceStart = new Date(resource.maintenanceSchedule.nextMaintenance).getTime();
          // Assume 2 hour maintenance window
          const maintenanceEnd = maintenanceStart + 2 * HOUR;
          const hasMaintenanceConflict =
            appointment.startTime < maintenanceEnd && appointment.endTime > maintenanceStart;

          if (hasMaintenanceConflict) {
            await ctx.scheduler.runAfter(0, internal.resourceNotifications.sendConflictAlert, {
              resourceId,
              resourceName: resource.name,
              conflictType: "maintenance_conflict",
              affectedAppointments: [appointment._id],
              clinicId: args.clinicId,
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error checking conflicts for clinic ${args.clinicId}:`, error);
    }
  },
});

// Send maintenance alert
export const sendMaintenanceAlert = internalMutation({
  args: {
    resourceId: v.id("resources"),
    resourceName: v.string(),
    maintenanceType: v.union(v.literal("scheduled"), v.literal("urgent"), v.literal("overdue")),
    scheduledDate: v.number(),
    description: v.string(),
    clinicId: v.id("clinics"),
  },
  handler: async (ctx, args) => {
    try {
      const clinicUsers = await clinicAlertRecipients(ctx, args.clinicId);
      let alerted = 0;

      // Create notifications for each admin/physiotherapist
      for (const user of clinicUsers) {
        const repeat = await alertedToday(
          ctx,
          user._id,
          "resource_maintenance",
          (data) =>
            data.resourceId === args.resourceId &&
            data.maintenanceType === args.maintenanceType &&
            data.scheduledDate === args.scheduledDate
        );
        if (repeat) continue;

        await insertNotification(ctx, {
          userId: user._id,
          type: "resource_maintenance",
          title: getMaintenanceAlertTitle(args.maintenanceType, args.resourceName),
          message: getMaintenanceAlertMessage(args.maintenanceType, args.resourceName, args.scheduledDate),
          data: {
            resourceId: args.resourceId,
            resourceName: args.resourceName,
            maintenanceType: args.maintenanceType,
            scheduledDate: args.scheduledDate,
            clinicId: args.clinicId,
          },
          priority: args.maintenanceType === "urgent" || args.maintenanceType === "overdue" ? "high" : "medium",
          status: "pending",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        alerted++;
      }

      // Send email for urgent/overdue maintenance
      if (alerted > 0 && (args.maintenanceType === "urgent" || args.maintenanceType === "overdue")) {
        await ctx.scheduler.runAfter(0, internal.resourceNotifications.sendMaintenanceEmail, {
          clinicId: args.clinicId,
          resourceName: args.resourceName,
          maintenanceType: args.maintenanceType,
          scheduledDate: args.scheduledDate,
          description: args.description,
        });
      }
    } catch (error) {
      console.error("Error sending maintenance alert:", error);
    }
  },
});

// Send conflict alert
export const sendConflictAlert = internalMutation({
  args: {
    resourceId: v.id("resources"),
    resourceName: v.string(),
    conflictType: v.string(),
    affectedAppointments: v.array(v.id("appointments")),
    clinicId: v.id("clinics"),
  },
  handler: async (ctx, args) => {
    try {
      const clinicUsers = await clinicAlertRecipients(ctx, args.clinicId);
      const appointmentKey = [...args.affectedAppointments].sort().join(",");

      // Create notifications for each admin/physiotherapist
      for (const user of clinicUsers) {
        const repeat = await alertedToday(
          ctx,
          user._id,
          "resource_conflict",
          (data) =>
            data.resourceId === args.resourceId &&
            data.conflictType === args.conflictType &&
            [...(data.affectedAppointments ?? [])].sort().join(",") === appointmentKey
        );
        if (repeat) continue;

        await insertNotification(ctx, {
          userId: user._id,
          type: "resource_conflict",
          title: `Resource Conflict: ${args.resourceName}`,
          message: `${args.resourceName} has a ${args.conflictType.replace('_', ' ')} affecting ${args.affectedAppointments.length} appointment(s).`,
          data: {
            resourceId: args.resourceId,
            resourceName: args.resourceName,
            conflictType: args.conflictType,
            affectedAppointments: args.affectedAppointments,
            clinicId: args.clinicId,
          },
          priority: "high",
          status: "pending",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    } catch (error) {
      console.error("Error sending conflict alert:", error);
    }
  },
});

// Send maintenance email
export const sendMaintenanceEmail = internalMutation({
  args: {
    clinicId: v.id("clinics"),
    resourceName: v.string(),
    maintenanceType: v.union(v.literal("scheduled"), v.literal("urgent"), v.literal("overdue")),
    scheduledDate: v.number(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Call the email API endpoint
      const response = await fetch(`${process.env.SITE_URL}/api/emails/maintenance-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: args.clinicId,
          resourceName: args.resourceName,
          maintenanceType: args.maintenanceType,
          scheduledDate: args.scheduledDate,
          description: args.description,
        }),
      });

      if (!response.ok) {
        throw new Error(`Email API returned ${response.status}`);
      }

    } catch (error) {
      console.error("Error sending maintenance email:", error);
    }
  },
});

// Send maintenance reminders (called by cron job)
export const sendMaintenanceReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    try {
      // Active resources with maintenance in the next 24 hours
      const resources = await ctx.db.query("resources").take(5000);

      const now = Date.now();
      const next24Hours = now + DAY;

      for (const resource of resources) {
        if (!resource.isActive || !resource.maintenanceSchedule || !resource.maintenanceSchedule.nextMaintenance) {
          continue;
        }

        const maintenance = resource.maintenanceSchedule;
        if (maintenance.nextMaintenance) {
          const maintenanceTime = new Date(maintenance.nextMaintenance).getTime();

          // Send reminder for maintenance in next 24 hours
          if (maintenanceTime > now && maintenanceTime <= next24Hours) {
            await ctx.scheduler.runAfter(0, internal.resourceNotifications.sendMaintenanceAlert, {
              resourceId: resource._id,
              resourceName: resource.name,
              maintenanceType: "scheduled",
              scheduledDate: maintenanceTime,
              description: "Scheduled maintenance reminder",
              clinicId: resource.clinicId,
            });
          }
        }
      }
    } catch (error) {
      console.error("Error sending maintenance reminders:", error);
    }
  },
});

const CLEANUP_TYPES = new Set([
  "resource_maintenance",
  "resource_conflict",
  "invoice_payment_reminder",
  "appointment_reminder",
  "daily_exercise_reminder",
]);

// Cleanup old notifications (called by weekly cron job). Works through the table a page at a time.
export const cleanupOldNotifications = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    cutoffTime: v.optional(v.number()),
  },
  // Explicit return type: it schedules itself, and an inferred one would be circular (TS2589)
  handler: async (ctx, args): Promise<void> => {
    try {
      const cutoffTime = args.cutoffTime ?? Date.now() - 30 * DAY;

      const page = await ctx.db
        .query("notifications")
        .withIndex("by_created", (q) => q.lt("createdAt", cutoffTime))
        .paginate({ cursor: args.cursor ?? null, numItems: 500 });

      for (const notification of page.page) {
        if (CLEANUP_TYPES.has(notification.type)) await ctx.db.delete(notification._id);
      }

      if (!page.isDone) {
        await ctx.scheduler.runAfter(0, internal.resourceNotifications.cleanupOldNotifications, {
          cursor: page.continueCursor,
          cutoffTime,
        });
      }
    } catch (error) {
      console.error("Error cleaning up old notifications:", error);
    }
  },
});

// Helper functions
function getMaintenanceAlertTitle(maintenanceType: string, resourceName: string): string {
  switch (maintenanceType) {
    case "scheduled":
      return `Upcoming Maintenance: ${resourceName}`;
    case "urgent":
      return `🚨 Urgent Maintenance: ${resourceName}`;
    case "overdue":
      return `⚠️ Overdue Maintenance: ${resourceName}`;
    default:
      return `Maintenance Alert: ${resourceName}`;
  }
}

function getMaintenanceAlertMessage(maintenanceType: string, resourceName: string, scheduledDate: number): string {
  const dateStr = new Date(scheduledDate).toLocaleDateString();

  switch (maintenanceType) {
    case "scheduled":
      return `Scheduled maintenance for ${resourceName} is coming up on ${dateStr}. Please ensure the resource is available.`;
    case "urgent":
      return `${resourceName} requires urgent maintenance. Please address immediately to prevent service disruption.`;
    case "overdue":
      return `Maintenance for ${resourceName} was scheduled for ${dateStr} and is now overdue. Please complete as soon as possible.`;
    default:
      return `Maintenance alert for ${resourceName}.`;
  }
}
