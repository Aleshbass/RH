import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";

export const getAllActivePlans = internalQuery({
  handler: async (ctx) => {
    return await ctx.db
      .query("treatmentPlans")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
  },
});

/**
 * Patients with an active home exercise programme (exercisePrograms) and how many exercises it
 * holds (education isn't counted). Patients who switched reminders off in their settings
 * (notificationPreferences.appointmentReminders, the same switch appointment reminders use)
 * are left out, as are accounts that are no longer patients.
 */
export const getProgrammeReminderTargets = internalQuery({
  args: {},
  handler: async (ctx) => {
    const programs = await ctx.db
      .query("exercisePrograms")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
    const counts = new Map<Id<"users">, number>();
    for (const program of programs) {
      const exercises = program.items.filter((item) => item.kind !== "education").length;
      if (exercises > 0) counts.set(program.patientId, (counts.get(program.patientId) ?? 0) + exercises);
    }
    const targets: { patientId: Id<"users">; exerciseCount: number }[] = [];
    for (const [patientId, exerciseCount] of counts) {
      const patient = await ctx.db.get(patientId);
      if (!patient || patient.role !== "patient") continue;
      if (patient.notificationPreferences?.appointmentReminders === false) continue;
      targets.push({ patientId, exerciseCount });
    }
    return targets;
  },
});

/** Patients who switched reminders off in their settings (checked for the older care-plan reminders). */
export const remindersOffFor = internalQuery({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, args) => {
    const off: Id<"users">[] = [];
    for (const userId of args.userIds) {
      const user = await ctx.db.get(userId);
      if (user?.notificationPreferences?.appointmentReminders === false) off.push(userId);
    }
    return off;
  },
});

export const sendDailyExerciseReminders = internalAction({
  handler: async (ctx): Promise<void> => {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    // 1. Home exercise programmes (these replaced care-plan exercises)
    const reminded = new Set<string>();
    const targets: { patientId: Id<"users">; exerciseCount: number }[] = await ctx.runQuery(
      internal.reminders.getProgrammeReminderTargets,
      {}
    );
    for (const target of targets) {
      try {
        const existingRemindersToday: number = await ctx.runQuery(internal.reminders.countTodaysReminders, {
          userId: target.patientId,
          date: today,
        });
        if (existingRemindersToday >= 3) continue;
        await ctx.runMutation(internal.notifications.core.createNotificationWithDeduplication, {
          userId: target.patientId,
          type: "daily_reminder",
          priority: "medium",
          payload: {
            title: "Time for your home exercises",
            body: `You have ${target.exerciseCount} exercise${target.exerciseCount === 1 ? "" : "s"} in your programme today. Log each one so your physio can see how it's going.`,
            link: "/dashboard/patient/exercises",
            data: {
              actionUrl: "/dashboard/patient/exercises",
              reminderDate: today,
              exerciseCount: target.exerciseCount,
            },
          },
          deduplicationWindowMs: 23 * 60 * 60 * 1000, // 23 hours to prevent multiple per day
        });
        reminded.add(target.patientId);
      } catch (e) {
        console.error(`Failed to send programme reminder for patient ${target.patientId}:`, e);
      }
    }

    // 2. Older care-plan exercises, for patients without a home programme reminder today
    const allPlans: Doc<"treatmentPlans">[] = await ctx.runQuery(internal.reminders.getAllActivePlans);
    const activePlans = allPlans.filter((plan) => !reminded.has(plan.patientId));
    const optedOutIds: Id<"users">[] = activePlans.length
      ? await ctx.runQuery(internal.reminders.remindersOffFor, {
          userIds: [...new Set(activePlans.map((plan) => plan.patientId))],
        })
      : [];
    const optedOut = new Set<string>(optedOutIds);

    for (const plan of activePlans) {
      if (optedOut.has(plan.patientId)) continue;
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
