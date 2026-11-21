"use client";

/**
 * Plain-English help for Admin › Clinic outreach and Employer outreach (owner, 21 Nov 2026: "we need
 * the admin to understand how everything works… even me I am confused"): the "How outreach works"
 * card, the headline numbers with an "i" on each, the daily-limit "i", and one set of labels for
 * replies, automatic replies and bounces. The numbers come from outreachSend.ts (outreachNumbers).
 */

import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ChevronDown, ChevronUp } from "@/components/icons";
import { InfoTip, StatTile, cardClass } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

export type Audience = "clinic" | "employer";

/** outreachSend.ts outreachNumbers: each counts addresses once */
export type OutreachNumbers = {
  sent: number;
  emailed: number;
  contacted: number;
  replies: number;
  askedToStop: number;
  notInterested: number;
  autoReplies: number;
  bounced: number;
  bouncedBack: number;
  refused: number;
  waiting: number;
  waitingFollowUp: number;
};

export type SendingDay = { day: string; quota: number };

type Tone = "green" | "teal" | "amber" | "red" | "neutral";

/** One label per kind of answer, the same on both pages and in Sent emails. */
export function inboxLabel(kind: string, intent: string | null): { label: string; tone: Tone } {
  if (kind === "bounce") return { label: "Bounced (address doesn't work)", tone: "amber" };
  if (kind === "auto_reply") return { label: "Automatic reply (out of office)", tone: "neutral" };
  if (intent === "stop") return { label: "Asked to stop", tone: "red" };
  if (intent === "not_interested") return { label: "Reply: not interested", tone: "neutral" };
  return { label: "Reply", tone: "green" };
}

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

/** "Monday" for "2026-11-23" (noon UTC is the same date in any time zone near Lagos). */
export const dayName = (day: string) => format(new Date(`${day}T12:00:00Z`), "EEEE");

/** Sent · Contacted · Replies · Automatic replies · Bounced · Waiting, each with what it counts. */
export function OutreachNumbersTiles({ n, audience }: { n: OutreachNumbers; audience: Audience }) {
  const clinic = audience === "clinic";
  const many = clinic ? "clinics" : "addresses";
  const one = clinic ? "clinic" : "address";
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <StatTile
        label="Emails sent"
        value={n.sent}
        hint={`to ${n.emailed} ${n.emailed === 1 ? one : many}`}
        info={
          <p>
            Every email Rehabify has sent to {clinic ? "clinics" : "companies"}: first emails and follow-ups together. Each one is listed under
            Sent emails.
          </p>
        }
      />
      <StatTile
        label="Contacted"
        value={n.contacted}
        hint={n.bouncedBack ? `${n.emailed} emailed, ${n.bouncedBack} bounced` : `${many} reached`}
        info={
          <p>
            {clinic ? "Clinics" : "Addresses (a company's own inbox or a named person)"} that received at least one of our emails that didn&apos;t
            bounce back.
          </p>
        }
      />
      <StatTile
        label="Replies (real people)"
        value={n.replies}
        hint={`${pct(n.replies, n.contacted)} of contacted${n.askedToStop ? ` · ${n.askedToStop} asked to stop` : ""}`}
        info={
          <>
            <p>
              Real people answering our emails, counted once per {one}. This includes anyone who said no or asked us to stop.
            </p>
            <p>Automatic out-of-office replies are counted separately.</p>
          </>
        }
      />
      <StatTile
        label="Automatic replies"
        value={n.autoReplies}
        hint="out of office and similar"
        info={
          <p>
            Answers sent by a mail system, such as &ldquo;I&apos;m out of the office until Monday&rdquo;. Nobody has read our email yet, so these
            aren&apos;t counted as replies and the follow-ups carry on.
          </p>
        }
      />
      <StatTile
        label="Bounced"
        value={n.bounced}
        hint={n.refused ? `${n.bouncedBack} came back, ${n.refused} refused before sending` : "address doesn't work"}
        info={
          <p>
            Addresses that don&apos;t work: the email came back undelivered, or their mail server refused it before it went. They&apos;re never
            emailed again.
          </p>
        }
      />
      <StatTile
        label="Waiting to be emailed"
        value={n.waiting}
        hint={n.waitingFollowUp ? `+${n.waitingFollowUp} waiting for a follow-up` : "first email not sent yet"}
        info={
          <>
            <p>
              {clinic ? "Clinics" : "Addresses"} in a sequence that haven&apos;t had their first email yet. They go out in the order they were
              added, within each weekday&apos;s limit.
            </p>
            {n.waitingFollowUp > 0 && (
              <p>
                The small line counts {many} already emailed that are waiting for their next follow-up (a reply stops it).
              </p>
            )}
          </>
        }
      />
    </div>
  );
}

/** Lagos is UTC+1 all year */
const lagosMinutesNow = () => {
  const d = new Date(Date.now() + 3_600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

/** What today means for sending, in one sentence. */
function todayLine(t: { sent: number; quota: number; weekday: boolean; windowOpen: boolean; day: string; next: SendingDay }, sendingOn: boolean, audience: Audience) {
  const nextLimit = `${dayName(t.next.day)}'s limit: ${t.next.quota}.`;
  if (!sendingOn) {
    return `Sending is switched off, so nothing goes out until someone presses Start sending${audience === "employer" ? " on Clinic outreach" : ""}.`;
  }
  if (!t.weekday) return `Today is ${dayName(t.day)}: nothing goes out at weekends. ${nextLimit}`;
  if (lagosMinutesNow() < 9 * 60) return `Today's limit is ${t.quota}. Sending starts at 9am.`;
  if (t.windowOpen) {
    return t.sent >= t.quota ? `Today's limit of ${t.quota} has been reached. ${nextLimit}` : `Today's limit is ${t.quota}, and ${t.sent} have gone so far.`;
  }
  return `Today's sending has finished (${t.sent} of ${t.quota}). ${nextLimit}`;
}

/** The "i" next to today's count: how the limit grows, the sending hours, why, and what today is. */
export function DailyLimitTip({
  today,
  ramp,
  sendingOn,
  audience,
}: {
  today: { sent: number; quota: number; weekday: boolean; windowOpen: boolean; day: string; next: SendingDay };
  ramp: { dailyStart: number; rampPerDay: number; dailyMax: number };
  sendingOn: boolean;
  audience: Audience;
}) {
  return (
    <InfoTip label="How the daily limit works" side="bottom" className="ml-0.5">
      <p>
        The daily limit is {ramp.dailyStart} on the first sending day, then {ramp.rampPerDay} more each weekday, up to {ramp.dailyMax}. It keeps
        growing on weekdays even while sending is paused.
      </p>
      <p>
        Emails only go out on weekdays between 9am and 5pm Lagos time, one at a time, spread across the day. A new mailbox that sends a lot at
        once lands in spam, so it starts slowly.
      </p>
      <p>Clinic and employer emails share this one limit.</p>
      <p className="font-medium text-rh-ink dark:text-white">{todayLine(today, sendingOn, audience)}</p>
    </InfoTip>
  );
}

/** The "i" on replies: where to answer them, and how quickly they show. */
export const REPLIES_INFO = (
  <>
    <p>Read and answer replies in the hello@ inbox in Zoho. They show here within 15 minutes.</p>
    <p>
      Only answers to Rehabify&apos;s outreach emails are listed. Other mail in the inbox, such as warm-up emails, never shows here.
    </p>
  </>
);

const GUIDE_STEPS: Record<Audience, { title: string; text: ReactNode }[]> = {
  clinic: [
    { title: "Find clinics", text: "Search a city on the Find clinics tab. Clinics come from Google Maps and an AI web search." },
    { title: "We read their websites for emails", text: "Each clinic's website is read for a contact email. Clinics without one can't be emailed." },
    {
      title: "Add them to a sequence",
      text: "A sequence is a first email plus follow-ups a few days apart. Write it and add clinics on the Send emails tab.",
    },
    {
      title: "Rehabify sends from hello@, slowly",
      text: "One email at a time, on weekdays between 9am and 5pm Lagos time, a few more each day. Nothing goes out at weekends.",
    },
    {
      title: "Replies stop the follow-ups",
      text: "Replies show here within 15 minutes; answer them in the hello@ inbox in Zoho. Bounced addresses and anyone who says “stop” are never emailed again.",
    },
  ],
  employer: [
    {
      title: "Find companies",
      text: "Search a city and sectors on the Companies tab, then use Find people for their HR, operations and safety leads.",
    },
    {
      title: "We read their websites for emails",
      text: "Each company's website is read for emails and phone numbers. A person's email is only kept when a public page shows it.",
    },
    {
      title: "Add them to a sequence",
      text: "Tick companies and press Add to sequence. A sequence is a first email plus follow-ups a few days apart (Sequences tab).",
    },
    {
      title: "Rehabify sends from hello@, slowly",
      text: (
        <>
          Weekdays 9am to 5pm Lagos time, one at a time. It&apos;s the same sender, daily limit and on/off switch as{" "}
          <Link href="/dashboard/admin/outreach" className="underline underline-offset-2">
            Clinic outreach
          </Link>
          , and the switch lives there.
        </>
      ),
    },
    {
      title: "Replies stop the follow-ups",
      text: "Replies show here within 15 minutes; answer them in the hello@ inbox in Zoho. Bounced addresses and anyone who says “stop” are never emailed again.",
    },
  ],
};

/**
 * "How outreach works" at the top of each page. Open until someone hides it; the choice is
 * remembered in this browser only (and the card simply stays open where storage is blocked).
 */
export function OutreachGuide({ audience, onShowSent }: { audience: Audience; onShowSent?: () => void }) {
  const storageKey = `rh-admin-outreach-guide-${audience}`;
  const bodyId = useId();
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey) === "closed") setOpen(false);
    } catch {
      // Private window or blocked storage: keep it open
    }
  }, [storageKey]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(storageKey, next ? "open" : "closed");
    } catch {
      // Not remembered, which is fine
    }
  };

  return (
    <section className={cn(cardClass, "overflow-hidden")}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rh-lime"
      >
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold tracking-tight text-rh-ink dark:text-white">How outreach works</span>
          <span className="block text-xs text-neutral-500 dark:text-neutral-400">
            Five steps, from finding {audience === "clinic" ? "clinics" : "companies"} to their replies.
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
          {open ? "Hide" : "Show"}
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>
      {open && (
        <div id={bodyId} className="space-y-4 px-5 pb-5">
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {GUIDE_STEPS[audience].map((step, i) => (
              <li key={step.title} className="rounded-xl bg-rh-canvas p-3.5 dark:bg-white/[0.04]">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rh-lime text-xs font-semibold text-rh-ink">{i + 1}</span>
                <p className="mt-2 text-sm font-semibold text-rh-ink dark:text-white">{step.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">{step.text}</p>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-2 rounded-xl border border-black/[0.06] p-3.5 text-xs leading-relaxed text-neutral-600 dark:border-white/[0.08] dark:text-neutral-300 sm:flex-row sm:items-center sm:justify-between">
            <p>
              <strong className="font-semibold text-rh-ink dark:text-white">Using a warm-up tool like TrulyInbox?</strong> Its emails
              (random-looking messages to and from other mailboxes) are not Rehabify&apos;s. Their counts in TrulyInbox won&apos;t match these
              numbers; only the emails listed under Sent emails are ours.
            </p>
            {onShowSent && (
              <button
                type="button"
                onClick={onShowSent}
                className="shrink-0 self-start rounded-xl bg-rh-honeydew px-3 py-1.5 text-xs font-medium text-rh-ink transition hover:bg-[#e2f7d8] dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.1] sm:self-auto"
              >
                See Sent emails
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
