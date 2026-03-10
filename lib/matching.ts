/**
 * Smart Matching Engine
 * Maps patient conditions to relevant physiotherapist specializations
 * and provides scoring utilities for the matching algorithm.
 */

import { CITIES, type ConditionLevel } from "./pricing";

// ── Condition → Specialization Mapping ──────────────

/**
 * Maps condition labels from start-treatment to relevant specializations
 * that physios might have on their profiles.
 */
export const CONDITION_TO_SPECIALIZATIONS: Record<string, string[]> = {
    // Standard Care
    "Back or neck pain": [
        "back pain",
        "neck pain",
        "spinal",
        "spine",
        "musculoskeletal",
        "manual therapy",
        "orthopedic",
        "orthopaedic",
        "posture",
        "pain management",
    ],
    "Sports injury (sprains, strains)": [
        "sports",
        "sports injury",
        "sports rehab",
        "sports medicine",
        "athletic",
        "musculoskeletal",
        "orthopedic",
        "orthopaedic",
        "rehabilitation",
    ],
    "General joint pain": [
        "joint",
        "musculoskeletal",
        "arthritis",
        "orthopedic",
        "orthopaedic",
        "manual therapy",
        "pain management",
        "rheumatology",
    ],
    "Mild arthritis": [
        "arthritis",
        "rheumatology",
        "geriatric",
        "joint",
        "musculoskeletal",
        "pain management",
        "manual therapy",
    ],

    // Advanced Care
    "Post-surgery rehabilitation": [
        "post-surgical",
        "post-operative",
        "surgical rehab",
        "rehabilitation",
        "orthopedic",
        "orthopaedic",
        "recovery",
        "musculoskeletal",
    ],
    "Chronic pain condition": [
        "chronic pain",
        "pain management",
        "pain science",
        "musculoskeletal",
        "manual therapy",
        "rehabilitation",
    ],
    "Moderate arthritis": [
        "arthritis",
        "rheumatology",
        "musculoskeletal",
        "geriatric",
        "pain management",
        "joint replacement",
    ],
    "Complex sports injury (ACL, rotator cuff)": [
        "sports",
        "sports injury",
        "ACL",
        "rotator cuff",
        "shoulder",
        "knee",
        "orthopedic",
        "orthopaedic",
        "surgical rehab",
        "rehabilitation",
    ],

    // Specialized Neurological Care
    "Stroke recovery": [
        "stroke",
        "neuro",
        "neurological",
        "neurorehabilitation",
        "neurophysiotherapy",
        "brain injury",
        "rehabilitation",
    ],
    "Spinal cord injury": [
        "spinal cord",
        "spinal",
        "neuro",
        "neurological",
        "neurorehabilitation",
        "wheelchair",
        "rehabilitation",
        "paralysis",
    ],
    "Cerebral palsy": [
        "cerebral palsy",
        "pediatric",
        "paediatric",
        "neuro",
        "neurological",
        "developmental",
        "children",
    ],
    "Other neurological condition (Parkinson's, MS, TBI)": [
        "parkinson",
        "multiple sclerosis",
        "TBI",
        "traumatic brain injury",
        "neuro",
        "neurological",
        "neurorehabilitation",
        "neurophysiotherapy",
    ],
};

// ── Location Matching Utilities ──────────────────

/**
 * Get all city/area names that belong to a region.
 * For example, "lagos" → ["Lagos", "Island (Ikoyi, VI...)", "Mainland (Ikeja...)"]
 */
export function getRegionLocations(cityKey: string): string[] {
    const city = CITIES[cityKey];
    if (!city) return [];
    return [city.label, ...city.areas.map((a) => a.label)];
}

/**
 * Get the region key for a given city key.
 * The CITIES dict keys ARE the region keys.
 */
export function getRegionKey(cityKey: string): string {
    return cityKey;
}

/**
 * Get all location strings that are "nearby" to a given city key.
 * Returns an array of location name fragments to fuzzy-match against
 * physio profile location strings.
 */
export function getNearbyLocationTerms(cityKey: string): string[] {
    const city = CITIES[cityKey];
    if (!city) return [];

    const terms: string[] = [city.label.toLowerCase()];

    // Extract individual place names from area labels
    for (const area of city.areas) {
        const areaLabel = area.label.toLowerCase();
        terms.push(areaLabel);

        // Extract individual names from parentheses: "Island (Ikoyi, VI, Lekki)" → ["ikoyi", "vi", "lekki"]
        const match = areaLabel.match(/\(([^)]+)\)/);
        if (match) {
            const places = match[1].split(",").map((s) => s.trim().toLowerCase());
            terms.push(...places);
        }

        // Extract names from "X / Y" format: "Ife / Ilesha" → ["ife", "ilesha"]
        if (areaLabel.includes("/")) {
            const parts = areaLabel.split("/").map((s) => s.trim());
            terms.push(...parts);
        }
    }

    return terms;
}

/**
 * Regions that are geographically close.
 * Used for fallback matching when no physios are in the exact region.
 */
export const NEARBY_REGIONS: Record<string, string[]> = {
    lagos: ["southwest"],
    abuja: ["northcentral"],
    southwest: ["lagos", "southsouth"],
    southeast: ["southsouth"],
    southsouth: ["southeast", "southwest"],
    northcentral: ["abuja", "northwest", "northeast"],
    northwest: ["northcentral", "northeast"],
    northeast: ["northcentral", "northwest"],
};

// ── Match Scoring ────────────────────────────────

export interface MatchScore {
    total: number;
    locationScore: number;
    specializationScore: number;
    verificationScore: number;
    ratingScore: number;
    onlineScore: number;
    experienceScore: number;
    tier: "best_match" | "regional" | "online" | "nationwide";
    matchReasons: string[];
}

/**
 * Calculate a match score for a physiotherapist against patient preferences.
 * Higher score = better match.
 */
export function calculateMatchScore(
    physio: {
        location?: string;
        specializations: string[];
        isVerified: boolean;
        averageRating: number;
        reviewCount: number;
        offersOnlineSessions: boolean;
        offersInPersonSessions: boolean;
        yearsOfExperience: number;
    },
    patientPrefs: {
        cityKey: string;
        conditionLabel: string;
        conditionLevel: ConditionLevel;
    }
): MatchScore {
    let locationScore = 0;
    let specializationScore = 0;
    let verificationScore = 0;
    let ratingScore = 0;
    let onlineScore = 0;
    let experienceScore = 0;
    let tier: MatchScore["tier"] = "nationwide";
    const matchReasons: string[] = [];

    const physioLocation = (physio.location || "").toLowerCase().trim();

    // ── 1. Location scoring (0-40 points) ──
    // IMPORTANT: Only match if physio has a non-empty location.
    // Without this, "".includes("") is true and every physio falsely matches.
    const hasPhysioLocation = physioLocation.length > 0;
    const exactTerms = getNearbyLocationTerms(patientPrefs.cityKey);
    const isExactMatch = hasPhysioLocation && exactTerms.length > 0 && exactTerms.some(
        (term) => physioLocation.includes(term) || term.includes(physioLocation)
    );

    if (isExactMatch && physio.offersInPersonSessions) {
        locationScore = 40;
        tier = "best_match";
        matchReasons.push("In your area");
    } else {
        // Check nearby regions
        const nearbyRegionKeys = NEARBY_REGIONS[patientPrefs.cityKey] || [];
        const nearbyTerms = nearbyRegionKeys.flatMap(getNearbyLocationTerms);
        const isNearby = hasPhysioLocation && nearbyTerms.length > 0 && nearbyTerms.some(
            (term) => physioLocation.includes(term) || term.includes(physioLocation)
        );

        if (isNearby) {
            locationScore = 20;
            tier = "regional";
            matchReasons.push("In your region");
        } else if (physio.offersOnlineSessions) {
            locationScore = 10;
            tier = "online";
            matchReasons.push("Available online");
        } else {
            locationScore = 0;
            tier = "nationwide";
        }
    }

    // Bonus for online availability (always useful)
    if (physio.offersOnlineSessions) {
        onlineScore = 5;
        if (!matchReasons.includes("Available online")) {
            matchReasons.push("Offers online sessions");
        }
    }

    // ── 2. Specialization scoring (0-30 points) ──
    const relevantSpecs =
        CONDITION_TO_SPECIALIZATIONS[patientPrefs.conditionLabel] || [];

    if (relevantSpecs.length > 0 && physio.specializations.length > 0) {
        const physioSpecs = physio.specializations.map((s) => s.toLowerCase());
        let specMatches = 0;

        for (const relevantSpec of relevantSpecs) {
            if (
                physioSpecs.some(
                    (ps) => ps.includes(relevantSpec) || relevantSpec.includes(ps)
                )
            ) {
                specMatches++;
            }
        }

        // Score based on proportion of matches (up to 30 points)
        specializationScore = Math.min(
            30,
            Math.round((specMatches / Math.min(relevantSpecs.length, 3)) * 30)
        );

        if (specMatches > 0) {
            matchReasons.push("Specializes in your condition");
        }
    }

    // Condition complexity bonus for experienced physios
    if (patientPrefs.conditionLevel === "complex" && physio.yearsOfExperience >= 5) {
        specializationScore = Math.min(30, specializationScore + 5);
        matchReasons.push("Experienced with complex cases");
    }

    // ── 3. Verification scoring (0-15 points) ──
    if (physio.isVerified) {
        verificationScore = 15;
        matchReasons.push("Verified professional");
    }

    // ── 4. Rating scoring (0-10 points) ──
    if (physio.averageRating > 0) {
        ratingScore = Math.round((physio.averageRating / 5) * 10);
        if (physio.averageRating >= 4.5 && physio.reviewCount >= 5) {
            matchReasons.push("Highly rated");
        }
    }

    // ── 5. Experience scoring (0-5 points) ──
    experienceScore = Math.min(5, Math.round(physio.yearsOfExperience / 4));

    const total =
        locationScore +
        specializationScore +
        verificationScore +
        ratingScore +
        onlineScore +
        experienceScore;

    return {
        total,
        locationScore,
        specializationScore,
        verificationScore,
        ratingScore,
        onlineScore,
        experienceScore,
        tier,
        matchReasons,
    };
}
