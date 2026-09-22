import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const TEST_PROVIDER_PREFIX = "joy-test-seed:";
const ALL_SERVICE_MODES = ["home_visit", "clinic", "online"] as const;
const ALL_SERVICE_AREAS = [
  "Abuja", "Jabi", "Wuse 2", "Maitama", "Garki", "Lagos", "Ikeja", "Lekki", "Victoria Island", "Yaba",
];

const STANDARD_AVAILABILITY = {
  monday: { isOpen: true, slots: [{ start: "08:00", end: "18:00" }] },
  tuesday: { isOpen: true, slots: [{ start: "08:00", end: "18:00" }] },
  wednesday: { isOpen: true, slots: [{ start: "08:00", end: "18:00" }] },
  thursday: { isOpen: true, slots: [{ start: "08:00", end: "18:00" }] },
  friday: { isOpen: true, slots: [{ start: "08:00", end: "18:00" }] },
  saturday: { isOpen: true, slots: [{ start: "10:00", end: "14:00" }] },
  sunday: { isOpen: false, slots: [] },
};

type SeedProvider = {
  slug: string;
  firstName: string;
  lastName: string;
  city: "Abuja" | "Lagos";
  location: string;
  latitude: number;
  longitude: number;
  tags: string[];
  specializations: string[];
  languages: string[];
  years: number;
  rateKobo: number;
};

// Deliberately fictional provider records, clearly labelled for non-production
// acceptance testing. They cover every current Joy pathway and an AMBER reviewer.
const PROVIDERS: SeedProvider[] = [
  { slug: "msk-abuja", firstName: "Test", lastName: "Ada Okafor", city: "Abuja", location: "Jabi, Abuja", latitude: 9.0765, longitude: 7.3986, tags: ["msk"], specializations: ["Musculoskeletal Physiotherapy", "Back and Neck Pain"], languages: ["English", "Hausa"], years: 8, rateKobo: 2_500_000 },
  { slug: "msk-lagos", firstName: "Test", lastName: "Bola Adeyemi", city: "Lagos", location: "Ikeja, Lagos", latitude: 6.6018, longitude: 3.3515, tags: ["msk"], specializations: ["Musculoskeletal Physiotherapy", "Manual Therapy"], languages: ["English", "Yoruba"], years: 7, rateKobo: 2_700_000 },
  { slug: "sports", firstName: "Test", lastName: "Chidi Nwosu", city: "Lagos", location: "Lekki, Lagos", latitude: 6.4474, longitude: 3.4723, tags: ["msk"], specializations: ["Sports Physiotherapy", "Musculoskeletal Rehabilitation"], languages: ["English", "Igbo"], years: 9, rateKobo: 3_000_000 },
  { slug: "orthopaedic", firstName: "Test", lastName: "Damilola Yusuf", city: "Abuja", location: "Wuse 2, Abuja", latitude: 9.082, longitude: 7.425, tags: ["msk", "post_surgical"], specializations: ["Orthopaedic Physiotherapy", "Post-operative Rehabilitation"], languages: ["English", "Hausa"], years: 10, rateKobo: 3_200_000 },
  { slug: "neuro", firstName: "Test", lastName: "Efe Ojo", city: "Lagos", location: "Yaba, Lagos", latitude: 6.5158, longitude: 3.3733, tags: ["neuro"], specializations: ["Neurological Rehabilitation", "Stroke Rehabilitation"], languages: ["English", "Yoruba"], years: 11, rateKobo: 3_400_000 },
  { slug: "paediatric", firstName: "Test", lastName: "Fatima Bello", city: "Abuja", location: "Maitama, Abuja", latitude: 9.076, longitude: 7.486, tags: ["paediatric"], specializations: ["Paediatric Physiotherapy", "Developmental Rehabilitation"], languages: ["English", "Hausa"], years: 8, rateKobo: 3_000_000 },
  { slug: "cardiorespiratory", firstName: "Test", lastName: "Grace Eze", city: "Lagos", location: "Victoria Island, Lagos", latitude: 6.4281, longitude: 3.4219, tags: ["cardiorespiratory"], specializations: ["Cardiorespiratory Physiotherapy", "Pulmonary Rehabilitation"], languages: ["English", "Igbo"], years: 12, rateKobo: 3_500_000 },
  { slug: "womens-health", firstName: "Test", lastName: "Hauwa Ibrahim", city: "Abuja", location: "Garki, Abuja", latitude: 9.043, longitude: 7.49, tags: ["womens_health"], specializations: ["Women's Health Physiotherapy", "Pelvic Health"], languages: ["English", "Hausa"], years: 9, rateKobo: 3_300_000 },
  { slug: "post-surgical", firstName: "Test", lastName: "Ifeanyi Obi", city: "Lagos", location: "Ikeja, Lagos", latitude: 6.588, longitude: 3.348, tags: ["post_surgical"], specializations: ["Post-surgical Rehabilitation", "Orthopaedic Physiotherapy"], languages: ["English", "Igbo"], years: 10, rateKobo: 3_250_000 },
  { slug: "geriatric", firstName: "Test", lastName: "Jumoke Akinola", city: "Abuja", location: "Jabi, Abuja", latitude: 9.065, longitude: 7.405, tags: ["msk"], specializations: ["Geriatric Physiotherapy", "Fall Prevention"], languages: ["English", "Yoruba"], years: 14, rateKobo: 2_900_000 },
  { slug: "amber-reviewer", firstName: "Test", lastName: "Kemi Mensah", city: "Abuja", location: "Maitama, Abuja", latitude: 9.077, longitude: 7.489, tags: ["msk", "AMBER_REVIEWER"], specializations: ["Senior Musculoskeletal Physiotherapy", "Clinical Triage Review"], languages: ["English", "Yoruba", "Igbo", "Hausa"], years: 16, rateKobo: 3_800_000 },
];

function emailFor(provider: SeedProvider) {
  return `joy.test.${provider.slug}@example.invalid`;
}

function phoneFor(index: number) {
  return `+234700000${String(index + 101).padStart(3, "0")}`;
}

/**
 * Seeds only visibly fictional Joy acceptance-test providers. It is idempotent
 * by a reserved Clerk id and cannot change ordinary provider records.
 */
export const seed = mutation({
  args: { secret: v.string(), dryRun: v.boolean() },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.JOY_TEST_PROVIDER_SEED_SECRET;
    if (!expectedSecret || args.secret !== expectedSecret) {
      throw new Error("Unauthorized Joy test-provider seed operation");
    }

    const now = Date.now();
    const created: string[] = [];
    const updated: string[] = [];

    for (const [index, provider] of PROVIDERS.entries()) {
      const clerkId = `${TEST_PROVIDER_PREFIX}${provider.slug}`;
      let user = await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId)).unique();
      let userId: Id<"users">;

      if (!user) {
        if (!args.dryRun) {
          userId = await ctx.db.insert("users", {
            clerkId,
            email: emailFor(provider),
            firstName: provider.firstName,
            lastName: provider.lastName,
            phoneNumber: phoneFor(index),
            role: "physiotherapist",
            onboarded: true,
            hasCompletedOnboarding: true,
            status: "active",
            preferences: { language: "en", timezone: "Africa/Lagos" },
          });
        } else {
          userId = `dry-run-${provider.slug}` as Id<"users">;
        }
        created.push(provider.slug);
      } else {
        userId = user._id;
        updated.push(provider.slug);
      }

      if (args.dryRun) continue;

      const profile = await ctx.db.query("physiotherapistProfiles")
        .withIndex("by_user_id", (q) => q.eq("userId", userId))
        .unique();
      const profileData = {
        userId,
        specializations: provider.specializations,
        bio: `Fictional Joy acceptance-test provider for ${provider.specializations.join(", ")}. Do not use for real patient care.`,
        licenseNumber: `JOY-TEST-${provider.slug.toUpperCase()}`,
        certificationBoard: "TEST DATA ONLY",
        certificationYear: 2020,
        licenseExpiryDate: "2099-12-31",
        yearsOfExperience: provider.years,
        availabilitySchedule: STANDARD_AVAILABILITY,
        languagesSpoken: provider.languages,
        gender: "prefer_not_to_say" as const,
        videoPlatformPreference: "stream" as const,
        isAvailableOnMarketplace: true,
        hourlyRate: provider.rateKobo,
        initialConsultRate: provider.rateKobo,
        location: provider.location,
        latitude: provider.latitude,
        longitude: provider.longitude,
        offersOnlineSessions: true,
        offersInPersonSessions: true,
        joySpecialtyTags: provider.tags,
        joyServiceModes: [...ALL_SERVICE_MODES],
        joyServiceAreas: [...ALL_SERVICE_AREAS],
      };

      const profileId = profile
        ? (await ctx.db.patch(profile._id, profileData), profile._id)
        : await ctx.db.insert("physiotherapistProfiles", profileData);
      await ctx.db.patch(userId, { physiotherapistProfileId: profileId });

      const approval = await ctx.db.query("accountApprovalStatus")
        .withIndex("by_user_id", (q) => q.eq("userId", userId))
        .unique();
      if (approval) {
        await ctx.db.patch(approval._id, { status: "approved", reviewedAt: now, comments: "Joy fictional acceptance-test provider" });
      } else {
        await ctx.db.insert("accountApprovalStatus", {
          userId,
          status: "approved",
          submittedAt: now,
          reviewedAt: now,
          comments: "Joy fictional acceptance-test provider",
        });
      }
    }

    return {
      dryRun: args.dryRun,
      total: PROVIDERS.length,
      created,
      updated,
      coveredTags: [...new Set(PROVIDERS.flatMap((provider) => provider.tags))],
      serviceModes: ALL_SERVICE_MODES,
      serviceAreas: ALL_SERVICE_AREAS,
    };
  },
});
