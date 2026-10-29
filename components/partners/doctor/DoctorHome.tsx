"use client";

import { useQuery } from "convex/react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, HeartPulse, UserPlus, Users, Wallet } from "@/components/icons";
import { EmptyState, LoadingBlocks, Panel, StatTile, primaryButtonClass } from "@/components/physio/ui";
import { doctorRefs, type DoctorHomeData } from "./refs";
import { ShareCard } from "./ShareCard";
import { ReferralListRow, formatKobo } from "./ui";

/**
 * A referring doctor's home: one big "Refer a patient", where their patients are, their link to
 * share, and what they've earned.
 */
export function DoctorHome({
  partnerCode,
  home,
  canCreateLink,
  onRefer,
  onOpenReferral,
  onSeeReferrals,
  onSeeEarnings,
}: {
  partnerCode: string;
  home: DoctorHomeData | undefined;
  canCreateLink: boolean;
  onRefer: () => void;
  onOpenReferral: (id: string) => void;
  onSeeReferrals: () => void;
  onSeeEarnings: () => void;
}) {
  const summary = useQuery(doctorRefs.summary, { partnerId: partnerCode });
  const displayName = home?.name ?? "";

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-pt-primary p-6 text-pt-on-primary sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <p className="text-sm font-medium opacity-70">{displayName ? `Welcome, ${displayName}` : "Welcome"}</p>
            <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">Refer a patient in a minute.</h1>
            <p className="mt-2 text-[15px] opacity-75">
              We reach them on WhatsApp, match them with a verified physiotherapist and update you at every step.
            </p>
          </div>
          <Button
            type="button"
            onClick={onRefer}
            className="h-14 shrink-0 rounded-2xl bg-pt-accent px-7 text-base font-semibold text-[#06210a] shadow-none transition hover:bg-[#00b80e] active:scale-[0.98]"
          >
            <UserPlus className="h-5 w-5" />
            Refer a patient
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Referred" value={home ? home.counts.total.toLocaleString("en-NG") : "—"} icon={Users} tone="neutral" />
        <StatTile
          label="Waiting to start"
          value={home ? home.counts.waiting.toLocaleString("en-NG") : "—"}
          icon={Clock}
          tone="blue"
          info="Received or contacted, not booked yet."
        />
        <StatTile
          label="In care"
          value={home ? home.counts.inCare.toLocaleString("en-NG") : "—"}
          icon={HeartPulse}
          tone="green"
          info="Booked, seen or in treatment."
        />
        <StatTile label="Discharged" value={home ? home.counts.discharged.toLocaleString("en-NG") : "—"} icon={CheckCircle2} tone="green" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Recent referrals"
          className="lg:col-span-2"
          bodyClassName="pt-2 pb-2"
          actions={
            home && home.recent.length > 0 ? (
              <button type="button" onClick={onSeeReferrals} className="text-sm font-medium text-pt-muted hover:text-pt-ink">
                See all
              </button>
            ) : undefined
          }
        >
          {home === undefined ? (
            <div className="px-5 pb-4 sm:px-6">
              <LoadingBlocks rows={3} />
            </div>
          ) : home.recent.length === 0 ? (
            <EmptyState
              icon={<UserPlus />}
              title="No referrals yet"
              description="Refer your first patient, or share your link. Each referral shows here with its progress."
              action={
                <Button type="button" onClick={onRefer} className={primaryButtonClass}>
                  <UserPlus className="h-4 w-4" />
                  Refer a patient
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-pt-line">
              {home.recent.map((row) => (
                <ReferralListRow key={row.referralId} row={row} onOpen={onOpenReferral} />
              ))}
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <ShareCard partnerCode={partnerCode} canCreate={canCreateLink} />
          <Panel
            title="Earnings"
            bodyClassName="px-5 pb-5 pt-3 sm:px-6"
            info="Commission on what patients you referred pay for their care, under the terms Rehabify agreed with you. Paid monthly to your bank account."
            actions={
              <button type="button" onClick={onSeeEarnings} className="text-sm font-medium text-pt-muted hover:text-pt-ink">
                Details
              </button>
            }
          >
            <dl className="grid grid-cols-2 gap-4">
              <Money label="Total earned" value={summary ? formatKobo(summary.totalEarnedKobo) : "—"} />
              <Money label="Ready for payout" value={summary ? formatKobo(summary.availablePayoutKobo) : "—"} />
            </dl>
            {summary && summary.totalEarnedKobo === 0 && (
              <p className="mt-3 flex items-start gap-2 text-xs text-pt-muted">
                <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                You earn when patients you referred pay for their sessions.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Money({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-pt-muted">{label}</dt>
      <dd className="mt-1 truncate text-xl font-semibold tabular-nums tracking-tight text-pt-ink">{value}</dd>
    </div>
  );
}
