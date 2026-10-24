'use client';

import Link from 'next/link';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/physio/ui';
import { SettingsPageHeader, SettingsSection } from '@/components/physio/SettingsUI';
import { PayoutScheduleTable } from './payout-schedule-table';

const SETTINGS = '/dashboard/physiotherapist/settings';
const linkClass = 'font-medium text-rh-ink hover:underline dark:text-rh-lime';

export default function PayoutSchedulePage() {
    const schedule = useQuery(api.serviceTariffs.getPayoutSchedule);
    const terms = useQuery(api.marketplace.settings.getMyNetworkTerms);

    if (schedule === undefined || terms === undefined) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-72 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
            </div>
        );
    }

    if (terms?.isClinicMember) {
        return (
            <div className="space-y-6">
                <SettingsPageHeader title="Payout schedule" />
                <SettingsSection>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        You work with a clinic, so your clinic sets your fees and how you’re paid. Rehabify’s payout schedule doesn’t apply to
                        you. Speak to your clinic about your pay.
                    </p>
                </SettingsSection>
            </div>
        );
    }

    if (schedule === null) {
        return (
            <div className="space-y-6">
                <SettingsPageHeader title="Payout schedule" />
                <SettingsSection>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">Your payout schedule appears here once your profile exists.</p>
                </SettingsSection>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <SettingsPageHeader
                title="Payout schedule"
                description="What you earn for each Rehabify session. Rehabify sets the patient price; your payout is fixed."
            />

            {terms && !terms.accepted && (
                <div className="flex flex-col gap-2 rounded-2xl bg-rh-peach/70 px-4 py-3 text-sm text-[#7a4a0b] dark:bg-amber-400/10 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
                    <p>Accept the Rehabify network terms to confirm this schedule.</p>
                    <Link href={`${SETTINGS}/network-terms`} className="shrink-0 font-semibold underline-offset-2 hover:underline">
                        Review terms
                    </Link>
                </div>
            )}

            <SettingsSection
                title="Your payout per service"
                description={
                    schedule.confirmed ? (
                        <span className="inline-flex items-center gap-2">
                            Schedule version {schedule.version}
                            {terms?.accepted && <StatusBadge tone="green">Accepted</StatusBadge>}
                        </span>
                    ) : (
                        'Rehabify is confirming the payout for each service. The amounts appear here once they’re set.'
                    )
                }
            >
                <PayoutScheduleTable services={schedule.services} confirmed={schedule.confirmed} />
            </SettingsSection>

            <SettingsSection title="How you’re paid">
                <ul className="space-y-3 text-sm text-neutral-600 dark:text-neutral-400">
                    <li>
                        <span className="font-medium text-neutral-900 dark:text-white">A fixed payout per session.</span> Patients pay Rehabify
                        the standard price. You earn the payout shown above for each completed session.
                    </li>
                    <li>
                        <span className="font-medium text-neutral-900 dark:text-white">Travel on home visits.</span> Where a travel charge
                        applies, you also get your share of it for the patient’s travel zone.
                    </li>
                    <li>
                        <span className="font-medium text-neutral-900 dark:text-white">Paid after the session.</span> Your payout is due once
                        the session is marked completed. Rehabify then sends it to your{' '}
                        <Link href={`${SETTINGS}/payout`} className={linkClass}>
                            payout account
                        </Link>
                        .
                    </li>
                    <li>
                        <span className="font-medium text-neutral-900 dark:text-white">Booked rates stay fixed.</span> If the schedule changes,
                        sessions already booked keep the payout they were booked at.
                    </li>
                </ul>
            </SettingsSection>

            <p className="text-xs text-neutral-500 dark:text-neutral-400">
                These payouts are part of the{' '}
                <Link href={`${SETTINGS}/network-terms`} className="underline hover:text-neutral-900 dark:hover:text-white">
                    Rehabify network terms
                </Link>
                .
            </p>
        </div>
    );
}
