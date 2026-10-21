'use client';

import { StatusBadge } from '@/components/physio/ui';
import { formatKobo } from '@/lib/rehabify-services';
import { cn } from '@/lib/utils';
import type { PayoutSchedule } from '@/lib/rehabify-api-types';

export type { PayoutSchedule };
export type PayoutScheduleService = PayoutSchedule['services'][number];

const cellLabel = 'text-[11px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500 sm:hidden';

/**
 * Rehabify services with the patient price and the physio's payout (and the Rehabify Access
 * payout where the service is offered under Access). Rows stack on phones.
 */
export function PayoutScheduleTable({ services }: { services: PayoutScheduleService[] }) {
    const showAccess = services.some((service) => service.assistedPayoutKobo !== null);
    const columns = showAccess ? 'sm:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem]' : 'sm:grid-cols-[minmax(0,1fr)_7rem_7rem]';

    return (
        <div className="-mx-4 sm:-mx-6">
            <div
                className={cn(
                    'hidden gap-4 border-b border-neutral-100 px-6 pb-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400 dark:border-white/[0.07] dark:text-neutral-500 sm:grid',
                    columns
                )}
            >
                <span>Service</span>
                <span className="text-right">Patient pays</span>
                <span className="text-right">You earn</span>
                {showAccess && <span className="text-right">Access payout</span>}
            </div>
            <ul className="divide-y divide-neutral-100 dark:divide-white/[0.07]">
                {services.map((service) => (
                    <li
                        key={service.id}
                        className={cn('grid grid-cols-3 gap-x-4 gap-y-2 px-4 py-3 sm:items-center sm:px-6', columns, !service.active && 'opacity-60')}
                    >
                        <div className="col-span-3 min-w-0 sm:col-span-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium text-neutral-900 dark:text-white">{service.name}</p>
                                {!service.active && <StatusBadge>Paused</StatusBadge>}
                            </div>
                            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                                {service.durationLabel} · {service.mode === 'home' ? 'Home visit' : 'Video'}
                            </p>
                        </div>
                        <div className="sm:text-right">
                            <p className={cellLabel}>Patient pays</p>
                            <p className="text-sm tabular-nums text-neutral-700 dark:text-neutral-300">
                                {service.travelApplies ? 'From ' : ''}
                                {formatKobo(service.priceKobo)}
                            </p>
                        </div>
                        <div className="sm:text-right">
                            <p className={cellLabel}>You earn</p>
                            <p className="text-sm font-semibold tabular-nums text-rh-night dark:text-white">{formatKobo(service.payoutKobo)}</p>
                            {service.travelApplies && (
                                <p className="text-[11px] leading-4 text-neutral-500 dark:text-neutral-400">+ your share of travel</p>
                            )}
                        </div>
                        {showAccess && (
                            <div className="sm:text-right">
                                <p className={cellLabel}>Access payout</p>
                                <p className="text-sm tabular-nums text-neutral-700 dark:text-neutral-300">
                                    {service.assistedPayoutKobo !== null ? formatKobo(service.assistedPayoutKobo) : '–'}
                                </p>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
