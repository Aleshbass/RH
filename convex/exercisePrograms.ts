/**
 * Home exercise programmes: one programme holds library exercises (with a 3D demonstration), the
 * care team's own exercises, and/or education, each with its dose and instructions, plus a note
 * and a voice note. A physio or clinic creates it, adds to it later or edits it. The patient sees
 * it in their dashboard (and can open it from a PIN-protected WhatsApp link, see
 * exerciseShareLinks.ts), follows the demonstrations and logs each exercise with a pain score.
 * The care team sees adherence.
 */
import { ConvexError, v, type Infer } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { libraryItem } from "./exerciseLibrary";
import { EXERCISE_CATALOG } from "./exerciseLibraryCatalog";
import { publicAppUrl } from "./helpers/appUrl";
import { currentUser } from "./helpers/careAccess";
import {
  careTeamOrNull,
  displayName,
  itemClipId,
  requireCareTeam,
  resolveShareSession,
  type CareTeamAccess,
} from "./helpers/exerciseAccess";

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

/** A programme with its items, ready to show (used by the care team, the patient and links). */
export async function programView(ctx: Ctx, program: Doc<"exercisePrograms">) {
  const exercises = await Promise.all(program.items.map((item) => (item.exerciseId ? ctx.db.get(item.exerciseId) : null)));
  const resources = await Promise.all(
    program.items.map((item) => (item.kind === "education" && item.resourceKey ? resourceByKey(ctx, item.resourceKey) : null))
  );
  const sender = await ctx.db.get(program.createdBy);
  const clinic = program.clinicId ? await ctx.db.get(program.clinicId) : null;
  return {
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
        exercise: exercise ? libraryItem(exercise) : null,
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
  await ctx.db.insert("notifications", {
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

const REFERRAL_PROGRESS = ["booked", "attended", "treatment_active", "completed"] as const;

/**
 * A Rehabify referral to this clinic moves to "treatment active" once the patient is given a home
 * programme, as it did when clinics gave programmes through clinicTools.assignHomeProgramme (this
 * mirrors advanceClinicReferral there). It only ever moves forward.
 */
async function markReferralTreatmentActive(ctx: MutationCtx, clinicId: Id<"clinics">, patientId: Id<"users">, actorId: Id<"users">) {
  const referrals = await ctx.db
    .query("inboundReferrals")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .collect();
  const target = REFERRAL_PROGRESS.indexOf("treatment_active");
  const now = Date.now();
  for (const referral of referrals) {
    if (referral.assignedClinicId !== clinicId) continue;
    const current = REFERRAL_PROGRESS.indexOf(referral.status as (typeof REFERRAL_PROGRESS)[number]);
    if (current === -1 || current >= target) continue;
    await ctx.db.patch(referral._id, { status: "treatment_active", updatedAt: now });
    await ctx.db.insert("referralEvents", {
      referralId: referral._id,
      eventName: "clinic.treatment_active",
      occurredAt: now,
      actorType: "clinic_owner",
      actorId: String(actorId),
      metadata: { clinicId, previousStatus: referral.status, newStatus: "treatment_active", via: "home_programme" },
    });
  }
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
      if (team.clinicId) await markReferralTreatmentActive(ctx, team.clinicId, args.patientId, team.user._id);
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
    await ctx.db.insert("notifications", {
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
      const { code: _c, session: _s, ...log } = args;
      await insertLog(ctx, res.program, log, "link", res.link._id);
    }),
});
