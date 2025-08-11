import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// Create a scheduled task
export const create = mutation({
  args: {
    type: v.string(),
    scheduledTime: v.number(),
    data: v.any(),
    status: v.optional(v.union(v.literal("pending"), v.literal("completed"), v.literal("failed"))),
  },
  handler: async (ctx, args) => {
    const taskId = await ctx.db.insert("scheduledTasks", {
      type: args.type,
      scheduledFor: args.scheduledTime,
      data: args.data,
      status: args.status || "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Schedule the task to run at the specified time
    const delay = Math.max(0, args.scheduledTime - Date.now());
    await ctx.scheduler.runAfter(delay, internal.scheduledTasks.executeTask, {
      taskId,
    });

    return taskId;
  },
});

// Get pending tasks
export const getPendingTasks = query({
  args: {
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("scheduledTasks").filter((q) => q.eq(q.field("status"), "pending"));
    
    if (args.type) {
      query = query.filter((q) => q.eq(q.field("type"), args.type));
    }

    return await query.collect();
  },
});

// Execute a scheduled task (internal function)
export const executeTask = internalMutation({
  args: {
    taskId: v.id("scheduledTasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.status !== "pending") {
      return;
    }

    try {
      // Update task status to running
      await ctx.db.patch(args.taskId, {
        status: "running" as any,
        updatedAt: Date.now(),
      });

      // Execute the task based on its type
      switch (task.type) {
        case "maintenance_reminder":
          await ctx.scheduler.runAfter(0, internal.resourceNotifications.sendMaintenanceReminders, {});
          break;

        case "resource_conflict_check":
          await ctx.scheduler.runAfter(0, internal.resourceNotifications.checkClinicConflicts, {
            clinicId: task.data.clinicId,
          });
          break;

        case "maintenance_check":
          await ctx.scheduler.runAfter(0, internal.resourceNotifications.checkClinicMaintenance, {
            clinicId: task.data.clinicId,
          });
          break;

        default:
          console.warn(`Unknown task type: ${task.type}`);
      }

      // Mark task as completed
      await ctx.db.patch(args.taskId, {
        status: "completed" as any,
        executedAt: Date.now(),
        updatedAt: Date.now(),
      });

    } catch (error) {
      console.error(`Failed to execute task ${args.taskId}:`, error);
      
      // Mark task as failed
      await ctx.db.patch(args.taskId, {
        status: "failed" as any,
        error: error instanceof Error ? error.message : "Unknown error",
        updatedAt: Date.now(),
      });
    }
  },
});

// Clean up old completed tasks
export const cleanupOldTasks = internalMutation({
  args: {
    olderThanDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoffTime = Date.now() - (args.olderThanDays || 30) * 24 * 60 * 60 * 1000;
    
    const oldTasks = await ctx.db
      .query("scheduledTasks")
      .filter((q) => 
        q.and(
          q.neq(q.field("status"), "pending"),
          q.lt(q.field("updatedAt"), cutoffTime)
        )
      )
      .collect();

    for (const task of oldTasks) {
      await ctx.db.delete(task._id);
    }

    return { deletedCount: oldTasks.length };
  },
});

// Update scheduled tasks table in schema
export const updateTaskStatus = mutation({
  args: {
    taskId: v.id("scheduledTasks"),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("completed"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.taskId, {
      status: args.status,
      error: args.error,
      updatedAt: Date.now(),
      ...(args.status === "completed" && { completedAt: Date.now() }),
    });
  },
});
