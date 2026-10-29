// @ts-nocheck
import { v } from "convex/values";
import { mutation, query, action, internalQuery, internalMutation, internalAction } from "./_generated/server";
import { getUserByIdOrThrow } from "./users";
import { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import { publicAppUrl } from "./helpers/appUrl";
import { ensureUserRole } from "./auth";

/**
 * Internal query to get account status and user in one call
 * This reduces deep generic inference chains that cause TS2589
 */
export const getStatusAndUser = internalQuery({
  args: { statusId: v.id("accountApprovalStatus") },
  returns: v.object({
    status: v.union(v.null(), v.object({
      _id: v.id("accountApprovalStatus"),
      userId: v.id("users"),
      status: v.union(
        v.literal("pending_review"),
        v.literal("approved"),
        v.literal("declined")
      ),
      submittedAt: v.number(),
      reviewedAt: v.optional(v.number()),
      reviewedBy: v.optional(v.id("users")),
      comments: v.optional(v.string()),
    })),
    user: v.union(v.null(), v.object({
      _id: v.id("users"),
      clerkId: v.string(),
      email: v.optional(v.string()),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      role: v.optional(v.union(
        v.literal("physiotherapist"),
        v.literal("clinic_owner"),
        v.literal("patient"),
        v.literal("family_member"),
        v.literal("admin")
      )),
      onboarded: v.boolean(),
    })),
  }),
  handler: async (ctx, { statusId }) => {
    const status = await ctx.db.get(statusId);
    if (!status) {
      return { status: null, user: null };
    }

    const user = await ctx.db.get(status.userId);
    if (!user) {
      return { status, user: null };
    }

    return { status, user };
  },
});

/**
 * Submit an account for admin review
 * Called after onboarding is complete for roles that require approval (physiotherapist, clinic_owner)
 */
export const submitForReview = internalMutation({
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

    // Notify admins
    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .collect();

    const displayName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || (user.email || "User");
    const roleLabel = user.role === "physiotherapist" ? "Physiotherapist" : user.role === "clinic_owner" ? "Clinic Owner" : "User";
    const appUrl = publicAppUrl();
    const adminActionPath = `/dashboard/admin/users/${user._id}`;
    const adminDashboardLink = `${appUrl}${adminActionPath}`;

    for (const admin of admins) {
      if (admin.email) {
        await ctx.scheduler.runAfter(0, internal.actions.emails.sendOnboardingNotificationEmail.sendOnboardingNotificationEmail, {
          adminEmail: admin.email,
          userName: `${displayName} (${roleLabel})`,
          adminDashboardLink,
          userRole: roleLabel,
          submittedAt: Date.now(),
        });
      }
    }

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
    // Only the user themselves (dashboard guard) or an admin may read an approval status.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const viewer = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!viewer || (viewer._id !== args.userId && viewer.role !== "admin")) return null;
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
    // Admin review dialog only: includes the applicant's details and documents.
    await ensureUserRole(ctx, ["admin"]);
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

      // Get clinic owner profile for referral source
      let clinicOwnerProfile = null;
      if (user.clinicOwnerProfileId) {
        clinicOwnerProfile = await ctx.db.get(user.clinicOwnerProfileId);
      }

      // Merge clinic details with owner profile details
      profileDetails = {
        ...clinic,
        ...clinicOwnerProfile,
      };

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
    // Admin dashboard only: lists applicants with their details.
    await ensureUserRole(ctx, ["admin"]);
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
 * The admin review queue: pending applications, oldest first, with a compact applicant
 * summary and the list of uploaded documents (names/types only, no URLs; the review
 * dialog loads URLs through getApprovalDetails). Bounded to `limit` rows (default 100,
 * max 200) and 25 documents per applicant. Applications whose user was deleted are skipped.
 */
export const adminListApprovalQueue = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 100), 200));

    const statuses = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_status", (q) => q.eq("status", "pending_review"))
      .order("asc")
      .take(limit);

    const rows = await Promise.all(
      statuses.map(async (status) => {
        const user = await ctx.db.get(status.userId);
        if (!user) return null;

        let documents: { _id: string; fileName: string; documentType: string; uploadedAt?: number }[] = [];
        let summary: {
          licenseNumber?: string;
          location?: string;
          yearsOfExperience?: number;
          clinicName?: string;
          specializations?: string[];
          /** "unset": applied before physios were asked Rehabify vs independent. */
          practiceMode?: "network" | "independent" | "both" | "unset";
        } = {};

        if (user.role === "physiotherapist") {
          const profile = user.physiotherapistProfileId
            ? await ctx.db.get(user.physiotherapistProfileId)
            : await ctx.db
                .query("physiotherapistProfiles")
                .withIndex("by_user_id", (q) => q.eq("userId", user._id))
                .first();
          if (profile) {
            summary = {
              licenseNumber: profile.licenseNumber,
              location: profile.location,
              yearsOfExperience: profile.yearsOfExperience,
              specializations: (profile.specializations ?? []).slice(0, 4),
              practiceMode: profile.clinicId ? undefined : profile.practiceMode ?? "unset",
            };
            const docs = await ctx.db
              .query("physiotherapistDocuments")
              .withIndex("by_physiotherapist_id", (q) => q.eq("physiotherapistId", profile._id))
              .take(25);
            documents = docs.map((d) => ({
              _id: d._id,
              fileName: d.fileName,
              documentType: d.documentType,
              uploadedAt: d.uploadedAt,
            }));
          }
        } else if (user.role === "clinic_owner") {
          const clinic = await ctx.db
            .query("clinics")
            .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
            .first();
          if (clinic) {
            summary = {
              clinicName: clinic.name,
              location: [clinic.city, clinic.country].filter(Boolean).join(", ") || undefined,
            };
            const docs = await ctx.db
              .query("clinicDocuments")
              .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
              .take(25);
            documents = docs.map((d) => ({
              _id: d._id,
              fileName: d.fileName,
              documentType: d.documentType,
              uploadedAt: d.uploadedAt,
            }));
          }
        }

        return {
          _id: status._id,
          userId: status.userId,
          submittedAt: status.submittedAt,
          requiredDocuments: status.requiredDocuments,
          user: {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phoneNumber: user.phoneNumber,
            imageUrl: user.imageUrl,
            role: user.role,
            _creationTime: user._creationTime,
          },
          summary,
          documents,
        };
      })
    );

    return rows.filter((r) => r !== null);
  },
});

/**
 * Approve an account
 * Called by admin
 */
export const approveAccount = internalAction({
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

    // Auto-enable marketplace for physiotherapists
    if (user.role === "physiotherapist") {
      try {
        await ctx.runMutation(internal.marketplace.migrations.initializeMarketplaceProfile, {
          userId: status.userId,
        });
      } catch (error) {
        console.error("[approveAccount] Failed to initialize marketplace profile:", error);
        // Non-fatal, continue with approval
      }
    }

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

    // Send notification using the sendNotificationWithFallback mutation (in-app + schedule email processing)
    await client(api.notifications.sendNotificationWithFallback, notificationData);

    // Also directly send approval email to ensure delivery
    try {
      const roleLabel = user.role === "physiotherapist"
        ? "Physiotherapist"
        : user.role === "clinic_owner"
          ? "Clinic Owner"
          : "User";
      const appUrl = publicAppUrl();
      const dashboardPath = user.role === "physiotherapist" ? "/dashboard/physiotherapist" : user.role === "clinic_owner" ? "/dashboard/clinic" : "/dashboard";
      const dashboardLink = `${appUrl}${dashboardPath}`;

      if (user.email) {
        await ctx.scheduler.runAfter(0, (internal as any)["actions/emails/sendApprovalEmail"], {
          userEmail: user.email,
          userName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || (user.email as string),
          userRole: roleLabel,
          dashboardLink,
        });
      }
    } catch (emailErr) {
      console.error("[approveAccount] Failed to send approval email:", emailErr);
      // Non-fatal
    }

    return { success: true };
  },
});

/**
 * Decline an account
 * Called by admin
 */
export const declineAccount = internalAction({
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
export const getStatusById = internalQuery({
  args: {
    statusId: v.id("accountApprovalStatus"),
  },
  returns: v.union(v.null(), v.object({
    _id: v.id("accountApprovalStatus"),
    userId: v.id("users"),
    status: v.union(
      v.literal("pending_review"),
      v.literal("approved"),
      v.literal("declined")
    ),
    submittedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id("users")),
    comments: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.statusId);
  },
});

/**
 * Update status (internal)
 */
export const updateStatus = internalMutation({
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
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { statusId, ...updates } = args;

    const status = await ctx.db.get(statusId);
    if (!status) {
      throw new Error(`Account approval status with ID ${statusId} not found`);
    }

    await ctx.db.patch(statusId, updates);

    // If approved, also update the user status to active
    if (args.status === "approved") {
      await ctx.db.patch(status.userId, {
        status: "active",
        onboarded: true,
      });
    }

    return true;
  },
});

// Need to import the API for use in the action handlers
// (api and internal imported at top)
