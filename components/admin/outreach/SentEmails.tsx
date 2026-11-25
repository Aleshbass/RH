"use client";

/**
 * Admin › Clinic outreach and Employer outreach › Sent emails (outreachSent:adminSentEmails): every
 * email Rehabify sent to that list, newest first and grouped by day, with what came back since.
 * Owner, 21 Nov 2026: the team couldn't see which emails were ours. They may not show in Zoho's
 * Sent folder, and a warm-up tool's look-alike emails sit in the same inbox, so this is the record.
 */

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, Globe, MapPin, Phone, Send } from "@/components/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, FilterChips, Panel, StatusBadge } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { dayName, inboxLabel, type Audience } from "./OutreachHelp";

type Outcome = "no_answer" | "followed_up" | "bounced" | "replied" | "not_interested" | "asked_to_stop" | "removed";

type SentRow = {
  _id: string;
  leadId: string;
  sentAt: number;
  day: string;
  name: string;
  city: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  to: string;
  personName: string | null;
  personRole: string | null;
  step: number;
  steps: number;
  sequenceName: string;
  subject: string;
  threaded: boolean;
  outcome: Outcome;
  autoReply: boolean;
  events: { kind: string; intent: string | null; fromEmail: string | null; snippet: string; receivedAt: number }[];
  stoppedReason: string | null;
};
type SentData = { rows: SentRow[]; capped: boolean; limit: number };

// Plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const sentRef = makeFunctionReference<"query", { audience: Audience }, SentData>("outreachSent:adminSentEmails");

const OUTCOME: Record<Outcome, { label: string; tone: "green" | "teal" | "amber" | "red" | "neutral" }> = {
  no_answer: { label: "No answer yet", tone: "neutral" },
  followed_up: { label: "No answer, followed up", tone: "neutral" },
  bounced: { label: "Bounced (address doesn't work)", tone: "amber" },
  replied: { label: "Replied", tone: "green" },
  not_interested: { label: "Replied: not interested", tone: "neutral" },
  asked_to_stop: { label: "Asked to stop", tone: "red" },
  removed: { label: "Taken out of the sequence", tone: "neutral" },
};

type Filter = "all" | "bounced" | "auto" | "replies";
const isReply = (r: SentRow) => r.outcome === "replied" || r.outcome === "not_interested" || r.outcome === "asked_to_stop";
const matches = (r: SentRow, f: Filter) =>
  f === "all" || (f === "bounced" ? r.outcome === "bounced" : f === "auto" ? r.autoReply : isReply(r));

/** "10:42" in Lagos (UTC+1 all year), whatever the viewer's own time zone */
const lagosTime = (ms: number) => new Date(ms + 3_600_000).toISOString().slice(11, 16);
const lagosDayOf = (ms: number) => new Date(ms + 3_600_000).toISOString().slice(0, 10);
const shortDay = (day: string) => format(new Date(`${day}T12:00:00Z`), "d MMM");

const emailNumber = (r: SentRow) => `Email ${r.step + 1} of ${r.steps}${r.step > 0 ? " (follow-up)" : ""}`;

export function SentEmails({ audience, onOpenLead }: { audience: Audience; onOpenLead?: (leadId: string) => void }) {
  const data = useQuery(sentRef, { audience });
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const clinic = audience === "clinic";

  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const groups = useMemo(() => {
    const perDay = new Map<string, number>();
    for (const r of rows) perDay.set(r.day, (perDay.get(r.day) ?? 0) + 1);
    const out: { day: string; total: number; rows: SentRow[] }[] = [];
    for (const r of rows) {
      if (!matches(r, filter)) continue;
      let group = out[out.length - 1];
      if (!group || group.day !== r.day) {
        group = { day: r.day, total: perDay.get(r.day) ?? 0, rows: [] };
        out.push(group);
      }
      group.rows.push(r);
    }
    return out;
  }, [rows, filter]);
  // Each address's emails in this list, oldest first, for the open row
  const historyOf = (r: SentRow) => rows.filter((x) => x.leadId === r.leadId && x.to === r.to).sort((a, b) => a.sentAt - b.sentAt);

  return (
    <Panel
      title="Sent emails"
      description={`Every email Rehabify sent to ${clinic ? "clinics" : "companies"} from hello@, newest first, and what happened since.`}
      info={
        <>
          <p>
            Only Rehabify&apos;s outreach emails to {clinic ? "clinics" : "companies"} are listed here. They may not show in Zoho&apos;s Sent
            folder, so this list is the record.
          </p>
          <p>Emails from a warm-up tool such as TrulyInbox are never listed: they aren&apos;t ours.</p>
          <p>
            &ldquo;No answer yet&rdquo; means the email went out and nothing has come back. Bounces usually come back within minutes; replies
            show within 15 minutes of arriving.
          </p>
        </>
      }
    >
      {data === undefined ? (
        <div className="space-y-2 p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Send className="h-5 w-5" />}
          title="Nothing sent yet."
          description="Emails go out in the sending hours set under Sender on Clinic outreach."
        />
      ) : (
        <>
          <div className="border-b border-black/[0.05] px-5 py-3 dark:border-white/[0.06]">
            <FilterChips
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: rows.length },
                { value: "bounced", label: "Bounced", count: rows.filter((r) => r.outcome === "bounced").length },
                { value: "auto", label: "Auto-replies", count: rows.filter((r) => r.autoReply).length },
                { value: "replies", label: "Replies", count: rows.filter(isReply).length },
              ]}
            />
          </div>
          {groups.length === 0 ? (
            <EmptyState title="No emails here" description="Nothing matches this filter yet. Choose All to see every email." />
          ) : (
            groups.map((g) => (
              <div key={g.day}>
                <p className="border-b border-black/[0.05] bg-rh-canvas/60 px-5 py-2 text-xs font-semibold text-rh-ink dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-white">
                  {dayName(g.day)} {shortDay(g.day)} · {g.total} sent
                  {filter !== "all" && <span className="font-normal text-neutral-500"> · {g.rows.length} shown</span>}
                </p>
                <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                  {g.rows.map((r) => {
                    const open = openId === r._id;
                    const outcome = OUTCOME[r.outcome];
                    const history = open ? historyOf(r) : [];
                    return (
                      <li key={r._id}>
                        <button
                          type="button"
                          aria-expanded={onOpenLead ? undefined : open}
                          onClick={() => (onOpenLead ? onOpenLead(r.leadId) : setOpenId(open ? null : r._id))}
                          className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-rh-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rh-lime dark:hover:bg-white/[0.03]"
                        >
                          <span className="w-11 shrink-0 pt-0.5 text-xs tabular-nums text-neutral-500">{lagosTime(r.sentAt)}</span>
                          <span className="min-w-0 flex-1 space-y-0.5">
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-sm font-medium text-rh-ink dark:text-white">{r.name}</span>
                              {r.city && <span className="text-xs text-neutral-500">{r.city}</span>}
                              <StatusBadge tone={outcome.tone}>{outcome.label}</StatusBadge>
                              {r.autoReply && <StatusBadge tone="neutral">Automatic reply (out of office)</StatusBadge>}
                            </span>
                            <span className="block break-all text-xs text-neutral-500">
                              to {r.personName ? `${r.personName}${r.personRole ? ` (${r.personRole})` : ""} · ` : ""}
                              {r.to}
                            </span>
                            <span className="block text-xs text-neutral-600 dark:text-neutral-300">
                              {emailNumber(r)} ·{" "}
                              {r.threaded ? (
                                <span className="italic text-neutral-500">(follow-up in the same thread)</span>
                              ) : (
                                r.subject || <span className="italic text-neutral-500">(no subject)</span>
                              )}
                            </span>
                          </span>
                          {!onOpenLead &&
                            (open ? (
                              <ChevronUp className="mt-1 h-3.5 w-3.5 shrink-0 text-neutral-400" />
                            ) : (
                              <ChevronDown className="mt-1 h-3.5 w-3.5 shrink-0 text-neutral-400" />
                            ))}
                        </button>
                        {open && !onOpenLead && (
                          <div className="space-y-3 bg-rh-canvas/40 px-5 pb-4 pl-[4.75rem] pt-1 text-xs text-neutral-600 dark:bg-white/[0.02] dark:text-neutral-300">
                            <p className="flex flex-wrap gap-x-4 gap-y-1 text-neutral-500">
                              {(r.address || r.city) && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5" />
                                  {r.address ?? r.city}
                                </span>
                              )}
                              {r.phone && (
                                <a href={`tel:${r.phone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1 hover:underline">
                                  <Phone className="h-3.5 w-3.5" />
                                  {r.phone}
                                </a>
                              )}
                              {r.website && (
                                <a
                                  href={/^https?:/i.test(r.website) ? r.website : `https://${r.website}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 hover:underline"
                                >
                                  <Globe className="h-3.5 w-3.5" />
                                  {r.website.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "").slice(0, 40)}
                                </a>
                              )}
                            </p>
                            <p>
                              Sequence: <span className="font-medium text-rh-ink dark:text-white">{r.sequenceName}</span>
                              {r.threaded && <> · sent as &ldquo;{r.subject}&rdquo;</>}
                            </p>
                            <div className="space-y-1.5">
                              <p className="font-medium text-rh-ink dark:text-white">What came back after this email</p>
                              {r.events.length === 0 ? (
                                <p>
                                  {r.outcome === "bounced"
                                    ? "Nothing came back in the inbox, but their mail server refused our next email, so the address is marked bounced."
                                    : "Nothing has come back from this address yet."}
                                </p>
                              ) : (
                                <ul className="space-y-1.5">
                                  {r.events.map((ev, i) => {
                                    const l = inboxLabel(ev.kind, ev.intent);
                                    return (
                                      <li key={i} className="space-y-0.5">
                                        <p className="flex flex-wrap items-center gap-2">
                                          <StatusBadge tone={l.tone}>{l.label}</StatusBadge>
                                          <span className="text-neutral-500">
                                            {dayName(lagosDayOf(ev.receivedAt)).slice(0, 3)} {lagosTime(ev.receivedAt)}
                                            {ev.fromEmail ? ` · ${ev.fromEmail}` : ""}
                                          </span>
                                        </p>
                                        {ev.snippet && <p className="text-neutral-700 dark:text-neutral-300">{ev.snippet}</p>}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                            {history.length > 1 && (
                              <div className="space-y-1">
                                <p className="font-medium text-rh-ink dark:text-white">Every email to this address</p>
                                <ul className="space-y-0.5">
                                  {history.map((h) => (
                                    <li key={h._id}>
                                      Email {h.step + 1} · {dayName(h.day).slice(0, 3)} {shortDay(h.day)} {lagosTime(h.sentAt)} · {OUTCOME[h.outcome].label}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {r.stoppedReason && <p>No more emails to this address: {r.stoppedReason}</p>}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
          {data.capped && (
            <p className="border-t border-black/[0.05] px-5 py-3 text-xs text-neutral-500 dark:border-white/[0.06]">
              Showing the newest {data.limit} emails.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
