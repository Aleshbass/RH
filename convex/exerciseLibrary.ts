/**
 * The 3D exercise library: syncing the built catalog into the `exercises` table, clinical sign-off
 * of each animation, browsing, and handing out asset keys to viewers who are allowed to watch.
 *
 * Assets are static, encrypted files (public/exercise-library/<version>/). A viewer can only
 * decrypt what requestViewerGrant gives it keys for, and every grant is rate-limited and logged.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ensureUserRole } from "./auth";
import { EXERCISE_CATALOG, findClip, posterUrl } from "./exerciseLibraryCatalog";
import { LIBRARY, clipIdFor } from "./exerciseLibraryContent";
import { deriveAssetKey } from "./helpers/exerciseCrypto";
import {
  displayName,
  initials,
  libraryAccess,
  programClipIds,
  resolveShareSession,
} from "./helpers/exerciseAccess";

const HOUR = 3_600_000;
const GRANT_LIMITS = { staff: 300, licence: 200, patient: 120, link: 120 } as const;
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
  };
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
    const rows = [...publicRows, ...clinicRows];
    // Licensees only get the 3D library.
    const visible = access.kind === "licence" ? rows.filter((e) => e.animationSlug) : rows;
    const items = visible.map(libraryItem);
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
 * Keys to decrypt the character and the requested clips. Signed-in staff and licensees may watch
 * any clip; a patient only clips in their own programme; a share-link session only that link's
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
        allowed = await programClipIds(ctx, program);
        watermark = `${await programLabel(ctx, program)} · ${initials(viewer.user)}`;
      } else {
        access = viewer.kind;
        allowed = "all";
        watermark = viewer.kind === "licence" ? viewer.label : `${viewer.label} · Preview`;
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
