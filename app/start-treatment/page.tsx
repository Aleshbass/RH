"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    MapPin,
    Stethoscope,
    Receipt,
    ArrowRight,
    ArrowLeft,
    CheckCircle2,
    Search,
    X,
    Sparkles,
    Check,
    Award,
    TrendingUp,
    BarChart3,
    Dumbbell,
    Loader2,
    PenLine,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import {
    CITIES,
    CONDITION_GROUPS,
    calculateSessionPrice,
    calculatePackagePrice,
    getRecommendedDiscount,
    formatNaira,
    getLocationLabel,
    getConditionLabel,
    AVAILABLE_PACKAGES,
    PACKAGE_INFO,
    type LocationTier,
    type ConditionLevel,
    type PriceBreakdown,
    type PackageSize,
} from "@/lib/pricing";

// ── Build a flat list of all searchable cities ────

interface CityEntry {
    name: string;          // Display name, e.g. "Calabar"
    regionKey: string;     // Key in CITIES, e.g. "southsouth"
    regionLabel: string;   // e.g. "South-South"
    areaIndex: number;     // Index in CITIES[regionKey].areas
    tier: LocationTier;
    searchTerms: string;   // Lowercased, for fuzzy matching
}

function buildCityList(): CityEntry[] {
    const cities: CityEntry[] = [];

    for (const [regionKey, regionConfig] of Object.entries(CITIES)) {
        // Skip the "other" catch-all
        if (regionKey === "other") continue;

        for (let i = 0; i < regionConfig.areas.length; i++) {
            const area = regionConfig.areas[i];
            const areaLabel = area.label;

            // For Lagos/Abuja premium areas that list neighborhoods,
            // show them as sub-locations under the city
            const isNeighborhoodGroup = areaLabel.includes("(") || areaLabel.includes("/");

            if (isNeighborhoodGroup) {
                // Extract the primary name (before parentheses)
                const primaryName = areaLabel.split("(")[0].split("/")[0].trim();

                // Extract individual place names from parentheses
                const parenMatch = areaLabel.match(/\(([^)]+)\)/);
                const neighborhoods = parenMatch
                    ? parenMatch[1].split(",").map(s => s.trim())
                    : [];

                // Also handle slash-separated names: "Lekki / Ajah"
                const slashNames = areaLabel.includes("/") && !areaLabel.includes("(")
                    ? areaLabel.split("/").map(s => s.trim())
                    : [];

                const allNames = [primaryName, ...neighborhoods, ...slashNames].filter(Boolean);
                const searchStr = allNames.join(" ").toLowerCase() + " " + regionConfig.label.toLowerCase();

                cities.push({
                    name: areaLabel,
                    regionKey,
                    regionLabel: regionConfig.label,
                    areaIndex: i,
                    tier: area.tier,
                    searchTerms: searchStr,
                });
            } else {
                // Simple city name — just use it directly
                cities.push({
                    name: areaLabel,
                    regionKey,
                    regionLabel: regionConfig.label,
                    areaIndex: i,
                    tier: area.tier,
                    searchTerms: areaLabel.toLowerCase() + " " + regionConfig.label.toLowerCase(),
                });
            }
        }
    }

    return cities;
}

const ALL_CITIES = buildCityList();

// Popular cities to show as quick-pick chips
const POPULAR_CITIES = [
    "Lagos",
    "Abuja",
    "Port Harcourt",
    "Calabar",
    "Ibadan",
    "Enugu",
    "Benin City",
    "Kaduna",
];

// ── Step indicator ────────────────────────────────

const STEPS = [
    { id: 1, label: "Location", icon: MapPin },
    { id: 2, label: "Condition", icon: Stethoscope },
    { id: 3, label: "Your Price", icon: Receipt },
];

function StepIndicator({ current }: { current: number }) {
    return (
        <div className="flex items-center justify-center gap-2 sm:gap-4 mb-8 sm:mb-10">
            {STEPS.map((step, i) => {
                const done = current > step.id;
                const active = current === step.id;
                const Icon = step.icon;
                return (
                    <React.Fragment key={step.id}>
                        {i > 0 && (
                            <div
                                className={`hidden sm:block h-0.5 w-8 md:w-16 transition-colors duration-300 ${done ? "bg-[#005b57]" : "bg-gray-200"
                                    }`}
                            />
                        )}
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <div
                                className={`w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${done
                                    ? "bg-[#005b57] text-white"
                                    : active
                                        ? "bg-[#005b57] text-white ring-4 ring-[#005b57]/20"
                                        : "bg-gray-200 text-gray-400"
                                    }`}
                            >
                                {done ? (
                                    <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                                ) : (
                                    <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                )}
                            </div>
                            <span
                                className={`text-xs sm:text-sm font-medium ${active ? "text-[#005b57]" : done ? "text-gray-500" : "text-gray-400"
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
    enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

// ── Condition icons mapping ───────────────────────

const CONDITION_ICONS: Record<string, string> = {
    "Back or neck pain": "🦴",
    "Sports injury (sprains, strains)": "⚽",
    "General joint pain": "🦵",
    "Mild arthritis": "🤲",
    "Post-surgery rehabilitation": "🏥",
    "Chronic pain condition": "💊",
    "Moderate arthritis": "🤲",
    "Complex sports injury (ACL, rotator cuff)": "🏃",
    "Stroke recovery": "🧠",
    "Spinal cord injury": "🔬",
    "Cerebral palsy": "👶",
    "Other neurological condition (Parkinson's, MS, TBI)": "🧠",
};

// ── Main page component ──────────────────────────

export default function StartTreatmentPage() {
    const [step, setStep] = useState(1);
    const [direction, setDirection] = useState(1);

    // Step 1: City search
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCity, setSelectedCity] = useState<CityEntry | null>(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Step 2: Condition
    const [selectedCondition, setSelectedCondition] = useState<{
        label: string;
        level: ConditionLevel;
    } | null>(null);
    const [showOtherInput, setShowOtherInput] = useState(false);
    const [otherConditionText, setOtherConditionText] = useState("");
    const [otherConditionLevel, setOtherConditionLevel] = useState<ConditionLevel>("standard");

    // Step 3: Package selection
    const [selectedPackage, setSelectedPackage] = useState<PackageSize>(8);

    // Sync "other" condition text → selectedCondition
    useEffect(() => {
        if (showOtherInput) {
            if (otherConditionText.trim().length >= 2) {
                setSelectedCondition({ label: otherConditionText.trim(), level: otherConditionLevel });
            } else {
                setSelectedCondition(null);
            }
        }
    }, [otherConditionText, otherConditionLevel, showOtherInput]);

    const [mapboxResults, setMapboxResults] = useState<CityEntry[]>([]);
    const [isSearchingMapbox, setIsSearchingMapbox] = useState(false);
    const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

    // Search results — filter cities by query locally
    const filteredLocalCities = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const q = searchQuery.toLowerCase().trim();
        return ALL_CITIES.filter(city =>
            city.searchTerms.includes(q) || city.name.toLowerCase().startsWith(q)
        ).slice(0, 5);
    }, [searchQuery]);

    // Mapbox Geocoding for dynamic places
    useEffect(() => {
        if (!searchQuery.trim() || searchQuery.length < 3 || !MAPBOX_TOKEN) {
            setMapboxResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearchingMapbox(true);
            try {
                const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${MAPBOX_TOKEN}&country=NG&limit=4`);
                const data = await res.json();
                if (data.features) {
                    const dynamicResults: CityEntry[] = data.features.map((f: any) => {
                        const placeName = f.place_name;
                        const lower = placeName.toLowerCase();
                        
                        // Try to inherit tier from local data if it's a known city
                        let bestMatch = ALL_CITIES.find(c => lower.includes(c.name.toLowerCase()));
                        
                        if (!bestMatch) {
                            // Unmapped city -> "Other Location" (Tier 4)
                            return {
                                name: f.text, // Just the city name (e.g. "Yenagoa")
                                regionKey: "other",
                                regionLabel: placeName.split(",").slice(1).join(",").trim() || "Nigeria",
                                areaIndex: 0,
                                tier: 4,
                                searchTerms: placeName.toLowerCase()
                            };
                        } else {
                            // Inherit the tier/region but use Mapbox's beautiful name
                            return {
                                ...bestMatch,
                                name: f.text,
                                regionLabel: placeName.split(",").slice(1).join(",").trim() || bestMatch.regionLabel,
                            };
                        }
                    });
                    setMapboxResults(dynamicResults);
                }
            } catch (err) {
                console.error("Mapbox search failed:", err);
            } finally {
                setIsSearchingMapbox(false);
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [searchQuery, MAPBOX_TOKEN]);

    // Combine local and Mapbox results, deduplicating by name
    const filteredCities = useMemo(() => {
        const combined = [...filteredLocalCities, ...mapboxResults];
        const seen = new Set<string>();
        return combined.filter(c => {
            const lowerName = c.name.toLowerCase();
            if (seen.has(lowerName)) return false;
            seen.add(lowerName);
            return true;
        }).slice(0, 8);
    }, [filteredLocalCities, mapboxResults]);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node) &&
                searchRef.current &&
                !searchRef.current.contains(e.target as Node)
            ) {
                setShowDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    // Derived pricing
    const price: PriceBreakdown | null =
        selectedCity && selectedCondition
            ? calculateSessionPrice(selectedCity.tier, selectedCondition.level)
            : null;

    const goNext = useCallback(() => {
        setDirection(1);
        setStep((s) => s + 1);
    }, []);

    const goBack = useCallback(() => {
        setDirection(-1);
        setStep((s) => s - 1);
    }, []);

    const canAdvanceStep1 = selectedCity !== null;
    const canAdvanceStep2 = selectedCondition !== null &&
        (!showOtherInput || otherConditionText.trim().length >= 2);

    // Select a city from search or popular click
    const handleCitySelect = useCallback((city: CityEntry) => {
        setSelectedCity(city);
        setSearchQuery(city.name);
        setShowDropdown(false);
    }, []);

    // Handle popular city chip click
    const handlePopularClick = useCallback((cityName: string) => {
        const found = ALL_CITIES.find(c =>
            c.name.toLowerCase() === cityName.toLowerCase() ||
            c.searchTerms.includes(cityName.toLowerCase())
        );
        if (found) {
            handleCitySelect(found);
        }
    }, [handleCitySelect]);

    // Build matching page URL
    const matchingParams = new URLSearchParams();
    if (selectedCity) {
        matchingParams.set("city", selectedCity.regionKey);
        matchingParams.set("area", String(selectedCity.areaIndex));
    }
    if (selectedCondition) {
        matchingParams.set("condition", selectedCondition.label);
        matchingParams.set("conditionLevel", selectedCondition.level);
    }
    matchingParams.set("packageSessions", String(selectedPackage));
    const findMyPhysioUrl = `/find-my-physio?${matchingParams.toString()}`;

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#f0faf9] via-white to-[#FAF6E7] flex flex-col">
            {/* Header */}
            <div className="pt-4 sm:pt-6 pb-2 flex justify-center">
                <Link href="/">
                    <Image
                        src="/logos/MainRehabify.svg"
                        alt="Rehabify"
                        width={130}
                        height={38}
                        priority
                    />
                </Link>
            </div>

            <div className="flex-1 flex items-start sm:items-center justify-center px-4 py-6 sm:py-8">
                <div className="w-full max-w-xl">
                    <StepIndicator current={step} />

                    <AnimatePresence mode="wait" custom={direction}>

                        {/* ─── STEP 1: Location (City Search) ─── */}
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
                                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-5 sm:p-8">
                                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
                                        Where are you located?
                                    </h1>
                                    <p className="text-gray-500 text-sm sm:text-base mb-6">
                                        Search for your city to find physiotherapists near you.
                                    </p>

                                    {/* Search input */}
                                    <div className="relative mb-5">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <input
                                            ref={searchRef}
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => {
                                                setSearchQuery(e.target.value);
                                                setShowDropdown(true);
                                                if (!e.target.value.trim()) {
                                                    setSelectedCity(null);
                                                }
                                            }}
                                            onFocus={() => {
                                                if (searchQuery.trim()) setShowDropdown(true);
                                            }}
                                            placeholder="Type your city — e.g. Calabar, Lagos, Enugu..."
                                            className="w-full h-12 sm:h-14 pl-11 pr-10 rounded-2xl border border-gray-200 focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/15 outline-none text-base text-gray-900 placeholder:text-gray-400 transition-all bg-gray-50/50 focus:bg-white"
                                        />
                                        {isSearchingMapbox ? (
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 p-2">
                                                <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
                                            </div>
                                        ) : searchQuery ? (
                                            <button
                                                onClick={() => {
                                                    setSearchQuery("");
                                                    setSelectedCity(null);
                                                    setShowDropdown(false);
                                                    searchRef.current?.focus();
                                                }}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 transition-colors"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        ) : null}

                                        {/* Search dropdown */}
                                        <AnimatePresence>
                                            {showDropdown && filteredCities.length > 0 && (
                                                <motion.div
                                                    ref={dropdownRef}
                                                    initial={{ opacity: 0, y: -4 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -4 }}
                                                    transition={{ duration: 0.15 }}
                                                    className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-lg z-50 overflow-hidden max-h-[280px] overflow-y-auto"
                                                >
                                                    {filteredCities.map((city, i) => (
                                                        <button
                                                            key={`${city.regionKey}-${city.areaIndex}-${city.name}`}
                                                            onClick={() => handleCitySelect(city)}
                                                            className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[#f0faf9] transition-colors cursor-pointer ${i > 0 ? "border-t border-gray-50" : ""
                                                                } ${selectedCity?.name === city.name && selectedCity?.regionKey === city.regionKey
                                                                    ? "bg-[#e6f0ef]"
                                                                    : ""
                                                                }`}
                                                        >
                                                            <MapPin className="h-4 w-4 text-[#005b57] flex-shrink-0" />
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-medium text-gray-900 truncate">
                                                                    {city.name}
                                                                </p>
                                                                <p className="text-xs text-gray-400">
                                                                    {city.regionLabel}
                                                                </p>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                        {/* No results */}
                                        <AnimatePresence>
                                            {showDropdown && searchQuery.trim().length >= 2 && filteredCities.length === 0 && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: -4 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -4 }}
                                                    className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-lg z-50 p-4 text-center"
                                                >
                                                    <p className="text-sm text-gray-500">
                                                        City not found. Select the closest option below.
                                                    </p>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    {/* Selected city confirmation */}
                                    <AnimatePresence>
                                        {selectedCity && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: "auto" }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="mb-5"
                                            >
                                                <div className="flex items-center gap-2 bg-[#e6f0ef] text-[#005b57] px-4 py-3 rounded-xl">
                                                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                                                    <span className="text-sm font-medium">
                                                        {selectedCity.name}, {selectedCity.regionLabel}
                                                    </span>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Popular cities */}
                                    {!selectedCity && (
                                        <div>
                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                                                Popular cities
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {POPULAR_CITIES.map((name) => (
                                                    <button
                                                        key={name}
                                                        onClick={() => handlePopularClick(name)}
                                                        className="px-3.5 py-2 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer border bg-gray-50 text-gray-700 border-gray-200 hover:border-[#005b57] hover:text-[#005b57] hover:bg-[#f0faf9] active:scale-95"
                                                    >
                                                        <span className="flex items-center gap-1.5">
                                                            <MapPin className="h-3 w-3 text-gray-400" />
                                                            {name}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Navigation */}
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
                                            className={`group flex items-center gap-2 py-3 px-6 sm:px-8 rounded-full font-semibold transition-all duration-300 cursor-pointer text-sm sm:text-base ${canAdvanceStep1
                                                ? "bg-[#005b57] text-white hover:bg-[#004a46] shadow-lg shadow-[#005b57]/20 hover:scale-[1.03]"
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

                        {/* ─── STEP 2: Condition ─── */}
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
                                {/* Back button — above the card so it's always clickable */}
                                <button
                                    onClick={goBack}
                                    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer mb-3 ml-1"
                                >
                                    <ArrowLeft className="w-4 h-4" /> Back
                                </button>

                                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-5 sm:p-8 pb-28 sm:pb-32">
                                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
                                        What do you need help with?
                                    </h1>
                                    <p className="text-gray-500 text-sm sm:text-base mb-6">
                                        Select the condition that best describes your situation.
                                    </p>

                                    <div className="space-y-6">
                                        {CONDITION_GROUPS.map((group) => (
                                            <div key={group.heading}>
                                                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2.5">
                                                    {group.heading}
                                                </p>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    {group.options.map((opt) => (
                                                        <button
                                                            key={opt.label}
                                                            onClick={() => {
                                                                setShowOtherInput(false);
                                                                setSelectedCondition(opt);
                                                            }}
                                                            className={`text-left px-4 py-3 rounded-xl border transition-all duration-200 cursor-pointer flex items-center gap-3 ${selectedCondition?.label === opt.label && !showOtherInput
                                                                ? "bg-[#e6f0ef] border-[#005b57] ring-2 ring-[#005b57]/20"
                                                                : "bg-gray-50/80 border-gray-200 hover:border-[#005b57]/50 hover:bg-gray-50"
                                                                }`}
                                                        >
                                                            <span className="text-lg flex-shrink-0">
                                                                {CONDITION_ICONS[opt.label] || "🩺"}
                                                            </span>
                                                            <span className="font-medium text-gray-900 text-sm leading-tight">
                                                                {opt.label}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}

                                        {/* Other / Not Listed */}
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2.5">Not Listed?</p>
                                            <button
                                                onClick={() => {
                                                    setShowOtherInput(true);
                                                    setSelectedCondition(null);
                                                }}
                                                className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 cursor-pointer flex items-center gap-3 ${
                                                    showOtherInput
                                                        ? "bg-[#e6f0ef] border-[#005b57] ring-2 ring-[#005b57]/20"
                                                        : "bg-gray-50/80 border-gray-200 hover:border-[#005b57]/50 hover:bg-gray-50"
                                                }`}
                                            >
                                                <span className="text-lg flex-shrink-0">📝</span>
                                                <span className="font-medium text-gray-900 text-sm leading-tight">Something else / I&apos;m not sure</span>
                                            </button>

                                            <AnimatePresence>
                                                {showOtherInput && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: "auto" }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        transition={{ duration: 0.25 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="pt-3 space-y-3">
                                                            <input
                                                                autoFocus
                                                                type="text"
                                                                value={otherConditionText}
                                                                onChange={(e) => setOtherConditionText(e.target.value)}
                                                                placeholder="e.g. Shoulder pain, balance issues, scoliosis..."
                                                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/15 outline-none text-sm text-gray-900 bg-gray-50 focus:bg-white transition-all"
                                                            />
                                                            <div>
                                                                <p className="text-xs text-gray-500 mb-2 font-medium">How severe is it?</p>
                                                                <div className="flex gap-2">
                                                                    {(["standard", "moderate", "complex"] as ConditionLevel[]).map((lvl) => {
                                                                        const labels: Record<ConditionLevel, string> = { standard: "Mild", moderate: "Moderate", complex: "Severe" };
                                                                        return (
                                                                            <button
                                                                                key={lvl}
                                                                                onClick={() => setOtherConditionLevel(lvl)}
                                                                                className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                                                                                    otherConditionLevel === lvl
                                                                                        ? "bg-[#005b57] text-white border-[#005b57]"
                                                                                        : "border-gray-200 text-gray-600 hover:border-[#005b57]/40"
                                                                                }`}
                                                                            >
                                                                                {labels[lvl]}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>

                                    {/* No static CTA row — the floating Dynamic Island handles See My Price.
                                         Back link sits above the card so it's never obscured. */}
                                </div>
                            </motion.div>
                        )}

                        {/* ─── STEP 3: Price + Find My Physio CTA ─── */}
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
                                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-5 sm:p-8">
                                    {/* Summary badges */}
                                    <div className="flex flex-wrap gap-2 mb-5">
                                        <span className="inline-flex items-center gap-1.5 bg-[#e6f0ef] text-[#005b57] text-xs font-semibold px-3 py-1.5 rounded-full">
                                            <MapPin className="w-3 h-3" />
                                            {selectedCity?.name}, {selectedCity?.regionLabel}
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 bg-[#e6f0ef] text-[#005b57] text-xs font-semibold px-3 py-1.5 rounded-full">
                                            <Stethoscope className="w-3 h-3" />
                                            {selectedCondition?.label}
                                        </span>
                                    </div>

                                    {/* Big price */}
                                    <div className="text-center py-6 sm:py-8 mb-5 bg-gradient-to-br from-[#f0faf9] to-white rounded-2xl border border-[#005b57]/10">
                                        <p className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-widest mb-2">
                                            Your Session Rate
                                        </p>
                                        <div className="text-4xl sm:text-5xl font-bold text-[#005b57]">
                                            {formatNaira(price.sessionRate)}
                                        </div>
                                        <p className="text-gray-400 mt-1.5 text-sm">per session</p>
                                    </div>

                                    {/* Breakdown */}
                                    <div className="mb-6">
                                        <p className="text-sm font-semibold text-gray-700 mb-2">
                                            This reflects:
                                        </p>
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between text-sm bg-gray-50 rounded-xl px-4 py-2.5">
                                                <span className="text-gray-600">Base session rate</span>
                                                <span className="font-semibold text-gray-900">
                                                    {formatNaira(price.base)}
                                                </span>
                                            </div>
                                            {price.locationAdjustment > 0 && (
                                                <div className="flex items-center justify-between text-sm bg-gray-50 rounded-xl px-4 py-2.5">
                                                    <span className="text-gray-600">
                                                        {getLocationLabel(price.locationTier)}
                                                    </span>
                                                    <span className="font-semibold text-[#005b57]">
                                                        +{formatNaira(price.locationAdjustment)}
                                                    </span>
                                                </div>
                                            )}
                                            {price.conditionAdjustment > 0 && (
                                                <div className="flex items-center justify-between text-sm bg-gray-50 rounded-xl px-4 py-2.5">
                                                    <span className="text-gray-600">
                                                        {getConditionLabel(price.conditionLevel)}
                                                    </span>
                                                    <span className="font-semibold text-[#005b57]">
                                                        +{formatNaira(price.conditionAdjustment)}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Interactive Package Options */}
                                    <div className="mb-6">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Sparkles className="w-4 h-4 text-amber-500" />
                                            <p className="text-sm font-bold text-gray-800">Save more with packages</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {([1, 4, 8, 12] as const).map((sessions) => {
                                                const discount = sessions === 1 ? 0 : getRecommendedDiscount(price.sessionRate);
                                                const pkg = calculatePackagePrice(price.sessionRate, sessions, discount);
                                                const info = PACKAGE_INFO[sessions];
                                                const isSelected = selectedPackage === sessions;
                                                return (
                                                    <button
                                                        key={sessions}
                                                        onClick={() => setSelectedPackage(sessions)}
                                                        className={`relative text-left rounded-xl border p-3.5 cursor-pointer transition-all duration-200 ${
                                                            isSelected
                                                                ? "border-[#005b57] bg-[#f0faf9] ring-2 ring-[#005b57]/20 scale-[1.02]"
                                                                : "border-gray-200 bg-white hover:border-[#005b57]/40 hover:bg-gray-50"
                                                        }`}
                                                    >
                                                        {info.popular && (
                                                            <span className="absolute -top-2 right-2 px-2 py-0.5 bg-amber-400 text-[9px] font-bold text-amber-900 rounded-full uppercase">
                                                                Popular
                                                            </span>
                                                        )}
                                                        {isSelected && (
                                                            <span className="absolute top-2 right-2">
                                                                <CheckCircle2 className="w-3.5 h-3.5 text-[#005b57]" />
                                                            </span>
                                                        )}
                                                        <p className="text-[11px] font-semibold text-gray-500 mb-0.5">{info.label}</p>
                                                        <p className="text-lg font-bold text-gray-900">
                                                            {formatNaira(pkg.packageTotal)}
                                                        </p>
                                                        <p className="text-[11px] text-gray-400">
                                                            {formatNaira(Math.round(pkg.packageTotal / sessions))}/session
                                                        </p>
                                                        {pkg.patientSaves > 0 && (
                                                            <p className="text-[11px] text-green-600 font-semibold mt-1">
                                                                Save {formatNaira(pkg.patientSaves)}
                                                            </p>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Selected package summary */}
                                        {selectedPackage > 1 && (() => {
                                            const discount = getRecommendedDiscount(price.sessionRate);
                                            const pkg = calculatePackagePrice(price.sessionRate, selectedPackage, discount);
                                            return (
                                                <motion.div
                                                    key={selectedPackage}
                                                    initial={{ opacity: 0, y: 4 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className="mt-3 bg-[#002e2c] text-white rounded-xl px-4 py-3 flex items-center justify-between"
                                                >
                                                    <span className="text-xs font-medium text-teal-200">{selectedPackage} sessions</span>
                                                    <span className="font-bold text-sm">{formatNaira(pkg.packageTotal)}</span>
                                                    <span className="text-xs text-green-400 font-semibold">Save {formatNaira(pkg.patientSaves)}</span>
                                                </motion.div>
                                            );
                                        })()}
                                        <p className="text-[10px] text-gray-400 mt-2.5 text-center">
                                            Includes platform fee · Discounts vary by physiotherapist (5–15%)
                                        </p>
                                    </div>

                                    {/* CTA — Go directly to matching */}
                                    <Link
                                        href={findMyPhysioUrl}
                                        onClick={() => {
                                            // Persist treatment prefs to localStorage for the booking flow
                                            try {
                                                localStorage.setItem(
                                                    "treatmentPrefs",
                                                    JSON.stringify({
                                                        cityKey: selectedCity?.regionKey || "",
                                                        areaIndex: selectedCity?.areaIndex,
                                                        areaLabel: selectedCity?.name || "",
                                                        conditionLabel: selectedCondition?.label || "",
                                                        conditionLevel: selectedCondition?.level || "standard",
                                                        sessionRate: price?.sessionRate || 0,
                                                        timestamp: Date.now(),
                                                    })
                                                );
                                            } catch {
                                                // localStorage unavailable — continue anyway
                                            }
                                        }}
                                        className="group w-full flex items-center justify-center gap-2 py-3.5 sm:py-4 px-8 rounded-full font-bold text-white bg-[#005b57] hover:bg-[#004a46] transition-all duration-300 hover:scale-[1.02] shadow-lg shadow-[#005b57]/20"
                                    >
                                        <Sparkles className="w-4 h-4" />
                                        Find My Physiotherapist
                                        <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                                    </Link>
                                    <p className="text-center text-xs text-gray-400 mt-2.5">
                                        Browse matched physiotherapists — sign up only when you&apos;re ready to book.
                                    </p>

                                    {/* Back */}
                                    <div className="mt-5 text-center">
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

        {/* ── Floating Dynamic Island CTA ── */}
        {/* pointer-events-none on the wrapper prevents it blocking the page behind it */}
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center pb-6">
            <AnimatePresence>
                {step === 2 && selectedCondition && price && (
                    <motion.div
                        initial={{ y: 100, opacity: 0, scale: 0.85 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 100, opacity: 0, scale: 0.85 }}
                        transition={{ type: "spring", damping: 22, stiffness: 280 }}
                        className="pointer-events-auto"
                    >
                        <button
                            onClick={goNext}
                            className="flex items-center gap-3 bg-[#002e2c] text-white pl-4 pr-5 py-3.5 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.35)] hover:bg-[#004a46] transition-all duration-200 hover:scale-[1.04] active:scale-[0.97] cursor-pointer"
                        >
                            <span className="flex items-center justify-center w-7 h-7 bg-teal-500/20 rounded-full">
                                <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                            </span>
                            <div className="text-left">
                                <p className="text-[10px] text-teal-300 font-medium leading-none mb-0.5">Estimated rate</p>
                                <p className="text-base font-bold leading-none">
                                    {formatNaira(price.sessionRate)}
                                    <span className="text-xs text-gray-400 font-normal ml-1">/session</span>
                                </p>
                            </div>
                            <span className="h-5 w-px bg-white/10" />
                            <span className="text-sm font-semibold text-teal-300">See My Price</span>
                            <ArrowRight className="w-4 h-4 text-teal-400" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    </div>
    );
}

