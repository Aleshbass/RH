'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from 'convex/react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { formatNaira, primaryButtonClass, StatusBadge } from '@/components/physio/ui';
import { SettingsPageHeader, SettingsSection, fieldHintClass, fieldLabelClass } from '@/components/physio/SettingsUI';
import { cn } from '@/lib/utils';

/** Physios keep 80% of the session price; see the payout policy. */
const PHYSIO_SHARE = 0.8;
const MIN_PRICE = 2000;
const MAX_PRICE = 500000;
const DISCOUNTS = [5, 7, 10, 15];

type MarketplaceSettings = {
    isAvailableOnMarketplace: boolean;
    virtualConsultationRate: number;
    inPersonConsultationRate: number;
    packageDiscountPercent: number;
    offersOnlineSessions: boolean;
    offersInPersonSessions: boolean;
    isApproved?: boolean;
};

function PriceField({
    id,
    label,
    hint,
    value,
    onChange,
    disabled,
}: {
    id: string;
    label: string;
    hint: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}) {
    const amount = Number(value);
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id} className={fieldLabelClass}>{label}</Label>
            <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">₦</span>
                <Input
                    id={id}
                    inputMode="numeric"
                    value={value}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
                    className="pl-7 tabular-nums"
                />
            </div>
            <p className={fieldHintClass}>
                {amount > 0 ? `You receive ${formatNaira(amount * PHYSIO_SHARE)} per session. ` : ''}
                {hint}
            </p>
        </div>
    );
}

export default function PricesAndListingPage() {
    const settings = useQuery(api.marketplace.settings.getMyMarketplaceSettings) as MarketplaceSettings | null | undefined;
    const setup = useQuery(api.physioSetup.getMySetupStatus);
    const updateSettings = useMutation(api.marketplace.settings.updateMarketplaceSettings);

    const [loaded, setLoaded] = useState(false);
    const [virtualRate, setVirtualRate] = useState('');
    const [inPersonRate, setInPersonRate] = useState('');
    const [discount, setDiscount] = useState(7);
    const [online, setOnline] = useState(true);
    const [inPerson, setInPerson] = useState(true);
    const [listed, setListed] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isToggling, setIsToggling] = useState(false);

    useEffect(() => {
        if (loaded || !settings || !setup) return;
        setVirtualRate(String(Math.round(settings.virtualConsultationRate || 6000)));
        setInPersonRate(String(Math.round(settings.inPersonConsultationRate || 10000)));
        setDiscount(settings.packageDiscountPercent || 7);
        setOnline(settings.offersOnlineSessions);
        setInPerson(settings.offersInPersonSessions);
        // Marketplace search treats "never set" as listed, so this page does too
        setListed(setup.isListed);
        setLoaded(true);
    }, [settings, setup, loaded]);

    if (settings === undefined || setup === undefined || (settings && !loaded)) {
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
                <SettingsPageHeader title="Prices & listing" />
                <SettingsSection>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        Finish your application first. Your prices and listing appear here once your profile exists.
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
            toast.error((error as Error).message || 'Couldn’t change your listing');
        } finally {
            setIsToggling(false);
        }
    };

    const save = async () => {
        const virtual = Number(virtualRate);
        const face = Number(inPersonRate);
        if (!online && !inPerson) {
            toast.error('Offer at least one type of session.');
            return;
        }
        for (const [label, amount, enabled] of [
            ['video', virtual, online],
            ['in-person', face, inPerson],
        ] as const) {
            if (enabled && (!amount || amount < MIN_PRICE || amount > MAX_PRICE)) {
                toast.error(`Set a ${label} price between ${formatNaira(MIN_PRICE)} and ${formatNaira(MAX_PRICE)}.`);
                return;
            }
        }
        setIsSaving(true);
        try {
            await updateSettings({
                offersOnlineSessions: online,
                offersInPersonSessions: inPerson,
                virtualConsultationRate: virtual > 0 ? Math.round(virtual * 100) : undefined,
                inPersonConsultationRate: face > 0 ? Math.round(face * 100) : undefined,
                packageDiscountPercent: discount,
            });
            toast.success('Prices saved');
        } catch (error) {
            toast.error((error as Error).message || 'Couldn’t save your prices');
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

    return (
        <div className="space-y-6">
            <SettingsPageHeader title="Prices & listing" description="How patients find you and what they pay." />

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
                                <Link href="/dashboard/physiotherapist" className="font-medium text-[#005b57] hover:underline dark:text-[#2dd4bf]">
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
                title="Sessions and prices"
                description="Prices are per session. Patients see these on your profile and booking link."
                footer={
                    <Button onClick={save} disabled={isSaving || !approved} className={primaryButtonClass}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save prices
                    </Button>
                }
            >
                <div className="space-y-6">
                    {!approved && (
                        <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:bg-rh-ink dark:text-neutral-400">
                            You can set prices once you’re approved. Until then, standard Rehabify prices apply.
                        </p>
                    )}

                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-4">
                            <Label htmlFor="online" className={fieldLabelClass}>Video sessions</Label>
                            <Switch id="online" checked={online} onCheckedChange={setOnline} disabled={!approved} />
                        </div>
                        {online && (
                            <PriceField
                                id="virtualRate"
                                label="Price per video session"
                                hint="Standard price is ₦6,000."
                                value={virtualRate}
                                onChange={setVirtualRate}
                                disabled={!approved}
                            />
                        )}
                    </div>

                    <div className="space-y-4 border-t border-neutral-100 pt-6 dark:border-white/[0.07]">
                        <div className="flex items-center justify-between gap-4">
                            <Label htmlFor="inPerson" className={fieldLabelClass}>In-person sessions</Label>
                            <Switch id="inPerson" checked={inPerson} onCheckedChange={setInPerson} disabled={!approved} />
                        </div>
                        {inPerson && (
                            <PriceField
                                id="inPersonRate"
                                label="Price per in-person session"
                                hint="At your practice or a home visit. Standard price is ₦10,000."
                                value={inPersonRate}
                                onChange={setInPersonRate}
                                disabled={!approved}
                            />
                        )}
                    </div>

                    <div className="space-y-2 border-t border-neutral-100 pt-6 dark:border-white/[0.07]">
                        <p className={fieldLabelClass}>Package discount</p>
                        <p className={cn(fieldHintClass, 'mt-0')}>
                            Patients who book 4, 8 or 12 sessions up front get this much off each session.
                        </p>
                        <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 dark:border-white/[0.07]" role="radiogroup" aria-label="Package discount">
                            {DISCOUNTS.map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    role="radio"
                                    aria-checked={discount === value}
                                    disabled={!approved}
                                    onClick={() => setDiscount(value)}
                                    className={cn(
                                        'rounded-md px-3.5 py-1.5 text-sm tabular-nums transition-colors disabled:opacity-50',
                                        discount === value
                                            ? 'bg-neutral-900 font-medium text-white dark:bg-white dark:text-neutral-950'
                                            : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                                    )}
                                >
                                    {value}%
                                </button>
                            ))}
                        </div>
                        {online && Number(virtualRate) > 0 && (
                            <p className={fieldHintClass}>
                                An 8-session video package would cost{' '}
                                {formatNaira((Number(virtualRate) - Math.round(Number(virtualRate) * (discount / 100))) * 8)}.
                            </p>
                        )}
                    </div>
                </div>
            </SettingsSection>

            <p className="text-xs text-neutral-500 dark:text-neutral-400">
                You keep 80% of each session. The rest covers payments, the platform and referring partners.{' '}
                <Link href="/payout-policy" className="underline hover:text-neutral-900 dark:hover:text-white">
                    Payout policy
                </Link>
            </p>
        </div>
    );
}
