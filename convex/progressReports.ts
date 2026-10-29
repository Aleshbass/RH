/**
 * Progress reports for the doctor or partner who referred a patient.
 *
 * The physio previews the report (getReportDraft), edits the impression, summary and next
 * steps, then prints it or shares it (sendProgressReport). Sharing needs the physio to confirm
 * the patient agreed; it stores a snapshot of the report with that confirmation, and makes a
 * private link (/report/<token>) that opens without signing in for 30 days unless the physio
 * withdraws it (revokeProgressReport). With an email address, the link is emailed too.
 *
 * Access: physio functions need an approved physiotherapist with a relationship to the patient
 * (reports work after care has ended). reportByToken is public and returns only the snapshot.
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { appLink } from "./helpers/appUrl";
import { notifyDoctorOfReport } from "./helpers/doctorReferralUpdates";
import { randomToken } from "./helpers/exerciseCrypto";
import { findRelationship, physioOrNull, requirePhysio } from "./helpers/careAccess";
import { physioNoteReader } from "./helpers/noteAccess";
import { readableMeasuredNotes } from "./helpers/measuredNotes";
import {
  changeThreshold,
  isRealChange,
  measureDetail,
  measureNumber,
  measureResult,
  measureTitle,
  seriesKey,
  type ClinicalMeasure,
} from "./helpers/clinicalMeasures";
import { goalMeasureName, goalProgress, goalValueText, type GoalWithMeasure } from "./helpers/goalMeasures";
import {
  describeChange,
  isReportToken,
  MAX_REPORT_MEASURES,
  REPORT_LINK_DAYS,
  REPORT_TEXT_LIMITS,
  thresholdText,
  type ReportMeasure,
  type ReportSnapshot,
} from "./helpers/progressReport";

type Ctx = QueryCtx | MutationCtx;

const DAY = 86_400_000;
const MAX_MEASURE_OPTIONS = 30;
const MAX_REPORTS_PER_DAY = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sendEmail = makeFunctionReference<
  "action",
  { to: string; subject: string; greetingName?: string; heading: string; paragraphs: string[]; buttonLabel?: string; buttonUrl?: string; footnote?: string }
>("actions/emails/sendPatientCareEmail:sendPatientCareEmail");

const fullName = (user: { firstName?: string; lastName?: string } | null | undefined) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();

const longDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });

// ─────────────────────────────────────────────────────────────────────────────
// Reading what goes into a report
// ─────────────────────────────────────────────────────────────────────────────

type Referrer = { name: string; organisation?: string; email?: string; source: "doctor" | "partner" | "record" };

/** Who referred the patient: a doctor or partner referral on Rehabify, else what the physio wrote down. */
async function findReferrer(ctx: Ctx, patientId: Id<"users">, referredBy?: string): Promise<Referrer | null> {
  const referral = (
    await ctx.db
      .query("inboundReferrals")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .take(20)
  )
    .filter((r) => r.environment !== "sandbox")
    .sort((a, b) => b.createdAt - a.createdAt)[0];

  if (referral?.referringDoctorId) {
    const doctor = await ctx.db.get(referral.referringDoctorId);
    if (doctor) {
      const profile = await ctx.db
        .query("referringDoctorProfiles")
        .withIndex("by_user_id", (q) => q.eq("userId", doctor._id))
        .first();
      const person = fullName(doctor);
      return {
        name: person ? `${profile?.title?.trim() || "Dr"} ${person}` : profile?.hospitalAffiliation || "The referring doctor",
        organisation: profile?.hospitalAffiliation || referral.hospitalClinic || undefined,
        email: doctor.email || undefined,
        source: "doctor",
      };
    }
  }

  if (referral?.partnerId) {
    const partnerId = referral.partnerId;
    const byCode = await ctx.db
      .query("partners")
      .withIndex("by_code", (q) => q.eq("code", partnerId))
      .first();
    const normalised = byCode ? null : ctx.db.normalizeId("partners", partnerId);
    const partner = byCode ?? (normalised ? await ctx.db.get(normalised) : null);
    if (partner) {
      return {
        name: partner.contactName?.trim() || partner.name,
        organisation: partner.type === "doctor" ? referral.hospitalClinic || undefined : partner.name,
        email: partner.contactEmail || undefined,
        source: "partner",
      };
    }
  }

  const written = referredBy?.trim();
  if (written) return { name: written, organisation: referral?.hospitalClinic || undefined, source: "record" };
  if (referral?.hospitalClinic) return { name: referral.hospitalClinic, source: "record" };
  return null;
}

/** The plan for this course of care: active first, then draft or paused, then the finished one. */
function pickPlan(plans: Doc<"treatmentPlans">[], episodeId: Id<"careEpisodes"> | undefined) {
  const rank = (p: Doc<"treatmentPlans">) => (p.status === "active" ? 0 : p.status === "draft" || p.status === "on_hold" ? 1 : 2);
  return (
    plans
      .filter((p) => (episodeId && p.episodeId === episodeId) || p.status === "active" || p.status === "draft" || p.status === "on_hold")
      .filter((p) => p.status !== "cancelled")
      .sort((a, b) => rank(a) - rank(b) || b.updatedAt - a.updatedAt)[0] ?? null
  );
}

async function loadReport(ctx: Ctx, physio: Doc<"users">, patientId: Id<"users">) {
  const relationship = await findRelationship(ctx, physio._id, patientId);
  if (!relationship) return null;
  const patient = await ctx.db.get(patientId);
  if (!patient) return null;

  // The current course of care (synthesised for patients who joined before episodes existed)
  const episodes = (
    await ctx.db
      .query("careEpisodes")
      .withIndex("by_patient_and_physiotherapist", (q) => q.eq("patientId", patientId).eq("physiotherapistId", physio._id))
      .collect()
  ).sort((a, b) => b.startedAt - a.startedAt);
  const episode = episodes.find((e) => e.status === "active") ?? episodes[0] ?? null;
  const care = {
    episodeId: episode?._id,
    startedAt: episode?.startedAt ?? relationship.startDate,
    completedAt: episode ? episode.completedAt : relationship.endDate,
    status: episode?.status ?? (relationship.status === "active" ? "active" : "completed"),
    condition: episode?.condition,
    referredBy: episode?.referredBy ?? relationship.referredBy,
    plannedSessions: episode?.plannedSessions,
    dischargeSummary: episode?.dischargeSummary,
    homeAdvice: episode?.homeAdvice,
  };
  const until = care.completedAt ? care.completedAt + DAY : Infinity;

  const plans = (
    await ctx.db
      .query("treatmentPlans")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .collect()
  ).filter((p) => p.physiotherapistId === physio._id);
  const plan = pickPlan(plans, care.episodeId);

  const inCourse = (n: Doc<"sessionLogs">) => n.sessionDate >= care.startedAt && n.sessionDate <= until;
  // This physio's own notes in this course of care: the impression and plan they wrote
  const notes = (
    await ctx.db
      .query("sessionLogs")
      .withIndex("by_patient_id_and_date", (q) => q.eq("patientId", patientId))
      .order("desc")
      .take(300)
  ).filter((n) => n.physiotherapistId === physio._id && inCourse(n));
  // Measures from every note the physio can read (clinic colleagues' included), as
  // getClinicalNoteMeasures shows them, so the report matches the progress on screen
  const reader = await physioNoteReader(ctx, patientId);
  const measured = reader ? (await readableMeasuredNotes(ctx, reader, patientId)).filter(inCourse) : [];

  const appointments = (
    await ctx.db
      .query("appointments")
      .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", patientId).gte("startTime", care.startedAt))
      .take(500)
  ).filter((a) => a.physiotherapistId === physio._id && !a.isRecordOnly && a.startTime <= until);

  const [profile, physioProfile, clinic, referrer] = await Promise.all([
    ctx.db
      .query("patientProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", patientId))
      .first(),
    ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", physio._id))
      .first(),
    relationship.clinicId ? ctx.db.get(relationship.clinicId) : Promise.resolve(null),
    findReferrer(ctx, patientId, care.referredBy),
  ]);

  return { patient, profile, physio, physioProfile, clinic, care, plan, notes, measured, appointments, referrer };
}

type Loaded = NonNullable<Awaited<ReturnType<typeof loadReport>>>;

/** Series the plan's goals track. */
const linkedKeys = (plan: Doc<"treatmentPlans"> | null) =>
  new Set((plan?.goals ?? []).flatMap((g) => (g.measure ? [g.measure.seriesKey] : [])));

/** Measures recorded more than once in this course of care, and any a goal tracks; goal measures first. */
function measureRows(notes: Doc<"sessionLogs">[], linked: Set<string>): ReportMeasure[] {
  type Point = { value: number; date: number; measure: ClinicalMeasure };
  const series = new Map<string, { first: Point; latest: Point; visits: number }>();
  for (const note of [...notes].sort((a, b) => a.sessionDate - b.sessionDate)) {
    for (const measure of note.measures ?? []) {
      const key = seriesKey(measure);
      const value = measureNumber(measure);
      if (key === null || value === null) continue;
      const point = { value, date: note.sessionDate, measure };
      const known = series.get(key);
      if (known) {
        known.latest = point;
        known.visits += 1;
      } else {
        series.set(key, { first: point, latest: point, visits: 1 });
      }
    }
  }
  return [...series.entries()]
    .filter(([key, s]) => s.visits >= 2 || linked.has(key))
    .sort(([ka, a], [kb, b]) => Number(linked.has(kb)) - Number(linked.has(ka)) || b.latest.date - a.latest.date)
    .slice(0, MAX_MEASURE_OPTIONS)
    .map(([key, s]) => {
      const m = s.latest.measure;
      const detail = m.kind === "psfs" ? "" : measureDetail(m);
      const moved = s.visits >= 2 ? describeChange(s.first, s.latest) : null;
      // The catalogue's smallest real change (MDC or MCID) from the first value
      const threshold = changeThreshold(s.first.measure, s.first.value);
      const real = moved ? isRealChange(s.first.measure, s.first.value, s.latest.value) : null;
      return {
        seriesKey: key,
        name: detail ? `${measureTitle(m)} (${detail})` : measureTitle(m),
        baseline: measureResult(s.first.measure),
        baselineAt: s.first.date,
        latest: measureResult(m),
        latestAt: s.latest.date,
        change: moved?.change,
        direction: moved?.direction ?? "same",
        beyondMinimal: real ?? undefined,
        minimal: threshold ? `${thresholdText(m, threshold.amount)} (${threshold.basis})` : undefined,
        visits: s.visits,
      };
    });
}

/** What the physio is offered to start from: the latest assessment, discharge summary and plan for next time. */
function defaultTexts(loaded: Loaded) {
  const newestFirst = [...loaded.notes].sort((a, b) => b.sessionDate - a.sessionDate);
  const done = loaded.care.status === "completed";
  return {
    impression: newestFirst.find((n) => n.diagnosis?.trim())?.diagnosis?.trim() ?? "",
    summary: done ? loaded.care.dischargeSummary?.trim() ?? "" : "",
    nextSteps: (done ? loaded.care.homeAdvice?.trim() : newestFirst.find((n) => n.planForNextSession?.trim())?.planForNextSession?.trim()) ?? "",
  };
}

const clip = (text: string | undefined, max: number) => {
  const trimmed = text?.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
};

function buildSnapshot(
  loaded: Loaded,
  texts: { impression?: string; summary?: string; nextSteps?: string },
  options: { measureKeys?: string[]; preparedFor?: string; now: number }
): ReportSnapshot {
  const { patient, profile, physio, physioProfile, clinic, care, plan, measured, appointments, referrer } = loaded;
  const goals: GoalWithMeasure[] = plan?.goals ?? [];

  const allMeasures = measureRows(measured, linkedKeys(plan));
  const wanted = options.measureKeys ? new Set(options.measureKeys) : null;
  const measures = wanted ? allMeasures.filter((m) => wanted.has(m.seriesKey)) : allMeasures.slice(0, MAX_REPORT_MEASURES);

  return {
    generatedAt: options.now,
    patient: {
      name: fullName(patient) || "Patient",
      rehabifyId: patient.patientNumber || undefined,
      dateOfBirth: profile?.dateOfBirth || undefined,
    },
    referrer: referrer ? { name: referrer.name, organisation: referrer.organisation } : undefined,
    preparedFor: clip(options.preparedFor, REPORT_TEXT_LIMITS.recipientName),
    physio: {
      name: fullName(physio) || "Your physiotherapist",
      licenceNumber: physioProfile?.licenseNumber?.trim() || undefined,
      clinicName: clinic?.name || undefined,
    },
    care: {
      startedAt: care.startedAt,
      completedAt: care.completedAt,
      status: care.status,
      condition: care.condition?.trim() || undefined,
    },
    impression: clip(texts.impression, REPORT_TEXT_LIMITS.impression),
    plan: plan
      ? {
          title: plan.title,
          description: plan.description || undefined,
          sessionFrequency: plan.sessionFrequency || undefined,
          plannedSessions: plan.plannedSessions ?? care.plannedSessions,
          reviewDate: plan.reviewDate,
        }
      : undefined,
    goals: goals.map((goal) => {
      const progress = goal.measure ? goalProgress(goal.measure, measured, care.startedAt) : null;
      return {
        description: goal.description,
        targetValue: goal.targetValue || undefined,
        timeline: goal.timeline || undefined,
        status: goal.achieved ? ("met" as const) : progress?.reached ? ("reached" as const) : ("in_progress" as const),
        measure:
          goal.measure && progress
            ? {
                name: goalMeasureName(goal.measure),
                baseline: progress.baseline !== null ? goalValueText(goal.measure, progress.baseline) : undefined,
                latest: progress.latest !== null ? goalValueText(goal.measure, progress.latest) : undefined,
                target: goalValueText(goal.measure, goal.measure.target),
                percent: progress.percent ?? undefined,
              }
            : undefined,
      };
    }),
    measures,
    sessions: {
      attended: appointments.filter((a) => a.status === "completed").length,
      cancelled: appointments.filter((a) => a.status.startsWith("cancelled")).length,
      missed: appointments.filter((a) => a.status === "no_show").length,
      upcoming: appointments.filter((a) => (a.status === "scheduled" || a.status === "confirmed") && a.startTime >= options.now).length,
      planned: plan?.plannedSessions ?? care.plannedSessions,
    },
    summary: clip(texts.summary, REPORT_TEXT_LIMITS.summary),
    nextSteps: clip(texts.nextSteps, REPORT_TEXT_LIMITS.nextSteps),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Physio
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The report as it stands, with the starting texts, who referred the patient (to prefill the
 * email) and every measure that could go in it (the first 12 are in by default).
 */
export const getReportDraft = query({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    const physio = await physioOrNull(ctx);
    if (!physio) return null;
    const loaded = await loadReport(ctx, physio, args.patientId);
    if (!loaded) return null;
    const defaults = defaultTexts(loaded);
    // Every measure that could go in; the screen shows the ones the physio keeps ticked
    const allKeys = measureRows(loaded.measured, linkedKeys(loaded.plan)).map((m) => m.seriesKey);
    const snapshot = buildSnapshot(loaded, defaults, { measureKeys: allKeys, now: Date.now() });
    return {
      patientId: args.patientId,
      snapshot,
      defaultMeasureKeys: allKeys.slice(0, MAX_REPORT_MEASURES),
      defaults,
      referrer: loaded.referrer,
      linkDays: REPORT_LINK_DAYS,
    };
  },
});

/** Reports this physio shared about the patient, newest first, with a link while it still opens. */
export const listProgressReports = query({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    const physio = await physioOrNull(ctx);
    if (!physio) return [];
    const now = Date.now();
    const rows = await ctx.db
      .query("progressReports")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .take(50);
    return rows
      .filter((r) => r.physiotherapistId === physio._id)
      .map((r) => {
        const state = r.revokedAt ? ("withdrawn" as const) : r.expiresAt <= now ? ("expired" as const) : ("open" as const);
        return {
          _id: r._id,
          sentAt: r.sentAt,
          expiresAt: r.expiresAt,
          revokedAt: r.revokedAt ?? null,
          recipientName: r.recipientName ?? null,
          recipientEmail: r.recipientEmail ?? null,
          emailed: Boolean(r.emailedAt),
          consentConfirmedAt: r.consentConfirmedAt,
          state,
          url: state === "open" ? appLink(`/report/${r.token}`) : null,
        };
      });
  },
});

/**
 * Shares the report: stores this version, makes a private link for 30 days, and emails it when
 * there's an address. The physio must confirm the patient agreed.
 */
export const sendProgressReport = mutation({
  args: {
    patientId: v.id("users"),
    impression: v.optional(v.string()),
    summary: v.optional(v.string()),
    nextSteps: v.optional(v.string()),
    /** seriesKey() of each measure to include; all of the default ones when left out */
    measureKeys: v.optional(v.array(v.string())),
    recipientName: v.optional(v.string()),
    recipientEmail: v.optional(v.string()),
    patientAgreed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    if (!args.patientAgreed) throw new ConvexError("Confirm the patient agreed to share this report.");
    if ((args.impression?.length ?? 0) > REPORT_TEXT_LIMITS.impression) throw new ConvexError("Keep the working impression under 1,000 characters.");
    if ((args.summary?.length ?? 0) > REPORT_TEXT_LIMITS.summary) throw new ConvexError("Keep the summary under 3,000 characters.");
    if ((args.nextSteps?.length ?? 0) > REPORT_TEXT_LIMITS.nextSteps) throw new ConvexError("Keep the next steps under 2,000 characters.");
    if ((args.measureKeys?.length ?? 0) > MAX_MEASURE_OPTIONS) throw new ConvexError("Choose fewer measures.");
    const email = args.recipientEmail?.trim().toLowerCase() || undefined;
    if (email && (email.length > 254 || !EMAIL_PATTERN.test(email))) throw new ConvexError("Check the email address.");
    const recipientName = clip(args.recipientName, REPORT_TEXT_LIMITS.recipientName);

    const loaded = await loadReport(ctx, physio, args.patientId);
    if (!loaded) throw new ConvexError("This patient isn't on your list.");
    // Works after care has ended, but not for a clinician the clinic has suspended (as requireActiveRelationship)
    const relationship = await findRelationship(ctx, physio._id, args.patientId);
    if (relationship?.clinicId && physio.clinicId === relationship.clinicId && physio.status && physio.status !== "active") {
      throw new ConvexError("Your access to this clinic has been suspended. Contact the clinic owner.");
    }

    const now = Date.now();
    const recent = await ctx.db
      .query("progressReports")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId).gte("sentAt", now - DAY))
      .collect();
    if (recent.filter((r) => r.physiotherapistId === physio._id).length >= MAX_REPORTS_PER_DAY) {
      throw new ConvexError("You've shared this patient's report a lot today. Try again tomorrow.");
    }

    const snapshot = buildSnapshot(
      loaded,
      { impression: args.impression, summary: args.summary, nextSteps: args.nextSteps },
      { measureKeys: args.measureKeys, preparedFor: recipientName, now }
    );
    const token = randomToken(32);
    const expiresAt = now + REPORT_LINK_DAYS * DAY;
    const reportId = await ctx.db.insert("progressReports", {
      patientId: args.patientId,
      physiotherapistId: physio._id,
      episodeId: loaded.care.episodeId,
      planId: loaded.plan?._id,
      token,
      snapshot,
      recipientName,
      recipientEmail: email,
      emailedAt: email ? now : undefined,
      consentConfirmedBy: physio._id,
      consentConfirmedAt: now,
      sentAt: now,
      expiresAt,
    });

    // A report for the referring doctor also shows in their referral portal, with an in-app alert
    await notifyDoctorOfReport(ctx, { patientId: args.patientId, recipientEmail: email, snapshot });

    const url = appLink(`/report/${token}`);
    if (email) {
      const physioName = snapshot.physio.name;
      const patientShort = [loaded.patient.firstName, loaded.patient.lastName?.[0] ? `${loaded.patient.lastName[0]}.` : ""]
        .filter(Boolean)
        .join(" ") || "your patient";
      await ctx.scheduler.runAfter(0, sendEmail, {
        to: email,
        subject: `Physiotherapy progress report from ${physioName}`,
        greetingName: recipientName,
        heading: "A progress report for your patient",
        paragraphs: [
          `${physioName} has shared a physiotherapy progress report for ${patientShort}, with the patient's agreement.`,
          `It covers their goals, key measures, attendance and next steps. The link is private to you and opens until ${longDate(expiresAt)}.`,
        ],
        buttonLabel: "View the report",
        buttonUrl: url,
        footnote:
          "Sent through Rehabify Health for the treating physiotherapist. If this reached you by mistake, please delete it and let support@physioaroundme.com know.",
      });
    }
    return { reportId, url, expiresAt, emailed: Boolean(email) };
  },
});

/** Stops a shared link from opening. The stored report stays on record. */
export const revokeProgressReport = mutation({
  args: { reportId: v.id("progressReports") },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const report = await ctx.db.get(args.reportId);
    if (!report || report.physiotherapistId !== physio._id) throw new ConvexError("Report not found.");
    if (!report.revokedAt) await ctx.db.patch(report._id, { revokedAt: Date.now(), revokedBy: physio._id });
    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Public: the shared link
// ─────────────────────────────────────────────────────────────────────────────

/** The report behind a shared link: the stored snapshot only, while the link is open. */
export const reportByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!isReportToken(token)) return null;
    const report = await ctx.db
      .query("progressReports")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!report) return null;
    if (report.revokedAt) return { state: "withdrawn" as const };
    if (report.expiresAt <= Date.now()) return { state: "expired" as const };
    return { state: "open" as const, snapshot: report.snapshot, sentAt: report.sentAt, expiresAt: report.expiresAt };
  },
});
