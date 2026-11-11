/**
 * The blog: posts written in the admin console and shown on /blog.
 *
 * Who can do what
 *   - "blog_editor" (Blog writer): writes and edits their own posts, uploads images, uses AI
 *     assist, and submits for review. They cannot publish.
 *   - "admin": everything, including publish, schedule, unpublish, categories and authors.
 *
 * Working copy and public copy
 *   A post row holds the working fields; the body is in blogPostBodies (kind "draft"). Publishing
 *   copies both into `live` / the "live" body, and the public queries below read only those. So an
 *   edit to a published post is invisible until an admin publishes it again. `status` describes
 *   the working copy ("published" = same as live); `isLive` says whether the public can see it.
 *
 * Public queries: listPosts, getPost, listCategories, sitemapData (no sign-in).
 * Everything else needs blog access. The site is told to refresh its cached pages by pingSite
 * (BLOG_REVALIDATE_SECRET on Convex and Vercel); without the secret pages refresh on their own
 * within a few minutes.
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { insertNotification } from "./helpers/pushNotify";
import { IMAGEKIT_URL, imagekitUploadAuth, removeImagekitFilesLater } from "./helpers/imagekit";
import { callLlmJson } from "./helpers/llm";
import { publicAppUrl } from "./helpers/appUrl";
import { blogImageValidator, blogSeoValidator } from "./schema/blog";
import { MAX_BODY_CHARS, bodyStats, parseBody, slugify, type BlogNode } from "../lib/blog/content";
import { analyzeSeo } from "../lib/blog/seo";

type Ctx = QueryCtx | MutationCtx;
type Staff = { user: Doc<"users">; isAdmin: boolean };
type Post = Doc<"blogPosts">;
type Image = { url: string; fileId?: string; alt: string; width?: number; height?: number };

const BLOG_FOLDER = "/blog";
const MAX_REVISIONS = 20;
const AUTOSAVE_REVISION_GAP_MS = 10 * 60 * 1000;
const AI_DAILY_LIMIT = { admin: 120, writer: 40 };
/** Paths under /blog that are pages of their own, so never a post's address */
const RESERVED_SLUGS = new Set(["page", "category", "author", "tag", "feed", "rss", "preview", "search"]);

// Plain references, so this module doesn't lean on the generated `internal` type (TS2589)
const assertStaffRef = makeFunctionReference<"query", Record<string, never>, { userId: Id<"users">; isAdmin: boolean }>(
  "blog:assertStaff"
);
const aiGateRef = makeFunctionReference<"mutation", Record<string, never>, { remaining: number }>("blog:aiGate");
const aiLinkCandidatesRef = makeFunctionReference<"query", { excludePostId?: Id<"blogPosts"> }, { title: string; slug: string; excerpt: string }[]>(
  "blog:aiLinkCandidates"
);
const pingSiteRef = makeFunctionReference<"action", { paths: string[]; announce: string[] }, null>("blog:pingSite");
const publishScheduledRef = makeFunctionReference<"mutation", { postId: Id<"blogPosts"> }, null>("blog:publishScheduled");

const clip = (value: string | undefined, max: number) => (value ?? "").trim().slice(0, max);
const optional = (value: string | undefined, max: number) => clip(value, max) || undefined;

// ─────────────────────────────────────────────────────────────────────────────
// Access
// ─────────────────────────────────────────────────────────────────────────────

async function staffOrNull(ctx: Ctx): Promise<Staff | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user || (user.role !== "admin" && user.role !== "blog_editor")) return null;
  return { user, isAdmin: user.role === "admin" };
}

async function requireStaff(ctx: Ctx): Promise<Staff> {
  const staff = await staffOrNull(ctx);
  if (!staff) throw new ConvexError("You need blog access to do that.");
  return staff;
}

async function requireBlogAdmin(ctx: Ctx): Promise<Staff> {
  const staff = await requireStaff(ctx);
  if (!staff.isAdmin) throw new ConvexError("Only an administrator can do that.");
  return staff;
}

const canSee = (staff: Staff, post: Post) => staff.isAdmin || post.ownerId === staff.user._id;

/** Writers edit their own post until they submit it; a scheduled post is already approved. */
function canEdit(staff: Staff, post: Post) {
  if (staff.isAdmin) return true;
  if (post.ownerId !== staff.user._id) return false;
  return post.status === "draft" || post.status === "changes_requested" || post.status === "published";
}

async function loadPost(ctx: Ctx, staff: Staff, postId: Id<"blogPosts">): Promise<Post> {
  const post = await ctx.db.get(postId);
  if (!post || !canSee(staff, post)) throw new ConvexError("We couldn't find that post.");
  return post;
}

const personName = (user: Doc<"users"> | null) =>
  user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "Someone" : "Someone";

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

async function bodyRow(ctx: Ctx, postId: Id<"blogPosts">, kind: "draft" | "live") {
  return await ctx.db
    .query("blogPostBodies")
    .withIndex("by_post_kind", (q) => q.eq("postId", postId).eq("kind", kind))
    .first();
}

async function writeBody(ctx: MutationCtx, postId: Id<"blogPosts">, kind: "draft" | "live", body: string, now: number) {
  const row = await bodyRow(ctx, postId, kind);
  if (row) await ctx.db.patch(row._id, { body, updatedAt: now });
  else await ctx.db.insert("blogPostBodies", { postId, kind, body, updatedAt: now });
}

/** True when another post already answers at /blog/<slug> (now, when published, or by redirect). */
async function slugTaken(ctx: Ctx, slug: string, postId?: Id<"blogPosts">) {
  const working = await ctx.db.query("blogPosts").withIndex("by_slug", (q) => q.eq("slug", slug)).take(5);
  if (working.some((p) => p._id !== postId)) return true;
  const live = await ctx.db.query("blogPosts").withIndex("by_live_slug", (q) => q.eq("liveSlug", slug)).take(5);
  if (live.some((p) => p._id !== postId)) return true;
  const redirects = await ctx.db.query("blogSlugRedirects").withIndex("by_from", (q) => q.eq("fromSlug", slug)).take(5);
  return redirects.some((r) => r.postId !== postId);
}

async function uniquePostSlug(ctx: Ctx, wanted: string, postId?: Id<"blogPosts">) {
  const base = slugify(wanted) || "post";
  for (let n = 1; n <= 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!RESERVED_SLUGS.has(slug) && !(await slugTaken(ctx, slug, postId))) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function uniqueSlugIn(ctx: Ctx, table: "blogAuthors" | "blogCategories", wanted: string, selfId?: string) {
  const base = slugify(wanted, 60) || (table === "blogAuthors" ? "author" : "category");
  for (let n = 1; n <= 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await ctx.db.query(table).withIndex("by_slug", (q) => q.eq("slug", slug)).first();
    if (!taken || taken._id === selfId) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** The byline a signed-in writer posts under; made from their name the first time. */
async function authorForUser(ctx: MutationCtx, user: Doc<"users">): Promise<Id<"blogAuthors">> {
  const existing = await ctx.db.query("blogAuthors").withIndex("by_user", (q) => q.eq("userId", user._id)).first();
  if (existing) return existing._id;
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Rehabify Health";
  const now = Date.now();
  return await ctx.db.insert("blogAuthors", {
    slug: await uniqueSlugIn(ctx, "blogAuthors", name),
    name,
    sameAs: [],
    userId: user._id,
    createdAt: now,
    updatedAt: now,
  });
}

function cleanImage(image: Image | undefined, label: string): Image | undefined {
  if (!image) return undefined;
  const url = image.url.trim();
  if (!IMAGEKIT_URL.test(url)) throw new ConvexError(`${label} must be uploaded here first.`);
  return {
    url,
    fileId: image.fileId,
    alt: clip(image.alt, 200),
    width: image.width && image.width > 0 ? Math.round(image.width) : undefined,
    height: image.height && image.height > 0 ? Math.round(image.height) : undefined,
  };
}

function cleanTags(tags: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, 40);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 12) break;
  }
  return out;
}

function cleanLinks(links: string[]) {
  const out: string[] = [];
  for (const raw of links) {
    const value = raw.trim().slice(0, 300);
    if (!value) continue;
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      if (url.protocol === "https:" || url.protocol === "http:") out.push(url.toString());
    } catch {
      // not a link: leave it out
    }
    if (out.length >= 8) break;
  }
  return out;
}

async function saveRevision(
  ctx: MutationCtx,
  post: { _id: Id<"blogPosts">; title: string },
  body: string,
  reason: Doc<"blogRevisions">["reason"],
  savedBy: Id<"users">,
  now: number
) {
  const latest = await ctx.db.query("blogRevisions").withIndex("by_post", (q) => q.eq("postId", post._id)).order("desc").take(MAX_REVISIONS);
  if (reason === "autosave") {
    const last = latest[0];
    if (last && (now - last.savedAt < AUTOSAVE_REVISION_GAP_MS || (last.body === body && last.title === post.title))) return;
  }
  await ctx.db.insert("blogRevisions", { postId: post._id, title: post.title, body, reason, savedBy, savedAt: now });
  for (const old of latest.slice(MAX_REVISIONS - 1)) await ctx.db.delete(old._id);
}

/** The checks that stop a post going to review or going live (same list the editor shows). */
function blockers(post: Post, doc: BlogNode) {
  return analyzeSeo({
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    metaTitle: post.seo.metaTitle,
    metaDescription: post.seo.metaDescription,
    focusKeyword: post.seo.focusKeyword,
    cover: post.cover ?? null,
    doc,
  }).errors;
}

function assertReady(post: Post, doc: BlogNode) {
  const errors = blockers(post, doc);
  if (errors.length === 0) return;
  const list = errors.slice(0, 3).map((e) => e.label).join("; ");
  throw new ConvexError(`Fix these first: ${list}${errors.length > 3 ? `; and ${errors.length - 3} more` : ""}.`);
}

async function notify(ctx: MutationCtx, userId: Id<"users">, title: string, message: string, postId: Id<"blogPosts">) {
  const now = Date.now();
  await insertNotification(ctx, {
    userId,
    type: "system_alert",
    title,
    message,
    data: { postId, actionUrl: `/dashboard/admin/blog/${postId}` },
    status: "pending",
    priority: "medium",
    createdAt: now,
    updatedAt: now,
  });
}

/** Asks the website to rebuild these pages, and tells search engines about `announce`. */
async function refreshSite(ctx: MutationCtx, paths: (string | undefined)[], announce: (string | undefined)[] = []) {
  const clean = (list: (string | undefined)[]) => [...new Set(list.filter((p): p is string => Boolean(p)))];
  await ctx.scheduler.runAfter(0, pingSiteRef, { paths: clean(["/blog", ...paths]), announce: clean(announce) });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public (no sign-in): only ever the published copy
// ─────────────────────────────────────────────────────────────────────────────

type PublicAuthor = { slug: string; name: string; credentials?: string; bio?: string; photo?: Image; sameAs: string[] };
type PublicCategory = { slug: string; name: string; description?: string };

function lookups(ctx: Ctx) {
  const authors = new Map<string, PublicAuthor | null>();
  const categories = new Map<string, PublicCategory | null>();
  return {
    async author(id: Id<"blogAuthors"> | undefined): Promise<PublicAuthor | null> {
      if (!id) return null;
      if (!authors.has(id)) {
        const a = await ctx.db.get(id);
        authors.set(id, a ? { slug: a.slug, name: a.name, credentials: a.credentials, bio: a.bio, photo: a.photo, sameAs: a.sameAs } : null);
      }
      return authors.get(id) ?? null;
    },
    async category(id: Id<"blogCategories"> | undefined): Promise<PublicCategory | null> {
      if (!id) return null;
      if (!categories.has(id)) {
        const c = await ctx.db.get(id);
        categories.set(id, c ? { slug: c.slug, name: c.name, description: c.description } : null);
      }
      return categories.get(id) ?? null;
    },
  };
}

async function publicCard(post: Post, find: ReturnType<typeof lookups>) {
  const live = post.live!;
  const author = await find.author(live.authorId);
  const category = await find.category(live.categoryId);
  return {
    slug: live.slug,
    title: live.title,
    excerpt: live.excerpt,
    cover: live.cover ?? null,
    tags: live.tags,
    readingMinutes: live.readingMinutes,
    publishedAt: post.publishedAt ?? post.liveUpdatedAt ?? post.updatedAt,
    updatedAt: post.liveUpdatedAt ?? post.publishedAt ?? post.updatedAt,
    author: author ? { slug: author.slug, name: author.name, credentials: author.credentials, photo: author.photo } : null,
    category: category ? { slug: category.slug, name: category.name } : null,
  };
}

const livePosts = (post: Post) => post.isLive && Boolean(post.live);

/** Published posts, newest first, a page at a time; optionally one category or one author. */
export const listPosts = query({
  args: {
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
    categorySlug: v.optional(v.string()),
    authorSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pageSize = Math.min(Math.max(Math.floor(args.pageSize ?? 12), 1), 50);
    const page = Math.max(Math.floor(args.page ?? 1), 1);
    const find = lookups(ctx);
    const empty = { posts: [], total: 0, page, pageCount: 0, category: null, author: null, found: false };

    let category: Doc<"blogCategories"> | null = null;
    let author: Doc<"blogAuthors"> | null = null;
    let rows: Post[];
    if (args.categorySlug) {
      category = await ctx.db.query("blogCategories").withIndex("by_slug", (q) => q.eq("slug", args.categorySlug!)).first();
      if (!category) return empty;
      rows = await ctx.db.query("blogPosts").withIndex("by_live_category", (q) => q.eq("liveCategoryId", category!._id)).order("desc").take(600);
    } else if (args.authorSlug) {
      author = await ctx.db.query("blogAuthors").withIndex("by_slug", (q) => q.eq("slug", args.authorSlug!)).first();
      if (!author) return empty;
      rows = await ctx.db.query("blogPosts").withIndex("by_live_author", (q) => q.eq("liveAuthorId", author!._id)).order("desc").take(600);
    } else {
      rows = await ctx.db.query("blogPosts").withIndex("by_live", (q) => q.eq("isLive", true)).order("desc").take(600);
    }
    const live = rows.filter(livePosts);
    const pageRows = live.slice((page - 1) * pageSize, page * pageSize);
    const posts = [];
    for (const post of pageRows) posts.push(await publicCard(post, find));
    return {
      posts,
      total: live.length,
      page,
      pageCount: Math.ceil(live.length / pageSize),
      category: category ? { slug: category.slug, name: category.name, description: category.description } : null,
      author: author
        ? { slug: author.slug, name: author.name, credentials: author.credentials, bio: author.bio, photo: author.photo ?? null, sameAs: author.sameAs }
        : null,
      found: true,
    };
  },
});

/** One published post by its address. An old address answers with where the post lives now. */
export const getPost = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const slug = args.slug.trim().toLowerCase();
    if (!slug) return null;
    const post = await ctx.db.query("blogPosts").withIndex("by_live_slug", (q) => q.eq("liveSlug", slug)).first();
    if (!post || !livePosts(post)) {
      const moved = await ctx.db.query("blogSlugRedirects").withIndex("by_from", (q) => q.eq("fromSlug", slug)).first();
      const target = moved ? await ctx.db.get(moved.postId) : null;
      return target && livePosts(target) && target.liveSlug ? { kind: "redirect" as const, slug: target.liveSlug } : null;
    }
    const live = post.live!;
    const find = lookups(ctx);
    const body = await bodyRow(ctx, post._id, "live");

    // Three more to read: the same category first, then the newest
    const related: Awaited<ReturnType<typeof publicCard>>[] = [];
    const seen = new Set<string>([post._id]);
    const pools: Post[][] = [];
    if (post.liveCategoryId) {
      pools.push(await ctx.db.query("blogPosts").withIndex("by_live_category", (q) => q.eq("liveCategoryId", post.liveCategoryId)).order("desc").take(8));
    }
    pools.push(await ctx.db.query("blogPosts").withIndex("by_live", (q) => q.eq("isLive", true)).order("desc").take(8));
    for (const pool of pools) {
      for (const other of pool) {
        if (related.length >= 3) break;
        if (seen.has(other._id) || !livePosts(other)) continue;
        seen.add(other._id);
        related.push(await publicCard(other, find));
      }
    }

    return {
      kind: "post" as const,
      post: {
        ...(await publicCard(post, find)),
        seo: live.seo,
        wordCount: live.wordCount,
        body: body?.body ?? "",
        authorFull: await find.author(live.authorId),
        reviewer: await find.author(live.reviewerId),
      },
      related,
    };
  },
});

/** Categories that have at least one published post, in their set order. */
export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db.query("blogCategories").withIndex("by_order").take(100);
    const out = [];
    for (const c of categories) {
      const posts = await ctx.db.query("blogPosts").withIndex("by_live_category", (q) => q.eq("liveCategoryId", c._id)).take(200);
      const count = posts.filter(livePosts).length;
      if (count > 0) out.push({ slug: c.slug, name: c.name, description: c.description, count });
    }
    return out;
  },
});

/** Every public blog address with when it last changed, for sitemap.xml. */
export const sitemapData = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("blogPosts").withIndex("by_live", (q) => q.eq("isLive", true)).order("desc").take(2000);
    const live = rows.filter(livePosts);
    const categoryUpdated = new Map<string, number>();
    const authorUpdated = new Map<string, number>();
    const posts = live.map((post) => {
      const updatedAt = post.liveUpdatedAt ?? post.publishedAt ?? post.updatedAt;
      if (post.liveCategoryId) categoryUpdated.set(post.liveCategoryId, Math.max(categoryUpdated.get(post.liveCategoryId) ?? 0, updatedAt));
      if (post.liveAuthorId) authorUpdated.set(post.liveAuthorId, Math.max(authorUpdated.get(post.liveAuthorId) ?? 0, updatedAt));
      return { slug: post.live!.slug, updatedAt, image: post.live!.cover?.url, noindex: post.live!.seo.noindex === true };
    });
    const categories = [];
    for (const [id, updatedAt] of categoryUpdated) {
      const c = await ctx.db.get(id as Id<"blogCategories">);
      if (c) categories.push({ slug: c.slug, updatedAt });
    }
    const authors = [];
    for (const [id, updatedAt] of authorUpdated) {
      const a = await ctx.db.get(id as Id<"blogAuthors">);
      if (a) authors.push({ slug: a.slug, updatedAt });
    }
    return { posts: posts.filter((p) => !p.noindex), categories, authors, total: live.length };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Console: reading
// ─────────────────────────────────────────────────────────────────────────────

function utcDay(now: number) {
  return new Date(now).toISOString().slice(0, 10);
}

const aiConfigured = () => Boolean(process.env.OPENAI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim());

/** Who is using the blog console, or null when they have no blog access. */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const staff = await staffOrNull(ctx);
    if (!staff) return null;
    const author = await ctx.db.query("blogAuthors").withIndex("by_user", (q) => q.eq("userId", staff.user._id)).first();
    const usage = await ctx.db
      .query("blogAiUsage")
      .withIndex("by_user_day", (q) => q.eq("userId", staff.user._id).eq("day", utcDay(Date.now())))
      .first();
    const limit = staff.isAdmin ? AI_DAILY_LIMIT.admin : AI_DAILY_LIMIT.writer;
    return {
      userId: staff.user._id,
      role: staff.isAdmin ? ("admin" as const) : ("writer" as const),
      name: personName(staff.user),
      authorId: author?._id ?? null,
      ai: { enabled: aiConfigured(), limit, remaining: Math.max(0, limit - (usage?.count ?? 0)) },
    };
  },
});

/** The posts list: every post for admins, their own for writers. */
export const adminListPosts = query({
  args: {},
  handler: async (ctx) => {
    const staff = await staffOrNull(ctx);
    if (!staff) return null;
    const posts = staff.isAdmin
      ? await ctx.db.query("blogPosts").withIndex("by_updated").order("desc").take(500)
      : await ctx.db.query("blogPosts").withIndex("by_owner", (q) => q.eq("ownerId", staff.user._id)).order("desc").take(500);
    const find = lookups(ctx);
    const owners = new Map<string, string>();
    const rows = [];
    for (const post of posts) {
      if (!owners.has(post.ownerId)) owners.set(post.ownerId, personName(await ctx.db.get(post.ownerId)));
      const author = await find.author(post.authorId);
      const category = await find.category(post.categoryId);
      rows.push({
        _id: post._id,
        title: post.title,
        slug: post.slug,
        status: post.status,
        isLive: post.isLive,
        liveSlug: post.liveSlug ?? null,
        coverUrl: post.cover?.url ?? null,
        wordCount: post.wordCount,
        ownerName: owners.get(post.ownerId) ?? "Someone",
        mine: post.ownerId === staff.user._id,
        authorName: author?.name ?? null,
        categoryName: category?.name ?? null,
        updatedAt: post.updatedAt,
        publishedAt: post.publishedAt ?? null,
        submittedAt: post.submittedAt ?? null,
        scheduledFor: post.scheduledFor ?? null,
        reviewNote: post.reviewNote ?? null,
      });
    }
    return { role: staff.isAdmin ? ("admin" as const) : ("writer" as const), posts: rows };
  },
});

/** One post with its working body, for the editor. */
export const adminGetPost = query({
  args: { postId: v.id("blogPosts") },
  handler: async (ctx, args) => {
    const staff = await staffOrNull(ctx);
    if (!staff) return null;
    const post = await ctx.db.get(args.postId);
    if (!post || !canSee(staff, post)) return null;
    const body = await bodyRow(ctx, post._id, "draft");

    let duplicateTitle = false;
    const title = post.title.trim().toLowerCase();
    if (title) {
      const others = await ctx.db.query("blogPosts").withIndex("by_updated").order("desc").take(300);
      duplicateTitle = others.some((o) => o._id !== post._id && o.title.trim().toLowerCase() === title);
    }

    const mine = post.ownerId === staff.user._id;
    const neverLive = !post.isLive && !post.publishedAt;
    return {
      _id: post._id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      cover: post.cover ?? null,
      seo: post.seo,
      authorId: post.authorId ?? null,
      reviewerId: post.reviewerId ?? null,
      categoryId: post.categoryId ?? null,
      tags: post.tags,
      status: post.status,
      isLive: post.isLive,
      liveSlug: post.liveSlug ?? null,
      publishedAt: post.publishedAt ?? null,
      liveUpdatedAt: post.liveUpdatedAt ?? null,
      scheduledFor: post.scheduledFor ?? null,
      submittedAt: post.submittedAt ?? null,
      reviewNote: post.reviewNote ?? null,
      updatedAt: post.updatedAt,
      ownerName: mine ? "You" : personName(await ctx.db.get(post.ownerId)),
      body: body?.body ?? "",
      duplicateTitle,
      can: {
        edit: canEdit(staff, post),
        submit: (mine || staff.isAdmin) && (post.status === "draft" || post.status === "changes_requested"),
        withdraw: (mine || staff.isAdmin) && post.status === "in_review",
        publish: staff.isAdmin,
        remove: staff.isAdmin || (mine && neverLive && (post.status === "draft" || post.status === "changes_requested")),
      },
    };
  },
});

/** What the editor's pickers need: authors, categories and published posts to link to. */
export const editorOptions = query({
  args: {},
  handler: async (ctx) => {
    const staff = await staffOrNull(ctx);
    if (!staff) return null;
    const authors = await ctx.db.query("blogAuthors").take(200);
    const categories = await ctx.db.query("blogCategories").withIndex("by_order").take(100);
    const live = await ctx.db.query("blogPosts").withIndex("by_live", (q) => q.eq("isLive", true)).order("desc").take(200);
    return {
      authors: authors
        .map((a) => ({ _id: a._id, name: a.name, credentials: a.credentials ?? null, mine: a.userId === staff.user._id }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      categories: categories.map((c) => ({ _id: c._id, name: c.name })),
      posts: live.filter(livePosts).map((p) => ({ title: p.live!.title, slug: p.live!.slug })),
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Console: writing
// ─────────────────────────────────────────────────────────────────────────────

export const createPost = mutation({
  args: {},
  handler: async (ctx): Promise<Id<"blogPosts">> => {
    const staff = await requireStaff(ctx);
    const now = Date.now();
    const postId = await ctx.db.insert("blogPosts", {
      slug: "",
      title: "",
      excerpt: "",
      seo: {},
      authorId: await authorForUser(ctx, staff.user),
      tags: [],
      wordCount: 0,
      readingMinutes: 1,
      status: "draft",
      ownerId: staff.user._id,
      isLive: false,
      createdAt: now,
      updatedAt: now,
    });
    await writeBody(ctx, postId, "draft", JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }), now);
    return postId;
  },
});

/** Autosave: the whole working copy. Never changes what the public sees. */
export const savePost = mutation({
  args: {
    postId: v.id("blogPosts"),
    title: v.string(),
    slug: v.string(),
    excerpt: v.string(),
    cover: v.optional(blogImageValidator),
    seo: blogSeoValidator,
    authorId: v.optional(v.id("blogAuthors")),
    reviewerId: v.optional(v.id("blogAuthors")),
    categoryId: v.optional(v.id("blogCategories")),
    tags: v.array(v.string()),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);
    const post = await loadPost(ctx, staff, args.postId);
    if (!canEdit(staff, post)) {
      throw new ConvexError(post.status === "in_review" ? "This post is with an admin for review. Withdraw it to keep editing." : "You can't edit this post.");
    }
    if (args.body.length > MAX_BODY_CHARS) throw new ConvexError("This post is too long to save. Split it into two posts.");
    const doc = parseBody(args.body);
    const stats = bodyStats(doc);
    const now = Date.now();

    const title = clip(args.title, 160);
    const wanted = slugify(args.slug) || slugify(title);
    const slug = !wanted ? "" : wanted === post.slug ? post.slug : await uniquePostSlug(ctx, wanted, post._id);

    // Writers keep their own byline; only an admin picks the author and the medical reviewer
    let authorId = post.authorId;
    let reviewerId = post.reviewerId;
    if (staff.isAdmin) {
      authorId = args.authorId && (await ctx.db.get(args.authorId)) ? args.authorId : undefined;
      reviewerId = args.reviewerId && (await ctx.db.get(args.reviewerId)) ? args.reviewerId : undefined;
    } else if (!authorId) {
      authorId = await authorForUser(ctx, staff.user);
    }
    const categoryId = args.categoryId && (await ctx.db.get(args.categoryId)) ? args.categoryId : undefined;

    // A published post that is edited becomes a draft again; the public copy is untouched
    const status = post.status === "published" ? "draft" : post.status;
    await ctx.db.patch(post._id, {
      title,
      slug,
      excerpt: clip(args.excerpt, 400),
      cover: cleanImage(args.cover, "The cover image"),
      seo: {
        metaTitle: optional(args.seo.metaTitle, 120),
        metaDescription: optional(args.seo.metaDescription, 320),
        focusKeyword: optional(args.seo.focusKeyword, 80),
        noindex: args.seo.noindex === true ? true : undefined,
      },
      authorId,
      reviewerId,
      categoryId,
      tags: cleanTags(args.tags),
      wordCount: stats.wordCount,
      readingMinutes: stats.readingMinutes,
      status,
      lastEditedBy: staff.user._id,
      updatedAt: now,
    });
    await writeBody(ctx, post._id, "draft", args.body, now);
    await saveRevision(ctx, { _id: post._id, title }, args.body, "autosave", staff.user._id, now);
    return { slug, status, updatedAt: now, wordCount: stats.wordCount };
  },
});

/** Writer → admin. The post locks for the writer until it is approved, sent back or withdrawn. */
export const submitForReview = mutation({
  args: { postId: v.id("blogPosts") },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);
    const post = await loadPost(ctx, staff, args.postId);
    if (post.status !== "draft" && post.status !== "changes_requested") throw new ConvexError("This post has already been submitted.");
    const body = (await bodyRow(ctx, post._id, "draft"))?.body ?? "";
    assertReady(post, parseBody(body));
    const now = Date.now();
    await ctx.db.patch(post._id, { status: "in_review", submittedAt: now, reviewNote: undefined, updatedAt: now });
    await saveRevision(ctx, post, body, "submitted", staff.user._id, now);

    const admins = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "admin")).take(50);
    for (const admin of admins) {
      if (admin._id === staff.user._id) continue;
      await notify(
        ctx,
        admin._id,
        post.isLive ? "Blog changes to review" : "Blog post to review",
        `${personName(staff.user)} submitted "${post.title}".`,
        post._id
      );
    }
    return null;
  },
});

export const withdrawSubmission = mutation({
  args: { postId: v.id("blogPosts") },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);
    const post = await loadPost(ctx, staff, args.postId);
    if (post.status !== "in_review") throw new ConvexError("This post isn't waiting for review.");
    await ctx.db.patch(post._id, { status: "draft", submittedAt: undefined, updatedAt: Date.now() });
    return null;
  },
});

export const requestChanges = mutation({
  args: { postId: v.id("blogPosts"), note: v.string() },
  handler: async (ctx, args) => {
    const staff = await requireBlogAdmin(ctx);
    const post = await loadPost(ctx, staff, args.postId);
    if (post.status === "scheduled") throw new ConvexError("Cancel the schedule first.");
    const note = clip(args.note, 1000);
    if (!note) throw new ConvexError("Say what needs changing.");
    await ctx.db.patch(post._id, { status: "changes_requested", reviewNote: note, updatedAt: Date.now() });
    if (post.ownerId !== staff.user._id) await notify(ctx, post.ownerId, "Changes requested on your post", `"${post.title}": ${note.slice(0, 140)}`, post._id);
    return null;
  },
});

/** Copies the working copy into the public one. Shared by Publish and the scheduled job. */
async function publishNow(ctx: MutationCtx, post: Post, by: Id<"users">) {
  const body = (await bodyRow(ctx, post._id, "draft"))?.body ?? "";
  assertReady(post, parseBody(body));
  const now = Date.now();
  const previousSlug = post.liveSlug;

  // The old address keeps working: /blog/<old> sends a permanent redirect to the new one
  if (previousSlug && previousSlug !== post.slug) {
    const already = await ctx.db.query("blogSlugRedirects").withIndex("by_from", (q) => q.eq("fromSlug", previousSlug)).first();
    if (!already) await ctx.db.insert("blogSlugRedirects", { fromSlug: previousSlug, postId: post._id, createdAt: now });
  }
  const backToOld = await ctx.db.query("blogSlugRedirects").withIndex("by_from", (q) => q.eq("fromSlug", post.slug)).take(5);
  for (const row of backToOld) if (row.postId === post._id) await ctx.db.delete(row._id);

  if (post.scheduledJobId) await ctx.scheduler.cancel(post.scheduledJobId).catch(() => undefined);
  await ctx.db.patch(post._id, {
    live: {
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      cover: post.cover,
      seo: post.seo,
      authorId: post.authorId,
      reviewerId: post.reviewerId,
      categoryId: post.categoryId,
      tags: post.tags,
      wordCount: post.wordCount,
      readingMinutes: post.readingMinutes,
    },
    isLive: true,
    liveSlug: post.slug,
    liveCategoryId: post.categoryId,
    liveAuthorId: post.authorId,
    status: "published",
    publishedAt: post.publishedAt ?? now,
    liveUpdatedAt: now,
    scheduledFor: undefined,
    scheduledJobId: undefined,
    submittedAt: undefined,
    reviewNote: undefined,
    updatedAt: now,
  });
  await writeBody(ctx, post._id, "live", body, now);
  await saveRevision(ctx, post, body, "published", by, now);

  const category = post.categoryId ? await ctx.db.get(post.categoryId) : null;
  const author = post.authorId ? await ctx.db.get(post.authorId) : null;
  const path = `/blog/${post.slug}`;
  await refreshSite(
    ctx,
    [path, previousSlug ? `/blog/${previousSlug}` : undefined, category ? `/blog/category/${category.slug}` : undefined, author ? `/blog/author/${author.slug}` : undefined],
    post.seo.noindex ? [] : [path]
  );
  if (post.ownerId !== by) {
    await notify(ctx, post.ownerId, post.isLive ? "Your changes are live" : "Your post is live", `"${post.title}" is now on the blog.`, post._id);
  }
}

export const publishPost = mutation({
  args: { postId: v.id("blogPosts") },
  handler: async (ctx, args) => {
    const staff = await requireBlogAdmin(ctx);
    const post = await loadPost(ctx, staff, args.postId);
    await publishNow(ctx, post, staff.user._id);
    return { slug: post.slug };
  },
});

export const schedulePost = mutation({
  args: { postId: v.id("blogPosts"), at: v.number() },
  handler: async (ctx, args) => {
    const staff = await requireBlogAdmin(ctx);
    const post = await loadPost(ctx, staff, args.postId);
    const now = Date.now();
    if (args.at < now + 60_000) throw new ConvexError("Pick a time at least a minute from now.");
    if (args.at > now + 366 * 24 * 60 * 60 * 1000) throw new ConvexError("Pick a time within the next year.");
    assertReady(post, parseBody((await bodyRow(ctx, post._id, "draft"))?.body ?? ""));
    if (post.scheduledJobId) await ctx.scheduler.cancel(post.scheduledJobId).catch(() => undefined);
    const jobId = await ctx.scheduler.runAt(args.at, publishScheduledRef, { postId: post._id });
    await ctx.db.patch(post._id, { status: "scheduled", scheduledFor: args.at, scheduledJobId: jobId, reviewNote: undefined, updatedAt: now });
    if (post.ownerId !== staff.user._id) {
      await notify(ctx, post.ownerId, "Your post is approved", `"${post.title}" is scheduled to go live.`, post._id);
    }
    return null;
  },
});

export const cancelSchedule = mutation({
  args: { postId: v.id("blogPosts") },
  handler: async (ctx, args) => {
    const staff = await requireBlogAdmin(ctx);
    const post = await loadPost(ctx, staff, args.postId);
    if (post.status !== "scheduled") return null;
    if (post.scheduledJobId) await ctx.scheduler.cancel(post.scheduledJobId).catch(() => undefined);
    await ctx.db.patch(post._id, { status: "draft", scheduledFor: undefined, scheduledJobId: undefined, updatedAt: Date.now() });
    return null;
  },
});

/** Runs at the scheduled time. A post that no longer passes the checks goes back for review. */
export const publishScheduled = internalMutation({
  args: { postId: v.id("blogPosts") },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post || post.status !== "scheduled") return null;
    try {
      await publishNow(ctx, { ...post, scheduledJobId: undefined }, post.lastEditedBy ?? post.ownerId);
    } catch (error) {
      // Only the "not ready" refusal is handled here (it happens before anything is written)
      if (!(error instanceof ConvexError)) throw error;
      const reason = typeof error.data === "string" ? error.data : "It could not be published.";
      await ctx.db.patch(post._id, {
        status: "in_review",
        scheduledFor: undefined,
        scheduledJobId: undefined,
        reviewNote: `Scheduled publishing stopped. ${reason}`,
        updatedAt: Date.now(),
      });
      const admins = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "admin")).take(50);
      for (const admin of admins) await notify(ctx, admin._id, "A scheduled post didn't go live", `"${post.title}": ${reason}`, post._id);
    }
    return null;
  },
});

/** Takes a post off the site. The working copy stays, as a draft. */
export const unpublishPost = mutation({
  args: { postId: v.id("blogPosts") },
  handler: async (ctx, args) => {
    const staff = await requireBlogAdmin(ctx);
    const post = await loadPost(ctx, staff, args.postId);
    if (!post.isLive) return null;
    const category = post.liveCategoryId ? await ctx.db.get(post.liveCategoryId) : null;
    const author = post.liveAuthorId ? await ctx.db.get(post.liveAuthorId) : null;
    await ctx.db.patch(post._id, {
      isLive: false,
      live: undefined,
      liveSlug: undefined,
      liveCategoryId: undefined,
      liveAuthorId: undefined,
      status: "draft",
      updatedAt: Date.now(),
    });
    const liveBody = await bodyRow(ctx, post._id, "live");
    if (liveBody) await ctx.db.delete(liveBody._id);
    await refreshSite(ctx, [
      post.liveSlug ? `/blog/${post.liveSlug}` : undefined,
      category ? `/blog/category/${category.slug}` : undefined,
      author ? `/blog/author/${author.slug}` : undefined,
    ]);
    return null;
  },
});

export const deletePost = mutation({
  args: { postId: v.id("blogPosts") },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);
    const post = await loadPost(ctx, staff, args.postId);
    const writerMay =
      post.ownerId === staff.user._id && !post.isLive && !post.publishedAt && (post.status === "draft" || post.status === "changes_requested");
    if (!staff.isAdmin && !writerMay) throw new ConvexError("Only an administrator can delete this post.");
    if (post.scheduledJobId) await ctx.scheduler.cancel(post.scheduledJobId).catch(() => undefined);
    for (const kind of ["draft", "live"] as const) {
      const row = await bodyRow(ctx, post._id, kind);
      if (row) await ctx.db.delete(row._id);
    }
    const revisions = await ctx.db.query("blogRevisions").withIndex("by_post", (q) => q.eq("postId", post._id)).take(100);
    for (const r of revisions) await ctx.db.delete(r._id);
    const redirects = await ctx.db.query("blogSlugRedirects").withIndex("by_post", (q) => q.eq("postId", post._id)).take(100);
    for (const r of redirects) await ctx.db.delete(r._id);
    await ctx.db.delete(post._id);
    if (post.isLive) await refreshSite(ctx, [post.liveSlug ? `/blog/${post.liveSlug}` : undefined]);
    return null;
  },
});

// ── History ──────────────────────────────────────────────────────────────────

export const listRevisions = query({
  args: { postId: v.id("blogPosts") },
  handler: async (ctx, args) => {
    const staff = await staffOrNull(ctx);
    if (!staff) return [];
    const post = await ctx.db.get(args.postId);
    if (!post || !canSee(staff, post)) return [];
    const revisions = await ctx.db.query("blogRevisions").withIndex("by_post", (q) => q.eq("postId", post._id)).order("desc").take(MAX_REVISIONS);
    const names = new Map<string, string>();
    const out = [];
    for (const r of revisions) {
      if (!names.has(r.savedBy)) names.set(r.savedBy, r.savedBy === staff.user._id ? "You" : personName(await ctx.db.get(r.savedBy)));
      out.push({ _id: r._id, title: r.title, reason: r.reason, savedAt: r.savedAt, savedBy: names.get(r.savedBy)!, words: bodyStats(parseBody(r.body)).wordCount });
    }
    return out;
  },
});

/** Puts an earlier version back as the working copy (the current one is kept in history first). */
export const restoreRevision = mutation({
  args: { revisionId: v.id("blogRevisions") },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);
    const revision = await ctx.db.get(args.revisionId);
    if (!revision) throw new ConvexError("That version is no longer kept.");
    const post = await loadPost(ctx, staff, revision.postId);
    if (!canEdit(staff, post)) throw new ConvexError("You can't edit this post right now.");
    const now = Date.now();
    const current = (await bodyRow(ctx, post._id, "draft"))?.body ?? "";
    await saveRevision(ctx, post, current, "restored", staff.user._id, now - 1);
    const stats = bodyStats(parseBody(revision.body));
    await ctx.db.patch(post._id, {
      title: revision.title,
      wordCount: stats.wordCount,
      readingMinutes: stats.readingMinutes,
      status: post.status === "published" ? "draft" : post.status,
      lastEditedBy: staff.user._id,
      updatedAt: now,
    });
    await writeBody(ctx, post._id, "draft", revision.body, now);
    return { title: revision.title, body: revision.body };
  },
});

// ── Categories ───────────────────────────────────────────────────────────────

export const adminCategories = query({
  args: {},
  handler: async (ctx) => {
    const staff = await staffOrNull(ctx);
    if (!staff) return [];
    const categories = await ctx.db.query("blogCategories").withIndex("by_order").take(100);
    const posts = await ctx.db.query("blogPosts").take(1000);
    return categories.map((c) => ({
      _id: c._id,
      slug: c.slug,
      name: c.name,
      description: c.description ?? "",
      order: c.order,
      postCount: posts.filter((p) => p.categoryId === c._id || p.liveCategoryId === c._id).length,
    }));
  },
});

export const saveCategory = mutation({
  args: {
    categoryId: v.optional(v.id("blogCategories")),
    name: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireBlogAdmin(ctx);
    const name = clip(args.name, 60);
    if (!name) throw new ConvexError("Give the category a name.");
    const now = Date.now();
    const existing = args.categoryId ? await ctx.db.get(args.categoryId) : null;
    if (args.categoryId && !existing) throw new ConvexError("We couldn't find that category.");
    const slug = await uniqueSlugIn(ctx, "blogCategories", clip(args.slug, 60) || existing?.slug || name, existing?._id);
    const description = optional(args.description, 300);
    if (existing) {
      await ctx.db.patch(existing._id, { name, slug, description, order: args.order ?? existing.order, updatedAt: now });
      await refreshSite(ctx, [`/blog/category/${existing.slug}`, `/blog/category/${slug}`]);
      return existing._id;
    }
    const last = await ctx.db.query("blogCategories").withIndex("by_order").order("desc").first();
    return await ctx.db.insert("blogCategories", { name, slug, description, order: args.order ?? (last?.order ?? 0) + 1, createdAt: now, updatedAt: now });
  },
});

export const deleteCategory = mutation({
  args: { categoryId: v.id("blogCategories") },
  handler: async (ctx, args) => {
    await requireBlogAdmin(ctx);
    const posts = await ctx.db.query("blogPosts").take(1000);
    const used = posts.filter((p) => p.categoryId === args.categoryId || p.liveCategoryId === args.categoryId).length;
    if (used > 0) throw new ConvexError(`${used} post${used === 1 ? " uses" : "s use"} this category. Move them to another one first.`);
    await ctx.db.delete(args.categoryId);
    return null;
  },
});

// ── Authors ──────────────────────────────────────────────────────────────────

export const adminAuthors = query({
  args: {},
  handler: async (ctx) => {
    const staff = await staffOrNull(ctx);
    if (!staff) return [];
    const authors = await ctx.db.query("blogAuthors").take(200);
    const posts = await ctx.db.query("blogPosts").take(1000);
    const rows = [];
    for (const a of authors) {
      const account = a.userId ? await ctx.db.get(a.userId) : null;
      rows.push({
        _id: a._id,
        slug: a.slug,
        name: a.name,
        credentials: a.credentials ?? "",
        bio: a.bio ?? "",
        photo: a.photo ?? null,
        sameAs: a.sameAs,
        accountName: account ? personName(account) : null,
        mine: a.userId === staff.user._id,
        canEdit: staff.isAdmin || a.userId === staff.user._id,
        postCount: posts.filter((p) => p.authorId === a._id || p.liveAuthorId === a._id).length,
        reviewCount: posts.filter((p) => p.reviewerId === a._id).length,
      });
    }
    return rows.sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name));
  },
});

/** Admins edit any byline; a writer edits only their own (and can make it if it's missing). */
export const saveAuthor = mutation({
  args: {
    authorId: v.optional(v.id("blogAuthors")),
    name: v.string(),
    slug: v.optional(v.string()),
    credentials: v.optional(v.string()),
    bio: v.optional(v.string()),
    photo: v.optional(blogImageValidator),
    sameAs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);
    const name = clip(args.name, 80);
    if (!name) throw new ConvexError("Add a name.");
    const now = Date.now();
    let existing = args.authorId ? await ctx.db.get(args.authorId) : null;
    if (args.authorId && !existing) throw new ConvexError("We couldn't find that author.");
    if (!staff.isAdmin) {
      if (existing && existing.userId !== staff.user._id) throw new ConvexError("You can only edit your own profile.");
      if (!existing) existing = await ctx.db.get(await authorForUser(ctx, staff.user));
    }
    const fields = {
      name,
      credentials: optional(args.credentials, 120),
      bio: optional(args.bio, 1200),
      photo: cleanImage(args.photo, "The photo"),
      sameAs: cleanLinks(args.sameAs),
      updatedAt: now,
    };
    if (existing) {
      // Only an admin changes an author's address: published author pages are linked from posts
      const slug = staff.isAdmin && clip(args.slug, 60) ? await uniqueSlugIn(ctx, "blogAuthors", args.slug!, existing._id) : existing.slug;
      await ctx.db.patch(existing._id, { ...fields, slug });
      await refreshSite(ctx, [`/blog/author/${existing.slug}`, `/blog/author/${slug}`]);
      return existing._id;
    }
    return await ctx.db.insert("blogAuthors", {
      ...fields,
      slug: await uniqueSlugIn(ctx, "blogAuthors", clip(args.slug, 60) || name),
      createdAt: now,
    });
  },
});

export const deleteAuthor = mutation({
  args: { authorId: v.id("blogAuthors") },
  handler: async (ctx, args) => {
    await requireBlogAdmin(ctx);
    const posts = await ctx.db.query("blogPosts").take(1000);
    const used = posts.filter((p) => p.authorId === args.authorId || p.liveAuthorId === args.authorId || p.reviewerId === args.authorId).length;
    if (used > 0) throw new ConvexError(`${used} post${used === 1 ? " names" : "s name"} this person. Change those posts first.`);
    await ctx.db.delete(args.authorId);
    return null;
  },
});

// ── Media ────────────────────────────────────────────────────────────────────

export const listMedia = query({
  args: {},
  handler: async (ctx) => {
    const staff = await staffOrNull(ctx);
    if (!staff) return [];
    const media = await ctx.db.query("blogMedia").withIndex("by_created").order("desc").take(300);
    return media.map((m) => ({
      _id: m._id,
      url: m.url,
      alt: m.alt,
      width: m.width ?? null,
      height: m.height ?? null,
      bytes: m.bytes ?? null,
      createdAt: m.createdAt,
      canDelete: staff.isAdmin || m.uploadedBy === staff.user._id,
    }));
  },
});

/** Signature for one browser upload into the public /blog folder. Each upload needs a fresh one. */
export const uploadAuth = action({
  args: {},
  handler: async (ctx): Promise<{ token: string; expire: number; signature: string; publicKey: string; folder: string }> => {
    await ctx.runQuery(assertStaffRef, {});
    return imagekitUploadAuth(BLOG_FOLDER);
  },
});

export const assertStaff = internalQuery({
  args: {},
  handler: async (ctx) => {
    const staff = await requireStaff(ctx);
    return { userId: staff.user._id, isAdmin: staff.isAdmin };
  },
});

export const addMedia = mutation({
  args: {
    url: v.string(),
    fileId: v.string(),
    alt: v.string(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    bytes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);
    if (!IMAGEKIT_URL.test(args.url)) throw new ConvexError("That image wasn't uploaded here.");
    return await ctx.db.insert("blogMedia", {
      url: args.url,
      fileId: args.fileId,
      alt: clip(args.alt, 200),
      width: args.width,
      height: args.height,
      bytes: args.bytes,
      uploadedBy: staff.user._id,
      createdAt: Date.now(),
    });
  },
});

export const updateMediaAlt = mutation({
  args: { mediaId: v.id("blogMedia"), alt: v.string() },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);
    const media = await ctx.db.get(args.mediaId);
    if (!media) throw new ConvexError("We couldn't find that image.");
    if (!staff.isAdmin && media.uploadedBy !== staff.user._id) throw new ConvexError("You can only change images you uploaded.");
    await ctx.db.patch(media._id, { alt: clip(args.alt, 200) });
    return null;
  },
});

/** Removes the file from ImageKit too; posts still using it would show a broken picture. */
export const deleteMedia = mutation({
  args: { mediaId: v.id("blogMedia") },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);
    const media = await ctx.db.get(args.mediaId);
    if (!media) return null;
    if (!staff.isAdmin && media.uploadedBy !== staff.user._id) throw new ConvexError("You can only delete images you uploaded.");
    const posts = await ctx.db.query("blogPosts").take(1000);
    const onCover = posts.filter((p) => p.cover?.url === media.url || p.live?.cover?.url === media.url).length;
    if (onCover > 0) throw new ConvexError(`This is the cover of ${onCover} post${onCover === 1 ? "" : "s"}. Change the cover first.`);
    await ctx.db.delete(media._id);
    await removeImagekitFilesLater(ctx, [media.fileId]);
    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Telling the website and search engines
// ─────────────────────────────────────────────────────────────────────────────

export const pingSite = internalAction({
  args: { paths: v.array(v.string()), announce: v.array(v.string()) },
  handler: async (_ctx, args) => {
    const origin = publicAppUrl();
    const secret = process.env.BLOG_REVALIDATE_SECRET?.trim();
    if (secret) {
      try {
        const res = await fetch(`${origin}/api/revalidate/blog`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-blog-secret": secret },
          body: JSON.stringify({ paths: args.paths }),
        });
        if (!res.ok) console.warn(`Blog revalidate failed (${res.status})`);
      } catch {
        console.warn("Blog revalidate could not reach the site");
      }
    }
    // IndexNow (Bing, Yandex and others): tells them a page is new or changed, so it is crawled sooner
    const key = process.env.INDEXNOW_KEY?.trim();
    if (key && args.announce.length > 0 && origin.startsWith("https://")) {
      try {
        const res = await fetch("https://api.indexnow.org/indexnow", {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            host: new URL(origin).host,
            key,
            keyLocation: `${origin}/indexnow-key.txt`,
            urlList: args.announce.map((path) => `${origin}${path}`),
          }),
        });
        if (!res.ok && res.status !== 202) console.warn(`IndexNow answered ${res.status}`);
      } catch {
        console.warn("IndexNow could not be reached");
      }
    }
    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// AI assist: suggestions only, the writer always chooses what goes in
// ─────────────────────────────────────────────────────────────────────────────

/** Counts one AI call against today's allowance, or refuses when it is used up. */
export const aiGate = internalMutation({
  args: {},
  handler: async (ctx) => {
    const staff = await requireStaff(ctx);
    if (!aiConfigured()) throw new ConvexError("AI assist isn't switched on yet. Ask an administrator.");
    const limit = staff.isAdmin ? AI_DAILY_LIMIT.admin : AI_DAILY_LIMIT.writer;
    const day = utcDay(Date.now());
    const usage = await ctx.db.query("blogAiUsage").withIndex("by_user_day", (q) => q.eq("userId", staff.user._id).eq("day", day)).first();
    const used = usage?.count ?? 0;
    if (used >= limit) throw new ConvexError(`You've used today's ${limit} AI suggestions. They reset at midnight (UTC).`);
    if (usage) await ctx.db.patch(usage._id, { count: used + 1 });
    else await ctx.db.insert("blogAiUsage", { userId: staff.user._id, day, count: 1 });
    return { remaining: limit - used - 1 };
  },
});

export const aiLinkCandidates = internalQuery({
  args: { excludePostId: v.optional(v.id("blogPosts")) },
  handler: async (ctx, args) => {
    const live = await ctx.db.query("blogPosts").withIndex("by_live", (q) => q.eq("isLive", true)).order("desc").take(80);
    return live
      .filter((p) => livePosts(p) && p._id !== args.excludePostId)
      .map((p) => ({ title: p.live!.title, slug: p.live!.slug, excerpt: p.live!.excerpt.slice(0, 160) }));
  },
});

const AI_HOUSE_RULES = [
  "You help write the blog of Rehabify Health (also known as Physio Around Me), a physiotherapy service in Nigeria.",
  "Readers are patients and their families, not clinicians. Write plain, warm British English that a secondary-school leaver reads easily.",
  "Never diagnose, never give medicine names or doses, and never promise a cure or an exact recovery time.",
  "Never invent statistics, studies, quotes, sources or links. If a fact is not in the material you are given, leave it out.",
  "No hype words, no emojis, no em dashes.",
  "Reply with one JSON object only, exactly in the shape asked for, with no extra keys.",
].join("\n");

const REWRITE_MODES: Record<string, string> = {
  simpler: "Rewrite it in simpler words and shorter sentences, keeping every fact.",
  shorter: "Make it about half as long, keeping the key facts.",
  longer: "Expand it with helpful explanation and one practical example. Add no new medical claims.",
  warmer: "Make the tone warmer and more encouraging, without becoming salesy.",
  nigerian: "Adapt it for readers in Nigeria: everyday local examples, naira where money comes up, nothing specific to the US or UK health systems.",
  fix: "Fix spelling, grammar and punctuation only. Change nothing else.",
};

const SITE_PAGES = [
  { title: "Find a physiotherapist near you", path: "/find-a-physio" },
  { title: "Pricing", path: "/pricing" },
  { title: "How Rehabify works for patients", path: "/platform/patients" },
  { title: "Care for a family member", path: "/platform/family" },
  { title: "Meet Joy, our WhatsApp assistant", path: "/meet-joy" },
  { title: "Pay later for physiotherapy", path: "/pay-later" },
];

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    const value = JSON.parse(trimmed);
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // handled below
  }
  throw new ConvexError("The AI sent back something we couldn't read. Try again.");
}

const str = (value: unknown, max = 4000) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const list = (value: unknown) => (Array.isArray(value) ? value : []);

export const aiAssist = action({
  args: {
    task: v.union(
      v.literal("titles"),
      v.literal("meta"),
      v.literal("outline"),
      v.literal("rewrite"),
      v.literal("faq"),
      v.literal("links"),
      v.literal("alt"),
      v.literal("safety")
    ),
    postId: v.optional(v.id("blogPosts")),
    title: v.optional(v.string()),
    keyword: v.optional(v.string()),
    /** The article as plain text, or the selected passage for "rewrite" */
    text: v.optional(v.string()),
    mode: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ result: Record<string, unknown>; remaining: number }> => {
    const title = clip(args.title, 200);
    const keyword = clip(args.keyword, 100);
    const text = clip(args.text, 24_000);
    const context = [title ? `Title: ${title}` : "", keyword ? `Focus keyword: ${keyword}` : ""].filter(Boolean).join("\n");
    const article = text ? `\n\nArticle:\n"""\n${text}\n"""` : "";

    let user = "";
    let imageUrl: string | undefined;
    let maxOutputTokens = 4000;
    switch (args.task) {
      case "titles":
        if (!title && !text) throw new ConvexError("Write a working title or some of the post first.");
        user = `Suggest 5 titles for this blog post. Each 40 to 60 characters, clear about what the reader gets, the focus keyword near the start when one is given, no clickbait.\nShape: {"titles": ["...", "...", "...", "...", "..."]}\n\n${context}${article}`;
        break;
      case "meta":
        if (!text && !title) throw new ConvexError("Write some of the post first.");
        user = `Write the search details for this blog post.\n- metaTitle: 45 to 60 characters, keyword near the start.\n- metaDescription: 130 to 155 characters, says what the reader will learn, ends with a reason to click.\n- excerpt: one or two sentences, 120 to 220 characters, for the blog card.\n- slug: 3 to 6 lowercase words joined by hyphens.\n- focusKeyword: the phrase a patient in Nigeria would type into Google (2 to 4 words). Keep the given one if it fits.\n- relatedKeywords: 5 related phrases worth using in the text.\nShape: {"metaTitle": "", "metaDescription": "", "excerpt": "", "slug": "", "focusKeyword": "", "relatedKeywords": []}\n\n${context}${article}`;
        break;
      case "outline":
        if (!title && !keyword) throw new ConvexError("Add a title or a focus keyword first.");
        user = `Plan this blog post: 5 to 8 sections a patient would want, in a sensible order, ending with when to see a physiotherapist. Level 2 for sections, level 3 for sub-sections. Under each heading give 2 or 3 short points to cover (what to explain, not finished sentences).\nShape: {"outline": [{"heading": "", "level": 2, "points": ["", ""]}]}\n\n${context}${article}`;
        break;
      case "rewrite": {
        if (!text) throw new ConvexError("Select some text first.");
        const how = REWRITE_MODES[args.mode ?? ""] ?? REWRITE_MODES.simpler;
        user = `${how}\nKeep the meaning. Keep it as plain text with the same paragraph breaks. Do not add headings or lists.\nShape: {"text": ""}\n\nText:\n"""\n${text}\n"""`;
        break;
      }
      case "faq":
        if (text.length < 400) throw new ConvexError("Write more of the post first; the questions come from what it says.");
        user = `Write 4 to 6 questions a patient would ask after reading this article, each with an answer of 30 to 70 words. Use only what the article says.\nShape: {"items": [{"question": "", "answer": ""}]}\n\n${context}${article}`;
        break;
      case "links": {
        if (text.length < 400) throw new ConvexError("Write more of the post first.");
        const posts = await ctx.runQuery(aiLinkCandidatesRef, { excludePostId: args.postId });
        const pages = [
          ...SITE_PAGES.map((p) => `- ${p.path} | ${p.title}`),
          ...posts.map((p) => `- /blog/${p.slug} | ${p.title} | ${p.excerpt}`),
        ].join("\n");
        user = `Pick up to 5 places in this article to link to one of our pages. For each, "anchorText" must be words copied exactly from the article (2 to 6 words, not a heading), "path" must be copied exactly from the list, and "reason" says in a few words why it helps the reader. Skip weak matches; fewer good links beat many loose ones.\nShape: {"links": [{"anchorText": "", "path": "", "reason": ""}]}\n\nOur pages:\n${pages}${article}`;
        break;
      }
      case "alt": {
        const url = clip(args.imageUrl, 600);
        if (!IMAGEKIT_URL.test(url)) throw new ConvexError("Upload the image first.");
        imageUrl = `${url}${url.includes("?") ? "&" : "?"}tr=w-768,q-70`;
        maxOutputTokens = 1500;
        user = `Write alt text for this image from a physiotherapy blog post: say what the picture shows in one sentence of at most 120 characters. Do not start with "Image of" or "Picture of". Describe people by what they are doing, not by guessing who they are.\nShape: {"alt": ""}\n\n${context}${args.caption ? `\nCaption: ${clip(args.caption, 200)}` : ""}`;
        break;
      }
      case "safety":
        if (text.length < 200) throw new ConvexError("Write more of the post first.");
        user = `Check this health article before it is published. Find passages that could mislead or harm a reader. Look for: a health claim stated as fact with no source; advice to diagnose or treat yourself; medicine names or doses; promised results or recovery times; exercises described without a warning to stop if pain worsens; and symptoms that need urgent care (numbness, loss of bladder or bowel control, chest pain, sudden weakness, a fall with a head injury, unexplained weight loss, fever with back pain) mentioned without telling the reader to see a doctor straight away.\nFor each one, "quote" is the exact words from the article (at most 25 words), "problem" is one plain sentence, "suggestion" is how to reword or what to add, "severity" is "high", "medium" or "low". If nothing is wrong, return an empty list. "summary" is one sentence on the article overall.\nShape: {"summary": "", "issues": [{"quote": "", "problem": "", "suggestion": "", "severity": "medium"}]}\n\n${context}${article}`;
        break;
    }

    const gate = await ctx.runMutation(aiGateRef, {});
    let raw: Record<string, unknown>;
    try {
      raw = parseJsonObject((await callLlmJson({ system: AI_HOUSE_RULES, user, maxOutputTokens, imageUrl })).text);
    } catch (error) {
      // The shared helper words its errors for the scribe; say the same thing for the blog
      const message = error instanceof ConvexError && typeof error.data === "string" ? error.data : "";
      if (/isn't set up yet/.test(message)) throw new ConvexError("AI assist isn't switched on yet. Ask an administrator.");
      if (/ran out of room|empty draft/.test(message)) throw new ConvexError("The AI couldn't finish that. Try again with less text.");
      throw error instanceof ConvexError ? error : new ConvexError("AI assist couldn't do that just now. Try again.");
    }

    // Keep only the shape we asked for, so nothing unexpected reaches the editor
    let result: Record<string, unknown>;
    switch (args.task) {
      case "titles":
        result = { titles: list(raw.titles).map((t) => str(t, 160)).filter(Boolean).slice(0, 6) };
        break;
      case "meta":
        result = {
          metaTitle: str(raw.metaTitle, 120),
          metaDescription: str(raw.metaDescription, 320),
          excerpt: str(raw.excerpt, 400),
          slug: slugify(str(raw.slug, 100)),
          focusKeyword: str(raw.focusKeyword, 80),
          relatedKeywords: list(raw.relatedKeywords).map((k) => str(k, 80)).filter(Boolean).slice(0, 8),
        };
        break;
      case "outline":
        result = {
          outline: list(raw.outline)
            .map((item) => {
              const o = (item ?? {}) as Record<string, unknown>;
              return { heading: str(o.heading, 160), level: Number(o.level) === 3 ? 3 : 2, points: list(o.points).map((p) => str(p, 240)).filter(Boolean).slice(0, 5) };
            })
            .filter((o) => o.heading)
            .slice(0, 14),
        };
        break;
      case "rewrite":
        result = { text: str(raw.text, 30_000) };
        break;
      case "faq":
        result = {
          items: list(raw.items)
            .map((item) => {
              const o = (item ?? {}) as Record<string, unknown>;
              return { question: str(o.question, 240), answer: str(o.answer, 900) };
            })
            .filter((o) => o.question && o.answer)
            .slice(0, 8),
        };
        break;
      case "links":
        result = {
          links: list(raw.links)
            .map((item) => {
              const o = (item ?? {}) as Record<string, unknown>;
              return { anchorText: str(o.anchorText, 120), path: str(o.path, 200), reason: str(o.reason, 200) };
            })
            // Only paths on this site, and only words that really are in the article
            .filter((o) => o.anchorText && /^\/[a-z0-9\-/]*$/.test(o.path) && text.includes(o.anchorText))
            .slice(0, 6),
        };
        break;
      case "alt":
        result = { alt: str(raw.alt, 200).replace(/^(image|picture|photo) of\s+/i, "") };
        break;
      case "safety":
        result = {
          summary: str(raw.summary, 400),
          issues: list(raw.issues)
            .map((item) => {
              const o = (item ?? {}) as Record<string, unknown>;
              const severity = str(o.severity, 10).toLowerCase();
              return {
                quote: str(o.quote, 300),
                problem: str(o.problem, 400),
                suggestion: str(o.suggestion, 500),
                severity: severity === "high" || severity === "low" ? severity : "medium",
              };
            })
            .filter((o) => o.problem)
            .slice(0, 12),
        };
        break;
    }
    return { result, remaining: gate.remaining };
  },
});
