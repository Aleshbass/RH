// @ts-nocheck
// TypeScript TS2589 errors due to deep Convex generic inference - disabling type checking
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { Infer } from "convex/values";

// Define a type for the email object in Clerk's webhook payload
interface ClerkEmail {
  id: string;
  email_address: string;
  // Add other properties if needed, e.g., verification
}

/**
 * Webhook handler for Clerk events
 * This will be called by the Next.js API route that receives Clerk webhooks
 */
export const webhookHandler = action({
  args: {
    type: v.string(),
    data: v.any(),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify the webhook secret (you would store this in environment variables)
    // This is a simple placeholder - in production, use proper secret verification
    // TODO: Replace with proper secret verification using environment variables
    const expectedSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!expectedSecret || args.secret !== expectedSecret) {
      console.error("Invalid webhook secret");
      return { success: false, message: "Invalid webhook secret" };
    }

    try {
      switch (args.type) {
        case "user.created":
        case "user.updated": {
          const userId = await ctx.runMutation(internal.users.updateOrCreateUser, {
            clerkUserData: args.data,
          });
          
          // Reconcile any guest bookings for this user
          const email = args.data.email_addresses?.find((e: any) => e.id === args.data.primary_email_address_id)?.email_address;
          if (email) {
            await ctx.runMutation(internal.marketplace.booking.claimGuestBookings, {
              userId: userId as Id<"users">,
              email,
            });
          }
          
          return { success: true, message: `User ${args.type}d successfully` };
        }

        case "user.deleted": {
          // Handle user deletion (optional)
          // You might want to implement this for account deletion
          // Example: await ctx.runMutation(internal.users.deleteUser, { clerkId: args.data.id });
          return { success: true, message: "User deletion received (not implemented)" };
        }

        default:
          console.log(`Unhandled webhook event type: ${args.type}`);
          return { success: true, message: "Event ignored" };
      }
    } catch (error) {
      console.error("Error processing webhook:", error);
      return { 
        success: false, 
        message: `Error processing webhook: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  },
});

/**
 * Internal query to get a user by Clerk ID
 * Used by the frontend to check if a user exists after Clerk authentication
 */
export const getUserByClerkId = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();
  },
});

/**
 * Sync the user's Clerk profile with our database
 * This can be called from the client when a user logs in
 */
const syncUserArgs = v.object({
  // Data coming from the frontend after Clerk authentication
  clerkId: v.string(),
  email: v.string(),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
});

export type SyncUserArgs = Infer<typeof syncUserArgs>;

export const syncUser = action({
  // TODO: Define explicit return type for the action itself if Convex helper allows
  // For now, typing the handler should suffice for TS inference.
  args: syncUserArgs,
  handler: async (ctx, args): Promise<any> => {
    // Verify with Clerk that this user is valid
    // In a real implementation, you would verify the JWT from Clerk
    // For now, we'll trust the client data (not recommended for production)
    
    // Create or update the user in our database using correct internal function
    const userId: any = await ctx.runMutation(api.users.storeUserFromClerk, {
      clerkId: args.clerkId,
      email: args.email,
      firstName: args.firstName,
      lastName: args.lastName,
      imageUrl: args.imageUrl,
    });

    // Reconcile guest bookings, but only for an email Clerk has verified:
    // the client-supplied email could belong to someone else.
    const identity = await ctx.auth.getUserIdentity();
    if (identity?.emailVerified && identity.email) {
      await ctx.runMutation(internal.marketplace.booking.claimGuestBookings, {
        userId: userId as Id<"users">,
        email: identity.email,
      });
    }

    return userId;
  },
});
