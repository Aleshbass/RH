/**
 * Marketing emails (Admin › Email campaigns).
 *
 * Since 26 Nov 2026 (owner: "move campaigns to SES") every campaign goes through Amazon SES, one
 * email per person from marketingQueue, so each person gets their own name (subject included),
 * their own unsubscribe link and an open pixel (convex/emailLinks.ts). A group campaign
 * ("preparing") first fills the queue segment by segment (everyone, patients, physiotherapists,
 * clinics, partners, added contacts); "one person or a few" is queued at once.
 *
 * People who unsubscribed, hard-bounced or marked an email as spam (emailSuppressions) are left
 * out. Campaign emails per UTC day stop at MARKETING_DAILY_LIMIT (default 20,000 of SES's 50,000);
 * the rest wait for the next day. The sending itself happens in actions/marketingSend.ts.
 * Older group campaigns were Resend Broadcasts; their records stay as they were.
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin } from "./helpers/partnerAccess";
import { partnerApprovalStatus } from "./helpers/partnerShared";
import { isJoyLoginEmail } from "../lib/auth/joyLoginEmail";
import { MARKETING_SEGMENTS, usesClinicName, type GreetBy, type MarketingSegment } from "../lib/email/marketing";
import { bodyHasText, isRichBody } from "../lib/email/richText";

type Recipient = { email: string; name?: string; clinicName?: string };
type Content = {
  subject: string;
  previewText?: string;
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  imageUrl?: string;
  imageLinkUrl?: string;
  greetBy?: GreetBy;
};
/** The test email and the composer preview name this clinic when an email uses the clinic name */
const SAMPLE_CLINIC_NAME = "Your Clinic Name";

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

const content = {
  subject: v.string(),
  previewText: v.optional(v.string()),
  heading: v.string(),
  body: v.string(),
  ctaLabel: v.optional(v.string()),
  ctaUrl: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  imageLinkUrl: v.optional(v.string()),
  greetBy: v.optional(v.union(v.literal("first_name"), v.literal("clinic_name"), v.literal("none"))),
};

// Plain references: these modules aren't in the generated api types until the next codegen
const processCampaignRef = makeFunctionReference<"action", { campaignId: Id<"marketingCampaigns"> }, null>(
  "actions/marketingSend:processCampaign"
);
const sendTestRef = makeFunctionReference<"action", { to: string; name?: string; clinicName?: string } & Content, null>(
  "actions/marketingSend:sendTest"
);
const utcDay = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);
const directDailyLimit = () => Math.max(1, Number(process.env.MARKETING_DAILY_LIMIT) || 20_000);
/** Rows written per run while a group campaign's queue is filled */
const FILL_CHUNK = 1500;
const clean = (value: string | undefined, max: number) => (value ?? "").trim().slice(0, max);
const normalEmail = (email: string | undefined | null) => (email ?? "").trim().toLowerCase();
const usable = (email: string) => EMAIL_RE.test(email) && !isJoyLoginEmail(email);

function cleanContent(args: Content) {
  const out = {
    subject: clean(args.subject, 150),
    previewText: clean(args.previewText, 200) || undefined,
    heading: clean(args.heading, 150),
    // Rich text is saved as editor JSON, which is several times longer than the words in it
    body: (args.body ?? "").trim(),
    ctaLabel: clean(args.ctaLabel, 60) || undefined,
    ctaUrl: clean(args.ctaUrl, 500) || undefined,
    imageUrl: clean(args.imageUrl, 500) || undefined,
    // Only kept with an image to click
    imageLinkUrl: (clean(args.imageUrl, 500) && clean(args.imageLinkUrl, 500)) || undefined,
    greetBy: args.greetBy && args.greetBy !== "first_name" ? args.greetBy : undefined,
  };
  if (!out.subject || !out.heading || !bodyHasText(out.body)) throw new ConvexError("Add a subject, a heading and a message.");
  if (out.body.length > (isRichBody(out.body) ? 120_000 : 10_000)) throw new ConvexError("The message is too long. Shorten it or split it into two emails.");
  if (out.ctaUrl && !/^https:\/\//i.test(out.ctaUrl)) throw new ConvexError("The button link must start with https://");
  if (out.ctaUrl && !out.ctaLabel) throw new ConvexError("Give the button a label, or remove its link.");
  if (out.imageUrl && !/^https:\/\//i.test(out.imageUrl)) throw new ConvexError("The image address must start with https://");
  if (out.imageLinkUrl && !/^https:\/\//i.test(out.imageLinkUrl)) throw new ConvexError("The link the image opens must start with https://");
  return out;
}

const ROLE_FOR: Partial<Record<MarketingSegment, "patient" | "physiotherapist" | "clinic_owner">> = {
  patients: "patient",
  physiotherapists: "physiotherapist",
  clinics: "clinic_owner",
};

/** The clinic a person owns (or belongs to), for {clinic_name}. */
async function clinicNameOf(ctx: QueryCtx, user: Doc<"users"> | null) {
  if (!user) return undefined;
  const owned = await ctx.db.query("clinics").withIndex("by_owner_id", (q) => q.eq("ownerId", user._id)).first();
  const clinic = owned ?? (user.clinicId ? await ctx.db.get(user.clinicId) : null);
  return clinic?.name?.trim() || undefined;
}

/** Addresses campaigns leave out: unsubscribed, hard-bounced or marked as spam. */
async function blockedEmails(ctx: QueryCtx): Promise<Set<string>> {
  return new Set((await ctx.db.query("emailSuppressions").collect()).map((row) => row.email));
}

/** Clinic owners, each with their clinic's name: the Clinics group when the email names the clinic. */
async function clinicRecipients(ctx: QueryCtx, blocked: Set<string>): Promise<Recipient[]> {
  const seen = new Set<string>(blocked);
  const out: Recipient[] = [];
  const owners = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "clinic_owner")).collect();
  for (const owner of owners) {
    const email = normalEmail(owner.email);
    if (owner.deletedAt || !usable(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name: owner.firstName?.trim() || undefined, clinicName: await clinicNameOf(ctx, owner) });
  }
  return out;
}

/**
 * Everyone in a segment with a deliverable email. Deleted accounts, Joy placeholder logins and
 * anyone in `blocked` (unsubscribed, bounced, complained) are left out.
 */
async function segmentRecipients(ctx: QueryCtx, seg: MarketingSegment, blocked: Set<string>): Promise<Recipient[]> {
  const seen = new Set<string>(blocked);
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

async function segmentCounts(ctx: QueryCtx, blocked: Set<string>) {
  const counts = {} as Record<MarketingSegment, number>;
  const everyone = new Set<string>();
  for (const seg of MARKETING_SEGMENTS) {
    const list = await segmentRecipients(ctx, seg, blocked);
    counts[seg] = list.length;
    for (const r of list) everyone.add(r.email);
  }
  return { ...counts, everyone: everyone.size };
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export const adminOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "marketing:adminOverview");
    const usage = await ctx.db.query("marketingDailyUsage").withIndex("by_day", (q) => q.eq("day", utcDay())).first();
    const blocked = await blockedEmails(ctx);
    return {
      counts: await segmentCounts(ctx, blocked),
      directSentToday: usage?.count ?? 0,
      directDailyLimit: directDailyLimit(),
      // Left out of every campaign: unsubscribed, bounced or marked as spam
      suppressedCount: blocked.size,
    };
  },
});

export const adminListCampaigns = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "marketing:adminListCampaigns");
    const campaigns = await ctx.db.query("marketingCampaigns").withIndex("by_created").order("desc").take(40);
    return Promise.all(
      campaigns.map(async (c) => {
        if (c.audience !== "individual" && !c.oneByOne) return { ...c, pendingCount: 0 };
        const pending = await ctx.db
          .query("marketingQueue")
          .withIndex("by_campaign_and_status", (q) => q.eq("campaignId", c._id).eq("status", "pending"))
          .collect();
        return { ...c, pendingCount: pending.length };
      })
    );
  },
});

const EVENT_TYPES = ["delivered", "opened", "clicked", "bounced", "complained"] as const;
type EventType = (typeof EVENT_TYPES)[number];
const DETAIL_LIMIT = 2000;

/**
 * One sent campaign: what it said and who it went to. One-to-one sends list their queue rows,
 * group sends the people saved when each segment went out (marketingRecipients). Campaigns sent
 * before that list was kept fall back to the people Resend reported events for.
 */
export const adminCampaignDetail = query({
  args: { campaignId: v.id("marketingCampaigns") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, "marketing:adminCampaignDetail");
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) return null;

    // What Resend reported back, per person
    const events = new Map<string, Set<EventType>>();
    for (const type of EVENT_TYPES) {
      const rows = await ctx.db
        .query("marketingEvents")
        .withIndex("by_campaign_type", (q) => q.eq("campaignId", campaign._id).eq("type", type))
        .take(DETAIL_LIMIT * 2);
      for (const row of rows) {
        const set = events.get(row.email) ?? new Set<EventType>();
        set.add(type);
        events.set(row.email, set);
      }
    }

    type Row = { email: string; name?: string; segment?: string; status: "sent" | "pending" | "failed"; error?: string; sentAt?: number };
    let rows: Row[] = [];
    let listSource: "queue" | "saved" | "events" = "saved";
    if (campaign.audience === "individual" || campaign.oneByOne) {
      listSource = "queue";
      for (const status of ["sent", "pending", "failed"] as const) {
        const queued = await ctx.db
          .query("marketingQueue")
          .withIndex("by_campaign_and_status", (q) => q.eq("campaignId", campaign._id).eq("status", status))
          .take(DETAIL_LIMIT);
        rows.push(...queued.map((r) => ({ email: r.email, name: r.name, segment: r.segment, status, error: r.lastError, sentAt: r.sentAt })));
      }
    } else {
      const saved = await ctx.db
        .query("marketingRecipients")
        .withIndex("by_campaign_and_email", (q) => q.eq("campaignId", campaign._id))
        .take(DETAIL_LIMIT + 1);
      rows = saved.map((r) => ({ email: r.email, name: r.name, segment: r.segment, status: "sent" as const }));
      if (rows.length === 0 && events.size > 0) {
        listSource = "events";
        rows = Array.from(events.keys()).map((email) => ({ email, status: "sent" as const }));
      }
    }

    const recipients = await Promise.all(
      rows.slice(0, DETAIL_LIMIT).map(async (r) => {
        const user = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", r.email)).first();
        const got = events.get(r.email);
        return {
          ...r,
          name: r.name || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || undefined,
          userId: user && !user.deletedAt ? user._id : undefined,
          role: user?.role,
          delivered: got?.has("delivered") ?? false,
          opened: got?.has("opened") ?? false,
          clicked: got?.has("clicked") ?? false,
          bounced: got?.has("bounced") ?? false,
          complained: got?.has("complained") ?? false,
        };
      })
    );
    recipients.sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));

    const pendingCount = rows.filter((r) => r.status === "pending").length;
    return { campaign: { ...campaign, pendingCount }, recipients, listSource, truncated: rows.length > DETAIL_LIMIT };
  },
});

export const adminListContacts = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "marketing:adminListContacts");
    const contacts = await ctx.db.query("marketingContacts").collect();
    return contacts.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const adminAddContacts = mutation({
  args: { contacts: v.array(v.object({ email: v.string(), name: v.optional(v.string()) })), tags: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, "marketing:adminAddContacts");
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
    await requireAdmin(ctx, "marketing:adminRemoveContact");
    await ctx.db.delete(args.id);
    return { success: true };
  },
});

/** People to email one-to-one: name or email search across accounts with a real email. */
export const adminFindPeople = query({
  args: { q: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, "marketing:adminFindPeople");
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

// Pictures for campaigns, kept in Convex file storage. PNG, JPG and GIF only: some email apps
// (Outlook on Windows among them) can't show WebP or SVG.
const EMAIL_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif"]);
const EMAIL_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** The composer: a one-time address to upload a picture to. */
export const adminImageUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "marketing:adminImageUploadUrl");
    return await ctx.storage.generateUploadUrl();
  },
});

/** After an upload: checks it's a picture every email app can show, and gives its public link. */
export const adminImageSaved = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, "marketing:adminImageSaved");
    const file = await ctx.db.system.get(args.storageId);
    if (!file) throw new ConvexError("The picture didn't arrive. Try again.");
    if (!EMAIL_IMAGE_TYPES.has(file.contentType ?? "")) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError("Use a PNG, JPG or GIF picture. Some email apps can't show other kinds.");
    }
    if (file.size > EMAIL_IMAGE_MAX_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError("Pictures can be up to 5 MB. Make it smaller and try again.");
    }
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new ConvexError("The picture didn't save. Try again.");
    return { url };
  },
});

export const adminSendTest = mutation({
  args: content,
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, "marketing:adminSendTest");
    const to = normalEmail(admin.user.email);
    if (!usable(to)) throw new ConvexError("Your admin account has no email to send a test to.");
    const cleaned = cleanContent(args);
    await ctx.scheduler.runAfter(0, sendTestRef, {
      ...cleaned,
      to,
      name: admin.user.firstName,
      ...(usesClinicName(cleaned) ? { clinicName: SAMPLE_CLINIC_NAME } : {}),
    });
    return { to };
  },
});

export const adminCreateCampaign = mutation({
  args: { ...content, audience, emails: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, "marketing:adminCreateCampaign");
    const cleaned = cleanContent(args);
    const now = Date.now();

    // The clinic name is only known for clinic owners (and chosen people who own a clinic)
    const byClinic = usesClinicName(cleaned);
    if (byClinic && args.audience !== "clinics" && args.audience !== "individual") {
      throw new ConvexError("The clinic name only works when you send to Clinics or to people you choose.");
    }
    const blocked = await blockedEmails(ctx);

    let recipientCount = 0;
    let leftOut = 0;
    let individuals: Recipient[] = [];
    // Group campaigns fill their queue in the background (internalFillQueue), segment by segment
    let segmentsToSend: string[] = [];
    if (args.audience === "individual") {
      const chosen = Array.from(new Set((args.emails ?? []).map(normalEmail))).filter(usable);
      if (chosen.length === 0) throw new ConvexError("Add at least one email address.");
      if (chosen.length > MAX_INDIVIDUAL) throw new ConvexError(`Send to up to ${MAX_INDIVIDUAL} people this way, or use a group.`);
      const unique = chosen.filter((email) => !blocked.has(email));
      leftOut = chosen.length - unique.length;
      if (unique.length === 0) {
        throw new ConvexError(chosen.length === 1 ? "This person unsubscribed from Rehabify emails (or their address bounced)." : "Everyone you chose unsubscribed from Rehabify emails (or their addresses bounced).");
      }
      individuals = await Promise.all(
        unique.map(async (email) => {
          const user = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).first();
          return { email, name: user?.firstName || undefined, clinicName: byClinic ? await clinicNameOf(ctx, user) : undefined };
        })
      );
      recipientCount = individuals.length;
    } else if (byClinic) {
      individuals = await clinicRecipients(ctx, blocked);
      recipientCount = individuals.length;
      if (recipientCount === 0) throw new ConvexError("No clinic owner has an email address yet.");
    } else {
      const counts = await segmentCounts(ctx, blocked);
      recipientCount = counts[args.audience];
      if (recipientCount === 0) throw new ConvexError("Nobody in this audience has an email address yet.");
      segmentsToSend = args.audience === "everyone" ? [...MARKETING_SEGMENTS] : [args.audience];
    }

    const campaignId = await ctx.db.insert("marketingCampaigns", {
      ...cleaned,
      audience: args.audience,
      ...(args.audience !== "individual" ? { oneByOne: true } : {}),
      status: segmentsToSend.length > 0 ? "preparing" : "sending",
      segmentsToSend,
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
      await ctx.db.insert("marketingQueue", {
        campaignId,
        email: r.email,
        name: r.name,
        ...(r.clinicName ? { clinicName: r.clinicName } : {}),
        ...(args.audience === "clinics" ? { segment: "clinics" } : {}),
        status: "pending",
        attempts: 0,
      });
    }

    await ctx.scheduler.runAfter(0, processCampaignRef, { campaignId });
    return { campaignId, recipientCount, leftOut };
  },
});

// ── Internal (used by actions/marketingSend.ts) ───────────────────────────────

export const internalGetCampaign = internalQuery({
  args: { campaignId: v.id("marketingCampaigns") },
  handler: async (ctx, args) => ctx.db.get(args.campaignId),
});

/**
 * A group campaign's next step while it is "preparing": queue the people of its first segment
 * still to go (up to FILL_CHUNK per run, each person once per campaign), then move on. When the
 * last segment is queued the campaign starts sending with its real count.
 */
export const internalFillQueue = internalMutation({
  args: { campaignId: v.id("marketingCampaigns") },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.campaignId);
    if (!c || c.status !== "preparing") return { more: false };
    const seg = c.segmentsToSend[0] as MarketingSegment | undefined;
    if (seg) {
      const queued = new Set<string>();
      for (const status of ["pending", "sent", "failed"] as const) {
        const rows = await ctx.db
          .query("marketingQueue")
          .withIndex("by_campaign_and_status", (q) => q.eq("campaignId", c._id).eq("status", status))
          .collect();
        for (const row of rows) queued.add(row.email);
      }
      const people = (await segmentRecipients(ctx, seg, await blockedEmails(ctx))).filter((p) => !queued.has(p.email));
      for (const p of people.slice(0, FILL_CHUNK)) {
        await ctx.db.insert("marketingQueue", { campaignId: c._id, email: p.email, name: p.name, segment: seg, status: "pending", attempts: 0 });
      }
      if (people.length > FILL_CHUNK) return { more: true };
    }

    const rest = c.segmentsToSend.slice(1);
    if (rest.length > 0) {
      await ctx.db.patch(c._id, { segmentsToSend: rest, updatedAt: Date.now() });
      return { more: true };
    }
    const total = (
      await ctx.db
        .query("marketingQueue")
        .withIndex("by_campaign_and_status", (q) => q.eq("campaignId", c._id).eq("status", "pending"))
        .collect()
    ).length;
    await ctx.db.patch(c._id, {
      segmentsToSend: [],
      recipientCount: total,
      status: total > 0 ? "sending" : "failed",
      ...(total === 0 ? { lastError: "Nobody in this audience has an email address." } : {}),
      updatedAt: Date.now(),
    });
    return { more: total > 0 };
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

/**
 * What a sending run did. An email SES took counts as delivered straight away (SES has no
 * delivery report here); a later hard bounce takes that back (emailEvents.ts).
 */
export const internalRecordDirect = internalMutation({
  args: {
    campaignId: v.id("marketingCampaigns"),
    sent: v.array(v.object({ id: v.id("marketingQueue"), messageId: v.optional(v.string()) })),
    failed: v.array(v.object({ id: v.id("marketingQueue"), error: v.string(), final: v.boolean() })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let finalFailures = 0;
    let delivered = 0;
    for (const s of args.sent) {
      const row = await ctx.db.get(s.id);
      if (!row) continue;
      await ctx.db.patch(s.id, { status: "sent", sentAt: now });
      const already = await ctx.db
        .query("marketingEvents")
        .withIndex("by_campaign_email_type", (q) => q.eq("campaignId", args.campaignId).eq("email", row.email).eq("type", "delivered"))
        .first();
      if (!already) {
        await ctx.db.insert("marketingEvents", {
          campaignId: args.campaignId,
          email: row.email,
          type: "delivered",
          at: now,
          eventId: `ses-sent:${s.messageId ?? s.id}`,
        });
        delivered++;
      }
    }
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
      ...(delivered ? { deliveredCount: (c.deliveredCount ?? 0) + delivered } : {}),
      status: pendingLeft > 0 ? "sending" : failedCount === 0 ? "sent" : sentCount > 0 ? "partial" : "failed",
      sentAt: pendingLeft === 0 ? now : c.sentAt,
      lastError: args.failed[0]?.error ?? c.lastError,
      updatedAt: now,
    });
    return { pendingLeft };
  },
});
