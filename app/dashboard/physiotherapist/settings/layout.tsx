'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { cn } from '@/lib/utils';
import type { SetupStatus } from '@/components/physio/SetupChecklist';

const BASE = '/dashboard/physiotherapist/settings';

type SettingsLink = { label: string; href: string; setupItem?: string };

/** Grouped like Apple's Settings: who you are, how you practise, then the account itself. */
const GROUPS: { label: string; items: SettingsLink[] }[] = [
    {
        label: 'You',
        items: [
            { label: 'Profile', href: `${BASE}/profile`, setupItem: 'profile' },
            { label: 'Documents', href: `${BASE}/documents`, setupItem: 'documents' },
        ],
    },
    {
        label: 'Practice',
        items: [
            { label: 'Working hours', href: `${BASE}/availability`, setupItem: 'availability' },
            { label: 'Services & coverage', href: `${BASE}/marketplace`, setupItem: 'coverage' },
            { label: 'Network terms', href: `${BASE}/network-terms`, setupItem: 'network_terms' },
            { label: 'Payout schedule', href: `${BASE}/fee-schedule` },
            { label: 'Payouts', href: `${BASE}/payout`, setupItem: 'payout' },
            { label: 'Calendar sync', href: `${BASE}/calendar` },
        ],
    },
    {
        label: 'Account',
        items: [{ label: 'Account & privacy', href: `${BASE}/privacy` }],
    },
];

const ALL_LINKS = GROUPS.flatMap((group) => group.items);

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname() ?? '';
    const setup = useQuery(api.physioSetup.getMySetupStatus) as SetupStatus | null | undefined;
    // Small dot beside settings that still block bookings
    const pending = new Set(
        (setup?.items ?? []).filter((item) => item.required && !item.done).map((item) => item.id)
    );
    const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

    const dot = (link: SettingsLink) =>
        link.setupItem && pending.has(link.setupItem) ? (
            <span className="h-2 w-2 shrink-0 rounded-full bg-rh-amber" aria-label="Needs attention" />
        ) : null;

    return (
        <div className="mx-auto w-full max-w-5xl">
            {/* Phones and tablets: one scrollable row */}
            <nav
                aria-label="Settings"
                className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-black/[0.06] px-4 pb-px [scrollbar-width:none] dark:border-white/[0.07] sm:-mx-6 sm:px-6 lg:hidden [&::-webkit-scrollbar]:hidden"
            >
                {ALL_LINKS.map((link) => (
                    <Link
                        key={link.href}
                        href={link.href}
                        aria-current={isActive(link.href) ? 'page' : undefined}
                        className={cn(
                            'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors',
                            isActive(link.href)
                                ? 'border-rh-lime font-semibold text-rh-ink dark:border-rh-lime dark:text-white'
                                : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                        )}
                    >
                        {link.label}
                        {dot(link)}
                    </Link>
                ))}
            </nav>

            <div className="lg:grid lg:grid-cols-[13rem_1fr] lg:gap-10">
                <nav aria-label="Settings" className="hidden lg:block">
                    <div className="sticky top-24 space-y-5 rounded-2xl border border-black/[0.04] bg-white p-3 shadow-soft dark:border-white/[0.06] dark:bg-rh-ink-2 dark:shadow-none">
                        <p className="px-3 pt-1 text-lg font-semibold tracking-tight text-rh-ink dark:text-white">Settings</p>
                        {GROUPS.map((group) => (
                            <div key={group.label} className="space-y-0.5">
                                <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                                    {group.label}
                                </p>
                                {group.items.map((link) => (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        aria-current={isActive(link.href) ? 'page' : undefined}
                                        className={cn(
                                            'flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition-colors',
                                            isActive(link.href)
                                                ? 'bg-rh-honeydew font-semibold text-rh-ink dark:bg-white/[0.06] dark:text-rh-lime'
                                                : 'text-neutral-600 hover:bg-rh-canvas hover:text-rh-ink dark:text-neutral-400 dark:hover:bg-white/[0.04] dark:hover:text-white'
                                        )}
                                    >
                                        <span className="truncate">{link.label}</span>
                                        {dot(link)}
                                    </Link>
                                ))}
                            </div>
                        ))}
                    </div>
                </nav>

                <div className="min-w-0 max-w-3xl">{children}</div>
            </div>
        </div>
    );
}
