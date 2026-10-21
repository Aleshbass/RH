/**
 * Rehabify's standard price and payout schedule (pricing model of Oct 2026).
 *
 * Patients see the price; physiotherapists see their payout; admins edit both in
 * Admin › Pricing. Every save is a new version, so bookings record the version they were
 * priced at and existing bookings never change. Defaults: lib/rehabify-services.ts.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureUserRole, getAuthenticatedUser } from "./auth";
import {
  BOOKABLE_SERVICE_IDS,
  REHABIFY_SERVICES,
  isBookableServiceId,
  quoteService,
  type ServiceTariff,
} from "../lib/rehabify-services";
import { loadPricingSettings, loadTariffs } from "./helpers/rehabifyPricing";
import { NETWORK_TERMS_VERSION } from "../lib/rehabify-network-terms";

/** Public: what each service costs patients (no payouts). */
export const getCatalogue = query({
  args: {},
  handler: async (ctx) => {
    const { version, tariffs } = await loadTariffs(ctx);
    return {
      version,
      services: REHABIFY_SERVICES.map((service) => {
        const tariff = isBookableServiceId(service.id) ? tariffs[service.id] : null;
        return {
          id: service.id,
          name: service.name,
          shortName: service.shortName,
          mode: service.mode,
          kind: service.kind,
          durationMinutes: service.durationMinutes,
          durationLabel: service.durationLabel,
          bookable: service.bookable && Boolean(tariff?.active),
          requiresPriorAssessment: service.requiresPriorAssessment,
          priceKobo: tariff?.priceKobo ?? 0,
          travelApplies: tariff?.travelApplies ?? false,
          offeredUnderAccess: tariff?.assistedPriceKobo !== undefined && tariff?.assistedPayoutKobo !== undefined,
          summary: service.summary,
          whatHappens: service.whatHappens,
          youReceive: service.youReceive,
          notIncluded: service.notIncluded ?? null,
        };
      }),
    };
  },
});

/** Physiotherapists (and admins): the payout schedule they work under. */
export const getPayoutSchedule = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "physiotherapist" && user.role !== "admin") return null;
    const { version, tariffs } = await loadTariffs(ctx);
    return {
      version,
      // Version 0 is the built-in working figures: physios see "being confirmed" until an admin publishes
      confirmed: version >= 1,
      services: BOOKABLE_SERVICE_IDS.map((id) => {
        const service = REHABIFY_SERVICES.find((s) => s.id === id)!;
        const tariff = tariffs[id];
        return {
          id,
          name: service.name,
          mode: service.mode,
          durationLabel: service.durationLabel,
          active: tariff.active,
          priceKobo: tariff.priceKobo,
          payoutKobo: tariff.payoutKobo,
          travelApplies: tariff.travelApplies,
          assistedPriceKobo: tariff.assistedPriceKobo ?? null,
          assistedPayoutKobo: tariff.assistedPayoutKobo ?? null,
        };
      }),
    };
  },
});

/** Admin: the tariff in force with Rehabify's margin per service, plus the version history. */
export const adminGetTariffs = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    const { version, tariffs } = await loadTariffs(ctx);
    const history = await ctx.db.query("serviceTariffs").withIndex("by_version").order("desc").take(20);
    const settings = await loadPricingSettings(ctx);
    return {
      version,
      settings,
      services: BOOKABLE_SERVICE_IDS.map((id) => {
        const service = REHABIFY_SERVICES.find((s) => s.id === id)!;
        const tariff = tariffs[id];
        const margin = (assisted: boolean) => {
          try {
            // Margin before travel (zones vary) and before any partner commission
            const quote = quoteService({
              serviceId: id,
              tariffs: { ...tariffs, [id]: { ...tariff, active: true, travelApplies: false } },
              zone: service.mode === "home" ? { name: "", surchargeKobo: 0 } : null,
              assisted,
            });
            return { rehabifyKobo: quote.rehabifyKobo, feeEstimateKobo: quote.feeEstimateKobo };
          } catch {
            return null;
          }
        };
        return {
          id,
          name: service.name,
          mode: service.mode,
          durationLabel: service.durationLabel,
          ...tariff,
          assistedPriceKobo: tariff.assistedPriceKobo ?? null,
          assistedPayoutKobo: tariff.assistedPayoutKobo ?? null,
          standardMargin: margin(false),
          assistedMargin: margin(true),
        };
      }),
      history: history.map((row) => ({
        version: row.version,
        createdAt: row.createdAt,
        createdBy: row.createdBy ?? null,
        note: row.note ?? null,
      })),
    };
  },
});

const tariffRow = v.object({
  serviceId: v.string(),
  priceKobo: v.number(),
  payoutKobo: v.number(),
  assistedPriceKobo: v.optional(v.number()),
  assistedPayoutKobo: v.optional(v.number()),
  travelApplies: v.boolean(),
  active: v.boolean(),
});

/** Admin: publish a new version of the price and payout schedule. New bookings use it at once. */
export const adminSaveTariffs = mutation({
  args: { tariffs: v.array(tariffRow), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const seen = new Set<string>();
    const rows: (ServiceTariff & { serviceId: string })[] = [];
    for (const row of args.tariffs) {
      if (!isBookableServiceId(row.serviceId)) throw new ConvexError(`Unknown service: ${row.serviceId}`);
      if (seen.has(row.serviceId)) throw new ConvexError("Each service can only appear once");
      seen.add(row.serviceId);
      const name = REHABIFY_SERVICES.find((s) => s.id === row.serviceId)!.name;
      const amounts = [row.priceKobo, row.payoutKobo, row.assistedPriceKobo, row.assistedPayoutKobo].filter(
        (value): value is number => value !== undefined
      );
      if (amounts.some((value) => !Number.isInteger(value) || value < 0)) {
        throw new ConvexError(`${name}: amounts must be whole naira, ₦0 or more`);
      }
      if (row.priceKobo <= 0) throw new ConvexError(`${name}: the price must be more than ₦0`);
      if (row.payoutKobo > row.priceKobo) throw new ConvexError(`${name}: the payout can't be more than the price`);
      if ((row.assistedPriceKobo === undefined) !== (row.assistedPayoutKobo === undefined)) {
        throw new ConvexError(`${name}: set both the Access price and the Access payout, or neither`);
      }
      if (row.assistedPriceKobo !== undefined && row.assistedPriceKobo > row.priceKobo) {
        throw new ConvexError(`${name}: the Access price can't be more than the standard price`);
      }
      const isHome = REHABIFY_SERVICES.find((s) => s.id === row.serviceId)!.mode === "home";
      rows.push({ ...row, travelApplies: isHome && row.travelApplies });
    }
    const { version } = await loadTariffs(ctx);
    const createdBy = `${admin.firstName || ""} ${admin.lastName || ""}`.trim() || admin.email || "Admin";
    await ctx.db.insert("serviceTariffs", {
      version: version + 1,
      tariffs: rows,
      note: args.note?.trim().slice(0, 300) || undefined,
      createdAt: Date.now(),
      createdBy,
    });
    return { version: version + 1 };
  },
});

/**
 * Admin: rollout readiness for standard pricing. Which approved physios have accepted the
 * network terms and set coverage, and who would stop being bookable once terms are enforced
 * (or is already excluded as a clinic member).
 */
export const adminNetworkReadiness = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    const approvals = await ctx.db.query("accountApprovalStatus").collect();
    const approved = new Set(approvals.filter((a) => a.status === "approved").map((a) => a.userId));
    const profiles = await ctx.db.query("physiotherapistProfiles").collect();
    const rows = [];
    for (const profile of profiles) {
      if (!approved.has(profile.userId)) continue;
      const user = await ctx.db.get(profile.userId);
      if (!user || user.role !== "physiotherapist") continue;
      const homeWithoutZones = Boolean(profile.offersInPersonSessions) && (profile.coveredZoneIds?.length ?? 0) === 0;
      rows.push({
        userId: profile.userId,
        name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "Physiotherapist",
        email: user.email ?? null,
        listed: profile.isAvailableOnMarketplace !== false,
        clinicMember: Boolean(profile.clinicId),
        acceptedTerms: profile.networkTerms?.version === NETWORK_TERMS_VERSION,
        acceptedAt: profile.networkTerms?.acceptedAt ?? null,
        accessOptIn: Boolean(profile.networkTerms?.accessOptIn),
        offersVideo: profile.offersOnlineSessions !== false,
        offersHome: Boolean(profile.offersInPersonSessions),
        homeWithoutZones,
      });
    }
    const listed = rows.filter((row) => row.listed && !row.clinicMember);
    return {
      termsVersion: NETWORK_TERMS_VERSION,
      physios: rows.sort((a, b) => Number(a.acceptedTerms) - Number(b.acceptedTerms) || a.name.localeCompare(b.name)),
      totals: {
        approved: rows.length,
        listed: listed.length,
        accepted: listed.filter((row) => row.acceptedTerms).length,
        wouldBeDelisted: listed.filter((row) => !row.acceptedTerms).length,
        clinicMembersExcluded: rows.filter((row) => row.clinicMember && row.listed).length,
        homeWithoutZones: listed.filter((row) => row.homeWithoutZones).length,
        accessOptIns: listed.filter((row) => row.accessOptIn).length,
      },
    };
  },
});

/** Admin: Rehabify Access capacity and intake, and the network-terms enforcement date. */
export const adminSavePricingSettings = mutation({
  args: {
    accessCapacity: v.number(),
    accessIntakeOpen: v.boolean(),
    networkTermsEnforcedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    if (!Number.isInteger(args.accessCapacity) || args.accessCapacity < 0 || args.accessCapacity > 10_000) {
      throw new ConvexError("Capacity must be a whole number between 0 and 10,000");
    }
    // Access opens only on rates an admin has set: a published version with Access prices
    if (args.accessIntakeOpen) {
      const { version, tariffs } = await loadTariffs(ctx);
      const hasAccessRates = BOOKABLE_SERVICE_IDS.some(
        (id) => tariffs[id].active && tariffs[id].assistedPriceKobo !== undefined && tariffs[id].assistedPayoutKobo !== undefined
      );
      if (version < 1 || !hasAccessRates) {
        throw new ConvexError(
          "Set the Rehabify Access price and payout for at least one service and publish them first, then turn Access on."
        );
      }
    }
    const updatedBy = `${admin.firstName || ""} ${admin.lastName || ""}`.trim() || admin.email || "Admin";
    const values = { ...args, updatedAt: Date.now(), updatedBy };
    const existing = await ctx.db.query("rehabifyPricingSettings").order("desc").first();
    if (existing) await ctx.db.replace(existing._id, values);
    else await ctx.db.insert("rehabifyPricingSettings", values);
    return { success: true };
  },
});
