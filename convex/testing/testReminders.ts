// @ts-nocheck
/**
 * Testing utilities for appointment reminders
 * Use these functions to manually test the reminder system
 */

// Test helpers: internal only (run with `npx convex run testing/testReminders:<name>`).
import { internalAction as action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Manually trigger appointment reminders for testing
 * This can be called from the Convex dashboard
 */
export const triggerAppointmentReminders = action({
  handler: async (ctx) => {
    console.log("🔔 Manually triggering appointment reminders...");
    
    try {
      // Trigger the daily reminder
      const dailyResult = await ctx.runAction(
        internal.scheduled.appointment_reminders.sendDailyAppointmentReminders as any
      );
      console.log("✅ Daily reminders result:", dailyResult);

      // Trigger the interval reminder
      const intervalResult = await ctx.runAction(
        internal.reminderSystem.sendAppointmentReminders
      );
      console.log("✅ Interval reminders result:", intervalResult);

      return {
        success: true,
        dailyReminders: dailyResult,
        intervalReminders: intervalResult,
        message: "Reminders triggered successfully"
      };
    } catch (error) {
      console.error("❌ Failed to trigger reminders:", error);
      return {
        success: false,
        error: error.message || String(error)
      };
    }
  },
});

/**
 * Get upcoming appointments that should receive reminders
 */
export const checkUpcomingAppointments = action({
  handler: async (ctx) => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    console.log("📅 Checking for appointments...");
    console.log("Current time:", now.toISOString());
    console.log("Tomorrow:", tomorrow.toISOString());

    const appointments = await ctx.runQuery(internal.reminderSystem.getUpcomingAppointments);
    
    return {
      count: appointments?.length || 0,
      appointments: appointments,
      currentTime: now.toISOString(),
      tomorrowTime: tomorrow.toISOString(),
    };
  },
});

/**
 * Check reminder logs and status
 */
export const checkReminderLogs = action({
  handler: async (ctx) => {
    // Get recent notifications
    const recentNotifications = await ctx.runQuery(
      internal.testing.testReminders.getRecentReminderNotifications as any
    );

    return {
      success: true,
      recentNotifications,
      message: "Check Convex logs for detailed reminder execution history"
    };
  },
});

/**
 * Get recent reminder notifications (internal query)
 */
export const getRecentReminderNotifications = internalAction({
  handler: async (ctx) => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    
    // Note: This is a simplified version - actual implementation would query the database
    return {
      message: "Check notifications table for type='appointment_reminder'",
      timeframe: "Last 24 hours",
      cutoff: new Date(oneDayAgo).toISOString()
    };
  },
});
