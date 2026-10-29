"use client";

import { useQuery } from "convex/react";
import {
  Building2,
  CalendarDays,
  Check,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  Phone,
  Stethoscope,
  Wallet,
} from "@/components/icons";
import { DetailRow, InfoTip, LoadingBlocks, PhysioDrawer, SectionLabel } from "@/components/physio/ui";
import { StatusBadge } from "@/components/patient/ui";
import { cn } from "@/lib/utils";
import {
  DOCTOR_CARE_SETTING_LABELS,
  DOCTOR_STEP_NOW,
  DOCTOR_URGENCY_LABELS,
  isDoctorOutcome,
  type DoctorStep,
} from "@/convex/helpers/doctorStages";
import { doctorRefs, type DoctorReferralDetail, type DoctorReport } from "./refs";
import { StageBadge, dateTime, formatKobo, longDate, shortDate } from "./ui";

/** One referral in full: where it is, who is treating, sessions, reports and what was sent. */
export function ReferralDrawer({
  partnerCode,
  referralId,
  onOpenChange,
}: {
  partnerCode: string;
  referralId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useQuery(doctorRefs.detail, referralId ? { partnerCode, referralId } : "skip");

  return (
    <PhysioDrawer
      open={referralId !== null}
      onOpenChange={onOpenChange}
      title={detail?.patientName || (detail === null ? "Referral not found" : "Referral")}
      description={detail ? `${detail.trackingCode} · referred ${longDate(detail.createdAt)}` : undefined}
    >
      {detail === undefined ? (
        <LoadingBlocks rows={4} />
      ) : detail === null ? (
        <p className="text-sm text-pt-muted">This referral isn&apos;t in your list. It may belong to another account.</p>
      ) : (
        <Detail detail={detail} />
      )}
    </PhysioDrawer>
  );
}

function Detail({ detail }: { detail: DoctorReferralDetail }) {
  const ended = isDoctorOutcome(detail.stage);
  const now = detail.outcome ? detail.outcome.detail : DOCTOR_STEP_NOW[detail.stage as DoctorStep];
  const team = detail.careTeam;
  const where = detail.careSetting ? DOCTOR_CARE_SETTING_LABELS[detail.careSetting] : null;

  return (
    <div className="space-y-6 pb-2">
      <div className="rounded-2xl bg-pt-sunken p-4">
        <div className="flex items-center justify-between gap-3">
          <StageBadge stage={detail.stage} />
          <span className="text-xs text-pt-faint">Updated {shortDate(detail.updatedAt)}</span>
        </div>
        <p className="mt-2 text-[15px] font-medium text-pt-ink">{now}</p>
      </div>

      <section>
        <SectionLabel className="mb-3">Progress</SectionLabel>
        <Timeline detail={detail} />
      </section>

      <section>
        <SectionLabel className="mb-1 flex items-center gap-1">
          Care team
          <InfoTip>Shown once Rehabify matches them with a physiotherapist or routes them to a partner clinic.</InfoTip>
        </SectionLabel>
        {team.physio || team.clinic ? (
          <div className="divide-y divide-pt-line">
            {team.physio && (
              <DetailRow icon={Stethoscope} label="Physiotherapist">
                {team.physio}
              </DetailRow>
            )}
            {team.clinic && (
              <DetailRow icon={Building2} label="Clinic">
                {team.clinic}
              </DetailRow>
            )}
          </div>
        ) : (
          <p className="py-2 text-sm text-pt-muted">{ended ? "No one was assigned." : "We'll show who is treating them once they're matched."}</p>
        )}
        {(detail.sessions.completed > 0 || detail.sessions.upcoming > 0) && (
          <DetailRow icon={CalendarDays} label="Sessions">
            {[
              `${detail.sessions.completed} done`,
              detail.sessions.upcoming ? `${detail.sessions.upcoming} booked` : null,
              detail.sessions.planned ? `${detail.sessions.planned} planned` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            {detail.sessions.nextAt && <span className="block text-xs text-pt-muted">Next: {dateTime(detail.sessions.nextAt)}</span>}
          </DetailRow>
        )}
      </section>

      <section>
        <SectionLabel className="mb-2 flex items-center gap-1">
          Reports
          <InfoTip>The treating physio shares progress and discharge reports with you, with the patient&apos;s agreement. Each link opens for 30 days.</InfoTip>
        </SectionLabel>
        {detail.reports.length === 0 ? (
          <p className="text-sm text-pt-muted">No reports yet. We&apos;ll let you know when the physio shares one.</p>
        ) : (
          <ul className="space-y-2">
            {detail.reports.map((report) => (
              <ReportRow key={report.id} report={report} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionLabel className="mb-1">What you sent</SectionLabel>
        <div className="divide-y divide-pt-line">
          <DetailRow icon={FileText} label="Condition">
            {detail.condition || "—"}
            {detail.urgency !== "routine" && (
              <StatusBadge tone={detail.urgency === "urgent" ? "rose" : "sun"} className="ml-2 align-middle">
                {DOCTOR_URGENCY_LABELS[detail.urgency]}
              </StatusBadge>
            )}
          </DetailRow>
          {(where || detail.city) && (
            <DetailRow icon={MapPin} label="Where">
              {[where, detail.city].filter(Boolean).join(", ")}
            </DetailRow>
          )}
          {detail.patient.phone && (
            <DetailRow icon={Phone} label="Phone">
              {detail.patient.phone}
            </DetailRow>
          )}
          {detail.patient.email && (
            <DetailRow icon={Mail} label="Email">
              {detail.patient.email}
            </DetailRow>
          )}
          {detail.notes && (
            <DetailRow label="Notes for the physio">
              <span className="whitespace-pre-line">{detail.notes}</span>
            </DetailRow>
          )}
          {detail.letter?.url && (
            <DetailRow icon={FileText} label="Referral letter">
              <a href={detail.letter.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-pt-ink underline-offset-4 hover:underline">
                <span className="truncate">{detail.letter.name}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </DetailRow>
          )}
          {detail.viaLink && <p className="py-2.5 text-xs text-pt-muted">This patient came through your referral link.</p>}
        </div>
      </section>

      {(detail.earnedKobo > 0 || detail.awaitingApprovalKobo > 0) && (
        <section className="flex items-start gap-3 rounded-2xl bg-pt-green-bg p-4">
          <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-pt-green-fg" />
          <p className="text-sm text-pt-green-fg">
            You&apos;ve earned <strong>{formatKobo(detail.earnedKobo)}</strong> from this patient&apos;s care
            {detail.awaitingApprovalKobo > 0 ? `, and ${formatKobo(detail.awaitingApprovalKobo)} is awaiting approval` : ""}.
          </p>
        </section>
      )}
    </div>
  );
}

function Timeline({ detail }: { detail: DoctorReferralDetail }) {
  const ended = isDoctorOutcome(detail.stage);
  // After an early ending, show the steps it reached, then how it ended
  const steps = ended ? detail.timeline.filter((s) => s.state !== "upcoming") : detail.timeline;
  return (
    <ol className="relative">
      {steps.map((step, i) => {
        const last = i === steps.length - 1 && !detail.outcome;
        const next = steps[i + 1];
        // Green between steps it reached; grey towards what's still to come (or how it ended)
        const reachedNext = step.state === "done" && next !== undefined && next.state !== "upcoming";
        return (
          <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
            {!last && <span aria-hidden className={cn("absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-px", reachedNext ? "bg-pt-accent" : "bg-pt-line-strong")} />}
            <span
              className={cn(
                "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                step.state === "done" && "bg-pt-accent text-[#06210a]",
                step.state === "current" && "bg-pt-primary text-pt-on-primary",
                step.state === "upcoming" && "border border-pt-line-strong bg-pt-surface"
              )}
            >
              {step.state === "done" ? <Check className="h-3 w-3" /> : step.state === "current" ? <span className="h-2 w-2 rounded-full bg-current" /> : null}
            </span>
            <span className="min-w-0 pt-0.5">
              <span className={cn("block text-sm font-medium", step.state === "upcoming" ? "text-pt-faint" : "text-pt-ink")}>{step.label}</span>
              {step.at && <span className="block text-xs text-pt-muted">{longDate(step.at)}</span>}
            </span>
          </li>
        );
      })}
      {detail.outcome && (
        <li className="relative flex gap-3">
          <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pt-neutral-bg text-pt-neutral-fg">
            <span className="h-2 w-2 rounded-full bg-current" />
          </span>
          <span className="min-w-0 pt-0.5">
            <span className="block text-sm font-medium text-pt-ink">{detail.outcome.label}</span>
            <span className="block text-xs text-pt-muted">{longDate(detail.outcome.at)}</span>
          </span>
        </li>
      )}
    </ol>
  );
}

function ReportRow({ report }: { report: DoctorReport }) {
  const title = report.kind === "discharge" ? "Discharge report" : "Progress report";
  const body = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pt-blue-bg text-pt-blue-fg">
        <FileText className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-pt-ink">{title}</span>
        <span className="block truncate text-xs text-pt-muted">
          {longDate(report.sentAt)} · {report.physioName}
        </span>
      </span>
      {report.state === "open" ? (
        <ExternalLink className="h-4 w-4 shrink-0 text-pt-muted" />
      ) : (
        <StatusBadge tone="neutral">{report.state === "expired" ? "Link expired" : "Withdrawn"}</StatusBadge>
      )}
    </>
  );
  return (
    <li>
      {report.url ? (
        <a
          href={report.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-2xl border border-pt-line px-3 py-2.5 transition hover:bg-pt-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50"
        >
          {body}
        </a>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-pt-line px-3 py-2.5">{body}</div>
      )}
    </li>
  );
}
