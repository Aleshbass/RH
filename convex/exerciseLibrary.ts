/**
 * The 3D exercise library: syncing the built catalog into the `exercises` table, clinical sign-off
 * of each animation, browsing, and handing out asset keys to viewers who are allowed to watch.
 *
 * Assets are static, encrypted files (public/exercise-library/<version>/). A viewer can only
 * decrypt what requestViewerGrant gives it keys for, and every grant is rate-limited and logged.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ensureUserRole } from "./auth";
import { EXERCISE_CATALOG, findClip, posterUrl } from "./exerciseLibraryCatalog";
import { LIBRARY, clipIdFor } from "./exerciseLibraryContent";
import { deriveAssetKey } from "./helpers/exerciseCrypto";
import { IMAGEKIT_URL, imagekitUploadAuth, removeImagekitFilesLater, signedImagekitUrl } from "./helpers/imagekit";
import { OWN_MEDIA_LIMITS, ownMediaFolder } from "../lib/ownExerciseMedia";
import {
  displayName,
  initials,
  libraryAccess,
  programClipIds,
  resolveShareSession,
} from "./helpers/exerciseAccess";
import { assertProgramUnlocked, isProgramLocked } from "./helpers/patientPlans";
import { awardPoints, tierOf } from "./rewards";

const HOUR = 3_600_000;
const GRANT_LIMITS = { staff: 300, licence: 200, learner: 200, patient: 120, link: 120 } as const;
const MAX_CLIPS_PER_GRANT = 30;

type ClipView = { id: string; side: "L" | "R" | null; seconds: number; poster: string };

function clipsFor(exercise: Doc<"exercises">): ClipView[] {
  if (!exercise.animationSlug) return [];
  const sides: ("L" | "R" | null)[] = exercise.sided ? ["L", "R"] : [null];
  return sides.flatMap((side) => {
    const id = clipIdFor(exercise.animationSlug!, Boolean(exercise.sided), side);
    const clip = findClip(id);
    return clip ? [{ id, side, seconds: clip.seconds, poster: posterUrl(id) }] : [];
  });
}

/** Library entry shape shared by the physio library, the send dialog and the patient player. */
export function libraryItem(exercise: Doc<"exercises">) {
  const clips = clipsFor(exercise);
  return {
    _id: exercise._id,
    name: exercise.name,
    description: exercise.description,
    instructions: exercise.instructions,
    precautions: exercise.precautions ?? [],
    bodyParts: exercise.bodyParts,
    targetMuscles: exercise.targetMuscles,
    conditions: exercise.conditions,
    equipment: exercise.equipmentNeeded,
    difficulty: exercise.difficultyLevel,
    position: exercise.position ?? null,
    sided: Boolean(exercise.sided),
    defaults: {
      sets: exercise.defaultSets,
      reps: exercise.defaultReps,
      holdSeconds: exercise.defaultHoldSeconds ?? null,
      frequency: exercise.defaultFrequency,
    },
    animation: clips.length
      ? { slug: exercise.animationSlug!, status: exercise.animationStatus ?? "draft", clips }
      : null,
    imageUrl: exercise.imageUrl ?? null,
    videoUrl: exercise.videoUrl ?? null,
    // A physio's own photos or video (links come from requestExerciseMediaLinks)
    ownMedia: ownMediaSummary(exercise),
    // Who made it, for exercises a physio shared to the library (filled in by exerciseAuthor)
    author: null as ExerciseAuthor | null,
  };
}

export type ExerciseAuthor = { name: string; tierKey: string; tierName: string };

/**
 * Credit for an exercise a physio made and the library accepted: "Chidera N." and their tier.
 * Null for Rehabify's own exercises and for anything still private.
 */
export async function exerciseAuthor(
  ctx: QueryCtx | MutationCtx,
  exercise: Doc<"exercises">,
  cache = new Map<string, ExerciseAuthor | null>()
): Promise<ExerciseAuthor | null> {
  if (!exercise.createdBy || !exercise.isPublic || exercise.libraryShare?.status !== "approved") return null;
  if (cache.has(exercise.createdBy)) return cache.get(exercise.createdBy)!;
  const user = await ctx.db.get(exercise.createdBy);
  const tier = await tierOf(ctx, exercise.createdBy);
  const author = user?.firstName
    ? { name: `${user.firstName}${user.lastName ? ` ${user.lastName[0]}.` : ""}`, tierKey: tier.key, tierName: tier.name }
    : null;
  cache.set(exercise.createdBy, author);
  return author;
}

export type LibraryItem = ReturnType<typeof libraryItem>;

// ─────────────────────────────────────────────────────────────────────────────
// Admin: sync and clinical sign-off
// ─────────────────────────────────────────────────────────────────────────────

/** Adds the catalog's exercises to the library (and refreshes their text when asked). */
export const syncLibrary = mutation({
  args: { overwriteText: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    return await syncCatalog(ctx, Boolean(args.overwriteText));
  },
});

/** Same as syncLibrary, for deploy scripts: `npx convex run exerciseLibrary:syncLibraryInternal`. */
export const syncLibraryInternal = internalMutation({
  args: { overwriteText: v.optional(v.boolean()) },
  handler: async (ctx, args) => syncCatalog(ctx, Boolean(args.overwriteText)),
});

async function syncCatalog(ctx: MutationCtx, overwriteText: boolean) {
  let created = 0;
  let updated = 0;
  for (const entry of LIBRARY) {
    const hasClips = entry.sided
      ? findClip(clipIdFor(entry.slug, true, "L")) && findClip(clipIdFor(entry.slug, true, "R"))
      : findClip(entry.slug);
    if (!hasClips) continue;
    const text = {
      name: entry.name,
      description: entry.description,
      instructions: entry.instructions,
      precautions: entry.precautions,
      bodyParts: entry.bodyParts,
      targetMuscles: entry.targetMuscles,
      conditions: entry.conditions,
      equipmentNeeded: entry.equipment,
      difficultyLevel: entry.difficulty,
      defaultSets: entry.defaults.sets,
      defaultReps: entry.defaults.reps,
      defaultFrequency: entry.defaults.frequency,
      defaultHoldSeconds: entry.defaults.holdSeconds,
    };
    const existing = await ctx.db
      .query("exercises")
      .withIndex("by_animation_slug", (q) => q.eq("animationSlug", entry.slug))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(overwriteText ? text : {}),
        sided: entry.sided,
        position: entry.position,
      });
      updated++;
    } else {
      await ctx.db.insert("exercises", {
        ...text,
        isPublic: true,
        tags: ["3d"],
        animationSlug: entry.slug,
        sided: entry.sided,
        position: entry.position,
        animationStatus: "draft",
      });
      created++;
    }
  }
  return { created, updated, version: EXERCISE_CATALOG.version };
}

/** A licensed physiotherapist (signed in as admin) signs off an animation, or withdraws it. */
export const setAnimationApproval = mutation({
  args: { exerciseId: v.id("exercises"), approved: v.boolean() },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const exercise = await ctx.db.get(args.exerciseId);
    if (!exercise?.animationSlug) throw new ConvexError("This exercise has no 3D demonstration.");
    await ctx.db.patch(args.exerciseId, args.approved
      ? { animationStatus: "approved", animationApprovedBy: admin._id, animationApprovedAt: Date.now() }
      : { animationStatus: "draft", animationApprovedBy: undefined, animationApprovedAt: undefined });
  },
});

/** Admin overview: every catalog exercise, whether it's in the library, and its sign-off. */
export const adminLibraryStatus = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    const rows = await ctx.db.query("exercises").collect();
    const bySlug = new Map(rows.filter((r) => r.animationSlug).map((r) => [r.animationSlug!, r]));
    const approvers = new Map<Id<"users">, string>();
    const out = [];
    for (const entry of LIBRARY) {
      const row = bySlug.get(entry.slug);
      let approvedByName: string | null = null;
      if (row?.animationApprovedBy) {
        if (!approvers.has(row.animationApprovedBy)) {
          approvers.set(row.animationApprovedBy, displayName(await ctx.db.get(row.animationApprovedBy), "Admin"));
        }
        approvedByName = approvers.get(row.animationApprovedBy)!;
      }
      out.push({
        slug: entry.slug,
        name: entry.name,
        sided: entry.sided,
        exercise: row ? libraryItem(row) : null,
        approvedAt: row?.animationApprovedAt ?? null,
        approvedByName,
      });
    }
    return { version: EXERCISE_CATALOG.version, items: out };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Browsing
// ─────────────────────────────────────────────────────────────────────────────

/** The library for physios, clinics and licensees: 3D exercises first, then the others. */
export const listLibrary = query({
  args: {},
  handler: async (ctx) => {
    const access = await libraryAccess(ctx);
    if (!access || access.kind === "patient") return null;
    const clinicId = access.user.clinicId;
    const publicRows = await ctx.db
      .query("exercises")
      .withIndex("by_public", (q) => q.eq("isPublic", true))
      .take(3000);
    const clinicRows = clinicId
      ? (
          await ctx.db
            .query("exercises")
            .withIndex("by_clinic", (q) => q.eq("clinicId", clinicId))
            .take(1000)
        ).filter((e) => !e.isPublic)
      : [];
    // The physio's own exercises that aren't shared with a clinic or the library
    const ownRows = (
      await ctx.db
        .query("exercises")
        .withIndex("by_creator", (q) => q.eq("createdBy", access.user._id))
        .take(2000)
    ).filter((e) => !e.isPublic && !(clinicId && e.clinicId === clinicId));
    const rows = [...publicRows, ...clinicRows, ...ownRows].filter((e) => !e.archivedAt);
    // Licensees only get the 3D library.
    const visible = access.kind === "licence" ? rows.filter((e) => e.animationSlug) : rows;
    const authors = new Map<string, ExerciseAuthor | null>();
    const items = await Promise.all(visible.map(async (e) => ({ ...libraryItem(e), author: await exerciseAuthor(ctx, e, authors) })));
    items.sort((a, b) => Number(Boolean(b.animation)) - Number(Boolean(a.animation)) || a.name.localeCompare(b.name));
    return { version: EXERCISE_CATALOG.version, access: access.kind, label: access.label, items };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Viewing keys
// ─────────────────────────────────────────────────────────────────────────────

async function programLabel(ctx: { db: any }, program: Doc<"exercisePrograms">) {
  if (program.clinicId) {
    const clinic = (await ctx.db.get(program.clinicId)) as Doc<"clinics"> | null;
    if (clinic) return clinic.name;
  }
  return displayName((await ctx.db.get(program.createdBy)) as Doc<"users"> | null);
}

/**
 * Keys to decrypt the character and the requested clips. Signed-in staff, licensees and Rehabify
 * Learn physios may watch any clip; a patient only clips in their own programme; a share-link session only that link's
 * programme. Patients and links only get clips a physiotherapist has approved.
 */
export const requestViewerGrant = mutation({
  args: {
    version: v.string(),
    clipIds: v.array(v.string()),
    programId: v.optional(v.id("exercisePrograms")),
    share: v.optional(v.object({ code: v.string(), session: v.string() })),
  },
  handler: async (ctx, args) => {
    if (!/^[a-f0-9]{12}$/.test(args.version)) throw new ConvexError("This exercise library version isn't available.");
    const requested = [...new Set(args.clipIds)].slice(0, MAX_CLIPS_PER_GRANT);
    if (requested.some((id) => !findClip(id))) throw new ConvexError("Unknown exercise.");
    const now = Date.now();

    let subject: string;
    let access: keyof typeof GRANT_LIMITS;
    let allowed: Set<string> | "all";
    let watermark: string;
    let userId: Id<"users"> | undefined;
    let linkId: Id<"exerciseShareLinks"> | undefined;
    let licenceId: Id<"libraryLicences"> | undefined;

    if (args.share) {
      const res = await resolveShareSession(ctx, args.share.code, args.share.session);
      if (!res.ok) throw new ConvexError(res.reason === "needs_pin" ? "Enter your PIN again to continue." : "This link is no longer available.");
      access = "link";
      subject = `link:${res.link._id}`;
      linkId = res.link._id;
      // Demonstrations are part of Flex for an independent physio's own patients (patientPlans.ts)
      await assertProgramUnlocked(ctx, res.program, "demo");
      allowed = await programClipIds(ctx, res.program);
      watermark = `${await programLabel(ctx, res.program)} · ${initials(await ctx.db.get(res.program.patientId))}`;
      await ctx.db.patch(res.link._id, { openCount: res.link.openCount + 1, lastOpenedAt: now });
    } else {
      const viewer = await libraryAccess(ctx);
      if (!viewer) throw new ConvexError("Sign in to watch this exercise.");
      userId = viewer.user._id;
      subject = `user:${viewer.user._id}`;
      if (viewer.kind === "patient") {
        access = "patient";
        if (!args.programId) throw new ConvexError("Open the exercise from your programme.");
        const program = await ctx.db.get(args.programId);
        if (!program || program.patientId !== viewer.user._id || program.status !== "active") {
          throw new ConvexError("This programme isn't available.");
        }
        await assertProgramUnlocked(ctx, program, "demo");
        allowed = await programClipIds(ctx, program);
        watermark = `${await programLabel(ctx, program)} · ${initials(viewer.user)}`;
      } else {
        access = viewer.kind;
        allowed = "all";
        watermark = viewer.kind === "staff" ? `${viewer.label} · Preview` : viewer.label;
        if (viewer.kind === "licence") licenceId = viewer.licence._id;
      }
    }

    const recent = await ctx.db
      .query("exerciseViewGrants")
      .withIndex("by_subject", (q) => q.eq("subject", subject).gt("createdAt", now - HOUR))
      .take(GRANT_LIMITS[access] + 1);
    if (recent.length >= GRANT_LIMITS[access]) {
      throw new ConvexError("Too many exercise views in the last hour. Try again a little later.");
    }

    const permitted = requested.filter((id) => allowed === "all" || allowed.has(id));
    await ctx.db.insert("exerciseViewGrants", {
      subject,
      userId,
      linkId,
      licenceId,
      access,
      clipCount: permitted.length,
      version: args.version,
      createdAt: now,
    });

    const clips: Record<string, string> = {};
    for (const id of permitted) clips[id] = await deriveAssetKey(`motion:${id}`, args.version);
    return {
      version: args.version,
      character: permitted.length ? await deriveAssetKey("character", args.version) : null,
      clips,
      denied: requested.filter((id) => !permitted.includes(id)),
      watermark,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// A physio's own exercises, with their own photos or video
// ─────────────────────────────────────────────────────────────────────────────

const OWN_LINK_MS = 6 * HOUR;

const fileValidator = v.object({ fileId: v.string(), filePath: v.string(), url: v.string(), size: v.number() });
const ownMediaValidator = v.object({
  video: v.optional(
    v.object({ fileId: v.string(), filePath: v.string(), url: v.string(), size: v.number(), durationSec: v.number(), poster: v.optional(fileValidator) })
  ),
  photos: v.optional(v.array(fileValidator)),
});
const consentValidator = v.union(v.literal("no_patient"), v.literal("patient_consented"));

/** Staff who may keep their own exercises: approved physios and clinic teams. */
async function ownExerciseAuthor(ctx: QueryCtx | MutationCtx) {
  const access = await libraryAccess(ctx);
  if (!access || access.kind !== "staff") throw new ConvexError("Only physiotherapists and clinic teams can add their own exercises.");
  return access.user;
}

/** What a physio's own exercises use against the fair-use limits. */
async function ownUsage(ctx: QueryCtx | MutationCtx, userId: Id<"users">, except?: Id<"exercises">) {
  const rows = await ctx.db
    .query("exercises")
    .withIndex("by_creator", (q) => q.eq("createdBy", userId))
    .take(2000);
  let videos = 0;
  let bytes = 0;
  for (const row of rows) {
    if (row._id === except || !row.ownMedia) continue;
    if (row.ownMedia.video) videos++;
    bytes += row.ownMedia.totalBytes;
  }
  return { videos, bytes };
}

/** Summary for lists: what media there is, never the file links. */
function ownMediaSummary(exercise: Doc<"exercises">) {
  const media = exercise.ownMedia;
  if (!media) return null;
  return {
    kind: media.video ? ("video" as const) : ("photos" as const),
    photoCount: media.photos?.length ?? 0,
    durationSec: media.video?.durationSec ?? null,
    totalBytes: media.totalBytes,
  };
}

/** The signed-in physio's own exercises and how much of their allowance they've used. */
export const myOwnExercises = query({
  args: {},
  handler: async (ctx) => {
    const access = await libraryAccess(ctx);
    if (!access || access.kind !== "staff") return null;
    const rows = await ctx.db
      .query("exercises")
      .withIndex("by_creator", (q) => q.eq("createdBy", access.user._id))
      .take(2000);
    const usage = await ownUsage(ctx, access.user._id);
    const items = rows
      .filter((row) => !row.archivedAt)
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((row) => ({
        ...libraryItem(row),
        libraryShare: row.libraryShare?.status ?? null,
        createdAt: row._creationTime,
      }));
    return { items, usage, limits: OWN_MEDIA_LIMITS };
  },
});

/** A signature to upload one photo or video straight from the browser into the physio's folder. */
export const ownExerciseUploadAuth = mutation({
  args: { kind: v.union(v.literal("video"), v.literal("photo")) },
  handler: async (ctx, args) => {
    const user = await ownExerciseAuthor(ctx);
    const usage = await ownUsage(ctx, user._id);
    if (usage.bytes >= OWN_MEDIA_LIMITS.totalBytes) {
      throw new ConvexError("You've used all 2 GB of your exercise storage. Remove some photos or videos first.");
    }
    if (args.kind === "video" && usage.videos >= OWN_MEDIA_LIMITS.videos) {
      throw new ConvexError(`You can keep up to ${OWN_MEDIA_LIMITS.videos} exercise videos. Remove one first.`);
    }
    return imagekitUploadAuth(ownMediaFolder(user._id));
  },
});

/** Only the physio's own uploads: an ImageKit link inside their folder. */
function assertOwnFile(file: { url: string; filePath: string; size: number }, userId: Id<"users">, maxBytes: number) {
  if (!IMAGEKIT_URL.test(file.url) || !file.url.endsWith(file.filePath) || !file.filePath.startsWith(`${ownMediaFolder(userId)}/`)) {
    throw new ConvexError("That file wasn't uploaded here. Upload it again.");
  }
  if (!(file.size > 0) || file.size > maxBytes) throw new ConvexError("That file is too large.");
}

const ownFileIds = (media: Doc<"exercises">["ownMedia"]) =>
  media ? [media.video?.fileId, media.video?.poster?.fileId, ...(media.photos ?? []).map((p) => p.fileId)] : [];

/**
 * Creates or edits one of the physio's own exercises. `media`: leave out to keep what's there,
 * null to remove it. New media needs the consent confirmation, which is stored with it.
 */
export const saveOwnExercise = mutation({
  args: {
    exerciseId: v.optional(v.id("exercises")),
    name: v.string(),
    steps: v.array(v.string()),
    bodyPart: v.optional(v.string()),
    sets: v.number(),
    reps: v.number(),
    holdSeconds: v.optional(v.number()),
    media: v.optional(v.union(v.null(), ownMediaValidator)),
    consent: v.optional(consentValidator),
    shareToLibrary: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await ownExerciseAuthor(ctx);
    const existing = args.exerciseId ? await ctx.db.get(args.exerciseId) : null;
    if (args.exerciseId && (!existing || existing.createdBy !== user._id || existing.archivedAt)) {
      throw new ConvexError("You can only change exercises you created.");
    }

    const name = args.name.trim().replace(/\s+/g, " ");
    const steps = args.steps.map((s) => s.trim()).filter(Boolean);
    if (name.length < 2 || name.length > 80) throw new ConvexError("Give the exercise a name (up to 80 characters).");
    if (steps.length === 0) throw new ConvexError("Add at least one step.");
    if (steps.length > 12 || steps.some((s) => s.length > 400)) throw new ConvexError("Keep it to 12 short steps.");
    const whole = (n: number, max: number) => Number.isInteger(n) && n >= 0 && n <= max;
    if (!whole(args.sets, 20) || !whole(args.reps, 200) || (args.holdSeconds !== undefined && !whole(args.holdSeconds, 600))) {
      throw new ConvexError("Check the sets, reps and hold time.");
    }

    let ownMedia = existing?.ownMedia;
    let replaced: (string | undefined)[] = [];
    if (args.media !== undefined) {
      const before = ownFileIds(existing?.ownMedia);
      if (args.media === null || (!args.media.video && !args.media.photos?.length)) {
        ownMedia = undefined;
      } else {
        const { video, photos } = args.media;
        if (video && photos?.length) throw new ConvexError("Use either a video or photos, not both.");
        if (!args.consent) throw new ConvexError("Confirm who appears in the photos or video.");
        if (video) {
          assertOwnFile(video, user._id, OWN_MEDIA_LIMITS.videoBytes);
          if (video.poster) assertOwnFile(video.poster, user._id, OWN_MEDIA_LIMITS.photoBytes);
          if (!(video.durationSec > 0) || video.durationSec > OWN_MEDIA_LIMITS.videoSeconds) {
            throw new ConvexError("Keep videos under 5 minutes.");
          }
        }
        if (photos) {
          if (photos.length > OWN_MEDIA_LIMITS.photosPerExercise) throw new ConvexError("Up to 5 photos per exercise.");
          for (const photo of photos) assertOwnFile(photo, user._id, OWN_MEDIA_LIMITS.photoBytes);
        }
        const totalBytes = (video ? video.size + (video.poster?.size ?? 0) : 0) + (photos ?? []).reduce((sum, p) => sum + p.size, 0);
        const usage = await ownUsage(ctx, user._id, existing?._id);
        if (usage.bytes + totalBytes > OWN_MEDIA_LIMITS.totalBytes) throw new ConvexError("That would go over your 2 GB of exercise storage.");
        if (video && usage.videos >= OWN_MEDIA_LIMITS.videos) throw new ConvexError(`You can keep up to ${OWN_MEDIA_LIMITS.videos} exercise videos.`);
        ownMedia = { video, photos, totalBytes, consent: args.consent, consentedBy: user._id, consentedAt: Date.now() };
      }
      // Files kept from before stay; the rest are deleted
      const kept = new Set(ownFileIds(ownMedia));
      replaced = before.filter((id) => id && !kept.has(id));
    }

    const libraryShare =
      args.shareToLibrary === true && existing?.libraryShare?.status !== "approved" && existing?.libraryShare?.status !== "pending"
        ? { status: "pending" as const, requestedAt: Date.now() }
        : args.shareToLibrary === false && existing?.libraryShare?.status === "pending"
          ? undefined
          : existing?.libraryShare;
    const fields = {
      name,
      description: steps[0],
      instructions: steps,
      bodyParts: args.bodyPart?.trim() ? [args.bodyPart.trim()] : (existing?.bodyParts ?? []),
      defaultSets: args.sets,
      defaultReps: args.reps,
      defaultHoldSeconds: args.holdSeconds,
      ownMedia,
      libraryShare,
    };

    let exerciseId = existing?._id;
    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      exerciseId = await ctx.db.insert("exercises", {
        ...fields,
        targetMuscles: [],
        conditions: [],
        equipmentNeeded: [],
        difficultyLevel: "beginner",
        defaultFrequency: "Daily",
        createdBy: user._id,
        // Shared with the physio's clinic team, if they're in one
        clinicId: user.clinicId,
        isPublic: false,
      });
    }
    await removeImagekitFilesLater(ctx, replaced);
    return { exerciseId };
  },
});

/**
 * Removes one of the physio's own exercises from their library and deletes its files. Patients
 * who already have it keep its name and steps.
 */
export const removeOwnExercise = mutation({
  args: { exerciseId: v.id("exercises") },
  handler: async (ctx, args) => {
    const user = await ownExerciseAuthor(ctx);
    const exercise = await ctx.db.get(args.exerciseId);
    if (!exercise || exercise.createdBy !== user._id) throw new ConvexError("You can only remove exercises you created.");
    if (exercise.libraryShare?.status === "approved") {
      throw new ConvexError("This exercise is in the Rehabify library now. Ask the Rehabify team to remove it.");
    }
    await removeImagekitFilesLater(ctx, ownFileIds(exercise.ownMedia));
    await ctx.db.patch(exercise._id, { archivedAt: Date.now(), ownMedia: undefined, libraryShare: undefined });
    return { success: true };
  },
});

/**
 * Short-lived links to own-exercise photos and videos, for anyone allowed to see the exercise:
 * its creator and their clinic team, admins, or a patient (or WhatsApp link) whose programme
 * includes it. Exercises approved for the shared library are open to all staff.
 */
export const requestExerciseMediaLinks = mutation({
  args: {
    exerciseIds: v.array(v.id("exercises")),
    programId: v.optional(v.id("exercisePrograms")),
    share: v.optional(v.object({ code: v.string(), session: v.string() })),
  },
  handler: async (ctx, args) => {
    const ids = [...new Set(args.exerciseIds)].slice(0, 40);
    const programExercises = (program: Doc<"exercisePrograms">) =>
      new Set<string>(program.items.map((item) => item.exerciseId).filter((id): id is Id<"exercises"> => Boolean(id)));
    let inProgram: Set<string> | null = null;
    let staff: Doc<"users"> | null = null;
    if (args.share) {
      const res = await resolveShareSession(ctx, args.share.code, args.share.session);
      if (!res.ok) throw new ConvexError(res.reason === "needs_pin" ? "Enter your PIN again to continue." : "This link is no longer available.");
      // The physio's own photos and videos are part of Flex for their own patients (patientPlans.ts)
      if (await isProgramLocked(ctx, res.program)) return { links: {}, expiresAt: Date.now() };
      inProgram = programExercises(res.program);
    } else {
      const access = await libraryAccess(ctx);
      if (!access) throw new ConvexError("Sign in to see this exercise.");
      if (access.kind === "patient") {
        const program = args.programId ? await ctx.db.get(args.programId) : null;
        if (!program || program.patientId !== access.user._id) throw new ConvexError("Open the exercise from your programme.");
        if (await isProgramLocked(ctx, program)) return { links: {}, expiresAt: Date.now() };
        inProgram = programExercises(program);
      } else if (access.kind === "staff") {
        staff = access.user;
      } else {
        return { links: {}, expiresAt: Date.now() };
      }
    }

    const expiresAt = Date.now() + OWN_LINK_MS;
    const sign = (file: { url: string; filePath: string }) => signedImagekitUrl(file.url, file.filePath, expiresAt);
    const links: Record<string, { video: string | null; poster: string | null; photos: string[] }> = {};
    for (const id of ids) {
      const exercise = await ctx.db.get(id);
      const media = exercise?.ownMedia;
      if (!exercise || !media) continue;
      const allowed = inProgram
        ? inProgram.has(id)
        : staff !== null &&
          (staff.role === "admin" ||
            exercise.createdBy === staff._id ||
            exercise.isPublic ||
            (exercise.clinicId !== undefined && exercise.clinicId === staff.clinicId));
      if (!allowed) continue;
      links[id] = {
        video: media.video ? await sign(media.video) : null,
        poster: media.video?.poster ? await sign(media.video.poster) : null,
        photos: await Promise.all((media.photos ?? []).map(sign)),
      };
    }
    return { links, expiresAt };
  },
});

/** Admin: own exercises offered to the shared library, oldest first. */
export const adminOwnExerciseShares = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    const rows = await ctx.db
      .query("exercises")
      .withIndex("by_public", (q) => q.eq("isPublic", false))
      .take(5000);
    const pending = rows.filter((row) => row.libraryShare?.status === "pending" && !row.archivedAt);
    pending.sort((a, b) => (a.libraryShare?.requestedAt ?? 0) - (b.libraryShare?.requestedAt ?? 0));
    return Promise.all(
      pending.map(async (row) => ({
        ...libraryItem(row),
        consent: row.ownMedia?.consent ?? null,
        requestedAt: row.libraryShare?.requestedAt ?? row._creationTime,
        creatorName: row.createdBy ? displayName(await ctx.db.get(row.createdBy)) : "Unknown",
      }))
    );
  },
});

/** Admin: approve (it joins the shared library for every physio) or decline an offered exercise. */
export const adminReviewOwnExercise = mutation({
  args: { exerciseId: v.id("exercises"), approve: v.boolean(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const exercise = await ctx.db.get(args.exerciseId);
    if (!exercise?.libraryShare || exercise.libraryShare.status !== "pending") throw new ConvexError("This exercise isn't waiting for review.");
    await ctx.db.patch(exercise._id, {
      isPublic: args.approve,
      libraryShare: {
        ...exercise.libraryShare,
        status: args.approve ? "approved" : "declined",
        reviewedBy: admin._id,
        reviewedAt: Date.now(),
        note: args.note?.trim().slice(0, 500) || undefined,
      },
    });
    // Reward points for a physio's exercise joining the library (once per exercise)
    if (args.approve && exercise.createdBy) {
      await awardPoints(ctx, {
        userId: exercise.createdBy,
        reason: "exercise_approved",
        dedupeKey: `exercise_approved:${exercise._id}`,
        label: `“${exercise.name}” joined the Rehabify library`,
        refType: "exercises",
        refId: exercise._id,
      });
    }
    return { success: true };
  },
});
