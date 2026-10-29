/**
 * Physiotherapist setup checklist.
 *
 * Onboarding only asks for what an admin needs to verify someone (identity, licence, where they
 * practise). Everything else is finished from the dashboard after sign-up, and a physio only
 * appears on the marketplace / accepts bookings once the required items here are done.
 * The dashboard checklist, the "finish setting up" popup and the marketplace gate all use this
 * file so they can never disagree.
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getService, type BookableServiceId } from "../lib/rehabify-services";
import { NETWORK_TERMS_VERSION } from "../lib/rehabify-network-terms";
import { loadPricingSettings } from "./helpers/rehabifyPricing";
import { adminDisplayName, requireAdmin } from "./helpers/partnerAccess";
import { currentUser, isApproved } from "./helpers/careAccess";
import { IMAGEKIT_URL, imagekitUploadAuth, signedImagekitUrl } from "./helpers/imagekit";
import { physioAgreementsStatus } from "./agreements";

export type PhysioSetupItemId = "profile" | "availability" | "coverage" | "network_terms" | "agreement" | "payout" | "documents";

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
  // Independent physios aren't listed, so only verification and getting paid are required
  const independent = isIndependentPractice(profile);
  // Clinic clinicians were vetted by their clinic, which also bills and pays: only their profile
  // and working hours matter (the clinic's patients book those hours)
  const clinicMember = Boolean(profile?.clinicId);
  const items: PhysioSetupItem[] = [
    {
      id: "profile",
      title: "Add a photo and short bio",
      description: independent || clinicMember
        ? "Your patients see this in their app. A photo and a few lines about how you work."
        : "Patients choose physios they can picture. A photo and a few lines about how you work.",
      href: `${SETTINGS}/profile`,
      done: Boolean(user.imageUrl) && bioLength >= MIN_BIO_LENGTH,
      required: !independent && !clinicMember,
    },
    {
      id: "availability",
      title: "Set your working hours",
      description: "Patients can only book the hours you open.",
      href: `${SETTINGS}/availability`,
      done: hasAvailability(profile?.availabilitySchedule),
      required: !independent,
    },
  ];
  if (clinicMember) {
    const requiredRemaining = items.filter((item) => item.required && !item.done).length;
    return { items, requiredRemaining, isComplete: requiredRemaining === 0 };
  }
  items.push(
    {
      id: "payout",
      title: "Add a payout account",
      description: independent ? "Where we send what your patients pay on your invoices." : "Where we send your earnings from sessions.",
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
    }
  );
  if (!independent) {
    items.push(
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
      }
    );
  }
  // Required once an admin sets the date (Agreements page); until then a reminder only
  if (profile && !profile.clinicId) {
    const agreements = await physioAgreementsStatus(ctx, profile);
    items.push({
      id: "agreement",
      title:
        agreements.ids.length > 1
          ? "Sign your agreements"
          : independent
            ? "Accept the platform agreement"
            : "Sign your contractor agreement",
      description: independent
        ? "How you use Rehabify with your own patients. Free, and your fees stay yours."
        : "How you work with Rehabify: bookings, payouts and patient care.",
      href: `${SETTINGS}/agreements`,
      done: agreements.done,
      required: agreements.required,
    });
  }

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

/** Only sees their own private patients: never listed or matched with Rehabify Care patients. */
export function isIndependentPractice(profile: Pick<Doc<"physiotherapistProfiles">, "clinicId" | "practiceMode"> | null) {
  return Boolean(profile && !profile.clinicId && profile.practiceMode === "independent");
}

/**
 * Takes Rehabify patients (search, Joy, partner and admin matching, Rehabify Access). Clinic
 * members are excluded (their clinic sets prices and terms), and so are independent physios.
 */
export function servesRehabifyNetwork(profile: Pick<Doc<"physiotherapistProfiles">, "clinicId" | "practiceMode">): boolean {
  return !profile.clinicId && profile.practiceMode !== "independent";
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
      practiceMode: profile?.practiceMode ?? null,
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
      /**
       * Which patients they see (clinic members work under their clinic, shown as "network").
       * null: applied before they were asked, so the dashboard asks them; treated as network meanwhile.
       */
      practiceMode: !profile || profile.clinicId ? ("network" as const) : (profile.practiceMode ?? null),
      isClinicMember: Boolean(profile?.clinicId),
      /** Live for patients = approved + on the network + listed + required setup done. */
      isBookable:
        approval?.status === "approved" &&
        Boolean(profile && servesRehabifyNetwork(profile)) &&
        profile?.isAvailableOnMarketplace !== false &&
        setup.isComplete,
    };
  },
});

/** Rehabify physio or independent physio: one or the other ("both" was offered before, and stays valid on old profiles). */
const practiceChoice = v.union(v.literal("network"), v.literal("independent"));

/**
 * Rehabify physio or independent physio. Patients they already see stay with them; switching to
 * independent also makes those patients their own (billed by the physio, not Rehabify), and no
 * new Rehabify Care patients are matched.
 */
export const setMyPracticeMode = mutation({
  args: { practiceMode: practiceChoice },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Please sign in again.");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user || user.role !== "physiotherapist") throw new ConvexError("Only physiotherapists can change this.");
    const profile = user.physiotherapistProfileId ? await ctx.db.get(user.physiotherapistProfileId) : null;
    if (!profile) throw new ConvexError("Finish your application first.");
    if (profile.clinicId) throw new ConvexError("You work with a clinic, so your clinic decides how you see patients.");
    await ctx.db.patch(profile._id, {
      practiceMode: args.practiceMode,
      // Listed again when taking Rehabify Care patients (search still waits for approval and setup)
      isAvailableOnMarketplace: args.practiceMode !== "independent",
    });
    return { practiceMode: args.practiceMode };
  },
});

/**
 * Admin: records whether a physio is a Rehabify physio or an independent physio (for older accounts
 * that never answered, or a correction). Same effect as the physio changing it themselves.
 */
export const adminSetPracticeMode = mutation({
  args: {
    physiotherapistId: v.id("users"),
    practiceMode: practiceChoice,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(args.physiotherapistId);
    if (!user || user.role !== "physiotherapist") throw new ConvexError("This account isn't a physiotherapist.");
    const profile = user.physiotherapistProfileId
      ? await ctx.db.get(user.physiotherapistProfileId)
      : await ctx.db
          .query("physiotherapistProfiles")
          .withIndex("by_user_id", (q) => q.eq("userId", user._id))
          .first();
    if (!profile) throw new ConvexError("They haven't started their application yet.");
    if (profile.clinicId) throw new ConvexError("They work with a clinic, so their clinic decides how they see patients.");
    await ctx.db.patch(profile._id, {
      practiceMode: args.practiceMode,
      isAvailableOnMarketplace: args.practiceMode !== "independent",
    });
    return { practiceMode: args.practiceMode };
  },
});

/**
 * Admin: every physiotherapist and whether they show on Find a Physio, with what's holding back
 * the ones who don't. Uses the same checks as marketplace search.
 */
export const getMarketplaceListingHealth = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const physios = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "physiotherapist"))
      .take(2000);

    const rows = await Promise.all(
      physios.map(async (user) => {
        const profile = await ctx.db
          .query("physiotherapistProfiles")
          .withIndex("by_user_id", (q) => q.eq("userId", user._id))
          .first();
        const approval = await ctx.db
          .query("accountApprovalStatus")
          .withIndex("by_user_id", (q) => q.eq("userId", user._id))
          .first();
        const setup = await computePhysioSetup(ctx, user, profile);

        const reasons: string[] = [];
        if (user.status === "suspended" || user.status === "terminated") reasons.push("Account suspended");
        if (!profile) reasons.push("Hasn't finished the application");
        if (approval?.status !== "approved") {
          reasons.push(approval?.status === "declined" ? "Application declined" : "Awaiting approval");
        }
        if (profile?.clinicId) reasons.push("Works with a clinic (booked through the clinic)");
        if (isIndependentPractice(profile)) reasons.push("Runs their own practice (not on the network)");
        if (profile?.isAvailableOnMarketplace === false && !isIndependentPractice(profile)) reasons.push("Turned their listing off");
        for (const item of setup.items) {
          if (item.required && !item.done) reasons.push(item.title);
        }

        return {
          userId: user._id,
          name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email,
          email: user.email,
          approvalStatus: approval?.status ?? null,
          isLive: reasons.length === 0,
          reasons,
        };
      })
    );

    return rows.sort((a, b) => Number(a.isLive) - Number(b.isLive) || a.reasons.length - b.reasons.length);
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

// ─────────────────────────────────────────────────────────────────────────────
// The physiotherapist handbook (Standard of Physiotherapy Practice)
//
// A PDF the clinical team uploads to ImageKit as a private file. Approved physiotherapists read
// it in Settings (Terms & handbook) through a signed link that expires, so it never sits at a
// public address. Every upload is kept, newest first: the newest is the one physios see, and
// earlier versions stay on record for clinical governance. Internal references go through
// makeFunctionReference (the generated api types are at TypeScript's depth limit).
// ─────────────────────────────────────────────────────────────────────────────

const HANDBOOK_FOLDER = "/rehabify/handbooks";
const HANDBOOK_LINK_MS = 60 * 60 * 1000;
const HANDBOOK_MAX_BYTES = 30 * 1024 * 1024;

/** Approved physiotherapists and admins can read the handbook. */
async function handbookReader(ctx: QueryCtx) {
  const user = await currentUser(ctx);
  if (!user) return null;
  if (user.role === "admin") return user;
  if (user.role === "physiotherapist" && (await isApproved(ctx, user._id))) return user;
  return null;
}

async function newestHandbook(ctx: QueryCtx) {
  return await ctx.db.query("practiceHandbooks").withIndex("by_uploaded_at").order("desc").first();
}

/** The current handbook's details (not its link), or null when there is none or it isn't yours to read. */
export const getPracticeHandbook = query({
  args: {},
  handler: async (ctx) => {
    if (!(await handbookReader(ctx))) return null;
    const doc = await newestHandbook(ctx);
    return doc ? { title: doc.title, version: doc.version, uploadedAt: doc.uploadedAt, size: doc.size } : null;
  },
});

export const practiceHandbookFile = internalQuery({
  args: {},
  handler: async (ctx): Promise<{ url: string; filePath: string }> => {
    if (!(await handbookReader(ctx))) throw new ConvexError("The handbook is for approved Rehabify physiotherapists.");
    const doc = await newestHandbook(ctx);
    if (!doc) throw new ConvexError("The handbook hasn’t been published yet.");
    return { url: doc.url, filePath: doc.filePath };
  },
});

const practiceHandbookFileRef = makeFunctionReference<"query", Record<string, never>, { url: string; filePath: string }>(
  "physioSetup:practiceHandbookFile"
);

/** A link to the current handbook, valid for an hour. */
export const getPracticeHandbookLink = action({
  args: {},
  handler: async (ctx): Promise<{ url: string; expiresAt: number }> => {
    const file = await ctx.runQuery(practiceHandbookFileRef, {});
    const expiresAt = Date.now() + HANDBOOK_LINK_MS;
    return { url: await signedImagekitUrl(file.url, file.filePath, expiresAt), expiresAt };
  },
});

export const assertHandbookAdmin = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return null;
  },
});

const assertHandbookAdminRef = makeFunctionReference<"query", Record<string, never>, null>("physioSetup:assertHandbookAdmin");

/** Signature for one browser upload of the handbook to ImageKit. */
export const adminHandbookUploadAuth = action({
  args: {},
  handler: async (ctx): Promise<{ token: string; expire: number; signature: string; publicKey: string; folder: string }> => {
    await ctx.runQuery(assertHandbookAdminRef, {});
    return imagekitUploadAuth(HANDBOOK_FOLDER);
  },
});

/** Publishes an uploaded PDF as the current handbook. Earlier versions are kept. */
export const adminPublishHandbook = mutation({
  args: {
    title: v.string(),
    version: v.string(),
    fileId: v.string(),
    filePath: v.string(),
    url: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx);
    const title = args.title.trim();
    const version = args.version.trim();
    if (!title || title.length > 120) throw new ConvexError("Give the handbook a title (up to 120 characters).");
    if (!version || version.length > 40) throw new ConvexError("Give this version a label, e.g. 0.1 or 1.0.");
    if (!IMAGEKIT_URL.test(args.url) || !args.filePath.startsWith(`${HANDBOOK_FOLDER}/`) || !args.fileId) {
      throw new ConvexError("Upload the PDF here first, then publish it.");
    }
    if (!/\.pdf$/i.test(args.filePath)) throw new ConvexError("The handbook must be a PDF.");
    if (!(args.size > 0 && args.size <= HANDBOOK_MAX_BYTES)) throw new ConvexError("The PDF must be under 30 MB.");
    const id = await ctx.db.insert("practiceHandbooks", {
      title,
      version,
      fileId: args.fileId,
      filePath: args.filePath,
      url: args.url,
      size: args.size,
      uploadedBy: user._id,
      uploadedAt: Date.now(),
    });
    return { id };
  },
});

/** Every version, newest first, for the admin page. */
export const adminListHandbooks = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const docs = await ctx.db.query("practiceHandbooks").withIndex("by_uploaded_at").order("desc").take(50);
    return await Promise.all(
      docs.map(async (doc, index) => ({
        id: doc._id,
        title: doc.title,
        version: doc.version,
        size: doc.size,
        uploadedAt: doc.uploadedAt,
        uploadedBy: adminDisplayName(await ctx.db.get(doc.uploadedBy)),
        current: index === 0,
      }))
    );
  },
});
