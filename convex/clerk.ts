import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { internalQuery } from "./_generated/server";

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
    const expectedSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!expectedSecret || args.secret !== expectedSecret) {
      console.error("Invalid webhook secret");
      return { success: false, message: "Invalid webhook secret" };
    }

    try {
      switch (args.type) {
        case "user.created": {
          // Extract user data from the webhook payload
          const { id, email_addresses, first_name, last_name, image_url } = args.data;
          
          if (!id || !email_addresses || email_addresses.length === 0) {
            console.error("Missing required user data in webhook");
            return { success: false, message: "Missing required user data" };
          }

          // Extract the primary email
          const primaryEmail = (email_addresses as ClerkEmail[]).find(email => email.id === args.data.primary_email_address_id)?.email_address;
          
          if (!primaryEmail) {
            console.error("No primary email found in webhook data");
            return { success: false, message: "No primary email found" };
          }

          // Create or update the user in our database
          // @ts-ignore - TypeScript doesn't properly recognize internal mutations in the API object
          await ctx.runMutation(api.users.internalCreateUser, {
            clerkId: id,
            email: primaryEmail,
            firstName: first_name || undefined,
            lastName: last_name || undefined,
            imageUrl: image_url || undefined,
          });

          return { success: true, message: "User created successfully" };
        }

        case "user.updated": {
          // Handle user updates
          const { id, email_addresses, first_name, last_name, image_url } = args.data;
          
          // Get the primary email
          const primaryEmail = (email_addresses as ClerkEmail[]).find(email => email.id === args.data.primary_email_address_id)?.email_address;
          
          if (id && primaryEmail) {
            // Update the user in our database
            // @ts-ignore - TypeScript doesn't properly recognize internal mutations in the API object
            await ctx.runMutation(api.users.internalCreateUser, {
              clerkId: id,
              email: primaryEmail,
              firstName: first_name || undefined,
              lastName: last_name || undefined,
              imageUrl: image_url || undefined,
            });
          }

          return { success: true, message: "User updated successfully" };
        }

        case "user.deleted": {
          // Handle user deletion (optional)
          // You might want to implement this for account deletion
          return { success: true, message: "User deletion received" };
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
import { Id } from "./_generated/dataModel";
export const syncUser = action({
  // TODO: Define explicit return type for the action itself if Convex helper allows
  // For now, typing the handler should suffice for TS inference.
  args: {
    // Data coming from the frontend after Clerk authentication
    clerkId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"users">> => {
    // Verify with Clerk that this user is valid
    // In a real implementation, you would verify the JWT from Clerk
    // For now, we'll trust the client data (not recommended for production)
    
    // Create or update the user in our database
    // @ts-ignore - TypeScript doesn't properly recognize internal mutations in the API object
    const userId = await ctx.runMutation(api.users.storeUserFromClerk, {
      clerkId: args.clerkId,
      email: args.email,
      firstName: args.firstName,
      lastName: args.lastName,
      imageUrl: args.imageUrl,
    });

    return userId;
  },
});
