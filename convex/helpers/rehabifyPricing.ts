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
  // Off until an admin publishes the Access rates and turns it on (adminSavePricingSettings)
  accessIntakeOpen: false,
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

/** Lower-case, punctuation and hyphens as spaces, single spaces: "Ikeja G.R.A." → "ikeja g r a". */
const normalise = (value: string) =>
  value.toLowerCase().replace(/[.,;:'’"()/\\-]/g, " ").replace(/\s+/g, " ").trim();

// How people write cities and areas on WhatsApp and forms, mapped to the zone spelling
const CITY_ALIASES: Record<string, string> = {
  "lagos state": "lagos", lag: "lagos", eko: "lagos",
  fct: "abuja", "abuja fct": "abuja", "fct abuja": "abuja", "federal capital territory": "abuja",
};
const AREA_ALIASES: Record<string, string> = {
  vi: "victoria island", "v i": "victoria island", cbd: "central business district",
  "lekki phase one": "lekki phase 1", "lekki ph 1": "lekki phase 1", "lekki phase i": "lekki phase 1",
  "lekki phase two": "lekki phase 2", "lekki ph 2": "lekki phase 2",
  "ikeja g r a": "ikeja gra", "gra ikeja": "ikeja gra", "festac town": "festac", amuwo: "amuwo odofin",
  satellite: "satellite town", "wuse ii": "wuse 2", "wuse zone 2": "wuse 2", "garki ii": "garki 2",
  "ibeju lekki": "ibeju lekki", "allen avenue": "allen", "ogba ikeja": "ogba",
};

/** Edit distance, for small typos ("Surelere" → "Surulere"). */
function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

const containsWords = (text: string, phrase: string) => ` ${text} `.includes(` ${phrase} `);

/**
 * The active zone in this city that covers the area. Exact names first, then common spellings
 * ("VI", "Lekki Phase One", "Ikeja G.R.A."), then an area named inside what was typed ("No 5,
 * Ikeja GRA" → Ikeja GRA, the longest match winning), then a small typo. Never another city.
 */
export function zoneForArea<Z extends Pick<Doc<"travelZones">, "city" | "areas" | "active">>(
  zones: Z[],
  city: string,
  area: string
): Z | null {
  const typed = normalise(area);
  const a = AREA_ALIASES[typed] ?? typed;
  const active = zones.filter((zone) => zone.active);
  const inCity = zonesForPlace(active, city);
  if (!inCity.length || !a) return null;
  const entries = inCity.flatMap((zone) =>
    zone.areas.filter((name) => name !== OTHER_AREAS_MARK).map((name) => ({ zone, key: normalise(name) })),
  );

  const exact = entries.find((entry) => entry.key === a);
  if (exact) return exact.zone;

  const named = entries.filter((entry) => containsWords(a, entry.key)).sort((x, y) => y.key.length - x.key.length);
  if (named.length) return named[0].zone;

  if (a.length >= 4) {
    const partOf = entries.filter((entry) => containsWords(entry.key, a));
    if (partOf.length && new Set(partOf.map((entry) => entry.zone)).size === 1) return partOf[0].zone;
  }

  const allowed = a.length > 6 ? 2 : a.length >= 4 ? 1 : 0;
  if (allowed) {
    const close = entries
      .map((entry) => ({ ...entry, distance: editDistance(a, entry.key) }))
      .filter((entry) => entry.distance <= allowed)
      .sort((x, y) => x.distance - y.distance);
    if (close.length && (close.length === 1 || close[0].distance < close[1].distance || close[0].zone === close[1].zone)) {
      return close[0].zone;
    }
  }
  // A state typed as the city ("Oyo"): an area named in exactly one zone anywhere wins, so
  // "Bodija" in Oyo is Ibadan North rather than the rest-of-state zone. A real city keeps its own.
  if (inCity.every((zone) => / state$/.test(normalise(zone.city)))) {
    const namedElsewhere = new Set(active.filter((zone) => zone.areas.some((name) => normalise(name) === a)));
    if (namedElsewhere.size === 1) return [...namedElsewhere][0];
  }
  // Anywhere else in this city or state: its "*" zone, or the only zone a city has
  return inCity.find((zone) => zone.areas.includes(OTHER_AREAS_MARK)) ?? (inCity.length === 1 ? inCity[0] : null);
}

/** "*" in a zone's areas: every other area in that city or state (helpers/startingZones.ts). */
const OTHER_AREAS_MARK = "*";

/**
 * The active zones for a place someone typed as their city: the city itself ("Lagos", "Lag"),
 * a state ("Ondo", "Ondo State", "FCT"), or a town named in a zone ("Akure", "Warri").
 */
function zonesForPlace<Z extends Pick<Doc<"travelZones">, "city" | "areas" | "active">>(zones: Z[], place: string): Z[] {
  const c = CITY_ALIASES[normalise(place)] ?? normalise(place);
  if (!c) return [];
  const byCity = zones.filter((zone) => normalise(zone.city) === c);
  if (byCity.length) return byCity;
  const bare = (value: string) => normalise(value).replace(/ state$/, "");
  const byState = zones.filter((zone) => bare(zone.city) === bare(c));
  if (byState.length) return byState;
  const cities = new Set(zones.filter((zone) => zone.areas.some((name) => normalise(name) === c)).map((zone) => zone.city));
  return cities.size === 1 ? zones.filter((zone) => cities.has(zone.city)) : [];
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
