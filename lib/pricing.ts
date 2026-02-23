// ──────────────────────────────────────────────────
// Rehabify — Pricing Calculator
// ──────────────────────────────────────────────────

// ── Location Tiers ────────────────────────────────
export type LocationTier = 1 | 2 | 3 | 4;

interface LocationArea {
    label: string;
    tier: LocationTier;
}

interface CityConfig {
    label: string;
    areas: LocationArea[];
}

export const CITIES: Record<string, CityConfig> = {
    lagos: {
        label: "Lagos",
        areas: [
            { label: "Island (Ikoyi, VI, Lekki Phase 1, Banana Island)", tier: 1 },
            { label: "Mainland (Ikeja, Yaba, Surulere, etc.)", tier: 2 },
            { label: "Lekki / Ajah", tier: 2 },
        ],
    },
    abuja: {
        label: "Abuja",
        areas: [
            { label: "Premium (Maitama, Asokoro, Wuse 2)", tier: 1 },
            { label: "Central (Wuse, Garki, Jabi, etc.)", tier: 2 },
            { label: "Outskirts (Kubwa, Lugbe, Karu)", tier: 3 },
        ],
    },
    southwest: {
        label: "South-West",
        areas: [
            { label: "Ibadan", tier: 3 },
            { label: "Abeokuta", tier: 3 },
            { label: "Akure", tier: 3 },
            { label: "Ado-Ekiti", tier: 3 },
            { label: "Osogbo", tier: 3 },
            { label: "Ife / Ilesha", tier: 4 },
        ],
    },
    southeast: {
        label: "South-East",
        areas: [
            { label: "Enugu", tier: 3 },
            { label: "Owerri", tier: 3 },
            { label: "Aba", tier: 3 },
            { label: "Onitsha", tier: 3 },
            { label: "Awka", tier: 3 },
            { label: "Abakaliki", tier: 4 },
        ],
    },
    southsouth: {
        label: "South-South",
        areas: [
            { label: "Port Harcourt", tier: 3 },
            { label: "Benin City", tier: 3 },
            { label: "Calabar", tier: 3 },
            { label: "Warri", tier: 3 },
            { label: "Uyo", tier: 3 },
            { label: "Asaba", tier: 3 },
        ],
    },
    northcentral: {
        label: "North-Central",
        areas: [
            { label: "Jos", tier: 3 },
            { label: "Ilorin", tier: 3 },
            { label: "Makurdi", tier: 3 },
            { label: "Minna", tier: 4 },
            { label: "Lokoja", tier: 4 },
            { label: "Lafia", tier: 4 },
        ],
    },
    northwest: {
        label: "North-West",
        areas: [
            { label: "Kaduna", tier: 3 },
            { label: "Kano", tier: 3 },
            { label: "Sokoto", tier: 4 },
            { label: "Zaria", tier: 4 },
            { label: "Katsina", tier: 4 },
        ],
    },
    northeast: {
        label: "North-East",
        areas: [
            { label: "Maiduguri", tier: 3 },
            { label: "Bauchi", tier: 4 },
            { label: "Yola", tier: 4 },
            { label: "Gombe", tier: 4 },
            { label: "Jalingo", tier: 4 },
        ],
    },
    other: {
        label: "Other Location",
        areas: [
            { label: "My city is not listed", tier: 4 },
        ],
    },
};

const LOCATION_ADJUSTMENTS: Record<LocationTier, number> = {
    1: 8_000,
    2: 5_000,
    3: 2_000,
    4: 0,
};

const LOCATION_LABELS: Record<LocationTier, string> = {
    1: "Premium zone — transport & convenience",
    2: "Major metro area",
    3: "Secondary city",
    4: "Standard rate — no location adjustment",
};

export function getLocationAdjustment(tier: LocationTier): number {
    return LOCATION_ADJUSTMENTS[tier];
}

export function getLocationLabel(tier: LocationTier): string {
    return LOCATION_LABELS[tier];
}

// ── Condition Complexity ──────────────────────────
export type ConditionLevel = "standard" | "moderate" | "complex";

interface ConditionOption {
    label: string;
    level: ConditionLevel;
}

interface ConditionGroup {
    heading: string;
    options: ConditionOption[];
}

export const CONDITION_GROUPS: ConditionGroup[] = [
    {
        heading: "Standard Care",
        options: [
            { label: "Back or neck pain", level: "standard" },
            { label: "Sports injury (sprains, strains)", level: "standard" },
            { label: "General joint pain", level: "standard" },
            { label: "Mild arthritis", level: "standard" },
        ],
    },
    {
        heading: "Advanced Care",
        options: [
            { label: "Post-surgery rehabilitation", level: "moderate" },
            { label: "Chronic pain condition", level: "moderate" },
            { label: "Moderate arthritis", level: "moderate" },
            { label: "Complex sports injury (ACL, rotator cuff)", level: "moderate" },
        ],
    },
    {
        heading: "Specialized Neurological Care",
        options: [
            { label: "Stroke recovery", level: "complex" },
            { label: "Spinal cord injury", level: "complex" },
            { label: "Cerebral palsy", level: "complex" },
            { label: "Other neurological condition (Parkinson's, MS, TBI)", level: "complex" },
        ],
    },
];

const CONDITION_ADJUSTMENTS: Record<ConditionLevel, number> = {
    standard: 0,
    moderate: 4_000,
    complex: 9_000,
};

const CONDITION_LABELS: Record<ConditionLevel, string> = {
    standard: "Standard care",
    moderate: "Advanced care — specialization required",
    complex: "Specialized neurological care",
};

export function getConditionAdjustment(level: ConditionLevel): number {
    return CONDITION_ADJUSTMENTS[level];
}

export function getConditionLabel(level: ConditionLevel): string {
    return CONDITION_LABELS[level];
}

// ── Physio Level ──────────────────────────────────
export type PhysioLevel = "standard" | "senior" | "consultant";

const PHYSIO_LEVEL_ADJUSTMENTS: Record<PhysioLevel, number> = {
    standard: 0,
    senior: 7_000,
    consultant: 9_000,
};

export function getPhysioLevelAdjustment(level: PhysioLevel): number {
    return PHYSIO_LEVEL_ADJUSTMENTS[level];
}

// ── Full Price Calculator ─────────────────────────
export const BASE_RATE = 15_000;

export interface PriceBreakdown {
    base: number;
    locationAdjustment: number;
    locationTier: LocationTier;
    conditionAdjustment: number;
    conditionLevel: ConditionLevel;
    physioLevelAdjustment: number;
    physioLevel: PhysioLevel;
    sessionRate: number; // what the patient pays per session
}

export function calculateSessionPrice(
    locationTier: LocationTier,
    conditionLevel: ConditionLevel,
    physioLevel: PhysioLevel = "standard",
): PriceBreakdown {
    const locationAdjustment = getLocationAdjustment(locationTier);
    const conditionAdjustment = getConditionAdjustment(conditionLevel);
    const physioLevelAdjustment = getPhysioLevelAdjustment(physioLevel);

    const sessionRate = BASE_RATE + locationAdjustment + conditionAdjustment + physioLevelAdjustment;

    return {
        base: BASE_RATE,
        locationAdjustment,
        locationTier,
        conditionAdjustment,
        conditionLevel,
        physioLevelAdjustment,
        physioLevel,
        sessionRate,
    };
}

// ── Package Calculator ────────────────────────────
export interface PackageBreakdown {
    sessions: number;
    discountPercent: number;
    discountPerSession: number;
    discountedRate: number;
    packageTotal: number;
    normalTotal: number;
    patientSaves: number;
}

export function calculatePackagePrice(
    sessionRate: number,
    sessions: number,
    discountPercent: number,
): PackageBreakdown {
    if (typeof sessionRate !== 'number' || !Number.isFinite(sessionRate) || sessionRate < 0) {
        throw new RangeError('sessionRate must be a non-negative finite number');
    }
    if (!Number.isInteger(sessions) || sessions <= 0) {
        throw new RangeError('sessions must be a positive integer');
    }
    if (typeof discountPercent !== 'number' || discountPercent < 0 || discountPercent > 100) {
        throw new RangeError('discountPercent must be between 0 and 100 inclusive');
    }

    const discountPerSession = Math.round(sessionRate * (discountPercent / 100));
    const discountedRate = sessionRate - discountPerSession;
    const normalTotal = sessionRate * sessions;
    const packageTotal = discountedRate * sessions;
    const patientSaves = normalTotal - packageTotal;

    return {
        sessions,
        discountPercent,
        discountPerSession,
        discountedRate,
        packageTotal,
        normalTotal,
        patientSaves,
    };
}

// ── Formatting helpers ────────────────────────────
export function formatNaira(amount: number): string {
    return `₦${amount.toLocaleString("en-NG")}`;
}
