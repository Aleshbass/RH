"use client";

/**
 * Admin › Clinic outreach › Send emails (convex/outreachSend.ts): the on/off switch, sequences
 * (first email + follow-ups), adding clinics, the sender settings, replies and who is where.
 */

import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { format, formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import {
  Inbox,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from "@/components/icons";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyState,
  FilterChips,
  Panel,
  StatusBadge,
  fieldClass,
  textareaFieldClass,
  checkboxClass,
  primaryButtonClass,
  softButtonClass,
} from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import {
  DailyLimitTip,
  OutreachNumbersTiles,
  REPLIES_INFO,
  inboxLabel,
  type OutreachNumbers,
  type SendingDay,
} from "./OutreachHelp";

type Step = { subject: string; body: string; waitDays: number };
type SeqStatus = "draft" | "active" | "paused";
type EnrollStatus =
  | "active"
  | "finished"
  | "replied"
  | "bounced"
  | "unsubscribed"
  | "stopped";
type Stats = Record<EnrollStatus, number> & {
  total: number;
  sent: number;
  contacted: number;
};
type Overview = {
  connection: { configured: boolean; address: string | null };
  settings: {
    sendingOn: boolean;
    fromName: string;
    signature: string;
    optOut: string;
    dailyStart: number;
    rampPerDay: number;
    dailyMax: number;
    rampStartedOn?: string;
    lastSendError: string | null;
    lastSendErrorAt: number | null;
  };
  inboxCheck: { at: number | null; error: string | null };
  today: {
    sent: number;
    quota: number;
    windowOpen: boolean;
    weekday: boolean;
    day: string;
    next: SendingDay;
  };
  totals: Stats;
  numbers: OutreachNumbers;
  inboxShown: number;
  inboxTotal: number;
  sequences: {
    _id: string;
    name: string;
    status: SeqStatus;
    steps: Step[];
    updatedAt: number;
    stats: Stats;
  }[];
  eligible: { total: number; cities: { name: string; count: number }[] };
  enrollments: {
    _id: string;
    sequenceId: string;
    leadName: string;
    city: string;
    email: string;
    status: EnrollStatus;
    sentSteps: number;
    nextSendAt: number | null;
    lastSentAt: number | null;
    repliedAt: number | null;
    stoppedReason: string | null;
  }[];
  inbox: {
    _id: string;
    kind: "reply" | "bounce" | "auto_reply";
    intent: "stop" | "not_interested" | null;
    leadName: string;
    fromEmail: string | null;
    subject: string;
    snippet: string;
    receivedAt: number;
  }[];
};

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const overviewRef = makeFunctionReference<
  "query",
  Record<string, never>,
  Overview
>("outreachSend:adminSenderOverview");
const saveSenderRef = makeFunctionReference<
  "mutation",
  Partial<{
    sendingOn: boolean;
    fromName: string;
    signature: string;
    optOut: string;
    dailyStart: number;
    rampPerDay: number;
    dailyMax: number;
  }>,
  null
>("outreachSend:adminSaveSender");
const saveSequenceRef = makeFunctionReference<
  "mutation",
  { sequenceId?: string; name: string; steps: Step[]; status: SeqStatus },
  string
>("outreachSend:adminSaveSequence");
const enrollRef = makeFunctionReference<
  "mutation",
  { sequenceId: string; city?: string; limit?: number },
  { added: number; skipped: number }
>("outreachSend:adminEnroll");
const stopRef = makeFunctionReference<
  "mutation",
  { enrollmentId: string },
  null
>("outreachSend:adminStopEnrollment");
const testRef = makeFunctionReference<
  "action",
  { sequenceId: string; to: string },
  { sent: number }
>("actions/outreachMail:adminSendTest");
const checkInboxRef = makeFunctionReference<
  "action",
  Record<string, never>,
  null
>("actions/outreachMail:adminCheckInbox");

/** A starting point the team edits: short, plain, one question, no attachments or images. */
const DEFAULT_STEPS: Step[] = [
  {
    subject: "A question for {clinic_name}",
    body: `Hello {clinic_name} team,

I'm writing from Rehabify, software built for physiotherapy clinics in Nigeria.

Clinics use it to keep patient records and SOAP notes in one place, book sessions, send invoices and payment links, and give every patient a home exercise programme with 3D exercise videos they can follow on their phone. Rehabify Scribe also drafts your clinical note after a session.

Would a 15-minute call this week be useful, to see if it fits how {clinic_name} works?`,
    waitDays: 0,
  },
  {
    subject: "",
    body: `Hello again,

Following up on my note below. One thing clinics use Rehabify for is keeping patients doing their exercises between visits: each patient gets their programme on their phone, and you can see who is keeping up.

Happy to show you in 15 minutes, or send a short video if that's easier.`,
    waitDays: 3,
  },
  {
    subject: "",
    body: `Hello,

I won't keep filling your inbox, so this is my last note. If an easier way to run {clinic_name}'s records, bookings and home programmes would help, just reply to this email and I'll set you up.

Clinic plans start at ₦25,000 a month for the whole clinic.`,
    waitDays: 4,
  },
];

const SEQ_TONE: Record<SeqStatus, "green" | "amber" | "neutral"> = {
  active: "green",
  paused: "amber",
  draft: "neutral",
};
const SEQ_LABEL: Record<SeqStatus, string> = {
  active: "Sending",
  paused: "Paused",
  draft: "Draft",
};
const ENROLL: Record<
  EnrollStatus,
  { label: string; tone: "green" | "teal" | "amber" | "red" | "neutral" }
> = {
  active: { label: "In sequence", tone: "teal" },
  finished: { label: "All sent, no reply", tone: "neutral" },
  replied: { label: "Replied", tone: "green" },
  bounced: { label: "Bounced", tone: "amber" },
  unsubscribed: { label: "Asked to stop", tone: "red" },
  stopped: { label: "Removed", tone: "neutral" },
};

const errorText = (err: unknown) =>
  err instanceof ConvexError && typeof err.data === "string"
    ? err.data
    : err instanceof Error
      ? err.message.replace(/^.*ConvexError: /, "").split("\n")[0]
      : "Something went wrong. Please try again.";

const pct = (part: number, whole: number) =>
  whole ? `${Math.round((part / whole) * 100)}%` : "—";

export function OutreachSender({ defaultTestTo }: { defaultTestTo?: string }) {
  const data = useQuery(overviewRef, {});
  const saveSender = useMutation(saveSenderRef);
  const saveSequence = useMutation(saveSequenceRef);
  const enroll = useMutation(enrollRef);
  const stopEnrollment = useMutation(stopRef);
  const sendTest = useAction(testRef);
  const checkInbox = useAction(checkInboxRef);

  const [busy, setBusy] = useState<string | null>(null);
  const run = async (
    key: string,
    task: () => Promise<unknown>,
    done?: string,
  ) => {
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

  // Sequence editor
  const [editing, setEditing] = useState<{
    id?: string;
    name: string;
    status: SeqStatus;
    steps: Step[];
  } | null>(null);
  const [testTo, setTestTo] = useState(defaultTestTo ?? "");
  useEffect(() => {
    if (!testTo && data?.connection.address) setTestTo(data.connection.address);
  }, [data?.connection.address, testTo]);

  // Adding clinics
  const [enrollSeq, setEnrollSeq] = useState("");
  const [enrollCity, setEnrollCity] = useState("");
  const [enrollLimit, setEnrollLimit] = useState(50);
  useEffect(() => {
    if (!enrollSeq && data?.sequences[0]) setEnrollSeq(data.sequences[0]._id);
  }, [data?.sequences, enrollSeq]);

  // Sender settings form
  const [form, setForm] = useState<Overview["settings"] | null>(null);
  useEffect(() => {
    if (data && !form) setForm(data.settings);
  }, [data, form]);

  const [listFilter, setListFilter] = useState<EnrollStatus | "all">("all");
  const listed = useMemo(
    () =>
      (data?.enrollments ?? []).filter(
        (e) => listFilter === "all" || e.status === listFilter,
      ),
    [data?.enrollments, listFilter],
  );
  const seqName = useMemo(
    () => new Map((data?.sequences ?? []).map((s) => [s._id, s.name])),
    [data?.sequences],
  );

  if (data === undefined) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  const s = data.settings;
  const eligibleHere = enrollCity
    ? (data.eligible.cities.find((c) => c.name === enrollCity)?.count ?? 0)
    : data.eligible.total;
  const activeSequences = data.sequences.filter(
    (q) => q.status === "active",
  ).length;

  const saveEditing = (status?: SeqStatus) =>
    editing &&
    run(
      "save-seq",
      async () => {
        const id = await saveSequence({
          ...(editing.id ? { sequenceId: editing.id } : {}),
          name: editing.name,
          steps: editing.steps,
          status: status ?? editing.status,
        });
        setEditing({ ...editing, id, status: status ?? editing.status });
      },
      "Sequence saved",
    );

  return (
    <div className="space-y-5">
      {/* The switch */}
      <Panel
        title="Sending"
        description={
          data.connection.configured
            ? `From ${s.fromName} <${data.connection.address}>, one email at a time, weekdays 9:00–17:00 Lagos time.`
            : "Connect the inbox first: add OUTREACH_SMTP_USER and OUTREACH_SMTP_PASS on Convex."
        }
        actions={
          <button
            type="button"
            disabled={!data.connection.configured || busy !== null}
            onClick={() =>
              run(
                "switch",
                () => saveSender({ sendingOn: !s.sendingOn }),
                s.sendingOn ? "Sending paused" : "Sending is on",
              )
            }
            className={s.sendingOn ? softButtonClass : primaryButtonClass}
          >
            {busy === "switch" ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : s.sendingOn ? (
              <Pause className="mr-1.5 h-4 w-4" />
            ) : (
              <Play className="mr-1.5 h-4 w-4" />
            )}
            {s.sendingOn ? "Pause sending" : "Start sending"}
          </button>
        }
      >
        <div className="space-y-2 p-5 text-sm text-rh-ink dark:text-white">
          <p>
            <StatusBadge tone={s.sendingOn ? "green" : "neutral"}>
              {s.sendingOn ? "On" : "Off"}
            </StatusBadge>{" "}
            <span className="ml-1">
              Today: <strong>{data.today.sent}</strong> of {data.today.quota}{" "}
              sent.
              <DailyLimitTip
                today={data.today}
                ramp={s}
                sendingOn={s.sendingOn}
                audience="clinic"
              />{" "}
              {!data.today.weekday
                ? "No emails at weekends."
                : data.today.windowOpen
                  ? ""
                  : "Outside 9:00–17:00, so nothing goes out now."}
            </span>
          </p>
          {s.sendingOn && activeSequences === 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              No sequence is set to Sending yet, so nothing will go out.
            </p>
          )}
          <p className="text-xs text-neutral-500">
            The daily limit starts at {s.dailyStart} and grows by {s.rampPerDay}{" "}
            each weekday up to {s.dailyMax}, so the new inbox builds a good name
            before it sends more.
          </p>
          {s.lastSendError && (
            <p className="text-xs text-rose-600">
              Last problem
              {s.lastSendErrorAt
                ? ` (${formatDistanceToNowStrict(s.lastSendErrorAt, { addSuffix: true })})`
                : ""}
              : {s.lastSendError}
            </p>
          )}
          <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            Replies are checked every 15 minutes
            {data.inboxCheck.at
              ? `, last ${formatDistanceToNowStrict(data.inboxCheck.at, { addSuffix: true })}`
              : ""}
            .
            {data.inboxCheck.error && (
              <span className="text-rose-600">{data.inboxCheck.error}</span>
            )}
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:underline"
              disabled={busy !== null}
              onClick={() =>
                run("inbox", () => checkInbox({}), "Inbox checked")
              }
            >
              {busy === "inbox" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}{" "}
              Check now
            </button>
          </p>
        </div>
      </Panel>

      <OutreachNumbersTiles n={data.numbers} audience="clinic" />

      {/* Sequences */}
      <Panel
        title="Sequences"
        description="The first email and its follow-ups. A follow-up with no subject replies in the same thread. Any reply stops the rest."
        actions={
          !editing && (
            <button
              type="button"
              className={softButtonClass}
              onClick={() =>
                setEditing({
                  name: "Clinics: first contact",
                  status: "draft",
                  steps: DEFAULT_STEPS,
                })
              }
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
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
                placeholder="Sequence name"
                aria-label="Sequence name"
                className={fieldClass}
              />
              <select
                value={editing.status}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    status: e.target.value as SeqStatus,
                  })
                }
                aria-label="Status"
                className={fieldClass}
              >
                <option value="draft">Draft</option>
                <option value="active">Sending</option>
                <option value="paused">Paused</option>
              </select>
            </div>
            <p className="text-xs text-neutral-500">
              Fill-ins: <code>{"{clinic_name}"}</code> and{" "}
              <code>{"{city}"}</code>. Your signature and the &ldquo;reply
              stop&rdquo; line are added under every email.
            </p>
            {editing.steps.map((step, i) => (
              <div
                key={i}
                className="space-y-2 rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]"
              >
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
                            steps: editing.steps.map((x, j) =>
                              j === i
                                ? { ...x, waitDays: Number(e.target.value) }
                                : x,
                            ),
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
                      onClick={() =>
                        setEditing({
                          ...editing,
                          steps: editing.steps.filter((_, j) => j !== i),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <input
                  value={step.subject}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      steps: editing.steps.map((x, j) =>
                        j === i ? { ...x, subject: e.target.value } : x,
                      ),
                    })
                  }
                  placeholder={
                    i === 0
                      ? "Subject"
                      : "Leave empty to reply in the same thread"
                  }
                  aria-label={`Subject of email ${i + 1}`}
                  className={fieldClass}
                />
                <textarea
                  value={step.body}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      steps: editing.steps.map((x, j) =>
                        j === i ? { ...x, body: e.target.value } : x,
                      ),
                    })
                  }
                  rows={i === 0 ? 10 : 7}
                  aria-label={`Words of email ${i + 1}`}
                  className={textareaFieldClass}
                />
              </div>
            ))}
            {editing.steps.length < 5 && (
              <button
                type="button"
                className="text-sm text-neutral-600 hover:underline dark:text-neutral-300"
                onClick={() =>
                  setEditing({
                    ...editing,
                    steps: [
                      ...editing.steps,
                      { subject: "", body: "", waitDays: 5 },
                    ],
                  })
                }
              >
                + Add a follow-up
              </button>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-black/[0.05] pt-4 dark:border-white/[0.06]">
              <button
                type="button"
                className={primaryButtonClass}
                disabled={busy !== null}
                onClick={() => saveEditing()}
              >
                {busy === "save-seq" && (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                )}{" "}
                Save
              </button>
              <button
                type="button"
                className={softButtonClass}
                onClick={() => setEditing(null)}
              >
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
                      const res = await sendTest({
                        sequenceId: editing.id!,
                        to: testTo,
                      });
                      toast.success(
                        `Sent ${res.sent} test email${res.sent === 1 ? "" : "s"} to ${testTo}`,
                      );
                    })
                  }
                >
                  {busy === "test" ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-1.5 h-4 w-4" />
                  )}{" "}
                  Send me a test
                </button>
              </span>
            </div>
          </div>
        ) : data.sequences.length === 0 ? (
          <EmptyState
            title="No sequence yet"
            description="Press New sequence: it starts with a first email and two follow-ups you can edit."
          />
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {data.sequences.map((q) => (
              <li
                key={q._id}
                className="flex flex-wrap items-center gap-3 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium text-rh-ink dark:text-white">
                    {q.name}{" "}
                    <StatusBadge tone={SEQ_TONE[q.status]}>
                      {SEQ_LABEL[q.status]}
                    </StatusBadge>
                  </p>
                  <p className="text-xs text-neutral-500">
                    {q.steps.length} email{q.steps.length === 1 ? "" : "s"} ·{" "}
                    {q.stats.total} clinics · {q.stats.contacted} emailed ·{" "}
                    {q.stats.replied} replied (
                    {pct(q.stats.replied, q.stats.contacted)}) ·{" "}
                    {q.stats.bounced} bounced
                  </p>
                </div>
                {q.status !== "active" ? (
                  <button
                    type="button"
                    className={softButtonClass}
                    disabled={busy !== null}
                    onClick={() =>
                      run(
                        `seq-${q._id}`,
                        () =>
                          saveSequence({
                            sequenceId: q._id,
                            name: q.name,
                            steps: q.steps,
                            status: "active",
                          }),
                        "Sequence is sending",
                      )
                    }
                  >
                    <Play className="mr-1.5 h-4 w-4" /> Send
                  </button>
                ) : (
                  <button
                    type="button"
                    className={softButtonClass}
                    disabled={busy !== null}
                    onClick={() =>
                      run(
                        `seq-${q._id}`,
                        () =>
                          saveSequence({
                            sequenceId: q._id,
                            name: q.name,
                            steps: q.steps,
                            status: "paused",
                          }),
                        "Sequence paused",
                      )
                    }
                  >
                    <Pause className="mr-1.5 h-4 w-4" /> Pause
                  </button>
                )}
                <button
                  type="button"
                  className={softButtonClass}
                  onClick={() =>
                    setEditing({
                      id: q._id,
                      name: q.name,
                      status: q.status,
                      steps: q.steps,
                    })
                  }
                >
                  <Pencil className="mr-1.5 h-4 w-4" /> Edit
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Adding clinics */}
      <Panel
        title="Add clinics"
        description="Clinics with an email that are Ready or Exported, never emailed before. An email address is only ever added once."
      >
        {data.sequences.length === 0 ? (
          <p className="p-5 text-sm text-neutral-500">Make a sequence first.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2 p-5">
            <select
              value={enrollSeq}
              onChange={(e) => setEnrollSeq(e.target.value)}
              aria-label="Sequence"
              className={cn(fieldClass, "h-9 w-auto py-1")}
            >
              {data.sequences.map((q) => (
                <option key={q._id} value={q._id}>
                  {q.name}
                </option>
              ))}
            </select>
            <select
              value={enrollCity}
              onChange={(e) => setEnrollCity(e.target.value)}
              aria-label="City"
              className={cn(fieldClass, "h-9 w-auto py-1")}
            >
              <option value="">All cities ({data.eligible.total})</option>
              {data.eligible.cities.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
            <span className="flex items-center gap-1 text-sm text-neutral-500">
              up to
              <input
                type="number"
                min={1}
                max={1000}
                value={enrollLimit}
                onChange={(e) => setEnrollLimit(Number(e.target.value))}
                aria-label="How many"
                className={cn(fieldClass, "h-9 w-20 py-1")}
              />
            </span>
            <button
              type="button"
              className={primaryButtonClass}
              disabled={busy !== null || !enrollSeq || eligibleHere === 0}
              onClick={() =>
                run("enroll", async () => {
                  const res = await enroll({
                    sequenceId: enrollSeq,
                    ...(enrollCity ? { city: enrollCity } : {}),
                    limit: enrollLimit,
                  });
                  toast.success(
                    `Added ${res.added} clinic${res.added === 1 ? "" : "s"}${res.skipped ? ` (${res.skipped} skipped: no email, already emailed or do not contact)` : ""}`,
                  );
                })
              }
            >
              {busy === "enroll" && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}{" "}
              Add {Math.min(eligibleHere, enrollLimit)} clinic
              {Math.min(eligibleHere, enrollLimit) === 1 ? "" : "s"}
            </button>
          </div>
        )}
      </Panel>

      {/* Replies */}
      <Panel
        title="Replies and bounces"
        description="What came back from clinics, newest first: real replies, automatic out-of-office replies and bounces. Read and answer replies in the hello@ inbox in Zoho."
        info={REPLIES_INFO}
      >
        {data.inbox.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-5 w-5" />}
            title="Nothing yet"
            description="Replies show here within 15 minutes of arriving."
          />
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {data.inbox.map((m) => (
              <li key={m._id} className="space-y-1 px-5 py-3">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-rh-ink dark:text-white">
                  {m.leadName}
                  <StatusBadge tone={inboxLabel(m.kind, m.intent).tone}>
                    {inboxLabel(m.kind, m.intent).label}
                  </StatusBadge>
                  <span className="text-xs font-normal text-neutral-500">
                    {formatDistanceToNowStrict(m.receivedAt, {
                      addSuffix: true,
                    })}
                  </span>
                </p>
                <p className="text-xs text-neutral-500">
                  {m.fromEmail} · {m.subject}
                </p>
                {m.snippet && (
                  <p className="text-sm text-neutral-700 dark:text-neutral-300">
                    {m.snippet}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {data.inboxTotal > data.inboxShown && (
          <p className="border-t border-black/[0.05] px-5 py-3 text-xs text-neutral-500 dark:border-white/[0.06]">
            Showing the newest {data.inboxShown} of {data.inboxTotal}. The numbers
            above count them all.
          </p>
        )}
      </Panel>

      {/* Who is where */}
      <Panel
        title="Clinics in sequences"
        info={
          <>
            <p>Where each clinic you added is up to.</p>
            <p>
              In sequence: more emails to come (or the first one is still
              waiting). All sent, no reply: every email went and nobody
              answered. Replied: a real person answered, so the follow-ups
              stopped. Bounced: the address doesn&apos;t work. Asked to stop:
              never emailed again. Removed: taken out by the team, or the
              clinic was closed.
            </p>
          </>
        }
      >
        <div className="border-b border-black/[0.05] px-5 py-3 dark:border-white/[0.06]">
          <FilterChips
            value={listFilter}
            onChange={setListFilter}
            options={(
              [
                "all",
                "active",
                "replied",
                "finished",
                "bounced",
                "unsubscribed",
                "stopped",
              ] as const
            ).map((f) => ({
              value: f,
              label: f === "all" ? "All" : ENROLL[f].label,
              count: f === "all" ? data.totals.total : data.totals[f],
            }))}
          />
        </div>
        {listed.length === 0 ? (
          <EmptyState
            title="No clinics here"
            description="Add clinics above."
          />
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {listed.map((e) => (
              <li
                key={e._id}
                className="flex flex-wrap items-center gap-3 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-rh-ink dark:text-white">
                    {e.leadName}{" "}
                    <StatusBadge tone={ENROLL[e.status].tone}>
                      {ENROLL[e.status].label}
                    </StatusBadge>
                  </p>
                  <p className="text-xs text-neutral-500">
                    {e.email} · {e.city} ·{" "}
                    {seqName.get(e.sequenceId) ?? "Sequence"} · {e.sentSteps}{" "}
                    sent
                    {e.status === "active" && e.nextSendAt
                      ? ` · next ${e.nextSendAt <= Date.now() ? "in the next sending window" : format(e.nextSendAt, "EEE d MMM")}`
                      : ""}
                    {e.stoppedReason && e.status !== "active"
                      ? ` · ${e.stoppedReason}`
                      : ""}
                  </p>
                </div>
                {e.status === "active" && (
                  <button
                    type="button"
                    className="text-xs text-neutral-500 hover:text-rose-600 hover:underline"
                    disabled={busy !== null}
                    onClick={() =>
                      run(
                        `stop-${e._id}`,
                        () => stopEnrollment({ enrollmentId: e._id }),
                        "Removed from the sequence",
                      )
                    }
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Sender settings */}
      {form && (
        <Panel
          title="Sender"
          description="How the emails are signed, and how fast the daily limit grows."
          info={
            <>
              <p>
                First day: the limit on the first day sending was switched on.
                More each day: added every weekday after that. Most a day: the
                limit never goes above this.
              </p>
              <p>
                The limit is shared by clinic and employer emails. Start slowly:
                a new mailbox that sends a lot at once lands in spam.
              </p>
              <p>
                Employer outreach can set its own name and signature (Sequences
                tab, Sender). Until it does, companies get the ones here.
              </p>
            </>
          }
        >
          <form
            className="grid gap-3 p-5 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                "sender",
                () =>
                  saveSender({
                    fromName: form.fromName,
                    signature: form.signature,
                    optOut: form.optOut,
                    dailyStart: form.dailyStart,
                    rampPerDay: form.rampPerDay,
                    dailyMax: form.dailyMax,
                  }),
                "Saved",
              );
            }}
          >
            <label className="space-y-1 text-sm text-rh-ink dark:text-white">
              From name
              <input
                value={form.fromName}
                onChange={(e) => setForm({ ...form, fromName: e.target.value })}
                className={fieldClass}
                placeholder="e.g. Mary from Rehabify"
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["dailyStart", "First day"],
                  ["rampPerDay", "More each day"],
                  ["dailyMax", "Most a day"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="space-y-1 text-sm text-rh-ink dark:text-white"
                >
                  {label}
                  <input
                    type="number"
                    min={0}
                    value={form[key]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: Number(e.target.value) })
                    }
                    className={fieldClass}
                  />
                </label>
              ))}
            </div>
            <label className="space-y-1 text-sm text-rh-ink dark:text-white">
              Signature
              <textarea
                rows={3}
                value={form.signature}
                onChange={(e) =>
                  setForm({ ...form, signature: e.target.value })
                }
                className={textareaFieldClass}
              />
            </label>
            <label className="space-y-1 text-sm text-rh-ink dark:text-white">
              How to stop the emails (always added)
              <textarea
                rows={3}
                value={form.optOut}
                onChange={(e) => setForm({ ...form, optOut: e.target.value })}
                className={textareaFieldClass}
              />
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className={primaryButtonClass}
                disabled={busy !== null}
              >
                {busy === "sender" && (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                )}{" "}
                Save
              </button>
            </div>
          </form>
        </Panel>
      )}
    </div>
  );
}
