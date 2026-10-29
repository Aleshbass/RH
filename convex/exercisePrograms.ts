/**
 * Home exercise programmes: one programme holds library exercises (with a 3D demonstration), the
 * care team's own exercises, and/or education, each with its dose and instructions, plus a note
 * and a voice note. A physio or clinic creates it, adds to it later or edits it. The patient sees
 * it in their dashboard (and can open it from a PIN-protected WhatsApp link, see
 * exerciseShareLinks.ts), follows the demonstrations and logs each exercise with a pain score.
 * The care team sees adherence.
 */
import { insertNotification } from "./helpers/pushNotify";
import { advancePatientReferrals } from "./helpers/partnerAttribution";
import { ConvexError, v, type Infer } from "convex/values";
import { makeFunctionReference } from "convex/server";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { ensureUserRole } from "./auth";
import { paystackRequest } from "./clinicBilling";
import { libraryItem } from "./exerciseLibrary";
import { EXERCISE_CATALOG } from "./exerciseLibraryCatalog";
import { appLink, publicAppUrl } from "./helpers/appUrl";
import { currentUser } from "./helpers/careAccess";
import {
  careTeamOrNull,
  displayName,
  itemClipId,
  programmeInScope,
  requireCareTeam,
  resolveShareSession,
  type CareTeamAccess,
} from "./helpers/exerciseAccess";
import { programmeAllowanceInfo } from "./helpers/clinicSubscriptions";
import {
  REMINDER_BEFORE_MS,
  activatePendingPlans,
  anyPlanLive,
  assertProgramUnlocked,
  currentEntitlement,
  entitlementView,
  flexReference,
  isIndependentPair,
  isLive,
  newPeriod,
  parseFlexReference,
  patientEntitlements,
  patientFlexContext,
  planName,
  planOffer,
  planPriceKobo,
  planSettings,
  programNeedsFlex,
  programPlan,
  refundRule,
  type PaidPlan,
} from "./helpers/patientPlans";
import { verifyPaystackSignature } from "./helpers/paystackSignature";
import { issueReceipt } from "./helpers/receipts";
import { createRefundRequest } from "./helpers/refunds";

type Ctx = QueryCtx | MutationCtx;
type StoredItem = Doc<"exercisePrograms">["items"][number];

const DAY = 86_400_000;
const LAGOS_OFFSET = 3_600_000; // West Africa Time, UTC+1, no daylight saving
const MAX_ITEMS = 30;
const MAX_NOTE = 2000;
const MAX_STORED_NOTE = 4000; // notes added with later exercises are appended
const MAX_ITEM_NOTE = 1000;
const MAX_EDUCATION_TEXT = 3000;
const MAX_GOALS = 10;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Midnight today in Lagos, so "done today" resets at local midnight (Convex runs in UTC). */
export function startOfLagosDay(now = Date.now()) {
  return now - ((now + LAGOS_OFFSET) % DAY);
}

/** "17 Oct" in Lagos time, without relying on Intl time zone data. */
function lagosDay(ms: number) {
  const d = new Date(ms + LAGOS_OFFSET);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

// One programme item as the care team sends it. Older clients send only library exercises with
// sets, reps and frequency, which still match.
const itemFields = {
  exerciseId: v.optional(v.id("exercises")),
  kind: v.optional(v.union(v.literal("exercise"), v.literal("education"))),
  name: v.optional(v.string()),
  side: v.optional(v.union(v.literal("L"), v.literal("R"))),
  sets: v.optional(v.number()),
  reps: v.optional(v.number()),
  holdSeconds: v.optional(v.number()),
  frequency: v.optional(v.string()),
  note: v.optional(v.string()),
  // Education from the Rehabify Library (libraryResources.key)
  resourceKey: v.optional(v.string()),
};
const itemInput = v.object(itemFields);
// When editing, items already in the programme say where they were, so logs follow them.
const editItemInput = v.object({ ...itemFields, fromIndex: v.optional(v.number()) });
type ItemInput = Infer<typeof itemInput>;

const clean = (s?: string, max = MAX_NOTE) => {
  const t = s?.trim();
  return t ? t.slice(0, max) : undefined;
};

const intIn = (n: number | undefined, lo: number, hi: number, label: string) => {
  if (n === undefined || !Number.isFinite(n) || Math.round(n) !== n || n < lo || n > hi) {
    throw new ConvexError(`${label} must be a whole number from ${lo} to ${hi}.`);
  }
  return n;
};

function cleanGoals(goals?: string[]) {
  const list = (goals ?? []).map((g) => clean(g, 200)).filter((g): g is string => Boolean(g)).slice(0, MAX_GOALS);
  return list.length ? list : undefined;
}

function cleanVoiceSeconds(seconds?: number) {
  return seconds === undefined || !Number.isFinite(seconds) ? undefined : Math.max(0, Math.round(seconds));
}

/**
 * Convex hides the text of any error that isn't a ConvexError in production (the browser only
 * gets "Server Error"), so an unexpected failure is logged with its stack and reaches the care
 * team as a clear message instead. The mutation is rolled back either way.
 */
async function guarded<T>(action: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ConvexError || (error as { name?: string })?.name === "ConvexError") throw error;
    console.error(`exercisePrograms: couldn't ${action}`, error);
    throw new ConvexError(
      `We couldn't ${action} just now. Please try again in a moment; if it keeps happening, contact Rehabify support.`
    );
  }
}

/** Checks and tidies the items the care team sent, in order. */
async function cleanItems(ctx: MutationCtx, team: CareTeamAccess, input: ItemInput[]): Promise<StoredItem[]> {
  const items: StoredItem[] = [];
  for (const [i, item] of input.entries()) {
    const position = `Item ${i + 1}`;
    if (item.kind === "education") {
      // A library resource keeps its key, so the patient sees its guide, link or video.
      // Retired resources still pass, so programmes that already hold one can be edited.
      const resource = item.resourceKey ? await resourceByKey(ctx, item.resourceKey) : null;
      if (item.resourceKey && !resource) {
        throw new ConvexError(`${position} is no longer in the Rehabify Library. Remove it and choose another.`);
      }
      const name = clean(item.name, 120) ?? resource?.title.slice(0, 120);
      const note = clean(item.note, MAX_EDUCATION_TEXT);
      if (!name && !note) throw new ConvexError(`${position} is empty education. Give it a title or some text, or remove it.`);
      items.push({ kind: "education", name: name ?? "Information", note, resourceKey: resource?.key });
      continue;
    }

    let label: string;
    let exerciseId: Id<"exercises"> | undefined;
    let name: string | undefined;
    let side: "L" | "R" | undefined;
    if (item.exerciseId) {
      const exercise = await ctx.db.get(item.exerciseId);
      if (!exercise) throw new ConvexError(`${position} is no longer in the exercise library. Remove it and choose another.`);
      if (!exercise.isPublic && exercise.clinicId !== team.clinicId) {
        throw new ConvexError(`${exercise.name} isn't available to you. Remove it and choose another.`);
      }
      if (exercise.sided && !item.side) throw new ConvexError(`Choose a side for ${exercise.name}.`);
      label = exercise.name;
      exerciseId = exercise._id;
      side = exercise.sided ? item.side : undefined;
    } else {
      name = clean(item.name, 120);
      if (!name) throw new ConvexError(`${position} needs an exercise name, or remove it.`);
      label = name;
    }
    items.push({
      exerciseId,
      name,
      side,
      sets: intIn(item.sets, 1, 10, `Sets for ${label}`),
      reps: intIn(item.reps, 1, 50, `Reps for ${label}`),
      holdSeconds: item.holdSeconds === undefined ? undefined : intIn(item.holdSeconds, 1, 120, `Hold (seconds) for ${label}`),
      frequency: clean(item.frequency, 60) ?? "Once a day",
      note: clean(item.note, MAX_ITEM_NOTE),
    });
  }
  return items;
}

function countLabel(items: { kind?: string }[]) {
  const exercises = items.filter((i) => i.kind !== "education").length;
  const education = items.length - exercises;
  const parts = [];
  if (exercises) parts.push(`${exercises} exercise${exercises === 1 ? "" : "s"}`);
  if (education) parts.push(`${education} education item${education === 1 ? "" : "s"}`);
  return parts.join(" and ") || "nothing";
}

async function activePlanAndEpisode(ctx: Ctx, patientId: Id<"users">, physioId?: Id<"users">) {
  const plan = (
    await ctx.db
      .query("treatmentPlans")
      .withIndex("by_patient_and_status", (q) => q.eq("patientId", patientId).eq("status", "active"))
      .collect()
  )
    .filter((p) => !physioId || p.physiotherapistId === physioId)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
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

function resourceByKey(ctx: Ctx, key: string) {
  return ctx.db
    .query("libraryResources")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
}

/**
 * A Rehabify Library resource as the patient sees it: the English guide only, because
 * translations stay drafts until a clinician reviews them.
 */
function resourceView(resource: Doc<"libraryResources"> | null) {
  if (!resource) return null;
  const guide = resource.guides.find((g) => g.lang === "en");
  return {
    key: resource.key,
    kind: resource.kind,
    title: resource.title,
    source: resource.source,
    url: resource.url ?? null,
    youtubeId: resource.youtubeId ?? null,
    steps: guide?.steps ?? [],
    stop: guide?.stop ?? null,
  };
}

/**
 * A programme with its items, ready to show (used by the care team, the patient and links).
 * `plan` says whether Flex applies (helpers/patientPlans.ts). For the patient (`audience`
 * "patient"), a programme that needs Flex they don't have keeps its steps and notes (Basic) but
 * not the video links; 3D clips and the physio's own media are refused where their keys and
 * links are handed out (exerciseLibrary.ts).
 */
export async function programView(ctx: Ctx, program: Doc<"exercisePrograms">, audience: "patient" | "team" = "team") {
  const exercises = await Promise.all(program.items.map((item) => (item.exerciseId ? ctx.db.get(item.exerciseId) : null)));
  const resources = await Promise.all(
    program.items.map((item) => (item.kind === "education" && item.resourceKey ? resourceByKey(ctx, item.resourceKey) : null))
  );
  const sender = await ctx.db.get(program.createdBy);
  const clinic = program.clinicId ? await ctx.db.get(program.clinicId) : null;
  const plan = await programPlan(ctx, program);
  const hideDemos = audience === "patient" && plan.locked;
  return {
    plan,
    _id: program._id,
    patientId: program.patientId,
    title: program.title,
    note: program.note ?? null,
    goals: program.goals ?? [],
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
      const kind = item.kind === "education" ? ("education" as const) : ("exercise" as const);
      const clipId = kind === "exercise" ? itemClipId(exercise, item.side) : null;
      return {
        index,
        kind,
        name: exercise?.name ?? item.name ?? (kind === "education" ? "Information" : "Exercise"),
        // An exercise the care team wrote themselves (not from the library)
        custom: kind === "exercise" && !item.exerciseId,
        exerciseId: item.exerciseId ?? null,
        sets: item.sets ?? null,
        reps: item.reps ?? null,
        holdSeconds: item.holdSeconds ?? null,
        frequency: item.frequency ?? null,
        note: item.note ?? null,
        side: item.side ?? null,
        clipId,
        // Patients only see approved animations; others see the poster and steps.
        animated: Boolean(clipId && exercise?.animationStatus === "approved"),
        exercise: exercise ? { ...libraryItem(exercise), ...(hideDemos ? { videoUrl: null } : {}) } : null,
        // Education picked from the Rehabify Library
        resourceKey: item.resourceKey ?? null,
        resource: resourceView(resources[index]),
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

type ProgramChange =
  | { kind: "new"; title: string }
  | { kind: "added"; title: string; what: string }
  | { kind: "updated"; title: string };

async function notifyPatient(ctx: MutationCtx, patient: Doc<"users">, senderName: string, change: ProgramChange) {
  const text = {
    new: {
      title: "New exercises from your physio",
      body: `${senderName} sent you "${change.title}". Open it to see how to do each exercise.`,
    },
    added: {
      title: "New exercises in your programme",
      body: `${senderName} added ${change.kind === "added" ? change.what : "exercises"} to "${change.title}".`,
    },
    updated: {
      title: "Your exercise programme was updated",
      body: `${senderName} updated "${change.title}". Have a look before your next session.`,
    },
  }[change.kind];
  await insertNotification(ctx, {
    userId: patient._id,
    type: "exercise_program",
    priority: "medium",
    status: "pending",
    payload: { title: text.title, body: text.body, data: { actionUrl: "/dashboard/patient/exercises" } },
    createdAt: Date.now(),
  });
  // Small edits stay in the app; new programmes and new exercises are also emailed.
  if (change.kind === "updated" || !patient.email) return;
  await ctx.scheduler.runAfter(0, internal.actions.emails.sendPatientCareEmail.sendPatientCareEmail, {
    to: patient.email,
    subject: change.kind === "new" ? "Your home exercises are ready" : "New exercises in your programme",
    greetingName: patient.firstName,
    heading: change.kind === "new" ? "Your home exercises are ready" : "New exercises in your programme",
    paragraphs:
      change.kind === "new"
        ? [
            `${senderName} has sent you a home exercise programme: ${change.title}.`,
            "Library exercises have a 3D demonstration you can watch from any angle and in slow motion, with your physio's notes.",
          ]
        : [`${senderName} has added ${change.what} to your home exercise programme: ${change.title}.`],
    buttonLabel: "Open my exercises",
    buttonUrl: `${publicAppUrl()}/dashboard/patient/exercises`,
  });
}

async function patientOrThrow(ctx: MutationCtx, patientId: Id<"users">) {
  const patient = await ctx.db.get(patientId);
  if (!patient || patient.role !== "patient") throw new ConvexError("This patient's account couldn't be found.");
  return patient;
}

async function editableProgram(ctx: MutationCtx, programId: Id<"exercisePrograms">) {
  const program = await ctx.db.get(programId);
  if (!program) throw new ConvexError("That programme no longer exists. Choose another, or create a new one.");
  const team = await requireCareTeam(ctx, program.patientId, { write: true });
  if (program.status !== "active") {
    throw new ConvexError(`"${program.title}" is archived. Restore it first, or create a new programme.`);
  }
  return { program, team };
}

// ─────────────────────────────────────────────────────────────────────────────
// Care team
// ─────────────────────────────────────────────────────────────────────────────

export const createProgram = mutation({
  args: {
    patientId: v.id("users"),
    title: v.string(),
    note: v.optional(v.string()),
    goals: v.optional(v.array(v.string())),
    voiceNoteStorageId: v.optional(v.id("_storage")),
    voiceNoteSeconds: v.optional(v.number()),
    items: v.array(itemInput),
  },
  handler: (ctx, args) =>
    guarded("send the programme", async () => {
      const team = await requireCareTeam(ctx, args.patientId, { write: true });
      const patient = await patientOrThrow(ctx, args.patientId);
      const title = clean(args.title, 120);
      if (!title) throw new ConvexError("Give the programme a title.");
      if (args.items.length === 0) throw new ConvexError("Add at least one exercise or education item.");
      if (args.items.length > MAX_ITEMS) throw new ConvexError(`A programme can have up to ${MAX_ITEMS} items.`);
      const items = await cleanItems(ctx, team, args.items);

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
        goals: cleanGoals(args.goals),
        voiceNoteStorageId: args.voiceNoteStorageId,
        voiceNoteSeconds: args.voiceNoteStorageId ? cleanVoiceSeconds(args.voiceNoteSeconds) : undefined,
        items,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      // A referred patient with a home programme is in treatment (any physio: clinic, network or own)
      await advancePatientReferrals(ctx, args.patientId, "treatment_active", { actorType: "physiotherapist", actorId: String(team.user._id) });
      // Flex bought before the programme was ready starts its 30 days now
      await activatePendingPlans(ctx, args.patientId, now);
      await notifyPatient(ctx, patient, team.senderName, { kind: "new", title });
      return programId;
    }),
});

/**
 * Adds exercises and/or education to the end of an existing programme, so new exercises land in
 * the programme they belong to instead of a new one each time. A written note is added below
 * the programme's note; a voice note replaces the old one.
 */
export const addExercisesToProgram = mutation({
  args: {
    programId: v.id("exercisePrograms"),
    items: v.array(itemInput),
    note: v.optional(v.string()),
    voiceNoteStorageId: v.optional(v.id("_storage")),
    voiceNoteSeconds: v.optional(v.number()),
  },
  handler: (ctx, args) =>
    guarded("add to the programme", async () => {
      const { program, team } = await editableProgram(ctx, args.programId);
      if (args.items.length === 0) throw new ConvexError("Add at least one exercise or education item.");
      if (program.items.length + args.items.length > MAX_ITEMS) {
        throw new ConvexError(
          `"${program.title}" can hold up to ${MAX_ITEMS} items and already has ${program.items.length}. Remove some first, or create a new programme.`
        );
      }
      const added = await cleanItems(ctx, team, args.items);
      const now = Date.now();
      const patch: Partial<Doc<"exercisePrograms">> = { items: [...program.items, ...added], updatedAt: now };
      const note = clean(args.note);
      if (note) {
        const combined = program.note ? `${program.note}\n\n${lagosDay(now)}: ${note}` : note;
        patch.note = combined.length > MAX_STORED_NOTE ? `…${combined.slice(-(MAX_STORED_NOTE - 1))}` : combined;
      }
      if (args.voiceNoteStorageId) {
        patch.voiceNoteStorageId = args.voiceNoteStorageId;
        patch.voiceNoteSeconds = cleanVoiceSeconds(args.voiceNoteSeconds);
      }
      await ctx.db.patch(program._id, patch);
      const patient = await ctx.db.get(program.patientId);
      if (patient) await notifyPatient(ctx, patient, team.senderName, { kind: "added", title: program.title, what: countLabel(added) });
      return program._id;
    }),
});

/**
 * Edits a programme: title, note, goals, voice note, and the full list of items (changed doses,
 * new order, removed or added items). Patient logs follow their item when the order changes;
 * logs of a removed item stay on record but no longer match an item (itemIndex -1).
 */
export const updateProgram = mutation({
  args: {
    programId: v.id("exercisePrograms"),
    title: v.string(),
    // Sent when changed; an empty string clears it.
    note: v.optional(v.string()),
    goals: v.optional(v.array(v.string())),
    items: v.array(editItemInput),
    voiceNoteStorageId: v.optional(v.id("_storage")),
    voiceNoteSeconds: v.optional(v.number()),
    removeVoiceNote: v.optional(v.boolean()),
  },
  handler: (ctx, args) =>
    guarded("save the programme", async () => {
      const { program, team } = await editableProgram(ctx, args.programId);
      const title = clean(args.title, 120);
      if (!title) throw new ConvexError("Give the programme a title.");
      if (args.items.length === 0) throw new ConvexError("A programme needs at least one item. Archive it instead if it's finished.");
      if (args.items.length > MAX_ITEMS) throw new ConvexError(`A programme can have up to ${MAX_ITEMS} items.`);

      // Where each kept item used to be, so logs keep pointing at the right exercise.
      const newIndexOf = new Map<number, number>();
      args.items.forEach((item, newIndex) => {
        if (item.fromIndex === undefined) return;
        const from = item.fromIndex;
        if (!Number.isInteger(from) || from < 0 || from >= program.items.length || newIndexOf.has(from)) {
          throw new ConvexError("This programme changed while you were editing it. Close it, open it again and redo your changes.");
        }
        newIndexOf.set(from, newIndex);
      });
      const items = await cleanItems(ctx, team, args.items.map(({ fromIndex: _from, ...item }) => item));

      const reordered = program.items.length !== items.length || [...newIndexOf].some(([from, to]) => from !== to) || newIndexOf.size !== program.items.length;
      if (reordered) {
        const logs = await ctx.db
          .query("exerciseProgramLogs")
          .withIndex("by_program", (q) => q.eq("programId", program._id))
          .collect();
        for (const log of logs) {
          const next = log.itemIndex < 0 ? log.itemIndex : (newIndexOf.get(log.itemIndex) ?? -1);
          if (next !== log.itemIndex) await ctx.db.patch(log._id, { itemIndex: next });
        }
      }

      const patch: Partial<Doc<"exercisePrograms">> = { title, items, updatedAt: Date.now() };
      if (args.note !== undefined) patch.note = clean(args.note, MAX_STORED_NOTE);
      if (args.goals !== undefined) patch.goals = cleanGoals(args.goals);
      if (args.voiceNoteStorageId) {
        patch.voiceNoteStorageId = args.voiceNoteStorageId;
        patch.voiceNoteSeconds = cleanVoiceSeconds(args.voiceNoteSeconds);
      } else if (args.removeVoiceNote) {
        patch.voiceNoteStorageId = undefined;
        patch.voiceNoteSeconds = undefined;
      }
      await ctx.db.patch(program._id, patch);
      const patient = await ctx.db.get(program.patientId);
      if (patient) await notifyPatient(ctx, patient, team.senderName, { kind: "updated", title });
      return program._id;
    }),
});

export const archiveProgram = mutation({
  args: { programId: v.id("exercisePrograms"), archived: v.boolean() },
  handler: (ctx, args) =>
    guarded(args.archived ? "archive the programme" : "restore the programme", async () => {
      const program = await ctx.db.get(args.programId);
      if (!program) throw new ConvexError("Programme not found.");
      await requireCareTeam(ctx, program.patientId, { write: true });
      const now = Date.now();
      await ctx.db.patch(args.programId, args.archived
        ? { status: "archived", archivedAt: now, updatedAt: now }
        : { status: "active", archivedAt: undefined, updatedAt: now });
    }),
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
    return await Promise.all(
      programs.filter((program) => programmeInScope(team, program)).map((program) => careTeamProgramView(ctx, program, now))
    );
  },
});

/**
 * Clinic plans: what sending this patient a new programme does to the clinic's allowance, so the
 * send sheet can say so first. Null for anyone not on a billed clinic plan.
 */
export const programmeAllowanceFor = query({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    const team = await careTeamOrNull(ctx, args.patientId);
    if (!team?.clinicId) return null;
    return await programmeAllowanceInfo(ctx, team.clinicId, args.patientId, Date.now());
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
    ...(await programView(ctx, program, "patient")),
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
  if (program.items[args.itemIndex].kind === "education") {
    throw new ConvexError("That's information to read, so there's nothing to log.");
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
  if (pain !== undefined && pain >= 7) await notifyHighPain(ctx, program, args.itemIndex, pain, clean(args.note, 200));
}

/**
 * High pain in a log goes to the patient's current clinician (their active care relationship,
 * primary first) and to whoever sent the programme, if that's someone else. It also shows in
 * the physio's Needs attention until they mark it reviewed (physioCare.getNeedsAttention).
 */
async function notifyHighPain(ctx: MutationCtx, program: Doc<"exercisePrograms">, itemIndex: number, pain: number, note?: string) {
  const patient = await ctx.db.get(program.patientId);
  const patientName = [patient?.firstName, patient?.lastName].filter(Boolean).join(" ") || "A patient";
  const item = program.items[itemIndex];
  const exercise = item.exerciseId ? await ctx.db.get(item.exerciseId) : null;
  const what = exercise?.name ?? item.name ?? "an exercise";

  const active = (
    await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient", (q) => q.eq("patientId", program.patientId))
      .collect()
  ).filter((r) => r.status === "active");
  const current = active.find((r) => r.isPrimaryPhysiotherapist) ?? active.sort((a, b) => b.startDate - a.startDate)[0];
  const recipients = new Set<Id<"users">>([program.createdBy]);
  if (current) recipients.add(current.physiotherapistId);

  for (const userId of recipients) {
    const recipient = await ctx.db.get(userId);
    if (!recipient) continue;
    await insertNotification(ctx, {
      userId,
      type: "exercise_pain_flag",
      priority: "high",
      status: "pending",
      payload: {
        title: `${patientName} reported high pain`,
        body: `Pain ${pain}/10 during ${what} ("${program.title}").${note ? ` They wrote: "${note}"` : ""}`,
        data: {
          actionUrl:
            recipient.role === "physiotherapist"
              ? `/dashboard/physiotherapist/patients/${program.patientId}?tab=checkins`
              : "/dashboard/clinic/patients",
        },
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
  handler: (ctx, args) =>
    guarded("save that", async () => {
      const user = await currentUser(ctx);
      const program = await ctx.db.get(args.programId);
      if (!user || !program || program.patientId !== user._id || program.status !== "active") {
        throw new ConvexError("This programme isn't available.");
      }
      // Progress tracking is part of Flex for an independent physio's own patients
      await assertProgramUnlocked(ctx, program, "log");
      const { programId: _ignored, ...log } = args;
      await insertLog(ctx, program, log, "app");
    }),
});

/** Logging from a WhatsApp link (no account): the PIN session stands in for sign-in. */
export const logExerciseFromLink = mutation({
  args: { code: v.string(), session: v.string(), ...logArgs },
  handler: (ctx, args) =>
    guarded("save that", async () => {
      const res = await resolveShareSession(ctx, args.code, args.session);
      if (!res.ok) throw new ConvexError("Enter your PIN again to continue.");
      await assertProgramUnlocked(ctx, res.program, "log");
      const { code: _c, session: _s, ...log } = args;
      await insertLog(ctx, res.program, log, "link", res.link._id);
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Flex and Flex Max: buying, refunds, the launch switch and the hourly sweep.
// Who must buy and what it unlocks: helpers/patientPlans.ts.
// ─────────────────────────────────────────────────────────────────────────────

const planValidator = v.union(v.literal("flex"), v.literal("flex_max"));
const shareValidator = v.object({ code: v.string(), session: v.string() });
const PLAN_FOOTNOTE = "Questions about Flex? Write to hello@myrehabifyhealth.com.";

const sendCareEmail = makeFunctionReference<
  "action",
  {
    to: string;
    subject: string;
    greetingName?: string;
    heading: string;
    paragraphs: string[];
    buttonLabel?: string;
    buttonUrl?: string;
    footnote?: string;
  }
>("actions/emails/sendPatientCareEmail:sendPatientCareEmail");

type FlexCheckout = {
  patientId: Id<"users">;
  email: string;
  amountKobo: number;
  plan: PaidPlan;
  patientNumber: string | null;
  returnPath: string;
};

type FlexCompletion =
  | { success: true; alreadyCompleted: boolean; status: Doc<"patientPlanEntitlements">["status"]; plan: PaidPlan }
  | { success: false; reason: string };

type PaidEvidence = { amountKobo: number; currency: string; channel?: string };

const prepareFlexCheckoutRef = makeFunctionReference<
  "query",
  { plan: PaidPlan; share?: { code: string; session: string }; from?: "dashboard" | "exercises" },
  FlexCheckout
>("exercisePrograms:prepareFlexCheckout");
const completeVerifiedFlexPaymentRef = makeFunctionReference<
  "mutation",
  { reference: string; amountKobo: number; currency: string; channel?: string },
  FlexCompletion
>("exercisePrograms:completeVerifiedFlexPayment");
const flexPurchaseByReferenceRef = makeFunctionReference<
  "query",
  { reference: string },
  { status: Doc<"patientPlanEntitlements">["status"]; plan: PaidPlan } | null
>("exercisePrograms:flexPurchaseByReference");

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

/** First day of this month in Lagos, as a timestamp. */
function startOfLagosMonth(now: number) {
  const d = new Date(now + LAGOS_OFFSET);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - LAGOS_OFFSET;
}

/** Same rule as Learn: Rehabify hosts and localhost only; anything else returns to the public site. */
function checkoutOrigin(requested: string | undefined): string {
  const fallback = publicAppUrl();
  if (!requested) return fallback;
  try {
    const url = new URL(requested);
    const host = url.hostname.toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1";
    const isRehabify = url.protocol === "https:" && (host === "physioaroundme.com" || host.endsWith(".physioaroundme.com"));
    return isLocal || isRehabify || url.origin === fallback ? url.origin : fallback;
  } catch {
    return fallback;
  }
}

/** Emails we can send a receipt to (not the placeholders some invited or Joy accounts carry). */
function receiptEmail(email: string | undefined) {
  const value = email?.trim().toLowerCase();
  if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  if (value.endsWith("@placeholder.patient") || value.endsWith(".invalid")) return null;
  return value;
}

/** Public: which plans are on sale (pricing page, physio settings, patient dashboard). */
export const recoveryPlansLive = query({
  args: {},
  handler: async (ctx) => {
    const live = await planSettings(ctx);
    return { flexLive: live.flexLive, flexMaxLive: live.flexMaxLive };
  },
});

/** The signed-in patient's plan for the "Your plan" card: what they have, can buy, or can get back. */
export const myRecoveryPlan = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user || user.role !== "patient") return null;
    const now = Date.now();
    const live = await planSettings(ctx);
    const rows = await patientEntitlements(ctx, user._id, 20);
    if (!anyPlanLive(live) && rows.length === 0) return null;
    const situation = await patientFlexContext(ctx, user._id);
    const current = await currentEntitlement(ctx, user._id, now);
    let refund: {
      entitlementId: Id<"patientPlanEntitlements">;
      name: string;
      amountKobo: number;
      reason: "flex_not_ready_7d" | "flex_48h";
      until: number | null;
    } | null = null;
    for (const row of rows) {
      const rule = await refundRule(ctx, row, now);
      if (rule) {
        refund = { entitlementId: row._id, name: planName(row.plan), amountKobo: row.amountKobo, reason: rule.reason, until: rule.until };
        break;
      }
    }
    return {
      live: { flexLive: live.flexLive, flexMaxLive: live.flexMaxLive },
      // An independent physio's own patient: Flex is theirs to buy (everyone else has it included)
      mustBuy: anyPlanLive(live) && situation.independent,
      current: current ? entitlementView(current, now) : null,
      upcoming: rows
        .filter((row) => row.status === "pending_activation" || (row.status === "active" && (row.activatedAt ?? 0) > now))
        .map((row) => entitlementView(row, now)),
      refundRequested: rows.filter((row) => row.status === "cancelled" && row.refundRequestId).map((row) => entitlementView(row, now)),
      offer: situation.independent ? planOffer(live) : [],
      canPay: receiptEmail(user.email) !== null,
      refund,
    };
  },
});

/** Checks a checkout can go ahead and who pays. The price always comes from here. */
export const prepareFlexCheckout = internalQuery({
  args: {
    plan: planValidator,
    share: v.optional(shareValidator),
    from: v.optional(v.union(v.literal("dashboard"), v.literal("exercises"))),
  },
  handler: async (ctx, args): Promise<FlexCheckout> => {
    const live = await planSettings(ctx);
    if (!isLive(live, args.plan)) throw new ConvexError(`${planName(args.plan)} isn't available yet.`);
    const included = "Your care already includes everything in Flex, so there's nothing to pay.";
    let patient: Doc<"users"> | null;
    let returnPath: string;
    if (args.share) {
      const res = await resolveShareSession(ctx, args.share.code, args.share.session);
      if (!res.ok) throw new ConvexError("Enter your PIN again to continue.");
      if (!(await programNeedsFlex(ctx, res.program, live))) throw new ConvexError(included);
      patient = await ctx.db.get(res.program.patientId);
      // The code passed resolveShareSession, so it's letters and digits only
      returnPath = `/x/${args.share.code}`;
    } else {
      patient = await currentUser(ctx);
      if (!patient || patient.role !== "patient") throw new ConvexError("Sign in to your Rehabify account to get Flex.");
      if (!(await patientFlexContext(ctx, patient._id)).independent) throw new ConvexError(included);
      returnPath = args.from === "exercises" ? "/dashboard/patient/exercises" : "/dashboard/patient";
    }
    const email = receiptEmail(patient?.email);
    if (!patient || !email) {
      throw new ConvexError(
        args.share
          ? "Sign in to your Rehabify account to get Flex, so we can send your receipt."
          : "Add your email address in Settings first, so we can send your receipt."
      );
    }
    return {
      patientId: patient._id,
      email,
      amountKobo: planPriceKobo(args.plan),
      plan: args.plan,
      patientNumber: patient.patientNumber ?? null,
      returnPath,
    };
  },
});

/**
 * Starts a Paystack checkout (reference FLEX_<patientId>_<flex|max>_<time>) and returns the
 * payment page. Paystack sends the payer back to where they started, with ?reference=.
 */
export const startFlexCheckout = action({
  args: {
    plan: planValidator,
    share: v.optional(shareValidator),
    from: v.optional(v.union(v.literal("dashboard"), v.literal("exercises"))),
    returnOrigin: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ authorizationUrl: string; reference: string }> => {
    const prep: FlexCheckout = await ctx.runQuery(prepareFlexCheckoutRef, { plan: args.plan, share: args.share, from: args.from });
    const back = `${checkoutOrigin(args.returnOrigin)}${prep.returnPath}`;
    const reference = flexReference(prep.patientId, prep.plan, Date.now());
    const data = await paystackRequest("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        reference,
        amount: prep.amountKobo,
        email: prep.email,
        currency: "NGN",
        callback_url: back,
        channels: ["card", "bank", "ussd", "bank_transfer"],
        metadata: {
          source: "rehabify_flex",
          plan: prep.plan,
          cancel_action: back,
          custom_fields: [
            { display_name: "Plan", variable_name: "plan", value: `${planName(prep.plan)} (30 days)` },
            ...(prep.patientNumber ? [{ display_name: "Rehabify ID", variable_name: "rehabify_id", value: prep.patientNumber }] : []),
          ],
        },
      }),
    });
    const authorizationUrl = typeof data?.authorization_url === "string" ? data.authorization_url : "";
    if (!authorizationUrl.startsWith("https://")) throw new ConvexError("We couldn't start the payment. Please try again.");
    return { authorizationUrl, reference };
  },
});

/**
 * Applies Paystack-verified payment evidence. The patient and plan come from the reference (which
 * only our server creates), never from metadata; the amount must cover the price. One period per
 * reference, so the webhook and the browser's own check can race safely. Issues the receipt.
 */
async function completeFlexPayment(ctx: MutationCtx, reference: string, paid: PaidEvidence): Promise<FlexCompletion> {
  const parsed = parseFlexReference(reference);
  if (!parsed) return { success: false, reason: "invalid_reference" };
  const patientId = ctx.db.normalizeId("users", parsed.patientId);
  const patient = patientId ? await ctx.db.get(patientId) : null;
  if (!patientId || !patient) return { success: false, reason: "not_found" };

  const existing = await ctx.db
    .query("patientPlanEntitlements")
    .withIndex("by_reference", (q) => q.eq("reference", reference))
    .first();
  if (existing) return { success: true, alreadyCompleted: true, status: existing.status, plan: existing.plan };

  const now = Date.now();
  const priceKobo = planPriceKobo(parsed.plan);
  const flag = (action: string) =>
    ctx.db.insert("systemLogs", {
      type: "payment",
      action,
      timestamp: now,
      userId: String(patientId),
      targetEntityType: "payment_reference",
      targetEntityId: reference,
      details: { plan: parsed.plan, amountKobo: paid.amountKobo, currency: paid.currency, priceKobo },
    });
  if (paid.currency !== "NGN") {
    await flag("flex_payment_currency_mismatch");
    return { success: false, reason: "currency_mismatch" };
  }
  if (!Number.isFinite(paid.amountKobo) || paid.amountKobo < priceKobo) {
    await flag("flex_payment_short");
    return { success: false, reason: "amount_mismatch" };
  }

  const period = await newPeriod(ctx, patientId, parsed.plan, now);
  const forPhysio = period.status === "active" ? null : await patientFlexContext(ctx, patientId);
  const entitlementId = await ctx.db.insert("patientPlanEntitlements", {
    patientId,
    plan: parsed.plan,
    status: period.status,
    source: "purchase",
    amountKobo: paid.amountKobo,
    listPriceKobo: priceKobo,
    reference,
    programId: period.status === "active" ? period.programId : (forPhysio?.programId ?? undefined),
    physiotherapistId: period.status === "active" ? period.physiotherapistId : (forPhysio?.physiotherapistId ?? undefined),
    purchasedAt: now,
    activatedAt: period.status === "active" ? period.activatedAt : undefined,
    expiresAt: period.status === "active" ? period.expiresAt : undefined,
  });

  const name = planName(parsed.plan);
  await issueReceipt(ctx, {
    kind: "payment",
    payerUserId: patientId,
    email: patient.email,
    name: displayName(patient, ""),
    relatedType: "flex",
    relatedId: entitlementId,
    relationship: "independent",
    description: `${name} for 30 days`,
    lines: [{ label: `${name}, 30 days`, amountKobo: paid.amountKobo }],
    reference,
    dedupeKey: reference,
    paidAt: now,
  });

  const startsLater = period.status === "active" && period.activatedAt > now;
  await insertNotification(ctx, {
    userId: patientId,
    type: "patient_plan",
    priority: "medium",
    status: "pending",
    payload: {
      title: period.status === "pending_activation" ? `${name} is paid for` : startsLater ? `${name} renewed` : `${name} is on`,
      body:
        period.status === "pending_activation"
          ? "Your 30 days start when your physiotherapist's programme is ready."
          : startsLater
            ? `Your next 30 days start on ${lagosDay(period.activatedAt)}, when your current plan ends.`
            : "Open your exercises to watch the demonstrations and log how you get on.",
      data: { actionUrl: "/dashboard/patient/exercises" },
    },
    createdAt: now,
  });
  await ctx.db.insert("systemLogs", {
    type: "payment",
    action: "flex_purchased",
    timestamp: now,
    userId: String(patientId),
    targetEntityType: "patient_plan",
    targetEntityId: String(entitlementId),
    details: { reference, plan: parsed.plan, amountKobo: paid.amountKobo, channel: paid.channel, status: period.status },
  });
  return { success: true, alreadyCompleted: false, status: period.status, plan: parsed.plan };
}

export const completeVerifiedFlexPayment = internalMutation({
  args: { reference: v.string(), amountKobo: v.number(), currency: v.string(), channel: v.optional(v.string()) },
  handler: (ctx, args): Promise<FlexCompletion> =>
    completeFlexPayment(ctx, args.reference, { amountKobo: args.amountKobo, currency: args.currency, channel: args.channel }),
});

export const flexPurchaseByReference = internalQuery({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("patientPlanEntitlements")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .first();
    return row ? { status: row.status, plan: row.plan } : null;
  },
});

async function fetchPaystackTransaction(reference: string) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new ConvexError("Payments are not configured yet. Please contact Rehabify support.");
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const data: any = await response.json().catch(() => null);
  if (!response.ok || !data?.status || !data.data) return null;
  return data.data as { status: string; amount: number; currency: string; reference: string; channel?: string };
}

export type FlexVerifyResult =
  | { status: "paid"; plan: PaidPlan; activation: Doc<"patientPlanEntitlements">["status"] }
  | { status: "pending" | "abandoned" | "failed" | "not_found" | "invalid" }
  | { status: "needs_review"; reason: string };

/**
 * Called when Paystack sends the payer back (?reference=). Re-verifies the reference with
 * Paystack's API before granting anything, as Learn does. Safe to call repeatedly and without
 * signing in: only a genuinely paid reference has any effect.
 */
export const verifyFlexPayment = action({
  args: { reference: v.string() },
  handler: async (ctx, args): Promise<FlexVerifyResult> => {
    const reference = args.reference.trim();
    if (!parseFlexReference(reference)) return { status: "invalid" };
    const tx = await fetchPaystackTransaction(reference);
    if (!tx || tx.reference !== reference) {
      // Paystack may be briefly unreachable; the webhook may already have completed it
      const known = await ctx.runQuery(flexPurchaseByReferenceRef, { reference });
      return known ? { status: "paid", plan: known.plan, activation: known.status } : { status: "not_found" };
    }
    if (tx.status === "success") {
      const result = await ctx.runMutation(completeVerifiedFlexPaymentRef, {
        reference,
        amountKobo: Number(tx.amount) || 0,
        currency: String(tx.currency || ""),
        channel: typeof tx.channel === "string" ? tx.channel : undefined,
      });
      if (!result.success) return { status: "needs_review", reason: result.reason };
      return { status: "paid", plan: result.plan, activation: result.status };
    }
    if (tx.status === "failed" || tx.status === "reversed") return { status: "failed" };
    if (tx.status === "abandoned") return { status: "abandoned" };
    return { status: "pending" };
  },
});

/**
 * Paystack charge webhook for FLEX_ references (app/api/webhooks/paystack). The HMAC-SHA512
 * signature is verified here, inside Convex, before anything else, so this public entry point
 * cannot fake a payment.
 */
export const recordFlexPaystackWebhook = mutation({
  args: { rawBody: v.string(), signature: v.string() },
  handler: async (ctx, args) => {
    if (!(await verifyPaystackSignature(args.rawBody, args.signature))) {
      throw new Error("Invalid Paystack webhook signature");
    }
    let payload: any;
    try {
      payload = JSON.parse(args.rawBody);
    } catch {
      throw new Error("Invalid webhook payload");
    }
    const data = payload?.data ?? {};
    const reference = typeof data.reference === "string" ? data.reference : "";
    if (!reference.startsWith("FLEX_")) return { handled: false };
    if (payload.event !== "charge.success") return { handled: true, ignored: String(payload.event) };
    if (data.status !== undefined && data.status !== "success") {
      return { handled: true, success: false, reason: `charge_${data.status}` };
    }
    const result = await completeFlexPayment(ctx, reference, {
      amountKobo: Number(data.amount) || 0,
      currency: typeof data.currency === "string" ? data.currency : "",
      channel: typeof data.channel === "string" ? data.channel : undefined,
    });
    return { handled: true, ...result };
  },
});

/**
 * The patient asks for their money back under Payment Policy 4.8: the programme wasn't ready
 * within 7 days of payment, or they cancel within 48 hours of activation without substantial
 * use. The period is cancelled now (Basic stays) and an admin approves the refund.
 */
export const requestFlexRefund = mutation({
  args: { entitlementId: v.id("patientPlanEntitlements") },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    const row = await ctx.db.get(args.entitlementId);
    if (!user || !row || row.patientId !== user._id) throw new ConvexError("We couldn't find that plan.");
    const now = Date.now();
    const rule = await refundRule(ctx, row, now);
    if (!rule || !row.reference) {
      throw new ConvexError(
        "This plan can't be refunded now. Payment Policy 4.8: a full refund if your programme isn't ready within 7 days of paying, or if you cancel within 48 hours of it starting, before you've used it much."
      );
    }
    const refundRequestId = await createRefundRequest(ctx, {
      relatedType: "flex",
      relatedId: row._id,
      reference: row.reference,
      amountKobo: row.amountKobo,
      reason: rule.reason,
      reasonText: rule.reasonText,
      requestedBy: "patient",
      payerUserId: user._id,
    });
    await ctx.db.patch(row._id, { status: "cancelled", cancelledAt: now, refundRequestId });
    return { requested: true, amountKobo: row.amountKobo };
  },
});

/**
 * For an independent physio's patient workspace: whether this patient has Flex or Flex Max.
 * Null for clinic teams, Rehabify Care patients and before launch (nothing to show). Physios
 * earn no commission on Flex.
 */
export const patientPlanForCareTeam = query({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    const team = await careTeamOrNull(ctx, args.patientId);
    if (!team || team.kind !== "physio") return null;
    const live = await planSettings(ctx);
    if (!anyPlanLive(live)) return null;
    if (!(await isIndependentPair(ctx, args.patientId, team.user._id))) return null;
    const current = await currentEntitlement(ctx, args.patientId);
    const waiting = (await patientEntitlements(ctx, args.patientId, 20)).some((row) => row.status === "pending_activation");
    return {
      plan: current?.plan ?? null,
      name: current ? planName(current.plan) : "Basic",
      expiresAt: current?.expiresAt ?? null,
      waiting,
    };
  },
});

/**
 * Hourly: ends finished periods (demonstrations and tracking stop, Basic stays), emails a renew
 * link about 3 days before a period ends (no automatic renewal), and starts waiting periods
 * whose programme is now ready.
 */
export const sweepPatientPlans = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const ended = await ctx.db
      .query("patientPlanEntitlements")
      .withIndex("by_status_expires", (q) => q.eq("status", "active").lte("expiresAt", now))
      .take(200);
    for (const row of ended) await ctx.db.patch(row._id, { status: "expired" });

    const ending = await ctx.db
      .query("patientPlanEntitlements")
      .withIndex("by_status_expires", (q) => q.eq("status", "active").gt("expiresAt", now).lte("expiresAt", now + REMINDER_BEFORE_MS))
      .take(200);
    let reminded = 0;
    for (const row of ending) {
      if (row.reminderSentAt || row.expiresAt === undefined) continue;
      await ctx.db.patch(row._id, { reminderSentAt: now });
      // Nothing to say when another period follows on (a renewal already bought)
      const others = await patientEntitlements(ctx, row.patientId, 20);
      const followOn = others.some(
        (other) =>
          other._id !== row._id &&
          (other.status === "pending_activation" || (other.status === "active" && (other.expiresAt ?? 0) > row.expiresAt!))
      );
      if (followOn) continue;
      const patient = await ctx.db.get(row.patientId);
      if (!patient) continue;
      const name = planName(row.plan);
      const ends = lagosDay(row.expiresAt);
      await insertNotification(ctx, {
        userId: patient._id,
        type: "patient_plan",
        priority: "medium",
        status: "pending",
        payload: {
          title: `Your ${name} ends on ${ends}`,
          body: "It doesn't renew by itself. Renew or switch from your dashboard, or let it end: your exercises stay free.",
          data: { actionUrl: "/dashboard/patient#your-plan" },
        },
        createdAt: now,
      });
      const to = receiptEmail(patient.email);
      if (to) {
        await ctx.scheduler.runAfter(0, sendCareEmail, {
          to,
          subject: `Your ${name} ends on ${ends}`,
          greetingName: patient.firstName,
          heading: `Your ${name} ends soon`,
          paragraphs: [
            `Your ${name} ends on ${ends}. It doesn't renew by itself.`,
            "To keep your exercise demonstrations and progress tracking, renew it or switch plans from your dashboard. If you'd rather stop, there's nothing to do: your exercises and your physio's instructions stay free on Basic.",
          ],
          buttonLabel: "Renew or switch",
          buttonUrl: appLink("/dashboard/patient#your-plan"),
          footnote: PLAN_FOOTNOTE,
        });
      }
      reminded++;
    }

    const waiting = await ctx.db
      .query("patientPlanEntitlements")
      .withIndex("by_status_expires", (q) => q.eq("status", "pending_activation"))
      .take(200);
    let started = 0;
    for (const patientId of new Set(waiting.map((row) => row.patientId))) {
      started += await activatePendingPlans(ctx, patientId, now);
    }
    return { expired: ended.length, reminded, started };
  },
});

// ─── Admin: Patient plans page ────────────────────────────────────────────────

/** The launch switches, this month's numbers and the latest periods (patients by Rehabify ID). */
export const adminPatientPlans = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    const now = Date.now();
    const live = await planSettings(ctx);
    const running = (
      await ctx.db
        .query("patientPlanEntitlements")
        .withIndex("by_status_expires", (q) => q.eq("status", "active").gt("expiresAt", now))
        .take(5000)
    ).filter((row) => (row.activatedAt ?? 0) <= now);
    const waiting = await ctx.db
      .query("patientPlanEntitlements")
      .withIndex("by_status_expires", (q) => q.eq("status", "pending_activation"))
      .take(5000);
    const thisMonth = await ctx.db
      .query("patientPlanEntitlements")
      .withIndex("by_purchased", (q) => q.gte("purchasedAt", startOfLagosMonth(now)))
      .take(5000);
    const purchases = thisMonth.filter((row) => row.source === "purchase" && row.status !== "refunded");
    const free = thisMonth.filter((row) => row.amountKobo === 0);
    const latest = await ctx.db.query("patientPlanEntitlements").withIndex("by_purchased").order("desc").take(200);
    const patients = new Map<Id<"users">, string | null>();
    for (const row of latest) {
      if (!patients.has(row.patientId)) patients.set(row.patientId, (await ctx.db.get(row.patientId))?.patientNumber ?? null);
    }
    return {
      live: { flexLive: live.flexLive, flexMaxLive: live.flexMaxLive, updatedAt: live.updatedAt },
      stats: {
        active: running.length,
        activeFlexMax: running.filter((row) => row.plan === "flex_max").length,
        waiting: waiting.length,
        revenueThisMonthKobo: purchases.reduce((sum, row) => sum + row.amountKobo, 0),
        purchasesThisMonth: purchases.length,
        freeThisMonth: free.length,
        // Free activations are a cost to Rehabify at the plan's price
        freeValueThisMonthKobo: free.reduce((sum, row) => sum + (row.listPriceKobo ?? planPriceKobo(row.plan)), 0),
        refundsRequested: latest.filter((row) => row.status === "cancelled" && row.refundRequestId).length,
      },
      rows: latest.map((row) => ({
        ...entitlementView(row, now),
        patientNumber: patients.get(row.patientId) ?? null,
        reference: row.reference ?? null,
        listPriceKobo: row.listPriceKobo ?? null,
        note: row.note ?? null,
      })),
    };
  },
});

/** Switches Flex or Flex Max on or off. Off: nobody is gated and nobody can buy it. */
export const adminSetPlanLaunch = mutation({
  args: { plan: planValidator, live: v.boolean() },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const now = Date.now();
    const row = await ctx.db.query("patientPlanSettings").order("desc").first();
    const next = {
      flexLive: args.plan === "flex" ? args.live : (row?.flexLive ?? false),
      flexMaxLive: args.plan === "flex_max" ? args.live : (row?.flexMaxLive ?? false),
      updatedBy: admin._id,
      updatedAt: now,
    };
    if (row) await ctx.db.patch(row._id, next);
    else await ctx.db.insert("patientPlanSettings", next);
    await ctx.db.insert("systemLogs", {
      type: "admin",
      action: args.live ? "patient_plan_launched" : "patient_plan_paused",
      timestamp: now,
      userId: String(admin._id),
      actorUserId: String(admin._id),
      targetEntityType: "patient_plan",
      targetEntityId: args.plan,
      details: next,
    });
    return next;
  },
});

/** Admin: find a patient by Rehabify ID (RH-P-…) or email, to grant a free activation. */
export const adminFindPatientForPlan = query({
  args: { search: v.string() },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const search = args.search.trim();
    if (search.length < 3) return [];
    const byNumber = /^rh-p-\d+$/i.test(search)
      ? await ctx.db
          .query("users")
          .withIndex("by_patient_number", (q) => q.eq("patientNumber", search.toUpperCase()))
          .take(5)
      : [];
    const byEmail = search.includes("@")
      ? await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", search.toLowerCase()))
          .take(5)
      : [];
    const now = Date.now();
    const found = [...byNumber, ...byEmail].filter((user) => user.role === "patient");
    return Promise.all(
      found.slice(0, 5).map(async (user) => {
        const current = await currentEntitlement(ctx, user._id, now);
        return {
          _id: user._id,
          patientNumber: user.patientNumber ?? null,
          name: displayName(user, "Patient"),
          current: current ? { name: planName(current.plan), expiresAt: current.expiresAt ?? null } : null,
        };
      })
    );
  },
});

/**
 * Admin: a free Flex or Flex Max activation (a welcome gift or a goodwill gesture). Recorded with
 * amount 0 and the plan's price, which is Rehabify's cost. Starts like a paid one.
 */
export const adminGrantPlan = mutation({
  args: {
    patientId: v.id("users"),
    plan: planValidator,
    source: v.union(v.literal("admin"), v.literal("welcome")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.role !== "patient") throw new ConvexError("That patient's account couldn't be found.");
    const now = Date.now();
    const period = await newPeriod(ctx, patient._id, args.plan, now);
    const entitlementId = await ctx.db.insert("patientPlanEntitlements", {
      patientId: patient._id,
      plan: args.plan,
      status: period.status,
      source: args.source,
      amountKobo: 0,
      listPriceKobo: planPriceKobo(args.plan),
      programId: period.status === "active" ? period.programId : undefined,
      physiotherapistId: period.status === "active" ? period.physiotherapistId : undefined,
      purchasedAt: now,
      activatedAt: period.status === "active" ? period.activatedAt : undefined,
      expiresAt: period.status === "active" ? period.expiresAt : undefined,
      grantedBy: admin._id,
      note: clean(args.note, 300),
    });
    const name = planName(args.plan);
    await insertNotification(ctx, {
      userId: patient._id,
      type: "patient_plan",
      priority: "medium",
      status: "pending",
      payload: {
        title: `${name} is on us`,
        body:
          period.status === "active"
            ? `Rehabify has given you 30 days of ${name}, free. Open your exercises to get started.`
            : `Rehabify has given you 30 days of ${name}, free. They start when your physiotherapist's programme is ready.`,
        data: { actionUrl: "/dashboard/patient/exercises" },
      },
      createdAt: now,
    });
    await ctx.db.insert("systemLogs", {
      type: "admin",
      action: "patient_plan_granted",
      timestamp: now,
      userId: String(patient._id),
      actorUserId: String(admin._id),
      targetEntityType: "patient_plan",
      targetEntityId: String(entitlementId),
      details: { plan: args.plan, source: args.source, costKobo: planPriceKobo(args.plan), status: period.status },
    });
    return { entitlementId, status: period.status, costLabel: naira(planPriceKobo(args.plan)) };
  },
});
