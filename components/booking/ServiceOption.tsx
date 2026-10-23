"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Clock, Home, Loader2, Video } from "@/components/icons";
import { cn } from "@/lib/utils";
import { servicePriceLabel, type CatalogueService } from "./booking-shared";

/**
 * A selectable Rehabify service (consultation, assessment, treatment) with its standard price.
 * Selecting shows a lime ring + fill and a check before the caller moves on.
 */
export function ServiceOption({
    service,
    selected = false,
    busy = false,
    highlight,
    priceText,
    note,
    onSelect,
}: {
    service: CatalogueService;
    selected?: boolean;
    /** Another option was picked and the flow is moving on. */
    busy?: boolean;
    /** Small label above the name, e.g. "Not sure where to start?" */
    highlight?: string;
    /** Replaces the standard price, e.g. a Rehabify Access rate. */
    priceText?: ReactNode;
    /** Extra line under the chips. */
    note?: ReactNode;
    onSelect?: () => void;
}) {
    const reduceMotion = useReducedMotion();
    const comingSoon = !service.bookable;
    const ModeIcon = service.mode === "home" ? Home : Video;

    return (
        <motion.button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            disabled={comingSoon || (busy && !selected)}
            whileTap={reduceMotion || comingSoon ? undefined : { scale: 0.98 }}
            animate={reduceMotion ? undefined : { scale: selected ? 1.01 : 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 32 }}
            className={cn(
                "group relative w-full rounded-2xl border p-4 text-left transition-[background-color,border-color,box-shadow,opacity] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime focus-visible:ring-offset-2 sm:p-5",
                selected
                    ? "border-rh-lime bg-rh-honeydew shadow-[0_0_0_1px_#00cd0f,0_16px_32px_-18px_rgba(0,205,15,0.9)]"
                    : highlight
                      ? "border-rh-lime/60 bg-white hover:border-rh-lime hover:shadow-[0_10px_30px_-18px_rgba(0,46,44,0.45)]"
                      : "border-rh-night/10 bg-white hover:border-rh-night/30 hover:shadow-[0_10px_30px_-18px_rgba(0,46,44,0.45)]",
                comingSoon && "cursor-default border-dashed opacity-70 hover:border-rh-night/10 hover:shadow-none",
                busy && !selected && "opacity-50"
            )}
        >
            {highlight && (
                <span className="mb-2 inline-flex rounded-full bg-rh-lime/20 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-rh-night">
                    {highlight}
                </span>
            )}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-base font-semibold tracking-tight text-rh-night sm:text-lg">{service.name}</h3>
                    <p className="mt-0.5 text-sm text-rh-night/60">{service.summary}</p>
                </div>
                {!comingSoon && (
                    <span
                        aria-hidden
                        className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all duration-200",
                            selected
                                ? "border-rh-lime bg-rh-lime text-rh-night"
                                : "border-rh-night/15 text-rh-night/40 group-hover:border-rh-night/40 group-hover:text-rh-night"
                        )}
                    >
                        {selected ? (
                            busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={3} />
                        ) : (
                            <ArrowRight className="h-3.5 w-3.5" />
                        )}
                    </span>
                )}
            </div>

            <div className="mt-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
                <ul className="flex flex-wrap gap-1.5 text-xs font-medium text-rh-night/70">
                    <li className="inline-flex items-center gap-1 rounded-full bg-rh-night/[0.05] px-2.5 py-1">
                        <Clock className="h-3.5 w-3.5" aria-hidden /> {service.durationLabel}
                    </li>
                    <li className="inline-flex items-center gap-1 rounded-full bg-rh-night/[0.05] px-2.5 py-1">
                        <ModeIcon className="h-3.5 w-3.5" aria-hidden /> {service.mode === "home" ? "Home visit" : "Video call"}
                    </li>
                    {service.requiresPriorAssessment && (
                        <li className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">
                            Needs an assessment first
                        </li>
                    )}
                    {comingSoon && (
                        <li className="inline-flex items-center rounded-full bg-rh-night/[0.05] px-2.5 py-1">Coming soon</li>
                    )}
                </ul>
                {!comingSoon && (
                    <p className="text-right text-base font-bold tabular-nums text-rh-night">{priceText ?? servicePriceLabel(service)}</p>
                )}
            </div>
            {note && <span className="mt-3 block text-xs text-rh-night/60">{note}</span>}
        </motion.button>
    );
}
