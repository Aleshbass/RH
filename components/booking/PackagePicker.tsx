"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNaira } from "./booking-shared";

export type PackageSize = 1 | 4 | 8 | 12;

export interface PackageBreakdown {
    sessions: number;
    sessionRate: number;
    discountPercent: number;
    discountedRate: number;
    total: number;
    normalTotal: number;
    saves: number;
}

const PACKAGES: { sessions: PackageSize; name: string; desc: string; popular?: boolean }[] = [
    { sessions: 1, name: "Single session", desc: "Try a session, no commitment" },
    { sessions: 4, name: "Starter package", desc: "Great for mild conditions" },
    { sessions: 8, name: "Complete care", desc: "Our most popular plan", popular: true },
    { sessions: 12, name: "Full recovery", desc: "Best for complex cases" },
];

export const PACKAGE_LABELS: Record<PackageSize, string> = {
    1: "Single Session",
    4: "Starter Package",
    8: "Complete Care",
    12: "Full Recovery",
};

/**
 * Package total in naira. Must match packageTotalNaira in convex/helpers/marketplacePricing.ts
 * (the server rejects any other amount).
 */
export function calcPackage(rate: number, sessions: number, discountPct: number): PackageBreakdown {
    const discount = sessions === 1 ? 0 : discountPct;
    const discountPerSession = Math.round(rate * (discount / 100));
    const discountedRate = rate - discountPerSession;
    const total = discountedRate * sessions;
    const normalTotal = rate * sessions;
    return { sessions, sessionRate: rate, discountPercent: discount, discountedRate, total, normalTotal, saves: normalTotal - total };
}

export function PackagePicker({
    sessionRate,
    discountPercent,
    selected,
    onSelect,
}: {
    sessionRate: number;
    discountPercent: number;
    selected: PackageSize;
    onSelect: (size: PackageSize) => void;
}) {
    const reduceMotion = useReducedMotion();

    return (
        <div role="radiogroup" aria-label="Choose your plan" className="space-y-2.5">
            {PACKAGES.map(({ sessions, name, desc, popular }) => {
                const breakdown = calcPackage(sessionRate, sessions, discountPercent);
                const isSelected = selected === sessions;
                return (
                    <motion.button
                        key={sessions}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => onSelect(sessions)}
                        whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                        className={cn(
                            "relative flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-[background-color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime focus-visible:ring-offset-2",
                            isSelected
                                ? "border-rh-lime bg-rh-honeydew shadow-[0_0_0_1px_#00cd0f]"
                                : "border-rh-night/10 bg-white hover:border-rh-night/30"
                        )}
                    >
                        <span
                            aria-hidden
                            className={cn(
                                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                                isSelected ? "border-rh-lime bg-rh-lime text-rh-night" : "border-rh-night/20"
                            )}
                        >
                            {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-rh-night">{name}</span>
                                {popular && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-rh-night px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rh-lime">
                                        <Sparkles className="h-3 w-3" aria-hidden /> Popular
                                    </span>
                                )}
                            </span>
                            <span className="mt-0.5 block text-xs text-rh-night/55">
                                {sessions === 1 ? desc : `${sessions} sessions · ${desc}`}
                            </span>
                        </span>
                        <span className="shrink-0 text-right">
                            <span className="block text-base font-bold tabular-nums text-rh-night">{formatNaira(breakdown.total)}</span>
                            {sessions > 1 && (
                                <span className="block text-[11px] tabular-nums text-rh-night/55">{formatNaira(breakdown.discountedRate)}/session</span>
                            )}
                            {breakdown.saves > 0 && (
                                <span className="block text-[11px] font-semibold tabular-nums text-emerald-700">Save {formatNaira(breakdown.saves)}</span>
                            )}
                        </span>
                    </motion.button>
                );
            })}
        </div>
    );
}
