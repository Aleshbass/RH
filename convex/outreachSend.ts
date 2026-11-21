/**
 * Clinic outreach sending (owner, 17 Nov 2026): Admin › Clinic outreach › Send emails.
 *
 *  - Emails go from the team's Zoho inbox (OUTREACH_SMTP_* / OUTREACH_IMAP_* on Convex), one at a
 *    time, weekdays 9:00–17:00 Lagos, spread across the day. A new inbox starts at a few a day and
 *    grows each weekday up to a cap (dailyStart, rampPerDay, dailyMax).
 *  - A sequence is a first email plus follow-ups; a follow-up with no subject replies in the same
 *    thread. An email address is only ever enrolled once.
 *  - The inbox is read every 15 minutes (actions/outreachMail.ts): a reply stops that clinic's
 *    sequence and marks it Replied; "stop"/"unsubscribe" marks Do not contact; a bounce marks the
 *    clinic Bounced. Out-of-office answers change nothing. Other mail in the inbox isn't stored.
 *  - Sending is off until an admin switches it on, and a Zoho login failure switches it off again.
 *  - Employer outreach (employerOutreach.ts) uses this same schedule, inbox and daily cap: its
 *    sequences have audience "employer" and its enrollments can be for a named person at the
 *    company (contactId). The clinic screens below only show clinic sequences and clinics.
 *  - Both pages count the same way (outreachNumbers below); outreachSent.ts lists every email
 *    actually sent, with what came back since, so the team can tell ours from other inbox mail.
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin } from "./helpers/partnerAccess";
import { EMPLOYER_TAGS, OUTREACH_TAGS, composeText, dailyQuota, fillTags, lagosClock, unknownTags } from "./helpers/outreachMail";
import {
  autoAdvanceStage,
  emailDoNotContact,
  isClinicLead,
  isClinicSequence,
  logActivity,
  patchPerson,
  stopEnrollment,
} from "./helpers/outreachShared";
import { STAGE_LABEL, firstNameOf, stageStopsEmails } from "../lib/employerOutreach";

const sendOneRef = makeFunctionReference<"action", { enrollmentId: Id<"outreachEnrollments"> }, null>("actions/outreachMail:sendOne");

export const SENDER_DEFAULTS = {
  fromName: "Rehabify",
  signature: "The Rehabify team\nphysioaroundme.com",
  optOut: 'If this isn\'t relevant, reply "stop" and we won\'t email you again.',
  dailyStart: 10,
  rampPerDay: 5,
  dailyMax: 40,
};
const WINDOW_START_MIN = 9 * 60;
const WINDOW_END_MIN = 17 * 60;
const IN_FLIGHT_MS = 15 * 60 * 1000;
const RETRY_AFTER_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Leads the sender leaves alone */
const CLOSED_LEAD = new Set<Doc<"outreachLeads">["status"]>(["do_not_contact", "not_interested", "on_rehabify", "replied", "bounced"]);
/** For a named person at a company: the company's own address bouncing doesn't stop them */
const CLOSED_FOR_PERSON = new Set<Doc<"outreachLeads">["status"]>(["do_not_contact", "not_interested", "on_rehabify", "replied"]);
/** Leads that can be added to a sequence */
const ENROLLABLE = ["ready", "exported"] as const;

type Settings = Doc<"outreachSettings">;
type Ctx = QueryCtx | MutationCtx;

async function settingsRow(ctx: Ctx) {
  return await ctx.db.query("outreachSettings").first();
}

function withDefaults(row: Settings | null) {
  return {
    sendingOn: row?.sendingOn ?? false,
    fromName: row?.fromName ?? SENDER_DEFAULTS.fromName,
    signature: row?.signature ?? SENDER_DEFAULTS.signature,
    optOut: row?.optOut ?? SENDER_DEFAULTS.optOut,
    dailyStart: row?.dailyStart ?? SENDER_DEFAULTS.dailyStart,
    rampPerDay: row?.rampPerDay ?? SENDER_DEFAULTS.rampPerDay,
    dailyMax: row?.dailyMax ?? SENDER_DEFAULTS.dailyMax,
    rampStartedOn: row?.rampStartedOn,
  };
}

async function patchSettings(ctx: MutationCtx, patch: Partial<Settings>) {
  const row = await settingsRow(ctx);
  if (row) await ctx.db.patch(row._id, { ...patch, updatedAt: Date.now() });
  else await ctx.db.insert("outreachSettings", { sendingOn: false, ...patch, updatedAt: Date.now() });
}

function windowOpen(now: number) {
  const clock = lagosClock(now);
  return clock.weekday !== 0 && clock.weekday !== 6 && clock.minutes >= WINDOW_START_MIN && clock.minutes < WINDOW_END_MIN;
}

async function sentOn(ctx: Ctx, day: string) {
  return (await ctx.db.query("outreachMessages").withIndex("by_day", (q) => q.eq("day", day)).take(1000)).length;
}

/** A lead or a person marked do not contact with this address (helpers/outreachShared.ts). */
async function emailBlocked(ctx: Ctx, email: string) {
  return await emailDoNotContact(ctx, email);
}

// ─── The schedule ────────────────────────────────────────────────────────────

/**
 * Every 5 minutes: while sending is on and the window is open, sends the next due email if today's
 * count is behind an even spread of the day's allowance. One email in flight at a time, started
 * after a random pause of up to 2 minutes so the times don't look machine-made.
 */
export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const row = await settingsRow(ctx);
    if (!row?.sendingOn) return null;
    const now = Date.now();
    if (!windowOpen(now)) return null;
    if (row.inFlightAt && now - row.inFlightAt < IN_FLIGHT_MS) return null;
    const s = withDefaults(row);
    const clock = lagosClock(now);
    const quota = dailyQuota(s, clock.day);
    const spread = Math.ceil((quota * Math.min(1, (clock.minutes - WINDOW_START_MIN + 5) / (WINDOW_END_MIN - WINDOW_START_MIN))));
    if ((await sentOn(ctx, clock.day)) >= Math.min(quota, spread)) return null;

    const due = await ctx.db
      .query("outreachEnrollments")
      .withIndex("by_status_next", (q) => q.eq("status", "active").gte("nextSendAt", 0).lte("nextSendAt", now))
      .take(40);
    const sequences = new Map<string, Doc<"outreachSequences"> | null>();
    for (const e of due) {
      if (!sequences.has(e.sequenceId)) sequences.set(e.sequenceId, await ctx.db.get(e.sequenceId));
      const seq = sequences.get(e.sequenceId);
      if (!seq || seq.status !== "active") continue;
      const lead = await ctx.db.get(e.leadId);
      const closed = e.contactId ? CLOSED_FOR_PERSON : CLOSED_LEAD;
      if (!lead || closed.has(lead.status)) {
        const what = lead?.kind === "employer" ? "company" : "clinic";
        await stopEnrollment(ctx, e, "stopped", lead ? `The ${what} was marked ${lead.status.replace(/_/g, " ")}` : "The clinic was removed");
        continue;
      }
      // Employers: once they answer, or the team has taken the deal on (or lost it), no more emails
      if (lead.kind === "employer" && lead.stage && stageStopsEmails(lead.stage)) {
        await stopEnrollment(ctx, e, "stopped", `The company is at ${STAGE_LABEL[lead.stage]}`);
        continue;
      }
      if (e.contactId) {
        const person = await ctx.db.get(e.contactId);
        if (!person || person.email !== e.email) {
          await stopEnrollment(ctx, e, "stopped", "The person's email was changed or removed");
          continue;
        }
      } else if (lead.email !== e.email) {
        await stopEnrollment(ctx, e, "stopped", "The clinic's email was changed");
        continue;
      }
      if (await emailBlocked(ctx, e.email)) {
        await stopEnrollment(ctx, e, "unsubscribed", "Do not contact");
        continue;
      }
      await ctx.db.patch(e._id, { claimedAt: now });
      await ctx.db.patch(row._id, { inFlightAt: now });
      await ctx.scheduler.runAfter(Math.floor(Math.random() * 120_000), sendOneRef, { enrollmentId: e._id });
      return null;
    }
    return null;
  },
});

/** The email to send for an enrollment's next step, or why not. */
export const loadForSend = internalQuery({
  args: { enrollmentId: v.id("outreachEnrollments") },
  handler: async (ctx, args) => {
    const e = await ctx.db.get(args.enrollmentId);
    if (!e || e.status !== "active") return { ok: false as const, reason: "no longer active" };
    const seq = await ctx.db.get(e.sequenceId);
    const lead = await ctx.db.get(e.leadId);
    if (!seq || !lead) return { ok: false as const, reason: "missing" };
    const step = seq.steps[e.nextStep];
    if (!step) return { ok: false as const, reason: "no step" };
    const s = withDefaults(await settingsRow(ctx));
    // Employers: {company}, and {first_name} when the email is to a named person ("there" if not)
    const person = e.contactId ? await ctx.db.get(e.contactId) : null;
    const values = { clinicName: lead.name, city: lead.city, company: lead.name, firstName: firstNameOf(person?.name) };
    const firstSubject = e.firstSubject ?? fillTags(seq.steps[0]?.subject ?? "", values);
    const threaded = e.nextStep > 0 && !step.subject.trim() && Boolean(e.firstMessageId);
    const previous = threaded ? await ctx.db.query("outreachMessages").withIndex("by_enrollment", (q) => q.eq("enrollmentId", e._id)).take(10) : [];
    return {
      ok: true as const,
      to: e.email,
      step: e.nextStep,
      fromName: s.fromName,
      subject: step.subject.trim() ? fillTags(step.subject, values) : `Re: ${firstSubject.replace(/^re:\s*/i, "")}`,
      text: composeText(fillTags(step.body, values), s.signature, s.optOut),
      inReplyTo: threaded ? previous[previous.length - 1]?.messageId ?? e.firstMessageId : undefined,
      references: threaded ? previous.map((m) => m.messageId) : [],
    };
  },
});

/** What happened to one send. A Zoho login problem switches sending off and keeps the email for later. */
export const recordSend = internalMutation({
  args: {
    enrollmentId: v.id("outreachEnrollments"),
    outcome: v.union(v.literal("sent"), v.literal("bounced"), v.literal("retry"), v.literal("config_error"), v.literal("skipped")),
    messageId: v.optional(v.string()),
    subject: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const error = args.error?.slice(0, 300);
    await patchSettings(ctx, {
      inFlightAt: undefined,
      ...(args.outcome === "config_error" ? { sendingOn: false, lastSendError: error, lastSendErrorAt: now } : {}),
      ...(args.outcome === "retry" ? { lastSendError: error, lastSendErrorAt: now } : {}),
    });
    const e = await ctx.db.get(args.enrollmentId);
    if (!e) return null;
    if (args.outcome === "skipped" || args.outcome === "config_error") {
      await ctx.db.patch(e._id, { claimedAt: undefined, updatedAt: now });
      return null;
    }
    if (args.outcome === "retry") {
      const attempts = (e.attempts ?? 0) + 1;
      if (attempts >= MAX_ATTEMPTS) await stopEnrollment(ctx, e, "stopped", `Couldn't send: ${error ?? "unknown error"}`);
      else await ctx.db.patch(e._id, { attempts, claimedAt: undefined, nextSendAt: now + RETRY_AFTER_MS, updatedAt: now });
      return null;
    }
    const lead = await ctx.db.get(e.leadId);
    if (args.outcome === "bounced") {
      await stopEnrollment(ctx, e, "bounced", error);
      // A named person's address bouncing says nothing about the company's own address
      if (e.contactId) await patchPerson(ctx, e.contactId, { bouncedAt: now, updatedAt: now });
      else if (lead && !CLOSED_LEAD.has(lead.status)) await ctx.db.patch(lead._id, { status: "bounced", note: lead.note ?? error, updatedAt: now });
      return null;
    }
    // Sent
    const seq = await ctx.db.get(e.sequenceId);
    await ctx.db.insert("outreachMessages", {
      enrollmentId: e._id,
      sequenceId: e.sequenceId,
      leadId: e.leadId,
      step: e.nextStep,
      email: e.email,
      subject: args.subject ?? "",
      messageId: args.messageId ?? "",
      day: lagosClock(now).day,
      sentAt: now,
    });
    const nextStep = e.nextStep + 1;
    const next = seq?.steps[nextStep];
    await ctx.db.patch(e._id, {
      nextStep,
      claimedAt: undefined,
      attempts: 0,
      lastSentAt: now,
      ...(e.nextStep === 0 ? { firstMessageId: args.messageId, firstSubject: args.subject } : {}),
      ...(next ? { nextSendAt: now + Math.max(1, next.waitDays) * DAY_MS } : { status: "finished" as const, nextSendAt: undefined }),
      updatedAt: now,
    });
    if (lead && (lead.status === "ready" || lead.status === "exported" || lead.status === "new")) {
      await ctx.db.patch(lead._id, { status: "contacted", contactedAt: now, updatedAt: now });
    }
    if (lead?.kind === "employer") {
      await logActivity(ctx, lead._id, "email_sent", `Email ${e.nextStep + 1} sent to ${e.email}${args.subject ? `: ${args.subject}` : ""}`);
      await autoAdvanceStage(ctx, lead._id, "contacted", "first email sent");
    }
    return null;
  },
});

// ─── Reading the inbox ───────────────────────────────────────────────────────

/** Where the last inbox check stopped, and whether there is anything to check for. */
export const inboxState = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await settingsRow(ctx);
    const first = await ctx.db.query("outreachMessages").order("asc").first();
    return {
      uidValidity: row?.imapUidValidity ?? null,
      lastUid: row?.imapLastUid ?? null,
      firstSentAt: first?.sentAt ?? null,
    };
  },
});

const incomingValidator = v.object({
  uid: v.number(),
  kind: v.union(v.literal("reply"), v.literal("bounce"), v.literal("auto_reply")),
  fromEmail: v.optional(v.string()),
  subject: v.string(),
  messageIds: v.array(v.string()),
  bouncedEmails: v.array(v.string()),
  intent: v.optional(v.union(v.literal("stop"), v.literal("not_interested"))),
  snippet: v.string(),
});

async function enrollmentFor(ctx: MutationCtx, messageIds: string[], emails: string[]) {
  for (const id of messageIds) {
    const msg = await ctx.db.query("outreachMessages").withIndex("by_message_id", (q) => q.eq("messageId", id)).first();
    if (msg) return await ctx.db.get(msg.enrollmentId);
  }
  for (const email of emails) {
    const rows = await ctx.db.query("outreachEnrollments").withIndex("by_email", (q) => q.eq("email", email)).take(5);
    const sent = rows.find((r) => r.lastSentAt);
    if (sent) return sent;
  }
  return null;
}

async function markLead(ctx: MutationCtx, leadId: Id<"outreachLeads">, status: Doc<"outreachLeads">["status"]) {
  const lead = await ctx.db.get(leadId);
  if (!lead || lead.status === "on_rehabify" || lead.status === "do_not_contact") return;
  const now = Date.now();
  await ctx.db.patch(lead._id, { status, updatedAt: now });
  if (status === "do_not_contact" && lead.email) {
    for (const other of await ctx.db.query("outreachLeads").withIndex("by_email", (q) => q.eq("email", lead.email)).take(20)) {
      if (other._id !== lead._id) await ctx.db.patch(other._id, { status: "do_not_contact", updatedAt: now });
    }
  }
}

export const processInbox = internalMutation({
  args: { uidValidity: v.number(), lastUid: v.number(), items: v.array(incomingValidator) },
  handler: async (ctx, args) => {
    const now = Date.now();
    let matched = 0;
    for (const item of args.items) {
      const emails = item.kind === "bounce" ? item.bouncedEmails : item.fromEmail ? [item.fromEmail] : [];
      const e = await enrollmentFor(ctx, item.messageIds, emails);
      if (!e) continue; // Not about our outreach: left alone and not stored
      matched++;
      const employer = (await ctx.db.get(e.leadId))?.kind === "employer";
      await ctx.db.insert("outreachInbox", {
        kind: item.kind,
        intent: item.intent,
        enrollmentId: e._id,
        leadId: e.leadId,
        fromEmail: item.fromEmail,
        subject: item.subject.slice(0, 200),
        snippet: item.snippet.slice(0, 300),
        uid: item.uid,
        receivedAt: now,
      });
      if (item.kind === "auto_reply") continue;
      if (item.kind === "bounce") {
        if (e.status === "active" || e.status === "finished") await stopEnrollment(ctx, e, "bounced", "The email bounced");
        // A named person's address: only that person is marked, not the company
        if (e.contactId) await patchPerson(ctx, e.contactId, { bouncedAt: now, updatedAt: now });
        else await markLead(ctx, e.leadId, "bounced");
        continue;
      }
      if (item.intent === "stop") {
        await stopEnrollment(ctx, e, "unsubscribed", "Asked not to be emailed");
        // A person who says stop is marked do not contact (it follows their address); the company's
        // own address saying stop marks the company, as for clinics
        if (e.contactId) await patchPerson(ctx, e.contactId, { doNotContact: true, updatedAt: now });
        else await markLead(ctx, e.leadId, "do_not_contact");
        if (employer) await logActivity(ctx, e.leadId, "reply", `${e.email} asked not to be emailed`);
      } else {
        if (e.status === "active" || e.status === "finished") {
          await ctx.db.patch(e._id, { status: "replied", repliedAt: now, nextSendAt: undefined, claimedAt: undefined, updatedAt: now });
        }
        await markLead(ctx, e.leadId, item.intent === "not_interested" ? "not_interested" : "replied");
        if (employer) {
          const said = item.intent === "not_interested" ? "Not interested" : "Replied";
          await logActivity(ctx, e.leadId, "reply", `${said} (${item.fromEmail ?? e.email}): ${item.snippet.slice(0, 200)}`);
          await autoAdvanceStage(ctx, e.leadId, "replied", "reply to our email");
        }
      }
    }
    await patchSettings(ctx, { imapUidValidity: args.uidValidity, imapLastUid: args.lastUid, lastInboxCheckAt: now, lastInboxError: undefined });
    return { matched };
  },
});

export const recordInboxError = internalMutation({
  args: { error: v.string() },
  handler: async (ctx, args) => {
    await patchSettings(ctx, { lastInboxCheckAt: Date.now(), lastInboxError: args.error.slice(0, 300) });
    return null;
  },
});

// ─── Admin ───────────────────────────────────────────────────────────────────

/**
 * The shared sender as Employer outreach shows it: on or off (switched on the Clinic outreach
 * page) and today's emails against the one daily cap both lists share.
 */
export async function senderSummary(ctx: QueryCtx) {
  const now = Date.now();
  const row = await settingsRow(ctx);
  const s = withDefaults(row);
  const clock = lagosClock(now);
  return {
    configured: Boolean(process.env.OUTREACH_SMTP_USER && process.env.OUTREACH_SMTP_PASS),
    address: process.env.OUTREACH_SMTP_USER ?? null,
    sendingOn: s.sendingOn,
    fromName: s.fromName,
    sentToday: await sentOn(ctx, clock.day),
    quota: dailyQuota(s, clock.day),
    windowOpen: windowOpen(now),
    weekday: clock.weekday !== 0 && clock.weekday !== 6,
    day: clock.day,
    lastInboxCheckAt: row?.lastInboxCheckAt ?? null,
    lastSendError: row?.lastSendError ?? null,
    // For the "i" next to today's count: how the limit grows and the next sending day's limit
    dailyStart: s.dailyStart,
    rampPerDay: s.rampPerDay,
    dailyMax: s.dailyMax,
    next: nextSendingDay(s, clock.day),
  };
}

/** The next weekday after `day` ("YYYY-MM-DD") and its daily limit: "Monday's limit: 20". */
function nextSendingDay(s: ReturnType<typeof withDefaults>, day: string) {
  let t = Date.parse(`${day}T00:00:00Z`);
  for (let i = 0; i < 7; i++) {
    t += DAY_MS;
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) break;
  }
  const next = new Date(t).toISOString().slice(0, 10);
  // Before sending is first switched on there's no start day yet: the first day gets dailyStart
  return { day: next, quota: dailyQuota(s, next) };
}

/**
 * The headline numbers on both outreach pages (owner, 21 Nov 2026: "we need to know what is going
 * on"). Each counts addresses (a clinic, or a company inbox or named person), once each, so they
 * add up: emailed = contacted + bounced back, and replies and automatic replies are separate.
 * `inbox` may hold rows from the other list too; only these enrollments' rows are counted.
 */
export function outreachNumbers(enrollments: Doc<"outreachEnrollments">[], inbox: Doc<"outreachInbox">[]) {
  const ids = new Set<string>(enrollments.map((e) => e._id));
  const replied = new Set<string>();
  const askedToStop = new Set<string>();
  const notInterested = new Set<string>();
  const autoReplies = new Set<string>();
  for (const i of inbox) {
    if (!ids.has(i.enrollmentId)) continue;
    if (i.kind === "auto_reply") autoReplies.add(i.enrollmentId);
    else if (i.kind === "reply") {
      // A real person answering, even to say no or stop
      replied.add(i.enrollmentId);
      if (i.intent === "stop") askedToStop.add(i.enrollmentId);
      else if (i.intent === "not_interested") notInterested.add(i.enrollmentId);
    }
  }
  let sent = 0;
  let emailed = 0;
  let bouncedBack = 0;
  let refused = 0;
  let waiting = 0;
  let waitingFollowUp = 0;
  for (const e of enrollments) {
    sent += e.nextStep;
    if (e.nextStep > 0) emailed++;
    if (e.status === "bounced") {
      // Came back after sending, or the address was refused before anything went out
      if (e.nextStep > 0) bouncedBack++;
      else refused++;
    }
    if (e.status === "active") {
      if (e.nextStep === 0) waiting++;
      else waitingFollowUp++;
    }
  }
  return {
    sent,
    emailed,
    contacted: emailed - bouncedBack,
    replies: replied.size,
    askedToStop: askedToStop.size,
    notInterested: notInterested.size,
    autoReplies: autoReplies.size,
    bounced: bouncedBack + refused,
    bouncedBack,
    refused,
    waiting,
    waitingFollowUp,
  };
}

const stepValidator = v.object({ subject: v.string(), body: v.string(), waitDays: v.number() });

/** Everything the Send emails tab shows. */
export const adminSenderOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "outreachSend:adminSenderOverview");
    const now = Date.now();
    const row = await settingsRow(ctx);
    const s = withDefaults(row);
    const clock = lagosClock(now);
    // Clinics only: employer sequences, their enrollments and replies are on Employer outreach
    const allSequences = await ctx.db.query("outreachSequences").order("desc").take(200);
    const employerSequences = new Set(allSequences.filter((q) => !isClinicSequence(q)).map((q) => q._id));
    const allEnrollments = await ctx.db.query("outreachEnrollments").order("desc").take(3000);
    const enrollments = allEnrollments.filter((e) => !employerSequences.has(e.sequenceId));
    const leadIds = new Set(enrollments.slice(0, 300).map((e) => e.leadId));
    // Clinic rows only (by their enrollment), enough of them to count every reply and bounce
    const clinicEnrollmentIds = new Set<string>(enrollments.map((e) => e._id));
    const inboxClinic = (await ctx.db.query("outreachInbox").order("desc").take(1500)).filter((i) => clinicEnrollmentIds.has(i.enrollmentId));
    const inbox = inboxClinic.slice(0, 30);
    for (const i of inbox) leadIds.add(i.leadId);
    const leads = new Map<string, Doc<"outreachLeads"> | null>();
    for (const id of leadIds) leads.set(id, await ctx.db.get(id));

    const sequences = allSequences.filter(isClinicSequence).slice(0, 20);
    const stats = (list: Doc<"outreachEnrollments">[]) => {
      const out = { total: list.length, active: 0, finished: 0, replied: 0, bounced: 0, unsubscribed: 0, stopped: 0, sent: 0, contacted: 0 };
      for (const e of list) {
        out[e.status]++;
        out.sent += e.nextStep;
        if (e.nextStep > 0) out.contacted++;
      }
      return out;
    };

    // An address is only ever enrolled once, whichever list enrolled it
    const enrolledEmails = new Set(allEnrollments.map((e) => e.email));
    const eligibleByCity = new Map<string, number>();
    for (const status of ENROLLABLE) {
      for (const lead of await ctx.db.query("outreachLeads").withIndex("by_status", (q) => q.eq("status", status)).take(2000)) {
        if (!isClinicLead(lead) || !lead.email || enrolledEmails.has(lead.email)) continue;
        eligibleByCity.set(lead.city, (eligibleByCity.get(lead.city) ?? 0) + 1);
      }
    }

    return {
      connection: {
        configured: Boolean(process.env.OUTREACH_SMTP_USER && process.env.OUTREACH_SMTP_PASS),
        address: process.env.OUTREACH_SMTP_USER ?? null,
      },
      settings: { ...s, lastSendError: row?.lastSendError ?? null, lastSendErrorAt: row?.lastSendErrorAt ?? null },
      inboxCheck: { at: row?.lastInboxCheckAt ?? null, error: row?.lastInboxError ?? null },
      today: {
        sent: await sentOn(ctx, clock.day),
        quota: dailyQuota(s, clock.day),
        windowOpen: windowOpen(now),
        weekday: clock.weekday !== 0 && clock.weekday !== 6,
        day: clock.day,
        next: nextSendingDay(s, clock.day),
      },
      totals: stats(enrollments),
      numbers: outreachNumbers(enrollments, inboxClinic),
      inboxShown: inbox.length,
      inboxTotal: inboxClinic.length,
      sequences: sequences.map((seq) => ({
        _id: seq._id,
        name: seq.name,
        status: seq.status,
        steps: seq.steps,
        updatedAt: seq.updatedAt,
        stats: stats(enrollments.filter((e) => e.sequenceId === seq._id)),
      })),
      eligible: {
        total: [...eligibleByCity.values()].reduce((a, b) => a + b, 0),
        cities: [...eligibleByCity.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
      },
      enrollments: enrollments.slice(0, 300).map((e) => {
        const lead = leads.get(e.leadId);
        return {
          _id: e._id,
          sequenceId: e.sequenceId,
          leadName: lead?.name ?? "Removed clinic",
          city: lead?.city ?? "",
          email: e.email,
          status: e.status,
          sentSteps: e.nextStep,
          nextSendAt: e.nextSendAt ?? null,
          lastSentAt: e.lastSentAt ?? null,
          repliedAt: e.repliedAt ?? null,
          stoppedReason: e.stoppedReason ?? null,
        };
      }),
      inbox: inbox.map((i) => ({
        _id: i._id,
        kind: i.kind,
        intent: i.intent ?? null,
        leadName: leads.get(i.leadId)?.name ?? "Removed clinic",
        fromEmail: i.fromEmail ?? null,
        subject: i.subject,
        snippet: i.snippet,
        receivedAt: i.receivedAt,
      })),
    };
  },
});

const clampInt = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number.isFinite(n) ? n : min)));

export const adminSaveSender = mutation({
  args: {
    sendingOn: v.optional(v.boolean()),
    fromName: v.optional(v.string()),
    signature: v.optional(v.string()),
    optOut: v.optional(v.string()),
    dailyStart: v.optional(v.number()),
    rampPerDay: v.optional(v.number()),
    dailyMax: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "outreachSend:adminSaveSender");
    const row = await settingsRow(ctx);
    const patch: Partial<Settings> = { updatedBy: user._id };
    if (args.fromName !== undefined) patch.fromName = args.fromName.trim().slice(0, 60) || SENDER_DEFAULTS.fromName;
    if (args.signature !== undefined) patch.signature = args.signature.trim().slice(0, 500);
    if (args.optOut !== undefined) {
      const optOut = args.optOut.trim().slice(0, 300);
      // The law and the inbox providers both expect a way to say no
      if (!optOut) throw new ConvexError("Keep a line telling clinics how to stop the emails.");
      patch.optOut = optOut;
    }
    if (args.dailyStart !== undefined) patch.dailyStart = clampInt(args.dailyStart, 1, 100);
    if (args.rampPerDay !== undefined) patch.rampPerDay = clampInt(args.rampPerDay, 0, 50);
    if (args.dailyMax !== undefined) patch.dailyMax = clampInt(args.dailyMax, 1, 150);
    if (args.sendingOn !== undefined) {
      if (args.sendingOn && !(process.env.OUTREACH_SMTP_USER && process.env.OUTREACH_SMTP_PASS)) {
        throw new ConvexError("Connect the inbox first: OUTREACH_SMTP_USER and OUTREACH_SMTP_PASS on Convex.");
      }
      patch.sendingOn = args.sendingOn;
      if (args.sendingOn) {
        patch.lastSendError = undefined;
        if (!row?.rampStartedOn) patch.rampStartedOn = lagosClock(Date.now()).day;
      }
    }
    await patchSettings(ctx, patch);
    return null;
  },
});

export const adminSaveSequence = mutation({
  args: {
    sequenceId: v.optional(v.id("outreachSequences")),
    name: v.string(),
    steps: v.array(stepValidator),
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("paused")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "outreachSend:adminSaveSequence");
    return await saveSequence(ctx, user._id, args, "clinic");
  },
});

/**
 * Saves a clinic or an employer sequence (employerOutreach.ts). Each list only edits its own, and
 * fills in its own tags: {clinic_name} and {city}, or {first_name}, {company} and {city}.
 */
export async function saveSequence(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    sequenceId?: Id<"outreachSequences">;
    name: string;
    steps: { subject: string; body: string; waitDays: number }[];
    status: Doc<"outreachSequences">["status"];
  },
  audience: "clinic" | "employer"
): Promise<Id<"outreachSequences">> {
  const employer = audience === "employer";
  const name = args.name.trim().slice(0, 80);
  if (!name) throw new ConvexError("Give the sequence a name.");
  if (args.steps.length === 0 || args.steps.length > 5) throw new ConvexError("A sequence has one to five emails.");
  const steps = args.steps.map((step, i) => ({
    subject: step.subject.trim().slice(0, 150),
    body: step.body.trim().slice(0, 5000),
    waitDays: i === 0 ? 0 : clampInt(step.waitDays, 1, 30),
  }));
  if (!steps[0].subject) throw new ConvexError("The first email needs a subject.");
  steps.forEach((step, i) => {
    if (!step.body) throw new ConvexError(`Email ${i + 1} has no words yet.`);
    const unknown = unknownTags(`${step.subject} ${step.body}`, employer ? EMPLOYER_TAGS : OUTREACH_TAGS);
    if (unknown.length) {
      const allowed = employer ? "{first_name}, {company} and {city}" : "{clinic_name} and {city}";
      throw new ConvexError(`Email ${i + 1} uses ${unknown.join(", ")}. Only ${allowed} can be filled in.`);
    }
  });
  const now = Date.now();
  if (args.sequenceId) {
    const seq = await ctx.db.get(args.sequenceId);
    if (!seq) throw new ConvexError("That sequence isn't there any more.");
    if ((seq.audience === "employer") !== employer) {
      throw new ConvexError(employer ? "That's a clinic sequence: edit it in Clinic outreach." : "That's an employer sequence: edit it in Employer outreach.");
    }
    await ctx.db.patch(seq._id, { name, steps, status: args.status, updatedAt: now });
    // Clinics already past the last step are done; a step added later doesn't reopen them
    return seq._id;
  }
  return await ctx.db.insert("outreachSequences", {
    ...(employer ? { audience: "employer" as const } : {}),
    name,
    steps,
    status: args.status,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });
}

/** Adds clinics to a sequence: chosen ones, or every clinic ready to email (in a city). */
export const adminEnroll = mutation({
  args: {
    sequenceId: v.id("outreachSequences"),
    leadIds: v.optional(v.array(v.id("outreachLeads"))),
    city: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "outreachSend:adminEnroll");
    const seq = await ctx.db.get(args.sequenceId);
    if (!seq) throw new ConvexError("That sequence isn't there any more.");
    if (!isClinicSequence(seq)) throw new ConvexError("That's an employer sequence: add companies in Employer outreach.");
    const limit = clampInt(args.limit ?? 500, 1, 1000);
    let candidates: Doc<"outreachLeads">[] = [];
    if (args.leadIds) {
      for (const id of args.leadIds.slice(0, limit)) {
        const lead = await ctx.db.get(id);
        if (lead && isClinicLead(lead)) candidates.push(lead);
      }
    } else {
      for (const status of ENROLLABLE) {
        const rows = await ctx.db.query("outreachLeads").withIndex("by_status", (q) => q.eq("status", status)).take(2000);
        candidates.push(...rows.filter(isClinicLead));
      }
      if (args.city) candidates = candidates.filter((l) => l.city === args.city);
      candidates.sort((a, b) => a.createdAt - b.createdAt);
    }
    const now = Date.now();
    let added = 0;
    let skipped = 0;
    for (const lead of candidates) {
      if (added >= limit) break;
      const email = lead.email?.toLowerCase();
      const okStatus = (ENROLLABLE as readonly string[]).includes(lead.status) || lead.status === "new";
      if (!email || !okStatus || (await emailBlocked(ctx, email)) || (await ctx.db.query("outreachEnrollments").withIndex("by_email", (q) => q.eq("email", email)).first())) {
        skipped++;
        continue;
      }
      await ctx.db.insert("outreachEnrollments", {
        sequenceId: seq._id,
        leadId: lead._id,
        email,
        status: "active",
        nextStep: 0,
        nextSendAt: now + added, // keeps the order they were added in
        enrolledBy: user._id,
        createdAt: now,
        updatedAt: now,
      });
      added++;
    }
    return { added, skipped };
  },
});

/** Takes a clinic out of its sequence (nothing more is sent). */
export const adminStopEnrollment = mutation({
  args: { enrollmentId: v.id("outreachEnrollments") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, "outreachSend:adminStopEnrollment");
    const e = await ctx.db.get(args.enrollmentId);
    if (!e) throw new ConvexError("That clinic isn't in a sequence any more.");
    if (e.status === "active") await stopEnrollment(ctx, e, "stopped", "Removed by the team");
    return null;
  },
});

/** The emails of a sequence as a sample clinic would get them, for "Send me a test". */
export const testPayload = internalQuery({
  args: { sequenceId: v.id("outreachSequences"), leadId: v.optional(v.id("outreachLeads")) },
  handler: async (ctx, args) => {
    const seq = await ctx.db.get(args.sequenceId);
    if (!seq) throw new ConvexError("That sequence isn't there any more.");
    const lead = args.leadId ? await ctx.db.get(args.leadId) : null;
    const s = withDefaults(await settingsRow(ctx));
    // Employer sequences greet a sample person; clinic ones never use {first_name} or {company}
    const sample = seq.audience === "employer" ? "Your Company" : "Your Clinic Name";
    const values = { clinicName: lead?.name ?? sample, city: lead?.city ?? "Lagos", company: lead?.name ?? sample, firstName: "Ada" };
    const first = fillTags(seq.steps[0]?.subject ?? "", values);
    return {
      fromName: s.fromName,
      emails: seq.steps.map((step, i) => ({
        subject: `[Test ${i + 1}/${seq.steps.length}] ${step.subject.trim() ? fillTags(step.subject, values) : `Re: ${first}`}`,
        text: composeText(fillTags(step.body, values), s.signature, s.optOut),
      })),
    };
  },
});
