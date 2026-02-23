"use client";

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    MapPin,
    Stethoscope,
    Receipt,
    ArrowRight,
    ArrowLeft,
    CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import {
    CITIES,
    CONDITION_GROUPS,
    calculateSessionPrice,
    formatNaira,
    type LocationTier,
    type ConditionLevel,
    type PriceBreakdown,
} from "@/lib/pricing";

// ── Step indicator ────────────────────────────────
const STEPS = [
    { id: 1, label: "Location", icon: MapPin },
    { id: 2, label: "Condition", icon: Stethoscope },
    { id: 3, label: "Your Price", icon: Receipt },
];

function StepIndicator({ current }: { current: number }) {
    return (
        <div className="flex items-center justify-center gap-2 sm:gap-4 mb-10">
            {STEPS.map((step, i) => {
                const done = current > step.id;
                const active = current === step.id;
                const Icon = step.icon;
                return (
                    <React.Fragment key={step.id}>
                        {i > 0 && (
                            <div
                                className={`hidden sm:block h-0.5 w-8 md:w-16 transition-colors duration-300 ${done ? "bg-[#005b57]" : "bg-gray-300"
                                    }`}
                            />
                        )}
                        <div className="flex items-center gap-2">
                            <div
                                className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${done
                                        ? "bg-[#005b57] text-white"
                                        : active
                                            ? "bg-[#005b57] text-white ring-4 ring-[#005b57]/20"
                                            : "bg-gray-200 text-gray-500"
                                    }`}
                            >
                                {done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
                            </div>
                            <span
                                className={`hidden sm:inline text-sm font-medium ${active ? "text-[#005b57]" : "text-gray-400"
                                    }`}
                            >
                                {step.label}
                            </span>
                        </div>
                    </React.Fragment>
                );
            })}
        </div>
    );
}

// ── Slide animation ───────────────────────────────
const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
};

// ── Main page component ──────────────────────────
export default function StartTreatmentPage() {
    const [step, setStep] = useState(1);
    const [direction, setDirection] = useState(1);

    // Step 1 state
    const [selectedCity, setSelectedCity] = useState<string | null>(null);
    const [selectedAreaIdx, setSelectedAreaIdx] = useState<number | null>(null);

    // Step 2 state
    const [selectedCondition, setSelectedCondition] = useState<{
        label: string;
        level: ConditionLevel;
    } | null>(null);

    // Derived
    const locationTier: LocationTier | null =
        selectedCity !== null && selectedAreaIdx !== null
            ? CITIES[selectedCity].areas[selectedAreaIdx].tier
            : null;

    const price: PriceBreakdown | null =
        locationTier && selectedCondition
            ? calculateSessionPrice(locationTier, selectedCondition.level)
            : null;

    const goNext = useCallback(() => {
        setDirection(1);
        setStep((s) => s + 1);
    }, []);

    const goBack = useCallback(() => {
        setDirection(-1);
        setStep((s) => s - 1);
    }, []);

    const canAdvanceStep1 = selectedCity !== null && selectedAreaIdx !== null;
    const canAdvanceStep2 = selectedCondition !== null;

    // Build query string for sign-up redirect
    const signUpParams = new URLSearchParams();
    if (selectedCity && selectedAreaIdx !== null) {
        signUpParams.set("city", selectedCity);
        signUpParams.set("area", String(selectedAreaIdx));
    }
    if (selectedCondition) {
        signUpParams.set("condition", selectedCondition.label);
        signUpParams.set("conditionLevel", selectedCondition.level);
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#f0faf9] via-white to-[#FAF6E7] flex flex-col">
            {/* Header */}
            <div className="pt-6 pb-2 flex justify-center">
                <Link href="/">
                    <Image
                        src="/logos/MainRehabify.svg"
                        alt="Rehabify"
                        width={140}
                        height={40}
                        priority
                    />
                </Link>
            </div>

            <div className="flex-1 flex items-start sm:items-center justify-center px-4 py-8">
                <div className="w-full max-w-2xl">
                    <StepIndicator current={step} />

                    <AnimatePresence mode="wait" custom={direction}>
                        {step === 1 && (
                            <motion.div
                                key="step1"
                                custom={direction}
                                variants={slideVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.3, ease: "easeInOut" }}
                            >
                                {/* STEP 1 — Location */}
                                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-6 sm:p-10">
                                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                                        Where are you located?
                                    </h1>
                                    <p className="text-gray-500 mb-8">
                                        This helps us find nearby physiotherapists and calculate your rate.
                                    </p>

                                    {/* City pills */}
                                    <div className="flex flex-wrap gap-3 mb-8">
                                        {Object.entries(CITIES).map(([key, city]) => (
                                            <button
                                                key={key}
                                                onClick={() => {
                                                    setSelectedCity(key);
                                                    setSelectedAreaIdx(null);
                                                }}
                                                className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 cursor-pointer border ${selectedCity === key
                                                        ? "bg-[#005b57] text-white border-[#005b57] shadow-lg shadow-[#005b57]/20"
                                                        : "bg-gray-50 text-gray-700 border-gray-200 hover:border-[#005b57] hover:text-[#005b57]"
                                                    }`}
                                            >
                                                📍 {city.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Sub-areas */}
                                    {selectedCity && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="space-y-3"
                                        >
                                            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                                Select your area
                                            </p>
                                            {CITIES[selectedCity].areas.map((area, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => setSelectedAreaIdx(idx)}
                                                    className={`w-full text-left px-5 py-4 rounded-2xl border transition-all duration-200 cursor-pointer ${selectedAreaIdx === idx
                                                            ? "bg-[#e6f0ef] border-[#005b57] ring-2 ring-[#005b57]/20"
                                                            : "bg-gray-50 border-gray-200 hover:border-[#005b57]/50"
                                                        }`}
                                                >
                                                    <span className="font-medium text-gray-900">{area.label}</span>
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}

                                    {/* Next */}
                                    <div className="mt-8 flex justify-between items-center">
                                        <Link
                                            href="/"
                                            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                                        >
                                            ← Back to home
                                        </Link>
                                        <button
                                            onClick={goNext}
                                            disabled={!canAdvanceStep1}
                                            className={`group flex items-center gap-2 py-3 px-8 rounded-full font-semibold transition-all duration-300 cursor-pointer ${canAdvanceStep1
                                                    ? "bg-[#005b57] text-white hover:bg-[#004a46] shadow-lg shadow-[#005b57]/20 hover:scale-105"
                                                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                                                }`}
                                        >
                                            Continue
                                            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 2 && (
                            <motion.div
                                key="step2"
                                custom={direction}
                                variants={slideVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.3, ease: "easeInOut" }}
                            >
                                {/* STEP 2 — Condition */}
                                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-6 sm:p-10">
                                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                                        What do you need help with?
                                    </h1>
                                    <p className="text-gray-500 mb-8">
                                        Select the condition that best describes your situation.
                                    </p>

                                    <div className="space-y-8">
                                        {CONDITION_GROUPS.map((group) => (
                                            <div key={group.heading}>
                                                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
                                                    {group.heading}
                                                </p>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    {group.options.map((opt) => (
                                                        <button
                                                            key={opt.label}
                                                            onClick={() => setSelectedCondition(opt)}
                                                            className={`text-left px-4 py-3.5 rounded-2xl border transition-all duration-200 cursor-pointer ${selectedCondition?.label === opt.label
                                                                    ? "bg-[#e6f0ef] border-[#005b57] ring-2 ring-[#005b57]/20"
                                                                    : "bg-gray-50 border-gray-200 hover:border-[#005b57]/50"
                                                                }`}
                                                        >
                                                            <span className="font-medium text-gray-900 text-sm">
                                                                {opt.label}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Nav */}
                                    <div className="mt-8 flex justify-between items-center">
                                        <button
                                            onClick={goBack}
                                            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                                        >
                                            <ArrowLeft className="w-4 h-4" /> Back
                                        </button>
                                        <button
                                            onClick={goNext}
                                            disabled={!canAdvanceStep2}
                                            className={`group flex items-center gap-2 py-3 px-8 rounded-full font-semibold transition-all duration-300 cursor-pointer ${canAdvanceStep2
                                                    ? "bg-[#005b57] text-white hover:bg-[#004a46] shadow-lg shadow-[#005b57]/20 hover:scale-105"
                                                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                                                }`}
                                        >
                                            See My Price
                                            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 3 && price && (
                            <motion.div
                                key="step3"
                                custom={direction}
                                variants={slideVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.3, ease: "easeInOut" }}
                            >
                                {/* STEP 3 — Price Summary */}
                                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-6 sm:p-10">
                                    <div className="text-center mb-8">
                                        <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
                                            <CheckCircle2 className="w-4 h-4" /> Price Calculated
                                        </div>
                                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                                            Your Recommended Session Rate
                                        </h1>
                                        <p className="text-gray-500">
                                            Based on your location and condition
                                        </p>
                                    </div>

                                    {/* Big price */}
                                    <div className="text-center mb-8">
                                        <div className="text-5xl sm:text-6xl font-bold text-[#005b57]">
                                            {formatNaira(price.sessionRate)}
                                        </div>
                                        <p className="text-gray-400 mt-1">per session</p>
                                    </div>

                                    {/* Breakdown */}
                                    <div className="bg-gray-50 rounded-2xl p-6 mb-8">
                                        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                                            Price Breakdown
                                        </p>
                                        <div className="space-y-3">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-600">Base rate</span>
                                                <span className="font-semibold text-gray-900">
                                                    {formatNaira(price.base)}
                                                </span>
                                            </div>
                                            {price.locationAdjustment > 0 && (
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-gray-600">
                                                        Location (Tier {price.locationTier})
                                                    </span>
                                                    <span className="font-semibold text-gray-900">
                                                        +{formatNaira(price.locationAdjustment)}
                                                    </span>
                                                </div>
                                            )}
                                            {price.conditionAdjustment > 0 && (
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-gray-600">
                                                        {price.conditionLevel === "moderate"
                                                            ? "Advanced care"
                                                            : "Specialized care"}
                                                    </span>
                                                    <span className="font-semibold text-gray-900">
                                                        +{formatNaira(price.conditionAdjustment)}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="border-t border-gray-200 pt-3 flex justify-between text-sm">
                                                <span className="text-gray-600">Platform fee</span>
                                                <span className="font-semibold text-gray-900">
                                                    +{formatNaira(price.platformFee)}
                                                </span>
                                            </div>
                                            <div className="border-t border-gray-300 pt-3 flex justify-between">
                                                <span className="font-bold text-gray-900">
                                                    You pay
                                                </span>
                                                <span className="font-bold text-[#005b57] text-lg">
                                                    {formatNaira(price.patientTotal)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Package teaser */}
                                    <div className="bg-[#FAF6E7] border border-[#002e2c]/10 rounded-2xl p-5 mb-8">
                                        <p className="text-sm font-bold text-[#002e2c] mb-1">
                                            💡 Save more with packages
                                        </p>
                                        <p className="text-sm text-gray-600">
                                            Book 4, 8, or 12 sessions together and save up to 15%.
                                            Package options are shown after you sign up.
                                        </p>
                                    </div>

                                    {/* CTA */}
                                    <Link
                                        href={`/sign-up?${signUpParams.toString()}`}
                                        className="group w-full flex items-center justify-center gap-2 py-4 px-8 rounded-full font-bold text-white bg-[#005b57] hover:bg-[#004a46] transition-all duration-300 hover:scale-[1.02] shadow-lg shadow-[#005b57]/20"
                                    >
                                        Sign Up &amp; Get Matched
                                        <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                                    </Link>
                                    <p className="text-center text-xs text-gray-400 mt-3">
                                        Create your account to save your progress and get matched with a verified physiotherapist.
                                    </p>

                                    {/* Back */}
                                    <div className="mt-6 text-center">
                                        <button
                                            onClick={goBack}
                                            className="text-sm text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                                        >
                                            ← Change my condition
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
