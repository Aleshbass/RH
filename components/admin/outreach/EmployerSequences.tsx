"use client";

/**
 * Admin › Employer outreach › Sequences (convex/employerOutreach.ts): the employer sequences
 * (first email + follow-ups), "Send me a test", the shared sender's state, the latest replies
 * from companies, and the name and signature companies see (Sender). Mirrors the clinic outreach
 * editor (OutreachSender.tsx); sending itself is switched on and off on the Clinic outreach page,
 * as both lists share one inbox and daily limit.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { Inbox, Loader2, Pause, Pencil, Play, Plus, Send, Trash2 } from "@/components/icons";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyState,
  Panel,
  StatusBadge,
  fieldClass,
  primaryButtonClass,
  softButtonClass,
  textareaFieldClass,
} from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { employerApi, errorText, type SeqStatus, type Step } from "./employerApi";
import { DailyLimitTip, OutreachNumbersTiles, REPLIES_INFO, clockLabel, inboxLabel, sendingHoursLabel } from "./OutreachHelp";

/**
 * A starting point the team edits: short and plain, from what /platform/employers already says
 * (no prices or numbers it doesn't). Follow-ups with no subject reply in the same thread.
 */
const DEFAULT_STEPS: Step[] = [
  {
    subject: "Back pain and sick days at {company}",
    body: `Hello {first_name},

In logistics, manufacturing and banking teams, back, neck and shoulder pain is common. It rarely arrives as one big problem: it shows up as sick days and slower work.

Rehabify for Work helps {company} catch that pain early. Joy, our assistant on WhatsApp, checks in with each worker in a few minutes. Anyone who reports pain gets a video consultation with a licensed physiotherapist within 48 hours, and injured workers are supported until they're ready to return to work. There's no app to install: it runs on the WhatsApp your people already use.

You get a monthly report on uptake, pain trends and return-to-work times, with no individual health details shared.

Would a short call be useful, or a pilot with one team? You can see how it works here: physioaroundme.com/platform/employers`,
    waitDays: 0,
  },
  {
    subject: "",
    body: `Hello {first_name},

Following up on my note below. The simplest way to see if Rehabify for Work suits {company} is a pilot with one team: each worker does a quick check with Joy on WhatsApp, anyone in pain sees a licensed physiotherapist within 48 hours, and you get the monthly report.

Would a 15-minute call this week or next be worth it?`,
    waitDays: 3,
  },
  {
    subject: "",
    body: `Hello {first_name},

I won't keep filling your inbox, so this is my last note. If fewer days lost to pain and injury would help {company}, just reply to this email and we'll plan a pilot with you. It's a simple monthly fee per worker, and we share pricing once we know your team.

physioaroundme.com/platform/employers`,
    waitDays: 4,
  },
];

const SEQ_TONE: Record<SeqStatus, "green" | "amber" | "neutral"> = { active: "green", paused: "amber", draft: "neutral" };
const SEQ_LABEL: Record<SeqStatus, string> = { active: "Sending", paused: "Paused", draft: "Draft" };

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

export function EmployerSequences({ onOpenCompany }: { onOpenCompany?: (leadId: string) => void }) {
  const data = useQuery(employerApi.sequences, {});
  const saveSequence = useMutation(employerApi.saveSequence);
  const saveSender = useMutation(employerApi.saveSender);
  const sendTest = useAction(employerApi.sendTest);

  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, task: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await task();
      if (done) toast.success(done);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const [editing, setEditing] = useState<{ id?: string; name: string; status: SeqStatus; steps: Step[] } | null>(null);
  const [testTo, setTestTo] = useState("");
  useEffect(() => {
    if (!testTo && data?.sender.address) setTestTo(data.sender.address);
  }, [data?.sender.address, testTo]);

  // Sender form: starts from what companies get now (the Clinic outreach sender until saved here)
  const [senderForm, setSenderForm] = useState<{ fromName: string; signature: string; optOut: string } | null>(null);
  useEffect(() => {
    if (data && !senderForm) {
      setSenderForm({ fromName: data.sender.fromName, signature: data.sender.signature, optOut: data.sender.optOut });
    }
  }, [data, senderForm]);

  if (data === undefined) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  const s = data.sender;
  const activeSequences = data.sequences.filter((q) => q.status === "active").length;

  const saveEditing = () =>
    editing &&
    run(
      "save-seq",
      async () => {
        const id = await saveSequence({
          ...(editing.id ? { sequenceId: editing.id } : {}),
          name: editing.name,
          steps: editing.steps,
          status: editing.status,
        });
        setEditing({ ...editing, id });
      },
      "Sequence saved"
    );

  return (
    <div className="space-y-5">
      <Panel
        title="Sending"
        description={
          s.configured
            ? `From ${s.fromName} <${s.address}>, one email at a time, ${sendingHoursLabel(s)}.`
            : "The inbox isn't connected yet: OUTREACH_SMTP_USER and OUTREACH_SMTP_PASS on Convex."
        }
        info={
          <>
            <p>
              Employer outreach shares one inbox with Clinic outreach: the same hello@ address, the same daily limit and the same on/off switch.
            </p>
            <p>
              The switch and the limit are changed on the Clinic outreach page. The name and signature companies see are under Sender at the
              bottom of this tab.
            </p>
          </>
        }
      >
        <div className="space-y-2 p-5 text-sm text-rh-ink dark:text-white">
          <p>
            <StatusBadge tone={s.sendingOn ? "green" : "neutral"}>{s.sendingOn ? "On" : "Off"}</StatusBadge>{" "}
            <span className="ml-1">
              Today: <strong>{data.employerSentToday}</strong> to companies. Shared with clinic outreach:{" "}
              <strong>{s.sentToday}</strong> of {s.quota} sent today.
              <DailyLimitTip
                today={{ sent: s.sentToday, quota: s.quota, weekday: s.weekday, windowOpen: s.windowOpen, day: s.day, next: s.next }}
                ramp={s}
                sendingOn={s.sendingOn}
                audience="employer"
                hours={s}
              />{" "}
              {!s.weekday
                ? "Not a sending day."
                : s.windowOpen
                  ? ""
                  : `Outside ${clockLabel(s.windowStart)}–${clockLabel(s.windowEnd)}, so nothing goes out now.`}
            </span>
          </p>
          {s.sendingOn && activeSequences === 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">No employer sequence is set to Sending yet, so no company emails go out.</p>
          )}
          <p className="text-xs text-neutral-500">
            Clinics and companies go out from the same inbox under one daily limit. Start or pause sending, and change the limit, on{" "}
            <Link href="/dashboard/admin/outreach" className="underline underline-offset-2">
              Clinic outreach
            </Link>
            . Change the name and signature companies see under{" "}
            <a href="#employer-sender" className="underline underline-offset-2">
              Sender
            </a>{" "}
            below.
          </p>
          {s.lastSendError && <p className="text-xs text-rose-600">Last problem: {s.lastSendError}</p>}
        </div>
      </Panel>

      <OutreachNumbersTiles n={data.numbers} audience="employer" />

      <Panel
        title="Sequences"
        description="The first email and its follow-ups. A follow-up with no subject replies in the same thread. Any reply from the company stops the rest."
        actions={
          !editing && (
            <button
              type="button"
              className={softButtonClass}
              onClick={() => setEditing({ name: "Rehabify for Work: first contact", status: "draft", steps: DEFAULT_STEPS })}
            >
              <Plus className="mr-1.5 h-4 w-4" /> New sequence
            </button>
          )
        }
      >
        {editing ? (
          <div className="space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Sequence name"
                aria-label="Sequence name"
                className={fieldClass}
              />
              <select
                value={editing.status}
                onChange={(e) => setEditing({ ...editing, status: e.target.value as SeqStatus })}
                aria-label="Status"
                className={fieldClass}
              >
                <option value="draft">Draft</option>
                <option value="active">Sending</option>
                <option value="paused">Paused</option>
              </select>
            </div>
            <p className="text-xs text-neutral-500">
              Fill-ins: <code>{"{first_name}"}</code> (the person&apos;s first name, or &ldquo;there&rdquo; for a company inbox),{" "}
              <code>{"{company}"}</code> and <code>{"{city}"}</code>. Your signature and the &ldquo;reply stop&rdquo; line are added
              under every email.
            </p>
            {editing.steps.map((step, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-rh-ink dark:text-white">
                  Email {i + 1}
                  {i > 0 && (
                    <span className="flex items-center gap-1 text-xs font-normal text-neutral-500">
                      sent
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={step.waitDays}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            steps: editing.steps.map((x, j) => (j === i ? { ...x, waitDays: Number(e.target.value) } : x)),
                          })
                        }
                        aria-label={`Days before email ${i + 1}`}
                        className={cn(fieldClass, "h-7 w-16 px-2 py-0 text-xs")}
                      />
                      days after the one before, if there&apos;s no reply
                    </span>
                  )}
                  {editing.steps.length > 1 && i > 0 && (
                    <button
                      type="button"
                      aria-label={`Remove email ${i + 1}`}
                      className="ml-auto text-neutral-400 hover:text-rose-600"
                      onClick={() => setEditing({ ...editing, steps: editing.steps.filter((_, j) => j !== i) })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <input
                  value={step.subject}
                  onChange={(e) =>
                    setEditing({ ...editing, steps: editing.steps.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)) })
                  }
                  placeholder={i === 0 ? "Subject" : "Leave empty to reply in the same thread"}
                  aria-label={`Subject of email ${i + 1}`}
                  className={fieldClass}
                />
                <textarea
                  value={step.body}
                  onChange={(e) =>
                    setEditing({ ...editing, steps: editing.steps.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })
                  }
                  rows={i === 0 ? 12 : 7}
                  aria-label={`Words of email ${i + 1}`}
                  className={textareaFieldClass}
                />
              </div>
            ))}
            {editing.steps.length < 5 && (
              <button
                type="button"
                className="text-sm text-neutral-600 hover:underline dark:text-neutral-300"
                onClick={() => setEditing({ ...editing, steps: [...editing.steps, { subject: "", body: "", waitDays: 5 }] })}
              >
                + Add a follow-up
              </button>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-black/[0.05] pt-4 dark:border-white/[0.06]">
              <button type="button" className={primaryButtonClass} disabled={busy !== null} onClick={() => saveEditing()}>
                {busy === "save-seq" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save
              </button>
              <button type="button" className={softButtonClass} onClick={() => setEditing(null)}>
                Close
              </button>
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <input
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="you@example.com"
                  aria-label="Send the test to"
                  className={cn(fieldClass, "h-9 w-60 py-1 text-sm")}
                />
                <button
                  type="button"
                  className={softButtonClass}
                  disabled={busy !== null || !editing.id}
                  title={editing.id ? undefined : "Save first"}
                  onClick={() =>
                    editing.id &&
                    run("test", async () => {
                      const res = await sendTest({ sequenceId: editing.id!, to: testTo });
                      toast.success(`Sent ${res.sent} test email${res.sent === 1 ? "" : "s"} to ${testTo}`);
                    })
                  }
                >
                  {busy === "test" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />} Send me a
                  test
                </button>
              </span>
            </div>
          </div>
        ) : data.sequences.length === 0 ? (
          <EmptyState
            title="No employer sequence yet"
            description="Press New sequence: it starts with a first email and two follow-ups written from the employers page. It stays a draft until you set it to Sending."
          />
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {data.sequences.map((q) => (
              <li key={q._id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium text-rh-ink dark:text-white">
                    {q.name} <StatusBadge tone={SEQ_TONE[q.status]}>{SEQ_LABEL[q.status]}</StatusBadge>
                  </p>
                  <p className="text-xs text-neutral-500">
                    {q.steps.length} email{q.steps.length === 1 ? "" : "s"} · {q.stats.total} addresses ({q.stats.people} named people) ·{" "}
                    {q.stats.contacted} emailed · {q.stats.replied} replied ({pct(q.stats.replied, q.stats.contacted)}) · {q.stats.bounced}{" "}
                    bounced
                  </p>
                </div>
                <button
                  type="button"
                  className={softButtonClass}
                  disabled={busy !== null}
                  onClick={() =>
                    run(
                      `seq-${q._id}`,
                      () =>
                        saveSequence({ sequenceId: q._id, name: q.name, steps: q.steps, status: q.status === "active" ? "paused" : "active" }),
                      q.status === "active" ? "Sequence paused" : "Sequence is sending"
                    )
                  }
                >
                  {q.status === "active" ? <Pause className="mr-1.5 h-4 w-4" /> : <Play className="mr-1.5 h-4 w-4" />}
                  {q.status === "active" ? "Pause" : "Send"}
                </button>
                <button
                  type="button"
                  className={softButtonClass}
                  onClick={() => setEditing({ id: q._id, name: q.name, status: q.status, steps: q.steps })}
                >
                  <Pencil className="mr-1.5 h-4 w-4" /> Edit
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-black/[0.05] px-5 py-3 text-xs text-neutral-500 dark:border-white/[0.06]">
          To add companies, tick them on the Companies tab and press Add to sequence.
        </p>
      </Panel>

      <Panel
        title="Replies from companies"
        description="What came back from companies, newest first: real replies, automatic out-of-office replies and bounces. Read and answer replies in the hello@ inbox in Zoho."
        info={REPLIES_INFO}
      >
        {data.replies.length === 0 ? (
          <EmptyState icon={<Inbox className="h-5 w-5" />} title="Nothing yet" description="Replies show here within 15 minutes of arriving." />
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {data.replies.map((m) => (
              <li key={m._id} className="space-y-1 px-5 py-3">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-rh-ink dark:text-white">
                  {onOpenCompany ? (
                    <button type="button" className="hover:underline" onClick={() => onOpenCompany(m.leadId)}>
                      {m.company}
                    </button>
                  ) : (
                    m.company
                  )}
                  <StatusBadge tone={inboxLabel(m.kind, m.intent).tone}>{inboxLabel(m.kind, m.intent).label}</StatusBadge>
                  <span className="text-xs font-normal text-neutral-500">{formatDistanceToNowStrict(m.receivedAt, { addSuffix: true })}</span>
                </p>
                <p className="text-xs text-neutral-500">
                  {m.fromEmail} · {m.subject}
                </p>
                {m.snippet && <p className="text-sm text-neutral-700 dark:text-neutral-300">{m.snippet}</p>}
              </li>
            ))}
          </ul>
        )}
        {data.repliesTotal > data.replies.length && (
          <p className="border-t border-black/[0.05] px-5 py-3 text-xs text-neutral-500 dark:border-white/[0.06]">
            Showing the newest {data.replies.length} of {data.repliesTotal}. The numbers above count them all.
          </p>
        )}
      </Panel>

      {/* Sender: Employer outreach's own name, signature and stop line */}
      {senderForm && (
        <div id="employer-sender" className="scroll-mt-24">
          <Panel
            title="Sender"
            description="The name companies see the emails come from, and how every email is signed."
            info={
              <>
                <p>
                  These are only for emails to companies. Clinic emails keep the name and signature set on the Clinic outreach page.
                </p>
                <p>The emails still go from {s.address ?? "the hello@ inbox"}, so replies land in the same place.</p>
              </>
            }
          >
            <form
              className="grid gap-3 p-5 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                run("sender", () => saveSender(senderForm), "Saved. New emails to companies use this sender.");
              }}
            >
              <p className="text-xs text-neutral-500 sm:col-span-2">
                {s.ownSender ? (
                  "Companies get this name and signature. Clinic emails are not affected."
                ) : (
                  <>
                    Companies get the Clinic outreach name and signature for now (shown below). Change them and press Save to give
                    employer emails their own.
                  </>
                )}
              </p>
              <label className="space-y-1 text-sm text-rh-ink dark:text-white sm:col-span-2">
                From name
                <input
                  value={senderForm.fromName}
                  onChange={(e) => setSenderForm({ ...senderForm, fromName: e.target.value })}
                  maxLength={60}
                  className={fieldClass}
                  placeholder="e.g. Mary from Rehabify for Work"
                />
              </label>
              <label className="space-y-1 text-sm text-rh-ink dark:text-white">
                Signature
                <textarea
                  rows={4}
                  value={senderForm.signature}
                  onChange={(e) => setSenderForm({ ...senderForm, signature: e.target.value })}
                  maxLength={500}
                  className={textareaFieldClass}
                  placeholder={"Mary\nRehabify for Work\nphysioaroundme.com/platform/employers"}
                />
              </label>
              <label className="space-y-1 text-sm text-rh-ink dark:text-white">
                How to stop the emails (always added)
                <textarea
                  rows={4}
                  value={senderForm.optOut}
                  onChange={(e) => setSenderForm({ ...senderForm, optOut: e.target.value })}
                  maxLength={300}
                  className={textareaFieldClass}
                />
              </label>
              <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                <button type="submit" className={primaryButtonClass} disabled={busy !== null}>
                  {busy === "sender" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save
                </button>
                {s.ownSender && (
                  <button
                    type="button"
                    className={softButtonClass}
                    disabled={busy !== null}
                    onClick={() =>
                      run(
                        "sender-reset",
                        async () => {
                          await saveSender({ useClinic: true });
                          setSenderForm(null);
                        },
                        "Companies now get the Clinic outreach sender"
                      )
                    }
                  >
                    {busy === "sender-reset" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Use the clinic sender
                  </button>
                )}
              </div>
            </form>
          </Panel>
        </div>
      )}
    </div>
  );
}
