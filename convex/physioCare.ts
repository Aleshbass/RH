/**
 * The physiotherapist's patient workspace: care episodes, care plans (with versions and the
 * reason for each change), clinical notes, files, patient check-ins, what needs attention,
 * completing care, and Rehabify's follow-up with the patient afterwards.
 *
 * Access rules
 * - Physio functions need an approved physiotherapist with a relationship to the patient.
 *   Reads work after care has ended (records stay available); writes need active care.
 * - Patient functions only touch the signed-in patient's own records.
 * - Follow-up admin functions are for Rehabify admins.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { publicAppUrl } from "./helpers/appUrl";
import { awaitingConfirmationFrom, hasPendingProposal } from "./helpers/appointmentStatus";
import { lagosDateTime } from "./helpers/lagosTime";
import {
  currentUser,
  findRelationship,
  isApproved,
  physioOrNull,
  requireActiveRelationship,
  requirePhysio,
} from "./helpers/careAccess";

type Ctx = QueryCtx | MutationCtx;

const DAY = 86_400_000;
const LAGOS_OFFSET = 60 * 60 * 1000; // West Africa Time, UTC+1
const DEFAULT_FOLLOW_UP_DAYS = 14;
const UPCOMING_STATUSES = new Set(["scheduled", "confirmed"]);
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const HIGH_PAIN = 7;

const sourceValidator = v.union(
  v.literal("referred"),
  v.literal("existing_patient"),
  v.literal("marketplace"),
  v.literal("booking_link"),
  v.literal("clinic"),
  v.literal("invite"),
  v.literal("joy_whatsapp"),
  v.literal("other")
);
type EpisodeSource = Doc<"careEpisodes">["source"];

const outcomeValidator = v.union(
  v.literal("goals_met"),
  v.literal("partially_met"),
  v.literal("not_met"),
  v.literal("referred_on"),
  v.literal("stopped_attending")
);

const recoveryValidator = v.union(
  v.literal("fully_recovered"),
  v.literal("much_better"),
  v.literal("a_little_better"),
  v.literal("no_change"),
  v.literal("worse")
);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// currentUser, isApproved, physioOrNull, requirePhysio, findRelationship and
// requireActiveRelationship are shared with exercisePrograms.ts.

function sourceFromRelationship(relationship: Doc<"patientPhysiotherapistRelationships">): EpisodeSource {
  switch (relationship.source) {
    case "referred":
    case "rehabify_referral":
      return "referred";
    case "existing_patient":
      return "existing_patient";
    case "marketplace":
      return "marketplace";
    case "booking_link":
      return "booking_link";
    case "clinic_direct":
      return "clinic";
    case "invite":
      return "invite";
    case "joy_whatsapp":
      return "joy_whatsapp";
    default:
      return relationship.invitationId ? "invite" : "other";
  }
}

async function episodesFor(ctx: Ctx, physioId: Id<"users">, patientId: Id<"users">) {
  const rows = await ctx.db
    .query("careEpisodes")
    .withIndex("by_patient_and_physiotherapist", (q) => q.eq("patientId", patientId).eq("physiotherapistId", physioId))
    .collect();
  return rows.sort((a, b) => b.startedAt - a.startedAt);
}

/** The open episode, created on first use for patients who joined before episodes existed. */
async function ensureActiveEpisode(
  ctx: MutationCtx,
  physio: Doc<"users">,
  relationship: Doc<"patientPhysiotherapistRelationships">
) {
  const episodes = await episodesFor(ctx, physio._id, relationship.patientId);
  const open = episodes.find((e) => e.status === "active");
  if (open) return open;
  const now = Date.now();
  const id = await ctx.db.insert("careEpisodes", {
    patientId: relationship.patientId,
    physiotherapistId: physio._id,
    clinicId: relationship.clinicId,
    status: "active",
    source: sourceFromRelationship(relationship),
    referredBy: relationship.referredBy,
    startedAt: episodes.length === 0 ? relationship.startDate : now,
    createdAt: now,
    updatedAt: now,
  });
  return (await ctx.db.get(id))!;
}

async function activePlanFor(ctx: Ctx, physioId: Id<"users">, patientId: Id<"users">) {
  const plans = await ctx.db
    .query("treatmentPlans")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .collect();
  const mine = plans.filter((p) => p.physiotherapistId === physioId);
  return (
    mine.filter((p) => p.status === "active").sort((a, b) => b.updatedAt - a.updatedAt)[0] ??
    mine.filter((p) => p.status === "draft" || p.status === "on_hold").sort((a, b) => b.updatedAt - a.updatedAt)[0] ??
    null
  );
}

/** A visit to hang a note on: today's real appointment if there is one, else a record-only entry. */
async function anchorAppointment(
  ctx: MutationCtx,
  physio: Doc<"users">,
  relationship: Doc<"patientPhysiotherapistRelationships">,
  label: string
): Promise<Id<"appointments">> {
  const now = Date.now();
  const lagosOffset = 60 * 60 * 1000;
  const startOfDay = Math.floor((now + lagosOffset) / DAY) * DAY - lagosOffset;
  const todays = await ctx.db
    .query("appointments")
    .withIndex("by_patient_id_and_time", (q) =>
      q.eq("patientId", relationship.patientId).gte("startTime", startOfDay).lt("startTime", startOfDay + DAY)
    )
    .collect();
  const visit = todays.find(
    (a) => a.physiotherapistId === physio._id && !a.isRecordOnly && !a.status.startsWith("cancelled")
  );
  if (visit) return visit._id;
  return await ctx.db.insert("appointments", {
    patientId: relationship.patientId,
    physiotherapistId: physio._id,
    clinicId: relationship.clinicId,
    startTime: now,
    endTime: now,
    status: "completed",
    appointmentType: "in-person",
    serviceType: label,
    isRecordOnly: true,
  });
}

function fullName(user: Doc<"users"> | null | undefined) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Patient";
}

async function notify(
  ctx: MutationCtx,
  userId: Id<"users">,
  type: string,
  title: string,
  body: string,
  actionUrl: string,
  priority: "low" | "medium" | "high" = "medium"
) {
  await ctx.db.insert("notifications", {
    userId,
    type,
    priority,
    status: "pending",
    payload: { title, body, data: { actionUrl } },
    createdAt: Date.now(),
  });
}

async function emailPatient(
  ctx: MutationCtx,
  patient: Doc<"users"> | null,
  email: {
    subject: string;
    heading: string;
    paragraphs: string[];
    buttonLabel?: string;
    buttonPath?: string;
  }
) {
  if (!patient?.email) return;
  await ctx.scheduler.runAfter(0, internal.actions.emails.sendPatientCareEmail.sendPatientCareEmail, {
    to: patient.email,
    subject: email.subject,
    greetingName: patient.firstName,
    heading: email.heading,
    paragraphs: email.paragraphs,
    buttonLabel: email.buttonLabel,
    buttonUrl: email.buttonPath ? `${publicAppUrl()}${email.buttonPath}` : undefined,
  });
}

function planSnapshot(plan: Doc<"treatmentPlans">) {
  return {
    title: plan.title,
    description: plan.description,
    goals: plan.goals,
    sessionFrequency: plan.sessionFrequency,
    plannedSessions: plan.plannedSessions,
    reviewDate: plan.reviewDate,
    precautions: plan.precautions,
    changeReason: plan.changeReason,
  };
}

/** Home-programme logs with the programme title and exercise name, newest first. */
async function describeProgramLogs(ctx: Ctx, logs: Doc<"exerciseProgramLogs">[]) {
  const programs = new Map<string, Doc<"exercisePrograms"> | null>();
  const exercises = new Map<string, string | null>();
  const rows = [];
  for (const log of logs) {
    if (!programs.has(log.programId)) programs.set(log.programId, await ctx.db.get(log.programId));
    const program = programs.get(log.programId);
    const item = log.itemIndex >= 0 ? program?.items[log.itemIndex] : undefined;
    let name = item?.name ?? null;
    if (item?.exerciseId) {
      if (!exercises.has(item.exerciseId)) exercises.set(item.exerciseId, (await ctx.db.get(item.exerciseId))?.name ?? null);
      name = exercises.get(item.exerciseId) ?? name;
    }
    rows.push({
      _id: log._id,
      programTitle: program?.title ?? "A removed programme",
      exerciseName: name ?? "A removed exercise",
      painScore: log.painScore ?? null,
      difficulty: log.difficulty ?? null,
      note: log.note ?? null,
      source: log.source,
      createdAt: log.createdAt,
      reviewedAt: log.reviewedAt ?? null,
    });
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Physio: reading a patient's workspace
// ─────────────────────────────────────────────────────────────────────────────

export const getPatientWorkspace = query({
  args: { patientId: v.id("users"), now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const physio = await physioOrNull(ctx);
    if (!physio) return null;
    const relationship = await findRelationship(ctx, physio._id, args.patientId);
    if (!relationship) return null;
    const patient = await ctx.db.get(args.patientId);
    if (!patient) return null;

    const now = args.now ?? Date.now();
    const profile = await ctx.db
      .query("patientProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", args.patientId))
      .first();

    // Episodes (synthesised for patients who joined before episodes existed)
    const episodes = await episodesFor(ctx, physio._id, args.patientId);
    const storedCurrent = episodes.find((e) => e.status === "active") ?? episodes[0] ?? null;
    const episode = storedCurrent
      ? { ...storedCurrent, synthetic: false }
      : {
          status: relationship.status === "active" ? ("active" as const) : ("completed" as const),
          source: sourceFromRelationship(relationship),
          referredBy: relationship.referredBy,
          startedAt: relationship.startDate,
          completedAt: relationship.endDate,
          synthetic: true,
        };
    const episodeStart = episode.startedAt;

    // Care plan
    const plan = await activePlanFor(ctx, physio._id, args.patientId);
    const totalExercises = plan ? plan.phases.reduce((n, phase) => n + phase.exercises.length, 0) : 0;
    const goalsAchieved = plan ? plan.goals.filter((g) => g.achieved).length : 0;

    // Appointments with this physio (record-only note anchors are not visits)
    const appointments = (
      await ctx.db
        .query("appointments")
        .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", args.patientId))
        .collect()
    ).filter((a) => a.physiotherapistId === physio._id && !a.isRecordOnly);
    const nextAppointment =
      appointments
        .filter((a) => a.startTime >= now - 30 * 60 * 1000 && UPCOMING_STATUSES.has(a.status))
        .sort((a, b) => a.startTime - b.startTime)[0] ?? null;
    const completedSessions = appointments.filter((a) => a.status === "completed" && a.startTime >= episodeStart);
    const lastSession = completedSessions.sort((a, b) => b.startTime - a.startTime)[0] ?? null;

    // Home exercise adherence, last 7 days: one session per exercise per day. Home programmes
    // (exerciseProgramLogs) are the main source; the older care-plan exercises
    // (exerciseCompletions) only count towards the target while the patient still logs them.
    const since = now - 7 * DAY;
    const programs = (
      await ctx.db
        .query("exercisePrograms")
        .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
        .collect()
    ).filter((p) => p.status === "active");
    const programExercises = programs.reduce((n, p) => n + p.items.filter((i) => i.kind !== "education").length, 0);
    const activeProgramIds = new Set<string>(programs.map((p) => p._id));
    const weekLogs = await ctx.db
      .query("exerciseProgramLogs")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId).gte("createdAt", since))
      .collect();
    const programDone = new Set(
      weekLogs
        .filter((l) => activeProgramIds.has(l.programId) && l.itemIndex >= 0)
        .map((l) => `${l.programId}:${l.itemIndex}:${Math.floor((l.createdAt + LAGOS_OFFSET) / DAY)}`)
    ).size;
    const legacyDone =
      plan && totalExercises > 0
        ? (
            await ctx.db
              .query("exerciseCompletions")
              .withIndex("by_patient_and_plan", (q) => q.eq("patientId", args.patientId).eq("treatmentPlanId", plan._id))
              .filter((q) => q.gte(q.field("completedAt"), since))
              .collect()
          ).length
        : 0;
    const legacyExpected = programExercises === 0 || legacyDone > 0 ? totalExercises * 7 : 0;
    const expected = programExercises * 7 + legacyExpected;
    const completed = Math.min(expected, programDone + legacyDone);
    const adherence =
      expected > 0
        ? {
            completed,
            expected,
            rate: Math.min(100, Math.round((completed / expected) * 100)),
            source: (programExercises > 0 ? (legacyExpected > 0 ? "both" : "programme") : "care_plan") as "programme" | "care_plan" | "both",
            lastLoggedAt: weekLogs.length ? Math.max(...weekLogs.map((l) => l.createdAt)) : null,
          }
        : null;

    // Recent home-programme logs (pain, difficulty, note) for the Check-ins tab and Overview
    const recentLogs = await ctx.db
      .query("exerciseProgramLogs")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .take(30);
    const exerciseLogs = await describeProgramLogs(ctx, recentLogs);

    // Check-ins addressed to this physio (or to nobody in particular)
    const checkIns = (
      await ctx.db
        .query("patientCheckIns")
        .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
        .order("desc")
        .take(40)
    ).filter((c) => !c.physiotherapistId || c.physiotherapistId === physio._id);

    // Money
    const invoices = (
      await ctx.db
        .query("invoices")
        .withIndex("by_patient_id", (q) => q.eq("patientId", args.patientId))
        .order("desc")
        .take(200)
    ).filter((i) => i.physiotherapistId === physio._id);
    const unpaid = invoices.filter((i) => i.status === "sent" || i.status === "partial_payment" || i.status === "overdue");

    // Only the count and the latest date are shown here: read up to 200 notes, newest first
    const notes = await ctx.db
      .query("sessionLogs")
      .withIndex("by_patient_id_and_date", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .take(200);
    const myNotes = notes.filter((n) => n.physiotherapistId === physio._id);

    return {
      patient: {
        _id: patient._id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        phoneNumber: patient.phoneNumber,
        imageUrl: patient.imageUrl,
        patientNumber: patient.patientNumber,
      },
      // patientProfiles holds a free-text history summary and one emergency contact
      profile: profile
        ? {
            dateOfBirth: profile.dateOfBirth,
            gender: profile.gender,
            medicalHistory: profile.medicalHistorySummary?.trim() || null,
            city: profile.city ?? null,
            emergencyContact: profile.emergencyContact ?? null,
          }
        : null,
      relationship: {
        status: relationship.status,
        startDate: relationship.startDate,
        endDate: relationship.endDate,
        source: relationship.source,
        referredBy: relationship.referredBy,
      },
      episode,
      pastEpisodes: episodes
        .filter((e) => e.status !== "active" && (!storedCurrent || e._id !== storedCurrent._id))
        .map((e) => ({ _id: e._id, startedAt: e.startedAt, completedAt: e.completedAt, outcome: e.outcome, condition: e.condition })),
      plan: plan
        ? {
            _id: plan._id,
            title: plan.title,
            description: plan.description,
            status: plan.status,
            goals: plan.goals,
            sessionFrequency: plan.sessionFrequency,
            plannedSessions: plan.plannedSessions ?? storedCurrent?.plannedSessions,
            reviewDate: plan.reviewDate,
            precautions: plan.precautions,
            changeReason: plan.changeReason,
            version: plan.version,
            updatedAt: plan.updatedAt,
            totalExercises,
            goalsAchieved,
          }
        : null,
      sessions: {
        completed: completedSessions.length,
        planned: plan?.plannedSessions ?? storedCurrent?.plannedSessions ?? null,
        last: lastSession ? { startTime: lastSession.startTime, serviceType: lastSession.serviceType } : null,
      },
      nextAppointment: nextAppointment
        ? {
            _id: nextAppointment._id,
            startTime: nextAppointment.startTime,
            endTime: nextAppointment.endTime,
            serviceType: nextAppointment.serviceType,
            status: nextAppointment.status,
            isOnline: nextAppointment.isOnline || nextAppointment.appointmentType === "telehealth",
          }
        : null,
      adherence,
      checkIns: checkIns.slice(0, 20),
      exerciseLogs,
      notesCount: myNotes.length,
      lastNoteAt: myNotes[0]?.sessionDate ?? null,
      payments: {
        unpaidCount: unpaid.length,
        unpaidKobo: unpaid.reduce((sum, i) => sum + (i.totalAmount - (i.paidAmount ?? 0)), 0),
        paidKobo: invoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + (i.paidAmount ?? i.totalAmount), 0),
      },
      followUp:
        storedCurrent && storedCurrent.status === "completed" && storedCurrent.followUpStatus
          ? {
              status: storedCurrent.followUpStatus,
              dueAt: storedCurrent.followUpDueAt,
              rating: storedCurrent.followUpRating,
              recovery: storedCurrent.followUpRecovery,
              comment: storedCurrent.followUpComment,
              respondedAt: storedCurrent.followUpRespondedAt,
            }
          : null,
    };
  },
});

/** Clinical notes this physio wrote for a patient, newest first. */
export const getClinicalNotes = query({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    const physio = await physioOrNull(ctx);
    if (!physio) return [];
    if (!(await findRelationship(ctx, physio._id, args.patientId))) return [];
    const notes = await ctx.db
      .query("sessionLogs")
      .withIndex("by_patient_id_and_date", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .collect();
    return await Promise.all(
      notes
        .filter((n) => n.physiotherapistId === physio._id)
        .map(async (n) => ({
          _id: n._id,
          sessionDate: n.sessionDate,
          noteType: n.noteType ?? "treatment_note",
          subjectiveAssessment: n.subjectiveAssessment,
          objectiveAssessment: n.objectiveAssessment,
          treatmentAdministered: n.treatmentAdministered,
          planForNextSession: n.planForNextSession,
          diagnosis: n.diagnosis,
          voiceNote: n.voiceNoteUrl ? await resolveStoredUrl(ctx, n.voiceNoteUrl) : null,
          attachments: (
            await Promise.all(
              (n.attachments ?? []).map(async (fileId) => {
                const meta = await ctx.db.system.get(fileId);
                const url = await ctx.storage.getUrl(fileId);
                return meta && url ? { url, contentType: meta.contentType ?? null, size: meta.size } : null;
              })
            )
          ).filter((a): a is { url: string; contentType: string | null; size: number } => a !== null),
        }))
    );
  },
});

const MAX_NOTE_ATTACHMENTS = 10;

/** voiceNoteUrl holds either a storage id (new notes) or a full URL (older data). */
async function resolveStoredUrl(ctx: QueryCtx, value: string): Promise<string | null> {
  if (/^https?:\/\//.test(value)) return value;
  try {
    return await ctx.storage.getUrl(value as Id<"_storage">);
  } catch {
    return null;
  }
}

/** Every version of this patient's care plans, newest first, with the reason for each change. */
export const getCarePlanHistory = query({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    const physio = await physioOrNull(ctx);
    if (!physio) return [];
    if (!(await findRelationship(ctx, physio._id, args.patientId))) return [];
    const plans = (
      await ctx.db
        .query("treatmentPlans")
        .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
        .collect()
    ).filter((p) => p.physiotherapistId === physio._id);

    const history: {
      planId: Id<"treatmentPlans">;
      planTitle: string;
      version: number;
      kind: string;
      reason: string;
      at: number;
    }[] = [];
    for (const plan of plans) {
      const versions = await ctx.db
        .query("treatmentPlanVersions")
        .withIndex("by_treatment_plan", (q) => q.eq("treatmentPlanId", plan._id))
        .collect();
      for (const version of versions) {
        if (version.changeType !== "created" && version.changeType !== "plan_revised" && version.changeType !== "status_changed") continue;
        history.push({
          planId: plan._id,
          planTitle: (version.newData as { title?: string } | undefined)?.title ?? plan.title,
          version: version.version,
          kind: version.changeType,
          reason: version.changeDescription,
          at: version.timestamp,
        });
      }
    }
    return history.sort((a, b) => b.at - a.at);
  },
});

/**
 * What the physio should look at today, most important first: patients reporting high or
 * rising pain, plans due for review, patients with no next session booked, bookings waiting
 * for confirmation and overdue invoices.
 */
export const getNeedsAttention = query({
  // `now` comes from the screen, rounded to the hour, so the result can be cached between visits
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const physio = await physioOrNull(ctx);
    if (!physio) return [];
    const now = args.now ?? Math.floor(Date.now() / 3_600_000) * 3_600_000;
    type Item = {
      key: string;
      kind: "check_in" | "exercise_pain" | "plan_review" | "no_booking" | "unconfirmed" | "overdue_invoice";
      severity: "high" | "medium" | "low";
      patientId: Id<"users">;
      patientName: string;
      title: string;
      detail: string;
      href: string;
      at: number;
    };
    const items: Item[] = [];
    const names = new Map<string, string>();
    const nameOf = async (id: Id<"users">) => {
      if (!names.has(id)) names.set(id, fullName(await ctx.db.get(id)));
      return names.get(id)!;
    };
    const addCheckIn = async (c: Doc<"patientCheckIns">) => {
      items.push({
        key: `checkin-${c._id}`,
        kind: "check_in",
        severity: c.painScore >= HIGH_PAIN ? "high" : "medium",
        patientId: c.patientId,
        patientName: await nameOf(c.patientId),
        title: c.flagReason ?? `Pain ${c.painScore}/10`,
        detail: c.note ? `“${c.note.length > 90 ? `${c.note.slice(0, 90)}…` : c.note}”` : "From their check-in",
        href: `/dashboard/physiotherapist/patients/${c.patientId}?tab=checkins`,
        at: c.createdAt,
      });
    };

    // 1. Check-ins flagged in the last two weeks that the physio hasn't seen
    const checkIns = await ctx.db
      .query("patientCheckIns")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physio._id).gte("createdAt", now - 14 * DAY))
      .collect();
    for (const c of checkIns.filter((c) => c.flagged && !c.reviewedAt)) await addCheckIn(c);

    // 2-3. Per active patient: high pain in home exercises, flagged check-ins sent before
    // this physio was linked, plan review due, nothing booked
    const relationships = (
      await ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physio._id))
        .collect()
    ).filter((r) => r.status === "active");

    // Patients are checked in parallel; one at a time this was hundreds of reads in a row
    await Promise.all(relationships.slice(0, 150).map(async (relationship) => {
      const patientId = relationship.patientId;

      // High pain logged during home exercises and not yet reviewed: one item per patient
      const painLogs = (
        await ctx.db
          .query("exerciseProgramLogs")
          .withIndex("by_patient", (q) => q.eq("patientId", patientId).gte("createdAt", now - 14 * DAY))
          .collect()
      )
        .filter((l) => (l.painScore ?? 0) >= HIGH_PAIN && !l.reviewedAt)
        .sort((a, b) => b.createdAt - a.createdAt);
      if (painLogs.length > 0) {
        const [latest] = await describeProgramLogs(ctx, [painLogs[0]]);
        items.push({
          key: `exercise-pain-${latest._id}`,
          kind: "exercise_pain",
          severity: "high",
          patientId,
          patientName: await nameOf(patientId),
          title: `Pain ${latest.painScore}/10 during ${latest.exerciseName}`,
          detail:
            painLogs.length > 1
              ? `${painLogs.length} high-pain logs in their home exercises`
              : latest.note
                ? `“${latest.note}”`
                : `From “${latest.programTitle}”`,
          href: `/dashboard/physiotherapist/patients/${patientId}?tab=checkins`,
          at: latest.createdAt,
        });
      }

      const unassigned = (
        await ctx.db
          .query("patientCheckIns")
          .withIndex("by_patient", (q) => q.eq("patientId", patientId).gte("createdAt", now - 14 * DAY))
          .collect()
      ).filter((c) => !c.physiotherapistId && c.flagged && !c.reviewedAt);
      for (const c of unassigned) await addCheckIn(c);

      const plan = await activePlanFor(ctx, physio._id, patientId);
      if (plan?.reviewDate && plan.reviewDate <= now + DAY) {
        items.push({
          key: `review-${plan._id}`,
          kind: "plan_review",
          severity: plan.reviewDate < now - 7 * DAY ? "high" : "medium",
          patientId,
          patientName: await nameOf(patientId),
          title: plan.reviewDate < now ? "Care plan review overdue" : "Care plan review due",
          detail: plan.title,
          href: `/dashboard/physiotherapist/patients/${patientId}?tab=plan`,
          at: plan.reviewDate,
        });
      }

      const upcoming = await ctx.db
        .query("appointments")
        .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", patientId).gte("startTime", now))
        .filter((q) => q.eq(q.field("physiotherapistId"), physio._id))
        .take(20);
      const hasNext = upcoming.some((a) => UPCOMING_STATUSES.has(a.status) && !a.isRecordOnly);
      if (!hasNext && relationship.startDate < now - 3 * DAY) {
        const past = await ctx.db
          .query("appointments")
          .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", patientId).lt("startTime", now))
          .order("desc")
          .filter((q) => q.eq(q.field("physiotherapistId"), physio._id))
          .take(5);
        const lastVisit = past.find((a) => a.status === "completed" && !a.isRecordOnly);
        if (!lastVisit || lastVisit.startTime < now - 10 * DAY) {
          items.push({
            key: `nobooking-${relationship._id}`,
            kind: "no_booking",
            severity: "low",
            patientId,
            patientName: await nameOf(patientId),
            title: "No next session booked",
            detail: lastVisit ? `Last seen ${Math.round((now - lastVisit.startTime) / DAY)} days ago` : "No sessions yet",
            href: `/dashboard/physiotherapist/patients/${patientId}`,
            at: lastVisit?.startTime ?? relationship.startDate,
          });
        }
      }
    }));

    // 4. Bookings in the next 3 days still waiting for confirmation
    const soon = await ctx.db
      .query("appointments")
      .withIndex("by_physiotherapist_id_and_time", (q) =>
        q.eq("physiotherapistId", physio._id).gte("startTime", now).lte("startTime", now + 3 * DAY)
      )
      .collect();
    for (const a of soon.filter((a) => a.status === "scheduled" && !a.isRecordOnly)) {
      // A request waiting on the physio comes first; one waiting on the patient is only a nudge
      const yours = awaitingConfirmationFrom(a) === "provider" && !hasPendingProposal(a, now);
      items.push({
        key: `unconfirmed-${a._id}`,
        kind: "unconfirmed",
        severity: yours ? "medium" : "low",
        patientId: a.patientId,
        patientName: await nameOf(a.patientId),
        title: yours ? "Booking request: needs your answer" : "Waiting for the patient to confirm",
        detail: [lagosDateTime(a.startTime), a.serviceType].filter(Boolean).join(" · "),
        href: `/dashboard/physiotherapist/appointments?visit=${a._id}`,
        at: a.startTime,
      });
    }

    // 5. Overdue invoices
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_physiotherapist_id", (q) => q.eq("physiotherapistId", physio._id))
      .order("desc")
      .take(500);
    for (const invoice of invoices.filter(
      (i) => (i.status === "sent" || i.status === "partial_payment" || i.status === "overdue") && i.dueDate < now
    )) {
      items.push({
        key: `invoice-${invoice._id}`,
        kind: "overdue_invoice",
        severity: "low",
        patientId: invoice.patientId,
        patientName: await nameOf(invoice.patientId),
        title: "Invoice overdue",
        detail: `₦${Math.round((invoice.totalAmount - (invoice.paidAmount ?? 0)) / 100).toLocaleString("en-NG")}`,
        href: "/dashboard/physiotherapist/billing",
        at: invoice.dueDate,
      });
    }

    const rank = { high: 0, medium: 1, low: 2 } as const;
    return items.sort((a, b) => rank[a.severity] - rank[b.severity] || b.at - a.at).slice(0, 12);
  },
});

/** Latest check-ins across all of the physio's patients. */
export const getRecentCheckIns = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const physio = await physioOrNull(ctx);
    if (!physio) return [];
    const rows = await ctx.db
      .query("patientCheckIns")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physio._id))
      .order("desc")
      .take(Math.min(args.limit ?? 6, 30));
    return await Promise.all(
      rows.map(async (row) => {
        const patient = await ctx.db.get(row.patientId);
        return {
          ...row,
          patient: patient
            ? { _id: patient._id, firstName: patient.firstName, lastName: patient.lastName, imageUrl: patient.imageUrl }
            : null,
        };
      })
    );
  },
});

/** Patients whose care with this physio has been completed, newest first. */
export const getCompletedCare = query({
  args: {},
  handler: async (ctx) => {
    const physio = await physioOrNull(ctx);
    if (!physio) return [];
    const episodes = await ctx.db
      .query("careEpisodes")
      .withIndex("by_physiotherapist_and_status", (q) => q.eq("physiotherapistId", physio._id).eq("status", "completed"))
      .collect();
    const rows = await Promise.all(
      episodes.map(async (e) => {
        const patient = await ctx.db.get(e.patientId);
        return {
          episodeId: e._id,
          patientId: e.patientId,
          firstName: patient?.firstName,
          lastName: patient?.lastName,
          email: patient?.email,
          imageUrl: patient?.imageUrl,
          patientNumber: patient?.patientNumber,
          completedAt: e.completedAt,
          outcome: e.outcome,
          followUpRating: e.followUpRating,
          followUpRecovery: e.followUpRecovery,
        };
      })
    );
    return rows.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Physio: changing things
// ─────────────────────────────────────────────────────────────────────────────

export const updateCareEpisode = mutation({
  args: {
    patientId: v.id("users"),
    source: v.optional(sourceValidator),
    referredBy: v.optional(v.string()),
    condition: v.optional(v.string()),
    plannedSessions: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const relationship = await requireActiveRelationship(ctx, physio._id, args.patientId);
    const episode = await ensureActiveEpisode(ctx, physio, relationship);

    const patch: Partial<Doc<"careEpisodes">> = { updatedAt: Date.now() };
    if (args.source !== undefined) patch.source = args.source;
    if (args.referredBy !== undefined) patch.referredBy = args.referredBy.trim() || undefined;
    if (args.condition !== undefined) patch.condition = args.condition.trim() || undefined;
    if (args.plannedSessions !== undefined) {
      if (args.plannedSessions < 0 || args.plannedSessions > 200) throw new ConvexError("Enter a sensible number of sessions.");
      patch.plannedSessions = Math.round(args.plannedSessions) || undefined;
    }
    await ctx.db.patch(episode._id, patch);

    // Keep the relationship's source in step, for lists and reports
    if (args.source !== undefined || args.referredBy !== undefined) {
      const relSource =
        args.source && args.source !== "clinic" && args.source !== "other" ? args.source : relationship.source;
      await ctx.db.patch(relationship._id, {
        source: relSource,
        referredBy: patch.referredBy ?? relationship.referredBy,
      });
    }
    return { success: true };
  },
});

const goalInput = v.object({
  description: v.string(),
  targetValue: v.string(),
  timeline: v.string(),
  achieved: v.optional(v.boolean()),
});

/**
 * Create the care plan, or revise it. A revision keeps the previous version (with the reason
 * for the change) and tells the patient their plan was updated.
 */
export const saveCarePlan = mutation({
  args: {
    patientId: v.id("users"),
    title: v.string(),
    description: v.optional(v.string()),
    goals: v.array(goalInput),
    sessionFrequency: v.optional(v.string()),
    plannedSessions: v.optional(v.number()),
    reviewDate: v.optional(v.number()),
    precautions: v.optional(v.string()),
    changeReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const relationship = await requireActiveRelationship(ctx, physio._id, args.patientId);
    const episode = await ensureActiveEpisode(ctx, physio, relationship);

    const title = args.title.trim();
    if (!title) throw new ConvexError("Give the plan a title.");
    const goals = args.goals
      .map((g) => ({
        description: g.description.trim(),
        targetValue: g.targetValue.trim(),
        timeline: g.timeline.trim(),
        measurable: Boolean(g.targetValue.trim()),
        achieved: g.achieved || undefined,
      }))
      .filter((g) => g.description);
    if (goals.length === 0) throw new ConvexError("Add at least one functional goal.");
    const now = Date.now();
    const fields = {
      title,
      description: args.description?.trim() || undefined,
      goals,
      sessionFrequency: args.sessionFrequency?.trim() || undefined,
      plannedSessions: args.plannedSessions ? Math.round(args.plannedSessions) : undefined,
      reviewDate: args.reviewDate,
      precautions: args.precautions?.trim() || undefined,
    };
    const existing = await activePlanFor(ctx, physio._id, args.patientId);

    if (existing) {
      const reason = args.changeReason?.trim();
      if (!reason) throw new ConvexError("Say briefly why the plan is changing. It's kept with this version.");
      const version = existing.version + 1;
      await ctx.db.patch(existing._id, {
        ...fields,
        status: existing.status === "draft" ? "active" : existing.status,
        changeReason: reason,
        episodeId: episode._id,
        version,
        updatedAt: now,
      });
      await ctx.db.insert("treatmentPlanVersions", {
        treatmentPlanId: existing._id,
        version,
        changeType: "plan_revised",
        changedBy: physio._id,
        changeDescription: reason,
        previousData: planSnapshot(existing),
        newData: { ...fields, changeReason: reason },
        timestamp: now,
        patientNotified: true,
        notificationSentAt: now,
      });
      await notify(
        ctx,
        args.patientId,
        "treatment_plan_updated",
        "Your care plan was updated",
        `${fullName(physio)} updated your plan: ${reason}`,
        "/dashboard/patient/treatment-plans"
      );
      if (fields.plannedSessions) await ctx.db.patch(episode._id, { plannedSessions: fields.plannedSessions, updatedAt: now });
      return { planId: existing._id, version };
    }

    const reviewInterval = fields.reviewDate ? Math.max(1, Math.round((fields.reviewDate - now) / DAY)) : 14;
    const planId = await ctx.db.insert("treatmentPlans", {
      patientId: args.patientId,
      physiotherapistId: physio._id,
      clinicId: relationship.clinicId,
      ...fields,
      changeReason: args.changeReason?.trim() || "First plan",
      episodeId: episode._id,
      startDate: now,
      priority: "medium",
      status: "active",
      phases: [],
      reviewInterval,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("treatmentPlanVersions", {
      treatmentPlanId: planId,
      version: 1,
      changeType: "created",
      changedBy: physio._id,
      changeDescription: args.changeReason?.trim() || "First plan",
      newData: fields,
      timestamp: now,
      patientNotified: true,
      notificationSentAt: now,
    });
    if (fields.plannedSessions) await ctx.db.patch(episode._id, { plannedSessions: fields.plannedSessions, updatedAt: now });
    await notify(
      ctx,
      args.patientId,
      "treatment_plan_created",
      "Your care plan is ready",
      `${fullName(physio)} set up your care plan: ${title}`,
      "/dashboard/patient/treatment-plans"
    );
    return { planId, version: 1 };
  },
});

// ─── Care plan templates ─────────────────────────────────────────────────────
// Saved from any care plan and used to start the next one. Stored in treatmentTemplates with
// kind "care_plan"; older phase-and-exercise templates there are offered as goals only.

const MAX_OWN_TEMPLATES = 100;

/** Templates this physio can start a plan from: their own, ones shared in their clinic, and Rehabify's. */
export const listCarePlanTemplates = query({
  args: {},
  handler: async (ctx) => {
    const physio = await physioOrNull(ctx);
    if (!physio) return [];
    const clinicId = physio.clinicId;
    const [own, shared, clinic] = await Promise.all([
      ctx.db.query("treatmentTemplates").withIndex("by_created_by", (q) => q.eq("createdBy", physio._id)).take(MAX_OWN_TEMPLATES),
      ctx.db.query("treatmentTemplates").withIndex("by_public", (q) => q.eq("isPublic", true)).take(100),
      clinicId
        ? ctx.db.query("treatmentTemplates").withIndex("by_clinic", (q) => q.eq("clinicId", clinicId)).take(200)
        : Promise.resolve([]),
    ]);
    const byId = new Map([...own, ...clinic, ...shared].map((t) => [t._id, t]));
    return [...byId.values()]
      .map((t) => ({
        id: t._id,
        title: t.title,
        description: t.description ?? null,
        goals: (t.goals ?? []).map((g) => ({ description: g.description, targetValue: g.targetValue ?? "", timeline: g.timeline ?? "" })),
        sessionFrequency: t.sessionFrequency ?? null,
        plannedSessions: t.plannedSessions ?? null,
        precautions: t.precautions ?? null,
        reviewAfterDays: t.reviewAfterDays ?? null,
        mine: t.createdBy === physio._id,
        sharedWithClinic: Boolean(t.clinicId),
        fromRehabify: t.isPublic,
        usageCount: t.usageCount ?? 0,
        updatedAt: t.updatedAt,
      }))
      .sort((a, b) => Number(b.mine) - Number(a.mine) || b.usageCount - a.usageCount || b.updatedAt - a.updatedAt);
  },
});

export const saveCarePlanTemplate = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    goals: v.array(v.object({ description: v.string(), targetValue: v.string(), timeline: v.string() })),
    sessionFrequency: v.optional(v.string()),
    plannedSessions: v.optional(v.number()),
    precautions: v.optional(v.string()),
    reviewAfterDays: v.optional(v.number()),
    shareWithClinic: v.boolean(),
  },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const title = args.title.trim();
    if (!title) throw new ConvexError("Give the template a name.");
    const goals = args.goals
      .map((g) => ({
        description: g.description.trim(),
        targetValue: g.targetValue.trim() || undefined,
        timeline: g.timeline.trim() || undefined,
        measurable: Boolean(g.targetValue.trim()),
      }))
      .filter((g) => g.description);
    if (goals.length === 0) throw new ConvexError("A template needs at least one goal.");
    const own = await ctx.db
      .query("treatmentTemplates")
      .withIndex("by_created_by", (q) => q.eq("createdBy", physio._id))
      .take(MAX_OWN_TEMPLATES);
    if (own.length >= MAX_OWN_TEMPLATES) throw new ConvexError("You have 100 templates. Delete one you no longer use first.");
    const now = Date.now();
    return await ctx.db.insert("treatmentTemplates", {
      kind: "care_plan",
      title,
      description: args.description?.trim() || undefined,
      goals,
      phases: [],
      sessionFrequency: args.sessionFrequency?.trim() || undefined,
      plannedSessions: args.plannedSessions ? Math.round(args.plannedSessions) : undefined,
      precautions: args.precautions?.trim() || undefined,
      reviewAfterDays: args.reviewAfterDays ? Math.round(args.reviewAfterDays) : undefined,
      createdBy: physio._id,
      clinicId: args.shareWithClinic ? physio.clinicId : undefined,
      isPublic: false,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const deleteCarePlanTemplate = mutation({
  args: { templateId: v.id("treatmentTemplates") },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const template = await ctx.db.get(args.templateId);
    if (!template) return null;
    if (template.createdBy !== physio._id) throw new ConvexError("You can only delete your own templates.");
    await ctx.db.delete(args.templateId);
    return null;
  },
});

/** Counts a use, so the templates you use most come first. */
export const noteCarePlanTemplateUsed = mutation({
  args: { templateId: v.id("treatmentTemplates") },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const template = await ctx.db.get(args.templateId);
    if (!template) return null;
    const allowed = template.isPublic || template.createdBy === physio._id || (template.clinicId && template.clinicId === physio.clinicId);
    if (allowed) await ctx.db.patch(args.templateId, { usageCount: (template.usageCount ?? 0) + 1 });
    return null;
  },
});

export const setGoalAchieved = mutation({
  args: { planId: v.id("treatmentPlans"), goalIndex: v.number(), achieved: v.boolean() },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.physiotherapistId !== physio._id) throw new ConvexError("Plan not found.");
    if (!plan.goals[args.goalIndex]) throw new ConvexError("Goal not found.");
    const goals = plan.goals.map((g, i) => (i === args.goalIndex ? { ...g, achieved: args.achieved || undefined } : g));
    await ctx.db.patch(plan._id, { goals, updatedAt: Date.now() });
    if (args.achieved) {
      await notify(
        ctx,
        plan.patientId,
        "goal_achieved",
        "Goal reached",
        `Well done! You've reached a goal in your plan: ${plan.goals[args.goalIndex].description}`,
        "/dashboard/patient/treatment-plans",
        "low"
      );
    }
    return { success: true };
  },
});

export const addClinicalNote = mutation({
  args: {
    patientId: v.id("users"),
    noteType: v.union(
      v.literal("initial_assessment"),
      v.literal("treatment_note"),
      v.literal("follow_up")
    ),
    subjectiveAssessment: v.optional(v.string()),
    objectiveAssessment: v.optional(v.string()),
    treatmentAdministered: v.optional(v.string()),
    planForNextSession: v.optional(v.string()),
    diagnosis: v.optional(v.string()),
    appointmentId: v.optional(v.id("appointments")),
    voiceNoteStorageId: v.optional(v.id("_storage")),
    attachments: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const relationship = await requireActiveRelationship(ctx, physio._id, args.patientId);
    const text = [args.subjectiveAssessment, args.objectiveAssessment, args.treatmentAdministered, args.planForNextSession, args.diagnosis]
      .map((t) => t?.trim())
      .filter(Boolean);
    const attachments = [...new Set(args.attachments ?? [])];
    if (text.length === 0 && !args.voiceNoteStorageId && attachments.length === 0) {
      throw new ConvexError("Write something, record a voice note or attach a file before saving.");
    }
    if (attachments.length > MAX_NOTE_ATTACHMENTS) {
      throw new ConvexError(`A note can have up to ${MAX_NOTE_ATTACHMENTS} attachments.`);
    }
    for (const fileId of attachments) {
      if (!(await ctx.db.system.get(fileId))) throw new ConvexError("One of the attachments didn't finish uploading. Try again.");
    }
    if (args.voiceNoteStorageId) {
      const voice = await ctx.db.system.get(args.voiceNoteStorageId);
      if (!voice) throw new ConvexError("The voice note didn't finish uploading. Try again.");
      if (voice.contentType && !voice.contentType.startsWith("audio/")) {
        throw new ConvexError("The voice note must be an audio recording.");
      }
    }

    let appointmentId = args.appointmentId;
    if (appointmentId) {
      const appointment = await ctx.db.get(appointmentId);
      if (!appointment || appointment.physiotherapistId !== physio._id || appointment.patientId !== args.patientId) {
        throw new ConvexError("That appointment isn't with this patient.");
      }
    } else {
      const labels = { initial_assessment: "Initial assessment", treatment_note: "Clinical note", follow_up: "Follow-up" } as const;
      appointmentId = await anchorAppointment(ctx, physio, relationship, labels[args.noteType]);
    }

    const noteId = await ctx.db.insert("sessionLogs", {
      appointmentId,
      patientId: args.patientId,
      physiotherapistId: physio._id,
      clinicId: relationship.clinicId,
      sessionDate: Date.now(),
      noteType: args.noteType,
      diagnosis: args.diagnosis?.trim() || undefined,
      subjectiveAssessment: args.subjectiveAssessment?.trim() || undefined,
      objectiveAssessment: args.objectiveAssessment?.trim() || undefined,
      treatmentAdministered: args.treatmentAdministered?.trim() || undefined,
      planForNextSession: args.planForNextSession?.trim() || undefined,
      // Stored as the storage id; getClinicalNotes turns it into a playable URL.
      voiceNoteUrl: args.voiceNoteStorageId,
      attachments: attachments.length ? attachments : undefined,
    });
    await ensureActiveEpisode(ctx, physio, relationship);
    return { noteId };
  },
});

/** A physio adds a file to the patient's record (referral letter, scan, report). */
export const attachPatientFile = mutation({
  args: {
    patientId: v.id("users"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
    contentType: v.string(),
    documentType: v.union(
      v.literal("referralLetter"),
      v.literal("medicalRecord"),
      v.literal("insuranceCard"),
      v.literal("otherDocument")
    ),
  },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const relationship = await requireActiveRelationship(ctx, physio._id, args.patientId);
    const allowed = args.contentType === "application/pdf" || /^image\/(png|jpe?g|webp|heic|heif)$/.test(args.contentType);
    if (!allowed) throw new ConvexError("Upload a PDF or a photo (JPG, PNG, WebP or HEIC).");
    if (args.fileSize > MAX_FILE_BYTES) throw new ConvexError("That file is over 15 MB.");

    let profile = await ctx.db
      .query("patientProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", args.patientId))
      .first();
    if (!profile) {
      const id = await ctx.db.insert("patientProfiles", { userId: args.patientId, clinicId: relationship.clinicId });
      profile = await ctx.db.get(id);
    }
    if (!profile) throw new ConvexError("Couldn't open this patient's record.");
    const patientUser = await ctx.db.get(args.patientId);
    if (patientUser && !patientUser.patientProfileId) {
      await ctx.db.patch(patientUser._id, { patientProfileId: profile._id });
    }

    const docId = await ctx.db.insert("patientDocuments", {
      patientProfileId: profile._id,
      storageId: args.storageId,
      documentType: args.documentType,
      fileName: args.fileName.slice(0, 200),
      fileSize: args.fileSize,
      contentType: args.contentType,
      uploadedAt: Date.now(),
      sharedWithPhysiotherapist: true,
    });
    return { docId };
  },
});

/**
 * The physio has seen a check-in. Check-ins sent before the patient had a physio carry no
 * physiotherapistId but still show in the workspace, so access follows the care relationship
 * (as getPatientWorkspace does); one addressed to another physio stays theirs.
 */
export const markCheckInReviewed = mutation({
  args: { checkInId: v.id("patientCheckIns") },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const checkIn = await ctx.db.get(args.checkInId);
    if (!checkIn) throw new ConvexError("This check-in no longer exists.");
    if (checkIn.physiotherapistId && checkIn.physiotherapistId !== physio._id) {
      throw new ConvexError("This check-in was sent to another physiotherapist.");
    }
    if (!(await findRelationship(ctx, physio._id, checkIn.patientId))) throw new ConvexError("This patient isn't on your list.");
    if (!checkIn.reviewedAt) await ctx.db.patch(checkIn._id, { reviewedAt: Date.now() });
    return { success: true };
  },
});

/** The physio has seen a high-pain home exercise log, so it leaves Needs attention. */
export const markExerciseLogReviewed = mutation({
  args: { logId: v.id("exerciseProgramLogs") },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const log = await ctx.db.get(args.logId);
    if (!log) throw new ConvexError("This exercise log no longer exists.");
    if (!(await findRelationship(ctx, physio._id, log.patientId))) throw new ConvexError("This patient isn't on your list.");
    if (!log.reviewedAt) await ctx.db.patch(log._id, { reviewedAt: Date.now() });
    return { success: true };
  },
});

/**
 * Complete a course of care: closes the episode with an outcome and summary, completes the
 * care plan, optionally cancels remaining bookings, writes the discharge note, tells the
 * patient, and schedules Rehabify's follow-up with them.
 */
export const completeCare = mutation({
  args: {
    patientId: v.id("users"),
    outcome: outcomeValidator,
    dischargeSummary: v.string(),
    homeAdvice: v.optional(v.string()),
    cancelUpcoming: v.boolean(),
    followUpInDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const relationship = await requireActiveRelationship(ctx, physio._id, args.patientId);
    const summary = args.dischargeSummary.trim();
    if (summary.length < 10) throw new ConvexError("Write a short discharge summary for the record.");
    const now = Date.now();
    const followUpDays = Math.min(90, Math.max(3, Math.round(args.followUpInDays ?? DEFAULT_FOLLOW_UP_DAYS)));

    const episode = await ensureActiveEpisode(ctx, physio, relationship);
    await ctx.db.patch(episode._id, {
      status: "completed",
      completedAt: now,
      outcome: args.outcome,
      dischargeSummary: summary,
      homeAdvice: args.homeAdvice?.trim() || undefined,
      followUpDueAt: now + followUpDays * DAY,
      followUpStatus: "scheduled",
      updatedAt: now,
    });

    // Care plans with this physio are finished
    const plans = (
      await ctx.db
        .query("treatmentPlans")
        .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
        .collect()
    ).filter((p) => p.physiotherapistId === physio._id && (p.status === "active" || p.status === "draft" || p.status === "on_hold"));
    for (const plan of plans) {
      await ctx.db.patch(plan._id, { status: "completed", completedAt: now, updatedAt: now });
    }

    // Remaining bookings
    let cancelled = 0;
    if (args.cancelUpcoming) {
      const upcoming = await ctx.db
        .query("appointments")
        .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", args.patientId).gte("startTime", now))
        .collect();
      for (const appointment of upcoming.filter((a) => a.physiotherapistId === physio._id && UPCOMING_STATUSES.has(a.status))) {
        await ctx.db.patch(appointment._id, {
          status: "cancelled_by_therapist",
          cancellationReason: "Treatment completed",
        });
        cancelled += 1;
      }
    }

    // Discharge note in the clinical record
    const appointmentId = await anchorAppointment(ctx, physio, relationship, "Discharge");
    await ctx.db.insert("sessionLogs", {
      appointmentId,
      patientId: args.patientId,
      physiotherapistId: physio._id,
      clinicId: relationship.clinicId,
      sessionDate: now,
      noteType: "discharge_summary",
      treatmentAdministered: summary,
      planForNextSession: args.homeAdvice?.trim() || undefined,
    });

    // The patient leaves the active list; records stay readable for the physio
    await ctx.db.patch(relationship._id, { status: "inactive", endDate: now });

    const patient = await ctx.db.get(args.patientId);
    const physioName = fullName(physio);
    await notify(
      ctx,
      args.patientId,
      "care_completed",
      "Your treatment is complete",
      `${physioName} has marked your course of physiotherapy as complete.${args.homeAdvice?.trim() ? " Keep going with the home advice they left you." : ""}`,
      "/dashboard/patient"
    );
    await emailPatient(ctx, patient, {
      subject: `Your physiotherapy with ${physioName} is complete`,
      heading: "Your treatment is complete",
      paragraphs: [
        `${physioName} has marked your course of physiotherapy as complete. Well done on the work you've put in.`,
        ...(args.homeAdvice?.trim() ? [`Their advice for you from here: ${args.homeAdvice.trim()}`] : []),
        `In about ${followUpDays} days the Rehabify team will check in to ask how you're getting on.`,
      ],
      buttonLabel: "Open Rehabify",
      buttonPath: "/dashboard/patient",
    });

    return { cancelledAppointments: cancelled, followUpDueAt: now + followUpDays * DAY };
  },
});

/** Start a new course of care with a returning patient. The previous episode stays on record. */
export const startNewEpisode = mutation({
  args: { patientId: v.id("users"), condition: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const relationship = await findRelationship(ctx, physio._id, args.patientId);
    if (!relationship) throw new ConvexError("This patient isn't on your list.");
    const episodes = await episodesFor(ctx, physio._id, args.patientId);
    if (episodes.some((e) => e.status === "active") && relationship.status === "active") {
      throw new ConvexError("This patient already has an open course of care.");
    }
    const now = Date.now();
    await ctx.db.patch(relationship._id, { status: "active", endDate: undefined });
    const previous = episodes[0];
    const id = await ctx.db.insert("careEpisodes", {
      patientId: args.patientId,
      physiotherapistId: physio._id,
      clinicId: relationship.clinicId,
      status: "active",
      source: "existing_patient",
      referredBy: previous?.referredBy,
      condition: args.condition?.trim() || undefined,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return { episodeId: id };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Patient: check-ins and the follow-up
// ─────────────────────────────────────────────────────────────────────────────

async function requirePatient(ctx: Ctx) {
  const user = await currentUser(ctx);
  if (!user || user.role !== "patient") throw new ConvexError("Only patients can do this.");
  return user;
}

async function primaryPhysioFor(ctx: Ctx, patientId: Id<"users">) {
  const active = (
    await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .collect()
  ).filter((r) => r.status === "active");
  return active.find((r) => r.isPrimaryPhysiotherapist) ?? active.sort((a, b) => b.startDate - a.startDate)[0] ?? null;
}

export const submitCheckIn = mutation({
  args: {
    painScore: v.number(),
    functionScore: v.optional(v.number()),
    mood: v.optional(v.union(v.literal("great"), v.literal("good"), v.literal("okay"), v.literal("low"))),
    exercisesDone: v.union(v.literal("all"), v.literal("some"), v.literal("none")),
    note: v.optional(v.string()),
    // The patient ticked "I'm worried about something" (their note says what)
    concern: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const patient = await requirePatient(ctx);
    const pain = Math.max(0, Math.min(10, Math.round(args.painScore)));
    const note = args.note?.trim().slice(0, 1000) || undefined;
    const fn = args.functionScore === undefined ? undefined : Math.max(0, Math.min(10, Math.round(args.functionScore)));
    const now = Date.now();

    const previous = (
      await ctx.db
        .query("patientCheckIns")
        .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
        .order("desc")
        .take(1)
    )[0];
    if (previous && now - previous.createdAt < 10 * 60 * 1000) {
      throw new ConvexError("You checked in a few minutes ago. Check in again tomorrow.");
    }

    const relationship = await primaryPhysioFor(ctx, patient._id);
    const physioId = relationship?.physiotherapistId;
    const episode = physioId
      ? (await episodesFor(ctx, physioId, patient._id)).find((e) => e.status === "active")
      : undefined;

    const reasons: string[] = [];
    if (pain >= HIGH_PAIN) reasons.push(`Pain ${pain}/10`);
    else if (previous && pain - previous.painScore >= 3) reasons.push(`Pain up from ${previous.painScore} to ${pain}`);
    if (args.mood === "low") reasons.push("Feeling low");
    // Something written for the physio is flagged whatever the pain score, so it gets read
    if (args.concern) reasons.push("Raised a concern");
    else if (note) reasons.push("Left a note");
    const flagged = reasons.length > 0;

    const id = await ctx.db.insert("patientCheckIns", {
      patientId: patient._id,
      physiotherapistId: physioId,
      episodeId: episode?._id,
      painScore: pain,
      functionScore: fn,
      mood: args.mood,
      exercisesDone: args.exercisesDone,
      note,
      flagged,
      flagReason: flagged ? reasons.join(" · ") : undefined,
      createdAt: now,
    });

    if (flagged && physioId) {
      await notify(
        ctx,
        physioId,
        "patient_check_in",
        `${fullName(patient)} needs your attention`,
        `${reasons.join(", ")} in today's check-in.${note ? ` They wrote: "${note.length > 140 ? `${note.slice(0, 140)}…` : note}"` : ""}`,
        `/dashboard/physiotherapist/patients/${patient._id}?tab=checkins`,
        pain >= HIGH_PAIN || args.concern ? "high" : "medium"
      );
    }
    return { checkInId: id, flagged };
  },
});

/** The patient's own recent check-ins and whether they've checked in today. */
export const getMyCheckIns = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user || user.role !== "patient") return null;
    const rows = await ctx.db
      .query("patientCheckIns")
      .withIndex("by_patient", (q) => q.eq("patientId", user._id))
      .order("desc")
      .take(14);
    const relationship = await primaryPhysioFor(ctx, user._id);
    const physio = relationship ? await ctx.db.get(relationship.physiotherapistId) : null;
    const lagosOffset = 60 * 60 * 1000;
    const startOfDay = Math.floor((Date.now() + lagosOffset) / DAY) * DAY - lagosOffset;
    return {
      checkedInToday: rows.some((r) => r.createdAt >= startOfDay),
      recent: rows,
      physioName: physio ? fullName(physio) : null,
    };
  },
});

/** Follow-ups waiting for this patient's answer. */
export const getMyFollowUps = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user || user.role !== "patient") return [];
    const episodes = await ctx.db
      .query("careEpisodes")
      .withIndex("by_patient", (q) => q.eq("patientId", user._id))
      .collect();
    return await Promise.all(
      episodes
        .filter((e) => e.followUpStatus === "sent")
        .map(async (e) => ({
          episodeId: e._id,
          completedAt: e.completedAt,
          physioName: fullName(await ctx.db.get(e.physiotherapistId)),
        }))
    );
  },
});

export const respondToFollowUp = mutation({
  args: {
    episodeId: v.id("careEpisodes"),
    rating: v.number(),
    recovery: recoveryValidator,
    comment: v.optional(v.string()),
    wantsCall: v.boolean(),
  },
  handler: async (ctx, args) => {
    const patient = await requirePatient(ctx);
    const episode = await ctx.db.get(args.episodeId);
    if (!episode || episode.patientId !== patient._id || episode.status !== "completed") {
      throw new ConvexError("We couldn't find that follow-up.");
    }
    if (episode.followUpStatus === "responded" || episode.followUpStatus === "closed") {
      throw new ConvexError("Thanks, we already have your answer.");
    }
    const rating = Math.max(1, Math.min(5, Math.round(args.rating)));
    const now = Date.now();
    await ctx.db.patch(episode._id, {
      followUpStatus: "responded",
      followUpRating: rating,
      followUpRecovery: args.recovery,
      followUpComment: args.comment?.trim().slice(0, 2000) || undefined,
      followUpWantsCall: args.wantsCall,
      followUpRespondedAt: now,
      updatedAt: now,
    });

    // Rehabify's team follows up personally when a patient asks for a call or isn't doing well
    if (args.wantsCall || rating <= 2 || args.recovery === "worse") {
      const admins = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .collect();
      for (const admin of admins) {
        await notify(
          ctx,
          admin._id,
          "care_follow_up",
          args.wantsCall ? `${fullName(patient)} asked for a call` : `${fullName(patient)} isn't doing well after care`,
          `Rated their care ${rating}/5; recovery: ${args.recovery.replace(/_/g, " ")}.`,
          "/dashboard/admin/care-follow-ups",
          "high"
        );
      }
    }
    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Rehabify team: after-care follow-ups
// ─────────────────────────────────────────────────────────────────────────────

async function requireAdmin(ctx: Ctx) {
  const user = await currentUser(ctx);
  if (!user || user.role !== "admin") throw new ConvexError("Admins only.");
  return user;
}

export const listFollowUps = query({
  args: {
    status: v.union(v.literal("scheduled"), v.literal("sent"), v.literal("responded"), v.literal("closed")),
  },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (!user || user.role !== "admin") return [];
    const rows = await ctx.db
      .query("careEpisodes")
      .withIndex("by_follow_up", (q) => q.eq("followUpStatus", args.status))
      .order(args.status === "scheduled" ? "asc" : "desc")
      .take(200);
    return await Promise.all(
      rows.map(async (e) => {
        const [patient, physio] = await Promise.all([ctx.db.get(e.patientId), ctx.db.get(e.physiotherapistId)]);
        return {
          episodeId: e._id,
          patient: { name: fullName(patient), email: patient?.email, phone: patient?.phoneNumber },
          physio: { name: fullName(physio), email: physio?.email },
          completedAt: e.completedAt,
          outcome: e.outcome,
          dischargeSummary: e.dischargeSummary,
          followUpDueAt: e.followUpDueAt,
          followUpSentAt: e.followUpSentAt,
          rating: e.followUpRating,
          recovery: e.followUpRecovery,
          comment: e.followUpComment,
          wantsCall: e.followUpWantsCall,
          respondedAt: e.followUpRespondedAt,
          notes: e.followUpNotes,
        };
      })
    );
  },
});

export const updateFollowUp = mutation({
  args: {
    episodeId: v.id("careEpisodes"),
    notes: v.optional(v.string()),
    close: v.optional(v.boolean()),
    sendNow: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const episode = await ctx.db.get(args.episodeId);
    if (!episode || episode.status !== "completed") throw new ConvexError("Follow-up not found.");
    const now = Date.now();
    if (args.sendNow && episode.followUpStatus === "scheduled") {
      await sendFollowUp(ctx, episode);
    }
    await ctx.db.patch(episode._id, {
      followUpNotes: args.notes !== undefined ? args.notes.trim() || undefined : episode.followUpNotes,
      followUpHandledBy: admin._id,
      ...(args.close ? { followUpStatus: "closed" as const, followUpClosedAt: now } : {}),
      updatedAt: now,
    });
    return { success: true };
  },
});

async function sendFollowUp(ctx: MutationCtx, episode: Doc<"careEpisodes">) {
  const now = Date.now();
  const [patient, physio] = await Promise.all([ctx.db.get(episode.patientId), ctx.db.get(episode.physiotherapistId)]);
  const path = `/dashboard/patient/follow-up/${episode._id}`;
  await ctx.db.patch(episode._id, { followUpStatus: "sent", followUpSentAt: now, updatedAt: now });
  await notify(
    ctx,
    episode.patientId,
    "care_follow_up",
    "How are you getting on?",
    `It's been a little while since you finished treatment with ${fullName(physio)}. Tell us how you're doing.`,
    path
  );
  await emailPatient(ctx, patient, {
    subject: "How are you getting on after physiotherapy?",
    heading: "How are you getting on?",
    paragraphs: [
      `It's been a little while since you finished your treatment with ${fullName(physio)}.`,
      "We'd love to know how your recovery is going. It takes under a minute, and if anything isn't right, our team will get in touch.",
    ],
    buttonLabel: "Tell us how it went",
    buttonPath: path,
  });
}

/** Daily: ask patients how they're doing once their follow-up date arrives. */
export const sendDueFollowUps = internalMutation({
  args: {},
  handler: async (ctx) => {
    const due = await ctx.db
      .query("careEpisodes")
      .withIndex("by_follow_up", (q) => q.eq("followUpStatus", "scheduled").lte("followUpDueAt", Date.now()))
      .take(100);
    for (const episode of due) {
      await sendFollowUp(ctx, episode);
    }
    return { sent: due.length };
  },
});
