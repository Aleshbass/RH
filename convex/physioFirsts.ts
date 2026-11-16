/**
 * Celebrating with physios (owner, Nov 2026): emails that give them a reason to come back.
 *
 *  - "Your first patient has joined": the first time a patient joins them, through their
 *    WhatsApp invite, their own link, an email invitation or a Joy booking. Sent once per physio
 *    and remembered in featureIntros (FIRST_PATIENT_KEY). Physios whose patients were already
 *    joining before this email existed are marked quietly instead.
 *  - "Your patients did their exercises today": one evening email per physio (7pm Lagos, crons.ts)
 *    naming the patients who logged exercises or pressed "Done for today". Names only: pain scores
 *    and notes stay in the app.
 *
 * Physios who turned email notifications off in Settings get neither.
 */
import { makeFunctionReference } from "convex/server";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { appLink } from "./helpers/appUrl";
import { isPlaceholderUser } from "./helpers/whatsappLink";
import { programCareTeam, startOfLagosDay } from "./exercisePrograms";

const sendEmail = makeFunctionReference<
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

export const FIRST_PATIENT_KEY = "milestone:first_patient_joined";
const FOOTNOTE = "You can turn off email updates in Settings › Notifications.";
const PATIENTS_PATH = "/dashboard/physiotherapist/patients";
const MAX_LISTED = 10;

const validEmail = (value: string | undefined | null): value is string =>
  Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));

/** A physio who wants our emails, with an address to send them to. */
function emailablePhysio(user: Doc<"users"> | null): user is Doc<"users"> & { email: string } {
  return Boolean(
    user &&
      user.role === "physiotherapist" &&
      !user.deletedAt &&
      user.notificationPreferences?.emailNotifications !== false &&
      validEmail(user.email)
  );
}

/** "Ada O." — enough for the physio to know who, without a full name in an inbox. */
function shortName(user: Doc<"users"> | null) {
  const first = (user?.firstName ?? "").trim();
  const last = (user?.lastName ?? "").trim();
  if (!first || first === "Patient") return "One of your patients";
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

export type JoinedHow = "invite" | "link" | "email_invite" | "joy";

const HOW_LINES: Record<JoinedHow, string> = {
  invite: "accepted your invite",
  link: "joined with your link",
  email_invite: "accepted your email invitation",
  joy: "booked with you through Joy",
};

/** Call wherever a patient joins a physio. Does nothing after the first time. */
export async function celebrateFirstPatient(
  ctx: MutationCtx,
  physioId: Id<"users"> | undefined,
  patient: Doc<"users">,
  how: JoinedHow
) {
  if (!physioId) return;
  const seen = await ctx.db
    .query("featureIntros")
    .withIndex("by_user_and_key", (q) => q.eq("userId", physioId).eq("key", FIRST_PATIENT_KEY))
    .first();
  if (seen) return;
  const physio = await ctx.db.get(physioId);
  if (!physio || physio.role !== "physiotherapist") return;
  await ctx.db.insert("featureIntros", { userId: physioId, key: FIRST_PATIENT_KEY, seenAt: Date.now() });

  // Someone else in their care already has their own login: this isn't their first
  const links = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physioId))
    .take(200);
  for (const link of links) {
    if (link.patientId === patient._id) continue;
    const other = await ctx.db.get(link.patientId);
    if (other && !other.deletedAt && !isPlaceholderUser(other)) return;
  }

  if (!emailablePhysio(physio)) return;
  const name = shortName(patient);
  await ctx.scheduler.runAfter(0, sendEmail, {
    to: physio.email,
    subject: "Your first patient has joined 🎉",
    greetingName: physio.firstName?.trim() || undefined,
    heading: "Your first patient has joined",
    paragraphs: [
      `${name} ${HOW_LINES[how]}. They're the first of many, and we're glad they're with you.`,
      "They can now see the exercises, appointments and messages you send them. A home programme in the first day or two helps them start strong.",
    ],
    buttonLabel: "Open their record",
    buttonUrl: appLink(`${PATIENTS_PATH}/${patient._id}`),
    footnote: FOOTNOTE,
  });
}

type DayWin = { patient: Doc<"users">; title: string; done: number; total: number; sentDone: boolean };

/**
 * The evening email: for each physio, the patients who did exercises today. Reads today's logs
 * and ticks newest first (both tables are small per day), groups them by programme and sends
 * one email per physio.
 */
export const emailTodaysExerciseWins = internalMutation({
  args: {},
  handler: async (ctx) => {
    const since = startOfLagosDay();
    const byProgram = new Map<Id<"exercisePrograms">, { items: Set<number>; sentDone: boolean }>();
    const entry = (programId: Id<"exercisePrograms">) => {
      let e = byProgram.get(programId);
      if (!e) byProgram.set(programId, (e = { items: new Set(), sentDone: false }));
      return e;
    };

    let read = 0;
    for await (const log of ctx.db.query("exerciseProgramLogs").order("desc")) {
      if (log._creationTime < since || ++read > 4000) break;
      entry(log.programId).items.add(log.itemIndex);
    }
    read = 0;
    for await (const tick of ctx.db.query("exerciseProgramTicks").order("desc")) {
      if (tick._creationTime < since || ++read > 4000) break;
      const e = entry(tick.programId);
      if (tick.kind === "finish") e.sentDone = true;
      else if (tick.kind === "item" && tick.itemIndex !== undefined && tick.itemIndex >= 0) e.items.add(tick.itemIndex);
    }

    const perPhysio = new Map<Id<"users">, DayWin[]>();
    for (const [programId, e] of byProgram) {
      const program = await ctx.db.get(programId);
      if (!program || program.status !== "active") continue;
      const patient = await ctx.db.get(program.patientId);
      if (!patient || patient.deletedAt) continue;
      const total = program.items.length;
      const done = [...e.items].filter((i) => i >= 0 && i < total).length;
      if (done === 0 && !e.sentDone) continue;
      for (const physioId of await programCareTeam(ctx, program)) {
        const wins = perPhysio.get(physioId) ?? [];
        // One line per patient: keep the programme they did the most of
        const same = wins.findIndex((w) => w.patient._id === patient._id);
        const win = { patient, title: program.title, done, total, sentDone: e.sentDone };
        if (same === -1) wins.push(win);
        else if (done > wins[same].done) wins[same] = win;
        perPhysio.set(physioId, wins);
      }
    }

    let sent = 0;
    for (const [physioId, wins] of perPhysio) {
      const physio = await ctx.db.get(physioId);
      if (!emailablePhysio(physio)) continue;
      wins.sort((a, b) => Number(b.done === b.total) - Number(a.done === a.total) || b.done - a.done);
      const line = (w: DayWin) =>
        w.done >= w.total
          ? `${shortName(w.patient)} did everything in "${w.title}" (${w.total} of ${w.total}).`
          : `${shortName(w.patient)} did ${w.done} of ${w.total} in "${w.title}".`;
      const single = wins.length === 1 ? wins[0] : null;
      const allDone = single && single.done >= single.total;
      const subject = single
        ? allDone
          ? `${shortName(single.patient)} finished today's exercises 🎉`
          : `${shortName(single.patient)} did their exercises today`
        : `${wins.length} of your patients did their exercises today`;
      await ctx.scheduler.runAfter(0, sendEmail, {
        to: physio.email,
        subject,
        greetingName: physio.firstName?.trim() || undefined,
        heading: single ? "Your patient did their exercises today" : "Your patients did their exercises today",
        paragraphs: [
          ...wins.slice(0, MAX_LISTED).map(line),
          ...(wins.length > MAX_LISTED ? [`And ${wins.length - MAX_LISTED} more.`] : []),
          "A quick word from you keeps them going. See how it went, including any pain they logged, and send them a message.",
        ],
        buttonLabel: single ? "See how it went" : "See your patients",
        buttonUrl: appLink(single ? `${PATIENTS_PATH}/${single.patient._id}?tab=checkins` : PATIENTS_PATH),
        footnote: FOOTNOTE,
      });
      sent++;
    }
    return { programmes: byProgram.size, emails: sent };
  },
});
