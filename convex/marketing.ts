/**
 * Marketing emails (Admin › Email campaigns).
 *
 * Group audiences (everyone, patients, physiotherapists, clinics, partners, added contacts) are sent
 * as Resend Broadcasts: they don't count against the Resend free plan's 100 transactional emails a
 * day, Resend handles unsubscribes, and the free plan covers up to 1,000 contacts a month. Each
 * segment has its own Resend audience, kept in sync in small throttled chunks before sending.
 *
 * "One person or a few" uses the normal sending API through a queue, in batches, capped per UTC
 * day (MARKETING_DIRECT_DAILY_LIMIT, default 50) so marketing never crowds out appointment emails.
 * The sending itself happens in actions/marketingSend.ts.
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAdmin } from "./helpers/partnerAccess";
import { partnerApprovalStatus } from "./helpers/partnerShared";
import { isJoyLoginEmail } from "../lib/auth/joyLoginEmail";
import { MARKETING_SEGMENTS, type MarketingSegment } from "../lib/email/marketing";

type Recipient = { email: string; name?: string };
type Content = {
  subject: string;
  previewText?: string;
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  imageUrl?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_INDIVIDUAL = 50;

const audience = v.union(
  v.literal("everyone"),
  v.literal("patients"),
  v.literal("physiotherapists"),
  v.literal("clinics"),
  v.literal("partners"),
  v.literal("contacts"),
  v.literal("individual")
);
const segment = v.union(v.literal("patients"), v.literal("physiotherapists"), v.literal("clinics"), v.literal("partners"), v.literal("contacts"));

const content = {
  subject: v.string(),
  previewText: v.optional(v.string()),
  heading: v.string(),
  body: v.string(),
  ctaLabel: v.optional(v.string()),
  ctaUrl: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
};

// Plain references: these modules aren't in the generated api types until the next codegen
const processCampaignRef = makeFunctionReference<"action", { campaignId: Id<"marketingCampaigns"> }, null>(
  "actions/marketingSend:processCampaign"
);
const sendTestRef = makeFunctionReference<"action", { to: string; name?: string } & Content, null>(
  "actions/marketingSend:sendTest"
);
const utcDay = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);
const directDailyLimit = () => Math.max(1, Number(process.env.MARKETING_DIRECT_DAILY_LIMIT) || 50);
const clean = (value: string | undefined, max: number) => (value ?? "").trim().slice(0, max);
const normalEmail = (email: string | undefined | null) => (email ?? "").trim().toLowerCase();
const usable = (email: string) => EMAIL_RE.test(email) && !isJoyLoginEmail(email);

function cleanContent(args: Content) {
  const out = {
    subject: clean(args.subject, 150),
    previewText: clean(args.previewText, 200) || undefined,
    heading: clean(args.heading, 150),
    body: clean(args.body, 10000),
    ctaLabel: clean(args.ctaLabel, 60) || undefined,
    ctaUrl: clean(args.ctaUrl, 500) || undefined,
    imageUrl: clean(args.imageUrl, 500) || undefined,
  };
  if (!out.subject || !out.heading || !out.body) throw new ConvexError("Add a subject, a heading and a message.");
  if (out.ctaUrl && !/^https:\/\//i.test(out.ctaUrl)) throw new ConvexError("The button link must start with https://");
  if (out.ctaUrl && !out.ctaLabel) throw new ConvexError("Give the button a label, or remove its link.");
  if (out.imageUrl && !/^https:\/\//i.test(out.imageUrl)) throw new ConvexError("The image link must start with https://");
  return out;
}

const ROLE_FOR: Partial<Record<MarketingSegment, "patient" | "physiotherapist" | "clinic_owner">> = {
  patients: "patient",
  physiotherapists: "physiotherapist",
  clinics: "clinic_owner",
};

/** Everyone in a segment with a deliverable email. Deleted accounts and Joy placeholder logins are left out. */
async function segmentRecipients(ctx: QueryCtx, seg: MarketingSegment): Promise<Recipient[]> {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  const push = (email: string | undefined | null, name?: string) => {
    const e = normalEmail(email);
    if (!usable(e) || seen.has(e)) return;
    seen.add(e);
    out.push({ email: e, name: name?.trim() || undefined });
  };

  const role = ROLE_FOR[seg];
  if (role) {
    const users = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", role)).collect();
    for (const u of users) if (!u.deletedAt) push(u.email, u.firstName);
    return out;
  }

  if (seg === "partners") {
    const partners = await ctx.db.query("partners").collect();
    for (const p of partners) {
      if (partnerApprovalStatus(p) !== "approved" || !p.isActive) continue;
      push(p.contactEmail || p.ownerEmail, p.contactName?.split(/\s+/)[0]);
    }
    return out;
  }

  // Added contacts: people who aren't already reached through an account or a partner record
  const known = new Set<string>();
  for (const u of await ctx.db.query("users").collect()) if (u.email) known.add(normalEmail(u.email));
  for (const p of await ctx.db.query("partners").collect()) {
    if (p.contactEmail) known.add(normalEmail(p.contactEmail));
    if (p.ownerEmail) known.add(normalEmail(p.ownerEmail));
  }
  for (const c of await ctx.db.query("marketingContacts").collect()) {
    if (!known.has(normalEmail(c.email))) push(c.email, c.name?.split(/\s+/)[0]);
  }
  return out;
}

async function segmentCounts(ctx: QueryCtx) {
  const counts = {} as Record<MarketingSegment, number>;
  const everyone = new Set<string>();
  for (const seg of MARKETING_SEGMENTS) {
    const list = await segmentRecipients(ctx, seg);
    counts[seg] = list.length;
    for (const r of list) everyone.add(r.email);
  }
  return { ...counts, everyone: everyone.size };
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export const adminOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const usage = await ctx.db.query("marketingDailyUsage").withIndex("by_day", (q) => q.eq("day", utcDay())).first();
    return {
      counts: await segmentCounts(ctx),
      directSentToday: usage?.count ?? 0,
      directDailyLimit: directDailyLimit(),
    };
  },
});

export const adminListCampaigns = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const campaigns = await ctx.db.query("marketingCampaigns").withIndex("by_created").order("desc").take(40);
    return Promise.all(
      campaigns.map(async (c) => {
        if (c.audience !== "individual") return { ...c, pendingCount: 0 };
        const pending = await ctx.db
          .query("marketingQueue")
          .withIndex("by_campaign_and_status", (q) => q.eq("campaignId", c._id).eq("status", "pending"))
          .collect();
        return { ...c, pendingCount: pending.length };
      })
    );
  },
});

export const adminListContacts = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const contacts = await ctx.db.query("marketingContacts").collect();
    return contacts.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const adminAddContacts = mutation({
  args: { contacts: v.array(v.object({ email: v.string(), name: v.optional(v.string()) })), tags: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.contacts.length > 1000) throw new ConvexError("Add up to 1,000 contacts at a time.");
    const tags = (args.tags ?? []).map((t) => clean(t, 40)).filter(Boolean).slice(0, 10);
    let added = 0;
    let skipped = 0;
    for (const c of args.contacts) {
      const email = normalEmail(c.email);
      if (!usable(email)) {
        skipped++;
        continue;
      }
      const existing = await ctx.db.query("marketingContacts").withIndex("by_email", (q) => q.eq("email", email)).first();
      if (existing) {
        skipped++;
        continue;
      }
      await ctx.db.insert("marketingContacts", { email, name: clean(c.name, 120) || undefined, tags, createdAt: Date.now() });
      added++;
    }
    return { added, skipped };
  },
});

export const adminRemoveContact = mutation({
  args: { id: v.id("marketingContacts") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.delete(args.id);
    return { success: true };
  },
});

/** People to email one-to-one: name or email search across accounts with a real email. */
export const adminFindPeople = query({
  args: { q: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const q = args.q.trim().toLowerCase();
    if (q.length < 2) return [];
    const users = await ctx.db.query("users").collect();
    const matches: { email: string; name: string; role: string }[] = [];
    for (const u of users) {
      if (u.deletedAt || !u.email || !usable(normalEmail(u.email))) continue;
      const name = [u.firstName, u.lastName].filter(Boolean).join(" ");
      if (normalEmail(u.email).includes(q) || name.toLowerCase().includes(q)) {
        matches.push({ email: normalEmail(u.email), name: name || u.email, role: u.role ?? "user" });
        if (matches.length >= 8) break;
      }
    }
    return matches;
  },
});

export const adminSendTest = mutation({
  args: content,
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const to = normalEmail(admin.user.email);
    if (!usable(to)) throw new ConvexError("Your admin account has no email to send a test to.");
    const cleaned = cleanContent(args);
    await ctx.scheduler.runAfter(0, sendTestRef, { ...cleaned, to, name: admin.user.firstName });
    return { to };
  },
});

export const adminCreateCampaign = mutation({
  args: { ...content, audience, emails: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const cleaned = cleanContent(args);
    const now = Date.now();

    let recipientCount = 0;
    let individuals: Recipient[] = [];
    if (args.audience === "individual") {
      const unique = Array.from(new Set((args.emails ?? []).map(normalEmail))).filter(usable);
      if (unique.length === 0) throw new ConvexError("Add at least one email address.");
      if (unique.length > MAX_INDIVIDUAL) throw new ConvexError(`Send to up to ${MAX_INDIVIDUAL} people this way, or use a group.`);
      individuals = await Promise.all(
        unique.map(async (email) => {
          const user = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).first();
          return { email, name: user?.firstName || undefined };
        })
      );
      recipientCount = individuals.length;
    } else {
      const counts = await segmentCounts(ctx);
      recipientCount = counts[args.audience];
      if (recipientCount === 0) throw new ConvexError("Nobody in this audience has an email address yet.");
    }

    const campaignId = await ctx.db.insert("marketingCampaigns", {
      ...cleaned,
      audience: args.audience,
      status: args.audience === "individual" ? "sending" : "preparing",
      segmentsToSend: args.audience === "everyone" ? [...MARKETING_SEGMENTS] : args.audience === "individual" ? [] : [args.audience],
      broadcastIds: [],
      recipientCount,
      sentCount: 0,
      failedCount: 0,
      createdBy: admin.user._id,
      createdByName: [admin.user.firstName, admin.user.lastName].filter(Boolean).join(" ") || "Admin",
      createdAt: now,
      updatedAt: now,
    });

    for (const r of individuals) {
      await ctx.db.insert("marketingQueue", { campaignId, email: r.email, name: r.name, status: "pending", attempts: 0 });
    }

    await ctx.scheduler.runAfter(0, processCampaignRef, { campaignId });
    return { campaignId, recipientCount };
  },
});

// ── Internal (used by actions/marketingSend.ts) ───────────────────────────────

export const internalGetCampaign = internalQuery({
  args: { campaignId: v.id("marketingCampaigns") },
  handler: async (ctx, args) => ctx.db.get(args.campaignId),
});

export const internalAudienceId = internalQuery({
  args: { segment },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("marketingAudiences").withIndex("by_segment", (q) => q.eq("segment", args.segment)).first();
    return row?.resendAudienceId ?? null;
  },
});

export const internalSaveAudience = internalMutation({
  args: { segment, resendAudienceId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("marketingAudiences").withIndex("by_segment", (q) => q.eq("segment", args.segment)).first();
    if (row) await ctx.db.patch(row._id, { resendAudienceId: args.resendAudienceId });
    else await ctx.db.insert("marketingAudiences", { segment: args.segment, resendAudienceId: args.resendAudienceId, createdAt: Date.now() });
  },
});

/** What a sync still has to do for a segment: who to add to the Resend audience and who to take out. */
export const internalSyncPlan = internalQuery({
  args: { segment, limit: v.number() },
  handler: async (ctx, args) => {
    const desired = await segmentRecipients(ctx, args.segment);
    const members = await ctx.db.query("marketingAudienceMembers").withIndex("by_segment", (q) => q.eq("segment", args.segment)).collect();
    const memberEmails = new Set(members.map((m) => m.email));
    const desiredEmails = new Set(desired.map((d) => d.email));
    const toAdd = desired.filter((d) => !memberEmails.has(d.email));
    const toRemove = members.filter((m) => !desiredEmails.has(m.email)).map((m) => ({ email: m.email, contactId: m.resendContactId ?? null }));
    return {
      toAdd: toAdd.slice(0, args.limit),
      toRemove: toRemove.slice(0, args.limit),
      remaining: toAdd.length + toRemove.length,
      audienceSize: desired.length,
    };
  },
});

export const internalRecordSync = internalMutation({
  args: {
    segment,
    added: v.array(v.object({ email: v.string(), contactId: v.optional(v.string()) })),
    removed: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const a of args.added) {
      const existing = await ctx.db
        .query("marketingAudienceMembers")
        .withIndex("by_segment_and_email", (q) => q.eq("segment", args.segment).eq("email", a.email))
        .first();
      if (!existing) await ctx.db.insert("marketingAudienceMembers", { segment: args.segment, email: a.email, resendContactId: a.contactId, syncedAt: now });
    }
    for (const email of args.removed) {
      const existing = await ctx.db
        .query("marketingAudienceMembers")
        .withIndex("by_segment_and_email", (q) => q.eq("segment", args.segment).eq("email", email))
        .first();
      if (existing) await ctx.db.delete(existing._id);
    }
  },
});

export const internalSegmentSent = internalMutation({
  args: { campaignId: v.id("marketingCampaigns"), segment: v.string(), broadcastId: v.string(), count: v.number() },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.campaignId);
    if (!c) return;
    const rest = c.segmentsToSend.filter((s) => s !== args.segment);
    const now = Date.now();
    await ctx.db.patch(c._id, {
      segmentsToSend: rest,
      broadcastIds: [...c.broadcastIds, args.broadcastId],
      sentCount: c.sentCount + args.count,
      status: rest.length === 0 ? "sent" : "sending",
      sentAt: rest.length === 0 ? now : c.sentAt,
      updatedAt: now,
    });
  },
});

/** A segment with nobody in it is skipped rather than sent. */
export const internalSkipSegment = internalMutation({
  args: { campaignId: v.id("marketingCampaigns"), segment: v.string() },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.campaignId);
    if (!c) return;
    const rest = c.segmentsToSend.filter((s) => s !== args.segment);
    const now = Date.now();
    await ctx.db.patch(c._id, {
      segmentsToSend: rest,
      status: rest.length === 0 ? (c.sentCount > 0 ? "sent" : "failed") : c.status,
      lastError: rest.length === 0 && c.sentCount === 0 ? "Nobody in this audience has an email address." : c.lastError,
      sentAt: rest.length === 0 && c.sentCount > 0 ? now : c.sentAt,
      updatedAt: now,
    });
  },
});

export const internalCampaignFailed = internalMutation({
  args: { campaignId: v.id("marketingCampaigns"), error: v.string() },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.campaignId);
    if (!c) return;
    await ctx.db.patch(c._id, { status: c.sentCount > 0 ? "partial" : "failed", lastError: args.error.slice(0, 300), updatedAt: Date.now() });
  },
});

/** The next one-to-one batch, and how many more can go out today. */
export const internalDirectBatch = internalQuery({
  args: { campaignId: v.id("marketingCampaigns"), limit: v.number() },
  handler: async (ctx, args) => {
    const usage = await ctx.db.query("marketingDailyUsage").withIndex("by_day", (q) => q.eq("day", utcDay())).first();
    const remainingToday = Math.max(0, directDailyLimit() - (usage?.count ?? 0));
    const pending = await ctx.db
      .query("marketingQueue")
      .withIndex("by_campaign_and_status", (q) => q.eq("campaignId", args.campaignId).eq("status", "pending"))
      .take(Math.min(args.limit, remainingToday || 1));
    return { pending, remainingToday };
  },
});

export const internalRecordDirect = internalMutation({
  args: {
    campaignId: v.id("marketingCampaigns"),
    sent: v.array(v.id("marketingQueue")),
    failed: v.array(v.object({ id: v.id("marketingQueue"), error: v.string(), final: v.boolean() })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let finalFailures = 0;
    for (const id of args.sent) await ctx.db.patch(id, { status: "sent", sentAt: now });
    for (const f of args.failed) {
      const row = await ctx.db.get(f.id);
      if (!row) continue;
      await ctx.db.patch(f.id, { status: f.final ? "failed" : "pending", attempts: row.attempts + 1, lastError: f.error.slice(0, 200) });
      if (f.final) finalFailures++;
    }
    if (args.sent.length > 0) {
      const day = utcDay(now);
      const usage = await ctx.db.query("marketingDailyUsage").withIndex("by_day", (q) => q.eq("day", day)).first();
      if (usage) await ctx.db.patch(usage._id, { count: usage.count + args.sent.length });
      else await ctx.db.insert("marketingDailyUsage", { day, count: args.sent.length });
    }

    const c = await ctx.db.get(args.campaignId);
    if (!c) return { pendingLeft: 0 };
    const pendingLeft = (
      await ctx.db
        .query("marketingQueue")
        .withIndex("by_campaign_and_status", (q) => q.eq("campaignId", args.campaignId).eq("status", "pending"))
        .collect()
    ).length;
    const sentCount = c.sentCount + args.sent.length;
    const failedCount = c.failedCount + finalFailures;
    await ctx.db.patch(c._id, {
      sentCount,
      failedCount,
      status: pendingLeft > 0 ? "sending" : failedCount === 0 ? "sent" : sentCount > 0 ? "partial" : "failed",
      sentAt: pendingLeft === 0 ? now : c.sentAt,
      lastError: args.failed[0]?.error ?? c.lastError,
      updatedAt: now,
    });
    return { pendingLeft };
  },
});
