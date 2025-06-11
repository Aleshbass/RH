import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Users table: Core user information, linked to Clerk authentication
  users: defineTable({
    clerkId: v.string(), // Unique ID from Clerk
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()), // Renamed from profileImageUrl for consistency
    phoneNumber: v.optional(v.string()),

    role: v.optional(v.union( // Role can be null until onboarding is complete
      v.literal("physiotherapist"),
      v.literal("clinic_owner"),
      v.literal("patient"),
      v.literal("family_member"),
      v.literal("admin")
    )),
    onboarded: v.boolean(), // Flag to indicate if user has completed initial profile setup
    
    // Links to role-specific profiles
    physiotherapistProfileId: v.optional(v.id("physiotherapistProfiles")),
    patientProfileId: v.optional(v.id("patientProfiles")),
    clinicOwnerProfileId: v.optional(v.id("clinicOwnerProfiles")), // Assuming clinicOwnerProfiles might be added later or clinics table is primary link
    // familyMemberProfileId: v.optional(v.id("familyMemberProfiles")), // Add if/when this table is created

    // Timestamps
    // _creationTime is automatic
    lastLoginAt: v.optional(v.number()), // Can be updated via a mutation on login
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"]), // To query users by role (especially after onboarding)

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
    cpdPoints: v.optional(v.number()),
    yearsOfExperience: v.optional(v.number()),
    availabilitySchedule: v.optional(v.any()), // More complex availability rules
    languagesSpoken: v.optional(v.array(v.string())),
  })
    .index("by_user_id", ["userId"])
    .index("by_clinic_id", ["clinicId"]),

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
  })
    .index("by_user_id", ["userId"])
    .index("by_clinic_id", ["clinicId"]),

  // Patient Invitations: Manages invitation codes for patient onboarding
  patientInvitations: defineTable({
    code: v.string(), // Unique invitation code
    physiotherapistId: v.id("users"), // The physiotherapist who created the invitation
    clinicId: v.id("clinics"), // The clinic the physiotherapist belongs to
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
  })
    .index("by_code", ["code"])
    .index("by_physiotherapist", ["physiotherapistId"])
    .index("by_patient_email", ["patientEmail"])
    .index("by_patient_user", ["patientUserId"]),

  // Patient-Physiotherapist Relationships: Links patients to their physiotherapists
  patientPhysiotherapistRelationships: defineTable({
    patientId: v.id("users"), // The patient user ID
    physiotherapistId: v.id("users"), // The physiotherapist user ID
    clinicId: v.id("clinics"), // The clinic ID
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
    .index("by_physiotherapist", ["physiotherapistId"])
    .index("by_clinic", ["clinicId"])
    .index("by_patient_and_physiotherapist", ["patientId", "physiotherapistId"])
    .index("by_primary_physiotherapist", ["patientId", "isPrimaryPhysiotherapist"]),
    
  // Family Access Grants: Manages family member access to patient data
  // Documents uploaded by physiotherapists (licenses, certifications, etc.)
  // Notifications: System-wide notifications for all users
  notifications: defineTable({
    userId: v.id("users"), // The user who will receive the notification
    type: v.union(
      v.literal("invitation_created"),
      v.literal("onboarding_complete"),
      v.literal("invitation_reminder"),
      v.literal("account_approved"),
      v.literal("account_declined"),
      v.literal("appointment_scheduled"),
      v.literal("appointment_reminder"),
      v.literal("appointment_canceled"),
      v.literal("new_message"),
      v.literal("exercise_assigned"),
      v.literal("patient_progress_update"),
      v.literal("treatment_plan_updated")
    ),
    title: v.string(),
    message: v.string(),
    read: v.boolean(),
    createdAt: v.number(), // Timestamp when notification was created
    expiresAt: v.optional(v.number()), // Optional expiration timestamp
    data: v.optional(v.object({
      // Flexible structure to store notification-specific data
      entityId: v.optional(v.string()), // ID of the related entity (invitation, appointment, etc.)
      entityType: v.optional(v.string()), // Type of the related entity
      actionUrl: v.optional(v.string()), // URL to navigate to when notification is clicked
      metadata: v.optional(v.any()), // Any additional metadata
    })),
    emailSent: v.boolean(), // Whether an email notification was sent
  })
    .index("by_user_id", ["userId"])
    .index("by_user_and_read", ["userId", "read"])
    .index("by_user_and_created", ["userId", "createdAt"])
    .index("by_type", ["type"]),
    
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
    clinicId: v.id("clinics"),
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
  })
    .index("by_patient_id_and_time", ["patientId", "startTime"])
    .index("by_physiotherapist_id_and_time", ["physiotherapistId", "startTime"])
    .index("by_clinic_id_and_time", ["clinicId", "startTime"]),

  // Session Logs (Treatment Logs)
  sessionLogs: defineTable({
    appointmentId: v.id("appointments"),
    patientId: v.id("users"),
    physiotherapistId: v.id("users"),
    clinicId: v.id("clinics"),
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
    bodyParts: v.optional(v.array(v.string())),
    conditionsTargeted: v.optional(v.array(v.string())),
    equipmentNeeded: v.optional(v.array(v.string())),
    instructions: v.string(), // Default language instructions
    media: v.optional(v.array(v.object({ type: v.union(v.literal("image"), v.literal("video")), url: v.string() }))),
    difficultyLevel: v.optional(v.union(v.literal("beginner"), v.literal("intermediate"), v.literal("advanced"))),
    createdBy: v.optional(v.id("users")), // User ID of creator (admin or physio)
    translations: v.optional(v.object({ // Key-value for language code and translated instructions
      // e.g., "yo": "Itọsọna ni Yoruba"
    })),
  })
    .index("by_name", ["name"]),

  // Treatment Plans for patients
  treatmentPlans: defineTable({
    patientId: v.id("users"),
    physiotherapistId: v.id("users"),
    clinicId: v.id("clinics"),
    title: v.string(),
    description: v.optional(v.string()),
    startDate: v.number(), // Timestamp
    endDate: v.optional(v.number()), // Timestamp, if applicable
    goals: v.array(v.string()),
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("paused"), v.literal("completed"), v.literal("archived")),
  })
    .index("by_patient_id", ["patientId"])
    .index("by_physiotherapist_id", ["physiotherapistId"]),

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
    clinicId: v.id("clinics"),
    invoiceNumber: v.string(), // Should be unique per clinic
    issueDate: v.number(), // Timestamp
    dueDate: v.number(), // Timestamp
    items: v.array(v.object({
      description: v.string(),
      quantity: v.number(),
      unitPrice: v.number(), // Store in smallest currency unit (e.g., kobo, cents)
      totalPrice: v.number(),
    })),
    subtotalAmount: v.number(),
    taxAmount: v.optional(v.number()),
    discountAmount: v.optional(v.number()),
    totalAmount: v.number(),
    currency: v.string(), // e.g., "NGN", "USD"
    status: v.union(v.literal("draft"), v.literal("sent"), v.literal("paid"), v.literal("overdue"), v.literal("void"), v.literal("partial_payment")),
    paymentMethod: v.optional(v.string()),
    paymentDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    relatedAppointmentIds: v.optional(v.array(v.id("appointments"))),
  })
    .index("by_patient_id", ["patientId"])
    .index("by_clinic_id_and_status", ["clinicId", "status"])
    .index("by_clinic_id_and_invoice_number", ["clinicId", "invoiceNumber"]),

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

  // Notifications implementation has been moved above

  // Messages for Patient-PT communication
  messages: defineTable({
    conversationId: v.string(), // Generated ID for a conversation (e.g., sorted user1_id + user2_id)
    senderId: v.id("users"),
    receiverId: v.id("users"),
    content: v.string(),
    contentType: v.union(v.literal("text"), v.literal("image"), v.literal("file")), // Support for different content types
    fileUrl: v.optional(v.string()), // If contentType is image or file
    isReadByReceiver: v.boolean(),
    readAt: v.optional(v.number()),
  })
    .index("by_conversation_id", ["conversationId"])
    // Note: _creationTime is automatically added to all indexes by Convex
    .index("by_receiver_id_and_is_read_by_receiver", ["receiverId", "isReadByReceiver"]),

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
});
