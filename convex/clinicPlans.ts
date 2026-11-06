/**
 * Clinic plan prices and wording, editable by admins (Admin › Clinic plans). The website's clinic
 * page and the admin subscription tab read publicCatalogue; billing reads loadClinicPlans when an
 * admin puts a clinic on a plan. A clinic already on a plan keeps its fee until an admin changes
 * its plan (the subscription stores its own numbers).
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireAdmin } from "./helpers/partnerAccess";
import { mergeClinicPlans, UNLIMITED_SEATS, type ClinicPlanCatalogue, type SavedClinicPlans } from "../lib/clinicPlans";

export async function loadClinicPlans(ctx: QueryCtx): Promise<ClinicPlanCatalogue> {
  const saved = await ctx.db.query("clinicPlanSettings").order("desc").first();
  return mergeClinicPlans(saved ? { plans: saved.plans, includes: saved.includes, excludes: saved.excludes } : null);
}

/** No sign-in needed: the website's clinic page. */
export const publicCatalogue = query({
  args: {},
  handler: async (ctx) => loadClinicPlans(ctx),
});

export const adminGet = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const saved = await ctx.db.query("clinicPlanSettings").order("desc").first();
    return {
      catalogue: await loadClinicPlans(ctx),
      updatedAt: saved?.updatedAt ?? null,
      updatedByName: saved?.updatedByName ?? null,
      unlimitedSeats: UNLIMITED_SEATS,
    };
  },
});

const planInput = v.object({
  id: v.union(v.literal("starter"), v.literal("growth"), v.literal("enterprise")),
  name: v.string(),
  monthlyFeeNaira: v.optional(v.number()),
  priceNote: v.string(),
  features: v.array(v.string()),
  unlimitedSeats: v.optional(v.boolean()),
  seatLimit: v.optional(v.number()),
  patientAllowance: v.optional(v.number()),
  featured: v.boolean(),
});

export const adminSave = mutation({
  args: { plans: v.array(planInput), includes: v.array(v.string()), excludes: v.array(v.string()) },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx);
    const clean = (s: string, max: number) => s.trim().slice(0, max);
    const plans: SavedClinicPlans["plans"] = [];
    for (const p of args.plans) {
      const name = clean(p.name, 60);
      if (!name) throw new ConvexError("Every plan needs a name.");
      const features = p.features.map((f) => clean(f, 160)).filter(Boolean).slice(0, 8);
      if (p.id === "enterprise") {
        plans.push({ id: p.id, name, priceNote: clean(p.priceNote, 60), features, featured: p.featured });
        continue;
      }
      const fee = p.monthlyFeeNaira;
      if (typeof fee !== "number" || !Number.isFinite(fee) || fee < 0 || fee > 100_000_000) {
        throw new ConvexError(`Enter ${name}'s monthly price in naira.`);
      }
      const seats = p.unlimitedSeats ? UNLIMITED_SEATS : p.seatLimit;
      if (typeof seats !== "number" || !Number.isInteger(seats) || seats < 1 || seats > UNLIMITED_SEATS) {
        throw new ConvexError(`Enter ${name}'s clinician seats, or choose unlimited.`);
      }
      const allowance = p.patientAllowance;
      if (typeof allowance !== "number" || !Number.isInteger(allowance) || allowance < 0 || allowance > 1_000_000) {
        throw new ConvexError(`Enter how many patients ${name} covers.`);
      }
      plans.push({
        id: p.id,
        name,
        monthlyFeeKobo: Math.round(fee * 100),
        priceNote: clean(p.priceNote, 60),
        features,
        seatLimit: seats,
        programmeAllowance: allowance,
        featured: p.featured,
      });
    }
    const list = (items: string[]) => items.map((s) => clean(s, 160)).filter(Boolean).slice(0, 20);
    await ctx.db.insert("clinicPlanSettings", {
      plans,
      includes: list(args.includes),
      excludes: list(args.excludes),
      updatedAt: Date.now(),
      updatedBy: user._id,
      updatedByName: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Admin",
    });
    return { ok: true };
  },
});
