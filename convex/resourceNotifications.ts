import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal, api } from "./_generated/api";

// Check maintenance for all clinics (called by daily cron job)
export const checkAllClinicsMaintenanceDaily = internalMutation({
  args: {},
  handler: async (ctx) => {
    try {
      // Get all active clinics
      const clinics = await ctx.db.query("clinics").collect();
      
      for (const clinic of clinics) {
        await ctx.scheduler.runAfter(0, internal.resourceNotifications.checkClinicMaintenance, {
          clinicId: clinic._id,
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

      // Get all active clinics
      const clinics = await ctx.db.query("clinics").collect();
      
      for (const clinic of clinics) {
        await ctx.scheduler.runAfter(0, internal.resourceNotifications.checkClinicConflicts, {
          clinicId: clinic._id,
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
      // Get all active resources for this clinic
      const resources = await ctx.db
        .query("resources")
        .filter((q) => 
          q.and(
            q.eq(q.field("clinicId"), args.clinicId),
            q.eq(q.field("isActive"), true)
          )
        )
        .collect();

      const now = Date.now();
      const oneWeekFromNow = now + (7 * 24 * 60 * 60 * 1000);

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
      // Get upcoming appointments for the next 7 days
      const startTime = Date.now();
      const endTime = startTime + (7 * 24 * 60 * 60 * 1000);

      const appointments = await ctx.db
        .query("appointments")
        .filter((q) => 
          q.and(
            q.eq(q.field("clinicId"), args.clinicId),
            q.gte(q.field("startTime"), startTime),
            q.lte(q.field("startTime"), endTime),
            q.neq(q.field("status"), "cancelled")
          )
        )
        .collect();

      // Get all active resources for this clinic
      const resources = await ctx.db
        .query("resources")
        .filter((q) => 
          q.and(
            q.eq(q.field("clinicId"), args.clinicId),
            q.eq(q.field("isActive"), true)
          )
        )
        .collect();

      for (const appointment of appointments) {
        if (!appointment.selectedResources || appointment.selectedResources.length === 0) {
          continue;
        }

        for (const resourceId of appointment.selectedResources) {
          const resource = resources.find(r => r._id === resourceId);
          if (!resource) continue;

          // Check for maintenance conflicts
          let hasMaintenanceConflict = false;
          if (resource.maintenanceSchedule?.nextMaintenance) {
            const maintenanceStart = new Date(resource.maintenanceSchedule.nextMaintenance).getTime();
            // Assume 2 hour maintenance window
            const maintenanceEnd = maintenanceStart + (2 * 60 * 60 * 1000);
            hasMaintenanceConflict = (
              appointment.startTime < maintenanceEnd &&
              appointment.endTime > maintenanceStart
            );
          }

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
      // Get clinic admin users
      const clinicUsers = await ctx.db
        .query("users")
        .filter((q) => 
          q.and(
            q.eq(q.field("clinicId"), args.clinicId),
            q.or(
              q.eq(q.field("role"), "admin"),
              q.eq(q.field("role"), "physiotherapist")
            )
          )
        )
        .collect();

      // Create notifications for each admin/physiotherapist
      for (const user of clinicUsers) {
        await ctx.db.insert("notifications", {
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
      }

      // Send email for urgent/overdue maintenance
      if (args.maintenanceType === "urgent" || args.maintenanceType === "overdue") {
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
      // Get clinic admin users
      const clinicUsers = await ctx.db
        .query("users")
        .filter((q) => 
          q.and(
            q.eq(q.field("clinicId"), args.clinicId),
            q.or(
              q.eq(q.field("role"), "admin"),
              q.eq(q.field("role"), "physiotherapist")
            )
          )
        )
        .collect();

      // Create notifications for each admin/physiotherapist
      for (const user of clinicUsers) {
        await ctx.db.insert("notifications", {
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
      // Get all active resources with upcoming maintenance (next 24 hours)
      const resources = await ctx.db
        .query("resources")
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();

      const now = Date.now();
      const next24Hours = now + (24 * 60 * 60 * 1000);

      for (const resource of resources) {
        if (!resource.maintenanceSchedule || !resource.maintenanceSchedule.nextMaintenance) {
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

// Cleanup old notifications (called by weekly cron job)
export const cleanupOldNotifications = internalMutation({
  args: {},
  handler: async (ctx) => {
    try {
      const cutoffTime = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days ago
      
      const oldNotifications = await ctx.db
        .query("notifications")
        .filter((q) => 
          q.and(
            q.or(
              q.eq(q.field("type"), "resource_maintenance"),
              q.eq(q.field("type"), "resource_conflict"),
              q.eq(q.field("type"), "invoice_payment_reminder"),
              q.eq(q.field("type"), "appointment_reminder"),
              q.eq(q.field("type"), "daily_exercise_reminder")
            ),
            q.lt(q.field("createdAt"), cutoffTime)
          )
        )
        .collect();

      for (const notification of oldNotifications) {
        await ctx.db.delete(notification._id);
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
