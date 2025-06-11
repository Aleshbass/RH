import { v } from "convex/values";
import { internalMutation, mutation, query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

// ==== QUERIES ====

/**
 * Get the currently authenticated user
 * @returns The user document or null if not authenticated
 */
export const getMyUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.tokenIdentifier))
      .unique();
    
    return user;
  },
});

/**
 * Get a user by ID
 * @returns The user document or null if not found
 */
export const getUserById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

/**
 * Get a user's email by ID
 * Used by the notification system to send emails
 */
export const getUserEmail = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return null;
    }
    return user.email;
  },
});

// Helper function to fetch a user by ID or throw an error if not found
export async function getUserByIdOrThrow(ctx: QueryCtx, userId: Id<"users">): Promise<Doc<"users">> {
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error(`User with ID ${userId} not found`);
  }
  return user;
}

// ==== INTERNAL MUTATION: Create or Update User from Clerk Data ====
// This should ideally be triggered by a Clerk webhook or an action
// that securely verifies the Clerk session upon first login/signup.
// Renamed from internalCreateUser and adapted for webhook payload
export const updateOrCreateUser = internalMutation({
  args: {
    // clerkUserData will be the event.data object from Clerk webhook
    clerkUserData: v.any(), // Using v.any() for flexibility, or define a strict validator for Clerk's UserJSON
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const { 
      id: clerkId, 
      email_addresses, 
      primary_email_address_id, 
      first_name, 
      last_name, 
      image_url 
    } = args.clerkUserData as any; // Cast to any or a more specific Clerk User type

    if (!clerkId) {
      throw new Error("Clerk User ID (id) is missing in webhook data");
    }

    const primaryEmailObj = email_addresses?.find((email: any) => email.id === primary_email_address_id);
    const email = primaryEmailObj?.email_address;

    if (!email) {
      console.warn(`Primary email not found for Clerk user ${clerkId}. Webhook data:`, args.clerkUserData);
      // Depending on your schema, if email is mandatory and not found, you might throw an error here.
      // For example: throw new Error(`Primary email is required but not found for Clerk user ${clerkId}`);
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId as string))
      .unique();

    if (existingUser) {
      const updates: Partial<Doc<"users">> = {};
      if (email && existingUser.email !== email) {
        updates.email = email;
      }
      if (existingUser.firstName !== (first_name || undefined)) {
        updates.firstName = first_name || undefined;
      }
      if (existingUser.lastName !== (last_name || undefined)) {
        updates.lastName = last_name || undefined;
      }
      if (existingUser.imageUrl !== (image_url || undefined)) {
        updates.imageUrl = image_url || undefined;
      }

      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(existingUser._id, updates);
      }
      return existingUser._id;
    }

    // User does not exist, create a new one
    const userId = await ctx.db.insert("users", {
      clerkId: clerkId as string,
      email: email as string, // Ensure your schema handles potentially undefined email
      firstName: first_name || undefined,
      lastName: last_name || undefined,
      imageUrl: image_url || undefined,
      role: undefined, 
      onboarded: false, 
    });

    return userId;
  },
});

// ==== PUBLIC MUTATION: Store User from Clerk (Client-Side Sync) ====
export const storeUserFromClerk = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || identity.subject !== args.clerkId) {
      console.error("Clerk ID mismatch in storeUserFromClerk:", 
                    { 
                      authIdentitySubject: identity?.subject, 
                      argsClerkId: args.clerkId 
                    });
      throw new Error("Unauthorized: Clerk ID does not match authenticated user.");
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (existingUser) {
      const updates: Partial<Doc<"users">> = {};
      if (args.email && existingUser.email !== args.email) {
        updates.email = args.email;
      }
      if (args.firstName && existingUser.firstName !== args.firstName) {
        updates.firstName = args.firstName;
      }
      if (args.lastName && existingUser.lastName !== args.lastName) {
        updates.lastName = args.lastName;
      }
      if (args.imageUrl && existingUser.imageUrl !== args.imageUrl) {
        updates.imageUrl = args.imageUrl;
      }
      
      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(existingUser._id, updates);
      }
      return existingUser._id;
    } else {
      // User does not exist, create a new one
      // Ensure your user schema has a 'name' field or adjust accordingly
      return await ctx.db.insert("users", {
        clerkId: args.clerkId,
        email: args.email,
        firstName: args.firstName,
        lastName: args.lastName,
        imageUrl: args.imageUrl,
        onboarded: false, // Default value
        // role: undefined, // Set a default role if applicable or leave as undefined
      });
    }
  },
});

// ==== PUBLIC MUTATION: Complete User Profile ====

// Profile data validators (subset of fields from schema, excluding userId)
const physiotherapistProfileDataValidator = v.object({
  clinicId: v.optional(v.id("clinics")), 
  specializations: v.optional(v.array(v.string())), 
  licenseNumber: v.optional(v.string()),
  yearsOfExperience: v.optional(v.number()),
  bio: v.optional(v.string()),
});

const patientProfileDataValidator = v.object({
  dateOfBirth: v.optional(v.string()), 
  gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"), v.literal("prefer_not_to_say"))),
  address: v.optional(v.string()),
  phoneNumber: v.optional(v.string()), 
  emergencyContactName: v.optional(v.string()),
  emergencyContactPhone: v.optional(v.string()),
  medicalHistorySummary: v.optional(v.string()),
});

const clinicOwnerProfileDataValidator = v.object({}); 
const familyMemberProfileDataValidator = v.object({ 
    relationshipToPatient: v.optional(v.string()), 
});

export const completeUserProfile = mutation({
  args: {
    role: v.union(
      v.literal("physiotherapist"),
      v.literal("patient"),
      v.literal("clinic_owner"),
      v.literal("family_member")
    ),
    profileData: v.union(
        physiotherapistProfileDataValidator,
        patientProfileDataValidator,
        clinicOwnerProfileDataValidator,
        familyMemberProfileDataValidator
    ),
    firstName: v.optional(v.string()), 
    lastName: v.optional(v.string()),
    finalStep: v.optional(v.boolean()), // Add this parameter
  },
  returns: v.object({ success: v.boolean(), message: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      console.error("[completeUserProfile] Error: User not authenticated.");
      throw new Error("User not authenticated.");
    }
    const clerkId = identity.subject; 
    console.log("[completeUserProfile] Authenticated user clerkId:", clerkId);

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (!user) {
      console.error("[completeUserProfile] Error: User record not found for clerkId:", clerkId);
      throw new Error("User record not found. Please try signing out and in again.");
    }
    console.log("[completeUserProfile] Found user:", user);

    if (user.onboarded && user.role && user.role !== args.role) {
      console.error(`[completeUserProfile] Error: Role change from ${user.role} to ${args.role} is not permitted.`);
      throw new Error(
        `Role change from ${user.role} to ${args.role} is not permitted through this flow.`
      );
    }

    const userUpdatePayload: Partial<Doc<"users">> = {
      role: args.role,
      onboarded: args.finalStep === true, // Only set to true on final step
    };
    if (args.firstName) userUpdatePayload.firstName = args.firstName;
    if (args.lastName) userUpdatePayload.lastName = args.lastName;
    console.log("[completeUserProfile] Initial userUpdatePayload:", userUpdatePayload);

    switch (args.role) {
      case "physiotherapist":
        console.log("[completeUserProfile] Processing physiotherapist role.");
        const physioData = args.profileData as typeof physiotherapistProfileDataValidator.type;
        console.log("[completeUserProfile] Physiotherapist profile data from args:", physioData);
        let physioProfileId: Id<"physiotherapistProfiles">;
        try {
          if (user.physiotherapistProfileId) {
            console.log("[completeUserProfile] Existing physiotherapistProfileId found:", user.physiotherapistProfileId, "Updating profile.");
            await ctx.db.patch(user.physiotherapistProfileId, { ...physioData });
            physioProfileId = user.physiotherapistProfileId;
            console.log("[completeUserProfile] Physiotherapist profile updated. ID:", physioProfileId);
          } else {
            console.log("[completeUserProfile] No existing physiotherapistProfileId. Creating new profile.");
            physioProfileId = await ctx.db.insert("physiotherapistProfiles", {
              userId: user._id,
              ...physioData,
            });
            console.log("[completeUserProfile] New physiotherapist profile created. ID:", physioProfileId);
          }
          userUpdatePayload.physiotherapistProfileId = physioProfileId;
          console.log("[completeUserProfile] physiotherapistProfileId set in userUpdatePayload:", physioProfileId);
        } catch (error) {
          console.error("[completeUserProfile] Error creating/updating physiotherapist profile:", error);
          throw error; // Re-throw to ensure the mutation fails
        }
        break;

      case "patient":
        const patientData = args.profileData as typeof patientProfileDataValidator.type;
        let patientProfileId: Id<"patientProfiles">;
        if (user.patientProfileId) {
            await ctx.db.patch(user.patientProfileId, { ...patientData });
            patientProfileId = user.patientProfileId;
        } else {
            patientProfileId = await ctx.db.insert("patientProfiles", {
              userId: user._id,
              ...patientData,
            });
        }
        userUpdatePayload.patientProfileId = patientProfileId;
        break;

      case "clinic_owner":
        console.log("[completeUserProfile] Processing clinic_owner role.");
        // Add specific logic and logging if necessary
        break;

      case "family_member":
        console.log("[completeUserProfile] Processing family_member role.");
        // Add specific logic and logging if necessary
        break;

      default:
        console.error("[completeUserProfile] Error: Invalid role specified:", args.role);
        throw new Error("Invalid role specified.");
    }

    console.log("[completeUserProfile] Final userUpdatePayload before patching user:", userUpdatePayload);
    try {
      await ctx.db.patch(user._id, userUpdatePayload);
      console.log("[completeUserProfile] User record patched successfully. User ID:", user._id);
    } catch (error) {
      console.error("[completeUserProfile] Error patching user record:", error, "Payload:", userUpdatePayload);
      throw error; // Re-throw to ensure the mutation fails
    }

    return { success: true, message: "Profile completed successfully." };
  },
});

// ==== PUBLIC MUTATION: Update User Role ====
export const updateUserRole = mutation({
  args: {
    role: v.union(
      v.literal("physiotherapist"),
      v.literal("patient"),
      v.literal("clinic_owner"),
      v.literal("family_member")
    ),
  },
  returns: v.object({ success: v.boolean(), message: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("User not authenticated.");
    }
    const clerkId = identity.subject;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (!user) {
      throw new Error("User record not found. Please try signing out and in again.");
    }

    // Update the user's role
    await ctx.db.patch(user._id, {
      role: args.role,
    });

    return { success: true, message: `Role updated to ${args.role} successfully.` };
  },
});

// ==== INTERNAL MUTATION: Delete User from Clerk Data ====
export const deleteUser = internalMutation({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.clerkId) {
      throw new Error("Clerk User ID is required for deletion.");
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (existingUser) {
      // Optional: Delete associated profile data
      // if (existingUser.physiotherapistProfileId) {
      //   await ctx.db.delete(existingUser.physiotherapistProfileId);
      // }
      // if (existingUser.patientProfileId) {
      //   await ctx.db.delete(existingUser.patientProfileId);
      // }
      await ctx.db.delete(existingUser._id);
      console.log(`User with Clerk ID ${args.clerkId} deleted successfully.`);
    } else {
      console.warn(`User with Clerk ID ${args.clerkId} not found for deletion.`);
    }
  },
});
