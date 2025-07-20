import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// Default settings
const defaultUserSettings = {
  notifications: {
    email: {
      enabled: true,
      types: ["appointment_reminder", "appointment_cancelled", "new_patient_assignment"],
      frequency: "immediate",
    },
    push: {
      enabled: true,
      types: ["appointment_reminder", "appointment_cancelled", "message_received"],
    },
    inApp: {
      enabled: true,
      types: [
        "appointment_reminder",
        "appointment_cancelled",
        "appointment_rescheduled",
        "new_patient_assignment",
        "session_completed",
        "invoice_generated",
        "payment_received",
        "staff_invitation",
        "approval_required",
        "system_alert",
        "message_received",
      ],
      showBadge: true,
      playSound: true,
    },
    doNotDisturb: {
      enabled: false,
      startTime: "22:00",
      endTime: "08:00",
    },
  },
  preferences: {
    theme: "system",
    language: "en",
    timezone: "UTC",
    dateFormat: "YYYY-MM-DD",
    timeFormat: "24h",
  },
  privacy: {
    profileVisibility: "public",
    shareAnalytics: true,
    dataRetention: {
      messageHistory: 365, // 1 year
      activityLogs: 90,   // 3 months
    },
  },
} as const;

const defaultClinicSettings = {
  scheduling: {
    defaultAppointmentDuration: 30,
    minAdvanceBooking: 1,
    maxAdvanceBooking: 60,
    allowWaitlist: true,
    bufferBetweenAppointments: 5,
    defaultAvailability: [
      { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
      { dayOfWeek: 2, startTime: "09:00", endTime: "17:00" },
      { dayOfWeek: 3, startTime: "09:00", endTime: "17:00" },
      { dayOfWeek: 4, startTime: "09:00", endTime: "17:00" },
      { dayOfWeek: 5, startTime: "09:00", endTime: "17:00" },
    ],
  },
  business: {
    workingHours: [
      { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", isWorkingDay: true },
      { dayOfWeek: 2, startTime: "09:00", endTime: "17:00", isWorkingDay: true },
      { dayOfWeek: 3, startTime: "09:00", endTime: "17:00", isWorkingDay: true },
      { dayOfWeek: 4, startTime: "09:00", endTime: "17:00", isWorkingDay: true },
      { dayOfWeek: 5, startTime: "09:00", endTime: "17:00", isWorkingDay: true },
      { dayOfWeek: 6, startTime: "00:00", endTime: "00:00", isWorkingDay: false },
      { dayOfWeek: 0, startTime: "00:00", endTime: "00:00", isWorkingDay: false },
    ],
    holidays: [],
    timezone: "UTC",
    breakTimes: [
      {
        startTime: "12:00",
        endTime: "13:00",
        days: [1, 2, 3, 4, 5],
      },
    ],
  },
  communications: {
    automaticReminders: true,
    reminderTiming: [
      { type: "email" as const, beforeAppointment: 24 },
      { type: "sms" as const, beforeAppointment: 2 },
    ],
    allowSMS: true,
    customMessageTemplates: [],
  },
  analytics: {
    trackPatientProgress: true,
    enabledMetrics: ["appointments", "revenue", "patient_satisfaction"],
    reportSchedule: "weekly" as const,
    customMetrics: [],
  },
};

/**
 * Get user settings with defaults
 */
export const getUserSettings = query({
  args: {
    userId: v.id("users"),
  },
  returns: v.any(),
  handler: async (ctx, { userId }) => {
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    return settings || { userId, ...defaultUserSettings };
  },
});

/**
 * Update user settings
 */
export const updateUserSettings = mutation({
  args: {
    notifications: v.optional(v.object({
      email: v.object({
        enabled: v.boolean(),
        types: v.array(v.string()),
        frequency: v.union(v.literal("immediate"), v.literal("daily"), v.literal("weekly")),
      }),
      push: v.object({
        enabled: v.boolean(),
        types: v.array(v.string()),
      }),
      inApp: v.object({
        enabled: v.boolean(),
        types: v.array(v.string()),
        showBadge: v.boolean(),
        playSound: v.boolean(),
      }),
      doNotDisturb: v.object({
        enabled: v.boolean(),
        startTime: v.string(),
        endTime: v.string(),
        days: v.array(v.number()),
      }),
    })),
    preferences: v.optional(v.object({
      language: v.string(),
      timezone: v.string(),
      dateFormat: v.union(v.literal("MM/DD/YYYY"), v.literal("DD/MM/YYYY"), v.literal("YYYY-MM-DD")),
      timeFormat: v.union(v.literal("12h"), v.literal("24h")),
      theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
      autoSave: v.boolean(),
      compactView: v.boolean(),
    })),
    privacy: v.optional(v.object({
      profileVisibility: v.union(v.literal("public"), v.literal("private"), v.literal("clinic_only")),
      shareAnalytics: v.boolean(),
      allowMarketing: v.boolean(),
      dataRetention: v.object({
        messageHistory: v.number(),
        activityLogs: v.number(),
      }),
    })),
  },
  returns: v.id("settings"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    // Get existing settings
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    // Build complete settings with defaults
    const defaultNotifications = {
      email: {
        enabled: true,
        types: ["appointment_reminder", "appointment_cancelled", "new_patient_assignment"] as string[],
        frequency: "immediate" as const,
      },
      push: {
        enabled: true,
        types: ["appointment_reminder", "message_received"] as string[],
      },
      inApp: {
        enabled: true,
        types: ["all"] as string[],
        showBadge: true,
        playSound: true,
      },
      doNotDisturb: {
        enabled: false,
        startTime: "22:00",
        endTime: "08:00",
        days: [0, 6] as number[], // weekends
      },
    };

    const defaultPreferences = {
      language: "en",
      timezone: "UTC",
      dateFormat: "MM/DD/YYYY" as const,
      timeFormat: "12h" as const,
      theme: "system" as const,
      autoSave: true,
      compactView: false,
    };

    const defaultPrivacy = {
      profileVisibility: "clinic_only" as const,
      shareAnalytics: false,
      allowMarketing: false,
      dataRetention: {
        messageHistory: 365,
        activityLogs: 90,
      },
    };

    const newSettings = {
      userId: user._id,
      notifications: { ...defaultNotifications, ...args.notifications },
      preferences: { ...defaultPreferences, ...args.preferences },
      privacy: { ...defaultPrivacy, ...args.privacy },
    };

    if (existing) {
      await ctx.db.patch(existing._id, newSettings);
      return existing._id;
    }

    return await ctx.db.insert("settings", newSettings);
  },
});

/**
 * Get clinic settings with defaults
 */
export const getClinicSettings = query({
  args: {
    clinicId: v.id("clinics"),
  },
  returns: v.any(),
  handler: async (ctx, { clinicId }) => {
    const settings = await ctx.db
      .query("clinicSettings")
      .withIndex("by_clinic", (q) => q.eq("clinicId", clinicId))
      .first();

    return settings || { clinicId, ...defaultClinicSettings };
  },
});

/**
 * Update clinic settings
 */
export const updateClinicSettings = mutation({
  args: {
    clinicId: v.id("clinics"),
    scheduling: v.optional(v.object({
      defaultAppointmentDuration: v.optional(v.number()),
      minAdvanceBooking: v.optional(v.number()),
      maxAdvanceBooking: v.optional(v.number()),
      allowWaitlist: v.optional(v.boolean()),
      bufferBetweenAppointments: v.optional(v.number()),
      defaultAvailability: v.optional(v.array(v.object({
        dayOfWeek: v.number(),
        startTime: v.string(),
        endTime: v.string(),
      }))),
    })),
    business: v.optional(v.object({
      workingHours: v.optional(v.array(v.object({
        dayOfWeek: v.number(),
        startTime: v.string(),
        endTime: v.string(),
        isWorkingDay: v.boolean(),
      }))),
      holidays: v.optional(v.array(v.string())),
      timezone: v.optional(v.string()),
      breakTimes: v.optional(v.array(v.object({
        startTime: v.string(),
        endTime: v.string(),
        days: v.array(v.number()),
      }))),
    })),
    communications: v.optional(v.object({
      automaticReminders: v.optional(v.boolean()),
      reminderTiming: v.optional(v.array(v.object({
        type: v.union(v.literal("email"), v.literal("sms"), v.literal("push")),
        beforeAppointment: v.number(),
      }))),
      allowSMS: v.optional(v.boolean()),
      customMessageTemplates: v.optional(v.array(v.object({
        type: v.string(),
        subject: v.string(),
        body: v.string(),
      }))),
    })),
    analytics: v.optional(v.object({
      trackPatientProgress: v.optional(v.boolean()),
      enabledMetrics: v.optional(v.array(v.string())),
      reportSchedule: v.optional(v.union(
        v.literal("never"),
        v.literal("daily"),
        v.literal("weekly"),
        v.literal("monthly")
      )),
      customMetrics: v.optional(v.array(v.object({
        name: v.string(),
        type: v.union(v.literal("count"), v.literal("average"), v.literal("sum")),
        source: v.string(),
      }))),
    })),
  },
  handler: async (ctx, { clinicId, ...updates }) => {
    const existing = await ctx.db
      .query("clinicSettings")
      .withIndex("by_clinic", (q) => q.eq("clinicId", clinicId))
      .first();

    const currentSettings = existing || { clinicId, ...defaultClinicSettings };
    const newSettings = {
      clinicId,
      scheduling: {
        ...currentSettings.scheduling,
        ...updates.scheduling,
      },
      business: {
        ...currentSettings.business,
        ...updates.business,
        breakTimes: updates.business?.breakTimes || currentSettings.business.breakTimes,
      },
      communications: {
        ...currentSettings.communications,
        ...updates.communications,
        reminderTiming: updates.communications?.reminderTiming || currentSettings.communications.reminderTiming,
        customMessageTemplates: updates.communications?.customMessageTemplates || currentSettings.communications.customMessageTemplates,
      },
      analytics: {
        ...currentSettings.analytics,
        ...updates.analytics,
        customMetrics: updates.analytics?.customMetrics || currentSettings.analytics.customMetrics,
      },
    };

    if (existing) {
      await ctx.db.patch(existing._id, newSettings);
      return existing._id;
    }

    return await ctx.db.insert("clinicSettings", newSettings);
  },
}); 