/**
 * Shared bits for the booking flows (public /book pages, /get-care and the physio
 * "schedule a patient" modal): session types, the Rehabify service catalogue as the pages
 * read it, travel zones, Paystack checkout and the onboarding prefs saved by /start-treatment.
 *
 * Prices come from Convex (api.serviceTariffs.getCatalogue / getServiceQuote) in KOBO.
 */

import type { Id } from "@/convex/_generated/dataModel";
import {
    formatKobo,
    isBookableServiceId,
    serviceForLegacyDuration,
    type BookableServiceId,
    type RehabifyServiceId,
    type ServiceKind,
    type ServiceMode,
} from "@/lib/rehabify-services";

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

/** What the booking pages read from api.marketplace.search.getPhysiotherapistProfile. */
export type BookingProfile = {
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
    averageRating?: number;
    reviewCount?: number;
    isVerified?: boolean;
    offersOnlineSessions?: boolean;
    offersInPersonSessions?: boolean;
    /** Rehabify service ids this physio delivers. */
    servicesOffered?: string[];
    /** Travel zones the physio visits for home services. */
    coveredZoneIds?: string[];
};

// ── Catalogue, zones and quotes (shapes of the Convex queries) ─────────────

/** One row of api.serviceTariffs.getCatalogue. */
export type CatalogueService = {
    id: RehabifyServiceId;
    name: string;
    shortName: string;
    mode: ServiceMode;
    kind: ServiceKind;
    durationMinutes: number;
    durationLabel: string;
    bookable: boolean;
    requiresPriorAssessment: boolean;
    priceKobo: number;
    travelApplies: boolean;
    offeredUnderAccess: boolean;
    summary: string;
    whatHappens: string[];
    youReceive: string;
    notIncluded: string | null;
};

export type Catalogue = { version: number; services: CatalogueService[] };

/** One row of api.travelZones.listZones. */
export type TravelZone = {
    id: Id<"travelZones">;
    city: string;
    name: string;
    areas: string[];
    surchargeKobo: number;
};

/** api.marketplace.booking.getServiceQuote. */
export type ServiceQuote =
    | {
          ok: true;
          serviceId: string;
          durationMinutes: number;
          basePriceKobo: number;
          travelSurchargeKobo: number;
          chargeKobo: number;
          zoneName: string | null;
          assisted: boolean;
      }
    | { ok: false; message: string };

export const SERVICE_MODE_LABEL: Record<ServiceMode, string> = {
    virtual: "Video call",
    home: "Home visit",
};

/** "₦30,000", or "From ₦30,000" when a travel charge is added. */
export function servicePriceLabel(service: Pick<CatalogueService, "priceKobo" | "travelApplies">): string {
    return service.travelApplies ? `From ${formatKobo(service.priceKobo)}` : formatKobo(service.priceKobo);
}

/** Bookable catalogue services, limited to the ones a physio offers when given. */
export function bookableServices(services: CatalogueService[] | undefined, offered?: string[]): CatalogueService[] {
    return (services ?? []).filter(
        (service) => service.bookable && isBookableServiceId(service.id) && (!offered || offered.includes(service.id))
    );
}

/** "From ₦6,000": the cheapest bookable service. */
export function lowestPriceLabel(services: CatalogueService[] | undefined): string | null {
    const prices = bookableServices(services).map((service) => service.priceKobo);
    return prices.length > 0 ? `From ${formatKobo(Math.min(...prices))}` : null;
}

/** The video equivalent of a home service, for patients outside our travel zones. */
export function virtualAlternative(serviceId: string): BookableServiceId | null {
    if (serviceId === "home_assessment") return "virtual_assessment";
    if (serviceId === "home_treatment") return "virtual_treatment";
    return null;
}

/**
 * The [duration] segment of /book/[id]/[duration]: a service id, or a legacy minutes value
 * (30/45/60) that preselects a service the patient then confirms.
 */
export function parseServiceSegment(segment: string | undefined): { serviceId: BookableServiceId | null; legacy: boolean } {
    if (!segment) return { serviceId: null, legacy: false };
    if (/^\d+$/.test(segment)) {
        const minutes = parseInt(segment, 10);
        return { serviceId: minutes > 0 ? serviceForLegacyDuration(minutes) : null, legacy: true };
    }
    return { serviceId: isBookableServiceId(segment) ? segment : null, legacy: false };
}

/** Cities with travel zones, in the order listZones returns them. */
export function zoneCities(zones: TravelZone[] | undefined): string[] {
    return [...new Set((zones ?? []).map((zone) => zone.city))];
}

/** Every area we visit in a city, A–Z. */
export function cityAreas(zones: TravelZone[] | undefined, city: string): string[] {
    const areas = (zones ?? []).filter((zone) => zone.city === city).flatMap((zone) => zone.areas);
    return [...new Set(areas)].sort((a, b) => a.localeCompare(b));
}

/** The travel zone an area belongs to (an area is in at most one active zone per city). */
export function zoneForArea(zones: TravelZone[] | undefined, city: string, area: string): TravelZone | null {
    const wanted = area.trim().toLowerCase();
    if (!wanted) return null;
    return (
        (zones ?? []).find((zone) => zone.city === city && zone.areas.some((a) => a.toLowerCase() === wanted)) ?? null
    );
}

/** "?a=1&b=2" from the params that are set, or "". */
export function queryString(params: Record<string, string | null | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    const text = search.toString();
    return text ? `?${text}` : "";
}

/** The readable part of a Convex error (ConvexError data, or the server message). */
export function convexErrorMessage(error: unknown, fallback: string): string {
    const err = error as { data?: unknown; message?: unknown } | null;
    if (typeof err?.data === "string" && err.data.trim()) return err.data;
    const raw = typeof err?.message === "string" ? err.message : "";
    const match = raw.match(/(?:Uncaught (?:Convex)?Error|ConvexError):\s*(.+?)(?:\n|\s+at\s|$)/);
    return match?.[1] || fallback;
}

/** Errors that mean the patient should pick another time. */
export function isSlotError(message: string): boolean {
    return /pick (?:another|a new|a later) time|30 minutes from now|starts too soon/i.test(message);
}

export type CheckoutResult = { ok: true; url: string } | { ok: false; message: string; reason?: string };

/**
 * Starts Paystack checkout for a booking. The route charges the booking's own amount and
 * re-holds the slot; a 409 with reason "slot_taken" / "too_late" means pick a new time.
 */
export async function startMarketplaceCheckout(input: {
    bookingId: string;
    email: string;
    phone?: string;
    name?: string;
}): Promise<CheckoutResult> {
    try {
        const response = await fetch("/api/payments/marketplace", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                bookingId: input.bookingId,
                email: input.email,
                phone: input.phone || null,
                name: input.name || null,
            }),
        });
        const data = await response.json().catch(() => null);
        if (response.ok && data?.success && data.authorization_url) return { ok: true, url: data.authorization_url };
        return {
            ok: false,
            message: data?.error || "We couldn't start the payment. Please try again.",
            reason: typeof data?.reason === "string" ? data.reason : undefined,
        };
    } catch {
        return { ok: false, message: "We couldn't reach the payment service. Please check your connection and try again." };
    }
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
