/**
 * Outcome questionnaires (LEFS, SPADI, KOOS-12, HOOS-12, PSFS, NPRS): a physio sends one or more to
 * a patient, usually to fill in before their next visit; the patient fills them in from their
 * dashboard; the server scores them (lib/questionnaires/scoring.ts) and tells the physio. A physio
 * can also type in a paper form at the visit. Licensed instruments are not here: physios enter
 * those totals as measures in their clinical note.
 *
 * Access
 * - Physios read the questionnaires they sent, plus their clinic colleagues' for a clinic patient
 *   (the same rule as clinical notes, helpers/noteAccess.ts). Clinic members with Patients access
 *   read their clinic's. Sending, reminding, cancelling and entering need active care.
 * - Patients only see and fill in their own.
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { insertNotification } from "./helpers/pushNotify";
import { publicAppUrl } from "./helpers/appUrl";
import { lagosDateTime, lagosShortDate } from "./helpers/lagosTime";
import { currentUser, findRelationship, requireActiveRelationship, requirePhysio } from "./helpers/careAccess";
import { clinicNoteReader, physioNoteReader, type NoteReader } from "./helpers/noteAccess";
import { measureNumber, seriesKey, type ClinicalMeasure } from "./helpers/clinicalMeasures";
import { psfsActivitiesValidator, questionnaireAnswersValidator } from "./schema/questionnaires";
import { instrumentDef, isAvailable } from "../lib/questionnaires/instruments";
import { AnswerError, cleanAnswers, cleanDraftAnswers, cleanPsfs, compareScores, scoreResponse, scoreText } from "../lib/questionnaires/scoring";
import type { InstrumentDef, PsfsActivity } from "../lib/questionnaires/types";

type Ctx = QueryCtx | MutationCtx;
type Row = Doc<"patientQuestionnaires">;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A request the patient never filled in drops off their list this long after it was due... */
const EXPIRE_AFTER_DUE = 14 * DAY;
/** ...or this long after it was sent, when it had no due date. */
const EXPIRE_UNDATED = 30 * DAY;
const MAX_PER_SEND = 4;
const MAX_MESSAGE = 500;
const MAX_ROWS = 300;
const REMIND_GAP = 20 * HOUR;
const UPCOMING = new Set(["scheduled", "confirmed"]);

// Scheduled from send(); an untyped reference, as the generated api is at TypeScript's depth limit.
const sendReminderRef = makeFunctionReference<"mutation", { ids: Id<"patientQuestionnaires">[] }>("questionnaires:sendReminder");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fullName(user: Doc<"users"> | null | undefined, fallback = "Your physio") {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ") || fallback;
}

function defOf(key: string): InstrumentDef {
  const def = instrumentDef(key);
  if (!def) throw new ConvexError("That questionnaire isn't available.");
  return def;
}

/** Turns answer-checking errors into messages the app shows. */
function checked<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof AnswerError) throw new ConvexError(error.message);
    throw error;
  }
}

function isExpired(row: Pick<Row, "status" | "dueAt" | "sentAt">, now: number) {
  if (row.status !== "pending") return false;
  return row.dueAt ? now > row.dueAt + EXPIRE_AFTER_DUE : now > row.sentAt + EXPIRE_UNDATED;
}

function canRead(reader: NoteReader, row: Row) {
  if (row.physiotherapistId === reader.user._id) return true;
  if (!reader.clinicId) return false;
  return row.clinicId === reader.clinicId || (!row.clinicId && reader.staffIds.has(row.physiotherapistId));
}

/** The signed-in physio or clinic member as a reader of this patient's questionnaires. */
async function readerFor(ctx: Ctx, patientId: Id<"users">) {
  return (await physioNoteReader(ctx, patientId)) ?? (await clinicNoteReader(ctx, patientId));
}

async function rowsFor(ctx: Ctx, patientId: Id<"users">) {
  return await ctx.db
    .query("patientQuestionnaires")
    .withIndex("by_patient_and_status", (q) => q.eq("patientId", patientId))
    .take(MAX_ROWS);
}

async function activeEpisodeId(ctx: Ctx, physioId: Id<"users">, patientId: Id<"users">) {
  const episodes = await ctx.db
    .query("careEpisodes")
    .withIndex("by_patient_and_physiotherapist", (q) => q.eq("patientId", patientId).eq("physiotherapistId", physioId))
    .collect();
  return episodes.find((e) => e.status === "active") ?? null;
}

async function nextVisit(ctx: Ctx, physioId: Id<"users">, patientId: Id<"users">) {
  const now = Date.now();
  const upcoming = await ctx.db
    .query("appointments")
    .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", patientId).gt("startTime", now))
    .take(50);
  return upcoming.find((a) => a.physiotherapistId === physioId && !a.isRecordOnly && UPCOMING.has(a.status)) ?? null;
}

function visitWords(dueAt: number | undefined) {
  return dueAt ? lagosDateTime(dueAt) : null;
}

async function notifyAndEmailPatient(
  ctx: MutationCtx,
  patientId: Id<"users">,
  content: { type: string; title: string; body: string; path: string; subject: string; heading: string; paragraphs: string[]; button: string }
) {
  await insertNotification(ctx, {
    userId: patientId,
    type: content.type,
    priority: "medium",
    status: "pending",
    payload: { title: content.title, body: content.body, data: { actionUrl: content.path } },
    createdAt: Date.now(),
  });
  const patient = await ctx.db.get(patientId);
  if (!patient?.email) return;
  await ctx.scheduler.runAfter(0, internal.actions.emails.sendPatientCareEmail.sendPatientCareEmail, {
    to: patient.email,
    subject: content.subject,
    greetingName: patient.firstName,
    heading: content.heading,
    paragraphs: content.paragraphs,
    buttonLabel: content.button,
    buttonUrl: `${publicAppUrl()}${content.path}`,
  });
}

/** A request without the answers: for lists. */
function summary(row: Row, now: number, names: Map<Id<"users">, string>) {
  const def = instrumentDef(row.instrument);
  return {
    _id: row._id,
    instrument: row.instrument,
    short: def?.short ?? row.instrument.toUpperCase(),
    status: row.status,
    expired: isExpired(row, now),
    sentAt: row.sentAt,
    dueAt: row.dueAt ?? null,
    appointmentId: row.appointmentId ?? null,
    message: row.message ?? null,
    remindedAt: row.remindedAt ?? null,
    hasDraft: row.status === "pending" && !!row.draftSavedAt,
    completedAt: row.completedAt ?? null,
    completedBy: row.completedBy ?? null,
    total: row.scores?.total ?? null,
    subscales: row.scores?.subscales ?? [],
    missing: row.scores?.missing ?? 0,
    psfsActivities: row.psfs?.map((a) => a.activity) ?? [],
    reviewedAt: row.reviewedAt ?? null,
    physiotherapistId: row.physiotherapistId,
    physioName: names.get(row.physiotherapistId) ?? "Physio",
  };
}

async function nameMap(ctx: Ctx, ids: Iterable<Id<"users">>) {
  const names = new Map<Id<"users">, string>();
  for (const id of new Set(ids)) names.set(id, fullName(await ctx.db.get(id), "Physio"));
  return names;
}

/** The newest completed questionnaire of this kind before `before` (for "since last time"). */
async function previousCompleted(ctx: Ctx, patientId: Id<"users">, instrument: string, before: number, skip?: Id<"patientQuestionnaires">) {
  const rows = await ctx.db
    .query("patientQuestionnaires")
    .withIndex("by_patient_and_instrument", (q) => q.eq("patientId", patientId).eq("instrument", instrument))
    .take(MAX_ROWS);
  return (
    rows
      .filter((r) => r.status === "completed" && r._id !== skip && (r.completedAt ?? 0) < before)
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0] ?? null
  );
}

/** Stores a completed questionnaire's answers and scores. */
function completion(def: InstrumentDef, input: { answers?: (number | null)[]; psfs?: PsfsActivity[] }, complete: boolean, keepPsfs: string[]) {
  return checked(() => {
    if (def.kind === "psfs") {
      const psfs = cleanPsfs(input.psfs ?? [], true, complete ? keepPsfs : []);
      return { psfs, answers: undefined, scores: scoreResponse(def, { psfs }) };
    }
    const answers = cleanAnswers(def, input.answers ?? [], complete);
    return { answers, psfs: undefined, scores: scoreResponse(def, { answers }) };
  });
}

function changeWords(def: InstrumentDef, previous: Row | null, total: number | null) {
  if (!previous || total === null) return "";
  const change = compareScores(def, previous.scores?.total, total);
  if (!change) return "";
  const date = lagosShortDate(previous.completedAt ?? previous.sentAt);
  return change.tone === "same" ? ` (same as on ${date})` : ` (${change.text} since ${date}${change.meaningful ? ", a real change" : ""})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Physio
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The patient's questionnaires for their workspace: everything sent or entered (that the viewer
 * may see), whether they can send more, the visit to time them for, and the condition for
 * suggestions. Null when the viewer has no access.
 */
export const forPatient = query({
  args: { patientId: v.id("users") },
  handler: async (ctx, { patientId }) => {
    const reader = await readerFor(ctx, patientId);
    if (!reader) return null;
    const now = Date.now();
    const rows = (await rowsFor(ctx, patientId)).filter((r) => canRead(reader, r));
    const names = await nameMap(ctx, rows.map((r) => r.physiotherapistId));

    let canSend = false;
    let condition: string | null = null;
    let visit: { appointmentId: Id<"appointments">; startTime: number } | null = null;
    if (reader.user.role === "physiotherapist") {
      const relationship = await findRelationship(ctx, reader.user._id, patientId);
      canSend = relationship?.status === "active";
      condition = (await activeEpisodeId(ctx, reader.user._id, patientId))?.condition ?? null;
      const next = canSend ? await nextVisit(ctx, reader.user._id, patientId) : null;
      visit = next ? { appointmentId: next._id, startTime: next.startTime } : null;
    }

    return {
      viewerId: reader.user._id,
      canSend,
      condition,
      nextVisit: visit,
      items: rows
        .filter((r) => r.status !== "cancelled")
        .map((r) => summary(r, now, names))
        .sort((a, b) => (b.completedAt ?? b.sentAt) - (a.completedAt ?? a.sentAt)),
    };
  },
});

/** One completed questionnaire with every answer, for the result drawer. */
export const getResult = query({
  args: { id: v.id("patientQuestionnaires") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row) return null;
    const reader = await readerFor(ctx, row.patientId);
    if (!reader || !canRead(reader, row)) return null;
    const previous =
      row.status === "completed" ? await previousCompleted(ctx, row.patientId, row.instrument, row.completedAt ?? row.sentAt, row._id) : null;
    const enteredBy = row.enteredBy ? await ctx.db.get(row.enteredBy) : null;
    return {
      ...summary(row, Date.now(), await nameMap(ctx, [row.physiotherapistId])),
      answers: row.answers ?? [],
      psfs: row.psfs ?? [],
      enteredByName: enteredBy ? fullName(enteredBy, "Physio") : null,
      canMarkReviewed: row.status === "completed" && !row.reviewedAt && row.physiotherapistId === reader.user._id,
      previous: previous
        ? { completedAt: previous.completedAt ?? previous.sentAt, total: previous.scores?.total ?? null, subscales: previous.scores?.subscales ?? [], psfs: previous.psfs ?? [] }
        : null,
    };
  },
});

type SeriesPoint = {
  date: number;
  value: number;
  questionnaireId: Id<"patientQuestionnaires">;
  completedBy: "patient" | "physio" | null;
  /** The same reading as a clinical-note measure, for catalogue measures; null otherwise */
  measure: ClinicalMeasure | null;
};

type QuestionnaireSeries = {
  /** seriesKey() from helpers/clinicalMeasures.ts for catalogue measures; "questionnaire|<key>[|<part>]" otherwise */
  seriesKey: string;
  instrument: string;
  title: string;
  better: "higher" | "lower";
  range: { min: number; max: number };
  /** Same figure as the catalogue's changeThreshold where both exist */
  mcid: number | null;
  /** True when clinical notes can record the same thing, so the two can share one chart */
  inCatalogue: boolean;
  points: SeriesPoint[];
};

/**
 * What one completed questionnaire adds to the progress charts. LEFS, SPADI and PSFS become the
 * same measures a physio enters in a note (outcome "lefs"/"spadi", psfs). NPRS gives "right now"
 * and "worst in 24 h" as note pain measures (no body area, so they only meet note readings that
 * have none), plus its average on its own. KOOS-12/HOOS-12 aren't in the note catalogue.
 */
function seriesPartsOf(row: Row, def: InstrumentDef) {
  const id = `q-${row._id}`;
  const total = row.scores?.total ?? null;
  const parts: { seriesKey: string; title: string; value: number; measure: ClinicalMeasure | null; range: { min: number; max: number } }[] = [];
  const catalogue = (measure: ClinicalMeasure, title: string, range = def.range) => {
    const key = seriesKey(measure);
    const value = measureNumber(measure);
    if (key !== null && value !== null) parts.push({ seriesKey: key, title, value, measure, range });
  };
  switch (def.key) {
    case "lefs":
    case "spadi":
      if (total !== null) catalogue({ id, kind: "outcome", key: def.key, value: total }, def.short);
      break;
    case "psfs": {
      const items = (row.psfs ?? []).filter((a): a is { activity: string; score: number } => a.score !== null);
      if (items.length > 0) catalogue({ id, kind: "psfs", key: "psfs", items }, def.short);
      break;
    }
    case "nprs": {
      const now = row.scores?.subscales.find((s) => s.key === "now")?.value;
      const worst = row.scores?.subscales.find((s) => s.key === "worst")?.value;
      if (now !== null && now !== undefined) catalogue({ id: `${id}-now`, kind: "pain", key: "nprs", context: "now", value: now }, "Pain right now (NPRS)");
      if (worst !== null && worst !== undefined) {
        catalogue({ id: `${id}-worst`, kind: "pain", key: "nprs", context: "worst_24h", value: worst }, "Worst pain in 24 h (NPRS)");
      }
      if (total !== null) parts.push({ seriesKey: "questionnaire|nprs", title: "NPRS average (now, best, worst)", value: total, measure: null, range: def.range });
      break;
    }
    default:
      if (total !== null) parts.push({ seriesKey: `questionnaire|${def.key}`, title: `${def.short} ${def.totalLabel.toLowerCase()}`, value: total, measure: null, range: def.range });
  }
  return parts;
}

/**
 * Completed questionnaires as chart series, keyed so the progress chart can merge them with the
 * same measures from clinical notes (seriesKey). Points oldest first. Null without access.
 */
export const seriesForPatient = query({
  args: { patientId: v.id("users") },
  handler: async (ctx, { patientId }): Promise<QuestionnaireSeries[] | null> => {
    const reader = await readerFor(ctx, patientId);
    if (!reader) return null;
    const rows = (await rowsFor(ctx, patientId))
      .filter((r) => r.status === "completed" && canRead(reader, r))
      .sort((a, b) => (a.completedAt ?? a.sentAt) - (b.completedAt ?? b.sentAt));
    const byKey = new Map<string, QuestionnaireSeries>();
    for (const row of rows) {
      const def = instrumentDef(row.instrument);
      if (!def) continue;
      for (const part of seriesPartsOf(row, def)) {
        let series = byKey.get(part.seriesKey);
        if (!series) {
          series = {
            seriesKey: part.seriesKey,
            instrument: def.key,
            title: part.title,
            better: def.better,
            range: part.range,
            mcid: def.mcid?.value ?? null,
            inCatalogue: part.measure !== null,
            points: [],
          };
          byKey.set(part.seriesKey, series);
        }
        series.points.push({
          date: row.completedAt ?? row.sentAt,
          value: part.value,
          questionnaireId: row._id,
          completedBy: row.completedBy ?? null,
          measure: part.measure,
        });
      }
    }
    return [...byKey.values()];
  },
});

/** Sends one or more questionnaires to the patient, due before their next visit by default. */
export const send = mutation({
  args: {
    patientId: v.id("users"),
    instruments: v.array(v.string()),
    message: v.optional(v.string()),
    /** The visit to fill them in before; its start time becomes the due time */
    appointmentId: v.optional(v.id("appointments")),
    /** A due time without a visit; ignored when appointmentId is given */
    dueAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const relationship = await requireActiveRelationship(ctx, physio._id, args.patientId);
    const keys = [...new Set(args.instruments)];
    if (keys.length === 0) throw new ConvexError("Choose at least one questionnaire.");
    if (keys.length > MAX_PER_SEND) throw new ConvexError(`Send up to ${MAX_PER_SEND} questionnaires at a time.`);
    for (const key of keys) if (!isAvailable(key)) throw new ConvexError("That questionnaire isn't available.");

    const now = Date.now();
    let dueAt: number | undefined;
    let appointmentId: Id<"appointments"> | undefined;
    if (args.appointmentId) {
      const appointment = await ctx.db.get(args.appointmentId);
      if (
        !appointment ||
        appointment.patientId !== args.patientId ||
        appointment.physiotherapistId !== physio._id ||
        !UPCOMING.has(appointment.status) ||
        appointment.startTime <= now
      ) {
        throw new ConvexError("That visit isn't coming up any more. Choose another due date.");
      }
      appointmentId = appointment._id;
      dueAt = appointment.startTime;
    } else if (args.dueAt !== undefined) {
      if (args.dueAt <= now + 30 * 60 * 1000) throw new ConvexError("Choose a due time at least half an hour from now.");
      if (args.dueAt > now + 90 * DAY) throw new ConvexError("Choose a due date within the next 3 months.");
      dueAt = args.dueAt;
    }
    const message = args.message?.trim().slice(0, MAX_MESSAGE) || undefined;
    const episode = await activeEpisodeId(ctx, physio._id, args.patientId);

    // One waiting request per questionnaire: sending again updates the due date instead
    const existing = (await rowsFor(ctx, args.patientId)).filter(
      (r) => r.physiotherapistId === physio._id && r.status === "pending" && !isExpired(r, now)
    );
    const ids: Id<"patientQuestionnaires">[] = [];
    const updated: string[] = [];
    for (const key of keys) {
      const def = defOf(key);
      const waiting = existing.find((r) => r.instrument === key);
      if (waiting) {
        await ctx.db.patch(waiting._id, { dueAt, appointmentId, message: message ?? waiting.message });
        ids.push(waiting._id);
        updated.push(def.short);
        continue;
      }
      ids.push(
        await ctx.db.insert("patientQuestionnaires", {
          patientId: args.patientId,
          physiotherapistId: physio._id,
          clinicId: relationship.clinicId,
          episodeId: episode?._id,
          appointmentId,
          instrument: key,
          instrumentVersion: def.version,
          status: "pending",
          message,
          dueAt,
          sentAt: now,
        })
      );
    }

    const defs = keys.map(defOf);
    const minutes = defs.reduce((n, d) => n + d.minutes, 0);
    const what = defs.length === 1 ? "a short questionnaire" : `${defs.length} short questionnaires`;
    const when = visitWords(dueAt);
    const path = ids.length === 1 ? `/dashboard/patient/questionnaires/${ids[0]}` : "/dashboard/patient/questionnaires";
    const physioName = fullName(physio);
    await notifyAndEmailPatient(ctx, args.patientId, {
      type: "questionnaire_requested",
      title: `${physioName} sent you ${what}`,
      body: `${when ? (appointmentId ? `Please fill it in before your visit on ${when}. ` : `Please fill it in by ${when}. `) : ""}It takes about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      path,
      subject: `${physioName} sent you ${what}`,
      heading: "A few questions before your next visit",
      paragraphs: [
        `${physioName} would like you to answer ${what} about how your problem affects you. Your answers help them see how you're progressing.`,
        when ? (appointmentId ? `Please fill it in before your visit on ${when}. It takes about ${minutes} minutes.` : `Please fill it in by ${when}. It takes about ${minutes} minutes.`) : `It takes about ${minutes} minutes.`,
        ...(message ? [`${physioName} wrote: "${message}"`] : []),
      ],
      button: "Answer the questions",
    });

    // A reminder the day before it's due, if that's still a while away
    if (dueAt && dueAt - DAY > now + 2 * HOUR) {
      await ctx.scheduler.runAt(dueAt - DAY, sendReminderRef, { ids });
    }
    return { sent: ids.length - updated.length, updated };
  },
});

/** Nudges the patient about a questionnaire they haven't filled in (once a day at most). */
export const remind = mutation({
  args: { id: v.id("patientQuestionnaires") },
  handler: async (ctx, { id }) => {
    const physio = await requirePhysio(ctx);
    const row = await ctx.db.get(id);
    if (!row) throw new ConvexError("Questionnaire not found.");
    await requireActiveRelationship(ctx, physio._id, row.patientId);
    const reader = await physioNoteReader(ctx, row.patientId);
    if (!reader || !canRead(reader, row)) throw new ConvexError("Questionnaire not found.");
    const now = Date.now();
    if (row.status !== "pending" || isExpired(row, now)) throw new ConvexError("This questionnaire isn't waiting for an answer.");
    const last = Math.max(row.remindedAt ?? 0, row.sentAt);
    if (now - last < REMIND_GAP) throw new ConvexError("They were asked in the last day. Try again tomorrow.");
    await remindPatient(ctx, [row], fullName(physio));
    return null;
  },
});

async function remindPatient(ctx: MutationCtx, rows: Row[], physioName: string) {
  if (rows.length === 0) return;
  const now = Date.now();
  for (const row of rows) await ctx.db.patch(row._id, { remindedAt: now });
  const names = rows.map((r) => defOf(r.instrument).short).join(", ");
  const dueAt = rows.map((r) => r.dueAt).find(Boolean);
  const when = visitWords(dueAt);
  const path = rows.length === 1 ? `/dashboard/patient/questionnaires/${rows[0]._id}` : "/dashboard/patient/questionnaires";
  await notifyAndEmailPatient(ctx, rows[0].patientId, {
    type: "questionnaire_reminder",
    title: rows.length === 1 ? "Your questionnaire is waiting" : "Your questionnaires are waiting",
    body: `${physioName} asked you to fill in ${names}${when ? ` before ${when}` : ""}. It only takes a few minutes.`,
    path,
    subject: "A reminder: your questionnaire is waiting",
    heading: "Your questionnaire is waiting",
    paragraphs: [`${physioName} asked you to fill in ${names}${when ? ` before ${when}` : ""}.`, "It only takes a few minutes, and your answers help them plan your next session."],
    button: "Answer the questions",
  });
}

/** The day before it's due: remind the patient about whatever is still waiting. */
export const sendReminder = internalMutation({
  args: { ids: v.array(v.id("patientQuestionnaires")) },
  handler: async (ctx, { ids }) => {
    const now = Date.now();
    const rows: Row[] = [];
    for (const id of ids) {
      const row = await ctx.db.get(id);
      if (row && row.status === "pending" && !isExpired(row, now) && now - Math.max(row.remindedAt ?? 0, row.sentAt) >= REMIND_GAP) {
        rows.push(row);
      }
    }
    if (rows.length === 0) return { reminded: 0 };
    await remindPatient(ctx, rows, fullName(await ctx.db.get(rows[0].physiotherapistId)));
    return { reminded: rows.length };
  },
});

/** Withdraws a questionnaire the patient hasn't filled in. */
export const cancel = mutation({
  args: { id: v.id("patientQuestionnaires") },
  handler: async (ctx, { id }) => {
    const physio = await requirePhysio(ctx);
    const row = await ctx.db.get(id);
    if (!row) throw new ConvexError("Questionnaire not found.");
    await requireActiveRelationship(ctx, physio._id, row.patientId);
    const reader = await physioNoteReader(ctx, row.patientId);
    if (!reader || !canRead(reader, row)) throw new ConvexError("Questionnaire not found.");
    if (row.status !== "pending") throw new ConvexError("Only a questionnaire that hasn't been filled in can be withdrawn.");
    await ctx.db.patch(id, { status: "cancelled", cancelledAt: Date.now(), cancelledBy: physio._id, draftAnswers: undefined, draftPsfs: undefined });
    return null;
  },
});

/** The physio who asked has looked at the result. */
export const markReviewed = mutation({
  args: { id: v.id("patientQuestionnaires") },
  handler: async (ctx, { id }) => {
    const user = await currentUser(ctx);
    const row = await ctx.db.get(id);
    if (!user || !row || row.physiotherapistId !== user._id || row.status !== "completed" || row.reviewedAt) return null;
    await ctx.db.patch(id, { reviewedAt: Date.now() });
    return null;
  },
});

/**
 * The physio types in a questionnaire filled in on paper or with them at the visit. Pass
 * `requestId` to complete one that was sent and is still waiting. Blank items are allowed (the
 * scoring's missing-item rules apply) as long as a total can be worked out.
 */
export const enterResponse = mutation({
  args: {
    patientId: v.id("users"),
    instrument: v.string(),
    answers: v.optional(questionnaireAnswersValidator),
    psfs: v.optional(psfsActivitiesValidator),
    requestId: v.optional(v.id("patientQuestionnaires")),
    /** When it was filled in, if not now (a paper form from an earlier visit) */
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const relationship = await requireActiveRelationship(ctx, physio._id, args.patientId);
    if (!isAvailable(args.instrument)) throw new ConvexError("That questionnaire isn't available.");
    const def = defOf(args.instrument);
    const now = Date.now();
    const completedAt = args.completedAt ?? now;
    if (completedAt > now + 5 * 60 * 1000 || completedAt < now - 365 * DAY) throw new ConvexError("Choose a date in the last year.");

    const done = completion(def, args, false, []);
    if (done.scores.total === null) {
      throw new ConvexError(`Not enough answers to score ${def.short}. ${def.scoringNote}`);
    }

    let request: Row | null = null;
    if (args.requestId) {
      request = await ctx.db.get(args.requestId);
      const reader = await physioNoteReader(ctx, args.patientId);
      if (!request || request.patientId !== args.patientId || request.instrument !== def.key || !reader || !canRead(reader, request)) {
        throw new ConvexError("Questionnaire not found.");
      }
      if (request.status !== "pending") throw new ConvexError("This questionnaire has already been filled in or withdrawn.");
    }

    const fields = {
      answers: done.answers,
      psfs: done.psfs,
      scores: done.scores,
      status: "completed" as const,
      completedAt,
      completedBy: "physio" as const,
      enteredBy: physio._id,
      reviewedAt: now,
      draftAnswers: undefined,
      draftPsfs: undefined,
      draftSavedAt: undefined,
    };
    if (request) {
      await ctx.db.patch(request._id, fields);
      return request._id;
    }
    const episode = await activeEpisodeId(ctx, physio._id, args.patientId);
    return await ctx.db.insert("patientQuestionnaires", {
      patientId: args.patientId,
      physiotherapistId: physio._id,
      clinicId: relationship.clinicId,
      episodeId: episode?._id,
      instrument: def.key,
      instrumentVersion: def.version,
      sentAt: completedAt,
      ...fields,
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Patient
// ─────────────────────────────────────────────────────────────────────────────

async function requirePatient(ctx: Ctx) {
  const user = await currentUser(ctx);
  if (!user || user.role !== "patient") throw new ConvexError("Only patients can do this.");
  return user;
}

async function myRow(ctx: Ctx, id: Id<"patientQuestionnaires">) {
  const patient = await requirePatient(ctx);
  const row = await ctx.db.get(id);
  if (!row || row.patientId !== patient._id || row.status === "cancelled") throw new ConvexError("Questionnaire not found.");
  return { patient, row };
}

/** Activities from the patient's last PSFS, to rate again. */
async function lastPsfsActivities(ctx: Ctx, patientId: Id<"users">, before: number, skip?: Id<"patientQuestionnaires">) {
  const previous = await previousCompleted(ctx, patientId, "psfs", before, skip);
  return previous?.psfs?.map((a) => a.activity) ?? [];
}

function patientView(row: Row, now: number, names: Map<Id<"users">, string>) {
  const def = instrumentDef(row.instrument);
  return {
    _id: row._id,
    instrument: row.instrument,
    short: def?.short ?? row.instrument.toUpperCase(),
    name: def?.name ?? row.instrument,
    intro: def?.patientIntro ?? "",
    minutes: def?.minutes ?? 3,
    status: row.status,
    expired: isExpired(row, now),
    sentAt: row.sentAt,
    dueAt: row.dueAt ?? null,
    forVisit: !!row.appointmentId,
    message: row.message ?? null,
    hasDraft: row.status === "pending" && !!row.draftSavedAt,
    completedAt: row.completedAt ?? null,
    total: row.scores?.total ?? null,
    subscales: row.scores?.subscales ?? [],
    physioName: names.get(row.physiotherapistId) ?? "Your physio",
  };
}

/** Questionnaires waiting for the signed-in patient (for the home screen). */
export const myPending = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user || user.role !== "patient") return [];
    const now = Date.now();
    const rows = (
      await ctx.db
        .query("patientQuestionnaires")
        .withIndex("by_patient_and_status", (q) => q.eq("patientId", user._id).eq("status", "pending"))
        .take(50)
    ).filter((r) => !isExpired(r, now));
    const names = await nameMap(ctx, rows.map((r) => r.physiotherapistId));
    return rows.map((r) => patientView(r, now, names)).sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity));
  },
});

/** Everything the patient has been sent or has filled in, with their scores over time. */
export const myQuestionnaires = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user || user.role !== "patient") return null;
    const now = Date.now();
    const rows = (await rowsFor(ctx, user._id)).filter((r) => r.status !== "cancelled" && !isExpired(r, now));
    const names = await nameMap(ctx, rows.map((r) => r.physiotherapistId));
    const views = rows.map((r) => patientView(r, now, names));
    return {
      pending: views.filter((r) => r.status === "pending").sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity)),
      completed: views.filter((r) => r.status === "completed").sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
    };
  },
});

/** One questionnaire for the patient's form: saved progress, and last time's PSFS activities. */
export const getMine = query({
  args: { id: v.id("patientQuestionnaires") },
  handler: async (ctx, { id }) => {
    const user = await currentUser(ctx);
    if (!user || user.role !== "patient") return null;
    const row = await ctx.db.get(id);
    if (!row || row.patientId !== user._id || row.status === "cancelled") return null;
    const now = Date.now();
    const names = await nameMap(ctx, [row.physiotherapistId]);
    return {
      ...patientView(row, now, names),
      draftAnswers: row.draftAnswers ?? null,
      draftPsfs: row.draftPsfs ?? null,
      answers: row.status === "completed" ? (row.answers ?? null) : null,
      psfs: row.status === "completed" ? (row.psfs ?? null) : null,
      previousPsfs: row.instrument === "psfs" && row.status === "pending" ? await lastPsfsActivities(ctx, user._id, now, row._id) : [],
    };
  },
});

/** Saves the patient's answers so far (between screens), so they can finish later. */
export const saveDraft = mutation({
  args: {
    id: v.id("patientQuestionnaires"),
    answers: v.optional(questionnaireAnswersValidator),
    psfs: v.optional(psfsActivitiesValidator),
  },
  handler: async (ctx, args) => {
    const { row } = await myRow(ctx, args.id);
    if (row.status !== "pending") return null;
    const def = defOf(row.instrument);
    if (def.kind === "psfs") {
      const draftPsfs = checked(() => cleanPsfs(args.psfs ?? [], false));
      await ctx.db.patch(row._id, { draftPsfs, draftSavedAt: Date.now() });
    } else {
      await ctx.db.patch(row._id, { draftAnswers: cleanDraftAnswers(def, args.answers ?? []), draftSavedAt: Date.now() });
    }
    return null;
  },
});

/** The patient sends their answers. Scored here, and the physio is told. */
export const submit = mutation({
  args: {
    id: v.id("patientQuestionnaires"),
    answers: v.optional(questionnaireAnswersValidator),
    psfs: v.optional(psfsActivitiesValidator),
  },
  handler: async (ctx, args) => {
    const { patient, row } = await myRow(ctx, args.id);
    if (row.status === "completed") throw new ConvexError("You've already sent this questionnaire. Thank you!");
    const now = Date.now();
    const def = defOf(row.instrument);
    const keep = def.kind === "psfs" ? await lastPsfsActivities(ctx, patient._id, now, row._id) : [];
    const done = completion(def, args, true, keep);
    await ctx.db.patch(row._id, {
      answers: done.answers,
      psfs: done.psfs,
      scores: done.scores,
      status: "completed",
      completedAt: now,
      completedBy: "patient",
      draftAnswers: undefined,
      draftPsfs: undefined,
      draftSavedAt: undefined,
    });

    const previous = await previousCompleted(ctx, patient._id, row.instrument, now, row._id);
    const total = done.scores.total;
    const change = previous ? compareScores(def, previous.scores?.total, total) : null;
    const patientName = fullName(patient, "Your patient");
    await insertNotification(ctx, {
      userId: row.physiotherapistId,
      type: "questionnaire_completed",
      priority: change?.tone === "worse" && change.meaningful ? "high" : "medium",
      status: "pending",
      payload: {
        title: `${patientName} filled in ${def.short}`,
        body: `${def.totalLabel}: ${scoreText(def, total)}${changeWords(def, previous, total)}.`,
        data: { actionUrl: `/dashboard/physiotherapist/patients/${patient._id}?tab=overview&questionnaire=${row._id}` },
      },
      createdAt: now,
    });
    return { total, change };
  },
});
