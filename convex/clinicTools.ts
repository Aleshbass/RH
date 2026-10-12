import { v } from "convex/values";
import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { getAuthenticatedUser, ensureIsClinicOwner } from "./auth";

/**
 * Helper to get the clinic belonging to the authenticated clinic owner
 */
export async function getOwnerClinic(ctx: QueryCtx): Promise<{ user: Doc<"users">; clinic: Doc<"clinics"> }> {
  const user = await getAuthenticatedUser(ctx);
  await ensureIsClinicOwner(ctx, user);

  const clinic = await ctx.db
    .query("clinics")
    .withIndex("by_owner_id", (q: any) => q.eq("ownerId", user._id))
    .first();

  if (!clinic) {
    throw new Error("No clinic found for this account");
  }

  return { user, clinic };
}

/**
 * Like getOwnerClinic, but returns null for genuine preview viewers (signed out,
 * not a clinic owner, or onboarding not finished) so sandbox data can be shown.
 * A fully onboarded owner whose lookup fails gets the real error, never fake data.
 */
export async function getOwnerClinicOrPreview(ctx: QueryCtx) {
  try {
    return await getOwnerClinic(ctx);
  } catch (err) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();
    if (user && user.role === "clinic_owner" && user.onboarded) {
      throw err;
    }
    return null;
  }
}

/**
 * User IDs of everyone who can be assigned clinical work in this clinic (owner + clinic physios).
 */
export async function getClinicStaffUserIds(ctx: QueryCtx, clinic: Doc<"clinics">): Promise<Set<Id<"users">>> {
  const profiles = await ctx.db
    .query("physiotherapistProfiles")
    .withIndex("by_clinic_id", (q: any) => q.eq("clinicId", clinic._id))
    .collect();
  return new Set<Id<"users">>([clinic.ownerId, ...profiles.map((p) => p.userId)]);
}

export async function assertStaffInClinic(ctx: QueryCtx, clinic: Doc<"clinics">, userId: Id<"users">) {
  const staffIds = await getClinicStaffUserIds(ctx, clinic);
  if (!staffIds.has(userId)) {
    throw new Error("Selected clinician is not a member of your clinic");
  }
  const member = await ctx.db.get(userId);
  if (member && member._id !== clinic.ownerId && member.status && member.status !== "active") {
    throw new Error("This clinician is suspended. Reactivate them on the Team page first.");
  }
}

/**
 * True when the patient belongs to this clinic: linked directly, through their profile,
 * or through an active care relationship with one of the clinic's clinicians.
 */
async function isPatientInClinic(ctx: QueryCtx, clinic: Doc<"clinics">, patientId: Id<"users">) {
  const patient = await ctx.db.get(patientId);
  if (!patient) return false;
  if (patient.clinicId === clinic._id) return true;

  const profile = await ctx.db
    .query("patientProfiles")
    .withIndex("by_user_id", (q: any) => q.eq("userId", patientId))
    .first();
  if (profile?.clinicId === clinic._id) return true;

  const rels = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_patient", (q: any) => q.eq("patientId", patientId))
    .collect();
  if (rels.some((r) => r.clinicId === clinic._id)) return true;

  const staffIds = await getClinicStaffUserIds(ctx, clinic);
  return rels.some((r) => r.status === "active" && staffIds.has(r.physiotherapistId));
}

export async function assertPatientInClinic(ctx: QueryCtx, clinic: Doc<"clinics">, patientId: Id<"users">) {
  if (!(await isPatientInClinic(ctx, clinic, patientId))) {
    throw new Error("Patient not found in your clinic");
  }
}

async function getClinicAppointmentOrThrow(
  ctx: QueryCtx,
  clinic: Doc<"clinics">,
  appointmentId: Id<"appointments">
) {
  const appointment = await ctx.db.get(appointmentId);
  if (!appointment) {
    throw new Error("Appointment not found");
  }
  if (appointment.clinicId !== clinic._id) {
    const staffIds = await getClinicStaffUserIds(ctx, clinic);
    if (!staffIds.has(appointment.physiotherapistId)) {
      throw new Error("Appointment not found");
    }
  }
  return appointment;
}

/** Patients with an active care relationship at this clinic (linked directly or via a clinician). */
export async function getActiveClinicPatientIds(ctx: QueryCtx, clinic: Doc<"clinics">): Promise<Id<"users">[]> {
  const staffIds = await getClinicStaffUserIds(ctx, clinic);
  const rels = await Promise.all([
    ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_clinic", (q: any) => q.eq("clinicId", clinic._id))
      .collect(),
    ...Array.from(staffIds).map((id) =>
      ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_physiotherapist", (q: any) => q.eq("physiotherapistId", id))
        .collect()
    ),
  ]);
  const ids = new Set<Id<"users">>();
  for (const rel of rels.flat()) {
    if (rel.status === "active") ids.add(rel.patientId);
  }
  return Array.from(ids);
}

/**
 * Session logs must reference an appointment. Attach the note to today's visit when there is one;
 * otherwise create a record-only entry that never appears on the schedule.
 */
async function anchorAppointmentForRecord(
  ctx: MutationCtx,
  clinic: Doc<"clinics">,
  patientId: Id<"users">,
  clinicianId: Id<"users">,
  label: string
): Promise<Id<"appointments">> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todays = await ctx.db
    .query("appointments")
    .withIndex("by_patient_id_and_time", (q: any) =>
      q.eq("patientId", patientId).gte("startTime", startOfDay).lt("startTime", startOfDay + 24 * 60 * 60 * 1000)
    )
    .collect();
  const visit = todays.find(
    (apt) =>
      apt.clinicId === clinic._id &&
      !apt.isRecordOnly &&
      apt.status !== "cancelled_by_patient" &&
      apt.status !== "cancelled_by_therapist"
  );
  if (visit) return visit._id;

  return await ctx.db.insert("appointments", {
    clinicId: clinic._id,
    patientId,
    physiotherapistId: clinicianId,
    startTime: Date.now(),
    endTime: Date.now(),
    status: "completed",
    appointmentType: "in-person",
    serviceType: label,
    isRecordOnly: true,
  });
}

/** Discharge or pause a patient's care at this clinic: ends relationships and active programmes. */
async function closeCareEpisode(
  ctx: MutationCtx,
  clinic: Doc<"clinics">,
  patientId: Id<"users">,
  reason: "discharged" | "paused",
  actorId: Id<"users">
) {
  const now = Date.now();
  if (reason === "discharged") {
    await advanceClinicReferral(ctx, clinic, patientId, "completed", actorId);
  }
  const staffIds = await getClinicStaffUserIds(ctx, clinic);
  const rels = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_patient", (q: any) => q.eq("patientId", patientId))
    .collect();
  for (const rel of rels) {
    if (rel.status === "active" && (rel.clinicId === clinic._id || staffIds.has(rel.physiotherapistId))) {
      await ctx.db.patch(rel._id, { status: "inactive", endDate: now, notes: reason === "discharged" ? "Discharged" : "Care paused" });
    }
  }
  const plans = await ctx.db
    .query("treatmentPlans")
    .withIndex("by_patient_and_status", (q: any) => q.eq("patientId", patientId).eq("status", "active"))
    .collect();
  for (const plan of plans) {
    if (plan.clinicId === clinic._id) {
      await ctx.db.patch(plan._id, reason === "discharged"
        ? { status: "completed", completedAt: now, updatedAt: now }
        : { status: "on_hold", updatedAt: now });
    }
  }
}

// A Rehabify referral moves forward with the clinic's work, never backwards.
const REFERRAL_PROGRESS = ["booked", "attended", "treatment_active", "completed"] as const;
type ReferralProgress = (typeof REFERRAL_PROGRESS)[number];

async function advanceClinicReferral(
  ctx: MutationCtx,
  clinic: Doc<"clinics">,
  patientId: Id<"users">,
  next: ReferralProgress,
  actorId: Id<"users">
) {
  const referrals = await ctx.db
    .query("inboundReferrals")
    .withIndex("by_patient", (q: any) => q.eq("patientId", patientId))
    .collect();
  const now = Date.now();
  for (const referral of referrals) {
    if (referral.assignedClinicId !== clinic._id) continue;
    const current = REFERRAL_PROGRESS.indexOf(referral.status as ReferralProgress);
    if (current === -1 || current >= REFERRAL_PROGRESS.indexOf(next)) continue;
    await ctx.db.patch(referral._id, { status: next, updatedAt: now });
    await ctx.db.insert("referralEvents", {
      referralId: referral._id,
      eventName: `clinic.${next}`,
      occurredAt: now,
      actorType: "clinic_owner",
      actorId: String(actorId),
      metadata: { clinicId: clinic._id, previousStatus: referral.status, newStatus: next },
    });
  }
}

/** Stops a clinician being double-booked. */
async function assertClinicianFree(
  ctx: QueryCtx,
  clinicianId: Id<"users">,
  startTime: number,
  endTime: number,
  ignoreAppointmentId?: Id<"appointments">
) {
  const DAY = 24 * 60 * 60 * 1000;
  const nearby = await ctx.db
    .query("appointments")
    .withIndex("by_physiotherapist_id_and_time", (q: any) =>
      q.eq("physiotherapistId", clinicianId).gte("startTime", startTime - DAY).lt("startTime", endTime)
    )
    .collect();
  const clash = nearby.find(
    (apt) =>
      apt._id !== ignoreAppointmentId &&
      !apt.isRecordOnly &&
      (apt.status === "scheduled" || apt.status === "confirmed") &&
      apt.startTime < endTime &&
      apt.endTime > startTime
  );
  if (clash) {
    const at = new Date(clash.startTime).toLocaleTimeString("en-NG", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Lagos",
    });
    throw new Error(`This clinician already has an appointment at ${at}. Pick another time or clinician.`);
  }
}

/** Active while in care here; otherwise how the last episode ended. */
async function getCareStatus(
  ctx: QueryCtx,
  clinic: Doc<"clinics">,
  patientId: Id<"users">
): Promise<"active" | "paused" | "discharged"> {
  const staffIds = await getClinicStaffUserIds(ctx, clinic);
  const rels = (
    await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient", (q: any) => q.eq("patientId", patientId))
      .collect()
  ).filter((rel) => rel.clinicId === clinic._id || staffIds.has(rel.physiotherapistId));
  if (rels.some((rel) => rel.status === "active")) return "active";
  const latest = rels.sort((a, b) => (b.endDate ?? 0) - (a.endDate ?? 0))[0];
  return latest?.notes === "Care paused" ? "paused" : "discharged";
}

export async function getApprovalStatus(ctx: QueryCtx, userId: Id<"users">) {
  const approval = await ctx.db
    .query("accountApprovalStatus")
    .withIndex("by_user_id", (q: any) => q.eq("userId", userId))
    .unique();
  return approval?.status ?? null;
}

/**
 * Helper to ensure a clinic owner has completed onboarding and is approved by admin.
 * If skipped or unapproved, mutations are blocked so preview mode remains strictly read-only.
 */
export async function ensureClinicOwnerApproved(ctx: any, user: any) {
  // A skip always leaves onboarded=false, so once onboarded is true a stale skip flag is ignored
  if (!user.onboarded) {
    throw new Error("Onboarding incomplete. Please complete clinic registration to perform this action.");
  }
  const approval = await ctx.db
    .query("accountApprovalStatus")
    .withIndex("by_user_id", (q: any) => q.eq("userId", user._id))
    .unique();

  if (!approval || approval.status !== "approved") {
    throw new Error("Clinic verification is pending admin approval. Live clinical operations are disabled in preview mode.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PATIENT RECORDS / EHR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add a direct clinic patient into EHR
 */
export const addClinicPatient = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    phoneNumber: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"), v.literal("prefer_not_to_say"))),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    medicalHistorySummary: v.optional(v.string()),
    assignedClinicianId: v.optional(v.id("users")),
    initialDiagnosis: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, clinic } = await getOwnerClinic(ctx);
    await ensureClinicOwnerApproved(ctx, user);

    if (args.assignedClinicianId) {
      await assertStaffInClinic(ctx, clinic, args.assignedClinicianId);
    }

    // Check if a user with this email already exists
    let patientUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q: any) => q.eq("email", args.email.toLowerCase().trim()))
      .first();

    if (patientUser && patientUser.role && patientUser.role !== "patient") {
      throw new Error("This email belongs to a non-patient account and cannot be enrolled as a patient.");
    }

    if (!patientUser) {
      const generatedClerkId = `clinic_patient_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const patientUserId = await ctx.db.insert("users", {
        clerkId: generatedClerkId,
        email: args.email.toLowerCase().trim(),
        firstName: args.firstName.trim(),
        lastName: args.lastName.trim(),
        phoneNumber: args.phoneNumber,
        role: "patient",
        onboarded: true,
        clinicId: clinic._id,
        status: "active",
        joinedAt: Date.now(),
      });
      patientUser = await ctx.db.get(patientUserId);
    }

    if (!patientUser) {
      throw new Error("Failed to create or locate patient user account");
    }

    // Upsert Patient Profile
    const profile = await ctx.db
      .query("patientProfiles")
      .withIndex("by_user_id", (q: any) => q.eq("userId", patientUser._id))
      .first();

    if (!profile) {
      const profileId = await ctx.db.insert("patientProfiles", {
        userId: patientUser._id,
        clinicId: clinic._id,
        dateOfBirth: args.dateOfBirth,
        gender: args.gender || "prefer_not_to_say",
        address: args.address,
        city: args.city || clinic.city,
        medicalHistorySummary: args.medicalHistorySummary || args.initialDiagnosis,
      });
      await ctx.db.patch(patientUser._id, { patientProfileId: profileId });
    } else {
      // Existing patients may already have a record elsewhere: only fill in missing details
      await ctx.db.patch(profile._id, {
        dateOfBirth: profile.dateOfBirth || args.dateOfBirth,
        gender: profile.gender || args.gender,
        address: profile.address || args.address,
        city: profile.city || args.city,
        medicalHistorySummary: profile.medicalHistorySummary || args.medicalHistorySummary || args.initialDiagnosis,
      });
    }

    // Assign to clinician or clinic owner
    const targetClinicianId = args.assignedClinicianId || user._id;
    const patientId = patientUser._id;

    // Check existing relationship
    const existingRel = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q: any) =>
        q.eq("patientId", patientId).eq("physiotherapistId", targetClinicianId)
      )
      .first();

    if (!existingRel) {
      await ctx.db.insert("patientPhysiotherapistRelationships", {
        patientId,
        physiotherapistId: targetClinicianId,
        clinicId: clinic._id,
        isPrimaryPhysiotherapist: true,
        startDate: Date.now(),
        status: "active",
        source: "clinic_direct",
      });
    } else if (existingRel.status !== "active" || existingRel.clinicId !== clinic._id) {
      await ctx.db.patch(existingRel._id, { status: "active", clinicId: clinic._id });
    }

    return {
      success: true,
      patientId: patientUser._id,
      message: `Patient ${args.firstName} ${args.lastName} enrolled successfully.`,
    };
  },
});

const NOTE_TYPE_LABELS: Record<string, string> = {
  initial_assessment: "Initial assessment",
  treatment_note: "Treatment note",
  follow_up: "Follow-up note",
  discharge_summary: "Discharge summary",
  follow_up_outreach: "Check-in call",
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  referralLetter: "Referral letter",
  medicalRecord: "Medical record",
  insuranceCard: "Insurance card",
  otherDocument: "Document",
};

/**
 * Get comprehensive EHR patient record with full chronological timeline
 */
export const getClinicPatientFullRecord = query({
  args: {
    patientId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { clinic } = await getOwnerClinic(ctx);

    const patient = await ctx.db.get(args.patientId);
    if (!patient) {
      return null;
    }
    await assertPatientInClinic(ctx, clinic, args.patientId);

    // Only surface records written by this clinic, not the patient's history at other providers
    const staffIds = await getClinicStaffUserIds(ctx, clinic);
    const belongsToClinic = (rec: { clinicId?: Id<"clinics">; physiotherapistId: Id<"users"> }) =>
      rec.clinicId === clinic._id || (!rec.clinicId && staffIds.has(rec.physiotherapistId));

    const profile = await ctx.db
      .query("patientProfiles")
      .withIndex("by_user_id", (q: any) => q.eq("userId", args.patientId))
      .first();

    // This clinic's active care relationship (not one at another provider)
    const relationship = (
      await ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_patient", (q: any) => q.eq("patientId", args.patientId))
        .collect()
    ).find(
      (rel) => rel.status === "active" && (rel.clinicId === clinic._id || staffIds.has(rel.physiotherapistId))
    );
    const careStatus = await getCareStatus(ctx, clinic, args.patientId);

    let primaryClinician = null;
    if (relationship?.physiotherapistId) {
      const physio = await ctx.db.get(relationship.physiotherapistId);
      if (physio) {
        primaryClinician = {
          _id: physio._id,
          firstName: physio.firstName,
          lastName: physio.lastName,
          email: physio.email,
        };
      }
    }

    // Session Logs (Clinical Consultation & Treatment Notes)
    const sessionLogs = (
      await ctx.db
        .query("sessionLogs")
        .withIndex("by_patient_id_and_date", (q: any) => q.eq("patientId", args.patientId))
        .order("desc")
        .collect()
    ).filter(belongsToClinic);

    // Enriched Session Logs with Clinician Name
    const enrichedSessionLogs = await Promise.all(
      sessionLogs.map(async (log) => {
        let author = null;
        if (log.physiotherapistId) {
          const authUser = await ctx.db.get(log.physiotherapistId);
          if (authUser) {
            author = `${authUser.firstName || ''} ${authUser.lastName || ''}`.trim();
          }
        }
        return {
          ...log,
          noteTypeLabel: NOTE_TYPE_LABELS[log.noteType ?? "treatment_note"],
          clinicianName: author || "Clinician",
        };
      })
    );

    // Patient Documents
    let documents: any[] = [];
    if (profile?._id) {
      const rawDocuments = await ctx.db
        .query("patientDocuments")
        .withIndex("by_patient_profile_id", (q: any) => q.eq("patientProfileId", profile._id))
        .collect();
      documents = await Promise.all(
        rawDocuments.map(async (doc: any) => ({
          ...doc,
          downloadUrl: (await ctx.storage.getUrl(doc.storageId)) || "",
        }))
      );
    }

    // Treatment Plans
    const treatmentPlans = (
      await ctx.db
        .query("treatmentPlans")
        .withIndex("by_patient", (q: any) => q.eq("patientId", args.patientId))
        .order("desc")
        .collect()
    ).filter(belongsToClinic);

    // Past & Upcoming Appointments
    const appointments = (
      await ctx.db
        .query("appointments")
        .withIndex("by_patient_id_and_time", (q: any) => q.eq("patientId", args.patientId))
        .order("desc")
        .take(50)
    )
      .filter((apt) => belongsToClinic(apt) && !apt.isRecordOnly)
      .slice(0, 20);

    // One chronological timeline of everything that happened at this clinic
    const timeline: any[] = [];

    timeline.push({
      id: `reg-${patient._id}`,
      date: patient._creationTime,
      type: "registration",
      title: "Added to clinic",
      description: profile?.referralSource === "rehabify_referral" ? "Referred by Rehabify" : "Registered by the clinic",
      badge: "Intake",
    });

    for (const log of sessionLogs) {
      timeline.push({
        id: `note-${log._id}`,
        date: log.sessionDate || log._creationTime,
        type: "clinical_note",
        title: NOTE_TYPE_LABELS[log.noteType ?? "treatment_note"],
        description: log.treatmentAdministered || log.objectiveAssessment || log.subjectiveAssessment || "",
        diagnosis: log.diagnosis,
        nextPlan: log.planForNextSession,
        badge: "Note",
      });
    }

    const appointmentStatusLabels: Record<string, string> = {
      scheduled: "Booked",
      confirmed: "Confirmed",
      completed: "Attended",
      cancelled_by_patient: "Cancelled by patient",
      cancelled_by_therapist: "Cancelled",
      no_show: "No-show",
    };
    for (const apt of appointments) {
      timeline.push({
        id: `apt-${apt._id}`,
        date: apt.startTime,
        type: "appointment",
        title: apt.appointmentType === "telehealth" ? "Video visit" : "Clinic visit",
        description: apt.serviceType,
        badge: appointmentStatusLabels[apt.status] ?? apt.status,
      });
    }

    for (const plan of treatmentPlans) {
      timeline.push({
        id: `plan-${plan._id}`,
        date: plan.startDate || plan._creationTime,
        type: "treatment_plan",
        title: `Home programme: ${plan.title}`,
        description: `${plan.phases?.[0]?.exercises?.length ?? 0} exercises`,
        badge: plan.status === "on_hold" ? "Paused" : plan.status.charAt(0).toUpperCase() + plan.status.slice(1),
      });
    }

    for (const doc of documents) {
      timeline.push({
        id: `doc-${doc._id}`,
        date: doc.uploadedAt || doc._creationTime,
        type: "document",
        title: doc.fileName,
        description: `${DOCUMENT_TYPE_LABELS[doc.documentType] ?? "Document"} · ${(doc.fileSize / 1024).toFixed(0)} KB`,
        badge: "File",
      });
    }

    // Sort timeline descending
    timeline.sort((a, b) => b.date - a.date);

    return {
      patient: {
        _id: patient._id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        phoneNumber: patient.phoneNumber,
        imageUrl: patient.imageUrl,
        _creationTime: patient._creationTime,
      },
      profile: profile || null,
      primaryClinician,
      careStatus,
      nextCheckInAt: relationship?.nextCheckInAt ?? null,
      sessionLogs: enrichedSessionLogs,
      documents,
      treatmentPlans,
      appointments,
      timeline,
    };
  },
});

/**
 * Attach document to patient EHR record
 */
export const attachPatientDocument = mutation({
  args: {
    patientId: v.id("users"),
    fileName: v.string(),
    fileSize: v.number(),
    contentType: v.string(),
    documentType: v.union(
      v.literal("referralLetter"),
      v.literal("medicalRecord"),
      v.literal("insuranceCard"),
      v.literal("otherDocument")
    ),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const { user, clinic } = await getOwnerClinic(ctx);
    await ensureClinicOwnerApproved(ctx, user);
    await assertPatientInClinic(ctx, clinic, args.patientId);

    let profile = await ctx.db
      .query("patientProfiles")
      .withIndex("by_user_id", (q: any) => q.eq("userId", args.patientId))
      .first();

    if (!profile) {
      const profileId = await ctx.db.insert("patientProfiles", {
        userId: args.patientId,
        clinicId: clinic._id,
      });
      profile = await ctx.db.get(profileId);
    }

    if (!profile) {
      throw new Error("Unable to locate patient profile");
    }

    const docId = await ctx.db.insert("patientDocuments", {
      patientProfileId: profile._id,
      fileName: args.fileName,
      fileSize: args.fileSize,
      contentType: args.contentType,
      documentType: args.documentType,
      storageId: args.storageId,
      uploadedAt: Date.now(),
      sharedWithPhysiotherapist: true,
    });

    return { success: true, docId };
  },
});

/**
 * Edit a patient's demographics, contact details and history.
 * Email is not editable here: it is the patient's login.
 */
export const updateClinicPatientDetails = mutation({
  args: {
    patientId: v.id("users"),
    firstName: v.string(),
    lastName: v.string(),
    phoneNumber: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"), v.literal("prefer_not_to_say"))),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    medicalHistorySummary: v.optional(v.string()),
    emergencyContact: v.optional(
      v.object({ name: v.string(), relationship: v.string(), phone: v.string() })
    ),
  },
  handler: async (ctx, args) => {
    const { user, clinic } = await getOwnerClinic(ctx);
    await ensureClinicOwnerApproved(ctx, user);
    await assertPatientInClinic(ctx, clinic, args.patientId);

    const firstName = args.firstName.trim();
    const lastName = args.lastName.trim();
    if (!firstName || !lastName) {
      throw new Error("First and last name are required");
    }

    await ctx.db.patch(args.patientId, {
      firstName,
      lastName,
      phoneNumber: args.phoneNumber?.trim() || undefined,
    });

    const profileFields = {
      dateOfBirth: args.dateOfBirth || undefined,
      gender: args.gender,
      address: args.address?.trim() || undefined,
      city: args.city?.trim() || undefined,
      medicalHistorySummary: args.medicalHistorySummary?.trim() || undefined,
      emergencyContact:
        args.emergencyContact && args.emergencyContact.name.trim() && args.emergencyContact.phone.trim()
          ? args.emergencyContact
          : undefined,
    };
    const profile = await ctx.db
      .query("patientProfiles")
      .withIndex("by_user_id", (q: any) => q.eq("userId", args.patientId))
      .first();
    if (profile) {
      await ctx.db.patch(profile._id, profileFields);
    } else {
      const profileId = await ctx.db.insert("patientProfiles", {
        userId: args.patientId,
        clinicId: clinic._id,
        ...profileFields,
      });
      await ctx.db.patch(args.patientId, { patientProfileId: profileId });
    }

    return { success: true };
  },
});

/**
 * Bring a discharged or paused patient back into active care with a clinician.
 */
export const reopenPatientCare = mutation({
  args: {
    patientId: v.id("users"),
    clinicianId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const { user, clinic } = await getOwnerClinic(ctx);
    await ensureClinicOwnerApproved(ctx, user);
    await assertPatientInClinic(ctx, clinic, args.patientId);

    const clinicianId = args.clinicianId ?? user._id;
    if (args.clinicianId) {
      await assertStaffInClinic(ctx, clinic, args.clinicianId);
    }
    if ((await getCareStatus(ctx, clinic, args.patientId)) === "active") {
      throw new Error("This patient is already in active care");
    }

    const existing = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q: any) =>
        q.eq("patientId", args.patientId).eq("physiotherapistId", clinicianId)
      )
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "active",
        clinicId: clinic._id,
        startDate: now,
        endDate: undefined,
        notes: undefined,
        nextCheckInAt: undefined,
      });
    } else {
      // Keep the patient's original source (e.g. a Rehabify referral)
      const previous = (
        await ctx.db
          .query("patientPhysiotherapistRelationships")
          .withIndex("by_patient", (q: any) => q.eq("patientId", args.patientId))
          .collect()
      ).find((rel) => rel.clinicId === clinic._id);
      await ctx.db.insert("patientPhysiotherapistRelationships", {
        patientId: args.patientId,
        physiotherapistId: clinicianId,
        clinicId: clinic._id,
        isPrimaryPhysiotherapist: true,
        startDate: now,
        status: "active",
        source: previous?.source ?? "clinic_direct",
      });
    }

    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. APPOINTMENTS & SCHEDULING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Book appointment directly on clinic schedule
 */
export const bookClinicAppointment = mutation({
  args: {
    patientId: v.id("users"),
    physiotherapistId: v.id("users"),
    startTime: v.number(),
    endTime: v.number(),
    appointmentType: v.union(v.literal("in-person"), v.literal("telehealth")),
    notes: v.optional(v.string()),
    serviceType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, clinic } = await getOwnerClinic(ctx);
    await ensureClinicOwnerApproved(ctx, user);
    await assertPatientInClinic(ctx, clinic, args.patientId);
    await assertStaffInClinic(ctx, clinic, args.physiotherapistId);

    if (args.endTime <= args.startTime) {
      throw new Error("Appointment end time must be after the start time");
    }
    await assertClinicianFree(ctx, args.physiotherapistId, args.startTime, args.endTime);

    const aptId = await ctx.db.insert("appointments", {
      clinicId: clinic._id,
      patientId: args.patientId,
      physiotherapistId: args.physiotherapistId,
      startTime: args.startTime,
      endTime: args.endTime,
      status: "scheduled",
      appointmentType: args.appointmentType,
      isOnline: args.appointmentType === "telehealth",
      serviceType: args.serviceType || (args.appointmentType === "telehealth" ? "Telehealth Consultation" : "Clinic Consultation"),
      notesForTherapist: args.notes,
    });

    return { success: true, appointmentId: aptId };
  },
});

/**
 * Reschedule an existing appointment
 */
export const rescheduleClinicAppointment = mutation({
  args: {
    appointmentId: v.id("appointments"),
    startTime: v.number(),
    endTime: v.number(),
    reason: v.optional(v.string()),
    // Hand the visit to another clinician at the same time
    physiotherapistId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const { user, clinic } = await getOwnerClinic(ctx);
    await ensureClinicOwnerApproved(ctx, user);

    const appointment = await getClinicAppointmentOrThrow(ctx, clinic, args.appointmentId);

    if (args.endTime <= args.startTime) {
      throw new Error("Appointment end time must be after the start time");
    }
    const clinicianId = args.physiotherapistId ?? appointment.physiotherapistId;
    if (args.physiotherapistId) {
      await assertStaffInClinic(ctx, clinic, args.physiotherapistId);
    }
    await assertClinicianFree(ctx, clinicianId, args.startTime, args.endTime, args.appointmentId);

    await ctx.db.patch(args.appointmentId, {
      startTime: args.startTime,
      endTime: args.endTime,
      physiotherapistId: clinicianId,
      status: "scheduled",
      notesForTherapist: args.reason
        ? `${appointment.notesForTherapist ? appointment.notesForTherapist + "\n" : ""}Rescheduled: ${args.reason}`
        : appointment.notesForTherapist,
    });

    return { success: true };
  },
});

/**
 * Update appointment status (scheduled, completed, cancelled, no-show)
 */
export const updateAppointmentStatus = mutation({
  args: {
    appointmentId: v.id("appointments"),
    status: v.union(
      v.literal("scheduled"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("no_show")
    ),
    cancellationReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, clinic } = await getOwnerClinic(ctx);
    await ensureClinicOwnerApproved(ctx, user);

    const appointment = await getClinicAppointmentOrThrow(ctx, clinic, args.appointmentId);

    // A clinic-initiated cancellation is stored as cancelled_by_therapist
    const status = args.status === "cancelled" ? "cancelled_by_therapist" : args.status;

    await ctx.db.patch(args.appointmentId, {
      status,
      cancellationReason: status === "cancelled_by_therapist" ? args.cancellationReason : undefined,
    });

    if (status === "completed") {
      await advanceClinicReferral(ctx, clinic, appointment.patientId, "attended", user._id);
    }

    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. CLINICAL DOCUMENTATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record clinical consultation, treatment note, or assessment
 */
export const saveClinicalNote = mutation({
  args: {
    patientId: v.id("users"),
    physiotherapistId: v.optional(v.id("users")),
    noteType: v.union(
      v.literal("initial_assessment"),
      v.literal("treatment_note"),
      v.literal("follow_up"),
      v.literal("discharge_summary")
    ),
    subjectiveAssessment: v.optional(v.string()),
    objectiveAssessment: v.optional(v.string()),
    treatmentAdministered: v.optional(v.string()),
    planForNextSession: v.optional(v.string()),
    goalsSummary: v.optional(v.string()),
    diagnosis: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, clinic } = await getOwnerClinic(ctx);
    await ensureClinicOwnerApproved(ctx, user);
    await assertPatientInClinic(ctx, clinic, args.patientId);

    const clinicianId = args.physiotherapistId || user._id;
    if (args.physiotherapistId) {
      await assertStaffInClinic(ctx, clinic, args.physiotherapistId);
    }

    const hasContent = [
      args.subjectiveAssessment, args.objectiveAssessment, args.treatmentAdministered,
      args.planForNextSession, args.goalsSummary, args.diagnosis,
    ].some((field) => field && field.trim());
    if (!hasContent) {
      throw new Error("Write something in at least one field before saving the note");
    }

    const appointmentId = await anchorAppointmentForRecord(ctx, clinic, args.patientId, clinicianId, args.noteType);

    const noteId = await ctx.db.insert("sessionLogs", {
      appointmentId,
      patientId: args.patientId,
      physiotherapistId: clinicianId,
      clinicId: clinic._id,
      sessionDate: Date.now(),
      noteType: args.noteType,
      diagnosis: args.diagnosis?.trim() || undefined,
      goals: args.goalsSummary?.trim() || undefined,
      subjectiveAssessment: args.subjectiveAssessment,
      objectiveAssessment: args.objectiveAssessment,
      treatmentAdministered: args.treatmentAdministered,
      planForNextSession: args.planForNextSession,
    });

    // Discharge closes the episode of care at this clinic
    if (args.noteType === "discharge_summary") {
      await closeCareEpisode(ctx, clinic, args.patientId, "discharged", user._id);
    }

    return { success: true, noteId };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. EXERCISE / HOME PROGRAMME
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assign an exercise prescription / home rehabilitation programme
 */
export const assignHomeProgramme = mutation({
  args: {
    patientId: v.id("users"),
    physiotherapistId: v.optional(v.id("users")),
    title: v.string(),
    description: v.optional(v.string()),
    exercises: v.array(
      v.object({
        name: v.string(),
        sets: v.number(),
        reps: v.number(),
        frequency: v.string(), // e.g. "2x daily"
        instructions: v.string(),
      })
    ),
    // Shown to the patient on their Goals tab, e.g. "Walk 1km without pain"
    goals: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { user, clinic } = await getOwnerClinic(ctx);
    await ensureClinicOwnerApproved(ctx, user);
    await assertPatientInClinic(ctx, clinic, args.patientId);

    const clinicianId = args.physiotherapistId || user._id;
    if (args.physiotherapistId) {
      await assertStaffInClinic(ctx, clinic, args.physiotherapistId);
    }

    // Convert exercises into treatment plan phases
    const phases = [
      {
        name: "Phase 1: Home Programme",
        description: args.description || "Prescribed home physiotherapy regimen",
        duration: "4 weeks",
        order: 1,
        exercises: toPlanExercises(args.exercises),
      },
    ];

    const now = Date.now();
    const planId = await ctx.db.insert("treatmentPlans", {
      patientId: args.patientId,
      physiotherapistId: clinicianId,
      clinicId: clinic._id,
      title: args.title.trim() || "Home exercise programme",
      description: args.description || "Home exercise programme",
      startDate: now,
      reviewInterval: 14,
      version: 1,
      createdAt: now,
      updatedAt: now,
      priority: "medium",
      status: "active",
      goals: toPlanGoals(args.goals),
      phases,
    });

    await advanceClinicReferral(ctx, clinic, args.patientId, "treatment_active", user._id);

    return { success: true, planId };
  },
});

const programmeExercise = v.object({
  name: v.string(),
  sets: v.number(),
  reps: v.number(),
  frequency: v.string(),
  instructions: v.string(),
});

function toPlanGoals(goals: string[] | undefined) {
  return (goals ?? [])
    .map((goal) => goal.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((description) => ({ description, targetValue: "", timeline: "", measurable: false }));
}

function toPlanExercises(exercises: { name: string; sets: number; reps: number; frequency: string; instructions: string }[]) {
  const cleaned = exercises
    .map((ex) => ({ ...ex, name: ex.name.trim(), instructions: ex.instructions.trim() }))
    .filter((ex) => ex.name);
  if (cleaned.length === 0) {
    throw new Error("Add at least one exercise with a name");
  }
  return cleaned.map((ex, i) => ({
    exerciseId: `custom_ex_${i}`,
    name: ex.name,
    instructions: ex.instructions || undefined,
    sets: Math.max(1, Math.round(ex.sets)),
    reps: Math.max(1, Math.round(ex.reps)),
    frequency: ex.frequency.trim() || "Daily",
    notes: ex.instructions || undefined,
  }));
}

/**
 * Edit an existing home programme (exercises, title) or change its status.
 */
export const updateHomeProgramme = mutation({
  args: {
    planId: v.id("treatmentPlans"),
    title: v.optional(v.string()),
    exercises: v.optional(v.array(programmeExercise)),
    goals: v.optional(v.array(v.string())),
    status: v.optional(v.union(v.literal("active"), v.literal("on_hold"), v.literal("completed"))),
  },
  handler: async (ctx, args) => {
    const { user, clinic } = await getOwnerClinic(ctx);
    await ensureClinicOwnerApproved(ctx, user);

    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.clinicId !== clinic._id) {
      throw new Error("Programme not found");
    }

    const now = Date.now();
    const patch: Partial<Doc<"treatmentPlans">> = { updatedAt: now };
    if (args.title !== undefined && args.title.trim()) {
      patch.title = args.title.trim();
    }
    if (args.exercises) {
      const [first, ...rest] = plan.phases;
      patch.phases = [
        { ...(first ?? { name: "Home Programme", description: "", duration: "", order: 1 }), exercises: toPlanExercises(args.exercises) },
        ...rest,
      ];
      patch.version = plan.version + 1;
    }
    if (args.goals) {
      patch.goals = toPlanGoals(args.goals);
    }
    if (args.status) {
      patch.status = args.status;
      if (args.status === "completed") patch.completedAt = now;
    }
    await ctx.db.patch(args.planId, patch);
    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. PATIENT FOLLOW-UP TRACKING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get follow-up queue: patients who need check-ins, retention checks, or continuation tasks
 */
export const getClinicFollowUpQueue = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getOwnerClinicOrPreview(ctx);
    if (!auth) return [];
    const { clinic } = auth;

    const staffIds = await getClinicStaffUserIds(ctx, clinic);
    const patientIds = await getActiveClinicPatientIds(ctx, clinic);
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    const rows = await Promise.all(
      patientIds.slice(0, 100).map(async (patientId) => {
        const patient = await ctx.db.get(patientId);
        if (!patient) return null;

        const recent = (
          await ctx.db
            .query("appointments")
            .withIndex("by_patient_id_and_time", (q: any) => q.eq("patientId", patientId))
            .order("desc")
            .take(20)
        ).filter(
          (apt) =>
            !apt.isRecordOnly &&
            (apt.clinicId === clinic._id || staffIds.has(apt.physiotherapistId)) &&
            apt.status !== "cancelled_by_patient" &&
            apt.status !== "cancelled_by_therapist"
        );
        const upcoming = recent.filter((apt) => apt.startTime >= now).sort((a, b) => a.startTime - b.startTime)[0];
        const lastVisit = recent.find((apt) => apt.startTime < now);

        const daysSinceLastVisit = lastVisit ? Math.floor((now - lastVisit.startTime) / DAY) : null;
        const activeRels = (
          await ctx.db
            .query("patientPhysiotherapistRelationships")
            .withIndex("by_patient", (q: any) => q.eq("patientId", patientId))
            .collect()
        ).filter((rel) => rel.status === "active" && (rel.clinicId === clinic._id || staffIds.has(rel.physiotherapistId)));
        const nextCheckInAt = activeRels.map((rel) => rel.nextCheckInAt).find((at) => at !== undefined) ?? null;

        // A scheduled check-in date wins. Otherwise: nothing booked and not seen for a week.
        const needsCheckIn =
          nextCheckInAt !== null
            ? nextCheckInAt <= now
            : !upcoming && (daysSinceLastVisit === null || daysSinceLastVisit >= 7);
        if (!needsCheckIn) return null;

        return {
          patientId: patient._id,
          patientName: `${patient.firstName || ""} ${patient.lastName || ""}`.trim() || patient.email || "Patient",
          phone: patient.phoneNumber || null,
          lastVisitAt: lastVisit?.startTime ?? null,
          daysSinceLastVisit,
          lastVisitStatus: lastVisit?.status ?? null,
          checkInDueAt: nextCheckInAt,
        };
      })
    );

    return rows
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => (b.daysSinceLastVisit ?? 9999) - (a.daysSinceLastVisit ?? 9999));
  },
});

/**
 * Record a follow-up action or outreach note
 */
export const logPatientFollowUp = mutation({
  args: {
    patientId: v.id("users"),
    outcome: v.union(v.literal("continuing_care"), v.literal("care_paused"), v.literal("discharged"), v.literal("unreachable")),
    notes: v.string(),
    // When to check in next; the patient returns to the follow-up queue on that day
    nextCheckInAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user, clinic } = await getOwnerClinic(ctx);
    await ensureClinicOwnerApproved(ctx, user);
    await assertPatientInClinic(ctx, clinic, args.patientId);

    const appointmentId = await anchorAppointmentForRecord(ctx, clinic, args.patientId, user._id, "follow_up_outreach");

    const outcomeLabel: Record<typeof args.outcome, string> = {
      continuing_care: "Continuing care",
      care_paused: "Care paused",
      discharged: "Discharged",
      unreachable: "Could not reach patient",
    };

    await ctx.db.insert("sessionLogs", {
      appointmentId,
      patientId: args.patientId,
      physiotherapistId: user._id,
      clinicId: clinic._id,
      sessionDate: Date.now(),
      noteType: "follow_up_outreach",
      subjectiveAssessment: `Check-in: ${outcomeLabel[args.outcome]}`,
      treatmentAdministered: args.notes,
    });

    if (args.outcome === "continuing_care" || args.outcome === "unreachable") {
      // Unreachable patients come back tomorrow unless a date was picked
      const nextCheckInAt =
        args.nextCheckInAt ?? (args.outcome === "unreachable" ? Date.now() + 24 * 60 * 60 * 1000 : undefined);
      const staffIds = await getClinicStaffUserIds(ctx, clinic);
      const rels = await ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_patient", (q: any) => q.eq("patientId", args.patientId))
        .collect();
      for (const rel of rels) {
        if (rel.status === "active" && (rel.clinicId === clinic._id || staffIds.has(rel.physiotherapistId))) {
          await ctx.db.patch(rel._id, { nextCheckInAt });
        }
      }
    }

    // The outcome updates the patient's care status, not just the log
    if (args.outcome === "discharged") {
      await closeCareEpisode(ctx, clinic, args.patientId, "discharged", user._id);
    } else if (args.outcome === "care_paused") {
      await closeCareEpisode(ctx, clinic, args.patientId, "paused", user._id);
    }

    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. PAYMENTS & BILLING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a service or package payment request / invoice
 */
export const createClinicPaymentRequest = mutation({
  args: {
    patientId: v.id("users"),
    serviceName: v.string(),
    amountNaira: v.number(), // Amount in Naira
    notes: v.optional(v.string()),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user, clinic } = await getOwnerClinic(ctx);
    await ensureClinicOwnerApproved(ctx, user);
    await assertPatientInClinic(ctx, clinic, args.patientId);

    if (!(args.amountNaira > 0)) {
      throw new Error("Amount must be greater than zero");
    }

    const totalKobo = Math.round(args.amountNaira * 100);
    // Platform fee: 10% (standard Rehabify transaction fee), taken out of the price the patient pays
    const platformFeeKobo = Math.round(totalKobo * 0.1);
    const clinicNetKobo = totalKobo - platformFeeKobo;

    const now = Date.now();
    let invoiceNumber = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `INV-${new Date(now).getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const clash = await ctx.db
        .query("invoices")
        .withIndex("by_clinic_id_and_invoice_number", (q: any) =>
          q.eq("clinicId", clinic._id).eq("invoiceNumber", candidate)
        )
        .first();
      if (!clash) {
        invoiceNumber = candidate;
        break;
      }
    }
    if (!invoiceNumber) {
      throw new Error("Could not generate an invoice number, please try again");
    }
    const due = args.dueDate || now + 7 * 24 * 60 * 60 * 1000;

    const invoiceId = await ctx.db.insert("invoices", {
      patientId: args.patientId,
      physiotherapistId: user._id,
      clinicId: clinic._id,
      invoiceNumber,
      issueDate: now,
      dueDate: due,
      items: [
        {
          description: args.serviceName,
          quantity: 1,
          unitPrice: totalKobo,
          totalPrice: totalKobo,
        },
      ],
      subtotalAmount: totalKobo,
      platformFeeAmount: platformFeeKobo,
      totalAmount: totalKobo,
      currency: "NGN",
      status: "sent",
      notes: args.notes,
      physiotherapistShare: clinicNetKobo,
      platformShare: platformFeeKobo,
      // feeBreakdown.total is what checkout charges, so the patient pays the quoted price exactly once
      feeBreakdown: {
        subtotal: totalKobo,
        discount: 0,
        platformFee: platformFeeKobo,
        paystackPercentage: 0,
        paystackFlat: 0,
        total: totalKobo,
        physiotherapistEarnings: clinicNetKobo,
      },
    });

    return { success: true, invoiceId, invoiceNumber };
  },
});

/**
 * Get comprehensive billing overview: paid, unpaid, clinic earnings, fees
 */
export const getClinicBillingSummary = query({
  args: {},
  handler: async (ctx) => {
    const clinic = (await getOwnerClinicOrPreview(ctx))?.clinic ?? null;
    const DAY = 86400000;

    if (!clinic) {
      return {
        isPreview: true,
        unpaidNaira: 35000,
        unpaidCount: 1,
        paidThisMonthNaira: 210000,
        netThisMonthNaira: 189000,
        feesThisMonthNaira: 21000,
        payoutAccount: null,
        priceList: [
          { name: "Initial assessment", priceNaira: 25000, durationMinutes: 60 },
          { name: "Follow-up session", priceNaira: 15000, durationMinutes: 45 },
        ],
        invoices: [
          {
            _id: "prev_inv_1",
            invoiceNumber: "INV-2026-081",
            payoutStatus: "sent_to_bank" as const,
            patientName: "Folake Adebayo",
            patientPhone: "+234 803 123 4567",
            serviceName: "Package of 6 sessions",
            totalAmountNaira: 150000,
            rehabifyFeeNaira: 15000,
            clinicNetNaira: 135000,
            status: "paid",
            paymentMethod: "paystack",
            paymentLink: null,
            paidAt: Date.now() - 2 * DAY,
            dueDate: Date.now() + 7 * DAY,
            createdAt: Date.now() - 3 * DAY,
          },
          {
            _id: "prev_inv_2",
            invoiceNumber: "INV-2026-082",
            payoutStatus: null,
            patientName: "Chukwudi Eze",
            patientPhone: "+234 802 987 6543",
            serviceName: "Follow-up session",
            totalAmountNaira: 35000,
            rehabifyFeeNaira: 3500,
            clinicNetNaira: 31500,
            status: "sent",
            paymentMethod: null,
            paymentLink: null,
            paidAt: null,
            dueDate: Date.now() + 3 * DAY,
            createdAt: Date.now() - 1 * DAY,
          },
        ],
      };
    }

    const [invoices, payout] = await Promise.all([
      ctx.db
        .query("invoices")
        .withIndex("by_clinic_id", (q: any) => q.eq("clinicId", clinic._id))
        .order("desc")
        .collect(),
      ctx.db
        .query("clinicPayoutAccounts")
        .withIndex("by_clinic_id", (q: any) => q.eq("clinicId", clinic._id))
        .first(),
    ]);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const isUnpaid = (status: string) => status === "sent" || status === "overdue" || status === "partial_payment";

    let unpaidKobo = 0;
    let paidThisMonthKobo = 0;
    let netThisMonthKobo = 0;
    let feesThisMonthKobo = 0;

    const enrichedInvoices = await Promise.all(
      invoices.map(async (inv) => {
        const patient = await ctx.db.get(inv.patientId);
        const total = inv.totalAmount || 0;
        const fee = inv.feeBreakdown?.platformFee ?? inv.platformFeeAmount ?? Math.round(total * 0.1);
        const net = inv.feeBreakdown?.physiotherapistEarnings ?? inv.physiotherapistShare ?? total - fee;
        const paidAt = inv.paymentDate ?? null;
        const overdue = isUnpaid(inv.status) && inv.dueDate < Date.now();

        if (isUnpaid(inv.status)) unpaidKobo += total;
        if (inv.status === "paid" && (paidAt ?? inv._creationTime) >= startOfMonth) {
          paidThisMonthKobo += total;
          // Offline (cash / transfer / POS) payments are collected by the clinic in full
          const offline = inv.paymentMethod && inv.paymentMethod !== "paystack";
          netThisMonthKobo += offline ? total : net;
          feesThisMonthKobo += offline ? 0 : fee;
        }

        // Where the clinic's money is. Offline payments were collected in person.
        let payoutStatus: "collected" | "sent_to_bank" | "held_by_rehabify" | null = null;
        if (inv.status === "paid") {
          const offline = inv.paymentMethod && inv.paymentMethod !== "paystack";
          payoutStatus = offline
            ? "collected"
            : inv.payoutRoute === "split_to_provider"
              ? "sent_to_bank"
              : inv.payoutRoute === "held_by_platform"
                ? "held_by_rehabify"
                : null;
        }

        return {
          _id: inv._id,
          invoiceNumber: inv.invoiceNumber,
          payoutStatus,
          serviceName: inv.items?.[0]?.description || "Physiotherapy",
          patientName: patient ? `${patient.firstName || ""} ${patient.lastName || ""}`.trim() || "Patient" : "Patient",
          patientPhone: patient?.phoneNumber || null,
          totalAmountNaira: Math.round(total / 100),
          rehabifyFeeNaira: Math.round(fee / 100),
          clinicNetNaira: Math.round(net / 100),
          status: overdue ? "overdue" : inv.status,
          paymentMethod: inv.paymentMethod ?? null,
          paymentLink: inv.paymentLink ?? null,
          paidAt,
          dueDate: inv.dueDate,
          createdAt: inv.issueDate || inv._creationTime,
        };
      })
    );

    return {
      isPreview: false,
      unpaidNaira: Math.round(unpaidKobo / 100),
      unpaidCount: invoices.filter((inv) => isUnpaid(inv.status)).length,
      paidThisMonthNaira: Math.round(paidThisMonthKobo / 100),
      netThisMonthNaira: Math.round(netThisMonthKobo / 100),
      feesThisMonthNaira: Math.round(feesThisMonthKobo / 100),
      payoutAccount: payout
        ? { bankName: payout.bankName, accountName: payout.accountName, accountNumberLast4: payout.accountNumber.slice(-4) }
        : null,
      priceList: clinic.priceList ?? [],
      invoices: enrichedInvoices,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. TEAM / CLINICIAN MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remove a clinician from the clinic. Their active patients move to the clinic owner
 * so nobody is left without a clinician.
 */
export const removeClinician = mutation({
  args: { clinicianId: v.id("users") },
  handler: async (ctx, args) => {
    const { user, clinic } = await getOwnerClinic(ctx);
    await ensureClinicOwnerApproved(ctx, user);
    if (args.clinicianId === user._id) {
      throw new Error("You can't remove yourself from your own clinic");
    }

    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q: any) => q.eq("userId", args.clinicianId))
      .first();
    if (!profile || profile.clinicId !== clinic._id) {
      throw new Error("Clinician not found in your clinic");
    }

    const rels = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_physiotherapist", (q: any) => q.eq("physiotherapistId", args.clinicianId))
      .collect();
    let moved = 0;
    for (const rel of rels) {
      if (rel.status !== "active") continue;
      const ownerRel = await ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_patient_and_physiotherapist", (q: any) =>
          q.eq("patientId", rel.patientId).eq("physiotherapistId", user._id)
        )
        .first();
      if (ownerRel) {
        await ctx.db.patch(ownerRel._id, { status: "active", clinicId: clinic._id });
      } else {
        await ctx.db.insert("patientPhysiotherapistRelationships", {
          patientId: rel.patientId,
          physiotherapistId: user._id,
          clinicId: clinic._id,
          isPrimaryPhysiotherapist: true,
          startDate: Date.now(),
          status: "active",
          source: rel.source,
        });
      }
      await ctx.db.patch(rel._id, { status: "inactive", endDate: Date.now(), notes: "Clinician left the clinic" });
      moved++;
    }

    await ctx.db.patch(profile._id, { clinicId: undefined });
    const clinician = await ctx.db.get(args.clinicianId);
    if (clinician?.clinicId === clinic._id) {
      await ctx.db.patch(args.clinicianId, { clinicId: undefined, status: undefined });
    }

    return { success: true, patientsMoved: moved };
  },
});

/**
 * Get enriched clinician team with active caseload, appointments, and availability
 */
export const getClinicCliniciansWithCaseload = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getOwnerClinicOrPreview(ctx);
    if (!auth) return [];
    const { clinic } = auth;

    const profiles = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_clinic_id", (q: any) => q.eq("clinicId", clinic._id))
      .collect();

    const team = await Promise.all(
      profiles.map(async (prof) => {
        const user = await ctx.db.get(prof.userId);
        if (!user) return null;

        // Active patient count
        const relationships = await ctx.db
          .query("patientPhysiotherapistRelationships")
          .withIndex("by_physiotherapist", (q: any) => q.eq("physiotherapistId", prof.userId))
          .filter((q: any) => q.eq(q.field("status"), "active"))
          .collect();

        // This month appointments
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const appointments = await ctx.db
          .query("appointments")
          .withIndex("by_physiotherapist_id_and_time", (q: any) =>
            q.eq("physiotherapistId", prof.userId).gte("startTime", startOfMonth)
          )
          .collect();

        return {
          profileId: prof._id,
          userId: user._id,
          firstName: user.firstName || "Clinician",
          lastName: user.lastName || "",
          email: user.email || "",
          phoneNumber: user.phoneNumber || "",
          imageUrl: user.imageUrl,
          role: user.role || "physiotherapist",
          status: user.status || "active",
          specializations: prof.specializations || [],
          licenseNumber: prof.licenseNumber || null,
          availabilitySchedule: prof.availabilitySchedule || null,
          activeCaseload: relationships.length,
          monthlyAppointmentsCount: appointments.length,
        };
      })
    );

    return team.filter(Boolean);
  },
});

const DAYS_OF_WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Set a clinician's weekly working hours (the same schedule they edit themselves).
 */
export const updateClinicianAvailability = mutation({
  args: {
    clinicianId: v.id("users"),
    availabilitySchedule: v.any(),
  },
  handler: async (ctx, args) => {
    const { user, clinic } = await getOwnerClinic(ctx);
    await ensureClinicOwnerApproved(ctx, user);
    await assertStaffInClinic(ctx, clinic, args.clinicianId);

    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q: any) => q.eq("userId", args.clinicianId))
      .first();
    if (!profile || profile.clinicId !== clinic._id) {
      throw new Error("Clinician not found in your clinic");
    }

    // Same shape the booking slot engine reads (convex/calendar/availability.ts):
    // { monday: { isOpen, slots: [{ start: "09:00", end: "17:00" }] }, ... }
    const input = (args.availabilitySchedule ?? {}) as Record<string, any>;
    const schedule: Record<string, { isOpen: boolean; slots: { start: string; end: string }[] }> = {};
    for (const day of DAYS_OF_WEEK) {
      const entry = input[day];
      const slots = Array.isArray(entry?.slots)
        ? entry.slots
            .filter(
              (slot: any) =>
                typeof slot?.start === "string" &&
                typeof slot?.end === "string" &&
                TIME_PATTERN.test(slot.start) &&
                TIME_PATTERN.test(slot.end) &&
                slot.start < slot.end
            )
            .slice(0, 12)
            .map((slot: any) => ({ start: slot.start, end: slot.end }))
        : [];
      schedule[day] = { isOpen: Boolean(entry?.isOpen ?? entry?.enabled) && slots.length > 0, slots };
    }

    await ctx.db.patch(profile._id, { availabilitySchedule: schedule });
    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. CLINIC SETUP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get full clinic setup configuration
 */
export const getClinicSetupDetails = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getOwnerClinicOrPreview(ctx);
    const clinic = auth?.clinic ?? null;

    if (!clinic || !auth) {
      return {
        _id: "prev_clinic_1",
        name: "Victoria Island Physiotherapy Center",
        contactEmail: "admin@viphysio.ng",
        contactPhone: "+234 803 555 1200",
        address: "Plot 14B, Bishop Oluwole Street, Victoria Island",
        city: "Lagos",
        country: "Nigeria",
        description: "Specialized physical rehabilitation clinic offering evidence-based musculoskeletal, post-operative, and neurological physiotherapy.",
        website: "https://viphysio.ng",
        specializations: ["Orthopedics", "Sports Rehabilitation", "Spinal Therapy", "Neurology"],
        workingHours: {
          monday: { open: "08:00", close: "17:00", active: true },
          tuesday: { open: "08:00", close: "17:00", active: true },
          wednesday: { open: "08:00", close: "17:00", active: true },
          thursday: { open: "08:00", close: "17:00", active: true },
          friday: { open: "08:00", close: "17:00", active: true },
          saturday: { open: "09:00", close: "14:00", active: true },
          sunday: { open: "00:00", close: "00:00", active: false },
        },
        verificationStatus: "Preview",
        approvalStatus: "preview",
        state: "Lagos",
        priceList: [
          { name: "Initial assessment", priceNaira: 25000, durationMinutes: 60 },
          { name: "Follow-up session", priceNaira: 15000, durationMinutes: 45 },
          { name: "Package of 6 sessions", priceNaira: 80000 },
        ],
      };
    }

    return {
      _id: clinic._id,
      name: clinic.name,
      contactEmail: clinic.contactEmail || "",
      contactPhone: clinic.contactPhone || "",
      address: clinic.address || "",
      city: clinic.city || "",
      country: clinic.country || "Nigeria",
      description: clinic.description || "",
      website: clinic.website || "",
      state: clinic.state || "",
      specializations: clinic.specializations || [],
      priceList: clinic.priceList || [],
      workingHours: normalizeWorkingHours(clinic.workingHours),
      verificationStatus: verificationLabel(await getApprovalStatus(ctx, auth.user._id)),
      approvalStatus: (await getApprovalStatus(ctx, auth.user._id)) ?? "not_submitted",
    };
  },
});

const WEEK_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

/**
 * Opening hours are saved as { open, close, active } by settings but as
 * { isOpen, slots: [{ start, end }] } by onboarding. Always return the settings shape.
 */
function normalizeWorkingHours(raw: any) {
  const defaults: Record<string, { open: string; close: string; active: boolean }> = {
    monday: { open: "08:00", close: "17:00", active: true },
    tuesday: { open: "08:00", close: "17:00", active: true },
    wednesday: { open: "08:00", close: "17:00", active: true },
    thursday: { open: "08:00", close: "17:00", active: true },
    friday: { open: "08:00", close: "17:00", active: true },
    saturday: { open: "09:00", close: "14:00", active: false },
    sunday: { open: "09:00", close: "14:00", active: false },
  };
  const result: Record<string, { open: string; close: string; active: boolean }> = {};
  for (const day of WEEK_DAYS) {
    const value = raw?.[day];
    if (value && typeof value.open === "string") {
      result[day] = { open: value.open, close: value.close, active: Boolean(value.active) };
    } else if (value && Array.isArray(value.slots)) {
      const first = value.slots[0];
      const last = value.slots[value.slots.length - 1];
      result[day] = {
        open: first?.start ?? defaults[day].open,
        close: last?.end ?? defaults[day].close,
        active: Boolean(value.isOpen),
      };
    } else {
      result[day] = defaults[day];
    }
  }
  return result;
}

function verificationLabel(status: string | null) {
  switch (status) {
    case "approved":
      return "Verified Partner Clinic";
    case "declined":
      return "Verification declined";
    case "pending_review":
      return "Verification pending review";
    default:
      return "Not yet submitted for verification";
  }
}

/**
 * Save clinic setup details
 */
export const updateClinicSetupDetails = mutation({
  args: {
    name: v.string(),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    description: v.optional(v.string()),
    website: v.optional(v.string()),
    state: v.optional(v.string()),
    specializations: v.optional(v.array(v.string())),
    workingHours: v.optional(v.record(v.string(), v.object({
      open: v.string(),
      close: v.string(),
      active: v.boolean(),
    }))),
    priceList: v.optional(v.array(v.object({
      name: v.string(),
      priceNaira: v.number(),
      durationMinutes: v.optional(v.number()),
    }))),
  },
  handler: async (ctx, args) => {
    const { user, clinic } = await getOwnerClinic(ctx);
    await ensureClinicOwnerApproved(ctx, user);

    if (!args.name.trim()) {
      throw new Error("Clinic name is required");
    }
    if (args.contactEmail?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.contactEmail.trim())) {
      throw new Error("Enter a valid email address");
    }

    if (args.workingHours) {
      for (const [day, hours] of Object.entries(args.workingHours)) {
        if (hours.active && hours.open >= hours.close) {
          throw new Error(`${day.charAt(0).toUpperCase() + day.slice(1)}: closing time must be after opening time`);
        }
      }
    }

    let priceList = args.priceList;
    if (priceList) {
      priceList = priceList
        .map((item) => ({ ...item, name: item.name.trim() }))
        .filter((item) => item.name);
      for (const item of priceList) {
        if (!(item.priceNaira > 0)) {
          throw new Error(`Enter a price for "${item.name}"`);
        }
      }
    }

    await ctx.db.patch(clinic._id, {
      name: args.name.trim(),
      contactEmail: args.contactEmail?.trim(),
      contactPhone: args.contactPhone?.trim(),
      address: args.address?.trim(),
      city: args.city?.trim(),
      description: args.description?.trim(),
      ...(args.website !== undefined && { website: args.website.trim() || undefined }),
      ...(args.state !== undefined && { state: args.state.trim() || undefined }),
      ...(args.specializations !== undefined && { specializations: args.specializations }),
      ...(args.workingHours !== undefined && { workingHours: args.workingHours }),
      ...(priceList !== undefined && { priceList }),
    });

    return { success: true, message: "Clinic settings saved" };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. REHABIFY REFERRALS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get inbound Rehabify referrals eligible for or assigned to this clinic
 */
export const getClinicRehabifyReferrals = query({
  args: {},
  handler: async (ctx) => {
    const clinic = (await getOwnerClinicOrPreview(ctx))?.clinic ?? null;

    if (!clinic) {
      return [
        {
          _id: "prev_ref_1",
          trackingCode: "RHB-94201",
          patientName: "Oluwaseun Bakare",
          patientPhone: "+234 803 555 0192",
          patientEmail: "o.bakare@example.com",
          condition: "Post-Surgical Meniscal Tear Repair",
          clinicalNotes: "Patient was discharged from Lagoon Hospital yesterday. Weight bearing as tolerated.",
          priority: "urgent",
          status: "received",
          city: "Lagos",
          partnerSource: "Lagoon Hospital Orthopedics",
          createdAt: Date.now() - 4 * 3600000,
          assignedPhysiotherapistId: null,
          isRehabifyReferral: true,
        },
        {
          _id: "prev_ref_2",
          trackingCode: "RHB-83114",
          patientName: "Grace Danjuma",
          patientPhone: "+234 812 444 8821",
          patientEmail: "grace.d@example.com",
          condition: "Chronic Cervical Radiculopathy",
          clinicalNotes: "Referred by Dr. Alabi. Requires cervical traction and ergonomic re-training.",
          priority: "standard",
          status: "accepted",
          city: "Lagos",
          partnerSource: "First Cardiology Clinic Network",
          createdAt: Date.now() - 28 * 3600000,
          assignedPhysiotherapistId: "prev_doc1",
          isRehabifyReferral: true,
        },
      ];
    }

    // Only referrals a Rehabify admin has explicitly routed to this clinic
    const matched = await ctx.db
      .query("inboundReferrals")
      .withIndex("by_assigned_clinic", (q: any) => q.eq("assignedClinicId", clinic._id))
      .order("desc")
      .take(100);

    return matched.map((ref: any) => ({
      _id: ref._id,
      trackingCode: ref.trackingCode || `RHB-${ref._creationTime.toString().slice(-5)}`,
      patientName: `${ref.patientFirstName} ${ref.patientLastName}`,
      patientPhone: ref.patientPhone,
      patientEmail: ref.patientEmail || "",
      condition: ref.condition || ref.reason || "General Rehabilitation",
      clinicalNotes: ref.clinicalNotes || "",
      priority: ref.priority || "standard",
      status: ref.status,
      city: ref.city || clinic.city,
      partnerSource: ref.partnerId || ref.conversionSource || "Rehabify Partner Network",
      createdAt: ref.createdAt || ref._creationTime,
      assignedPhysiotherapistId: ref.assignedPhysiotherapistId || null,
      isRehabifyReferral: true, // Distinguishes from direct clinic patients
    }));
  },
});

/**
 * Accept or decline a Rehabify referral and optionally assign clinician
 */
export const respondToRehabifyReferral = mutation({
  args: {
    referralId: v.id("inboundReferrals"),
    action: v.union(v.literal("accept"), v.literal("decline")),
    assignedClinicianId: v.optional(v.id("users")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, clinic } = await getOwnerClinic(ctx);
    await ensureClinicOwnerApproved(ctx, user);

    const referral = await ctx.db.get(args.referralId);
    if (!referral || referral.assignedClinicId !== clinic._id) {
      throw new Error("Referral not found");
    }
    if (referral.status !== "received" && referral.status !== "pending") {
      throw new Error("This referral has already been responded to");
    }

    const now = Date.now();

    if (args.action === "accept") {
      const clinicianId = args.assignedClinicianId || user._id;
      if (args.assignedClinicianId) {
        await assertStaffInClinic(ctx, clinic, args.assignedClinicianId);
      }

      // Reuse an existing account for this patient where one exists (email first, then phone)
      const email = referral.patientEmail?.toLowerCase().trim();
      let patientUser: Doc<"users"> | null = null;
      if (referral.patientId) {
        patientUser = await ctx.db.get(referral.patientId);
      }
      if (!patientUser && email) {
        patientUser = await ctx.db
          .query("users")
          .withIndex("by_email", (q: any) => q.eq("email", email))
          .first();
      }
      if (!patientUser && referral.patientPhone) {
        patientUser = await ctx.db
          .query("users")
          .withIndex("by_phone_number", (q: any) => q.eq("phoneNumber", referral.patientPhone))
          .first();
      }
      if (patientUser && patientUser.role && patientUser.role !== "patient") {
        throw new Error("The referred patient's contact details belong to a non-patient account. Contact Rehabify support.");
      }

      let patientUserId: Id<"users">;
      if (patientUser) {
        patientUserId = patientUser._id;
      } else {
        patientUserId = await ctx.db.insert("users", {
          clerkId: `rehabify_ref_${now}_${Math.random().toString(36).substring(2, 6)}`,
          firstName: referral.patientFirstName,
          lastName: referral.patientLastName,
          email: email || undefined,
          phoneNumber: referral.patientPhone,
          role: "patient",
          onboarded: true,
          clinicId: clinic._id,
          status: "active",
          joinedAt: now,
        });
      }

      const profile = await ctx.db
        .query("patientProfiles")
        .withIndex("by_user_id", (q: any) => q.eq("userId", patientUserId))
        .first();
      const referralSummary = `Rehabify Referral (${referral.trackingCode || referral._id}): ${referral.condition || referral.reason || "Rehabilitation"}`;
      if (!profile) {
        const profileId = await ctx.db.insert("patientProfiles", {
          userId: patientUserId,
          clinicId: clinic._id,
          city: referral.city || clinic.city,
          medicalHistorySummary: referralSummary,
          referralSource: "rehabify_referral",
        });
        await ctx.db.patch(patientUserId, { patientProfileId: profileId });
      } else if (!profile.medicalHistorySummary) {
        await ctx.db.patch(profile._id, { medicalHistorySummary: referralSummary });
      }

      const existingRel = await ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_patient_and_physiotherapist", (q: any) =>
          q.eq("patientId", patientUserId).eq("physiotherapistId", clinicianId)
        )
        .first();
      if (!existingRel) {
        await ctx.db.insert("patientPhysiotherapistRelationships", {
          patientId: patientUserId,
          physiotherapistId: clinicianId,
          clinicId: clinic._id,
          isPrimaryPhysiotherapist: true,
          startDate: now,
          status: "active",
          source: "rehabify_referral",
        });
      } else {
        await ctx.db.patch(existingRel._id, { status: "active", clinicId: clinic._id, source: "rehabify_referral" });
      }

      await ctx.db.patch(args.referralId, {
        status: "booked",
        assignedPhysiotherapistId: clinicianId,
        patientId: patientUserId,
        updatedAt: now,
      });

      await ctx.db.insert("referralEvents", {
        referralId: args.referralId,
        eventName: "clinic.accepted",
        occurredAt: now,
        actorType: "clinic_owner",
        actorId: String(user._id),
        metadata: { clinicId: clinic._id, assignedPhysiotherapistId: clinicianId, notes: args.notes },
      });

      return {
        success: true,
        message: "Referral accepted and patient added to your clinic.",
      };
    } else {
      // Hand the referral back to Rehabify so it can be routed to another clinic
      await ctx.db.patch(args.referralId, {
        status: "received",
        assignedClinicId: undefined,
        updatedAt: now,
      });

      await ctx.db.insert("referralEvents", {
        referralId: args.referralId,
        eventName: "clinic.declined",
        occurredAt: now,
        actorType: "clinic_owner",
        actorId: String(user._id),
        metadata: { clinicId: clinic._id, notes: args.notes },
      });

      return {
        success: true,
        message: "Referral declined and returned to Rehabify for re-routing.",
      };
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. CONSOLIDATED CLINIC DASHBOARD OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clean, lightweight, consolidated dashboard overview matching the 6 requested streams
 */
export const getClinicConsolidatedDashboard = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getOwnerClinicOrPreview(ctx);
    const HOUR = 3600000;

    if (!auth) {
      const at = (hours: number) => Date.now() + hours * HOUR;
      return {
        isPreview: true,
        clinicName: "Your clinic",
        patientsInCare: 48,
        todayCount: 3,
        upcomingWeekCount: 14,
        unpaidCount: 2,
        unpaidNaira: 145000,
        newReferralsCount: 1,
        activeProgrammesCount: 21,
        today: [
          { _id: "preview_1", patientId: "prev_p1", startTime: at(1), endTime: at(2), appointmentType: "in-person", status: "scheduled", patientName: "Folake Adebayo", clinicianName: "Kunle Balogun" },
          { _id: "preview_2", patientId: "prev_p2", startTime: at(3), endTime: at(4), appointmentType: "telehealth", status: "confirmed", patientName: "Chukwudi Eze", clinicianName: "Amara Okafor" },
        ],
        recentActivity: [
          { id: "act_1", kind: "payment", title: "Payment received", description: "Folake Adebayo · ₦150,000", timestamp: Date.now() - 2 * HOUR },
          { id: "act_2", kind: "note", title: "Treatment note", description: "Chukwudi Eze", timestamp: Date.now() - 5 * HOUR },
        ],
      };
    }

    const { clinic } = auth;
    const staffIds = await getClinicStaffUserIds(ctx, clinic);
    const patientIds = await getActiveClinicPatientIds(ctx, clinic);

    const now = new Date();
    const nowTs = now.getTime();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfDay = startOfDay + 24 * HOUR;
    const weekAhead = startOfDay + 7 * 24 * HOUR;
    const isCancelled = (status: string) => status === "cancelled_by_patient" || status === "cancelled_by_therapist";

    // Appointments from the start of the last 14 days through the coming week
    const windowStart = startOfDay - 14 * 24 * HOUR;
    const clinicAppointments = (
      await ctx.db
        .query("appointments")
        .withIndex("by_clinic_id_and_time", (q: any) =>
          q.eq("clinicId", clinic._id).gte("startTime", windowStart).lt("startTime", weekAhead)
        )
        .collect()
    ).filter((apt) => !apt.isRecordOnly);

    const userCache = new Map<string, Doc<"users"> | null>();
    const getUser = async (id: Id<"users">) => {
      if (!userCache.has(id)) userCache.set(id, await ctx.db.get(id));
      return userCache.get(id) ?? null;
    };
    const fullName = (u: Doc<"users"> | null, fallback: string) =>
      u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || fallback : fallback;

    const todayAppointments = clinicAppointments
      .filter((apt) => apt.startTime >= startOfDay && apt.startTime < endOfDay && !isCancelled(apt.status))
      .sort((a, b) => a.startTime - b.startTime);

    const today = await Promise.all(
      todayAppointments.map(async (apt) => ({
        _id: apt._id,
        patientId: apt.patientId,
        startTime: apt.startTime,
        endTime: apt.endTime,
        appointmentType: apt.appointmentType ?? "in-person",
        status: apt.status,
        patientName: fullName(await getUser(apt.patientId), "Patient"),
        clinicianName: fullName(await getUser(apt.physiotherapistId), "Clinician"),
      }))
    );

    const upcomingWeekCount = clinicAppointments.filter(
      (apt) => apt.startTime >= endOfDay && (apt.status === "scheduled" || apt.status === "confirmed")
    ).length;

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_clinic_id", (q: any) => q.eq("clinicId", clinic._id))
      .collect();
    const unpaid = invoices.filter((inv) => inv.status === "sent" || inv.status === "overdue" || inv.status === "partial_payment");

    const newReferralsCount = (
      await ctx.db
        .query("inboundReferrals")
        .withIndex("by_assigned_clinic", (q: any) => q.eq("assignedClinicId", clinic._id))
        .collect()
    ).filter((ref) => ref.status === "received" || ref.status === "pending").length;

    const activeProgrammesCount = (
      await ctx.db
        .query("treatmentPlans")
        .withIndex("by_clinic", (q: any) => q.eq("clinicId", clinic._id))
        .filter((q: any) => q.eq(q.field("status"), "active"))
        .collect()
    ).length;

    // Recent activity: visits that happened, notes written, payments received
    const activity: { id: string; kind: "visit" | "note" | "payment"; title: string; description: string; timestamp: number }[] = [];

    const statusTitle: Record<string, string> = {
      completed: "Visit completed",
      no_show: "No-show",
      cancelled_by_patient: "Cancelled by patient",
      cancelled_by_therapist: "Visit cancelled",
    };
    for (const apt of clinicAppointments) {
      if (apt.startTime <= nowTs && statusTitle[apt.status]) {
        activity.push({
          id: `apt-${apt._id}`,
          kind: "visit",
          title: statusTitle[apt.status],
          description: fullName(await getUser(apt.patientId), "Patient"),
          timestamp: apt.startTime,
        });
      }
    }

    for (const inv of invoices) {
      if (inv.status === "paid" && inv.paymentDate && inv.paymentDate >= windowStart) {
        activity.push({
          id: `pay-${inv._id}`,
          kind: "payment",
          title: "Payment received",
          description: `${fullName(await getUser(inv.patientId), "Patient")} · ₦${Math.round(inv.totalAmount / 100).toLocaleString("en-NG")}`,
          timestamp: inv.paymentDate,
        });
      }
    }

    for (const patientId of patientIds.slice(0, 60)) {
      const notes = await ctx.db
        .query("sessionLogs")
        .withIndex("by_patient_id_and_date", (q: any) => q.eq("patientId", patientId).gte("sessionDate", windowStart))
        .collect();
      for (const note of notes) {
        if (note.clinicId !== clinic._id && !staffIds.has(note.physiotherapistId)) continue;
        activity.push({
          id: `note-${note._id}`,
          kind: "note",
          title: NOTE_TYPE_LABELS[note.noteType ?? "treatment_note"],
          description: fullName(await getUser(note.patientId), "Patient"),
          timestamp: note.sessionDate,
        });
      }
    }

    activity.sort((a, b) => b.timestamp - a.timestamp);

    return {
      isPreview: false,
      clinicName: clinic.name,
      patientsInCare: patientIds.length,
      todayCount: today.length,
      upcomingWeekCount,
      unpaidCount: unpaid.length,
      unpaidNaira: Math.round(unpaid.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0) / 100),
      newReferralsCount,
      activeProgrammesCount,
      today,
      recentActivity: activity.slice(0, 8),
    };
  },
});

/**
 * Small counts for the sidebar (new referrals waiting for a response).
 */
export const getClinicNavCounts = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getOwnerClinicOrPreview(ctx);
    if (!auth) return { newReferrals: 0 };
    const referrals = await ctx.db
      .query("inboundReferrals")
      .withIndex("by_assigned_clinic", (q: any) => q.eq("assignedClinicId", auth.clinic._id))
      .collect();
    return {
      newReferrals: referrals.filter((ref) => ref.status === "received" || ref.status === "pending").length,
    };
  },
});
