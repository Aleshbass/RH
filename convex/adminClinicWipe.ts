/**
 * Wiping a clinic completely (owner, 26 Nov 2026: "Goshen Physiotherapy", RH-CL-100016, so they
 * can onboard again from scratch with the same email). Run from the CLI by Rehabify only, never
 * from the website:
 *
 *   1. preview: read-only. The owner, the invited clinicians, the patients the clinic holds, and
 *      how many visits, notes, invoices and so on a wipe removes.
 *   2. wipe: removes the clinic and everything in it. The owner and every clinician on the team
 *      are deleted with their sign-in, so their emails are free to sign up again. A patient is
 *      deleted only when the clinic is their only care on Rehabify; anyone also cared for
 *      elsewhere just loses the clinic's link and records. Refuses when real (live) money moved,
 *      unless `force` is passed.
 *
 *   npx convex run --prod adminClinicWipe:preview '{"clinicNumber":"RH-CL-100016"}'
 *   npx convex run --prod adminClinicWipe:wipe '{"clinicNumber":"RH-CL-100016","confirm":"WIPE RH-CL-100016"}'
 */
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const mask = (email: string | undefined) => (email ? email.replace(/^(.).*?(@.*)$/, "$1***$2") : null);
const personName = (u: Doc<"users"> | null) => [u?.firstName, u?.lastName].filter(Boolean).join(" ") || "(no name)";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Rows are found by table name, so the query is untyped here
const rowsBy = (ctx: QueryCtx, table: string, index: string, field: string, value: string, n: number) =>
  (ctx.db.query(table as any) as any).withIndex(index, (q: any) => q.eq(field, value)).take(n) as Promise<any[]>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Everything a person owns, by [table, index, field]. Their users row goes last. */
const PERSON_ROWS: [string, string, string][] = [
  ["joyConnectCodes", "by_patient", "patientId"],
  ["patientJoinLinks", "by_patient", "patientId"],
  ["patientPinLogins", "by_user", "userId"],
  ["patientPlanEntitlements", "by_patient", "patientId"],
  ["patientPlanCards", "by_patient_status", "patientId"],
  ["payoutRunTransfers", "by_user", "userId"],
  ["payoutRecipients", "by_user", "userId"],
  ["careSignals", "by_patient_kind", "patientId"],
  ["joyOperationalAudit", "by_patient", "patientUserId"],
  ["patientInvitations", "by_patient_user", "patientUserId"],
  ["patientInvitations", "by_physiotherapist", "physiotherapistId"],
  ["clinicThreadReads", "by_user_and_thread", "userId"],
  ["clinicBookingRequests", "by_patient", "patientId"],
  ["clinicShifts", "by_user_and_clock_in", "userId"],
  ["clinicClockNudges", "by_user_date_kind", "userId"],
  ["patientPhysiotherapistRelationships", "by_patient", "patientId"],
  ["patientPhysiotherapistRelationships", "by_physiotherapist", "physiotherapistId"],
  ["physioProfileViews", "by_user_id", "userId"],
  ["patientPhysioViews", "by_patient", "patientId"],
  ["notifications", "by_user", "userId"],
  ["pushSubscriptions", "by_user", "userId"],
  ["pushPreferences", "by_user", "userId"],
  ["accountApprovalStatus", "by_user_id", "userId"],
  ["physiotherapistDocuments", "by_physiotherapist_id", "physiotherapistId"],
  ["familyAccessGrants", "by_patient_user_id", "patientUserId"],
  ["careCircleInvites", "by_patient", "patientUserId"],
  ["appointments", "by_patient_id_and_time", "patientId"],
  ["appointments", "by_physiotherapist_id_and_time", "physiotherapistId"],
  ["recurringSeries", "by_patient_id", "patientId"],
  ["recurringSeries", "by_physiotherapist_id", "physiotherapistId"],
  ["sessionLogs", "by_patient_id_and_date", "patientId"],
  ["sessionLogRevisions", "by_patient", "patientId"],
  ["exercises", "by_creator", "createdBy"],
  ["treatmentTemplates", "by_created_by", "createdBy"],
  ["careEpisodes", "by_patient", "patientId"],
  ["careEpisodes", "by_physiotherapist_and_status", "physiotherapistId"],
  ["careMoments", "by_person_and_occurrence", "personId"],
  ["patientCheckIns", "by_patient", "patientId"],
  ["patientCheckIns", "by_physiotherapist", "physiotherapistId"],
  ["treatmentPlans", "by_patient", "patientId"],
  ["progressReports", "by_patient", "patientId"],
  ["progressReports", "by_physiotherapist", "physiotherapistId"],
  ["treatmentProgress", "by_patient", "patientId"],
  ["exerciseCompletions", "by_patient", "patientId"],
  ["prescribedExercises", "by_patient_id", "patientId"],
  ["exerciseProgress", "by_patient_id_and_date", "patientId"],
  ["invoices", "by_patient_id", "patientId"],
  ["invoices", "by_physiotherapist_id", "physiotherapistId"],
  ["referringDoctorProfiles", "by_user_id", "userId"],
  ["inboundReferrals", "by_patient", "patientId"],
  ["loanApplications", "by_patient", "patientId"],
  ["loanApplications", "by_physiotherapist", "physiotherapistId"],
  ["referrals", "by_patient_id", "patientId"],
  ["messages", "by_sender", "senderId"],
  ["videoCalls", "by_initiator", "initiatorId"],
  ["videoCalls", "by_patient_id_and_scheduled", "patientId"],
  ["notificationRetryQueue", "by_user_id", "userId"],
  ["payments", "by_user_id", "userId"],
  ["payouts", "by_user_id", "userId"],
  ["bankAccountsNew", "by_user_id", "userId"],
  ["bulkTransfers", "by_user_id", "userId"],
  ["surveys", "by_created_by", "createdBy"],
  ["patients", "by_user_id", "userId"],
  ["settings", "by_user", "userId"],
  ["analytics_events", "by_user", "userId"],
  ["videoCallMessages", "by_sender", "senderId"],
  ["videoCallParticipants", "by_user_id", "userId"],
  ["physiotherapistLocations", "by_physiotherapist", "physiotherapistId"],
  ["appointmentFeedback", "by_patient", "patientId"],
  ["patientFeedback", "by_patient", "patientId"],
  ["userActivity", "by_user", "userId"],
  ["splitConfigurations", "by_physiotherapist_id", "physiotherapistId"],
  ["transactions", "by_user_id", "userId"],
  ["systemLogs", "by_user_id", "userId"],
  ["calendarEvents", "by_user_id", "userId"],
  ["googleCalendarCredentials", "by_user_id", "userId"],
  ["googleBusyCache", "by_user_id", "userId"],
  ["userCalendars", "by_user_id", "userId"],
  ["calendarWatchChannels", "by_user_id", "userId"],
  ["bankAccounts", "by_user_id", "userId"],
  ["physiotherapistBankAccounts", "by_physiotherapist_id", "physiotherapistId"],
  ["assessments", "by_patient", "patientId"],
  ["assessments", "by_physiotherapist", "physiotherapistId"],
  ["marketplaceReviews", "by_physiotherapist", "physiotherapistId"],
  ["marketplaceReviews", "by_patient", "patientId"],
  ["marketplaceBookings", "by_physiotherapist", "physiotherapistId"],
  ["marketplaceBookings", "by_patient", "patientId"],
  ["physioNetworkAgreements", "by_physiotherapist", "physiotherapistId"],
  ["assistedCareApplications", "by_patient", "patientId"],
  ["accessAwards", "by_patient", "patientId"],
  ["accessAwards", "by_physiotherapist", "physiotherapistId"],
  ["joyIntakes", "by_patient", "patientId"],
  ["joyJourneyEvents", "by_patient", "patientId"],
  ["dashboardAccessLinks", "by_user", "userId"],
  ["joySpecialistReviews", "by_patient", "patientId"],
  ["marketplaceTransactions", "by_user", "userId"],
  ["physiotherapistReports", "by_physiotherapist", "physiotherapistId"],
  ["physioRetentionBonuses", "by_physio", "physiotherapistId"],
  ["physioRetentionPenalties", "by_physio", "physiotherapistId"],
  ["awadocSessions", "by_physiotherapist", "physiotherapistId"],
  ["awadocTherapies", "by_physio", "physiotherapistId"],
  ["awadocVisits", "by_physio_and_start", "physiotherapistId"],
  ["physioSubscriptions", "by_physio", "physioId"],
  ["physioPlanCards", "by_physio_status", "physioId"],
  ["physioPlanPayments", "by_physio", "physioId"],
  ["physioJoyPatients", "by_physio_month", "physioId"],
  ["physioJoyPatients", "by_patient_month", "patientId"],
  ["physioScribeCredits", "by_physio", "physioId"],
  ["physioPlanGrants", "by_physio", "physioId"],
  ["loanRequests", "by_patient_user", "patientUserId"],
  ["exercisePrograms", "by_patient", "patientId"],
  ["exercisePrograms", "by_creator", "createdBy"],
  ["programTemplates", "by_creator", "createdBy"],
  ["guidedSessions", "by_patient", "patientId"],
  ["exerciseProgramLogs", "by_patient", "patientId"],
  ["exerciseProgramTicks", "by_patient", "patientId"],
  ["libraryLicenceMembers", "by_user", "userId"],
  ["learnRegistrations", "by_user", "userId"],
  ["learnCourseEnrollments", "by_user_course", "userId"],
  ["policyAcceptances", "by_user_document", "userId"],
  ["agreementSignatures", "by_user_agreement", "userId"],
  ["agreementReminders", "by_user_agreement", "userId"],
  ["cookieConsents", "by_user", "userId"],
  ["learnProfiles", "by_user", "userId"],
  ["communityRoles", "by_user", "userId"],
  ["vitalSigns", "by_patient", "patientId"],
  ["medications", "by_patient", "patientId"],
  ["medicationLogs", "by_patient", "patientId"],
  ["symptomLogs", "by_patient", "patientId"],
  ["painLogs", "by_patient", "patientId"],
  ["fitbitData", "by_patient", "patientId"],
  ["healthGoals", "by_patient", "patientId"],
  ["fitbitTokens", "by_patient", "patientId"],
  ["learnPointsLedger", "by_user", "userId"],
  ["learnPointsAccounts", "by_user", "userId"],
  ["learnBadges", "by_user", "userId"],
  ["learnInvites", "by_user", "userId"],
  ["learnSimAttempts", "by_user_case", "userId"],
  ["learnSimInterest", "by_user", "userId"],
  ["learnHelpful", "by_user_target", "userId"],
  ["learnSpaceReminders", "by_user_space", "userId"],
  ["learnAdmins", "by_user", "userId"],
  ["learnGroupMembers", "by_user", "userId"],
  ["offlineDevices", "by_user", "userId"],
  ["outcomeChecks", "by_patient", "patientId"],
  ["outcomeChecks", "by_physiotherapist", "physiotherapistId"],
  ["outcomeSummaries", "by_physiotherapist", "physiotherapistId"],
  ["patientQuestionnaires", "by_patient_and_status", "patientId"],
  ["patientQuestionnaires", "by_physiotherapist_and_status", "physiotherapistId"],
  ["rewardLedger", "by_user", "userId"],
  ["rewardAccounts", "by_user", "userId"],
  ["rewardRedemptions", "by_user", "userId"],
  ["cpdLog", "by_user_year", "userId"],
  ["scribeSessions", "by_physio_and_created", "physiotherapistId"],
  ["scribeSessions", "by_patient_and_physio", "patientId"],
  ["featureIntros", "by_user_and_key", "userId"],
  ["homeVisitSafety", "by_physio_and_stage", "physiotherapistId"],
  ["homeVisitSafety", "by_patient_and_stage", "patientId"],
  ["safetyAlerts", "by_physio", "physiotherapistId"],
  // Profiles last, after the rows that hang off them
  ["physiotherapistProfiles", "by_user_id", "userId"],
  ["clinicOwnerProfiles", "by_user_id", "userId"],
];

/** Everything filed under the clinic itself. */
const CLINIC_ROWS: [string, string, string][] = [
  ["clinicSubscriptions", "by_clinic", "clinicId"],
  ["clinicBillingCards", "by_clinic_status", "clinicId"],
  ["clinicSubscriptionInvoices", "by_clinic", "clinicId"],
  ["clinicInventoryItems", "by_clinic", "clinicId"],
  ["clinicPurchases", "by_clinic_and_date", "clinicId"],
  ["clinicThreads", "by_clinic_and_last", "clinicId"],
  ["clinicBookingRequests", "by_clinic_and_status", "clinicId"],
  ["clinicAttendanceSettings", "by_clinic", "clinicId"],
  ["clinicShifts", "by_clinic_and_date", "clinicId"],
  ["clinicStaffInvitations", "by_clinic", "clinicId"],
  ["patientPhysiotherapistRelationships", "by_clinic", "clinicId"],
  ["clinicDocuments", "by_clinic_id", "clinicId"],
  ["appointments", "by_clinic_id_and_time", "clinicId"],
  ["recurringSeries", "by_clinic_id", "clinicId"],
  ["exercises", "by_clinic", "clinicId"],
  ["treatmentTemplates", "by_clinic", "clinicId"],
  ["treatmentPlans", "by_clinic", "clinicId"],
  ["invoices", "by_clinic_id", "clinicId"],
  ["videoCalls", "by_clinic_id_and_scheduled", "clinicId"],
  ["surveys", "by_clinic_id_and_status", "clinicId"],
  ["patients", "by_clinic_id", "clinicId"],
  ["clinicOwnerProfiles", "by_clinic_id", "clinicId"],
  ["clinicSettings", "by_clinic", "clinicId"],
  ["analytics_events", "by_clinic", "clinicId"],
  ["resources", "by_clinic", "clinicId"],
  ["splitConfigurations", "by_clinic", "clinicId"],
  ["systemLogs", "by_clinic_id", "clinicId"],
  ["businessMetrics", "by_clinic_id", "clinicId"],
  ["clinicRoles", "by_clinic", "clinicId"],
  ["clinicPayoutAccounts", "by_clinic_id", "clinicId"],
  ["assessments", "by_clinic", "clinicId"],
  ["exercisePrograms", "by_clinic", "clinicId"],
  ["programTemplates", "by_clinic", "clinicId"],
  ["agreementSignatures", "by_clinic_agreement", "clinicId"],
];

/** Rows that carry an uploaded file: the file goes with the row. */
const WITH_FILES = new Set(["physiotherapistDocuments", "clinicDocuments", "patientDocuments"]);

/** Deletes one row, its uploaded file and the rows that only exist under it. */
async function deleteRow(ctx: MutationCtx, table: string, row: { _id: string; storageId?: Id<"_storage"> }) {
  if (WITH_FILES.has(table) && row.storageId) await ctx.storage.delete(row.storageId).catch(() => undefined);
  if (table === "clinicThreads") {
    for (const m of await rowsBy(ctx, "clinicThreadMessages", "by_thread", "threadId", row._id, 500)) await ctx.db.delete(m._id);
  }
  if (table === "clinicInventoryItems") {
    for (const m of await rowsBy(ctx, "clinicInventoryMovements", "by_item", "itemId", row._id, 500)) await ctx.db.delete(m._id);
  }
  if (await ctx.db.get(row._id as Id<"users">)) await ctx.db.delete(row._id as Id<"users">);
}

/** Deletes up to `budget` rows from the listed places; true when nothing is left there. */
async function deleteBatch(ctx: MutationCtx, places: [string, string, string][], value: string, budget: number) {
  let deleted = 0;
  for (const [table, index, field] of places) {
    while (deleted < budget) {
      const rows = await rowsBy(ctx, table, index, field, value, Math.min(100, budget - deleted));
      if (rows.length === 0) break;
      for (const row of rows) await deleteRow(ctx, table, row);
      deleted += rows.length;
    }
    if (deleted >= budget) return { deleted, done: false };
  }
  return { deleted, done: true };
}

/** The clinic's patients: linked by a care relationship, their account or their profile. */
export async function clinicPatientIds(ctx: QueryCtx, clinic: Doc<"clinics">) {
  const ids = new Set<Id<"users">>();
  for (const rel of await ctx.db.query("patientPhysiotherapistRelationships").withIndex("by_clinic", (q) => q.eq("clinicId", clinic._id)).collect()) {
    ids.add(rel.patientId);
  }
  for (const user of await ctx.db.query("users").withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id)).collect()) {
    if (user.role === "patient") ids.add(user._id);
  }
  for (const profile of await ctx.db.query("patientProfiles").withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id)).collect()) {
    ids.add(profile.userId);
  }
  return [...ids];
}

/** A patient whose only care on Rehabify is this clinic (their account can go with it). */
export async function onlyThisClinic(ctx: QueryCtx, clinicId: Id<"clinics">, patientId: Id<"users">) {
  const rels = await ctx.db.query("patientPhysiotherapistRelationships").withIndex("by_patient", (q) => q.eq("patientId", patientId)).collect();
  if (rels.some((r) => r.clinicId !== clinicId)) return false;
  const bookings = await ctx.db.query("marketplaceBookings").withIndex("by_patient", (q) => q.eq("patientId", patientId)).take(1);
  if (bookings.length) return false;
  const other = await ctx.db.query("appointments").withIndex("by_patient_id_and_time", (q) => q.eq("patientId", patientId)).collect();
  return other.every((a) => a.clinicId === clinicId);
}

/** The clinic by its Rehabify ID ("RH-CL-100016"; spaces and case don't matter). */
export async function clinicByNumber(ctx: QueryCtx, clinicNumber: string) {
  const number = clinicNumber.toUpperCase().replace(/\s+/g, "");
  return await ctx.db.query("clinics").withIndex("by_clinic_number", (q) => q.eq("clinicNumber", number)).first();
}

/** Real money linked to these people (live payments, paid bookings, payouts, plan payments). */
async function liveMoney(ctx: QueryCtx, userIds: Id<"users">[], clinicId: Id<"clinics">) {
  const found: string[] = [];
  for (const id of userIds) {
    const payments = await rowsBy(ctx, "payments", "by_user_id", "userId", id, 200);
    const paid = payments.filter((p) => ["success", "completed", "paid"].includes(String(p.status)) && p.paystackMode !== "test");
    if (paid.length) found.push(`${paid.length} payment(s) by ${id}`);
    for (const [index, field] of [["by_patient", "patientId"], ["by_physiotherapist", "physiotherapistId"]]) {
      const bookings = await rowsBy(ctx, "marketplaceBookings", index, field, id, 200);
      const live = bookings.filter((b) => b.paymentStatus === "completed" && b.paystackMode !== "test");
      if (live.length) found.push(`${live.length} paid booking(s) for ${id}`);
    }
    const payouts = await rowsBy(ctx, "payouts", "by_user_id", "userId", id, 200);
    if (payouts.length) found.push(`${payouts.length} payout(s) to ${id}`);
    const planPayments = await rowsBy(ctx, "physioPlanPayments", "by_physio", "physioId", id, 200);
    if (planPayments.length) found.push(`${planPayments.length} plan payment(s) by ${id}`);
  }
  const subInvoices = await rowsBy(ctx, "clinicSubscriptionInvoices", "by_clinic", "clinicId", clinicId, 200);
  const paidSubs = subInvoices.filter((i) => i.status === "paid" && Number(i.amount ?? i.amountKobo ?? 0) > 0);
  if (paidSubs.length) found.push(`${paidSubs.length} paid clinic plan invoice(s)`);
  return found;
}

/** Who goes and who stays: the owner, the team, and the clinic's patients split by "only here". */
async function wipePlan(ctx: QueryCtx, clinic: Doc<"clinics">) {
  const team = (await ctx.db.query("users").withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id)).collect()).filter(
    (u) => u.role !== "patient" && u._id !== clinic.ownerId
  );
  const patientIds = await clinicPatientIds(ctx, clinic);
  const deletePatients: Id<"users">[] = [];
  const keepPatients: Id<"users">[] = [];
  for (const id of patientIds) {
    if (await onlyThisClinic(ctx, clinic._id, id)) deletePatients.push(id);
    else keepPatients.push(id);
  }
  // Admins are never deleted by a clinic wipe
  const people: Id<"users">[] = [];
  for (const id of [clinic.ownerId, ...team.map((u) => u._id), ...deletePatients]) {
    const user = await ctx.db.get(id);
    if (user && user.role !== "admin" && !people.includes(id)) people.push(id);
  }
  return { team, people, keepPatients, deletePatients };
}

export const preview = internalQuery({
  args: { clinicNumber: v.string() },
  handler: async (ctx, args) => {
    const clinic = await clinicByNumber(ctx, args.clinicNumber);
    if (!clinic) return { found: false as const };
    const owner = await ctx.db.get(clinic.ownerId);
    const plan = await wipePlan(ctx, clinic);
    const describe = async (id: Id<"users">) => {
      const u = await ctx.db.get(id);
      return { id, name: personName(u), email: mask(u?.email), role: u?.role ?? null, hasLogin: (u?.clerkId ?? "").startsWith("user_") };
    };
    const count = async (table: string, index: string) => (await rowsBy(ctx, table, index, "clinicId", clinic._id, 5000)).length;
    const invoices = await ctx.db.query("invoices").withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id)).collect();
    return {
      found: true as const,
      clinic: { id: clinic._id, name: clinic.name, number: clinic.clinicNumber ?? null, status: clinic.status ?? "active", createdAt: new Date(clinic._creationTime).toISOString() },
      owner: owner ? await describe(owner._id) : null,
      team: await Promise.all(plan.team.map((u) => describe(u._id))),
      patientsDeleted: await Promise.all(plan.deletePatients.map(describe)),
      patientsKeptButUnlinked: await Promise.all(plan.keepPatients.map(describe)),
      liveMoney: await liveMoney(ctx, plan.people, clinic._id),
      counts: {
        appointments: await count("appointments", "by_clinic_id_and_time"),
        carePlans: await count("treatmentPlans", "by_clinic"),
        programmes: await count("exercisePrograms", "by_clinic"),
        invoices: invoices.length,
        paidInvoicesNaira: Math.round(invoices.filter((i) => i.status === "paid").reduce((s, i) => s + (i.totalAmount ?? 0), 0) / 100),
        relationships: await count("patientPhysiotherapistRelationships", "by_clinic"),
        documents: await count("clinicDocuments", "by_clinic_id"),
        staffInvitations: await count("clinicStaffInvitations", "by_clinic"),
        threads: await count("clinicThreads", "by_clinic_and_last"),
        subscriptions: await count("clinicSubscriptions", "by_clinic"),
        savedCards: await count("clinicBillingCards", "by_clinic_status"),
        payoutAccounts: await count("clinicPayoutAccounts", "by_clinic_id"),
        shifts: await count("clinicShifts", "by_clinic_and_date"),
      },
    };
  },
});

/** For the wipe: the fixed list of who goes, worked out before anything is deleted. */
export const wipeTargets = internalQuery({
  args: { clinicNumber: v.string() },
  handler: async (ctx, args) => {
    const clinic = await clinicByNumber(ctx, args.clinicNumber);
    if (!clinic) return null;
    const plan = await wipePlan(ctx, clinic);
    const logins: string[] = [];
    for (const id of plan.people) {
      const clerkId = (await ctx.db.get(id))?.clerkId ?? "";
      if (clerkId.startsWith("user_")) logins.push(clerkId);
    }
    return {
      clinicId: clinic._id,
      people: plan.people,
      keepPatients: plan.keepPatients,
      logins,
      liveMoney: await liveMoney(ctx, plan.people, clinic._id),
    };
  },
});

/** A patient who stays on Rehabify: the clinic's records about them and its link go. */
export const unlinkPatient = internalMutation({
  args: { clinicId: v.id("clinics"), patientId: v.id("users") },
  handler: async (ctx, args) => {
    let removed = 0;
    for (const [table, index, field] of [
      ["sessionLogs", "by_patient_id_and_date", "patientId"],
      ["referrals", "by_patient_id", "patientId"],
      ["careEpisodes", "by_patient", "patientId"],
      ["clinicBookingRequests", "by_patient", "patientId"],
    ] as [string, string, string][]) {
      for (const row of await rowsBy(ctx, table, index, field, args.patientId, 1000)) {
        if (row.clinicId === args.clinicId) {
          await ctx.db.delete(row._id);
          removed++;
        }
      }
    }
    const user = await ctx.db.get(args.patientId);
    if (user?.clinicId === args.clinicId) await ctx.db.patch(user._id, { clinicId: undefined });
    for (const p of await ctx.db.query("patientProfiles").withIndex("by_user_id", (q) => q.eq("userId", args.patientId)).collect()) {
      if (p.clinicId === args.clinicId) await ctx.db.patch(p._id, { clinicId: undefined });
    }
    return { removed };
  },
});

/** One batch of the clinic's own rows; deletes the clinic itself once they're all gone. */
export const wipeClinicStep = internalMutation({
  args: { clinicId: v.id("clinics") },
  handler: async (ctx, args) => {
    const batch = await deleteBatch(ctx, CLINIC_ROWS, args.clinicId, 1500);
    if (!batch.done) return batch;
    for (const t of await ctx.db
      .query("notesTemplates")
      .withIndex("by_scope_and_clinic_id", (q) => q.eq("scope", "clinic").eq("clinicId", args.clinicId))
      .take(500)) {
      await ctx.db.delete(t._id);
    }
    // Doctor referrals sent to the clinic go back to the admin queue rather than vanish
    for (const r of await ctx.db.query("inboundReferrals").withIndex("by_assigned_clinic", (q) => q.eq("assignedClinicId", args.clinicId)).take(500)) {
      await ctx.db.patch(r._id, { assignedClinicId: undefined });
    }
    if (await ctx.db.get(args.clinicId)) await ctx.db.delete(args.clinicId);
    return { deleted: batch.deleted, done: true };
  },
});

/** One batch of a person's rows; deletes the account itself once they're all gone. */
export const wipePersonStep = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return { deleted: 0, done: true };
    if (user.role === "admin") throw new Error("Admins are never deleted by a clinic wipe");
    // Files the patient uploaded hang off their profile
    for (const p of await ctx.db.query("patientProfiles").withIndex("by_user_id", (q) => q.eq("userId", user._id)).collect()) {
      for (const d of await rowsBy(ctx, "patientDocuments", "by_patient_profile_id", "patientProfileId", p._id, 500)) await deleteRow(ctx, "patientDocuments", d);
    }
    const batch = await deleteBatch(ctx, PERSON_ROWS, user._id, 1500);
    if (!batch.done) return batch;
    for (const p of await ctx.db.query("patientProfiles").withIndex("by_user_id", (q) => q.eq("userId", user._id)).collect()) await ctx.db.delete(p._id);
    for (const id of [user.patientProfileId, user.physiotherapistProfileId, user.clinicOwnerProfileId]) {
      if (id && (await ctx.db.get(id))) await ctx.db.delete(id);
    }
    await ctx.db.delete(user._id);
    return { deleted: batch.deleted + 1, done: true };
  },
});

type Step = { deleted: number; done: boolean };
const targetsRef = makeFunctionReference<
  "query",
  { clinicNumber: string },
  { clinicId: Id<"clinics">; people: Id<"users">[]; keepPatients: Id<"users">[]; logins: string[]; liveMoney: string[] } | null
>("adminClinicWipe:wipeTargets");
const unlinkRef = makeFunctionReference<"mutation", { clinicId: Id<"clinics">; patientId: Id<"users"> }, { removed: number }>(
  "adminClinicWipe:unlinkPatient"
);
const clinicStepRef = makeFunctionReference<"mutation", { clinicId: Id<"clinics"> }, Step>("adminClinicWipe:wipeClinicStep");
const personStepRef = makeFunctionReference<"mutation", { userId: Id<"users"> }, Step>("adminClinicWipe:wipePersonStep");
const deleteLoginRef = makeFunctionReference<"action", { clerkId: string }, unknown>("users:deleteClerkLogin");

export const wipe = internalAction({
  args: { clinicNumber: v.string(), confirm: v.string(), force: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const number = args.clinicNumber.toUpperCase().replace(/\s+/g, "");
    if (args.confirm !== `WIPE ${number}`) throw new Error(`Pass confirm: "WIPE ${number}"`);
    const targets = await ctx.runQuery(targetsRef, { clinicNumber: number });
    if (!targets) throw new Error(`No clinic ${number}`);
    if (targets.liveMoney.length && !args.force) {
      throw new Error(`Real money is linked to this clinic, so nothing was deleted: ${targets.liveMoney.join("; ")}. Pass force: true to wipe anyway.`);
    }

    let rows = 0;
    for (const patientId of targets.keepPatients) rows += (await ctx.runMutation(unlinkRef, { clinicId: targets.clinicId, patientId })).removed;
    for (;;) {
      const step = await ctx.runMutation(clinicStepRef, { clinicId: targets.clinicId });
      rows += step.deleted;
      if (step.done) break;
    }
    for (const userId of targets.people) {
      for (;;) {
        const step = await ctx.runMutation(personStepRef, { userId });
        rows += step.deleted;
        if (step.done) break;
      }
    }

    // Their sign-ins go last, so the same emails can sign up again
    const loginErrors: string[] = [];
    for (const clerkId of targets.logins) {
      try {
        await ctx.runAction(deleteLoginRef, { clerkId });
      } catch (error) {
        loginErrors.push(`${clerkId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return {
      clinic: number,
      accountsDeleted: targets.people.length,
      patientsUnlinked: targets.keepPatients.length,
      rowsDeleted: rows,
      loginsDeleted: targets.logins.length - loginErrors.length,
      loginErrors,
    };
  },
});
