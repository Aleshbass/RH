import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { DatabaseReader, DatabaseWriter } from './_generated/server';
import type { Doc } from './_generated/dataModel';
// AuthTokenIdentifier import removed - not available in current Convex version

/**
 * Get user settings
 */
export const getUserSettings = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.any(),
  handler: async (ctx, { userId }) => {
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    return settings || {
      notifications: {
        email: true,
        push: true,
        sms: false,
      },
      preferences: {
        theme: "light",
        language: "en",
        timezone: "UTC",
      },
      privacy: {
        profileVisibility: "public",
        shareAnalytics: true,
      },
    };
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
      }),
    })),
    preferences: v.optional(v.object({
      theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
      language: v.string(),
      timezone: v.string(),
      dateFormat: v.union(v.literal("MM/DD/YYYY"), v.literal("DD/MM/YYYY"), v.literal("YYYY-MM-DD")),
      timeFormat: v.union(v.literal("12h"), v.literal("24h")),
    })),
    privacy: v.optional(v.object({
      profileVisibility: v.union(v.literal("public"), v.literal("private"), v.literal("clinic_only")),
      shareAnalytics: v.boolean(),
      dataRetention: v.object({
        messageHistory: v.number(),
        activityLogs: v.number(),
      }),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const userId = user._id;

    // Build the full settings object with defaults
    const defaultSettings = {
      notifications: {
        email: { enabled: true, types: [], frequency: "immediate" as const },
        push: { enabled: true, types: [] },
        inApp: { enabled: true, types: [], showBadge: true, playSound: true },
        doNotDisturb: { enabled: false, startTime: "22:00", endTime: "08:00" },
      },
      preferences: {
        theme: "system" as const,
        language: "en",
        timezone: "UTC",
        dateFormat: "MM/DD/YYYY" as const,
        timeFormat: "12h" as const,
      },
      privacy: {
        profileVisibility: "public" as const,
        shareAnalytics: true,
        dataRetention: { messageHistory: 365, activityLogs: 90 },
      },
    };

    const fullSettings = {
      ...defaultSettings,
      ...args,
    };

    // Check if settings already exist
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, fullSettings);
      return existing._id;
    }

    return await ctx.db.insert("settings", {
      userId,
      ...fullSettings,
    });
  },
});

/**
 * Get clinic settings
 */
export const getClinicSettings = internalQuery({
  args: {
    clinicId: v.id("clinics"),
  },
  returns: v.any(),
  handler: async (ctx, { clinicId }) => {
    const settings = await ctx.db
      .query("clinicSettings")
      .withIndex("by_clinic", (q) => q.eq("clinicId", clinicId))
      .first();

    return settings || {
      scheduling: {
        defaultAppointmentDuration: 45,
        minAdvanceBooking: 24,
        maxAdvanceBooking: 60,
        allowWaitlist: true,
      },
      business: {
        workingHours: {
          monday: { start: "09:00", end: "17:00" },
          tuesday: { start: "09:00", end: "17:00" },
          wednesday: { start: "09:00", end: "17:00" },
          thursday: { start: "09:00", end: "17:00" },
          friday: { start: "09:00", end: "17:00" },
        },
        holidays: [],
        timezone: "UTC",
      },
      communications: {
        automaticReminders: true,
        reminderTiming: 24, // hours before appointment
        allowSMS: true,
      },
    };
  },
});

/**
 * Update clinic settings
 */
export const updateClinicSettings = mutation({
  args: {
    clinicId: v.id("clinics"),
    scheduling: v.optional(v.object({
      defaultAppointmentDuration: v.number(),
      minAdvanceBooking: v.number(),
      maxAdvanceBooking: v.number(),
      allowWaitlist: v.boolean(),
      bufferBetweenAppointments: v.optional(v.number()),
      defaultAvailability: v.optional(v.array(v.object({
        dayOfWeek: v.number(),
        startTime: v.string(),
        endTime: v.string(),
      }))),
    })),
    business: v.optional(v.object({
      workingHours: v.array(v.object({
        dayOfWeek: v.number(),
        startTime: v.string(),
        endTime: v.string(),
        isWorkingDay: v.boolean(),
      })),
      timezone: v.string(),
      holidays: v.array(v.string()),
      breakTimes: v.array(v.object({
        startTime: v.string(),
        endTime: v.string(),
        days: v.array(v.number()),
      })),
    })),
    communications: v.optional(v.object({
      automaticReminders: v.boolean(),
      reminderTiming: v.array(v.object({
        type: v.union(v.literal("email"), v.literal("sms"), v.literal("push")),
        beforeAppointment: v.number(),
      })),
      allowSMS: v.boolean(),
      customMessageTemplates: v.array(v.object({
        type: v.string(),
        subject: v.string(),
        body: v.string(),
      })),
    })),
    analytics: v.optional(v.object({
      trackPatientProgress: v.boolean(),
      enabledMetrics: v.array(v.string()),
      reportSchedule: v.union(
        v.literal("never"),
        v.literal("daily"),
        v.literal("weekly"),
        v.literal("monthly")
      ),
      customMetrics: v.array(v.object({
        name: v.string(),
        type: v.union(v.literal("count"), v.literal("average"), v.literal("sum")),
        source: v.string(),
      })),
    })),
  },
  handler: async (ctx, { clinicId, ...settings }) => {
    await ensureUserRole(ctx, ["clinic_owner", "admin"]);

    // Check if settings exist
    const existing = await ctx.db
      .query("clinicSettings")
      .withIndex("by_clinic", (q) => q.eq("clinicId", clinicId))
      .unique();

    // Build complete settings object with defaults
    const defaultScheduling = {
      defaultAppointmentDuration: 60,
      minAdvanceBooking: 24,
      maxAdvanceBooking: 168,
      allowWaitlist: true,
      bufferBetweenAppointments: 15,
      defaultAvailability: [
        { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
        { dayOfWeek: 2, startTime: "09:00", endTime: "17:00" },
        { dayOfWeek: 3, startTime: "09:00", endTime: "17:00" },
        { dayOfWeek: 4, startTime: "09:00", endTime: "17:00" },
        { dayOfWeek: 5, startTime: "09:00", endTime: "17:00" },
      ],
    };

    const defaultBusiness = {
      workingHours: [
        { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", isWorkingDay: true },
        { dayOfWeek: 2, startTime: "09:00", endTime: "17:00", isWorkingDay: true },
        { dayOfWeek: 3, startTime: "09:00", endTime: "17:00", isWorkingDay: true },
        { dayOfWeek: 4, startTime: "09:00", endTime: "17:00", isWorkingDay: true },
        { dayOfWeek: 5, startTime: "09:00", endTime: "17:00", isWorkingDay: true },
        { dayOfWeek: 6, startTime: "00:00", endTime: "00:00", isWorkingDay: false },
        { dayOfWeek: 0, startTime: "00:00", endTime: "00:00", isWorkingDay: false },
      ],
      timezone: "UTC",
      holidays: [],
      breakTimes: [
        {
          startTime: "12:00",
          endTime: "13:00",
          days: [1, 2, 3, 4, 5],
        },
      ],
    };

    const defaultCommunications = {
      automaticReminders: true,
      reminderTiming: [
        { type: "email" as const, beforeAppointment: 24 },
        { type: "sms" as const, beforeAppointment: 2 },
      ],
      allowSMS: true,
      customMessageTemplates: [
        {
          type: "appointment_reminder",
          subject: "Appointment Reminder",
          body: "You have an upcoming appointment",
        },
      ],
    };

    const defaultAnalytics = {
      trackPatientProgress: true,
      enabledMetrics: ["appointments", "patient_progress", "revenue"],
      reportSchedule: "monthly" as const,
      customMetrics: [],
    };

    const fullSettings = {
      scheduling: { ...defaultScheduling, ...settings.scheduling },
      business: { ...defaultBusiness, ...settings.business },
      communications: { ...defaultCommunications, ...settings.communications },
      analytics: { ...defaultAnalytics, ...settings.analytics },
    };

    if (existing) {
      await ctx.db.patch(existing._id, fullSettings);
      return existing._id;
    }

    return await ctx.db.insert("clinicSettings", {
      clinicId,
      ...fullSettings,
    });
  },
});

interface SettingsUser extends Doc<"users"> {
  role: "physiotherapist" | "clinic_owner" | "patient" | "family_member" | "doctor" | "admin" | "partner" | "clinic_staff" | undefined;
  clerkId: string;
}

async function ensureUserRole(
  ctx: { db: DatabaseReader; auth: any },
  allowedRoles: Array<SettingsUser["role"]>
): Promise<SettingsUser> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();

  if (!user) {
    throw new Error("User not found");
  }

  if (!user.role || !allowedRoles.includes(user.role)) {
    throw new Error("Unauthorized");
  }

  return user as SettingsUser;
} 