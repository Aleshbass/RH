'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Loader2 } from '@/components/icons';
import { toast } from 'sonner';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { primaryButtonClass, StatusBadge } from '@/components/physio/ui';
import { SettingsPageHeader, SettingsSection, fieldHintClass, fieldLabelClass } from '@/components/physio/SettingsUI';
import { NETWORK_TERMS_SUMMARY, NETWORK_TERMS_VERSION } from '@/lib/rehabify-network-terms';
import { formatKobo } from '@/lib/rehabify-services';
import type { NetworkTermsStatus, PayoutSchedule } from '@/lib/rehabify-api-types';
import { PayoutScheduleTable } from '../fee-schedule/payout-schedule-table';

const SETTINGS = '/dashboard/physiotherapist/settings';

function errorMessage(error: unknown, fallback: string) {
    if (error instanceof ConvexError && typeof error.data === 'string' && error.data.trim()) return error.data;
    return fallback;
}

function formatDay(timestamp: number) {
    return new Date(timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function NetworkTermsPage() {
    const status = useQuery(api.marketplace.settings.getMyNetworkTerms) as NetworkTermsStatus | null | undefined;
    const schedule = useQuery(api.serviceTariffs.getPayoutSchedule) as PayoutSchedule | null | undefined;
    const setup = useQuery(api.physioSetup.getMySetupStatus);
    const acceptTerms = useMutation(api.marketplace.settings.acceptNetworkTerms);

    const [loaded, setLoaded] = useState(false);
    const [optIn, setOptIn] = useState(false);
    // Naira, as typed; blank means no minimum
    const [minimums, setMinimums] = useState<Record<string, string>>({});
    const [agreed, setAgreed] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (loaded || !status || !schedule) return;
        const saved = status.terms;
        setOptIn(Boolean(saved?.accessOptIn));
        const initial: Record<string, string> = {};
        for (const service of schedule.services) {
            if (service.assistedPayoutKobo === null) continue;
            const minimum = saved?.accessMinimumPayouts?.find((row) => row.serviceId === service.id)?.minimumPayoutKobo;
            initial[service.id] = String(Math.round((minimum ?? service.assistedPayoutKobo) / 100));
        }
        setMinimums(initial);
        setLoaded(true);
    }, [status, schedule, loaded]);

    if (status === undefined || schedule === undefined || setup === undefined || (status && schedule && !loaded)) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-72 rounded-xl" />
            </div>
        );
    }

    if (status?.isClinicMember) {
        return (
            <div className="space-y-6">
                <SettingsPageHeader title="Network terms" />
                <SettingsSection>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        You work with a clinic, so you see patients under your clinic’s terms and prices. The Rehabify network terms don’t
                        apply to you, and there’s nothing to accept here.
                    </p>
                </SettingsSection>
            </div>
        );
    }

    if (status === null || schedule === null) {
        return (
            <div className="space-y-6">
                <SettingsPageHeader title="Network terms" />
                <SettingsSection>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        Finish your application first. The network terms appear here once your profile exists.
                    </p>
                </SettingsSection>
            </div>
        );
    }

    const approved = setup?.approvalStatus === 'approved';
    const saved = status.terms;
    // Access opt-in appears once Rehabify has confirmed the Access rates
    const accessServices = schedule.confirmed ? schedule.services.filter((service) => service.assistedPayoutKobo !== null) : [];
    const scheduleChanged = status.accepted && saved?.tariffVersion !== undefined && saved.tariffVersion !== schedule.version;

    const submit = async () => {
        if (!agreed) {
            toast.error('Tick the box to confirm you accept the terms.');
            return;
        }
        const rows: { serviceId: string; minimumPayoutKobo: number }[] = [];
        if (optIn) {
            for (const service of accessServices) {
                const typed = minimums[service.id]?.trim();
                if (!typed) continue;
                rows.push({ serviceId: service.id, minimumPayoutKobo: Math.round(Number(typed) * 100) });
            }
        }
        setSaving(true);
        try {
            await acceptTerms({
                version: NETWORK_TERMS_VERSION,
                tariffVersion: schedule.version,
                accessOptIn: optIn,
                accessMinimumPayouts: optIn ? rows : undefined,
            });
            setAgreed(false);
            toast.success(status.accepted ? 'Your choices are saved' : 'Thanks, you’ve accepted the network terms');
        } catch (error) {
            toast.error(errorMessage(error, 'Couldn’t save your acceptance. Please try again.'));
        } finally {
            setSaving(false);
        }
    };

    let banner: { tone: 'green' | 'amber'; label: string; detail: string };
    if (status.accepted && saved) {
        banner = {
            tone: 'green',
            label: 'Accepted',
            detail: `You accepted these terms on ${formatDay(saved.acceptedAt)} (version ${saved.version}).`,
        };
    } else if (saved) {
        banner = {
            tone: 'amber',
            label: 'Updated',
            detail: `These terms have changed since you accepted them on ${formatDay(saved.acceptedAt)}. Please read and accept the new version.`,
        };
    } else {
        banner = { tone: 'amber', label: 'Not accepted', detail: 'Read the terms and your payout schedule, then accept below.' };
    }

    return (
        <div className="space-y-6">
            <SettingsPageHeader title="Network terms" description="The terms you work under when you treat Rehabify patients." />

            <SettingsSection>
                <div className="flex items-start gap-3">
                    <StatusBadge tone={banner.tone} className="mt-0.5">
                        {banner.label}
                    </StatusBadge>
                    <div className="min-w-0 text-sm text-neutral-600 dark:text-neutral-400">
                        <p>{banner.detail}</p>
                        {scheduleChanged && (
                            <p className="mt-1">The payout schedule has been updated since then. Accept again to confirm the new payouts.</p>
                        )}
                    </div>
                </div>
            </SettingsSection>

            <SettingsSection title="The terms" description={`Version ${NETWORK_TERMS_VERSION}`}>
                <ol className="space-y-4">
                    {NETWORK_TERMS_SUMMARY.map((item, index) => (
                        <li key={item.title} className="flex gap-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rh-honeydew text-xs font-semibold text-rh-ink dark:bg-white/[0.06] dark:text-rh-lime">
                                {index + 1}
                            </span>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-neutral-900 dark:text-white">{item.title}</p>
                                <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">{item.body}</p>
                            </div>
                        </li>
                    ))}
                </ol>
            </SettingsSection>

            <SettingsSection
                title="Your payout schedule"
                description={
                    <>
                        What you earn per completed session.{' '}
                        <Link href={`${SETTINGS}/fee-schedule`} className="font-medium text-rh-ink hover:underline dark:text-rh-lime">
                            How you’re paid
                        </Link>
                    </>
                }
            >
                <PayoutScheduleTable services={schedule.services} confirmed={schedule.confirmed} />
            </SettingsSection>

            {accessServices.length > 0 && (
                <SettingsSection title="Rehabify Access" description="Optional. Reduced-fee cases for patients approved for Rehabify Access.">
                    <div className="space-y-5">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <Label htmlFor="access" className={fieldLabelClass}>
                                    Accept selected Rehabify Access cases
                                </Label>
                                <p className={fieldHintClass}>
                                    Rehabify still sets the patient’s price. You’re only matched when the Access payout meets your minimum and the
                                    case fits your skills.
                                </p>
                            </div>
                            <Switch id="access" checked={optIn} onCheckedChange={setOptIn} disabled={!approved || saving} />
                        </div>

                        {optIn && (
                            <div className="space-y-4 border-t border-neutral-100 pt-5 dark:border-white/[0.07]">
                                <p className={fieldLabelClass}>Minimum payout you’d accept</p>
                                {accessServices.map((service) => {
                                    const typed = minimums[service.id] ?? '';
                                    const accessPayout = service.assistedPayoutKobo ?? 0;
                                    const tooHigh = typed !== '' && Math.round(Number(typed) * 100) > accessPayout;
                                    return (
                                        <div key={service.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center sm:gap-4">
                                            <div className="min-w-0">
                                                <Label htmlFor={`min-${service.id}`} className="text-sm text-neutral-900 dark:text-white">
                                                    {service.name}
                                                </Label>
                                                <p className={tooHigh ? 'mt-0.5 text-xs text-[#b4690e] dark:text-amber-300' : 'mt-0.5 text-xs text-neutral-500 dark:text-neutral-400'}>
                                                    Access payout {formatKobo(accessPayout)}.
                                                    {tooHigh && ' Your minimum is higher, so you won’t be matched for this yet.'}
                                                </p>
                                            </div>
                                            <div className="relative">
                                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">₦</span>
                                                <Input
                                                    id={`min-${service.id}`}
                                                    inputMode="numeric"
                                                    value={typed}
                                                    placeholder="0"
                                                    disabled={!approved || saving}
                                                    onChange={(e) =>
                                                        setMinimums((current) => ({ ...current, [service.id]: e.target.value.replace(/[^\d]/g, '') }))
                                                    }
                                                    className="pl-7 tabular-nums"
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                                <p className={fieldHintClass}>Leave a box empty for no minimum.</p>
                            </div>
                        )}
                    </div>
                </SettingsSection>
            )}

            <SettingsSection
                title={status.accepted ? 'Update your acceptance' : 'Accept the terms'}
                footer={
                    <Button onClick={submit} disabled={!approved || !agreed || saving} className={primaryButtonClass}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {status.accepted ? 'Save and accept again' : 'Accept terms'}
                    </Button>
                }
            >
                {!approved && (
                    <p className="mb-4 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:bg-rh-ink dark:text-neutral-400">
                        You can accept these once we’ve approved your application.
                    </p>
                )}
                <div className="flex items-start gap-3">
                    <Checkbox
                        id="agree"
                        checked={agreed}
                        onCheckedChange={(checked) => setAgreed(checked === true)}
                        disabled={!approved || saving}
                        className="mt-0.5"
                    />
                    <Label htmlFor="agree" className="text-sm font-normal leading-5 text-neutral-700 dark:text-neutral-300">
                        I’ve read and accept the Rehabify network terms (version {NETWORK_TERMS_VERSION}) and the payout schedule above
                        {optIn ? ', and I’d like to be considered for Rehabify Access cases.' : '.'}
                    </Label>
                </div>
            </SettingsSection>
        </div>
    );
}
