import { cheapestSessionPriceKobo } from "./helpers/referralFloor";
import { alertAdminsOfInheritedTag, inheritedRehabifySource } from "./helpers/rehabifySources";
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { getAuthenticatedUser } from "./auth";
import { internal } from "./_generated/api";
import { clinicPaymentSplit } from "./clinicFees";
import { loadClinicFeeConfig } from "./clinicFeeSettings";
import { logSecurityEvent } from "./helpers/securityLog";
import { ensureUserNumbers } from "./helpers/rehabifyIds";
import { activePaymentLink, closeInvoicePaymentLinks } from "./helpers/paymentLinks";
import { isClinicInviteApproval } from "./helpers/clinicApproval";
import { usableSubaccount } from "./helpers/paystackMode";
import { assertClinicNotBillingReadOnly, subscriptionForClinic } from "./helpers/clinicSubscriptions";
import {
  CLEAR_PROPOSAL,
  appointmentsPathFor,
  emailAboutAppointment,
  notifyAboutAppointment,
  personName,
  syncGoogleCalendarEvent,
  visitPlace,
} from "./helpers/appointmentNotify";
import { lagosDateTime, lagosTimeRange, zonedDateKey, zonedTimeKey } from "./helpers/lagosTime";
import { transitionReferral } from "./helpers/partnerEvents";
import { attributeUserToReferral } from "./helpers/partnerAttribution";
import { assertNoteTextLength, keepRevision } from "./helpers/noteRevisions";
import { createClinicPatientInvitation } from "./patientInvitations";
import { insertNotification } from "./helpers/pushNotify";
import { queueJoyAppointmentScheduled } from "./helpers/joyEvents";
import { publicAppUrl } from "./helpers/appUrl";
import { normalizePhone } from "./helpers/partnerShared";

/** Section names as the clinic's note form shows them, for "too long" messages. */
const CLINIC_NOTE_LABELS: Record<string, string> = {
  diagnosis: "Diagnosis",
  goals: "Goals",
  subjectiveAssessment: "Patient report",
  objectiveAssessment: "Findings",
  treatmentAdministered: "Treatment given",
  planForNextSession: "Plan",
};

// ─────────────────────────────────────────────────────────────────────────────
// Clinic access: the owner, and team members (clinicians and front-desk staff)
// limited to the pages their clinic role allows. All errors here are ConvexError
// so the reason reaches the browser in production.
// ─────────────────────────────────────────────────────────────────────────────

/** Pages a clinic role can be given. Home is always available. */
export const CLINIC_AREAS = ["appointments", "patients", "referrals", "billing", "team", "reports", "settings", "inventory"] as const;
export type ClinicArea = (typeof CLINIC_AREAS)[number];

const AREA_LABELS: Record<ClinicArea, string> = {
  appointments: "Appointments",
  patients: "Patients",
  referrals: "Referrals",
  billing: "Billing",
  team: "Team",
  reports: "Reports",
  settings: "Clinic settings",
  inventory: "Inventory",
};

export const isClinicArea = (value: string): value is ClinicArea => (CLINIC_AREAS as readonly string[]).includes(value);

/**
 * What a clinician gets when the owner hasn't given them a role: their own clinical work.
 * Clinic management (Referrals, Billing, Team, Reports, Clinic settings) needs a role that includes it.
 */
export const CLINICIAN_DEFAULT_AREAS: readonly ClinicArea[] = ["appointments", "patients"];

export type ClinicMember = {
  user: Doc<"users">;
  clinic: Doc<"clinics">;
  isOwner: boolean;
  /** owner, a clinician (physiotherapist on the team) or front desk (clinic_staff) */
  kind: "owner" | "clinician" | "front_desk";
  /**
   * "all" for the owner, front desk without a role, and anyone whose role has no pages ticked.
   * A clinician without a role gets CLINICIAN_DEFAULT_AREAS.
   */
  permissions: "all" | ClinicArea[];
  roleName: string | null;
};

/** Team members who work inside a clinic dashboard (patients also carry clinicId, so role matters). */
const isClinicTeamRole = (role: Doc<"users">["role"]) => role === "physiotherapist" || role === "clinic_staff";

export async function resolveClinicMember(ctx: QueryCtx, user: Doc<"users">): Promise<ClinicMember | null> {
  if (user.role === "clinic_owner") {
    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q: any) => q.eq("ownerId", user._id))
      .first();
    return clinic ? { user, clinic, isOwner: true, kind: "owner", permissions: "all", roleName: null } : null;
  }

  if (user.clinicId && isClinicTeamRole(user.role)) {
    const clinic = await ctx.db.get(user.clinicId);
    if (!clinic) return null;
    const kind = user.role === "physiotherapist" ? ("clinician" as const) : ("front_desk" as const);
    // No role (or a deleted one): clinicians get their clinical pages, front desk keeps every page
    let permissions: ClinicMember["permissions"] = kind === "clinician" ? [...CLINICIAN_DEFAULT_AREAS] : "all";
    let roleName: string | null = null;
    if (user.clinicRoleId) {
      const role = await ctx.db.get(user.clinicRoleId);
      if (role && role.clinicId === clinic._id) {
        roleName = role.name;
        const allowed = role.permissions.filter(isClinicArea);
        // The owner chose this role; one with no pages ticked is their way of giving full access
        permissions = allowed.length > 0 ? allowed : "all";
      }
    }
    return { user, clinic, isOwner: false, kind, permissions, roleName };
  }

  return null;
}

export function canUseArea(member: ClinicMember, area: ClinicArea) {
  return member.permissions === "all" || member.permissions.includes(area);
}

/**
 * The signed-in clinic owner or team member. With `area`, the member's role must include that page.
 */
export async function getClinicMember(
  ctx: QueryCtx,
  area?: ClinicArea,
  // Paying Rehabify's invoices (and asking for an upgrade) must keep working while read-only
  options: { allowBillingReadOnly?: boolean } = {}
): Promise<ClinicMember> {
  const user = await getAuthenticatedUser(ctx);
  const member = await resolveClinicMember(ctx, user);
  if (!member) {
    throw new ConvexError(
      user.role === "clinic_owner" ? "No clinic found for this account" : "You're not part of a clinic team."
    );
  }
  if (!member.isOwner && user.status && user.status !== "active") {
    throw new ConvexError("Your access to this clinic has been suspended. Contact the clinic owner.");
  }
  if (area && !canUseArea(member, area)) {
    throw new ConvexError(`Your role doesn't include ${AREA_LABELS[area]}. Ask the clinic owner for access.`);
  }
  // Only mutations have db.insert: a suspended clinic, or one read-only for an unpaid Rehabify
  // invoice, can still be viewed (and exported), but not changed
  if ("insert" in ctx.db) {
    assertClinicNotSuspended(member.clinic);
    if (!options.allowBillingReadOnly) await assertClinicNotBillingReadOnly(ctx, member.clinic._id);
  }
  return member;
}

/** For changes: the member needs the page, and the clinic must be approved. */
export async function requireClinicWrite(
  ctx: QueryCtx,
  area?: ClinicArea,
  options: { allowBillingReadOnly?: boolean } = {}
): Promise<ClinicMember> {
  const member = await getClinicMember(ctx, area, options);
  await ensureClinicApproved(ctx, member.clinic, options);
  return member;
}

/** Owner-only actions: bank account, roles, removing or suspending staff. */
export async function getOwnerClinic(
  ctx: QueryCtx,
  options: { allowBillingReadOnly?: boolean } = {}
): Promise<ClinicMember> {
  const member = await getClinicMember(ctx, undefined, options);
  if (!member.isOwner) {
    throw new ConvexError("Only the clinic owner can do this.");
  }
  return member;
}

/**
 * Like getClinicMember, but returns null for people who aren't in a clinic (signed out, or not
 * a clinic owner/team member yet), so queries return nothing instead of erroring. A real owner
 * or team member whose access fails gets the real error. Never used to show sample data.
 */
export async function getClinicMemberOrNull(ctx: QueryCtx, area?: ClinicArea): Promise<ClinicMember | null> {
  try {
    return await getClinicMember(ctx, area);
  } catch (err) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();
    if (user && ((user.role === "clinic_owner" && user.onboarded) || (user.clinicId && isClinicTeamRole(user.role)))) {
      throw err;
    }
    return null;
  }
}

/** Who a record is attributed to by default: the acting clinician, or the owner for front-desk staff. */
export function defaultClinicianId(member: ClinicMember): Id<"users"> {
  return member.user.role === "clinic_staff" ? member.clinic.ownerId : member.user._id;
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

/**
 * The clinician who treats a patient. Every clinic patient has one, picked by the clinic, and it's
 * never the owner's account: the owner runs the clinic and doesn't treat (owner decision, 28 Oct
 * 2026). Patients stay the clinic's either way, so another clinician can take over later.
 */
export async function requireAssignedClinician(
  ctx: QueryCtx,
  clinic: Doc<"clinics">,
  clinicianId: Id<"users"> | undefined
): Promise<Id<"users">> {
  if (!clinicianId) throw new ConvexError("Choose the clinician who'll treat this patient.");
  if (clinicianId === clinic.ownerId) {
    throw new ConvexError("Choose a clinician from your team. The owner account runs the clinic and doesn't treat patients.");
  }
  await assertStaffInClinic(ctx, clinic, clinicianId);
  return clinicianId;
}

export async function assertStaffInClinic(ctx: QueryCtx, clinic: Doc<"clinics">, userId: Id<"users">) {
  const staffIds = await getClinicStaffUserIds(ctx, clinic);
  if (!staffIds.has(userId)) {
    throw new ConvexError("Selected clinician is not a member of your clinic");
  }
  const member = await ctx.db.get(userId);
  if (member && member._id !== clinic.ownerId && member.status && member.status !== "active") {
    throw new ConvexError("This clinician is suspended. Reactivate them on the Team page first.");
  }
}

/**
 * True when the patient belongs to this clinic: linked directly, through their profile, or by a
 * care relationship tagged with the clinic. A clinician's own private patients (relationships
 * without the clinic) are theirs, not the clinic's.
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
  return rels.some((r) => r.clinicId === clinic._id);
}

/**
 * Clinical records (notes, assessments, programmes) are written by the patient's own clinician,
 * under their own name. The owner and colleagues can read them; to take over someone's care,
 * the patient is reassigned first. The owner runs the clinic and doesn't treat (owner decision,
 * 28 Oct 2026): their clinicians write the records.
 */
export async function requireTreatingClinician(
  ctx: QueryCtx,
  member: ClinicMember,
  patientId: Id<"users">
): Promise<Id<"users">> {
  if (member.kind === "owner") {
    throw new ConvexError("Clinical records are written by the patient's clinician. Assign this patient to a clinician on your team.");
  }
  if (member.kind === "front_desk") {
    throw new ConvexError("Only the patient's clinician can write clinical records.");
  }
  const rels = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_patient_and_physiotherapist", (q: any) =>
      q.eq("patientId", patientId).eq("physiotherapistId", member.user._id)
    )
    .collect();
  if (!rels.some((r) => r.status === "active")) {
    throw new ConvexError(
      "Only this patient's clinician can write their clinical notes and programmes. To take over their care, reassign the patient to yourself first."
    );
  }
  return member.user._id;
}

export async function assertPatientInClinic(ctx: QueryCtx, clinic: Doc<"clinics">, patientId: Id<"users">) {
  if (!(await isPatientInClinic(ctx, clinic, patientId))) {
    throw new ConvexError("Patient not found in your clinic");
  }
}

async function getClinicAppointmentOrThrow(
  ctx: QueryCtx,
  clinic: Doc<"clinics">,
  appointmentId: Id<"appointments">
) {
  const appointment = await ctx.db.get(appointmentId);
  if (!appointment) {
    throw new ConvexError("Appointment not found");
  }
  // Only the clinic's own visits: never a clinician's private practice
  if (appointment.clinicId !== clinic._id) {
    throw new ConvexError("Appointment not found");
  }
  return appointment;
}

/** Patients with an active care relationship tagged with this clinic. */
export async function getActiveClinicPatientIds(ctx: QueryCtx, clinic: Doc<"clinics">): Promise<Id<"users">[]> {
  const rels = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_clinic", (q: any) => q.eq("clinicId", clinic._id))
    .collect();
  const ids = new Set<Id<"users">>();
  for (const rel of rels) {
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
  const rels = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_patient", (q: any) => q.eq("patientId", patientId))
    .collect();
  for (const rel of rels) {
    if (rel.status === "active" && rel.clinicId === clinic._id) {
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

/**
 * Referrals a clinic can still accept or decline: anything before booking, including ones
 * Rehabify (or Joy) has already been in touch about. Mirrored in components/clinic/patients/ReferralInbox.tsx.
 */
const CLINIC_ACCEPTABLE_REFERRAL = new Set<string>([
  "received",
  "pending",
  "consent_pending",
  "contacted",
  "intake_started",
  "intake_completed",
  "qualified",
]);

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
    // The shared lifecycle keeps milestones, partner webhooks and referring-doctor updates in step
    await transitionReferral(ctx, referral._id, next, {
      actorType: "clinic_owner",
      actorId: String(actorId),
      metadata: { clinicId: clinic._id },
    });
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

/** Most visits one repeat booking can create (bookClinicAppointment). */
const MAX_REPEAT_VISITS = 40;

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
    throw new ConvexError(`This clinician already has an appointment at ${at}. Pick another time or clinician.`);
  }
}

/** Active while in care here; otherwise how the last episode ended. */
async function getCareStatus(
  ctx: QueryCtx,
  clinic: Doc<"clinics">,
  patientId: Id<"users">
): Promise<"active" | "paused" | "discharged"> {
  const rels = (
    await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient", (q: any) => q.eq("patientId", patientId))
      .collect()
  ).filter((rel) => rel.clinicId === clinic._id);
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

/** Rehabify admins can suspend a clinic (convex/adminClinics.ts). Its team keeps read-only access. */
export function assertClinicNotSuspended(clinic: Doc<"clinics">) {
  if (clinic.status === "suspended") {
    throw new ConvexError("This clinic has been suspended by Rehabify. Contact support.");
  }
}

/**
 * Changes are only allowed once the clinic's owner has finished registration and Rehabify
 * has approved the clinic, and while the clinic isn't suspended. Applies to team members
 * too, since they act for the clinic.
 */
export async function ensureClinicApproved(
  ctx: QueryCtx,
  clinic: Doc<"clinics">,
  options: { allowBillingReadOnly?: boolean } = {}
) {
  assertClinicNotSuspended(clinic);
  if (!options.allowBillingReadOnly) await assertClinicNotBillingReadOnly(ctx, clinic._id);
  const owner = await ctx.db.get(clinic.ownerId);
  // A skip always leaves onboarded=false, so once onboarded is true a stale skip flag is ignored
  if (!owner?.onboarded) {
    throw new ConvexError("Finish your clinic registration first. Until then the dashboard shows sample data.");
  }
  const approval = await ctx.db
    .query("accountApprovalStatus")
    .withIndex("by_user_id", (q: any) => q.eq("userId", clinic.ownerId))
    .unique();
  if (!approval || approval.status !== "approved") {
    throw new ConvexError(
      "Your clinic is waiting for Rehabify's approval. You can look around, but changes unlock once it's approved."
    );
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
    // Optional: many patients have no email. They get a record without a login; add an email
    // later (Edit details) to invite them to their account.
    email: v.optional(v.string()),
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
    const member = await requireClinicWrite(ctx, "patients");
    const { user, clinic } = member;

    if (args.assignedClinicianId) {
      await assertStaffInClinic(ctx, clinic, args.assignedClinicianId);
    }

    const email = args.email?.trim().toLowerCase() || undefined;
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      throw new ConvexError("That email address doesn't look right. Check it, or leave it empty.");
    }
    // Required: the patient joins from a WhatsApp message and signs in with this number + a PIN
    const typedPhone = args.phoneNumber?.trim();
    if (!typedPhone) throw new ConvexError("Enter the patient's phone number. They join and sign in with it.");
    const phoneNumber = normalizePhone(typedPhone);
    if (!phoneNumber) throw new ConvexError("That phone number doesn't look right. Check it, e.g. 0803 123 4567.");

    // An email that's already on Rehabify links to that record. Without an email there is
    // nothing to match on, so a new record is made (never matched on an empty email).
    let patientUser = email
      ? await ctx.db
          .query("users")
          .withIndex("by_email", (q: any) => q.eq("email", email))
          .first()
      : null;

    // No email: the same name and phone already in this clinic is almost certainly a duplicate
    if (!email && phoneNumber) {
      const sameName = (u: Doc<"users">) =>
        (u.firstName ?? "").trim().toLowerCase() === args.firstName.trim().toLowerCase() &&
        (u.lastName ?? "").trim().toLowerCase() === args.lastName.trim().toLowerCase();
      const samePhone = await ctx.db
        .query("users")
        .withIndex("by_phone_number", (q: any) => q.eq("phoneNumber", phoneNumber))
        .collect();
      const duplicate = samePhone.find((u) => u.role === "patient" && u.clinicId === clinic._id && sameName(u));
      if (duplicate) {
        throw new ConvexError(
          `${args.firstName.trim()} ${args.lastName.trim()} is already one of your patients with this phone number. Open their record from Patients.`
        );
      }
    }

    if (patientUser && patientUser.role && patientUser.role !== "patient") {
      throw new ConvexError("This email belongs to a non-patient account and cannot be enrolled as a patient.");
    }

    const existingAccount = !!patientUser;
    if (!patientUser) {
      const generatedClerkId = `clinic_patient_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const patientUserId = await ctx.db.insert("users", {
        clerkId: generatedClerkId,
        email,
        firstName: args.firstName.trim(),
        lastName: args.lastName.trim(),
        phoneNumber,
        role: "patient",
        onboarded: true,
        clinicId: clinic._id,
        status: "active",
        joinedAt: Date.now(),
      });
      patientUser = await ctx.db.get(patientUserId);
    }

    if (!patientUser) {
      throw new ConvexError("Failed to create or locate patient user account");
    }
    const { patientNumber } = await ensureUserNumbers(ctx, patientUser._id);

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

    // Every clinic patient has a treating clinician from the team
    const targetClinicianId = await requireAssignedClinician(ctx, clinic, args.assignedClinicianId);
    const patientId = patientUser._id;

    // Check existing relationship
    const existingRel = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q: any) =>
        q.eq("patientId", patientId).eq("physiotherapistId", targetClinicianId)
      )
      .first();

    const alreadyInCare = existingRel?.status === "active" && existingRel.clinicId === clinic._id;
    if (!existingRel) {
      // Re-adding a patient Rehabify referred here keeps them a referral (with Rehabify's split),
      // even after a discharge or under another clinician
      const referredBefore = await clinicReferralSource(ctx, clinic._id, patientId);
      // A patient Rehabify sent to a physio recently comes in as a referral too (admins are told)
      const inherited = referredBefore ? null : await inheritedRehabifySource(ctx, patientId, targetClinicianId, clinic._id);
      await ctx.db.insert("patientPhysiotherapistRelationships", {
        patientId,
        physiotherapistId: targetClinicianId,
        clinicId: clinic._id,
        isPrimaryPhysiotherapist: true,
        startDate: Date.now(),
        status: "active",
        source: referredBefore ?? inherited?.source ?? "clinic_direct",
      });
      if (inherited) await alertAdminsOfInheritedTag(ctx, { patientId, newPhysioId: targetClinicianId, clinicId: clinic._id, from: inherited.from });
    } else if (!alreadyInCare) {
      await ctx.db.patch(existingRel._id, { status: "active", clinicId: clinic._id });
    }

    // Let the patient know, with their invitation link (it names the clinic and their clinician)
    const emailSent = alreadyInCare ? false : await schedulePatientInviteEmail(ctx, clinic, patientUser, targetClinicianId);

    return {
      success: true,
      patientId: patientUser._id,
      patientNumber,
      existingAccount,
      emailSent,
      // The clinician they were put with, so a booking form can pick them straight away
      clinicianId: targetClinicianId,
      message: `Patient ${args.firstName} ${args.lastName} enrolled successfully.`,
    };
  },
});

// Records a clinic, referral or Joy created before the patient had an account
// (kept in step with PLACEHOLDER_CLERK_ID_PREFIXES in convex/users.ts)
const PLACEHOLDER_CLERK_ID_PREFIXES = ["clinic_patient_", "physio_patient_", "rehabify_ref_", "joy-whatsapp:", "managed_"];

/** True once the patient has signed up and owns the account. */
function patientHasAccount(patient: Doc<"users">) {
  return !PLACEHOLDER_CLERK_ID_PREFIXES.some((prefix) => patient.clerkId.startsWith(prefix));
}

/** Email the patient that this clinic added them. Returns false when there's no email to send to. */
export async function schedulePatientInviteEmail(
  ctx: MutationCtx,
  clinic: Doc<"clinics">,
  patient: Doc<"users">,
  clinicianId: Id<"users"> | undefined
) {
  if (!patient.email) return false;
  // The invitation page shows the clinic and their clinician, then links their account
  const inviteCode = clinicianId ? await createClinicPatientInvitation(ctx, { clinic, clinicianId, patient }) : undefined;
  const clinician = clinicianId ? await ctx.db.get(clinicianId) : null;
  await ctx.scheduler.runAfter(0, internal.actions.emails.sendClinicPatientInviteEmail.sendClinicPatientInviteEmail, {
    patientEmail: patient.email,
    patientFirstName: patient.firstName,
    clinicName: clinic.name,
    clinicPhone: clinic.contactPhone,
    hasAccount: patientHasAccount(patient),
    inviteCode,
    clinicianName: clinician ? personName(clinician, "") || undefined : undefined,
  });
  return true;
}

/** Send the "your clinic added you" email again, e.g. after correcting the address. */
export const resendClinicPatientInvite = mutation({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    const { clinic } = await requireClinicWrite(ctx, "patients");
    await assertPatientInClinic(ctx, clinic, args.patientId);
    const patient = await ctx.db.get(args.patientId);
    if (!patient) throw new ConvexError("Patient not found");
    if (!patient.email) {
      throw new ConvexError("This patient has no email address. Add one under Edit details first.");
    }
    const care = (
      await ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_patient", (q: any) => q.eq("patientId", args.patientId))
        .collect()
    ).find((rel) => rel.status === "active" && rel.clinicId === clinic._id);
    await schedulePatientInviteEmail(ctx, clinic, patient, care?.physiotherapistId);
    return { success: true, email: patient.email };
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
    const { clinic } = await getClinicMember(ctx, "patients");

    const patient = await ctx.db.get(args.patientId);
    if (!patient) {
      return null;
    }
    await assertPatientInClinic(ctx, clinic, args.patientId);

    // Only surface records written by this clinic, not the patient's history at other providers
    // or a clinician's private work: untagged (older) records count only when written by someone
    // whose care of this patient is the clinic's
    const staffIds = await getClinicStaffUserIds(ctx, clinic);
    const patientRels = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient", (q: any) => q.eq("patientId", args.patientId))
      .collect();
    const clinicCarers = new Set(patientRels.filter((rel) => rel.clinicId === clinic._id).map((rel) => rel.physiotherapistId));
    const belongsToClinic = (rec: { clinicId?: Id<"clinics">; physiotherapistId: Id<"users"> }) =>
      rec.clinicId === clinic._id || (!rec.clinicId && staffIds.has(rec.physiotherapistId) && clinicCarers.has(rec.physiotherapistId));

    const profile = await ctx.db
      .query("patientProfiles")
      .withIndex("by_user_id", (q: any) => q.eq("userId", args.patientId))
      .first();

    // This clinic's active care relationship (not one at another provider, or a private one)
    const relationship = patientRels.find((rel) => rel.status === "active" && rel.clinicId === clinic._id);
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

    // Patient Documents: the patient's own uploads only when they shared them with their clinician
    let documents: any[] = [];
    if (profile?._id) {
      const rawDocuments = (
        await ctx.db
          .query("patientDocuments")
          .withIndex("by_patient_profile_id", (q: any) => q.eq("patientProfileId", profile._id))
          .collect()
      ).filter((doc: any) => doc.sharedWithPhysiotherapist !== false);
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
        // False until the patient creates their account from the clinic's invite email
        hasAccount: patientHasAccount(patient),
        phoneNumber: patient.phoneNumber,
        imageUrl: patient.imageUrl,
        patientNumber: patient.patientNumber,
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
    const member = await requireClinicWrite(ctx, "patients");
    const { user, clinic } = member;
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
      throw new ConvexError("Unable to locate patient profile");
    }

    // Trust the stored file, not what the browser said about it
    const stored = await ctx.storage.getMetadata(args.storageId);
    if (!stored) throw new ConvexError("The upload didn't finish. Please try again.");
    const storedType = (stored.contentType ?? args.contentType ?? "").toLowerCase();
    if (!/^(application\/pdf|image\/(jpeg|jpg|png|webp))$/.test(storedType)) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError("Upload a PDF, JPEG, PNG or WebP file.");
    }
    if (stored.size > 15 * 1024 * 1024) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError("Files can be up to 15 MB.");
    }

    const docId = await ctx.db.insert("patientDocuments", {
      patientProfileId: profile._id,
      fileName: args.fileName.slice(0, 200),
      fileSize: stored.size,
      contentType: storedType,
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
    // Only while the patient hasn't created their account yet (e.g. to fix a typo before
    // resending the invite). Once they have an account, the email is their login.
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const member = await requireClinicWrite(ctx, "patients");
    const { clinic } = member;
    await assertPatientInClinic(ctx, clinic, args.patientId);
    const patient = await ctx.db.get(args.patientId);
    if (!patient) throw new ConvexError("Patient not found");

    const firstName = args.firstName.trim();
    const lastName = args.lastName.trim();
    if (!firstName || !lastName) {
      throw new ConvexError("First and last name are required");
    }

    let email: string | undefined;
    const newEmail = args.email?.trim().toLowerCase();
    if (newEmail && newEmail !== (patient.email ?? "").toLowerCase()) {
      if (patientHasAccount(patient)) {
        throw new ConvexError("This patient has their own account, so only they can change their email.");
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        throw new ConvexError("Enter a valid email address");
      }
      const taken = await ctx.db
        .query("users")
        .withIndex("by_email", (q: any) => q.eq("email", newEmail))
        .first();
      if (taken && taken._id !== patient._id) {
        throw new ConvexError("Another account already uses this email address.");
      }
      email = newEmail;
    }

    await ctx.db.patch(args.patientId, {
      firstName,
      lastName,
      phoneNumber: args.phoneNumber?.trim() || undefined,
      ...(email && { email }),
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
    const member = await requireClinicWrite(ctx, "patients");
    const { user, clinic } = member;
    await assertPatientInClinic(ctx, clinic, args.patientId);

    const clinicianId = await requireAssignedClinician(ctx, clinic, args.clinicianId);
    if ((await getCareStatus(ctx, clinic, args.patientId)) === "active") {
      throw new ConvexError("This patient is already in active care");
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
    // Repeat visits: the start times of the later visits (same length, clinician and place)
    repeatStartTimes: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    const member = await requireClinicWrite(ctx, "appointments");
    const { user, clinic } = member;
    await assertPatientInClinic(ctx, clinic, args.patientId);
    // Visits are with a clinician on the team (the owner account doesn't treat)
    await requireAssignedClinician(ctx, clinic, args.physiotherapistId);

    if (args.endTime <= args.startTime) {
      throw new ConvexError("Appointment end time must be after the start time");
    }
    const length = args.endTime - args.startTime;
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const repeats = [...new Set(args.repeatStartTimes ?? [])].filter((t) => t > args.startTime).sort((a, b) => a - b);
    if (repeats.length > MAX_REPEAT_VISITS - 1) {
      throw new ConvexError(`You can book up to ${MAX_REPEAT_VISITS} repeat visits at once.`);
    }
    // A visit that already happened can be added afterwards (a verbal booking that was never entered)
    if (args.startTime < now - 366 * DAY) {
      throw new ConvexError("That date is more than a year ago. Check the date.");
    }
    if ((repeats[repeats.length - 1] ?? args.startTime) > now + 366 * DAY) {
      throw new ConvexError("Repeat visits can be booked up to a year ahead.");
    }
    // The first visit must be free; later repeats that clash are skipped and reported
    await assertClinicianFree(ctx, args.physiotherapistId, args.startTime, args.endTime);

    const repeatGroup = repeats.length > 0 ? `rg_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}` : undefined;
    const serviceType = args.serviceType || (args.appointmentType === "telehealth" ? "Telehealth Consultation" : "Clinic Consultation");
    const insertVisit = (startTime: number) => {
      // Already over: saved as attended, since nobody can confirm a visit in the past
      const past = startTime + length <= now;
      return ctx.db.insert("appointments", {
        clinicId: clinic._id,
        patientId: args.patientId,
        physiotherapistId: args.physiotherapistId,
        startTime,
        endTime: startTime + length,
        status: past ? "completed" : "scheduled",
        appointmentType: args.appointmentType,
        isOnline: args.appointmentType === "telehealth",
        serviceType,
        notesForTherapist: args.notes,
        repeatGroup,
      });
    };

    const aptId = await insertVisit(args.startTime);
    let booked = 1;
    const skipped: number[] = [];
    for (const startTime of repeats) {
      try {
        await assertClinicianFree(ctx, args.physiotherapistId, startTime, startTime + length);
      } catch {
        skipped.push(startTime);
        continue;
      }
      await insertVisit(startTime);
      booked += 1;
    }
    if (args.endTime <= now) {
      await advanceClinicReferral(ctx, clinic, args.patientId, "attended", user._id);
    } else {
      // A patient on Joy hears about it on WhatsApp too
      const patient = await ctx.db.get(args.patientId);
      const clinician = await ctx.db.get(args.physiotherapistId);
      if (patient) {
        await queueJoyAppointmentScheduled(ctx, patient, {
          appointmentId: aptId,
          startTime: args.startTime,
          endTime: args.endTime,
          online: args.appointmentType === "telehealth",
          physioName: personName(clinician, clinic.name),
          clinicName: clinic.name,
          visits: booked,
        });
      }
    }

    return { success: true, appointmentId: aptId, past: args.endTime <= now, booked, skipped };
  },
});

/** Cancels a repeat visit and every later open visit booked with it; the patient is told once. */
export const cancelClinicRepeatVisits = mutation({
  args: { appointmentId: v.id("appointments"), cancellationReason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { user, clinic } = await requireClinicWrite(ctx, "appointments");
    const first = await getClinicAppointmentOrThrow(ctx, clinic, args.appointmentId);
    if (!first.repeatGroup) throw new ConvexError("This visit isn't part of a repeat booking.");
    const later = (
      await ctx.db
        .query("appointments")
        .withIndex("by_physiotherapist_id_and_time", (q: any) =>
          q.eq("physiotherapistId", first.physiotherapistId).gte("startTime", first.startTime)
        )
        .collect()
    ).filter(
      (apt) =>
        apt.clinicId === clinic._id &&
        apt.repeatGroup === first.repeatGroup &&
        (apt.status === "scheduled" || apt.status === "confirmed")
    );
    if (later.length === 0) throw new ConvexError("There are no upcoming visits left in this repeat booking.");
    for (const apt of later) {
      await ctx.db.patch(apt._id, { status: "cancelled_by_therapist", cancellationReason: args.cancellationReason, ...CLEAR_PROPOSAL });
      await syncGoogleCalendarEvent(ctx, apt._id, "delete");
    }
    const others = later.length - 1;
    const note = others > 0 ? `This and ${others} later repeat visit${others === 1 ? " was" : "s were"} cancelled.` : undefined;
    await notifyClinicVisitChange(ctx, clinic, user._id, later[0], {
      kind: "cancelled",
      reason: [args.cancellationReason?.trim(), note].filter(Boolean).join(" ") || undefined,
    });
    return { success: true, cancelled: later.length };
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
    const member = await requireClinicWrite(ctx, "appointments");
    const { user, clinic } = member;

    const appointment = await getClinicAppointmentOrThrow(ctx, clinic, args.appointmentId);

    if (appointment.status === "completed") {
      throw new ConvexError("This visit is already completed, so it can't be moved.");
    }
    if (args.endTime <= args.startTime) {
      throw new ConvexError("Appointment end time must be after the start time");
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
      // The clinic set the new time, so the patient is the one who confirms it
      requestedBy: "provider",
      ...CLEAR_PROPOSAL,
      notesForTherapist: args.reason
        ? `${appointment.notesForTherapist ? appointment.notesForTherapist + "\n" : ""}Rescheduled: ${args.reason}`
        : appointment.notesForTherapist,
    });
    if (clinicianId === appointment.physiotherapistId) {
      await syncGoogleCalendarEvent(ctx, args.appointmentId, { startTime: args.startTime, endTime: args.endTime });
    } else {
      // The old clinician's calendar event no longer applies
      await syncGoogleCalendarEvent(ctx, args.appointmentId, "delete");
    }

    await notifyClinicVisitChange(ctx, clinic, user._id, appointment, {
      kind: "rescheduled",
      startTime: args.startTime,
      endTime: args.endTime,
      clinicianId,
      reason: args.reason,
    });

    return { success: true };
  },
});

/**
 * Update appointment status (scheduled, confirmed, completed, cancelled, no-show)
 */
export const updateAppointmentStatus = mutation({
  args: {
    appointmentId: v.id("appointments"),
    status: v.union(
      v.literal("scheduled"),
      v.literal("confirmed"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("no_show")
    ),
    cancellationReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const member = await requireClinicWrite(ctx, "appointments");
    const { user, clinic } = member;

    const appointment = await getClinicAppointmentOrThrow(ctx, clinic, args.appointmentId);

    // A clinic-initiated cancellation is stored as cancelled_by_therapist
    const status = args.status === "cancelled" ? "cancelled_by_therapist" : args.status;

    if (status === "confirmed" && appointment.status !== "scheduled") {
      throw new ConvexError("Only a visit waiting for confirmation can be confirmed.");
    }
    if (status === "cancelled_by_therapist" && appointment.status !== "scheduled" && appointment.status !== "confirmed") {
      throw new ConvexError("Only an upcoming visit can be cancelled.");
    }

    await ctx.db.patch(args.appointmentId, {
      status,
      cancellationReason: status === "cancelled_by_therapist" ? args.cancellationReason : undefined,
      ...(status === "confirmed" || status === "cancelled_by_therapist" ? CLEAR_PROPOSAL : {}),
    });

    if (status === "completed") {
      await advanceClinicReferral(ctx, clinic, appointment.patientId, "attended", user._id);
    }
    if (status === "cancelled_by_therapist") {
      await syncGoogleCalendarEvent(ctx, args.appointmentId, "delete");
      await notifyClinicVisitChange(ctx, clinic, user._id, appointment, {
        kind: "cancelled",
        reason: args.cancellationReason,
      });
    }
    if (status === "confirmed") {
      await notifyClinicVisitChange(ctx, clinic, user._id, appointment, { kind: "confirmed" });
    }

    return { success: true };
  },
});

/**
 * Tells the patient (in-app and email) about a clinic-side change to their visit, and the
 * clinician too unless they made the change themselves. Times are Lagos time.
 */
async function notifyClinicVisitChange(
  ctx: MutationCtx,
  clinic: Doc<"clinics">,
  actorId: Id<"users">,
  appointment: Doc<"appointments">,
  change:
    | { kind: "rescheduled"; startTime: number; endTime: number; clinicianId: Id<"users">; reason?: string }
    | { kind: "cancelled"; reason?: string }
    | { kind: "confirmed" }
) {
  const PATIENT_PATH = "/dashboard/patient/appointments";
  const patient = await ctx.db.get(appointment.patientId);
  const clinicianId = change.kind === "rescheduled" ? change.clinicianId : appointment.physiotherapistId;
  const clinician = await ctx.db.get(clinicianId);
  const patientName = personName(patient, "Patient");
  const clinicianName = personName(clinician, clinic.name);
  const oldTime = lagosTimeRange(appointment.startTime, appointment.endTime);
  const reasonText = "reason" in change && change.reason?.trim() ? change.reason.trim() : undefined;

  try {
    if (change.kind === "rescheduled") {
      const newTime = lagosTimeRange(change.startTime, change.endTime);
      await notifyAboutAppointment(ctx, {
        userId: appointment.patientId,
        type: "appointment_rescheduled",
        title: "Appointment Rescheduled",
        body: `${clinic.name} moved your visit with ${clinicianName} from ${lagosDateTime(appointment.startTime)} to ${lagosDateTime(change.startTime)}.${reasonText ? ` ${reasonText}` : ""}`,
        appointmentId: appointment._id,
        actionUrl: PATIENT_PATH,
      });
      if (patient?.email) {
        await ctx.scheduler.runAfter(0, internal.actions.emails.sendAppointmentRescheduledPatientEmail.sendAppointmentRescheduledPatientEmail, {
          to: patient.email,
          patientName,
          physiotherapistName: clinicianName,
          oldDate: appointment.startTime,
          oldTime,
          newDate: change.startTime,
          newTime,
          viewLink: PATIENT_PATH,
          subjectOverride: `${clinic.name} moved your appointment`,
        });
      }
      if (clinicianId !== actorId) {
        await notifyAboutAppointment(ctx, {
          userId: clinicianId,
          type: "appointment_rescheduled",
          title: clinicianId === appointment.physiotherapistId ? "Appointment Rescheduled" : "Appointment Assigned to You",
          body: `${patientName}'s visit is now on ${lagosDateTime(change.startTime)} (${clinic.name}).`,
          appointmentId: appointment._id,
          actionUrl: appointmentsPathFor(clinician),
        });
        if (clinician?.email) {
          await ctx.scheduler.runAfter(0, internal.actions.emails.sendAppointmentRescheduledProviderEmail.sendAppointmentRescheduledProviderEmail, {
            to: clinician.email,
            patientName,
            physiotherapistName: clinicianName,
            oldDate: appointment.startTime,
            oldTime,
            newDate: change.startTime,
            newTime,
            viewLink: appointmentsPathFor(clinician),
            subjectOverride: `Appointment rescheduled: ${patientName}`,
          });
        }
      }
      // A visit handed to someone else: the previous clinician hears it's off their list
      if (clinicianId !== appointment.physiotherapistId && appointment.physiotherapistId !== actorId) {
        const previous = await ctx.db.get(appointment.physiotherapistId);
        await notifyAboutAppointment(ctx, {
          userId: appointment.physiotherapistId,
          type: "appointment_rescheduled",
          title: "Appointment Reassigned",
          body: `${patientName}'s visit on ${lagosDateTime(appointment.startTime)} was moved to ${clinicianName}.`,
          appointmentId: appointment._id,
          actionUrl: appointmentsPathFor(previous),
        });
      }
      return;
    }

    if (change.kind === "cancelled") {
      await notifyAboutAppointment(ctx, {
        userId: appointment.patientId,
        type: "appointment_cancelled",
        title: "Appointment Cancelled",
        body: `${clinic.name} cancelled your visit on ${lagosDateTime(appointment.startTime)}.${reasonText ? ` ${reasonText}` : ""}`,
        appointmentId: appointment._id,
        actionUrl: PATIENT_PATH,
      });
      if (patient?.email) {
        await ctx.scheduler.runAfter(0, internal.actions.emails.sendAppointmentCanceledPatientEmail.sendAppointmentCanceledPatientEmail, {
          to: patient.email,
          patientName,
          physiotherapistName: clinicianName,
          appointmentDate: appointment.startTime,
          appointmentTime: oldTime,
          cancellationReason: reasonText,
          rescheduleLink: PATIENT_PATH,
          subjectOverride: `${clinic.name} cancelled your appointment`,
        });
      }
      if (clinicianId !== actorId) {
        await notifyAboutAppointment(ctx, {
          userId: clinicianId,
          type: "appointment_cancelled",
          title: "Appointment Cancelled",
          body: `${patientName}'s visit on ${lagosDateTime(appointment.startTime)} was cancelled by ${clinic.name}.`,
          appointmentId: appointment._id,
          actionUrl: appointmentsPathFor(clinician),
        });
        if (clinician?.email) {
          await ctx.scheduler.runAfter(0, internal.actions.emails.sendAppointmentCanceledProviderEmail.sendAppointmentCanceledProviderEmail, {
            to: clinician.email,
            patientName,
            physiotherapistName: clinicianName,
            appointmentDate: appointment.startTime,
            appointmentTime: oldTime,
            cancellationReason: reasonText,
            viewLink: appointmentsPathFor(clinician),
            subjectOverride: `Appointment canceled: ${patientName}`,
          });
        }
      }
      return;
    }

    await notifyAboutAppointment(ctx, {
      userId: appointment.patientId,
      type: "appointment_confirmed",
      title: "Appointment Confirmed",
      body: `${clinic.name} confirmed your visit with ${clinicianName} on ${lagosDateTime(appointment.startTime)}.`,
      appointmentId: appointment._id,
      actionUrl: PATIENT_PATH,
    });
    await emailAboutAppointment(ctx, {
      to: patient?.email,
      audience: "patient",
      subject: `Your visit at ${clinic.name} is confirmed`,
      greetingName: patient?.firstName,
      heading: "Your visit is confirmed",
      paragraphs: [
        `${clinic.name} confirmed your ${appointment.serviceType} with ${clinicianName} on ${lagosDateTime(appointment.startTime)} (Lagos time), ${visitPlace(appointment)}.`,
      ],
      buttonLabel: "View my appointments",
      buttonPath: PATIENT_PATH,
    });
  } catch (err) {
    // A message failing to queue never undoes the clinic's change
    console.error("Failed to notify about clinic appointment change:", err);
  }
}

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
    const member = await requireClinicWrite(ctx, "patients");
    const { user, clinic } = member;
    await assertPatientInClinic(ctx, clinic, args.patientId);

    // Always the signed-in clinician (args.physiotherapistId is kept for older clients and ignored)
    const clinicianId = await requireTreatingClinician(ctx, member, args.patientId);

    const sections = {
      diagnosis: args.diagnosis?.trim() || undefined,
      goals: args.goalsSummary?.trim() || undefined,
      subjectiveAssessment: args.subjectiveAssessment?.trim() || undefined,
      objectiveAssessment: args.objectiveAssessment?.trim() || undefined,
      treatmentAdministered: args.treatmentAdministered?.trim() || undefined,
      planForNextSession: args.planForNextSession?.trim() || undefined,
    };
    if (!Object.values(sections).some(Boolean)) {
      throw new ConvexError("Write something in at least one field before saving the note");
    }
    assertNoteTextLength(sections, CLINIC_NOTE_LABELS);

    const appointmentId = await anchorAppointmentForRecord(ctx, clinic, args.patientId, clinicianId, args.noteType);

    const noteId = await ctx.db.insert("sessionLogs", {
      appointmentId,
      patientId: args.patientId,
      physiotherapistId: clinicianId,
      clinicId: clinic._id,
      sessionDate: Date.now(),
      noteType: args.noteType,
      ...sections,
    });

    // Discharge closes the episode of care at this clinic
    if (args.noteType === "discharge_summary") {
      await closeCareEpisode(ctx, clinic, args.patientId, "discharged", user._id);
    }

    return { success: true, noteId };
  },
});

/**
 * The clinician who wrote a note corrects or adds to it. Only the fields sent change (an empty
 * string clears one); the earlier wording is kept with the note.
 */
export const updateClinicNote = mutation({
  args: {
    noteId: v.id("sessionLogs"),
    subjectiveAssessment: v.optional(v.string()),
    objectiveAssessment: v.optional(v.string()),
    treatmentAdministered: v.optional(v.string()),
    planForNextSession: v.optional(v.string()),
    goalsSummary: v.optional(v.string()),
    diagnosis: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const member = await requireClinicWrite(ctx, "patients");
    const { user, clinic } = member;
    const note = await ctx.db.get(args.noteId);
    if (!note || note.clinicId !== clinic._id) throw new ConvexError("Note not found");
    if (note.physiotherapistId !== user._id) {
      throw new ConvexError("Only the clinician who wrote this note can change it.");
    }

    const pick = (sent: string | undefined, current: string | undefined) => (sent === undefined ? current : sent.trim() || undefined);
    const next = {
      diagnosis: pick(args.diagnosis, note.diagnosis),
      goals: pick(args.goalsSummary, note.goals),
      subjectiveAssessment: pick(args.subjectiveAssessment, note.subjectiveAssessment),
      objectiveAssessment: pick(args.objectiveAssessment, note.objectiveAssessment),
      treatmentAdministered: pick(args.treatmentAdministered, note.treatmentAdministered),
      planForNextSession: pick(args.planForNextSession, note.planForNextSession),
    };
    if (!Object.values(next).some(Boolean)) {
      throw new ConvexError("A note can't be empty. Write something in at least one field.");
    }
    assertNoteTextLength(next, CLINIC_NOTE_LABELS);
    if (!(Object.keys(next) as (keyof typeof next)[]).some((key) => next[key] !== note[key])) {
      return { changed: false };
    }

    const kept = await keepRevision(ctx, note, user._id, Date.now());
    await ctx.db.patch(note._id, { ...next, ...kept });
    return { changed: true };
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
    const member = await requireClinicWrite(ctx, "patients");
    const { user, clinic } = member;
    await assertPatientInClinic(ctx, clinic, args.patientId);

    // Prescribed by the signed-in clinician (args.physiotherapistId is ignored, as for notes)
    const clinicianId = await requireTreatingClinician(ctx, member, args.patientId);

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
    throw new ConvexError("Add at least one exercise with a name");
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
    const member = await requireClinicWrite(ctx, "patients");
    const { user, clinic } = member;

    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.clinicId !== clinic._id) {
      throw new ConvexError("Programme not found");
    }
    await requireTreatingClinician(ctx, member, plan.patientId);

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
    const auth = await getClinicMemberOrNull(ctx);
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    if (!auth) return [];
    const { clinic } = auth;
    let patientIds = await getActiveClinicPatientIds(ctx, clinic);
    // Clinicians follow up their own patients (same rule as the Patients list)
    if (auth.kind === "clinician" && auth.permissions !== "all") {
      const mine = await ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_physiotherapist", (q: any) => q.eq("physiotherapistId", auth.user._id))
        .collect();
      const myPatients = new Set(mine.filter((r) => r.status === "active").map((r) => r.patientId));
      patientIds = patientIds.filter((id) => myPatients.has(id));
    }
    return await buildFollowUpRows(ctx, clinic, patientIds);
  },
});

/**
 * Which of these patients are due a check-in: their check-in date has been reached, or (with
 * no date set) nothing is booked and they haven't been seen for a week. Most overdue first.
 */
async function buildFollowUpRows(ctx: QueryCtx, clinic: Doc<"clinics">, patientIds: Id<"users">[]) {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const staffIds = await getClinicStaffUserIds(ctx, clinic);

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
      ).filter((rel) => rel.status === "active" && rel.clinicId === clinic._id);
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
}

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
    const member = await requireClinicWrite(ctx, "patients");
    const { user, clinic } = member;
    await assertPatientInClinic(ctx, clinic, args.patientId);

    const appointmentId = await anchorAppointmentForRecord(ctx, clinic, args.patientId, defaultClinicianId(member), "follow_up_outreach");

    const outcomeLabel: Record<typeof args.outcome, string> = {
      continuing_care: "Continuing care",
      care_paused: "Care paused",
      discharged: "Discharged",
      unreachable: "Could not reach patient",
    };

    await ctx.db.insert("sessionLogs", {
      appointmentId,
      patientId: args.patientId,
      physiotherapistId: defaultClinicianId(member),
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
      const rels = await ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_patient", (q: any) => q.eq("patientId", args.patientId))
        .collect();
      for (const rel of rels) {
        if (rel.status === "active" && rel.clinicId === clinic._id) {
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
 * Insert a clinic invoice: the admin's fee split, the clinic's payout, and whether the patient is
 * the clinic's own or a Rehabify referral. Used by the clinic Billing page and by clinic
 * clinicians requesting payment from their physio workspace, so clinic money always goes to the clinic.
 * Item amounts are in kobo.
 */
/** Sources that make a clinic patient Rehabify's (an admin referral, or one Rehabify sent a member physio). */
const CLINIC_REHABIFY_SOURCES = new Set(["rehabify_referral", "marketplace", "joy_whatsapp", "booking_link"]);

/** "rehabify_referral" when Rehabify sent this patient to the clinic (any row, active or not), else null. */
async function clinicReferralSource(ctx: QueryCtx, clinicId: Id<"clinics">, patientId: Id<"users">): Promise<"rehabify_referral" | null> {
  const rows = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_patient", (q: any) => q.eq("patientId", patientId))
    .take(50);
  return rows.some((rel) => rel.clinicId === clinicId && CLINIC_REHABIFY_SOURCES.has(rel.source ?? "")) ? "rehabify_referral" : null;
}

/**
 * The amounts stored on a clinic invoice of `totalKobo`, for a new invoice or a corrected one.
 * Throws when a Rehabify referral is billed under the floor.
 */
export async function clinicInvoiceMoney(
  ctx: QueryCtx,
  patientSource: "rehabify_referral" | "clinic_direct",
  totalKobo: number,
  visits: number
) {
  // A Rehabify referral can't be billed a token amount on the platform with the rest taken in
  // cash: each invoice is at least Rehabify's cheapest session price per visit it covers
  if (patientSource === "rehabify_referral") {
    const floorKobo = (await cheapestSessionPriceKobo(ctx)) * Math.max(1, visits);
    if (totalKobo < floorKobo) {
      throw new ConvexError(
        `Rehabify referred this patient, so each visit is billed at least ₦${Math.round(floorKobo / 100 / Math.max(1, visits)).toLocaleString("en-NG")}. Please check the amount.`
      );
    }
  }
  // Online payment: Paystack's fee first, then stamp duty off the clinic's payout. The clinic's
  // own patients: Rehabify takes no cut (clinics pay a software subscription instead). Rehabify
  // Care patients sent to a clinic are a separate deal, so only they use the admin's split. The
  // patient pays the quoted price; nothing is added on top. The amounts are fixed on the invoice
  // now, so later settings changes don't alter it. See convex/clinicFees.ts.
  const feeConfig = await loadClinicFeeConfig(ctx);
  const split = clinicPaymentSplit(
    totalKobo,
    patientSource === "rehabify_referral" ? feeConfig : { ...feeConfig, clinicSharePercent: 100 }
  );
  const platformFeeKobo = split.rehabifyKobo;
  // What Paystack settles to the clinic's subaccount (stamp duty is deducted from it on payout)
  const clinicShareKobo = split.clinicShareKobo;
  return {
    subtotalAmount: totalKobo,
    platformFeeAmount: platformFeeKobo,
    paystackFeeAmount: split.paystackFeeKobo,
    stampDutyAmount: split.stampDutyKobo,
    clinicSharePercent: split.clinicSharePercent,
    totalAmount: totalKobo,
    physiotherapistShare: clinicShareKobo,
    platformShare: platformFeeKobo,
    // feeBreakdown.total is what checkout charges, so the patient pays the quoted price exactly once.
    // paystackFlat holds the whole estimated Paystack fee in kobo; paystackPercentage is the rate.
    // physiotherapistEarnings is the clinic's share before stamp duty (what the split sends it).
    feeBreakdown: {
      subtotal: totalKobo,
      discount: 0,
      platformFee: platformFeeKobo,
      paystackPercentage: feeConfig.paystackPercent,
      paystackFlat: split.paystackFeeKobo,
      total: totalKobo,
      physiotherapistEarnings: clinicShareKobo,
    },
  };
}

export async function insertClinicInvoice(
  ctx: MutationCtx,
  clinic: Doc<"clinics">,
  input: {
    patientId: Id<"users">;
    items: { description: string; quantity: number; unitPrice: number; totalPrice: number }[];
    notes?: string;
    dueDate?: number;
    appointmentIds?: Id<"appointments">[];
    /** Who on the team asked for it (for their own records and the paid notification) */
    issuedById?: Id<"users">;
  }
) {
    // Clinic-owned and Rehabify-sent patients are billed apart, so the invoice keeps the source. Any
    // Rehabify row with this clinic counts (active or not), so discharging and re-adding a referral,
    // or moving them to another clinician, can't turn them into the clinic's own patient.
    const patientSource = (await clinicReferralSource(ctx, clinic._id, input.patientId)) ? "rehabify_referral" : "clinic_direct";

    const totalKobo = input.items.reduce((sum, item) => sum + item.totalPrice, 0);
    const money = await clinicInvoiceMoney(ctx, patientSource, totalKobo, input.appointmentIds?.length ?? 0);

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
      throw new ConvexError("Could not generate an invoice number, please try again");
    }
    const due = input.dueDate || now + 7 * 24 * 60 * 60 * 1000;

    const invoiceId = await ctx.db.insert("invoices", {
      patientId: input.patientId,
      // The owner gets the "payment received" notification for clinic invoices
      physiotherapistId: clinic.ownerId,
      clinicId: clinic._id,
      issuedById: input.issuedById,
      invoiceNumber,
      issueDate: now,
      dueDate: due,
      items: input.items,
      ...money,
      currency: "NGN",
      status: "sent",
      patientSource,
      relatedAppointmentIds: input.appointmentIds?.length ? input.appointmentIds : undefined,
      notes: input.notes,
    });

    // The patient hears it from their clinic, by name, wherever they are
    await notifyPatientOfClinicInvoice(ctx, clinic, input.patientId, invoiceId, totalKobo, input.items[0]?.description, "new");

    return { success: true, invoiceId, invoiceNumber };
}

async function notifyPatientOfClinicInvoice(
  ctx: MutationCtx,
  clinic: Doc<"clinics">,
  patientId: Id<"users">,
  invoiceId: Id<"invoices">,
  totalKobo: number,
  what: string | undefined,
  /** "corrected": the clinic changed the amount or service of a request already sent */
  kind: "new" | "corrected"
) {
  const amount = `₦${(totalKobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
  const path = `/dashboard/patient/invoices/${invoiceId}`;
  const headline = kind === "corrected" ? `${clinic.name} corrected your payment request` : `${clinic.name} sent you a payment request`;
  const lead = kind === "corrected" ? "It is now " : "";
  await insertNotification(ctx, {
    userId: patientId,
    type: "invoice_created",
    priority: "high",
    status: "pending",
    createdAt: Date.now(),
    payload: {
      title: headline,
      body: `${lead}${amount}${what ? ` for ${what}` : ""}. Pay by card, transfer or USSD.`,
      data: { entityId: String(invoiceId), entityType: "invoice" },
      link: path,
    },
  });
  const patient = await ctx.db.get(patientId);
  if (patient?.email && patientHasAccount(patient)) {
    await ctx.scheduler.runAfter(0, internal.actions.emails.sendPatientCareEmail.sendPatientCareEmail, {
      to: patient.email,
      subject: kind === "corrected" ? `${clinic.name}: corrected payment request, now ${amount}` : `${clinic.name}: payment request for ${amount}`,
      greetingName: patient.firstName,
      heading: headline,
      paragraphs: [
        `${lead}${amount}${what ? ` for ${what}` : ""}. You can pay by card, bank transfer or USSD, and the payment goes straight to ${clinic.name}.`,
        ...(kind === "corrected" ? ["This replaces the earlier request. If you already have a payment link for it, please use the new one."] : []),
        clinic.contactPhone ? `Questions about it? Call ${clinic.name} on ${clinic.contactPhone}.` : `Questions about it? Message ${clinic.name} in your patient portal.`,
      ],
      buttonLabel: "View and pay",
      buttonUrl: `${publicAppUrl()}${path}`,
    });
  }
}

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
    // The visit this payment is for, when there is one
    appointmentId: v.optional(v.id("appointments")),
  },
  handler: async (ctx, args) => {
    // Billing its own patients keeps working while the clinic is read-only for Rehabify's invoice
    const member = await requireClinicWrite(ctx, "billing", { allowBillingReadOnly: true });
    const { clinic } = member;
    await assertPatientInClinic(ctx, clinic, args.patientId);

    if (!(args.amountNaira > 0)) {
      throw new ConvexError("Amount must be greater than zero");
    }
    if (!args.serviceName.trim()) {
      throw new ConvexError("Say what the payment is for");
    }
    if (args.dueDate !== undefined && !Number.isFinite(args.dueDate)) {
      throw new ConvexError("Pick a valid due date");
    }
    if (args.appointmentId) {
      const appointment = await getClinicAppointmentOrThrow(ctx, clinic, args.appointmentId);
      if (appointment.patientId !== args.patientId) {
        throw new ConvexError("That visit belongs to a different patient");
      }
    }

    const amountKobo = Math.round(args.amountNaira * 100);
    return await insertClinicInvoice(ctx, clinic, {
      patientId: args.patientId,
      items: [{ description: args.serviceName.trim(), quantity: 1, unitPrice: amountKobo, totalPrice: amountKobo }],
      notes: args.notes,
      dueDate: args.dueDate,
      appointmentIds: args.appointmentId ? [args.appointmentId] : undefined,
      issuedById: member.user._id,
    });
  },
});

/**
 * Correct an unpaid payment request: a wrong amount or service. The invoice keeps its number, the
 * old payment link is closed (a new one is made for the new amount) and the patient is told.
 * A paid invoice is first reopened with clinicBilling.undoMarkInvoicePaid if it was marked paid by mistake.
 */
export const updateClinicPaymentRequest = mutation({
  args: {
    invoiceId: v.id("invoices"),
    serviceName: v.string(),
    amountNaira: v.number(),
  },
  handler: async (ctx, args) => {
    const member = await requireClinicWrite(ctx, "billing", { allowBillingReadOnly: true });
    const { clinic } = member;
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.clinicId !== clinic._id) throw new ConvexError("Invoice not found");

    if (invoice.status === "paid") {
      throw new ConvexError("This invoice is paid, so it can't be changed. If it was marked as paid by mistake, undo that first.");
    }
    if (invoice.status === "void") throw new ConvexError("This invoice was cancelled. Create a new payment request instead.");
    if (invoice.status === "partial_payment" || (invoice.paidAmount ?? 0) > 0) {
      throw new ConvexError("Part of this invoice has already been paid, so it can't be changed. Contact Rehabify support.");
    }
    if (invoice.items.length > 1) {
      throw new ConvexError("This invoice has several lines. Cancel it and create a new payment request instead.");
    }
    // A pay-later application was made for the old amount
    const loans = await ctx.db
      .query("loanApplications")
      .withIndex("by_invoice", (q: any) => q.eq("invoiceId", invoice._id))
      .collect();
    if (loans.some((loan) => !["declined", "rejected", "cancelled", "expired", "failed"].includes(String(loan.status)))) {
      throw new ConvexError("The patient has a pay-later (MediLoan) application for this invoice, so it can't be changed. Contact Rehabify support.");
    }

    const serviceName = args.serviceName.trim();
    if (!serviceName) throw new ConvexError("Say what the payment is for");
    if (!(args.amountNaira > 0)) throw new ConvexError("Amount must be greater than zero");
    const amountKobo = Math.round(args.amountNaira * 100);
    const before = { serviceName: invoice.items[0]?.description ?? "", amountKobo: invoice.totalAmount };
    if (before.serviceName === serviceName && before.amountKobo === amountKobo) return { success: true, changed: false };

    const patientSource = invoice.patientSource === "rehabify_referral" ? "rehabify_referral" : "clinic_direct";
    const money = await clinicInvoiceMoney(ctx, patientSource, amountKobo, invoice.relatedAppointmentIds?.length ?? 0);
    // A link for the old amount must not be paid: it is closed, and the next one uses the new amount
    await closeInvoicePaymentLinks(ctx, invoice._id);
    await ctx.db.patch(invoice._id, {
      items: [{ description: serviceName, quantity: 1, unitPrice: amountKobo, totalPrice: amountKobo }],
      ...money,
      paymentLinkSubaccount: undefined,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: member.user._id,
      action: "clinic_invoice_corrected",
      targetEntityType: "invoice",
      targetEntityId: invoice._id,
      timestamp: Date.now(),
      details: { clinicId: clinic._id, invoiceNumber: invoice.invoiceNumber, before, after: { serviceName, amountKobo } },
    });
    await notifyPatientOfClinicInvoice(ctx, clinic, invoice.patientId, invoice._id, amountKobo, serviceName, "corrected");
    return { success: true, changed: true };
  },
});

/**
 * Get comprehensive billing overview: paid, unpaid, clinic earnings, fees
 */
export const getClinicBillingSummary = query({
  args: {},
  handler: async (ctx) => {
    const clinic = (await getClinicMemberOrNull(ctx, "billing"))?.clinic ?? null;
    const DAY = 86400000;

    if (!clinic) {
      // Not a member of a clinic: nothing to show (the portal sends them to sign-in or sign-up)
      return {
        unpaidNaira: 0,
        unpaidCount: 0,
        paidThisMonthNaira: 0,
        netThisMonthNaira: 0,
        feesThisMonthNaira: 0,
        processingFeesThisMonthNaira: 0,
        payoutAccount: null,
        priceList: [],
        invoices: [],
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
    let processingThisMonthKobo = 0;

    // Older invoices have no patientSource: fall back to how the patient came to the clinic
    const clinicRelationships = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_clinic", (q: any) => q.eq("clinicId", clinic._id))
      .collect();
    const referredPatients = new Set(
      clinicRelationships.filter((rel) => rel.source === "rehabify_referral").map((rel) => rel.patientId)
    );

    const enrichedInvoices = await Promise.all(
      invoices.map(async (inv) => {
        const patient = await ctx.db.get(inv.patientId);
        const total = inv.totalAmount || 0;
        const fee = inv.feeBreakdown?.platformFee ?? inv.platformFeeAmount ?? Math.round(total * 0.1);
        // Clinic's share as split by Paystack; stamp duty comes off it when paid into the bank.
        // Older invoices (before the fee-settings model) have no fee estimates: Rehabify absorbed them.
        const clinicShare = inv.feeBreakdown?.physiotherapistEarnings ?? inv.physiotherapistShare ?? total - fee;
        const paystackFee = inv.paystackFeeAmount ?? 0;
        const stampDuty = inv.stampDutyAmount ?? 0;
        const net = clinicShare - stampDuty;
        const paidAt = inv.paymentDate ?? null;
        const overdue = isUnpaid(inv.status) && inv.dueDate < Date.now();

        if (isUnpaid(inv.status)) unpaidKobo += total;
        if (inv.status === "paid" && (paidAt ?? inv._creationTime) >= startOfMonth) {
          paidThisMonthKobo += total;
          // Offline (cash / transfer / POS) payments are collected by the clinic in full
          const offline = inv.paymentMethod && inv.paymentMethod !== "paystack";
          netThisMonthKobo += offline ? total : net;
          feesThisMonthKobo += offline ? 0 : fee;
          processingThisMonthKobo += offline ? 0 : paystackFee + stampDuty;
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
          patientId: inv.patientId,
          invoiceNumber: inv.invoiceNumber,
          payoutStatus,
          serviceName: inv.items?.[0]?.description || "Physiotherapy",
          patientName: patient ? `${patient.firstName || ""} ${patient.lastName || ""}`.trim() || "Patient" : "Patient",
          patientPhone: patient?.phoneNumber || null,
          totalAmountNaira: Math.round(total / 100),
          rehabifyFeeNaira: Math.round(fee / 100),
          paystackFeeNaira: Math.round(paystackFee / 100),
          stampDutyNaira: Math.round(stampDuty / 100),
          clinicNetNaira: Math.round(net / 100),
          // Split used for this invoice (older invoices: worked out from their amounts)
          rehabifySharePercent:
            inv.clinicSharePercent !== undefined
              ? Math.round((100 - inv.clinicSharePercent) * 100) / 100
              : total > 0
                ? Math.round((fee / Math.max(1, total - paystackFee)) * 100)
                : null,
          status: overdue ? "overdue" : inv.status,
          paymentMethod: inv.paymentMethod ?? null,
          // Only a link that can still be shared; otherwise the page creates a fresh one
          paymentLink: activePaymentLink(inv),
          paidAt,
          dueDate: inv.dueDate,
          createdAt: inv.issueDate || inv._creationTime,
          patientSource:
            inv.patientSource ?? (referredPatients.has(inv.patientId) ? "rehabify_referral" : "clinic_direct"),
        };
      })
    );

    return {
      unpaidNaira: Math.round(unpaidKobo / 100),
      unpaidCount: invoices.filter((inv) => isUnpaid(inv.status)).length,
      paidThisMonthNaira: Math.round(paidThisMonthKobo / 100),
      netThisMonthNaira: Math.round(netThisMonthKobo / 100),
      feesThisMonthNaira: Math.round(feesThisMonthKobo / 100),
      processingFeesThisMonthNaira: Math.round(processingThisMonthKobo / 100),
      // An account from the other Paystack mode (made on test keys before go-live) shows as not
      // connected, so the owner reconnects it; until then Rehabify holds the clinic's share
      payoutAccount: payout && usableSubaccount(payout)
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
 * Remove a clinician from the clinic. Patients belong to the clinic, not the clinician: their
 * active patients move to the clinician the owner picks (`reassignToId`), who carries on with the
 * same care plan, notes and programmes. Without one they wait with the owner, shown as needing a
 * clinician, until the owner reassigns them.
 */
export const removeClinician = mutation({
  args: { clinicianId: v.id("users"), reassignToId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    // Taking someone's access away always works, even while the clinic is read-only
    const { user, clinic } = await getOwnerClinic(ctx, { allowBillingReadOnly: true });
    await ensureClinicApproved(ctx, clinic, { allowBillingReadOnly: true });
    if (args.clinicianId === user._id) {
      throw new ConvexError("You can't remove yourself from your own clinic");
    }
    if (args.reassignToId === args.clinicianId) {
      throw new ConvexError("Pick someone else to take over their patients.");
    }
    if (args.reassignToId) await assertStaffInClinic(ctx, clinic, args.reassignToId);
    const takeoverId = args.reassignToId ?? user._id;

    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q: any) => q.eq("userId", args.clinicianId))
      .first();
    if (!profile || profile.clinicId !== clinic._id) {
      throw new ConvexError("Clinician not found in your clinic");
    }

    const rels = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_physiotherapist", (q: any) => q.eq("physiotherapistId", args.clinicianId))
      .collect();
    let moved = 0;
    for (const rel of rels) {
      // Only the clinic's patients move; the clinician's own private patients stay with them
      if (rel.status !== "active" || rel.clinicId !== clinic._id) continue;
      const takeoverRel = await ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_patient_and_physiotherapist", (q: any) =>
          q.eq("patientId", rel.patientId).eq("physiotherapistId", takeoverId)
        )
        .first();
      if (takeoverRel) {
        await ctx.db.patch(takeoverRel._id, { status: "active", clinicId: clinic._id, endDate: undefined });
      } else {
        await ctx.db.insert("patientPhysiotherapistRelationships", {
          patientId: rel.patientId,
          physiotherapistId: takeoverId,
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

    // Approval that came only from the clinic's invitation ends with the clinic: working on
    // Rehabify on their own needs Rehabify's review like any other physio application
    const approval = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_user_id", (q: any) => q.eq("userId", args.clinicianId))
      .first();
    if (approval && approval.status === "approved" && isClinicInviteApproval(approval)) {
      await ctx.db.patch(approval._id, {
        status: "pending_review",
        submittedAt: Date.now(),
        comments: "Left their clinic; independent practice needs review",
      });
      // Clinic work skipped the physio application; working on their own starts with it
      await ctx.db.patch(args.clinicianId, { onboarded: false });
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
    const auth = await getClinicMemberOrNull(ctx, "team");
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
          clinicRoleId: user.clinicRoleId ?? null,
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
    const member = await requireClinicWrite(ctx, "team");
    const { user, clinic } = member;
    await assertStaffInClinic(ctx, clinic, args.clinicianId);

    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q: any) => q.eq("userId", args.clinicianId))
      .first();
    if (!profile || profile.clinicId !== clinic._id) {
      throw new ConvexError("Clinician not found in your clinic");
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
    const auth = await getClinicMemberOrNull(ctx);
    const clinic = auth?.clinic ?? null;

    if (!clinic || !auth) return null;

    return {
      _id: clinic._id,
      name: clinic.name,
      clinicNumber: clinic.clinicNumber ?? null,
      contactEmail: clinic.contactEmail || "",
      contactPhone: clinic.contactPhone || "",
      address: clinic.address || "",
      city: clinic.city || "",
      country: clinic.country || "Nigeria",
      description: clinic.description || "",
      website: clinic.website || "",
      state: clinic.state || "",
      specializations: clinic.specializations || [],
      services: clinic.services || [],
      facilities: clinic.facilities || [],
      logoUrl: clinic.logoUrl ?? null,
      priceList: clinic.priceList || [],
      workingHours: normalizeWorkingHours(clinic.workingHours),
      verificationStatus: verificationLabel(await getApprovalStatus(ctx, clinic.ownerId)),
      approvalStatus: (await getApprovalStatus(ctx, clinic.ownerId)) ?? "not_submitted",
    };
  },
});

const WEEK_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

/**
 * Opening hours are saved as { open, close, active } by settings but as
 * { isOpen, slots: [{ start, end }] } by onboarding. Always return the settings shape.
 */
export function normalizeWorkingHours(raw: any) {
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
    // Collected here rather than during onboarding
    services: v.optional(v.array(v.string())),
    facilities: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const member = await requireClinicWrite(ctx, "settings");
    const { clinic } = member;

    if (!args.name.trim()) {
      throw new ConvexError("Clinic name is required");
    }
    if (args.contactEmail?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.contactEmail.trim())) {
      throw new ConvexError("Enter a valid email address");
    }

    if (args.workingHours) {
      for (const [day, hours] of Object.entries(args.workingHours)) {
        if (hours.active && hours.open >= hours.close) {
          throw new ConvexError(`${day.charAt(0).toUpperCase() + day.slice(1)}: closing time must be after opening time`);
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
          throw new ConvexError(`Enter a price for "${item.name}"`);
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
      ...(args.services !== undefined && { services: cleanList(args.services) }),
      ...(args.facilities !== undefined && { facilities: cleanList(args.facilities) }),
    });

    return { success: true, message: "Clinic settings saved" };
  },
});

const cleanList = (items: string[]) =>
  Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).slice(0, 50);

/**
 * Set or remove the clinic logo shown at the top of the dashboard.
 * Upload with files.generateUploadUrl first, then pass the storage id (null removes it).
 */
export const updateClinicLogo = mutation({
  args: { storageId: v.union(v.id("_storage"), v.null()) },
  handler: async (ctx, args) => {
    const { clinic } = await requireClinicWrite(ctx, "settings");
    if (args.storageId === null) {
      await ctx.db.patch(clinic._id, { logoUrl: undefined });
      return { logoUrl: null };
    }
    const meta = await ctx.db.system.get(args.storageId);
    if (!meta) {
      throw new ConvexError("Upload failed. Please try again.");
    }
    if (!meta.contentType?.startsWith("image/") || meta.contentType === "image/svg+xml") {
      throw new ConvexError("The logo must be a PNG, JPG or WebP image.");
    }
    if (meta.size > 2 * 1024 * 1024) {
      throw new ConvexError("The logo must be smaller than 2 MB.");
    }
    const logoUrl = await ctx.storage.getUrl(args.storageId);
    if (!logoUrl) {
      throw new ConvexError("Upload failed. Please try again.");
    }
    await ctx.db.patch(clinic._id, { logoUrl });
    return { logoUrl };
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
    const clinic = (await getClinicMemberOrNull(ctx, "referrals"))?.clinic ?? null;

    if (!clinic) return [];

    // Only referrals a Rehabify admin has explicitly routed to this clinic
    const matched = await ctx.db
      .query("inboundReferrals")
      .withIndex("by_assigned_clinic", (q: any) => q.eq("assignedClinicId", clinic._id))
      .order("desc")
      .take(100);

    return await Promise.all(matched.map(async (ref: any) => ({
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
      // Set once accepted: the patient record it became, so the Patients list can show its progress
      patientId: ref.patientId ?? null,
      isRehabifyReferral: true, // Distinguishes from direct clinic patients
      // From a referring doctor: where they asked for care, and their letter
      careSetting: ref.careSetting ?? null,
      referralLetterName: ref.referralLetterStorageId ? ref.referralLetterName || "Referral letter" : null,
      referralLetterUrl: ref.referralLetterStorageId ? await ctx.storage.getUrl(ref.referralLetterStorageId) : null,
    })));
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
    const member = await requireClinicWrite(ctx, "referrals");
    const { user, clinic } = member;

    const referral = await ctx.db.get(args.referralId);
    if (!referral || referral.assignedClinicId !== clinic._id) {
      throw new ConvexError("Referral not found");
    }
    if (!CLINIC_ACCEPTABLE_REFERRAL.has(referral.status)) {
      throw new ConvexError("This referral has already been responded to");
    }

    const now = Date.now();

    if (args.action === "accept") {
      const clinicianId = await requireAssignedClinician(ctx, clinic, args.assignedClinicianId);

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
        throw new ConvexError("The referred patient's contact details belong to a non-patient account. Contact Rehabify support.");
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
      await ensureUserNumbers(ctx, patientUserId);

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

      await transitionReferral(ctx, args.referralId, "booked", {
        actorType: "clinic_owner",
        actorId: String(user._id),
        metadata: { clinicId: clinic._id },
        extraPatch: { assignedPhysiotherapistId: clinicianId, patientId: patientUserId },
      });
      // The patient now belongs to whoever referred them, so their clinic invoices earn the
      // partner's (or referring doctor's) commission. First partner wins.
      const accepted = await ctx.db.get(args.referralId);
      if (accepted) await attributeUserToReferral(ctx, patientUserId, accepted);

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
    const auth = await getClinicMemberOrNull(ctx);
    const HOUR = 3600000;

    if (!auth) return null;

    const { clinic } = auth;
    // Money and referral figures only for those whose role includes those pages
    const seesBilling = canUseArea(auth, "billing");
    const seesReferrals = canUseArea(auth, "referrals");
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

    const invoices: Doc<"invoices">[] = seesBilling
      ? await ctx.db
          .query("invoices")
          .withIndex("by_clinic_id", (q: any) => q.eq("clinicId", clinic._id))
          .collect()
      : [];
    const unpaid = invoices.filter((inv) => inv.status === "sent" || inv.status === "overdue" || inv.status === "partial_payment");

    const newReferralsCount = seesReferrals
      ? (
          await ctx.db
            .query("inboundReferrals")
            .withIndex("by_assigned_clinic", (q: any) => q.eq("assignedClinicId", clinic._id))
            .collect()
        ).filter((ref) => CLINIC_ACCEPTABLE_REFERRAL.has(ref.status)).length
      : 0;

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
 * Small counts for the sidebar: new referrals waiting for a response (shown on Patients),
 * only for those whose role includes Referrals.
 */
/**
 * What the patient reported between visits, for the clinic record: their check-ins (pain, mood,
 * concerns) and home-exercise logs from programmes the clinic's team sent.
 */
export const getClinicPatientReports = query({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    const member = await getClinicMemberOrNull(ctx, "patients");
    if (!member) return { checkIns: [], exerciseLogs: [] };
    await assertPatientInClinic(ctx, member.clinic, args.patientId);
    const staffIds = await getClinicStaffUserIds(ctx, member.clinic);

    const checkIns = (
      await ctx.db
        .query("patientCheckIns")
        .withIndex("by_patient", (q: any) => q.eq("patientId", args.patientId))
        .order("desc")
        .take(40)
    )
      .filter((c) => !c.physiotherapistId || staffIds.has(c.physiotherapistId))
      .slice(0, 20)
      .map((c) => ({
        _id: c._id,
        createdAt: c.createdAt,
        painScore: c.painScore,
        functionScore: c.functionScore,
        mood: c.mood,
        exercisesDone: c.exercisesDone,
        note: c.note,
        flagged: c.flagged,
        flagReason: c.flagReason,
        reviewedAt: c.reviewedAt,
      }));

    const programmes = new Map<string, Doc<"exercisePrograms"> | null>();
    const exerciseLogs = [];
    for (const log of await ctx.db
      .query("exerciseProgramLogs")
      .withIndex("by_patient", (q: any) => q.eq("patientId", args.patientId))
      .order("desc")
      .take(60)) {
      if (!programmes.has(log.programId)) programmes.set(log.programId, await ctx.db.get(log.programId));
      const programme = programmes.get(log.programId);
      if (!programme || !(programme.clinicId === member.clinic._id || staffIds.has(programme.createdBy))) continue;
      const item = programme.items[log.itemIndex] as { name?: string; exerciseId?: Id<"exercises"> } | undefined;
      const exercise = item?.exerciseId ? await ctx.db.get(item.exerciseId) : null;
      exerciseLogs.push({
        _id: log._id,
        createdAt: log.createdAt,
        programmeTitle: programme.title,
        exerciseName: item?.name ?? exercise?.name ?? "Exercise",
        setsDone: log.setsDone,
        painScore: log.painScore,
        difficulty: log.difficulty,
        note: log.note,
      });
      if (exerciseLogs.length >= 30) break;
    }

    return { checkIns, exerciseLogs };
  },
});

export const getClinicNavCounts = query({
  args: {},
  handler: async (ctx) => {
    const counts = { newReferrals: 0, bookingRequests: 0, needsClinician: 0, invitesPending: 0 };
    const auth = await getClinicMemberOrNull(ctx);
    if (!auth) return counts;
    const clinic = auth.clinic;

    if (canUseArea(auth, "referrals")) {
      const referrals = await ctx.db
        .query("inboundReferrals")
        .withIndex("by_assigned_clinic", (q: any) => q.eq("assignedClinicId", clinic._id))
        .collect();
      counts.newReferrals = referrals.filter((ref) => CLINIC_ACCEPTABLE_REFERRAL.has(ref.status)).length;
    }

    // Patients asking the clinic for a visit, another clinician or a service
    if (canUseArea(auth, "appointments")) {
      const open = await ctx.db
        .query("clinicBookingRequests")
        .withIndex("by_clinic_and_status", (q) => q.eq("clinicId", clinic._id).eq("status", "open"))
        .take(100);
      counts.bookingRequests = open.length;
    }

    if (canUseArea(auth, "patients")) {
      const rels = await ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_clinic", (q) => q.eq("clinicId", clinic._id))
        .collect();
      // Per patient in care: is anyone other than the owner (who doesn't treat) looking after them?
      const hasClinician = new Map<Id<"users">, boolean>();
      for (const rel of rels) {
        if (rel.status !== "active") continue;
        hasClinician.set(rel.patientId, (hasClinician.get(rel.patientId) ?? false) || rel.physiotherapistId !== clinic.ownerId);
      }
      for (const [patientId, treated] of hasClinician) {
        if (!treated) counts.needsClinician += 1;
        const patient = await ctx.db.get(patientId);
        // No email means no invite was sent, so there's nothing to wait for
        if (patient?.email && (patient.clerkId ?? "").startsWith("clinic_patient_")) counts.invitesPending += 1;
      }
    }

    return counts;
  },
});

/**
 * A clinician's own home in the clinic portal: their visits today, their patients and their
 * check-ins, instead of the clinic-wide overview the owner sees. Null for people outside a clinic,
 * the owner and front-desk staff.
 */
export const getMyClinicianHome = query({
  args: {},
  handler: async (ctx) => {
    let member: ClinicMember | null;
    try {
      member = await getClinicMemberOrNull(ctx);
    } catch {
      // e.g. the owner paused this clinician: the home explains that instead of erroring
      return null;
    }
    if (!member || member.kind !== "clinician") return null;
    const { clinic, user: me } = member;
    const seesSchedule = canUseArea(member, "appointments");
    const seesPatients = canUseArea(member, "patients");

    const HOUR = 3600000;
    const DAY = 24 * HOUR;
    const now = new Date();
    const nowTs = now.getTime();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfDay = startOfDay + DAY;
    const weekAhead = startOfDay + 7 * DAY;
    const isLive = (apt: Doc<"appointments">) =>
      !apt.isRecordOnly && apt.status !== "cancelled_by_patient" && apt.status !== "cancelled_by_therapist";

    const userCache = new Map<string, Doc<"users"> | null>();
    const getUser = async (id: Id<"users">) => {
      if (!userCache.has(id)) userCache.set(id, await ctx.db.get(id));
      return userCache.get(id) ?? null;
    };
    const fullName = (u: Doc<"users"> | null) =>
      u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "Patient" : "Patient";

    // My visits from today through the coming week (the clinic schedule includes all of these)
    const myWeek: Doc<"appointments">[] = seesSchedule
      ? (
          await ctx.db
            .query("appointments")
            .withIndex("by_physiotherapist_id_and_time", (q: any) =>
              q.eq("physiotherapistId", me._id).gte("startTime", startOfDay).lt("startTime", weekAhead)
            )
            .collect()
        ).filter(isLive)
      : [];
    myWeek.sort((a, b) => a.startTime - b.startTime);

    const today = await Promise.all(
      myWeek
        .filter((apt) => apt.startTime < endOfDay)
        .map(async (apt) => ({
          _id: apt._id,
          patientId: apt.patientId,
          startTime: apt.startTime,
          endTime: apt.endTime,
          appointmentType: apt.appointmentType ?? "in-person",
          status: apt.status,
          patientName: fullName(await getUser(apt.patientId)),
        }))
    );
    const upcomingWeekCount = myWeek.filter(
      (apt) => apt.startTime >= endOfDay && (apt.status === "scheduled" || apt.status === "confirmed")
    ).length;

    if (!seesPatients) {
      return {
        clinicName: clinic.name,
        seesSchedule,
        seesPatients,
        today,
        upcomingWeekCount,
        patientsCount: 0,
        patients: [],
        checkInsCount: 0,
        checkIns: [],
      };
    }

    // Patients in my care (same rule as the clinic's patient list: an active relationship)
    const myRels = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_physiotherapist", (q: any) => q.eq("physiotherapistId", me._id))
      .filter((q: any) => q.eq(q.field("status"), "active"))
      .collect();
    const myPatientIds = Array.from(new Set(myRels.map((rel) => rel.patientId)));

    const patients = (
      await Promise.all(
        myPatientIds.slice(0, 60).map(async (patientId) => {
          const patient = await getUser(patientId);
          if (!patient) return null;
          const visits = (
            await ctx.db
              .query("appointments")
              .withIndex("by_patient_id_and_time", (q: any) => q.eq("patientId", patientId))
              .order("desc")
              .take(20)
          ).filter((apt) => isLive(apt) && apt.physiotherapistId === me._id);
          const lastVisitAt = visits.find((apt) => apt.startTime < nowTs)?.startTime ?? null;
          const nextVisitAt =
            visits
              .filter((apt) => apt.startTime >= nowTs && (apt.status === "scheduled" || apt.status === "confirmed"))
              .sort((a, b) => a.startTime - b.startTime)[0]?.startTime ?? null;
          return {
            patientId,
            name: fullName(patient),
            imageUrl: patient.imageUrl ?? null,
            lastVisitAt,
            nextVisitAt,
          };
        })
      )
    )
      .filter((row): row is NonNullable<typeof row> => row !== null)
      // Next visit soonest first, then the ones with nothing booked
      .sort(
        (a, b) =>
          (a.nextVisitAt ?? Number.MAX_SAFE_INTEGER) - (b.nextVisitAt ?? Number.MAX_SAFE_INTEGER) ||
          a.name.localeCompare(b.name)
      );

    const checkIns = await buildFollowUpRows(ctx, clinic, myPatientIds);

    return {
      clinicName: clinic.name,
      seesSchedule,
      seesPatients,
      today,
      upcomingWeekCount,
      patientsCount: myPatientIds.length,
      patients: patients.slice(0, 6),
      checkInsCount: checkIns.length,
      checkIns: checkIns.slice(0, 5),
    };
  },
});


// ─────────────────────────────────────────────────────────────────────────────
// 11. ACCESS, ROLES AND TEAM MEMBERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Who is using the clinic dashboard and what they can see. Drives the sidebar,
 * page access and the clinic name/logo header. Anyone who isn't a clinic owner or team
 * member gets mode "none" (with their role) so the portal can send them to the right place.
 */
export const getMyClinicAccess = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { mode: "none" as const, signedIn: false, role: null };
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return { mode: "none" as const, signedIn: true, role: null };
    const member = await resolveClinicMember(ctx, user);
    if (!member) return { mode: "none" as const, signedIn: true, role: user.role ?? null };

    const owner = member.isOwner ? user : await ctx.db.get(member.clinic.ownerId);
    const approvalStatus = (await getApprovalStatus(ctx, member.clinic.ownerId)) ?? "not_submitted";

    // A clinician who also has their own approved Rehabify physio account can switch to it.
    // Same rule as hasOwnPhysioAccount in components/clinic/clinician-routing.ts, and the same
    // approval row the physio portal reads (physioSetup.getMySetupStatus takes the first one).
    let hasOwnPhysioPortal = false;
    if (member.kind === "clinician" && user.onboarded) {
      const ownApproval = await ctx.db
        .query("accountApprovalStatus")
        .withIndex("by_user_id", (q: any) => q.eq("userId", user._id))
        .first();
      hasOwnPhysioPortal = ownApproval?.status === "approved";
    }

    return {
      mode: member.isOwner ? ("owner" as const) : ("staff" as const),
      signedIn: true,
      clinicName: member.clinic.name,
      logoUrl: member.clinic.logoUrl ?? null,
      permissions: member.permissions,
      roleName: member.roleName,
      staffKind: member.kind,
      firstName: user.firstName?.trim() || null,
      hasOwnPhysioPortal,
      ownerOnboarded: Boolean(owner?.onboarded),
      approvalStatus,
      suspended: !member.isOwner && Boolean(user.status) && user.status !== "active",
      // The whole clinic was suspended by Rehabify (changes are refused server-side)
      clinicSuspended: member.clinic.status === "suspended",
      clinicSuspendedReason: member.clinic.status === "suspended" ? (member.clinic.suspendedReason ?? null) : null,
      // Read-only for an unpaid Rehabify invoice (view, export and pay still work)
      billingReadOnly: (await subscriptionForClinic(ctx, member.clinic._id))?.status === "read_only",
    };
  },
});

/** Dashboard roles for this clinic, with how many team members have each. */
export const listClinicRoles = query({
  args: {},
  handler: async (ctx) => {
    const member = await getClinicMemberOrNull(ctx);
    if (!member) return [];
    const [roles, members] = await Promise.all([
      ctx.db.query("clinicRoles").withIndex("by_clinic", (q: any) => q.eq("clinicId", member.clinic._id)).collect(),
      ctx.db.query("users").withIndex("by_clinic_id", (q: any) => q.eq("clinicId", member.clinic._id)).collect(),
    ]);
    return roles
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((role) => ({
        _id: role._id,
        name: role.name,
        permissions: role.permissions.filter(isClinicArea),
        memberCount: members.filter((m) => m.clinicRoleId === role._id && isClinicTeamRole(m.role)).length,
      }));
  },
});

/** Create or rename a role and choose its pages. No pages ticked means full access. */
export const saveClinicRole = mutation({
  args: {
    roleId: v.optional(v.id("clinicRoles")),
    name: v.string(),
    permissions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { clinic } = await getOwnerClinic(ctx);
    const name = args.name.trim().replace(/\s+/g, " ");
    if (!name) throw new ConvexError("Give the role a name, e.g. Clinician");
    if (name.length > 40) throw new ConvexError("Keep the role name under 40 characters");
    const permissions = Array.from(new Set(args.permissions.filter(isClinicArea)));

    const existing = await ctx.db
      .query("clinicRoles")
      .withIndex("by_clinic", (q: any) => q.eq("clinicId", clinic._id))
      .collect();
    if (existing.some((role) => role._id !== args.roleId && role.name.toLowerCase() === name.toLowerCase())) {
      throw new ConvexError(`You already have a role called "${name}"`);
    }

    const now = Date.now();
    if (args.roleId) {
      const role = existing.find((r) => r._id === args.roleId);
      if (!role) throw new ConvexError("Role not found");
      await ctx.db.patch(role._id, { name, permissions, updatedAt: now });
      return { roleId: role._id };
    }
    if (existing.length >= 20) throw new ConvexError("You can have up to 20 roles");
    const roleId = await ctx.db.insert("clinicRoles", { clinicId: clinic._id, name, permissions, createdAt: now, updatedAt: now });
    return { roleId };
  },
});

/** Delete a role. Anyone who had it falls back to the default (clinicians: Appointments and Patients; front desk: every page). */
export const deleteClinicRole = mutation({
  args: { roleId: v.id("clinicRoles") },
  handler: async (ctx, args) => {
    const { clinic } = await getOwnerClinic(ctx);
    const role = await ctx.db.get(args.roleId);
    if (!role || role.clinicId !== clinic._id) throw new ConvexError("Role not found");

    const members = await ctx.db
      .query("users")
      .withIndex("by_clinic_id", (q: any) => q.eq("clinicId", clinic._id))
      .collect();
    for (const m of members) {
      if (m.clinicRoleId === role._id) await ctx.db.patch(m._id, { clinicRoleId: undefined });
    }
    const invitations = await ctx.db
      .query("clinicStaffInvitations")
      .withIndex("by_clinic", (q: any) => q.eq("clinicId", clinic._id))
      .collect();
    for (const inv of invitations) {
      if (inv.clinicRoleId === role._id) await ctx.db.patch(inv._id, { clinicRoleId: undefined });
    }
    await ctx.db.delete(role._id);
    return { success: true };
  },
});

/** Give a team member a role, or null for the default (clinicians: Appointments and Patients; front desk: every page). */
export const setMemberClinicRole = mutation({
  args: { memberId: v.id("users"), roleId: v.union(v.id("clinicRoles"), v.null()) },
  handler: async (ctx, args) => {
    const { clinic } = await getOwnerClinic(ctx);
    const target = await ctx.db.get(args.memberId);
    if (!target || target.clinicId !== clinic._id || !isClinicTeamRole(target.role)) {
      throw new ConvexError("This person isn't on your team");
    }
    if (args.roleId) {
      const role = await ctx.db.get(args.roleId);
      if (!role || role.clinicId !== clinic._id) throw new ConvexError("Role not found");
    }
    await ctx.db.patch(target._id, { clinicRoleId: args.roleId ?? undefined });
    if ((target.clinicRoleId ?? null) !== (args.roleId ?? null)) {
      await logSecurityEvent(ctx, "permission_updated", {
        userId: target._id,
        clinicId: clinic._id,
        details: { from: target.clinicRoleId ?? "default_access", to: args.roleId ?? "default_access" },
      });
    }
    return { success: true };
  },
});

/** Front-desk team members (receptionists, administrators): dashboard users who don't treat patients. */
export const getClinicFrontDeskStaff = query({
  args: {},
  handler: async (ctx) => {
    const member = await getClinicMemberOrNull(ctx, "team");
    if (!member) return [];
    const users = await ctx.db
      .query("users")
      .withIndex("by_clinic_id", (q: any) => q.eq("clinicId", member.clinic._id))
      .collect();
    return users
      .filter((u) => u.role === "clinic_staff" && u.status !== "terminated")
      .map((u) => ({
        userId: u._id,
        firstName: u.firstName || "",
        lastName: u.lastName || "",
        email: u.email || "",
        status: u.status ?? "active",
        clinicRoleId: (u.clinicRoleId ?? null) as Id<"clinicRoles"> | null,
        joinedAt: u.joinedAt ?? u._creationTime,
      }));
  },
});

/** Remove a front-desk team member from the clinic (their account stays, without clinic access). */
export const removeFrontDeskStaff = mutation({
  args: { memberId: v.id("users") },
  handler: async (ctx, args) => {
    const { clinic } = await getOwnerClinic(ctx, { allowBillingReadOnly: true });
    const target = await ctx.db.get(args.memberId);
    if (!target || target.clinicId !== clinic._id || target.role !== "clinic_staff") {
      throw new ConvexError("This person isn't on your front-desk team");
    }
    await ctx.db.patch(target._id, { clinicId: undefined, clinicRoleId: undefined, status: "terminated" });
    return { success: true };
  },
});

/** What the "Get your clinic ready" checklist on the home page reads. */
export const getClinicSetupProgress = query({
  args: {},
  handler: async (ctx) => {
    const member = await getClinicMemberOrNull(ctx);
    if (!member) return null;
    const { clinic } = member;
    const [payout, patientRel, clinician, invitation] = await Promise.all([
      ctx.db.query("clinicPayoutAccounts").withIndex("by_clinic_id", (q: any) => q.eq("clinicId", clinic._id)).first(),
      ctx.db.query("patientPhysiotherapistRelationships").withIndex("by_clinic", (q: any) => q.eq("clinicId", clinic._id)).first(),
      ctx.db.query("physiotherapistProfiles").withIndex("by_clinic_id", (q: any) => q.eq("clinicId", clinic._id)).first(),
      ctx.db.query("clinicStaffInvitations").withIndex("by_clinic", (q: any) => q.eq("clinicId", clinic._id)).first(),
    ]);
    return {
      prices: (clinic.priceList?.length ?? 0) > 0,
      payout: payout !== null,
      patient: patientRel !== null,
      // Sending an invite counts: the step is "Invite a clinician"
      team: clinician !== null || invitation !== null,
      logo: Boolean(clinic.logoUrl),
    };
  },
});


/**
 * Everyone who can be assigned patients: the owner plus active clinicians.
 * `isMe` marks the signed-in person; front-desk staff are never clinicians.
 */
export const getClinicClinicianOptions = query({
  args: {},
  handler: async (ctx) => {
    const member = await getClinicMemberOrNull(ctx);
    if (!member) return [];
    const { clinic, user: me } = member;
    const fullName = (u: Doc<"users">) => `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "Clinician";

    const options: { id: Id<"users">; name: string; isOwner: boolean; isMe: boolean }[] = [];
    const owner = await ctx.db.get(clinic.ownerId);
    if (owner) options.push({ id: owner._id, name: fullName(owner), isOwner: true, isMe: owner._id === me._id });

    const profiles = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_clinic_id", (q: any) => q.eq("clinicId", clinic._id))
      .collect();
    for (const profile of profiles) {
      const clinician = await ctx.db.get(profile.userId);
      // Membership follows the profile, same as assertStaffInClinic
      if (!clinician || clinician._id === clinic.ownerId) continue;
      if (clinician.status && clinician.status !== "active") continue;
      options.push({ id: clinician._id, name: fullName(clinician), isOwner: false, isMe: clinician._id === me._id });
    }
    return options;
  },
});
// ─────────────────────────────────────────────────────────────────────────────
// Data export: included in every plan and allowed while the clinic is read-only
// (Clinic Master SaaS Agreement 7.4 and 15.4). Rows go to the browser, which writes the CSV.
// ─────────────────────────────────────────────────────────────────────────────

const EXPORT_CAP = 5000;

const exportDateTime = (ms: number | null | undefined) =>
  typeof ms === "number" && Number.isFinite(ms) ? `${zonedDateKey(ms)} ${zonedTimeKey(ms)}` : "";
const exportDate = (ms: number | null | undefined) =>
  typeof ms === "number" && Number.isFinite(ms) ? zonedDateKey(ms) : "";
const exportNaira = (kobo: number | null | undefined) =>
  typeof kobo === "number" && Number.isFinite(kobo) ? (kobo / 100).toFixed(2) : "";

/** The clinic's patients, appointments or invoices as plain rows (Lagos dates, naira amounts). */
export const exportClinicData = query({
  args: { kind: v.union(v.literal("patients"), v.literal("appointments"), v.literal("invoices")) },
  handler: async (ctx, args): Promise<{ rows: Record<string, string>[]; capped: boolean }> => {
    const member = await getClinicMember(ctx);
    // The clinic's whole record: for the owner and team members with full access
    if (member.permissions !== "all") {
      throw new ConvexError("Data export is for the clinic owner and team members with full access.");
    }
    const { clinic } = member;

    const people = new Map<Id<"users">, Doc<"users"> | null>();
    const person = async (id: Id<"users">) => {
      if (!people.has(id)) people.set(id, await ctx.db.get(id));
      return people.get(id) ?? null;
    };
    const nameOf = (u: Doc<"users"> | null) => (u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "" : "");

    const clinicRels = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_clinic", (q: any) => q.eq("clinicId", clinic._id))
      .collect();

    if (args.kind === "patients") {
      // One row per patient: the active relationship when there is one, else the latest. Only the
      // clinic's: a clinician's private patients aren't the clinic's records
      const best = new Map<Id<"users">, Doc<"patientPhysiotherapistRelationships">>();
      for (const rel of clinicRels) {
        const current = best.get(rel.patientId);
        if (
          !current ||
          (rel.status === "active" && current.status !== "active") ||
          (rel.status !== "active" && current.status !== "active" && (rel.endDate ?? 0) > (current.endDate ?? 0))
        ) {
          best.set(rel.patientId, rel);
        }
      }
      const rels = Array.from(best.values()).sort((a, b) => b.startDate - a.startDate);
      const rows: Record<string, string>[] = [];
      for (const rel of rels.slice(0, EXPORT_CAP)) {
        const patient = await person(rel.patientId);
        if (!patient) continue;
        rows.push({
          "Rehabify ID": patient.patientNumber ?? "",
          "First name": patient.firstName ?? "",
          "Last name": patient.lastName ?? "",
          Email: patient.email ?? "",
          Phone: patient.phoneNumber ?? "",
          Clinician: nameOf(await person(rel.physiotherapistId)),
          "Care status": rel.status === "active" ? "In care" : rel.notes === "Care paused" ? "Paused" : "Discharged",
          Source: rel.source === "rehabify_referral" ? "Referred by Rehabify" : "Clinic patient",
          Started: exportDate(rel.startDate),
          Ended: exportDate(rel.endDate),
        });
      }
      return { rows, capped: rels.length > EXPORT_CAP };
    }

    if (args.kind === "appointments") {
      const clinicPatientIds = new Set(clinicRels.map((rel) => rel.patientId));
      const staffIds = await getClinicStaffUserIds(ctx, clinic);
      const [atClinic, ...byStaff] = await Promise.all([
        ctx.db
          .query("appointments")
          .withIndex("by_clinic_id_and_time", (q: any) => q.eq("clinicId", clinic._id))
          .order("desc")
          .take(EXPORT_CAP + 1),
        ...Array.from(staffIds).map((id) =>
          ctx.db
            .query("appointments")
            .withIndex("by_physiotherapist_id_and_time", (q: any) => q.eq("physiotherapistId", id))
            .order("desc")
            .take(2000)
        ),
      ]);
      const byId = new Map<Id<"appointments">, Doc<"appointments">>();
      for (const apt of atClinic) byId.set(apt._id, apt);
      // Older visits saved without the clinic: only the clinic's own patients, never a
      // clinician's private practice
      for (const apt of byStaff.flat()) {
        if (apt.clinicId === undefined && clinicPatientIds.has(apt.patientId)) byId.set(apt._id, apt);
      }
      const appointments = Array.from(byId.values())
        .filter((apt) => !apt.isRecordOnly)
        .sort((a, b) => b.startTime - a.startTime);
      const rows: Record<string, string>[] = [];
      for (const apt of appointments.slice(0, EXPORT_CAP)) {
        const patient = await person(apt.patientId);
        rows.push({
          Date: exportDate(apt.startTime),
          Start: zonedTimeKey(apt.startTime),
          End: zonedTimeKey(apt.endTime),
          Patient: nameOf(patient),
          "Patient ID": patient?.patientNumber ?? "",
          Clinician: nameOf(await person(apt.physiotherapistId)),
          Service: apt.serviceType,
          Type: apt.isOnline || apt.appointmentType === "telehealth" ? "Online" : "In person",
          Status: apt.status.replace(/_/g, " "),
          Location: apt.location ?? "",
        });
      }
      return { rows, capped: appointments.length > EXPORT_CAP || atClinic.length > EXPORT_CAP };
    }

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_clinic_id", (q: any) => q.eq("clinicId", clinic._id))
      .order("desc")
      .take(EXPORT_CAP + 1);
    const rows: Record<string, string>[] = [];
    for (const inv of invoices.slice(0, EXPORT_CAP)) {
      const patient = await person(inv.patientId);
      rows.push({
        Invoice: inv.invoiceNumber,
        Patient: nameOf(patient),
        "Patient ID": patient?.patientNumber ?? "",
        Items: inv.items.map((item) => item.description).join("; "),
        "Amount (NGN)": exportNaira(inv.feeBreakdown?.total ?? inv.totalAmount),
        Status: inv.status === "sent" ? "unpaid" : inv.status.replace(/_/g, " "),
        Issued: exportDate(inv.issueDate),
        Due: exportDate(inv.dueDate),
        Paid: exportDateTime(inv.paymentDate),
        "Payment method": inv.paymentMethod?.replace(/_/g, " ") ?? "",
        "Refunded (NGN)": inv.refundedAmount ? exportNaira(inv.refundedAmount) : "",
      });
    }
    return { rows, capped: invoices.length > EXPORT_CAP };
  },
});

/**
 * One-off (28 Oct 2026): clinics now see only care tagged with the clinic, never a clinician's
 * private patients. Older care links made inside a clinic could be untagged; this tags those:
 * the owner's (they have no private practice), the patient's clinic matching, or a clinician's
 * started after they joined the clinic. Run once after deploying:
 * npx convex run --prod clinicTools:backfillClinicRelationshipTags
 */
export const backfillClinicRelationshipTags = internalMutation({
  args: {},
  handler: async (ctx) => {
    let tagged = 0;
    for (const clinic of await ctx.db.query("clinics").collect()) {
      const profiles = await ctx.db
        .query("physiotherapistProfiles")
        .withIndex("by_clinic_id", (q: any) => q.eq("clinicId", clinic._id))
        .collect();
      const staff = [clinic.ownerId, ...profiles.map((p) => p.userId)];
      for (const staffId of new Set(staff)) {
        const member = await ctx.db.get(staffId);
        if (!member) continue;
        const rels = await ctx.db
          .query("patientPhysiotherapistRelationships")
          .withIndex("by_physiotherapist", (q: any) => q.eq("physiotherapistId", staffId))
          .collect();
        for (const rel of rels) {
          if (rel.clinicId) continue;
          const patient = await ctx.db.get(rel.patientId);
          const profile = await ctx.db
            .query("patientProfiles")
            .withIndex("by_user_id", (q: any) => q.eq("userId", rel.patientId))
            .first();
          const clinicsPatient = patient?.clinicId === clinic._id || profile?.clinicId === clinic._id;
          const sinceJoining = member.clinicId === clinic._id && member.joinedAt !== undefined && rel.startDate >= member.joinedAt;
          if (staffId === clinic.ownerId || clinicsPatient || sinceJoining) {
            await ctx.db.patch(rel._id, { clinicId: clinic._id });
            tagged++;
          }
        }
      }
    }
    return { tagged };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Patients' requests to the clinic (another appointment, clinician or service)
// ─────────────────────────────────────────────────────────────────────────────

const REQUEST_KIND_LABELS: Record<string, string> = {
  appointment: "Another appointment",
  change_clinician: "A different clinician",
  service: "A service",
};

/** Open requests from the clinic's patients (Appointments → Requests), oldest first. */
export const getClinicBookingRequests = query({
  args: {},
  handler: async (ctx) => {
    const member = await getClinicMemberOrNull(ctx, "appointments");
    if (!member) return [];
    const rows = await ctx.db
      .query("clinicBookingRequests")
      .withIndex("by_clinic_and_status", (q: any) => q.eq("clinicId", member.clinic._id).eq("status", "open"))
      .take(100);
    return await Promise.all(
      rows.map(async (row) => {
        const patient = await ctx.db.get(row.patientId);
        const care = (
          await ctx.db
            .query("patientPhysiotherapistRelationships")
            .withIndex("by_patient", (q: any) => q.eq("patientId", row.patientId))
            .collect()
        ).find((rel) => rel.status === "active" && rel.clinicId === member.clinic._id && rel.physiotherapistId !== member.clinic.ownerId);
        const clinician = care ? await ctx.db.get(care.physiotherapistId) : null;
        return {
          _id: row._id,
          patientId: row.patientId,
          patientName: patient ? `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim() || "Patient" : "Patient",
          patientPhone: patient?.phoneNumber ?? null,
          kind: row.kind,
          kindLabel: REQUEST_KIND_LABELS[row.kind] ?? "Request",
          message: row.message ?? null,
          preferredTimes: row.preferredTimes ?? null,
          service: row.service ?? null,
          clinicianId: clinician?._id ?? null,
          clinicianName: clinician ? `${clinician.firstName ?? ""} ${clinician.lastName ?? ""}`.trim() : null,
          createdAt: row.createdAt,
        };
      })
    );
  },
});

/** Close a patient's request: booked or sorted ("done"), or not possible ("declined", with a reason). */
export const resolveClinicBookingRequest = mutation({
  args: {
    requestId: v.id("clinicBookingRequests"),
    outcome: v.union(v.literal("done"), v.literal("declined")),
    response: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, clinic } = await requireClinicWrite(ctx, "appointments");
    const request = await ctx.db.get(args.requestId);
    if (!request || request.clinicId !== clinic._id) throw new ConvexError("Request not found");
    if (request.status !== "open") return { changed: false };
    const response = args.response?.trim().slice(0, 500) || undefined;
    if (args.outcome === "declined" && !response) throw new ConvexError("Tell the patient why, so they know what to do next.");
    const now = Date.now();
    await ctx.db.patch(request._id, { status: args.outcome, handledAt: now, handledBy: user._id, response });
    await insertNotification(ctx, {
      userId: request.patientId,
      type: "clinic_booking_request",
      priority: "medium",
      status: "pending",
      createdAt: now,
      payload: {
        title: args.outcome === "done" ? `${clinic.name} sorted your request` : `${clinic.name} replied to your request`,
        body: response ?? (args.outcome === "done" ? "Check your appointments for the details." : "They couldn't do this one."),
        data: { entityId: String(request._id), entityType: "clinic_booking_request" },
        link: "/dashboard/patient/appointments",
      },
    });
    return { changed: true };
  },
});
