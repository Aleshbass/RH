/**
 * Camera-coached exercise sessions ("Camera coach", components/guided-session). The patient's
 * phone tracks their movement with MediaPipe and judges each rep (lib/motion); only the results
 * come here: rep counts, form scores, the most common mistakes and stick-figure snapshots of the
 * worst reps. Never video. The care team sees them with the programme (ExerciseProgramsPanel).
 *
 * Pain is still reported through the normal exercise log (exercisePrograms.logExercise), which the
 * patient is asked for straight after a session, so high-pain alerts work as before.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { currentUser } from "./helpers/careAccess";
import { careTeamOrNull, itemClipId, programmeInScope, resolveShareSession } from "./helpers/exerciseAccess";
import { assertProgramUnlocked } from "./helpers/patientPlans";
import { CAMERA_COACH_CLIPS } from "./cameraCoachClips";

type Ctx = QueryCtx | MutationCtx;

const DAY = 86_400_000;
/** Exercises the camera coach follows, and their clips (shared with lib/motion/exercises.ts) */
const EXERCISE_CLIPS: Record<string, readonly string[]> = CAMERA_COACH_CLIPS;
const MAX_REPS = 300;
const MAX_SNAPSHOTS = 3;
const MAX_FRAMES = 16;
const MAX_FRAME_NUMBERS = 64;

const resultArgs = {
  itemIndex: v.number(),
  clipId: v.string(),
  exerciseKey: v.string(),
  side: v.union(v.literal("L"), v.literal("R")),
  startedAt: v.number(),
  durationSeconds: v.number(),
  setsPlanned: v.number(),
  setsDone: v.number(),
  repsTarget: v.number(),
  repsCounted: v.number(),
  partialReps: v.number(),
  averageScore: v.number(),
  rehabifyScore: v.number(),
  repScores: v.array(v.number()),
  mistakes: v.array(v.object({ code: v.string(), count: v.number() })),
  snapshots: v.array(
    v.object({ rep: v.number(), score: v.number(), mistakes: v.array(v.string()), frames: v.array(v.array(v.number())) })
  ),
  tracking: v.object({ model: v.string(), delegate: v.string(), fps: v.number() }),
};

type ResultArgs = {
  itemIndex: number;
  clipId: string;
  exerciseKey: string;
  side: "L" | "R";
  startedAt: number;
  durationSeconds: number;
  setsPlanned: number;
  setsDone: number;
  repsTarget: number;
  repsCounted: number;
  partialReps: number;
  averageScore: number;
  rehabifyScore: number;
  repScores: number[];
  mistakes: { code: string; count: number }[];
  snapshots: { rep: number; score: number; mistakes: string[]; frames: number[][] }[];
  tracking: { model: string; delegate: string; fps: number };
};

const whole = (n: number, max: number) => (Number.isFinite(n) ? Math.max(0, Math.min(max, Math.round(n))) : 0);
const code = (s: string) => s.replace(/[^a-z_]/g, "").slice(0, 40);
const decimals = (n: number) => (Number.isFinite(n) ? Math.round(n * 1000) / 1000 : -1);

async function insertSession(
  ctx: MutationCtx,
  program: Doc<"exercisePrograms">,
  args: ResultArgs,
  source: "app" | "link",
  linkId?: Id<"exerciseShareLinks">
) {
  const item = program.items[args.itemIndex];
  if (!Number.isInteger(args.itemIndex) || !item || item.kind === "education") {
    throw new ConvexError("That exercise isn't in this programme.");
  }
  const clips = EXERCISE_CLIPS[args.exerciseKey];
  const exercise = item.exerciseId ? await ctx.db.get(item.exerciseId) : null;
  const clipId = itemClipId(exercise, item.side);
  if (!clips || !clipId || clipId !== args.clipId || !clips.includes(clipId)) {
    throw new ConvexError("The camera coach doesn't follow this exercise yet.");
  }
  const now = Date.now();
  const recent = await ctx.db
    .query("guidedSessions")
    .withIndex("by_program", (q) => q.eq("programId", program._id).gt("createdAt", now - 20_000))
    .collect();
  if (recent.some((s) => s.itemIndex === args.itemIndex)) throw new ConvexError("This session is already saved.");

  const repScores = args.repScores.slice(0, MAX_REPS).map((s) => whole(s, 100));
  const counted = whole(args.repsCounted, MAX_REPS);
  if (counted === 0) throw new ConvexError("No reps were counted, so there's nothing to save.");
  return await ctx.db.insert("guidedSessions", {
    programId: program._id,
    patientId: program.patientId,
    itemIndex: args.itemIndex,
    clipId,
    exerciseKey: args.exerciseKey,
    side: args.side,
    startedAt: Math.min(now, Math.max(now - DAY, args.startedAt)),
    durationSeconds: whole(args.durationSeconds, 4 * 3600),
    setsPlanned: whole(args.setsPlanned, 20),
    setsDone: whole(args.setsDone, 20),
    repsTarget: whole(args.repsTarget, MAX_REPS),
    repsCounted: counted,
    partialReps: whole(args.partialReps, MAX_REPS),
    averageScore: whole(args.averageScore, 100),
    rehabifyScore: whole(args.rehabifyScore, 100),
    repScores,
    mistakes: args.mistakes
      .slice(0, 20)
      .map((m) => ({ code: code(m.code), count: whole(m.count, MAX_REPS) }))
      .filter((m) => m.code && m.count > 0),
    snapshots: args.snapshots.slice(0, MAX_SNAPSHOTS).map((s) => ({
      rep: whole(s.rep, MAX_REPS),
      score: whole(s.score, 100),
      mistakes: s.mistakes.slice(0, 6).map(code),
      frames: s.frames.slice(0, MAX_FRAMES).map((f) => f.slice(0, MAX_FRAME_NUMBERS).map(decimals)),
    })),
    tracking: {
      model: args.tracking.model === "full" ? "full" : "lite",
      delegate: args.tracking.delegate === "GPU" ? "GPU" : "CPU",
      fps: whole(args.tracking.fps, 120),
    },
    source,
    linkId,
    createdAt: now,
  });
}

/** Saves a session the signed-in patient just finished. */
export const saveMine = mutation({
  args: { programId: v.id("exercisePrograms"), ...resultArgs },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    const program = await ctx.db.get(args.programId);
    if (!user || !program || program.patientId !== user._id || program.status !== "active") {
      throw new ConvexError("This programme isn't available.");
    }
    await assertProgramUnlocked(ctx, program, "log");
    const { programId: _ignored, ...result } = args;
    return await insertSession(ctx, program, result, "app");
  },
});

/** Saving from a WhatsApp link (no account): the PIN session stands in for sign-in. */
export const saveFromLink = mutation({
  args: { code: v.string(), session: v.string(), ...resultArgs },
  handler: async (ctx, args) => {
    const res = await resolveShareSession(ctx, args.code, args.session);
    if (!res.ok) throw new ConvexError("Enter your PIN again to continue.");
    await assertProgramUnlocked(ctx, res.program, "log");
    const { code: _c, session: _s, ...result } = args;
    return await insertSession(ctx, res.program, result, "link", res.link._id);
  },
});

/** The patient's last sessions of one exercise, for "last time" on the summary. */
export const myHistory = query({
  args: { programId: v.id("exercisePrograms"), itemIndex: v.number() },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    const program = await ctx.db.get(args.programId);
    if (!user || !program || program.patientId !== user._id) return null;
    const rows = await ctx.db
      .query("guidedSessions")
      .withIndex("by_program", (q) => q.eq("programId", args.programId))
      .order("desc")
      .take(50);
    return rows
      .filter((r) => r.itemIndex === args.itemIndex)
      .slice(0, 10)
      .map((r) => ({ createdAt: r.createdAt, rehabifyScore: r.rehabifyScore, averageScore: r.averageScore, repsCounted: r.repsCounted }));
  },
});

function topMistake(mistakes: { code: string; count: number }[]) {
  return [...mistakes].sort((a, b) => b.count - a.count)[0]?.code ?? null;
}

async function scopedPrograms(ctx: Ctx, patientId: Id<"users">) {
  const team = await careTeamOrNull(ctx, patientId);
  if (!team) return null;
  const programs = await ctx.db
    .query("exercisePrograms")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .collect();
  return new Set(programs.filter((p) => programmeInScope(team, p)).map((p) => p._id));
}

/**
 * Camera sessions of the last 60 days for the patient's care team, newest first, without the
 * snapshots (sessionDetail has those).
 */
export const forPatient = query({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    const programs = await scopedPrograms(ctx, args.patientId);
    if (!programs) return null;
    const rows = await ctx.db
      .query("guidedSessions")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId).gt("createdAt", Date.now() - 60 * DAY))
      .order("desc")
      .take(200);
    return rows
      .filter((r) => programs.has(r.programId))
      .map((r) => ({
        _id: r._id,
        programId: r.programId,
        itemIndex: r.itemIndex,
        clipId: r.clipId,
        exerciseKey: r.exerciseKey,
        side: r.side,
        createdAt: r.createdAt,
        durationSeconds: r.durationSeconds,
        setsDone: r.setsDone,
        setsPlanned: r.setsPlanned,
        repsCounted: r.repsCounted,
        repsTarget: r.repsTarget,
        partialReps: r.partialReps,
        averageScore: r.averageScore,
        rehabifyScore: r.rehabifyScore,
        mistakes: r.mistakes,
        topMistake: topMistake(r.mistakes),
        snapshotCount: r.snapshots.length,
        source: r.source,
      }));
  },
});

/** One session with its worst-rep snapshots, for the care team. */
export const sessionDetail = query({
  args: { sessionId: v.id("guidedSessions") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.sessionId);
    if (!row) return null;
    const programs = await scopedPrograms(ctx, row.patientId);
    if (!programs?.has(row.programId)) return null;
    return {
      _id: row._id,
      exerciseKey: row.exerciseKey,
      side: row.side,
      createdAt: row.createdAt,
      repScores: row.repScores,
      snapshots: row.snapshots,
      tracking: row.tracking,
    };
  },
});
