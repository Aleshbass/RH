import { defineTable } from "convex/server";
import { v } from "convex/values";

/** A picture on ImageKit (public /blog folder), with the alt text search engines and screen readers read. */
export const blogImageValidator = v.object({
  url: v.string(),
  fileId: v.optional(v.string()),
  alt: v.string(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
});

export const blogSeoValidator = v.object({
  /** The title in Google and on shared links (the post title when empty) */
  metaTitle: v.optional(v.string()),
  /** The snippet under the title in Google (the excerpt when empty) */
  metaDescription: v.optional(v.string()),
  /** The search phrase this post should rank for; drives the SEO checks */
  focusKeyword: v.optional(v.string()),
  noindex: v.optional(v.boolean()),
});

export const blogPostStatus = v.union(
  v.literal("draft"),
  v.literal("in_review"),
  v.literal("changes_requested"),
  v.literal("scheduled"),
  v.literal("published"),
  v.literal("archived")
);

/** What the public sees: copied from the working fields when an admin publishes. */
export const blogLiveValidator = v.object({
  slug: v.string(),
  title: v.string(),
  excerpt: v.string(),
  cover: v.optional(blogImageValidator),
  seo: blogSeoValidator,
  authorId: v.optional(v.id("blogAuthors")),
  reviewerId: v.optional(v.id("blogAuthors")),
  categoryId: v.optional(v.id("blogCategories")),
  tags: v.array(v.string()),
  wordCount: v.number(),
  readingMinutes: v.number(),
});

export const blogTables = {
  // Blog (convex/blog.ts). Writers (role blog_editor) and admins edit the working fields; only an
  // admin publishing copies them into `live`, which is all /blog ever reads. So edits to a live
  // post stay private until approved. Bodies are in blogPostBodies to keep these rows small.
  blogPosts: defineTable({
    // Working copy
    slug: v.string(),
    title: v.string(),
    excerpt: v.string(),
    cover: v.optional(blogImageValidator),
    seo: blogSeoValidator,
    authorId: v.optional(v.id("blogAuthors")),
    /** "Medically reviewed by" */
    reviewerId: v.optional(v.id("blogAuthors")),
    categoryId: v.optional(v.id("blogCategories")),
    tags: v.array(v.string()),
    wordCount: v.number(),
    readingMinutes: v.number(),

    status: blogPostStatus,
    /** The account that started the post; writers only see and edit their own */
    ownerId: v.id("users"),
    lastEditedBy: v.optional(v.id("users")),
    submittedAt: v.optional(v.number()),
    /** The admin's note when asking for changes */
    reviewNote: v.optional(v.string()),
    scheduledFor: v.optional(v.number()),
    scheduledJobId: v.optional(v.id("_scheduled_functions")),

    // Public copy
    live: v.optional(blogLiveValidator),
    isLive: v.boolean(),
    /** First publication (never moves); datePublished in structured data */
    publishedAt: v.optional(v.number()),
    /** Last time the public copy changed; dateModified and the sitemap's lastmod */
    liveUpdatedAt: v.optional(v.number()),
    /** Copies of live.slug / live.categoryId / live.authorId, so public pages can use an index */
    liveSlug: v.optional(v.string()),
    liveCategoryId: v.optional(v.id("blogCategories")),
    liveAuthorId: v.optional(v.id("blogAuthors")),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status", "updatedAt"])
    .index("by_owner", ["ownerId", "updatedAt"])
    .index("by_live", ["isLive", "publishedAt"])
    .index("by_live_slug", ["liveSlug"])
    .index("by_live_category", ["liveCategoryId", "publishedAt"])
    .index("by_live_author", ["liveAuthorId", "publishedAt"])
    .index("by_updated", ["updatedAt"]),

  // The Tiptap JSON of a post: the working draft and the published copy
  blogPostBodies: defineTable({
    postId: v.id("blogPosts"),
    kind: v.union(v.literal("draft"), v.literal("live")),
    body: v.string(),
    updatedAt: v.number(),
  }).index("by_post_kind", ["postId", "kind"]),

  // Old addresses of a post: /blog/<fromSlug> sends a 301 to the post's current address
  blogSlugRedirects: defineTable({
    fromSlug: v.string(),
    postId: v.id("blogPosts"),
    createdAt: v.number(),
  })
    .index("by_from", ["fromSlug"])
    .index("by_post", ["postId"]),

  // Saved versions of a post (on submit, publish, and at most every 10 minutes while editing)
  blogRevisions: defineTable({
    postId: v.id("blogPosts"),
    title: v.string(),
    body: v.string(),
    reason: v.union(v.literal("autosave"), v.literal("submitted"), v.literal("published"), v.literal("restored")),
    savedBy: v.id("users"),
    savedAt: v.number(),
  }).index("by_post", ["postId", "savedAt"]),

  // Bylines: writers and the clinicians who medically review posts (E-E-A-T for health content)
  blogAuthors: defineTable({
    slug: v.string(),
    name: v.string(),
    /** e.g. "PT, DPT · Sports physiotherapist" */
    credentials: v.optional(v.string()),
    bio: v.optional(v.string()),
    photo: v.optional(blogImageValidator),
    /** Profile links (LinkedIn, professional register...) for structured data */
    sameAs: v.array(v.string()),
    /** The account that writes as this author, if any */
    userId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_user", ["userId"]),

  blogCategories: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_order", ["order"]),

  // Images uploaded for the blog, so they can be picked again
  blogMedia: defineTable({
    url: v.string(),
    fileId: v.string(),
    alt: v.string(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    bytes: v.optional(v.number()),
    uploadedBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  // AI assist calls per person per UTC day (capped)
  blogAiUsage: defineTable({
    userId: v.id("users"),
    day: v.string(),
    count: v.number(),
  }).index("by_user_day", ["userId", "day"]),
};
