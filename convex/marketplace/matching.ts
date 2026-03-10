// @ts-nocheck
/**
 * Smart Physiotherapist Matching
 * Tiered matching algorithm that finds the best physios for a patient
 * based on location, condition, and availability.
 *
 * Tier Strategy:
 *   1. Best Match — Same city + condition specialization + in-person
 *   2. Regional   — Same region/nearby cities + condition match
 *   3. Online     — Anywhere in Nigeria + offers online sessions
 *   4. Nationwide — All available physios as fallback
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

/**
 * Get matched physiotherapists for a patient based on their preferences.
 * This is the smart matching query called from the find-my-physio page.
 */
export const getMatchedPhysiotherapists = query({
    args: {
        cityKey: v.optional(v.string()),        // e.g., "lagos", "abuja", "southwest"
        areaIndex: v.optional(v.number()),       // e.g., 0, 1, 2
        conditionLabel: v.optional(v.string()),  // e.g., "Back or neck pain"
        conditionLevel: v.optional(v.string()),  // "standard", "moderate", "complex"
    },

    handler: async (ctx, args) => {
        // Get all marketplace-available physiotherapists
        const allPhysios = await ctx.db
            .query("physiotherapistProfiles")
            .filter((q) => q.eq(q.field("isAvailableOnMarketplace"), true))
            .collect();

        // Enrich with user details + approval status
        const enrichedPhysios = await Promise.all(
            allPhysios.map(async (profile) => {
                const user = await ctx.db.get(profile.userId);
                if (!user) return null;

                // Check approval
                const approvalStatus = await ctx.db
                    .query("accountApprovalStatus")
                    .withIndex("by_user_id", (q) => q.eq("userId", profile.userId))
                    .first();

                if (!approvalStatus || approvalStatus.status !== "approved") {
                    return null;
                }

                return { ...profile, user };
            })
        );

        const validPhysios = enrichedPhysios.filter((p) => p !== null);

        // ── Matching Logic (runs on server, no client-side lib imports) ──

        // Location terms for matching
        const CITIES_MAP = {
            lagos: { label: "Lagos", terms: ["lagos", "ikeja", "vi", "victoria island", "ikoyi", "lekki", "surulere", "yaba", "ajah", "mainland", "island"] },
            abuja: { label: "Abuja", terms: ["abuja", "maitama", "asokoro", "wuse", "garki", "jabi", "gwarinpa", "kubwa", "lugbe", "utako"] },
            southwest: { label: "South-West", terms: ["ibadan", "abeokuta", "akure", "ado-ekiti", "ado ekiti", "osogbo", "ife", "ilesha", "ogbomoso"] },
            southeast: { label: "South-East", terms: ["enugu", "owerri", "aba", "onitsha", "awka", "abakaliki", "nsukka", "nnewi", "umuahia"] },
            southsouth: { label: "South-South", terms: ["port harcourt", "benin", "benin city", "calabar", "warri", "uyo", "asaba"] },
            northcentral: { label: "North-Central", terms: ["jos", "ilorin", "makurdi", "minna", "lokoja", "lafia"] },
            northwest: { label: "North-West", terms: ["kaduna", "kano", "sokoto", "zaria", "katsina"] },
            northeast: { label: "North-East", terms: ["maiduguri", "bauchi", "yola", "gombe", "jalingo", "damaturu"] },
        };

        const NEARBY = {
            lagos: ["southwest"],
            abuja: ["northcentral"],
            southwest: ["lagos", "southsouth"],
            southeast: ["southsouth"],
            southsouth: ["southeast", "southwest"],
            northcentral: ["abuja", "northwest"],
            northwest: ["northcentral", "northeast"],
            northeast: ["northcentral", "northwest"],
        };

        // Condition → specialization keywords
        const CONDITION_SPECS = {
            "Back or neck pain": ["back", "neck", "spinal", "spine", "musculoskeletal", "manual therapy", "orthopedic", "pain"],
            "Sports injury (sprains, strains)": ["sports", "athletic", "musculoskeletal", "orthopedic", "rehabilitation"],
            "General joint pain": ["joint", "musculoskeletal", "arthritis", "orthopedic", "manual therapy", "pain"],
            "Mild arthritis": ["arthritis", "rheumatology", "geriatric", "joint", "musculoskeletal", "pain"],
            "Post-surgery rehabilitation": ["post-surgical", "post-operative", "surgical", "rehabilitation", "orthopedic", "recovery"],
            "Chronic pain condition": ["chronic pain", "pain management", "pain science", "musculoskeletal", "manual therapy"],
            "Moderate arthritis": ["arthritis", "rheumatology", "musculoskeletal", "geriatric", "pain", "joint"],
            "Complex sports injury (ACL, rotator cuff)": ["sports", "ACL", "rotator cuff", "shoulder", "knee", "orthopedic", "surgical"],
            "Stroke recovery": ["stroke", "neuro", "neurological", "neurorehabilitation", "brain injury"],
            "Spinal cord injury": ["spinal cord", "spinal", "neuro", "neurological", "neurorehabilitation", "paralysis"],
            "Cerebral palsy": ["cerebral palsy", "pediatric", "paediatric", "neuro", "neurological", "developmental"],
            "Other neurological condition (Parkinson's, MS, TBI)": ["parkinson", "multiple sclerosis", "TBI", "neuro", "neurological", "neurorehabilitation"],
        };

        const cityKey = args.cityKey || "";
        const conditionLabel = args.conditionLabel || "";
        const conditionLevel = args.conditionLevel || "standard";

        const cityTerms = CITIES_MAP[cityKey]?.terms || [];
        const nearbyRegionKeys = NEARBY[cityKey] || [];
        const nearbyTerms = nearbyRegionKeys.flatMap((rk) => CITIES_MAP[rk]?.terms || []);
        const conditionSpecs = CONDITION_SPECS[conditionLabel] || [];

        // Score each physiotherapist
        const scoredPhysios = validPhysios.map((p) => {
            const physioLocation = (p.location || "").toLowerCase().trim();
            const physioSpecs = (p.specializations || []).map((s) => s.toLowerCase());
            const isVerified =
                p.verificationBadge?.status === "verified" ||
                p.verificationBadge?.status === "pro_verified";

            let locationScore = 0;
            let specScore = 0;
            let verifyScore = isVerified ? 15 : 0;
            let ratingScore = Math.round(((p.averageRating || 0) / 5) * 10);
            let onlineScore = p.offersOnlineSessions ? 5 : 0;
            let expScore = Math.min(5, Math.round((p.yearsOfExperience || 0) / 4));
            let tier = "nationwide";
            const matchReasons = [];

            // Location scoring (0-40)
            // IMPORTANT: Only match if physio has a non-empty location set.
            // Without this check, empty string "" matches everything via .includes("")
            const hasPhysioLocation = physioLocation.length > 0;
            const hasCityTerms = cityTerms.length > 0;

            const isExactMatch = hasPhysioLocation && hasCityTerms && cityTerms.some(
                (term) => physioLocation.includes(term) || term.includes(physioLocation)
            );

            if (isExactMatch && p.offersInPersonSessions) {
                locationScore = 40;
                tier = "best_match";
                matchReasons.push("In your area");
            } else if (isExactMatch) {
                locationScore = 35;
                tier = "best_match";
                matchReasons.push("In your area");
            } else {
                const isNearby = hasPhysioLocation && nearbyTerms.length > 0 && nearbyTerms.some(
                    (term) => physioLocation.includes(term) || term.includes(physioLocation)
                );
                if (isNearby) {
                    locationScore = 20;
                    tier = "regional";
                    matchReasons.push("In your region");
                } else if (p.offersOnlineSessions) {
                    locationScore = 10;
                    tier = "online";
                    matchReasons.push("Available online");
                }
            }

            // Online bonus
            if (p.offersOnlineSessions && tier !== "online") {
                matchReasons.push("Also offers online sessions");
            }

            // Specialization scoring (0-30)
            if (conditionSpecs.length > 0 && physioSpecs.length > 0) {
                let specMatches = 0;
                for (const cs of conditionSpecs) {
                    if (physioSpecs.some((ps) => ps.includes(cs) || cs.includes(ps))) {
                        specMatches++;
                    }
                }
                specScore = Math.min(30, Math.round((specMatches / Math.min(conditionSpecs.length, 3)) * 30));
                if (specMatches > 0) {
                    matchReasons.push("Specializes in your condition");
                }
            }

            // Complex condition bonus for experienced physios
            if (conditionLevel === "complex" && (p.yearsOfExperience || 0) >= 5) {
                specScore = Math.min(30, specScore + 5);
                matchReasons.push("Experienced with complex cases");
            }

            if (isVerified) matchReasons.push("Verified professional");
            if ((p.averageRating || 0) >= 4.5 && (p.reviewCount || 0) >= 3) {
                matchReasons.push("Highly rated");
            }

            const totalScore = locationScore + specScore + verifyScore + ratingScore + onlineScore + expScore;

            return {
                id: p.userId,
                profileId: p._id,
                fullName: `${p.user.firstName} ${p.user.lastName}`,
                firstName: p.user.firstName,
                lastName: p.user.lastName,
                imageUrl: p.user.imageUrl,
                credentials: [
                    p.certificationBoard,
                    p.licenseNumber ? "Licensed Physiotherapist" : null,
                ].filter(Boolean),
                bio: p.bio,
                specializations: p.specializations || [],
                yearsOfExperience: p.yearsOfExperience || 0,
                location: p.location,
                hasLocation: hasPhysioLocation,
                hourlyRate: p.hourlyRate ? p.hourlyRate / 100 : 0,
                initialConsultRate: p.initialConsultRate ? p.initialConsultRate / 100 : 0,
                packageRates: (p.packageRates || []).map((pkg) => ({
                    ...pkg,
                    price: pkg.price / 100,
                })),
                averageRating: p.averageRating || 0,
                reviewCount: p.reviewCount || 0,
                isVerified,
                verificationBadge: p.verificationBadge,
                offersOnlineSessions: p.offersOnlineSessions || false,
                offersInPersonSessions: p.offersInPersonSessions || false,
                profileViews: p.profileViews || 0,
                // Matching data
                matchScore: totalScore,
                matchTier: tier,
                matchReasons,
            };
        });

        // Sort by score descending
        scoredPhysios.sort((a, b) => b.matchScore - a.matchScore);

        // Group by tier
        const bestMatches = scoredPhysios.filter((p) => p.matchTier === "best_match");
        const regional = scoredPhysios.filter((p) => p.matchTier === "regional");
        const online = scoredPhysios.filter((p) => p.matchTier === "online");
        const nationwide = scoredPhysios.filter((p) => p.matchTier === "nationwide");

        // Determine the city label for display
        const cityLabel = CITIES_MAP[cityKey]?.label || "your area";

        // Count physios with/without location set
        const physiosWithLocation = scoredPhysios.filter((p) => p.hasLocation).length;
        const physiosWithoutLocation = scoredPhysios.filter((p) => !p.hasLocation).length;

        // Build a clear, honest fallback message
        let fallbackMessage = null;
        if (bestMatches.length === 0 && regional.length === 0) {
            const parts = [];
            parts.push(`We don't have physiotherapists in ${cityLabel} yet.`);
            if (physiosWithoutLocation > 0) {
                parts.push(`${physiosWithoutLocation} of ${scoredPhysios.length} physios haven't set their location — they may be near you.`);
            }
            if (online.length > 0) {
                parts.push(`${online.length} physiotherapist${online.length > 1 ? 's are' : ' is'} available for online sessions.`);
            }
            fallbackMessage = parts.join(' ');
        }

        return {
            bestMatches,
            regional,
            online,
            nationwide,
            totalMatches: scoredPhysios.length,
            cityLabel,
            conditionLabel,
            conditionLevel,
            // Summary for the UI
            summary: {
                inArea: bestMatches.length,
                inRegion: regional.length,
                availableOnline: online.length,
                otherPhysios: nationwide.length,
                physiosWithLocation,
                physiosWithoutLocation,
                hasLocalMatches: bestMatches.length > 0,
                fallbackMessage,
            },
        };
    },
});

/**
 * Save patient treatment preferences from start-treatment flow.
 * Called after sign-up to persist the patient's location/condition.
 */
export const savePatientTreatmentPrefs = mutation({
    args: {
        cityKey: v.string(),
        areaIndex: v.number(),
        areaLabel: v.string(),
        conditionLabel: v.string(),
        conditionLevel: v.string(),
        sessionRate: v.number(),
    },

    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        // Gracefully skip if not authenticated — user can browse matches without signing up
        if (!identity) return { success: false, reason: "not_authenticated" };

        // Find the user
        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .first();

        if (!user) throw new Error("User not found");

        // Auto-set role to patient if not set
        if (!user.role) {
            await ctx.db.patch(user._id, {
                role: "patient",
                onboarded: true,
            });
        }

        // Find or create patient profile
        let patientProfile = await ctx.db
            .query("patientProfiles")
            .withIndex("by_user_id", (q) => q.eq("userId", user._id))
            .first();

        if (patientProfile) {
            // Update existing profile with treatment prefs
            await ctx.db.patch(patientProfile._id, {
                city: args.cityKey,
                address: args.areaLabel,
                country: "Nigeria",
            });
        } else {
            // Create new patient profile
            const profileId = await ctx.db.insert("patientProfiles", {
                userId: user._id,
                city: args.cityKey,
                address: args.areaLabel,
                country: "Nigeria",
            });

            // Link profile to user
            await ctx.db.patch(user._id, {
                patientProfileId: profileId,
                onboarded: true,
            });
        }

        return { success: true };
    },
});
