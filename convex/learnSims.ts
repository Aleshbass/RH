/**
 * Rehabify Learn clinical simulations (owner 2026-11-13, Stage 1). The server is the referee:
 * every choice goes through applyChoice here, with the server's clock, and the browser only ever
 * sees the current situation, the options on offer and what has been found. Points, tags and
 * feedback stay on the server until the case is over (the getMyAssessment/submitAssessment idea).
 *
 * Cases come from git (content/sim-cases) as drafts. A physio signs off a version (admin or
 * learn_instructor), an admin publishes it, and learners play that immutable snapshot.
 */
import { awardLearnPoints } from "./helpers/learnPoints";
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getViewer } from "./helpers/partnerAccess";
import { learnMemberInfo, type LearnMemberInfo } from "./learn";
import { SIM_CASES } from "../content/sim-cases";
import {
  applyChoice,
  attachesMonitor,
  availableChoices,
  buildConsultDebrief,
  choiceCategory,
  buildDebrief,
  choiceIndex,
  consultEnding,
  consultScores,
  consultStart,
  endingOf,
  expire,
  MONITOR_FLAG,
  moodOf,
  scoreState,
  SimError,
  startState,
  timeLimit,
  validateCase,
  vitalsTimeline,
  type ConsultState,
  type SimCase,
  type SimLine,
  type SimState,
} from "../lib/learn/simulation/engine";
import { llmKeyPresent, simLlmConfig } from "./helpers/llm";

type Ctx = QueryCtx | MutationCtx;

const START_LIMIT = { limit: 40, windowMs: 60 * 60 * 1000 };

const clean = (value: string | undefined | null, max: number) => (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

async function memberOrNull(ctx: Ctx) {
  const viewer = await getViewer(ctx);
  return viewer?.user ? await learnMemberInfo(ctx, viewer.user) : null;
}

async function requireMember(ctx: Ctx) {
  const member = await memberOrNull(ctx);
  if (!member) throw new ConvexError("Join Rehabify Learn to play the simulations.");
  return member;
}

/** Admins and Learn instructors can play drafts and sign cases off; only admins publish. */
export const isReviewer = (m: LearnMemberInfo | null) => Boolean(m && (m.isAdmin || m.user.role === "learn_instructor"));

/** "Talk to the patient" needs the case's consult block and an AI key on this deployment. */
export function consultAvailable(def: SimCase) {
  if (!def.consult || def.mode !== "full") return false;
  try {
    return llmKeyPresent(simLlmConfig().provider);
  } catch {
    return false;
  }
}

async function requireReviewer(ctx: Ctx) {
  const member = await requireMember(ctx);
  if (!isReviewer(member)) throw new ConvexError("Only the Rehabify Learn team can do this.");
  return member;
}

async function caseBySlug(ctx: Ctx, slug: string) {
  return await ctx.db
    .query("learnSimCases")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .first();
}

async function versionRow(ctx: Ctx, slug: string, version: number) {
  return await ctx.db
    .query("learnSimVersions")
    .withIndex("by_slug_version", (q) => q.eq("slug", slug).eq("version", version))
    .first();
}

export async function versionDef(ctx: Ctx, slug: string, version: number): Promise<SimCase | null> {
  const row = await versionRow(ctx, slug, version);
  return row ? (row.definition as SimCase) : null;
}

function caseMeta(def: SimCase) {
  return {
    slug: def.slug,
    title: def.title,
    version: def.version,
    summary: def.summary,
    specialty: def.specialty,
    difficulty: def.difficulty,
    mode: def.mode,
    timeLimitSec: timeLimit(def),
    estimatedMinutes: def.estimatedMinutes,
    setting: def.setting,
    patient: def.patient,
    monitor: def.monitor,
    audio: Boolean(def.audio),
    cover: def.scenes ? (Object.values(def.scenes)[0] ?? null) : null,
    consult: consultAvailable(def),
  };
}

function lineView(def: SimCase, line: SimLine, audioId: string) {
  const speaker = def.speakers[line.speaker];
  return { speaker: line.speaker, name: speaker?.name ?? line.speaker, role: speaker?.role ?? "", text: line.text, audioId };
}

/** What the learner sees right now. Never includes points, tags or feedback. */
function attemptView(def: SimCase, attempt: Doc<"learnSimAttempts">) {
  const state = attempt.state as SimState;
  // A consult stays open after the case's last choice (the explanation and the note come next)
  const consult = attempt.mode === "consult" ? (attempt.consult as ConsultState) : null;
  const status =
    attempt.status === "abandoned"
      ? ("abandoned" as const)
      : consult
        ? consult.stage === "done"
          ? ("finished" as const)
          : ("active" as const)
        : state.status;
  const active = status === "active";
  // In a consult the history is a conversation (no buttons) and nothing is tapped after the case
  const tapping = active && (!consult || consult.stage === "case");
  const node = def.nodes[state.nodeId];
  const last = state.lastChoiceId ? choiceIndex(def).get(state.lastChoiceId)?.choice : undefined;
  const monitorOn = def.monitor && state.flags.includes(MONITOR_FLAG);
  return {
    attemptId: attempt._id,
    status,
    preview: attempt.preview,
    case: caseMeta(def),
    node:
      tapping && node
        ? { id: node.id, phase: node.phase, prompt: node.prompt, lines: (node.lines ?? []).map((l, i) => lineView(def, l, `${node.id}-${i}`)) }
        : null,
    choices: tapping
      ? availableChoices(def, state).map((c) => ({
          id: c.id,
          label: c.label,
          costSec: c.costSec,
          category: choiceCategory(c),
          attachesMonitor: def.monitor && attachesMonitor(c),
        }))
      : [],
    escalated: state.flags.includes("escalated"),
    lastChoice: last ? { id: last.id, label: last.label, reply: last.reply ? lineView(def, last.reply, last.id) : null } : null,
    findings: state.findings
      .map((id) => def.findings[id])
      .filter(Boolean)
      .map((f) => ({ id: f.id, label: f.label, detail: f.detail, abnormal: Boolean(f.abnormal) })),
    monitorOn,
    vitals: monitorOn ? vitalsTimeline(def, state) : null,
    pain: state.pain,
    // The browser runs the clock from these (a cached query can't be trusted to hold "now")
    startedAt: state.startedAt,
    virtualSec: state.virtualSec,
    finishedClockSec: state.finish?.clockSec ?? null,
    phases: def.phases.map((p) => ({ id: p.id, label: p.label, budgetSec: p.budgetSec, usedSec: state.phaseSec[p.id] ?? 0 })),
    scene: state.scene && def.scenes?.[state.scene] ? def.scenes[state.scene] : null,
    stepCount: state.steps.length,
    ending: status === "finished" ? (consult ? consultEnding(def, state, consult) : endingOf(def, state)) : null,
    mode: consult ? ("consult" as const) : ("classic" as const),
    // Never the trust number or the facts: the mood the patient shows, and what's left
    consult:
      consult && def.consult
        ? {
            stage: consult.stage,
            mood: moodOf(consult.rapport),
            turnsLeft: Math.max(0, def.consult.maxTurns - consult.turns),
            explainTurnsLeft: Math.max(0, def.consult.explainTurns - consult.explainTurns),
            pendingAt: attempt.pendingAt ?? null,
            walkedOut: consult.walkedOut,
            patientFirstName: def.speakers.patient?.name ?? def.patient.name.split(" ")[0],
            // The opening line was recorded with the case's voices (history node, line 0)
            openingAudio: def.audio ? `${def.consult.node}-0` : null,
            // A home programme comes after explaining the plan
            programme: Boolean(def.consult.programme),
            programmeMax: def.consult.programme?.maxItems ?? null,
            // The patient's replies can be spoken live (ElevenLabs, in the case's own voice)
            voice: Boolean(def.speakers.patient?.voice && process.env.ELEVENLABS_API_KEY?.trim()),
          }
        : null,
  };
}

export type SimAttemptView = ReturnType<typeof attemptView>;

export async function ownAttempt(ctx: Ctx, attemptId: string) {
  const member = await memberOrNull(ctx);
  const id = ctx.db.normalizeId("learnSimAttempts", attemptId);
  const attempt = id ? await ctx.db.get(id) : null;
  if (!member || !attempt || attempt.userId !== member.user._id) return null;
  const def = await versionDef(ctx, attempt.caseSlug, attempt.version);
  return def ? { member, attempt, def } : null;
}

async function rateLimit(ctx: MutationCtx, userId: Id<"users">) {
  const key = `sim-start:${userId}`;
  const now = Date.now();
  const row = await ctx.db
    .query("learnVideoRateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  if (!row || row.windowStart + START_LIMIT.windowMs <= now) {
    if (row) await ctx.db.patch(row._id, { windowStart: now, count: 1 });
    else await ctx.db.insert("learnVideoRateLimits", { key, windowStart: now, count: 1 });
    return;
  }
  if (row.count >= START_LIMIT.limit) throw new ConvexError("That's a lot of cases for one hour. Take a break and come back soon.");
  await ctx.db.patch(row._id, { count: row.count + 1 });
}

/** Learn points and the case's running totals for a finished, scored run (not for previews). */
async function recordFinish(ctx: MutationCtx, attempt: Doc<"learnSimAttempts">, def: SimCase, pct: number, passed: boolean) {
  if (attempt.preview) return;
  // Learn points: once per case for finishing, once per case for passing
  await awardLearnPoints(ctx, { userId: attempt.userId, reason: "sim_finish", key: `simfinish:${attempt.userId}:${attempt.caseSlug}`, label: `Finished: ${def.title}` });
  if (passed) {
    await awardLearnPoints(ctx, { userId: attempt.userId, reason: "sim_pass", key: `simpass:${attempt.userId}:${attempt.caseSlug}`, label: `Passed: ${def.title}` });
  }
  const doc = await caseBySlug(ctx, attempt.caseSlug);
  if (doc) {
    await ctx.db.patch(doc._id, {
      completions: doc.completions + 1,
      passes: doc.passes + (passed ? 1 : 0),
      scoreSum: doc.scoreSum + pct,
    });
  }
}

/** Saves a new state; on finishing, records the score and the case's running totals. */
async function saveState(ctx: MutationCtx, attempt: Doc<"learnSimAttempts">, def: SimCase, state: SimState, now: number) {
  if (attempt.mode === "consult") {
    // The case is over but the visit isn't: the learner explains the plan, then writes the note
    const consult = attempt.consult as ConsultState;
    if (state.status === "finished" && consult.stage === "case") {
      await ctx.db.patch(attempt._id, { state, consult: { ...consult, stage: "explain" } });
      await enterExplain(ctx, attempt._id, def);
    } else await ctx.db.patch(attempt._id, { state });
    return;
  }
  if (state.status !== "finished") {
    await ctx.db.patch(attempt._id, { state });
    return;
  }
  const score = scoreState(def, state);
  await ctx.db.patch(attempt._id, {
    state,
    status: "finished",
    scorePct: score.pct,
    passed: score.passed,
    outcome: score.outcome,
    finishedAt: now,
  });
  await recordFinish(ctx, attempt, def, score.pct, score.passed);
}

// ── Consult helpers (convex/learnSimConsult.ts runs the conversation) ────────

/** Adds a message to a consult's conversation; returns its position. */
export async function addTurn(
  ctx: MutationCtx,
  attemptId: Id<"learnSimAttempts">,
  row: Omit<Doc<"learnSimTurns">, "_id" | "_creationTime" | "attemptId" | "index" | "at">
): Promise<number> {
  const last = await ctx.db
    .query("learnSimTurns")
    .withIndex("by_attempt", (q) => q.eq("attemptId", attemptId))
    .order("desc")
    .first();
  const index = (last?.index ?? -1) + 1;
  await ctx.db.insert("learnSimTurns", { attemptId, index, at: Date.now(), ...row });
  return index;
}

const pronoun = (def: SimCase) => (def.patient.sex === "F" ? "her" : "him");

/** The plan is made: the patient asks their first question. */
async function enterExplain(ctx: MutationCtx, attemptId: Id<"learnSimAttempts">, def: SimCase) {
  const first = def.speakers.patient?.name ?? def.patient.name.split(" ")[0];
  await addTurn(ctx, attemptId, {
    stage: "explain",
    role: "system",
    text: `You’ve examined ${first} and made your plan. Now explain it to ${pronoun(def)} and answer ${pronoun(def) === "her" ? "her" : "his"} questions.`,
  });
  const question = def.consult?.explain.questions[0];
  if (question) await addTurn(ctx, attemptId, { stage: "explain", role: "patient", text: question, emotion: "worried" });
}

/** Closes a consult: the combined score, the attempt finished, points and totals. */
export async function finalizeConsult(ctx: MutationCtx, attempt: Doc<"learnSimAttempts">, def: SimCase, state: SimState, consult: ConsultState) {
  const done: ConsultState = { ...consult, stage: "done" };
  const scores = consultScores(def, state, done);
  const ending = consultEnding(def, state, done);
  await ctx.db.patch(attempt._id, {
    state,
    consult: done,
    status: "finished",
    scorePct: scores.overall,
    passed: scores.passed,
    outcome: ending.outcome,
    finishedAt: Date.now(),
    pendingAt: undefined,
  });
  await recordFinish(ctx, attempt, def, scores.overall, scores.passed);
}

// ── Learners ──────────────────────────────────────────────────────────────────

/** Learn › Simulations: published cases (drafts too for reviewers), with my best score. */
export const listCases = query({
  args: {},
  handler: async (ctx) => {
    const member = await memberOrNull(ctx);
    const reviewer = isReviewer(member);
    const docs = await ctx.db.query("learnSimCases").withIndex("by_order").take(100);
    const cases = [];
    for (const doc of docs) {
      const live = Boolean(doc.published);
      if (!live && !reviewer) continue;
      const def = await versionDef(ctx, doc.slug, live ? doc.published!.version : doc.version);
      if (!def) continue;
      let mine: { best: number | null; passed: boolean; tries: number; activeAttemptId: Id<"learnSimAttempts"> | null } | null = null;
      if (member) {
        const attempts = await ctx.db
          .query("learnSimAttempts")
          .withIndex("by_user_case", (q) => q.eq("userId", member.user._id).eq("caseSlug", doc.slug))
          .order("desc")
          .take(30);
        const finished = attempts.filter((a) => a.status === "finished" && !a.preview);
        const best = finished.reduce((b, a) => Math.max(b, a.scorePct ?? 0), -1);
        mine = {
          best: best >= 0 ? best : null,
          passed: finished.some((a) => a.passed),
          tries: finished.length,
          activeAttemptId: attempts.find((a) => a.status === "active")?._id ?? null,
        };
      }
      cases.push({
        ...caseMeta(def),
        plays: doc.plays,
        live,
        draftAhead: reviewer && live && doc.version !== doc.published?.version,
        mine,
      });
    }
    const interested = member
      ? Boolean(
          await ctx.db
            .query("learnSimInterest")
            .withIndex("by_user", (q) => q.eq("userId", member.user._id))
            .first()
        )
      : false;
    return {
      signedIn: Boolean(await ctx.auth.getUserIdentity()),
      member: Boolean(member),
      reviewer,
      interested,
      cases,
    };
  },
});

/** Starts a case (any unfinished attempt at the same case is closed: one at a time). */
export const startAttempt = mutation({
  args: { slug: v.string(), preview: v.optional(v.boolean()), mode: v.optional(v.literal("consult")) },
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);
    const doc = await caseBySlug(ctx, args.slug);
    if (!doc) throw new ConvexError("This case doesn't exist.");
    const preview = Boolean(args.preview) || !doc.published;
    if (preview && !isReviewer(member)) throw new ConvexError("This case isn't published yet.");
    const version = preview ? doc.version : doc.published!.version;
    const def = await versionDef(ctx, doc.slug, version);
    if (!def) throw new ConvexError("This case is being updated. Try again shortly.");
    const consult = args.mode === "consult";
    if (consult && !consultAvailable(def)) throw new ConvexError("Talking to this patient isn’t available right now. Try the case with taps instead.");
    await rateLimit(ctx, member.user._id);

    const now = Date.now();
    const recent = await ctx.db
      .query("learnSimAttempts")
      .withIndex("by_user_case", (q) => q.eq("userId", member.user._id).eq("caseSlug", doc.slug))
      .order("desc")
      .take(5);
    for (const a of recent) if (a.status === "active") await ctx.db.patch(a._id, { status: "abandoned", finishedAt: now });

    const attemptId = await ctx.db.insert("learnSimAttempts", {
      userId: member.user._id,
      caseSlug: doc.slug,
      version,
      preview,
      state: startState(def, now),
      status: "active",
      startedAt: now,
      ...(consult ? { mode: "consult" as const, consult: consultStart(def) } : {}),
    });
    if (consult) {
      // The patient speaks first (the history node's opening lines)
      const node = def.nodes[def.consult!.node];
      for (const line of node?.lines ?? []) {
        if (line.speaker === "patient") await addTurn(ctx, attemptId, { stage: "history", role: "patient", text: line.text, emotion: "worried" });
      }
    }
    if (!preview) await ctx.db.patch(doc._id, { plays: doc.plays + 1 });
    return { attemptId, serverNow: now };
  },
});

export const getAttempt = query({
  args: { attemptId: v.string() },
  handler: async (ctx, args) => {
    const own = await ownAttempt(ctx, args.attemptId);
    return own ? attemptView(own.def, own.attempt) : null;
  },
});

/** One choice. The server checks it's on offer and in time, then moves the case on. */
export const choose = mutation({
  args: { attemptId: v.id("learnSimAttempts"), choiceId: v.string() },
  handler: async (ctx, args) => {
    const own = await ownAttempt(ctx, args.attemptId);
    if (!own) throw new ConvexError("This attempt isn't available.");
    const { attempt, def } = own;
    if (attempt.status !== "active") throw new ConvexError("This attempt has ended.");
    // In a consult, taps are only for the examination and the plan
    if (attempt.mode === "consult" && (attempt.consult as ConsultState).stage !== "case") {
      throw new ConvexError("That part of the visit is a conversation.");
    }
    const before = attempt.state as SimState;
    const now = Date.now();
    let next: SimState;
    try {
      next = applyChoice(def, before, args.choiceId, now);
    } catch (err) {
      if (err instanceof SimError) throw new ConvexError(err.message);
      throw err;
    }
    const applied = next.steps.length > before.steps.length;
    if (applied) {
      const step = next.steps[next.steps.length - 1];
      await ctx.db.insert("learnSimEvents", {
        attemptId: attempt._id,
        caseSlug: attempt.caseSlug,
        version: attempt.version,
        nodeId: step.nodeId,
        choiceId: step.choiceId,
        clockSec: step.clockSec,
        preview: attempt.preview,
        at: now,
      });
    }
    await saveState(ctx, attempt, def, next, now);
    return { serverNow: now, applied, finished: next.status === "finished" };
  },
});

/** The browser's countdown reached zero: the server checks and closes the attempt. */
export const finishIfExpired = mutation({
  args: { attemptId: v.id("learnSimAttempts") },
  handler: async (ctx, args) => {
    const own = await ownAttempt(ctx, args.attemptId);
    if (!own || own.attempt.status !== "active") return { finished: true };
    const now = Date.now();
    const next = expire(own.def, own.attempt.state as SimState, now);
    if (next.status === "finished") await saveState(ctx, own.attempt, own.def, next, now);
    return { finished: next.status === "finished", serverNow: now };
  },
});

/** The full debrief, only once the case is over. */
export const getDebrief = query({
  args: { attemptId: v.string() },
  handler: async (ctx, args) => {
    const own = await ownAttempt(ctx, args.attemptId);
    if (!own || own.attempt.status !== "finished") return null;
    const { attempt, def, member } = own;
    const doc = await caseBySlug(ctx, attempt.caseSlug);
    const previous = await ctx.db
      .query("learnSimAttempts")
      .withIndex("by_user_case", (q) => q.eq("userId", member.user._id).eq("caseSlug", attempt.caseSlug))
      .order("desc")
      .take(30);
    const best = previous.filter((a) => a.status === "finished" && !a.preview).reduce((b, a) => Math.max(b, a.scorePct ?? 0), 0);
    const interested = Boolean(
      await ctx.db
        .query("learnSimInterest")
        .withIndex("by_user", (q) => q.eq("userId", member.user._id))
        .first()
    );
    const state = attempt.state as SimState;
    let consult = null;
    if (attempt.mode === "consult" && def.consult) {
      const turns = await ctx.db
        .query("learnSimTurns")
        .withIndex("by_attempt", (q) => q.eq("attemptId", attempt._id))
        .take(300);
      const index = choiceIndex(def);
      consult = {
        ...buildConsultDebrief(def, state, attempt.consult as ConsultState),
        patientFirstName: def.speakers.patient?.name ?? def.patient.name.split(" ")[0],
        transcript: turns.map((t) => ({
          index: t.index,
          stage: t.stage,
          role: t.role,
          text: t.text,
          emotion: t.emotion ?? null,
          signals: t.signals ?? null,
          jargon: t.jargon ?? [],
          // In the expert's words: which questions this message counted as
          asked: (t.asked ?? []).map((id) => index.get(id)?.choice.label ?? id),
          rapport: t.rapport ?? null,
        })),
      };
    }
    return {
      attemptId: attempt._id,
      preview: attempt.preview,
      case: caseMeta(def),
      debrief: buildDebrief(def, state),
      best,
      average: doc && doc.completions > 0 ? Math.round(doc.scoreSum / doc.completions) : null,
      interested,
      score: attempt.scorePct ?? null,
      passed: attempt.passed ?? false,
      consult,
    };
  },
});

/**
 * Reviewers only: the full case definitions from the repo, for the new mobile player preview
 * (/simulations/preview), which runs the engine on the device. Never sent to learners.
 */
export const reviewerCases = query({
  args: {},
  handler: async (ctx) => {
    const member = await memberOrNull(ctx);
    if (!isReviewer(member)) return null;
    return SIM_CASES;
  },
});

/** "Sim Pass: get notified" (measures who would pay before we build the paid layer). */
export const registerInterest = mutation({
  args: { caseSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);
    const existing = await ctx.db
      .query("learnSimInterest")
      .withIndex("by_user", (q) => q.eq("userId", member.user._id))
      .first();
    if (!existing) await ctx.db.insert("learnSimInterest", { userId: member.user._id, caseSlug: args.caseSlug, createdAt: Date.now() });
    return { interested: true };
  },
});

// ── Admin › Learn › Simulations ───────────────────────────────────────────────

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export const adminCases = query({
  args: {},
  handler: async (ctx) => {
    const member = await memberOrNull(ctx);
    if (!isReviewer(member)) return null;
    const docs = await ctx.db.query("learnSimCases").withIndex("by_order").take(100);
    const interest = await ctx.db.query("learnSimInterest").take(5000);
    return {
      isAdmin: Boolean(member?.isAdmin),
      interestCount: interest.length,
      repo: SIM_CASES.map((c) => ({ slug: c.slug, version: c.version, title: c.title })),
      cases: docs.map((doc) => {
        const def = doc.definition as SimCase;
        return {
          slug: doc.slug,
          title: doc.title,
          version: doc.version,
          mode: def.mode,
          specialty: def.specialty,
          references: def.references,
          problems: validateCase(def),
          signOff: doc.signOff ?? null,
          signedOffCurrent: doc.signOff?.version === doc.version,
          published: doc.published ?? null,
          plays: doc.plays,
          completions: doc.completions,
          passes: doc.passes,
          average: doc.completions > 0 ? Math.round(doc.scoreSum / doc.completions) : null,
          updatedAt: doc.updatedAt,
        };
      }),
    };
  },
});

/** Loads the repo's cases as drafts (new versions need a new sign-off before publishing). */
/** Copies the repo's cases (content/sim-cases) into Convex as drafts; a published version never changes. */
async function loadCasesFromRepo(ctx: MutationCtx) {
    const now = Date.now();
    const report: { slug: string; version: number; result: "added" | "updated" | "unchanged" | "skipped"; message?: string }[] = [];
    for (const [order, def] of SIM_CASES.entries()) {
      const problems = validateCase(def);
      if (problems.length) {
        report.push({ slug: def.slug, version: def.version, result: "skipped", message: problems.join("; ") });
        continue;
      }
      const doc = await caseBySlug(ctx, def.slug);
      const snapshot = await versionRow(ctx, def.slug, def.version);
      const same = snapshot ? stableStringify(snapshot.definition) === stableStringify(def) : false;
      if (snapshot && !same && doc?.published?.version === def.version) {
        report.push({ slug: def.slug, version: def.version, result: "skipped", message: `Version ${def.version} is published. Raise "version" in the JSON to change it.` });
        continue;
      }
      if (!snapshot) await ctx.db.insert("learnSimVersions", { slug: def.slug, version: def.version, definition: def, createdAt: now });
      else if (!same) await ctx.db.patch(snapshot._id, { definition: def });
      if (!doc) {
        await ctx.db.insert("learnSimCases", {
          slug: def.slug,
          title: def.title,
          order,
          version: def.version,
          definition: def,
          plays: 0,
          completions: 0,
          passes: 0,
          scoreSum: 0,
          createdAt: now,
          updatedAt: now,
        });
        report.push({ slug: def.slug, version: def.version, result: "added" });
        continue;
      }
      const changed = doc.version !== def.version || !same || stableStringify(doc.definition) !== stableStringify(def);
      if (changed || doc.order !== order) {
        await ctx.db.patch(doc._id, { title: def.title, order, version: def.version, definition: def, updatedAt: now });
      }
      report.push({ slug: def.slug, version: def.version, result: changed ? "updated" : "unchanged" });
    }
    return report;
}

export const adminLoadCases = mutation({
  args: {},
  handler: async (ctx) => {
    await requireReviewer(ctx);
    return await loadCasesFromRepo(ctx);
  },
});

/** The same from the command line after a deploy: npx convex run --prod learnSims:loadCasesInternal */
export const loadCasesInternal = internalMutation({
  args: {},
  handler: async (ctx) => await loadCasesFromRepo(ctx),
});

/** A physio confirms the clinical content of the current draft version. */
export const adminSignOff = mutation({
  args: { slug: v.string(), reviewerName: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const member = await requireReviewer(ctx);
    const doc = await caseBySlug(ctx, args.slug);
    if (!doc) throw new ConvexError("This case doesn't exist.");
    const problems = validateCase(doc.definition as SimCase);
    if (problems.length) throw new ConvexError(`Fix the case first: ${problems[0]}`);
    const reviewerName = clean(args.reviewerName, 80);
    if (reviewerName.length < 3) throw new ConvexError("Enter the reviewing physio's name.");
    await ctx.db.patch(doc._id, {
      signOff: { version: doc.version, reviewerName, userId: member.user._id, note: clean(args.note, 500) || undefined, at: Date.now() },
      updatedAt: Date.now(),
    });
  },
});

export const adminPublish = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const member = await requireReviewer(ctx);
    if (!member.isAdmin) throw new ConvexError("Only an admin can publish a case.");
    const doc = await caseBySlug(ctx, args.slug);
    if (!doc) throw new ConvexError("This case doesn't exist.");
    if (doc.signOff?.version !== doc.version) throw new ConvexError(`Version ${doc.version} needs a physio's sign-off first.`);
    if (!(await versionRow(ctx, doc.slug, doc.version))) throw new ConvexError("Load the cases again, then publish.");
    await ctx.db.patch(doc._id, { published: { version: doc.version, at: Date.now(), by: member.user._id }, updatedAt: Date.now() });
  },
});

export const adminUnpublish = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const member = await requireReviewer(ctx);
    if (!member.isAdmin) throw new ConvexError("Only an admin can unpublish a case.");
    const doc = await caseBySlug(ctx, args.slug);
    if (doc) await ctx.db.patch(doc._id, { published: undefined, updatedAt: Date.now() });
  },
});

/** How learners play a case: outcomes, where they stop, and what they choose at each step. */
export const adminCaseStats = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const member = await memberOrNull(ctx);
    if (!isReviewer(member)) return null;
    const doc = await caseBySlug(ctx, args.slug);
    if (!doc) return null;
    const def = doc.definition as SimCase;
    const index = choiceIndex(def);
    const attempts = (
      await ctx.db
        .query("learnSimAttempts")
        .withIndex("by_case", (q) => q.eq("caseSlug", args.slug))
        .order("desc")
        .take(3000)
    ).filter((a) => !a.preview);
    const events = (
      await ctx.db
        .query("learnSimEvents")
        .withIndex("by_case", (q) => q.eq("caseSlug", args.slug))
        .order("desc")
        .take(8000)
    ).filter((e) => !e.preview);

    const outcomes: Record<string, number> = {};
    const stoppedAt: Record<string, number> = {};
    const staleBefore = Date.now() - 30 * 60 * 1000;
    for (const a of attempts) {
      if (a.status === "finished") outcomes[a.outcome ?? "unknown"] = (outcomes[a.outcome ?? "unknown"] ?? 0) + 1;
      else if (a.status === "abandoned" || a.startedAt < staleBefore) {
        const nodeId = (a.state as SimState).nodeId;
        stoppedAt[nodeId] = (stoppedAt[nodeId] ?? 0) + 1;
      }
    }
    const byNode = new Map<string, Map<string, number>>();
    for (const e of events) {
      const counts = byNode.get(e.nodeId) ?? new Map<string, number>();
      counts.set(e.choiceId, (counts.get(e.choiceId) ?? 0) + 1);
      byNode.set(e.nodeId, counts);
    }
    return {
      started: attempts.length,
      finished: attempts.filter((a) => a.status === "finished").length,
      passed: attempts.filter((a) => a.passed).length,
      outcomes,
      nodes: Object.values(def.nodes)
        .filter((n) => !n.end)
        .map((n) => ({
          id: n.id,
          prompt: n.prompt,
          stoppedHere: stoppedAt[n.id] ?? 0,
          choices: (n.choices ?? []).map((c) => ({
            id: c.id,
            label: c.label,
            tag: c.tag,
            count: byNode.get(n.id)?.get(c.id) ?? 0,
          })),
        })),
      choiceCount: index.size,
    };
  },
});

// ── Sharing a run (owner 2026-11-14) ─────────────────────────────────────────
// A learner shares a finished, scored run; anyone with the link watches it replayed (the patient,
// their choices, the voices, the score). The expert path and the marking stay private, so the case
// isn't spoiled for the next person.

const SHARE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** The learner's share link for a finished run (made once, then reused). */
export const createShare = mutation({
  args: { attemptId: v.string() },
  handler: async (ctx, args) => {
    const own = await ownAttempt(ctx, args.attemptId);
    if (!own || own.attempt.status !== "finished") throw new ConvexError("Finish the case first, then share it.");
    // Preview runs (reviewers play-testing a draft) can be shared too, so the team can try it
    const existing = await ctx.db.query("learnSimShares").withIndex("by_attempt", (q) => q.eq("attemptId", own.attempt._id)).first();
    if (existing) return { code: existing.code };
    let code = "";
    for (let tries = 0; tries < 5; tries++) {
      code = Array.from({ length: 8 }, () => SHARE_ALPHABET[Math.floor(Math.random() * SHARE_ALPHABET.length)]).join("");
      const clash = await ctx.db.query("learnSimShares").withIndex("by_code", (q) => q.eq("code", code)).first();
      if (!clash) break;
    }
    await ctx.db.insert("learnSimShares", { code, attemptId: own.attempt._id, userId: own.member.user._id, caseSlug: own.attempt.caseSlug, createdAt: Date.now() });
    return { code };
  },
});

type ShareBeat =
  | { kind: "scene"; text: string; scene: string | null; audioId?: string }
  | { kind: "speech"; speaker: string; name: string; role: string; text: string; audioId: string }
  | { kind: "action"; label: string; clockSec: number; category: string; scene: string | null }
  | { kind: "finding"; label: string; detail: string; abnormal: boolean }
  | { kind: "ending"; title: string; summary: string; outcome: string; audioId?: string };

/** A shared run, rebuilt for the public replay (no sign-in needed). */
export const getShare = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const share = await ctx.db.query("learnSimShares").withIndex("by_code", (q) => q.eq("code", args.code)).first();
    if (!share) return null;
    const attempt = await ctx.db.get(share.attemptId);
    if (!attempt || attempt.status !== "finished") return null;
    const def = await versionDef(ctx, attempt.caseSlug, attempt.version);
    if (!def) return null;
    const user = await ctx.db.get(share.userId);
    const state = attempt.state as SimState;
    const beats: ShareBeat[] = [];
    let scene: string | null = null;
    const enter = (nodeId: string) => {
      const node = def.nodes[nodeId];
      if (!node) return;
      if (node.scene) scene = node.scene;
      // Narrated cases: the narrator reads the situation in the replay and its video
      if (node.prompt) beats.push({ kind: "scene", text: node.prompt, scene, ...(def.narration ? { audioId: `${node.id}-narration` } : {}) });
      (node.lines ?? []).forEach((line, i) => beats.push({ kind: "speech", ...lineView(def, line, `${node.id}-${i}`) }));
    };
    // A situation shows once when the learner arrives (a hub they come back to doesn't repeat)
    let entered = def.startNode;
    let next: string | null = null;
    enter(entered);
    for (const step of state.steps) {
      if (step.nodeId !== entered) {
        entered = step.nodeId;
        enter(entered);
      }
      const choice = (def.nodes[step.nodeId]?.choices ?? []).find((c) => c.id === step.choiceId);
      if (!choice) continue;
      if (choice.effects?.scene) scene = choice.effects.scene;
      beats.push({ kind: "action", label: choice.label, clockSec: step.clockSec, category: choiceCategory(choice), scene });
      if (choice.reply) beats.push({ kind: "speech", ...lineView(def, choice.reply, choice.id) });
      for (const f of choice.reveals ?? []) {
        const finding = def.findings[f];
        if (finding) beats.push({ kind: "finding", label: finding.label, detail: finding.detail, abnormal: Boolean(finding.abnormal) });
      }
      next = choice.next ?? null;
    }
    // Where the last choice led (usually the ending's own scene and lines)
    if (next && next !== entered) enter(next);
    const debrief = buildDebrief(def, state);
    const endNode = def.nodes[state.nodeId]?.end ? state.nodeId : null;
    beats.push({
      kind: "ending",
      title: debrief.ending.title,
      summary: debrief.ending.summary,
      outcome: debrief.ending.outcome,
      ...(def.narration && endNode ? { audioId: `${endNode}-ending` } : {}),
    });
    const doc = await caseBySlug(ctx, def.slug);
    return {
      code: share.code,
      firstName: user?.firstName?.trim() || "A Rehabify learner",
      case: {
        slug: def.slug,
        title: def.title,
        version: def.version,
        setting: def.setting,
        patient: { name: def.patient.name, age: def.patient.age },
        audio: Boolean(def.audio),
        live: Boolean(doc?.published),
      },
      scenes: def.scenes ?? {},
      beats,
      result: { pct: debrief.score.pct, passed: debrief.score.passed, outcome: debrief.ending.outcome, title: debrief.ending.title, timeSec: debrief.timeSec },
      sharedAt: share.createdAt,
    };
  },
});
