import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { healthTables } from "./schema/health";

export default defineSchema({
  // Users table: Core user information, linked to Clerk authentication
  users: defineTable({
    clerkId: v.string(), // Unique ID from Clerk
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()), // Renamed from profileImageUrl for consistency
    phoneNumber: v.optional(v.string()),

    // Optional: primary clinic association for users (e.g., clinic owners or staff working in a single clinic)
    clinicId: v.optional(v.id("clinics")),
    // Staff status within clinic context
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("terminated")
    )),
    // Set when the person deleted their account; their personal data has been erased (users.ts)
    deletedAt: v.optional(v.number()),
    // When the user joined the clinic (if applicable)
    joinedAt: v.optional(v.number()),

    role: v.optional(v.union( // Role can be null until onboarding is complete
      v.literal("physiotherapist"),
      v.literal("clinic_owner"),
      v.literal("patient"),
      v.literal("family_member"),
      v.literal("doctor"),
      v.literal("admin"),
      v.literal("partner"),
      // Non-clinical clinic team member (receptionist, administrator...), works only in the clinic dashboard
      v.literal("clinic_staff")
    )),
    // Clinic dashboard role (page permissions). None means full access.
    clinicRoleId: v.optional(v.id("clinicRoles")),
    onboarded: v.boolean(), // Flag to indicate if user has completed initial profile setup
    onboardingSkipped: v.optional(v.boolean()), // True if user skipped optional onboarding steps (can complete later)

    // Links to role-specific profiles
    physiotherapistProfileId: v.optional(v.id("physiotherapistProfiles")),
    patientProfileId: v.optional(v.id("patientProfiles")),
    clinicOwnerProfileId: v.optional(v.id("clinicOwnerProfiles")), // Assuming clinicOwnerProfiles might be added later or clinics table is primary link
    doctorProfileId: v.optional(v.id("referringDoctorProfiles")), // Link to doctor profile
    // familyMemberProfileId: v.optional(v.id("familyMemberProfiles")), // Add if/when this table is created

    // Timestamps
    // _creationTime is automatic
    lastLoginAt: v.optional(v.number()), // Can be updated via a mutation on login

    // First-time Onboarding
    hasCompletedOnboarding: v.optional(v.boolean()), // True if user has seen the tour
    onboardingVersion: v.optional(v.number()), // To track which version of the tour they saw
    toursCompleted: v.optional(v.array(v.string())), // Track specific tours completed by ID

    // User Preferences
    notificationPreferences: v.optional(v.object({
      appointmentReminders: v.optional(v.boolean()),
      newPatientRegistrations: v.optional(v.boolean()),
      emailNotifications: v.optional(v.boolean()),
      pushNotifications: v.optional(v.boolean()),
      marketingCommunications: v.optional(v.boolean()),
    })),
    preferences: v.optional(v.object({
      timezone: v.optional(v.string()),
      language: v.optional(v.string()),
      dateFormat: v.optional(v.string()),
      timeFormat: v.optional(v.string()),
    })),

    // Partner Referral Attribution (first partner wins; set only by server-validated paths)
    referredByPartnerCode: v.optional(v.string()),
    referralPublicCode: v.optional(v.string()),
    linkedReferralTrackingCode: v.optional(v.string()),
    referralLinkId: v.optional(v.id("partnerReferralLinks")),
    linkedReferralId: v.optional(v.id("inboundReferrals")),
    referralAttributedAt: v.optional(v.number()),
    referralAttributionSource: v.optional(v.string()), // "referral_link" | "partner_referral" | "joy"

    // Permanent Rehabify IDs (see helpers/rehabifyIds.ts). Assigned once, never changed or reused.
    // A user can hold both: a patient who later becomes a physio keeps RH-P and gains RH-C.
    patientNumber: v.optional(v.string()), // "RH-P-100001"
    staffNumber: v.optional(v.string()), // "RH-C-100001"
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"]) // To query users by role (especially after onboarding)
    .index("by_clinic_id", ["clinicId"])
    .index("by_referred_partner", ["referredByPartnerCode"])
    .index("by_phone_number", ["phoneNumber"])
    .index("by_patient_number", ["patientNumber"])
    .index("by_staff_number", ["staffNumber"])
    .index("by_role_and_patient_number", ["role", "patientNumber"])
    .index("by_role_and_staff_number", ["role", "staffNumber"]),

  // One row per Rehabify ID kind; `next` is the number the next person or clinic receives.
  idCounters: defineTable({
    kind: v.union(v.literal("patient"), v.literal("staff"), v.literal("clinic")),
    next: v.number(),
  }).index("by_kind", ["kind"]),

  // Short-lived replay reservations for authenticated Joy service requests.
  // This deliberately stores no phone number or clinical request payload.
  joyIntegrationRequests: defineTable({
    requestId: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  }).index("by_request_id", ["requestId"]),

  // Separate nonce reservations protect the RH-to-Convex bridge itself.
  joyIntegrationGatewayNonces: defineTable({
    nonce: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  }).index("by_nonce", ["nonce"]),

  // Immutable operational trace for commands received through Joy WhatsApp.
  // Payloads intentionally contain only the minimum operational fields; Joy
  // clinical narratives and raw notes do not belong in this table.
  joyOperationalAudit: defineTable({
    operation: v.string(),
    actorUserId: v.optional(v.id("users")),
    patientUserId: v.optional(v.id("users")),
    physiotherapistUserId: v.optional(v.id("users")),
    bookingId: v.optional(v.id("marketplaceBookings")),
    appointmentId: v.optional(v.id("appointments")),
    requestId: v.string(),
    payload: v.any(),
    createdAt: v.number(),
  })
    .index("by_booking", ["bookingId"])
    .index("by_patient", ["patientUserId"])
    .index("by_physio", ["physiotherapistUserId"])
    .index("by_request", ["requestId"]),

  // Clinics table: Information about physiotherapy clinics
  clinics: defineTable({
    name: v.string(),
    ownerId: v.id("users"), // User ID of the clinic owner
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    clinicImageOutside: v.optional(v.id("_storage")),
    clinicImageInside: v.optional(v.id("_storage")),
    location: v.optional(v.string()), // Formatted location string from LocationSearch
    description: v.optional(v.string()), // Brief overview of the clinic
    website: v.optional(v.string()), // Public website URL
    specializations: v.optional(v.array(v.string())), // e.g., ['Sports Rehab', 'Pediatrics'],
    workingHours: v.optional(v.any()), // Could be structured e.g., { monday: { start: "09:00", end: "17:00" } }
    // Registration details captured during clinic owner onboarding
    state: v.optional(v.string()),
    registrationNumber: v.optional(v.string()),
    clinicType: v.optional(v.string()),
    yearEstablished: v.optional(v.number()),
    services: v.optional(v.array(v.string())),
    facilities: v.optional(v.array(v.string())),
    equipment: v.optional(v.array(v.string())),
    additionalNotes: v.optional(v.string()),
    // Services the clinic bills for, used to pre-fill payment requests
    priceList: v.optional(v.array(v.object({
      name: v.string(),
      priceNaira: v.number(),
      durationMinutes: v.optional(v.number()),
    }))),
    settings: v.optional(v.object({ // Clinic-specific settings
      defaultCurrency: v.optional(v.string()), // e.g., "NGN"
      language: v.optional(v.string()), // e.g., "en"
    })),
    // Set by Rehabify admins. Missing means active. A suspended clinic's team can still
    // sign in and look, but every change is refused (see assertClinicNotSuspended).
    status: v.optional(v.union(v.literal("active"), v.literal("suspended"))),
    suspendedReason: v.optional(v.string()),
    suspendedAt: v.optional(v.number()),
    suspendedBy: v.optional(v.id("users")),
    // Permanent Rehabify clinic ID, "RH-CL-100001". Assigned once, never changed or reused.
    clinicNumber: v.optional(v.string()),
  })
    .index("by_owner_id", ["ownerId"])
    .index("by_status", ["status"])
    .index("by_clinic_number", ["clinicNumber"]),

  // Physiotherapist specific profiles/details
  physiotherapistProfiles: defineTable({
    userId: v.id("users"),
    clinicId: v.optional(v.id("clinics")), // The primary clinic they are associated with, now optional
    // Which patients a physio outside a clinic sees: "network" = Rehabify Care patients (listed,
    // Rehabify prices, fixed payouts); "independent" = only their own private patients; "both".
    // Unset = network. The rules follow the patient and the service, not the physio.
    practiceMode: v.optional(v.union(v.literal("network"), v.literal("independent"), v.literal("both"))),
    specializations: v.optional(v.array(v.string())),
    bio: v.optional(v.string()),
    licenseNumber: v.optional(v.string()),
    certificationBoard: v.optional(v.string()),
    certificationYear: v.optional(v.float64()),
    licenseExpiryDate: v.optional(v.string()),
    cpdPoints: v.optional(v.float64()),
    yearsOfExperience: v.optional(v.float64()),
    availabilitySchedule: v.optional(v.any()), // More complex availability rules
    languagesSpoken: v.optional(v.array(v.string())),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"), v.literal("prefer_not_to_say"))),

    // Video Platform Preference
    videoPlatformPreference: v.optional(v.union(
      v.literal("stream"),
      v.literal("google_meet")
    )),

    // Marketplace Settings
    isAvailableOnMarketplace: v.optional(v.boolean()), // Toggle marketplace visibility
    hourlyRate: v.optional(v.number()), // Base rate per session in kobo
    initialConsultRate: v.optional(v.number()), // First session rate in kobo
    virtualConsultationRate: v.optional(v.number()), // Virtual call rate in kobo (default ₦6,000 = 600,000)
    inPersonConsultationRate: v.optional(v.number()), // In-person / home visit rate in kobo (default ₦10,000 = 1,000,000)
    packageRates: v.optional(v.array(v.object({
      sessions: v.number(),
      price: v.number(), // Total package price in kobo
      description: v.optional(v.string()),
    }))),
    packageDiscountPercent: v.optional(v.number()), // 5-15% discount for multi-session packages

    // Location
    location: v.optional(v.string()), // "Lagos", "Abuja", "Online"
    latitude: v.optional(v.float64()), // GPS latitude for map placement
    longitude: v.optional(v.float64()), // GPS longitude for map placement
    offersOnlineSessions: v.optional(v.boolean()),
    offersInPersonSessions: v.optional(v.boolean()),

    // Joy uses only these controlled fields for service matching. Existing
    // free-text specializations remain intact for the marketplace UI.
    joySpecialtyTags: v.optional(v.array(v.string())),
    joyServiceModes: v.optional(v.array(v.union(
      v.literal("home_visit"), v.literal("clinic"), v.literal("online")
    ))),
    joyServiceAreas: v.optional(v.array(v.string())),

    // Rehabify network (pricing model of Oct 2026): the travel zones this physio covers for
    // home visits, and their acceptance of the network terms (history in physioNetworkAgreements).
    coveredZoneIds: v.optional(v.array(v.id("travelZones"))),
    termsAcceptedAt: v.optional(v.number()), // platform terms & privacy policy, accepted at onboarding
    networkTerms: v.optional(v.object({
      version: v.string(),
      acceptedAt: v.number(),
      tariffVersion: v.optional(v.number()),
      accessOptIn: v.boolean(), // open to selected Rehabify Access (reduced-fee) cases
      accessMinimumPayouts: v.optional(v.array(v.object({
        serviceId: v.string(),
        minimumPayoutKobo: v.number(),
      }))),
    })),

    // Verification & Monetization
    verificationBadge: v.optional(v.object({
      status: v.union(
        v.literal("none"),
        v.literal("verified"),
        v.literal("pro_verified")
      ),
      tier: v.optional(v.union(
        v.literal("monthly"),
        v.literal("12_month"),
        v.literal("yearly")
      )),
      paidAt: v.optional(v.number()),
      expiresAt: v.optional(v.number()),
      verificationFee: v.optional(v.number()),
      autoRenew: v.optional(v.boolean()),
    })),

    // Featured Listing
    featuredStatus: v.optional(v.object({
      isFeatured: v.boolean(),
      featuredUntil: v.optional(v.number()),
      lastPayment: v.optional(v.number()),
    })),

    // Analytics
    profileViews: v.optional(v.number()), // legacy: new views go to physioProfileViews
    bookingsThroughMarketplace: v.optional(v.number()),
    totalMarketplaceEarnings: v.optional(v.number()), // Total earned through marketplace
    averageRating: v.optional(v.number()), // Average rating from reviews
    reviewCount: v.optional(v.number()), // Total number of reviews
    referralSource: v.optional(v.string()), // How did you hear about us?
    bookingSlug: v.optional(v.string()), // Short booking URL slug e.g. "eniola-ojuko"
  })
    .index("by_user_id", ["userId"])
    .index("by_clinic_id", ["clinicId"])
    .index("by_marketplace_availability", ["isAvailableOnMarketplace"])
    .index("by_verification_status", ["verificationBadge.status"])
    .index("by_location", ["location"])
    .index("by_bookingSlug", ["bookingSlug"])
    .index("by_license_number", ["licenseNumber"]),

  // Patient specific profiles/details
  patientProfiles: defineTable({
    userId: v.id("users"),
    clinicId: v.optional(v.id("clinics")), // Clinic they are primarily associated with, if any
    dateOfBirth: v.optional(v.string()), // ISO string or timestamp
    gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"), v.literal("prefer_not_to_say"))),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    // Neighbourhood/LGA, used with city for Joy home-visit matching.
    area: v.optional(v.string()),
    country: v.optional(v.string()),
    medicalHistorySummary: v.optional(v.string()), // Brief summary
    // Detailed medical history could be a separate table or structured object
    // medicalConditions: v.optional(v.array(v.string())),
    // allergies: v.optional(v.array(v.string())),
    // medications: v.optional(v.array(v.string())),
    emergencyContact: v.optional(v.object({
      name: v.string(),
      relationship: v.string(),
      phone: v.string(),
    })),
    referralSource: v.optional(v.string()),
    preferredLanguage: v.optional(v.string()),
    therapyFor: v.optional(v.string()), // "myself", "partner", "child"
    therapyType: v.optional(v.string()), // "individual", "couples", "teen"
    relationshipStatus: v.optional(v.string()), // For couples therapy context
  })
    .index("by_user_id", ["userId"])
    .index("by_clinic_id", ["clinicId"]),

  // Patient Invitations: Manages invitation codes for patient onboarding
  patientInvitations: defineTable({
    code: v.string(), // Unique invitation code
    physiotherapistId: v.id("users"), // The physiotherapist who created the invitation
    clinicId: v.optional(v.id("clinics")), // Optional: null for independent physiotherapists, set for clinic physiotherapists
    patientEmail: v.optional(v.string()), // Optional pre-filled email for the invitation
    patientName: v.optional(v.string()), // Optional pre-filled name for the invitation
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("expired")
    ),
    patientUserId: v.optional(v.id("users")), // Set when a patient accepts the invitation
    createdAt: v.number(), // Timestamp when invitation was created
    expiresAt: v.number(), // Timestamp when invitation expires
    notes: v.optional(v.string()), // Optional notes from physiotherapist
    lastReminderSentAt: v.optional(v.number()), // Timestamp of last reminder email sent (prevents duplicate reminders)
    // Where the patient came from, chosen by the physio; copied to the relationship on accept
    source: v.optional(v.union(v.literal("referred"), v.literal("existing_patient"))),
    referredBy: v.optional(v.string()),
  })
    .index("by_code", ["code"])
    .index("by_patient_email", ["patientEmail"])
    .index("by_patient_user", ["patientUserId"])
    .index("by_physiotherapist", ["physiotherapistId"]),

  // Clinic Staff Invitations: Manages invitations for physiotherapists to join clinics
  clinicStaffInvitations: defineTable({
    code: v.string(), // Unique invitation code
    clinicId: v.id("clinics"), // The clinic extending the invitation
    clinicOwnerId: v.id("users"), // The clinic owner who created the invitation
    inviteeEmail: v.string(), // Email of the physiotherapist being invited
    inviteeName: v.optional(v.string()), // Optional pre-filled name
    role: v.union(
      v.literal("physiotherapist"),
      v.literal("admin"), // For clinic admin staff
      v.literal("receptionist") // For future expansion
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("declined"),
      v.literal("expired")
    ),
    acceptedBy: v.optional(v.id("users")), // Set when invitation is accepted
    createdAt: v.number(),
    expiresAt: v.number(),
    message: v.optional(v.string()), // Personal message from clinic owner
    permissions: v.optional(v.array(v.string())), // Specific permissions for this role
    // Clinic dashboard role given on acceptance (none = full access)
    clinicRoleId: v.optional(v.id("clinicRoles")),
  })
    .index("by_code", ["code"])
    .index("by_clinic", ["clinicId"])
    .index("by_clinic_owner", ["clinicOwnerId"])
    .index("by_invitee_email", ["inviteeEmail"])
    .index("by_status", ["status"]),

  // Patient-Physiotherapist Relationships: Links patients to their physiotherapists
  patientPhysiotherapistRelationships: defineTable({
    patientId: v.id("users"), // The patient user ID
    physiotherapistId: v.id("users"), // The physiotherapist user ID
    clinicId: v.optional(v.id("clinics")), // Optional: null for independent physiotherapists
    invitationId: v.optional(v.id("patientInvitations")), // The invitation that created this relationship
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("archived")
    ),
    isPrimaryPhysiotherapist: v.boolean(), // Whether this is the patient's primary physiotherapist
    startDate: v.number(), // When the relationship started
    endDate: v.optional(v.number()), // When the relationship ended (if applicable)
    notes: v.optional(v.string()), // Clinical notes about the relationship
    // How the patient arrived. Clinic values: clinic_direct / rehabify_referral. Physio values
    // are chosen when the physio adds the patient, or set by the booking/invite flow.
    source: v.optional(v.union(
      v.literal("clinic_direct"),
      v.literal("rehabify_referral"),
      v.literal("referred"),          // referred by a doctor, hospital or another clinician
      v.literal("existing_patient"),  // the physio's own patient before Rehabify
      v.literal("marketplace"),
      v.literal("booking_link"),
      v.literal("invite"),
      v.literal("joy_whatsapp")       // booked through Joy on WhatsApp
    )),
    referredBy: v.optional(v.string()), // Who referred them, when source is "referred"
    // Follow-up task: when the clinic should next check in with this patient
    nextCheckInAt: v.optional(v.number()),
  })
    .index("by_patient", ["patientId"])
    .index("by_clinic", ["clinicId"])
    .index("by_physiotherapist", ["physiotherapistId"])
    .index("by_patient_and_physiotherapist", ["patientId", "physiotherapistId"])
    .index("by_primary_physiotherapist", ["patientId", "isPrimaryPhysiotherapist"]),

  // Family Access Grants: Manages family member access to patient data
  // Documents uploaded by physiotherapists (licenses, certifications, etc.)
  // Notifications: System-wide notifications for all users
  // Marketplace profile view counter, one row per physio (physioSetup.ts recordProfileView)
  physioProfileViews: defineTable({
    userId: v.id("users"),
    count: v.number(),
  }).index("by_user_id", ["userId"]),

  notifications: defineTable({
    userId: v.id("users"),
    type: v.string(),
    priority: v.optional(v.union(
      v.literal("urgent"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    )),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("delivered"),
      v.literal("read"),
      v.literal("failed"),
      v.literal("retrying")
    )),
    payload: v.optional(v.object({
      title: v.string(),
      body: v.string(),
      data: v.optional(v.any()),
      link: v.optional(v.string()),
    })),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    readAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    retryCount: v.optional(v.number()),
    // Legacy fields for backward compatibility
    read: v.optional(v.boolean()),
    emailSent: v.optional(v.boolean()),
    message: v.optional(v.string()),
    title: v.optional(v.string()),
    data: v.optional(v.any()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_read", ["userId", "readAt"]) // unread = readAt undefined, for the bell count
    .index("by_user_and_status", ["userId", "status"])
    .index("by_user_and_type", ["userId", "type"])
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),

  // Email audit logs: track outbound email events for debugging/auditing
  emailAuditLogs: defineTable({
    to: v.string(),
    template: v.string(),
    subject: v.optional(v.string()),
    data: v.optional(v.any()),
    messageId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_to", ["to"])
    .index("by_created", ["createdAt"]),

  // User account status tracking for admin approval workflow
  accountApprovalStatus: defineTable({
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
    requiredDocuments: v.optional(v.array(v.string())),
  })
    .index("by_user_id", ["userId"])
    .index("by_status", ["status"]),

  // Physio Register: Public registry of physiotherapists
  // Completely separate from physiotherapistProfiles (Rehabify Health platform members)
  // All registered physios appear publicly — no admin verification gate
  physioRegistry: defineTable({
    fullName: v.string(),
    email: v.string(),
    phone: v.string(),
    practiceName: v.optional(v.string()),
    practiceAddress: v.optional(v.string()),
    yearsOfExperience: v.number(),
    licenseNumber: v.string(), // MRTB license ID
    regulatoryBody: v.string(), // e.g. "MRTB", "HCPC", "AHPRA"
    licenseCountry: v.string(),
    licenseExpiryDate: v.string(), // ISO date string
    specialties: v.array(v.string()),
    languages: v.array(v.string()),
    bio: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    // Document uploads (Convex storage)
    profilePhotoStorageId: v.optional(v.id("_storage")),
    licenseCertStorageId: v.id("_storage"), // License certificate PDF/image
    photoIdStorageId: v.id("_storage"), // Government-issued photo ID
    insuranceStorageId: v.optional(v.id("_storage")), // Proof of insurance/indemnity

    // Authentication & Identity
    clerkUserId: v.optional(v.string()), // Links to Clerk user after signup
    slug: v.optional(v.string()), // URL slug (sanitized license number) for shareable profile URLs

    // Referral tracking
    referredByLicense: v.optional(v.string()), // License # of the physio who referred them

    // Peer verification & ranking
    peerVerificationCount: v.optional(v.number()), // Total colleague verifications
    patientReviewCount: v.optional(v.number()), // Total patient reviews
    averagePatientRating: v.optional(v.number()), // 1-5 star average from patients
    referralCount: v.optional(v.number()), // How many physios registered via this person's link
    rankingScore: v.optional(v.number()), // Composite score for sorting
    ranking: v.optional(v.number()), // Position e.g. "#1 out of 250"

    // Legacy verification workflow (kept for backward compat with admin panel)
    verificationStatus: v.union(
      v.literal("pending"),
      v.literal("verified"),
      v.literal("rejected"),
      v.literal("listed") // Default for new registrations — publicly visible
    ),
    rejectionReason: v.optional(v.string()),
    verifiedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id("users")), // Admin who reviewed
    submittedAt: v.number(),
  })
    .index("by_license_number", ["licenseNumber"])
    .index("by_verification_status", ["verificationStatus"])
    .index("by_email", ["email"])
    .index("by_slug", ["slug"])
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_ranking_score", ["rankingScore"])
    .index("by_referred_by", ["referredByLicense"]),

  // Peer verifications and patient reviews for the Physio Register
  physioRegistryPeerVerifications: defineTable({
    registryEntryId: v.id("physioRegistry"), // Physio being verified/reviewed
    verifierType: v.union(
      v.literal("colleague"),
      v.literal("patient")
    ),
    // Verifier info
    verifierName: v.string(),
    verifierEmail: v.optional(v.string()),
    verifierQualifications: v.optional(v.string()), // e.g. "PT, MSc"
    verifierLicenseNumber: v.optional(v.string()), // If fellow physio
    relationshipContext: v.optional(v.union(
      v.literal("school"),
      v.literal("work"),
      v.literal("conference"),
      v.literal("mentorship"),
      v.literal("other")
    )),
    relationshipDetails: v.optional(v.string()), // Free text
    // Patient review fields
    rating: v.optional(v.number()), // 1-5 stars (patient only)
    reviewText: v.optional(v.string()), // Written review
    // Meta
    createdAt: v.number(),
  })
    .index("by_registry_entry", ["registryEntryId"])
    .index("by_verifier_license", ["verifierLicenseNumber"])
    .index("by_verifier_email", ["verifierEmail"]),

  physiotherapistDocuments: defineTable({
    physiotherapistId: v.id("physiotherapistProfiles"),
    storageId: v.id("_storage"),
    documentType: v.union(
      v.literal("licenseDocument"),
      v.literal("additionalCertificate"),
      // Academic credentials
      v.literal("degreeCertificate"),
      v.literal("nyscCertificate"),
      v.literal("transcript"),
      // Professional registration
      v.literal("mrtbLicense"),
      v.literal("npaMembership"),
      v.literal("practicingLicense"),
      // Identity documents
      v.literal("nationalId"),
      v.literal("passportPhoto"),
      v.literal("proofOfAddress")
    ),
    fileName: v.string(),
    fileSize: v.number(),
    contentType: v.string(),
    uploadedAt: v.number(),
  })
    .index("by_physiotherapist_id", ["physiotherapistId"])
    .index("by_document_type", ["physiotherapistId", "documentType"]),

  // Documents uploaded by clinics (business license, tax registration, etc.)
  clinicDocuments: defineTable({
    clinicId: v.id("clinics"),
    storageId: v.id("_storage"),
    documentType: v.union(
      v.literal("businessLicense"),
      v.literal("taxRegistration"),
      v.literal("insuranceProof"),
      v.literal("ownerIdentification"),
      v.literal("additionalDocument")
    ),
    fileName: v.string(),
    fileSize: v.number(),
    contentType: v.string(),
    uploadedAt: v.number(),
  })
    .index("by_clinic_id", ["clinicId"])
    .index("by_document_type", ["clinicId", "documentType"]),

  // Documents uploaded by patients (referral letters, medical records, etc.)
  patientDocuments: defineTable({
    patientProfileId: v.id("patientProfiles"),
    storageId: v.id("_storage"),
    documentType: v.union(
      v.literal("referralLetter"),
      v.literal("medicalRecord"),
      v.literal("insuranceCard"),
      v.literal("otherDocument")
    ),
    fileName: v.string(),
    fileSize: v.number(),
    contentType: v.string(),
    uploadedAt: v.number(),
    sharedWithPhysiotherapist: v.optional(v.boolean()), // Privacy control - defaults to true
  })
    .index("by_patient_profile_id", ["patientProfileId"])
    .index("by_document_type", ["patientProfileId", "documentType"]),

  familyAccessGrants: defineTable({
    patientUserId: v.id("users"),      // The patient granting access
    familyMemberUserId: v.id("users"), // The family member receiving access
    relationship: v.string(),          // e.g., "Spouse", "Parent", "Child"
    permissions: v.array(v.string()),  // e.g., ["view_progress", "view_appointments"]
    status: v.union(v.literal("pending"), v.literal("active"), v.literal("revoked")), // Access status
    grantedAt: v.number(),             // Timestamp when access was granted/requested
    expiresAt: v.optional(v.number()), // Optional expiry for access
  })
    .index("by_patient_user_id", ["patientUserId"])
    .index("by_family_member_user_id", ["familyMemberUserId"])
    .index("by_patient_and_family_member", ["patientUserId", "familyMemberUserId"]),

  // Appointments table
  appointments: defineTable({
    patientId: v.id("users"),
    physiotherapistId: v.id("users"),
    clinicId: v.optional(v.id("clinics")), // Optional: null for independent physiotherapists
    startTime: v.number(), // Unix timestamp (UTC)
    endTime: v.number(),   // Unix timestamp (UTC)
    serviceType: v.string(), // e.g., "Initial Consultation", "Follow-up"
    status: v.union(
      v.literal("scheduled"),
      v.literal("confirmed"),
      v.literal("completed"),
      v.literal("cancelled_by_patient"),
      v.literal("cancelled_by_therapist"),
      v.literal("no_show")
    ),
    notesForPatient: v.optional(v.string()),
    notesForTherapist: v.optional(v.string()),
    cancellationReason: v.optional(v.string()),
    rescheduledFromAppointmentId: v.optional(v.id("appointments")),
    // Resource management
    selectedResources: v.optional(v.array(v.id("resources"))),
    // Recurring appointment fields
    seriesId: v.optional(v.id("recurringSeries")), // Link to recurring series
    isRecurring: v.optional(v.boolean()), // Flag for recurring appointments
    instanceDate: v.optional(v.string()), // ISO date for this instance
    isException: v.optional(v.boolean()), // True if modified from series template
    // Enhanced appointment features
    priority: v.optional(v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("urgent")
    )),
    appointmentType: v.optional(v.union(
      v.literal("in-person"),
      v.literal("telehealth")
    )),
    isPinned: v.optional(v.boolean()),
    colorCode: v.optional(v.string()), // Hex color code like "#3B82F6"
    googleMeetLink: v.optional(v.string()), // Auto-generated Google Meet link
    googleCalendarLink: v.optional(v.string()), // Link to view event in Google Calendar
    googleCalendarEventId: v.optional(v.string()), // Google Calendar event ID
    manualMeetingLink: v.optional(v.string()), // Manually added meeting link (e.g. Google Meet)
    location: v.optional(v.string()), // Exact address for in-person appointments
    // Video call integration
    isOnline: v.optional(v.boolean()), // True for online/telehealth appointments
    meetingLink: v.optional(v.string()), // GetStream or other video platform meeting link
    videoCallId: v.optional(v.id("videoCalls")), // Link to videoCalls table
    // True for entries created only to anchor a clinical note or follow-up log; not a real visit
    isRecordOnly: v.optional(v.boolean()),
    // Who set the visit's current time; the other side confirms it (older rows: inferred)
    requestedBy: v.optional(v.union(v.literal("patient"), v.literal("provider"))),
    // Another time the physio has offered; the patient accepts (visit moves, confirmed) or declines
    proposedStartTime: v.optional(v.number()),
    proposedEndTime: v.optional(v.number()),
    proposedBy: v.optional(v.id("users")),
    proposedAt: v.optional(v.number()),
    proposalNote: v.optional(v.string()),
  })
    .index("by_patient_id_and_time", ["patientId", "startTime"])
    .index("by_clinic_id_and_time", ["clinicId", "startTime"])
    .index("by_physiotherapist_id_and_time", ["physiotherapistId", "startTime"])
    .index("by_series_id", ["seriesId"])
    .index("by_instance_date", ["instanceDate"])
    // Platform-wide "what's on today" counts for the admin console
    .index("by_start_time", ["startTime"]),

  // Recurring appointment series
  recurringSeries: defineTable({
    name: v.string(), // User-friendly name for the series
    description: v.optional(v.string()),
    patientId: v.id("users"),
    physiotherapistId: v.id("users"),
    clinicId: v.optional(v.id("clinics")),
    serviceType: v.string(),
    duration: v.number(), // Duration in minutes
    appointmentType: v.union(v.literal("in-person"), v.literal("telehealth")),
    priority: v.optional(v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("urgent")
    )),
    notesForPatient: v.optional(v.string()),
    notesForTherapist: v.optional(v.string()),
    // Recurrence rule
    frequency: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
    interval: v.number(), // Every N days/weeks/months
    daysOfWeek: v.optional(v.array(v.number())), // For weekly: [0,1,2,3,4,5,6]
    endDate: v.optional(v.string()), // ISO date string
    maxOccurrences: v.optional(v.number()),
    // Series metadata
    startDate: v.string(), // ISO date string
    startTime: v.string(), // HH:MM format
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_patient_id", ["patientId"])
    .index("by_physiotherapist_id", ["physiotherapistId"])
    .index("by_clinic_id", ["clinicId"]),

  // Series exceptions (cancelled or modified instances)
  seriesExceptions: defineTable({
    seriesId: v.id("recurringSeries"),
    instanceDate: v.string(), // ISO date string
    exceptionType: v.union(
      v.literal("cancelled"),
      v.literal("rescheduled"),
      v.literal("modified")
    ),
    reason: v.optional(v.string()),
    newAppointmentId: v.optional(v.id("appointments")), // For rescheduled
    createdAt: v.number(),
  })
    .index("by_series_id", ["seriesId"])
    .index("by_instance_date", ["instanceDate"]),

  // Session Logs (Treatment Logs)
  sessionLogs: defineTable({
    appointmentId: v.id("appointments"),
    patientId: v.id("users"),
    physiotherapistId: v.id("users"),
    clinicId: v.optional(v.id("clinics")), // Optional: null for independent physiotherapists
    sessionDate: v.number(), // Timestamp
    subjectiveAssessment: v.optional(v.string()),
    objectiveAssessment: v.optional(v.string()),
    treatmentAdministered: v.optional(v.string()),
    planForNextSession: v.optional(v.string()),
    voiceNoteUrl: v.optional(v.string()), // Link to stored voice note (e.g., Convex file storage ID)
    attachments: v.optional(v.array(v.id("_storage"))), // IDs of files in Convex storage
    // Structured clinical documentation (clinic EHR)
    noteType: v.optional(v.union(
      v.literal("initial_assessment"),
      v.literal("treatment_note"),
      v.literal("follow_up"),
      v.literal("discharge_summary"),
      v.literal("follow_up_outreach")
    )),
    diagnosis: v.optional(v.string()),
    goals: v.optional(v.string()),
  })
    .index("by_appointment_id", ["appointmentId"])
    .index("by_patient_id_and_date", ["patientId", "sessionDate"]),

  // Exercise Library: Central repository of exercises
  exercises: defineTable({
    name: v.string(),
    description: v.string(),
    instructions: v.array(v.string()), // Changed from string to array for better structure

    // Enhanced filtering capabilities
    bodyParts: v.array(v.string()), // Required for filtering
    targetMuscles: v.array(v.string()),
    secondaryMuscles: v.optional(v.array(v.string())),
    conditions: v.array(v.string()), // ['lower_back_pain', 'post_surgery', 'arthritis']
    equipmentNeeded: v.array(v.string()),

    // Difficulty and safety
    difficultyLevel: v.union(v.literal("beginner"), v.literal("intermediate"), v.literal("advanced")),
    contraindications: v.optional(v.array(v.string())), // Safety warnings
    precautions: v.optional(v.array(v.string())),

    // Media and external integration
    exerciseDbId: v.optional(v.string()), // ExerciseDB integration
    videoUrl: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    alternativeVideos: v.optional(v.array(v.string())),

    // Prescription defaults
    defaultSets: v.number(),
    defaultReps: v.number(),
    defaultDuration: v.optional(v.number()), // seconds
    defaultFrequency: v.string(),

    // Metadata
    createdBy: v.optional(v.id("users")),
    isPublic: v.boolean(), // Global vs clinic-specific
    clinicId: v.optional(v.id("clinics")),
    tags: v.optional(v.array(v.string())),

    // Usage tracking
    timesAssigned: v.optional(v.number()),
    averageRating: v.optional(v.number()),

    // 3D demonstration (convex/exerciseLibraryCatalog.ts). Sided exercises have a left and a
    // right clip. Patients only see an animation once a licensed physiotherapist approves it.
    animationSlug: v.optional(v.string()),
    sided: v.optional(v.boolean()),
    position: v.optional(v.string()),
    defaultHoldSeconds: v.optional(v.number()),
    animationStatus: v.optional(v.union(v.literal("draft"), v.literal("approved"))),
    animationApprovedBy: v.optional(v.id("users")),
    animationApprovedAt: v.optional(v.number()),

    // Legacy compatibility
    media: v.optional(v.array(v.object({ type: v.union(v.literal("image"), v.literal("video")), url: v.string() }))),
    translations: v.optional(v.object({ // Key-value for language code and translated instructions
      // e.g., "yo": "Itọsọna ni Yoruba"
    })),
  })
    .index("by_name", ["name"])
    .index("by_body_parts", ["bodyParts"])
    .index("by_conditions", ["conditions"])
    .index("by_difficulty", ["difficultyLevel"])
    .index("by_clinic", ["clinicId"])
    .index("by_public", ["isPublic"])
    .index("by_target_muscles", ["targetMuscles"])
    .index("by_animation_slug", ["animationSlug"]),

  // Treatment Templates: Reusable templates physiotherapists can apply to patients
  treatmentTemplates: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    difficulty: v.optional(
      v.union(v.literal("Beginner"), v.literal("Intermediate"), v.literal("Advanced"))
    ),
    duration: v.optional(v.string()),
    goals: v.optional(
      v.array(
        v.object({
          description: v.string(),
          targetValue: v.optional(v.string()),
          timeline: v.optional(v.string()),
          measurable: v.optional(v.boolean()),
        })
      )
    ),
    phases: v.optional(
      v.array(
        v.object({
          name: v.string(),
          description: v.optional(v.string()),
          duration: v.optional(v.string()),
          order: v.number(),
          exercises: v.array(
            v.object({
              // If referencing internal exercises table
              exerciseRefId: v.optional(v.id("exercises")),
              // Or referencing an external/library id as string
              exerciseId: v.optional(v.string()),
              sets: v.optional(v.number()),
              reps: v.optional(v.number()),
              duration: v.optional(v.string()),
              frequency: v.optional(v.string()),
              notes: v.optional(v.string()),
              // Media support
              videoUrl: v.optional(v.string()),
              youtubeId: v.optional(v.string()),
              // Optional before/after images stored in Convex storage
              beforeImageStorageId: v.optional(v.id("_storage")),
              afterImageStorageId: v.optional(v.id("_storage")),
            })
          ),
        })
      )
    ),
    // Care plan templates (saved from a patient's care plan): the plan's own fields
    kind: v.optional(v.literal("care_plan")),
    sessionFrequency: v.optional(v.string()),
    plannedSessions: v.optional(v.number()),
    precautions: v.optional(v.string()),
    reviewAfterDays: v.optional(v.number()),
    createdBy: v.id("users"),
    clinicId: v.optional(v.id("clinics")),
    isPublic: v.boolean(),
    usageCount: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_created_by", ["createdBy"])
    .index("by_category", ["category"])
    .index("by_difficulty", ["difficulty"])
    .index("by_public", ["isPublic"])
    .index("by_clinic", ["clinicId"]),

  // Treatment Plans for patients
  // One course of treatment between a patient and a physiotherapist: from first contact to
  // discharge. A patient can have several over time; the history is never overwritten.
  careEpisodes: defineTable({
    patientId: v.id("users"),
    physiotherapistId: v.id("users"),
    clinicId: v.optional(v.id("clinics")),
    status: v.union(v.literal("active"), v.literal("completed"), v.literal("cancelled")),
    source: v.union(
      v.literal("referred"),
      v.literal("existing_patient"),
      v.literal("marketplace"),
      v.literal("booking_link"),
      v.literal("clinic"),
      v.literal("invite"),
      v.literal("joy_whatsapp"),
      v.literal("other")
    ),
    referredBy: v.optional(v.string()),
    condition: v.optional(v.string()), // Presenting complaint, in the physio's words
    startedAt: v.number(),
    plannedSessions: v.optional(v.number()),
    // Discharge
    completedAt: v.optional(v.number()),
    outcome: v.optional(v.union(
      v.literal("goals_met"),
      v.literal("partially_met"),
      v.literal("not_met"),
      v.literal("referred_on"),
      v.literal("stopped_attending")
    )),
    dischargeSummary: v.optional(v.string()),
    homeAdvice: v.optional(v.string()), // What the patient should keep doing
    // Rehabify's after-care follow-up with the patient
    followUpDueAt: v.optional(v.number()),
    followUpStatus: v.optional(v.union(
      v.literal("scheduled"), // waiting until followUpDueAt
      v.literal("sent"), // patient asked how it went
      v.literal("responded"), // patient answered
      v.literal("closed") // Rehabify team finished with it
    )),
    followUpSentAt: v.optional(v.number()),
    followUpRating: v.optional(v.number()), // 1-5, how happy with their care
    followUpRecovery: v.optional(v.union(
      v.literal("fully_recovered"),
      v.literal("much_better"),
      v.literal("a_little_better"),
      v.literal("no_change"),
      v.literal("worse")
    )),
    followUpComment: v.optional(v.string()),
    followUpWantsCall: v.optional(v.boolean()),
    followUpRespondedAt: v.optional(v.number()),
    followUpNotes: v.optional(v.string()), // Internal notes by the Rehabify team
    followUpHandledBy: v.optional(v.id("users")),
    followUpClosedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_patient", ["patientId"])
    .index("by_patient_and_physiotherapist", ["patientId", "physiotherapistId"])
    .index("by_physiotherapist_and_status", ["physiotherapistId", "status"])
    .index("by_follow_up", ["followUpStatus", "followUpDueAt"]),

  // How a patient is doing between sessions, in their own words
  patientCheckIns: defineTable({
    patientId: v.id("users"),
    physiotherapistId: v.optional(v.id("users")),
    episodeId: v.optional(v.id("careEpisodes")),
    painScore: v.number(), // 0-10
    functionScore: v.optional(v.number()), // 0-10, how well they manage daily activities
    mood: v.optional(v.union(v.literal("great"), v.literal("good"), v.literal("okay"), v.literal("low"))),
    exercisesDone: v.union(v.literal("all"), v.literal("some"), v.literal("none")),
    note: v.optional(v.string()),
    flagged: v.boolean(), // Needs the physio's attention (high or rising pain, low mood)
    flagReason: v.optional(v.string()),
    reviewedAt: v.optional(v.number()), // Physio has seen it
    createdAt: v.number(),
  })
    .index("by_patient", ["patientId", "createdAt"])
    .index("by_physiotherapist", ["physiotherapistId", "createdAt"]),

  treatmentPlans: defineTable({
    patientId: v.id("users"),
    physiotherapistId: v.id("users"),
    clinicId: v.optional(v.id("clinics")),
    title: v.string(),
    description: v.optional(v.string()),
    startDate: v.number(), // Timestamp
    endDate: v.optional(v.number()), // Timestamp, if applicable
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("on_hold")
    ),
    goals: v.array(v.object({
      description: v.string(),
      targetValue: v.string(),
      timeline: v.string(),
      measurable: v.boolean(),
      achieved: v.optional(v.boolean()), // Ticked off by the physio
    })),
    phases: v.array(v.object({
      name: v.string(),
      description: v.string(),
      duration: v.string(),
      order: v.number(),
      exercises: v.array(v.object({
        exerciseId: v.string(),
        name: v.optional(v.string()), // Free-text exercise name for custom (non-library) exercises
        instructions: v.optional(v.string()),
        sets: v.number(),
        reps: v.number(),
        duration: v.optional(v.string()),
        frequency: v.string(),
        notes: v.optional(v.string()),
        videoUrl: v.optional(v.string()),
        youtubeId: v.optional(v.string()),
        beforeImageStorageId: v.optional(v.id("_storage")),
        afterImageStorageId: v.optional(v.id("_storage")),
      })),
    })),
    reviewInterval: v.number(), // days
    notes: v.optional(v.string()),
    // Care plan details shown in the physio's patient workspace
    episodeId: v.optional(v.id("careEpisodes")),
    sessionFrequency: v.optional(v.string()), // e.g. "2 sessions a week"
    plannedSessions: v.optional(v.number()),
    reviewDate: v.optional(v.number()), // Next planned review of the plan
    precautions: v.optional(v.string()), // Precautions and safety guidance
    changeReason: v.optional(v.string()), // Why this version of the plan exists
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
  })
    .index("by_patient", ["patientId"])
    .index("by_clinic", ["clinicId"])
    .index("by_status", ["status"])
    .index("by_patient_and_status", ["patientId", "status"]),

  // Treatment plan progress tracking
  treatmentProgress: defineTable({
    treatmentPlanId: v.id("treatmentPlans"),
    patientId: v.id("users"),
    physiotherapistId: v.id("users"),
    entryDate: v.number(),
    progressType: v.union(
      v.literal("plan_created"),
      v.literal("plan_updated"),
      v.literal("status_change"),
      v.literal("goal_progress"),
      v.literal("exercise_completion"),
      v.literal("assessment"),
      v.literal("milestone"),
      v.literal("setback"),
      v.literal("general")
    ),
    goalId: v.optional(v.string()),
    currentValue: v.optional(v.string()),
    progressRating: v.optional(v.union(
      v.literal("poor"),
      v.literal("fair"),
      v.literal("good"),
      v.literal("excellent")
    )),
    notes: v.string(),
    measurements: v.optional(v.array(v.object({
      type: v.string(),
      value: v.string(),
      unit: v.string(),
      date: v.number(),
    }))),
    attachments: v.optional(v.array(v.object({
      fileName: v.string(),
      fileUrl: v.string(),
      fileType: v.string(),
    }))),
    recordedBy: v.id("users"),
  })
    .index("by_treatment_plan", ["treatmentPlanId"])
    .index("by_patient", ["patientId"])
    .index("by_entry_date", ["entryDate"])
    .index("by_progress_type", ["progressType"]),

  // Exercise Completions: Track when patients complete their prescribed exercises
  exerciseCompletions: defineTable({
    treatmentPlanId: v.id("treatmentPlans"),
    patientId: v.id("users"),
    physiotherapistId: v.id("users"),
    phaseOrder: v.number(), // Which phase this exercise belongs to
    exerciseId: v.string(), // The exercise identifier
    completedAt: v.number(), // Timestamp when completed
    // Performance data
    setsCompleted: v.number(),
    repsCompleted: v.number(),
    durationSeconds: v.optional(v.number()), // How long the exercise took
    // Patient feedback
    difficultyRating: v.optional(v.number()), // 1-5 scale (1=very easy, 5=very hard)
    painLevel: v.optional(v.number()), // 0-10 scale (0=no pain, 10=severe pain)
    notes: v.optional(v.string()), // Patient notes about the session
    // Metadata
    completionSource: v.optional(v.string()), // 'web', 'mobile', etc.
  })
    .index("by_patient_and_plan", ["patientId", "treatmentPlanId"])
    .index("by_patient", ["patientId"])
    .index("by_exercise", ["exerciseId"])
    .index("by_date", ["completedAt"])
    .index("by_treatment_plan", ["treatmentPlanId"]),

  // Prescribed Exercises: Linking exercises to treatment plans
  prescribedExercises: defineTable({
    treatmentPlanId: v.id("treatmentPlans"),
    exerciseId: v.id("exercises"),
    patientId: v.id("users"), // Denormalized for easier patient-specific queries
    sets: v.optional(v.number()),
    reps: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    holdSeconds: v.optional(v.number()),
    frequencyPerDay: v.optional(v.number()),
    frequencyPerWeek: v.optional(v.string()), // e.g., "3 times a week", "Mon, Wed, Fri"
    notesForPatient: v.optional(v.string()),
    orderInPlan: v.optional(v.number()), // For sequencing
    status: v.union(v.literal("pending"), v.literal("in_progress"), v.literal("completed")), // Status of this specific prescription
  })
    .index("by_treatment_plan_id", ["treatmentPlanId"])
    .index("by_patient_id", ["patientId"]),

  // Exercise Progress: Patient-reported progress on prescribed exercises
  exerciseProgress: defineTable({
    prescribedExerciseId: v.id("prescribedExercises"),
    patientId: v.id("users"),
    treatmentPlanId: v.id("treatmentPlans"), // Denormalized
    completionDate: v.number(), // Timestamp
    setsCompleted: v.optional(v.number()),
    repsCompleted: v.optional(v.number()),
    durationCompletedSeconds: v.optional(v.number()),
    painLevel: v.optional(v.number()), // e.g., 0-10 scale
    difficultyLevel: v.optional(v.number()), // e.g., 0-10 scale
    feedbackNotes: v.optional(v.string()),
    mediaEvidenceUrl: v.optional(v.string()), // Optional: patient uploads video/photo of them doing exercise
  })
    .index("by_prescribed_exercise_id", ["prescribedExerciseId"])
    .index("by_patient_id_and_date", ["patientId", "completionDate"]),

  // Invoices for billing
  invoices: defineTable({
    patientId: v.id("users"),
    physiotherapistId: v.optional(v.id("users")), // The physiotherapist who created the invoice
    clinicId: v.optional(v.id("clinics")), // Optional for independent physiotherapists
    invoiceNumber: v.string(), // Should be unique per clinic
    issueDate: v.float64(), // Timestamp
    dueDate: v.float64(), // Timestamp
    items: v.array(v.object({
      description: v.string(),
      quantity: v.float64(),
      unitPrice: v.float64(), // Store in smallest currency unit (e.g., kobo, cents)
      totalPrice: v.float64(),
    })),
    subtotalAmount: v.float64(),
    taxAmount: v.optional(v.float64()),
    discountAmount: v.optional(v.float64()),
    platformFeeAmount: v.float64(),
    paystackFeeAmount: v.optional(v.float64()),
    totalAmount: v.float64(), // Always in kobo
    paidAmount: v.optional(v.float64()), // Track partial payments
    currency: v.string(), // e.g., "NGN", "USD"
    status: v.union(v.literal("draft"), v.literal("sent"), v.literal("paid"), v.literal("overdue"), v.literal("void"), v.literal("partial_payment"), v.literal("failed")),
    paymentMethod: v.optional(v.string()),
    paymentReference: v.optional(v.string()), // Paystack payment reference
    paymentLink: v.optional(v.string()), // Shareable Paystack checkout URL (clinic payment requests)
    paymentLinkExpiresAt: v.optional(v.float64()), // the link is renewed after this (helpers/paymentLinks.ts)
    paymentLinkAmount: v.optional(v.float64()), // kobo the link charges; a changed invoice gets a new link
    refundedAmount: v.optional(v.float64()), // kobo refunded through Paystack (partial or full)
    paymentDate: v.optional(v.float64()),
    // Where an online payment's provider share went: split straight to the
    // clinic/physio bank by Paystack, or held by Rehabify for a manual transfer.
    payoutRoute: v.optional(v.union(v.literal("split_to_provider"), v.literal("held_by_platform"))),
    // Stamp duty (EMTL) deducted from the clinic's payout, in kobo (see convex/clinicFees.ts)
    stampDutyAmount: v.optional(v.float64()),
    // Clinic's share (%) used when this invoice was created; fee settings can change later
    clinicSharePercent: v.optional(v.float64()),
    notes: v.optional(v.string()),
    relatedAppointmentIds: v.optional(v.array(v.id("appointments"))),
    // Clinic invoices: whether the patient is the clinic's own or was referred by Rehabify,
    // copied from the care relationship when the invoice is made (kept for billing reports)
    patientSource: v.optional(v.union(v.literal("clinic_direct"), v.literal("rehabify_referral"))),
    physiotherapistShare: v.optional(v.float64()), // Amount physiotherapist gets after fees
    platformShare: v.optional(v.float64()), // Platform's fee portion
    feeBreakdown: v.optional(v.object({
      subtotal: v.float64(),
      discount: v.float64(),
      platformFee: v.float64(),
      paystackPercentage: v.float64(),
      paystackFlat: v.float64(),
      total: v.float64(),
      physiotherapistEarnings: v.float64(),
    })),
  })
    .index("by_patient_id", ["patientId"])
    .index("by_physiotherapist_id", ["physiotherapistId"])
    .index("by_clinic_id", ["clinicId"])
    .index("by_clinic_id_and_status", ["clinicId", "status"])
    .index("by_status_and_due_date", ["status", "dueDate"])
    .index("by_clinic_id_and_invoice_number", ["clinicId", "invoiceNumber"])
    .index("by_payment_reference", ["paymentReference"]),

  // ─── Phase 4: Doctor & Referring Partner Portal ───

  // Profiles for doctors/partners referring patients to Rehabify
  referringDoctorProfiles: defineTable({
    userId: v.id("users"),
    title: v.optional(v.string()), // e.g., "Dr.", "Prof."
    medicalLicenseNumber: v.optional(v.string()),
    specialty: v.optional(v.string()), // e.g., "Orthopedics", "General Practice"
    hospitalAffiliation: v.optional(v.string()), // Where they work
    bio: v.optional(v.string()),

    // Financial/Payout Details
    bankName: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    accountName: v.optional(v.string()),

    // Configurable commission structure per doctor (optional, defaults could apply globally)
    commissionRateOverride: v.optional(v.number()), // percentage, e.g., 0.1 for 10%
    flatFeeOverride: v.optional(v.number()), // flat fee per referral in kobo
  })
    .index("by_user_id", ["userId"]),

  // Inbound patient referrals from referring doctors/partners
  inboundReferrals: defineTable({
    referringDoctorId: v.optional(v.id("users")), // The doctor who made the referral (optional if partner API)
    partnerId: v.optional(v.string()), // Slug or ID of external partner (e.g. "wellahealth")
    partnerExternalId: v.optional(v.string()), // Partner's own generated reference ID (e.g. "WELLA-2026-000123")
    trackingCode: v.optional(v.string()), // Human-readable unique code (e.g. "RHB-72941")

    // Attribution — links back to partner referral link system
    linkId: v.optional(v.id("partnerReferralLinks")), // Which referral link generated this
    campaignName: v.optional(v.string()), // Denormalized from link for quick access
    firstClickAt: v.optional(v.number()), // When the partner link was first opened
    conversionSource: v.optional(v.string()), // "partner_link", "api", "doctor_referral", "manual"

    // Patient Details Provided Before Registration
    patientFirstName: v.string(),
    patientLastName: v.string(),
    patientEmail: v.optional(v.string()),
    patientPhone: v.string(),
    city: v.optional(v.string()), // City for physical therapist matching (e.g. "Lagos")
    state: v.optional(v.string()), // State (e.g. "Lagos")
    area: v.optional(v.string()), // Neighborhood / LGA (e.g. "Ikeja", "Victoria Island")
    preferredLanguage: v.optional(v.string()), // "en", "yo", "ig", "ha"
    hospitalClinic: v.optional(v.string()), // The hospital/clinic the referral is coming from
    condition: v.optional(v.string()),
    reason: v.optional(v.string()), // Patient-stated reason (e.g. "back_pain")
    clinicalNotes: v.optional(v.string()), // Reason for referral, initial diagnosis (admin-only, never exposed to partners)
    priority: v.optional(v.string()), // "standard", "urgent", "high"
    recommendedSessions: v.optional(v.number()), // Prescribed session count
    billingMode: v.optional(v.string()), // "patient_self_pay", "hmo_direct_billing", "corporate_sponsored"
    callbackUrl: v.optional(v.string()), // Partner webhook callback URL

    // Care mode & contact preferences
    preferredCareMode: v.optional(v.string()), // "remote", "face_to_face", "patient_choice"
    preferredContactChannel: v.optional(v.string()), // "whatsapp", "email", "sms"
    nextStep: v.optional(v.string()), // "contact_me" or "start_joy"

    // Consent tracking
    consentGranted: v.optional(v.boolean()),
    consentCapturedAt: v.optional(v.number()),
    consentMethod: v.optional(v.string()), // "partner_landing", "wellahealth_app", "whatsapp"
    consentPrivacyNoticeVersion: v.optional(v.string()), // e.g. "2026-09-01"

    // Tracking the patient lifecycle
    patientId: v.optional(v.id("users")), // Linked once they sign up
    appointmentId: v.optional(v.id("appointments")), // Associated first appointment
    bookingId: v.optional(v.id("marketplaceBookings")), // Linked marketplace booking
    assignedPhysiotherapistId: v.optional(v.id("users")), // Matched physiotherapist
    assignedClinicId: v.optional(v.id("clinics")), // Clinic routed by Rehabify admin; only this clinic can see the referral

    // Controlled referral statuses (spec-compliant 16 statuses + legacy compat)
    status: v.union(
      // ── Spec statuses ──
      v.literal("received"),              // Referral accepted by Rehabify
      v.literal("consent_pending"),       // Valid consent evidence required
      v.literal("contacted"),             // Patient contact attempted or completed
      v.literal("intake_started"),        // Patient began Rehabify intake
      v.literal("intake_completed"),      // Required intake information received
      v.literal("qualified"),             // Appropriate for a Rehabify pathway
      v.literal("redirected_for_safety"), // Directed to appropriate care; no clinical detail disclosed
      v.literal("booked"),                // Appointment confirmed
      v.literal("attended"),              // Paid appointment attended
      v.literal("treatment_active"),      // Active rehabilitation episode
      v.literal("completed"),             // Care episode completed
      v.literal("cancelled"),             // Appointment or referral cancelled
      v.literal("not_suitable"),          // Not appropriate for the available service
      v.literal("refunded"),              // Related patient payment refunded
      v.literal("closed"),               // No further partner-facing activity expected
      // ── Legacy statuses (backward compat) ──
      v.literal("pending"),              // Maps to "received" conceptually
      v.literal("in_treatment"),         // Maps to "treatment_active"
      v.literal("paid_out")              // Maps to "closed"
    ),

    // WhatsApp Joy Bridge — links the referral to the patient's WhatsApp number
    whatsappPhone: v.optional(v.string()),        // Verified WhatsApp phone that interacted with Joy
    whatsappJoyPersonId: v.optional(v.string()),   // Joy's internal person identifier
    lastWhatsAppInteractionAt: v.optional(v.number()), // Timestamp of latest WhatsApp interaction

    // Financial Tracking
    commissionEarned: v.optional(v.number()), // Amount earned by referrer in kobo

    // Isolation between Sandbox / Testing and Live Production
    environment: v.optional(v.union(v.literal("sandbox"), v.literal("live"))),

    // Partner contract v1 fields
    patientPhoneNormalized: v.optional(v.string()), // E.164, used for de-duplication
    partnerMetadata: v.optional(v.record(v.string(), v.string())), // Echoed back to the partner
    eventSequence: v.optional(v.number()), // Last webhook sequence number emitted for this referral
    sandboxProviderAssigned: v.optional(v.boolean()), // Sandbox only: simulated provider
    contactedAt: v.optional(v.number()),
    providerMatchedAt: v.optional(v.number()),
    bookedAt: v.optional(v.number()),
    treatmentStartedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_referring_doctor", ["referringDoctorId"])
    .index("by_patient", ["patientId"])
    .index("by_status", ["status"])
    .index("by_referring_doctor_and_status", ["referringDoctorId", "status"])
    .index("by_partner_external_id", ["partnerExternalId"])
    .index("by_tracking_code", ["trackingCode"])
    .index("by_partner_id", ["partnerId"])
    .index("by_partner_and_environment", ["partnerId", "environment"])
    .index("by_partner_env_external_id", ["partnerId", "environment", "partnerExternalId"])
    .index("by_partner_and_phone", ["partnerId", "patientPhoneNormalized"])
    .index("by_phone_normalized", ["patientPhoneNormalized"])
    .index("by_link_id", ["linkId"])
    .index("by_whatsapp_phone", ["whatsappPhone"])
    .index("by_assigned_clinic", ["assignedClinicId"]),

  // MyItura MediLoan applications — formally initiated with the MyItura SDK
  loanApplications: defineTable({
    // Link back to the loanRequest that triggered this (if originated from a patient form)
    loanRequestId: v.optional(v.id("loanRequests")),

    patientId: v.optional(v.id("users")),
    initiatedBy: v.optional(v.id("users")), // Admin or Physio who called the SDK
    clientReference: v.string(),             // Unique internal ref (RH-LOAN-xxx)
    invoiceReference: v.optional(v.string()),
    myituraSdkRef: v.optional(v.string()),   // 10-char MyItura ref returned on success
    treatment: v.string(),
    amount: v.number(),                      // in kobo (100 kobo = ₦1)

    // Patient display fields (denormalized for quick access)
    patientFirstName: v.string(),
    patientLastName: v.string(),
    patientPhone: v.string(),
    patientEmail: v.optional(v.string()),

    applicationUrl: v.optional(v.string()),  // SMS link sent to patient by MyItura
    expiresAt: v.optional(v.string()),

    status: v.union(
      v.literal("initiated"),      // SDK called, SMS sent
      v.literal("pending"),        // Patient submitted their application
      v.literal("approved"),       // Loan approved by MyItura / offer issued
      v.literal("offer_accepted"), // Patient accepted the loan terms
      v.literal("disbursed"),      // Funds released to Rehabify (the invoice is then marked paid)
      v.literal("declined"),       // Application rejected, or the patient declined the terms
      v.literal("expired"),        // 7-day application window lapsed
      v.literal("cancelled"),      // Cancelled before disbursement
      v.literal("defaulted"),      // Patient stopped repaying MyItura
      v.literal("failed"),         // API or system error
      v.literal("repaid")          // Patient fully repaid the loan
    ),

    // What the loan pays for: an invoice (marked paid when the loan disburses) or an unpaid
    // marketplace booking (confirmed when it disburses). Every new loan has one of the two.
    invoiceId: v.optional(v.id("invoices")),
    bookingId: v.optional(v.id("marketplaceBookings")),
    physiotherapistId: v.optional(v.id("users")), // The provider being paid, for their billing view
    attentionReason: v.optional(v.string()), // Set when a payout couldn't be applied automatically
    myituraLoanId: v.optional(v.string()), // MyItura's loanId, from webhooks or a status lookup
    amountApproved: v.optional(v.number()), // kobo
    lastEvent: v.optional(v.string()),
    lastEventAt: v.optional(v.number()),

    // Post-loan tracking
    disbursedAt: v.optional(v.number()),
    repaymentStatus: v.optional(v.string()),
    lastWebhookPayload: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_patient", ["patientId"])
    .index("by_clientReference", ["clientReference"])
    .index("by_myituraSdkRef", ["myituraSdkRef"])
    .index("by_status", ["status"])
    .index("by_loanRequest", ["loanRequestId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_invoice", ["invoiceId"])
    .index("by_booking", ["bookingId"])
    .index("by_physiotherapist", ["physiotherapistId"])
    .index("by_myituraLoanId", ["myituraLoanId"]),

  // MediLoan webhook deliveries already handled (X-MyItura-Delivery-Id), so retries are no-ops
  mediloanWebhookDeliveries: defineTable({
    deliveryId: v.string(),
    event: v.string(),
    loanApplicationId: v.optional(v.id("loanApplications")),
    receivedAt: v.number(),
  }).index("by_delivery_id", ["deliveryId"]),

  // Referrals to other healthcare providers
  referrals: defineTable({
    patientId: v.id("users"),
    referringPhysiotherapistId: v.id("users"),
    clinicId: v.id("clinics"), // Clinic from which referral originated
    receivingProviderName: v.string(),
    receivingProviderSpecialty: v.optional(v.string()),
    receivingProviderContact: v.optional(v.string()), // Email or phone
    reasonForReferral: v.string(),
    referralDate: v.number(), // Timestamp
    status: v.union(v.literal("draft"), v.literal("sent"), v.literal("acknowledged"), v.literal("completed"), v.literal("rejected")),
    notes: v.optional(v.string()),
    attachments: v.optional(v.array(v.id("_storage"))), // IDs of files in Convex storage (e.g., referral letter PDF)
  })
    .index("by_patient_id", ["patientId"])
    .index("by_referring_physiotherapist_id", ["referringPhysiotherapistId"]),

  // Conversations for real-time chat
  conversations: defineTable({
    participant1Id: v.id("users"),
    participant2Id: v.id("users"),
    lastMessageAt: v.number(),
    unreadCount1: v.number(), // Unread count for participant1
    unreadCount2: v.number(), // Unread count for participant2
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_participant1", ["participant1Id"])
    .index("by_participant2", ["participant2Id"])
    .index("by_participants", ["participant1Id", "participant2Id"]),

  // Messages in conversations
  messages: defineTable({
    conversationId: v.id("conversations"),
    senderId: v.id("users"),
    receiverId: v.id("users"),
    content: v.string(),
    contentType: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("file"),
      v.literal("audio")
    ),
    replyToMessageId: v.optional(v.id("messages")),
    fileUrl: v.optional(v.string()),
    timestamp: v.number(),
    // WhatsApp-style message status fields
    isDelivered: v.optional(v.boolean()), // Message delivered to recipient's device
    isReadByReceiver: v.boolean(),
    isRead: v.optional(v.boolean()), // Make optional for existing messages
    deliveredAt: v.optional(v.number()), // When message was delivered
    readAt: v.optional(v.number()),
    createdAt: v.optional(v.number()), // Make optional for existing messages
    updatedAt: v.optional(v.number()), // Make optional for existing messages
    metadata: v.optional(v.any()),
    // Reactions: array of { userId, type, timestamp }
    reactions: v.optional(
      v.array(
        v.object({
          userId: v.id("users"),
          type: v.string(),
          timestamp: v.number(),
        })
      )
    ),
    // Soft delete and edit flags
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    editedAt: v.optional(v.number()),
    editedBy: v.optional(v.id("users")),
    // Starring messages per user
    starredBy: v.optional(v.array(v.id("users"))),
  })
    .index("by_conversation_id", ["conversationId"])
    .index("by_conversation_id_and_timestamp", ["conversationId", "timestamp"])
    .index("by_sender", ["senderId"])
    .index("by_receiver_id_and_is_read_by_receiver", ["receiverId", "isReadByReceiver"])
    .index("by_conversation_and_receiver_and_read", ["conversationId", "receiverId", "isReadByReceiver"])
    .index("by_receiver_and_delivered", ["receiverId", "isDelivered"]),

  // Typing status for real-time chat
  typingStatus: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    isTyping: v.boolean(),
    timestamp: v.number(),
    expiresAt: v.number(),
  })
    .index("by_conversation_id_and_user", ["conversationId", "userId"])
    .index("by_conversation_id_and_expires", ["conversationId", "expiresAt"])
    .index("by_conversation_user_typing", ["conversationId", "userId", "isTyping"]),

  // Video calls for remote consultations - Unified schema supporting both scheduled and real-time calls
  videoCalls: defineTable({
    // Core call identification
    roomId: v.string(), // Legacy room identifier for backward compatibility
    appointmentId: v.optional(v.id("appointments")), // Associated appointment if any

    // Stream.io specific fields
    streamCallId: v.optional(v.string()), // Stream call ID
    streamCallType: v.optional(v.string()), // Stream call type (default, livestream, etc.)
    streamMetadata: v.optional(v.any()), // Stream-specific metadata

    // Daily.co specific fields (deprecated but kept for migration)
    dailyRoomName: v.optional(v.string()), // Daily.co room name
    dailyRoomUrl: v.optional(v.string()), // Daily.co room URL
    dailyRoomId: v.optional(v.string()), // Daily.co room ID

    // Call metadata
    title: v.optional(v.string()), // Call title/description
    callType: v.union(
      v.literal("appointment"),
      v.literal("consultation"),
      v.literal("emergency")
    ),
    status: v.union(
      v.literal("scheduled"),
      v.literal("active"),
      v.literal("ended"),
      v.literal("cancelled"),
      v.literal("missed")
    ),
    platform: v.optional(v.union(
      v.literal("daily"),
      v.literal("zoom"),
      v.literal("teams"),
      v.literal("stream"),
      v.literal("internal"),
      v.literal("google_meet")
    )),

    // Participants and ownership
    initiatorId: v.id("users"), // User who created/initiated the call
    participants: v.array(v.id("users")), // All participants in the call
    patientId: v.optional(v.id("users")), // Primary patient (for appointment-based calls)
    physiotherapistId: v.optional(v.id("users")), // Primary physiotherapist (for appointment-based calls)
    clinicId: v.optional(v.id("clinics")), // Associated clinic

    // Scheduling and timing
    scheduledAt: v.optional(v.number()), // Scheduled start time (for planned calls)
    startTime: v.number(), // Actual start time
    endTime: v.optional(v.number()), // When call ended
    duration: v.optional(v.number()), // Call duration in seconds
    plannedDuration: v.optional(v.number()), // Planned duration in minutes

    // Call settings
    settings: v.optional(v.object({
      recordingEnabled: v.boolean(),
      chatEnabled: v.boolean(),
      maxParticipants: v.number(),
      waitingRoomEnabled: v.boolean(),
      screenShareEnabled: v.optional(v.boolean()),
      transcriptionEnabled: v.optional(v.boolean()),
      maxDuration: v.optional(v.number()),
      geoFencing: v.optional(v.boolean()),
      prejoinUiEnabled: v.optional(v.boolean()),
      ejectAtRoomExp: v.optional(v.boolean()),
      ejectAfterElapsed: v.optional(v.number()),
      language: v.optional(v.string()),
      geo: v.optional(v.string()),
      durationMinutes: v.optional(v.number()),
    })),

    // Recording and notes
    recordingUrl: v.optional(v.string()),
    notes: v.optional(v.string()),
    meetingLink: v.optional(v.string()), // Meeting URL for any platform

    // Daily.co config (deprecated but kept for backward compatibility)
    dailyConfig: v.optional(v.object({
      roomExp: v.number(),
      roomProperties: v.optional(v.any()),
      meetingTokens: v.optional(v.array(v.object({
        userId: v.id("users"),
        token: v.string(),
        expiresAt: v.number(),
        isOwner: v.boolean(),
      }))),
    })),

    // Cancellation tracking
    cancellationReason: v.optional(v.string()),
    cancelledBy: v.optional(v.id("users")),
    cancelledAt: v.optional(v.number()),
    endedBy: v.optional(v.id("users")),

    // Timestamps
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_room_id", ["roomId"])
    .index("by_stream_call_id", ["streamCallId"])
    .index("by_daily_room_name", ["dailyRoomName"])
    .index("by_daily_room_id", ["dailyRoomId"])
    .index("by_initiator", ["initiatorId"])
    .index("by_patient_id_and_scheduled", ["patientId", "scheduledAt"])
    .index("by_clinic_id_and_scheduled", ["clinicId", "scheduledAt"])
    .index("by_appointment", ["appointmentId"])
    .index("by_status", ["status"])
    .index("by_status_and_start_time", ["status", "startTime"])
    .index("by_platform", ["platform"]),

  // Notification Retry Queue: For tracking failed notification sends that need retry
  notificationRetryQueue: defineTable({
    userId: v.id("users"),
    type: v.string(),
    title: v.string(),
    message: v.string(),
    data: v.object({
      entityId: v.optional(v.string()),
      entityType: v.optional(v.string()),
      actionUrl: v.optional(v.string()),
      metadata: v.optional(v.any()),
    }),
    sendEmail: v.boolean(),
    retryCount: v.number(),
    maxRetries: v.number(),
    nextRetryAt: v.number(),
    createdAt: v.number(),
    status: v.union(v.literal("pending"), v.literal("processing"), v.literal("completed"), v.literal("failed")),
  })
    .index("by_status_and_next_retry", ["status", "nextRetryAt"])
    .index("by_user_id", ["userId"]),

  // Payments table for tracking payment transactions
  payments: defineTable({
    invoiceId: v.id("invoices"),
    userId: v.id("users"), // User who made the payment (patient)
    amount: v.number(),
    currency: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    paymentMethod: v.optional(v.string()),
    transactionReference: v.string(),
    paystackReference: v.optional(v.string()),
    gatewayResponse: v.optional(v.any()),
    metadata: v.optional(v.any()),
    paidAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_invoice_id", ["invoiceId"])
    .index("by_user_id", ["userId"])
    .index("by_status", ["status"])
    .index("by_transaction_reference", ["transactionReference"])
    .index("by_paystack_reference", ["paystackReference"]),

  // Payouts table for tracking earnings payouts to physiotherapists/clinics
  payouts: defineTable({
    paymentId: v.optional(v.id("payments")), // Set when the invoice's payment record is known

    invoiceId: v.id("invoices"),
    userId: v.id("users"), // Recipient (physiotherapist or clinic owner)
    type: v.union(
      v.literal("physiotherapist_earning"),
      v.literal("clinic_earning"),
      v.literal("platform_fee")
    ),
    amount: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    bankAccountId: v.optional(v.id("bankAccounts")),
    processedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    // Set by admins from /dashboard/admin/payouts
    transferReference: v.optional(v.string()),
    adminNote: v.optional(v.string()),
    updatedBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_payment_id", ["paymentId"])
    .index("by_payout_invoice_id", ["invoiceId"])
    .index("by_status", ["status"])
    .index("by_user_and_status", ["userId", "status"]),

  // Bank accounts for physiotherapists
  bankAccountsNew: defineTable({
    userId: v.id("users"),
    accountNumber: v.string(),
    bankCode: v.string(),
    bankName: v.string(),
    accountName: v.string(),
    accountType: v.union(v.literal("savings"), v.literal("current")),
    currency: v.string(),
    isActive: v.boolean(),
    isVerified: v.boolean(),
    verificationData: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_user_and_active", ["userId", "isActive"]),

  // Bulk transfers for batch payouts
  bulkTransfers: defineTable({
    userId: v.id("users"),
    bankAccountId: v.id("bankAccounts"),
    payoutIds: v.array(v.id("payouts")),
    totalAmount: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    transferReference: v.optional(v.string()),
    gatewayResponse: v.optional(v.any()),
    failureReason: v.optional(v.string()),
    processedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_bank_account_id", ["bankAccountId"])
    .index("by_status", ["status"]),

  // Email Retry Queue: For tracking failed email sends that need retry
  emailRetryQueue: defineTable({
    notificationId: v.id("notifications"),
    retryCount: v.number(),
    maxRetries: v.number(),
    nextRetryAt: v.number(),
    createdAt: v.number(),
    status: v.union(v.literal("pending"), v.literal("processing"), v.literal("completed"), v.literal("failed")),
  })
    .index("by_status_and_next_retry", ["status", "nextRetryAt"])
    .index("by_notification_id", ["notificationId"]),

  // Surveys for outcome tracking and satisfaction
  surveys: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    questions: v.array(v.object({
      id: v.string(), // Unique question ID within the survey
      text: v.string(),
      type: v.union(v.literal("multiple_choice_single"), v.literal("multiple_choice_multiple"), v.literal("rating_scale_5"), v.literal("rating_scale_10"), v.literal("open_text"), v.literal("yes_no")),
      options: v.optional(v.array(v.string())), // For multiple_choice types
      isRequired: v.boolean(),
    })),
    targetAudience: v.union(v.literal("patient"), v.literal("physiotherapist"), v.literal("clinic_owner")),
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    createdBy: v.id("users"), // User who created the survey (admin or clinic owner)
    clinicId: v.optional(v.id("clinics")), // If survey is clinic-specific
  })
    .index("by_created_by", ["createdBy"])
    .index("by_clinic_id_and_status", ["clinicId", "status"]),

  // Survey Responses
  surveyResponses: defineTable({
    surveyId: v.id("surveys"),
    respondentId: v.id("users"),
    clinicId: v.optional(v.id("clinics")), // Clinic associated with the response, if applicable
    submissionDate: v.number(), // Timestamp
    answers: v.array(v.object({
      questionId: v.string(),
      answerValue: v.any(), // Can be string, number, array of strings depending on question type
    })),
  })
    .index("by_survey_id_and_respondent_id", ["surveyId", "respondentId"])
    .index("by_survey_id", ["surveyId"]),

  // Notes Templates for quick-fill session notes
  notesTemplates: defineTable({
    title: v.string(),
    content: v.string(), // The template text, possibly with placeholders like {{patientName}}
    category: v.optional(v.string()), // e.g., "Initial Assessment", "Follow-up", "Condition-Specific"
    scope: v.union(v.literal("system"), v.literal("clinic"), v.literal("user_physio")),
    createdByUserId: v.optional(v.id("users")), // If scope is user_physio or system (admin)
    clinicId: v.optional(v.id("clinics")), // If scope is clinic
    tags: v.optional(v.array(v.string())),
  })
    .index("by_scope_and_clinic_id", ["scope", "clinicId"])
    .index("by_scope_and_created_by_user_id", ["scope", "createdByUserId"]),

  // Audit Logs for tracking important system events
  auditLogs: defineTable({
    actorUserId: v.optional(v.id("users")), // User who performed the action
    action: v.string(), // e.g., "user_login", "patient_profile_updated", "invoice_created"
    targetEntityType: v.optional(v.string()), // e.g., "patient", "invoice"
    targetEntityId: v.optional(v.string()), // ID of the entity affected
    timestamp: v.number(), // _creationTime can be used
    details: v.optional(v.any()), // Additional details about the event (e.g., changed fields)
    ipAddress: v.optional(v.string()),
  })
    .index("by_actor_user_id_and_timestamp", ["actorUserId", "timestamp"])
    .index("by_action_and_timestamp", ["action", "timestamp"]),

  // Patients table: Core patient data (compatible with existing structure)
  patients: defineTable({
    userId: v.id("users"), // Reference to users table
    patientProfileId: v.optional(v.id("patientProfiles")), // Reference to patient profile
    clinicId: v.optional(v.id("clinics")), // Primary clinic association
    primaryPhysiotherapistId: v.optional(v.id("users")), // Primary physiotherapist
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("pending_onboarding"),
      v.literal("archived")
    ),
    firstName: v.optional(v.string()), // Denormalized for quick access
    lastName: v.optional(v.string()), // Denormalized for quick access
    email: v.optional(v.string()), // Denormalized for quick access
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"), v.literal("prefer_not_to_say"))),
    phoneNumber: v.optional(v.string()),
    address: v.optional(v.string()),
    emergencyContact: v.optional(v.object({
      name: v.string(),
      relationship: v.string(),
      phone: v.string(),
    })),
    medicalHistory: v.optional(v.string()),
    currentConditions: v.optional(v.array(v.string())),
    allergies: v.optional(v.array(v.string())),
    medications: v.optional(v.array(v.string())),
    insuranceInfo: v.optional(v.object({
      provider: v.string(),
      policyNumber: v.string(),
      groupNumber: v.optional(v.string()),
    })),
    onboardedAt: v.optional(v.number()),
    lastAppointmentAt: v.optional(v.number()),
    totalSessions: v.optional(v.number()),
    notes: v.optional(v.string()),
    // Flagging for review
    isFlagged: v.optional(v.boolean()),
    flagReason: v.optional(v.string()),
    flaggedBy: v.optional(v.id("users")),
    flaggedAt: v.optional(v.number()),
  })
    .index("by_user_id", ["userId"])
    .index("by_clinic_id", ["clinicId"])
    .index("by_primary_physiotherapist", ["primaryPhysiotherapistId"])
    .index("by_status", ["status"])
    .index("by_email", ["email"]),

  // Clinic Owner Profiles: Additional profile information for clinic owners
  clinicOwnerProfiles: defineTable({
    userId: v.id("users"),
    clinicId: v.id("clinics"),
    businessLicense: v.optional(v.string()),
    taxId: v.optional(v.string()),
    businessAddress: v.optional(v.string()),
    yearsInBusiness: v.optional(v.number()),
    specializations: v.optional(v.array(v.string())),
    bio: v.optional(v.string()),
    preferredLanguage: v.optional(v.string()),
    businessPhone: v.optional(v.string()),
    businessEmail: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    socialMediaLinks: v.optional(v.object({
      facebook: v.optional(v.string()),
      twitter: v.optional(v.string()),
      linkedin: v.optional(v.string()),
      instagram: v.optional(v.string()),
    })),
    operatingHours: v.optional(v.object({
      monday: v.optional(v.string()),
      tuesday: v.optional(v.string()),
      wednesday: v.optional(v.string()),
      thursday: v.optional(v.string()),
      friday: v.optional(v.string()),
      saturday: v.optional(v.string()),
      sunday: v.optional(v.string()),
    })),
    emergencyContact: v.optional(v.object({
      name: v.string(),
      phone: v.string(),
      relationship: v.string(),
    })),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"), v.literal("prefer_not_to_say"))),
    referralSource: v.optional(v.string()), // How did you hear about us?
  })
    .index("by_user_id", ["userId"])
    .index("by_clinic_id", ["clinicId"]),



  settings: defineTable({
    userId: v.id("users"),
    notifications: v.object({
      email: v.object({
        enabled: v.boolean(),
        types: v.array(v.string()),
        frequency: v.union(v.literal("immediate"), v.literal("daily"), v.literal("weekly")),
      }),
      push: v.object({
        enabled: v.boolean(),
        types: v.array(v.string()),
      }),
      inApp: v.object({
        enabled: v.boolean(),
        types: v.array(v.string()),
        showBadge: v.boolean(),
        playSound: v.boolean(),
      }),
      doNotDisturb: v.object({
        enabled: v.boolean(),
        startTime: v.string(), // "HH:mm" format
        endTime: v.string(),   // "HH:mm" format
      }),
    }),
    preferences: v.object({
      theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
      language: v.string(),
      timezone: v.string(),
      dateFormat: v.union(v.literal("MM/DD/YYYY"), v.literal("DD/MM/YYYY"), v.literal("YYYY-MM-DD")),
      timeFormat: v.union(v.literal("12h"), v.literal("24h")),
    }),
    privacy: v.object({
      profileVisibility: v.union(
        v.literal("public"),
        v.literal("private"),
        v.literal("clinic_only")
      ),
      shareAnalytics: v.boolean(),
      dataRetention: v.object({
        messageHistory: v.number(), // days
        activityLogs: v.number(),   // days
      }),
    }),
  })
    .index("by_user", ["userId"]),

  clinicSettings: defineTable({
    clinicId: v.id("clinics"),
    scheduling: v.object({
      defaultAppointmentDuration: v.number(), // minutes
      minAdvanceBooking: v.number(),         // hours
      maxAdvanceBooking: v.number(),         // days
      allowWaitlist: v.boolean(),
      bufferBetweenAppointments: v.number(), // minutes
      defaultAvailability: v.array(v.object({
        dayOfWeek: v.number(), // 0-6 (Sunday-Saturday)
        startTime: v.string(), // "HH:mm"
        endTime: v.string(),   // "HH:mm"
      })),
    }),
    business: v.object({
      workingHours: v.array(v.object({
        dayOfWeek: v.number(),
        startTime: v.string(),
        endTime: v.string(),
        isWorkingDay: v.boolean(),
      })),
      holidays: v.array(v.string()), // "YYYY-MM-DD"
      timezone: v.string(),
      breakTimes: v.array(v.object({
        startTime: v.string(),
        endTime: v.string(),
        days: v.array(v.number()),
      })),
    }),
    communications: v.object({
      automaticReminders: v.boolean(),
      reminderTiming: v.array(v.object({
        type: v.union(v.literal("email"), v.literal("sms"), v.literal("push")),
        beforeAppointment: v.number(), // hours
      })),
      allowSMS: v.boolean(),
      customMessageTemplates: v.array(v.object({
        type: v.string(),
        subject: v.string(),
        body: v.string(),
      })),
    }),
    analytics: v.object({
      trackPatientProgress: v.boolean(),
      enabledMetrics: v.array(v.string()),
      reportSchedule: v.union(
        v.literal("never"),
        v.literal("daily"),
        v.literal("weekly"),
        v.literal("monthly")
      ),
      customMetrics: v.array(v.object({
        name: v.string(),
        type: v.union(v.literal("count"), v.literal("average"), v.literal("sum")),
        source: v.string(),
      })),
    }),
  })
    .index("by_clinic", ["clinicId"]),

  analytics_events: defineTable({
    type: v.string(),
    userId: v.optional(v.id("users")),
    clinicId: v.optional(v.id("clinics")),
    metadata: v.object({
      path: v.optional(v.string()),
      duration: v.optional(v.number()),
      error: v.optional(v.string()),
      status: v.optional(v.string()),
      details: v.optional(v.any()),
    }),
    timestamp: v.number(),
  })
    .index("by_type", ["type"])
    .index("by_user", ["userId"])
    .index("by_clinic", ["clinicId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_type_and_timestamp", ["type", "timestamp"])
    .index("by_clinic_and_timestamp", ["clinicId", "timestamp"]),

  // ... (rest of the code remains the same)
  // Video Call Chat Messages
  videoCallMessages: defineTable({
    callId: v.id("videoCalls"), // Reference to the video call
    senderId: v.id("users"), // User who sent the message
    message: v.string(), // Message content
    timestamp: v.number(), // When message was sent
    messageType: v.union(
      v.literal("text"), // Regular text message
      v.literal("system"), // System message (user joined/left, etc.)
      v.literal("file"), // File sharing
      v.literal("emoji") // Emoji reaction
    ),
    isEdited: v.optional(v.boolean()),
    editedAt: v.optional(v.number()),
    replyTo: v.optional(v.id("videoCallMessages")), // For threaded replies
    attachments: v.optional(v.array(v.object({
      fileName: v.string(),
      fileSize: v.number(),
      fileType: v.string(),
      fileUrl: v.string(), // Convex file storage ID or URL
    }))),
  })
    .index("by_call_id_and_timestamp", ["callId", "timestamp"])
    .index("by_sender", ["senderId"]),

  // Video Call Participants (for detailed participant tracking)
  videoCallParticipants: defineTable({
    callId: v.id("videoCalls"),
    userId: v.id("users"),
    joinedAt: v.number(), // When participant joined
    leftAt: v.optional(v.number()), // When participant left (if they have)
    role: v.union(
      v.literal("host"), // Call initiator/moderator
      v.literal("participant"), // Regular participant
      v.literal("observer") // View-only (for training scenarios)
    ),
    permissions: v.object({
      canSpeak: v.boolean(),
      canVideo: v.boolean(),
      canScreenShare: v.boolean(),
      canChat: v.boolean(),
      canRecord: v.boolean(),
    }),
    // RSVP tracking
    rsvpStatus: v.optional(v.union(
      v.literal("invited"),
      v.literal("accepted"),
      v.literal("declined"),
      v.literal("tentative")
    )),
    rsvpUpdatedAt: v.optional(v.number()),
    // Daily.co specific fields
    dailyMeetingToken: v.optional(v.string()), // Daily.co meeting token for this participant
    dailyTokenExpiration: v.optional(v.number()), // When the token expires
    connectionQuality: v.optional(v.object({
      video: v.optional(v.string()), // "excellent", "good", "poor"
      audio: v.optional(v.string()),
      lastChecked: v.number(),
    })),
    deviceInfo: v.optional(v.object({
      camera: v.optional(v.string()),
      microphone: v.optional(v.string()),
      speaker: v.optional(v.string()),
      browser: v.optional(v.string()),
      os: v.optional(v.string()),
    })),
  })
    .index("by_call_id", ["callId"])
    .index("by_user_id", ["userId"])
    .index("by_call_and_user", ["callId", "userId"]),

  // Call Recording metadata (if recording feature is implemented)
  videoCallRecordings: defineTable({
    callId: v.id("videoCalls"),
    fileName: v.string(),
    fileSize: v.number(),
    duration: v.number(), // Recording duration in seconds
    format: v.string(), // "webm", "mp4", etc.
    quality: v.string(), // "720p", "1080p", etc.
    storageUrl: v.string(), // Convex file storage ID or external URL
    startTime: v.number(), // When recording started
    endTime: v.number(), // When recording ended
    uploadedBy: v.id("users"), // User who initiated the recording
    isTranscribed: v.optional(v.boolean()),
    transcriptionUrl: v.optional(v.string()),
    permissions: v.object({
      isPublic: v.boolean(),
      allowedUsers: v.optional(v.array(v.id("users"))),
      expiresAt: v.optional(v.number()), // Auto-delete timestamp
    }),
  })
    .index("by_call_id", ["callId"])
    .index("by_uploaded_by", ["uploadedBy"]),

  // Physiotherapist Live Locations for tracking
  physiotherapistLocations: defineTable({
    physiotherapistId: v.id("users"),
    latitude: v.number(),
    longitude: v.number(),
    status: v.union(v.literal("in_transit"), v.literal("at_patient"), v.literal("idle")),
    lastUpdated: v.number(),
    accuracy: v.optional(v.number()), // GPS accuracy radius
  })
    .index("by_physiotherapist", ["physiotherapistId"])
    .index("by_status", ["status"]),

  appointmentFeedback: defineTable({
    appointmentId: v.id("appointments"),
    patientId: v.id("patients"),
    physiotherapistId: v.id("physiotherapists"),
    rating: v.number(),
    feedback: v.string(),
    categoryRatings: v.object({
      overall_experience: v.number(),
      communication: v.number(),
      treatment_effectiveness: v.number(),
      professionalism: v.number(),
    }),
    submittedAt: v.number(),
  })
    .index("by_appointment", ["appointmentId"])
    .index("by_patient", ["patientId"]),

  // Patient feedback table
  patientFeedback: defineTable({
    appointmentId: v.id("appointments"),
    patientId: v.id("users"),
    physiotherapistId: v.id("users"),
    ratings: v.object({
      communication: v.number(),
      treatment_effectiveness: v.number(),
      professionalism: v.number(),
    }),
    submittedAt: v.number(),
  })
    .index("by_appointment", ["appointmentId"])
    .index("by_patient", ["patientId"]),

  // System Logs for monitoring and observability
  userActivity: defineTable({
    userId: v.string(),
    action: v.string(),
    resource: v.optional(v.string()),
    duration: v.optional(v.number()),
    metadata: v.optional(v.any()),
    timestamp: v.number(),
    sessionId: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    location: v.optional(v.object({
      country: v.optional(v.string()),
      city: v.optional(v.string()),
      timezone: v.optional(v.string()),
    })),
  })
    .index("by_user", ["userId"])
    .index("by_action", ["action"])
    .index("by_timestamp", ["timestamp"])
    .index("by_user_timestamp", ["userId", "timestamp"])
    .index("by_session", ["sessionId"]),

  // Resource Management System
  resources: defineTable({
    clinicId: v.id("clinics"),
    name: v.string(),
    type: v.union(
      v.literal("equipment"),
      v.literal("room"),
      v.literal("staff"),
      v.literal("vehicle")
    ),
    description: v.optional(v.string()),
    category: v.optional(v.string()), // "Physical Therapy", "Occupational Therapy", etc.
    location: v.optional(v.string()), // Room number, building, etc.
    capacity: v.optional(v.number()), // Max people/patients for rooms
    specifications: v.optional(v.object({
      brand: v.optional(v.string()),
      model: v.optional(v.string()),
      serialNumber: v.optional(v.string()),
      purchaseDate: v.optional(v.string()),
      warrantyExpiry: v.optional(v.string()),
    })),
    operatingHours: v.optional(v.object({
      monday: v.optional(v.object({ start: v.string(), end: v.string() })),
      tuesday: v.optional(v.object({ start: v.string(), end: v.string() })),
      wednesday: v.optional(v.object({ start: v.string(), end: v.string() })),
      thursday: v.optional(v.object({ start: v.string(), end: v.string() })),
      friday: v.optional(v.object({ start: v.string(), end: v.string() })),
      saturday: v.optional(v.object({ start: v.string(), end: v.string() })),
      sunday: v.optional(v.object({ start: v.string(), end: v.string() })),
    })),
    maintenanceSchedule: v.optional(v.object({
      frequency: v.union(
        v.literal("daily"),
        v.literal("weekly"),
        v.literal("monthly"),
        v.literal("quarterly"),
        v.literal("annually")
      ),
      lastMaintenance: v.optional(v.string()),
      nextMaintenance: v.optional(v.string()),
    })),
    isActive: v.boolean(),
    tags: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_clinic", ["clinicId"])
    .index("by_type", ["type"])
    .index("by_category", ["category"])
    .index("by_clinic_type", ["clinicId", "type"]),

  resourceBookings: defineTable({
    resourceId: v.id("resources"),
    appointmentId: v.id("appointments"),
    startTime: v.number(),
    endTime: v.number(),
    status: v.union(
      v.literal("confirmed"),
      v.literal("pending"),
      v.literal("cancelled")
    ),
    notes: v.optional(v.string()),
    cancellationReason: v.optional(v.string()),
    cancelledAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_resource_date", ["resourceId"])
    .index("by_appointment", ["appointmentId"])
    .index("by_status", ["status"])
    .index("by_resource_time", ["resourceId", "startTime"]),

  // System Health & Monitoring
  systemHealth: defineTable({
    service: v.string(), // e.g., "database", "auth", "video", "notifications"
    status: v.union(
      v.literal("healthy"),
      v.literal("degraded"),
      v.literal("down")
    ),
    responseTime: v.optional(v.number()), // in milliseconds
    errorRate: v.optional(v.number()), // percentage
    lastChecked: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_service", ["service"])
    .index("by_status", ["status"])
    .index("by_last_checked", ["lastChecked"]),

  // Core Web Vitals & Performance Metrics
  performanceMetrics: defineTable({
    userId: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    page: v.string(), // URL or page identifier
    metric: v.string(), // "LCP", "FID", "CLS", "TTFB", etc.
    value: v.number(),
    timestamp: v.number(),
    userAgent: v.optional(v.string()),
    connection: v.optional(v.string()), // "4g", "3g", "wifi", etc.
    metadata: v.optional(v.any()),
  })
    .index("by_metric", ["metric"]),
  // Split Payment Configurations
  splitConfigurations: defineTable({
    physiotherapistId: v.id("users"),
    clinicId: v.optional(v.id("clinics")),
    splitCode: v.string(),
    name: v.string(),
    type: v.union(v.literal("percentage"), v.literal("flat")),
    platformShare: v.number(),
    physiotherapistShare: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clinic", ["clinicId"])
    .index("by_physiotherapist_id", ["physiotherapistId"])
    .index("by_status", ["isActive"]),

  paymentRecords: defineTable({
    invoiceId: v.id("invoices"),
    amount: v.number(),
    currency: v.string(),
    status: v.union(v.literal("pending"), v.literal("completed"), v.literal("failed"), v.literal("refunded")),
    paymentMethod: v.string(),
    transactionId: v.string(),
    gateway: v.string(),
    metadata: v.optional(v.object({})),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_record_invoice_id", ["invoiceId"])
    .index("by_status", ["status"])
    .index("by_transaction_id", ["transactionId"]),

  transactions: defineTable({
    userId: v.id("users"),
    amount: v.number(),
    currency: v.string(),
    status: v.union(v.literal("pending"), v.literal("completed"), v.literal("failed")),
    paymentMethod: v.string(),
    reference: v.string(),
    description: v.string(),
    metadata: v.optional(v.object({})),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_status", ["status"])
    .index("by_reference", ["reference"]),

  // Scheduled tasks for background processing
  scheduledTasks: defineTable({
    type: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    data: v.any(),
    scheduledFor: v.number(),
    executedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    retryCount: v.optional(v.number()),
    maxRetries: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_type", ["type"])
    .index("by_scheduled_for", ["scheduledFor"]),

  // System logs for audit trail and debugging
  systemLogs: defineTable({
    userId: v.optional(v.string()),
    clinicId: v.optional(v.id("clinics")),
    type: v.string(),
    timestamp: v.number(),
    action: v.string(),
    targetEntityType: v.optional(v.string()),
    targetEntityId: v.optional(v.string()),
    details: v.optional(v.any()),
    ipAddress: v.optional(v.string()),
    actorUserId: v.optional(v.string()),
  })
    .index("by_user_id", ["userId"])
    .index("by_clinic_id", ["clinicId"])
    .index("by_type", ["type"])
    .index("by_timestamp", ["timestamp"]),

  // Business metrics for analytics and reporting
  businessMetrics: defineTable({
    clinicId: v.optional(v.id("clinics")),
    userId: v.optional(v.id("users")),
    type: v.string(),
    timestamp: v.number(),
    metadata: v.object({
      status: v.optional(v.string()),
      duration: v.optional(v.number()),
      details: v.optional(v.any()),
      path: v.optional(v.string()),
      error: v.optional(v.string()),
    }),
  })
    .index("by_clinic_id", ["clinicId"])
    .index("by_type", ["type"])
    .index("by_timestamp", ["timestamp"]),

  // Health Monitoring Tables
  // Calendar Integration Tables
  calendarEvents: defineTable({
    appointmentId: v.id("appointments"),
    googleEventId: v.string(),
    googleMeetLink: v.optional(v.string()),
    calendarId: v.string(),
    userId: v.id("users"),
    syncedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_appointment_id", ["appointmentId"])
    .index("by_google_event_id", ["googleEventId"])
    .index("by_user_id", ["userId"])
    .index("by_calendar_id", ["calendarId"]),

  googleCalendarCredentials: defineTable({
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiryDate: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_id", ["userId"]),

  // A physio's Google Calendar busy times (free/busy only: no titles or details), refreshed when
  // a booking page opens, so bookable slots leave them out (convex/calendar/availability.ts)
  googleBusyCache: defineTable({
    userId: v.id("users"),
    rangeStart: v.number(),
    rangeEnd: v.number(),
    blocks: v.array(v.object({ start: v.number(), end: v.number() })),
    fetchedAt: v.number(),
  })
    .index("by_user_id", ["userId"]),

  userCalendars: defineTable({
    userId: v.id("users"),
    calendarId: v.string(),
    summary: v.string(),
    primary: v.boolean(),
    accessRole: v.string(),
    backgroundColor: v.optional(v.string()),
    foregroundColor: v.optional(v.string()),
    syncedAt: v.number(),
  })
    .index("by_user_id", ["userId"]),

  oauthState: defineTable({
    state: v.string(),
    userId: v.id("users"),
    redirectUri: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_state", ["state"]),


  calendarWatchChannels: defineTable({
    channelId: v.string(),
    userId: v.id("users"),
    calendarId: v.string(),
    webhookUrl: v.string(),
    resourceId: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_channel_id", ["channelId"])
    .index("by_user_id", ["userId"]),

  treatmentPlanVersions: defineTable({
    treatmentPlanId: v.id("treatmentPlans"),
    version: v.number(),
    changeType: v.union(
      v.literal("created"),
      v.literal("exercise_added"),
      v.literal("exercise_removed"),
      v.literal("exercise_modified"),
      v.literal("goal_updated"),
      v.literal("assessment_added"),
      v.literal("status_changed"),
      v.literal("phase_updated"),
      v.literal("plan_revised") // Care plan details changed, with a reason
    ),
    changedBy: v.id("users"),
    changeDescription: v.string(),
    previousData: v.optional(v.any()), // Snapshot of previous state
    newData: v.any(), // Current state
    timestamp: v.number(),
    patientNotified: v.boolean(),
    notificationSentAt: v.optional(v.number()),
  })
    .index("by_treatment_plan", ["treatmentPlanId"])
    .index("by_version", ["treatmentPlanId", "version"])
    .index("by_patient_notified", ["treatmentPlanId", "patientNotified"]),

  bankAccounts: defineTable({
    userId: v.id("users"),
    accountNumber: v.string(),
    accountName: v.string(),
    bankName: v.string(),
    bankCode: v.string(),
    businessName: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("active"), v.literal("inactive")),
    paystackRecipientCode: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_status", ["status"]),

  // Physiotherapist bank accounts for split payments
  // Clinic payout account: a Paystack subaccount that receives the clinic's share of patient payments
  // Fee numbers for clinic payments, set by Rehabify admins (see convex/clinicFees.ts).
  // One row; the latest is used. Amounts in kobo.
  clinicFeeSettings: defineTable({
    clinicSharePercent: v.number(),
    paystackPercent: v.number(),
    paystackFlatKobo: v.number(),
    paystackFlatWaivedBelowKobo: v.number(),
    paystackFeeCapKobo: v.number(),
    stampDutyKobo: v.number(),
    stampDutyFromKobo: v.number(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  }),

  // Clinic dashboard roles (e.g. Receptionist) and the pages each can use.
  // An empty permissions list means full access.
  clinicRoles: defineTable({
    clinicId: v.id("clinics"),
    name: v.string(),
    permissions: v.array(v.string()), // keys from CLINIC_AREAS in convex/clinicTools.ts
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_clinic", ["clinicId"]),

  clinicPayoutAccounts: defineTable({
    clinicId: v.id("clinics"),
    subaccountCode: v.string(),
    bankCode: v.string(),
    bankName: v.string(),
    // Paystack's bank slug, used to show the bank's logo
    bankSlug: v.optional(v.string()),
    accountNumber: v.string(),
    accountName: v.string(),
    // Paystack mode the subaccount was created in (helpers/paystackMode.ts); missing = test
    paystackMode: v.optional(v.union(v.literal("test"), v.literal("live"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_clinic_id", ["clinicId"]),

  physiotherapistBankAccounts: defineTable({
    physiotherapistId: v.id("users"),
    subaccountCode: v.string(), // Paystack subaccount code
    subaccountId: v.optional(v.string()), // Legacy field
    bankCode: v.string(),
    accountNumber: v.string(),
    bankName: v.string(),
    accountName: v.string(),
    isDefault: v.boolean(),
    isVerified: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    paymentProvider: v.optional(v.literal("paystack")),
    // Paystack mode the subaccount was created in (helpers/paystackMode.ts); missing = test
    paystackMode: v.optional(v.union(v.literal("test"), v.literal("live"))),
  })
    .index("by_physiotherapist_id", ["physiotherapistId"])
    .index("by_subaccount_code", ["subaccountCode"]),

  // Doctor bank accounts for referral commission payouts
  doctorBankAccounts: defineTable({
    doctorId: v.id("users"),
    subaccountCode: v.string(), // Paystack subaccount code
    bankCode: v.string(),
    accountNumber: v.string(),
    bankName: v.string(),
    accountName: v.string(),
    isDefault: v.boolean(),
    isVerified: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    paymentProvider: v.optional(v.literal("paystack")),
    // Paystack mode the subaccount was created in (helpers/paystackMode.ts); missing = test
    paystackMode: v.optional(v.union(v.literal("test"), v.literal("live"))),
  })
    .index("by_doctor_id", ["doctorId"])
    .index("by_subaccount_code", ["subaccountCode"]),

  assessments: defineTable({
    patientId: v.id("users"),
    physiotherapistId: v.id("users"),
    clinicId: v.optional(v.id("clinics")),
    assessmentType: v.union(
      v.literal("oswestry"),
      v.literal("neck_disability"),
      v.literal("shoulder_function"),
      v.literal("dash"),
      v.literal("psfs"),
      v.literal("nprs"),
      v.literal("nps"),
      v.literal("custom")
    ),
    title: v.string(),
    responses: v.array(v.object({
      questionId: v.string(),
      question: v.string(),
      answer: v.union(v.string(), v.number()),
      score: v.optional(v.number()),
    })),
    totalScore: v.number(),
    maxScore: v.number(),
    percentageScore: v.number(),
    interpretation: v.optional(v.string()),
    recommendations: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    completedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_patient", ["patientId"])
    .index("by_physiotherapist", ["physiotherapistId"])
    .index("by_patient_type", ["patientId", "assessmentType"])
    .index("by_clinic", ["clinicId"]),

  // Marketplace Reviews & Ratings
  marketplaceReviews: defineTable({
    physiotherapistId: v.id("users"),
    patientId: v.id("users"),
    appointmentId: v.optional(v.id("appointments")), // Link to actual session
    bookingId: v.optional(v.id("marketplaceBookings")), // Link to marketplace booking

    // Rating breakdown
    overallRating: v.number(), // 1-5
    communicationRating: v.optional(v.number()),
    treatmentEffectivenessRating: v.optional(v.number()),
    professionalismRating: v.optional(v.number()),
    valueForMoneyRating: v.optional(v.number()),

    // Review content
    reviewTitle: v.optional(v.string()),
    reviewText: v.string(),

    // Response
    response: v.optional(v.object({
      text: v.string(),
      respondedAt: v.number(),
    })),

    // Metadata
    isVerifiedBooking: v.boolean(), // Did they actually book through platform?
    helpfulCount: v.optional(v.number()), // How many found this helpful
    reportedCount: v.optional(v.number()), // Report spam/abuse
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("hidden")
    ),

    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_physiotherapist", ["physiotherapistId"])
    .index("by_patient", ["patientId"])
    .index("by_appointment", ["appointmentId"])
    .index("by_status", ["status"])
    .index("by_physio_and_status", ["physiotherapistId", "status"])
    .index("by_created_date", ["createdAt"]),

  // Marketplace Bookings (separate from regular appointments)
  marketplaceBookings: defineTable({
    // Admin-scheduled Joy virtual consultations are paid before a clinician
    // and time are allocated, so they intentionally have no provider yet.
    physiotherapistId: v.optional(v.id("users")),
    patientId: v.id("users"),
    appointmentId: v.optional(v.id("appointments")), // Created after payment

    // Session details
    sessionType: v.string(), // "initial_consult", "follow_up", "package"
    sessionDate: v.optional(v.number()), // Scheduled date
    sessionDuration: v.number(), // minutes
    isOnline: v.boolean(),
    joyServiceMode: v.optional(v.union(v.literal("home_visit"), v.literal("clinic"), v.literal("online"))),
    joyRequiredSpecialties: v.optional(v.array(v.string())),
    patientAddress: v.optional(v.string()), // Exact address for in-person sessions

    // Package booking fields
    packageSessions: v.optional(v.number()),          // 1 | 4 | 8 | 12 — total sessions purchased
    packageDiscountPercent: v.optional(v.number()),   // physio discount applied (0–15%)
    sessionsRemaining: v.optional(v.number()),         // decremented each time a session is completed
    treatmentPlanId: v.optional(v.id("treatmentPlans")), // auto-created on payment confirmation
    conditionLabel: v.optional(v.string()),            // e.g. "Back or neck pain"
    conditionLevel: v.optional(v.string()),            // "standard" | "moderate" | "complex"

    // Pricing
    serviceAmount: v.number(), // Amount for service (kobo)
    platformFee: v.number(), // Platform fee (kobo)
    paystackFee: v.number(), // Payment gateway fee (kobo)
    totalAmount: v.number(), // Total charged to patient (kobo)
    physiotherapistEarnings: v.number(), // Amount physio receives (80% default, kobo)
    rehabifyEarnings: v.optional(v.number()), // Amount Rehabify retains (10% default, kobo)
    partnerEarnings: v.optional(v.number()), // Amount referring partner earns (10% default, kobo)
    partnerId: v.optional(v.string()), // Referring partner code if referred
    // Immutable evidence that the WhatsApp conversation began from a verified
    // partner referral link, separate from any later payment action.
    joyPartnerReferralLinkCode: v.optional(v.string()),
    referralId: v.optional(v.id("inboundReferrals")), // Referring inbound referral if referred
    referralLinkId: v.optional(v.id("partnerReferralLinks")), // Referral link that attributed the patient
    paidAmountKobo: v.optional(v.number()), // Amount verified by Paystack
    careMode: v.optional(v.union(v.literal("virtual"), v.literal("in_person"))),

    // Payment
    paymentStatus: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("refunded")
    ),
    paymentMethod: v.optional(v.union(v.literal("paystack"), v.literal("bank_transfer"))),
    paymentReference: v.optional(v.string()),
    paidAt: v.optional(v.number()),
    bankTransferDetails: v.optional(v.object({
      senderName: v.optional(v.string()),
      bankName: v.optional(v.string()),
      confirmedBy: v.optional(v.string()),
      confirmedAt: v.optional(v.number()),
      receiptUrl: v.optional(v.string()),
    })),

    // Booking status
    bookingStatus: v.union(
      v.literal("pending_payment"),
      v.literal("awaiting_admin_schedule"),
      v.literal("confirmed"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("no_show")
    ),

    // Relationship creation
    relationshipCreated: v.optional(v.boolean()),
    patientPhysioRelationshipId: v.optional(v.id("patientPhysiotherapistRelationships")),

    // Notes
    patientNotes: v.optional(v.string()),
    cancellationReason: v.optional(v.string()),

    // Immutable origin information. These fields make reporting and payment
    // reconciliation independent of free-text notes or Paystack metadata.
    sourceSystem: v.optional(v.union(
      v.literal("joy_ai"), v.literal("rh_marketplace_web"), v.literal("rh_patient_dashboard"),
      v.literal("rh_admin"), v.literal("rh_clinic")
    )),
    sourceChannel: v.optional(v.string()),
    sourceEntryPoint: v.optional(v.string()),
    joyConversationId: v.optional(v.string()),
    joyAssessmentId: v.optional(v.string()),
    joyAssessmentRevision: v.optional(v.number()),
    joyEligibilityReference: v.optional(v.string()),
    joyPolicyVersion: v.optional(v.string()),
    joyPolicyAcceptanceReference: v.optional(v.string()),
    originRequestId: v.optional(v.string()),
    originIdempotencyKey: v.optional(v.string()),
    originatedAt: v.optional(v.number()),
    holdExpiresAt: v.optional(v.number()),
    providerResponse: v.optional(v.union(v.literal("pending"), v.literal("accepted"), v.literal("rejected"))),
    providerResponseDueAt: v.optional(v.number()),
    replacementStatus: v.optional(v.union(v.literal("not_needed"), v.literal("awaiting_patient_slot"), v.literal("admin_follow_up"))),
    // `admin_scheduled_virtual` is the two-step consultation product: Joy
    // collects payment, then an RH administrator assigns the provider/time.
    joyBookingRoute: v.optional(v.union(v.literal("provider_selected"), v.literal("admin_scheduled_virtual"))),
    joyConsultationType: v.optional(v.union(v.literal("quick_initial"), v.literal("full_virtual"))),
    adminSchedulingStatus: v.optional(v.union(v.literal("not_required"), v.literal("awaiting_schedule"), v.literal("scheduled"))),
    // Short patient-facing code (e.g. "K7P3XQ9M"). It is the booking reference
    // Joy quotes and the secret in the patient's join link (/v/<code>).
    bookingCode: v.optional(v.string()),

    // Guest details
    isGuestBooking: v.optional(v.boolean()),
    guestEmail: v.optional(v.string()),
    guestPhone: v.optional(v.string()),
    guestName: v.optional(v.string()),

    // Rehabify standard pricing (Oct 2026). A snapshot of the quote at booking time, so later
    // tariff changes never alter what this patient pays or what the physio is owed.
    serviceId: v.optional(v.string()), // lib/rehabify-services.ts BookableServiceId
    pricingModel: v.optional(v.literal("rehabify_2026_10")),
    tariffVersion: v.optional(v.number()),
    basePriceKobo: v.optional(v.number()),
    travelZoneId: v.optional(v.id("travelZones")),
    travelZoneName: v.optional(v.string()),
    travelArea: v.optional(v.string()),
    travelSurchargeKobo: v.optional(v.number()),
    payoutKobo: v.optional(v.number()), // the physio's fixed payout for the service
    travelPhysioShareKobo: v.optional(v.number()),
    paystackFeeEstimateKobo: v.optional(v.number()), // absorbed by Rehabify
    paystackFeeActualKobo: v.optional(v.number()), // from the Paystack webhook
    accessAwardId: v.optional(v.id("accessAwards")), // booked at a Rehabify Access rate
    invoiceId: v.optional(v.id("invoices")), // created once paid (helpers/marketplaceInvoices.ts)
    checkoutReferences: v.optional(v.array(v.string())), // MKT_ references started, for payment reconciliation
    refundedAmountKobo: v.optional(v.number()), // refunded through Paystack (partial or full)
    scheduledBy: v.optional(v.union(v.literal("patient"), v.literal("physiotherapist"))),
    // The physio accepted the patient's own request and invoiced it (rehabifyFollowUps.acceptRequestWithInvoice)
    fromPatientRequest: v.optional(v.boolean()),
    adminAttentionReason: v.optional(v.string()), // e.g. paid after the hold lapsed and the slot was taken

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_physiotherapist", ["physiotherapistId"])
    .index("by_patient", ["patientId"])
    .index("by_payment_reference", ["paymentReference"])
    .index("by_booking_status", ["bookingStatus"])
    .index("by_payment_status", ["paymentStatus"])
    .index("by_session_date", ["sessionDate"])
    .index("by_origin_idempotency", ["originIdempotencyKey"])
    .index("by_booking_code", ["bookingCode"])
    .index("by_appointment", ["appointmentId"])
    .index("by_access_award", ["accessAwardId"]),

  // Every Paystack refund applied (refund.processed), so repeats are ignored and partial
  // refunds add up per payment. See convex/helpers/paymentRefunds.ts.
  paymentRefunds: defineTable({
    refundKey: v.string(), // Paystack refund id (or reference + amount when absent)
    reference: v.string(), // the original payment's reference
    kind: v.string(), // marketplace | invoice | learn | verification | specialist_review | unknown
    amountKobo: v.number(),
    currency: v.optional(v.string()),
    full: v.boolean(), // this refund brought the total to the whole amount paid
    createdAt: v.number(),
  })
    .index("by_refund_key", ["refundKey"])
    .index("by_reference", ["reference"]),

  // ─── Rehabify standard pricing (Oct 2026) ─────────────────────────────────
  // Versioned price and payout schedule: every admin save inserts a new row; the highest
  // version is in force. Code defaults (lib/rehabify-services.ts) apply until the first save.
  serviceTariffs: defineTable({
    version: v.number(),
    tariffs: v.array(v.object({
      serviceId: v.string(),
      priceKobo: v.number(),
      payoutKobo: v.number(),
      assistedPriceKobo: v.optional(v.number()),
      assistedPayoutKobo: v.optional(v.number()),
      travelApplies: v.boolean(),
      active: v.boolean(),
    })),
    note: v.optional(v.string()),
    createdAt: v.number(),
    createdBy: v.optional(v.string()),
  }).index("by_version", ["version"]),

  // Home-visit travel zones: named areas per city, each with a fixed surcharge.
  travelZones: defineTable({
    city: v.string(),
    name: v.string(),
    areas: v.array(v.string()),
    surchargeKobo: v.number(),
    physioTravelSharePercent: v.number(), // share of the surcharge paid to the physio
    active: v.boolean(),
    sortOrder: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  }).index("by_city", ["city"]),

  // Network-wide pricing controls (latest row wins).
  rehabifyPricingSettings: defineTable({
    accessCapacity: v.number(), // active Rehabify Access places
    accessIntakeOpen: v.boolean(),
    networkTermsEnforcedAt: v.optional(v.number()), // from then, unaccepted physios aren't bookable
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  }),

  // Every acceptance of the Rehabify network terms (the profile keeps the latest).
  physioNetworkAgreements: defineTable({
    physiotherapistId: v.id("users"),
    version: v.string(),
    tariffVersion: v.optional(v.number()),
    accessOptIn: v.boolean(),
    accessMinimumPayouts: v.optional(v.array(v.object({
      serviceId: v.string(),
      minimumPayoutKobo: v.number(),
    }))),
    acceptedAt: v.number(),
  }).index("by_physiotherapist", ["physiotherapistId"]),

  // Rehabify Access (assisted care): applications for reduced-fee care.
  assistedCareApplications: defineTable({
    patientId: v.id("users"),
    serviceNeeded: v.string(), // a service id, or "not_sure"
    isCurrentPatient: v.boolean(),
    currentPhysiotherapistId: v.optional(v.id("users")),
    situation: v.string(), // lib/rehabify-access.ts SITUATIONS
    incomeBand: v.string(), // INCOME_BANDS (bands only, never exact figures)
    alternativeFunding: v.string(), // FUNDING_OPTIONS
    clinicalNeed: v.string(),
    statement: v.optional(v.string()),
    city: v.optional(v.string()),
    area: v.optional(v.string()),
    phone: v.optional(v.string()),
    consentAt: v.number(),
    status: v.union(
      v.literal("submitted"),
      v.literal("under_review"),
      v.literal("approved"),
      v.literal("declined"),
      v.literal("waitlisted"),
      v.literal("withdrawn")
    ),
    reviewChecklist: v.optional(v.object({
      identityVerified: v.boolean(),
      financialNeedConfirmed: v.boolean(),
      clinicalNeedConfirmed: v.boolean(),
      alternativesExplored: v.boolean(),
    })),
    reviewNotes: v.optional(v.string()),
    decisionReason: v.optional(v.string()),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    awardId: v.optional(v.id("accessAwards")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_patient", ["patientId"])
    .index("by_status", ["status"]),

  // An approved Rehabify Access arrangement: which services, how many sessions, with whom.
  accessAwards: defineTable({
    applicationId: v.id("assistedCareApplications"),
    patientId: v.id("users"),
    physiotherapistId: v.id("users"),
    serviceIds: v.array(v.string()),
    sessionsGranted: v.number(),
    sessionsUsed: v.number(),
    status: v.union(v.literal("active"), v.literal("completed"), v.literal("expired"), v.literal("revoked")),
    startsAt: v.number(),
    expiresAt: v.number(),
    reassessAt: v.optional(v.number()),
    note: v.optional(v.string()),
    approvedBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_patient", ["patientId"])
    .index("by_status", ["status"])
    .index("by_physiotherapist", ["physiotherapistId"]),

  // A durable record exists before a Paystack initialization request. It is
  // intentionally distinct from the booking so abandoned/failed attempts are
  // auditable without changing the booking's immutable provenance.
  joyPaymentAttempts: defineTable({
    bookingId: v.id("marketplaceBookings"),
    reference: v.string(),
    amountKobo: v.number(),
    currency: v.literal("NGN"),
    status: v.union(v.literal("initializing"), v.literal("initialized"), v.literal("failed"), v.literal("verified")),
    authorizationUrl: v.optional(v.string()),
    safeAccessCode: v.optional(v.string()),
    failureCategory: v.optional(v.string()),
    sourceSystem: v.literal("joy_ai"),
    sourceChannel: v.literal("whatsapp"),
    originRequestId: v.string(),
    originIdempotencyKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    verifiedAt: v.optional(v.number()),
  })
    .index("by_booking", ["bookingId"])
    .index("by_reference", ["reference"])
    .index("by_origin_idempotency", ["originIdempotencyKey"])
    .index("by_status_created", ["status", "createdAt"]),

  // Durable RH-to-Joy event outbox. Delivery is tracked separately from the
  // business transaction so a transient Joy outage never loses confirmation.
  joyEventOutbox: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    payload: v.any(),
    // A failed delivery remains retryable until the bounded retry budget is
    // exhausted.  Dead-lettered records stay queryable for operational repair.
    status: v.union(v.literal("pending"), v.literal("delivered"), v.literal("failed"), v.literal("dead_letter")),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    deliveredAt: v.optional(v.number()),
    nextAttemptAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_event_id", ["eventId"]).index("by_status", ["status"]),

  joyAdminFollowUps: defineTable({
    bookingId: v.id("marketplaceBookings"),
    recipientEmail: v.string(),
    reason: v.string(),
    status: v.union(v.literal("open"), v.literal("resolved")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_booking", ["bookingId"]).index("by_status", ["status"]),

  // What Joy learned on WhatsApp before handing the patient to a clinician: the structured
  // intake and Joy's summaries. Clinical content, so it is only ever read through
  // convex/joyHandoff.ts (the patient, their linked physio, admins). One row per assessment
  // revision; a later revision is a new row.
  joyIntakes: defineTable({
    patientId: v.id("users"),
    bookingId: v.optional(v.id("marketplaceBookings")),
    conversationId: v.string(),
    assessmentId: v.string(),
    assessmentRevision: v.number(),
    protocolVersion: v.optional(v.string()),
    triageLevel: v.optional(v.union(v.literal("green"), v.literal("amber"), v.literal("red"))),
    chiefComplaint: v.optional(v.string()),
    bodyAreas: v.optional(v.array(v.string())),
    painScore: v.optional(v.number()), // 0-10
    onset: v.optional(v.string()),
    duration: v.optional(v.string()),
    redFlags: v.optional(v.array(v.object({ question: v.string(), answer: v.string(), flagged: v.boolean() }))),
    aggravatingFactors: v.optional(v.array(v.string())),
    easingFactors: v.optional(v.array(v.string())),
    goals: v.optional(v.string()),
    medicalHistory: v.optional(v.string()),
    medications: v.optional(v.string()),
    answers: v.optional(v.array(v.object({ question: v.string(), answer: v.string() }))),
    clinicianSummary: v.optional(v.string()), // for the physio
    patientSummary: v.optional(v.string()), // plain language, shown to the patient
    language: v.optional(v.string()),
    preferredTimes: v.optional(v.string()),
    // The patient's agreement that Joy may pass this intake to the treating clinician.
    // When it is explicitly false the physio sees that an intake exists, not its content.
    consent: v.optional(v.object({
      shareWithClinician: v.boolean(),
      policyVersion: v.optional(v.string()),
      acceptanceReference: v.optional(v.string()),
      givenAt: v.number(),
    })),
    receivedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_patient", ["patientId", "receivedAt"])
    .index("by_booking", ["bookingId"])
    .index("by_assessment", ["assessmentId", "assessmentRevision"]),

  // Where a Joy patient is in their journey: stages Joy reports from WhatsApp and the ones
  // Rehabify records itself (payment, physio response, scheduling, call joined). `eventKey`
  // makes every write idempotent.
  joyJourneyEvents: defineTable({
    patientId: v.id("users"),
    bookingId: v.optional(v.id("marketplaceBookings")),
    stage: v.union(
      v.literal("conversation_started"),
      v.literal("referral_linked"),
      v.literal("triage_completed"),
      v.literal("eligibility_passed"),
      v.literal("eligibility_blocked"),
      v.literal("matches_shown"),
      v.literal("booking_held"),
      v.literal("payment_link_sent"),
      v.literal("payment_completed"),
      v.literal("payment_failed"),
      v.literal("provider_requested"),
      v.literal("provider_accepted"),
      v.literal("provider_rejected"),
      v.literal("provider_timeout"),
      v.literal("awaiting_admin_schedule"),
      v.literal("admin_scheduled"),
      v.literal("rescheduled"),
      v.literal("meeting_link_sent"),
      v.literal("reminder_sent"),
      v.literal("call_joined"),
      v.literal("session_completed"),
      v.literal("hold_expired"),
      v.literal("abandoned"),
      v.literal("cancelled"),
      v.literal("handed_to_human")
    ),
    source: v.union(v.literal("joy"), v.literal("rehabify")),
    occurredAt: v.number(),
    note: v.optional(v.string()), // short operational note, never clinical narrative
    eventKey: v.string(),
  })
    .index("by_patient", ["patientId", "occurredAt"])
    .index("by_booking", ["bookingId", "occurredAt"])
    .index("by_event_key", ["eventKey"]),

  // Joy sends these as /go/<code> on WhatsApp. Opening one signs the patient into the
  // Clerk account Rehabify created for them (or lets them create one and claim the
  // record). The code is the only credential, so each link works once and expires.
  dashboardAccessLinks: defineTable({
    code: v.string(),
    userId: v.id("users"),
    // The Clerk user created for this patient; a link only ever signs into that account
    clerkUserId: v.optional(v.string()),
    bookingId: v.optional(v.id("marketplaceBookings")),
    createdAt: v.number(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
  })
    .index("by_code", ["code"])
    .index("by_user", ["userId", "createdAt"]),

  // Paid five-minute AMBER review. This is deliberately separate from a
  // marketplace booking: a reviewer is allocated only after verified payment,
  // never fabricated merely to create a payment link.
  joySpecialistReviews: defineTable({
    patientId: v.id("users"),
    assessmentId: v.string(),
    assessmentRevision: v.number(),
    protocolVersion: v.string(),
    eligibilityReference: v.string(),
    policyVersion: v.string(),
    policyAcceptanceReference: v.string(),
    priceKobo: v.number(),
    durationMinutes: v.number(),
    paymentStatus: v.union(v.literal("pending"), v.literal("completed"), v.literal("failed"), v.literal("refunded")),
    reviewStatus: v.union(v.literal("pending_payment"), v.literal("awaiting_assignment"), v.literal("assigned"), v.literal("completed"), v.literal("cancelled")),
    paymentReference: v.optional(v.string()),
    paidAt: v.optional(v.number()),
    reviewerId: v.optional(v.id("users")),
    scheduledAt: v.optional(v.number()),
    sourceSystem: v.literal("joy_ai"),
    sourceChannel: v.literal("whatsapp"),
    sourceEntryPoint: v.literal("specialist_review"),
    joyConversationId: v.string(),
    originRequestId: v.string(),
    originIdempotencyKey: v.string(),
    originatedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_patient", ["patientId"]).index("by_payment_reference", ["paymentReference"]).index("by_origin_idempotency", ["originIdempotencyKey"]),

  joySpecialistReviewPaymentAttempts: defineTable({
    reviewId: v.id("joySpecialistReviews"),
    reference: v.string(),
    amountKobo: v.number(),
    status: v.union(v.literal("initializing"), v.literal("initialized"), v.literal("failed"), v.literal("verified")),
    authorizationUrl: v.optional(v.string()),
    originRequestId: v.string(),
    originIdempotencyKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_review", ["reviewId"]).index("by_reference", ["reference"]).index("by_origin_idempotency", ["originIdempotencyKey"]).index("by_status_created", ["status", "createdAt"]),

  // Marketplace Transactions (verification badges, featured listings, commissions)
  marketplaceTransactions: defineTable({
    userId: v.id("users"), // Physiotherapist

    type: v.union(
      v.literal("verification_badge"),
      v.literal("featured_listing"),
      v.literal("booking_commission")
    ),

    // Verification badge specific
    badgeTier: v.optional(v.union(
      v.literal("monthly"),
      v.literal("12_month"),
      v.literal("yearly")
    )),

    // Featured listing specific
    featuredDuration: v.optional(v.number()), // days
    featuredStartDate: v.optional(v.number()),
    featuredEndDate: v.optional(v.number()),

    // Commission specific
    bookingId: v.optional(v.id("marketplaceBookings")),
    commissionRate: v.optional(v.number()), // percentage

    // Payment
    amount: v.number(), // in kobo
    currency: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("refunded")
    ),
    paymentReference: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),

    // Metadata
    description: v.string(),
    metadata: v.optional(v.any()),

    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_type", ["type"])
    .index("by_status", ["status"])
    .index("by_payment_reference", ["paymentReference"])
    .index("by_booking_id", ["bookingId"]),

  // Physiotherapist Reports/Flags (patient feedback for admin review)
  physiotherapistReports: defineTable({
    physiotherapistId: v.id("users"),
    reporterId: v.id("users"), // Patient who reported
    reporterRole: v.optional(v.string()),
    reason: v.union(
      v.literal("unprofessional_behavior"),
      v.literal("poor_treatment_quality"),
      v.literal("safety_concern"),
      v.literal("billing_issue"),
      v.literal("harassment"),
      v.literal("breach_of_confidentiality"),
      v.literal("other")
    ),
    description: v.string(),
    appointmentId: v.optional(v.id("appointments")),
    bookingId: v.optional(v.id("marketplaceBookings")),
    severity: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("under_review"),
      v.literal("resolved"),
      v.literal("dismissed")
    ),
    adminNotes: v.optional(v.string()),
    actionTaken: v.optional(v.string()),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_physiotherapist", ["physiotherapistId"])
    .index("by_reporter", ["reporterId"])
    .index("by_status", ["status"])
    .index("by_severity", ["severity"])
    .index("by_created_at", ["createdAt"]),

  // ── Retention System ──────────────────────────────
  // Bonuses for physios with >60% retention rate
  physioRetentionBonuses: defineTable({
    physiotherapistId: v.id("users"),
    amount: v.number(), // in Naira (e.g., 500 per patient)
    patientsCompleted: v.number(), // number of patients who completed 4+ sessions
    period: v.string(), // e.g., "2026-Q1"
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("cancelled")
    ),
    paidAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_physio", ["physiotherapistId"])
    .index("by_status", ["status"])
    .index("by_period", ["period"]),

  // Penalties for physios with <30% retention rate
  physioRetentionPenalties: defineTable({
    physiotherapistId: v.id("users"),
    currentLevel: v.union(
      v.literal("none"),
      v.literal("warning"),
      v.literal("reduced_allocation"),
      v.literal("suspended")
    ),
    lastUpdated: v.number(),
    history: v.array(
      v.object({
        level: v.string(),
        reason: v.string(),
        retentionRate: v.number(),
        date: v.number(),
      })
    ),
  })
    .index("by_physio", ["physiotherapistId"])
    .index("by_level", ["currentLevel"]),

  // ─── AwaDoc Integration ───────────────────────────────────────
  // Tracks each AwaDoc-initiated therapy session from discovery to completion
  awadocSessions: defineTable({
    // AwaDoc identifiers
    queryId: v.optional(v.string()),        // From availability.query
    requestId: v.optional(v.string()),      // From therapy.request
    therapyId: v.optional(v.string()),      // Our generated ID (e.g., "thp-xxx")
    eventId: v.optional(v.string()),        // AwaDoc event UUID
    consultationId: v.optional(v.string()), // Legacy AwaDoc consultation ID

    // AwaDoc user
    awadocUserId: v.string(),
    awadocUserName: v.string(),

    // Rehabify mapping
    physiotherapistId: v.optional(v.id("users")),
    appointmentId: v.optional(v.id("appointments")),

    // Status lifecycle
    status: v.union(
      v.literal("queried"),
      v.literal("requested"),
      v.literal("confirmed"),
      v.literal("doctor_assigned"),
      v.literal("scheduled"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("failed")
    ),

    // Session details
    mode: v.optional(v.union(v.literal("virtual"), v.literal("physical"))),
    specialistType: v.optional(v.string()),
    scheduledTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    serviceArea: v.optional(v.string()),
    preferredLang: v.optional(v.string()),

    // Financial
    grossAmount: v.optional(v.number()),     // Total before AwaDoc commission
    awadocCommission: v.optional(v.number()), // 20% of gross
    netAmount: v.optional(v.number()),        // 80% — what Rehabify receives
    currency: v.optional(v.string()),         // "NGN"

    // Guest video access
    guestToken: v.optional(v.string()),           // Secure token for guest video join
    guestTokenExpiresAt: v.optional(v.number()),  // Token expiry timestamp

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    confirmedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    notes: v.optional(v.string()),                  // Session notes from physio
    actualDurationMinutes: v.optional(v.number()),   // Actual session duration
  })
    .index("by_therapy_id", ["therapyId"])
    .index("by_request_id", ["requestId"])
    .index("by_query_id", ["queryId"])
    .index("by_status", ["status"])
    .index("by_physiotherapist", ["physiotherapistId"])
    .index("by_awadoc_user", ["awadocUserId"])
    .index("by_physiotherapist_and_status", ["physiotherapistId", "status"])
    .index("by_awadoc_user_and_status", ["awadocUserId", "status"]),

  // Audit trail for all AwaDoc webhook events (inbound and outbound)
  // Retention policy: purge records older than 90 days via scheduled job
  awadocEventLog: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    payload: v.any(),              // Sanitized via sanitizeWebhookPayload before insert
    responsePayload: v.optional(v.any()), // Sanitized via sanitizeWebhookPayload before insert
    status: v.union(v.literal("success"), v.literal("error")),
    errorMessage: v.optional(v.string()),
    createdAt: v.optional(v.number()),  // When the event was first recorded (optional for backcompat)
    processedAt: v.number(),       // When last processed/updated
  })
    .index("by_event_id", ["eventId"])
    .index("by_event_type", ["eventType"])
    .index("by_direction", ["direction"])
    .index("by_processed_at", ["processedAt"])
    .index("by_created_at", ["createdAt"]),

  // Health tables from health schema
  ...healthTables,

  partnershipInquiries: defineTable({
    // "demo" = Book a demo on the partners page; missing on older rows, which are partnership inquiries
    kind: v.optional(v.union(v.literal("partnership"), v.literal("demo"))),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    organization: v.string(),
    message: v.string(),
    status: v.union(v.literal("new"), v.literal("contacted"), v.literal("closed")),
    createdAt: v.number(),
  }).index("by_status", ["status"]).index("by_created", ["createdAt"]),

  // Marketing emails (convex/marketing.ts, convex/actions/marketingSend.ts). Group sends go out as
  // Resend Broadcasts to one Resend audience per segment; one-to-one sends use a throttled queue.
  marketingContacts: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    tags: v.array(v.string()),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  marketingAudiences: defineTable({
    segment: v.string(), // patients | physiotherapists | clinics | partners | contacts
    resendAudienceId: v.string(),
    createdAt: v.number(),
  }).index("by_segment", ["segment"]),

  // Who is already a contact in each Resend audience, so a sync only adds and removes the difference
  marketingAudienceMembers: defineTable({
    segment: v.string(),
    email: v.string(),
    resendContactId: v.optional(v.string()),
    syncedAt: v.number(),
  })
    .index("by_segment", ["segment"])
    .index("by_segment_and_email", ["segment", "email"]),

  marketingCampaigns: defineTable({
    subject: v.string(),
    previewText: v.optional(v.string()),
    heading: v.string(),
    body: v.string(),
    ctaLabel: v.optional(v.string()),
    ctaUrl: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    audience: v.union(
      v.literal("everyone"),
      v.literal("patients"),
      v.literal("physiotherapists"),
      v.literal("clinics"),
      v.literal("partners"),
      v.literal("contacts"),
      v.literal("individual")
    ),
    status: v.union(v.literal("preparing"), v.literal("sending"), v.literal("sent"), v.literal("partial"), v.literal("failed")),
    segmentsToSend: v.array(v.string()), // Broadcast segments still to go, in order
    broadcastIds: v.array(v.string()),
    recipientCount: v.number(),
    sentCount: v.number(),
    failedCount: v.number(),
    lastError: v.optional(v.string()),
    createdBy: v.id("users"),
    createdByName: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    sentAt: v.optional(v.number()),
  }).index("by_created", ["createdAt"]),

  // One-to-one sends (audience "individual"), drained in batches under the daily cap
  marketingQueue: defineTable({
    campaignId: v.id("marketingCampaigns"),
    email: v.string(),
    name: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("failed")),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    sentAt: v.optional(v.number()),
  }).index("by_campaign_and_status", ["campaignId", "status"]),

  // One-to-one marketing emails sent per UTC day, kept under MARKETING_DIRECT_DAILY_LIMIT so they
  // never use up the Resend free plan's 100 a day that appointment and payment emails rely on
  marketingDailyUsage: defineTable({
    day: v.string(), // YYYY-MM-DD (UTC, as Resend counts it)
    count: v.number(),
  }).index("by_day", ["day"]),

  // Careers (convex/careers.ts): roles posted by admins on /careers, and the applications to them
  careerJobs: defineTable({
    slug: v.string(),
    title: v.string(),
    team: v.string(), // e.g. "Clinical", "Engineering", "Operations"
    location: v.string(), // e.g. "Lagos", "Anywhere in Nigeria"
    workplace: v.union(v.literal("onsite"), v.literal("hybrid"), v.literal("remote")),
    employmentType: v.union(
      v.literal("full_time"),
      v.literal("part_time"),
      v.literal("contract"),
      v.literal("internship")
    ),
    summary: v.string(), // one sentence for the roles list
    description: v.string(), // "About the role"; paragraphs separated by blank lines
    responsibilities: v.array(v.string()),
    requirements: v.array(v.string()),
    niceToHave: v.optional(v.array(v.string())),
    salary: v.optional(v.string()), // shown as written, e.g. "₦400,000 – ₦600,000 a month"
    status: v.union(v.literal("draft"), v.literal("open"), v.literal("closed")),
    closesAt: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]).index("by_status", ["status"]),

  careerApplications: defineTable({
    jobId: v.id("careerJobs"),
    jobTitle: v.string(), // as it was when they applied
    fullName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    location: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    portfolioUrl: v.optional(v.string()),
    coverNote: v.optional(v.string()),
    cvStorageId: v.id("_storage"), // PDF, checked for type and size on submit
    cvFileName: v.optional(v.string()),
    status: v.union(
      v.literal("new"),
      v.literal("reviewing"),
      v.literal("interview"),
      v.literal("accepted"),
      v.literal("rejected")
    ),
    adminNotes: v.optional(v.string()),
    decisionEmailSentAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_job", ["jobId"])
    .index("by_status", ["status"])
    .index("by_email_and_job", ["email", "jobId"])
    .index("by_created", ["createdAt"]),

  // Enterprise & Healthcare Partners (HMOs, Hospitals, Corporate Wellness, BNPL, Gyms, Pharmacies, Employers)
  partners: defineTable({
    name: v.string(),                         // e.g. "Wellahealth", "Reliance HMO"
    code: v.string(),                         // Unique partner slug, e.g. "wellahealth"
    // LEGACY plaintext key column. Never written or read for authentication any more;
    // API keys live hashed in partnerApiKeys. Cleared by partnerMigrations.
    apiKey: v.optional(v.string()),
    type: v.union(
      v.literal("hmo"),
      v.literal("hospital"),
      v.literal("corporate"),
      v.literal("gym"),
      v.literal("telemedicine"),
      v.literal("pharmacy"),
      v.literal("employer"),
      v.literal("digital_health"),
      v.literal("doctor") // An individual referring doctor (convex/doctors.ts); live as soon as approved
    ),
    // Identity & Branding
    logoUrl: v.optional(v.string()),          // Partner logo for branded landing pages
    logoStorageId: v.optional(v.id("_storage")), // Uploaded logo file in Convex storage
    internalCode: v.optional(v.string()),     // Internal reference code
    // Contacts
    contactName: v.optional(v.string()),
    contactEmail: v.string(),                 // Primary contact
    contactPhone: v.optional(v.string()),
    financeContactEmail: v.optional(v.string()),
    technicalContactEmail: v.optional(v.string()),
    privacyContactEmail: v.optional(v.string()),
    // Coverage
    coverageStates: v.optional(v.array(v.string())),   // ["Lagos", "Abuja"]
    coverageCities: v.optional(v.array(v.string())),   // ["Ikeja", "Victoria Island"]
    supportedCareModes: v.optional(v.array(v.string())), // ["remote", "face_to_face"]
    supportedServices: v.optional(v.array(v.string())), // ["all_rehabilitation"] or specific pathways
    // API & Webhooks (Dual Environment: Sandbox & Live)
    webhookUrl: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
    liveApiKey: v.optional(v.string()),
    testApiKey: v.optional(v.string()),
    liveWebhookUrl: v.optional(v.string()),
    testWebhookUrl: v.optional(v.string()),
    liveWebhookSecret: v.optional(v.string()),
    testWebhookSecret: v.optional(v.string()),
    // Ownership & Clerk integration
    ownerClerkId: v.optional(v.string()),     // Linking partner organization to creator Clerk user
    ownerEmail: v.optional(v.string()),       // Creator email
    // Approval & Verification
    approvalStatus: v.optional(v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected")
    )),                                       // 'approved' for seeded/approved, 'pending' for self-serve
    rejectionReason: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    approvedBy: v.optional(v.string()),
    website: v.optional(v.string()),
    // Go-live: live keys/webhooks require Rehabify approval of production access
    productionStatus: v.optional(v.union(
      v.literal("not_requested"),
      v.literal("requested"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("suspended")
    )),
    productionRequestedAt: v.optional(v.number()),
    productionRequestNote: v.optional(v.string()),
    productionReviewedAt: v.optional(v.number()),
    productionReviewedBy: v.optional(v.string()),
    productionRejectionReason: v.optional(v.string()),
    credentialsRotatedAt: v.optional(v.number()),
    // Status
    isActive: v.boolean(),
    tier: v.string(),                         // "sandbox", "standard", "enterprise"
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_code", ["code"])
    .index("by_api_key", ["apiKey"])
    .index("by_live_api_key", ["liveApiKey"])
    .index("by_test_api_key", ["testApiKey"])
    .index("by_type", ["type"])
    .index("by_owner_clerk_id", ["ownerClerkId"])
    .index("by_approval_status", ["approvalStatus"]),

  // Patient-submitted loan interest requests.
  // These are NOT yet initiated with MyItura — they are pending Rehabify admin action.
  // When admin clicks "Initiate", a real loan is created in loanApplications.
  loanRequests: defineTable({
    // Patient info (captured from form — may not be a registered user)
    patientFirstName: v.string(),
    patientLastName: v.string(),
    patientPhone: v.string(),
    patientEmail: v.optional(v.string()),
    patientUserId: v.optional(v.id("users")), // Set if patient was logged in

    // Treatment details
    treatment: v.string(),
    treatmentAmount: v.number(),              // in Kobo
    physiotherapistId: v.optional(v.id("users")), // Which physio they were booking with

    // Workflow status
    status: v.union(
      v.literal("pending"),          // Submitted, awaiting admin review
      v.literal("awaiting_invoice"), // Admin asked the physio to invoice the patient first
      v.literal("initiated"),        // A loan was started for it (linked below)
      v.literal("cancelled"),        // Admin dismissed / patient withdrew
    ),
    invoiceRequestedAt: v.optional(v.number()),

    // Populated when admin initiates with MyItura
    loanApplicationId: v.optional(v.id("loanApplications")), // link to the actual loan record
    initiatedByAdminId: v.optional(v.id("users")),           // which admin initiated
    initiatedAt: v.optional(v.number()),

    // Admin notes
    adminNotes: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_patient_user", ["patientUserId"])
    .index("by_created", ["createdAt"]),

  // ─── Partner Referral Links ──────────────────────────────────
  // Trackable links generated for each partner/campaign
  partnerReferralLinks: defineTable({
    partnerId: v.string(),                   // Partner code (e.g. "wellahealth")
    publicCode: v.string(),                  // Short URL slug e.g. "wella-7KQ2"
    campaignName: v.optional(v.string()),    // "Wellahealth rehabilitation referrals"
    serviceScope: v.optional(v.string()),    // "all_rehabilitation" or specific pathway
    defaultCareMode: v.optional(v.string()), // "remote", "face_to_face", "patient_choice"
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("expired")
    ),
    expiresAt: v.optional(v.number()),
    environment: v.optional(v.union(v.literal("sandbox"), v.literal("live"))), // missing = live
    createdBy: v.optional(v.string()),
    // Analytics (denormalized counters for quick display)
    clicks: v.optional(v.number()),
    leads: v.optional(v.number()),
    joyStarts: v.optional(v.number()),
    signups: v.optional(v.number()),
    bookings: v.optional(v.number()),
    payments: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_public_code", ["publicCode"])
    .index("by_partner_id", ["partnerId"])
    .index("by_partner_env", ["partnerId", "environment"])
    .index("by_status", ["status"]),

  // ─── Referral Events (Immutable Audit Trail) ─────────────────
  // Every status change, admin action, and milestone creates an event
  referralEvents: defineTable({
    referralId: v.id("inboundReferrals"),
    eventName: v.string(),                   // e.g. "received", "contacted", "booked", "appointment.attended"
    occurredAt: v.number(),
    actorType: v.optional(v.string()),        // "system", "admin", "partner", "patient"
    actorId: v.optional(v.string()),          // User ID or partner code
    metadata: v.optional(v.any()),            // Additional context (e.g. { previousStatus, newStatus })
  })
    .index("by_referral_id", ["referralId"])
    .index("by_event_name", ["eventName"])
    .index("by_occurred_at", ["occurredAt"]),

  // ─── Patient Consents ────────────────────────────────────────
  // Consent evidence and withdrawal history for partner referrals
  patientConsents: defineTable({
    referralId: v.optional(v.id("inboundReferrals")),
    patientPhone: v.optional(v.string()),
    patientEmail: v.optional(v.string()),
    granted: v.boolean(),
    capturedAt: v.number(),
    method: v.string(),                      // "partner_landing", "whatsapp", "wellahealth_app", "phone"
    privacyNoticeVersion: v.string(),        // e.g. "2026-09-01"
    withdrawnAt: v.optional(v.number()),
    withdrawalReason: v.optional(v.string()),
  })
    .index("by_referral_id", ["referralId"])
    .index("by_patient_phone", ["patientPhone"])
    .index("by_captured_at", ["capturedAt"]),

  // ─── Partner Contact Requests ────────────────────────────────
  // Outreach tasks created when patient selects "contact me" on landing page
  partnerContactRequests: defineTable({
    referralId: v.id("inboundReferrals"),
    channel: v.union(
      v.literal("whatsapp"),
      v.literal("email"),
      v.literal("sms"),
      v.literal("phone")
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("assigned"),
      v.literal("attempted"),
      v.literal("completed"),
      v.literal("failed")
    ),
    assignedTo: v.optional(v.id("users")),   // Admin/staff handling outreach
    attemptCount: v.optional(v.number()),
    lastAttemptAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_referral_id", ["referralId"])
    .index("by_status", ["status"])
    .index("by_assigned_to", ["assignedTo"]),

  // ─── Partner Contracts ───────────────────────────────────────
  // Versioned commercial agreements between Rehabify and partners
  partnerContracts: defineTable({
    partnerId: v.string(),                   // Partner code e.g. "wellahealth"
    contractNumber: v.string(),              // e.g. "CTR-2026-001"
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("expired"),
      v.literal("terminated")
    ),
    effectiveFrom: v.number(),
    effectiveTo: v.optional(v.number()),
    paymentTermsDays: v.number(),            // e.g. 30 (Net-30)
    payoutCurrency: v.string(),              // e.g. "NGN"
    modelType: v.union(
      v.literal("fixed_per_patient"),
      v.literal("percentage_revenue_share"),
      v.literal("tiered_volume"),
      v.literal("hybrid")
    ),
    baseFeePerBooking: v.optional(v.number()), // Fixed fee in kobo e.g. 500000 = ₦5,000
    revenueSharePercent: v.optional(v.number()), // Percentage e.g. 15 for 15%
    activationBonusPerPatient: v.optional(v.number()), // Fixed bonus in kobo e.g. 200000 = ₦2,000
    vatApplicable: v.boolean(),
    withholdingTaxPercent: v.optional(v.number()), // e.g. 5 for 5% WHT
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_partner_id", ["partnerId"])
    .index("by_status", ["status"])
    .index("by_contract_number", ["contractNumber"]),

  // ─── Partner Commission Tiers ────────────────────────────────
  // Volume tiers for partners on tiered volume or hybrid contracts
  partnerCommissionTiers: defineTable({
    contractId: v.optional(v.id("partnerContracts")),
    partnerId: v.string(),
    tierName: v.string(),                    // "Bronze", "Silver", "Gold", "Platinum"
    minReferrals: v.number(),                // 1, 21, 51, 101
    maxReferrals: v.optional(v.number()),    // 20, 50, 100, undefined for unlimited
    feePerReferral: v.optional(v.number()),  // in kobo
    revenueSharePercent: v.optional(v.number()), // %
    bonusAmount: v.optional(v.number()),     // Tier achievement bonus in kobo
    createdAt: v.number(),
  })
    .index("by_partner_id", ["partnerId"])
    .index("by_contract_id", ["contractId"]),

  // ─── Partner Commission Ledger ───────────────────────────────
  // Per-transaction immutable commission earnings
  partnerCommissions: defineTable({
    partnerId: v.string(),
    contractId: v.optional(v.id("partnerContracts")),
    // Optional: web-attributed patients (referral link sign-ups) may have no inbound referral
    referralId: v.optional(v.id("inboundReferrals")),
    trackingCode: v.optional(v.string()),
    patientName: v.optional(v.string()),
    eventType: v.union(
      v.literal("booking_confirmed"),
      v.literal("session_attended"),
      v.literal("treatment_completed"),
      v.literal("activation_bonus"),
      v.literal("payment"),
      v.literal("refund_adjustment")
    ),
    // Unified ledger fields (partnerLedger.ts)
    environment: v.optional(v.union(v.literal("sandbox"), v.literal("live"))),
    bookingId: v.optional(v.id("marketplaceBookings")),
    linkId: v.optional(v.id("partnerReferralLinks")),
    patientUserId: v.optional(v.id("users")),
    idempotencyKey: v.optional(v.string()), // Unique per earning event, e.g. "payment:<reference>"
    source: v.optional(v.string()), // "marketplace" | "joy" | "bank_transfer" | "refund"
    reversedAt: v.optional(v.number()),
    reversalReason: v.optional(v.string()),
    reversesCommissionId: v.optional(v.id("partnerCommissions")),
    payoutTransferId: v.optional(v.id("partnerPayoutTransfers")),
    grossTransactionAmount: v.number(),      // Amount patient paid or treatment cost in kobo (e.g. ₦10,000 = 1,000,000)
    commissionRate: v.number(),              // Partner percentage (e.g. 10) or fixed fee in kobo
    commissionAmount: v.number(),            // Commission earned by partner in kobo (10%)
    netPayable: v.number(),                  // After WHT deduction in kobo

    // Transparency: Itemized 3-way split (80% Physio / 10% Rehabify / 10% Partner)
    physiotherapistId: v.optional(v.id("users")),
    physiotherapistName: v.optional(v.string()),
    careMode: v.optional(v.union(v.literal("virtual"), v.literal("in_person"))),
    physiotherapistAmount: v.optional(v.number()), // 80% share in kobo
    rehabifyAmount: v.optional(v.number()),        // 10% share in kobo
    partnerAmount: v.optional(v.number()),         // 10% share in kobo
    physioPercent: v.optional(v.number()),         // 80
    rehabifyPercent: v.optional(v.number()),       // 10
    partnerPercent: v.optional(v.number()),        // 10

    // Payment Tracking: Paystack vs Bank Transfer
    paymentMethod: v.optional(v.union(v.literal("paystack"), v.literal("bank_transfer"))),
    paymentReference: v.optional(v.string()),

    // Paystack Fee Tracking (separated per accounting best practices)
    paystackInboundFeeKobo: v.optional(v.number()),    // Collection fee: 1.5% + ₦100 (capped ₦2,000)
    paystackOutboundFeeKobo: v.optional(v.number()),   // Transfer fee: ₦10/₦25/₦50 tiered
    stampDutyKobo: v.optional(v.number()),              // Government stamp duty: ₦50 for transfers ≥ ₦10,000
    feeBearer: v.optional(v.string()),                  // Who absorbed the fee: "physiotherapist", "patient", "rehabify", "split_proportional"
    netPhysiotherapistAmount: v.optional(v.number()),   // Physio amount after fee deduction
    netPartnerAmount: v.optional(v.number()),           // Partner amount after fee deduction
    netRehabifyAmount: v.optional(v.number()),          // Rehabify amount after fee deduction

    // Monthly Bulk Payout Reconciliation
    billingPeriod: v.optional(v.string()),         // "YYYY-MM" e.g. "2026-09"
    bulkPayoutStatus: v.optional(v.union(
      v.literal("accrued"),
      v.literal("pending_bulk_payout"),
      v.literal("paid")
    )),
    bulkPayoutBatchId: v.optional(v.string()),
    paidAt: v.optional(v.number()),

    status: v.union(
      v.literal("pending_approval"),
      v.literal("approved"),
      v.literal("settled"),
      v.literal("cancelled"),
      v.literal("reversed")
    ),
    settlementId: v.optional(v.string()),    // Linked statement id e.g. "SETTLE-2026-09"
    notes: v.optional(v.string()),
    earnedAt: v.number(),
    settledAt: v.optional(v.number()),
  })
    .index("by_partner_id", ["partnerId"])
    .index("by_referral_id", ["referralId"])
    .index("by_status", ["status"])
    .index("by_settlement_id", ["settlementId"])
    .index("by_earned_at", ["earnedAt"])
    .index("by_billing_period", ["billingPeriod"])
    .index("by_partner_and_period", ["partnerId", "billingPeriod"])
    .index("by_bulk_payout_status", ["bulkPayoutStatus"])
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_payment_reference", ["paymentReference"])
    .index("by_payout_transfer", ["payoutTransferId"])
    .index("by_partner_and_patient", ["partnerId", "patientUserId"]),

  // ─── Partner API Keys (Multi-Key Management & Lifecycle) ─────
  // Only a SHA-256 hash of each key is stored. The full key is shown once at creation.
  partnerApiKeys: defineTable({
    partnerId: v.string(), // partner slug/code, e.g. "wellahealth"
    name: v.string(),      // e.g. "Default Key", "Staging Server", "EMR Webhook Worker"
    key: v.optional(v.string()), // LEGACY plaintext (pre-hashing). Never written; cleared by migration.
    keyHash: v.optional(v.string()), // hex SHA-256 of the full key
    keyPrefix: v.string(), // display only, e.g. "sk_live_Ab3d…"
    last4: v.optional(v.string()),
    environment: v.union(v.literal("sandbox"), v.literal("live")),
    status: v.union(v.literal("active"), v.literal("revoked"), v.literal("rolling")),
    createdAt: v.number(),
    createdBy: v.optional(v.string()),
    lastUsedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.string()),
  })
    .index("by_key", ["key"])
    .index("by_key_hash", ["keyHash"])
    .index("by_partner", ["partnerId"])
    .index("by_partner_and_env", ["partnerId", "environment"])
    .index("by_partner_env_status", ["partnerId", "environment", "status"]),

  // ─── Partner Webhook Outbox (durable, retried deliveries) ─────
  // One row per event. The event id and payload never change across retries.
  partnerWebhookDeliveries: defineTable({
    eventId: v.string(),                      // evt_… (stable, sent as X-Rehabify-Event-Id)
    partnerId: v.string(),                    // partner code
    environment: v.union(v.literal("sandbox"), v.literal("live")),
    eventType: v.string(),
    payload: v.string(),                      // exact JSON body that is signed and sent
    referralId: v.optional(v.id("inboundReferrals")),
    trackingCode: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("delivering"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    attempts: v.number(),
    nextAttemptAt: v.optional(v.number()),
    lastAttemptAt: v.optional(v.number()),
    lastStatusCode: v.optional(v.number()),
    lastError: v.optional(v.string()),
    lastResponseSnippet: v.optional(v.string()),
    lastLatencyMs: v.optional(v.number()),
    lastTargetUrl: v.optional(v.string()),
    deliveredAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event_id", ["eventId"])
    .index("by_partner_env_created", ["partnerId", "environment", "createdAt"])
    .index("by_status_next_attempt", ["status", "nextAttemptAt"])
    .index("by_referral", ["referralId"]),

  // ─── Partner API Idempotency Keys (24h) ──────────────────────
  partnerIdempotencyKeys: defineTable({
    partnerId: v.string(),
    environment: v.union(v.literal("sandbox"), v.literal("live")),
    key: v.string(),
    route: v.string(),                        // e.g. "POST /partners/referrals"
    requestHash: v.string(),                  // SHA-256 of the canonical request body
    status: v.union(v.literal("in_progress"), v.literal("completed")),
    responseStatus: v.optional(v.number()),
    responseBody: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_partner_env_key", ["partnerId", "environment", "key"])
    .index("by_expires", ["expiresAt"]),

  // ─── Partner Payout Transfers (Paystack transfer lifecycle) ───
  partnerPayoutTransfers: defineTable({
    transferReference: v.string(),            // our Paystack transfer reference (TRF_RH_…)
    partnerCode: v.string(),
    billingPeriod: v.string(),
    amountKobo: v.number(),                   // net amount sent
    grossCommissionKobo: v.number(),
    feesKobo: v.number(),
    commissionIds: v.array(v.id("partnerCommissions")),
    status: v.union(
      v.literal("initiated"),
      v.literal("otp_required"),
      v.literal("pending"),
      v.literal("success"),
      v.literal("failed"),
      v.literal("reversed")
    ),
    transferCode: v.optional(v.string()),
    bulkBatchCode: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    initiatedBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_reference", ["transferReference"])
    .index("by_transfer_code", ["transferCode"])
    .index("by_partner_period", ["partnerCode", "billingPeriod"])
    .index("by_status", ["status"]),

  // Replay protection for the Next.js → Convex partner gateway
  partnerGatewayNonces: defineTable({
    nonce: v.string(),
    expiresAt: v.number(),
  })
    .index("by_nonce", ["nonce"])
    .index("by_expires", ["expiresAt"]),

  // ─── Partner Activity & Webhook Callback Audit Trail ─────────
  partnerActivityLogs: defineTable({
    partnerId: v.string(),
    environment: v.union(v.literal("sandbox"), v.literal("live")),
    eventId: v.string(),                       // e.g. "evt_live_72941" or "req_9921"
    eventType: v.string(),                     // e.g. "referral.received", "webhook.delivery", "api.referral_create", "test.ping"
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    url: v.string(),                           // endpoint URL or callback URL
    method: v.string(),                        // "POST", "GET"
    statusCode: v.number(),                    // 200, 201, 400, 500
    latencyMs: v.number(),                     // Real duration in milliseconds
    status: v.union(v.literal("success"), v.literal("error")),
    queryId: v.optional(v.string()),           // optional query correlation id
    requestId: v.optional(v.string()),         // unique request id (req_...)
    traceId: v.optional(v.string()),           // trace / span id (trc_...)
    patientName: v.optional(v.string()),       // patient name if referral context
    trackingCode: v.optional(v.string()),      // RHB-XXXXX tracking code
    requestHeaders: v.optional(v.any()),       // Sanitized request headers
    requestPayload: v.optional(v.any()),       // Sanitized JSON payload
    responseHeaders: v.optional(v.any()),      // Sanitized response headers
    responsePayload: v.optional(v.any()),      // Sanitized response payload
    errorMessage: v.optional(v.string()),      // Error summary if failed
    occurredAt: v.number(),                    // Unix timestamp
  })
    .index("by_partner", ["partnerId"])
    .index("by_partner_and_env", ["partnerId", "environment"])
    .index("by_partner_env_occurred", ["partnerId", "environment", "occurredAt"])
    .index("by_event_id", ["eventId"])
    .index("by_event_type", ["eventType"])
    .index("by_status", ["status"]),

  // ─── Platform Revenue Split & Baseline Pricing Settings ──────
  platformRevenueSettings: defineTable({
    rehabifyPercent: v.number(),          // default 10 (%)
    physiotherapistPercent: v.number(),   // default 80 (%)
    partnerPercent: v.number(),           // default 10 (%)
    defaultVirtualRateKobo: v.number(),   // default 600,000 (₦6,000)
    defaultInPersonRateKobo: v.number(),  // default 1,000,000 (₦10,000)
    payoutSchedule: v.string(),           // "end_of_month"
    // Paystack Fee Bearer Configuration (admin-configurable)
    paystackFeeBearerInbound: v.optional(v.union(
      v.literal("physiotherapist"),   // Default: deducted from physio's 80%
      v.literal("patient"),           // Added to patient checkout total
      v.literal("rehabify"),          // Deducted from Rehabify's 10%
      v.literal("split_proportional") // Each party absorbs proportionally
    )),
    paystackFeeBearerOutbound: v.optional(v.union(
      v.literal("physiotherapist"),   // Default: deducted from physio's share
      v.literal("partner"),           // Deducted from partner's 10% payout
      v.literal("rehabify"),          // Deducted from Rehabify's 10%
      v.literal("split_proportional") // Each party absorbs proportionally
    )),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  }),

  // ─── Platform controls (admin Settings page; latest row wins, see convex/platformSettings.ts) ──
  platformControls: defineTable({
    maintenanceMode: v.boolean(),
    maintenanceMessage: v.optional(v.string()),
    allowPatientSignups: v.boolean(),
    allowPhysioSignups: v.boolean(),
    allowClinicSignups: v.boolean(),
    marketplaceEnabled: v.boolean(),
    supportEmail: v.optional(v.string()),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
    updatedByName: v.optional(v.string()),
  }),

  // ─── Platform announcements (admin broadcast history; delivered to users in batches) ──
  platformAnnouncements: defineTable({
    title: v.string(),
    message: v.string(),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    targetRoles: v.array(v.string()),
    status: v.union(v.literal("sending"), v.literal("sent"), v.literal("failed")),
    recipientCount: v.number(),
    createdBy: v.id("users"),
    createdByName: v.string(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_created_at", ["createdAt"]),

  // ─── Partner Bank Accounts (Paystack-verified for monthly payouts) ──────
  partnerBankAccounts: defineTable({
    partnerCode: v.string(),                          // Links to partners.code
    bankCode: v.string(),                             // Paystack bank code e.g. "058"
    bankName: v.string(),                             // "GTBank", "Access Bank", etc.
    accountNumber: v.string(),                        // 10-digit NUBAN
    accountName: v.string(),                          // Auto-resolved via Paystack /bank/resolve API
    isVerified: v.boolean(),                          // Passed Paystack account resolution
    isDefault: v.boolean(),                           // Primary payout account
    paystackRecipientCode: v.optional(v.string()),    // Paystack transfer recipient code for automation
    // Paystack mode the recipient was created in (helpers/paystackMode.ts); missing = test
    paystackRecipientMode: v.optional(v.union(v.literal("test"), v.literal("live"))),
    addedBy: v.optional(v.string()),                  // Who added it (partner email or admin)
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_partner_code", ["partnerCode"])
    .index("by_partner_code_default", ["partnerCode", "isDefault"]),

  // ─── 3D exercise library: programmes, share links, viewing grants, licences ─────
  // A home exercise programme a physio or clinic sends to a patient. It shows in the patient's
  // dashboard and can also be opened from a PIN-protected link (exerciseShareLinks).
  exercisePrograms: defineTable({
    patientId: v.id("users"),
    createdBy: v.id("users"),
    clinicId: v.optional(v.id("clinics")),
    treatmentPlanId: v.optional(v.id("treatmentPlans")),
    episodeId: v.optional(v.id("careEpisodes")),
    title: v.string(),
    note: v.optional(v.string()),
    voiceNoteStorageId: v.optional(v.id("_storage")),
    voiceNoteSeconds: v.optional(v.number()),
    // Optional goals shown at the top of the programme (e.g. "Climb stairs without the rail").
    goals: v.optional(v.array(v.string())),
    // Exercises and/or education, in the order the patient sees them. Older programmes only
    // hold library exercises, so every field added here is optional.
    items: v.array(v.object({
      // A library exercise. Absent for the care team's own exercises and for education.
      exerciseId: v.optional(v.id("exercises")),
      // "education": advice to read, with no dose. Absent means an exercise.
      kind: v.optional(v.union(v.literal("exercise"), v.literal("education"))),
      // Name of an exercise that isn't in the library, or the title of an education item.
      name: v.optional(v.string()),
      side: v.optional(v.union(v.literal("L"), v.literal("R"))),
      // Always set for exercises; left out for education.
      sets: v.optional(v.number()),
      reps: v.optional(v.number()),
      holdSeconds: v.optional(v.number()),
      frequency: v.optional(v.string()),
      // Instructions for an exercise, or the text of an education item.
      note: v.optional(v.string()),
      // Education from the Rehabify Library: libraryResources.key (title, guide, link or video).
      resourceKey: v.optional(v.string()),
    })),
    status: v.union(v.literal("active"), v.literal("archived")),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_patient", ["patientId", "createdAt"])
    .index("by_creator", ["createdBy", "createdAt"])
    .index("by_clinic", ["clinicId", "createdAt"]),

  // One patient-reported completion of one exercise in a programme.
  exerciseProgramLogs: defineTable({
    programId: v.id("exercisePrograms"),
    patientId: v.id("users"),
    itemIndex: v.number(),
    setsDone: v.optional(v.number()),
    painScore: v.optional(v.number()), // 0-10
    difficulty: v.optional(v.union(v.literal("easy"), v.literal("ok"), v.literal("hard"))),
    note: v.optional(v.string()),
    source: v.union(v.literal("app"), v.literal("link")),
    linkId: v.optional(v.id("exerciseShareLinks")),
    createdAt: v.number(),
    // A clinician has seen a high-pain log (it leaves Needs attention)
    reviewedAt: v.optional(v.number()),
  })
    .index("by_program", ["programId", "createdAt"])
    .index("by_patient", ["patientId", "createdAt"]),

  // PIN-protected link to a programme (sent on WhatsApp). Only hashes of the token, PIN and
  // device sessions are stored.
  exerciseShareLinks: defineTable({
    programId: v.id("exercisePrograms"),
    patientId: v.id("users"),
    createdBy: v.id("users"),
    tokenHash: v.string(),
    pinSalt: v.string(),
    pinHash: v.string(),
    pinSource: v.union(v.literal("phone"), v.literal("custom")),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    failedPins: v.number(),
    lockedUntil: v.optional(v.number()),
    lockedOut: v.optional(v.boolean()), // Too many wrong PINs; the physio must send a new link
    openCount: v.number(),
    lastOpenedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_token", ["tokenHash"])
    .index("by_program", ["programId"]),

  exerciseShareSessions: defineTable({
    linkId: v.id("exerciseShareLinks"),
    sessionHash: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionHash"])
    .index("by_link", ["linkId"]),

  // Audit trail and rate limit for handing out asset keys.
  exerciseViewGrants: defineTable({
    subject: v.string(), // "user:<id>" or "link:<id>"
    userId: v.optional(v.id("users")),
    linkId: v.optional(v.id("exerciseShareLinks")),
    licenceId: v.optional(v.id("libraryLicences")),
    access: v.string(), // staff | patient | link | licence
    clipCount: v.number(),
    version: v.string(),
    createdAt: v.number(),
  })
    .index("by_subject", ["subject", "createdAt"])
    .index("by_licence", ["licenceId", "createdAt"]),

  // Organisations outside physiotherapy that license the library (billing comes later).
  libraryLicences: defineTable({
    orgName: v.string(),
    sector: v.string(),
    partnerId: v.optional(v.id("partners")),
    plan: v.union(v.literal("trial"), v.literal("standard"), v.literal("enterprise")),
    seats: v.number(),
    status: v.union(v.literal("active"), v.literal("suspended"), v.literal("expired")),
    expiresAt: v.optional(v.number()),
    watermarkLabel: v.string(),
    allowedOrigins: v.array(v.string()), // reserved for the embeddable player
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status", ["status"]),

  libraryLicenceMembers: defineTable({
    licenceId: v.id("libraryLicences"),
    userId: v.id("users"),
    addedBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_licence", ["licenceId"]),

  // Rehabify Library resources from the founder's prototype (convex/libraryResourcesSeed.ts):
  // NHS and hospital pages, videos and Rehabify's own written guides, with their translations.
  // Items we have built in 3D carry animationSlug, so the library can offer the animation instead.
  libraryResources: defineTable({
    key: v.string(), // the prototype's id, e.g. "kn-aaa-oa"
    kind: v.union(v.literal("link"), v.literal("youtube"), v.literal("guide")),
    title: v.string(),
    source: v.string(),
    url: v.optional(v.string()),
    youtubeId: v.optional(v.string()),
    region: v.string(), // knee | ankle | hip | lowback | thoracic | neck | shoulder | elbow | wrist | general
    condition: v.string(),
    type: v.union(v.literal("Exercise programme"), v.literal("Stretch"), v.literal("Self-test"), v.literal("Education")),
    tags: v.array(v.string()),
    guides: v.array(v.object({
      lang: v.union(v.literal("en"), v.literal("yo"), v.literal("ig"), v.literal("ha")),
      steps: v.array(v.string()),
      stop: v.optional(v.string()),
      // Translations stay "draft" until a native-speaking clinician reviews them.
      status: v.union(v.literal("reviewed"), v.literal("draft")),
    })),
    animationSlug: v.optional(v.string()),
    active: v.boolean(),
    seedVersion: v.string(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_region", ["region"]),

  // When to stop and seek help, per body region and language (drafts until reviewed).
  libraryRedFlags: defineTable({
    region: v.string(),
    lang: v.union(v.literal("en"), v.literal("yo"), v.literal("ig"), v.literal("ha")),
    items: v.array(v.string()),
    status: v.union(v.literal("reviewed"), v.literal("draft")),
    seedVersion: v.string(),
  }).index("by_region_lang", ["region", "lang"]),

  // Rehabify Learn — MSK Specialist Program. One row per cohort: admins edit the dates,
  // live sessions and prices here, and the live cohort drives /learn, the landing-page
  // section and the top banner. Dates are calendar dates ("2026-11-02", Lagos).
  learnCohorts: defineTable({
    program: v.string(), // "msk-specialist"
    cohortLabel: v.string(), // "November 2026 cohort"
    startDate: v.string(),
    endDate: v.string(),
    liveSessions: v.string(), // "Sundays, 5:00–7:00 PM"
    duration: v.string(), // "5 weeks"
    format: v.string(), // "Online + live clinical demonstrations"
    registrationDeadline: v.optional(v.string()), // last day to register; open until closed when unset
    rehabifyPriceKobo: v.number(),
    externalPriceKobo: v.number(),
    capacity: v.optional(v.number()), // paid seats; unlimited when unset
    status: v.union(v.literal("draft"), v.literal("live"), v.literal("closed")),
    showOnLanding: v.boolean(),
    showBanner: v.boolean(),
    bannerText: v.optional(v.string()),
    communityLink: v.optional(v.string()), // legacy single group link; `links` replaces it
    // Named links on the learner's course page (WhatsApp group, Drive folder, forms), set by admins
    links: v.optional(v.array(v.object({ id: v.string(), label: v.string(), url: v.string() }))),
    welcomeNote: v.optional(v.string()), // extra line in the confirmation email
    imageStorageId: v.optional(v.id("_storage")), // optional photo for the landing section and program hero
    imageAlt: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status", ["status"]),

  learnRegistrations: defineTable({
    cohortId: v.id("learnCohorts"),
    track: v.union(v.literal("rehabify"), v.literal("external")),
    userId: v.optional(v.id("users")), // signed-in account; required for the Rehabify rate
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(), // lower-cased
    phone: v.string(),
    licenseNumber: v.optional(v.string()),
    workplace: v.optional(v.string()),
    city: v.optional(v.string()),
    yearsOfPractice: v.optional(v.string()),
    amountKobo: v.number(), // price when the checkout was started
    currency: v.string(),
    status: v.union(v.literal("pending"), v.literal("paid"), v.literal("cancelled"), v.literal("refunded")),
    paymentReference: v.optional(v.string()), // latest checkout started
    paymentAttempts: v.optional(v.number()),
    lastAttemptAt: v.optional(v.number()),
    paidReference: v.optional(v.string()),
    paidAmountKobo: v.optional(v.number()),
    paymentChannel: v.optional(v.string()),
    paidAt: v.optional(v.number()),
    // Successful charges that did not buy the seat (a second payment, or less than the price): refund or reconcile
    extraPayments: v.optional(v.array(v.object({ reference: v.string(), amountKobo: v.number(), at: v.number() }))),
    confirmationEmailSentAt: v.optional(v.number()),
    adminNotes: v.optional(v.string()),
    contactedAt: v.optional(v.number()), // an admin followed up on an unfinished payment
    contactedBy: v.optional(v.id("users")),
    // One-tap "Open my course" link from the confirmation email (only its hash is stored)
    courseLinkHash: v.optional(v.string()),
    courseLinkExpiresAt: v.optional(v.number()),
    courseLinkUsedAt: v.optional(v.number()),
    // Progress: live sessions joined (tapped "Join", or marked by an admin) and weeks ticked off
    attendedSessionIds: v.optional(v.array(v.id("learnSessions"))),
    weeksDone: v.optional(v.array(v.id("learnModules"))),
    // Certificate, once claimed (or issued by an admin). The code is public, for verification.
    certificateCode: v.optional(v.string()),
    certificateName: v.optional(v.string()),
    certificateIssuedAt: v.optional(v.number()),
    certificateRevokedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_cohort", ["cohortId"])
    .index("by_cohort_status", ["cohortId", "status"])
    .index("by_cohort_email", ["cohortId", "email"])
    .index("by_email", ["email"])
    .index("by_course_link", ["courseLinkHash"])
    .index("by_certificate", ["certificateCode"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // Live sessions of a cohort, each with its own meeting link (changed by admins at any time)
  learnSessions: defineTable({
    cohortId: v.id("learnCohorts"),
    startsAt: v.number(),
    endsAt: v.number(),
    title: v.optional(v.string()),
    meetingUrl: v.optional(v.string()),
    recordingUrl: v.optional(v.string()),
    linkChangedAt: v.optional(v.number()),
    // Reminder emails sent for the current start time (cleared when the time changes)
    remindedDayAt: v.optional(v.number()),
    remindedHourAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_cohort", ["cohortId", "startsAt"])
    .index("by_start", ["startsAt"]),

  // A week of course materials: recording, handouts and exercises to study
  learnModules: defineTable({
    cohortId: v.id("learnCohorts"),
    week: v.number(),
    title: v.string(),
    summary: v.optional(v.string()),
    recordingUrl: v.optional(v.string()),
    files: v.array(
      v.object({ storageId: v.id("_storage"), name: v.string(), size: v.number(), contentType: v.string() })
    ),
    exerciseIds: v.array(v.id("exercises")),
    resourceKeys: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_cohort_week", ["cohortId", "week"]),

  // A cohort's final assessment: multiple-choice questions, marked automatically
  learnAssessments: defineTable({
    cohortId: v.id("learnCohorts"),
    status: v.union(v.literal("draft"), v.literal("open"), v.literal("closed")),
    passMark: v.number(), // percent
    maxAttempts: v.number(),
    minSessions: v.number(), // live sessions a physio must attend for the certificate
    questions: v.array(
      v.object({
        id: v.string(),
        prompt: v.string(),
        options: v.array(v.string()),
        answer: v.number(), // index into options; never sent to learners
        explanation: v.optional(v.string()),
      })
    ),
    // Printed on the certificate
    signatoryName: v.optional(v.string()),
    signatoryTitle: v.optional(v.string()),
    updatedBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_cohort", ["cohortId"]),

  learnAttempts: defineTable({
    registrationId: v.id("learnRegistrations"),
    cohortId: v.id("learnCohorts"),
    answers: v.array(v.number()),
    correct: v.number(),
    total: v.number(),
    scorePct: v.number(),
    passed: v.boolean(),
    submittedAt: v.number(),
  })
    .index("by_registration", ["registrationId", "submittedAt"])
    .index("by_cohort", ["cohortId"]),

  // On-demand video courses for paid MSK learners. Videos are private ImageKit files, played
  // through short-lived signed links (see getLessonPlayback in convex/learn.ts).
  learnVideoCourses: defineTable({
    title: v.string(),
    summary: v.string(),
    benefits: v.array(v.string()), // "What you'll learn"
    coverUrl: v.optional(v.string()), // public ImageKit image
    coverFileId: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("published")),
    order: v.number(),
    learnerCount: v.number(), // learners who have started it
    publishedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status_order", ["status", "order"]),

  learnVideoLessons: defineTable({
    courseId: v.id("learnVideoCourses"),
    order: v.number(),
    title: v.string(),
    description: v.optional(v.string()),
    video: v.object({
      fileId: v.string(),
      filePath: v.string(),
      url: v.string(), // unsigned; never sent to learners
      sizeBytes: v.number(),
      durationSec: v.number(),
      posterUrl: v.optional(v.string()), // public frame grabbed in the browser at upload
      posterFileId: v.optional(v.string()),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_course_order", ["courseId", "order"]),

  // One row per learner per course, keyed by the email of their paid registration
  learnVideoProgress: defineTable({
    courseId: v.id("learnVideoCourses"),
    email: v.string(),
    userId: v.optional(v.id("users")),
    completedLessonIds: v.array(v.id("learnVideoLessons")),
    lastLessonId: v.optional(v.id("learnVideoLessons")),
    lastPositionSec: v.optional(v.number()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_email_course", ["email", "courseId"])
    .index("by_course", ["courseId"]),

  // Legal proof of every policy or agreement acceptance: who, which document and version, when and
  // how. Append-only: rows are only ever inserted, never changed or deleted. See lib/policies.ts.
  policyAcceptances: defineTable({
    userId: v.optional(v.id("users")),
    name: v.string(),
    email: v.optional(v.string()),
    document: v.string(), // lib/policies.ts PolicyId, or an agreement id
    version: v.string(),
    channel: v.union(v.literal("web"), v.literal("app"), v.literal("whatsapp")),
    // What it was accepted for, e.g. a booking
    contextType: v.optional(v.string()),
    contextId: v.optional(v.string()),
    acceptedAt: v.number(),
  })
    .index("by_user_document", ["userId", "document", "acceptedAt"])
    .index("by_context", ["contextType", "contextId"]),

  // Signed agreements (lib/agreements.ts): network contractor, independent platform and clinic.
  // A row is never edited except to add Rehabify's countersignature or to void it; signing a new
  // version adds a row. documentHash is the SHA-256 of the exact filled-in text that was signed.
  agreementSignatures: defineTable({
    agreementId: v.string(),
    version: v.string(),
    party: v.union(v.literal("physiotherapist"), v.literal("clinic")),
    userId: v.id("users"), // who signed
    clinicId: v.optional(v.id("clinics")),
    values: v.record(v.string(), v.string()), // the details filled in, as signed
    signatureName: v.string(), // typed signature
    signatureTitle: v.optional(v.string()),
    signatureDrawing: v.optional(v.string()), // SVG path data when drawn
    signerEmail: v.string(),
    documentHash: v.string(),
    userAgent: v.optional(v.string()),
    signedAt: v.number(),
    status: v.union(v.literal("awaiting_countersign"), v.literal("active"), v.literal("void")),
    countersignedBy: v.optional(v.id("users")),
    countersignName: v.optional(v.string()),
    countersignTitle: v.optional(v.string()),
    countersignedAt: v.optional(v.number()),
    voidedAt: v.optional(v.number()),
    voidedBy: v.optional(v.id("users")),
    voidReason: v.optional(v.string()),
  })
    .index("by_user_agreement", ["userId", "agreementId", "signedAt"])
    .index("by_clinic_agreement", ["clinicId", "agreementId", "signedAt"])
    .index("by_status", ["status", "signedAt"])
    .index("by_signed", ["signedAt"]),

  // Admin "please sign" emails, so reminders aren't sent twice in a day.
  agreementReminders: defineTable({
    agreementId: v.string(),
    userId: v.id("users"),
    clinicId: v.optional(v.id("clinics")),
    email: v.string(),
    sentBy: v.id("users"),
    sentAt: v.number(),
  }).index("by_user_agreement", ["userId", "agreementId", "sentAt"]),

  // From enforcedAt, physios must have signed their agreement to be bookable (latest row wins).
  agreementSettings: defineTable({
    enforcedAt: v.optional(v.number()),
    updatedAt: v.number(),
    updatedBy: v.id("users"),
  }),

  // Proof of cookie consent (one row per browser choice id; see lib/consent.ts). Holds no
  // IP address or device details, only the choice, when, how, and the account if signed in.
  cookieConsents: defineTable({
    consentId: v.string(),
    version: v.number(),
    analytics: v.boolean(),
    action: v.union(v.literal("accept_all"), v.literal("reject_all"), v.literal("custom"), v.literal("gpc")),
    decidedAt: v.number(),
    userId: v.optional(v.id("users")),
    // Earlier choices made with the same id, oldest first (capped)
    history: v.array(v.object({ analytics: v.boolean(), action: v.string(), version: v.number(), decidedAt: v.number() })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_consent_id", ["consentId"])
    .index("by_user", ["userId", "decidedAt"])
    .index("by_decided", ["decidedAt"]),

  // People who asked to hear about the next cohort while registration was closed.
  learnInterest: defineTable({
    program: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_program_email", ["program", "email"]),

});
