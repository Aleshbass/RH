/**
 * Physiotherapist setup checklist.
 *
 * Onboarding only asks for what an admin needs to verify someone (identity, licence, where they
 * practise). Everything else is finished from the dashboard after sign-up, and a physio only
 * appears on the marketplace / accepts bookings once the required items here are done.
 * The dashboard checklist, the "finish setting up" popup and the marketplace gate all use this
 * file so they can never disagree.
 */
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getService, type BookableServiceId } from "../lib/rehabify-services";
import { NETWORK_TERMS_VERSION } from "../lib/rehabify-network-terms";
import { loadPricingSettings } from "./helpers/rehabifyPricing";

export type PhysioSetupItemId = "profile" | "availability" | "coverage" | "network_terms" | "payout" | "documents";

export type PhysioSetupItem = {
  id: PhysioSetupItemId;
  title: string;
  description: string;
  href: string;
  done: boolean;
  /** Required items block marketplace listing and bookings until done. */
  required: boolean;
};

/** Documents an admin needs before review (one of the licence proofs, plus ID). */
export const ESSENTIAL_LICENCE_DOCUMENTS = ["mrtbLicense", "degreeCertificate"] as const;
/** Documents still owed after approval when they weren't uploaded during onboarding. */
export const FOLLOW_UP_DOCUMENTS = ["degreeCertificate", "passportPhoto"] as const;

const MIN_BIO_LENGTH = 40;
const SETTINGS = "/dashboard/physiotherapist/settings";

/** True if the stored schedule (old onboarding format or the newer weekly format) has an open day. */
export function hasAvailability(schedule: unknown): boolean {
  if (!schedule || typeof schedule !== "object") return false;
  const value = schedule as Record<string, unknown>;

  if (Array.isArray(value.weeklyHours)) {
    return value.weeklyHours.some((day) => {
      const d = day as { isAvailable?: boolean; slots?: unknown[] };
      return Boolean(d?.isAvailable) && Array.isArray(d.slots) && d.slots.length > 0;
    });
  }

  // Onboarding format: { monday: { isOpen, slots }, ... }
  return Object.values(value).some((day) => {
    const d = day as { isOpen?: boolean; slots?: unknown[] } | null;
    return Boolean(d?.isOpen) && Array.isArray(d?.slots) && d!.slots!.length > 0;
  });
}

/** Offers video sessions, or home visits in at least one travel zone. */
function hasCoverage(profile: Doc<"physiotherapistProfiles"> | null) {
  if (!profile) return false;
  if (profile.offersOnlineSessions !== false) return true;
  return Boolean(profile.offersInPersonSessions) && (profile.coveredZoneIds?.length ?? 0) > 0;
}

/** Accepted the current version of the Rehabify network terms. */
export function hasAcceptedNetworkTerms(profile: Pick<Doc<"physiotherapistProfiles">, "networkTerms"> | null) {
  return profile?.networkTerms?.version === NETWORK_TERMS_VERSION;
}

/** Network terms block bookings only once an admin sets an enforcement date that has passed. */
async function networkTermsRequired(ctx: QueryCtx): Promise<boolean> {
  const { networkTermsEnforcedAt } = await loadPricingSettings(ctx);
  return typeof networkTermsEnforcedAt === "number" && networkTermsEnforcedAt <= Date.now();
}

export async function computePhysioSetup(
  ctx: QueryCtx,
  user: Doc<"users">,
  profile: Doc<"physiotherapistProfiles"> | null
): Promise<{ items: PhysioSetupItem[]; requiredRemaining: number; isComplete: boolean }> {
  const documents = profile
    ? await ctx.db
        .query("physiotherapistDocuments")
        .withIndex("by_physiotherapist_id", (q) => q.eq("physiotherapistId", profile._id))
        .collect()
    : [];
  const uploaded = new Set(documents.map((doc) => doc.documentType));

  const bankAccount = await ctx.db
    .query("physiotherapistBankAccounts")
    .withIndex("by_physiotherapist_id", (q) => q.eq("physiotherapistId", user._id))
    .first();

  const bioLength = profile?.bio?.trim().length ?? 0;
  const items: PhysioSetupItem[] = [
    {
      id: "profile",
      title: "Add a photo and short bio",
      description: "Patients choose physios they can picture. A photo and a few lines about how you work.",
      href: `${SETTINGS}/profile`,
      done: Boolean(user.imageUrl) && bioLength >= MIN_BIO_LENGTH,
      required: true,
    },
    {
      id: "availability",
      title: "Set your working hours",
      description: "Patients can only book the hours you open.",
      href: `${SETTINGS}/availability`,
      done: hasAvailability(profile?.availabilitySchedule),
      required: true,
    },
    {
      id: "payout",
      title: "Add a payout account",
      description: "Where we send your earnings from sessions.",
      href: `${SETTINGS}/payout`,
      done: Boolean(bankAccount),
      required: true,
    },
    {
      id: "documents",
      title: "Upload remaining documents",
      description: "Your degree certificate and a passport photograph.",
      href: `${SETTINGS}/documents`,
      done: FOLLOW_UP_DOCUMENTS.every((type) => uploaded.has(type)),
      required: true,
    },
    {
      id: "network_terms",
      title: "Accept the Rehabify network terms",
      description: "Standard Rehabify prices and your payout for each service.",
      href: `${SETTINGS}/network-terms`,
      done: hasAcceptedNetworkTerms(profile),
      required: await networkTermsRequired(ctx),
    },
    {
      id: "coverage",
      title: "Choose your services and areas",
      description: "Video sessions, home visits, and the areas you travel to.",
      href: `${SETTINGS}/marketplace`,
      done: hasCoverage(profile),
      required: false,
    },
  ];

  const requiredRemaining = items.filter((item) => item.required && !item.done).length;
  return { items, requiredRemaining, isComplete: requiredRemaining === 0 };
}

/**
 * Whether patients can find and book this physio: approved by Rehabify, listed, and the
 * required setup finished. Used by marketplace search, the public profile and booking.
 */
export async function isPhysioBookable(ctx: QueryCtx, physioUserId: Id<"users">): Promise<boolean> {
  const user = await ctx.db.get(physioUserId);
  if (!user || user.role !== "physiotherapist" || user.status === "suspended" || user.status === "terminated") {
    return false;
  }

  const approval = await ctx.db
    .query("accountApprovalStatus")
    .withIndex("by_user_id", (q) => q.eq("userId", physioUserId))
    .first();
  if (approval?.status !== "approved") return false;

  const profile = await ctx.db
    .query("physiotherapistProfiles")
    .withIndex("by_user_id", (q) => q.eq("userId", physioUserId))
    .first();
  if (!profile || profile.isAvailableOnMarketplace === false) return false;

  const setup = await computePhysioSetup(ctx, user, profile);
  return setup.isComplete;
}

/**
 * Whether a physio can take a Rehabify patient for this service: bookable, part of the
 * Rehabify network (clinic members work under their clinic's own terms and prices), offers
 * the service's mode, covers the travel zone for home visits and, for Rehabify Access, has
 * opted in with a minimum payout the assisted tariff meets.
 */
export async function isPhysioNetworkEligible(
  ctx: QueryCtx,
  physioUserId: Id<"users">,
  options: {
    serviceId?: BookableServiceId;
    zoneId?: Id<"travelZones"> | null;
    access?: { payoutKobo: number };
  } = {}
): Promise<boolean> {
  if (!(await isPhysioBookable(ctx, physioUserId))) return false;
  const profile = await ctx.db
    .query("physiotherapistProfiles")
    .withIndex("by_user_id", (q) => q.eq("userId", physioUserId))
    .first();
  if (!profile || !servesRehabifyNetwork(profile)) return false;
  if (!options.serviceId) return true;
  const service = getService(options.serviceId);
  if (!service) return false;
  if (!offersServiceMode(profile, service.mode, options.zoneId ?? null)) return false;
  if (options.access && !meetsAccessMinimum(profile, options.serviceId, options.access.payoutKobo)) return false;
  return true;
}

/** Clinic members are excluded: their clinic sets prices and terms for their patients. */
export function servesRehabifyNetwork(profile: Pick<Doc<"physiotherapistProfiles">, "clinicId">): boolean {
  return !profile.clinicId;
}

export function offersServiceMode(
  profile: Pick<Doc<"physiotherapistProfiles">, "offersOnlineSessions" | "offersInPersonSessions" | "coveredZoneIds">,
  mode: "virtual" | "home",
  zoneId: Id<"travelZones"> | null
): boolean {
  if (mode === "virtual") return profile.offersOnlineSessions !== false;
  if (!profile.offersInPersonSessions) return false;
  return zoneId !== null && (profile.coveredZoneIds ?? []).includes(zoneId);
}

/** Opted in to Rehabify Access, and the assisted payout meets their minimum for the service. */
export function meetsAccessMinimum(
  profile: Pick<Doc<"physiotherapistProfiles">, "networkTerms">,
  serviceId: string,
  payoutKobo: number
): boolean {
  const terms = profile.networkTerms;
  if (!terms?.accessOptIn) return false;
  const minimum = terms.accessMinimumPayouts?.find((row) => row.serviceId === serviceId)?.minimumPayoutKobo ?? 0;
  return minimum <= payoutKobo;
}

/**
 * What the onboarding wizard needs to resume an application: saved answers, which
 * documents are already uploaded, and the review status. Null when signed out.
 */
export const getMyOnboardingDraft = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return null;

    const profile =
      user.role === "physiotherapist" && user.physiotherapistProfileId
        ? await ctx.db.get(user.physiotherapistProfileId)
        : null;
    const documents = profile
      ? await ctx.db
          .query("physiotherapistDocuments")
          .withIndex("by_physiotherapist_id", (q) => q.eq("physiotherapistId", profile._id))
          .collect()
      : [];
    const approval = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();

    return {
      role: user.role ?? null,
      onboarded: user.onboarded,
      approvalStatus: approval?.status ?? null,
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      email: user.email ?? "",
      phoneNumber: user.phoneNumber ?? "",
      profileId: profile?._id ?? null,
      gender: profile?.gender ?? null,
      licenseNumber: profile?.licenseNumber ?? "",
      certificationBoard: profile?.certificationBoard ?? "",
      licenseExpiryDate: profile?.licenseExpiryDate ?? "",
      yearsOfExperience: profile?.yearsOfExperience ?? null,
      location: profile?.location ?? "",
      latitude: profile?.latitude ?? null,
      longitude: profile?.longitude ?? null,
      specializations: profile?.specializations ?? [],
      referralSource: profile?.referralSource ?? "",
      uploadedDocumentTypes: [...new Set(documents.map((doc) => doc.documentType))],
    };
  },
});

/** The signed-in physiotherapist's checklist (null for anyone else). */
export const getMySetupStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user || user.role !== "physiotherapist") return null;

    const profile = user.physiotherapistProfileId ? await ctx.db.get(user.physiotherapistProfileId) : null;
    const approval = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();

    const setup = await computePhysioSetup(ctx, user, profile);
    return {
      ...setup,
      approvalStatus: approval?.status ?? null,
      /** Reason given by the admin when an application is declined. */
      approvalComments: approval?.status === "declined" ? approval.comments ?? null : null,
      isListed: profile?.isAvailableOnMarketplace !== false,
      /** Live for patients = approved + listed + required setup done. */
      isBookable:
        approval?.status === "approved" && profile?.isAvailableOnMarketplace !== false && setup.isComplete,
    };
  },
});

// Profile views live in physioProfileViews, not on physiotherapistProfiles: marketplace search
// reads every profile, so a counter there re-ran every open search on each view.

/** All-time views: the old counter left on the profile plus the new table's count. */
export async function profileViewCount(
  ctx: QueryCtx,
  physioUserId: Id<"users">,
  legacyCount?: number
): Promise<number> {
  const row = await ctx.db
    .query("physioProfileViews")
    .withIndex("by_user_id", (q) => q.eq("userId", physioUserId))
    .first();
  return (legacyCount ?? 0) + (row?.count ?? 0);
}

export async function recordProfileView(ctx: MutationCtx, physioUserId: Id<"users">): Promise<void> {
  const row = await ctx.db
    .query("physioProfileViews")
    .withIndex("by_user_id", (q) => q.eq("userId", physioUserId))
    .first();
  if (row) await ctx.db.patch(row._id, { count: row.count + 1 });
  else await ctx.db.insert("physioProfileViews", { userId: physioUserId, count: 1 });
}
