/**
 * Physio Register — Backend Functions
 *
 * Standalone public registry for physiotherapist credential verification.
 * Completely separate from Rehabify Health platform membership.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ensureUserRole } from "./auth";

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
          verificationStatus: "pending" as const,
          rejectionReason: undefined,
          verifiedAt: undefined,
          submittedAt: Date.now(),
        });
        return { success: true, id: existing._id, resubmission: true };
      }
      throw new Error("A registration with this license number already exists.");
    }

    const id = await ctx.db.insert("physioRegistry", {
      ...args,
      verificationStatus: "pending",
      submittedAt: Date.now(),
    });

    return { success: true, id, resubmission: false };
  },
});

// ── Public: Search the registry ─────────────────────────

// Helper: shape for a search result entry
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
  profilePhotoStorageId?: any; // For Convex Storage (guest uploads)
  profileImageUrl?: string; // For Clerk URLs (platform users)
  source: "registry" | "platform";
}

export const searchRegistry = query({
  args: {
    searchQuery: v.optional(v.string()),
    licenseNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Helper to convert a physioRegistry entry to a SearchResult
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

    // Helper to fetch approved Rehabify platform physios and convert to SearchResult[]
    const getApprovedPlatformPhysios = async (): Promise<SearchResult[]> => {
      // Get all approved users
      const approvedStatuses = await ctx.db
        .query("accountApprovalStatus")
        .withIndex("by_status", (q) => q.eq("status", "approved"))
        .collect();

      console.log(`[PhysioRegistry] Found ${approvedStatuses.length} approved users`);

      // Fetch user details for each via indexing
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
      console.log(`[PhysioRegistry] Returning ${results.length} platform physio results`);
      return results;
    };

    // ── Search by exact license number ──
    if (args.licenseNumber) {
      const results: SearchResult[] = [];

      // Check physioRegistry
      const registryEntry = await ctx.db
        .query("physioRegistry")
        .withIndex("by_license_number", (q) =>
          q.eq("licenseNumber", args.licenseNumber!)
        )
        .first();

      if (registryEntry && registryEntry.verificationStatus === "verified") {
        results.push(registryToResult(registryEntry));
      }

      // Check platform physios by index
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

    // ── Search by name (partial match) ──
    if (args.searchQuery && args.searchQuery.trim().length >= 2) {
      const query = args.searchQuery.toLowerCase().trim();

      // Get verified registry entries
      const allVerified = await ctx.db
        .query("physioRegistry")
        .withIndex("by_verification_status", (q) =>
          q.eq("verificationStatus", "verified")
        )
        .collect();

      const registryResults = allVerified
        .filter((entry) => entry.fullName.toLowerCase().includes(query))
        .map(registryToResult);

      // Get approved platform physios
      const platformPhysios = await getApprovedPlatformPhysios();
      const platformResults = platformPhysios.filter((p) =>
        p.fullName.toLowerCase().includes(query)
      );

      // Merge & deduplicate by license number (registry takes precedence)
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

// ── Public: Get profile photo URL ───────────────────────

export const getProfilePhotoUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

// ── Admin: List all registrations ───────────────────────

export const adminListRegistrations = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("verified"),
        v.literal("rejected")
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

    // Resolve storage URLs
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
           .withIndex("by_email", q => q.eq("email", args.email))
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
      verificationStatus: entry.verificationStatus,
      rejectionReason: entry.rejectionReason,
      submittedAt: entry.submittedAt,
      verifiedAt: entry.verifiedAt,
    };
  },
});
