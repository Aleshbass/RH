import { mutation } from "./_generated/server";

export const purgeUnwantedUsers = mutation({
  args: {},
  handler: async (ctx) => {
    const allUsers = await ctx.db.query("users").collect();
    let deletedCount = 0;

    for (const user of allUsers) {
      let shouldDelete = false;

      if (user.role === "patient") {
        shouldDelete = true;
      } else if (user.role === "clinic_owner") {
        shouldDelete = true;
      } else if (user.role === "physiotherapist" && !user.onboarded) {
        shouldDelete = true;
      } else if (!user.role) {
        shouldDelete = true; // Delete those without roles too, since they are incomplete
      }

      if (shouldDelete) {
        // Delete related profiles
        if (user.patientProfileId) await ctx.db.delete(user.patientProfileId);
        if (user.physiotherapistProfileId) await ctx.db.delete(user.physiotherapistProfileId);
        if (user.clinicOwnerProfileId) await ctx.db.delete(user.clinicOwnerProfileId);

        // Delete any pending approvals
        const approvals = await ctx.db
          .query("accountApprovalStatus")
          .withIndex("by_user_id", (q) => q.eq("userId", user._id))
          .collect();
        for (const approval of approvals) {
          await ctx.db.delete(approval._id);
        }

        // Delete user
        await ctx.db.delete(user._id);
        deletedCount++;
      }
    }

    return `Purged ${deletedCount} users (patients, clinic owners, unassigned, and pending physios).`;
  },
});

export const fixStuckPhysios = mutation({
  args: {},
  handler: async (ctx) => {
    // Find all pending approvals
    const approvals = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_status", (q) => q.eq("status", "pending_review"))
      .collect();

    let fixedCount = 0;

    for (const approval of approvals) {
      const user = await ctx.db.get(approval.userId);
      if (user && user.role === "physiotherapist") {
        // We found a physio in pending review.
        // Let's reset them back to onboarding so they can upload documents.
        await ctx.db.delete(approval._id);
        
        await ctx.db.patch(user._id, {
          onboarded: false,
          hasCompletedOnboarding: false,
          onboardingSkipped: false,
        });
        
        fixedCount++;
      }
    }

    return `Fixed ${fixedCount} stuck physiotherapists by resetting them to onboarding state.`;
  }
});
