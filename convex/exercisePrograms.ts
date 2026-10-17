/**
 * Home exercise programmes: a physio or clinic picks exercises from the library, sets the dose,
 * adds a note and a voice note, and sends it. The patient sees it in their dashboard (and can
 * open it from a PIN-protected WhatsApp link, see exerciseShareLinks.ts), follows the 3D
 * demonstrations and logs each exercise with a pain score. The care team sees adherence.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { libraryItem } from "./exerciseLibrary";
import { EXERCISE_CATALOG } from "./exerciseLibraryCatalog";
import { publicAppUrl } from "./helpers/appUrl";
import { currentUser } from "./helpers/careAccess";
import { careTeamOrNull, displayName, itemClipId, requireCareTeam, resolveShareSession } from "./helpers/exerciseAccess";

type Ctx = QueryCtx | MutationCtx;

const DAY = 86_400_000;
const LAGOS_OFFSET = 3_600_000; // West Africa Time, UTC+1, no daylight saving
const MAX_ITEMS = 20;

/** Midnight today in Lagos, so "done today" resets at local midnight (Convex runs in UTC). */
export function startOfLagosDay(now = Date.now()) {
  return now - ((now + LAGOS_OFFSET) % DAY);
}
const MAX_NOTE = 2000;

const itemValidator = v.object({
  exerciseId: v.id("exercises"),
  side: v.optional(v.union(v.literal("L"), v.literal("R"))),
  sets: v.number(),
  reps: v.number(),
  holdSeconds: v.optional(v.number()),
  frequency: v.string(),
  note: v.optional(v.string()),
});

const clean = (s?: string, max = MAX_NOTE) => {
  const t = s?.trim();
  return t ? t.slice(0, max) : undefined;
};

const intIn = (n: number, lo: number, hi: number, label: string) => {
  if (!Number.isFinite(n) || Math.round(n) !== n || n < lo || n > hi) {
    throw new ConvexError(`${label} must be a whole number from ${lo} to ${hi}.`);
  }
  return n;
};

async function activePlanAndEpisode(ctx: Ctx, patientId: Id<"users">, physioId?: Id<"users">) {
  const plan = (
    await ctx.db
      .query("treatmentPlans")
      .withIndex("by_patient_and_status", (q) => q.eq("patientId", patientId).eq("status", "active"))
      .collect()
  )
    .filter((p) => !physioId || p.physiotherapistId === physioId)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const episode = physioId
    ? (
        await ctx.db
          .query("careEpisodes")
          .withIndex("by_patient_and_physiotherapist", (q) => q.eq("patientId", patientId).eq("physiotherapistId", physioId))
          .collect()
      ).find((e) => e.status === "active")
    : undefined;
  return { plan, episode };
}

/** A programme with its exercises, ready to show (used by the care team, the patient and links). */
export async function programView(ctx: Ctx, program: Doc<"exercisePrograms">) {
  const exercises = await Promise.all(program.items.map((item) => ctx.db.get(item.exerciseId)));
  const sender = await ctx.db.get(program.createdBy);
  const clinic = program.clinicId ? await ctx.db.get(program.clinicId) : null;
  return {
    _id: program._id,
    patientId: program.patientId,
    title: program.title,
    note: program.note ?? null,
    voiceNoteUrl: program.voiceNoteStorageId ? await ctx.storage.getUrl(program.voiceNoteStorageId) : null,
    voiceNoteSeconds: program.voiceNoteSeconds ?? null,
    status: program.status,
    createdAt: program.createdAt,
    updatedAt: program.updatedAt,
    senderName: displayName(sender),
    clinicName: clinic?.name ?? null,
    libraryVersion: EXERCISE_CATALOG.version,
    items: program.items.map((item, index) => {
      const exercise = exercises[index];
      const clipId = itemClipId(exercise, item.side);
      return {
        index,
        sets: item.sets,
        reps: item.reps,
        holdSeconds: item.holdSeconds ?? null,
        frequency: item.frequency,
        note: item.note ?? null,
        side: item.side ?? null,
        clipId,
        // Patients only see approved animations; others see the poster and steps.
        animated: Boolean(clipId && exercise?.animationStatus === "approved"),
        exercise: exercise ? libraryItem(exercise) : null,
      };
    }),
  };
}

async function logsSummary(ctx: Ctx, programId: Id<"exercisePrograms">) {
  const since = Date.now() - 14 * DAY;
  const logs = await ctx.db
    .query("exerciseProgramLogs")
    .withIndex("by_program", (q) => q.eq("programId", programId).gt("createdAt", since))
    .collect();
  const days = new Set(logs.map((l) => new Date(l.createdAt).toISOString().slice(0, 10)));
  const pains = logs.filter((l) => typeof l.painScore === "number").map((l) => l.painScore!);
  return {
    logsLast14Days: logs.length,
    activeDaysLast14: days.size,
    lastLoggedAt: logs.length ? Math.max(...logs.map((l) => l.createdAt)) : null,
    averagePain: pains.length ? Math.round((pains.reduce((a, b) => a + b, 0) / pains.length) * 10) / 10 : null,
    highPain: pains.some((p) => p >= 7),
    recent: logs
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map((l) => ({ itemIndex: l.itemIndex, painScore: l.painScore ?? null, difficulty: l.difficulty ?? null, note: l.note ?? null, source: l.source, createdAt: l.createdAt })),
  };
}

async function notifyPatient(ctx: MutationCtx, patient: Doc<"users">, senderName: string, title: string) {
  await ctx.db.insert("notifications", {
    userId: patient._id,
    type: "exercise_program",
    priority: "medium",
    status: "pending",
    payload: {
      title: "New exercises from your physio",
      body: `${senderName} sent you "${title}". Open it to see how to do each exercise.`,
      data: { actionUrl: "/dashboard/patient/exercises" },
    },
    createdAt: Date.now(),
  });
  if (patient.email) {
    await ctx.scheduler.runAfter(0, internal.actions.emails.sendPatientCareEmail.sendPatientCareEmail, {
      to: patient.email,
      subject: "Your home exercises are ready",
      greetingName: patient.firstName,
      heading: "Your home exercises are ready",
      paragraphs: [
        `${senderName} has sent you a home exercise programme: ${title}.`,
        "Each exercise has a 3D demonstration you can watch from any angle and in slow motion, with your physio's notes.",
      ],
      buttonLabel: "Open my exercises",
      buttonUrl: `${publicAppUrl()}/dashboard/patient/exercises`,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Care team
// ─────────────────────────────────────────────────────────────────────────────

export const createProgram = mutation({
  args: {
    patientId: v.id("users"),
    title: v.string(),
    note: v.optional(v.string()),
    voiceNoteStorageId: v.optional(v.id("_storage")),
    voiceNoteSeconds: v.optional(v.number()),
    items: v.array(itemValidator),
  },
  handler: async (ctx, args) => {
    const team = await requireCareTeam(ctx, args.patientId, { write: true });
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.role !== "patient") throw new ConvexError("Patient not found.");
    const title = clean(args.title, 120);
    if (!title) throw new ConvexError("Give the programme a title.");
    if (args.items.length === 0) throw new ConvexError("Add at least one exercise.");
    if (args.items.length > MAX_ITEMS) throw new ConvexError(`A programme can have up to ${MAX_ITEMS} exercises.`);

    const items = [];
    for (const item of args.items) {
      const exercise = await ctx.db.get(item.exerciseId);
      if (!exercise) throw new ConvexError("One of the exercises no longer exists.");
      if (!exercise.isPublic && exercise.clinicId !== team.clinicId) throw new ConvexError("One of the exercises isn't available to you.");
      if (exercise.sided && !item.side) throw new ConvexError(`Choose a side for ${exercise.name}.`);
      items.push({
        exerciseId: item.exerciseId,
        side: exercise.sided ? item.side : undefined,
        sets: intIn(item.sets, 1, 10, "Sets"),
        reps: intIn(item.reps, 1, 50, "Reps"),
        holdSeconds: item.holdSeconds === undefined ? undefined : intIn(item.holdSeconds, 1, 120, "Hold"),
        frequency: clean(item.frequency, 60) ?? "Once a day",
        note: clean(item.note, 500),
      });
    }

    const { plan, episode } = await activePlanAndEpisode(ctx, args.patientId, team.kind === "physio" ? team.user._id : undefined);
    const now = Date.now();
    const programId = await ctx.db.insert("exercisePrograms", {
      patientId: args.patientId,
      createdBy: team.user._id,
      clinicId: team.clinicId,
      treatmentPlanId: plan?._id,
      episodeId: episode?._id,
      title,
      note: clean(args.note),
      voiceNoteStorageId: args.voiceNoteStorageId,
      voiceNoteSeconds: args.voiceNoteSeconds === undefined ? undefined : Math.max(0, Math.round(args.voiceNoteSeconds)),
      items,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await notifyPatient(ctx, patient, team.senderName, title);
    return programId;
  },
});

export const archiveProgram = mutation({
  args: { programId: v.id("exercisePrograms"), archived: v.boolean() },
  handler: async (ctx, args) => {
    const program = await ctx.db.get(args.programId);
    if (!program) throw new ConvexError("Programme not found.");
    await requireCareTeam(ctx, program.patientId, { write: true });
    const now = Date.now();
    await ctx.db.patch(args.programId, args.archived
      ? { status: "archived", archivedAt: now, updatedAt: now }
      : { status: "active", archivedAt: undefined, updatedAt: now });
  },
});

/** A patient's programmes for their care team, with adherence and share links. */
export const listForPatient = query({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    const team = await careTeamOrNull(ctx, args.patientId);
    if (!team) return null;
    const programs = await ctx.db
      .query("exercisePrograms")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .collect();
    const now = Date.now();
    return await Promise.all(programs.map((program) => careTeamProgramView(ctx, program, now)));
  },
});

/** A programme as its care team sees it: the patient view plus adherence and share links. */
export async function careTeamProgramView(ctx: Ctx, program: Doc<"exercisePrograms">, now = Date.now()) {
  const links = await ctx.db
    .query("exerciseShareLinks")
    .withIndex("by_program", (q) => q.eq("programId", program._id))
    .collect();
  return {
    ...(await programView(ctx, program)),
    adherence: await logsSummary(ctx, program._id),
    links: links
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((l) => ({
        _id: l._id,
        createdAt: l.createdAt,
        expiresAt: l.expiresAt,
        pinSource: l.pinSource,
        openCount: l.openCount,
        lastOpenedAt: l.lastOpenedAt ?? null,
        state: (l.revokedAt ? "revoked" : l.lockedOut ? "locked" : l.expiresAt <= now ? "expired" : "active") as
          | "revoked"
          | "locked"
          | "expired"
          | "active",
      })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Patient
// ─────────────────────────────────────────────────────────────────────────────

/** The signed-in patient's programmes, newest first, with today's completions. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user || user.role !== "patient") return null;
    const programs = await ctx.db
      .query("exercisePrograms")
      .withIndex("by_patient", (q) => q.eq("patientId", user._id))
      .order("desc")
      .collect();
    return await Promise.all(programs.filter((p) => p.status === "active").map((program) => patientProgramView(ctx, program)));
  },
});

/** A programme as the patient sees it, with which exercises they've already done today. */
export async function patientProgramView(ctx: Ctx, program: Doc<"exercisePrograms">) {
  const today = await ctx.db
    .query("exerciseProgramLogs")
    .withIndex("by_program", (q) => q.eq("programId", program._id).gt("createdAt", startOfLagosDay()))
    .collect();
  const summary = await logsSummary(ctx, program._id);
  return {
    ...(await programView(ctx, program)),
    doneToday: [...new Set(today.map((l) => l.itemIndex))],
    activeDaysLast14: summary.activeDaysLast14,
  };
}

async function insertLog(
  ctx: MutationCtx,
  program: Doc<"exercisePrograms">,
  args: { itemIndex: number; setsDone?: number; painScore?: number; difficulty?: "easy" | "ok" | "hard"; note?: string },
  source: "app" | "link",
  linkId?: Id<"exerciseShareLinks">
) {
  if (!Number.isInteger(args.itemIndex) || args.itemIndex < 0 || args.itemIndex >= program.items.length) {
    throw new ConvexError("That exercise isn't in this programme.");
  }
  const recent = await ctx.db
    .query("exerciseProgramLogs")
    .withIndex("by_program", (q) => q.eq("programId", program._id).gt("createdAt", Date.now() - 2 * 60_000))
    .collect();
  if (recent.some((l) => l.itemIndex === args.itemIndex)) {
    throw new ConvexError("You just logged this exercise. Well done!");
  }
  const pain = args.painScore === undefined ? undefined : Math.max(0, Math.min(10, Math.round(args.painScore)));
  await ctx.db.insert("exerciseProgramLogs", {
    programId: program._id,
    patientId: program.patientId,
    itemIndex: args.itemIndex,
    setsDone: args.setsDone === undefined ? undefined : Math.max(0, Math.min(20, Math.round(args.setsDone))),
    painScore: pain,
    difficulty: args.difficulty,
    note: clean(args.note, 500),
    source,
    linkId,
    createdAt: Date.now(),
  });
  if (pain !== undefined && pain >= 7) {
    await ctx.db.insert("notifications", {
      userId: program.createdBy,
      type: "exercise_pain_flag",
      priority: "high",
      status: "pending",
      payload: {
        title: "High pain reported during exercises",
        body: `A patient reported pain of ${pain}/10 during "${program.title}".`,
        data: { actionUrl: `/dashboard/physiotherapist/patients/${program.patientId}` },
      },
      createdAt: Date.now(),
    });
  }
}

const logArgs = {
  itemIndex: v.number(),
  setsDone: v.optional(v.number()),
  painScore: v.optional(v.number()),
  difficulty: v.optional(v.union(v.literal("easy"), v.literal("ok"), v.literal("hard"))),
  note: v.optional(v.string()),
};

export const logExercise = mutation({
  args: { programId: v.id("exercisePrograms"), ...logArgs },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    const program = await ctx.db.get(args.programId);
    if (!user || !program || program.patientId !== user._id || program.status !== "active") {
      throw new ConvexError("This programme isn't available.");
    }
    const { programId: _ignored, ...log } = args;
    await insertLog(ctx, program, log, "app");
  },
});

/** Logging from a WhatsApp link (no account): the PIN session stands in for sign-in. */
export const logExerciseFromLink = mutation({
  args: { code: v.string(), session: v.string(), ...logArgs },
  handler: async (ctx, args) => {
    const res = await resolveShareSession(ctx, args.code, args.session);
    if (!res.ok) throw new ConvexError("Enter your PIN again to continue.");
    const { code: _c, session: _s, ...log } = args;
    await insertLog(ctx, res.program, log, "link", res.link._id);
  },
});
