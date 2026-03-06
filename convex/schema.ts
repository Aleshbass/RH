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
    // When the user joined the clinic (if applicable)
    joinedAt: v.optional(v.number()),

    role: v.optional(v.union( // Role can be null until onboarding is complete
      v.literal("physiotherapist"),
      v.literal("clinic_owner"),
      v.literal("patient"),
      v.literal("family_member"),
      v.literal("doctor"),
      v.literal("admin")
    )),
    onboarded: v.boolean(), // Flag to indicate if user has completed initial profile setup

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
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"]) // To query users by role (especially after onboarding)
    .index("by_clinic_id", ["clinicId"]),

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
    settings: v.optional(v.object({ // Clinic-specific settings
      defaultCurrency: v.optional(v.string()), // e.g., "NGN"
      language: v.optional(v.string()), // e.g., "en"
    })),
  })
    .index("by_owner_id", ["ownerId"]),

  // Physiotherapist specific profiles/details
  physiotherapistProfiles: defineTable({
    userId: v.id("users"),
    clinicId: v.optional(v.id("clinics")), // The primary clinic they are associated with, now optional
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
    packageRates: v.optional(v.array(v.object({
      sessions: v.number(),
      price: v.number(), // Total package price in kobo
      description: v.optional(v.string()),
    }))),
    packageDiscountPercent: v.optional(v.number()), // 5-15% discount for multi-session packages

    // Location
    location: v.optional(v.string()), // "Lagos", "Abuja", "Online"
    offersOnlineSessions: v.optional(v.boolean()),
    offersInPersonSessions: v.optional(v.boolean()),

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
    profileViews: v.optional(v.number()),
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
    .index("by_bookingSlug", ["bookingSlug"]),

  // Patient specific profiles/details
  patientProfiles: defineTable({
    userId: v.id("users"),
    clinicId: v.optional(v.id("clinics")), // Clinic they are primarily associated with, if any
    dateOfBirth: v.optional(v.string()), // ISO string or timestamp
    gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"), v.literal("prefer_not_to_say"))),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
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
  })
    .index("by_patient", ["patientId"])
    .index("by_clinic", ["clinicId"])
    .index("by_physiotherapist", ["physiotherapistId"])
    .index("by_patient_and_physiotherapist", ["patientId", "physiotherapistId"])
    .index("by_primary_physiotherapist", ["patientId", "isPrimaryPhysiotherapist"]),

  // Family Access Grants: Manages family member access to patient data
  // Documents uploaded by physiotherapists (licenses, certifications, etc.)
  // Notifications: System-wide notifications for all users
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

  physiotherapistDocuments: defineTable({
    physiotherapistId: v.id("physiotherapistProfiles"),
    storageId: v.id("_storage"),
    documentType: v.union(
      v.literal("licenseDocument"),
      v.literal("additionalCertificate")
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
    // Video call integration
    isOnline: v.optional(v.boolean()), // True for online/telehealth appointments
    meetingLink: v.optional(v.string()), // GetStream or other video platform meeting link
    videoCallId: v.optional(v.id("videoCalls")), // Link to videoCalls table
  })
    .index("by_patient_id_and_time", ["patientId", "startTime"])
    .index("by_clinic_id_and_time", ["clinicId", "startTime"])
    .index("by_physiotherapist_id_and_time", ["physiotherapistId", "startTime"])
    .index("by_series_id", ["seriesId"])
    .index("by_instance_date", ["instanceDate"]),

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
    .index("by_target_muscles", ["targetMuscles"]),

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
    })),
    phases: v.array(v.object({
      name: v.string(),
      description: v.string(),
      duration: v.string(),
      order: v.number(),
      exercises: v.array(v.object({
        exerciseId: v.string(),
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
    paymentDate: v.optional(v.float64()),
    notes: v.optional(v.string()),
    relatedAppointmentIds: v.optional(v.array(v.id("appointments"))),
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
    referringDoctorId: v.id("users"), // The doctor who made the referral

    // Patient Details Provided Before Registration
    patientFirstName: v.string(),
    patientLastName: v.string(),
    patientEmail: v.optional(v.string()),
    patientPhone: v.string(),
    hospitalClinic: v.optional(v.string()), // The hospital/clinic the referral is coming from
    condition: v.optional(v.string()),
    clinicalNotes: v.optional(v.string()), // Reason for referral, initial diagnosis

    // Tracking the patient lifecycle
    patientId: v.optional(v.id("users")), // Linked once they sign up
    appointmentId: v.optional(v.id("appointments")), // Associated first appointment

    status: v.union(
      v.literal("pending"),    // Referral submitted, patient hasn't booked yet
      v.literal("contacted"),  // Rehabify team contacted them
      v.literal("booked"),     // First session scheduled
      v.literal("completed"),  // First session completed
      v.literal("paid_out"),   // Commission paid to referrer
      v.literal("cancelled")
    ),

    // Financial Tracking
    commissionEarned: v.optional(v.number()), // Amount earned by referrer in kobo

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_referring_doctor", ["referringDoctorId"])
    .index("by_patient", ["patientId"])
    .index("by_status", ["status"])
    .index("by_referring_doctor_and_status", ["referringDoctorId", "status"]),

  // MyItura MediLoan applications
  loanApplications: defineTable({
    patientId: v.optional(v.id("users")),
    initiatedBy: v.id("users"), // Physio or Clinic Owner ID who initiated it
    clientReference: v.string(), // Unique internal ref (RH-LOAN-xxx)
    invoiceReference: v.optional(v.string()), // Optional invoice link
    myituraSdkRef: v.optional(v.string()), // 10-char MyItura ref
    treatment: v.string(),
    amount: v.number(), // in kobo (100 kobo = ₦1)

    // Patient display fields (so we don't need to join every time)
    patientFirstName: v.string(),
    patientLastName: v.string(),
    patientPhone: v.string(),
    patientEmail: v.optional(v.string()),

    applicationUrl: v.optional(v.string()), // SMS link sent to patient
    status: v.union(
      v.literal("initiated"),   // We called MyItura, SMS sent
      v.literal("pending"),     // Patient started their application
      v.literal("approved"),    // Loan approved by MyItura
      v.literal("disbursed"),   // Funds released to Rehabify
      v.literal("declined"),    // Loan application rejected
      v.literal("expired"),     // 7-day window lapsed
      v.literal("failed"),      // API or system error
      v.literal("repaid")       // Patient fully repaid the loan
    ),
    expiresAt: v.optional(v.string()),

    // Post-loan tracking
    disbursedAt: v.optional(v.number()),
    repaymentStatus: v.optional(v.string()), // e.g. "on_track", "overdue", "completed"
    lastWebhookPayload: v.optional(v.string()), // Raw webhook JSON for debugging

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_patient", ["patientId"])
    .index("by_clientReference", ["clientReference"])
    .index("by_myituraSdkRef", ["myituraSdkRef"])
    .index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"]),

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
    .index("by_conversation_and_receiver_and_read", ["conversationId", "receiverId", "isReadByReceiver"]),

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
    paymentId: v.id("payments"),
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
      v.literal("phase_updated")
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
  physiotherapistBankAccounts: defineTable({
    physiotherapistId: v.id("users"),
    subaccountCode: v.string(), // Paystack subaccount code (kept for backward compatibility)
    subaccountId: v.optional(v.string()), // Flutterwave subaccount ID
    bankCode: v.string(),
    accountNumber: v.string(),
    bankName: v.string(),
    accountName: v.string(),
    isDefault: v.boolean(),
    isVerified: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    paymentProvider: v.optional(v.union(v.literal("paystack"), v.literal("flutterwave"))), // Which provider this account uses
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
    paymentProvider: v.optional(v.union(v.literal("paystack"), v.literal("flutterwave"))),
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
    physiotherapistId: v.id("users"),
    patientId: v.id("users"),
    appointmentId: v.optional(v.id("appointments")), // Created after payment

    // Session details
    sessionType: v.string(), // "initial_consult", "follow_up", "package"
    sessionDate: v.optional(v.number()), // Scheduled date
    sessionDuration: v.number(), // minutes
    isOnline: v.boolean(),

    // Pricing
    serviceAmount: v.number(), // Amount for service (kobo)
    platformFee: v.number(), // 20% platform fee (kobo)
    paystackFee: v.number(), // 1.5% + 100 (kobo)
    totalAmount: v.number(), // Total charged to patient (kobo)
    physiotherapistEarnings: v.number(), // Amount physio receives (kobo)

    // Payment
    paymentStatus: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("refunded")
    ),
    paymentReference: v.optional(v.string()),
    paidAt: v.optional(v.number()),

    // Booking status
    bookingStatus: v.union(
      v.literal("pending_payment"),
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

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_physiotherapist", ["physiotherapistId"])
    .index("by_patient", ["patientId"])
    .index("by_payment_reference", ["paymentReference"])
    .index("by_booking_status", ["bookingStatus"])
    .index("by_payment_status", ["paymentStatus"])
    .index("by_session_date", ["sessionDate"]),

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
  // Tracks each AwaDoc-initiated consultation from discovery to completion
  awadocSessions: defineTable({
    // AwaDoc identifiers
    queryId: v.optional(v.string()),        // From availability.query
    requestId: v.optional(v.string()),      // From consultation.request
    consultationId: v.string(),             // Our generated ID (e.g., "cns-xxx")
    eventId: v.optional(v.string()),        // AwaDoc event UUID

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

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    confirmedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_consultation_id", ["consultationId"])
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
});
