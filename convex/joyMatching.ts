/**
 * Joy's physio matching (owner's "How matching works", Nov 2026).
 *
 * Safety comes first and is Joy's job: a patient with any red flag is never matched.
 *
 * 1. Filter, in matchCandidates (one read-only query):
 *    - approved and in the Rehabify network
 *    - offers the format
 *    - covers the area: the travel zone for a home visit; online care is ranked by area instead
 *    - speaks the patient's language
 * 2. Keep only physios with a free time inside the window (24 hours for Joy's first
 *    consultation), using the same slot calculation as the booking page (rankedJoyMatches).
 * 3. Rank by:
 *    - specialty fit
 *    - earliest time (2-hour bands)
 *    - spare capacity in the next 7 days
 *    - how reliably they answer paid requests
 *    - patient ratings
 * 4. Share fairly: on a tie, whoever had fewer paid referrals in the last 30 days goes first, so
 *    new physios get patients too.
 * 5. Urgent clinician review (triage AMBER): the earliest free physio comes first.
 *
 * The old findMatches (joyIntegration.ts) still answers callers that don't send a window.
 */
import { v } from "convex/values";
import { internalQuery, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { controlledTags, displayName, kmBetween } from "./joyIntegration";
import { isJoyProviderEligible, JoyPricingError, quoteJoyProviderBooking } from "./helpers/joyPricing";
import { zoneForArea } from "./helpers/rehabifyPricing";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// RH needs two hours' notice for a booking, plus a margin so a slot can't expire while the
// patient decides (the same margin Joy uses when it lists times)
const NOTICE_MS = 2 * HOUR + 5 * 60 * 1000;
// How many physios we look up free times for, after the cheap filters
const AVAILABILITY_LOOKUPS = 20;

// What a patient's language code needs a physio to list ("languages spoken" in their profile).
// English and Pidgin: every physio (an empty list is read as English).
const LANGUAGE_NAMES: Record<string, string[]> = {
  yo: ["yoruba"],
  ig: ["igbo"],
  ha: ["hausa"],
};

export function speaksLanguage(spoken: string[] | undefined, language: string | undefined): boolean {
  const needed = LANGUAGE_NAMES[(language ?? "").toLowerCase()];
  if (!needed) return true;
  const listed = (spoken ?? []).map((name) => name.toLowerCase());
  return needed.some((name) => listed.some((item) => item.includes(name)));
}

/**
 * The physio's own photo, or nothing. Clerk gives every account a generated avatar when no
 * photo was uploaded (img.clerk.com/<base64 of {"type":"default",...}>); Joy never shows those.
 */
export function uploadedPhoto(url: unknown): string | undefined {
  if (typeof url !== "string" || !url.startsWith("https://")) return undefined;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if ((host === "img.clerk.com" || host.endsWith(".clerk.com") || host.endsWith(".clerk.dev")) && parsed.pathname.slice(1).startsWith("eyJ0eXBlIjoiZGVmYXVsdC")) return undefined;
    if (host.endsWith("gravatar.com")) return undefined;
  } catch {
    return undefined;
  }
  return url;
}

function specialtyLabel(specializations: string[] | undefined): string | undefined {
  const names = (specializations ?? []).map((name) => name.trim()).filter(Boolean).slice(0, 2);
  return names.length ? names.join(" & ") : undefined;
}

export const matchCandidates = internalQuery({
  args: {
    patientId: v.id("users"),
    requiredSpecialties: v.array(v.string()),
    serviceMode: v.union(v.literal("home_visit"), v.literal("clinic"), v.literal("online")),
    durationMinutes: v.optional(v.number()),
    language: v.optional(v.string()),
    city: v.optional(v.string()),
    area: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.role !== "patient") throw new Error("Patient not found");
    let amountKobo: number;
    let zoneId: Id<"travelZones"> | null = null;
    try {
      const priced = await quoteJoyProviderBooking(ctx, {
        patientId: args.patientId, serviceMode: args.serviceMode, durationMinutes: args.durationMinutes,
        city: args.city, area: args.area,
      });
      amountKobo = priced.quote.chargeKobo;
      zoneId = priced.zoneId;
    } catch (error) {
      if (error instanceof JoyPricingError) return { amount_kobo: null, candidates: [] };
      throw error;
    }
    // Online care has no travel zone; find the patient's anyway, to rank local physios first
    if (!zoneId && args.city && args.area) {
      const zones = await ctx.db.query("travelZones").collect();
      zoneId = zoneForArea(zones, args.city, args.area)?._id ?? null;
    }
    const now = Date.now();
    const profiles = await ctx.db.query("physiotherapistProfiles")
      .withIndex("by_marketplace_availability", (q) => q.eq("isAvailableOnMarketplace", true))
      .collect();
    const candidates = [];
    for (const profile of profiles) {
      if (!profile.availabilitySchedule) continue;
      const modes = profile.joyServiceModes ?? [];
      if (!modes.includes(args.serviceMode)) continue;
      const coversArea = Boolean(zoneId && (profile.coveredZoneIds ?? []).includes(zoneId));
      if (args.serviceMode === "home_visit" && !coversArea) continue;
      if (!speaksLanguage(profile.languagesSpoken, args.language)) continue;
      if (!(await isJoyProviderEligible(ctx, profile))) continue;
      const user = await ctx.db.get(profile.userId);
      if (!user) continue;

      const tags = controlledTags(profile);
      const required = [...new Set(args.requiredSpecialties)];
      const specialtyScore = required.length ? required.filter((tag) => tags.includes(tag)).length / required.length : 0;
      const upcoming = await ctx.db.query("appointments")
        .withIndex("by_physiotherapist_id_and_time", (q) =>
          q.eq("physiotherapistId", profile.userId).gte("startTime", now).lt("startTime", now + 7 * DAY))
        .collect();
      const booked7d = upcoming.filter((a) => a.status !== "cancelled_by_patient" && a.status !== "cancelled_by_therapist").length;
      const bookings = await ctx.db.query("marketplaceBookings")
        .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", profile.userId))
        .collect();
      const paid = bookings.filter((b) => b.paymentStatus === "completed" && b.paystackMode !== "test");
      const recentReferrals = paid.filter((b) => (b.paidAt ?? b.createdAt ?? 0) >= now - 30 * DAY).length;
      const answered = paid.filter((b) => (b.paidAt ?? b.createdAt ?? 0) >= now - 90 * DAY && (b.providerResponse === "accepted" || b.providerResponse === "rejected"));
      const acceptRate = answered.length ? answered.filter((b) => b.providerResponse === "accepted").length / answered.length : null;
      const distanceKm = args.serviceMode !== "online" || args.latitude !== undefined
        ? kmBetween(args.latitude, args.longitude, profile.latitude, profile.longitude)
        : null;

      candidates.push({
        physiotherapist_id: profile._id,
        physiotherapist_user_id: profile.userId,
        display_name: displayName(user),
        // Joy sends it with the physio's name in the chat (https links only)
        ...(uploadedPhoto(user.imageUrl) ? { photo_url: uploadedPhoto(user.imageUrl) } : {}),
        specialties: tags,
        specialty_label: specialtyLabel(profile.specializations),
        languages: profile.languagesSpoken ?? [],
        service_modes: modes,
        amount_kobo: amountKobo,
        covers_area: coversArea,
        ...(distanceKm !== null ? { distance_km: Math.round(distanceKm * 10) / 10 } : {}),
        specialty_score: specialtyScore,
        booked_next_7_days: booked7d,
        recent_referrals: recentReferrals,
        accept_rate: acceptRate,
        rating: (profile.reviewCount ?? 0) >= 3 ? profile.averageRating ?? null : null,
      });
    }
    return { amount_kobo: amountKobo, candidates };
  },
});

type Candidate = {
  physiotherapist_id: string;
  physiotherapist_user_id: Id<"users">;
  display_name?: string;
  photo_url?: string;
  specialties: string[];
  specialty_label?: string;
  languages: string[];
  service_modes: string[];
  amount_kobo: number;
  covers_area: boolean;
  distance_km?: number;
  specialty_score: number;
  booked_next_7_days: number;
  recent_referrals: number;
  accept_rate: number | null;
  rating: number | null;
};

type Ranked = Candidate & { next_slot_start: number; next_slot_end: number };

/** Bigger is better for each band; a new physio with no history is not marked down. */
function bands(c: Ranked, online: boolean): number[] {
  const spare = c.booked_next_7_days <= 2 ? 2 : c.booked_next_7_days <= 6 ? 1 : 0;
  const reliable = c.accept_rate === null ? 2 : c.accept_rate >= 0.8 ? 2 : c.accept_rate >= 0.5 ? 1 : 0;
  const rated = c.rating === null ? 1 : c.rating >= 4.5 ? 1 : 0;
  return [
    c.specialty_score,
    online ? (c.covers_area ? 1 : 0) : 0,
    -Math.floor(c.next_slot_start / (2 * HOUR)),
    spare,
    reliable,
    rated,
  ];
}

export function rankCandidates(list: Ranked[], options: { urgent: boolean; online: boolean }): Ranked[] {
  return [...list].sort((a, b) => {
    if (options.urgent && a.next_slot_start !== b.next_slot_start) return a.next_slot_start - b.next_slot_start;
    const left = bands(a, options.online);
    const right = bands(b, options.online);
    for (let i = 0; i < left.length; i++) {
      if (left[i] !== right[i]) return right[i] - left[i];
    }
    // Share fairly: fewer recent referrals first, then the earlier time
    if (a.recent_referrals !== b.recent_referrals) return a.recent_referrals - b.recent_referrals;
    if (a.next_slot_start !== b.next_slot_start) return a.next_slot_start - b.next_slot_start;
    return String(a.physiotherapist_id).localeCompare(String(b.physiotherapist_id));
  });
}

export async function rankedJoyMatches(
  ctx: ActionCtx,
  args: {
    patientId: string; requiredSpecialties: string[]; serviceMode: "home_visit" | "clinic" | "online";
    durationMinutes?: number; language?: string; city?: string; area?: string;
    latitude?: number; longitude?: number; withinHours: number; urgent: boolean; limit: number;
  },
) {
  const { candidates } = await ctx.runQuery((internal as any).joyMatching.matchCandidates, {
    patientId: args.patientId, requiredSpecialties: args.requiredSpecialties, serviceMode: args.serviceMode,
    durationMinutes: args.durationMinutes, language: args.language, city: args.city, area: args.area,
    latitude: args.latitude, longitude: args.longitude,
  }) as { candidates: Candidate[] };
  // Free times are looked up for the likeliest physios only (specialty, then local)
  const shortlist = [...candidates]
    .sort((a, b) => (b.specialty_score - a.specialty_score) || (Number(b.covers_area) - Number(a.covers_area)) || (a.recent_referrals - b.recent_referrals))
    .slice(0, AVAILABILITY_LOOKUPS);
  const now = Date.now();
  const start = now + NOTICE_MS;
  const end = now + Math.min(Math.max(args.withinHours, 3), 7 * 24) * HOUR;
  const free: Ranked[] = [];
  for (const candidate of shortlist) {
    let slots: Array<{ start: number; end: number }> = [];
    try {
      slots = await ctx.runQuery((api as any).calendar.availability.getAvailableSlots, {
        physiotherapistId: candidate.physiotherapist_user_id, startDate: start, endDate: end,
        sessionDuration: args.durationMinutes,
      });
    } catch {
      continue;
    }
    const next = slots.filter((slot) => slot.start >= start && slot.start < end).sort((a, b) => a.start - b.start)[0];
    if (next) free.push({ ...candidate, next_slot_start: next.start, next_slot_end: next.end });
  }
  const ranked = rankCandidates(free, { urgent: args.urgent, online: args.serviceMode === "online" });
  return ranked.slice(0, Math.min(Math.max(args.limit, 1), 6)).map((c) => ({
    physiotherapist_id: c.physiotherapist_id,
    physiotherapist_user_id: c.physiotherapist_user_id,
    display_name: c.display_name,
    ...(c.photo_url ? { photo_url: c.photo_url } : {}),
    specialties: c.specialties,
    specialty_label: c.specialty_label,
    languages: c.languages,
    service_modes: c.service_modes,
    amount_kobo: c.amount_kobo,
    ...(c.distance_km !== undefined ? { distance_km: c.distance_km } : {}),
    next_slot_start: c.next_slot_start,
    next_slot_end: c.next_slot_end,
    match_reasons: [
      "verified specialty",
      "approved marketplace provider",
      "configured service mode",
      ...(c.covers_area ? ["covers your area"] : []),
      `free within ${args.withinHours} hours`,
    ],
  }));
}
