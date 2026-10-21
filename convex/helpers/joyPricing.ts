/**
 * Joy bookings under Rehabify standard pricing.
 *
 * Joy's API keeps its shape (service_mode, duration_minutes, amount_kobo meaning "total
 * charged"); here those requests are mapped onto the Rehabify catalogue so Joy charges the
 * same all-inclusive prices as the website, with the same travel zones and physio payouts.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getService, type BookableServiceId } from "../../lib/rehabify-services";
import { hasPriorAssessment, loadPricingSettings, quoteBooking, zoneForArea, type BookingQuote } from "./rehabifyPricing";
import { isPhysioNetworkEligible, servesRehabifyNetwork } from "../physioSetup";

export type JoyServiceMode = "home_visit" | "clinic" | "online";

/** Joy's admin-scheduled consultation products, mapped to Rehabify services. */
export const JOY_CONSULTATION_SERVICES = {
  quick_initial: "recovery_consultation",
  full_virtual: "virtual_assessment",
} as const satisfies Record<string, BookableServiceId>;

/** Amounts Joy's templates sent before standard pricing; still accepted, never charged. */
export const LEGACY_JOY_CONSULTATION_KOBO: Record<keyof typeof JOY_CONSULTATION_SERVICES, number> = {
  quick_initial: 600_000,
  full_virtual: 1_500_000,
};

/**
 * The Rehabify service for a Joy provider booking. Clinic visits aren't a Rehabify service
 * (clinics set their own prices), so they map to nothing.
 */
export function joyServiceFor(mode: JoyServiceMode, options: { durationMinutes?: number; assessed?: boolean }): BookableServiceId | null {
  const minutes = options.durationMinutes;
  if (mode === "online") {
    if (minutes !== undefined && minutes <= 20) return "recovery_consultation";
    if (options.assessed && (minutes === undefined || minutes <= 45)) return "virtual_treatment";
    return "virtual_assessment";
  }
  if (mode === "home_visit") return options.assessed ? "home_treatment" : "home_assessment";
  return null;
}

export class JoyPricingError extends Error {
  constructor(public code: "SERVICE_UNAVAILABLE" | "AREA_NOT_COVERED", message: string) {
    super(message);
  }
}

/** Resolves the service, travel zone and quote for a Joy provider booking. */
export async function quoteJoyProviderBooking(
  ctx: QueryCtx,
  input: { patientId: Id<"users">; serviceMode: JoyServiceMode; durationMinutes?: number; city?: string; area?: string }
): Promise<{ serviceId: BookableServiceId; quote: BookingQuote; area?: string }> {
  const assessed = await hasPriorAssessment(ctx, input.patientId);
  const serviceId = joyServiceFor(input.serviceMode, { durationMinutes: input.durationMinutes, assessed });
  if (!serviceId) throw new JoyPricingError("SERVICE_UNAVAILABLE", "Clinic visits aren't booked through Rehabify");

  let zoneId: Id<"travelZones"> | null = null;
  let area: string | undefined;
  if (getService(serviceId)?.mode === "home") {
    let city = input.city;
    area = input.area;
    if (!city || !area) {
      const profile = await ctx.db.query("patientProfiles").withIndex("by_user_id", (q) => q.eq("userId", input.patientId)).first();
      city = city || profile?.city;
      area = area || profile?.area;
    }
    const zones = await ctx.db.query("travelZones").collect();
    const zone = city && area ? zoneForArea(zones, city, area) : null;
    if (!zone) throw new JoyPricingError("AREA_NOT_COVERED", "Home visits aren't available in this area yet");
    zoneId = zone._id;
  }
  try {
    const quote = await quoteBooking(ctx, { serviceId, zoneId });
    return { serviceId, quote, area };
  } catch {
    throw new JoyPricingError("SERVICE_UNAVAILABLE", "This service isn't available right now");
  }
}

/**
 * Whether Joy may offer this physio. Approved and in the Rehabify network (clinic members work
 * under their clinic's terms). Once the admin's network-terms date passes, Joy applies the same
 * full bookability gate as the website.
 */
export async function isJoyProviderEligible(ctx: QueryCtx, profile: Doc<"physiotherapistProfiles">): Promise<boolean> {
  if (!servesRehabifyNetwork(profile)) return false;
  const { networkTermsEnforcedAt } = await loadPricingSettings(ctx);
  if (typeof networkTermsEnforcedAt === "number" && networkTermsEnforcedAt <= Date.now()) {
    return isPhysioNetworkEligible(ctx, profile.userId);
  }
  const approval = await ctx.db.query("accountApprovalStatus").withIndex("by_user_id", (q) => q.eq("userId", profile.userId)).first();
  return approval?.status === "approved";
}
