/**
 * Small queries that power the admin console chrome (sidebar badges, command palette).
 * Everything here is admin-only and reads through indexes with hard caps, so the
 * sidebar stays cheap no matter how big the tables grow.
 */
import { v } from "convex/values";
import { query } from "./_generated/server";
import { ensureUserRole } from "./auth";
import { partnerApprovalStatus } from "./helpers/partnerShared";

const BADGE_CAP = 100;

export const getNavBadges = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);

    const [approvals, pendingReports, reviewingReports, pendingBookings, partners] = await Promise.all([
      ctx.db
        .query("accountApprovalStatus")
        .withIndex("by_status", (q) => q.eq("status", "pending_review"))
        .take(BADGE_CAP),
      ctx.db
        .query("physiotherapistReports")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .take(BADGE_CAP),
      ctx.db
        .query("physiotherapistReports")
        .withIndex("by_status", (q) => q.eq("status", "under_review"))
        .take(BADGE_CAP),
      ctx.db
        .query("marketplaceBookings")
        .withIndex("by_payment_status", (q) => q.eq("paymentStatus", "pending"))
        .order("desc")
        .take(BADGE_CAP * 2),
      // Partners is a small, admin-curated table
      ctx.db.query("partners").take(500),
    ]);

    const bankTransfers = pendingBookings.filter(
      (b) => b.physiotherapistId && b.bookingStatus !== "cancelled"
    ).length;

    return {
      approvals: approvals.length,
      openReports: pendingReports.length + reviewingReports.length,
      bankTransfers: Math.min(bankTransfers, BADGE_CAP),
      partnerApplications: partners.filter((p) => partnerApprovalStatus(p) === "pending").length,
      cap: BADGE_CAP,
    };
  },
});

/** Quick people search for the command palette. Matches name or email prefix. */
export const searchPeople = query({
  args: { term: v.string() },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const term = args.term.trim().toLowerCase();
    if (term.length < 2) return [];

    const results: { _id: string; name: string; email: string; role: string; imageUrl?: string }[] = [];
    const seen = new Set<string>();
    const push = (u: { _id: string; firstName?: string; lastName?: string; email?: string; role?: string; imageUrl?: string }) => {
      if (seen.has(u._id) || results.length >= 8) return;
      seen.add(u._id);
      results.push({
        _id: u._id,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Unnamed",
        email: u.email ?? "",
        role: u.role ?? "user",
        imageUrl: u.imageUrl,
      });
    };

    if (term.includes("@")) {
      const exact = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.term.trim()))
        .take(1);
      exact.forEach(push);
    }

    // Bounded scan of the most recent accounts. Good enough for a jump-to search.
    const recent = await ctx.db.query("users").order("desc").take(2000);
    for (const u of recent) {
      const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase();
      if (name.includes(term) || (u.email ?? "").toLowerCase().includes(term)) push(u);
      if (results.length >= 8) break;
    }
    return results;
  },
});
