import { ConvexError, v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { ensureUserRole } from "./auth";
import { DEFAULT_CLINIC_FEE_CONFIG, normalizeClinicFeeConfig, type ClinicFeeConfig } from "./clinicFees";

/** The fee numbers in force: the admin's saved settings, or the defaults. */
export async function loadClinicFeeConfig(ctx: QueryCtx): Promise<ClinicFeeConfig> {
  const saved = await ctx.db.query("clinicFeeSettings").order("desc").first();
  return normalizeClinicFeeConfig(saved);
}

/**
 * Current clinic fee numbers, for signed-in users: clinics show them in their payment forms,
 * and they update live when an admin changes them. Signed-out visitors (the clinic dashboard
 * preview) get null and the UI falls back to the defaults.
 */
export const getClinicFeeSettings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const saved = await ctx.db.query("clinicFeeSettings").order("desc").first();
    return {
      ...normalizeClinicFeeConfig(saved),
      isCustom: saved !== null,
      updatedAt: saved?.updatedAt ?? null,
      updatedBy: saved?.updatedBy ?? null,
    };
  },
});

/** Admin only. New payment requests use the new numbers; existing invoices keep theirs. */
export const updateClinicFeeSettings = mutation({
  args: {
    clinicSharePercent: v.number(),
    paystackPercent: v.number(),
    paystackFlatKobo: v.number(),
    paystackFlatWaivedBelowKobo: v.number(),
    paystackFeeCapKobo: v.number(),
    stampDutyKobo: v.number(),
    stampDutyFromKobo: v.number(),
  },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);

    const checks: [boolean, string][] = [
      [args.clinicSharePercent >= 0 && args.clinicSharePercent <= 100, "Clinic share must be between 0% and 100%"],
      [args.paystackPercent >= 0 && args.paystackPercent <= 20, "Paystack percentage must be between 0% and 20%"],
      [args.paystackFlatKobo >= 0, "Paystack flat fee can't be negative"],
      [args.paystackFlatWaivedBelowKobo >= 0, "The waiver threshold can't be negative"],
      [args.paystackFeeCapKobo > 0, "Paystack fee cap must be more than ₦0"],
      [args.stampDutyKobo >= 0, "Stamp duty can't be negative"],
      [args.stampDutyFromKobo >= 0, "The stamp duty threshold can't be negative"],
    ];
    if (Object.values(args).some((value) => !Number.isFinite(value))) {
      throw new ConvexError("Every value must be a number");
    }
    for (const [ok, message] of checks) {
      if (!ok) throw new ConvexError(message);
    }

    const values: ClinicFeeConfig = {
      clinicSharePercent: Math.round(args.clinicSharePercent * 100) / 100,
      paystackPercent: Math.round(args.paystackPercent * 1000) / 1000,
      paystackFlatKobo: Math.round(args.paystackFlatKobo),
      paystackFlatWaivedBelowKobo: Math.round(args.paystackFlatWaivedBelowKobo),
      paystackFeeCapKobo: Math.round(args.paystackFeeCapKobo),
      stampDutyKobo: Math.round(args.stampDutyKobo),
      stampDutyFromKobo: Math.round(args.stampDutyFromKobo),
    };
    const updatedBy = `${admin.firstName || ""} ${admin.lastName || ""}`.trim() || admin.email || "Admin";
    const now = Date.now();

    const existing = await ctx.db.query("clinicFeeSettings").order("desc").first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...values, updatedAt: now, updatedBy });
    } else {
      await ctx.db.insert("clinicFeeSettings", { ...values, updatedAt: now, updatedBy });
    }
    return { success: true };
  },
});

/** Admin only: go back to Paystack's standard rates and an 80/20 split. */
export const resetClinicFeeSettings = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const updatedBy = `${admin.firstName || ""} ${admin.lastName || ""}`.trim() || admin.email || "Admin";
    const existing = await ctx.db.query("clinicFeeSettings").order("desc").first();
    const values = { ...DEFAULT_CLINIC_FEE_CONFIG, updatedAt: Date.now(), updatedBy };
    if (existing) {
      await ctx.db.patch(existing._id, values);
    } else {
      await ctx.db.insert("clinicFeeSettings", values);
    }
    return { success: true };
  },
});
