"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CheckCircle2, Clock, HeartPulse, Link2, UserPlus, Users, Wallet } from "@/components/icons";
import { HowItWorks } from "./ReferPatientForm";
import {
  DASH,
  EmptyState,
  KpiCard,
  LoadingBlock,
  StatusBadge,
  btnPrimary,
  btnSecondary,
  cardCls,
  fmtDate,
  formatKobo,
  formatNumber,
  type PortalContext,
} from "./shared";
import type { TabId } from "./PartnerDashboard";

type Summary = {
  totalEarnedKobo: number;
  availablePayoutKobo: number;
  paidOutKobo: number;
  pendingApprovalKobo?: number;
};

/**
 * A referring doctor's home: what happened to the patients they referred and what they've
 * earned, with referring one tap away. Earnings come from the partner ledger (verified payments
 * by patients attributed to the doctor).
 */
export function DoctorOverview({
  ctx,
  overview,
  onNavigate,
}: {
  ctx: PortalContext;
  overview: { metrics: any; recentReferrals: any[] } | undefined;
  onNavigate: (tab: TabId) => void;
}) {
  const summary = useQuery(api.commercialTerms.getPartnerCommercialSummary, { partnerId: ctx.partnerCode }) as Summary | undefined;

  if (!overview) return <LoadingBlock />;
  const m = overview.metrics as { totalReferrals: number; activeInTreatment: number; completed: number; pending: number };
  const pendingApproval = summary?.pendingApprovalKobo ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="Patients referred" value={formatNumber(m.totalReferrals)} icon={<Users className="w-4 h-4" />} />
        <KpiCard label="Waiting to start" value={formatNumber(m.pending)} hint="We're contacting them" icon={<Clock className="w-4 h-4" />} tone="amber" />
        <KpiCard label="In care" value={formatNumber(m.activeInTreatment)} hint="Booked or in treatment" icon={<HeartPulse className="w-4 h-4" />} />
        <KpiCard label="Completed" value={formatNumber(m.completed)} hint="Finished their treatment" icon={<CheckCircle2 className="w-4 h-4" />} tone="green" />
      </div>

      <div className={`${cardCls} p-5 sm:p-6`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Your earnings</h3>
            <p className="text-[11px] text-[#52706e]">From payments by patients you referred, under the terms Rehabify agreed with you.</p>
          </div>
          <button type="button" className={btnSecondary} onClick={() => onNavigate("commercial")}>
            <Wallet className="w-3.5 h-3.5" />
            Earnings &amp; payouts
          </button>
        </div>
        <dl className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Money label="Total earned" value={summary ? formatKobo(summary.totalEarnedKobo) : DASH} />
          <Money label="Available for payout" value={summary ? formatKobo(summary.availablePayoutKobo) : DASH} />
          <Money label="Paid to you" value={summary ? formatKobo(summary.paidOutKobo) : DASH} />
          <Money label="Awaiting approval" value={summary ? formatKobo(pendingApproval) : DASH} muted={pendingApproval === 0} />
        </dl>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${cardCls} overflow-hidden lg:col-span-2`}>
          <div className="p-5 flex items-center justify-between gap-3 border-b border-[#002e2c]/10">
            <h3 className="text-sm font-semibold">Recent referrals</h3>
            <button type="button" onClick={() => onNavigate("referrals")} className="text-xs font-semibold text-[#005b57] hover:underline">
              See all
            </button>
          </div>
          {overview.recentReferrals.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="w-8 h-8" />}
              title="No referrals yet"
              body="Refer your first patient. We contact them on WhatsApp and keep you updated by email."
              action={
                <button type="button" className={btnPrimary} onClick={() => onNavigate("refer")}>
                  <UserPlus className="w-3.5 h-3.5" />
                  Refer a patient
                </button>
              }
            />
          ) : (
            <ul className="divide-y divide-[#002e2c]/5">
              {overview.recentReferrals.slice(0, 6).map((r: any) => (
                <li key={r.referralId} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#002e2c] truncate">{r.patientName || DASH}</p>
                    <p className="text-[11px] text-[#52706e] truncate">
                      <span className="font-mono">{r.trackingCode || DASH}</span>
                      {r.condition ? ` · ${r.condition}` : ""} · {fmtDate(r.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <div className={`${cardCls} p-5 space-y-3`}>
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-[#005b57]" />
              <h3 className="text-sm font-semibold">Your referral link</h3>
            </div>
            <p className="text-xs text-[#52706e] leading-relaxed">
              Share it with patients on WhatsApp or as a QR code. Anyone who signs up or books within 30 days of opening it is linked to you.
            </p>
            <button type="button" className={btnSecondary} onClick={() => onNavigate("links")}>
              Get your link
            </button>
          </div>
          <HowItWorks ctx={ctx} />
        </div>
      </div>
    </div>
  );
}

function Money({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-[#52706e]">{label}</dt>
      <dd className={`mt-1 text-lg font-bold tracking-tight truncate ${muted ? "text-[#52706e]" : "text-[#002e2c]"}`}>{value}</dd>
    </div>
  );
}
