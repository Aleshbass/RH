/**
 * Outcome tracking: Rehabify asks the patient "how are you?" at set moments of a course of care
 * and turns the answers into progress on the patient's file and figures for the physio.
 *
 * - When: before treatment starts (intake), an hour before each confirmed visit, an hour or more
 *   after a visit is marked done, weekly while care is active and nothing else asked, and at
 *   discharge (final scores, a rating and feedback). Crons in crons.ts; discharge from
 *   physioCare.completeCare.
 * - How: a one-tap link /o/<token> (no sign-in; only the token's hash is stored) by email and
 *   phone notification, and WhatsApp through Joy once JOY_OUTCOME_EVENTS is "on". Signed-in
 *   patients can also answer in the app. The physio can type scores in, labelled as theirs.
 * - Figures: outcomeSummaries per physio, worked out again after each answer
 *   (lib/outcomes/stats.ts). They only show publicly when the physio opts in and has at least
 *   PUBLIC_MIN_COURSES finished courses with scores.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { insertNotification } from "./helpers/pushNotify";
import { publicAppUrl } from "./helpers/appUrl";
import { randomToken, sha256Hex } from "./helpers/exerciseCrypto";
import { currentUser, findRelationship, physioOrNull, requireActiveRelationship, requirePhysio } from "./helpers/careAccess";
import { requireAdmin } from "./helpers/partnerAccess";
import { getClinicMemberOrNull } from "./clinicTools";
import { ensureActiveEpisode, episodesFor } from "./physioCare";
import { awardPoints } from "./rewards";
import { isJoyLoginEmail } from "../lib/auth/joyLoginEmail";
import { CHECK_LINK_DAYS, MOMENT_QUESTIONS, SHARE_CONSENT_VERSION, momentMessage, quoteOptions, type OutcomeMoment } from "../lib/outcomes/moments";
import {
  PUBLIC_MIN_COURSES,
  courseChange,
  regionOf,
  sessionPairs,
  summarise,
  weeklyPain,
  type CourseRow,
  type PainPoint,
} from "../lib/outcomes/stats";

type Ctx = QueryCtx | MutationCtx;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const LAGOS_OFFSET = HOUR; // West Africa Time, UTC+1
const HIGH_PAIN = 7;
const MAX_PER_RUN = 200;

function nameOf(user: Doc<"users"> | null | undefined, fallback: string) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ") || fallback;
}

/** "Tunde A.": enough for the physio's own lists, never a full name in a summary. */
function shortName(user: Doc<"users"> | null | undefined) {
  if (!user?.firstName) return "Patient";
  return user.lastName ? `${user.firstName} ${user.lastName[0]}.` : user.firstName;
}

/** Joy patients and early invites have no real inbox. */
function reachableEmail(user: Doc<"users">) {
  const email = user.email?.trim();
  if (!email || /@placeholder\./i.test(email)) return null;
  return email;
}

/** No automatic asks late at night (before-visit asks still go: they're tied to the visit). */
function isQuietHour(now: number) {
  const hour = new Date(now + LAGOS_OFFSET).getUTCHours();
  return hour >= 21 || hour < 7;
}

function clampScore(value: number | undefined, min: number, max: number, label: string) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value)) throw new ConvexError(`Choose a ${label}.`);
  return Math.max(min, Math.min(max, Math.round(value)));
}

async function checksForEpisode(ctx: Ctx, episodeId: Id<"careEpisodes">) {
  return await ctx.db
    .query("outcomeChecks")
    .withIndex("by_episode", (q) => q.eq("episodeId", episodeId))
    .collect();
}

/** Whether the course already has a starting point (asked or given), so the next ask is a normal one. */
async function hasStartingPoint(ctx: Ctx, episode: Doc<"careEpisodes">, checks: Doc<"outcomeChecks">[]) {
  if (checks.some((c) => c.status === "answered" && typeof c.pain === "number")) return true;
  if (checks.some((c) => c.moment === "intake" && c.status === "pending")) return true;
  const daily = await ctx.db
    .query("patientCheckIns")
    .withIndex("by_patient", (q) => q.eq("patientId", episode.patientId).gte("createdAt", episode.startedAt))
    .first();
  return Boolean(daily);
}

/* ----------------------------------------------------------------------------------------------
 * Creating and sending a check
 * --------------------------------------------------------------------------------------------*/

type NewCheck = {
  patient: Doc<"users">;
  physio: Doc<"users">;
  clinicId?: Id<"clinics">;
  episodeId?: Id<"careEpisodes">;
  appointmentId?: Id<"appointments">;
  moment: OutcomeMoment;
};

/**
 * Creates a check with a fresh link and sends it. `email: false` / `app: false` when the caller
 * puts the link in its own message (completeCare does, so the patient gets one email, not two).
 */
export async function createOutcomeCheck(ctx: MutationCtx, input: NewCheck, send: { email?: boolean; app?: boolean } = {}) {
  const token = randomToken(32);
  const now = Date.now();
  const checkId = await ctx.db.insert("outcomeChecks", {
    patientId: input.patient._id,
    physiotherapistId: input.physio._id,
    clinicId: input.clinicId,
    episodeId: input.episodeId,
    appointmentId: input.appointmentId,
    moment: input.moment,
    status: "pending",
    tokenHash: await sha256Hex(token),
    expiresAt: now + CHECK_LINK_DAYS[input.moment] * DAY,
    sentVia: [],
    createdAt: now,
  });
  const path = `/o/${token}`;
  const url = `${publicAppUrl()}${path}`;
  const message = momentMessage(input.moment, nameOf(input.physio, "your physiotherapist"));
  const via: string[] = [];

  const email = reachableEmail(input.patient);
  if (email && send.email !== false) {
    await ctx.scheduler.runAfter(0, internal.actions.emails.sendPatientCareEmail.sendPatientCareEmail, {
      to: email,
      subject: message.subject,
      greetingName: input.patient.firstName,
      heading: message.heading,
      paragraphs: message.paragraphs,
      buttonLabel: message.button,
      buttonUrl: url,
    });
    via.push("email");
  }
  if (send.app !== false) {
    await insertNotification(ctx, {
      userId: input.patient._id,
      type: "outcome_check",
      priority: "medium",
      status: "pending",
      payload: { title: message.push.title, body: message.push.body, data: { actionUrl: path } },
      createdAt: now,
    });
    via.push("app");
  }
  // WhatsApp: Joy sends it once its template is approved and the switch is on. A Joy patient
  // keeps WhatsApp after paying, when their record gets a login (placeholder email) or is linked
  // to a website account, so the clerkId prefix alone missed most paid patients.
  const onWhatsApp =
    input.patient.clerkId?.startsWith("joy-whatsapp:") ||
    isJoyLoginEmail(input.patient.email) ||
    Boolean(input.patient.whatsappLinkedAt);
  if (process.env.JOY_OUTCOME_EVENTS === "on" && onWhatsApp) {
    const eventId = `outcome-${checkId}`;
    const payload = {
      event_id: eventId,
      event_type: "outcome.requested",
      api_version: "1",
      occurred_at: new Date(now).toISOString(),
      data: {
        patient_id: input.patient._id,
        moment: input.moment,
        url,
        physio_name: nameOf(input.physio, "your physiotherapist"),
        expires_at: new Date(now + CHECK_LINK_DAYS[input.moment] * DAY).toISOString(),
      },
    };
    await ctx.db.insert("joyEventOutbox", { eventId, eventType: "outcome.requested", payload, status: "pending", attempts: 0, createdAt: now, updatedAt: now });
    via.push("whatsapp");
  }
  await ctx.db.patch(checkId, { sentVia: via });
  return { checkId, path, url, via };
}

/** The patient, physio and open course for a visit, or null when care isn't active. */
async function careForVisit(ctx: MutationCtx, appointment: Doc<"appointments">) {
  const [patient, physio] = await Promise.all([ctx.db.get(appointment.patientId), ctx.db.get(appointment.physiotherapistId)]);
  if (!patient || !physio || physio.role !== "physiotherapist") return null;
  const relationship = await findRelationship(ctx, physio._id, patient._id);
  if (!relationship || relationship.status !== "active") return null;
  const episode = await ensureActiveEpisode(ctx, physio, relationship);
  return { patient, physio, relationship, episode };
}

/** Cron, every 15 minutes: the ask before each confirmed visit and after each finished one. */
export const sendSessionChecks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let before = 0;
    let after = 0;

    // Before: visits starting in 45–75 minutes. The first ask of a course is the starting point.
    const soon = await ctx.db
      .query("appointments")
      .withIndex("by_start_time", (q) => q.gte("startTime", now + 45 * MINUTE).lt("startTime", now + 75 * MINUTE))
      .take(MAX_PER_RUN);
    for (const appointment of soon) {
      if (appointment.status !== "confirmed" || appointment.isRecordOnly) continue;
      const existing = await ctx.db
        .query("outcomeChecks")
        .withIndex("by_appointment", (q) => q.eq("appointmentId", appointment._id))
        .first();
      if (existing) continue;
      const care = await careForVisit(ctx, appointment);
      if (!care || care.episode.autoChecksPaused) continue;
      const checks = await checksForEpisode(ctx, care.episode._id);
      // They told us in the last 3 hours already
      if (checks.some((c) => c.answeredAt && now - c.answeredAt < 3 * HOUR)) continue;
      const moment: OutcomeMoment = (await hasStartingPoint(ctx, care.episode, checks)) ? "pre_session" : "intake";
      await createOutcomeCheck(ctx, {
        patient: care.patient,
        physio: care.physio,
        clinicId: care.relationship.clinicId,
        episodeId: care.episode._id,
        appointmentId: appointment._id,
        moment,
      });
      before += 1;
    }

    // After: visits that ended 1–12 hours ago and were marked done
    if (!isQuietHour(now)) {
      const recent = await ctx.db
        .query("appointments")
        .withIndex("by_start_time", (q) => q.gte("startTime", now - 14 * HOUR).lt("startTime", now - HOUR))
        .take(MAX_PER_RUN * 2);
      for (const appointment of recent) {
        if (appointment.status !== "completed" || appointment.isRecordOnly) continue;
        if (appointment.endTime > now - HOUR || appointment.endTime < now - 12 * HOUR) continue;
        const existing = await ctx.db
          .query("outcomeChecks")
          .withIndex("by_appointment", (q) => q.eq("appointmentId", appointment._id))
          .collect();
        if (existing.some((c) => c.moment === "post_session")) continue;
        const care = await careForVisit(ctx, appointment);
        if (!care || care.episode.autoChecksPaused) continue;
        await createOutcomeCheck(ctx, {
          patient: care.patient,
          physio: care.physio,
          clinicId: care.relationship.clinicId,
          episodeId: care.episode._id,
          appointmentId: appointment._id,
          moment: "post_session",
        });
        after += 1;
        if (after >= MAX_PER_RUN) break;
      }
    }
    return { before, after };
  },
});

/**
 * Cron, daily at 10:00 Lagos: closes links nobody used, and asks patients in active care how
 * their week was when nothing else has asked in 7 days and no visit is coming in the next 2.
 * Only for patients seen in the last 30 days, so a course nobody closed doesn't keep asking.
 */
export const sendWeeklyChecks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const stale = await ctx.db
      .query("outcomeChecks")
      .withIndex("by_status_and_expiry", (q) => q.eq("status", "pending").lt("expiresAt", now))
      .take(500);
    for (const check of stale) await ctx.db.patch(check._id, { status: "expired" });

    let sent = 0;
    const active = await ctx.db
      .query("careEpisodes")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    for (const episode of active) {
      if (sent >= MAX_PER_RUN) break;
      if (episode.autoChecksPaused || now - episode.startedAt < 7 * DAY) continue;
      const checks = await checksForEpisode(ctx, episode._id);
      if (checks.some((c) => now - c.createdAt < 7 * DAY)) continue;
      const lastDaily = await ctx.db
        .query("patientCheckIns")
        .withIndex("by_patient", (q) => q.eq("patientId", episode.patientId))
        .order("desc")
        .first();
      if (lastDaily && now - lastDaily.createdAt < 7 * DAY) continue;
      const visits = (
        await ctx.db
          .query("appointments")
          .withIndex("by_patient_id_and_time", (q) =>
            q.eq("patientId", episode.patientId).gte("startTime", now - 30 * DAY).lt("startTime", now + 2 * DAY)
          )
          .collect()
      ).filter((a) => a.physiotherapistId === episode.physiotherapistId && !a.isRecordOnly);
      if (!visits.some((a) => a.status === "completed" && a.startTime < now)) continue;
      if (visits.some((a) => a.status === "confirmed" && a.startTime > now)) continue;
      const [patient, physio] = await Promise.all([ctx.db.get(episode.patientId), ctx.db.get(episode.physiotherapistId)]);
      if (!patient || !physio) continue;
      const relationship = await findRelationship(ctx, physio._id, patient._id);
      if (!relationship || relationship.status !== "active") continue;
      await createOutcomeCheck(ctx, {
        patient,
        physio,
        clinicId: episode.clinicId,
        episodeId: episode._id,
        moment: (await hasStartingPoint(ctx, episode, checks)) ? "check_in" : "intake",
      });
      sent += 1;
    }
    return { expired: stale.length, sent };
  },
});

/* ----------------------------------------------------------------------------------------------
 * Answers
 * --------------------------------------------------------------------------------------------*/

const answersValidator = v.object({
  pain: v.number(),
  functionScore: v.optional(v.number()),
  goalActivity: v.optional(v.string()),
  goalScore: v.optional(v.number()),
  globalChange: v.optional(v.number()),
  rating: v.optional(v.number()),
  feedback: v.optional(v.string()),
  shareConsent: v.optional(v.boolean()),
});

type Answers = {
  pain: number;
  functionScore?: number;
  goalActivity?: string;
  goalScore?: number;
  globalChange?: number;
  rating?: number;
  feedback?: string;
  shareConsent?: boolean;
};

/** Pain points of a course: answered checks and the patient's own daily check-ins. */
async function coursePoints(ctx: Ctx, episode: Doc<"careEpisodes">, checks?: Doc<"outcomeChecks">[]) {
  const rows = checks ?? (await checksForEpisode(ctx, episode._id));
  const dailies = (
    await ctx.db
      .query("patientCheckIns")
      .withIndex("by_patient", (q) => q.eq("patientId", episode.patientId).gte("createdAt", episode.startedAt))
      .collect()
  ).filter((c) => c.episodeId === episode._id);
  const points: PainPoint[] = [
    ...rows
      .filter((c) => c.status === "answered" && typeof c.pain === "number" && c.moment !== "discharge")
      .map((c) => ({
        at: c.answeredAt ?? c.createdAt,
        pain: c.pain!,
        by: c.answeredBy ?? ("patient" as const),
        moment: c.moment,
        appointmentId: c.appointmentId,
      })),
    ...dailies.map((c) => ({ at: c.createdAt, pain: c.painScore, by: "patient" as const, moment: "daily" })),
  ];
  const discharge = rows.find((c) => c.moment === "discharge" && c.status === "answered");
  return { points, dischargePain: discharge?.pain ?? null, discharge: discharge ?? null, dailies };
}

async function applyAnswers(ctx: MutationCtx, check: Doc<"outcomeChecks">, answers: Answers) {
  const asked = new Set(MOMENT_QUESTIONS[check.moment]);
  const pain = clampScore(answers.pain, 0, 10, "pain score")!;
  const feedback = asked.has("feedback") ? answers.feedback?.trim().slice(0, 600) || undefined : undefined;
  const now = Date.now();
  await ctx.db.patch(check._id, {
    status: "answered",
    answeredBy: "patient",
    answeredAt: now,
    pain,
    functionScore: asked.has("function") ? clampScore(answers.functionScore, 0, 10, "score") : undefined,
    goalActivity: check.moment === "intake" ? answers.goalActivity?.trim().slice(0, 120) || undefined : undefined,
    goalScore: asked.has("goal") ? clampScore(answers.goalScore, 0, 10, "score") : undefined,
    globalChange: asked.has("global") ? clampScore(answers.globalChange, -3, 3, "answer") : undefined,
    rating: asked.has("rating") ? clampScore(answers.rating, 1, 5, "rating") : undefined,
    feedback,
    ...(feedback && answers.shareConsent ? { shareConsentAt: now, shareConsentVersion: SHARE_CONSENT_VERSION } : {}),
  });

  // Where they started, for the thank-you screen and the physio's alert
  const episode = check.episodeId ? await ctx.db.get(check.episodeId) : null;
  const { points } = episode ? await coursePoints(ctx, episode) : { points: [] as PainPoint[] };
  const first = points.filter((p) => p.at < now - MINUTE).sort((a, b) => a.at - b.at)[0];
  const baseline = first ? first.pain : null;

  const patient = await ctx.db.get(check.patientId);
  const who = nameOf(patient, "Your patient");
  const link = `/dashboard/physiotherapist/patients/${check.patientId}`;
  if (check.moment === "discharge") {
    // A full course of scores, start to finish, earns the physio points (once per course)
    if (baseline !== null && check.episodeId) {
      await awardPoints(ctx, {
        userId: check.physiotherapistId,
        reason: "discharge_scores",
        dedupeKey: `discharge_scores:${check.episodeId}`,
        label: `Discharge with complete scores · ${shortName(patient)}`,
        refType: "careEpisodes",
        refId: check.episodeId,
      });
    }
    await insertNotification(ctx, {
      userId: check.physiotherapistId,
      type: "outcome_feedback",
      priority: "low",
      status: "pending",
      payload: {
        title: `${who} sent their final scores`,
        body: `Pain ${baseline ?? "?"} → ${pain}.${answers.rating ? ` Rated their care ${clampScore(answers.rating, 1, 5, "rating")}/5.` : ""}${feedback ? " They left you a note." : ""}`,
        data: { actionUrl: link },
      },
      createdAt: now,
    });
  } else if (pain >= HIGH_PAIN || (baseline !== null && pain - baseline >= 3)) {
    await insertNotification(ctx, {
      userId: check.physiotherapistId,
      type: "outcome_alert",
      priority: pain >= HIGH_PAIN ? "high" : "medium",
      status: "pending",
      payload: {
        title: `${who}: pain ${pain}/10`,
        body: `${check.moment === "pre_session" ? "Before today’s session" : check.moment === "post_session" ? "After the session" : "In their check-in"}${baseline !== null ? `, from ${baseline} at the start` : ""}.`,
        data: { actionUrl: link },
      },
      createdAt: now,
    });
  }
  await ctx.scheduler.runAfter(0, internal.outcomes.recomputeSummary, { physiotherapistId: check.physiotherapistId });
  return { baseline, pain };
}

async function checkByToken(ctx: Ctx, token: string) {
  if (!/^[A-Za-z0-9]{20,64}$/.test(token)) return null;
  const tokenHash = await sha256Hex(token);
  return await ctx.db
    .query("outcomeChecks")
    .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
    .unique();
}

/** /o/<token>: what to ask. Only first names and the physio's name; nothing clinical. */
export const getCheckByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const check = await checkByToken(ctx, args.token);
    if (!check) return { state: "not_found" as const };
    const [patient, physio] = await Promise.all([ctx.db.get(check.patientId), ctx.db.get(check.physiotherapistId)]);
    const base = {
      moment: check.moment,
      firstName: patient?.firstName ?? null,
      physioName: nameOf(physio, "your physiotherapist"),
    };
    if (check.status === "answered") return { state: "answered" as const, ...base };
    if (check.status === "expired" || (check.expiresAt ?? 0) < Date.now()) return { state: "expired" as const, ...base };
    // At discharge, the activity they named at the start is asked about again
    let goalActivity: string | null = null;
    if (check.moment === "discharge" && check.episodeId) {
      const intake = (await checksForEpisode(ctx, check.episodeId)).find((c) => c.moment === "intake" && c.goalActivity);
      goalActivity = intake?.goalActivity ?? null;
    }
    return { state: "open" as const, ...base, questions: MOMENT_QUESTIONS[check.moment], goalActivity };
  },
});

export const submitByToken = mutation({
  args: { token: v.string(), answers: answersValidator },
  handler: async (ctx, args) => {
    const check = await checkByToken(ctx, args.token);
    if (!check) throw new ConvexError("This link isn’t valid. Ask your physio for a new one.");
    if (check.status === "answered") throw new ConvexError("Thanks, you’ve already answered this one.");
    if (check.status === "expired" || (check.expiresAt ?? 0) < Date.now()) {
      throw new ConvexError("This link has closed. You’ll get a new one next time.");
    }
    return await applyAnswers(ctx, check, args.answers);
  },
});

/* ----------------------------------------------------------------------------------------------
 * Physio
 * --------------------------------------------------------------------------------------------*/

/** The physio treating the patient, or the clinic owner reading a clinic patient's record. */
async function readerFor(ctx: QueryCtx, patientId: Id<"users">) {
  const physio = await physioOrNull(ctx);
  if (physio) {
    const relationship = await findRelationship(ctx, physio._id, patientId);
    return relationship ? { physioId: physio._id, clinicId: relationship.clinicId, readOnly: false } : null;
  }
  const member = await getClinicMemberOrNull(ctx, "patients");
  if (!member || member.kind === "clinician") return null;
  const rows = (
    await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .collect()
  ).filter((r) => r.clinicId === member.clinic._id);
  const relationship = rows.find((r) => r.status === "active") ?? rows[0];
  return relationship ? { physioId: relationship.physiotherapistId, clinicId: member.clinic._id, readOnly: true } : null;
}

/** Everything the Outcomes card on the patient's file shows, for one course of care. */
export const getPatientOutcomes = query({
  args: { patientId: v.id("users"), episodeId: v.optional(v.id("careEpisodes")) },
  handler: async (ctx, args) => {
    const reader = await readerFor(ctx, args.patientId);
    if (!reader) return null;
    const episodes = await episodesFor(ctx, reader.physioId, args.patientId, reader.clinicId);
    const episode =
      (args.episodeId && episodes.find((e) => e._id === args.episodeId)) || episodes.find((e) => e.status === "active") || episodes[0];
    if (!episode) return { episode: null, readOnly: reader.readOnly };
    const now = Date.now();
    const checks = await checksForEpisode(ctx, episode._id);
    const { points, dischargePain, discharge, dailies } = await coursePoints(ctx, episode, checks);
    const change = courseChange(points, dischargePain);
    const answered = checks.filter((c) => c.status === "answered").sort((a, b) => (b.answeredAt ?? 0) - (a.answeredAt ?? 0));
    const functionScores = [
      ...answered.filter((c) => typeof c.functionScore === "number").map((c) => ({ at: c.answeredAt ?? c.createdAt, value: c.functionScore! })),
      ...dailies.filter((d) => typeof d.functionScore === "number").map((d) => ({ at: d.createdAt, value: d.functionScore! })),
    ].sort((a, b) => a.at - b.at);
    const intake = checks.find((c) => c.moment === "intake" && c.goalActivity);
    const goalScores = answered.filter((c) => typeof c.goalScore === "number").sort((a, b) => (a.answeredAt ?? 0) - (b.answeredAt ?? 0));
    const pending = checks
      .filter((c) => c.status === "pending" && (c.expiresAt ?? 0) > now)
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    // What will ask next on its own
    let next: { kind: "before_visit" | "weekly"; at: number } | null = null;
    if (episode.status === "active" && !episode.autoChecksPaused) {
      const upcoming = (
        await ctx.db
          .query("appointments")
          .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", args.patientId).gte("startTime", now + HOUR))
          .take(20)
      ).find((a) => a.physiotherapistId === episode.physiotherapistId && a.status === "confirmed" && !a.isRecordOnly);
      const lastAsk = Math.max(0, ...checks.map((c) => c.createdAt), ...dailies.map((d) => d.createdAt));
      const weekly = Math.max(lastAsk, episode.startedAt) + 7 * DAY;
      next = upcoming && upcoming.startTime - HOUR < weekly ? { kind: "before_visit", at: upcoming.startTime - HOUR } : { kind: "weekly", at: weekly };
    }

    return {
      readOnly: reader.readOnly,
      episode: {
        _id: episode._id,
        status: episode.status,
        condition: episode.condition ?? null,
        startedAt: episode.startedAt,
        completedAt: episode.completedAt ?? null,
        paused: Boolean(episode.autoChecksPaused),
      },
      pain: change,
      weekly: weeklyPain(points),
      sessions: sessionPairs(points).slice(-6),
      function: functionScores.length
        ? { first: functionScores[0].value, latest: functionScores[functionScores.length - 1].value, count: functionScores.length }
        : null,
      goal: intake
        ? {
            activity: intake.goalActivity!,
            first: intake.goalScore ?? null,
            latest: goalScores.length > 1 ? goalScores[goalScores.length - 1].goalScore! : null,
          }
        : null,
      recent: answered.slice(0, 8).map((c) => ({
        _id: c._id,
        moment: c.moment,
        pain: c.pain ?? null,
        by: c.answeredBy ?? "patient",
        at: c.answeredAt ?? c.createdAt,
      })),
      pending: pending ? { moment: pending.moment, sentAt: pending.createdAt, via: pending.sentVia } : null,
      next,
      final: discharge
        ? {
            checkId: discharge._id,
            pain: discharge.pain ?? null,
            globalChange: discharge.globalChange ?? null,
            rating: discharge.rating ?? null,
            feedback: discharge.feedback ?? null,
            canShare: Boolean(discharge.shareConsentAt && !discharge.shareRevokedAt),
            at: discharge.answeredAt ?? discharge.createdAt,
          }
        : null,
      dischargeAsked: checks.some((c) => c.moment === "discharge"),
    };
  },
});

/** "Send a check-in now": also returns the link, so the physio can pass it on by WhatsApp. */
export const sendCheckNow = mutation({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const relationship = await requireActiveRelationship(ctx, physio._id, args.patientId);
    const patient = await ctx.db.get(args.patientId);
    if (!patient) throw new ConvexError("Patient not found.");
    const episode = await ensureActiveEpisode(ctx, physio, relationship);
    const checks = await checksForEpisode(ctx, episode._id);
    const now = Date.now();
    const waiting = checks.find((c) => c.status === "pending" && (c.expiresAt ?? 0) > now && now - c.createdAt < DAY);
    if (waiting) throw new ConvexError(`${patient.firstName ?? "They"} already has a check waiting from today.`);
    const moment: OutcomeMoment = (await hasStartingPoint(ctx, episode, checks)) ? "check_in" : "intake";
    const sent = await createOutcomeCheck(ctx, {
      patient,
      physio,
      clinicId: relationship.clinicId,
      episodeId: episode._id,
      moment,
    });
    return { moment, via: sent.via, url: sent.url, phone: patient.phoneNumber ?? null, firstName: patient.firstName ?? null };
  },
});

/** Scores the physio takes in the room ("pain at the start / at the end"), labelled as theirs. */
export const recordScores = mutation({
  args: {
    patientId: v.id("users"),
    when: v.union(v.literal("pre_session"), v.literal("post_session"), v.literal("check_in")),
    pain: v.number(),
    functionScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const relationship = await requireActiveRelationship(ctx, physio._id, args.patientId);
    const episode = await ensureActiveEpisode(ctx, physio, relationship);
    const now = Date.now();
    const startOfDay = Math.floor((now + LAGOS_OFFSET) / DAY) * DAY - LAGOS_OFFSET;
    const visit =
      args.when === "check_in"
        ? undefined
        : (
            await ctx.db
              .query("appointments")
              .withIndex("by_patient_id_and_time", (q) =>
                q.eq("patientId", args.patientId).gte("startTime", startOfDay).lt("startTime", startOfDay + DAY)
              )
              .collect()
          ).find((a) => a.physiotherapistId === physio._id && !a.isRecordOnly && !a.status.startsWith("cancelled"));
    const checks = await checksForEpisode(ctx, episode._id);
    if (visit && checks.some((c) => c.appointmentId === visit._id && c.moment === args.when && c.status === "answered")) {
      throw new ConvexError(args.when === "pre_session" ? "Today’s starting score is already in." : "Today’s end score is already in.");
    }
    const moment: OutcomeMoment =
      args.when !== "post_session" && !(await hasStartingPoint(ctx, episode, checks)) ? "intake" : args.when;
    await ctx.db.insert("outcomeChecks", {
      patientId: args.patientId,
      physiotherapistId: physio._id,
      clinicId: relationship.clinicId,
      episodeId: episode._id,
      appointmentId: visit?._id,
      moment,
      status: "answered",
      sentVia: [],
      answeredBy: "physio",
      enteredBy: physio._id,
      pain: clampScore(args.pain, 0, 10, "pain score"),
      functionScore: clampScore(args.functionScore, 0, 10, "score"),
      answeredAt: now,
      createdAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.outcomes.recomputeSummary, { physiotherapistId: physio._id });
    return { moment };
  },
});

export const setAutoChecksPaused = mutation({
  args: { patientId: v.id("users"), paused: v.boolean() },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const relationship = await requireActiveRelationship(ctx, physio._id, args.patientId);
    const episode = await ensureActiveEpisode(ctx, physio, relationship);
    await ctx.db.patch(episode._id, { autoChecksPaused: args.paused, updatedAt: Date.now() });
    return { paused: args.paused };
  },
});

/** Works out the physio's figures again (after every answer and discharge). */
export const recomputeSummary = internalMutation({
  args: { physiotherapistId: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const since = now - 730 * DAY;
    const episodes = (
      await ctx.db
        .query("careEpisodes")
        .withIndex("by_physiotherapist_and_status", (q) => q.eq("physiotherapistId", args.physiotherapistId))
        .collect()
    ).filter((e) => e.status !== "cancelled" && e.startedAt >= since);
    const checks = await ctx.db
      .query("outcomeChecks")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", args.physiotherapistId).gte("createdAt", since))
      .collect();

    const rows: CourseRow[] = [];
    const recent: {
      episodeId: Id<"careEpisodes">;
      patientId: Id<"users">;
      patientName: string;
      condition: string | null;
      completedAt: number | null;
      baseline: number | null;
      latest: number | null;
      rating: number | null;
    }[] = [];
    const allPoints: PainPoint[] = [];
    for (const episode of episodes) {
      const own = checks.filter((c) => c.episodeId === episode._id);
      const { points, dischargePain, discharge } = await coursePoints(ctx, episode, own);
      allPoints.push(...points);
      const change = courseChange(points, dischargePain);
      const visits = (
        await ctx.db
          .query("appointments")
          .withIndex("by_patient_id_and_time", (q) =>
            q.eq("patientId", episode.patientId).gte("startTime", episode.startedAt).lte("startTime", episode.completedAt ?? now)
          )
          .collect()
      ).filter((a) => a.physiotherapistId === episode.physiotherapistId && a.status === "completed" && !a.isRecordOnly);
      const rating = discharge?.rating ?? episode.followUpRating ?? null;
      rows.push({
        completed: episode.status === "completed",
        baseline: change?.baseline ?? null,
        latest: change?.latest ?? null,
        meaningful: change?.meaningful ?? null,
        sessions: visits.length,
        rating,
        region: regionOf(episode.condition),
      });
      if (episode.status === "completed") {
        recent.push({
          episodeId: episode._id,
          patientId: episode.patientId,
          patientName: shortName(await ctx.db.get(episode.patientId)),
          condition: episode.condition ?? null,
          completedAt: episode.completedAt ?? null,
          baseline: change?.baseline ?? null,
          latest: change?.latest ?? null,
          rating,
        });
      }
    }
    const summary = {
      ...summarise(rows, sessionPairs(allPoints)),
      recent: recent.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)).slice(0, 20),
    };
    const existing = await ctx.db
      .query("outcomeSummaries")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", args.physiotherapistId))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { summary, updatedAt: now });
    else await ctx.db.insert("outcomeSummaries", { physiotherapistId: args.physiotherapistId, summary, showOnProfile: false, updatedAt: now });
  },
});

/** The physio's own outcome figures (Me → Outcomes). */
export const getMyOutcomes = query({
  args: {},
  handler: async (ctx) => {
    const physio = await physioOrNull(ctx);
    if (!physio) return null;
    const row = await ctx.db
      .query("outcomeSummaries")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physio._id))
      .unique();
    return {
      summary: row?.summary ?? null,
      showOnProfile: row?.showOnProfile ?? false,
      updatedAt: row?.updatedAt ?? null,
      publicMin: PUBLIC_MIN_COURSES,
    };
  },
});

/** Opening Me → Outcomes refreshes figures older than an hour. */
export const refreshMyOutcomes = mutation({
  args: {},
  handler: async (ctx) => {
    const physio = await requirePhysio(ctx);
    const row = await ctx.db
      .query("outcomeSummaries")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physio._id))
      .unique();
    if (row && Date.now() - row.updatedAt < HOUR) return { refreshed: false };
    await ctx.scheduler.runAfter(0, internal.outcomes.recomputeSummary, { physiotherapistId: physio._id });
    return { refreshed: true };
  },
});

export const setShowOutcomesOnProfile = mutation({
  args: { show: v.boolean() },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const row = await ctx.db
      .query("outcomeSummaries")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physio._id))
      .unique();
    if (row) await ctx.db.patch(row._id, { showOnProfile: args.show });
    else {
      await ctx.db.insert("outcomeSummaries", { physiotherapistId: physio._id, summary: null, showOnProfile: args.show, updatedAt: 0 });
      await ctx.scheduler.runAfter(0, internal.outcomes.recomputeSummary, { physiotherapistId: physio._id });
    }
    return { show: args.show };
  },
});

/** A physio's public figures: only when they opted in and have enough finished courses. */
export const getPublicOutcomes = query({
  args: { physiotherapistId: v.id("users") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("outcomeSummaries")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", args.physiotherapistId))
      .unique();
    const s = row?.summary as (ReturnType<typeof summarise> & { recent?: unknown }) | null | undefined;
    if (!row?.showOnProfile || !s || s.scored < PUBLIC_MIN_COURSES) return null;
    return {
      scored: s.scored,
      baselineMedian: s.baselineMedian,
      latestMedian: s.latestMedian,
      changeMedian: s.changeMedian,
      meaningfulPct: s.meaningfulPct,
      sessionsMedian: s.sessionsMedian,
      ratingAverage: s.ratingAverage,
      ratingCount: s.ratingCount,
      byRegion: s.byRegion.filter((r) => r.courses >= 3),
    };
  },
});

/* ----------------------------------------------------------------------------------------------
 * Patient
 * --------------------------------------------------------------------------------------------*/

/** "Your progress": each course of care with pain over time, and anything waiting to answer. */
export const getMyProgress = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user || user.role !== "patient") return null;
    const now = Date.now();
    const episodes = (
      await ctx.db
        .query("careEpisodes")
        .withIndex("by_patient", (q) => q.eq("patientId", user._id))
        .collect()
    )
      .filter((e) => e.status !== "cancelled")
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 4);
    const courses = [];
    for (const episode of episodes) {
      const checks = await checksForEpisode(ctx, episode._id);
      const { points, dischargePain, discharge } = await coursePoints(ctx, episode, checks);
      const physio = await ctx.db.get(episode.physiotherapistId);
      courses.push({
        episodeId: episode._id,
        status: episode.status,
        condition: episode.condition ?? null,
        startedAt: episode.startedAt,
        completedAt: episode.completedAt ?? null,
        physioName: nameOf(physio, "Your physiotherapist"),
        pain: courseChange(points, dischargePain),
        weekly: weeklyPain(points),
        sessions: sessionPairs(points).slice(-4),
        waiting: checks
          .filter((c) => c.status === "pending" && (c.expiresAt ?? 0) > now)
          .map((c) => ({ checkId: c._id, moment: c.moment, sentAt: c.createdAt })),
        shared: discharge
          ? { feedback: discharge.feedback ?? null, consented: Boolean(discharge.shareConsentAt && !discharge.shareRevokedAt), checkId: discharge._id }
          : null,
      });
    }
    return { firstName: user.firstName ?? null, courses };
  },
});

/** A signed-in patient answering in the app instead of the link. */
export const answerMyCheck = mutation({
  args: { checkId: v.id("outcomeChecks"), answers: answersValidator },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    const check = await ctx.db.get(args.checkId);
    if (!user || !check || check.patientId !== user._id) throw new ConvexError("This check isn’t yours.");
    if (check.status !== "pending" || (check.expiresAt ?? 0) < Date.now()) throw new ConvexError("This check has closed.");
    return await applyAnswers(ctx, check, args.answers);
  },
});

/** The patient takes back their permission to share their words. */
export const revokeShareConsent = mutation({
  args: { checkId: v.id("outcomeChecks") },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    const check = await ctx.db.get(args.checkId);
    if (!user || !check || check.patientId !== user._id) throw new ConvexError("This isn’t yours.");
    if (check.shareConsentAt && !check.shareRevokedAt) await ctx.db.patch(check._id, { shareRevokedAt: Date.now() });
    return { revoked: true };
  },
});

/* ----------------------------------------------------------------------------------------------
 * Feedback: the patient's final words, cards the physio shares, and public proof
 * --------------------------------------------------------------------------------------------*/

const canShareCheck = (c: Doc<"outcomeChecks">) => Boolean(c.feedback && c.shareConsentAt && !c.shareRevokedAt);

/** Area for a card: neighbourhood or city only, never an address. */
async function patientArea(ctx: Ctx, patientId: Id<"users">) {
  const profile = await ctx.db
    .query("patientProfiles")
    .withIndex("by_user_id", (q) => q.eq("userId", patientId))
    .first();
  return profile?.area?.trim() || profile?.city?.trim() || null;
}

/** First and final pain and the number of sessions for the course the feedback closes. */
async function courseFacts(ctx: Ctx, check: Doc<"outcomeChecks">) {
  const episode = check.episodeId ? await ctx.db.get(check.episodeId) : null;
  if (!episode) return { painFrom: null, painTo: check.pain ?? null, sessions: null };
  const { points, dischargePain } = await coursePoints(ctx, episode);
  const change = courseChange(points, dischargePain);
  const visits = (
    await ctx.db
      .query("appointments")
      .withIndex("by_patient_id_and_time", (q) =>
        q.eq("patientId", episode.patientId).gte("startTime", episode.startedAt).lte("startTime", episode.completedAt ?? Date.now())
      )
      .collect()
  ).filter((a) => a.physiotherapistId === episode.physiotherapistId && a.status === "completed" && !a.isRecordOnly);
  return { painFrom: change?.baseline ?? null, painTo: change?.latest ?? check.pain ?? null, sessions: visits.length || null };
}

async function physioCardName(ctx: Ctx, physioId: Id<"users">) {
  const physio = await ctx.db.get(physioId);
  const profile = await ctx.db
    .query("physiotherapistProfiles")
    .withIndex("by_user_id", (q) => q.eq("userId", physioId))
    .first();
  const name = physio?.firstName ? `${physio.firstName}${physio.lastName ? ` ${physio.lastName[0]}.` : ""}` : "Your physiotherapist";
  const title = profile?.specializations?.[0]?.trim() || "Physiotherapist";
  const path = `/book/${profile?.bookingSlug || physioId}`;
  return { name, title, path };
}

/** Me → Feedback: every patient's final rating and words, newest first. */
export const getMyFeedback = query({
  args: {},
  handler: async (ctx) => {
    const physio = await physioOrNull(ctx);
    if (!physio) return null;
    const checks = (
      await ctx.db
        .query("outcomeChecks")
        .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physio._id))
        .order("desc")
        .take(600)
    )
      .filter((c) => c.moment === "discharge" && c.status === "answered" && (c.rating || c.feedback))
      .slice(0, 50);
    const rows = await Promise.all(
      checks.map(async (c) => {
        const patient = await ctx.db.get(c.patientId);
        const facts = await courseFacts(ctx, c);
        return {
          checkId: c._id,
          patientId: c.patientId,
          patientName: shortName(patient),
          rating: c.rating ?? null,
          feedback: c.feedback ?? null,
          globalChange: c.globalChange ?? null,
          canShare: canShareCheck(c),
          revoked: Boolean(c.shareRevokedAt),
          shares: c.cardShares ?? 0,
          at: c.answeredAt ?? c.createdAt,
          ...facts,
        };
      })
    );
    const ratings = rows.map((r) => r.rating).filter((n): n is number => typeof n === "number");
    return {
      rows,
      ratingAverage: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
      shareable: rows.filter((r) => r.canShare).length,
    };
  },
});

/** What a feedback card shows. Only for words the patient agreed to share. */
export const getFeedbackCard = query({
  args: { checkId: v.id("outcomeChecks") },
  handler: async (ctx, args) => {
    const physio = await physioOrNull(ctx);
    const check = await ctx.db.get(args.checkId);
    if (!physio || !check || check.physiotherapistId !== physio._id || !canShareCheck(check)) return null;
    const patient = await ctx.db.get(check.patientId);
    const card = await physioCardName(ctx, physio._id);
    return {
      checkId: check._id,
      firstName: patient?.firstName ?? "A patient",
      area: await patientArea(ctx, check.patientId),
      quotes: quoteOptions(check.feedback!),
      rating: check.rating ?? null,
      consentAt: check.shareConsentAt!,
      ...(await courseFacts(ctx, check)),
      physioName: card.name,
      physioTitle: card.title,
      link: `${publicAppUrl()}${card.path}`,
    };
  },
});

/** Counts a shared card; the first card a physio ever shares earns points. */
export const markCardShared = mutation({
  args: { checkId: v.id("outcomeChecks") },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const check = await ctx.db.get(args.checkId);
    if (!check || check.physiotherapistId !== physio._id || !canShareCheck(check)) throw new ConvexError("This feedback can’t be shared.");
    await ctx.db.patch(check._id, { cardShares: (check.cardShares ?? 0) + 1 });
    const points = await awardPoints(ctx, {
      userId: physio._id,
      reason: "card_shared",
      dedupeKey: `card_shared:${physio._id}`,
      refType: "outcomeChecks",
      refId: check._id,
    });
    return { points };
  },
});

/** A physio's public proof: their outcome figures (if they opted in) and patients' shared words. */
export const getPublicProof = query({
  args: { physiotherapistId: v.id("users") },
  handler: async (ctx, args) => {
    const checks = (
      await ctx.db
        .query("outcomeChecks")
        .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", args.physiotherapistId))
        .order("desc")
        .take(600)
    ).filter((c) => c.moment === "discharge" && c.status === "answered");
    const shared = checks.filter(canShareCheck).slice(0, 6);
    const quotes = await Promise.all(
      shared.map(async (c) => {
        const patient = await ctx.db.get(c.patientId);
        const facts = await courseFacts(ctx, c);
        return {
          id: c._id,
          quote: c.feedback!,
          firstName: patient?.firstName ?? "A patient",
          area: await patientArea(ctx, c.patientId),
          rating: c.rating ?? null,
          painFrom: facts.painFrom,
          painTo: facts.painTo,
          at: c.answeredAt ?? c.createdAt,
        };
      })
    );
    const row = await ctx.db
      .query("outcomeSummaries")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", args.physiotherapistId))
      .unique();
    const s = row?.summary as ReturnType<typeof summarise> | null | undefined;
    const outcomes =
      row?.showOnProfile && s && s.scored >= PUBLIC_MIN_COURSES
        ? {
            scored: s.scored,
            baselineMedian: s.baselineMedian,
            latestMedian: s.latestMedian,
            meaningfulPct: s.meaningfulPct,
            sessionsMedian: s.sessionsMedian,
            ratingAverage: s.ratingAverage,
            ratingCount: s.ratingCount,
          }
        : null;
    if (!outcomes && quotes.length === 0) return null;
    return { outcomes, quotes };
  },
});

/** Admin: patients' words that can be shared, to feature on the Rehabify website. */
export const adminShareableFeedback = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = (await ctx.db.query("outcomeChecks").order("desc").take(3000)).filter(
      (c) => c.moment === "discharge" && canShareCheck(c)
    );
    return await Promise.all(
      rows.slice(0, 100).map(async (c) => {
        const [patient, physio] = await Promise.all([ctx.db.get(c.patientId), ctx.db.get(c.physiotherapistId)]);
        return {
          checkId: c._id,
          quote: c.feedback!,
          firstName: patient?.firstName ?? "A patient",
          area: await patientArea(ctx, c.patientId),
          physioName: nameOf(physio, "Physiotherapist"),
          rating: c.rating ?? null,
          featured: Boolean(c.featuredOnSite),
          at: c.answeredAt ?? c.createdAt,
        };
      })
    );
  },
});

export const adminSetFeatured = mutation({
  args: { checkId: v.id("outcomeChecks"), featured: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const check = await ctx.db.get(args.checkId);
    if (!check || (args.featured && !canShareCheck(check))) throw new ConvexError("These words can’t be shared.");
    await ctx.db.patch(check._id, { featuredOnSite: args.featured || undefined });
    return { featured: args.featured };
  },
});

/** The landing page's testimonials: featured by Rehabify, still consented. */
export const getFeaturedTestimonials = query({
  args: {},
  handler: async (ctx) => {
    const rows = (
      await ctx.db
        .query("outcomeChecks")
        .withIndex("by_featured", (q) => q.eq("featuredOnSite", true))
        .take(20)
    ).filter(canShareCheck);
    return await Promise.all(
      rows.map(async (c) => {
        const patient = await ctx.db.get(c.patientId);
        const area = await patientArea(ctx, c.patientId);
        return {
          id: c._id,
          quote: c.feedback!,
          name: patient?.firstName ?? "A patient",
          detail: [area, "Rehabify patient"].filter(Boolean).join(" · "),
        };
      })
    );
  },
});
