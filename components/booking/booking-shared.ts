/**
 * Shared bits for the booking flows (public /book pages and the physio "schedule a patient" modal):
 * session types, the price a patient pays, and the onboarding prefs saved by /start-treatment.
 *
 * Prices here are in NAIRA (the marketplace profile query converts from kobo).
 */

export type SessionType = {
    id: "initial" | "followup" | "quick";
    title: string;
    description: string;
    duration: number;
};

export const SESSION_TYPES: SessionType[] = [
    { id: "initial", title: "Initial Consultation", description: "Full assessment and a treatment plan", duration: 60 },
    { id: "followup", title: "Follow-up Session", description: "Hands-on treatment and progress check", duration: 45 },
    { id: "quick", title: "Quick Check-in", description: "A short progress review", duration: 30 },
];

/** Session type for a booking-link duration (/book/[id]/[duration]). */
export function sessionTypeForDuration(duration: number): SessionType {
    if (duration <= 30) return SESSION_TYPES[2];
    if (duration <= 45) return SESSION_TYPES[1];
    return SESSION_TYPES[0];
}

/**
 * Last-resort standard rates. The live ones come from Admin › Revenue settings via
 * getPhysiotherapistProfile (standardVirtualRate / standardInPersonRate); these match the
 * built-in fallbacks in convex/helpers/marketplacePricing.ts.
 */
export const STANDARD_VIDEO_RATE_NAIRA = 6000;
export const STANDARD_IN_PERSON_RATE_NAIRA = 10000;

export type SessionMode = "online" | "in-person";

/** The pricing fields of api.marketplace.search.getPhysiotherapistProfile (naira). */
export type PricedPhysio = {
    hourlyRate?: number;
    initialConsultRate?: number;
    virtualConsultationRate?: number;
    inPersonConsultationRate?: number;
    // Platform standard prices (Admin › Revenue settings) for physios without their own
    standardVirtualRate?: number;
    standardInPersonRate?: number;
};

/** What the booking pages read from api.marketplace.search.getPhysiotherapistProfile. */
export type BookingProfile = PricedPhysio & {
    id: string;
    fullName: string;
    firstName?: string;
    imageUrl?: string;
    credentials?: string[];
    bio?: string;
    specializations?: string[];
    yearsOfExperience?: number;
    location?: string;
    languagesSpoken?: string[];
    packageDiscountPercent?: number;
    averageRating?: number;
    reviewCount?: number;
    isVerified?: boolean;
    offersOnlineSessions?: boolean;
    offersInPersonSessions?: boolean;
};

/**
 * How a booking is priced. Must stay in step with resolveServiceAmountKobo on the server:
 *  - "package": a per-session rate packages can be built from (onboarding tariff or the physio's
 *    hourly rate). The page sends the package total.
 *  - "initial": only an initial consultation rate is set. Single session, the page sends it.
 *  - "standard": no rate of their own. The page sends 0 and the server charges the physio's
 *    video / in-person price (or the platform standard), so the price depends on the session mode.
 */
export type BookingPricing =
    | { kind: "package"; sessionRate: number }
    | { kind: "initial"; sessionRate: number }
    | { kind: "standard"; video: number; inPerson: number };

export function bookingPricing(profile: PricedPhysio | null | undefined, onboardingRate?: number): BookingPricing {
    if (onboardingRate && onboardingRate > 0) return { kind: "package", sessionRate: onboardingRate };
    const hourly = profile?.hourlyRate ?? 0;
    if (hourly > 0) return { kind: "package", sessionRate: hourly };
    const initial = profile?.initialConsultRate ?? 0;
    if (initial > 0) return { kind: "initial", sessionRate: initial };
    return {
        kind: "standard",
        video: profile?.virtualConsultationRate || profile?.standardVirtualRate || STANDARD_VIDEO_RATE_NAIRA,
        inPerson: profile?.inPersonConsultationRate || profile?.standardInPersonRate || STANDARD_IN_PERSON_RATE_NAIRA,
    };
}

/** Price of one session in the given mode (naira). */
export function singleSessionPrice(pricing: BookingPricing, mode: SessionMode): number {
    if (pricing.kind === "standard") return mode === "online" ? pricing.video : pricing.inPerson;
    return pricing.sessionRate;
}

/** Price rows to show patients for the modes a physio offers. */
export function priceRows(
    pricing: BookingPricing,
    offersOnline: boolean,
    offersInPerson: boolean
): { label: string; amount: string }[] {
    if (pricing.kind !== "standard") return [{ label: "Per session", amount: formatNaira(pricing.sessionRate) }];
    const rows: { label: string; amount: string }[] = [];
    if (offersOnline) rows.push({ label: "Video call", amount: formatNaira(pricing.video) });
    if (offersInPerson) rows.push({ label: "In person", amount: formatNaira(pricing.inPerson) });
    if (rows.length === 2 && pricing.video === pricing.inPerson) return [{ label: "Per session", amount: rows[0].amount }];
    return rows.length > 0 ? rows : [{ label: "Video call", amount: formatNaira(pricing.video) }];
}

export function formatNaira(amount: number): string {
    return `₦${Math.round(amount).toLocaleString("en-NG")}`;
}

/** Treatment prefs saved by /start-treatment (only used for 24 hours). */
export interface TreatmentPrefs {
    cityKey: string;
    areaIndex?: number;
    areaLabel: string;
    conditionLabel: string;
    conditionLevel: string;
    sessionRate: number;
    timestamp: number;
}

export function readTreatmentPrefs(): TreatmentPrefs | null {
    try {
        const stored = localStorage.getItem("treatmentPrefs");
        if (!stored) return null;
        const prefs = JSON.parse(stored) as TreatmentPrefs;
        if (!prefs || typeof prefs.timestamp !== "number") return null;
        if (Date.now() - prefs.timestamp >= 24 * 60 * 60 * 1000) return null;
        return prefs;
    } catch {
        return null;
    }
}

/** Initials for an avatar fallback. */
export function initialsOf(name: string): string {
    return (
        name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() ?? "")
            .join("") || "R"
    );
}

/** A URL param that looks like a raw Convex id (slugs contain hyphens). */
export function looksLikeConvexId(value: string): boolean {
    return /^[a-zA-Z0-9_]+$/.test(value) && value.length > 10;
}
