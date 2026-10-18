"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Clock, Loader2, MapPin, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SessionType } from "./booking-shared";

/**
 * A selectable session type (Initial consultation / Follow-up / Quick check-in).
 * Selecting shows a lime ring + fill, a check and a small spring "press" before the
 * caller moves on, so the choice is visibly registered.
 */
export function SessionTypeOption({
    session,
    prices,
    offersOnline,
    offersInPerson,
    selected,
    busy,
    onSelect,
}: {
    session: SessionType;
    prices?: { label: string; amount: string }[];
    offersOnline?: boolean;
    offersInPerson?: boolean;
    selected: boolean;
    /** Another option was picked and the flow is moving on. */
    busy: boolean;
    onSelect: () => void;
}) {
    const reduceMotion = useReducedMotion();

    return (
        <motion.button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            disabled={busy && !selected}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            animate={reduceMotion ? undefined : { scale: selected ? 1.01 : 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 32 }}
            className={cn(
                "group relative w-full rounded-2xl border p-4 text-left transition-[background-color,border-color,box-shadow,opacity] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime focus-visible:ring-offset-2 sm:p-5 dark:focus-visible:ring-offset-rh-ink",
                selected
                    ? "border-rh-lime bg-rh-honeydew shadow-[0_0_0_1px_#00cd0f,0_16px_32px_-18px_rgba(0,205,15,0.9)] dark:bg-rh-lime/10"
                    : "border-rh-night/10 bg-white hover:border-rh-night/30 hover:shadow-[0_10px_30px_-18px_rgba(0,46,44,0.45)] dark:border-white/10 dark:bg-rh-ink-2 dark:hover:border-white/30",
                busy && !selected && "opacity-50"
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-base font-semibold tracking-tight text-rh-night sm:text-lg dark:text-white">{session.title}</h3>
                    <p className="mt-0.5 text-sm text-rh-night/60 dark:text-white/60">{session.description}</p>
                </div>
                <span
                    aria-hidden
                    className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all duration-200",
                        selected
                            ? "border-rh-lime bg-rh-lime text-rh-night"
                            : "border-rh-night/15 text-rh-night/40 group-hover:border-rh-night/40 group-hover:text-rh-night dark:border-white/15 dark:text-white/40 dark:group-hover:border-white/40 dark:group-hover:text-white"
                    )}
                >
                    {selected ? (
                        busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={3} />
                    ) : (
                        <ArrowRight className="h-3.5 w-3.5" />
                    )}
                </span>
            </div>

            <div className="mt-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
                <ul className="flex flex-wrap gap-1.5 text-xs font-medium text-rh-night/70 dark:text-white/70">
                    <li className="inline-flex items-center gap-1 rounded-full bg-rh-night/[0.05] px-2.5 py-1 dark:bg-white/[0.07]">
                        <Clock className="h-3.5 w-3.5" aria-hidden /> {session.duration} min
                    </li>
                    {offersOnline && (
                        <li className="inline-flex items-center gap-1 rounded-full bg-rh-night/[0.05] px-2.5 py-1 dark:bg-white/[0.07]">
                            <Video className="h-3.5 w-3.5" aria-hidden /> Video
                        </li>
                    )}
                    {offersInPerson && (
                        <li className="inline-flex items-center gap-1 rounded-full bg-rh-night/[0.05] px-2.5 py-1 dark:bg-white/[0.07]">
                            <MapPin className="h-3.5 w-3.5" aria-hidden /> In person
                        </li>
                    )}
                </ul>
                {prices && prices.length > 0 && (
                    <dl className="space-y-0.5 text-right">
                        {prices.map((row) => (
                            <div key={row.label} className="flex items-baseline justify-end gap-2">
                                <dt className="text-xs text-rh-night/55 dark:text-white/55">{row.label}</dt>
                                <dd className="text-base font-bold tabular-nums text-rh-night dark:text-white">{row.amount}</dd>
                            </div>
                        ))}
                    </dl>
                )}
            </div>
        </motion.button>
    );
}
