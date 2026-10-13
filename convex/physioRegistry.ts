/**
 * Physio Register — Backend Functions
 *
 * Public registry for physiotherapists. All registered physios appear publicly.
 * Peer verification system (colleagues & patients) drives ranking.
 * Completely separate from Rehabify Health platform membership.
 */

import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { ensureUserRole } from "./auth";

// ── Helper: Generate URL slug from license number ───────
function generateSlug(licenseNumber: string): string {
  return licenseNumber
    .trim()
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
}

// ── Helper: Calculate ranking score ─────────────────────
function calculateRankingScore(entry: {
  peerVerificationCount?: number;
  patientReviewCount?: number;
  averagePatientRating?: number;
  referralCount?: number;
}): number {
  const peerCount = entry.peerVerificationCount || 0;
  const reviewCount = entry.patientReviewCount || 0;
  const avgRating = entry.averagePatientRating || 0;
  const refCount = entry.referralCount || 0;

  return (peerCount * 3) + (reviewCount * 2) + (avgRating * 1) + (refCount * 2);
}

// ── Public: Submit a new registry entry ─────────────────

export const submitRegistration = mutation({
  args: {
    fullName: v.string(),
    email: v.string(),
    phone: v.string(),
    practiceName: v.optional(v.string()),
    practiceAddress: v.optional(v.string()),
    yearsOfExperience: v.number(),
    licenseNumber: v.string(),
    regulatoryBody: v.string(),
    licenseCountry: v.string(),
    licenseExpiryDate: v.string(),
    specialties: v.array(v.string()),
    languages: v.array(v.string()),
    bio: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    profilePhotoStorageId: v.optional(v.id("_storage")),
    licenseCertStorageId: v.id("_storage"),
    photoIdStorageId: v.id("_storage"),
    insuranceStorageId: v.optional(v.id("_storage")),
    referredByLicense: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check for duplicate license number
    const existing = await ctx.db
      .query("physioRegistry")
      .withIndex("by_license_number", (q) => q.eq("licenseNumber", args.licenseNumber))
      .first();

    if (existing) {
      // If rejected, allow resubmission by updating the existing record
      if (existing.verificationStatus === "rejected") {
        await ctx.db.patch(existing._id, {
          ...args,
          slug: generateSlug(args.licenseNumber),
          verificationStatus: "listed" as const,
          rejectionReason: undefined,
          verifiedAt: undefined,
          submittedAt: Date.now(),
          peerVerificationCount: 0,
          patientReviewCount: 0,
          averagePatientRating: 0,
          referralCount: 0,
          rankingScore: 0,
        });

        // Increment referrer's referral count
        if (args.referredByLicense) {
          await incrementReferralCount(ctx, args.referredByLicense);
        }

        return { success: true, id: existing._id, slug: generateSlug(args.licenseNumber), resubmission: true };
      }
      throw new Error("A registration with this license number already exists.");
    }

    const slug = generateSlug(args.licenseNumber);

    const id = await ctx.db.insert("physioRegistry", {
      ...args,
      slug,
      verificationStatus: "listed",
      submittedAt: Date.now(),
      peerVerificationCount: 0,
      patientReviewCount: 0,
      averagePatientRating: 0,
      referralCount: 0,
      rankingScore: 0,
    });

    // Increment referrer's referral count if referred
    if (args.referredByLicense) {
      await incrementReferralCount(ctx, args.referredByLicense);
    }

    return { success: true, id, slug, resubmission: false };
  },
});

// ── Helper: Increment referral count for the referring physio ──
async function incrementReferralCount(ctx: any, referrerLicense: string) {
  const referrer = await ctx.db
    .query("physioRegistry")
    .withIndex("by_license_number", (q: any) => q.eq("licenseNumber", referrerLicense))
    .first();

  if (referrer) {
    const newRefCount = (referrer.referralCount || 0) + 1;
    const newScore = calculateRankingScore({
      ...referrer,
      referralCount: newRefCount,
    });
    await ctx.db.patch(referrer._id, {
      referralCount: newRefCount,
      rankingScore: newScore,
    });
  }
}

// ── Public: Link Clerk user to registry entry ───────────

export const linkClerkUser = mutation({
  args: {
    registryEntryId: v.id("physioRegistry"),
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    // Only the signed-in user can link an entry to their own account, an entry that
    // already belongs to someone else cannot be taken over, and when both emails are
    // known they must match (registry ids are visible in the public directory).
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || identity.subject !== args.clerkUserId) throw new Error("Please sign in to link your registry entry.");
    const entry = await ctx.db.get(args.registryEntryId);
    if (!entry) throw new Error("Registry entry not found");
    if (entry.clerkUserId && entry.clerkUserId !== args.clerkUserId) {
      throw new Error("This registry entry is already linked to another account.");
    }
    const signedInEmail = typeof identity.email === "string" ? identity.email.trim().toLowerCase() : "";
    const entryEmail = typeof (entry as any).email === "string" ? (entry as any).email.trim().toLowerCase() : "";
    if (signedInEmail && entryEmail && signedInEmail !== entryEmail) {
      throw new Error("Sign in with the email address used for this registration.");
    }

    await ctx.db.patch(args.registryEntryId, {
      clerkUserId: args.clerkUserId,
    });

    return { success: true };
  },
});

// ── Public: List all publicly visible physios ───────────

export const listPublicRegistry = query({
  args: {
    searchQuery: v.optional(v.string()),
    sortBy: v.optional(v.union(
      v.literal("ranking"),
      v.literal("newest"),
      v.literal("experience"),
      v.literal("name")
    )),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;

    // Get all listed/verified entries from the registry table
    const allEntries = await ctx.db
      .query("physioRegistry")
      .order("desc")
      .collect();

    // Filter to publicly visible entries
    let visible = allEntries.filter(
      (e) => e.verificationStatus === "listed" || e.verificationStatus === "verified"
    );

    // Dynamic injection: Find verified Official Rehabify Physiotherapists and append/merge them
    const officialMapped = await getOfficialPhysiosAsRegistryEntries(ctx);
    for (const official of officialMapped) {
      // Deduplicate: If they already registered on the public directory, just mark them as 'verified' (Rehabify Approved)
      const existingIdx = visible.findIndex((e: any) => 
        (e.clerkUserId && e.clerkUserId === official.clerkUserId) || 
        (e.licenseNumber && e.licenseNumber.length > 3 && e.licenseNumber === official.licenseNumber)
      );
      
      if (existingIdx >= 0) {
        visible[existingIdx].verificationStatus = "verified"; // Ensure badge is applied
      } else {
        visible.push(official as any);
      }
    }

    // Search filter
    if (args.searchQuery && args.searchQuery.trim().length >= 2) {
      const q = args.searchQuery.toLowerCase().trim();
      visible = visible.filter(
        (e) =>
          e.fullName.toLowerCase().includes(q) ||
          e.licenseNumber.toLowerCase().includes(q) ||
          (e.specialties || []).some((s: string) => s.toLowerCase().includes(q)) ||
          (e.practiceAddress || "").toLowerCase().includes(q) ||
          (e.practiceName || "").toLowerCase().includes(q)
      );
    }

    // Sort
    const sortBy = args.sortBy || "ranking";
    switch (sortBy) {
      case "ranking":
        visible.sort((a, b) => (b.rankingScore || 0) - (a.rankingScore || 0));
        break;
      case "newest":
        visible.sort((a, b) => b.submittedAt - a.submittedAt);
        break;
      case "experience":
        visible.sort((a, b) => b.yearsOfExperience - a.yearsOfExperience);
        break;
      case "name":
        visible.sort((a, b) => a.fullName.localeCompare(b.fullName));
        break;
    }

    const totalCount = visible.length;
    const results = visible.slice(0, limit);

    // Resolve profile photo URLs
    const enriched = await Promise.all(
      results.map(async (entry: any) => {
        let profilePhotoUrl = null;
        if (entry._userImageUrl) {
            profilePhotoUrl = entry._userImageUrl;
        } else if (entry.profilePhotoStorageId) {
            profilePhotoUrl = await ctx.storage.getUrl(entry.profilePhotoStorageId);
        }

        return {
          id: entry._id,
          fullName: entry.fullName,
          licenseNumber: entry.licenseNumber,
          regulatoryBody: entry.regulatoryBody,
          licenseCountry: entry.licenseCountry,
          licenseExpiryDate: entry.licenseExpiryDate,
          specialties: entry.specialties,
          languages: entry.languages,
          bio: entry.bio,
          yearsOfExperience: entry.yearsOfExperience,
          practiceName: entry.practiceName,
          practiceAddress: entry.practiceAddress,
          profilePhotoUrl,
          slug: entry.slug,
          peerVerificationCount: entry.peerVerificationCount || 0,
          patientReviewCount: entry.patientReviewCount || 0,
          averagePatientRating: entry.averagePatientRating || 0,
          referralCount: entry.referralCount || 0,
          rankingScore: entry.rankingScore || 0,
          ranking: entry.ranking,
          submittedAt: entry.submittedAt,
          isRehabifyApproved: entry.verificationStatus === "verified",
        };
      })
    );

    return { results: enriched, total: totalCount };
  },
});

// ── Public: Get single physio profile by slug ───────────

export const getPublicProfile = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    let entry = await ctx.db
      .query("physioRegistry")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    let _userImageUrl: string | null = null;

    if (!entry) {
      // Fallback: Check if the slug belongs to a Dynamically Injected Official Physiotherapist
      const officialMapped = await getOfficialPhysiosAsRegistryEntries(ctx);
      const matched = officialMapped.find((o) => o.slug === args.slug);
      if (matched) {
        entry = matched as any;
        _userImageUrl = (matched as any)._userImageUrl;
      }
    }

    if (!entry) return null;
    if (entry.verificationStatus !== "listed" && entry.verificationStatus !== "verified") {
      return null;
    }

    // Resolve document URLs gracefully (handles null if user didn't upload)
    const [profilePhotoUrl, licenseCertUrl] = await Promise.all([
      _userImageUrl ? Promise.resolve(_userImageUrl) : (entry.profilePhotoStorageId ? ctx.storage.getUrl(entry.profilePhotoStorageId) : Promise.resolve(null)),
      entry.licenseCertStorageId ? ctx.storage.getUrl(entry.licenseCertStorageId) : Promise.resolve(null),
    ]);

    // Get total count for "Ranked #X out of Y"
    const allListed = await ctx.db
      .query("physioRegistry")
      .collect();
    const totalCount = allListed.filter(
      (e) => e.verificationStatus === "listed" || e.verificationStatus === "verified"
    ).length;

    return {
      id: entry._id,
      fullName: entry.fullName,
      email: entry.email,
      phone: entry.phone,
      licenseNumber: entry.licenseNumber,
      regulatoryBody: entry.regulatoryBody,
      licenseCountry: entry.licenseCountry,
      licenseExpiryDate: entry.licenseExpiryDate,
      specialties: entry.specialties,
      languages: entry.languages,
      bio: entry.bio,
      websiteUrl: entry.websiteUrl,
      yearsOfExperience: entry.yearsOfExperience,
      practiceName: entry.practiceName,
      practiceAddress: entry.practiceAddress,
      profilePhotoUrl,
      licenseCertUrl,
      slug: entry.slug,
      clerkUserId: entry.clerkUserId,
      peerVerificationCount: entry.peerVerificationCount || 0,
      patientReviewCount: entry.patientReviewCount || 0,
      averagePatientRating: entry.averagePatientRating || 0,
      referralCount: entry.referralCount || 0,
      rankingScore: entry.rankingScore || 0,
      ranking: entry.ranking,
      totalRegistered: totalCount,
      submittedAt: entry.submittedAt,
      isRehabifyApproved: entry.verificationStatus === "verified",
    };
  },
});

// ── Public: Get profile photo URL ───────────────────────

export const getProfilePhotoUrl = internalQuery({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

// ── Public: Get license certificate URL ─────────────────

export const getLicenseCertUrl = internalQuery({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

// ── Public: Get registry stats ──────────────────────────

export const getRegistryStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("physioRegistry").collect();
    let listed = all.filter(
      (e) => e.verificationStatus === "listed" || e.verificationStatus === "verified"
    );
    
    // Inject official physios for accurate total counts
    const officialMapped = await getOfficialPhysiosAsRegistryEntries(ctx);
    for (const official of officialMapped) {
      const exists = listed.some((e: any) => 
        (e.clerkUserId && e.clerkUserId === official.clerkUserId) || 
        (e.licenseNumber && e.licenseNumber.length > 3 && e.licenseNumber === official.licenseNumber)
      );
      if (!exists) listed.push(official as any);
      else {
        const idx = listed.findIndex(e => e.clerkUserId === official.clerkUserId || e.licenseNumber === official.licenseNumber);
        if (idx >= 0) listed[idx].verificationStatus = "verified";
      }
    }
    
    return {
      totalRegistered: listed.length,
      totalVerifiedByRehabify: listed.filter((e) => e.verificationStatus === "verified").length,
    };
  },
});

// ── Shared Helper: Fetch and map official Rehabify Physiotherapists ───
async function getOfficialPhysiosAsRegistryEntries(ctx: any) {
  const approvedStatuses = await ctx.db
    .query("accountApprovalStatus")
    .withIndex("by_status", (q: any) => q.eq("status", "approved"))
    .collect();

  const officialProfiles = [];
  for (const status of approvedStatuses) {
    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q: any) => q.eq("userId", status.userId))
      .first();
    if (profile) officialProfiles.push(profile);
  }

  const verifiedOfficialProfiles = officialProfiles;
  
  const results = [];
  for (const official of verifiedOfficialProfiles) {
    const user = await ctx.db.get(official.userId);
    if (!user) continue;
    
    // Look up license document (if any) using generic fallback filter
    const licenseDocs = await ctx.db.query("physiotherapistDocuments")
       .filter((q:any) => q.eq(q.field("physiotherapistId"), official._id))
       .filter((q:any) => q.eq(q.field("documentType"), "licenseDocument"))
       .collect();
      
    // Construct mapped entry matching physioRegistry shape
    results.push({
      _id: official._id, 
      _creationTime: official._creationTime || Date.now(),
      fullName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Official Physiotherapist",
      email: user.email || "",
      phone: user.phoneNumber || "",
      practiceName: "Rehabify Health Verified",
      practiceAddress: official.location || "",
      yearsOfExperience: official.yearsOfExperience || 0,
      licenseNumber: official.licenseNumber || "N/A",
      regulatoryBody: official.certificationBoard || "MRTB",
      licenseCountry: "Nigeria", // default
      licenseExpiryDate: official.licenseExpiryDate || "",
      specialties: official.specializations || [],
      languages: official.languagesSpoken || ["English"],
      bio: official.bio || "Verified Physiotherapist on Rehabify Health.",
      websiteUrl: undefined,
      profilePhotoStorageId: undefined,
      _userImageUrl: user.imageUrl, // internal temporary field for resolution
      licenseCertStorageId: licenseDocs.length > 0 ? licenseDocs[0].storageId : null,
      photoIdStorageId: "ignored" as any,
      clerkUserId: user.clerkId || user._id, // unique identifier mapping
      slug: official.bookingSlug || (official.licenseNumber ? `mrtb-${official.licenseNumber.toLowerCase().replace(/[^a-z0-9]/g, "")}` : official._id.toString()),
      peerVerificationCount: official.reviewCount || 0,
      patientReviewCount: official.reviewCount || 0,
      averagePatientRating: official.averageRating || 0,
      referralCount: 0,
      rankingScore: 1000 + (official.averageRating || 0) * 10,
      ranking: undefined,
      verificationStatus: "verified",
      submittedAt: official._creationTime || Date.now()
    });
  }
  return results;
}

// ── Public: Submit peer verification or patient review ──

export const submitPeerVerification = mutation({
  args: {
    registryEntryId: v.id("physioRegistry"),
    verifierType: v.union(v.literal("colleague"), v.literal("patient")),
    verifierName: v.string(),
    verifierEmail: v.optional(v.string()),
    verifierQualifications: v.optional(v.string()),
    verifierLicenseNumber: v.optional(v.string()),
    relationshipContext: v.optional(v.union(
      v.literal("school"),
      v.literal("work"),
      v.literal("conference"),
      v.literal("mentorship"),
      v.literal("other")
    )),
    relationshipDetails: v.optional(v.string()),
    rating: v.optional(v.number()),
    reviewText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.registryEntryId);
    if (!entry) throw new Error("Physiotherapist not found");

    // Prevent duplicate verifications from same email
    if (args.verifierEmail) {
      const existing = await ctx.db
        .query("physioRegistryPeerVerifications")
        .withIndex("by_verifier_email", (q) => q.eq("verifierEmail", args.verifierEmail!))
        .collect();

      const alreadyVerified = existing.find(
        (v) => v.registryEntryId === args.registryEntryId
      );
      if (alreadyVerified) {
        throw new Error("You have already submitted a verification for this physiotherapist.");
      }
    }

    // Insert verification
    await ctx.db.insert("physioRegistryPeerVerifications", {
      registryEntryId: args.registryEntryId,
      verifierType: args.verifierType,
      verifierName: args.verifierName,
      verifierEmail: args.verifierEmail,
      verifierQualifications: args.verifierQualifications,
      verifierLicenseNumber: args.verifierLicenseNumber,
      relationshipContext: args.relationshipContext,
      relationshipDetails: args.relationshipDetails,
      rating: args.rating,
      reviewText: args.reviewText,
      createdAt: Date.now(),
    });

    // Update counts on the registry entry
    if (args.verifierType === "colleague") {
      const newPeerCount = (entry.peerVerificationCount || 0) + 1;
      const newScore = calculateRankingScore({
        ...entry,
        peerVerificationCount: newPeerCount,
      });
      await ctx.db.patch(args.registryEntryId, {
        peerVerificationCount: newPeerCount,
        rankingScore: newScore,
      });
    } else {
      // Patient review — update review count and average rating
      const newReviewCount = (entry.patientReviewCount || 0) + 1;
      const currentTotal = (entry.averagePatientRating || 0) * (entry.patientReviewCount || 0);
      const newAverage = (currentTotal + (args.rating || 0)) / newReviewCount;
      const newScore = calculateRankingScore({
        ...entry,
        patientReviewCount: newReviewCount,
        averagePatientRating: newAverage,
      });
      await ctx.db.patch(args.registryEntryId, {
        patientReviewCount: newReviewCount,
        averagePatientRating: Math.round(newAverage * 10) / 10,
        rankingScore: newScore,
      });
    }

    return { success: true };
  },
});

// ── Public: Get verifications for a registry entry ──────

export const getVerificationsForEntry = query({
  args: { registryEntryId: v.string() },
  handler: async (ctx, args) => {
    let normalizedId;
    try {
      normalizedId = ctx.db.normalizeId("physioRegistry", args.registryEntryId);
    } catch {
      return [];
    }

    if (!normalizedId) {
      return [];
    }

    const verifications = await ctx.db
      .query("physioRegistryPeerVerifications")
      .withIndex("by_registry_entry", (q) => q.eq("registryEntryId", normalizedId))
      .order("desc")
      .collect();

    return verifications.map((v) => ({
      id: v._id,
      verifierType: v.verifierType,
      verifierName: v.verifierName,
      verifierQualifications: v.verifierQualifications,
      relationshipContext: v.relationshipContext,
      relationshipDetails: v.relationshipDetails,
      rating: v.rating,
      reviewText: v.reviewText,
      createdAt: v.createdAt,
    }));
  },
});

// ── Authenticated: Update own profile ───────────────────

export const updateProfile = mutation({
  args: {
    registryEntryId: v.id("physioRegistry"),
    fullName: v.optional(v.string()),
    phone: v.optional(v.string()),
    practiceName: v.optional(v.string()),
    practiceAddress: v.optional(v.string()),
    yearsOfExperience: v.optional(v.number()),
    specialties: v.optional(v.array(v.string())),
    languages: v.optional(v.array(v.string())),
    bio: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    profilePhotoStorageId: v.optional(v.id("_storage")),
    licenseCertStorageId: v.optional(v.id("_storage")),
    photoIdStorageId: v.optional(v.id("_storage")),
    insuranceStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("You must be signed in to update your profile.");

    const entry = await ctx.db.get(args.registryEntryId);
    if (!entry) throw new Error("Registry entry not found");

    // Check ownership
    if (entry.clerkUserId !== identity.subject) {
      throw new Error("You can only edit your own profile.");
    }

    const { registryEntryId, ...updates } = args;

    // Filter out undefined values
    const cleanUpdates: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    }

    await ctx.db.patch(registryEntryId, cleanUpdates);
    return { success: true };
  },
});

// ── Authenticated: Delete profile photo ─────────────────

export const deleteProfilePhoto = mutation({
  args: { registryEntryId: v.id("physioRegistry") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("You must be signed in.");

    const entry = await ctx.db.get(args.registryEntryId);
    if (!entry) throw new Error("Registry entry not found");

    if (entry.clerkUserId !== identity.subject) {
      throw new Error("You can only edit your own profile.");
    }

    if (entry.profilePhotoStorageId) {
      await ctx.storage.delete(entry.profilePhotoStorageId);
    }

    await ctx.db.patch(args.registryEntryId, {
      profilePhotoStorageId: undefined,
    });

    return { success: true };
  },
});

// ── Admin/System: Recalculate all rankings ──────────────

export const recalculateRankings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("physioRegistry").collect();
    const listed = all.filter(
      (e) => e.verificationStatus === "listed" || e.verificationStatus === "verified"
    );

    // Calculate scores
    const scored = listed.map((e) => ({
      id: e._id,
      score: calculateRankingScore(e),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Update rankings
    for (let i = 0; i < scored.length; i++) {
      await ctx.db.patch(scored[i].id, {
        rankingScore: scored[i].score,
        ranking: i + 1,
      });
    }

    return { updated: scored.length };
  },
});

// ── Public: Search the registry (legacy — kept for backward compat) ──

interface SearchResult {
  id: string;
  fullName: string;
  licenseNumber: string;
  regulatoryBody: string;
  licenseCountry: string;
  licenseExpiryDate: string;
  specialties: string[];
  languages: string[];
  bio: string;
  yearsOfExperience: number;
  practiceAddress: string;
  verificationStatus: string;
  verifiedAt?: number;
  profilePhotoStorageId?: any;
  profileImageUrl?: string;
  source: "registry" | "platform";
}

export const searchRegistry = internalQuery({
  args: {
    searchQuery: v.optional(v.string()),
    licenseNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const registryToResult = (entry: any): SearchResult => ({
      id: entry._id,
      fullName: entry.fullName,
      licenseNumber: entry.licenseNumber,
      regulatoryBody: entry.regulatoryBody,
      licenseCountry: entry.licenseCountry,
      licenseExpiryDate: entry.licenseExpiryDate,
      specialties: entry.specialties,
      languages: entry.languages || [],
      bio: entry.bio || "",
      yearsOfExperience: entry.yearsOfExperience || 0,
      practiceAddress: entry.practiceAddress || "",
      verificationStatus: entry.verificationStatus,
      verifiedAt: entry.verifiedAt,
      profilePhotoStorageId: entry.profilePhotoStorageId,
      source: "registry",
    });

    const getApprovedPlatformPhysios = async (): Promise<SearchResult[]> => {
      const approvedStatuses = await ctx.db
        .query("accountApprovalStatus")
        .withIndex("by_status", (q) => q.eq("status", "approved"))
        .collect();

      const results: SearchResult[] = [];
      for (const status of approvedStatuses) {
        const profile = await ctx.db
          .query("physiotherapistProfiles")
          .withIndex("by_user_id", (q) => q.eq("userId", status.userId))
          .first();

        if (!profile) continue;

        const user = await ctx.db.get(status.userId);
        if (!user) continue;

        const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Unknown";

        results.push({
          id: `platform_${profile._id}`,
          fullName,
          licenseNumber: profile.licenseNumber || "",
          regulatoryBody: profile.certificationBoard || "MRTB",
          licenseCountry: "Nigeria",
          licenseExpiryDate: profile.licenseExpiryDate || "",
          specialties: profile.specializations || [],
          languages: profile.languagesSpoken || [],
          bio: profile.bio || "",
          yearsOfExperience: profile.yearsOfExperience || 0,
          practiceAddress: profile.location || "",
          verificationStatus: "verified",
          verifiedAt: status.reviewedAt,
          profilePhotoStorageId: undefined,
          profileImageUrl: user.imageUrl,
          source: "platform",
        });
      }
      return results;
    };

    // Search by exact license number
    if (args.licenseNumber) {
      const results: SearchResult[] = [];

      const registryEntry = await ctx.db
        .query("physioRegistry")
        .withIndex("by_license_number", (q) =>
          q.eq("licenseNumber", args.licenseNumber!)
        )
        .first();

      if (registryEntry && (registryEntry.verificationStatus === "verified" || registryEntry.verificationStatus === "listed")) {
        results.push(registryToResult(registryEntry));
      }

      const platformProfiles = await ctx.db
        .query("physiotherapistProfiles")
        .withIndex("by_license_number", (q) => q.eq("licenseNumber", args.licenseNumber!))
        .collect();

      for (const p of platformProfiles) {
        if (results.some((r) => r.licenseNumber === p.licenseNumber)) continue;

        const approval = await ctx.db
          .query("accountApprovalStatus")
          .withIndex("by_user_id", (q) => q.eq("userId", p.userId))
          .first();

        if (approval && approval.status === "approved") {
          const user = await ctx.db.get(p.userId);
          if (user) {
            results.push({
              id: `platform_${p._id}`,
              fullName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Unknown",
              licenseNumber: p.licenseNumber || "",
              regulatoryBody: p.certificationBoard || "MRTB",
              licenseCountry: "Nigeria",
              licenseExpiryDate: p.licenseExpiryDate || "",
              specialties: p.specializations || [],
              languages: p.languagesSpoken || [],
              bio: p.bio || "",
              yearsOfExperience: p.yearsOfExperience || 0,
              practiceAddress: p.location || "",
              verificationStatus: "verified",
              verifiedAt: approval.reviewedAt,
              profilePhotoStorageId: undefined,
              profileImageUrl: user.imageUrl,
              source: "platform",
            });
          }
        }
      }

      return results;
    }

    // Search by name
    if (args.searchQuery && args.searchQuery.trim().length >= 2) {
      const query = args.searchQuery.toLowerCase().trim();

      const allVisible = await ctx.db
        .query("physioRegistry")
        .collect();

      const registryResults = allVisible
        .filter((entry) =>
          (entry.verificationStatus === "verified" || entry.verificationStatus === "listed") &&
          entry.fullName.toLowerCase().includes(query)
        )
        .map(registryToResult);

      const platformPhysios = await getApprovedPlatformPhysios();
      const platformResults = platformPhysios.filter((p) =>
        p.fullName.toLowerCase().includes(query)
      );

      const seenLicenses = new Set(registryResults.map((r) => r.licenseNumber));
      const merged = [...registryResults];
      for (const p of platformResults) {
        if (!seenLicenses.has(p.licenseNumber)) {
          merged.push(p);
          seenLicenses.add(p.licenseNumber);
        }
      }

      return merged.slice(0, 30);
    }

    return [];
  },
});

// ── Public: Check registration status by email ──────────

export const checkStatus = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("physioRegistry")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!entry) return null;

    let isOwner = false;
    const identity = await ctx.auth.getUserIdentity();
    if (identity) {
      if (identity.email === args.email) {
        isOwner = true;
      } else {
        const userByEmail = await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", args.email))
          .first();
        if (userByEmail && userByEmail.clerkId === identity.subject) {
          isOwner = true;
        }
      }
    }

    if (!isOwner) {
      return {
        verificationStatus: entry.verificationStatus,
        submittedAt: entry.submittedAt,
        verifiedAt: entry.verifiedAt,
      };
    }

    return {
      id: entry._id,
      fullName: entry.fullName,
      licenseNumber: entry.licenseNumber,
      slug: entry.slug,
      verificationStatus: entry.verificationStatus,
      rejectionReason: entry.rejectionReason,
      submittedAt: entry.submittedAt,
      verifiedAt: entry.verifiedAt,
    };
  },
});

// ── Admin: List all registrations ───────────────────────

export const adminListRegistrations = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("verified"),
        v.literal("rejected"),
        v.literal("listed")
      )
    ),
  },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    if (args.status) {
      return await ctx.db
        .query("physioRegistry")
        .withIndex("by_verification_status", (q) =>
          q.eq("verificationStatus", args.status!)
        )
        .order("desc")
        .collect();
    }
    return await ctx.db.query("physioRegistry").order("desc").collect();
  },
});

// ── Admin: Get single entry with document URLs ──────────

export const adminGetRegistration = query({
  args: { id: v.id("physioRegistry") },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const entry = await ctx.db.get(args.id);
    if (!entry) return null;

    const [licenseCertUrl, photoIdUrl, insuranceUrl, profilePhotoUrl] =
      await Promise.all([
        ctx.storage.getUrl(entry.licenseCertStorageId),
        ctx.storage.getUrl(entry.photoIdStorageId),
        entry.insuranceStorageId
          ? ctx.storage.getUrl(entry.insuranceStorageId)
          : null,
        entry.profilePhotoStorageId
          ? ctx.storage.getUrl(entry.profilePhotoStorageId)
          : null,
      ]);

    return {
      ...entry,
      licenseCertUrl,
      photoIdUrl,
      insuranceUrl,
      profilePhotoUrl,
    };
  },
});

// ── Admin: Approve a registration ───────────────────────

export const adminApprove = mutation({
  args: { id: v.id("physioRegistry") },
  handler: async (ctx, args) => {
    const adminUser = await ensureUserRole(ctx, ["admin"]);
    const entry = await ctx.db.get(args.id);
    if (!entry) throw new Error("Registration not found");

    await ctx.db.patch(args.id, {
      verificationStatus: "verified",
      verifiedAt: Date.now(),
      reviewedBy: adminUser._id,
      rejectionReason: undefined,
    });

    return { success: true };
  },
});

// ── Admin: Reject a registration ────────────────────────

export const adminReject = mutation({
  args: {
    id: v.id("physioRegistry"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const adminUser = await ensureUserRole(ctx, ["admin"]);
    const entry = await ctx.db.get(args.id);
    if (!entry) throw new Error("Registration not found");

    await ctx.db.patch(args.id, {
      verificationStatus: "rejected",
      reviewedBy: adminUser._id,
      rejectionReason: args.reason,
    });

    return { success: true };
  },
});
