'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { toast } from 'sonner';
import { Check, Loader2 } from '@/components/icons';
import { api } from '@/convex/_generated/api';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { primaryButtonClass } from '@/components/physio/ui';
import { SettingsPageHeader, SettingsSection } from '@/components/physio/SettingsUI';
import type { SetupStatus } from '@/components/physio/SetupChecklist';
import { errorMessage } from '@/components/partners/portal/shared';
import { modeFrom, PATIENT_SOURCES, sourcesOf, type PatientSource, type PracticeMode } from '@/lib/practiceModes';
import { RECOVERY_PLANS, recoveryPlanStatus } from '@/lib/recoveryPlans';
import { playSound } from '@/lib/sounds';
import { cn } from '@/lib/utils';

// A plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const setPracticeModeRef = makeFunctionReference<'mutation', { practiceMode: PracticeMode }, { practiceMode: PracticeMode }>(
    'physioSetup:setMyPracticeMode'
);

type Change = { source: PatientSource; on: boolean; next: PracticeMode };

const CONFIRM: Record<PatientSource, { on: { title: string; body: string }; off: { title: string; body: string } }> = {
    rehabify: {
        on: {
            title: 'Take Rehabify Care patients?',
            body: 'You’ll be listed on Find a Physio and matched with Rehabify Care patients once your setup is complete, including the network terms.',
        },
        off: {
            title: 'Stop taking Rehabify Care patients?',
            body: 'You’ll be taken off Find a Physio and won’t be matched with new Rehabify Care patients. Rehabify patients you already see stay with you.',
        },
    },
    own: {
        on: { title: 'See your own patients on Rehabify?', body: 'You can invite your private patients and invoice them at your own rates.' },
        off: {
            title: 'Only take Rehabify Care patients?',
            body: 'Your current private patients and their records stay with you.',
        },
    },
};

export default function PracticeModePage() {
    const setup = useQuery(api.physioSetup.getMySetupStatus) as SetupStatus | null | undefined;
    const setPracticeMode = useMutation(setPracticeModeRef);
    const [change, setChange] = useState<Change | null>(null);
    const [saving, setSaving] = useState(false);

    if (setup === undefined) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-40 rounded-xl" />
            </div>
        );
    }

    if (setup === null || setup.isClinicMember) {
        return (
            <div className="space-y-6">
                <SettingsPageHeader title="How you work" />
                <SettingsSection>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {setup?.isClinicMember
                            ? 'You work with a clinic, so your clinic decides how you see patients.'
                            : 'Finish your application first.'}
                    </p>
                </SettingsSection>
            </div>
        );
    }

    const current = sourcesOf(setup.practiceMode ?? 'network');

    const request = (source: PatientSource, on: boolean) => {
        const next = modeFrom(on ? [...current, source] : current.filter((s) => s !== source));
        if (!next) {
            toast.error('Keep at least one on.');
            return;
        }
        setChange({ source, on, next });
    };

    const confirm = async () => {
        if (!change) return;
        setSaving(true);
        try {
            await setPracticeMode({ practiceMode: change.next });
            toast.success('Saved');
            playSound('success');
            setChange(null);
        } catch (error) {
            toast.error(errorMessage(error, 'Couldn’t save that. Please try again.'));
            playSound('error');
        } finally {
            setSaving(false);
        }
    };

    const copy = change ? CONFIRM[change.source][change.on ? 'on' : 'off'] : null;

    return (
        <div className="space-y-6">
            <SettingsPageHeader
                title="How you work"
                description="Which patients you see on Rehabify. Each patient follows their own rules: Rehabify Care patients at Rehabify’s prices, your own at yours."
            />

            <SettingsSection>
                <ul className="divide-y divide-neutral-100 dark:divide-white/[0.07]">
                    {PATIENT_SOURCES.map((source) => {
                        const on = current.includes(source.id);
                        return (
                            <li key={source.id} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                                <div className="min-w-0">
                                    <label htmlFor={`source-${source.id}`} className="text-sm font-semibold text-rh-ink dark:text-white">
                                        {source.title}
                                    </label>
                                    <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">{source.summary}</p>
                                    <ul className="mt-2 space-y-1">
                                        {source.points.map((point) => (
                                            <li key={point} className="flex gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                                                <Check className="mt-0.5 h-3 w-3 shrink-0" />
                                                {point}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <Switch
                                    id={`source-${source.id}`}
                                    checked={on}
                                    onCheckedChange={(value) => request(source.id, value)}
                                    className="mt-0.5"
                                />
                            </li>
                        );
                    })}
                </ul>
            </SettingsSection>

            {current.includes('own') && (
                <SettingsSection
                    title="What your patients can add"
                    description="Support between sessions, offered to your own patients by Rehabify. You don’t need to sell or collect anything."
                >
                    <ul className="divide-y divide-neutral-100 dark:divide-white/[0.07]">
                        {RECOVERY_PLANS.map((plan) => (
                            <li key={plan.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-rh-ink dark:text-white">{plan.name}</p>
                                    <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">{plan.description}</p>
                                </div>
                                <span
                                    className={cn(
                                        'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                                        plan.available ? 'bg-rh-lime text-rh-ink' : 'bg-neutral-100 text-neutral-600 dark:bg-white/[0.07] dark:text-neutral-300'
                                    )}
                                >
                                    {recoveryPlanStatus(plan)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </SettingsSection>
            )}

            <AlertDialog open={change !== null} onOpenChange={(open) => !open && !saving && setChange(null)}>
                <AlertDialogContent className="rounded-2xl dark:border-white/10 dark:bg-rh-ink-2">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="dark:text-white">{copy?.title}</AlertDialogTitle>
                        <AlertDialogDescription>{copy?.body}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={saving} className="rounded-full">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={saving}
                            onClick={(event) => {
                                event.preventDefault();
                                void confirm();
                            }}
                            className={cn(primaryButtonClass, 'rounded-full')}
                        >
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirm
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
