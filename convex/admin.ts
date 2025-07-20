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
    const totalClinics = allClinics.length;

    // Get appointments
    const allAppointments = await ctx.db.query("appointments").collect();
    const totalAppointments = allAppointments.length;

    // Calculate mock metrics (replace with real calculations)
    const revenueThisMonth = 125000; // Mock data
    const growthRate = 12.5; // Mock percentage

    return {
      overview: {
        totalUsers,
        activeUsers,
        totalClinics,
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

    // Get notification queue status
    const retryQueue = await ctx.db.query("notificationRetryQueue").collect();
    const failedNotifications = retryQueue.filter(q => q.retryCount >= 3).length;

    // Get recent errors (mock implementation)
    const systemErrors = 0; // Would track actual errors in production

    // Calculate health scores
    const notificationHealth = retryQueue.length === 0 ? 100 : Math.max(0, 100 - (failedNotifications * 10));
    const databaseHealth = 98.5; // Mock - would check actual DB performance
    const apiHealth = systemErrors === 0 ? 100 : Math.max(0, 100 - (systemErrors * 5));

    const overallHealth = Math.round((notificationHealth + databaseHealth + apiHealth) / 3);

    return {
      overall: overallHealth,
      status: overallHealth >= 95 ? 'excellent' as const : overallHealth >= 80 ? 'good' as const : overallHealth >= 60 ? 'warning' as const : 'critical' as const,
      components: {
        database: {
          status: databaseHealth >= 95 ? 'healthy' as const : databaseHealth >= 80 ? 'warning' as const : 'error' as const,
          score: databaseHealth,
          message: databaseHealth >= 95 ? 'All systems operational' : 'Performance degradation detected',
        },
        api: {
          status: apiHealth >= 95 ? 'healthy' as const : apiHealth >= 80 ? 'warning' as const : 'error' as const,
          score: apiHealth,
          message: systemErrors === 0 ? 'No errors detected' : `${systemErrors} errors in last hour`,
        },
        notifications: {
          status: notificationHealth >= 95 ? 'healthy' as const : notificationHealth >= 80 ? 'warning' as const : 'error' as const,
          score: notificationHealth,
          message: failedNotifications === 0 ? 'All notifications delivered' : `${failedNotifications} failed notifications`,
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
    
    // For now, return mock security events
    // In production, this would query actual security events from a dedicated table
    return [
      {
        id: "mock1",
        type: "login_attempt",
        severity: "low",
        timestamp: Date.now() - 3600000,
        details: "Successful login from new IP address",
        userId: "user123",
      },
      {
        id: "mock2",
        type: "permission_change",
        severity: "medium",
        timestamp: Date.now() - 7200000,
        details: "User role updated to admin",
        userId: "user456",
      },
    ];
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
    
    // For now, return mock announcements
    // In production, this would query from an announcements table
    return [
      {
        id: "mock1",
        title: "System Maintenance",
        message: "Scheduled maintenance window this weekend",
        severity: "info",
        timestamp: Date.now() - 86400000,
        author: "System Admin",
      },
      {
        id: "mock2",
        title: "New Feature Release",
        message: "Video calling now available",
        severity: "info",
        timestamp: Date.now() - 172800000,
        author: "Product Team",
      },
    ];
  },
});

// ==== USER MANAGEMENT ====

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
    
    // Mock system metrics - in production would aggregate real data
    return {
      uptime: 99.8,
      memoryUsage: 65.2,
      cpuUsage: 42.1,
      diskUsage: 78.5,
      networkLatency: 45,
      activeConnections: 1247,
      errorRate: 0.03,
      requestsPerSecond: 156,
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
    
    // Mock revenue data - in production would calculate from billing records
    const now = Date.now();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const lastMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).getTime();
    
    return {
      totalRevenue: 125000,
      monthlyRevenue: 15000,
      lastMonthRevenue: 13500,
      growthRate: 11.1,
      averageRevenuePerUser: 45.50,
      subscriptions: {
        active: 2750,
        new: 156,
        cancelled: 23,
        churnRate: 0.8,
      },
      breakdown: {
        subscriptions: 98000,
        oneTime: 27000,
      },
      projectedRevenue: 165000,
    };
  },
}); 