"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, Loader2, X } from "@/components/icons";
import type { api } from "@/convex/_generated/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Env = "sandbox" | "live";
export type CurrentUserPartner = FunctionReturnType<typeof api.partners.getCurrentUserPartner>;
export type DashboardOverview = FunctionReturnType<typeof api.partners.getPartnerDashboardOverview>;
export type PartnerInfo = DashboardOverview["partnerInfo"];
export type ReferralRow = DashboardOverview["recentReferrals"][number];
export type ProductionStatus = PartnerInfo["productionStatus"];

/** Shared props every portal tab receives. */
export type PortalContext = {
  partnerCode: string;
  environment: Env;
  info: PartnerInfo;
  isAdmin: boolean;
  /** True when the signed-in viewer may create keys / webhooks / links / test data in this environment. */
  envWritable: boolean;
  /**
   * A referring doctor (partner type "doctor"): always live, no API, webhooks or sandbox,
   * plain wording about "your patients" instead of an organisation.
   */
  isDoctor: boolean;
};

/** Where a commission came from, in plain words. */
export const COMMISSION_SOURCE_LABELS: Record<string, string> = {
  marketplace: "Online booking",
  joy: "Joy booking",
  bank_transfer: "Bank transfer",
  invoice: "Clinic invoice",
  invoice_manual: "Clinic invoice (recorded by clinic)",
  refund: "Refund adjustment",
};

export function commissionSourceLabel(source: string | null | undefined, eventType?: string): string {
  if (eventType === "refund_adjustment") return COMMISSION_SOURCE_LABELS.refund;
  if (source && COMMISSION_SOURCE_LABELS[source]) return COMMISSION_SOURCE_LABELS[source];
  if (eventType === "payment") return "Payment";
  return humanize(eventType ?? source ?? "");
}

/** Commission status labels; "pending" waits for Rehabify to approve it. */
export const COMMISSION_STATUS_LABELS: Record<string, string> = {
  pending: "Awaiting approval",
  approved: "Approved",
  paid: "Paid",
  reversed: "Reversed",
  cancelled: "Cancelled",
};

/** How a referral reached us, in plain words. */
export function referralSourceLabel(source: string | null | undefined, isDoctor: boolean): string {
  switch (source) {
    case "doctor_referral":
      return isDoctor ? "Referred by you" : "Doctor referral";
    case "partner_link":
      return isDoctor ? "Your referral link" : "Referral link";
    case "partner_portal":
      return "Portal";
    case "api":
      return "API";
    default:
      return humanize(source ?? "");
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const API_BASE_URL = "https://api.physioaroundme.com/v1";
export const DOCS_BASE_URL = "https://docs.physioaroundme.com";
export const SIGNATURE_DOCS_URL = `${DOCS_BASE_URL}/webhooks/signature-verification`;
export const PARTNER_SUPPORT_EMAIL = "partners@physioaroundme.com";

export const PUBLIC_STATUSES = [
  "received",
  "contacted",
  "booked",
  "in_treatment",
  "completed",
  "not_suitable",
  "cancelled",
  "closed",
] as const;
export type PublicStatus = (typeof PUBLIC_STATUSES)[number];

export const STATUS_META: Record<string, { label: string; color: string; dot: string }> = {
  received: { label: "Received", color: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-500" },
  contacted: { label: "Contacted", color: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500" },
  booked: { label: "Booked", color: "bg-teal-50 text-teal-700 border-teal-200", dot: "bg-teal-600" },
  in_treatment: { label: "In treatment", color: "bg-emerald-50 text-emerald-800 border-emerald-200", dot: "bg-emerald-600" },
  completed: { label: "Completed", color: "bg-green-50 text-green-800 border-green-200", dot: "bg-green-600" },
  not_suitable: { label: "Not suitable", color: "bg-orange-50 text-orange-800 border-orange-200", dot: "bg-orange-500" },
  cancelled: { label: "Cancelled", color: "bg-stone-100 text-stone-700 border-stone-200", dot: "bg-stone-400" },
  closed: { label: "Closed", color: "bg-zinc-100 text-zinc-700 border-zinc-200", dot: "bg-zinc-400" },
};

export const WEBHOOK_EVENT_TYPES = [
  "ping",
  "referral.created",
  "referral.contacted",
  "referral.provider_matched",
  "referral.booked",
  "referral.in_treatment",
  "referral.completed",
  "referral.not_suitable",
  "referral.cancelled",
  "referral.closed",
] as const;

export const SANDBOX_STEPS = [
  { value: "contacted", label: "Contacted" },
  { value: "provider_matched", label: "Provider matched" },
  { value: "booked", label: "Booked" },
  { value: "in_treatment", label: "In treatment" },
  { value: "completed", label: "Completed" },
  { value: "not_suitable", label: "Not suitable" },
  { value: "cancelled", label: "Cancelled" },
  { value: "closed", label: "Closed" },
] as const;
export type SandboxStep = (typeof SANDBOX_STEPS)[number]["value"];

export const MAGIC_PHONES = [
  { phone: "+2348000000001", effect: "→ contacted after ~5 s" },
  { phone: "+2348000000002", effect: "→ contacted, then booked (~15 s)" },
  { phone: "+2348000000003", effect: "full journey to completed (~35 s)" },
  { phone: "+2348000000004", effect: "rejected: patient ineligible (no referral created)" },
  { phone: "+2348000000005", effect: "→ not suitable after ~10 s" },
  { phone: "+2348000000006", effect: "→ cancelled after ~10 s" },
] as const;

export const WEBHOOK_RETRY_SCHEDULE = "15 s, 1 min, 5 min, 30 min, 2 h, 6 h, 12 h, 24 h";

// ─── Formatting helpers ───────────────────────────────────────────────────────

export const DASH = "—";

/** Readable message from a Convex error (ConvexError data) or a plain Error. */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as unknown;
    if (typeof data === "string" && data.trim()) return data;
    if (data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string") {
      return (data as { message: string }).message;
    }
  }
  if (err instanceof Error && err.message) {
    // Strip Convex's request prefix from unexpected server errors.
    const match = err.message.match(/Uncaught (?:ConvexError|Error): ([^\n]+)/);
    if (match) return match[1];
    if (err.message.includes("[CONVEX")) return fallback;
    return err.message;
  }
  return fallback;
}

export function formatKobo(kobo: number | null | undefined): string {
  if (kobo === null || kobo === undefined || !Number.isFinite(kobo)) return DASH;
  const sign = kobo < 0 ? "-" : "";
  return `${sign}₦${(Math.abs(kobo) / 100).toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return value.toLocaleString("en-NG");
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return `${value}%`;
}

export function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return `${value} ms`;
}

export function fmtDate(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return DASH;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? DASH : format(d, "d MMM yyyy");
}

export function fmtDateTime(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return DASH;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? DASH : format(d, "d MMM yyyy, HH:mm");
}

export function fmtTime(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return DASH;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? DASH : format(d, "d MMM, HH:mm:ss");
}

export function humanize(value: string | null | undefined): string {
  if (!value) return DASH;
  return value.replace(/[._]/g, " ").replace(/\s+/g, " ").trim();
}

/** Pretty JSON for a payload that may be a JSON string or an object. */
export function prettyJson(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Could not copy. Select the text and copy it manually.");
  }
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const escape = (cell: string | number | null | undefined) => {
    const text = cell === null || cell === undefined ? "" : String(cell);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Style tokens (keep the portal's cream / deep-teal design language) ───────

export const cardCls = "bg-white rounded-3xl border border-[#002e2c]/10 shadow-xs";
export const panelCls = "rounded-2xl bg-[#FAF6E7]/50 border border-[#002e2c]/10";
export const inputCls =
  "w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6E7]/60 border border-[#002e2c]/15 text-[#002e2c] text-xs placeholder:text-[#52706e]/60 focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20 disabled:opacity-60 disabled:cursor-not-allowed";
export const selectCls =
  "px-3 py-2 rounded-xl bg-white border border-[#002e2c]/15 text-xs font-medium text-[#002e2c] focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20 disabled:opacity-60";
export const labelCls = "block text-[11px] font-semibold uppercase tracking-wider text-[#52706e] mb-1.5";
export const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#002e2c] text-[#FAF6E7] text-xs font-semibold hover:bg-[#004744] transition shadow-xs active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";
export const btnSecondary =
  "inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-[#002e2c]/15 text-[#002e2c] text-xs font-semibold hover:bg-[#FAF6E7] transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed";
export const btnDanger =
  "inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-50 transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed";
export const btnDangerSolid =
  "inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-red-700 text-white text-xs font-semibold hover:bg-red-800 transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed";
export const btnLink ="inline-flex items-center gap-1 text-xs font-semibold text-[#005b57] hover:underline disabled:opacity-50 disabled:no-underline";
export const thCls = "py-3 px-3 font-semibold whitespace-nowrap";
export const tdCls = "py-3 px-3 align-top";

// ─── Small UI pieces ──────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: humanize(status), color: "bg-stone-100 text-stone-700 border-stone-200", dot: "bg-stone-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${meta.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

export function EnvBadge({ env, className = "" }: { env: Env; className?: string }) {
  return (
    <span
      className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap ${
        env === "live" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
      } ${className}`}
    >
      {env === "live" ? "Live" : "Sandbox"}
    </span>
  );
}

export function Pill({ tone, children }: { tone: "green" | "amber" | "red" | "gray" | "blue" | "purple" | "teal"; children: ReactNode }) {
  const tones: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    gray: "bg-zinc-100 text-zinc-600 border-zinc-200",
    blue: "bg-sky-50 text-sky-700 border-sky-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    teal: "bg-teal-50 text-teal-700 border-teal-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin text-[#005b57]`} />;
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-[#52706e]">
      <Spinner className="w-6 h-6" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="p-10 text-center space-y-2">
      {icon && <div className="flex justify-center text-[#52706e] opacity-50">{icon}</div>}
      <p className="text-sm font-semibold text-[#002e2c]">{title}</p>
      {body && <div className="text-xs text-[#52706e] max-w-md mx-auto leading-relaxed">{body}</div>}
      {action && <div className="pt-2 flex justify-center">{action}</div>}
    </div>
  );
}

export function CopyButton({ text, label, className = "" }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await copyText(text, label);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      title={`Copy ${label.toLowerCase()}`}
      aria-label={`Copy ${label.toLowerCase()}`}
      className={`p-1.5 rounded-lg text-[#52706e] hover:text-[#002e2c] hover:bg-[#FAF6E7] transition shrink-0 ${className}`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export function CodeBlock({ code, label, maxHeight = "max-h-72" }: { code: string; label?: string; maxHeight?: string }) {
  return (
    <div className="rounded-2xl bg-[#002e2c] text-[#FAF6E7] overflow-hidden border border-[#002e2c]/20 max-w-full">
      {label !== undefined && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-white/10 bg-black/20">
          <span className="text-[11px] font-mono text-zinc-300 truncate">{label}</span>
          <button
            type="button"
            onClick={() => copyText(code, label || "Code")}
            className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium flex items-center gap-1 transition shrink-0"
          >
            <Copy className="w-3 h-3" />
            Copy
          </button>
        </div>
      )}
      <div className={`p-4 overflow-auto ${maxHeight}`}>
        <pre className="font-mono text-[11px] leading-relaxed text-emerald-100/90 whitespace-pre">{code || " "}</pre>
      </div>
    </div>
  );
}

export function KpiCard({ label, value, hint, icon, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "default" | "green" | "amber" | "red" }) {
  const valueTone = tone === "green" ? "text-emerald-800" : tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-700" : "text-[#002e2c]";
  return (
    <div className="p-5 rounded-2xl bg-white border border-[#002e2c]/10 shadow-[0_4px_20px_rgba(0,46,44,0.03)] space-y-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#52706e] truncate">{label}</span>
        {icon && <div className="p-1.5 rounded-xl bg-[#FAF6E7] text-[#005b57] shrink-0">{icon}</div>}
      </div>
      <div className={`text-2xl font-bold tracking-tight ${valueTone} truncate`}>{value}</div>
      {hint && <div className="text-[11px] text-[#52706e] leading-snug">{hint}</div>}
    </div>
  );
}

// ─── Modal, drawer, confirm ───────────────────────────────────────────────────

const MODAL_WIDTH: Record<string, string> = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-3xl", xl: "sm:max-w-5xl" };

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** When false, clicking the backdrop or pressing Escape does not close it (one-time secrets). */
  dismissable?: boolean;
}) {
  useEffect(() => {
    if (!open || !dismissable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismissable, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (dismissable && e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`bg-white w-full ${MODAL_WIDTH[size]} rounded-t-3xl sm:rounded-3xl border border-[#002e2c]/15 shadow-2xl max-h-[92vh] flex flex-col`}>
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-[#002e2c]/10 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[#002e2c]">{title}</h3>
            {description && <div className="text-xs text-[#52706e] mt-0.5 leading-relaxed">{description}</div>}
          </div>
          {dismissable && (
            <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-xl text-[#52706e] hover:text-[#002e2c] hover:bg-[#FAF6E7] transition shrink-0">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="px-5 sm:px-6 py-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 sm:px-6 py-4 border-t border-[#002e2c]/10 flex flex-wrap items-center justify-end gap-2 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full sm:max-w-2xl bg-white shadow-2xl flex flex-col z-10 border-l border-[#002e2c]/15">
        <div className="p-4 sm:p-6 border-b border-[#002e2c]/10 flex items-start justify-between gap-3 bg-[#FAF6E7]/50">
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-[#002e2c]">{title}</div>
            {subtitle && <div className="text-xs text-[#52706e] mt-1">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-[#52706e] hover:text-[#002e2c] hover:bg-white transition shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 text-xs">{children}</div>
        {footer && <div className="p-4 border-t border-[#002e2c]/10 bg-[#FAF6E7]/30 flex flex-wrap items-center justify-between gap-3">{footer}</div>}
      </div>
    </div>
  );
}

type ConfirmOptions = {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "default";
};

/** Promise-based confirm dialog: `if (!(await confirm({...}))) return;` and render `element`. */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...options, resolve })),
    []
  );
  const settle = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };
  const element = state ? (
    <Modal
      open
      size="sm"
      onClose={() => settle(false)}
      title={
        <span className="flex items-center gap-2">
          {state.tone === "danger" && <AlertTriangle className="w-4 h-4 text-red-600" />}
          {state.title}
        </span>
      }
      footer={
        <>
          <button type="button" className={btnSecondary} onClick={() => settle(false)}>
            Cancel
          </button>
          <button
            type="button"
            className={state.tone === "danger" ? btnDangerSolid : btnPrimary}
            onClick={() => settle(true)}
            autoFocus
          >
            {state.confirmLabel ?? "Confirm"}
          </button>
        </>
      }
    >
      <div className="text-xs text-[#52706e] leading-relaxed space-y-2">{state.body}</div>
    </Modal>
  ) : null;
  return { confirm, element };
}

/**
 * Shows a secret exactly once (new API key, new signing secret) or on explicit reveal.
 * Cannot be dismissed by clicking outside, so the secret isn't lost by accident.
 */
export function SecretModal({
  secret,
  title,
  description,
  onClose,
  oneTime = true,
}: {
  secret: string | null;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  oneTime?: boolean;
}) {
  return (
    <Modal
      open={secret !== null}
      onClose={onClose}
      dismissable={false}
      size="md"
      title={title}
      description={description}
      footer={
        <button type="button" className={btnPrimary} onClick={onClose}>
          {oneTime ? "I've stored it securely" : "Done"}
        </button>
      }
    >
      <div className="space-y-4">
        {oneTime && (
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              <strong>Store it now — you won&apos;t see it again.</strong> Rehabify keeps only a hash, so it can&apos;t be shown later. If you
              lose it, rotate or create a new one.
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={secret ?? ""}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full min-w-0 flex-1 px-3.5 py-3 rounded-xl bg-[#FAF6E7] border border-[#002e2c]/15 font-mono text-xs text-[#002e2c]"
          />
          <button
            type="button"
            onClick={() => secret && copyText(secret, "Secret")}
            className="p-3 rounded-xl bg-[#002e2c] text-[#FAF6E7] hover:bg-[#004744] transition shrink-0"
            title="Copy"
            aria-label="Copy secret"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[11px] text-[#52706e]">Keep secrets on your server only. Never put them in browser or mobile app code, URLs or git.</p>
      </div>
    </Modal>
  );
}

/** "Working…" button content helper. */
export function Busy({ busy, label, busyLabel, icon }: { busy: boolean; label: string; busyLabel?: string; icon?: ReactNode }) {
  return (
    <>
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      <span>{busy ? (busyLabel ?? `${label}…`) : label}</span>
    </>
  );
}
