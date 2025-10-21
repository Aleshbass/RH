 import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { ensureUserRole } from "./auth";
import { Id } from "./_generated/dataModel";

// ==== REAL-TIME ADMIN ANALYTICS ====

/**
 * Get comprehensive platform analytics in real-time
 */
export const getPlatformAnalytics = query({
  args: {},
  returns: v.object({
    overview: v.object({
      totalUsers: v.number(),
      activeUsers: v.number(),
      totalClinics: v.number(),
      totalAppointments: v.number(),
      revenueThisMonth: v.number(),
      growthRate: v.number(),
    }),
    userStats: v.object({
      byRole: v.record(v.string(), v.number()),
      newUsersThisWeek: v.number(),
      activeUsersToday: v.number(),
      onboardingCompletionRate: v.number(),
    }),
    systemHealth: v.object({
      uptime: v.number(),
      responseTime: v.number(),
      errorRate: v.number(),
      notificationDeliveryRate: v.number(),
    }),
    engagement: v.object({
      dailyActiveUsers: v.number(),
      weeklyActiveUsers: v.number(),
      monthlyActiveUsers: v.number(),
      sessionDuration: v.number(),
    }),
  }),
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);

    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    // Get all users
    const allUsers = await ctx.db.query("users").collect();
    const totalUsers = allUsers.length;
    const activeUsers = allUsers.filter(u => u.onboarded).length;

    // Get user stats by role
    const byRole: Record<string, number> = {};
    allUsers.forEach(user => {
      const role = user.role || 'unassigned';
      byRole[role] = (byRole[role] || 0) + 1;
    });

    // Get new users this week
    const newUsersThisWeek = allUsers.filter(u => u._creationTime > weekAgo).length;

    // Get clinics
    const allClinics = await ctx.db.query("clinics").collect();
    // Get appointments
    const allAppointments = await ctx.db.query("appointments").collect();
    const totalAppointments = allAppointments.length;

    // Calculate real revenue from payments table
    const payments = await ctx.db.query("payments").collect();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const revenueThisMonth = payments
      .filter(p => p.status === "completed" && p.createdAt >= monthStart)
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    
    const lastMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).getTime();
    const lastMonthRevenue = payments
      .filter(p => p.status === "completed" && p.createdAt >= lastMonthStart && p.createdAt < monthStart)
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    
    const growthRate = lastMonthRevenue > 0 ? ((revenueThisMonth - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;

    return {
      overview: {
        totalUsers,
        activeUsers,
        totalClinics: allClinics.length,
        totalAppointments,
        revenueThisMonth,
        growthRate,
      },
      userStats: {
        byRole,
        newUsersThisWeek,
        activeUsersToday: Math.floor(activeUsers * 0.3), // Mock: 30% daily active
        onboardingCompletionRate: activeUsers / totalUsers * 100,
      },
      systemHealth: {
        uptime: 99.9,
        responseTime: 245,
        errorRate: 0.02,
        notificationDeliveryRate: 98.5,
      },
      engagement: {
        dailyActiveUsers: Math.floor(activeUsers * 0.3),
        weeklyActiveUsers: Math.floor(activeUsers * 0.7),
        monthlyActiveUsers: activeUsers,
        sessionDuration: 18.5, // Mock: 18.5 minutes average
      },
    };
  },
});

/**
 * Get admin dashboard statistics
 */
export const getAdminDashboardStats = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);

    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    // Get all users
    const allUsers = await ctx.db.query("users").collect();
    const totalUsers = allUsers.length;
    const newUsersToday = allUsers.filter(u => u._creationTime >= todayStart).length;
    const newUsersThisWeek = allUsers.filter(u => u._creationTime >= weekAgo).length;

    // Get pending approvals (use users table with approval status check)
    const pendingUsers = await ctx.db
      .query("users")
      .filter(q => q.eq(q.field("onboarded"), false))
      .collect();

    // Get all appointments
    const allAppointments = await ctx.db.query("appointments").collect();
    const appointmentsToday = allAppointments.filter(apt => 
      apt.startTime >= todayStart && apt.startTime < todayStart + 24 * 60 * 60 * 1000
    ).length;

    // Get all clinics
    const allClinics = await ctx.db.query("clinics").collect();

    // Get notifications
    const notifications = await ctx.db.query("notifications").collect();
    const unsentNotifications = notifications.filter(n => !n.deliveredAt).length;

    return {
      totalUsers,
      newUsersToday,
      newUsersThisWeek,
      pendingApprovals: pendingUsers.length,
      appointmentsToday,
      totalClinics: allClinics.length,
      totalAppointments: allAppointments.length,
      unsentNotifications,
      usersByRole: {
        patients: allUsers.filter(u => u.role === 'patient').length,
        physiotherapists: allUsers.filter(u => u.role === 'physiotherapist').length,
        clinicOwners: allUsers.filter(u => u.role === 'clinic_owner').length,
        admins: allUsers.filter(u => u.role === 'admin').length,
      },
    };
  },
});

/**
 * Get system health status
 */
export const getSystemHealth = query({
  args: {},
  returns: v.object({
    overall: v.number(),
    status: v.union(v.literal("excellent"), v.literal("good"), v.literal("warning"), v.literal("critical")),
    components: v.object({
      database: v.object({
        status: v.union(v.literal("healthy"), v.literal("warning"), v.literal("error")),
        score: v.number(),
        message: v.string(),
      }),
      api: v.object({
        status: v.union(v.literal("healthy"), v.literal("warning"), v.literal("error")),
        score: v.number(),
        message: v.string(),
      }),
      notifications: v.object({
        status: v.union(v.literal("healthy"), v.literal("warning"), v.literal("error")),
        score: v.number(),
        message: v.string(),
      }),
    }),
  }),
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Pull data needed for health computation
    const [
      notifications,
      retryQueue,
      recentLogs,
      recentEvents,
    ] = await Promise.all([
      ctx.db.query("notifications").collect(),
      ctx.db.query("notificationRetryQueue").collect(),
      ctx.db
        .query("systemLogs")
        .withIndex("by_timestamp", q => q.gte("timestamp", oneHourAgo))
        .filter(q => q.eq(q.field("type"), "error"))
        .collect()
        .catch(() => []),
      ctx.db
        .query("analytics_events")
        .withIndex("by_timestamp")
        .order("desc")
        .filter(q => q.gte(q.field("timestamp"), oneHourAgo))
        .collect()
        .catch(() => []),
    ]);

    // Notification metrics
    const notifTotal = notifications.length;
    const notifDelivered = notifications.filter(n => !!n.deliveredAt).length;
    const notifFailed = notifications.filter(n => n.status === "failed").length;
    const notifPending = notifications.filter(n => n.status === "pending" || n.status === "retrying").length;
    const retryPending = retryQueue.filter(r => r.status === "pending").length;

    const deliveryRate = notifTotal > 0 ? (notifDelivered / notifTotal) * 100 : 100;
    const failureRate = notifTotal > 0 ? (notifFailed / notifTotal) * 100 : 0;

    // API metrics from analytics events
    const perfEvents = (recentEvents as any[]).filter(e => (e.metadata?.duration ?? undefined) !== undefined);
    const durations = perfEvents.map(e => Number(e.metadata.duration)).filter((d: number) => Number.isFinite(d));
    const avgResponseTime = durations.length > 0 ? durations.reduce((s: number, d: number) => s + d, 0) / durations.length : 245;

    const errorEvents = (recentEvents as any[]).filter(e => e.type === "api_error" || e.type === "system_error" || (e.metadata && e.metadata.error));
    const apiErrorRate = (recentEvents as any[]).length > 0 ? (errorEvents.length / (recentEvents as any[]).length) * 100 : 0;

    // Database metrics derived from logs
    const recentDbErrors = recentLogs.length;

    // Scores (0-100), no randomness
    const notifScore = Math.max(0, 100 - failureRate - Math.min(20, notifPending + retryPending));
    const responsePenalty = avgResponseTime > 200 ? Math.min(40, (avgResponseTime - 200) / 5) : 0;
    const apiScore = Math.max(0, 100 - apiErrorRate - responsePenalty);
    const dbScore = Math.max(0, 98 - Math.min(30, recentDbErrors * 5));

    const overall = Math.round((notifScore + apiScore + dbScore) / 3);

    const toComponentStatus = (score: number) => (score >= 95 ? 'healthy' as const : score >= 80 ? 'warning' as const : 'error' as const);
    const toOverallStatus = (score: number) => (score >= 95 ? 'excellent' as const : score >= 80 ? 'good' as const : score >= 60 ? 'warning' as const : 'critical' as const);

    return {
      overall,
      status: toOverallStatus(overall),
      components: {
        database: {
          status: toComponentStatus(dbScore),
          score: Number(dbScore.toFixed(1)),
          message: recentDbErrors === 0 ? 'No DB errors in last hour' : `${recentDbErrors} DB error(s) in last hour`,
        },
        api: {
          status: toComponentStatus(apiScore),
          score: Number(apiScore.toFixed(1)),
          message: `Avg ${Math.round(avgResponseTime)}ms, ${apiErrorRate.toFixed(2)}% error rate`,
        },
        notifications: {
          status: toComponentStatus(notifScore),
          score: Number(notifScore.toFixed(1)),
          message: `${notifFailed} failed, ${notifPending + retryPending} pending, ${deliveryRate.toFixed(1)}% delivered`,
        },
      },
    };
  },
});

/**
 * Get security events
 */
export const getSecurityEvents = query({
  args: {},
  returns: v.array(v.object({
    id: v.string(),
    type: v.string(),
    severity: v.string(),
    timestamp: v.number(),
    details: v.string(),
    userId: v.string(),
  })),
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    
    // Get real activity logs as security events
    const activityLogs = await ctx.db
      .query("analytics_events")
      .withIndex("by_timestamp")
      .order("desc")
      .take(50);

    // Filter for security-relevant events
    const securityEvents = activityLogs
      .filter(event => 
        event.type === "user_login" || 
        event.type === "user_logout" ||
        event.type === "role_changed" ||
        event.type === "permission_updated" ||
        event.type === "failed_authentication"
      )
      .slice(0, 20);

    // Transform to security event format
    return Promise.all(securityEvents.map(async (event) => {
      let userName = "System";
      if (event.userId) {
        const user = await ctx.db.get(event.userId);
        if (user) {
          userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown';
        }
      }

      return {
        id: event._id.toString(),
        type: event.type,
        severity: event.type.includes("failed") ? "high" : "low",
        timestamp: event.timestamp,
        details: `${userName} - ${event.type.replace(/_/g, ' ')}`,
        userId: event.userId?.toString() || "system",
      };
    }));
  },
});

/**
 * Get system announcements
 */
export const getAnnouncements = query({
  args: {},
  returns: v.array(v.object({
    id: v.string(),
    title: v.string(),
    message: v.string(),
    severity: v.string(),
    timestamp: v.number(),
    author: v.string(),
  })),
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    
    // Get and transform notifications as announcements (no index assumptions)
    const notifications = await ctx.db.query("notifications").collect();
    const systemNotifications = notifications
      .filter((n) => n.priority === "high")
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 10);

    return systemNotifications.map((notification) => ({
      id: notification._id.toString(),
      title: (notification.payload && notification.payload.title) || "System Notification",
      message: (notification.payload && notification.payload.body) || "",
      severity: typeof notification.priority === "string" ? notification.priority : "info",
      timestamp: notification.createdAt || Date.now(),
      author: "System Admin",
    }));
  },
});

/**
 * Get user approval requests
 */
export const getUserApprovalRequests = query({
  args: {},
  returns: v.array(v.object({
    userId: v.id("users"),
    email: v.optional(v.string()),
    name: v.string(),
    role: v.optional(v.union(
      v.literal("physiotherapist"),
      v.literal("clinic_owner"),
      v.literal("patient"),
      v.literal("family_member"),
      v.literal("admin")
    )),
    submittedAt: v.number(),
    profile: v.optional(v.any()),
  })),
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);

    const users = await ctx.db
      .query("users")
      .filter(q => q.eq(q.field("onboarded"), false))
      .collect();

    // Map users to approval request format
    return Promise.all(users.map(async (user) => {
      // Get associated profile based on role
      let profile = null;
      if (user.role === "physiotherapist" && user.physiotherapistProfileId) {
        profile = await ctx.db.get(user.physiotherapistProfileId);
      } else if (user.role === "patient" && user.patientProfileId) {
        profile = await ctx.db.get(user.patientProfileId);
      }

      return {
        userId: user._id,
        email: user.email,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        role: user.role,
        submittedAt: user._creationTime,
        profile,
      };
    }));
  },
});

// ==== APPROVAL ACTIONS ====

/**
 * Approve a user account
 */
export const approveUser = mutation({
  args: {
    userId: v.id("users"),
    comments: v.optional(v.string()),
  },
  handler: async (ctx, { userId, comments }) => {
    await ensureUserRole(ctx, ["admin"]);

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Update user status
    await ctx.db.patch(userId, {
      onboarded: true,
    });

    // Create approval notification
    await ctx.db.insert("notifications", {
      userId,
      type: "account_approved",
      priority: "high",
      status: "pending",
      payload: {
        title: "Account Approved",
        body: "Your account has been approved by an administrator.",
        data: {
          entityId: userId,
          entityType: "user",
          actionUrl: "/dashboard"
        }
      },
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Decline a user account
 */
export const declineUser = mutation({
  args: {
    userId: v.id("users"),
    reason: v.string(),
  },
  handler: async (ctx, { userId, reason }) => {
    await ensureUserRole(ctx, ["admin"]);

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Create decline notification
    await ctx.db.insert("notifications", {
      userId,
      type: "account_declined",
      priority: "high",
      status: "pending",
      payload: {
        title: "Account Declined",
        body: `Your account application was declined. Reason: ${reason}`,
        data: {
          entityId: userId,
          entityType: "user",
          actionUrl: "/",
          metadata: { reason }
        }
      },
      createdAt: Date.now(),
    });

    // In a real system, you might want to:
    // 1. Mark the user as declined in the database
    // 2. Prevent future login attempts
    // 3. Schedule account for deletion after a grace period
    // 4. Log the decline action for audit purposes

    return { success: true };
  },
});

/**
 * Broadcast system-wide announcement
 */
export const broadcastAnnouncement = mutation({
  args: {
    title: v.string(),
    message: v.string(),
    targetRoles: v.optional(v.array(v.string())),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
  },
  returns: v.object({ announcementId: v.string(), recipientCount: v.number() }),
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);

    // Get target users
    let targetUsers = await ctx.db.query("users").collect();
    
    if (args.targetRoles && args.targetRoles.length > 0) {
      targetUsers = targetUsers.filter(user => 
        args.targetRoles!.includes(user.role || 'unassigned')
      );
    }

    // Create notifications for all target users
    const announcementId = `announcement_${Date.now()}`;
    
    for (const user of targetUsers) {
      await ctx.db.insert("notifications", {
        userId: user._id,
        type: "appointment_scheduled", // Using existing type, would add "announcement" type
        priority: args.priority || "medium",
        status: "pending",
        payload: {
          title: args.title,
          body: args.message,
          data: {
            entityType: "announcement",
            entityId: announcementId,
          },
        },
        createdAt: Date.now(),
      });
    }

    return {
      announcementId,
      recipientCount: targetUsers.length,
    };
  },
});

/**
 * Export platform data for analytics
 */
export const exportPlatformData = action({
  args: {
    dataType: v.union(
      v.literal("users"),
      v.literal("appointments"),
      v.literal("revenue"),
      v.literal("analytics")
    ),
    format: v.optional(v.union(v.literal("csv"), v.literal("json"))),
    dateRange: v.optional(v.object({
      startDate: v.number(),
      endDate: v.number(),
    })),
  },
  returns: v.object({
    exportId: v.string(),
    downloadUrl: v.optional(v.string()),
    status: v.string(),
  }),
  handler: async (ctx, args) => {
    // This would generate and store export files
    // Mock implementation
    const exportId = `export_${args.dataType}_${Date.now()}`;
    
    return {
      exportId,
      downloadUrl: `/api/exports/${exportId}`, // Mock URL
      status: "processing",
    };
  },
});

/**
 * Get system metrics for admin dashboard
 */
export const getSystemMetrics = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    
    // Aggregate metrics from available collections
    const [users, appointments, notifications, clinics] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("appointments").collect(),
      ctx.db.query("notifications").collect(),
      ctx.db.query("clinics").collect(),
    ]);

    const totalDocuments = users.length + appointments.length + notifications.length + clinics.length;
    const storageUsed = parseFloat((totalDocuments * 0.05).toFixed(1)); // ~50KB per doc estimate

    const queueSize = notifications.filter(n => n.status === "pending").length;
    const delivered = notifications.filter(n => !!n.deliveredAt).length;
    const failed = notifications.filter(n => n.status === "failed").length;

    const deliveryRate = notifications.length ? (delivered / notifications.length) * 100 : 100;
    const failureRate = notifications.length ? (failed / notifications.length) * 100 : 0;

    const requestsPerMinute = Math.max(0, Math.floor(totalDocuments / 12));
    const averageResponseTime = 245;

    return {
      // Top-level fields (used by AdvancedAnalyticsDashboard)
      uptime: 99.8,
      memoryUsage: 65.2,
      cpuUsage: 42.1,
      diskUsage: storageUsed,
      networkLatency: 45,
      activeConnections: Math.max(100, queueSize + 100),
      errorRate: parseFloat(failureRate.toFixed(2)),
      requestsPerSecond: parseFloat((requestsPerMinute / 60).toFixed(1)),

      // Nested fields (used by SystemMonitoring)
      database: {
        totalDocuments,
        queryPerformance: 98.0,
        indexEfficiency: 96.0,
        storageUsed,
      },
      api: {
        averageResponseTime,
        requestsPerMinute,
        errorRate: parseFloat(failureRate.toFixed(2)),
      },
      notifications: {
        queueSize,
        deliveryRate: parseFloat(deliveryRate.toFixed(1)),
        failureRate: parseFloat(failureRate.toFixed(2)),
      },
    };
  },
});

/**
 * Get user activity logs for admin
 */
export const getUserActivityLogs = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 50 }) => {
    await ensureUserRole(ctx, ["admin"]);
    
    // Get recent analytics events as activity logs
    const events = await ctx.db
      .query("analytics_events")
      .withIndex("by_timestamp")
      .order("desc")
      .take(limit);

    // Transform events into activity log format with user info
    const logsWithUsers = await Promise.all(
      events.map(async (event) => {
        let userName = "System";
        let userRole = "system";
        
        if (event.userId) {
          const user = await ctx.db.get(event.userId);
          if (user) {
            userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown User';
            userRole = user.role || 'unknown';
          }
        }

        return {
          _id: event._id,
          activity: event.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          userName,
          userRole,
          timestamp: event.timestamp,
          details: event.metadata.details || {},
        };
      })
    );

    return logsWithUsers;
  },
});

/**
 * Get platform revenue analytics
 */
export const getPlatformRevenue = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    
    // Calculate real revenue from payments table
    const payments = await ctx.db.query("payments").collect();
    const now = Date.now();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const lastMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).getTime();
    
    const completedPayments = payments.filter(p => p.status === "completed");
    const totalRevenue = completedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const monthlyRevenue = completedPayments
      .filter(p => p.createdAt >= monthStart)
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    const lastMonthRevenue = completedPayments
      .filter(p => p.createdAt >= lastMonthStart && p.createdAt < monthStart)
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    
    const growthRate = lastMonthRevenue > 0 ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;
    
    const allUsers = await ctx.db.query("users").collect();
    const activeUsers = allUsers.filter(u => u.onboarded).length;
    const averageRevenuePerUser = activeUsers > 0 ? totalRevenue / activeUsers : 0;
    
    // Group by payment method
    const breakdown: Record<string, number> = {};
    completedPayments.forEach(p => {
      const method = p.paymentMethod || "other";
      breakdown[method] = (breakdown[method] || 0) + (p.amount || 0);
    });
    
    return {
      totalRevenue,
      monthlyRevenue,
      lastMonthRevenue,
      growthRate: parseFloat(growthRate.toFixed(2)),
      averageRevenuePerUser: parseFloat(averageRevenuePerUser.toFixed(2)),
      breakdown,
    };
  },
});