"use client";

import type { ComponentType, ReactNode } from "react";
import { ConvexError } from "convex/values";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ChevronRight, FileText } from "@/components/icons";
import { StatusBadge, initials, type Tone } from "@/components/patient/ui";
import { cn } from "@/lib/utils";
import {
  DOCTOR_STEPS,
  DOCTOR_URGENCY_LABELS,
  doctorStageLabel,
  isDoctorOutcome,
  type DoctorStage,
} from "@/convex/helpers/doctorStages";
import type { DoctorReferralRow } from "./refs";

/**
 * Small pieces of the referring doctor's portal, on the patient/physio design system
 * (components/patient/ui.tsx, colours in app/patient-portal.css): ink for the main action,
 * Rehabify green only for care moving forward, soft tints to tell things apart. No teal.
 */

export const STAGE_TONE: Record<DoctorStage, Tone> = {
  received: "neutral",
  contacted: "blue",
  booked: "violet",
  seen: "blue",
  in_treatment: "green",
  discharged: "green",
  declined: "rose",
  not_suitable: "neutral",
  unreachable: "neutral",
  closed: "neutral",
};

export function StageBadge({ stage, className }: { stage: DoctorStage; className?: string }) {
  return (
    <StatusBadge tone={STAGE_TONE[stage]} dot className={className}>
      {doctorStageLabel(stage)}
    </StatusBadge>
  );
}

/** Six short segments: how far along the referral is. Grey once it ended early. */
export function StepBar({ stage, stepIndex, className }: { stage: DoctorStage; stepIndex: number; className?: string }) {
  const ended = isDoctorOutcome(stage);
  return (
    <div
      className={cn("flex items-center gap-1", className)}
      role="img"
      aria-label={`${doctorStageLabel(stage)}: step ${Math.min(stepIndex + 1, DOCTOR_STEPS.length)} of ${DOCTOR_STEPS.length}`}
    >
      {DOCTOR_STEPS.map((step, i) => (
        <span
          key={step.key}
          className={cn(
            "h-1.5 flex-1 rounded-full",
            i <= stepIndex ? (ended ? "bg-pt-faint" : "bg-pt-accent") : "bg-pt-line-strong"
          )}
        />
      ))}
    </div>
  );
}

/** One referral in a list; opens the referral drawer. */
export function ReferralListRow({ row, onOpen }: { row: DoctorReferralRow; onOpen: (id: string) => void }) {
  const team = row.careTeam.physio ?? row.careTeam.clinic;
  return (
    <button
      type="button"
      onClick={() => onOpen(row.referralId)}
      className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-pt-hover focus-visible:bg-pt-hover focus-visible:outline-none sm:px-6"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pt-sunken text-[13px] font-semibold text-pt-muted">
        {initials(row.patientName)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-[15px] font-semibold text-pt-ink">{row.patientName || "Patient"}</span>
          {row.urgency !== "routine" && (
            <StatusBadge tone={row.urgency === "urgent" ? "rose" : "sun"}>{DOCTOR_URGENCY_LABELS[row.urgency]}</StatusBadge>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-pt-muted">
          {[row.condition, team ? `with ${team}` : null, `referred ${shortDate(row.createdAt)}`].filter(Boolean).join(" · ")}
        </span>
        <StepBar stage={row.stage} stepIndex={row.stepIndex} className="mt-2 max-w-[220px]" />
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <StageBadge stage={row.stage} />
        {row.reportCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-pt-muted">
            <FileText className="h-3 w-3" />
            {row.reportCount === 1 ? "Report" : `${row.reportCount} reports`}
          </span>
        )}
      </span>
      <ChevronRight className="hidden h-4 w-4 shrink-0 text-pt-faint sm:block" />
    </button>
  );
}

/** A choice of two to four options in one row (urgency, where). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; icon?: ComponentType<{ className?: string }> }>;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1 rounded-2xl bg-pt-sunken p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50",
              active ? "bg-pt-surface text-pt-ink shadow-pt dark:shadow-none" : "text-pt-muted hover:text-pt-ink"
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function FieldLabel({ htmlFor, children, hint }: { htmlFor?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-center justify-between gap-2 text-[13px] font-medium text-pt-ink">
      <span className="flex items-center gap-1">{children}</span>
      {hint && <span className="text-xs font-normal text-pt-faint">{hint}</span>}
    </label>
  );
}

/** Native inputs on the portal's colours (no shadcn wrapper needed). */
export const inputClass =
  "h-11 w-full rounded-xl border border-pt-line-strong bg-pt-surface px-3.5 text-[15px] text-pt-ink placeholder:text-pt-faint transition focus:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/40 disabled:opacity-60";
export const textareaClass =
  "w-full resize-none rounded-xl border border-pt-line-strong bg-pt-surface px-3.5 py-2.5 text-[15px] text-pt-ink placeholder:text-pt-faint transition focus:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/40";
export const selectClass =
  "h-10 rounded-xl border border-pt-line-strong bg-pt-surface px-3 text-sm text-pt-ink transition focus:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/40";

export function formatKobo(kobo: number | null | undefined): string {
  if (kobo === null || kobo === undefined || !Number.isFinite(kobo)) return "—";
  const sign = kobo < 0 ? "-" : "";
  return `${sign}₦${(Math.abs(kobo) / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export function shortDate(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "d MMM");
}

export function longDate(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "d MMM yyyy");
}

export function dateTime(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "EEE d MMM, h:mm a");
}

export function ago(value: number): string {
  return formatDistanceToNowStrict(value, { addSuffix: true });
}

/** Readable message from a Convex error or a plain Error. */
export function errorText(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as unknown;
    if (typeof data === "string" && data.trim()) return data;
    if (data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string") {
      return (data as { message: string }).message;
    }
  }
  if (err instanceof Error && err.message) {
    const match = err.message.match(/Uncaught (?:ConvexError|Error): ([^\n]+)/);
    if (match) return match[1];
    if (err.message.includes("[CONVEX")) return fallback;
    return err.message;
  }
  return fallback;
}

/** Digits only, for wa.me links (local Nigerian numbers get +234). */
export function whatsappDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) digits = `234${digits.slice(1)}`;
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

