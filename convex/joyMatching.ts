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
 * Fixed after the owner's test (9 Nov 2026):
 * - Joy asks for condition areas ("msk") but profiles carry tags ("MSK_GENERAL"), so specialty never
 *   counted; areas now map to tags, and a physio with no fitting specialty is left out whenever
 *   one who fits is free (no paediatric-and-neuro physio for back pain).
 * - A physio with no name is never offered.
 * - "Offers online" falls back to the website's video setting when the Joy field was never saved.
 * - Each physio shown gets a different real free time, so the list doesn't read "Today, 5:20 PM"
 *   four times; the patient's chosen day (notBefore) and female/male preference are honoured.
 *
 * The old findMatches (joyIntegration.ts) still answers callers that don't send a window.
 */
import { v } from "convex/values";
import { internalQuery, query, type ActionCtx, type QueryCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { ensureUserRole } from "./auth";
import { computePhysioSetup, servesRehabifyNetwork } from "./physioSetup";
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

// The condition areas Joy sends (app/models/types.py ConditionArea) and the profile tags that fit them
const AREA_TAGS: Record<string, string[]> = {
  msk: ["MSK_GENERAL", "MSK_ORTHOPAEDIC", "MSK_SPORTS"],
  post_surgical: ["MSK_ORTHOPAEDIC", "MSK_GENERAL", "MSK_SPORTS"],
  neuro: ["NEURO_REHAB"],
  paediatric: ["PAEDIATRIC_PHYSIO"],
  cardiorespiratory: ["CARDIORESPIRATORY"],
  womens_health: ["WOMENS_HEALTH"],
};

/**
 * How well a physio's specialties fit what Joy asked for, 0 to 1. Each area counts if any of its
 * tags is on the profile (an exact tag also works). A physio who lists no specialty at all is
 * treated as a generalist (half a point); one whose specialties are all elsewhere gets 0.
 */
export function specialtyFit(required: string[], tags: string[]): number {
  const areas = [...new Set(required.map((item) => item.trim()).filter(Boolean))];
  if (!areas.length) return 0;
  let total = 0;
  for (const area of areas) {
    const wanted = AREA_TAGS[area.toLowerCase()] ?? [area];
    total += wanted.some((tag) => tags.includes(tag)) ? 1 : tags.length === 0 ? 0.5 : 0;
  }
  return total / areas.length;
}

/** Joy's service modes, or the website's own video / home-visit settings when they were never saved. */
export function joyModes(profile: { joyServiceModes?: string[]; offersOnlineSessions?: boolean; offersInPersonSessions?: boolean }): string[] {
  if (profile.joyServiceModes?.length) return profile.joyServiceModes;
  return [
    ...(profile.offersOnlineSessions !== false ? ["online"] : []),
    ...(profile.offersInPersonSessions ? ["home_visit"] : []),
  ];
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
    physioSex: v.optional(v.union(v.literal("female"), v.literal("male"))),
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
    // Listed unless switched off: the marketplace treats "never set" as listed, and so does Joy
    // (the index on true alone missed every physio who never touched the switch)
    const profiles = (await ctx.db.query("physiotherapistProfiles").collect())
      .filter((profile) => profile.isAvailableOnMarketplace !== false);
    const candidates = [];
    for (const profile of profiles) {
      if (!profile.availabilitySchedule) continue;
      const modes = joyModes(profile);
      if (!modes.includes(args.serviceMode)) continue;
      if (args.physioSex && profile.gender !== args.physioSex) continue;
      const coversArea = Boolean(zoneId && (profile.coveredZoneIds ?? []).includes(zoneId));
      if (args.serviceMode === "home_visit" && !coversArea) continue;
      if (!speaksLanguage(profile.languagesSpoken, args.language)) continue;
      if (!(await isJoyProviderEligible(ctx, profile))) continue;
      const user = await ctx.db.get(profile.userId);
      const name = user ? displayName(user) : undefined;
      if (!user || !name) continue;  // never offer "Physiotherapist" with no name

      const tags = controlledTags(profile);
      const specialtyScore = specialtyFit(args.requiredSpecialties, tags);
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
        display_name: name,
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

type Slot = { start: number; end: number };
type Ranked = Candidate & { next_slot_start: number; next_slot_end: number; slots: Slot[] };

/**
 * Give each physio shown a different free time where they have one: their earliest time that no
 * physio above them already shows. Every time is a real free slot of that physio's own calendar;
 * four identical "Today, 5:20 PM" lines just looked automated (owner's test, 9 Nov 2026).
 */
export function spreadTimes<T extends { slots: Slot[]; next_slot_start: number; next_slot_end: number }>(list: T[]): T[] {
  const shown = new Set<number>();
  return list.map((item) => {
    const pick = item.slots.find((slot) => !shown.has(slot.start)) ?? item.slots[0];
    if (!pick) return item;
    shown.add(pick.start);
    return { ...item, next_slot_start: pick.start, next_slot_end: pick.end };
  });
}

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
    /** The patient's chosen day: nothing earlier (ms since epoch). */
    notBefore?: number;
    physioSex?: "female" | "male";
  },
) {
  const { candidates } = await ctx.runQuery((internal as any).joyMatching.matchCandidates, {
    patientId: args.patientId, requiredSpecialties: args.requiredSpecialties, serviceMode: args.serviceMode,
    durationMinutes: args.durationMinutes, language: args.language, city: args.city, area: args.area,
    latitude: args.latitude, longitude: args.longitude,
    ...(args.physioSex ? { physioSex: args.physioSex } : {}),
  }) as { candidates: Candidate[] };
  // Free times are looked up for the likeliest physios only (specialty, then local)
  const shortlist = [...candidates]
    .sort((a, b) => (b.specialty_score - a.specialty_score) || (Number(b.covers_area) - Number(a.covers_area)) || (a.recent_referrals - b.recent_referrals))
    .slice(0, AVAILABILITY_LOOKUPS);
  const now = Date.now();
  const start = Math.max(now + NOTICE_MS, typeof args.notBefore === "number" ? args.notBefore : 0);
  const end = now + Math.min(Math.max(args.withinHours, 3), 8 * 24) * HOUR;
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
    const open = slots.filter((slot) => slot.start >= start && slot.start < end).sort((a, b) => a.start - b.start);
    if (open.length) free.push({ ...candidate, next_slot_start: open[0].start, next_slot_end: open[0].end, slots: open.slice(0, 12) });
  }
  // Someone whose specialties fit is free: nobody whose specialties are all elsewhere is offered
  const fitting = free.some((c) => c.specialty_score > 0) ? free.filter((c) => c.specialty_score > 0) : free;
  const ranked = rankCandidates(fitting, { urgent: args.urgent, online: args.serviceMode === "online" });
  return spreadTimes(ranked.slice(0, Math.min(Math.max(args.limit, 1), 6))).map((c) => ({
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

// ── Can Joy offer me? ───────────────────────────────────────────────────────────────────────
// Every filter above, as a checklist the physio (and admin) can read, so nobody is left out of
// Joy's matches without knowing why (owner's test, 9 Nov 2026).

const SETTINGS = "/dashboard/physiotherapist/settings";

export type JoyReadinessCheck = {
  id: string;
  label: string;
  done: boolean;
  /** Required checks keep a physio out of Joy's matches until done; the rest improve matches. */
  required: boolean;
  fix?: string;
  href?: string;
};

async function joyReadiness(ctx: QueryCtx, user: Doc<"users">, profile: Doc<"physiotherapistProfiles"> | null) {
  const approval = await ctx.db.query("accountApprovalStatus").withIndex("by_user_id", (q) => q.eq("userId", user._id)).first();
  const setup = await computePhysioSetup(ctx, user, profile);
  const missingSetup = setup.items.filter((item) => item.required && !item.done);
  const eligible = profile ? await isJoyProviderEligible(ctx, profile) : false;
  const tags = profile ? controlledTags(profile) : [];
  const checks: JoyReadinessCheck[] = [
    {
      id: "approved", required: true, done: approval?.status === "approved",
      label: "Rehabify has approved your account",
      fix: "Upload your licence and ID; the Rehabify team reviews them.", href: `${SETTINGS}/documents`,
    },
    {
      id: "setup", required: true, done: missingSetup.length === 0,
      label: "Your setup is complete",
      fix: missingSetup.length ? `Still to do: ${missingSetup.map((item) => item.title).join(", ")}.` : undefined,
      href: missingSetup[0]?.href,
    },
    {
      id: "network", required: true, done: Boolean(profile && servesRehabifyNetwork(profile)),
      label: "You take Rehabify Care patients",
      fix: "Choose \"Rehabify\" or \"Both\" in How you work. Clinic members are matched through their clinic.",
      href: `${SETTINGS}/practice`,
    },
    {
      id: "eligible", required: true, done: eligible,
      label: "You've accepted the network terms and signed your agreement",
      fix: "Accept the network terms and sign the physiotherapist agreement.", href: `${SETTINGS}/network-terms`,
    },
    {
      id: "listed", required: true, done: Boolean(profile) && profile?.isAvailableOnMarketplace !== false,
      label: "Your profile is switched on for bookings",
      fix: "Turn on \"Show my profile\" in Marketplace settings.", href: `${SETTINGS}/marketplace`,
    },
    {
      id: "name", required: true, done: Boolean(displayName(user)),
      label: "Your first and last name are on your profile",
      fix: "Add your name in Profile settings.", href: `${SETTINGS}/profile`,
    },
    {
      id: "online", required: true, done: Boolean(profile && joyModes(profile).includes("online")),
      label: "You offer video consultations",
      fix: "Joy's first booking is a 20-minute video call. Turn on video sessions in Marketplace settings.",
      href: `${SETTINGS}/marketplace`,
    },
    {
      id: "hours", required: true, done: Boolean(profile?.availabilitySchedule),
      label: "Your weekly hours are saved",
      fix: "Set the hours you can take patients. Joy offers times at least 2 hours ahead, so keep some hours open in the next few days.",
      href: `${SETTINGS}/availability`,
    },
    {
      id: "specialties", required: false, done: tags.length > 0,
      label: "Your specialties are listed",
      fix: "Joy offers patients the physios whose specialties fit their problem first. Add yours in Marketplace settings.",
      href: `${SETTINGS}/marketplace`,
    },
    {
      id: "gender", required: false, done: profile?.gender === "female" || profile?.gender === "male",
      label: "Your sex is on your profile",
      fix: "Some patients ask for a female or male physiotherapist. Add yours in Profile settings.",
      href: `${SETTINGS}/profile`,
    },
    {
      id: "photo", required: false, done: Boolean(uploadedPhoto(user.imageUrl)),
      label: "You have a profile photo",
      fix: "Joy sends your photo with your name. Upload one in Profile settings.", href: `${SETTINGS}/profile`,
    },
    {
      id: "languages", required: false, done: Boolean(profile?.languagesSpoken?.length),
      label: "Your languages are listed",
      fix: "Patients who chat in Yoruba, Igbo or Hausa are only matched with physios who speak it.",
      href: `${SETTINGS}/profile`,
    },
  ];
  const ready = checks.every((check) => !check.required || check.done);
  return { ready, checks };
}

/** The signed-in physio: can Joy offer them to patients, and what to do if not. */
export const myJoyMatchReadiness = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject)).first();
    if (!user || user.role !== "physiotherapist") return null;
    const profile = await ctx.db.query("physiotherapistProfiles").withIndex("by_user_id", (q) => q.eq("userId", user._id)).first();
    return await joyReadiness(ctx, user, profile);
  },
});

/** Admins: the same checklist for any physio ("why isn't this physio in Joy's matches?"). */
export const adminJoyMatchReadiness = query({
  args: { physioUserId: v.id("users") },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const user = await ctx.db.get(args.physioUserId);
    if (!user || user.role !== "physiotherapist") return null;
    const profile = await ctx.db.query("physiotherapistProfiles").withIndex("by_user_id", (q) => q.eq("userId", user._id)).first();
    return await joyReadiness(ctx, user, profile);
  },
});
