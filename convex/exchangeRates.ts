/**
 * Naira exchange rates, for showing people outside Nigeria roughly what a Naira price is in their
 * own currency ("₦25,000, about GH₵190"). Paystack always charges in Naira; the payer's card
 * provider converts at its own rate, which follows the official market. So these are official
 * mid-market rates (not parallel-market ones), refreshed once a day from ExchangeRate-API's open
 * endpoint (no key; attribution shown next to the estimate). Display only: never used to charge.
 */
import { v } from "convex/values";
import { internalAction, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { PRACTICE_COUNTRIES } from "../lib/practiceCountries";
import { currentUser } from "./helpers/careAccess";
import { practiceForUser } from "./physioSetup";

const SOURCE_URL = "https://open.er-api.com/v6/latest/NGN";
/** Older than this and the estimate is hidden rather than shown wrong. */
const MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;

/** The currencies of the countries a physio can practise in, other than Naira. */
function wantedCurrencies(): string[] {
  return [...new Set(PRACTICE_COUNTRIES.map((c) => c.currency))].filter((c) => c !== "NGN");
}

/** Daily (crons.ts): fetch today's rates and keep one row per currency. */
export const refresh = internalAction({
  args: {},
  handler: async (ctx): Promise<{ saved: number }> => {
    const response = await fetch(SOURCE_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Exchange rates: HTTP ${response.status}`);
    const data = (await response.json()) as { result?: string; base_code?: string; rates?: Record<string, number> };
    if (data.result !== "success" || data.base_code !== "NGN" || !data.rates) throw new Error("Exchange rates: unexpected answer");
    const rates = wantedCurrencies()
      .map((currency) => ({ currency, rate: Number(data.rates?.[currency]) }))
      // Units of the currency per ₦1: always a small positive number
      .filter((r) => Number.isFinite(r.rate) && r.rate > 0 && r.rate < 100);
    if (rates.length === 0) throw new Error("Exchange rates: none usable");
    await ctx.runMutation(internal.exchangeRates.save, { rates, source: "ExchangeRate-API" });
    return { saved: rates.length };
  },
});

export const save = internalMutation({
  args: { rates: v.array(v.object({ currency: v.string(), rate: v.number() })), source: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const { currency, rate } of args.rates) {
      const existing = await ctx.db
        .query("exchangeRates")
        .withIndex("by_currency", (q) => q.eq("currency", currency))
        .first();
      const row = { base: "NGN", currency, rate, source: args.source, fetchedAt: now };
      if (existing) await ctx.db.patch(existing._id, row);
      else await ctx.db.insert("exchangeRates", row);
    }
  },
});

/**
 * The signed-in person's currency and today's rate from Naira, when they're outside Nigeria (a
 * physio practising there, or a patient of one). Null in Nigeria, signed out, or with no fresh rate.
 */
export const getMyNairaRate = query({
  args: {},
  handler: async (ctx): Promise<{ currency: string; perNaira: number; fetchedAt: number } | null> => {
    const user = await currentUser(ctx);
    if (!user) return null;
    const practice = await practiceForUser(ctx, user);
    if (practice.currency === "NGN") return null;
    const row = await ctx.db
      .query("exchangeRates")
      .withIndex("by_currency", (q) => q.eq("currency", practice.currency))
      .first();
    if (!row || Date.now() - row.fetchedAt > MAX_AGE_MS) return null;
    return { currency: row.currency, perNaira: row.rate, fetchedAt: row.fetchedAt };
  },
});
