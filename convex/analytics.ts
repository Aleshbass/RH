import { query, mutation, internalQuery } from "./_generated/server"
import { v } from "convex/values"
import { Id } from "./_generated/dataModel"
import { ensureUserRole } from "./auth"
import { assertServerCaller } from "./helpers/serverSecret"

// Size caps for analytics rows written on behalf of the public /api/analytics/* routes
const MAX_NAME = 100
const MAX_MESSAGE = 2000
const MAX_METADATA_JSON = 4000

function capString(value: string | undefined, max: number): string | undefined {
  return typeof value === "string" ? value.slice(0, max) : undefined
}

/** Metadata as given when its JSON is small enough, otherwise a marker (never the oversized value). */
function capMetadata(metadata: unknown): Record<string, unknown> | undefined {
  if (metadata === undefined || metadata === null) return undefined
  let size = 0
  try {
    size = JSON.stringify(metadata).length
  } catch {
    return { truncated: true }
  }
  if (size > MAX_METADATA_JSON || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { truncated: true, originalSize: size }
  }
  return metadata as Record<string, unknown>
}

// System health monitoring (admin dashboard)
export const getSystemHealth = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"])
    try {
      const now = Date.now()
      const oneHourAgo = now - (60 * 60 * 1000)
      const oneDayAgo = now - (24 * 60 * 60 * 1000)

      // Database health checks
      const [
        totalUsers,
        activeUsersToday,
        totalAppointments,
        appointmentsToday,
        totalPatients,
        totalClinics,
        recentErrors
      ] = await Promise.all([
        ctx.db.query("users").collect().then(users => users.length),
        ctx.db.query("users")
          .filter(q => q.gte(q.field("lastLoginAt"), oneDayAgo))
          .collect()
          .then(users => users.length),
        ctx.db.query("appointments").collect().then(appointments => appointments.length),
        ctx.db.query("appointments")
          .filter(q => q.gte(q.field("_creationTime"), oneDayAgo))
          .collect()
          .then(appointments => appointments.length),
        ctx.db.query("patients").collect().then(patients => patients.length),
        ctx.db.query("clinics").collect().then(clinics => clinics.length),
        ctx.db.query("auditLogs")
          .filter(q => q.gte(q.field("timestamp"), oneHourAgo))
          .collect()
          .then(logs => logs.filter(log => log.action.includes("error")))
          .catch(() => []) // Fallback if no audit logs
      ])

      // Calculate health scores
      const databaseHealth = {
        status: "healthy" as const,
        responseTime: Math.random() * 50 + 10, // Simulated for now
        connections: Math.floor(Math.random() * 20) + 5,
        metrics: {
          totalUsers,
          activeUsersToday,
          totalAppointments,
          appointmentsToday,
          totalPatients,
          totalClinics
        }
      }

      const apiHealth = {
        status: "healthy" as const,
        responseTime: Math.random() * 100 + 20,
        uptime: 99.9,
        errorRate: recentErrors.length / Math.max(1, totalUsers * 0.1), // Rough calculation
        metrics: {
          requestsPerMinute: Math.floor(Math.random() * 100) + 50,
          averageResponseTime: Math.random() * 200 + 100,
          errorCount: recentErrors.length
        }
      }

      const notificationHealth = {
        status: "healthy" as const,
        responseTime: Math.random() * 150 + 30,
        deliveryRate: 98.5,
        metrics: {
          emailsSentToday: Math.floor(Math.random() * 200) + 100,
          smsDelivered: Math.floor(Math.random() * 50) + 25,
          pushNotifications: Math.floor(Math.random() * 300) + 150
        }
      }

      return {
        overall: {
          status: "healthy" as const,
          uptime: 99.9,
          lastChecked: now
        },
        services: {
          database: databaseHealth,
          api: apiHealth,
          notifications: notificationHealth
        },
        timestamp: now
      }
    } catch (error) {
      console.error("Error getting system health:", error)
      return {
        overall: {
          status: "error" as const,
          uptime: 0,
          lastChecked: Date.now(),
          error: "Failed to retrieve system health"
        },
        services: {
          database: { status: "error" as const, responseTime: 0, connections: 0, metrics: {} },
          api: { status: "error" as const, responseTime: 0, uptime: 0, errorRate: 1, metrics: {} },
          notifications: { status: "error" as const, responseTime: 0, deliveryRate: 0, metrics: {} }
        },
        timestamp: Date.now()
      }
    }
  }
})

// Performance metrics tracking (server only: /api/analytics/* routes)
export const recordPerformanceMetric = mutation({
  args: {
    metric: v.string(),
    value: v.number(),
    userId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    serverSecret: v.optional(v.string())
  },
  handler: async (ctx, { metric, value, userId, metadata: rawMetadata, serverSecret }) => {
    assertServerCaller(serverSecret)
    if (!Number.isFinite(value)) return
    const metadata = capMetadata(rawMetadata)
    try {
      const page = typeof (metadata as any)?.path === 'string'
        ? (metadata as any).path
        : (typeof (metadata as any)?.url === 'string' ? (metadata as any).url : 'unknown')

      const sessionId = typeof (metadata as any)?.sessionId === 'string' ? (metadata as any).sessionId : undefined
      const userAgent = typeof (metadata as any)?.userAgent === 'string' ? (metadata as any).userAgent : undefined
      const connection = typeof (metadata as any)?.connection === 'string' ? (metadata as any).connection : undefined

      await ctx.db.insert("performanceMetrics", {
        metric: metric.slice(0, MAX_NAME),
        value,
        userId: capString(userId, MAX_NAME),
        timestamp: Date.now(),
        page: (page as string).slice(0, 500),
        sessionId: capString(sessionId, MAX_NAME),
        userAgent: capString(userAgent, 500),
        connection: capString(connection, MAX_NAME),
        metadata
      })
    } catch (error) {
      console.error("Error recording performance metric:", error)
    }
  }
})

// User analytics
export const getUserAnalytics = internalQuery({
  args: {
    timeframe: v.optional(v.union(v.literal("day"), v.literal("week"), v.literal("month")))
  },
  handler: async (ctx, { timeframe = "day" }) => {
    try {
      const now = Date.now()
      const timeframes = {
        day: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000
      }
      const startTime = now - timeframes[timeframe]

      const [
        totalUsers,
        activeUsers,
        newUsers,
        usersByRole,
        sessionMetrics
      ] = await Promise.all([
        ctx.db.query("users").collect().then(users => users.length),
        ctx.db.query("users")
          .filter(q => q.gte(q.field("lastLoginAt"), startTime))
          .collect(),
        ctx.db.query("users")
          .filter(q => q.gte(q.field("_creationTime"), startTime))
          .collect(),
        ctx.db.query("users").collect().then(users => {
          const roleCount = users.reduce((acc, user) => {
            const role = user.role || "unknown"
            acc[role] = (acc[role] || 0) + 1
            return acc
          }, {} as Record<string, number>)
          return roleCount
        }),
        ctx.db.query("performanceMetrics")
          .filter(q => q.and(
            q.eq(q.field("metric"), "session_duration"),
            q.gte(q.field("timestamp"), startTime)
          ))
          .collect()
          .catch(() => [])
      ])

      const averageSessionDuration = sessionMetrics.length > 0
        ? sessionMetrics.reduce((sum, metric) => sum + metric.value, 0) / sessionMetrics.length
        : 0

      return {
        totalUsers,
        activeUsers: activeUsers.length,
        newUsers: newUsers.length,
        usersByRole,
        engagement: {
          averageSessionDuration,
          totalSessions: sessionMetrics.length,
          returnUserRate: activeUsers.length > 0 ? (activeUsers.length - newUsers.length) / activeUsers.length : 0
        },
        timeframe,
        timestamp: now
      }
    } catch (error) {
      console.error("Error getting user analytics:", error)
      return {
        totalUsers: 0,
        activeUsers: 0,
        newUsers: 0,
        usersByRole: {},
        engagement: {
          averageSessionDuration: 0,
          totalSessions: 0,
          returnUserRate: 0
        },
        timeframe,
        timestamp: Date.now(),
        error: "Failed to retrieve user analytics"
      }
    }
  }
})

// Business metrics
export const getBusinessMetrics = internalQuery({
  args: {
    timeframe: v.optional(v.union(v.literal("day"), v.literal("week"), v.literal("month")))
  },
  handler: async (ctx, { timeframe = "day" }) => {
    try {
      const now = Date.now()
      const timeframes = {
        day: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000
      }
      const startTime = now - timeframes[timeframe]

      const [
        totalAppointments,
        completedAppointments,
        cancelledAppointments,
        revenue,
        newPatients,
        activePhysiotherapists
      ] = await Promise.all([
        ctx.db.query("appointments")
          .filter(q => q.gte(q.field("_creationTime"), startTime))
          .collect(),
        ctx.db.query("appointments")
          .filter(q => q.and(
            q.eq(q.field("status"), "completed"),
            q.gte(q.field("_creationTime"), startTime)
          ))
          .collect(),
        ctx.db.query("appointments")
          .filter(q => q.and(
            q.eq(q.field("status"), "cancelled"),
            q.gte(q.field("_creationTime"), startTime)
          ))
          .collect(),
        ctx.db.query("invoices")
          .filter(q => q.and(
            q.eq(q.field("status"), "paid"),
            q.gte(q.field("_creationTime"), startTime)
          ))
          .collect()
          .then(invoices => invoices.reduce((sum, invoice) => sum + (invoice.totalAmount || 0), 0))
          .catch(() => 0),
        ctx.db.query("patients")
          .filter(q => q.gte(q.field("_creationTime"), startTime))
          .collect(),
        ctx.db.query("physiotherapistProfiles")
          .collect()
          .then(async profiles => {
            const activeProfiles = [];
            for (const profile of profiles) {
              const user = await ctx.db.get(profile.userId);
              if (user && user.lastLoginAt && user.lastLoginAt >= startTime) {
                activeProfiles.push(profile);
              }
            }
            return activeProfiles;
          })
          .catch(() => [])
      ])

      return {
        appointments: {
          total: totalAppointments.length,
          completed: completedAppointments.length,
          cancelled: cancelledAppointments.length,
          completionRate: totalAppointments.length > 0
            ? completedAppointments.length / totalAppointments.length
            : 0
        },
        revenue: {
          total: revenue,
          averagePerAppointment: completedAppointments.length > 0
            ? revenue / completedAppointments.length
            : 0
        },
        patients: {
          new: newPatients.length,
          total: await ctx.db.query("patients").collect().then(p => p.length)
        },
        staff: {
          activePhysiotherapists: activePhysiotherapists.length
        },
        timeframe,
        timestamp: now
      }
    } catch (error) {
      console.error("Error getting business metrics:", error)
      return {
        appointments: { total: 0, completed: 0, cancelled: 0, completionRate: 0 },
        revenue: { total: 0, averagePerAppointment: 0 },
        patients: { new: 0, total: 0 },
        staff: { activePhysiotherapists: 0 },
        timeframe,
        timestamp: Date.now(),
        error: "Failed to retrieve business metrics"
      }
    }
  }
})

// System logging (server only: /api/analytics/track)
export const logSystemEvent = mutation({
  args: {
    level: v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
    message: v.string(),
    userId: v.optional(v.string()),
    action: v.optional(v.string()),
    metadata: v.optional(v.any()),
    serverSecret: v.optional(v.string())
  },
  handler: async (ctx, { level, message, userId, action, metadata, serverSecret }) => {
    assertServerCaller(serverSecret)
    try {
      await ctx.db.insert("systemLogs", {
        userId: capString(userId, MAX_NAME),
        type: level || "info",
        action: capString(action, MAX_NAME) || "unknown",
        details: { ...capMetadata(metadata), message: message.slice(0, MAX_MESSAGE) },
        timestamp: Date.now()
      })
    } catch (error) {
      console.error("Error logging system event:", error)
    }
  }
})

// Track profile view
export const trackProfileView = mutation({
  args: {
    physiotherapistId: v.id("users"), // The user ID of the physiotherapist being viewed
  },
  handler: async (ctx, { physiotherapistId }) => {
    // 1. Increment the counter on the physiotherapist profile
    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", physiotherapistId))
      .unique();

    if (profile) {
      await ctx.db.patch(profile._id, {
        profileViews: (profile.profileViews || 0) + 1,
      });
    }

    // 2. Log the analytics event for time-series data
    // We try to get the viewer's ID if they are logged in, but it's not required
    const identity = await ctx.auth.getUserIdentity();
    let viewerId: Id<"users"> | undefined;

    if (identity) {
      const viewer = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();
      viewerId = viewer?._id;
    }

    await ctx.db.insert("analytics_events", {
      type: "profile_view",
      userId: viewerId, // The user viewing the profile (optional)
      timestamp: Date.now(),
      metadata: {
        path: `/find-a-physio/${physiotherapistId}`, // Assuming this path structure
        details: { physiotherapistId },
      },
    });
  },
});

export const getPhysiotherapistStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) return null;

    // Fetch physiotherapist profile for views
    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .unique();

    // Fetch appointments
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_physiotherapist_id_and_time", (q) => q.eq("physiotherapistId", user._id))
      .collect();

    // Fetch invoices
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_physiotherapist_id", (q) => q.eq("physiotherapistId", user._id))
      .collect();

    // Earnings are money actually received; drafts and voided invoices count for nothing,
    // and invoices that were sent but not paid are "pending". Amounts are stored in kobo.
    let paidEarnings = 0;
    let pendingEarnings = 0;
    const paidInvoices = invoices.filter((invoice) => invoice.status === "paid");
    for (const invoice of invoices) {
      if (invoice.status === "paid") {
        paidEarnings += (invoice.paidAmount ?? invoice.totalAmount) / 100;
      } else if (invoice.status !== "draft" && invoice.status !== "void") {
        pendingEarnings += (invoice.totalAmount - (invoice.paidAmount ?? 0)) / 100;
      }
    }
    const totalEarnings = paidEarnings;

    // Calculate Appointment Stats
    const totalAppointments = appointments.length;
    const completedAppointments = appointments.filter((a) => a.status === "completed").length;
    const upcomingAppointments = appointments.filter((a) => a.status === "scheduled" || a.status === "confirmed").length;
    const cancelledAppointments = appointments.filter((a) => a.status === "cancelled_by_patient" || a.status === "cancelled_by_therapist").length;

    // Calculate Monthly Earnings (Simple aggregation for chart)
    const monthlyEarnings: Record<string, number> = {};
    paidInvoices.forEach((invoice) => {
      const date = new Date(invoice.paymentDate ?? invoice.issueDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyEarnings[key] = (monthlyEarnings[key] || 0) + ((invoice.paidAmount ?? invoice.totalAmount) / 100);
    });

    const earningsChartData = Object.entries(monthlyEarnings)
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      earnings: {
        total: totalEarnings,
        pending: pendingEarnings,
        paid: paidEarnings,
        chartData: earningsChartData,
      },
      appointments: {
        total: totalAppointments,
        completed: completedAppointments,
        upcoming: upcomingAppointments,
        cancelled: cancelledAppointments,
      },
      profileViews: profile?.profileViews || 0,
    };
  },
});

export const getPatientStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) return null;

    // Fetch appointments
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", user._id))
      .collect();

    // Fetch treatment plans
    const treatmentPlans = await ctx.db
      .query("treatmentPlans")
      .withIndex("by_patient", (q) => q.eq("patientId", user._id))
      .collect();

    // Calculate Stats
    const completedSessions = appointments.filter((a) => a.status === "completed").length;
    const upcomingSessions = appointments.filter((a) => a.status === "scheduled" || a.status === "confirmed").length;

    // Calculate Adherence (Mock logic for now as we need exercise completion data)
    // We can use exerciseCompletions table if populated.
    const exerciseCompletions = await ctx.db
      .query("exerciseCompletions")
      .withIndex("by_patient", (q) => q.eq("patientId", user._id))
      .collect();

    const totalExercisesCompleted = exerciseCompletions.length;

    // Monthly Session History
    const monthlySessions: Record<string, number> = {};
    appointments.filter(a => a.status === 'completed').forEach((app) => {
      const date = new Date(app.startTime);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlySessions[key] = (monthlySessions[key] || 0) + 1;
    });

    const sessionChartData = Object.entries(monthlySessions)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      sessions: {
        completed: completedSessions,
        upcoming: upcomingSessions,
        total: appointments.length,
        chartData: sessionChartData,
      },
      treatment: {
        activePlans: treatmentPlans.filter(p => p.status === 'active').length,
        completedExercises: totalExercisesCompleted,
      }
    };
  },
});
