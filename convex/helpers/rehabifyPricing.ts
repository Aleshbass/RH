/**
 * Server side of Rehabify's standard pricing: loads the tariff in force and the travel zone,
 * and quotes a booking with lib/rehabify-services.ts quoteService. Booking mutations never
 * take an amount from the browser; they quote here and store the snapshot on the booking.
 */
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  getService,
  mergeTariffs,
  QuoteError,
  quoteService,
  type BookableServiceId,
  type RehabifyQuote,
  type ServiceTariff,
  type TariffTable,
} from "../../lib/rehabify-services";

export const PRICING_MODEL = "rehabify_2026_10" as const;

export const DEFAULT_PRICING_SETTINGS = {
  accessCapacity: 20,
  accessIntakeOpen: true,
  networkTermsEnforcedAt: undefined as number | undefined,
};

export async function loadTariffs(ctx: QueryCtx): Promise<{ version: number; tariffs: TariffTable }> {
  const latest = await ctx.db.query("serviceTariffs").withIndex("by_version").order("desc").first();
  if (!latest) return { version: 0, tariffs: mergeTariffs(null) };
  const saved: Record<string, Partial<ServiceTariff>> = {};
  for (const row of latest.tariffs) saved[row.serviceId] = row;
  return { version: latest.version, tariffs: mergeTariffs(saved) };
}

export async function loadPricingSettings(ctx: QueryCtx) {
  const saved = await ctx.db.query("rehabifyPricingSettings").order("desc").first();
  return {
    accessCapacity: saved?.accessCapacity ?? DEFAULT_PRICING_SETTINGS.accessCapacity,
    accessIntakeOpen: saved?.accessIntakeOpen ?? DEFAULT_PRICING_SETTINGS.accessIntakeOpen,
    networkTermsEnforcedAt: saved?.networkTermsEnforcedAt,
  };
}

const normalise = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/** The active zone in this city that lists the area (case-insensitive), if any. */
export function zoneForArea<Z extends Pick<Doc<"travelZones">, "city" | "areas" | "active">>(
  zones: Z[],
  city: string,
  area: string
): Z | null {
  const c = normalise(city);
  const a = normalise(area);
  return zones.find((zone) => zone.active && normalise(zone.city) === c && zone.areas.some((x) => normalise(x) === a)) ?? null;
}

export type BookingQuote = RehabifyQuote & {
  tariffVersion: number;
  durationMinutes: number;
  zone: Doc<"travelZones"> | null;
};

/** Quotes one session; throws a ConvexError the booking page can show. */
export async function quoteBooking(
  ctx: QueryCtx,
  input: { serviceId: string; zoneId?: Id<"travelZones"> | null; assisted?: boolean }
): Promise<BookingQuote> {
  const service = getService(input.serviceId);
  if (!service) throw new ConvexError("This service can't be booked.");
  const { version, tariffs } = await loadTariffs(ctx);
  let zone: Doc<"travelZones"> | null = null;
  if (service.mode === "home") {
    zone = input.zoneId ? await ctx.db.get(input.zoneId) : null;
    if (!zone || !zone.active) throw new ConvexError("We don't cover that area for home visits yet. Choose a virtual session or contact us.");
  }
  try {
    const quote = quoteService({ serviceId: input.serviceId, tariffs, zone, assisted: input.assisted });
    return { ...quote, tariffVersion: version, durationMinutes: service.durationMinutes, zone };
  } catch (error) {
    if (error instanceof QuoteError) throw new ConvexError(error.message);
    throw error;
  }
}

/** The booking fields that record a quote. */
export function quoteSnapshot(quote: BookingQuote, area?: string) {
  return {
    serviceId: quote.serviceId,
    pricingModel: PRICING_MODEL,
    tariffVersion: quote.tariffVersion,
    basePriceKobo: quote.basePriceKobo,
    travelZoneId: quote.zone?._id,
    travelZoneName: quote.zone?.name,
    travelArea: quote.zone ? area : undefined,
    travelSurchargeKobo: quote.travelSurchargeKobo,
    payoutKobo: quote.payoutKobo,
    travelPhysioShareKobo: quote.travelPhysioShareKobo,
    paystackFeeEstimateKobo: quote.feeEstimateKobo,
    // Legacy money fields, kept meaningful for reports and receipts:
    serviceAmount: quote.chargeKobo, // what Paystack is asked to charge
    totalAmount: quote.chargeKobo, // all-inclusive: nothing is added at checkout
    paystackFee: quote.feeEstimateKobo, // absorbed by Rehabify
    physiotherapistEarnings: quote.physioEarningsKobo,
    platformFee: Math.max(0, quote.rehabifyKobo),
    rehabifyEarnings: quote.rehabifyKobo,
    partnerEarnings: 0, // partner commission is worked out from the partner's contract on payment
  };
}

const ASSESSMENTS = new Set<string>(["virtual_assessment", "home_assessment"]);

/**
 * Whether the patient has been assessed, so treatment can be booked. Counts a paid Rehabify
 * assessment, any paid booking made before standard pricing (those were full sessions), or a
 * completed appointment with a physiotherapist.
 */
export async function hasPriorAssessment(ctx: QueryCtx, patientId: Id<"users">): Promise<boolean> {
  const bookings = await ctx.db
    .query("marketplaceBookings")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .collect();
  const assessed = bookings.some(
    (booking) =>
      booking.paymentStatus === "completed" &&
      booking.bookingStatus !== "cancelled" &&
      (booking.serviceId ? ASSESSMENTS.has(booking.serviceId) : booking.joyConsultationType !== "quick_initial")
  );
  if (assessed) return true;
  const completed = await ctx.db
    .query("appointments")
    .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", patientId))
    .filter((q) => q.and(q.eq(q.field("status"), "completed"), q.neq(q.field("isRecordOnly"), true)))
    .first();
  return completed !== null;
}

export function serviceNeedsAssessment(serviceId: BookableServiceId): boolean {
  return Boolean(getService(serviceId)?.requiresPriorAssessment);
}
