import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { ensureUserRole } from "../auth";

// Analytics event types
const AnalyticsEventTypes = {
  // User events
  USER_LOGIN: "user_login",
  USER_LOGOUT: "user_logout",
  USER_SIGNUP: "user_signup",
  USER_SETTINGS_UPDATE: "user_settings_update",

  // Appointment events
  APPOINTMENT_CREATED: "appointment_created",
  APPOINTMENT_UPDATED: "appointment_updated",
  APPOINTMENT_CANCELLED: "appointment_cancelled",
  APPOINTMENT_COMPLETED: "appointment_completed",

  // Patient events
  PATIENT_CREATED: "patient_created",
  PATIENT_UPDATED: "patient_updated",
  PATIENT_ARCHIVED: "patient_archived",

  // Treatment events
  TREATMENT_STARTED: "treatment_started",
  TREATMENT_UPDATED: "treatment_updated",
  TREATMENT_COMPLETED: "treatment_completed",

  // Notification events
  NOTIFICATION_SENT: "notification_sent",
  NOTIFICATION_DELIVERED: "notification_delivered",
  NOTIFICATION_FAILED: "notification_failed",

  // System events
  API_ERROR: "api_error",
  SYSTEM_ERROR: "system_error",
  PERFORMANCE_METRIC: "performance_metric",
} as const;

type AnalyticsEventType = typeof AnalyticsEventTypes[keyof typeof AnalyticsEventTypes];

interface SystemMetrics {
  database: {
    totalDocuments: number;
    queryPerformance: number;
    indexEfficiency: number;
    storageUsed: number;
  };
  api: {
    averageResponseTime: number;
    requestsPerMinute: number;
    errorRate: number;
    activeConnections: number;
  };
  notifications: {
    totalSent: number;
    queueSize: number;
    deliveryRate: number;
    failureRate: number;
  };
}

interface PlatformAnalytics {
  systemHealth: {
    uptime: number;
    responseTime: number;
    errorRate: number;
    notificationDeliveryRate: number;
  };
  userMetrics: {
    totalUsers: number;
    activeUsers: number;
    newUsers: number;
  };
  appointmentMetrics: {
    totalAppointments: number;
    completedAppointments: number;
    cancelledAppointments: number;
    noShowRate: number;
  };
  clinicMetrics: {
    totalClinics: number;
    activeClinics: number;
    averagePatientLoad: number;
  };
}

/**
 * Track an analytics event
 */
export const trackEvent = internalMutation({
  args: {
    type: v.string(),
    userId: v.optional(v.id("users")),
    clinicId: v.optional(v.id("clinics")),
    metadata: v.optional(v.object({
      path: v.optional(v.string()),
      duration: v.optional(v.number()),
      error: v.optional(v.string()),
      status: v.optional(v.string()),
      details: v.optional(v.any()),
    })),
  },
  handler: async (ctx, { type, userId, clinicId, metadata }) => {
    const event = {
      type,
      userId,
      clinicId,
      metadata: {
        path: metadata?.path,
        duration: metadata?.duration,
        error: metadata?.error,
        status: metadata?.status,
        details: metadata?.details,
      },
      timestamp: Date.now(),
    };

    return await ctx.db.insert("analytics_events", event);
  },
});

/**
 * Get system metrics
 */
export const getSystemMetrics = internalQuery({
  args: {},
  handler: async (ctx): Promise<SystemMetrics> => {
    // Get database metrics (mock data for now)
    const users = await ctx.db.query("users").collect();
    const clinics = await ctx.db.query("clinics").collect();
    const appointments = await ctx.db.query("appointments").collect();
    const notifications = await ctx.db.query("notifications").collect();

    const totalDocs = users.length + clinics.length + appointments.length + notifications.length;

    // Get API metrics from recent analytics events
    const apiEvents = await ctx.db
      .query("analytics_events")
      .filter(q => q.eq(q.field("type"), "performance_metric"))
      .order("desc")
      .take(100);

    const apiResponseTimes = apiEvents
      .filter(e => e.metadata?.duration)
      .map(e => e.metadata.duration as number);

    const avgResponseTime = apiResponseTimes.length > 0
      ? apiResponseTimes.reduce((sum, time) => sum + time, 0) / apiResponseTimes.length
      : 150; // Default response time

    // Get notification metrics
    const notificationEvents = await ctx.db
      .query("analytics_events")
      .filter(q =>
        q.or(
          q.eq(q.field("type"), "notification_sent"),
          q.eq(q.field("type"), "notification_delivered"),
          q.eq(q.field("type"), "notification_failed")
        )
      )
      .order("desc")
      .take(1000);

    const totalSent = notificationEvents.filter(e => e.type === "notification_sent").length;
    const delivered = notificationEvents.filter(e => e.type === "notification_delivered").length;
    const failed = notificationEvents.filter(e => e.type === "notification_failed").length;

    const pendingNotifications = notifications.filter(n => n.status === "pending");

    return {
      database: {
        totalDocuments: totalDocs,
        queryPerformance: 95, // Mock value
        indexEfficiency: 98, // Mock value
        storageUsed: totalDocs * 1024, // Mock storage calculation
      },
      api: {
        averageResponseTime: avgResponseTime,
        requestsPerMinute: apiEvents.length, // Simplified calculation
        errorRate: apiEvents.length > 0 ? (apiEvents.filter(e => e.metadata?.error).length / apiEvents.length * 100) : 0,
        activeConnections: 0, // Mock value
      },
      notifications: {
        totalSent,
        queueSize: pendingNotifications.length,
        deliveryRate: totalSent > 0 ? (delivered / totalSent) * 100 : 100,
        failureRate: totalSent > 0 ? (failed / totalSent) * 100 : 0,
      },
    };
  },
});

/**
 * Get platform analytics
 */
export const getPlatformAnalytics = internalQuery({
  args: {
    timeframe: v.union(
      v.literal("day"),
      v.literal("week"),
      v.literal("month"),
      v.literal("year")
    ),
  },
  handler: async (ctx, { timeframe }): Promise<PlatformAnalytics> => {
    const now = Date.now();
    const timeframeMs = {
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000,
    }[timeframe];

    const startTime = now - timeframeMs;

    // Get user metrics
    const userEvents = await ctx.db
      .query("analytics_events")
      .filter(q =>
        q.and(
          q.gte(q.field("timestamp"), startTime),
          q.or(
            q.eq(q.field("type"), "user_login"),
            q.eq(q.field("type"), "user_signup")
          )
        )
      )
      .collect();

    const uniqueUsers = new Set(userEvents.map(e => e.userId));
    const newUsers = userEvents.filter(e => e.type === "user_signup").length;

    // Get appointment metrics
    const appointmentEvents = await ctx.db
      .query("analytics_events")
      .filter(q =>
        q.and(
          q.gte(q.field("timestamp"), startTime),
          q.or(
            q.eq(q.field("type"), "appointment_completed"),
            q.eq(q.field("type"), "appointment_cancelled")
          )
        )
      )
      .collect();

    const completed = appointmentEvents.filter(e => e.type === "appointment_completed").length;
    const cancelled = appointmentEvents.filter(e => e.type === "appointment_cancelled").length;
    const total = completed + cancelled;

    // Get clinic metrics
    const clinicEvents = await ctx.db
      .query("analytics_events")
      .filter(q =>
        q.and(
          q.gte(q.field("timestamp"), startTime),
          q.eq(q.field("type"), "appointment_completed")
        )
      )
      .collect();

    const uniqueClinics = new Set(clinicEvents.map(e => e.clinicId).filter(Boolean));
    const activeClinics = uniqueClinics.size;
    const totalAppointments = clinicEvents.length;

    return {
      systemHealth: {
        uptime: 99.9, // TODO: Implement actual uptime tracking
        responseTime: 150, // TODO: Implement actual response time tracking
        errorRate: 0.1, // TODO: Implement actual error rate tracking
        notificationDeliveryRate: 99.5, // TODO: Implement actual delivery rate tracking
      },
      userMetrics: {
        totalUsers: (await ctx.db.query("users").collect()).length,
        activeUsers: uniqueUsers.size,
        newUsers,
      },
      appointmentMetrics: {
        totalAppointments: total,
        completedAppointments: completed,
        cancelledAppointments: cancelled,
        noShowRate: total > 0 ? (cancelled / total) * 100 : 0,
      },
      clinicMetrics: {
        totalClinics: (await ctx.db.query("clinics").collect()).length,
        activeClinics,
        averagePatientLoad: activeClinics > 0 ? totalAppointments / activeClinics : 0,
      },
    };
  },
});

/**
 * Get clinic analytics
 */
export const getClinicAnalytics = internalQuery({
  args: {
    clinicId: v.id("clinics"),
    timeframe: v.union(
      v.literal("day"),
      v.literal("week"),
      v.literal("month"),
      v.literal("year")
    ),
  },
  handler: async (ctx, { clinicId, timeframe }) => {
    const now = Date.now();
    const timeframeMs = {
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000,
    }[timeframe];

    const startTime = now - timeframeMs;

    // Get clinic settings to check which metrics to track
    const settings = await ctx.db
      .query("clinicSettings")
      .withIndex("by_clinic", q => q.eq("clinicId", clinicId))
      .first();

    if (!settings?.analytics?.trackPatientProgress) {
      return null;
    }

    const enabledMetrics = settings.analytics.enabledMetrics;

    // Get all relevant events for this clinic
    const events = await ctx.db
      .query("analytics_events")
      .withIndex("by_clinic_and_timestamp", q =>
        q.eq("clinicId", clinicId).gte("timestamp", startTime)
      )
      .collect();

    // Process events based on enabled metrics
    const metrics: Record<string, number> = {};

    for (const metric of enabledMetrics) {
      switch (metric) {
        case "appointments":
          metrics.totalAppointments = events.filter(e =>
            e.type === "appointment_created" ||
            e.type === "appointment_completed" ||
            e.type === "appointment_cancelled"
          ).length;
          break;

        case "revenue":
          metrics.totalRevenue = events
            .filter(e => e.type === "appointment_completed")
            .reduce((sum, e) => sum + (e.metadata?.details?.revenue || 0), 0);
          break;

        case "patient_satisfaction":
          const ratings = events
            .filter(e => e.type === "appointment_completed" && e.metadata?.details?.rating)
            .map(e => e.metadata.details.rating as number);
          metrics.averageSatisfaction = ratings.length > 0
            ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
            : 0;
          break;
      }
    }

    // Process custom metrics if any
    if (settings.analytics.customMetrics) {
      for (const customMetric of settings.analytics.customMetrics) {
        const relevantEvents = events.filter(e => e.type === customMetric.source);

        switch (customMetric.type) {
          case "count":
            metrics[customMetric.name] = relevantEvents.length;
            break;

          case "average":
            const values = relevantEvents
              .map(e => e.metadata?.details?.[customMetric.name] as number)
              .filter(v => typeof v === "number");
            metrics[customMetric.name] = values.length > 0
              ? values.reduce((sum, v) => sum + v, 0) / values.length
              : 0;
            break;

          case "sum":
            metrics[customMetric.name] = relevantEvents
              .reduce((sum, e) => sum + ((e.metadata?.details?.[customMetric.name] as number) || 0), 0);
            break;
        }
      }
    }

    return metrics;
  },
});

/**
 * Get system health metrics
 */
export const getSystemHealth = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Get basic system metrics without using non-existent _stats table
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    // Get recent events for system health assessment
    const recentEvents = await ctx.db
      .query("analytics_events")
      .filter(q => q.gte(q.field("timestamp"), oneHourAgo))
      .collect();

    const errorEvents = recentEvents.filter(e => e.metadata?.error);
    const totalEvents = recentEvents.length;
    const errorRate = totalEvents > 0 ? (errorEvents.length / totalEvents) * 100 : 0;

    // Get pending notifications as queue size
    const pendingNotifications = await ctx.db
      .query("notifications")
      .filter(q => q.eq(q.field("status"), "pending"))
      .collect();

    return {
      status: errorRate < 5 ? "healthy" : errorRate < 20 ? "degraded" : "unhealthy",
      metrics: {
        errorRate,
        queueSize: pendingNotifications.length,
        responseTime: 120, // Mock value
        uptime: 99.8, // Mock value
      },
      components: {
        database: {
          status: "healthy" as const,
          metrics: {
            latency: 50,
            errorRate: 0.01,
            throughput: 1000,
          },
        },
        api: {
          status: "healthy" as const,
          metrics: {
            requestRate: 500,
            errorRate: 0.02,
            responseTime: 120,
          },
        },
        notifications: {
          status: "healthy" as const,
          metrics: {
            deliveryRate: 98.5,
            failureRate: 1.5,
            queueSize: pendingNotifications.length,
          },
        },
      },
    };
  },
});

/**
 * Get user activity logs (admin dashboard only)
 */
export const getUserActivityLogs = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.object({
    _id: v.id("analytics_events"),
    userId: v.optional(v.id("users")),
    activity: v.string(),
    userName: v.string(),
    userRole: v.string(),
    userEmail: v.optional(v.string()),
    timestamp: v.number(),
    metadata: v.any(),
    ipAddress: v.any(),
  })),
  handler: async (ctx, { limit = 50 }) => {
    await ensureUserRole(ctx, ["admin"]);
    // Get recent analytics events as activity logs
    const events = await ctx.db
      .query("analytics_events")
      .withIndex("by_timestamp")
      .order("desc")
      .take(Math.min(Math.max(1, Math.floor(limit) || 50), 500));

    // Transform events into activity log format
    return Promise.all(events.map(async (event) => {
      let userName = "System";
      let userRole = "unknown";
      let userEmail: string | undefined = undefined;

      if (event.userId) {
        const user = await ctx.db.get(event.userId);
        if (user) {
          userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown User';
          userRole = user.role || 'unknown';
          userEmail = user.email;
        }
      }

      return {
        _id: event._id,
        userId: event.userId,
        activity: event.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        userName: userName,
        userRole: userRole,
        userEmail: userEmail,
        timestamp: event.timestamp,
        metadata: event.metadata?.details || {},
        ipAddress: (event.metadata as any)?.ipAddress,
      };
    }));
  },
}); 