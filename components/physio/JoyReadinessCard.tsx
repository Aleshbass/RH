'use client';

/**
 * "Can Joy offer you to patients?": every check Joy's matching makes (convex/joyMatching.ts), with
 * the fix for each one, so a physio is never left out of Joy's matches without knowing why.
 * Used on the physio's Services & coverage page; admins see the same list per physio.
 */

import Link from 'next/link';
import { api } from '@/convex/_generated/api';
import { CheckCircle2, Circle } from '@/components/icons';
import { SettingsSection } from '@/components/physio/SettingsUI';
import { StatusBadge } from '@/components/physio/ui';
import { useQueryUntyped } from '@/lib/convexUntyped';
import { cn } from '@/lib/utils';

export type JoyReadinessCheck = {
    id: string;
    label: string;
    done: boolean;
    required: boolean;
    fix?: string;
    href?: string;
};

export type JoyReadiness = { ready: boolean; checks: JoyReadinessCheck[] };

const root = api as unknown as Record<string, Record<string, unknown>>;

export function JoyReadinessList({ readiness, linkFixes = true }: { readiness: JoyReadiness; linkFixes?: boolean }) {
    const required = readiness.checks.filter((check) => check.required);
    const extras = readiness.checks.filter((check) => !check.required);
    const row = (check: JoyReadinessCheck) => (
        <li key={check.id} className="flex gap-3 py-2.5">
            {check.done ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#00a80c]" aria-label="Done" />
            ) : (
                <Circle className={cn('mt-0.5 h-4 w-4 shrink-0', check.required ? 'text-amber-600' : 'text-neutral-400')} aria-label="Not yet" />
            )}
            <div className="min-w-0 text-sm">
                <p className={cn('font-medium', check.done ? 'text-neutral-700 dark:text-neutral-300' : 'text-rh-ink dark:text-white')}>{check.label}</p>
                {!check.done && check.fix ? (
                    <p className="mt-0.5 text-neutral-600 dark:text-neutral-400">
                        {check.fix}{' '}
                        {linkFixes && check.href ? (
                            <Link href={check.href} className="font-medium text-rh-ink underline-offset-2 hover:underline dark:text-rh-lime">
                                Fix this
                            </Link>
                        ) : null}
                    </p>
                ) : null}
            </div>
        </li>
    );
    return (
        <div className="space-y-4">
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">{required.map(row)}</ul>
            {extras.length ? (
                <div>
                    <p className="text-sm font-semibold text-rh-ink dark:text-white">Gets you better matches</p>
                    <ul className="mt-1 divide-y divide-neutral-100 dark:divide-neutral-800">{extras.map(row)}</ul>
                </div>
            ) : null}
        </div>
    );
}

export function JoyReadinessCard() {
    const readiness = useQueryUntyped(root.joyMatching.myJoyMatchReadiness, {}) as JoyReadiness | null | undefined;
    if (!readiness) return null;
    const missing = readiness.checks.filter((check) => check.required && !check.done).length;
    return (
        <SettingsSection
            title="Can Joy offer you to patients?"
            description="Joy, our WhatsApp assistant, offers patients up to three physiotherapists whose specialties fit, with their next free time. These are the checks it makes."
        >
            <div className="mb-3">
                {readiness.ready ? (
                    <StatusBadge tone="green" dot>Joy can offer you</StatusBadge>
                ) : (
                    <StatusBadge tone="amber" dot>{missing} {missing === 1 ? 'thing' : 'things'} to fix first</StatusBadge>
                )}
            </div>
            <JoyReadinessList readiness={readiness} />
        </SettingsSection>
    );
}
