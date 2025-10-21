import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const getAllActivePlans = internalQuery({
  handler: async (ctx) => {
    return await ctx.db
      .query("treatmentPlans")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
  },
});

export const sendDailyExerciseReminders = internalAction({
  handler: async (ctx) => {
    const activePlans = await ctx.runQuery(internal.reminders.getAllActivePlans);
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    for (const plan of activePlans) {
      try {
        let todaysExercises = 0;
        if (plan.phases) {
          for (const phase of plan.phases) {
            const exercises = (phase as any).exercises || [];
            todaysExercises += exercises.filter((ex: any) => 
              ex.frequency?.toLowerCase().includes("daily")
            ).length;
          }
        }

        if (todaysExercises > 0) {
          // Check how many reminders sent today for this patient
          const existingRemindersToday = await ctx.runQuery(
            internal.reminders.countTodaysReminders,
            { userId: plan.patientId, date: today }
          );

          // Only send if less than 3 reminders sent today
          if (existingRemindersToday < 3) {
            await ctx.runMutation(internal.notifications.core.createNotificationWithDeduplication, {
              userId: plan.patientId,
              type: "daily_reminder",
              priority: "medium",
              payload: {
                title: "Daily Exercise Reminder",
                body: `You have ${todaysExercises} exercises scheduled today`,
                link: "/dashboard/patient/treatment-plans",
                data: {
                  reminderDate: today,
                  exerciseCount: todaysExercises,
                },
              },
              deduplicationWindowMs: 23 * 60 * 60 * 1000, // 23 hours to prevent multiple per day
            });
          }
        }
      } catch (e) {
        console.error(`Failed to send reminder for plan ${plan._id}:`, e);
      }
    }
  },
});

export const countTodaysReminders = internalQuery({
  args: {
    userId: v.id("users"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const startOfDay = new Date(args.date).setHours(0, 0, 0, 0);
    const endOfDay = new Date(args.date).setHours(23, 59, 59, 999);

    const reminders = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_type", (q) =>
        q.eq("userId", args.userId).eq("type", "daily_reminder")
      )
      .filter((q) =>
        q.and(
          q.gte(q.field("createdAt"), startOfDay),
          q.lte(q.field("createdAt"), endOfDay)
        )
      )
      .collect();

    return reminders.length;
  },
});
