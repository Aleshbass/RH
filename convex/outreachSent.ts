/**
 * Admin › Clinic outreach and Employer outreach › Sent emails (owner, 21 Nov 2026). Its own module
 * on purpose: admin access (scripts/admin-access/gen-function-pages.mjs) lets every page that uses
 * one function of a module call the module’s other functions, so living in outreachSend.ts would
 * have opened the clinic sender’s switch and settings to admins who only have Employer outreach.
 */
import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireAdmin } from "./helpers/partnerAccess";
import { isClinicSequence } from "./helpers/outreachShared";

type Audience = "clinic" | "employer";

const SENT_LIST_MAX = 200;
/** The most emails one Sent emails view reads across a list's sequences. */
const SENT_READ_BUDGET = 2400;

type SentOutcome = "no_answer" | "followed_up" | "bounced" | "replied" | "not_interested" | "asked_to_stop" | "removed";

/**
 * Admin › Clinic outreach and Employer outreach › Sent emails (owner, 21 Nov 2026): the emails
 * Rehabify actually sent to that list, newest first, and what came back since each one. The team
 * couldn't tell ours from a warm-up tool's look-alike emails in the same inbox, and emails sent
 * this way may not show in Zoho's Sent folder, so this list is the record.
 */
export const adminSentEmails = query({
  args: { audience: v.union(v.literal("clinic"), v.literal("employer")) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, "outreachSent:adminSentEmails");
    const audience: Audience = args.audience;
    const sequences = (await ctx.db.query("outreachSequences").order("desc").take(200)).filter((q) =>
      audience === "employer" ? !isClinicSequence(q) : isClinicSequence(q)
    );
    // Each sequence's newest emails, then the newest of them all. Every email newer than one shown
    // (same sequence) is shown too, so "followed up" below always sees the next email.
    const perSequence = Math.min(SENT_LIST_MAX, Math.max(20, Math.floor(SENT_READ_BUDGET / Math.max(1, sequences.length))));
    const all: Doc<"outreachMessages">[] = [];
    let moreExist = false;
    for (const seq of sequences) {
      const newest = await ctx.db
        .query("outreachMessages")
        .withIndex("by_sequence", (q) => q.eq("sequenceId", seq._id))
        .order("desc")
        .take(perSequence);
      if (newest.length === perSequence) moreExist = true;
      all.push(...newest);
    }
    all.sort((a, b) => b.sentAt - a.sentAt);
    const messages = all.slice(0, SENT_LIST_MAX);
    const seqById = new Map<string, Doc<"outreachSequences">>(sequences.map((q) => [q._id, q]));

    // Each address's emails in this list, oldest first, to know what came after each one
    const byEnrollment = new Map<string, Doc<"outreachMessages">[]>();
    for (const m of messages) byEnrollment.set(m.enrollmentId, [...(byEnrollment.get(m.enrollmentId) ?? []), m]);
    for (const list of byEnrollment.values()) list.sort((a, b) => a.sentAt - b.sentAt);

    const enrollments = new Map<string, Doc<"outreachEnrollments"> | null>();
    const leads = new Map<string, Doc<"outreachLeads"> | null>();
    const people = new Map<string, Doc<"outreachContacts"> | null>();
    const inboxByLead = new Map<string, Doc<"outreachInbox">[]>();
    const rows = [];
    for (const m of messages) {
      if (!enrollments.has(m.enrollmentId)) enrollments.set(m.enrollmentId, await ctx.db.get(m.enrollmentId));
      if (!leads.has(m.leadId)) leads.set(m.leadId, await ctx.db.get(m.leadId));
      if (!inboxByLead.has(m.leadId)) {
        inboxByLead.set(m.leadId, await ctx.db.query("outreachInbox").withIndex("by_lead", (q) => q.eq("leadId", m.leadId)).take(50));
      }
      const e = enrollments.get(m.enrollmentId) ?? null;
      const lead = leads.get(m.leadId) ?? null;
      if (e?.contactId && !people.has(e.contactId)) people.set(e.contactId, await ctx.db.get(e.contactId));
      const person = e?.contactId ? (people.get(e.contactId) ?? null) : null;
      const seq = seqById.get(m.sequenceId);
      const mine = byEnrollment.get(m.enrollmentId) ?? [];
      const next = mine[mine.indexOf(m) + 1];
      const latest = !next;
      // What came back from this address between this email and our next one to it
      const events = (inboxByLead.get(m.leadId) ?? [])
        .filter((i) => i.enrollmentId === m.enrollmentId && i.receivedAt >= m.sentAt && (!next || i.receivedAt < next.sentAt))
        .sort((a, b) => a.receivedAt - b.receivedAt);
      const answer = events.find((i) => i.kind === "reply" && i.intent === "stop") ?? events.find((i) => i.kind === "reply");
      let outcome: SentOutcome;
      if (answer) outcome = answer.intent === "stop" ? "asked_to_stop" : answer.intent === "not_interested" ? "not_interested" : "replied";
      // A bounce notice, or the address marked bounced after this (its last) email
      else if (events.some((i) => i.kind === "bounce") || (latest && e?.status === "bounced")) outcome = "bounced";
      else if (!latest) outcome = "followed_up";
      else if (e && (e.status === "stopped" || e.status === "unsubscribed")) outcome = "removed";
      else outcome = "no_answer";
      const template = seq?.steps[m.step];
      rows.push({
        _id: m._id,
        leadId: m.leadId,
        sentAt: m.sentAt,
        day: m.day,
        name: lead?.name ?? (audience === "employer" ? "Removed company" : "Removed clinic"),
        city: lead?.city ?? "",
        address: lead?.address ?? null,
        phone: lead?.phone ?? null,
        website: lead?.website ?? null,
        to: m.email,
        personName: person?.name ?? null,
        personRole: person?.role ?? null,
        step: m.step,
        steps: Math.max(seq?.steps.length ?? 0, m.step + 1),
        sequenceName: seq?.name ?? "Sequence",
        subject: m.subject,
        // A follow-up with no subject of its own went as a reply in the first email's thread
        threaded: m.step > 0 && (template ? !template.subject.trim() : /^re:/i.test(m.subject)),
        outcome,
        autoReply: events.some((i) => i.kind === "auto_reply"),
        events: events.slice(0, 5).map((i) => ({
          kind: i.kind,
          intent: i.intent ?? null,
          fromEmail: i.fromEmail ?? null,
          snippet: i.snippet,
          receivedAt: i.receivedAt,
        })),
        stoppedReason: latest && e && e.status !== "active" ? (e.stoppedReason ?? null) : null,
      });
    }
    return { rows, capped: moreExist || all.length > messages.length, limit: SENT_LIST_MAX };
  },
});
