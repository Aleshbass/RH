/**
 * "Help me choose a physio" on Find a Physio: three questions (what's wrong, video or home visit,
 * where they are). A signed-in patient's answers are saved to their record; a guest also leaves a
 * name and WhatsApp number. Either way the care team gets a "help_choosing" item in Patients
 * looking for care, with the physio profiles they opened, so someone can pair them straight away.
 */
import { ConvexError, v } from "convex/values";
import type { WithoutSystemFields } from "convex/server";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { alertAdmins } from "./helpers/careSignals";
import { loadPatientProfile } from "./helpers/patientFacts";
import { recordPatientView, validPhysioIds } from "./helpers/patientViews";

const HOUR = 60 * 60 * 1000;
// Guests can't be traced to an account, so cap how many reach the team in an hour
const GUEST_REQUESTS_PER_HOUR = 40;

const FORMAT_WORD = { online: "Video", home_visit: "Home visit", either: "Video or home visit" } as const;
type Format = keyof typeof FORMAT_WORD;

const clean = (value: string | undefined, max: number) => value?.replace(/\s+/g, " ").trim().slice(0, max) || undefined;

/** "+2348012345678" from "0801 234 5678", "2348012345678" or "+234 801…". Null if it isn't a phone number. */
function normalisePhone(raw: string | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (/^0\d{10}$/.test(digits)) return `+234${digits.slice(1)}`;
  if (/^234\d{10}$/.test(digits)) return `+${digits}`;
  if ((raw ?? "").trim().startsWith("+") && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

async function signedInUser(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

/** What the card can prefill for a signed-in patient, and whether they've already asked. */
export const myAnswers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return null;
    if (user.role !== "patient") return { isPatient: false as const };
    const profile = await loadPatientProfile(ctx, user);
    const open = await ctx.db
      .query("careSignals")
      .withIndex("by_patient_kind", (q) => q.eq("patientId", user._id).eq("kind", "help_choosing"))
      .order("desc")
      .first();
    return {
      isPatient: true as const,
      firstName: user.firstName ?? null,
      // No number on the account: the card asks for a WhatsApp number to reach them on
      hasPhone: Boolean(user.phoneNumber),
      complaint: profile?.mainComplaint ?? null,
      format: profile?.preferredFormat ?? null,
      state: profile?.state ?? null,
      area: profile?.area ?? null,
      askedAt: open?.status === "open" ? open.createdAt : null,
    };
  },
});

export const askForHelp = mutation({
  args: {
    complaint: v.string(),
    format: v.union(v.literal("online"), v.literal("home_visit"), v.literal("either")),
    state: v.string(),
    area: v.optional(v.string()),
    // Guests only
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    // Physio profiles opened in this browser (guests, or before signing in)
    viewed: v.optional(v.array(v.string())),
    // Left empty by people; bots fill it
    website: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.website?.trim()) return { ok: true };
    const complaint = clean(args.complaint, 300);
    const state = clean(args.state, 40);
    const area = clean(args.area, 80);
    if (!complaint) throw new ConvexError("Tell us what's wrong.");
    if (!state) throw new ConvexError("Choose your state.");
    if (args.format === "home_visit" && !area) throw new ConvexError("Add your area so we can find a physio who visits it.");

    const now = Date.now();
    const user = await signedInUser(ctx);
    if (user && user.role !== "patient") throw new ConvexError("This is for patients. You're signed in with a different kind of account.");
    const viewedIds = await validPhysioIds(ctx, args.viewed);
    const place = [area, state].filter(Boolean).join(", ");
    const detail = `asked for help choosing: ${complaint} · ${FORMAT_WORD[args.format as Format]} · ${place}`.slice(0, 240);

    if (user) {
      // Their own answers go on their record, where the care team and their physio will see them
      const profile = await loadPatientProfile(ctx, user);
      const patch: Partial<WithoutSystemFields<Doc<"patientProfiles">>> = {
        mainComplaint: complaint,
        state,
        ...(area ? { area } : {}),
        ...(args.format !== "either" ? { preferredFormat: args.format } : {}),
      };
      if (profile) await ctx.db.patch(profile._id, patch);
      else {
        const profileId = await ctx.db.insert("patientProfiles", { userId: user._id, country: "Nigeria", ...patch });
        await ctx.db.patch(user._id, { patientProfileId: profileId });
      }
      for (const physioId of viewedIds) await recordPatientView(ctx, user._id, physioId, now);

      const request = { complaint, format: args.format, state, area, viewedPhysioIds: viewedIds.length ? viewedIds : undefined };
      // A number to reach them on when the account has none (kept on the request, not the account)
      const contactPhone = user.phoneNumber ? undefined : normalisePhone(args.phone) ?? undefined;
      if (!user.phoneNumber && args.phone?.trim() && !contactPhone) {
        throw new ConvexError("Add a WhatsApp number we can reach you on, like 0801 234 5678.");
      }
      const signals = await ctx.db
        .query("careSignals")
        .withIndex("by_patient_kind", (q) => q.eq("patientId", user._id))
        .take(40);
      const open = signals.find((s) => s.status === "open" && s.kind === "help_choosing");
      if (open) {
        await ctx.db.patch(open._id, { request, detail, lastSeenAt: now, ...(contactPhone ? { guestPhone: contactPhone } : {}) });
      } else {
        await ctx.db.insert("careSignals", {
          kind: "help_choosing",
          status: "open",
          patientId: user._id,
          guestPhone: contactPhone,
          detail,
          request,
          createdAt: now,
          lastSeenAt: now,
        });
        await alertAdmins(ctx, "help_choosing", `${user.patientNumber ?? user.firstName ?? "A patient"}: ${detail}`);
      }
      // Browsing or "no physio yet" now says less than this: one item per patient in the queue
      for (const s of signals) {
        if (s.status === "open" && (s.kind === "browsing" || s.kind === "no_physio")) {
          await ctx.db.patch(s._id, { status: "handled", handledAt: now, handledNote: "Asked for help choosing a physio" });
        }
      }
      return { ok: true };
    }

    // A guest: we need a way to reach them
    const name = clean(args.name, 80);
    const phone = normalisePhone(args.phone);
    if (!name) throw new ConvexError("Add your name.");
    if (!phone) throw new ConvexError("Add a WhatsApp number we can reach you on, like 0801 234 5678.");

    const recent = await ctx.db
      .query("careSignals")
      .withIndex("by_status", (q) => q.eq("status", "open").gte("createdAt", now - 3 * 24 * HOUR))
      .take(400);
    const request = { complaint, format: args.format, state, area, viewedPhysioIds: viewedIds.length ? viewedIds : undefined };
    const same = recent.find((s) => s.kind === "help_choosing" && !s.patientId && s.guestPhone === phone);
    if (same) {
      await ctx.db.patch(same._id, { request, detail, guestName: name, lastSeenAt: now });
      return { ok: true };
    }
    const lastHour = recent.filter((s) => s.kind === "help_choosing" && !s.patientId && s.createdAt >= now - HOUR).length;
    if (lastHour >= GUEST_REQUESTS_PER_HOUR) {
      throw new ConvexError("We're getting a lot of requests right now. Please chat with Joy on WhatsApp and we'll match you there.");
    }
    await ctx.db.insert("careSignals", {
      kind: "help_choosing",
      status: "open",
      guestName: name,
      guestPhone: phone,
      detail,
      request,
      createdAt: now,
      lastSeenAt: now,
    });
    await alertAdmins(ctx, "help_choosing", `${name}: ${detail}`);
    return { ok: true };
  },
});

