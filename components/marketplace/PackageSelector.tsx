"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, Shield, Sparkles } from "lucide-react";
import { formatNaira } from "@/lib/pricing";

interface PackageSelectorProps {
    /** Session rate in Naira (formula-calculated or physio's rate) */
    sessionRate: number;
    /** Physio's set package discount % (5-15), default 7 */
    discountPercent: number;
    /** Currently selected package */
    selectedPackage: 1 | 4 | 8 | 12;
    /** Callback when package is selected */
    onSelect: (pkg: 1 | 4 | 8 | 12, breakdown: SimplePackageBreakdown) => void;
}

export interface SimplePackageBreakdown {
    sessions: number;
    sessionRate: number;
    discountPercent: number;
    discountedRate: number;
    total: number;
    normalTotal: number;
    saves: number;
}

const PACKAGES = [
    { sessions: 1 as const, name: "Single Session", desc: "Try a session, no commitment" },
    { sessions: 4 as const, name: "Starter Package", desc: "4 sessions — great for mild conditions" },
    { sessions: 8 as const, name: "Complete Care", desc: "8 sessions — our most popular plan", popular: true },
    { sessions: 12 as const, name: "Full Recovery", desc: "12 sessions — best for complex cases" },
];

const PERKS: Record<number, string[]> = {
    1: ["Comprehensive assessment", "Personalized treatment plan"],
    4: ["4 physiotherapy sessions", "Home exercise program", "Progress tracking"],
    8: ["8 physiotherapy sessions", "Home exercise program", "Progress tracking & outcomes", "1 FREE telehealth check-in", "Outcomes report"],
    12: ["12 physiotherapy sessions", "Home exercise program", "Progress tracking", "2 FREE telehealth check-ins", "Comprehensive outcomes report", "₦2,000 credit toward next package"],
};

function calcPackage(rate: number, sessions: number, discountPct: number): SimplePackageBreakdown {
    const discount = sessions === 1 ? 0 : discountPct;
    const discountPerSession = Math.round(rate * (discount / 100));
    const discountedRate = rate - discountPerSession;
    const total = discountedRate * sessions;
    const normalTotal = rate * sessions;
    return {
        sessions,
        sessionRate: rate,
        discountPercent: discount,
        discountedRate,
        total,
        normalTotal,
        saves: normalTotal - total,
    };
}

export default function PackageSelector({
    sessionRate,
    discountPercent,
    selectedPackage,
    onSelect,
}: PackageSelectorProps) {
    const [expandedPkg, setExpandedPkg] = useState<number | null>(null);

    const packages = useMemo(() => {
        return PACKAGES.map((p) => ({
            ...p,
            breakdown: calcPackage(sessionRate, p.sessions, discountPercent),
        }));
    }, [sessionRate, discountPercent]);

    if (sessionRate <= 0) return null;

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white/80">
                    Choose Your Plan
                </h3>
            </div>

            <div className="space-y-2">
                {packages.map(({ sessions, name, desc, popular, breakdown }) => {
                    const isSelected = selectedPackage === sessions;
                    const isExpanded = expandedPkg === sessions;
                    const perks = PERKS[sessions];

                    return (
                        <motion.div key={sessions} layout className="relative">
                            {popular && (
                                <div className="absolute -top-2 left-4 z-10">
                                    <span className="px-2.5 py-0.5 bg-amber-400 text-[10px] font-bold text-amber-900 rounded-full tracking-wide uppercase">
                                        Most Popular
                                    </span>
                                </div>
                            )}

                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                    onSelect(sessions, breakdown);
                                    setExpandedPkg(isExpanded ? null : sessions);
                                }}
                                className={`w-full cursor-pointer text-left rounded-xl border-2 transition-all duration-200 ${isSelected
                                    ? "border-teal-300 bg-white/[0.08]"
                                    : popular
                                        ? "border-amber-400/40 bg-[#00443e] hover:border-amber-500/50"
                                        : "border-white/15 bg-[#00443e] hover:border-gray-500"
                                    }`}
                            >
                                <div className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-start gap-3 flex-1 min-w-0">
                                            {/* Radio indicator */}
                                            <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? "border-teal-500 bg-teal-500" : "border-white/30"
                                                }`}>
                                                {isSelected && <Check className="w-3 h-3 text-white" />}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-white text-sm">{name}</p>
                                                <p className="text-xs text-white/50 mt-0.5">{desc}</p>
                                            </div>
                                        </div>

                                        {/* Price */}
                                        <div className="text-right flex-shrink-0">
                                            <p className="font-bold text-white text-base">
                                                {formatNaira(breakdown.total)}
                                            </p>
                                            {sessions > 1 && (
                                                <p className="text-[11px] text-white/50">
                                                    {formatNaira(breakdown.discountedRate)}/session
                                                </p>
                                            )}
                                            {breakdown.saves > 0 && (
                                                <p className="text-[11px] text-green-400 font-medium mt-0.5">
                                                    Save {formatNaira(breakdown.saves)}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Expand toggle */}
                                    {isSelected && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setExpandedPkg(isExpanded ? null : sessions);
                                            }}
                                            className="flex items-center gap-1 text-[11px] text-teal-300 mt-2 ml-8 hover:text-teal-200"
                                        >
                                            {isExpanded ? "Hide" : "View"} details
                                            <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                        </button>
                                    )}
                                </div>

                                {/* Expanded details */}
                                <AnimatePresence>
                                    {isSelected && isExpanded && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="px-4 pb-4 border-t border-white/10 pt-3 ml-8 space-y-3">
                                                {/* What's included */}
                                                <div>
                                                    <p className="text-[11px] text-white/50 uppercase tracking-wider mb-1.5 font-medium">
                                                        What&apos;s included
                                                    </p>
                                                    <ul className="space-y-1">
                                                        {perks.map((perk, i) => (
                                                            <li key={i} className="flex items-start gap-1.5 text-xs text-white/65">
                                                                <Check className="w-3 h-3 text-teal-300 mt-0.5 flex-shrink-0" />
                                                                {perk}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>

                                                {/* Price breakdown */}
                                                <div>
                                                    <p className="text-[11px] text-white/50 uppercase tracking-wider mb-1.5 font-medium">
                                                        Price Breakdown
                                                    </p>
                                                    <div className="space-y-1 text-xs">
                                                        <div className="flex justify-between text-white/65">
                                                            <span>{sessions === 1 ? "Session" : `${sessions} sessions`}</span>
                                                            <span>{sessions === 1 ? formatNaira(breakdown.sessionRate) : `${formatNaira(breakdown.discountedRate)} × ${sessions}`}</span>
                                                        </div>
                                                        {breakdown.saves > 0 && (
                                                            <div className="flex justify-between text-green-400 pt-1 border-t border-white/10">
                                                                <span>Package discount ({breakdown.discountPercent}%)</span>
                                                                <span>-{formatNaira(breakdown.saves)}</span>
                                                            </div>
                                                        )}
                                                        {/* Removed Platform Fee line for cleaner pricing display */}
                                                        <div className="flex justify-between text-white font-semibold pt-1 border-t border-white/10">
                                                            <span>Total</span>
                                                            <span>{formatNaira(breakdown.total)}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Trust badges */}
                                                <div className="flex items-center gap-2 pt-1">
                                                    <Shield className="w-3 h-3 text-white/40" />
                                                    <span className="text-[10px] text-white/40">
                                                        Secure payment · Verified physiotherapist
                                                    </span>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

        </div>
    );
}
