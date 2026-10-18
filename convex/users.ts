// @ts-nocheck
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, mutation, query, action, QueryCtx, MutationCtx, internalQuery } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import { getAuthenticatedUser, ensureUserRole } from "./auth";
import { publicAppUrl } from "./helpers/appUrl";
import { attributeUserToLink } from "./helpers/partnerAttribution";
import { normalizePhone } from "./helpers/partnerShared";
import { assertSignupAllowed } from "./platformSettings";
import { logSecurityEvent } from "./helpers/securityLog";

// ==== QUERIES ====

/**
 * Display details of another user (chat headers, avatars). Requires a signed-in caller and
 * returns only the name, avatar and role, never contact details. Server code that needs
 * the whole record uses the internal getUserById.
 */
export const getUserPublicProfile = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      imageUrl: user.imageUrl,
      role: user.role,
    };
  },
});

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
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    return user;
  },
});

/**
 * Get a user by email address
 * Used by actions that only know the patient's email (e.g., invitations)
 */
export const getUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    if (!args.email) return null as any
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    return user || null;
  },
});

/**
 * Get a user by ID
 * @returns The user document or null if not found
 */
export const getUserById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

/**
 * Get a user's email by ID
 * Used by the notification system to send emails
 */
export const getUserEmail = internalQuery({
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
      
      const isConvexImage = existingUser.imageUrl?.includes("convex.cloud") || existingUser.imageUrl?.includes("convex.site");
      if (!isConvexImage && existingUser.imageUrl !== (image_url || undefined)) {
        updates.imageUrl = image_url || undefined;
      }

      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(existingUser._id, updates);
      }
      return existingUser._id;
    }

    const claimedId = await claimPlaceholderPatient(ctx, {
      clerkId: clerkId as string,
      verifiedEmail: primaryEmailObj?.verification?.status === "verified" ? email : null,
      firstName: first_name || undefined,
      lastName: last_name || undefined,
      imageUrl: image_url || undefined,
    });
    if (claimedId) return claimedId;

    // User does not exist, create a new one
    const userId = await ctx.db.insert("users", {
      clerkId: clerkId as string,
      email: email as string, // Ensure your schema handles potentially undefined email
      firstName: first_name || undefined,
      lastName: last_name || undefined,
      imageUrl: image_url || undefined,
      role: undefined,
      onboarded: false,
      hasCompletedOnboarding: false,
      onboardingVersion: 1,
    });

    return userId;
  },
});

// ==== PUBLIC MUTATION: Store User from Clerk (Client-Side Sync) ====
// Records created for a patient before they had a Clerk account.
const PLACEHOLDER_CLERK_ID_PREFIXES = ["clinic_patient_", "rehabify_ref_", "joy-whatsapp:"];

/** A Joy (WhatsApp) patient record for this verified phone number, if exactly one exists. */
async function joyPlaceholderByPhone(ctx: MutationCtx, verifiedPhone: string) {
  const e164 = normalizePhone(verifiedPhone);
  if (!e164) return null;
  // Joy stores the number as WhatsApp sent it; try the common spellings of the same number
  const spellings = [...new Set([e164, e164.slice(1), e164.startsWith("+234") ? `0${e164.slice(4)}` : e164])];
  const found = new Map<Id<"users">, Doc<"users">>();
  for (const phone of spellings) {
    const rows = await ctx.db
      .query("users")
      .withIndex("by_phone_number", (q) => q.eq("phoneNumber", phone))
      .collect();
    for (const row of rows) {
      if (row.clerkId.startsWith("joy-whatsapp:") && row.role === "patient") found.set(row._id, row);
    }
  }
  return found.size === 1 ? [...found.values()][0] : null;
}

/**
 * A clinic, referral or Joy may have created this patient before they had an
 * account. Hand that record to the new Clerk user so they see their programme
 * and history. Callers must pass an email or phone number Clerk has verified;
 * the phone only claims Joy records, since Joy identifies people by WhatsApp number.
 */
async function claimPlaceholderPatient(
  ctx: MutationCtx,
  args: {
    clerkId: string;
    verifiedEmail: string | null | undefined;
    verifiedPhone?: string | null;
    firstName?: string;
    lastName?: string;
    imageUrl?: string;
    referredByPartnerCode?: string;
    referralPublicCode?: string;
  }
): Promise<Id<"users"> | null> {
  const email = args.verifiedEmail?.toLowerCase().trim();

  const candidates = email
    ? await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .collect()
    : [];
  const placeholder =
    candidates.find((candidate) =>
      PLACEHOLDER_CLERK_ID_PREFIXES.some((prefix) => candidate.clerkId.startsWith(prefix))
    ) ?? (args.verifiedPhone ? await joyPlaceholderByPhone(ctx, args.verifiedPhone) : null);
  if (!placeholder) return null;

  const isJoyRecord = placeholder.clerkId.startsWith("joy-whatsapp:");
  // Older Joy records have a profile row the user record doesn't point to
  const profileId =
    placeholder.patientProfileId ??
    (await ctx.db.query("patientProfiles").withIndex("by_user_id", (q) => q.eq("userId", placeholder._id)).first())?._id;
  await ctx.db.patch(placeholder._id, {
    patientProfileId: profileId,
    clerkId: args.clerkId,
    // Joy names people "Patient" until it learns their name
    firstName: (placeholder.firstName && placeholder.firstName !== "Patient" ? placeholder.firstName : undefined) || args.firstName || placeholder.firstName,
    lastName: placeholder.lastName || args.lastName,
    imageUrl: placeholder.imageUrl || args.imageUrl,
    email: placeholder.email || email,
    // A Joy patient already has their role and profile; don't send them through onboarding again
    ...(isJoyRecord && placeholder.role === "patient" ? { onboarded: true } : {}),
  });
  return placeholder._id;
}

export const storeUserFromClerk = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    referredByPartnerCode: v.optional(v.string()),
    referralPublicCode: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();

    // Enhanced debugging for authentication issues
    if (!identity) {
      console.error("No authentication identity found in storeUserFromClerk");
      throw new Error("Unauthorized: No authentication identity found. Please ensure you are logged in.");
    }

    if (identity.subject !== args.clerkId) {
      console.error("Clerk ID mismatch in storeUserFromClerk:", {
        authIdentitySubject: identity.subject,
        argsClerkId: args.clerkId,
        identityIssuer: identity.iss,
        identityAudience: identity.aud,
        tokenType: identity.tokenIdentifier
      });
      throw new Error(`Unauthorized: Clerk ID mismatch. Expected: ${identity.subject}, Received: ${args.clerkId}`);
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
      
      const isConvexImage = existingUser.imageUrl?.includes("convex.cloud") || existingUser.imageUrl?.includes("convex.site");
      if (args.imageUrl && !isConvexImage && existingUser.imageUrl !== args.imageUrl) {
        updates.imageUrl = args.imageUrl;
      }

      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(existingUser._id, updates);
      }
      // Partner attribution: only a server-validated, active, live referral-link code
      // counts (client-supplied partner codes are ignored). First partner wins.
      if (args.referralPublicCode && !existingUser.referredByPartnerCode) {
        await attributeUserToLink(ctx, { ...existingUser, ...updates } as Doc<"users">, args.referralPublicCode, "referral_link", { countSignup: true });
      }
      return existingUser._id;
    } else {
      // Only Clerk's verified email is trusted here, never the client argument.
      const claimedId = await claimPlaceholderPatient(ctx, {
        clerkId: args.clerkId,
        verifiedEmail: identity.emailVerified && typeof identity.email === "string" ? identity.email : null,
        // Needs phone_number and phone_number_verified in Clerk's "convex" JWT template
        verifiedPhone: identity.phoneNumberVerified && typeof identity.phoneNumber === "string" ? identity.phoneNumber : null,
        firstName: args.firstName,
        lastName: args.lastName,
        imageUrl: args.imageUrl,
      });
      if (claimedId) {
        const claimed = await ctx.db.get(claimedId);
        if (claimed && args.referralPublicCode) {
          await attributeUserToLink(ctx, claimed, args.referralPublicCode, "referral_link", { countSignup: true });
        }
        return claimedId;
      }

      // User does not exist, create a new one
      const newUserId = await ctx.db.insert("users", {
        clerkId: args.clerkId,
        email: args.email,
        firstName: args.firstName,
        lastName: args.lastName,
        imageUrl: args.imageUrl,
        onboarded: false, // Default value
        hasCompletedOnboarding: false,
        onboardingVersion: 1,
      });
      if (args.referralPublicCode) {
        const created = await ctx.db.get(newUserId);
        if (created) await attributeUserToLink(ctx, created, args.referralPublicCode, "referral_link", { countSignup: true });
      }
      return newUserId;
    }
  },
});

/**
 * Update the authenticated user's profile image from a Convex storage file.
 * Accepts a storageId, resolves it to a public URL, and stores it on the user.
 */
export const updateProfileImageFromStorage = mutation({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.object({ imageUrl: v.string() }),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) {
      throw new Error("User not authenticated");
    }

    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) {
      throw new Error("File not found in storage");
    }

    await ctx.db.patch(user._id, { imageUrl: url });
    return { imageUrl: url };
  },
});

/**
 * Remove the authenticated user's profile image.
 */
export const removeProfileImage = mutation({
  args: {},
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) {
      throw new Error("User not authenticated");
    }

    await ctx.db.patch(user._id, { imageUrl: undefined });
    return { success: true };
  },
});

// ==== PUBLIC MUTATION: Complete User Profile ====

// Profile data validators (subset of fields from schema, excluding userId)
const physiotherapistProfileDataValidator = v.object({
  clinicId: v.optional(v.id("clinics")),
  specializations: v.optional(v.array(v.string())),
  licenseNumber: v.optional(v.string()),
  certificationBoard: v.optional(v.string()),
  certificationYear: v.optional(v.float64()),
  licenseExpiryDate: v.optional(v.string()),
  yearsOfExperience: v.optional(v.float64()),
  bio: v.optional(v.string()),
  dateOfBirth: v.optional(v.string()),
  gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"), v.literal("prefer_not_to_say"))),
  referralSource: v.optional(v.string()),
  location: v.optional(v.string()),
  latitude: v.optional(v.float64()),
  longitude: v.optional(v.float64()),
  availabilitySchedule: v.optional(v.any()),
  isAvailableOnMarketplace: v.optional(v.boolean()),
  offersInPersonSessions: v.optional(v.boolean()),
  offersOnlineSessions: v.optional(v.boolean()),
});

const patientProfileDataValidator = v.object({
  dateOfBirth: v.optional(v.string()),
  gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"), v.literal("prefer_not_to_say"))),
  address: v.optional(v.string()),
  phoneNumber: v.optional(v.string()),
  emergencyContactName: v.optional(v.string()),
  emergencyContactPhone: v.optional(v.string()),
  medicalHistorySummary: v.optional(v.string()),
  preferredLanguage: v.optional(v.string()),
  therapyFor: v.optional(v.string()),
  therapyType: v.optional(v.string()),
  relationshipStatus: v.optional(v.string()),
});

const clinicOwnerProfileDataValidator = v.object({
  referralSource: v.optional(v.string()),
  yearsInBusiness: v.optional(v.number()),
  clinicLocation: v.optional(v.string()),
  clinicImageOutside: v.optional(v.id("_storage")),
  clinicImageInside: v.optional(v.id("_storage")),
  gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"), v.literal("prefer_not_to_say"))),
});
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
    onboardingSkipped: v.optional(v.boolean()), // True if user skipped optional onboarding steps
  },
  returns: v.object({
    success: v.boolean(),
    message: v.optional(v.string()),
    physiotherapistProfileId: v.optional(v.id("physiotherapistProfiles")),
    clinicOwnerProfileId: v.optional(v.id("clinicOwnerProfiles")),
    patientProfileId: v.optional(v.id("patientProfiles"))
  }),
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
      // An explicit flag wins (the physiotherapist skip submits finalStep + onboardingSkipped=true);
      // otherwise finishing onboarding clears a previous skip so the account leaves preview mode
      ...(args.onboardingSkipped !== undefined
        ? { onboardingSkipped: args.onboardingSkipped }
        : args.finalStep === true && { onboardingSkipped: false }),
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
            
            const existingProfile = await ctx.db.get(user.physiotherapistProfileId);
            
            await ctx.db.patch(user.physiotherapistProfileId, {
              ...physioData,
              isAvailableOnMarketplace: physioData.isAvailableOnMarketplace ?? existingProfile?.isAvailableOnMarketplace ?? true,
              offersInPersonSessions: physioData.offersInPersonSessions ?? existingProfile?.offersInPersonSessions ?? true,
              offersOnlineSessions: physioData.offersOnlineSessions ?? existingProfile?.offersOnlineSessions ?? true,
            });
            physioProfileId = user.physiotherapistProfileId;
            console.log("[completeUserProfile] Physiotherapist profile updated. ID:", physioProfileId);
          } else {
            console.log("[completeUserProfile] No existing physiotherapistProfileId. Creating new profile.");
            physioProfileId = await ctx.db.insert("physiotherapistProfiles", {
              userId: user._id,
              ...physioData,
              isAvailableOnMarketplace: physioData.isAvailableOnMarketplace ?? true,
              offersInPersonSessions: physioData.offersInPersonSessions ?? true,
              offersOnlineSessions: physioData.offersOnlineSessions ?? true,
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

        // Extract phoneNumber to update the user record, as it's not in patientProfiles
        const { phoneNumber, ...patientProfileFields } = patientData;

        if (phoneNumber) {
          userUpdatePayload.phoneNumber = phoneNumber;
        }

        let patientProfileId: Id<"patientProfiles">;
        if (user.patientProfileId) {
          await ctx.db.patch(user.patientProfileId, { ...patientProfileFields });
          patientProfileId = user.patientProfileId;
        } else {
          patientProfileId = await ctx.db.insert("patientProfiles", {
            userId: user._id,
            ...patientProfileFields,
          });
        }
        userUpdatePayload.patientProfileId = patientProfileId;
        break;

      case "clinic_owner":
        console.log("[completeUserProfile] Processing clinic_owner role.");

        // Get the clinic owned by this user
        let clinic = await ctx.db
          .query("clinics")
          .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
          .first();

        if (!clinic) {
          if (args.onboardingSkipped) {
            // Auto-provision a starter clinic so the user can preview the dashboard
            const defaultClinicName = args.firstName ? `${args.firstName}'s Clinic` : "My Clinic";
            const newClinicId = await ctx.db.insert("clinics", {
              name: (args.profileData as any)?.clinicName || defaultClinicName,
              ownerId: user._id,
              contactEmail: user.email,
              contactPhone: user.phoneNumber,
              workingHours: {},
              settings: {
                defaultCurrency: "NGN",
                language: "en"
              }
            });
            clinic = await ctx.db.get(newClinicId);
          } else {
            console.error("[completeUserProfile] Error: No clinic found for clinic owner:", user._id);
            throw new Error("No clinic found for this clinic owner. Please complete clinic setup first.");
          }
        }

        // Create or update clinic owner profile
        let clinicOwnerProfileId: Id<"clinicOwnerProfiles">;
        const clinicOwnerData = args.profileData as typeof clinicOwnerProfileDataValidator.type;

        // Extract fields that belong to clinicOwnerProfiles
        // We need to exclude clinicImageOutside, clinicImageInside, clinicLocation as they go to the clinic table
        const { clinicImageOutside, clinicImageInside, clinicLocation, ...profileFields } = clinicOwnerData;

        if (user.clinicOwnerProfileId) {
          // Update existing profile
          console.log("[completeUserProfile] Updating existing clinic owner profile:", user.clinicOwnerProfileId);
          await ctx.db.patch(user.clinicOwnerProfileId, {
            clinicId: clinic._id,
            ...profileFields,
          });
          clinicOwnerProfileId = user.clinicOwnerProfileId;
        } else {
          // Create new profile
          console.log("[completeUserProfile] Creating new clinic owner profile for user:", user._id);
          clinicOwnerProfileId = await ctx.db.insert("clinicOwnerProfiles", {
            userId: user._id,
            clinicId: clinic._id,
            ...profileFields,
          });
          console.log("[completeUserProfile] New clinic owner profile created. ID:", clinicOwnerProfileId);
        }

        // Update Clinic with Location and Images
        const clinicUpdates: any = {};
        if ((args.profileData as any).clinicLocation) clinicUpdates.location = (args.profileData as any).clinicLocation;
        if ((args.profileData as any).clinicImageOutside) clinicUpdates.clinicImageOutside = (args.profileData as any).clinicImageOutside;
        if ((args.profileData as any).clinicImageInside) clinicUpdates.clinicImageInside = (args.profileData as any).clinicImageInside;

        if (Object.keys(clinicUpdates).length > 0) {
          await ctx.db.patch(clinic._id, clinicUpdates);
        }

        userUpdatePayload.clinicOwnerProfileId = clinicOwnerProfileId;
        console.log("[completeUserProfile] clinicOwnerProfileId set in userUpdatePayload:", clinicOwnerProfileId);
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

    // For physiotherapists and clinic owners, create approval request after final step
    if (args.finalStep && (args.role === "physiotherapist" || args.role === "clinic_owner")) {
      console.log("[completeUserProfile] Creating approval request for", args.role);

      // Check if approval request already exists
      const existingApproval = await ctx.db
        .query("accountApprovalStatus")
        .withIndex("by_user_id", (q) => q.eq("userId", user._id))
        .unique();

      // Only a new application (or a resubmission after a decline) notifies anyone. Re-running the
      // final step, e.g. a page reload, must not spam the applicant and every admin again.
      let isNewSubmission = false;
      if (!existingApproval) {
        await ctx.db.insert("accountApprovalStatus", {
          userId: user._id,
          status: "pending_review",
          submittedAt: Date.now(),
          requiredDocuments: args.role === "physiotherapist"
            ? ["Professional License", "Certification Documents"]
            : ["Business License", "Tax Registration", "Owner Identification"]
        });
        isNewSubmission = true;
        console.log("[completeUserProfile] Approval request created for user:", user._id);
      } else if (existingApproval.status === "declined") {
        await ctx.db.patch(existingApproval._id, {
          status: "pending_review",
          submittedAt: Date.now(),
        });
        isNewSubmission = true;
      }

      if (isNewSubmission) {
      // Create notification for user about pending review
      await ctx.db.insert("notifications", {
        userId: user._id,
        type: "onboarding_complete",
        priority: "medium",
        status: "pending",
        payload: {
          title: "Application Submitted for Review",
          body: "Your application has been submitted and is pending approval from our administrators. You will be notified once your account is approved and you can access all features.",
          data: {
            actionUrl: "/dashboard",
            metadata: {
              role: args.role,
            },
          },
        },
        createdAt: Date.now(),
      });
      console.log("[completeUserProfile] Pending review notification created for user:", user._id);

      // Notify all admins in-app and via email that approval is required
      try {
        const admins = await ctx.db
          .query("users")
          .withIndex("by_role", (q) => q.eq("role", "admin"))
          .collect();

        const displayName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || (user.email || "User");
        const roleLabel = args.role === "physiotherapist" ? "Physiotherapist" : "Clinic Owner";
        const appUrl = publicAppUrl();
        const adminActionPath = `/admin/users/${user._id}`;
        const adminDashboardLink = `${appUrl}${adminActionPath}`;

        console.log(`[completeUserProfile] Notifying ${admins.length} admin(s) about ${roleLabel} onboarding completion for ${displayName}`);

        for (const admin of admins) {
          // In-app notification to admin
          await ctx.db.insert("notifications", {
            userId: admin._id,
            type: "onboarding_complete",
            priority: "high",
            status: "pending",
            payload: {
              title: `Approval Required: ${roleLabel} Onboarding Submitted`,
              body: `${displayName} has completed onboarding and is awaiting approval.`,
              data: {
                entityId: String(user._id),
                entityType: "user",
                actionUrl: adminActionPath,
                metadata: {
                  role: args.role,
                },
              },
            },
            createdAt: Date.now(),
          });

          // Email to admin (if email exists)
          if (admin.email) {
            console.log(`[completeUserProfile] Scheduling email to admin ${admin.email} for ${displayName} onboarding approval`);
            await ctx.scheduler.runAfter(0, internal.actions.emails.sendOnboardingNotificationEmail.sendOnboardingNotificationEmail, {
              adminEmail: admin.email,
              userName: `${displayName} (${roleLabel})`,
              adminDashboardLink,
              userRole: roleLabel,
              submittedAt: Date.now(),
            });
          } else {
            console.warn(`[completeUserProfile] Admin ${admin._id} has no email address, skipping email notification`);
          }
        }

        console.log(`[completeUserProfile] Admin notifications complete for ${displayName}`);
      } catch (notifyError) {
        console.error("[completeUserProfile] Failed to notify admins of onboarding completion:", notifyError);
        // Log the error details for debugging
        if (notifyError instanceof Error) {
          console.error("[completeUserProfile] Error details:", {
            message: notifyError.message,
            stack: notifyError.stack,
          });
        }
      }
      }
    }

    return {
      success: true,
      message: "Profile completed successfully.",
      physiotherapistProfileId: userUpdatePayload.physiotherapistProfileId,
      clinicOwnerProfileId: userUpdatePayload.clinicOwnerProfileId,
      patientProfileId: userUpdatePayload.patientProfileId
    };
  },
});

// ==== PUBLIC MUTATION: Update User Role ====
export const updateUserRole = mutation({
  args: {
    role: v.union(
      v.literal("physiotherapist"),
      v.literal("patient"),
      v.literal("clinic_owner"),
      v.literal("family_member"),
      v.literal("doctor")
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

    // Admin Settings can pause new registrations per role (convex/platformSettings.ts)
    if (user.role !== args.role) {
      await assertSignupAllowed(ctx, args.role);
    }

    // Update the user's role
    await ctx.db.patch(user._id, {
      role: args.role,
    });
    if (user.role !== args.role) {
      await logSecurityEvent(ctx, "role_changed", {
        userId: user._id,
        details: { from: user.role ?? null, to: args.role, by: "self" },
      });
    }

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

/**
 * Set user role (admin only)
 */
export const setUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(
      v.literal("patient"),
      v.literal("physiotherapist"),
      v.literal("clinic_owner"),
      v.literal("family_member"),
      v.literal("admin")
    ),
  },
  handler: async (ctx, args) => {
    // Verify the user making the change is an admin
    const adminUser = await ensureUserRole(ctx, ["admin"]);

    // Get the user to update
    const userToUpdate = await getUserByIdOrThrow(ctx, args.userId);

    // An admin removing their own admin role would lock themselves out of the console
    if (userToUpdate._id === adminUser._id && args.role !== "admin") {
      throw new Error("You cannot remove your own admin role.");
    }

    // Update their role
    await ctx.db.patch(args.userId, {
      role: args.role,
      onboarded: true,
    });
    if (userToUpdate.role !== args.role) {
      await logSecurityEvent(ctx, "role_changed", {
        userId: args.userId,
        details: { from: userToUpdate.role ?? null, to: args.role, by: adminUser._id },
      });
    }

    // Create notification for role change
    const roleNames = {
      patient: "Patient",
      physiotherapist: "Physiotherapist",
      clinic_owner: "Clinic Owner",
      family_member: "Family Member",
      admin: "Administrator"
    };

    await ctx.runMutation(api.notifications.create, {
      userId: args.userId,
      type: "account_approved",
      payload: {
        title: `Role Updated to ${roleNames[args.role]}`,
        body: `Your account role has been updated to ${roleNames[args.role]} on Rehabify Health.`,
        data: {
          entityType: "role_change",
          actionUrl: "/dashboard",
        },
      }
    });

    return args.userId;
  },
});

/**
 * Get all admin users (for sending notifications)
 */
export const getAllAdmins = internalQuery({
  args: {},
  handler: async (ctx) => {
    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .collect();

    return admins;
  },
});

/**
 * Most recent users (admin only).
 * @deprecated Admin pages use the paginated `adminListUsers` instead. Kept (bounded) for
 * any older caller; it never returns more than the newest 500 accounts.
 */
export const getAllUsers = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    return await ctx.db.query("users").order("desc").take(500);
  },
});

const ADMIN_LISTABLE_ROLES = [
  "physiotherapist",
  "clinic_owner",
  "patient",
  "family_member",
  "doctor",
  "admin",
  "partner",
  "clinic_staff",
] as const;

const adminRoleFilterValidator = v.union(
  ...ADMIN_LISTABLE_ROLES.map((role) => v.literal(role)),
  // Accounts that never finished onboarding have no role yet
  v.literal("none")
);

function looksLikeEmail(term: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(term);
}

/**
 * Admin users list, newest first, paginated (use with usePaginatedQuery).
 *
 * - `role` reads through the by_role index ("none" = accounts with no role yet).
 * - `search` that looks like a full email address is an exact by_email lookup (one page).
 * - Any other `search` matches name/email/phone *within each page* only: a page can come
 *   back with fewer rows (or none) while `isDone` is still false, and the caller keeps
 *   loading more to scan further back. There is no search index on users, so this keeps
 *   reads bounded at the cost of not being a global search.
 */
export const adminListUsers = query({
  args: {
    paginationOpts: paginationOptsValidator,
    role: v.optional(adminRoleFilterValidator),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);

    const term = (args.search ?? "").trim();
    const roleMatches = (u: Doc<"users">) =>
      !args.role || (args.role === "none" ? !u.role : u.role === args.role);

    const withApproval = async (users: Doc<"users">[]) =>
      Promise.all(
        users.map(async (u) => {
          const approval = await ctx.db
            .query("accountApprovalStatus")
            .withIndex("by_user_id", (q) => q.eq("userId", u._id))
            .first();
          return {
            _id: u._id,
            _creationTime: u._creationTime,
            firstName: u.firstName,
            lastName: u.lastName,
            email: u.email,
            imageUrl: u.imageUrl,
            phoneNumber: u.phoneNumber,
            role: u.role,
            onboarded: u.onboarded,
            status: u.status,
            lastLoginAt: u.lastLoginAt,
            approvalStatus: approval?.status ?? null,
          };
        })
      );

    if (term && looksLikeEmail(term)) {
      const variants = Array.from(new Set([term, term.toLowerCase()]));
      const found = new Map<string, Doc<"users">>();
      for (const email of variants) {
        const rows = await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", email))
          .take(10);
        rows.forEach((u) => found.set(u._id, u));
      }
      const page = await withApproval(Array.from(found.values()).filter(roleMatches));
      return { page, isDone: true, continueCursor: "" };
    }

    const base = args.role
      ? ctx.db
          .query("users")
          .withIndex("by_role", (q) => q.eq("role", args.role === "none" ? undefined : args.role))
      : ctx.db.query("users");

    const result = await base.order("desc").paginate(args.paginationOpts);

    let rows = result.page;
    if (term) {
      const needle = term.toLowerCase();
      rows = rows.filter((u) => {
        const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase();
        return (
          name.includes(needle) ||
          (u.email ?? "").toLowerCase().includes(needle) ||
          (u.phoneNumber ?? "").includes(needle)
        );
      });
    }

    return { ...result, page: await withApproval(rows) };
  },
});

const ROLE_COUNT_CAP = 500;

/**
 * Account counts per role for the Users & roles page. Each count reads at most
 * ROLE_COUNT_CAP rows through the by_role index; `capped` lists roles that hit the cap
 * (show those as "500+").
 */
export const adminUserRoleCounts = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    const roles = [...ADMIN_LISTABLE_ROLES, "none"] as const;
    const counts: Record<string, number> = {};
    const capped: string[] = [];
    await Promise.all(
      roles.map(async (role) => {
        const rows = await ctx.db
          .query("users")
          .withIndex("by_role", (q) => q.eq("role", role === "none" ? undefined : role))
          .take(ROLE_COUNT_CAP);
        counts[role] = rows.length;
        if (rows.length >= ROLE_COUNT_CAP) capped.push(role);
      })
    );
    return { counts, capped, cap: ROLE_COUNT_CAP };
  },
});

/**
 * Create (or promote) an admin user for initial setup.
 *
 * Internal only: run it from the Convex dashboard or CLI, e.g.
 *   npx convex run users:createAdminUser '{"clerkId":"user_...","email":"...","firstName":"...","lastName":"..."}'
 * Only people with deploy access can call internal functions, so no shared secret is needed.
 */
export const createAdminUser = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    firstName: v.string(),
    lastName: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (existingUser) {
      // Just update to admin role
      await ctx.db.patch(existingUser._id, {
        role: "admin",
        onboarded: true,
      });
      return existingUser._id;
    }

    // Create new admin user
    const adminId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      firstName: args.firstName,
      lastName: args.lastName,
      role: "admin",
      onboarded: true,
    });

    return adminId;
  },
});

/**
 * Clear the onboardingSkipped flag when a physiotherapist completes their remaining onboarding steps
 */
export const clearOnboardingSkipped = mutation({
  args: {},
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("User not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    if (user.onboardingSkipped) {
      await ctx.db.patch(user._id, { onboardingSkipped: false });
    }

    return { success: true };
  },
});

export const completeTour = mutation({
  args: { tourId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const currentTours = user.toursCompleted || [];
    if (!currentTours.includes(args.tourId)) {
      await ctx.db.patch(user._id, {
        toursCompleted: [...currentTours, args.tourId],
      });
    }
  },
});

/**
 * Promote an existing user to admin
 */
export const promoteToAdmin = internalMutation({
  args: {
    userId: v.id("users"),
    promotedByAdminId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify the promoter is an admin
    const promoter = await getUserByIdOrThrow(ctx, args.promotedByAdminId);
    if (promoter.role !== "admin") {
      throw new Error("Only admins can promote other users to admin");
    }

    // Get the user to promote
    const userToPromote = await getUserByIdOrThrow(ctx, args.userId);

    // Update their role
    await ctx.db.patch(args.userId, {
      role: "admin",
      onboarded: true,
    });

    // Create notification for the newly promoted admin
    await ctx.runMutation(api.notifications.create, {
      userId: args.userId,
      type: "account_approved",
      payload: {
        title: "Promoted to Administrator",
        body: "You have been promoted to administrator role on Rehabify Health.",
        data: {
          entityType: "role_promotion",
          actionUrl: "/dashboard/admin",
        },
      }
    });

    return args.userId;
  },
});

/**
 * Get the onboarding status of the current user
 */
export const getOnboardingStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) return null;

    return {
      hasCompletedOnboarding: user.hasCompletedOnboarding ?? false,
      onboardingVersion: user.onboardingVersion ?? 0,
    };
  },
});

/**
 * Mark the onboarding tour as complete for the current user
 */
export const completeOnboarding = mutation({
  args: {
    version: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) throw new Error("Unauthenticated");

    await ctx.db.patch(user._id, {
      hasCompletedOnboarding: true,
      onboardingVersion: args.version,
    });
  },
});


// ==== ADMIN APPROVAL WORKFLOW ====

/**
 * Send a real test of the account-approval email (same Resend template and sender the
 * approval workflow uses) so admins can check email delivery end to end.
 * Defaults to the calling admin's own address. Returns the provider's actual result.
 */
export const testNotificationEmail = action({
  args: {
    testEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Sends real email: admins only.
    await ctx.runQuery(internal.monthlySettlements.assertAdminForAction, {});

    const adminUser = await ctx.runQuery(api.users.getMyUser);
    if (!adminUser) {
      throw new Error("No authenticated user found");
    }

    const testEmail = (args.testEmail ?? "").trim() || adminUser.email;
    if (!testEmail || !looksLikeEmail(testEmail)) {
      throw new Error("Enter a valid email address to send the test to.");
    }

    const adminName = `${adminUser.firstName ?? ""} ${adminUser.lastName ?? ""}`.trim() || "Admin";
    const result = await ctx.runAction(internal.actions.emails.sendApprovalEmail.sendApprovalEmail, {
      userEmail: testEmail,
      userName: `${adminName} (test)`,
      userRole: "Test recipient",
      dashboardLink: `${publicAppUrl()}/dashboard/admin`,
    });

    return {
      success: result.success,
      testEmail,
      messageId: result.messageId,
      error: result.error,
      message: result.success
        ? `Test approval email accepted by the provider for ${testEmail}${result.messageId ? ` (id ${result.messageId})` : ""}.`
        : `Sending to ${testEmail} failed: ${result.error ?? "unknown error"}`,
    };
  },
});

/**
 * Clean up orphaned approval records (where user no longer exists).
 * Scans one batch of approval records per call; pass back `continueCursor` until `isDone`.
 */
export const cleanupOrphanedApprovals = mutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    // Verify admin access
    await ensureUserRole(ctx, ["admin"]);

    const batch = await ctx.db
      .query("accountApprovalStatus")
      .paginate({ numItems: 200, cursor: args.cursor ?? null });

    let deletedCount = 0;
    const orphanedRecords = [];

    for (const approval of batch.page) {
      const user = await ctx.db.get(approval.userId);
      if (!user) {
        // User no longer exists, delete the approval record
        await ctx.db.delete(approval._id);
        deletedCount++;
        orphanedRecords.push({
          approvalId: approval._id,
          userId: approval.userId,
          status: approval.status,
          submittedAt: approval.submittedAt,
        });
      }
    }

    return {
      success: true,
      deletedCount,
      orphanedRecords,
      scanned: batch.page.length,
      isDone: batch.isDone,
      continueCursor: batch.continueCursor,
    };
  },
});

/**
 * Debug query: the most recent approval status records (max 300) with their users.
 * Used by the dev-only /dashboard/admin/approvals/debug page.
 */
export const debugApprovalStatus = query({
  args: {},
  handler: async (ctx) => {
    // Verify admin access
    await ensureUserRole(ctx, ["admin"]);

    const allApprovals = await ctx.db
      .query("accountApprovalStatus")
      .order("desc")
      .take(300);

    const approvalWithUserData = await Promise.all(
      allApprovals.map(async (approval) => {
        const user = await ctx.db.get(approval.userId);
        return {
          ...approval,
          user: user ? {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phoneNumber: user.phoneNumber,
            role: user.role,
            imageUrl: user.imageUrl,
          } : null,
        };
      })
    );

    return approvalWithUserData;
  },
});

/**
 * Get pending approval requests for admin review
 */
export const getPendingApprovals = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("accountApprovalStatus"),
    _creationTime: v.number(),
    userId: v.id("users"),
    status: v.string(),
    submittedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id("users")),
    comments: v.optional(v.string()),
    requiredDocuments: v.optional(v.array(v.string())),
    user: v.any(),
  })),
  handler: async (ctx) => {
    // Verify admin access
    await ensureUserRole(ctx, ["admin"]);

    // Bounded: the review queue is small in practice, and the dashboard only needs the
    // oldest 500 waiting applications.
    const pendingApprovals = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_status", (q) => q.eq("status", "pending_review"))
      .take(500);

    const approvalWithUserData = await Promise.all(
      pendingApprovals.map(async (approval) => {
        const user = await ctx.db.get(approval.userId);
        return {
          ...approval,
          user: user ? {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phoneNumber: user.phoneNumber,
            role: user.role,
            imageUrl: user.imageUrl,
          } : null,
        };
      })
    );

    return approvalWithUserData.filter(item => item.user !== null);
  },
});

/**
 * Get declined approval requests for admin review
 */
export const getDeclinedApprovals = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("accountApprovalStatus"),
    _creationTime: v.number(),
    userId: v.id("users"),
    status: v.string(),
    submittedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id("users")),
    comments: v.optional(v.string()),
    requiredDocuments: v.optional(v.array(v.string())),
    user: v.any(),
  })),
  handler: async (ctx) => {
    // Verify admin access
    await ensureUserRole(ctx, ["admin"]);

    // Bounded: the newest 300 declined records (declines only accumulate over time).
    const declinedApprovals = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_status", (q) => q.eq("status", "declined"))
      .order("desc")
      .take(300);

    const approvalWithUserData = await Promise.all(
      declinedApprovals.map(async (approval) => {
        const user = await ctx.db.get(approval.userId);
        return {
          ...approval,
          user: user ? {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phoneNumber: user.phoneNumber,
            role: user.role,
            imageUrl: user.imageUrl,
          } : null,
        };
      })
    );

    // Sort by most recently reviewed first
    const sortedDeclined = approvalWithUserData.filter(item => item.user !== null).sort((a, b) => {
      const timeA = a.reviewedAt || a.submittedAt || 0;
      const timeB = b.reviewedAt || b.submittedAt || 0;
      return timeB - timeA;
    });

    return sortedDeclined;
  },
});

/**
 * Approve a user account
 */
export const approveUser = mutation({
  args: {
    userId: v.id("users"),
    comments: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    // Verify admin access
    const currentUser = await ensureUserRole(ctx, ["admin"]);

    // Get user and approval status
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const approvalStatus = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .unique();

    if (!approvalStatus) {
      throw new Error("No approval request found for this user");
    }

    if (approvalStatus.status !== "pending_review") {
      throw new Error("User has already been reviewed");
    }

    // Update approval status
    await ctx.db.patch(approvalStatus._id, {
      status: "approved",
      reviewedAt: Date.now(),
      reviewedBy: currentUser._id,
      comments: args.comments,
    });

    // Update user status to active and onboarded so they can access the dashboard immediately
    await ctx.db.patch(user._id, {
      status: "active",
      onboarded: true,
    });

    // Create notification for user with email
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'User';
    const dashboardLink = user.role === "physiotherapist" ? "/dashboard/physiotherapist"
      : user.role === "clinic_owner" ? "/dashboard/clinic"
        : "/dashboard";

    // Create approval notification and send email
    const notificationId = await ctx.db.insert("notifications", {
      userId: args.userId,
      type: "account_approved",
      status: "pending",
      priority: "high",
      createdAt: Date.now(),
      payload: {
        title: "Account Approved! 🎉",
        body: "Your account has been approved by our administrators. You can now access your dashboard and start using all features.",
        data: {
          entityType: "account_approval",
          actionUrl: dashboardLink,
          metadata: {
            approvedBy: currentUser._id,
            comments: args.comments,
            email: {
              subject: "🎉 Your Rehabify Health Account Has Been Approved!",
              htmlBody: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="background-color: #0078D4; color: white; padding: 20px; text-align: center;">
                    <h1>🎉 Rehabify Health</h1>
                  </div>
                  <div style="padding: 20px; border: 1px solid #e0e0e0;">
                    <h2>Account Approved!</h2>
                    <p>Hi ${userName},</p>
                    <p>Great news! Your Rehabify Health account has been approved.</p>
                    <p>You now have full access to the platform and all its features.</p>
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${publicAppUrl()}${dashboardLink}" 
                         style="background-color: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                        🚀 Access Your Dashboard
                      </a>
                    </div>
                    ${args.comments ? `<div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0;"><strong>Admin Notes:</strong> ${args.comments}</div>` : ''}
                    <p>If you have any questions, please contact our support team.</p>
                    <p>Welcome to Rehabify Health! 🏥</p>
                  </div>
                  <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
                    <p>&copy; ${new Date().getFullYear()} Rehabify Health. All rights reserved.</p>
                  </div>
                </div>
              `,
              textBody: `
                Hi ${userName},
                
                Great news! Your Rehabify Health account has been approved.
                
                You now have full access to the platform and all its features.
                
Visit your dashboard: ${publicAppUrl()}${dashboardLink}
                
                ${args.comments ? `Admin Notes: ${args.comments}` : ''}
                
                If you have any questions, please contact our support team.
                
Welcome to Rehabify Health!
                
                © ${new Date().getFullYear()} Rehabify Health. All rights reserved.
              `,
              template: "account_approved"
            },
          },
        },
      },
    });

    // Send approval email using existing email service
    if (user.email) {
      console.log(`Approval email would be sent to: ${user.email}`);

      // Schedule email sending using the approval email action
      try {
        const roleDisplayName = user.role === "physiotherapist" ? "Physiotherapist"
          : user.role === "clinic_owner" ? "Clinic Owner"
            : "User";

        // Send approval notification with email using integrated system
        await ctx.scheduler.runAfter(0, internal.notifications.email.sendApprovalNotificationWithEmail, {
          userId: args.userId,
          comments: args.comments,
        });
        console.log(`Approval notification with email scheduled for: ${user.email}`);
      } catch (emailError) {
        console.error(`Failed to schedule approval notification for ${user.email}:`, emailError);
        // Don't fail the entire approval process if email fails
      }
    }

    return { success: true, message: "User approved successfully" };
  },
});

/**
 * Decline a user account
 */
export const declineUser = mutation({
  args: {
    userId: v.id("users"),
    comments: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    // Verify admin access
    const currentUser = await ensureUserRole(ctx, ["admin"]);

    // Get user and approval status
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const approvalStatus = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .unique();

    if (!approvalStatus) {
      throw new Error("No approval request found for this user");
    }

    if (approvalStatus.status !== "pending_review") {
      throw new Error("User has already been reviewed");
    }

    // Update approval status
    await ctx.db.patch(approvalStatus._id, {
      status: "declined",
      reviewedAt: Date.now(),
      reviewedBy: currentUser._id,
      comments: args.comments,
    });

    // Create notification for user with email
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'User';
    const supportLink = "/support";

    // Create decline notification
    const notificationId = await ctx.db.insert("notifications", {
      userId: args.userId,
      type: "account_declined",
      status: "pending",
      createdAt: Date.now(),
      priority: "high",
      retryCount: 0,
      payload: {
        title: "Account Review Update",
        body: "Your account application has been reviewed. Please contact support for more information.",
        data: {
          entityType: "account_approval",
          actionUrl: supportLink,
          metadata: {
            reviewedBy: currentUser._id,
            comments: args.comments,
          },
        },
      },
    });

    // Send decline email using existing email service
    if (user.email) {
      console.log(`Decline email would be sent to: ${user.email} with comments: ${args.comments}`);

      // Schedule email sending using the decline email action
      try {
        const roleDisplayName = user.role === "physiotherapist" ? "Physiotherapist"
          : user.role === "clinic_owner" ? "Clinic Owner"
            : "User";

        // Send decline notification with email using integrated system
        await ctx.scheduler.runAfter(0, internal.notifications.email.sendDeclineNotificationWithEmail, {
          userId: args.userId,
          reason: args.comments,
        });
        console.log(`Decline notification with email scheduled for: ${user.email}`);
      } catch (emailError) {
        console.error(`Failed to schedule decline notification for ${user.email}:`, emailError);
        // Don't fail the entire decline process if email fails
      }
    }

    return { success: true, message: "User account declined and notification sent" };
  },
});

/**
 * Get user's approval status
 */
export const getUserApprovalStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);

    const approvalStatus = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .unique();

    return approvalStatus;
  },
});

/**
 * Create approval request when user completes onboarding
 */
export const createApprovalRequest = internalMutation({
  args: {
    userId: v.id("users"),
    requiredDocuments: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // Check if approval request already exists
    const existingApproval = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .unique();

    if (existingApproval) {
      return existingApproval._id;
    }

    // Create new approval request
    const approvalId = await ctx.db.insert("accountApprovalStatus", {
      userId: args.userId,
      status: "pending_review",
      submittedAt: Date.now(),
      requiredDocuments: args.requiredDocuments,
    });

    return approvalId;
  },
});

// getUserById is already defined earlier in the file, removing duplicate

/**
 * Create test user for system testing (Internal Mutation)
 */
export const createTestUser = internalMutation({
  args: {
    email: v.string(),
    role: v.union(v.literal("physiotherapist"), v.literal("clinic_owner"), v.literal("patient")),
  },
  handler: async (ctx, args) => {
    const testUserId = await ctx.db.insert("users", {
      clerkId: `test-clerk-${Date.now()}`,
      email: args.email,
      firstName: "Test",
      lastName: "User",
      role: args.role,
      onboarded: true,
    });

    return testUserId;
  },
});

/**
 * Delete test user (Internal Mutation)
 */
export const deleteTestUser = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    clerkId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let user: Doc<"users"> | null = null;
    if (args.userId) {
      user = await ctx.db.get(args.userId);
    } else if (args.clerkId) {
      user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId!))
        .unique();
    }

    if (user) {
      await ctx.db.delete(user._id);
      console.log(`[deleteTestUser] Deleted user with clerkId: ${args.clerkId}`);
    } else {
      console.log(`[deleteTestUser] No user found with clerkId: ${args.clerkId}`);
    }
  },
});

/**
 * Mark clinic owner as onboarded if they have a clinic
 */
export const markClinicOwnerOnboarded = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);

    if (user.role !== "clinic_owner") {
      throw new Error("Only clinic owners can use this function");
    }

    if (user.onboarded) {
      return { success: true, message: "User is already onboarded" };
    }

    // Check if user has a clinic
    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .first();

    if (!clinic) {
      throw new Error("No clinic found. Please complete clinic setup first.");
    }

    // Create or update clinic owner profile
    let clinicOwnerProfileId: Id<"clinicOwnerProfiles">;

    if (user.clinicOwnerProfileId) {
      await ctx.db.patch(user.clinicOwnerProfileId, {
        clinicId: clinic._id,
      });
      clinicOwnerProfileId = user.clinicOwnerProfileId;
    } else {
      clinicOwnerProfileId = await ctx.db.insert("clinicOwnerProfiles", {
        userId: user._id,
        clinicId: clinic._id,
      });
    }

    // Mark user as onboarded
    await ctx.db.patch(user._id, {
      onboarded: true,
      clinicOwnerProfileId,
    });

    return { success: true, message: "Clinic owner marked as onboarded" };
  },
});

/**
 * Bootstrap first admin user - INTERNAL ONLY
 * This is used to create the first admin without authentication checks
 */
export const bootstrapAdmin = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Update user to admin role
    await ctx.db.patch(args.userId, {
      role: "admin",
      onboarded: true,
    });

    console.log(`User ${args.userId} has been set as admin`);
    return { success: true, userId: args.userId };
  },
});

// ==== PUBLIC MUTATION: Update User Preferences ====
export const updateUserPreferences = mutation({
  args: {
    preferences: v.object({
      timezone: v.optional(v.string()),
      language: v.optional(v.string()),
      dateFormat: v.optional(v.string()),
      timeFormat: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) throw new Error("Unauthenticated");

    await ctx.db.patch(user._id, {
      preferences: {
        ...user.preferences,
        ...args.preferences,
      },
    });
  },
});

export const updateNotificationPreferences = mutation({
  args: {
    notificationPreferences: v.object({
      appointmentReminders: v.optional(v.boolean()),
      newPatientRegistrations: v.optional(v.boolean()),
      emailNotifications: v.optional(v.boolean()),
      pushNotifications: v.optional(v.boolean()),
      marketingCommunications: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) throw new Error("Unauthenticated");

    await ctx.db.patch(user._id, {
      notificationPreferences: {
        ...user.notificationPreferences,
        ...args.notificationPreferences,
      },
    });
  },
});

// ==== PUBLIC MUTATION: Update Physiotherapist Profile ====
export const updatePhysiotherapistProfile = mutation({
  args: {
    // User fields
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),

    // Profile fields
    specializations: v.optional(v.array(v.string())),
    bio: v.optional(v.string()),
    yearsOfExperience: v.optional(v.number()),
    languagesSpoken: v.optional(v.array(v.string())),
    location: v.optional(v.string()),
    isAvailableOnMarketplace: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user || user.role !== "physiotherapist") {
      throw new Error("Unauthorized or not a physiotherapist");
    }

    // Update User fields if provided
    const userUpdates: any = {};
    if (args.firstName !== undefined) userUpdates.firstName = args.firstName;
    if (args.lastName !== undefined) userUpdates.lastName = args.lastName;
    if (args.phoneNumber !== undefined) userUpdates.phoneNumber = args.phoneNumber;

    if (Object.keys(userUpdates).length > 0) {
      await ctx.db.patch(user._id, userUpdates);
    }

    // Update Profile fields
    let profileId = user.physiotherapistProfileId;

    // Fallback: if the user record is missing the profileId backlink,
    // try looking up the profile directly from physiotherapistProfiles table
    if (!profileId) {
      const profileByUserId = await ctx.db
        .query("physiotherapistProfiles")
        .withIndex("by_user_id", (q: any) => q.eq("userId", user._id))
        .first();

      if (profileByUserId) {
        profileId = profileByUserId._id;
        // Self-heal: patch the user record so future calls don't need this fallback
        await ctx.db.patch(user._id, { physiotherapistProfileId: profileId });
      } else {
        throw new Error("Physiotherapist profile not found");
      }
    }

    const profileUpdates: any = {};
    if (args.specializations !== undefined) profileUpdates.specializations = args.specializations;
    if (args.bio !== undefined) profileUpdates.bio = args.bio;
    if (args.yearsOfExperience !== undefined) profileUpdates.yearsOfExperience = args.yearsOfExperience;
    if (args.languagesSpoken !== undefined) profileUpdates.languagesSpoken = args.languagesSpoken;
    if (args.location !== undefined) profileUpdates.location = args.location;
    if (args.isAvailableOnMarketplace !== undefined) profileUpdates.isAvailableOnMarketplace = args.isAvailableOnMarketplace;

    if (Object.keys(profileUpdates).length > 0) {
      await ctx.db.patch(profileId, profileUpdates);
    }
  },
});

/**
 * Completely delete a user and their associated profiles from the system
 */
export const adminDeleteUser = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify admin access
    const currentUser = await ensureUserRole(ctx, ["admin"]);

    if (currentUser._id === args.userId) {
      throw new Error("You cannot delete your own admin account.");
    }

    const userToDelete = await ctx.db.get(args.userId);
    if (!userToDelete) {
      throw new Error("User not found");
    }

    // 1. Delete associated profiles based on role
    if (userToDelete.patientProfileId) {
      await ctx.db.delete(userToDelete.patientProfileId);
    }
    if (userToDelete.physiotherapistProfileId) {
      await ctx.db.delete(userToDelete.physiotherapistProfileId);
    }
    if (userToDelete.clinicOwnerProfileId) {
      await ctx.db.delete(userToDelete.clinicOwnerProfileId);
    }

    // 2. Delete any pending accountApprovalStatus for this user
    const approvals = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .collect();
    
    for (const approval of approvals) {
      await ctx.db.delete(approval._id);
    }

    // 3. Delete the user
    await ctx.db.delete(args.userId);

    // Optional: Log the deletion
    console.log(`Admin ${currentUser._id} deleted user ${args.userId} (${userToDelete.email})`);

    return { success: true, message: "User deleted successfully" };
  },
});
