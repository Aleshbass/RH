'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Loader2 } from '@/components/icons';
import { toast } from 'sonner';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { primaryButtonClass, StatusBadge } from '@/components/physio/ui';
import { SettingsPageHeader, SettingsSection, fieldHintClass, fieldLabelClass } from '@/components/physio/SettingsUI';
import { formatKobo } from '@/lib/rehabify-services';
import { cn } from '@/lib/utils';
import type { MarketplaceSettings, PayoutSchedule, TravelZone } from '@/lib/rehabify-api-types';

const SETTINGS = '/dashboard/physiotherapist/settings';
const linkClass = 'font-medium text-rh-teal hover:underline dark:text-rh-aqua';

type ZoneId = Id<'travelZones'>;

function errorMessage(error: unknown, fallback: string) {
    if (error instanceof ConvexError && typeof error.data === 'string' && error.data.trim()) return error.data;
    return fallback;
}

export default function ServicesAndCoveragePage() {
    const settings = useQuery(api.marketplace.settings.getMyMarketplaceSettings) as MarketplaceSettings | null | undefined;
    const setup = useQuery(api.physioSetup.getMySetupStatus);
    const zones = useQuery(api.travelZones.listZones) as TravelZone[] | undefined;
    const schedule = useQuery(api.serviceTariffs.getPayoutSchedule) as PayoutSchedule | null | undefined;
    const updateSettings = useMutation(api.marketplace.settings.updateMarketplaceSettings);

    const [loaded, setLoaded] = useState(false);
    const [listed, setListed] = useState(true);
    const [online, setOnline] = useState(true);
    const [home, setHome] = useState(false);
    const [zoneIds, setZoneIds] = useState<ZoneId[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isToggling, setIsToggling] = useState(false);

    useEffect(() => {
        if (loaded || !settings || !setup || !zones) return;
        setOnline(settings.offersOnlineSessions);
        setHome(settings.offersInPersonSessions);
        // Only active zones can be saved; retired ones drop out of the selection
        const active = new Set(zones.map((zone) => zone.id));
        setZoneIds(((settings.coveredZoneIds ?? []) as ZoneId[]).filter((id) => active.has(id)));
        // Marketplace search treats "never set" as listed, so this page does too
        setListed(setup.isListed);
        setLoaded(true);
    }, [settings, setup, zones, loaded]);

    const zonesByCity = useMemo(() => {
        const groups = new Map<string, NonNullable<typeof zones>>();
        for (const zone of zones ?? []) groups.set(zone.city, [...(groups.get(zone.city) ?? []), zone]);
        return [...groups.entries()];
    }, [zones]);

    if (
        settings === undefined ||
        setup === undefined ||
        zones === undefined ||
        schedule === undefined ||
        (settings && setup && !loaded)
    ) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-28 rounded-xl" />
                <Skeleton className="h-64 rounded-xl" />
            </div>
        );
    }

    if (settings === null || setup === null) {
        return (
            <div className="space-y-6">
                <SettingsPageHeader title="Services & coverage" />
                <SettingsSection>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        Finish your application first. Your services and areas appear here once your profile exists.
                    </p>
                </SettingsSection>
            </div>
        );
    }

    if (settings.isClinicMember) {
        return (
            <div className="space-y-6">
                <SettingsPageHeader title="Services & coverage" />
                <SettingsSection>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        You work with a clinic, so your clinic sets your services, prices and terms. Clinic physiotherapists aren’t listed on
                        the Rehabify marketplace; patients book you through your clinic.
                    </p>
                </SettingsSection>
            </div>
        );
    }

    const approved = setup.approvalStatus === 'approved';

    const toggleListing = async (checked: boolean) => {
        setListed(checked);
        setIsToggling(true);
        try {
            await updateSettings({ isAvailableOnMarketplace: checked });
            toast.success(checked ? 'You’re listed on the marketplace' : 'You’re hidden from the marketplace');
        } catch (error) {
            setListed(!checked);
            toast.error(errorMessage(error, 'Couldn’t change your listing'));
        } finally {
            setIsToggling(false);
        }
    };

    const toggleZone = (id: ZoneId, checked: boolean) =>
        setZoneIds((current) => (checked ? [...current, id] : current.filter((zoneId) => zoneId !== id)));

    const save = async () => {
        if (!online && !home) {
            toast.error('Offer video sessions, home visits, or both.');
            return;
        }
        if (home && zoneIds.length === 0) {
            toast.error('Choose at least one area you travel to for home visits.');
            return;
        }
        setIsSaving(true);
        try {
            await updateSettings({ offersOnlineSessions: online, offersInPersonSessions: home, coveredZoneIds: zoneIds });
            toast.success('Services saved');
        } catch (error) {
            toast.error(errorMessage(error, 'Couldn’t save your services'));
        } finally {
            setIsSaving(false);
        }
    };

    let listingStatus: { tone: 'green' | 'amber' | 'neutral'; label: string; detail: string };
    if (!approved) {
        listingStatus = { tone: 'amber', label: 'Under review', detail: 'You can go live once we’ve approved your application.' };
    } else if (!listed) {
        listingStatus = { tone: 'neutral', label: 'Hidden', detail: 'Patients won’t find you in search. Existing patients can still book.' };
    } else if (!setup.isComplete) {
        listingStatus = {
            tone: 'amber',
            label: 'Not live yet',
            detail: `Finish ${setup.requiredRemaining} more setup ${setup.requiredRemaining === 1 ? 'step' : 'steps'} to appear in search.`,
        };
    } else {
        listingStatus = { tone: 'green', label: 'Live', detail: 'Patients can find and book you.' };
    }

    const services = (schedule?.services ?? []).filter((service) => service.active);
    const offers = (mode: 'virtual' | 'home') => (mode === 'virtual' ? online : home && zoneIds.length > 0);

    return (
        <div className="space-y-6">
            <SettingsPageHeader title="Services & coverage" description="How Rehabify patients can see you, and where you travel." />

            <SettingsSection>
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <Label htmlFor="listed" className="text-sm font-medium text-neutral-900 dark:text-white">
                                Show me on the marketplace
                            </Label>
                            <StatusBadge tone={listingStatus.tone}>{listingStatus.label}</StatusBadge>
                        </div>
                        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                            {listingStatus.detail}{' '}
                            {approved && listed && !setup.isComplete && (
                                <Link href="/dashboard/physiotherapist" className={linkClass}>
                                    See what’s left
                                </Link>
                            )}
                        </p>
                    </div>
                    <Switch
                        id="listed"
                        checked={listed}
                        onCheckedChange={toggleListing}
                        disabled={!approved || isToggling}
                        aria-label="Show me on the marketplace"
                    />
                </div>
            </SettingsSection>

            <SettingsSection
                title="How you see patients"
                description="Choose video sessions, home visits, or both."
                footer={
                    <Button onClick={save} disabled={isSaving || !approved} className={primaryButtonClass}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save
                    </Button>
                }
            >
                <div className="space-y-6">
                    {!approved && (
                        <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:bg-rh-ink dark:text-neutral-400">
                            You can change these once we’ve approved your application.
                        </p>
                    )}

                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <Label htmlFor="online" className={fieldLabelClass}>Video sessions</Label>
                            <p className={fieldHintClass}>Consultations, assessments and follow-ups by video.</p>
                        </div>
                        <Switch id="online" checked={online} onCheckedChange={setOnline} disabled={!approved} />
                    </div>

                    <div className="space-y-4 border-t border-neutral-100 pt-6 dark:border-white/[0.07]">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <Label htmlFor="home" className={fieldLabelClass}>Home visits</Label>
                                <p className={fieldHintClass}>Assessments and treatment at the patient’s home, in the areas you choose.</p>
                            </div>
                            <Switch id="home" checked={home} onCheckedChange={setHome} disabled={!approved} />
                        </div>

                        {home && (
                            <div className="space-y-4">
                                <p className={fieldLabelClass}>Areas you travel to</p>
                                {zonesByCity.length === 0 ? (
                                    <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:bg-rh-ink dark:text-neutral-400">
                                        Rehabify hasn’t opened any areas for home visits yet. You can turn this on once one is available.
                                    </p>
                                ) : (
                                    zonesByCity.map(([city, cityZones]) => (
                                        <div key={city} className="space-y-2">
                                            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">{city}</p>
                                            <div className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-100 dark:divide-white/[0.07] dark:border-white/[0.07]">
                                                {cityZones.map((zone) => {
                                                    const checked = zoneIds.includes(zone.id);
                                                    return (
                                                        <label
                                                            key={zone.id}
                                                            htmlFor={`zone-${zone.id}`}
                                                            className={cn(
                                                                'flex cursor-pointer items-start gap-3 px-3 py-3 transition-colors hover:bg-rh-canvas dark:hover:bg-white/[0.03]',
                                                                checked && 'bg-rh-mist/50 dark:bg-rh-aqua/[0.06]',
                                                                !approved && 'cursor-not-allowed opacity-60'
                                                            )}
                                                        >
                                                            <Checkbox
                                                                id={`zone-${zone.id}`}
                                                                checked={checked}
                                                                disabled={!approved}
                                                                onCheckedChange={(value) => toggleZone(zone.id, value === true)}
                                                                className="mt-0.5"
                                                            />
                                                            <span className="min-w-0 flex-1">
                                                                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                                                                    <span className="text-sm font-medium text-neutral-900 dark:text-white">{zone.name}</span>
                                                                    {zone.surchargeKobo > 0 && (
                                                                        <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                                                                            Travel charge {formatKobo(zone.surchargeKobo)}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                                <span className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">
                                                                    {zone.areas.join(', ')}
                                                                </span>
                                                            </span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))
                                )}
                                <p className={fieldHintClass}>
                                    Patients in these areas can book you for home visits. The travel charge is added to home treatment, and you get
                                    your share of it.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </SettingsSection>

            {services.length > 0 && (
                <SettingsSection
                    title="Services you’ll be offered"
                    description="Rehabify sets one price for each service across the network. Your payout is fixed."
                >
                    {!settings.networkTermsAccepted && (
                        <p className="mb-4 rounded-lg bg-rh-peach/70 px-3 py-2 text-sm text-[#7a4a0b] dark:bg-amber-400/10 dark:text-amber-200">
                            Accept the{' '}
                            <Link href={`${SETTINGS}/network-terms`} className="font-semibold underline-offset-2 hover:underline">
                                Rehabify network terms
                            </Link>{' '}
                            to confirm these payouts.
                        </p>
                    )}
                    <ul className="-mx-4 divide-y divide-neutral-100 dark:divide-white/[0.07] sm:-mx-6">
                        {services.map((service) => {
                            const available = offers(service.mode);
                            return (
                                <li key={service.id} className="flex items-start justify-between gap-4 px-4 py-3 sm:px-6">
                                    <div className={cn('min-w-0', !available && 'opacity-60')}>
                                        <p className="text-sm font-medium text-neutral-900 dark:text-white">{service.name}</p>
                                        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                                            {service.durationLabel} · {service.mode === 'home' ? 'Home visit' : 'Video'}
                                            {!available && (service.mode === 'home' ? ' · Turn on home visits to offer this' : ' · Turn on video sessions to offer this')}
                                        </p>
                                    </div>
                                    <div className={cn('shrink-0 text-right', !available && 'opacity-60')}>
                                        <p className="text-sm font-semibold tabular-nums text-rh-night dark:text-white">
                                            {schedule?.confirmed === false ? 'Payout being confirmed' : `You earn ${formatKobo(service.payoutKobo)}`}
                                        </p>
                                        <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                                            Patient pays {service.travelApplies ? 'from ' : ''}
                                            {formatKobo(service.priceKobo)}
                                        </p>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </SettingsSection>
            )}

            <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Patients pay Rehabify, and you’re paid your fixed payout once each session is marked completed.{' '}
                <Link href={`${SETTINGS}/fee-schedule`} className="underline hover:text-neutral-900 dark:hover:text-white">
                    Payout schedule
                </Link>
            </p>
        </div>
    );
}
