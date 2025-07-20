"use node";

import { action } from "../../_generated/server";
import { v } from "convex/values";
import { api } from "../../_generated/api";
import { Doc, Id } from "../../_generated/dataModel";

interface NotificationGroup {
  [key: string]: Array<Doc<"notifications">>
}

export const cleanupDuplicateNotifications = action({
  args: {
    dryRun: v.optional(v.boolean()),
    timeWindowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true; // Default to dry run for safety
    const timeWindowMs = args.timeWindowMs ?? 24 * 60 * 60 * 1000; // Default to 24 hours
    
    const stats = {
      usersProcessed: 0,
      totalNotifications: 0,
      duplicatesFound: 0,
      duplicatesDeleted: 0,
      errors: 0,
    };
    
    try {
      // Get all users by querying the users table directly
      const users = await ctx.runQuery(api.queries.getUsers, {
        limit: 1000 // Adjust as needed
      });
      
      for (const user of users.users) {
        stats.usersProcessed++;
        
        try {
          // Get all notifications for this user
          const notifications = await ctx.runQuery(api.notifications.getByUserId, {
            userId: user._id,
            includeRead: true,
            limit: 1000, // Adjust as needed
          });
          
          stats.totalNotifications += notifications.length;
          
          // Group notifications by type, title, message, and entityId
          const groups: NotificationGroup = {};
          
          for (const notification of notifications) {
            // Create a key based on notification properties
            const entityId = notification.payload?.data?.entityId || "";
            const title = notification.payload?.title || "";
            const body = notification.payload?.body || "";
            const key = `${notification.type}|${title}|${body}|${entityId}`;
            
            if (!groups[key]) {
              groups[key] = [];
            }
            
            groups[key].push(notification);
          }
          
          // Process each group
          for (const key in groups) {
            const group = groups[key];
            
            if (group.length > 1) {
              // Sort by creation time (newest first)
              group.sort((a: Doc<"notifications">, b: Doc<"notifications">) => b.createdAt - a.createdAt);
              
              // Keep the newest notification, mark others as duplicates
              const [newest, ...duplicates] = group;
              
              // Check if duplicates are within the time window
              const filteredDuplicates = duplicates.filter((dup: Doc<"notifications">) => 
                newest.createdAt - dup.createdAt < timeWindowMs
              );
              
              stats.duplicatesFound += filteredDuplicates.length;
              
              // Delete duplicates if not in dry run mode
              if (!dryRun) {
                for (const duplicate of filteredDuplicates) {
                  await ctx.runMutation(api.notifications.deleteNotification, {
                    notificationId: duplicate._id,
                  });
                  stats.duplicatesDeleted++;
                }
              }
            }
          }
        } catch (error) {
          console.error(`Error processing user ${user._id}:`, error);
          stats.errors++;
        }
      }
      
      return {
        success: true,
        dryRun,
        stats,
        message: dryRun 
          ? `Dry run completed. Found ${stats.duplicatesFound} duplicates that would be deleted.` 
          : `Cleanup completed. Deleted ${stats.duplicatesDeleted} duplicate notifications.`,
      };
    } catch (error) {
      console.error("Error in cleanup script:", error);
      return {
        success: false,
        dryRun,
        stats,
        error: String(error),
      };
    }
  },
});