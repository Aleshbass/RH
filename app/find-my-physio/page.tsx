"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import {
    MapPin,
    MapPinOff,
    Star,
    BadgeCheck,
    Video,
    Users,
    Search,
    ArrowRight,
    Sparkles,
    Globe,
    Navigation,
    Loader2,
    ChevronDown,
    ChevronUp,
    Stethoscope,
    Shield,
    Info,
    AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    CITIES,
    formatNaira,
    calculateSessionPrice,
    type ConditionLevel,
} from "@/lib/pricing";
import { cn } from "@/lib/utils";

// ── Physio Match Card ─────────────────────────

function PhysioMatchCard({
    physio,
    rank,
    showMatchReasons = true,
}: {
    physio: any;
    rank?: number;
    showMatchReasons?: boolean;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: rank ? rank * 0.05 : 0 }}
        >
            <Link
                href={`/find-a-physio/${physio.id}`}
                className="group block bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:border-[#005b57]/20 transition-all duration-300 overflow-hidden"
            >
                <div className="p-5">
                    <div className="flex items-start gap-4">
                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                            {rank && rank <= 3 && (
                                <div className="absolute -top-1.5 -left-1.5 z-10 w-6 h-6 bg-[#005b57] rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-md">
                                    #{rank}
                                </div>
                            )}
                            {physio.imageUrl ? (
                                <Image
                                    src={physio.imageUrl}
                                    alt={physio.fullName}
                                    width={56}
                                    height={56}
                                    className="rounded-xl object-cover border border-gray-100"
                                />
                            ) : (
                                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-teal-50 to-teal-100 flex items-center justify-center text-[#005b57] text-lg font-bold border border-teal-100">
                                    {physio.fullName
                                        .split(" ")
                                        .map((n: string) => n[0])
                                        .join("")
                                        .toUpperCase()}
                                </div>
                            )}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                                <h3 className="text-base font-bold text-gray-900 truncate group-hover:text-[#005b57] transition-colors">
                                    {physio.fullName}
                                </h3>
                                {physio.isVerified && (
                                    <BadgeCheck className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                )}
                            </div>
                            <p className="text-xs text-gray-500 mb-1.5">
                                {physio.credentials?.length > 0
                                    ? physio.credentials.join(" · ")
                                    : "Physiotherapist"}{" "}
                                · {physio.yearsOfExperience}y experience
                            </p>

                            {/* Rating */}
                            <div className="flex items-center gap-3 mb-2">
                                {physio.averageRating > 0 && (
                                    <div className="flex items-center gap-1">
                                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                        <span className="text-sm font-semibold text-gray-900">
                                            {physio.averageRating.toFixed(1)}
                                        </span>
                                        <span className="text-xs text-gray-400">
                                            ({physio.reviewCount})
                                        </span>
                                    </div>
                                )}
                                {physio.location ? (
                                    <div className="flex items-center gap-1 text-xs text-gray-500">
                                        <MapPin className="h-3 w-3" />
                                        {physio.location}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1 text-xs text-gray-400 italic">
                                        <MapPinOff className="h-3 w-3" />
                                        Location not set
                                    </div>
                                )}
                            </div>

                            {/* Specializations */}
                            <div className="flex flex-wrap gap-1 mb-2">
                                {physio.specializations.slice(0, 3).map((spec: string, i: number) => (
                                    <Badge
                                        key={i}
                                        variant="secondary"
                                        className="text-[10px] px-2 py-0 bg-gray-50 text-gray-600 border-gray-100 font-normal"
                                    >
                                        {spec}
                                    </Badge>
                                ))}
                                {physio.specializations.length > 3 && (
                                    <Badge
                                        variant="secondary"
                                        className="text-[10px] px-2 py-0 bg-gray-50 text-gray-400 border-gray-100 font-normal"
                                    >
                                        +{physio.specializations.length - 3}
                                    </Badge>
                                )}
                            </div>
                        </div>

                        {/* Price */}
                        <div className="text-right flex-shrink-0">
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                                From
                            </p>
                            <p className="text-lg font-bold text-gray-900">
                                ₦{(physio.initialConsultRate || physio.hourlyRate).toLocaleString()}
                            </p>
                            <div className="flex items-center gap-1 mt-1 justify-end">
                                {physio.offersOnlineSessions && (
                                    <div className="flex items-center gap-0.5 text-[10px] text-[#005b57] bg-teal-50 px-1.5 py-0.5 rounded">
                                        <Video className="h-2.5 w-2.5" />
                                    </div>
                                )}
                                {physio.offersInPersonSessions && (
                                    <div className="flex items-center gap-0.5 text-[10px] text-[#005b57] bg-teal-50 px-1.5 py-0.5 rounded">
                                        <Users className="h-2.5 w-2.5" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Match Reasons */}
                    {showMatchReasons && physio.matchReasons?.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-50 flex flex-wrap gap-1.5">
                            {physio.matchReasons.slice(0, 4).map((reason: string, i: number) => (
                                <span
                                    key={i}
                                    className="inline-flex items-center gap-1 text-[10px] font-medium text-[#005b57] bg-teal-50/80 px-2 py-0.5 rounded-full"
                                >
                                    <Sparkles className="h-2.5 w-2.5" />
                                    {reason}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </Link>
        </motion.div>
    );
}

// ── Tier Section ─────────────────────────────

function TierSection({
    icon: Icon,
    title,
    subtitle,
    physios,
    defaultExpanded = true,
    accentColor = "#005b57",
}: {
    icon: React.ElementType;
    title: string;
    subtitle: string;
    physios: any[];
    defaultExpanded?: boolean;
    accentColor?: string;
}) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [showAll, setShowAll] = useState(false);

    if (physios.length === 0) return null;

    const displayPhysios = showAll ? physios : physios.slice(0, 6);

    return (
        <div className="mb-10">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between mb-4 group cursor-pointer"
            >
                <div className="flex items-center gap-3">
                    <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${accentColor}15` }}
                    >
                        <Icon className="h-4.5 w-4.5" style={{ color: accentColor }} />
                    </div>
                    <div className="text-left">
                        <h2 className="text-lg font-bold text-gray-900">
                            {title}{" "}
                            <span className="text-sm font-normal text-gray-400">
                                ({physios.length})
                            </span>
                        </h2>
                        <p className="text-xs text-gray-500">{subtitle}</p>
                    </div>
                </div>
                {expanded ? (
                    <ChevronUp className="h-5 w-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
                ) : (
                    <ChevronDown className="h-5 w-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
                )}
            </button>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {displayPhysios.map((physio: any, i: number) => (
                                <PhysioMatchCard key={physio.id} physio={physio} rank={i + 1} />
                            ))}
                        </div>

                        {physios.length > 6 && (
                            <div className="mt-4 text-center">
                                <Button
                                    variant="ghost"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowAll(!showAll);
                                    }}
                                    className="text-[#005b57] hover:text-[#00443e] text-sm"
                                >
                                    {showAll
                                        ? "Show Less"
                                        : `Show All ${physios.length} Physiotherapists`}
                                </Button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ── Main Page Content ─────────────────────────

function FindMyPhysioContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const savedPrefsRef = useRef(false);
    const { isSignedIn } = useAuth();

    // Parse query params from start-treatment
    const cityKey = searchParams?.get("city") || "";
    const areaIndexStr = searchParams?.get("area") || "";
    const conditionLabel = searchParams?.get("condition") || "";
    const conditionLevel = (searchParams?.get("conditionLevel") || "standard") as ConditionLevel;
    const areaIndex = areaIndexStr ? parseInt(areaIndexStr, 10) : undefined;

    // Get city/area labels for display
    const cityConfig = CITIES[cityKey];
    const cityLabel = cityConfig?.label || "Nigeria";
    const areaLabel =
        areaIndex !== undefined && cityConfig?.areas[areaIndex]
            ? cityConfig.areas[areaIndex].label
            : "";

    // Calculate the session rate
    const locationTier =
        areaIndex !== undefined && cityConfig?.areas[areaIndex]
            ? cityConfig.areas[areaIndex].tier
            : undefined;
    const price =
        locationTier && conditionLevel
            ? calculateSessionPrice(locationTier, conditionLevel)
            : null;

    // Save treatment prefs (only once)
    const saveTreatmentPrefs = useMutation(
        api.marketplace.matching.savePatientTreatmentPrefs
    );

    useEffect(() => {
        if (
            !savedPrefsRef.current &&
            isSignedIn &&
            cityKey &&
            areaIndex !== undefined &&
            conditionLabel
        ) {
            savedPrefsRef.current = true;
            saveTreatmentPrefs({
                cityKey,
                areaIndex,
                areaLabel: areaLabel || cityLabel,
                conditionLabel,
                conditionLevel,
                sessionRate: price?.sessionRate || 0,
            }).catch((err) => {
                console.error("Failed to save treatment preferences:", err);
                // Non-blocking — don't stop the matching flow
            });
        }
    }, [isSignedIn, cityKey, areaIndex, conditionLabel, conditionLevel, areaLabel, cityLabel, price, saveTreatmentPrefs]);

    // Run matching query
    const matchResults = useQuery(
        api.marketplace.matching.getMatchedPhysiotherapists,
        {
            cityKey: cityKey || undefined,
            areaIndex: areaIndex,
            conditionLabel: conditionLabel || undefined,
            conditionLevel: conditionLevel || undefined,
        }
    );

    const isLoading = matchResults === undefined;

    return (
        <div className="min-h-screen bg-gray-50/50">
            {/* Hero */}
            <div className="bg-gradient-to-br from-[#002e2c] via-[#005b57] to-[#007a73] text-white pt-32 pb-16 md:pt-40 md:pb-20 relative overflow-hidden">
                {/* Decorative shapes */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -right-32 -top-32 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
                    <div className="absolute -left-20 bottom-0 w-72 h-72 bg-teal-400/10 rounded-full blur-3xl" />
                    <div className="absolute right-1/3 top-1/4 w-2 h-2 bg-white/20 rounded-full" />
                    <div className="absolute right-1/4 top-2/3 w-1.5 h-1.5 bg-white/15 rounded-full" />
                </div>

                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        {/* Breadcrumbs */}
                        <div className="flex items-center gap-2 text-sm text-teal-200/70 mb-6">
                            <Link href="/" className="hover:text-white transition-colors">
                                Home
                            </Link>
                            <span>/</span>
                            <Link
                                href="/start-treatment"
                                className="hover:text-white transition-colors"
                            >
                                Start Treatment
                            </Link>
                            <span>/</span>
                            <span className="text-white">Your Matches</span>
                        </div>

                        <div className="flex items-start gap-4 mb-6">
                            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                                <Sparkles className="h-6 w-6 text-teal-200" />
                            </div>
                            <div>
                                <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
                                    Your Best Matches
                                </h1>
                                <p className="text-lg text-teal-100/80 font-light">
                                    We found physiotherapists perfect for your needs
                                </p>
                            </div>
                        </div>

                        {/* Patient summary badges */}
                        <div className="flex flex-wrap gap-2 mt-6">
                            {cityLabel && (
                                <span className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-sm text-white text-sm px-4 py-2 rounded-full border border-white/10">
                                    <MapPin className="w-3.5 h-3.5" />
                                    {areaLabel ? `${areaLabel}, ${cityLabel}` : cityLabel}
                                </span>
                            )}
                            {conditionLabel && (
                                <span className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-sm text-white text-sm px-4 py-2 rounded-full border border-white/10">
                                    <Stethoscope className="w-3.5 h-3.5" />
                                    {conditionLabel}
                                </span>
                            )}
                            {price && (
                                <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm text-white text-sm font-semibold px-4 py-2 rounded-full border border-white/10">
                                    {formatNaira(price.sessionRate)}/session
                                </span>
                            )}
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-14">
                {/* Loading */}
                {isLoading && (
                    <div className="flex flex-col items-center justify-center py-32">
                        <div className="relative">
                            <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center mb-4">
                                <Loader2 className="h-8 w-8 animate-spin text-[#005b57]" />
                            </div>
                            <Sparkles className="absolute -top-1 -right-1 h-5 w-5 text-amber-400 animate-pulse" />
                        </div>
                        <p className="text-gray-600 font-medium">Finding your best matches...</p>
                        <p className="text-gray-400 text-sm mt-1">
                            Analyzing location, specialization, and ratings
                        </p>
                    </div>
                )}

                {/* Results */}
                {matchResults && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                    >
                        {/* Fallback Message */}
                        {matchResults.summary.fallbackMessage && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mb-8 bg-amber-50 border border-amber-200/60 rounded-2xl p-5 flex items-start gap-3"
                            >
                                <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-semibold text-amber-800 mb-1">
                                        No local physiotherapists found
                                    </p>
                                    <p className="text-sm text-amber-700">
                                        {matchResults.summary.fallbackMessage}
                                    </p>
                                </div>
                            </motion.div>
                        )}

                        {/* Stats bar */}
                        <div className="flex flex-wrap items-center gap-4 mb-8 bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                            <div className="flex items-center gap-2 text-sm">
                                <div className="w-2 h-2 rounded-full bg-[#005b57]" />
                                <span className="text-gray-600">
                                    <strong className="text-gray-900">
                                        {matchResults.totalMatches}
                                    </strong>{" "}
                                    physiotherapists found
                                </span>
                            </div>
                            {matchResults.summary.inArea > 0 && (
                                <div className="flex items-center gap-2 text-sm">
                                    <Navigation className="h-3.5 w-3.5 text-[#005b57]" />
                                    <span className="text-gray-600">
                                        <strong className="text-gray-900">
                                            {matchResults.summary.inArea}
                                        </strong>{" "}
                                        in your area
                                    </span>
                                </div>
                            )}
                            {matchResults.summary.availableOnline > 0 && (
                                <div className="flex items-center gap-2 text-sm">
                                    <Globe className="h-3.5 w-3.5 text-[#005b57]" />
                                    <span className="text-gray-600">
                                        <strong className="text-gray-900">
                                            {matchResults.summary.availableOnline}
                                        </strong>{" "}
                                        available online
                                    </span>
                                </div>
                            )}
                            {matchResults.summary.physiosWithLocation !== undefined && (
                                <div className="flex items-center gap-2 text-sm">
                                    <MapPin className="h-3.5 w-3.5 text-gray-400" />
                                    <span className="text-gray-500">
                                        {matchResults.summary.physiosWithLocation} of{" "}
                                        {matchResults.totalMatches} have location set
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Tier 1: Best Matches */}
                        <TierSection
                            icon={Navigation}
                            title={`Best Matches in ${matchResults.cityLabel}`}
                            subtitle="Physiotherapists in your area who specialize in your condition"
                            physios={matchResults.bestMatches}
                            defaultExpanded={true}
                            accentColor="#005b57"
                        />

                        {/* Tier 2: Regional */}
                        <TierSection
                            icon={MapPin}
                            title="In Your Region"
                            subtitle="Nearby physiotherapists who can help with your condition"
                            physios={matchResults.regional}
                            defaultExpanded={matchResults.bestMatches.length === 0}
                            accentColor="#0369a1"
                        />

                        {/* Tier 3: Online */}
                        <TierSection
                            icon={Globe}
                            title="Available Online"
                            subtitle="Get treatment from anywhere via secure video sessions"
                            physios={matchResults.online}
                            defaultExpanded={
                                matchResults.bestMatches.length === 0 &&
                                matchResults.regional.length === 0
                            }
                            accentColor="#7c3aed"
                        />

                        {/* Tier 4: Nationwide */}
                        {matchResults.nationwide.length > 0 && (
                            <TierSection
                                icon={Shield}
                                title="More Physiotherapists"
                                subtitle="Other verified professionals across Nigeria"
                                physios={matchResults.nationwide}
                                defaultExpanded={
                                    matchResults.bestMatches.length === 0 &&
                                    matchResults.regional.length === 0 &&
                                    matchResults.online.length === 0
                                }
                                accentColor="#64748b"
                            />
                        )}

                        {/* Empty state */}
                        {matchResults.totalMatches === 0 && (
                            <div className="text-center py-24">
                                <div className="w-20 h-20 mx-auto bg-gray-50 rounded-full flex items-center justify-center mb-5">
                                    <Search className="h-10 w-10 text-gray-300" />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 mb-2">
                                    No physiotherapists available yet
                                </h3>
                                <p className="text-gray-500 mb-6 max-w-md mx-auto">
                                    We&apos;re actively onboarding physiotherapists in your area.
                                    Browse all available professionals or check back soon.
                                </p>
                                <Link href="/find-a-physio">
                                    <Button className="bg-[#005b57] hover:bg-[#00443e] text-white rounded-xl px-8 h-12">
                                        Browse All Physiotherapists
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </Link>
                            </div>
                        )}

                        {/* Bottom CTA */}
                        {matchResults.totalMatches > 0 && (
                            <div className="mt-8 text-center bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
                                <p className="text-gray-500 text-sm mb-4">
                                    Not sure who to pick? You can also browse all physiotherapists.
                                </p>
                                <Link href="/find-a-physio">
                                    <Button
                                        variant="outline"
                                        className="border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl px-6 h-11"
                                    >
                                        Browse All Physiotherapists
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </Link>
                            </div>
                        )}
                    </motion.div>
                )}
            </div>
        </div>
    );
}

// ── Page Export ─────────────────────────────────

export default function FindMyPhysioPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex items-center justify-center bg-gray-50">
                    <div className="text-center">
                        <Loader2 className="h-10 w-10 animate-spin text-[#005b57] mx-auto mb-4" />
                        <p className="text-gray-500">Loading...</p>
                    </div>
                </div>
            }
        >
            <FindMyPhysioContent />
        </Suspense>
    );
}
