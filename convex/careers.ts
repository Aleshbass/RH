/**
 * Careers: roles admins post on /careers, and applications to them.
 *
 * Public: listOpenJobs, getJobBySlug, submitApplication (called by /api/careers/apply, which
 * rate-limits by IP; the CV is uploaded first with files.generateUploadUrl, PDF only).
 * Admin: everything prefixed `admin`, guarded by requireAdmin.
 *
 * Emails go through actions/emails/sendCareerEmails: a confirmation to the applicant and an alert
 * to admins on apply, an acceptance email when an admin accepts, and an optional kind "no" note.
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireAdmin } from "./helpers/partnerAccess";

const MAX_CV_BYTES = 5 * 1024 * 1024;

const workplace = v.union(v.literal("onsite"), v.literal("hybrid"), v.literal("remote"));
const employmentType = v.union(v.literal("full_time"), v.literal("part_time"), v.literal("contract"), v.literal("internship"));
const jobStatus = v.union(v.literal("draft"), v.literal("open"), v.literal("closed"));
const applicationStatus = v.union(
  v.literal("new"),
  v.literal("reviewing"),
  v.literal("interview"),
  v.literal("accepted"),
  v.literal("rejected")
);

type CareerEmailKind = "received" | "admin_new" | "accepted" | "declined";

// A plain reference, so this module doesn't depend on regenerating the `internal` api types
const sendCareerEmailRef = makeFunctionReference<
  "action",
  { kind: CareerEmailKind; to: string; applicantName: string; jobTitle: string; applicantEmail?: string },
  { success: boolean; error?: string }
>("actions/emails/sendCareerEmails:sendCareerEmail");

const clip = (value: string | undefined, max: number) => (value ?? "").trim().slice(0, max);
const optional = (value: string | undefined, max: number) => clip(value, max) || undefined;
const cleanList = (items: string[] | undefined) =>
  (items ?? []).map((item) => clip(item, 300)).filter(Boolean).slice(0, 20);
const isOpenNow = (job: Doc<"careerJobs">, now: number) => job.status === "open" && (!job.closesAt || job.closesAt > now);

function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "role"
  );
}

async function uniqueSlug(ctx: MutationCtx, title: string) {
  const base = slugify(title);
  for (let n = 1; n < 100; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await ctx.db.query("careerJobs").withIndex("by_slug", (q) => q.eq("slug", slug)).first();
    if (!taken) return slug;
  }
  return `${base}-${Date.now()}`;
}

/** Only https?:// links are kept, so nothing like javascript: ends up in the admin console. */
function cleanUrl(value: string | undefined) {
  const url = clip(value, 300);
  if (!url) return undefined;
  const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

// ── Public ────────────────────────────────────────────────────────────────────

export const listOpenJobs = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const open = await ctx.db.query("careerJobs").withIndex("by_status", (q) => q.eq("status", "open")).collect();
    return open
      .filter((job) => isOpenNow(job, now))
      .sort((a, b) => (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt))
      .map((job) => ({
        _id: job._id,
        slug: job.slug,
        title: job.title,
        team: job.team,
        location: job.location,
        workplace: job.workplace,
        employmentType: job.employmentType,
        summary: job.summary,
        publishedAt: job.publishedAt ?? job.createdAt,
      }));
  },
});

export const getJobBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.query("careerJobs").withIndex("by_slug", (q) => q.eq("slug", args.slug)).first();
    // Drafts stay private; closed roles still resolve so old links explain themselves
    if (!job || job.status === "draft") return null;
    return {
      _id: job._id,
      slug: job.slug,
      title: job.title,
      team: job.team,
      location: job.location,
      workplace: job.workplace,
      employmentType: job.employmentType,
      summary: job.summary,
      description: job.description,
      responsibilities: job.responsibilities,
      requirements: job.requirements,
      niceToHave: job.niceToHave ?? [],
      salary: job.salary ?? null,
      closesAt: job.closesAt ?? null,
      isOpen: isOpenNow(job, Date.now()),
    };
  },
});

export const submitApplication = mutation({
  args: {
    jobId: v.id("careerJobs"),
    fullName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    location: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    portfolioUrl: v.optional(v.string()),
    coverNote: v.optional(v.string()),
    cvStorageId: v.id("_storage"),
    cvFileName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const job = await ctx.db.get(args.jobId);
    if (!job || !isOpenNow(job, now)) throw new ConvexError("This role is no longer taking applications.");

    const fullName = clip(args.fullName, 120);
    const email = clip(args.email, 200).toLowerCase();
    if (!fullName) throw new ConvexError("Please enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ConvexError("Please enter a valid email address.");

    // The CV was uploaded by the browser: check it really is a small PDF before keeping it
    const file = await ctx.db.system.get(args.cvStorageId);
    if (!file) throw new ConvexError("Your CV didn't upload. Please attach it again.");
    if (file.contentType !== "application/pdf" || file.size > MAX_CV_BYTES) {
      await ctx.storage.delete(args.cvStorageId);
      throw new ConvexError("Your CV must be a PDF of 5 MB or less.");
    }

    const existing = await ctx.db
      .query("careerApplications")
      .withIndex("by_email_and_job", (q) => q.eq("email", email).eq("jobId", job._id))
      .first();
    if (existing) {
      await ctx.storage.delete(args.cvStorageId);
      throw new ConvexError("You've already applied for this role. We'll be in touch by email.");
    }

    const applicationId = await ctx.db.insert("careerApplications", {
      jobId: job._id,
      jobTitle: job.title,
      fullName,
      email,
      phone: optional(args.phone, 40),
      location: optional(args.location, 120),
      linkedinUrl: cleanUrl(args.linkedinUrl),
      portfolioUrl: cleanUrl(args.portfolioUrl),
      coverNote: optional(args.coverNote, 2000),
      cvStorageId: args.cvStorageId,
      cvFileName: optional(args.cvFileName, 160),
      status: "new",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, sendCareerEmailRef, { kind: "received", to: email, applicantName: fullName, jobTitle: job.title });

    const admins = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "admin")).collect();
    for (const admin of admins) {
      await ctx.db.insert("notifications", {
        userId: admin._id,
        type: "system_alert",
        title: "New job application",
        message: `${fullName} applied for ${job.title}.`,
        data: { applicationId, jobId: job._id },
        status: "pending",
        priority: "medium",
        createdAt: now,
        updatedAt: now,
      });
      if (admin.email) {
        await ctx.scheduler.runAfter(0, sendCareerEmailRef, {
          kind: "admin_new",
          to: admin.email,
          applicantName: fullName,
          applicantEmail: email,
          jobTitle: job.title,
        });
      }
    }

    return { success: true };
  },
});

// ── Admin ─────────────────────────────────────────────────────────────────────

const STATUS_ORDER: Record<Doc<"careerJobs">["status"], number> = { open: 0, draft: 1, closed: 2 };

export const adminListJobs = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const jobs = await ctx.db.query("careerJobs").collect();
    const withCounts = await Promise.all(
      jobs.map(async (job) => {
        const applications = await ctx.db.query("careerApplications").withIndex("by_job", (q) => q.eq("jobId", job._id)).collect();
        return {
          ...job,
          applicationCount: applications.length,
          newCount: applications.filter((a) => a.status === "new").length,
        };
      })
    );
    return withCounts.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.updatedAt - a.updatedAt);
  },
});

export const adminListApplications = query({
  args: { jobId: v.optional(v.id("careerJobs")) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows = args.jobId
      ? await ctx.db.query("careerApplications").withIndex("by_job", (q) => q.eq("jobId", args.jobId!)).collect()
      : await ctx.db.query("careerApplications").withIndex("by_created").order("desc").collect();
    const sorted = rows.sort((a, b) => b.createdAt - a.createdAt);
    return Promise.all(sorted.map(async (row) => ({ ...row, cvUrl: await ctx.storage.getUrl(row.cvStorageId) })));
  },
});

const jobFields = {
  title: v.string(),
  team: v.string(),
  location: v.string(),
  workplace,
  employmentType,
  summary: v.string(),
  description: v.string(),
  responsibilities: v.array(v.string()),
  requirements: v.array(v.string()),
  niceToHave: v.optional(v.array(v.string())),
  salary: v.optional(v.string()),
  status: jobStatus,
  closesAt: v.optional(v.number()),
};

/** Create (no id) or update a role. The slug is set once, so shared links keep working after edits. */
export const adminSaveJob = mutation({
  args: { id: v.optional(v.id("careerJobs")), ...jobFields },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const fields = {
      title: clip(args.title, 120),
      team: clip(args.team, 60),
      location: clip(args.location, 80),
      workplace: args.workplace,
      employmentType: args.employmentType,
      summary: clip(args.summary, 240),
      description: clip(args.description, 5000),
      responsibilities: cleanList(args.responsibilities),
      requirements: cleanList(args.requirements),
      niceToHave: cleanList(args.niceToHave),
      salary: optional(args.salary, 120),
      status: args.status,
      closesAt: args.closesAt,
    };
    if (!fields.title || !fields.team || !fields.location || !fields.summary) {
      throw new ConvexError("Add a title, team, location and one-line summary.");
    }
    if (fields.status === "open" && (fields.responsibilities.length === 0 || fields.requirements.length === 0)) {
      throw new ConvexError("Add at least one responsibility and one requirement before publishing.");
    }

    if (args.id) {
      const job = await ctx.db.get(args.id);
      if (!job) throw new ConvexError("Role not found.");
      await ctx.db.patch(args.id, {
        ...fields,
        publishedAt: job.publishedAt ?? (fields.status === "open" ? now : undefined),
        updatedAt: now,
      });
      return { id: args.id, slug: job.slug };
    }

    const slug = await uniqueSlug(ctx, fields.title);
    const id = await ctx.db.insert("careerJobs", {
      ...fields,
      slug,
      publishedAt: fields.status === "open" ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });
    return { id, slug };
  },
});

export const adminSetJobStatus = mutation({
  args: { id: v.id("careerJobs"), status: jobStatus },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const job = await ctx.db.get(args.id);
    if (!job) throw new ConvexError("Role not found.");
    if (args.status === "open" && (job.responsibilities.length === 0 || job.requirements.length === 0)) {
      throw new ConvexError("Add at least one responsibility and one requirement before publishing.");
    }
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: args.status,
      publishedAt: job.publishedAt ?? (args.status === "open" ? now : undefined),
      updatedAt: now,
    });
    return { success: true };
  },
});

/** Only roles nobody has applied to can be deleted; others are closed instead, keeping the history. */
export const adminDeleteJob = mutation({
  args: { id: v.id("careerJobs") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const hasApplications = await ctx.db.query("careerApplications").withIndex("by_job", (q) => q.eq("jobId", args.id)).first();
    if (hasApplications) throw new ConvexError("This role has applications. Close it instead of deleting it.");
    await ctx.db.delete(args.id);
    return { success: true };
  },
});

/**
 * Move an application along. Accepting always emails the applicant (once); rejecting emails them
 * only when `notifyApplicant` is set.
 */
export const adminUpdateApplication = mutation({
  args: {
    id: v.id("careerApplications"),
    status: v.optional(applicationStatus),
    adminNotes: v.optional(v.string()),
    notifyApplicant: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const application = await ctx.db.get(args.id);
    if (!application) throw new ConvexError("Application not found.");
    const now = Date.now();
    const next = args.status ?? application.status;
    const changed = next !== application.status;

    let emailKind: CareerEmailKind | null = null;
    if (changed && next === "accepted") emailKind = "accepted";
    if (changed && next === "rejected" && args.notifyApplicant) emailKind = "declined";

    await ctx.db.patch(args.id, {
      status: next,
      adminNotes: args.adminNotes === undefined ? application.adminNotes : optional(args.adminNotes, 4000),
      decisionEmailSentAt: emailKind ? now : application.decisionEmailSentAt,
      updatedAt: now,
    });

    if (emailKind) {
      await ctx.scheduler.runAfter(0, sendCareerEmailRef, {
        kind: emailKind,
        to: application.email,
        applicantName: application.fullName,
        jobTitle: application.jobTitle,
      });
    }
    return { success: true, emailed: emailKind !== null };
  },
});
