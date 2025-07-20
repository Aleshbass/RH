import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { getUserByIdOrThrow } from "./users";
import { Id } from "./_generated/dataModel";

/**
 * Submit an account for admin review
 * Called after onboarding is complete for roles that require approval (physiotherapist, clinic_owner)
 */
export const submitForReview = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify user exists
    const user = await getUserByIdOrThrow(ctx, args.userId);

    // Check if this user already has a status
    const existingStatus = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .unique();

    if (existingStatus) {
      // Only update if not already approved
      if (existingStatus.status === "pending_review") {
        await ctx.db.patch(existingStatus._id, {
          submittedAt: Date.now(),
        });
        return existingStatus._id;
      }
      return existingStatus._id;
    }

    // Create new approval status
    const statusId = await ctx.db.insert("accountApprovalStatus", {
      userId: args.userId,
      status: "pending_review",
      submittedAt: Date.now(),
    });

    return statusId;
  },
});

/**
 * Get approval status for a user
 */
export const getStatus = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify user exists
    await getUserByIdOrThrow(ctx, args.userId);

    const status = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .unique();

    return status;
  },
});

/**
 * Get complete user details for admin review (including documents)
 * This provides comprehensive information for admins to make approval decisions
 */
export const getApprovalDetails = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify user exists
    const user = await getUserByIdOrThrow(ctx, args.userId);

    // Get approval status
    const approvalStatus = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .unique();

    let profileDetails = null;
    let documents: Array<{
      _id: any;
      _creationTime: number;
      storageId: any;
      downloadUrl?: string | null;
      [key: string]: any;
    }> = [];

    // Get role-specific profile and documents
    if (user.role === "physiotherapist" && user.physiotherapistProfileId) {
      // Get physiotherapist profile
      profileDetails = await ctx.db.get(user.physiotherapistProfileId);
      
      // Get physiotherapist documents
      const physioDocuments = await ctx.db
        .query("physiotherapistDocuments")
        .withIndex("by_physiotherapist_id", (q) => 
          q.eq("physiotherapistId", user.physiotherapistProfileId!)
        )
        .collect();
      
      // Add download URLs for documents
      documents = await Promise.all(
        physioDocuments.map(async (doc) => {
          const downloadUrl = await ctx.storage.getUrl(doc.storageId);
          return {
            ...doc,
            downloadUrl,
          };
        })
      );
    } else if (user.role === "clinic_owner") {
      // Get clinic details
      const clinic = await ctx.db
        .query("clinics")
        .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
        .unique();
      
      profileDetails = clinic;
      
      // Get clinic documents if clinic exists
      if (clinic) {
        const clinicDocuments = await ctx.db
          .query("clinicDocuments")
          .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
          .collect();
        
        // Add download URLs for documents
        documents = await Promise.all(
          clinicDocuments.map(async (doc) => {
            const downloadUrl = await ctx.storage.getUrl(doc.storageId);
            return {
              ...doc,
              downloadUrl,
            };
          })
        );
      }
    }

    return {
      user,
      approvalStatus,
      profileDetails,
      documents,
    };
  },
});

/**
 * List accounts pending approval
 * For admin dashboard
 */
export const listPendingApprovals = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.id("accountApprovalStatus")),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;

    const statuses = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_status", (q) => q.eq("status", "pending_review"))
      .order("desc") // Most recent submissions first
      .take(limit);

    // Fetch user details for each status
    const usersWithStatus = await Promise.all(
      statuses.map(async (status) => {
        const user = await ctx.db.get(status.userId);
        
        // Get profile details based on role
        let profileDetails = null;
        if (user?.role === "physiotherapist" && user.physiotherapistProfileId) {
          profileDetails = await ctx.db.get(user.physiotherapistProfileId);
        } else if (user?.role === "clinic_owner") {
          // Get clinic details if this is a clinic owner
          const clinic = await ctx.db
            .query("clinics")
            .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
            .unique();
          profileDetails = clinic;
        }

        return {
          status,
          user,
          profileDetails,
        };
      })
    );

    return usersWithStatus;
  },
});

/**
 * Get pending approvals (alias for listPendingApprovals for compatibility)
 */
export const getPendingApprovals = listPendingApprovals;

/**
 * Approve an account
 * Called by admin
 */
export const approveAccount = action({
  args: {
    statusId: v.id("accountApprovalStatus"),
    adminUserId: v.id("users"),
    comments: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { statusId, adminUserId, comments } = args;

    // Get the convex client
    const client = ctx.runMutation;
    const query = ctx.runQuery;

    // Verify admin exists
    const admin = await query(api.users.getUserById, { userId: adminUserId });
    if (!admin || admin.role !== "admin") {
      throw new Error("Unauthorized: Only admins can approve accounts");
    }

    // Get the status
    const status = await query(api.accountApproval.getStatusById, { statusId });
    if (!status) {
      throw new Error(`Account approval status with ID ${statusId} not found`);
    }

    // Get the user
    const user = await query(api.users.getUserById, { userId: status.userId });
    if (!user) {
      throw new Error(`User with ID ${status.userId} not found`);
    }

    // Update the status
    await client(api.accountApproval.updateStatus, {
      statusId,
      status: "approved",
      reviewedBy: adminUserId,
      reviewedAt: Date.now(),
      comments
    });

    // Create notification for the user
    const dashboardLink = `/dashboard`;
    
    // Send notification using the Convex API directly
    const notificationData = {
      userId: status.userId,
      type: 'account_approved' as const,
      title: 'Account Approved',
      message: `Your Rehabify Health account has been approved. You now have full access to the platform.`,
      data: {
        entityType: 'account_approval',
        actionUrl: dashboardLink
      },
      sendEmail: true,
      retryOnFailure: true
    };
    
    // Send notification using the sendNotificationWithFallback mutation
    await client(api.notifications.sendNotificationWithFallback, notificationData);

    return { success: true };
  },
});

/**
 * Decline an account
 * Called by admin
 */
export const declineAccount = action({
  args: {
    statusId: v.id("accountApprovalStatus"),
    adminUserId: v.id("users"),
    reason: v.string(),
    requiredDocuments: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { statusId, adminUserId, reason, requiredDocuments } = args;

    // Get the convex client
    const client = ctx.runMutation;
    const query = ctx.runQuery;

    // Verify admin exists
    const admin = await query(api.users.getUserById, { userId: adminUserId });
    if (!admin || admin.role !== "admin") {
      throw new Error("Unauthorized: Only admins can approve accounts");
    }

    // Get the status
    const status = await query(api.accountApproval.getStatusById, { statusId });
    if (!status) {
      throw new Error(`Account approval status with ID ${statusId} not found`);
    }

    // Get the user
    const user = await query(api.users.getUserById, { userId: status.userId });
    if (!user) {
      throw new Error(`User with ID ${status.userId} not found`);
    }

    // Update the status
    await client(api.accountApproval.updateStatus, {
      statusId,
      status: "declined",
      reviewedBy: adminUserId,
      reviewedAt: Date.now(),
      comments: reason,
      requiredDocuments
    });

    // Create notification for the user
    const supportLink = `/support`;
    
    // Send notification using the Convex API directly
    const notificationData = {
      userId: status.userId,
      type: 'account_declined' as const,
      title: 'Account Application Update',
      message: `Your Rehabify Health account application could not be approved at this time.`,
      data: {
        entityType: 'account_approval',
        actionUrl: '/support',
        metadata: {
          reason,
          requiredDocuments: requiredDocuments || []
        }
      },
      sendEmail: true,
      retryOnFailure: true
    };
    
    // Send notification using the sendNotificationWithFallback mutation
    await client(api.notifications.sendNotificationWithFallback, notificationData);

    return { success: true };
  },
});

/**
 * Get status by ID
 */
export const getStatusById = query({
  args: {
    statusId: v.id("accountApprovalStatus"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.statusId);
  },
});

/**
 * Update status (internal)
 */
export const updateStatus = mutation({
  args: {
    statusId: v.id("accountApprovalStatus"),
    status: v.union(
      v.literal("pending_review"),
      v.literal("approved"),
      v.literal("declined")
    ),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    comments: v.optional(v.string()),
    requiredDocuments: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { statusId, ...updates } = args;
    
    const status = await ctx.db.get(statusId);
    if (!status) {
      throw new Error(`Account approval status with ID ${statusId} not found`);
    }

    await ctx.db.patch(statusId, updates);
    
    return true;
  },
});

// Need to import the API for use in the action handlers
import { api } from "./_generated/api";
