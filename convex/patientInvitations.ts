import { insertNotification } from "./helpers/pushNotify";
import { ConvexError, Infer, v } from "convex/values";
import { query, mutation, internalQuery, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { ensureUserNumbers } from "./helpers/rehabifyIds";
import { recordMissingPolicyAcceptances } from "./helpers/policyAcceptance";
import { PATIENT_CONSENT_POLICIES } from "../lib/policies";

/** An unguessable invitation code (the link is what lets someone accept it). */
function newInvitationCode(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
}

/** "a•••@gmail.com": enough to recognise your own address without showing it to whoever holds the link. */
function maskEmail(email: string | undefined): string | null {
  if (!email) return null;
  const [name, domain] = email.trim().split("@");
  if (!name || !domain) return null;
  return `${name[0]}•••@${domain}`;
}

const CLINIC_INVITE_DAYS = 30;

/**
 * A clinic's invitation link for a patient it added (clinicTools.addClinicPatient): the same
 * /patient-invite/<code> page physios use, showing the clinic and the patient's clinician.
 * Earlier unused links for this patient at this clinic stop working, so only the newest email counts.
 */
export async function createClinicPatientInvitation(
  ctx: MutationCtx,
  input: { clinic: Doc<"clinics">; clinicianId: Id<"users">; patient: Doc<"users"> }
): Promise<string> {
  const email = input.patient.email?.trim().toLowerCase();
  if (email) {
    const earlier = await ctx.db
      .query("patientInvitations")
      .withIndex("by_patient_email", (q) => q.eq("patientEmail", email))
      .collect();
    for (const row of earlier) {
      if (row.status === "pending" && row.clinicId === input.clinic._id) await ctx.db.patch(row._id, { status: "expired" });
    }
  }
  const now = Date.now();
  const code = newInvitationCode();
  await ctx.db.insert("patientInvitations", {
    code,
    physiotherapistId: input.clinicianId,
    clinicId: input.clinic._id,
    invitedByClinic: true,
    patientEmail: email,
    patientName: [input.patient.firstName, input.patient.lastName].filter(Boolean).join(" ") || undefined,
    status: "pending",
    createdAt: now,
    expiresAt: now + CLINIC_INVITE_DAYS * 86_400_000,
  });
  return code;
}

/**
 * Validate a patient invitation code
 */
export const validateInvitationCode = query({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const invitation = await ctx.db
      .query("patientInvitations")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();

    if (!invitation) {
      return { valid: false, error: "Invalid invitation code" };
    }

    // Check if invitation has expired
    if (invitation.expiresAt < Date.now()) {
      return { valid: false, error: "Invitation has expired" };
    }

    // Check if invitation is already accepted
    if (invitation.status === "accepted") {
      return { valid: false, error: "Invitation has already been accepted" };
    }

    // Get physiotherapist details
    const physiotherapist = await ctx.db.get(invitation.physiotherapistId);
    if (!physiotherapist) {
      return { valid: false, error: "Physiotherapist not found" };
    }

    // Get clinic details if applicable
    let clinic = null;
    if (invitation.clinicId) {
      clinic = await ctx.db.get(invitation.clinicId);
    }

    // Public (anyone with the link): who invited them, never anyone's email address or contact
    // details beyond the clinic's own
    return {
      valid: true,
      invitation: {
        _id: invitation._id,
        code: invitation.code,
        maskedEmail: maskEmail(invitation.patientEmail),
        patientName: invitation.patientName,
        notes: invitation.notes,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
        invitedByClinic: Boolean(invitation.invitedByClinic),
      },
      physiotherapist: {
        _id: physiotherapist._id,
        firstName: physiotherapist.firstName,
        lastName: physiotherapist.lastName,
        imageUrl: physiotherapist.imageUrl,
      },
      clinic: clinic ? {
        _id: clinic._id,
        name: clinic.name,
        logoUrl: clinic.logoUrl ?? null,
        city: clinic.city ?? null,
        phone: clinic.contactPhone ?? null,
      } : null,
    };
  },
});

/**
 * Get physiotherapists for a patient (from their care team)
 */
export const getMyPhysiotherapists = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "patient") {
      throw new Error("Access denied. Only patients can view their physiotherapists.");
    }

    // Get patient-physiotherapist relationships
    const activeRelationships = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient", (q) => q.eq("patientId", user._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
    // Each clinician once, even if older data linked them twice
    const relationships = [
      ...new Map(activeRelationships.map((r) => [r.physiotherapistId, r] as const)).values(),
    ];

    // Get physiotherapist details for each relationship
    const physiotherapists = await Promise.all(
      relationships.map(async (relationship) => {
        const physiotherapist = await ctx.db.get(relationship.physiotherapistId);
        if (!physiotherapist) return null;

        // Get physiotherapist profile
        const physiotherapistProfile = await ctx.db
          .query("physiotherapistProfiles")
          .withIndex("by_user_id", (q) => q.eq("userId", physiotherapist._id))
          .first();

        // The clinic this care belongs to: the care link says, the physio's profile is a fallback
        const clinicId = relationship.clinicId ?? physiotherapistProfile?.clinicId;
        const clinicInfo = clinicId ? await ctx.db.get(clinicId) : null;

        // Patient-facing: public profile fields only, and the clinic's public details
        return {
          _id: physiotherapist._id,
          firstName: physiotherapist.firstName,
          lastName: physiotherapist.lastName,
          imageUrl: physiotherapist.imageUrl,
          profile: physiotherapistProfile
            ? {
                specializations: physiotherapistProfile.specializations,
                bio: physiotherapistProfile.bio,
                yearsOfExperience: physiotherapistProfile.yearsOfExperience,
                offersOnlineSessions: physiotherapistProfile.offersOnlineSessions,
                offersInPersonSessions: physiotherapistProfile.offersInPersonSessions,
              }
            : null,
          clinic: clinicInfo
            ? {
                _id: clinicInfo._id,
                name: clinicInfo.name,
                address: clinicInfo.address,
                city: clinicInfo.city,
                contactPhone: clinicInfo.contactPhone,
                logoUrl: clinicInfo.logoUrl,
              }
            : null,
          /** The clinic itself (its owner account) while it picks a clinician for them */
          isClinicDesk: Boolean(clinicInfo && clinicInfo.ownerId === physiotherapist._id),
          relationship: {
            isPrimary: relationship.isPrimaryPhysiotherapist,
            startDate: relationship.startDate,
            status: relationship.status,
          },
        };
      })
    );

    return physiotherapists.filter(Boolean); // Remove null entries
  },
});

const patientDataValidator = v.object({
  firstName: v.string(),
  lastName: v.string(),
  email: v.string(),
  phoneNumber: v.optional(v.string()),
  dateOfBirth: v.optional(v.string()),
  gender: v.optional(
    v.union(
      v.literal("male"),
      v.literal("female"),
      v.literal("other"),
      v.literal("prefer_not_to_say")
    )
  ),
  medicalHistory: v.optional(v.string()),
  emergencyContact: v.optional(v.string()),
  /** Terms and Privacy ticked on the invite page: policy id → version */
  acceptedPolicies: v.optional(v.record(v.string(), v.string())),
});

/**
 * Accept a patient invitation for the signed-in account (acceptInvitation and
 * completePatientOnboarding). Only a new or patient account can accept, so a clinician who
 * opens the link is never turned into a patient. An existing patient keeps their record:
 * their profile and any earlier link with this clinician are reused, never duplicated.
 */
async function acceptPatientInvitation(
  ctx: MutationCtx,
  invitationCode: string,
  patientData: Infer<typeof patientDataValidator>
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Please sign in to accept this invitation.");
  }

  const invitation = await ctx.db
    .query("patientInvitations")
    .withIndex("by_code", (q) => q.eq("code", invitationCode))
    .first();

  if (!invitation) {
    throw new ConvexError("This invitation link isn't valid.");
  }

  let user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();

  if (invitation.status === "accepted") {
    // Opening the link again after accepting it is fine
    if (user && invitation.patientUserId === user._id) {
      return { success: true, patientId: user._id, message: "Invitation already accepted" };
    }
    throw new ConvexError("This invitation has already been used.");
  }

  if (invitation.status !== "pending" || invitation.expiresAt < Date.now()) {
    throw new ConvexError("This invitation has expired. Ask your physiotherapist to send a new one.");
  }

  if (user?.role && user.role !== "patient") {
    throw new ConvexError(
      `You're signed in with a ${user.role.replace(/_/g, " ")} account. Sign out, then open the link again with the patient's own account.`
    );
  }

  // Emails are case-insensitive; an invitation without an email can be accepted by its holder
  const invitedEmail = invitation.patientEmail?.trim().toLowerCase();
  const signedInEmail = (user?.email ?? (typeof identity.email === "string" ? identity.email : ""))
    .trim()
    .toLowerCase();
  if (invitedEmail && signedInEmail && signedInEmail !== invitedEmail) {
    throw new ConvexError(
      `This invitation was sent to ${invitation.patientEmail}. Sign in with that email to accept it.`
    );
  }

  if (!user) {
    // Create new user (patient by default via invitation)
    const userId = await ctx.db.insert("users", {
      clerkId: identity.subject,
      email: patientData.email,
      firstName: patientData.firstName,
      lastName: patientData.lastName,
      role: "patient",
      phoneNumber: patientData.phoneNumber,
      imageUrl: identity.pictureUrl,
      onboarded: true,
    });

    user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("Failed to create user");
    }
  } else {
    // Ensure existing account is provisioned as a patient. The name they confirmed on the invite
    // page is the one their clinic and clinician see (not necessarily their Google name).
    await ctx.db.patch(user._id, {
      role: "patient",
      onboarded: true,
      firstName: patientData.firstName.trim() || user.firstName,
      lastName: patientData.lastName.trim() || user.lastName,
      email: user.email ?? patientData.email,
      phoneNumber: user.phoneNumber ?? patientData.phoneNumber,
    });
    user = await ctx.db.get(user._id);
    if (!user) {
      throw new Error("User not found after update");
    }
  }

  // Narrow nullability for TypeScript
  const ensuredUser = user as NonNullable<typeof user>;
  // Reuse the patient's profile: marketplace and Joy bookings create one without setting the pointer
  let patientProfileId =
    ensuredUser.patientProfileId ??
    (
      await ctx.db
        .query("patientProfiles")
        .withIndex("by_user_id", (q) => q.eq("userId", ensuredUser._id))
        .first()
    )?._id;
  if (!patientProfileId) {
    patientProfileId = await ctx.db.insert("patientProfiles", {
      userId: ensuredUser._id,
      dateOfBirth: patientData.dateOfBirth,
      gender: patientData.gender,
      medicalHistorySummary: patientData.medicalHistory,
      emergencyContact:
        typeof patientData.emergencyContact === "string"
          ? undefined
          : (patientData.emergencyContact as any),
    });
  }

  // Update user with patient profile ID
  await ctx.db.patch(ensuredUser._id, {
    patientProfileId,
  });
  await ensureUserNumbers(ctx, ensuredUser._id);
  // A clinic's invitation makes them the clinic's patient (their portal shows the clinic)
  if (invitation.clinicId) {
    const profile = await ctx.db.get(patientProfileId);
    if (profile && !profile.clinicId) await ctx.db.patch(profile._id, { clinicId: invitation.clinicId });
  }
  // Agreed on the invite page, so the dashboard doesn't ask again (append-only, NDPA)
  if (patientData.acceptedPolicies) {
    await recordMissingPolicyAcceptances(ctx, {
      user: ensuredUser,
      documents: PATIENT_CONSENT_POLICIES,
      accepted: patientData.acceptedPolicies,
      channel: "web",
      contextType: "patient_invite",
      contextId: String(invitation._id),
    });
  }

  // Re-link an earlier relationship with this clinician (a past booking, an older invite)
  // instead of adding a second one
  const earlierRelationships = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_patient_and_physiotherapist", (q) =>
      q.eq("patientId", ensuredUser._id).eq("physiotherapistId", invitation.physiotherapistId)
    )
    .collect();
  const earlierRelationship =
    earlierRelationships.find((r) => r.status === "active") ?? earlierRelationships[0];

  if (earlierRelationship) {
    await ctx.db.patch(earlierRelationship._id, {
      status: "active",
      endDate: undefined,
      clinicId: invitation.clinicId ?? earlierRelationship.clinicId,
      invitationId: invitation._id,
      source: earlierRelationship.source ?? invitation.source ?? "invite",
      referredBy: earlierRelationship.referredBy ?? invitation.referredBy,
    });
  } else {
    await ctx.db.insert("patientPhysiotherapistRelationships", {
      patientId: ensuredUser._id,
      physiotherapistId: invitation.physiotherapistId,
      clinicId: invitation.clinicId,
      invitationId: invitation._id,
      isPrimaryPhysiotherapist: true,
      status: "active",
      startDate: Date.now(),
      source: invitation.source ?? "invite",
      referredBy: invitation.referredBy,
    });
  }

  // Update invitation status
  await ctx.db.patch(invitation._id, {
    status: "accepted",
    patientUserId: ensuredUser._id,
  });

  // Notify physiotherapist that patient accepted invitation
  await insertNotification(ctx, {
    userId: invitation.physiotherapistId,
    type: "invitation_accepted" as any,
    priority: "high",
    status: "pending",
    payload: {
      title: "Patient Accepted Invitation",
      body: `${ensuredUser.firstName} ${ensuredUser.lastName} accepted your invitation`,
      data: {
        entityId: String(ensuredUser._id),
        entityType: "patient",
      },
      link: `/dashboard/physiotherapist/patients/${ensuredUser._id}`,
    },
    createdAt: Date.now(),
  });

  return {
    success: true,
    patientId: ensuredUser._id,
    message: "Invitation accepted successfully",
  };
}

/**
 * Accept a patient invitation
 */
export const acceptInvitation = mutation({
  args: {
    invitationCode: v.string(),
    patientData: patientDataValidator,
  },
  handler: async (ctx, args) => acceptPatientInvitation(ctx, args.invitationCode, args.patientData),
});

/**
 * Complete patient onboarding (alias for acceptInvitation)
 */
export const completePatientOnboarding = mutation({
  args: {
    invitationCode: v.string(),
    patientData: patientDataValidator,
  },
  handler: async (ctx, args) => acceptPatientInvitation(ctx, args.invitationCode, args.patientData),
});

/**
 * Get invitation by code with validation
 */
export const getInvitationByCode = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const invitation = await ctx.db
      .query("patientInvitations")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();

    if (!invitation) {
      return {
        valid: false,
        error: "Invalid invitation code",
      };
    }

    // Check if invitation has expired
    if (invitation.expiresAt < Date.now()) {
      return {
        valid: false,
        error: "Invitation has expired",
      };
    }

    // Check if invitation is already accepted
    if (invitation.status === "accepted") {
      return {
        valid: false,
        error: "Invitation has already been accepted",
      };
    }

    // Get physiotherapist details
    const physiotherapist = await ctx.db.get(invitation.physiotherapistId);
    if (!physiotherapist) {
      return {
        valid: false,
        error: "Physiotherapist not found",
      };
    }

    // Get clinic details if available
    let clinic = null;
    if (invitation.clinicId) {
      clinic = await ctx.db.get(invitation.clinicId);
    }

    return {
      valid: true,
      invitation,
      physiotherapist,
      clinic,
    };
  },
});

/**
 * Create patient invitation (alias for the one in patients.ts)
 */
export const createPatientInvitation = mutation({
  args: {
    patientEmail: v.string(),
    patientName: v.optional(v.string()),
    notes: v.optional(v.string()),
    expirationDays: v.optional(v.number()),
    source: v.optional(v.union(v.literal("referred"), v.literal("existing_patient"))),
    referredBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "physiotherapist") {
      throw new Error("Access denied. Physiotherapist privileges required.");
    }

    // Check if physiotherapist is approved
    const approvalStatus = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .unique();

    if (!approvalStatus || approvalStatus.status !== "approved") {
      throw new Error("Account not approved. Please wait for admin approval.");
    }

    // Generate unique invitation code
    const code = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const now = Date.now();
    const expirationDays = args.expirationDays || 7;
    const expiresAt = now + (expirationDays * 24 * 60 * 60 * 1000);

    // Get physiotherapist profile to get clinic info
    const physiotherapistProfile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .unique();

    let clinicId = null;
    if (physiotherapistProfile?.clinicId) {
      clinicId = physiotherapistProfile.clinicId;
    } else if (user.clinicId) {
      clinicId = user.clinicId;
    }

    // Create the invitation
    const invitationId = await ctx.db.insert("patientInvitations", {
      code,
      physiotherapistId: user._id,
      clinicId: clinicId || undefined,
      patientEmail: args.patientEmail,
      patientName: args.patientName,
      status: "pending",
      createdAt: now,
      expiresAt,
      notes: args.notes,
      patientUserId: undefined,
      source: args.source,
      referredBy: args.source === "referred" ? args.referredBy?.trim() || undefined : undefined,
    });

    // Tell the physio when this person already has a Rehabify patient record (e.g. from another
    // clinic), so they know accepting links that record instead of starting a duplicate.
    const email = args.patientEmail.trim();
    let existingPatient = null;
    for (const candidate of new Set([email, email.toLowerCase()])) {
      existingPatient = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", candidate))
        .first();
      if (existingPatient) break;
    }

    return {
      success: true,
      invitationCode: code,
      invitationId,
      message: "Patient invitation created successfully.",
      existingPatientNumber: existingPatient?.role === "patient" ? existingPatient.patientNumber : undefined,
    };
  },
});

/**
 * Get patient invitations created by the current physiotherapist
 */
export const getMyPatientInvitations = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("accepted"),
        v.literal("expired")
      )
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "physiotherapist") {
      throw new Error("Access denied. Physiotherapist privileges required.");
    }

    let query = ctx.db
      .query("patientInvitations")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", user._id));

    if (args.status) {
      query = query.filter((q) => q.eq(q.field("status"), args.status));
    }

    const invitations = await query.order("desc").collect();

    return invitations.map((invitation) => ({
      _id: invitation._id,
      code: invitation.code,
      patientEmail: invitation.patientEmail,
      patientName: invitation.patientName,
      status: invitation.status,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      notes: invitation.notes,
    }));
  },
});

/** The signed-in physio's own pending invitation, for revoke and resend. */
async function getOwnPendingInvitation(ctx: MutationCtx, invitationId: Id<"patientInvitations">) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Please sign in again.");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
  const invitation = await ctx.db.get(invitationId);
  if (!user || !invitation || invitation.physiotherapistId !== user._id) {
    throw new ConvexError("Invitation not found.");
  }
  if (invitation.status !== "pending") {
    throw new ConvexError(
      invitation.status === "accepted" ? "This patient has already accepted." : "This invitation was cancelled."
    );
  }
  return { user, invitation };
}

/** Cancel a pending invitation: its link stops working. */
export const revokePatientInvitation = mutation({
  args: { invitationId: v.id("patientInvitations") },
  handler: async (ctx, args) => {
    const { invitation } = await getOwnPendingInvitation(ctx, args.invitationId);
    await ctx.db.patch(invitation._id, { status: "expired", expiresAt: Math.min(invitation.expiresAt, Date.now()) });
    return { success: true };
  },
});

/** Give a pending (or lapsed) invitation another 7 days; the resend action then emails the same link. */
export const preparePatientInvitationResend = mutation({
  args: { invitationId: v.id("patientInvitations") },
  handler: async (ctx, args) => {
    const { user, invitation } = await getOwnPendingInvitation(ctx, args.invitationId);
    if (!invitation.patientEmail) throw new ConvexError("This invitation has no email address to send to.");
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    await ctx.db.patch(invitation._id, { expiresAt, lastReminderSentAt: Date.now() });
    return {
      code: invitation.code,
      patientEmail: invitation.patientEmail,
      patientName: invitation.patientName,
      expiresAt,
      physiotherapistName: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "Your physiotherapist",
    };
  },
});

/**
 * Get patients for the current physiotherapist
 */
export const getMyPatients = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("inactive"),
        v.literal("archived")
      )
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "physiotherapist") {
      throw new Error("Access denied. Physiotherapist privileges required.");
    }

    // Get patient relationships
    let relationshipQuery = ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", user._id));

    if (args.status) {
      relationshipQuery = relationshipQuery.filter((q) => q.eq(q.field("status"), args.status));
    }

    const allRelationships = await relationshipQuery.collect();
    // One row per patient (older data can hold several links to the same clinician); the active one wins
    const byPatient = new Map<string, (typeof allRelationships)[number]>();
    for (const rel of allRelationships) {
      const seen = byPatient.get(rel.patientId);
      if (!seen || (seen.status !== "active" && rel.status === "active")) byPatient.set(rel.patientId, rel);
    }
    const relationships = [...byPatient.values()];

    // Get patient details for each relationship
    const patients = await Promise.all(
      relationships.map(async (relationship) => {
        const patient = await ctx.db.get(relationship.patientId);
        if (!patient) return null;

        // Get patient profile (the user's own pointer first; a patient can have more than one)
        const patientProfile =
          (patient.patientProfileId ? await ctx.db.get(patient.patientProfileId) : null) ??
          (await ctx.db
            .query("patientProfiles")
            .withIndex("by_user_id", (q) => q.eq("userId", patient._id))
            .first());

        return {
          _id: patient._id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          email: patient.email,
          phoneNumber: patient.phoneNumber,
          imageUrl: patient.imageUrl,
          profile: patientProfile,
          relationship: {
            isPrimary: relationship.isPrimaryPhysiotherapist,
            startDate: relationship.startDate,
            status: relationship.status,
            clinicId: relationship.clinicId,
          },
        };
      })
    );

    return patients.filter(Boolean); // Remove null entries
  },
});
