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
import { primaryButtonClass } from '@/components/physio/ui';
import { SettingsPageHeader, SettingsSection } from '@/components/physio/SettingsUI';
import type { SetupStatus } from '@/components/physio/SetupChecklist';
import { errorMessage } from '@/components/partners/portal/shared';
import { choiceOf, PRACTICE_CHOICES, type PracticeChoice } from '@/lib/practiceModes';
import { recoveryPlanStatus } from '@/lib/recoveryPlans';
import { useRecoveryPlans } from '@/components/exercise-programs/flex';
import { playSound } from '@/lib/sounds';
import { cn } from '@/lib/utils';

// A plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const setPracticeModeRef = makeFunctionReference<'mutation', { practiceMode: PracticeChoice }, { practiceMode: PracticeChoice }>(
    'physioSetup:setMyPracticeMode'
);

const CONFIRM: Record<PracticeChoice, { title: string; body: string }> = {
    network: {
        title: 'Become a Rehabify physio?',
        body: 'You’ll be listed on Find a Physio and matched with Rehabify Care patients once your setup is complete, including the network terms. Your own patients stay with you.',
    },
    independent: {
        title: 'Become an independent physio?',
        body: 'You’ll be taken off Find a Physio and won’t be matched with new Rehabify Care patients. Rehabify patients you already see stay with you, still at Rehabify’s prices and paid through Rehabify.',
    },
};

export default function PracticeModePage() {
    const setup = useQuery(api.physioSetup.getMySetupStatus) as SetupStatus | null | undefined;
    const setPracticeMode = useMutation(setPracticeModeRef);
    // Live prices once an admin launches Flex / Flex Max; "Coming soon" until then
    const { plans: recoveryPlans } = useRecoveryPlans();
    const [change, setChange] = useState<PracticeChoice | null>(null);
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

    // Not chosen yet (older accounts): nothing selected until they pick
    const current = choiceOf(setup.practiceMode);
    const seesOwnPatients = setup.practiceMode === 'independent' || setup.practiceMode === 'both';

    const confirm = async () => {
        if (!change) return;
        setSaving(true);
        try {
            await setPracticeMode({ practiceMode: change });
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

    const copy = change ? CONFIRM[change] : null;

    return (
        <div className="space-y-6">
            <SettingsPageHeader
                title="How you work"
                description="Whether you’re a Rehabify physio or an independent physio. Each patient follows their own rules: Rehabify Care patients at Rehabify’s prices, your own at yours."
            />

            <SettingsSection>
                <div role="radiogroup" aria-label="How you work with Rehabify" className="grid gap-3">
                    {PRACTICE_CHOICES.map((choice) => {
                        const selected = current === choice.id;
                        return (
                            <button
                                key={choice.id}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => !selected && setChange(choice.id)}
                                className={cn(
                                    'flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2 dark:focus-visible:ring-rh-lime dark:focus-visible:ring-offset-rh-ink-2',
                                    selected
                                        ? 'border-rh-ink dark:border-rh-lime'
                                        : 'border-neutral-200 hover:border-neutral-400 dark:border-white/10 dark:hover:border-white/25'
                                )}
                            >
                                <span
                                    aria-hidden
                                    className={cn(
                                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                                        selected ? 'border-rh-ink dark:border-rh-lime' : 'border-neutral-300 dark:border-white/25'
                                    )}
                                >
                                    {selected && <span className="h-2.5 w-2.5 rounded-full bg-rh-ink dark:bg-rh-lime" />}
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-rh-ink dark:text-white">{choice.title}</span>
                                    <span className="mt-0.5 block text-sm text-neutral-600 dark:text-neutral-400">{choice.summary}</span>
                                    <span className="mt-2 block space-y-1">
                                        {choice.points.map((point) => (
                                            <span key={point} className="flex gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                                                <Check className="mt-0.5 h-3 w-3 shrink-0" />
                                                {point}
                                            </span>
                                        ))}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </SettingsSection>

            {seesOwnPatients && (
                <SettingsSection
                    title="What your patients can add"
                    description="Support between sessions, offered to your own patients by Rehabify. You don’t need to sell or collect anything, and Rehabify Care patients have it included."
                >
                    <ul className="divide-y divide-neutral-100 dark:divide-white/[0.07]">
                        {recoveryPlans.map((plan) => (
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
