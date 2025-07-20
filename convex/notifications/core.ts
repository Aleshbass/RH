import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { getUserByIdOrThrow } from "../users";
import { NotificationType, NotificationPriority, NotificationPayload } from "../../types/notifications";

/**
 * Create a notification with deduplication
 */
export const createNotificationWithDeduplication = mutation({
  args: {
    userId: v.id("users"),
    type: v.string(), // NotificationType
    priority: v.optional(v.union(v.literal("urgent"), v.literal("high"), v.literal("medium"), v.literal("low"))),
    payload: v.object({
      title: v.string(),
      body: v.string(),
      data: v.optional(v.object({
        entityId: v.optional(v.string()),
        entityType: v.optional(v.string()),
        actionUrl: v.optional(v.string()),
        metadata: v.optional(v.any()),
      })),
      link: v.optional(v.string()),
    }),
    deduplicationWindowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const deduplicationWindow = args.deduplicationWindowMs || 5 * 60 * 1000; // 5 minutes default
    const earliestTimestamp = Date.now() - deduplicationWindow;

    // Check for duplicates using available index
    const recentNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.gte(q.field("createdAt"), earliestTimestamp))
      .collect();

    // Check if there's a similar notification
    const duplicate = recentNotifications.find(notification => 
      notification.type === args.type &&
      notification.payload?.title === args.payload.title &&
      notification.payload?.body === args.payload.body &&
      (args.payload.data?.entityId ? notification.payload?.data?.entityId === args.payload.data.entityId : true)
    );

    if (duplicate) {
      return { 
        success: true, 
        notificationId: duplicate._id, 
        message: "Duplicate notification skipped" 
      };
    }

    // Create new notification
    const notificationId = await ctx.db.insert("notifications", {
      userId: args.userId,
      type: args.type,
      priority: args.priority || "medium",
      status: "pending",
      payload: args.payload,
      createdAt: Date.now(),
      readAt: undefined,
      deliveredAt: undefined,
      failedAt: undefined,
      retryCount: 0,
    });

    return { 
      success: true, 
      notificationId,
      message: "Notification created successfully" 
    };
  },
});

/**
 * Get notifications for a user
 */
export const getByUserId = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
    includeRead: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Verify user exists
    await getUserByIdOrThrow(ctx, args.userId);

    const limit = args.limit ?? 20;
    const includeRead = args.includeRead ?? false;

    let notifications;
    
    if (includeRead) {
      // Get all notifications regardless of read status
      notifications = await ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .order("desc") // Most recent first
        .take(limit);
    } else {
      // Get only unread notifications (where readAt is undefined)
      notifications = await ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .filter((q) => q.eq(q.field("readAt"), undefined))
        .order("desc") // Most recent first
        .take(limit);
    }

    return notifications;
  },
});

/**
 * Get the count of unread notifications for a user
 */
export const getUnreadCount = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify user exists
    await getUserByIdOrThrow(ctx, args.userId);

    const unreadNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("readAt"), undefined))
      .collect();

    return unreadNotifications.length;
  },
});

/**
 * Mark a notification as read
 */
export const markAsRead = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    
    if (!notification) {
      throw new Error(`Notification with ID ${args.notificationId} not found`);
    }

    await ctx.db.patch(args.notificationId, {
      readAt: Date.now(),
    });

    return true;
  },
});

/**
 * Mark all notifications for a user as read
 */
export const markAllAsRead = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify user exists
    await getUserByIdOrThrow(ctx, args.userId);

    const unreadNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("readAt"), undefined))
      .collect();

    // Update each notification
    for (const notification of unreadNotifications) {
      await ctx.db.patch(notification._id, {
        readAt: Date.now(),
      });
    }

    return unreadNotifications.length;
  },
});

/**
 * Get notification by ID (Internal Query)
 */
export const getNotificationById = query({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.notificationId);
  },
});

/**
 * Update notification status (Internal Mutation)
 */
export const updateNotificationStatus = mutation({
  args: {
    notificationId: v.id("notifications"),
    status: v.union(
      v.literal("pending"),
      v.literal("delivered"),
      v.literal("read"),
      v.literal("failed"),
      v.literal("retrying")
    ),
    deliveredAt: v.optional(v.number()),
    readAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const updateData: any = { status: args.status };
    
    if (args.deliveredAt) updateData.deliveredAt = args.deliveredAt;
    if (args.readAt) updateData.readAt = args.readAt;
    if (args.failedAt) updateData.failedAt = args.failedAt;
    
    await ctx.db.patch(args.notificationId, updateData);
    return true;
  },
});

/**
 * Delete a notification
 */
export const deleteNotification = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    
    if (!notification) {
      throw new Error(`Notification with ID ${args.notificationId} not found`);
    }

    await ctx.db.delete(args.notificationId);

    return true;
  },
});

/**
 * Get notifications for the currently authenticated user
 */
export const getMyNotifications = query({
  args: {
    limit: v.optional(v.number()),
    includeRead: v.optional(v.boolean()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q)=>q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return [];

    const limit = args.limit ?? 20;
    const includeRead = args.includeRead ?? false;

    let notifications;

    if (includeRead) {
      notifications = await ctx.db
        .query("notifications")
        .withIndex("by_user", (q)=>q.eq("userId", user._id))
        .order("desc")
        .take(limit);
    } else {
      notifications = await ctx.db
        .query("notifications")
        .withIndex("by_user", (q)=>q.eq("userId", user._id))
        .filter((q) => q.eq(q.field("readAt"), undefined))
        .order("desc")
        .take(limit);
    }

    return notifications;
  },
});

/**
 * Get unread notification count for current user
 */
export const getMyUnreadCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q)=>q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return 0;

    const count = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q)=> q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("readAt"), undefined))
      .collect();
    return count.length;
  },
}); 