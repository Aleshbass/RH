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
  })
    .index("by_code", ["code"])
    .index("by_physiotherapist", ["physiotherapistId"])
    .index("by_patient_email", ["patientEmail"])
    .index("by_patient_user", ["patientUserId"]),

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
    .index("by_physiotherapist", ["physiotherapistId"])
    .index("by_clinic", ["clinicId"])
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
  })
    .index("by_patient_id_and_time", ["patientId", "startTime"])
    .index("by_physiotherapist_id_and_time", ["physiotherapistId", "startTime"])
    .index("by_clinic_id_and_time", ["clinicId", "startTime"]),

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
    .index("by_physiotherapist", ["physiotherapistId"])
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
    .index("by_physiotherapist", ["physiotherapistId"])
    .index("by_entry_date", ["entryDate"])
    .index("by_progress_type", ["progressType"]),

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
    totalAmount: v.float64(),
    paidAmount: v.optional(v.float64()), // Track partial payments
    currency: v.string(), // e.g., "NGN", "USD"
    status: v.union(v.literal("draft"), v.literal("sent"), v.literal("paid"), v.literal("overdue"), v.literal("void"), v.literal("partial_payment")),
    paymentMethod: v.optional(v.string()),
    paymentDate: v.optional(v.float64()),
    notes: v.optional(v.string()),
    relatedAppointmentIds: v.optional(v.array(v.id("appointments"))),
  })
    .index("by_patient_id", ["patientId"])
    .index("by_clinic_id", ["clinicId"])
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
    contentType: v.union(v.literal("text"), v.literal("image"), v.literal("file")),
    timestamp: v.number(),
    isReadByReceiver: v.boolean(),
    readAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
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
    dailyRoomName: v.optional(v.string()), // Daily.co room name
    dailyRoomUrl: v.optional(v.string()), // Daily.co room URL
    dailyRoomId: v.optional(v.string()), // Daily.co room ID
    title: v.optional(v.string()), // Call title/description
    
    // Participants and ownership
    initiatorId: v.id("users"), // User who created/initiated the call
    participants: v.array(v.id("users")), // All participants in the call
    patientId: v.optional(v.id("users")), // Primary patient (for appointment-based calls)
    physiotherapistId: v.optional(v.id("users")), // Primary physiotherapist (for appointment-based calls)
    clinicId: v.optional(v.id("clinics")), // Associated clinic
    
    // Scheduling and timing
    scheduledAt: v.optional(v.number()), // Scheduled start time (for planned calls)
    startTime: v.number(), // Actual start time
    endTime: v.optional(v.number()), // Actual end time
    duration: v.optional(v.number()), // Actual duration in seconds
    plannedDuration: v.optional(v.number()), // Planned duration in minutes
    
    // Call configuration
    platform: v.union(v.literal("internal"), v.literal("daily"), v.literal("google_meet"), v.literal("zoom")),
    meetingLink: v.optional(v.string()), // For external platforms
    platformSpecificData: v.optional(v.any()),
    
    // Call status and type
    status: v.union(
      v.literal("scheduled"),
      v.literal("active"),
      v.literal("ended"),
      v.literal("cancelled"),
      v.literal("missed")
    ),
    callType: v.union(
      v.literal("appointment"), // Scheduled appointment call
      v.literal("consultation"), // Ad-hoc consultation
      v.literal("emergency") // Emergency call
    ),
    
    // Call settings
    settings: v.optional(v.object({
      recordingEnabled: v.boolean(),
      chatEnabled: v.boolean(),
      maxParticipants: v.number(),
      waitingRoomEnabled: v.boolean(),
      screenShareEnabled: v.optional(v.boolean()),
      prejoinUiEnabled: v.optional(v.boolean()),
      ejectAtRoomExp: v.optional(v.boolean()),
      ejectAfterElapsed: v.optional(v.number()), // Auto-eject after X seconds
      language: v.optional(v.string()),
      geo: v.optional(v.string()), // Daily.co geo setting
    })),
    
    // Daily.co specific configuration
    dailyConfig: v.optional(v.object({
      roomExp: v.optional(v.number()), // Room expiration timestamp
      meetingTokens: v.optional(v.array(v.object({
        userId: v.id("users"),
        token: v.string(),
        expiresAt: v.number(),
        isOwner: v.boolean(),
      }))),
      roomProperties: v.optional(v.any()), // Store Daily.co room properties
    })),
    
    // Associated data
    appointmentId: v.optional(v.id("appointments")), // Associated appointment if any
    notes: v.optional(v.string()), // Pre-call notes
    callNotes: v.optional(v.string()), // Post-call notes
    
    // Metadata and tracking
    createdAt: v.number(),
    cancellationReason: v.optional(v.string()),
    cancelledBy: v.optional(v.id("users")),
    cancelledAt: v.optional(v.number()),
    
    // Technical metadata
    metadata: v.optional(v.object({
      quality: v.optional(v.string()), // Call quality metrics
      connectionIssues: v.optional(v.array(v.string())), // Any connection problems
      devices: v.optional(v.array(v.object({ // Device info for troubleshooting
        userId: v.id("users"),
        camera: v.optional(v.string()),
        microphone: v.optional(v.string()),
        browser: v.optional(v.string()),
      }))),
    })),
  })
    .index("by_room_id", ["roomId"])
    .index("by_daily_room_name", ["dailyRoomName"])
    .index("by_daily_room_id", ["dailyRoomId"])
    .index("by_initiator", ["initiatorId"])
    .index("by_patient_id_and_scheduled", ["patientId", "scheduledAt"])
    .index("by_physiotherapist_id_and_scheduled", ["physiotherapistId", "scheduledAt"])
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
  })
    .index("by_user_id", ["userId"])
    .index("by_clinic_id", ["clinicId"]),

  reports: defineTable({
    type: v.string(),
    timeframe: v.string(),
    entityId: v.id("users"),
    generatedAt: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    data: v.optional(v.any()),
  })
    .index("by_entity", ["entityId"])
    .index("by_status", ["status"])
    .index("by_type", ["type"]),

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
    .index("by_patient", ["patientId"])
    .index("by_physiotherapist", ["physiotherapistId"]),
});
