/**
 * The AI scribe. A physiotherapist records a session (in person or on a video call) or dictates
 * after it; the words appear live as a transcript; an AI drafts the clinical note from it; the
 * physio reviews, corrects and signs.
 *
 * - The draft lives in scribeSessions until the physio signs it. Only then does it become a
 *   clinical note (sessionLogs, marked aiAssisted), so patients, payouts and reports never see an
 *   unsigned AI draft. Signing goes through the same checks as any note (physioCare.insertClinicalNote).
 * - Audio is never stored. The browser streams the microphone straight to OpenAI with a
 *   short-lived key from createRealtimeToken (our key never leaves the server); when the live
 *   connection fails it sends short WAV pieces through transcribeChunk instead, which are passed on
 *   and dropped. Only the transcript is kept, and only clinicians see it.
 * - Before anything goes to the note-writing AI, the patient's and physio's names, phone numbers
 *   and emails are replaced with placeholders (helpers/scribeDraft.ts redactText).
 * - Recording a patient needs the physio to confirm the patient agreed. Dictation doesn't.
 * - Who can use it: an admin switches it on in Admin › System (off / listed physios / everyone).
 *   On a test deployment SCRIBE_ENABLED=true (with optional SCRIBE_PHYSIO_EMAILS) turns it on
 *   regardless, and SCRIBE_ENABLED=false turns it off everywhere. Needs OPENAI_API_KEY.
 * - Daily limits per physio; recordings discarded or never signed are deleted after 7 days (cron).
 *
 * Try a draft without the app: run `scribe:labDraft` from the Convex dashboard with a made-up
 * transcript. Never use real patient details for testing.
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { findRelationship, physioOrNull, requireActiveRelationship, requirePhysio } from "./helpers/careAccess";
import { canReadNote, physioNoteReader } from "./helpers/noteAccess";
import { measureDetail, measureResult, measureTitle, measureValidator } from "./helpers/clinicalMeasures";
import { lagosShortDate } from "./helpers/lagosTime";
import { callLlmJson, createRealtimeTranscriptionSecret, transcribeAudioChunk } from "./helpers/llm";
import {
  isNotStated,
  parseScribeDraft,
  redactText,
  SCRIBE_SYSTEM_PROMPT,
  scribeDraftValidator,
  scribeNoteTypeValidator,
  scribeUserPrompt,
  transcriptionPrompt,
  type RedactionTarget,
  type ScribeContext,
  type ScribeDraft,
} from "./helpers/scribeDraft";
import { activePlanFor, episodesFor, insertClinicalNote } from "./physioCare";
import { loadPlatformControls } from "./platformSettings";

type Ctx = QueryCtx | MutationCtx;

const DAY = 86_400_000;
/** About two hours of talking; far below Convex's 1 MB document limit */
const MAX_TRANSCRIPT_LENGTH = 100_000;
const MAX_SESSIONS_PER_DAY = 40;
const MAX_DRAFTS_PER_DAY = 80;
/** Eight hours of recording a day per physio */
const MAX_AUDIO_SECONDS_PER_DAY = 8 * 60 * 60;
/** One save reports at most this much new audio (the browser saves every few seconds) */
const MAX_APPEND_SECONDS = 15 * 60;
const MAX_LINES_PER_APPEND = 50;
const MAX_LINE_LENGTH = 4_000;
/** A fallback piece: about two minutes of 16 kHz mono WAV */
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const KEEP_UNSIGNED_MS = 7 * DAY;
const PURGE_BATCH = 200;

const sourceValidator = v.union(v.literal("in_person"), v.literal("video_call"), v.literal("dictation"));
/** Whose audio a live connection carries: the room (one mic), or one side of a video call */
const channelValidator = v.union(v.literal("room"), v.literal("physio"), v.literal("patient"));
const speakerValidator = v.union(v.literal("physio"), v.literal("patient"));
const SPEAKER_LABELS = { physio: "Physio", patient: "Patient" } as const;

// Plain references: the generated api type is at TypeScript's depth limit (TS2589)
type DraftInput = { transcript: string; context: ScribeContext };
type RecordingAccess = { physioId: Id<"users">; source: Doc<"scribeSessions">["source"]; tail: string };
const beginDraftRef = makeFunctionReference<"mutation", { scribeSessionId: Id<"scribeSessions"> }, DraftInput>(
  "scribe:beginDraft"
);
const saveDraftRef = makeFunctionReference<
  "mutation",
  { scribeSessionId: Id<"scribeSessions">; draft: ScribeDraft; model: string },
  null
>("scribe:saveDraft");
const recordingAccessRef = makeFunctionReference<"query", { scribeSessionId: Id<"scribeSessions"> }, RecordingAccess>(
  "scribe:recordingAccess"
);

// ─────────────────────────────────────────────────────────────────────────────
// Who may use it
// ─────────────────────────────────────────────────────────────────────────────

const emailIn = (user: Doc<"users">, list: string[]) =>
  !!user.email && list.includes(user.email.trim().toLowerCase());

/**
 * Whether this physio may use the scribe. SCRIBE_ENABLED on Convex overrides the admin switch
 * ("false" = off for everyone; "true" = on, for SCRIBE_PHYSIO_EMAILS when that is set); without
 * it, the admin's choice in platform controls decides.
 */
export async function scribeAllowedFor(ctx: Ctx, user: Doc<"users">): Promise<boolean> {
  if (!process.env.OPENAI_API_KEY?.trim()) return false;
  const env = (process.env.SCRIBE_ENABLED ?? "").trim().toLowerCase();
  if (env === "false" || env === "off") return false;
  if (env === "true") {
    const list = (process.env.SCRIBE_PHYSIO_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    return list.length === 0 || emailIn(user, list);
  }
  const { controls } = await loadPlatformControls(ctx);
  if (controls.scribeMode === "everyone") return true;
  if (controls.scribeMode === "allowlist") return emailIn(user, controls.scribeAllowedEmails);
  return false;
}

async function requireScribePhysio(ctx: Ctx) {
  const physio = await requirePhysio(ctx);
  if (!(await scribeAllowedFor(ctx, physio))) throw new ConvexError("The AI scribe isn't switched on for your account yet.");
  return physio;
}

async function ownSession(ctx: Ctx, physio: Doc<"users">, id: Id<"scribeSessions">) {
  const session = await ctx.db.get(id);
  if (!session || session.physiotherapistId !== physio._id) {
    throw new ConvexError("That recording isn't yours, or it has been deleted.");
  }
  return session;
}

function assertOpen(session: Doc<"scribeSessions">) {
  if (session.status === "signed") throw new ConvexError("This note is already signed. Edit it from the patient's notes.");
  if (session.status === "discarded") throw new ConvexError("This recording was discarded.");
}

async function redactionTargets(ctx: Ctx, physio: Doc<"users">, patientId: Id<"users">): Promise<RedactionTarget[]> {
  const patient = await ctx.db.get(patientId);
  return [
    { names: [patient?.firstName, patient?.lastName], label: "[patient]" },
    { names: [physio.firstName, physio.lastName], label: "[physio]" },
  ];
}

/** Physio app: whether to show the scribe at all. */
export const getScribeAccess = query({
  args: {},
  handler: async (ctx) => {
    const physio = await physioOrNull(ctx);
    return { enabled: physio ? await scribeAllowedFor(ctx, physio) : false };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Recordings
// ─────────────────────────────────────────────────────────────────────────────

/** Starts a recording or dictation for a patient. Recording a patient needs their agreement. */
export const startScribe = mutation({
  args: {
    patientId: v.id("users"),
    source: sourceValidator,
    /** The physio ticked that the patient agreed to be recorded */
    consentRecorded: v.boolean(),
    appointmentId: v.optional(v.id("appointments")),
  },
  handler: async (ctx, args) => {
    const physio = await requireScribePhysio(ctx);
    const relationship = await requireActiveRelationship(ctx, physio._id, args.patientId);
    if (args.source !== "dictation" && !args.consentRecorded) {
      throw new ConvexError("Tick that the patient agreed to the recording before you start.");
    }
    if (args.appointmentId) {
      const appointment = await ctx.db.get(args.appointmentId);
      if (!appointment || appointment.physiotherapistId !== physio._id || appointment.patientId !== args.patientId) {
        throw new ConvexError("That appointment isn't with this patient.");
      }
    }
    const now = Date.now();
    const today = await ctx.db
      .query("scribeSessions")
      .withIndex("by_physio_and_created", (q) => q.eq("physiotherapistId", physio._id).gte("createdAt", now - DAY))
      .collect();
    if (today.length >= MAX_SESSIONS_PER_DAY) {
      throw new ConvexError(`You've started ${MAX_SESSIONS_PER_DAY} recordings in the last 24 hours, the daily limit. Write this note by hand.`);
    }
    const scribeSessionId = await ctx.db.insert("scribeSessions", {
      physiotherapistId: physio._id,
      patientId: args.patientId,
      clinicId: relationship.clinicId,
      appointmentId: args.appointmentId,
      source: args.source,
      consentRecorded: args.consentRecorded,
      consentAt: args.consentRecorded ? now : undefined,
      status: "recording",
      transcript: "",
      audioSeconds: 0,
      generations: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { scribeSessionId };
  },
});

/** The physio's own recording, with its transcript and draft. */
export const getScribeSession = query({
  args: { scribeSessionId: v.id("scribeSessions") },
  handler: async (ctx, args) => {
    const physio = await physioOrNull(ctx);
    if (!physio) return null;
    const session = await ctx.db.get(args.scribeSessionId);
    return session && session.physiotherapistId === physio._id ? session : null;
  },
});

/** The physio's unsigned recording for this patient from the last 7 days, to carry on with. */
export const getOpenScribe = query({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    const physio = await physioOrNull(ctx);
    if (!physio) return null;
    const since = Date.now() - KEEP_UNSIGNED_MS;
    const rows = await ctx.db
      .query("scribeSessions")
      .withIndex("by_patient_and_physio", (q) => q.eq("patientId", args.patientId).eq("physiotherapistId", physio._id))
      .collect();
    return (
      rows
        .filter((s) => (s.status === "recording" || s.status === "draft") && s.updatedAt >= since)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
    );
  },
});

/** Saves what was said since the last save. Called every few seconds while recording. */
export const appendTranscript = mutation({
  args: {
    scribeSessionId: v.id("scribeSessions"),
    lines: v.array(v.object({ speaker: v.optional(speakerValidator), text: v.string() })),
    /** Seconds of audio these lines came from (for the daily limit) */
    audioSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const session = await ownSession(ctx, physio, args.scribeSessionId);
    assertOpen(session);
    if (args.lines.length > MAX_LINES_PER_APPEND || args.lines.some((l) => l.text.length > MAX_LINE_LENGTH)) {
      throw new ConvexError("That part of the transcript is too long to save in one go.");
    }
    if (!Number.isFinite(args.audioSeconds) || args.audioSeconds < 0 || args.audioSeconds > MAX_APPEND_SECONDS) {
      throw new ConvexError("The recording time sent doesn't look right.");
    }
    const text = args.lines
      .map((l) => ({ speaker: l.speaker, text: l.text.replace(/\s+/g, " ").trim() }))
      .filter((l) => l.text)
      .map((l) => (l.speaker ? `${SPEAKER_LABELS[l.speaker]}: ${l.text}` : l.text))
      .join("\n");
    const transcript = text ? (session.transcript ? `${session.transcript}\n${text}` : text) : session.transcript;
    if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
      throw new ConvexError("The transcript is full (about two hours of talking). Stop here and draft the note.");
    }
    await ctx.db.patch(session._id, {
      transcript,
      audioSeconds: session.audioSeconds + args.audioSeconds,
      // Recording more after a draft: the draft stays until the physio drafts again
      status: "recording",
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** The physio corrects the transcript (or pastes one) before asking for a draft. */
export const updateTranscript = mutation({
  args: { scribeSessionId: v.id("scribeSessions"), transcript: v.string() },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const session = await ownSession(ctx, physio, args.scribeSessionId);
    assertOpen(session);
    if (args.transcript.length > MAX_TRANSCRIPT_LENGTH) {
      throw new ConvexError("The transcript is too long. Split the session into two notes.");
    }
    await ctx.db.patch(session._id, { transcript: args.transcript, updatedAt: Date.now() });
    return null;
  },
});

/** Throws the recording away: transcript and draft are cleared now, the row goes after 7 days. */
export const discardScribe = mutation({
  args: { scribeSessionId: v.id("scribeSessions") },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const session = await ownSession(ctx, physio, args.scribeSessionId);
    if (session.status === "signed") throw new ConvexError("A signed note can't be discarded.");
    if (session.status === "discarded") return null;
    const now = Date.now();
    await ctx.db.patch(session._id, { status: "discarded", transcript: "", draft: undefined, discardedAt: now, updatedAt: now });
    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Speech to text
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks a recording may send audio now: the physio may use the scribe, it's theirs and still
 * open, the patient agreed (unless dictation), and the daily recording time isn't used up.
 * Returns the end of the transcript (names taken out) as context for the speech model.
 */
export const recordingAccess = internalQuery({
  args: { scribeSessionId: v.id("scribeSessions") },
  handler: async (ctx, args): Promise<RecordingAccess> => {
    const physio = await requireScribePhysio(ctx);
    const session = await ownSession(ctx, physio, args.scribeSessionId);
    assertOpen(session);
    if (session.source !== "dictation" && !session.consentRecorded) {
      throw new ConvexError("The patient's agreement to the recording wasn't recorded.");
    }
    const today = await ctx.db
      .query("scribeSessions")
      .withIndex("by_physio_and_created", (q) => q.eq("physiotherapistId", physio._id).gte("createdAt", Date.now() - DAY))
      .collect();
    if (today.reduce((n, s) => n + s.audioSeconds, 0) >= MAX_AUDIO_SECONDS_PER_DAY) {
      throw new ConvexError("You've recorded 8 hours in the last 24 hours, the daily limit. Finish this note by hand.");
    }
    const tail = redactText(session.transcript.slice(-600), await redactionTargets(ctx, physio, session.patientId));
    return { physioId: physio._id, source: session.source, tail };
  },
});

async function safetyId(physioId: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`rehabify-scribe:${physioId}`)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

const language = () => process.env.SCRIBE_LANGUAGE?.trim() || undefined;

/**
 * A short-lived key (10 minutes to connect) for the browser to stream one microphone to OpenAI's
 * live transcription. Call again to reconnect, or for the other side of a video call.
 */
export const createRealtimeToken = action({
  args: { scribeSessionId: v.id("scribeSessions"), channel: channelValidator },
  handler: async (ctx, args): Promise<{ clientSecret: string; expiresAt: number; model: string }> => {
    const access: RecordingAccess = await ctx.runQuery(recordingAccessRef, { scribeSessionId: args.scribeSessionId });
    const noiseReduction =
      args.channel === "patient" ? null : args.channel === "physio" || access.source === "dictation" ? "near_field" : "far_field";
    const secret = await createRealtimeTranscriptionSecret({
      prompt: transcriptionPrompt(access.tail),
      noiseReduction,
      language: language(),
      safetyId: await safetyId(access.physioId),
    });
    return { clientSecret: secret.value, expiresAt: secret.expiresAt, model: secret.model };
  },
});

/** Fallback when the live connection fails: one short WAV piece in, its words out. Audio is not kept. */
export const transcribeChunk = action({
  args: { scribeSessionId: v.id("scribeSessions"), audio: v.bytes(), channel: channelValidator },
  handler: async (ctx, args): Promise<{ text: string }> => {
    if (args.audio.byteLength > MAX_CHUNK_BYTES) throw new ConvexError("That piece of audio is too long to send.");
    // Under a fifth of a second of audio holds no words
    if (args.audio.byteLength < 6_444) return { text: "" };
    const access: RecordingAccess = await ctx.runQuery(recordingAccessRef, { scribeSessionId: args.scribeSessionId });
    const text = await transcribeAudioChunk(args.audio, { prompt: transcriptionPrompt(access.tail), language: language() });
    return { text };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Drafting the note
// ─────────────────────────────────────────────────────────────────────────────

/** Asks the AI for a draft note from the transcript (also used for Regenerate). */
export const generateSoapNote = action({
  args: { scribeSessionId: v.id("scribeSessions") },
  handler: async (ctx, args): Promise<ScribeDraft> => {
    const input: DraftInput = await ctx.runMutation(beginDraftRef, args);
    const reply = await callLlmJson({ system: SCRIBE_SYSTEM_PROMPT, user: scribeUserPrompt(input.transcript, input.context) });
    const draft = parseScribeDraft(reply.text, {
      idPrefix: `ai${Date.now().toString(36)}`,
      firstVisit: input.context.earlierNotes === 0,
    });
    if (!draft) throw new ConvexError("The AI's draft couldn't be read. Try again.");
    await ctx.runMutation(saveDraftRef, { scribeSessionId: args.scribeSessionId, draft, model: `${reply.provider}:${reply.model}` });
    return draft;
  },
});

/**
 * Checks the physio may draft this recording (and counts it towards the daily limit), then
 * gathers what the AI gets: the transcript and what's on record, with names taken out.
 */
export const beginDraft = internalMutation({
  args: { scribeSessionId: v.id("scribeSessions") },
  handler: async (ctx, args): Promise<DraftInput> => {
    const physio = await requireScribePhysio(ctx);
    const session = await ownSession(ctx, physio, args.scribeSessionId);
    assertOpen(session);
    if (!session.transcript.trim()) throw new ConvexError("There's nothing in the transcript yet.");

    const now = Date.now();
    const recent = await ctx.db
      .query("scribeSessions")
      .withIndex("by_physio_and_created", (q) => q.eq("physiotherapistId", physio._id).gte("createdAt", now - DAY))
      .collect();
    if (recent.reduce((n, s) => n + s.generations, 0) >= MAX_DRAFTS_PER_DAY) {
      throw new ConvexError(`You've asked for ${MAX_DRAFTS_PER_DAY} drafts in the last 24 hours, the daily limit. Try again tomorrow.`);
    }
    await ctx.db.patch(session._id, { generations: session.generations + 1, updatedAt: now });

    const targets = await redactionTargets(ctx, physio, session.patientId);
    const redact = (text: string) => redactText(text, targets);

    const relationship = await findRelationship(ctx, physio._id, session.patientId);
    const episodes = await episodesFor(ctx, physio._id, session.patientId, relationship?.clinicId);
    const condition = episodes.find((e) => e.status === "active")?.condition?.trim();
    const plan = await activePlanFor(ctx, physio._id, session.patientId, relationship?.clinicId);
    const goals = (plan?.goals ?? [])
      .filter((g) => !g.achieved && g.description.trim())
      .slice(0, 8)
      .map((g) => redact(g.description.trim()));

    // Earlier notes this physio may read (their own, or their clinic's), newest first
    const reader = await physioNoteReader(ctx, session.patientId);
    const notes = reader
      ? (
          await ctx.db
            .query("sessionLogs")
            .withIndex("by_patient_id_and_date", (q) => q.eq("patientId", session.patientId))
            .order("desc")
            .take(50)
        ).filter((n) => canReadNote(reader, n))
      : [];
    const measured = notes.find((n) => n.measures?.length);
    const earlierMeasures = (measured?.measures ?? []).slice(0, 20).map((m) => {
      const detail = measureDetail(m);
      return `${measureTitle(m)}${detail ? ` (${detail})` : ""}: ${measureResult(m)} (${lagosShortDate(measured!.sessionDate)})`;
    });

    const context: ScribeContext = {
      source: session.source,
      earlierNotes: notes.length,
      ...(condition ? { condition: redact(condition) } : {}),
      ...(goals.length ? { goals } : {}),
      ...(earlierMeasures.length ? { earlierMeasures } : {}),
    };
    return { transcript: redact(session.transcript), context };
  },
});

/** Keeps the AI's draft, unless the physio signed or discarded the recording meanwhile. */
export const saveDraft = internalMutation({
  args: { scribeSessionId: v.id("scribeSessions"), draft: scribeDraftValidator, model: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.scribeSessionId);
    if (!session || session.status === "signed" || session.status === "discarded") return null;
    const now = Date.now();
    await ctx.db.patch(session._id, { status: "draft", draft: args.draft, draftModel: args.model, draftAt: now, updatedAt: now });
    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Signing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The physio signs the note as they've reviewed and edited it. It becomes a normal clinical note
 * (with every usual check), marked AI-assisted, and the recording is closed. Sections still
 * reading "Not stated." are left empty. Signing twice returns the same note.
 */
export const signScribeNote = mutation({
  args: {
    scribeSessionId: v.id("scribeSessions"),
    noteType: scribeNoteTypeValidator,
    subjectiveAssessment: v.optional(v.string()),
    objectiveAssessment: v.optional(v.string()),
    treatmentAdministered: v.optional(v.string()),
    planForNextSession: v.optional(v.string()),
    /** The Assessment section */
    diagnosis: v.optional(v.string()),
    /** The measures the physio kept (suggested ones they accepted, and their own) */
    measures: v.optional(v.array(measureValidator)),
    /** Files or a voice note the physio added to the note themselves */
    voiceNoteStorageId: v.optional(v.id("_storage")),
    attachments: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const session = await ownSession(ctx, physio, args.scribeSessionId);
    if (session.status === "signed" && session.noteId) return { noteId: session.noteId };
    assertOpen(session);
    if (!session.draft) throw new ConvexError("Draft the note from the recording first.");
    const relationship = await requireActiveRelationship(ctx, physio._id, session.patientId);
    const keep = (text?: string) => (isNotStated(text) ? undefined : text);
    const now = Date.now();
    const { noteId } = await insertClinicalNote(
      ctx,
      physio,
      relationship,
      {
        patientId: session.patientId,
        noteType: args.noteType,
        subjectiveAssessment: keep(args.subjectiveAssessment),
        objectiveAssessment: keep(args.objectiveAssessment),
        treatmentAdministered: keep(args.treatmentAdministered),
        planForNextSession: keep(args.planForNextSession),
        diagnosis: keep(args.diagnosis),
        measures: args.measures,
        appointmentId: session.appointmentId,
        voiceNoteStorageId: args.voiceNoteStorageId,
        attachments: args.attachments,
      },
      { aiAssisted: true, scribeSessionId: session._id, signedAt: now }
    );
    await ctx.db.patch(session._id, { status: "signed", noteId, signedAt: now, updatedAt: now });
    return { noteId };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Testing and housekeeping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * For testing from the Convex dashboard: a draft from a made-up transcript, saved nowhere.
 * Use invented details only.
 */
export const labDraft = internalAction({
  args: {
    transcript: v.string(),
    source: v.optional(sourceValidator),
    condition: v.optional(v.string()),
    earlierNotes: v.optional(v.number()),
  },
  handler: async (_ctx, args): Promise<{ model: string; draft: ScribeDraft }> => {
    if (!args.transcript.trim()) throw new ConvexError("Paste a made-up transcript.");
    const context: ScribeContext = {
      source: args.source ?? "in_person",
      earlierNotes: args.earlierNotes ?? 0,
      ...(args.condition ? { condition: args.condition } : {}),
    };
    const reply = await callLlmJson({ system: SCRIBE_SYSTEM_PROMPT, user: scribeUserPrompt(redactText(args.transcript, []), context) });
    const draft = parseScribeDraft(reply.text, { idPrefix: "lab", firstVisit: context.earlierNotes === 0 });
    if (!draft) throw new ConvexError("The AI's reply wasn't a readable draft. Try again.");
    return { model: `${reply.provider}:${reply.model}`, draft };
  },
});

/** Nightly: deletes recordings discarded, or never signed, more than 7 days ago. */
export const purgeScribeSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const before = Date.now() - KEEP_UNSIGNED_MS;
    let deleted = 0;
    for (const status of ["discarded", "recording", "draft"] as const) {
      const rows = await ctx.db
        .query("scribeSessions")
        .withIndex("by_status_and_updated", (q) => q.eq("status", status).lt("updatedAt", before))
        .take(PURGE_BATCH);
      for (const row of rows) await ctx.db.delete(row._id);
      deleted += rows.length;
    }
    return { deleted };
  },
});
