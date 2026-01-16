import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const promoteToAdmin = internalMutation({
    args: {
        clerkId: v.string(),
    },
    handler: async (ctx, args) => {
        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
            .unique();

        if (!user) {
            throw new Error(`User with Clerk ID ${args.clerkId} not found`);
        }

        await ctx.db.patch(user._id, {
            role: "admin",
            onboarded: true,
        });

        return `User ${user.email} (${user._id}) promoted to admin and marked as onboarded.`;
    },
});
