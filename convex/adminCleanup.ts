/**
 * Test accounts to clear out before launch (Admin › Marketplace listing). The list is a guess
 * from names, emails and seeded test providers; an admin ticks the ones to remove and confirms.
 * Nothing is deleted without that. Accounts with real (live) payments are never deleted here:
 * their money records must stay, so they're listed with the reason and left alone.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin } from "./helpers/partnerAccess";
import { personName } from "./helpers/patientFacts";

// Whole words only, so real names like Testimony aren't caught
const WORD = /\b(test|tester|testing|demo|dummy|fake|sample|asdf|qwerty|lorem)\d*\b/i;
const THROWAWAY_DOMAINS = /@(example\.(com|org|net)|test\.(com|ng)|mailinator\.com|yopmail\.com|sharklasers\.com|guerrillamail\.com|tempmail\.\w+|10minutemail\.\w+)$/i;
const SEEDED = ["joy-test-seed:"];
// Clinic accounts are left out: deleting an owner would orphan their clinic, its team and patients
const ROLES = new Set(["patient", "physiotherapist", "family_member", "doctor"]);

function testReasons(user: Doc<"users">): string[] {
  const reasons: string[] = [];
  const name = personName(user, "");
  const email = (user.email ?? "").toLowerCase();
  if (SEEDED.some((prefix) => String(user.clerkId ?? "").startsWith(prefix))) reasons.push("Seeded Joy test provider");
  if (name && WORD.test(name)) reasons.push(`Name "${name}"`);
  const local = email.split("@")[0] ?? "";
  if (local && WORD.test(local.replace(/[._+-]/g, " "))) reasons.push("Email looks like a test");
  if (THROWAWAY_DOMAINS.test(email)) reasons.push("Throwaway email domain");
  return reasons;
}

async function livePaidBookings(ctx: QueryCtx, user: Doc<"users">) {
  const asPatient = await ctx.db.query("marketplaceBookings").withIndex("by_patient", (q) => q.eq("patientId", user._id)).take(50);
  const asPhysio = await ctx.db.query("marketplaceBookings").withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", user._id)).take(50);
  return [...asPatient, ...asPhysio].filter((b) => b.paymentStatus === "completed" && b.paystackMode !== "test").length;
}

/** Accounts that look like tests, newest first, with why and whether they're on Find a Physio. */
export const listTestCandidates = query({
  args: {},
  handler: async (ctx) => {
    const { user: me } = await requireAdmin(ctx);
    const users = await ctx.db.query("users").order("desc").take(3000);
    const rows = [];
    for (const user of users) {
      if (user.deletedAt || user._id === me._id || !ROLES.has(user.role ?? "")) continue;
      const reasons = testReasons(user);
      if (reasons.length === 0) continue;
      const profile =
        user.role === "physiotherapist"
          ? await ctx.db.query("physiotherapistProfiles").withIndex("by_user_id", (q) => q.eq("userId", user._id)).first()
          : null;
      const livePayments = await livePaidBookings(ctx, user);
      rows.push({
        userId: user._id,
        name: personName(user, "No name"),
        email: user.email ?? null,
        role: user.role ?? "user",
        rehabifyId: user.patientNumber ?? user.staffNumber ?? null,
        joinedAt: user._creationTime,
        onMarketplace: Boolean(profile?.isAvailableOnMarketplace),
        livePayments,
        reasons,
      });
    }
    return rows;
  },
});

async function deleteAccount(ctx: MutationCtx, user: Doc<"users">) {
  // Profiles, by pointer and by index (older rows only have one or the other)
  const profileIds = new Set<string>();
  const drop = async (id: Id<"patientProfiles"> | Id<"physiotherapistProfiles"> | Id<"clinicOwnerProfiles"> | undefined) => {
    if (!id || profileIds.has(id)) return;
    profileIds.add(id);
    if (await ctx.db.get(id)) await ctx.db.delete(id);
  };
  await drop(user.patientProfileId);
  await drop(user.physiotherapistProfileId);
  await drop(user.clinicOwnerProfileId);
  for (const p of await ctx.db.query("patientProfiles").withIndex("by_user_id", (q) => q.eq("userId", user._id)).collect()) await drop(p._id);
  for (const p of await ctx.db.query("physiotherapistProfiles").withIndex("by_user_id", (q) => q.eq("userId", user._id)).collect()) await drop(p._id);

  for (const a of await ctx.db.query("accountApprovalStatus").withIndex("by_user_id", (q) => q.eq("userId", user._id)).collect()) await ctx.db.delete(a._id);
  // Links to physios or patients, so no one keeps a deleted test account on their list
  for (const r of await ctx.db.query("patientPhysiotherapistRelationships").withIndex("by_patient", (q) => q.eq("patientId", user._id)).collect()) await ctx.db.delete(r._id);
  for (const r of await ctx.db.query("patientPhysiotherapistRelationships").withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", user._id)).collect()) await ctx.db.delete(r._id);
  // Their open "looking for care" items
  for (const s of await ctx.db.query("careSignals").withIndex("by_patient_kind", (q) => q.eq("patientId", user._id)).collect()) await ctx.db.delete(s._id);
  await ctx.db.delete(user._id);
}

/** Delete the accounts an admin ticked. Admins, yourself and anyone with live payments are skipped. */
export const deleteTestAccounts = mutation({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, args) => {
    const { user: me } = await requireAdmin(ctx);
    if (args.userIds.length > 100) throw new ConvexError("Delete up to 100 accounts at a time.");
    const deleted: string[] = [];
    const skipped: { name: string; reason: string }[] = [];
    for (const id of args.userIds) {
      const user = await ctx.db.get(id);
      if (!user) continue;
      const name = personName(user, user.email ?? "Account");
      if (user._id === me._id) skipped.push({ name, reason: "That's you" });
      else if (user.role === "admin") skipped.push({ name, reason: "Admin account" });
      else if ((await livePaidBookings(ctx, user)) > 0) skipped.push({ name, reason: "Has real payments, so its records must stay" });
      else {
        await deleteAccount(ctx, user);
        deleted.push(name);
      }
    }
    return { deleted, skipped };
  },
});
