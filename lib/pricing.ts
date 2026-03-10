// ──────────────────────────────────────────────────
// Rehabify — Pricing Calculator (Revised Model)
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

// ── Full Session Price Calculator ─────────────────
export const BASE_RATE = 15_000;

export interface PriceBreakdown {
    base: number;
    locationAdjustment: number;
    locationTier: LocationTier;
    conditionAdjustment: number;
    conditionLevel: ConditionLevel;
    physioLevelAdjustment: number;
    physioLevel: PhysioLevel;
    sessionRate: number; // the physio's session rate (before platform fees)
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

// ── Platform Fee Calculator ───────────────────────
// Standard sessions (≤₦25k): Fixed ₦1,000
// Premium sessions (>₦25k):  ₦1,000 + 5% on the excess above ₦25k
export const PLATFORM_FEE_FLAT = 1_000;
export const PREMIUM_THRESHOLD = 25_000;
export const PREMIUM_EXCESS_RATE = 0.05; // 5%

export function calculatePlatformFee(sessionRate: number): number {
    if (sessionRate <= PREMIUM_THRESHOLD) {
        return PLATFORM_FEE_FLAT;
    }
    const excess = sessionRate - PREMIUM_THRESHOLD;
    return PLATFORM_FEE_FLAT + Math.round(excess * PREMIUM_EXCESS_RATE);
}

// ── First-Session Extras ──────────────────────────
export const INITIAL_ASSESSMENT_FEE = 2_500;
export const AWADOC_FEE = 2_000;
export const FIRST_SESSION_EXTRAS = INITIAL_ASSESSMENT_FEE + AWADOC_FEE; // ₦4,500

// ── Full Session Fee Breakdown ────────────────────
// What a patient pays for a single session, including all fees
export interface SessionFeeBreakdown {
    physioRate: number;          // what the physio earns (session rate, possibly discounted)
    platformFee: number;        // Rehabify platform fee
    initialAssessment: number;  // ₦2,500 (first session only)
    awadocFee: number;          // ₦2,000 (first session only)
    patientPays: number;        // total the patient pays
    isFirstSession: boolean;
}

export function calculateSessionFees(
    sessionRate: number,
    isFirstSession: boolean = false,
): SessionFeeBreakdown {
    const platformFee = calculatePlatformFee(sessionRate);
    const initialAssessment = isFirstSession ? INITIAL_ASSESSMENT_FEE : 0;
    const awadocFee = isFirstSession ? AWADOC_FEE : 0;
    const patientPays = sessionRate + platformFee + initialAssessment + awadocFee;

    return {
        physioRate: sessionRate,
        platformFee,
        initialAssessment,
        awadocFee,
        patientPays,
        isFirstSession,
    };
}

// ── Package Calculator (Revised) ──────────────────
// Physio sets a discount percentage (5-15%)
// Discount applies to the physio's session rate
// Platform fees are constant; discount comes from physio's cut
export const MIN_DISCOUNT_PERCENT = 5;
export const MAX_DISCOUNT_PERCENT = 15;
export const AVAILABLE_PACKAGES = [1, 4, 8, 12] as const;
export type PackageSize = typeof AVAILABLE_PACKAGES[number];

export interface PackageBreakdown {
    sessions: number;
    discountPercent: number;
    // Per-session breakdown
    originalRate: number;           // physio's undiscounted rate
    discountPerSession: number;     // how much the physio discounts
    discountedRate: number;         // physio's rate after discount
    platformFeePerSession: number;  // platform fee (based on discounted rate)
    // First session extras
    firstSessionExtras: number;     // ₦4,500 (assessment + awadoc)
    // Totals
    firstSessionTotal: number;      // 1st session: discounted + platform + extras
    followUpSessionTotal: number;   // subsequent sessions: discounted + platform
    packageTotal: number;           // what patient pays for entire package
    normalTotal: number;            // what patient would pay without discount
    patientSaves: number;           // total savings
    // Distribution
    physioEarnings: number;         // total physio gets
    platformEarnings: number;       // total platform gets
    assessmentEarnings: number;     // initial assessment fee
    awadocEarnings: number;         // awadoc fee
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
    if (typeof discountPercent !== 'number' || !Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
        throw new RangeError('discountPercent must be between 0 and 100 inclusive');
    }

    // Discount only applies to physio's rate
    const discountPerSession = Math.round(sessionRate * (discountPercent / 100));
    const discountedRate = sessionRate - discountPerSession;

    // Platform fee based on discounted rate
    const platformFeePerSession = calculatePlatformFee(discountedRate);

    // First session extras
    const firstSessionExtras = FIRST_SESSION_EXTRAS;

    // Session totals
    const firstSessionTotal = discountedRate + platformFeePerSession + firstSessionExtras;
    const followUpSessionTotal = discountedRate + platformFeePerSession;

    // Package total
    const packageTotal = sessions === 1
        ? firstSessionTotal
        : firstSessionTotal + (followUpSessionTotal * (sessions - 1));

    // Normal pricing (no discount)
    const normalPlatformFee = calculatePlatformFee(sessionRate);
    const normalFirstSession = sessionRate + normalPlatformFee + firstSessionExtras;
    const normalFollowUp = sessionRate + normalPlatformFee;
    const normalTotal = sessions === 1
        ? normalFirstSession
        : normalFirstSession + (normalFollowUp * (sessions - 1));

    const patientSaves = normalTotal - packageTotal;

    // Distribution
    const physioEarnings = discountedRate * sessions;
    const platformEarnings = platformFeePerSession * sessions;
    const assessmentEarnings = INITIAL_ASSESSMENT_FEE;
    const awadocEarnings = AWADOC_FEE;

    return {
        sessions,
        discountPercent,
        originalRate: sessionRate,
        discountPerSession,
        discountedRate,
        platformFeePerSession,
        firstSessionExtras,
        firstSessionTotal,
        followUpSessionTotal,
        packageTotal,
        normalTotal,
        patientSaves,
        physioEarnings,
        platformEarnings,
        assessmentEarnings,
        awadocEarnings,
    };
}

// ── Recommended Discount Defaults ─────────────────
export function getRecommendedDiscount(sessionRate: number): number {
    if (sessionRate <= 20_000) return 10;  // Standard physios
    if (sessionRate <= 30_000) return 7;   // Senior specialists
    return 5;                              // Consultants
}

// ── Formatting helpers ────────────────────────────
export function formatNaira(amount: number): string {
    return `₦${amount.toLocaleString("en-NG")}`;
}

// ── Package labels & descriptions ─────────────────
export const PACKAGE_INFO: Record<PackageSize, { label: string; description: string; popular?: boolean }> = {
    1: {
        label: "Single Session",
        description: "Try a session, no commitment",
    },
    4: {
        label: "Starter Package",
        description: "4 sessions — great for mild conditions",
    },
    8: {
        label: "Complete Care",
        description: "8 sessions — our most popular plan",
        popular: true,
    },
    12: {
        label: "Full Recovery",
        description: "12 sessions — best for complex cases",
    },
};
