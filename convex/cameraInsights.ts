/**
 * AI weekly summary of a programme's camera-coach sessions, for its care team.
 *
 * A drafter, never a decider: the model gets numbers only (lib/motion/aiSummary.ts summaryInput),
 * writes a short summary with the numbers behind every point and "Consider ..." options, and the
 * physio reads, edits and copies it into a note. Nothing changes the plan by itself.
 *
 * On and off with the Rehabify Scribe switch (admin platform controls / SCRIBE_ENABLED), since it
 * uses the same AI provider. Up to MAX_PER_DAY drafts per person in 24 hours.
 */
import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { careTeamOrNull, programmeInScope } from "./helpers/exerciseAccess";
import { callLlmJson } from "./helpers/llm";
import { scribeAllowedFor } from "./scribe";
import { pairPain } from "../lib/motion/insights";
import { parseSummary, summaryInput, SUMMARY_SYSTEM_PROMPT, type CameraSummary, type SummaryExercise } from "../lib/motion/aiSummary";

const DAY = 86_400_000;
const MAX_PER_DAY = 20;

const summaryValidator = v.object({
  headline: v.string(),
  points: v.array(
    v.object({ text: v.string(), basis: v.string(), tone: v.union(v.literal("good"), v.literal("watch"), v.literal("concern")) })
  ),
  suggestions: v.array(v.string()),
});

async function programAccess(ctx: QueryCtx, programId: Id<"exercisePrograms">) {
  const program = await ctx.db.get(programId);
  if (!program) return null;
  const team = await careTeamOrNull(ctx, program.patientId);
  if (!team || !programmeInScope(team, program)) return null;
  return { program, user: team.user };
}

async function itemName(ctx: QueryCtx, program: Doc<"exercisePrograms">, index: number) {
  const item = program.items[index];
  if (!item) return "A removed exercise";
  if (item.exerciseId) return (await ctx.db.get(item.exerciseId))?.name ?? item.name ?? "Exercise";
  return item.name ?? "Exercise";
}

/** The last summary of this programme, and whether this person may ask for a new one. */
export const latestSummary = query({
  args: { programId: v.id("exercisePrograms") },
  handler: async (ctx, args) => {
    const access = await programAccess(ctx, args.programId);
    if (!access) return null;
    const last = await ctx.db
      .query("cameraSummaries")
      .withIndex("by_program", (q) => q.eq("programId", args.programId))
      .order("desc")
      .first();
    return {
      enabled: await scribeAllowedFor(ctx, access.user),
      summary: last
        ? { createdAt: last.createdAt, weekSessions: last.weekSessions, totalSessions: last.totalSessions, ...last.summary }
        : null,
    };
  },
});

type SummaryJob = { input: string; patientId: Id<"users">; requestedBy: Id<"users">; weekSessions: number; totalSessions: number };

/** Checks access, the switch and the daily limit, then gathers the numbers (no names, no notes). */
export const summaryJob = internalQuery({
  args: { programId: v.id("exercisePrograms"), now: v.number() },
  handler: async (ctx, args): Promise<SummaryJob> => {
    const access = await programAccess(ctx, args.programId);
    if (!access) throw new ConvexError("You don't look after this patient's programme.");
    if (!(await scribeAllowedFor(ctx, access.user))) throw new ConvexError("AI summaries aren't switched on for your account yet.");
    const recent = await ctx.db
      .query("cameraSummaries")
      .withIndex("by_requester", (q) => q.eq("requestedBy", access.user._id).gt("createdAt", args.now - DAY))
      .take(MAX_PER_DAY);
    if (recent.length >= MAX_PER_DAY) throw new ConvexError(`You've asked for ${MAX_PER_DAY} summaries in the last 24 hours, the daily limit.`);

    const since = args.now - 60 * DAY;
    const sessions = await ctx.db
      .query("guidedSessions")
      .withIndex("by_program", (q) => q.eq("programId", args.programId).gt("createdAt", since))
      .take(300);
    const weekSessions = sessions.filter((s) => s.createdAt >= args.now - 7 * DAY).length;
    if (weekSessions === 0) throw new ConvexError("No camera sessions in the last 7 days to summarise.");
    const logs = await ctx.db
      .query("exerciseProgramLogs")
      .withIndex("by_patient", (q) => q.eq("patientId", access.program.patientId).gt("createdAt", since - DAY))
      .take(2000);
    const pains = pairPain(sessions, logs);

    const byItem = new Map<number, SummaryExercise>();
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      if (!byItem.has(s.itemIndex)) byItem.set(s.itemIndex, { name: await itemName(ctx, access.program, s.itemIndex), sessions: [] });
      byItem.get(s.itemIndex)!.sessions.push({ ...s, measure: s.measure ?? null, pain: pains[i] });
    }
    return {
      input: summaryInput([...byItem.values()], args.now),
      patientId: access.program.patientId,
      requestedBy: access.user._id,
      weekSessions,
      totalSessions: sessions.length,
    };
  },
});

export const saveSummary = internalMutation({
  args: {
    programId: v.id("exercisePrograms"),
    patientId: v.id("users"),
    requestedBy: v.id("users"),
    weekSessions: v.number(),
    totalSessions: v.number(),
    summary: summaryValidator,
    model: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("cameraSummaries", { ...args, createdAt: Date.now() });
  },
});

const summaryJobRef = makeFunctionReference<"query", { programId: Id<"exercisePrograms">; now: number }, SummaryJob>(
  "cameraInsights:summaryJob"
);
const saveSummaryRef = makeFunctionReference<
  "mutation",
  {
    programId: Id<"exercisePrograms">;
    patientId: Id<"users">;
    requestedBy: Id<"users">;
    weekSessions: number;
    totalSessions: number;
    summary: CameraSummary;
    model: string;
  },
  null
>("cameraInsights:saveSummary");

/** Drafts this week's summary for the physio to read and edit. */
export const draftSummary = action({
  args: { programId: v.id("exercisePrograms") },
  handler: async (ctx, args): Promise<CameraSummary> => {
    const job: SummaryJob = await ctx.runQuery(summaryJobRef, { programId: args.programId, now: Date.now() });
    const reply = await callLlmJson({ system: SUMMARY_SYSTEM_PROMPT, user: job.input, maxOutputTokens: 6_000 });
    const summary = parseSummary(reply.text);
    if (!summary) throw new ConvexError("The AI's summary couldn't be read. Try again.");
    await ctx.runMutation(saveSummaryRef, {
      programId: args.programId,
      patientId: job.patientId,
      requestedBy: job.requestedBy,
      weekSessions: job.weekSessions,
      totalSessions: job.totalSessions,
      summary,
      model: `${reply.provider}:${reply.model}`,
    });
    return summary;
  },
});
