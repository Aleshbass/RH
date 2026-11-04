/**
 * Rehabify Learn — MSK Specialist Program: cohorts, registration and payment.
 *
 * Admins keep one cohort "live"; it drives /learn, the landing-page section and the top
 * banner. Registration is paid through Paystack's hosted checkout. The price always comes
 * from the cohort here, never from the browser, and a seat is only marked paid from
 * Paystack-verified evidence: verifyRegistrationPayment re-checks the reference with
 * Paystack's API when the payer returns, and the signed charge webhook
 * (recordLearnPaystackWebhook) does the same if they never come back. Completion is
 * idempotent, so the two can race safely.
 */
import { ConvexError, v } from "convex/values";
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
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { paystackRequest } from "./clinicBilling";
import { libraryItem } from "./exerciseLibrary";
import { listRow } from "./libraryResources";
import { appLink, publicAppUrl } from "./helpers/appUrl";
import { LEARNER_ACCESS_DAYS, learnerAccessOpen, paidLearnRegistrations, verifiedIdentityEmail } from "./helpers/exerciseAccess";
import { randomToken, sha256Hex } from "./helpers/exerciseCrypto";
import { IMAGEKIT_URL, imagekitUploadAuth, removeImagekitFilesLater, signedImagekitUrl } from "./helpers/imagekit";
import { lagosDateTime, lagosShortDate, lagosTime, zonedDateKey, zonedDateTimeToUtc, zonedTimeKey } from "./helpers/lagosTime";
import { getViewer, requireAdmin } from "./helpers/partnerAccess";
import { verifyPaystackSignature } from "./helpers/paystackSignature";
import { isJoyLoginEmail } from "../lib/auth/joyLoginEmail";
import {
  defaultCohortLabel,
  endOfLagosDay,
  formatCohortDate,
  formatCohortDay,
  formatCohortRange,
  formatNairaFromKobo,
  isCalendarDate,
  lagosToday,
} from "./helpers/learnFormat";

export const MSK_PROGRAM = "msk-specialist";
export const PROGRAM_TITLE = "Rehabify MSK Specialist Program";

// Created by startRegistration: LEARN_<registrationId>_<timestamp>
const REFERENCE = /^LEARN_([a-z0-9]+)_\d+$/;
const HOUR_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS_PER_HOUR = 8;
// The admin page shrinks photos to WebP before upload; this is only the server-side backstop
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type Ctx = QueryCtx | MutationCtx;
type Track = "rehabify" | "external";
type ClosedReason = "draft" | "closed" | "ended" | "deadline" | "full";

const trackValidator = v.union(v.literal("rehabify"), v.literal("external"));
const cohortStatusValidator = v.union(v.literal("draft"), v.literal("live"), v.literal("closed"));

export const TRACK_LABEL: Record<Track, string> = {
  rehabify: "Rehabify Physiotherapist",
  external: "Other Physiotherapist",
};

const CLOSED_MESSAGE: Record<ClosedReason, string> = {
  draft: "Registration for this cohort hasn't opened yet.",
  closed: "Registration for this cohort is closed.",
  ended: "This cohort has already finished.",
  deadline: "The registration deadline for this cohort has passed.",
  full: "This cohort is full.",
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

const clean = (value: string | undefined | null, max: number) =>
  (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalisePhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, name.length - 2)))}@${domain}`;
}

async function paidSeats(ctx: Ctx, cohortId: Id<"learnCohorts">) {
  const paid = await ctx.db
    .query("learnRegistrations")
    .withIndex("by_cohort_status", (q) => q.eq("cohortId", cohortId).eq("status", "paid"))
    .collect();
  return paid.length;
}

function closedReasonFor(cohort: Doc<"learnCohorts">, seatsTaken: number, now: number): ClosedReason | null {
  if (cohort.status === "draft") return "draft";
  if (cohort.status === "closed") return "closed";
  const ended = endOfLagosDay(cohort.endDate);
  if (ended !== null && now > ended) return "ended";
  if (cohort.registrationDeadline) {
    const deadline = endOfLagosDay(cohort.registrationDeadline);
    if (deadline !== null && now > deadline) return "deadline";
  }
  if (cohort.capacity !== undefined && seatsTaken >= cohort.capacity) return "full";
  return null;
}

/** Physiotherapists practising on Rehabify: an approved physiotherapist account. */
async function isRehabifyPhysio(ctx: Ctx, user: Doc<"users">) {
  if (user.role !== "physiotherapist") return false;
  const approval = await ctx.db
    .query("accountApprovalStatus")
    .withIndex("by_user_id", (q) => q.eq("userId", user._id))
    .first();
  return approval?.status === "approved";
}

async function toPublicCohort(ctx: Ctx, cohort: Doc<"learnCohorts">) {
  const seatsTaken = await paidSeats(ctx, cohort._id);
  const closedReason = closedReasonFor(cohort, seatsTaken, Date.now());
  return {
    id: cohort._id,
    cohortLabel: cohort.cohortLabel,
    startDate: cohort.startDate,
    endDate: cohort.endDate,
    dateRange: formatCohortRange(cohort.startDate, cohort.endDate),
    startsOn: formatCohortDay(cohort.startDate),
    liveSessions: cohort.liveSessions,
    duration: cohort.duration,
    format: cohort.format,
    deadlineLabel: cohort.registrationDeadline ? formatCohortDate(cohort.registrationDeadline) : null,
    prices: { rehabify: cohort.rehabifyPriceKobo / 100, external: cohort.externalPriceKobo / 100 },
    seatsLeft: cohort.capacity !== undefined ? Math.max(0, cohort.capacity - seatsTaken) : null,
    isOpen: closedReason === null,
    closedReason,
    showOnLanding: cohort.showOnLanding,
    showBanner: cohort.showBanner,
    bannerText: cohort.bannerText ?? null,
    imageUrl: cohort.imageStorageId ? await ctx.storage.getUrl(cohort.imageStorageId) : null,
    imageAlt: cohort.imageAlt ?? null,
  };
}

export type PublicCohort = Awaited<ReturnType<typeof toPublicCohort>>;

async function assertCohortImage(ctx: MutationCtx, storageId: Id<"_storage">) {
  const file = await ctx.db.system.get(storageId);
  if (!file) throw new ConvexError("The image upload didn't finish. Please upload it again.");
  if (!file.contentType?.startsWith("image/")) throw new ConvexError("Upload a JPG, PNG or WebP image.");
  if (file.size > MAX_IMAGE_BYTES) throw new ConvexError("The image is larger than 5 MB. Please use a smaller one.");
}

/** Deletes a cohort image once no cohort uses it any more (a new cohort can reuse the last one's). */
async function releaseImage(ctx: MutationCtx, storageId: Id<"_storage"> | undefined) {
  if (!storageId) return;
  const cohorts = await ctx.db.query("learnCohorts").collect();
  if (cohorts.some((c) => c.imageStorageId === storageId)) return;
  await ctx.storage.delete(storageId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: the program page, landing section and banner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The cohort the public site shows: the live one, or else the next closed cohort that has
 * not finished yet (so the page can still show its dates as "registration closed").
 */
export const getPublicCohort = query({
  args: {},
  handler: async (ctx): Promise<PublicCohort | null> => {
    const live = (await ctx.db.query("learnCohorts").withIndex("by_status", (q) => q.eq("status", "live")).collect())
      .filter((c) => c.program === MSK_PROGRAM)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (live) return toPublicCohort(ctx, live);

    const today = lagosToday();
    const closed = (await ctx.db.query("learnCohorts").withIndex("by_status", (q) => q.eq("status", "closed")).collect())
      .filter((c) => c.program === MSK_PROGRAM && c.endDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    return closed ? toPublicCohort(ctx, closed) : null;
  },
});

/** Who is registering: prefill from the signed-in account and whether the Rehabify rate applies. */
export const getMyRegistrationContext = query({
  args: { cohortId: v.optional(v.id("learnCohorts")) },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const user = viewer?.user ?? null;
    if (!viewer || !user) {
      return { signedIn: Boolean(viewer), isRehabifyPhysio: false, profile: null, registration: null };
    }

    let registration: { status: Doc<"learnRegistrations">["status"]; track: Track } | null = null;
    if (args.cohortId) {
      const cohortId = args.cohortId;
      const mine = (await ctx.db.query("learnRegistrations").withIndex("by_user", (q) => q.eq("userId", user._id)).collect())
        .filter((r) => r.cohortId === cohortId);
      const email = user.email?.toLowerCase().trim();
      const byEmail = email
        ? await ctx.db
            .query("learnRegistrations")
            .withIndex("by_cohort_email", (q) => q.eq("cohortId", cohortId).eq("email", email))
            .first()
        : null;
      const paid = [...mine, byEmail].find((r) => r?.status === "paid");
      if (paid) registration = { status: paid.status, track: paid.track };
    }

    return {
      signedIn: true,
      isRehabifyPhysio: await isRehabifyPhysio(ctx, user),
      profile: {
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        email: user.email ?? "",
        phone: user.phoneNumber ?? "",
      },
      registration,
    };
  },
});

/** "Tell me when the next cohort opens", while registration is closed. */
export const joinInterestList = mutation({
  args: { email: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const email = clean(args.email, 120).toLowerCase();
    if (!EMAIL.test(email)) throw new ConvexError("Enter a valid email address.");
    const existing = await ctx.db
      .query("learnInterest")
      .withIndex("by_program_email", (q) => q.eq("program", MSK_PROGRAM).eq("email", email))
      .first();
    if (existing) return { alreadyJoined: true };
    await ctx.db.insert("learnInterest", {
      program: MSK_PROGRAM,
      email,
      name: clean(args.name, 80) || undefined,
      createdAt: Date.now(),
    });
    return { alreadyJoined: false };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Registration and checkout
// ─────────────────────────────────────────────────────────────────────────────

const registrationArgs = {
  cohortId: v.id("learnCohorts"),
  track: trackValidator,
  firstName: v.string(),
  lastName: v.string(),
  email: v.string(),
  phone: v.string(),
  licenseNumber: v.optional(v.string()),
  workplace: v.optional(v.string()),
  city: v.optional(v.string()),
  yearsOfPractice: v.optional(v.string()),
};

type Prepared = {
  registrationId: Id<"learnRegistrations">;
  amountKobo: number;
  email: string;
  track: Track;
  cohortLabel: string;
};

/**
 * Validates the form and the cohort, then creates (or refreshes) the pending registration
 * the checkout pays for. One seat per person per cohort: a pending registration for the
 * same email is reused, a paid one blocks a second registration.
 */
export const prepareRegistration = internalMutation({
  args: registrationArgs,
  handler: async (ctx, args): Promise<Prepared> => {
    const cohort = await ctx.db.get(args.cohortId);
    if (!cohort || cohort.program !== MSK_PROGRAM) throw new ConvexError("This cohort is no longer available.");
    const closed = closedReasonFor(cohort, await paidSeats(ctx, cohort._id), Date.now());
    if (closed) throw new ConvexError(CLOSED_MESSAGE[closed]);

    const firstName = clean(args.firstName, 60);
    const lastName = clean(args.lastName, 60);
    const email = clean(args.email, 120).toLowerCase();
    const phone = normalisePhone(args.phone);
    const licenseNumber = clean(args.licenseNumber, 40);
    const workplace = clean(args.workplace, 120);
    const city = clean(args.city, 80);
    const yearsOfPractice = clean(args.yearsOfPractice, 20);

    if (!firstName || !lastName) throw new ConvexError("Enter your first and last name.");
    if (!EMAIL.test(email)) throw new ConvexError("Enter a valid email address.");
    if (!phone) throw new ConvexError("Enter a valid phone number.");
    if (args.track === "external" && licenseNumber.length < 3) {
      throw new ConvexError("Enter your physiotherapy licence number.");
    }

    const viewer = await getViewer(ctx);
    const user = viewer?.user ?? null;
    if (args.track === "rehabify") {
      if (!user) throw new ConvexError("Sign in with your Rehabify physiotherapist account to use the Rehabify rate.");
      if (!(await isRehabifyPhysio(ctx, user))) {
        throw new ConvexError(
          "The Rehabify rate is for approved physiotherapists practising on Rehabify. You can register as an other physiotherapist instead."
        );
      }
    }

    const sameEmail = await ctx.db
      .query("learnRegistrations")
      .withIndex("by_cohort_email", (q) => q.eq("cohortId", cohort._id).eq("email", email))
      .first();
    const sameUser = user
      ? (await ctx.db.query("learnRegistrations").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()).filter(
          (r) => r.cohortId === cohort._id
        )
      : [];
    if ([sameEmail, ...sameUser].some((r) => r?.status === "paid")) {
      throw new ConvexError("You're already registered for this cohort. Check your inbox for your confirmation email.");
    }

    const now = Date.now();
    const amountKobo = args.track === "rehabify" ? cohort.rehabifyPriceKobo : cohort.externalPriceKobo;
    const details = {
      track: args.track,
      firstName,
      lastName,
      email,
      phone,
      licenseNumber: licenseNumber || undefined,
      workplace: workplace || undefined,
      city: city || undefined,
      yearsOfPractice: yearsOfPractice || undefined,
      amountKobo,
      currency: "NGN",
      status: "pending" as const,
      updatedAt: now,
    };
    const result = { amountKobo, email, track: args.track, cohortLabel: cohort.cohortLabel };

    const existing = sameEmail ?? sameUser.find((r) => r.status === "pending") ?? null;
    if (existing) {
      const recentAttempts =
        existing.lastAttemptAt !== undefined && now - existing.lastAttemptAt < HOUR_MS ? existing.paymentAttempts ?? 0 : 0;
      if (recentAttempts >= MAX_ATTEMPTS_PER_HOUR) {
        throw new ConvexError("Too many payment attempts. Please wait a few minutes and try again.");
      }
      await ctx.db.patch(existing._id, { ...details, userId: user?._id ?? existing.userId });
      return { registrationId: existing._id, ...result };
    }

    const registrationId = await ctx.db.insert("learnRegistrations", {
      cohortId: cohort._id,
      userId: user?._id,
      ...details,
      paymentAttempts: 0,
      createdAt: now,
    });
    return { registrationId, ...result };
  },
});

export const recordPaymentAttempt = internalMutation({
  args: { registrationId: v.id("learnRegistrations"), reference: v.string() },
  handler: async (ctx, args) => {
    const registration = await ctx.db.get(args.registrationId);
    if (!registration) return;
    const now = Date.now();
    const withinHour = registration.lastAttemptAt !== undefined && now - registration.lastAttemptAt < HOUR_MS;
    await ctx.db.patch(registration._id, {
      paymentReference: args.reference,
      paymentAttempts: withinHour ? (registration.paymentAttempts ?? 0) + 1 : 1,
      lastAttemptAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Where Paystack sends the payer back to. The browser may ask for its own origin (so local
 * and preview builds return to themselves), but only Rehabify hosts and localhost are
 * accepted; anything else returns to the public site.
 */
function checkoutOrigin(requested: string | undefined): string {
  const fallback = publicAppUrl();
  if (!requested) return fallback;
  try {
    const url = new URL(requested);
    const host = url.hostname.toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1";
    const isRehabify =
      url.protocol === "https:" && (host === "physioaroundme.com" || host.endsWith(".physioaroundme.com"));
    return isLocal || isRehabify || url.origin === fallback ? url.origin : fallback;
  } catch {
    return fallback;
  }
}

/** Starts a Paystack checkout for a registration and returns the hosted payment page. */
export const startRegistration = action({
  args: { ...registrationArgs, returnOrigin: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ authorizationUrl: string; reference: string }> => {
    const { returnOrigin, ...details } = args;
    const prepared: Prepared = await ctx.runMutation(internal.learn.prepareRegistration, details);
    const origin = checkoutOrigin(returnOrigin);
    const reference = `LEARN_${prepared.registrationId}_${Date.now()}`;

    const data = await paystackRequest("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        reference,
        amount: prepared.amountKobo,
        email: prepared.email,
        currency: "NGN",
        callback_url: `${origin}/learn/confirmation`,
        channels: ["card", "bank", "ussd", "bank_transfer"],
        metadata: {
          source: "rehabify_learn",
          program: MSK_PROGRAM,
          registrationId: prepared.registrationId,
          track: prepared.track,
          // Paystack shows a "Cancel payment" link back to the form
          cancel_action: `${origin}/learn/register?track=${prepared.track}&cancelled=1`,
          custom_fields: [
            { display_name: "Program", variable_name: "program", value: PROGRAM_TITLE },
            { display_name: "Cohort", variable_name: "cohort", value: prepared.cohortLabel },
            { display_name: "Registration", variable_name: "registration_type", value: TRACK_LABEL[prepared.track] },
          ],
        },
      }),
    });

    const authorizationUrl = typeof data?.authorization_url === "string" ? data.authorization_url : "";
    if (!authorizationUrl.startsWith("https://")) {
      throw new ConvexError("We couldn't start the payment. Please try again.");
    }
    await ctx.runMutation(internal.learn.recordPaymentAttempt, { registrationId: prepared.registrationId, reference });
    return { authorizationUrl, reference };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Payment completion
// ─────────────────────────────────────────────────────────────────────────────

type PaidEvidence = { amountKobo: number; currency: string; channel?: string };

type Completion =
  | { success: true; alreadyCompleted: boolean }
  | { success: false; reason: string };

/**
 * The confirmation email carries a one-tap "Open my course" link. The link's code is made in an
 * action (real randomness), so the mutation only schedules it.
 */
async function scheduleConfirmationEmail(ctx: MutationCtx, registrationId: Id<"learnRegistrations">) {
  const registration = await ctx.db.get(registrationId);
  if (!registration || registration.status !== "paid") return;
  await ctx.scheduler.runAfter(0, internal.learn.sendConfirmationEmail, { registrationId });
}

/**
 * Applies Paystack-verified payment evidence to a registration. The registration comes from
 * the (Paystack-confirmed) reference, never from client metadata, and the amount paid must
 * cover the price. A repeat call for the same reference is a no-op. A second, different
 * payment keeps the seat and is flagged for a refund; a short payment is flagged too.
 */
async function completeRegistrationPayment(ctx: MutationCtx, reference: string, paid: PaidEvidence): Promise<Completion> {
  const match = REFERENCE.exec(reference);
  if (!match) return { success: false, reason: "invalid_reference" };
  const registrationId = ctx.db.normalizeId("learnRegistrations", match[1]);
  const registration = registrationId ? await ctx.db.get(registrationId) : null;
  if (!registrationId || !registration) return { success: false, reason: "not_found" };
  const now = Date.now();

  const flagPayment = async (action: string) => {
    const known = registration.extraPayments ?? [];
    if (known.some((p) => p.reference === reference)) return;
    await ctx.db.patch(registrationId, {
      extraPayments: [...known, { reference, amountKobo: paid.amountKobo, at: now }],
      updatedAt: now,
    });
    await ctx.db.insert("systemLogs", {
      action,
      type: "learn",
      timestamp: now,
      userId: registration.userId ? String(registration.userId) : undefined,
      targetEntityType: "learn_registration",
      targetEntityId: String(registrationId),
      details: { reference, amountKobo: paid.amountKobo, currency: paid.currency, priceKobo: registration.amountKobo },
    });
  };

  if (registration.status === "paid") {
    if (registration.paidReference !== reference) await flagPayment("learn_duplicate_payment");
    return { success: true, alreadyCompleted: true };
  }

  if (paid.currency !== registration.currency) {
    await flagPayment("learn_payment_currency_mismatch");
    return { success: false, reason: "currency_mismatch" };
  }
  if (!Number.isFinite(paid.amountKobo) || paid.amountKobo < registration.amountKobo) {
    await flagPayment("learn_payment_short");
    return { success: false, reason: "amount_mismatch" };
  }

  await ctx.db.patch(registrationId, {
    status: "paid",
    paidReference: reference,
    paidAmountKobo: paid.amountKobo,
    paymentChannel: paid.channel,
    paidAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("systemLogs", {
    action: "learn_registration_paid",
    type: "learn",
    timestamp: now,
    userId: registration.userId ? String(registration.userId) : undefined,
    targetEntityType: "learn_registration",
    targetEntityId: String(registrationId),
    details: { reference, amountKobo: paid.amountKobo, track: registration.track, cohortId: String(registration.cohortId) },
  });
  await scheduleConfirmationEmail(ctx, registrationId);
  return { success: true, alreadyCompleted: false };
}

export const completeVerifiedPayment = internalMutation({
  args: { reference: v.string(), amountKobo: v.number(), currency: v.string(), channel: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Completion> =>
    completeRegistrationPayment(ctx, args.reference, {
      amountKobo: args.amountKobo,
      currency: args.currency,
      channel: args.channel,
    }),
});

async function fetchPaystackTransaction(reference: string) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new ConvexError("Payments are not configured yet. Please contact Rehabify support.");
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const data: any = await response.json().catch(() => null);
  if (!response.ok || !data?.status || !data.data) return null;
  return data.data as { status: string; amount: number; currency: string; reference: string; channel?: string };
}

export type RegistrationSummary = {
  status: Doc<"learnRegistrations">["status"];
  firstName: string;
  email: string;
  track: Track;
  trackLabel: string;
  amountPaid: number | null;
  cohort: {
    cohortLabel: string;
    dateRange: string;
    liveSessions: string;
    duration: string;
    format: string;
  };
  /** Session times for "Add to calendar" (joining links live on the course page, never here). */
  sessions: { startsAt: number; endsAt: number; title: string }[];
};

/** What the confirmation page shows for a reference. Only the payer has the reference. */
export const registrationSummary = internalQuery({
  args: { reference: v.string() },
  handler: async (ctx, args): Promise<RegistrationSummary | null> => {
    const match = REFERENCE.exec(args.reference);
    const registrationId = match ? ctx.db.normalizeId("learnRegistrations", match[1]) : null;
    const registration = registrationId ? await ctx.db.get(registrationId) : null;
    if (!registration) return null;
    const cohort = await ctx.db.get(registration.cohortId);
    if (!cohort) return null;
    const isPaid = registration.status === "paid";
    return {
      status: registration.status,
      firstName: registration.firstName,
      email: maskEmail(registration.email),
      track: registration.track,
      trackLabel: TRACK_LABEL[registration.track],
      amountPaid: isPaid ? (registration.paidAmountKobo ?? registration.amountKobo) / 100 : null,
      cohort: {
        cohortLabel: cohort.cohortLabel,
        dateRange: formatCohortRange(cohort.startDate, cohort.endDate),
        liveSessions: cohort.liveSessions,
        duration: cohort.duration,
        format: cohort.format,
      },
      sessions: isPaid
        ? (await cohortSessions(ctx, cohort._id)).map((s) => ({
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            title: s.title ?? `${PROGRAM_TITLE}: live session`,
          }))
        : [],
    };
  },
});

export type VerifyResult =
  | { status: "paid"; registration: RegistrationSummary | null }
  | { status: "pending" | "abandoned" | "failed" | "not_found" | "invalid" }
  | { status: "needs_review"; reason: string };

/**
 * Called by /learn/confirmation when Paystack sends the payer back. Re-verifies the reference
 * with Paystack server-side and completes the registration. Safe to call repeatedly and
 * without signing in: only a genuinely paid reference has any effect.
 */
export const verifyRegistrationPayment = action({
  args: { reference: v.string() },
  handler: async (ctx, args): Promise<VerifyResult> => {
    const reference = args.reference.trim();
    if (!REFERENCE.test(reference)) return { status: "invalid" };

    const tx = await fetchPaystackTransaction(reference);
    if (!tx || tx.reference !== reference) {
      // Paystack may be briefly unreachable; the webhook can still have completed it
      const summary: RegistrationSummary | null = await ctx.runQuery(internal.learn.registrationSummary, { reference });
      return summary?.status === "paid" ? { status: "paid", registration: summary } : { status: "not_found" };
    }

    if (tx.status === "success") {
      const result: Completion = await ctx.runMutation(internal.learn.completeVerifiedPayment, {
        reference,
        amountKobo: Number(tx.amount) || 0,
        currency: String(tx.currency || ""),
        channel: typeof tx.channel === "string" ? tx.channel : undefined,
      });
      if (!result.success) return { status: "needs_review", reason: result.reason };
      const summary: RegistrationSummary | null = await ctx.runQuery(internal.learn.registrationSummary, { reference });
      return { status: "paid", registration: summary };
    }
    if (tx.status === "failed" || tx.status === "reversed") return { status: "failed" };
    if (tx.status === "abandoned") return { status: "abandoned" };
    return { status: "pending" };
  },
});

/**
 * Paystack charge webhook for LEARN_ references. The HMAC-SHA512 signature is verified here,
 * inside Convex, before anything else, so this public entry point cannot fake a payment.
 */
export const recordLearnPaystackWebhook = mutation({
  args: { rawBody: v.string(), signature: v.string() },
  handler: async (ctx, args) => {
    if (!(await verifyPaystackSignature(args.rawBody, args.signature))) {
      throw new Error("Invalid Paystack webhook signature");
    }
    let payload: any;
    try {
      payload = JSON.parse(args.rawBody);
    } catch {
      throw new Error("Invalid webhook payload");
    }
    const data = payload?.data ?? {};
    const reference = typeof data.reference === "string" ? data.reference : "";
    if (!reference.startsWith("LEARN_")) return { handled: false };
    if (payload.event !== "charge.success") return { handled: true, ignored: String(payload.event) };
    if (data.status !== undefined && data.status !== "success") {
      return { handled: true, success: false, reason: `charge_${data.status}` };
    }
    const result = await completeRegistrationPayment(ctx, reference, {
      amountKobo: Number(data.amount) || 0,
      currency: typeof data.currency === "string" ? data.currency : "",
      channel: typeof data.channel === "string" ? data.channel : undefined,
    });
    return { handled: true, ...result };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin
// ─────────────────────────────────────────────────────────────────────────────

const cohortInput = {
  cohortLabel: v.string(),
  startDate: v.string(),
  endDate: v.string(),
  liveSessions: v.string(),
  duration: v.string(),
  format: v.string(),
  registrationDeadline: v.optional(v.string()),
  rehabifyPrice: v.number(), // naira
  externalPrice: v.number(), // naira
  capacity: v.optional(v.number()),
  showOnLanding: v.boolean(),
  showBanner: v.boolean(),
  bannerText: v.optional(v.string()),
  communityLink: v.optional(v.string()),
  welcomeNote: v.optional(v.string()),
  imageStorageId: v.optional(v.union(v.id("_storage"), v.null())), // null removes it; omitted keeps it
  imageAlt: v.optional(v.string()),
};

type CohortInput = {
  cohortLabel: string;
  startDate: string;
  endDate: string;
  liveSessions: string;
  duration: string;
  format: string;
  registrationDeadline?: string;
  rehabifyPrice: number;
  externalPrice: number;
  capacity?: number;
  showOnLanding: boolean;
  showBanner: boolean;
  bannerText?: string;
  communityLink?: string;
  welcomeNote?: string;
  imageAlt?: string;
};

function price(naira: number, label: string) {
  if (!Number.isFinite(naira) || naira < 100 || naira > 10_000_000) {
    throw new ConvexError(`${label} must be between ₦100 and ₦10,000,000.`);
  }
  return Math.round(naira) * 100;
}

function cohortFields(input: CohortInput) {
  const startDate = input.startDate.trim();
  const endDate = input.endDate.trim();
  if (!isCalendarDate(startDate)) throw new ConvexError("Choose a start date.");
  if (!isCalendarDate(endDate)) throw new ConvexError("Choose an end date.");
  if (endDate < startDate) throw new ConvexError("The end date must be on or after the start date.");

  const registrationDeadline = clean(input.registrationDeadline, 10);
  if (registrationDeadline && !isCalendarDate(registrationDeadline)) throw new ConvexError("The registration deadline isn't a valid date.");
  if (registrationDeadline && registrationDeadline > endDate) {
    throw new ConvexError("The registration deadline must be before the cohort ends.");
  }

  const liveSessions = clean(input.liveSessions, 120);
  const duration = clean(input.duration, 60);
  const format = clean(input.format, 120);
  if (!liveSessions) throw new ConvexError("Describe when the live sessions happen, e.g. \"Sundays, 5:00–7:00 PM\".");
  if (!duration) throw new ConvexError("Enter the duration, e.g. \"5 weeks\".");
  if (!format) throw new ConvexError("Enter the format, e.g. \"Online + live clinical demonstrations\".");

  let capacity: number | undefined;
  if (input.capacity !== undefined && input.capacity !== null) {
    if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 100_000) {
      throw new ConvexError("Seats must be a whole number, or left empty for unlimited.");
    }
    capacity = input.capacity;
  }

  const communityLink = clean(input.communityLink, 500);
  if (communityLink && !/^https:\/\/[^\s]+$/i.test(communityLink)) {
    throw new ConvexError("The group link must start with https://");
  }

  return {
    cohortLabel: clean(input.cohortLabel, 80) || defaultCohortLabel(startDate),
    startDate,
    endDate,
    liveSessions,
    duration,
    format,
    registrationDeadline: registrationDeadline || undefined,
    rehabifyPriceKobo: price(input.rehabifyPrice, "The Rehabify physiotherapist price"),
    externalPriceKobo: price(input.externalPrice, "The other physiotherapists price"),
    capacity,
    showOnLanding: input.showOnLanding,
    showBanner: input.showBanner,
    bannerText: clean(input.bannerText, 140) || undefined,
    communityLink: communityLink || undefined,
    welcomeNote: clean(input.welcomeNote, 500) || undefined,
    imageAlt: clean(input.imageAlt, 160) || undefined,
  };
}

/** Every cohort with its registration numbers, newest first. */
export const adminOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const cohorts = (await ctx.db.query("learnCohorts").collect())
      .filter((c) => c.program === MSK_PROGRAM)
      .sort((a, b) => b.startDate.localeCompare(a.startDate) || b.createdAt - a.createdAt);

    const rows = await Promise.all(
      cohorts.map(async (cohort) => {
        const registrations = await ctx.db
          .query("learnRegistrations")
          .withIndex("by_cohort", (q) => q.eq("cohortId", cohort._id))
          .collect();
        const paid = registrations.filter((r) => r.status === "paid");
        const closedReason = closedReasonFor(cohort, paid.length, now);
        return {
          id: cohort._id,
          cohortLabel: cohort.cohortLabel,
          startDate: cohort.startDate,
          endDate: cohort.endDate,
          dateRange: formatCohortRange(cohort.startDate, cohort.endDate),
          liveSessions: cohort.liveSessions,
          duration: cohort.duration,
          format: cohort.format,
          registrationDeadline: cohort.registrationDeadline ?? "",
          rehabifyPrice: cohort.rehabifyPriceKobo / 100,
          externalPrice: cohort.externalPriceKobo / 100,
          capacity: cohort.capacity ?? null,
          status: cohort.status,
          showOnLanding: cohort.showOnLanding,
          showBanner: cohort.showBanner,
          bannerText: cohort.bannerText ?? "",
          communityLink: cohort.communityLink ?? "",
          welcomeNote: cohort.welcomeNote ?? "",
          imageStorageId: cohort.imageStorageId ?? null,
          imageUrl: cohort.imageStorageId ? await ctx.storage.getUrl(cohort.imageStorageId) : null,
          imageAlt: cohort.imageAlt ?? "",
          publishedAt: cohort.publishedAt ?? null,
          updatedAt: cohort.updatedAt,
          isOpen: closedReason === null,
          closedReason,
          stats: {
            paid: paid.length,
            pending: registrations.filter((r) => r.status === "pending").length,
            rehabify: paid.filter((r) => r.track === "rehabify").length,
            external: paid.filter((r) => r.track === "external").length,
            revenue: paid.reduce((sum, r) => sum + (r.paidAmountKobo ?? r.amountKobo), 0) / 100,
            needsReview: registrations.filter((r) => (r.extraPayments?.length ?? 0) > 0).length,
          },
        };
      })
    );

    const interest = await ctx.db
      .query("learnInterest")
      .withIndex("by_program_email", (q) => q.eq("program", MSK_PROGRAM))
      .collect();
    // Absolute, so follow-up WhatsApp and email messages carry a working link
    return { cohorts: rows, interestCount: interest.length, programUrl: appLink("/learn") };
  },
});

/** Upload target for a cohort image (the browser posts the file straight to storage). */
export const adminGenerateImageUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Create a cohort (as a draft) or update one. */
export const adminSaveCohort = mutation({
  args: { cohortId: v.optional(v.id("learnCohorts")), ...cohortInput },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx);
    const { cohortId, imageStorageId, ...input } = args;
    const fields = cohortFields(input);
    if (imageStorageId) await assertCohortImage(ctx, imageStorageId);
    const image = imageStorageId === undefined ? {} : { imageStorageId: imageStorageId ?? undefined };
    const now = Date.now();
    if (cohortId) {
      const existing = await ctx.db.get(cohortId);
      if (!existing) throw new ConvexError("Cohort not found.");
      await ctx.db.patch(existing._id, { ...fields, ...image, updatedBy: user._id, updatedAt: now });
      if (imageStorageId !== undefined && existing.imageStorageId !== (imageStorageId ?? undefined)) {
        await releaseImage(ctx, existing.imageStorageId);
      }
      return existing._id;
    }
    return await ctx.db.insert("learnCohorts", {
      program: MSK_PROGRAM,
      ...fields,
      ...image,
      status: "draft",
      createdBy: user._id,
      updatedBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Publish ("live"), close registration, or move back to draft. Only one cohort is live at a
 * time: going live closes registration on any other live cohort.
 */
export const adminSetCohortStatus = mutation({
  args: { cohortId: v.id("learnCohorts"), status: cohortStatusValidator },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx);
    const cohort = await ctx.db.get(args.cohortId);
    if (!cohort) throw new ConvexError("Cohort not found.");
    const now = Date.now();

    let closedOthers = 0;
    if (args.status === "live") {
      const ended = endOfLagosDay(cohort.endDate);
      if (ended !== null && now > ended) {
        throw new ConvexError("This cohort has already finished. Update its dates before making it live.");
      }
      const live = await ctx.db.query("learnCohorts").withIndex("by_status", (q) => q.eq("status", "live")).collect();
      for (const other of live) {
        if (other._id === cohort._id || other.program !== cohort.program) continue;
        await ctx.db.patch(other._id, { status: "closed", updatedBy: user._id, updatedAt: now });
        closedOthers += 1;
      }
    }

    await ctx.db.patch(cohort._id, {
      status: args.status,
      updatedBy: user._id,
      updatedAt: now,
      ...(args.status === "live" && !cohort.publishedAt ? { publishedAt: now } : {}),
    });
    await ctx.db.insert("systemLogs", {
      action: `learn_cohort_${args.status}`,
      type: "learn",
      timestamp: now,
      userId: String(user._id),
      actorUserId: String(user._id),
      targetEntityType: "learn_cohort",
      targetEntityId: String(cohort._id),
      details: { from: cohort.status, to: args.status, closedOthers },
    });
    return { closedOthers };
  },
});

/** Drafts with no paid seats can be deleted (abandoned checkouts go with them). */
export const adminDeleteCohort = mutation({
  args: { cohortId: v.id("learnCohorts") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const cohort = await ctx.db.get(args.cohortId);
    if (!cohort) return;
    if (cohort.status !== "draft") throw new ConvexError("Only draft cohorts can be deleted. Close registration instead.");
    const registrations = await ctx.db
      .query("learnRegistrations")
      .withIndex("by_cohort", (q) => q.eq("cohortId", cohort._id))
      .collect();
    if (registrations.some((r) => r.status === "paid" || r.status === "refunded")) {
      throw new ConvexError("This cohort has paid registrations, so it can't be deleted.");
    }
    for (const registration of registrations) await ctx.db.delete(registration._id);
    await ctx.db.delete(cohort._id);
    await releaseImage(ctx, cohort.imageStorageId);
  },
});

export const adminListRegistrations = query({
  args: { cohortId: v.id("learnCohorts") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const registrations = await ctx.db
      .query("learnRegistrations")
      .withIndex("by_cohort", (q) => q.eq("cohortId", args.cohortId))
      .order("desc")
      .collect();
    return registrations.map((r) => ({
      id: r._id,
      track: r.track,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone,
      licenseNumber: r.licenseNumber ?? "",
      workplace: r.workplace ?? "",
      city: r.city ?? "",
      yearsOfPractice: r.yearsOfPractice ?? "",
      status: r.status,
      price: r.amountKobo / 100,
      amountPaid: r.paidAmountKobo !== undefined ? r.paidAmountKobo / 100 : null,
      paidAt: r.paidAt ?? null,
      paidReference: r.paidReference ?? "",
      paymentReference: r.paymentReference ?? "",
      paymentChannel: r.paymentChannel ?? "",
      paymentAttempts: r.paymentAttempts ?? 0,
      lastAttemptAt: r.lastAttemptAt ?? null,
      extraPayments: (r.extraPayments ?? []).map((p) => ({ ...p, amount: p.amountKobo / 100 })),
      confirmationEmailSentAt: r.confirmationEmailSentAt ?? null,
      adminNotes: r.adminNotes ?? "",
      contactedAt: r.contactedAt ?? null,
      hasAccount: Boolean(r.userId),
      createdAt: r.createdAt,
    }));
  },
});

/**
 * Admin bookkeeping on a registration: cancel an unpaid one, mark a paid one refunded (after
 * refunding it in Paystack), reopen a cancelled one, keep notes, or clear flagged payments
 * once they've been refunded.
 */
export const adminUpdateRegistration = mutation({
  args: {
    registrationId: v.id("learnRegistrations"),
    status: v.optional(v.union(v.literal("pending"), v.literal("cancelled"), v.literal("refunded"))),
    adminNotes: v.optional(v.string()),
    clearFlaggedPayments: v.optional(v.boolean()),
    contacted: v.optional(v.boolean()), // true marks a follow-up done now, false clears it
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx);
    const registration = await ctx.db.get(args.registrationId);
    if (!registration) throw new ConvexError("Registration not found.");
    const now = Date.now();
    const patch: Partial<Doc<"learnRegistrations">> = { updatedAt: now };
    if (args.contacted !== undefined) {
      patch.contactedAt = args.contacted ? now : undefined;
      patch.contactedBy = args.contacted ? user._id : undefined;
    }

    if (args.status && args.status !== registration.status) {
      const allowed =
        (args.status === "cancelled" && registration.status === "pending") ||
        (args.status === "refunded" && registration.status === "paid") ||
        (args.status === "pending" && registration.status === "cancelled");
      if (!allowed) throw new ConvexError(`A ${registration.status} registration can't be marked ${args.status}.`);
      patch.status = args.status;
    }
    if (args.adminNotes !== undefined) patch.adminNotes = clean(args.adminNotes, 1000) || undefined;
    if (args.clearFlaggedPayments) patch.extraPayments = undefined;

    await ctx.db.patch(registration._id, patch);
    if (patch.status || args.clearFlaggedPayments) {
      await ctx.db.insert("systemLogs", {
        action: patch.status ? `learn_registration_${patch.status}` : "learn_flagged_payments_cleared",
        type: "learn",
        timestamp: now,
        userId: String(user._id),
        actorUserId: String(user._id),
        targetEntityType: "learn_registration",
        targetEntityId: String(registration._id),
        details: { from: registration.status, flagged: registration.extraPayments ?? [] },
      });
    }
  },
});

export const adminResendConfirmation = mutation({
  args: { registrationId: v.id("learnRegistrations") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const registration = await ctx.db.get(args.registrationId);
    if (!registration || registration.status !== "paid") throw new ConvexError("Only paid registrations get a confirmation email.");
    await scheduleConfirmationEmail(ctx, registration._id);
  },
});

export const registrationForRecheck = internalQuery({
  args: { registrationId: v.id("learnRegistrations") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const registration = await ctx.db.get(args.registrationId);
    if (!registration) throw new ConvexError("Registration not found.");
    return { reference: registration.paymentReference ?? null, status: registration.status };
  },
});

/** For "I paid but it says pending": asks Paystack about the latest checkout and completes it. */
export const adminRecheckPayment = action({
  args: { registrationId: v.id("learnRegistrations") },
  handler: async (ctx, args): Promise<{ status: string }> => {
    const target: { reference: string | null; status: string } = await ctx.runQuery(internal.learn.registrationForRecheck, {
      registrationId: args.registrationId,
    });
    if (target.status === "paid") return { status: "already_paid" };
    if (!target.reference) return { status: "no_checkout" };
    const tx = await fetchPaystackTransaction(target.reference);
    if (!tx) return { status: "not_found" };
    if (tx.status !== "success") return { status: tx.status };
    const result: Completion = await ctx.runMutation(internal.learn.completeVerifiedPayment, {
      reference: target.reference,
      amountKobo: Number(tx.amount) || 0,
      currency: String(tx.currency || ""),
      channel: typeof tx.channel === "string" ? tx.channel : undefined,
    });
    return { status: result.success ? "paid" : result.reason };
  },
});

export const adminListInterest = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("learnInterest")
      .withIndex("by_program_email", (q) => q.eq("program", MSK_PROGRAM))
      .collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({ id: r._id, email: r.email, name: r.name ?? "", createdAt: r.createdAt }));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// The physio's course: sessions, links and weekly materials
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const COURSE_LINK_TTL_MS = 30 * DAY_MS;
// A fresh sign-in link at most this often per registration, so the form can't be used to spam
const COURSE_LINK_RESEND_GAP_MS = 2 * 60 * 1000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const FILE_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const HTTPS_URL = /^https:\/\/[^\s]+$/i;

async function cohortSessions(ctx: Ctx, cohortId: Id<"learnCohorts">) {
  return await ctx.db
    .query("learnSessions")
    .withIndex("by_cohort", (q) => q.eq("cohortId", cohortId))
    .take(200);
}

async function cohortWeeks(ctx: Ctx, cohortId: Id<"learnCohorts">) {
  return await ctx.db
    .query("learnModules")
    .withIndex("by_cohort_week", (q) => q.eq("cohortId", cohortId))
    .take(60);
}

/** The cohort's named links; cohorts made before links existed show their single group link. */
function courseLinksFor(cohort: Doc<"learnCohorts">) {
  if (cohort.links) return cohort.links;
  return cohort.communityLink ? [{ id: "group", label: "Cohort group", url: cohort.communityLink }] : [];
}

function sessionView(s: Doc<"learnSessions">) {
  return {
    id: s._id,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    title: s.title ?? null,
    meetingUrl: s.meetingUrl ?? null,
    recordingUrl: s.recordingUrl ?? null,
    linkChangedAt: s.linkChangedAt ?? null,
  };
}

async function weekView(ctx: Ctx, week: Doc<"learnModules">) {
  const exercises = [];
  for (const id of week.exerciseIds) {
    const exercise = await ctx.db.get(id);
    if (exercise) exercises.push(libraryItem(exercise));
  }
  const resources = [];
  for (const key of week.resourceKeys) {
    const row = await ctx.db
      .query("libraryResources")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (row) resources.push(listRow(row));
  }
  return {
    id: week._id,
    week: week.week,
    title: week.title,
    summary: week.summary ?? null,
    recordingUrl: week.recordingUrl ?? null,
    files: await Promise.all(
      week.files.map(async (f) => ({ ...f, url: await ctx.storage.getUrl(f.storageId) }))
    ),
    exercises,
    resources,
    updatedAt: week.updatedAt,
  };
}

/**
 * Everything on the signed-in physio's "My course" page. Matched by account or verified email,
 * so a physio who paid before having an account sees their course as soon as they sign in.
 */
export const getMyCourse = query({
  args: { cohortId: v.optional(v.id("learnCohorts")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { state: "signed_out" as const };
    const viewer = await getViewer(ctx);
    const email = await verifiedIdentityEmail(ctx);
    const courses = await paidLearnRegistrations(ctx, viewer?.user ?? null, email);
    if (courses.length === 0) {
      return { state: "not_registered" as const, email: typeof identity.email === "string" ? identity.email : null };
    }

    const chosen =
      courses.find((c) => c.cohort._id === args.cohortId) ??
      courses.find((c) => learnerAccessOpen(c.cohort)) ??
      courses[0];
    const { registration, cohort } = chosen;
    const ended = endOfLagosDay(cohort.endDate);
    const base = {
      learner: { firstName: registration.firstName, trackLabel: TRACK_LABEL[registration.track] },
      cohort: {
        id: cohort._id,
        cohortLabel: cohort.cohortLabel,
        startDate: cohort.startDate,
        endDate: cohort.endDate,
        dateRange: formatCohortRange(cohort.startDate, cohort.endDate),
        startsOn: formatCohortDay(cohort.startDate),
        liveSessions: cohort.liveSessions,
        duration: cohort.duration,
        format: cohort.format,
        welcomeNote: cohort.welcomeNote ?? null,
      },
      accessUntil: ended === null ? null : ended + LEARNER_ACCESS_DAYS * DAY_MS,
      otherCohorts: courses
        .filter((c) => c.cohort._id !== cohort._id)
        .map((c) => ({ id: c.cohort._id, cohortLabel: c.cohort.cohortLabel })),
    };
    if (!learnerAccessOpen(cohort)) return { state: "ended" as const, ...base };

    const sessionDocs = await cohortSessions(ctx, cohort._id);
    const weeks = await Promise.all((await cohortWeeks(ctx, cohort._id)).map((w) => weekView(ctx, w)));
    return {
      state: "ok" as const,
      ...base,
      links: courseLinksFor(cohort),
      sessions: sessionDocs.map(sessionView),
      weeks,
      progress: await progressView(ctx, registration, cohort, sessionDocs),
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// One-tap "Open my course" links (sent by email only: the inbox proves the address)
// ─────────────────────────────────────────────────────────────────────────────

type CourseEmailKind = "confirmation" | "sign_in";
type CourseEmail = {
  to: string;
  subject: string;
  greetingName: string;
  heading: string;
  paragraphs: string[];
  footnote: string;
};

const LEARN_FOOTNOTE =
  "You're receiving this because you registered for a Rehabify Learn program. Questions? Write to support@physioaroundme.com.";

/** Stores a new link (replacing any earlier one) and returns the email to send with it. */
export const issueCourseLink = internalMutation({
  args: {
    registrationId: v.id("learnRegistrations"),
    codeHash: v.string(),
    kind: v.union(v.literal("confirmation"), v.literal("sign_in")),
  },
  handler: async (ctx, args): Promise<CourseEmail | null> => {
    const registration = await ctx.db.get(args.registrationId);
    if (!registration || registration.status !== "paid") return null;
    const cohort = await ctx.db.get(registration.cohortId);
    if (!cohort) return null;
    const now = Date.now();
    await ctx.db.patch(registration._id, {
      courseLinkHash: args.codeHash,
      courseLinkExpiresAt: now + COURSE_LINK_TTL_MS,
      courseLinkUsedAt: undefined,
      ...(args.kind === "confirmation" ? { confirmationEmailSentAt: now } : {}),
      updatedAt: now,
    });

    if (args.kind === "sign_in") {
      return {
        to: registration.email,
        subject: `Your link to the ${PROGRAM_TITLE}`,
        greetingName: registration.firstName,
        heading: "Open your course",
        paragraphs: [
          `Here's your link to your ${cohort.cohortLabel} courses: the video courses from the Rehabify team, to watch at your own pace.`,
          "The button signs you in, no password needed. It works once, within 30 days. If you didn't ask for it, you can ignore this email.",
        ],
        footnote: LEARN_FOOTNOTE,
      };
    }
    return {
      to: registration.email,
      subject: `You're registered: ${PROGRAM_TITLE}`,
      greetingName: registration.firstName,
      heading: `Your place in the ${cohort.cohortLabel} is confirmed`,
      paragraphs: [
        `Thank you for registering for the ${PROGRAM_TITLE}. We've received your payment of ${formatNairaFromKobo(
          registration.paidAmountKobo ?? registration.amountKobo
        )}.`,
        `Program dates: ${formatCohortRange(cohort.startDate, cohort.endDate)}`,
        `Live sessions: ${cohort.liveSessions}`,
        ...(cohort.welcomeNote ? [cohort.welcomeNote] : []),
        "Your course page has the video courses from the Rehabify team, to watch at your own pace.",
        "The button below signs you straight in, no password needed. It works once, within 30 days; after that, open the course page and we'll email you a fresh link.",
        `Registration: ${TRACK_LABEL[registration.track]}. Payment reference: ${registration.paidReference ?? "—"}.`,
      ],
      footnote: LEARN_FOOTNOTE,
    };
  },
});

async function sendCourseLinkEmail(ctx: any, registrationId: Id<"learnRegistrations">, kind: CourseEmailKind): Promise<void> {
  const code = randomToken(32);
  const email: CourseEmail | null = await ctx.runMutation(internal.learn.issueCourseLink, {
    registrationId,
    codeHash: await sha256Hex(code),
    kind,
  });
  if (!email) return;
  await ctx.scheduler.runAfter(0, internal.actions.emails.sendPatientCareEmail.sendPatientCareEmail, {
    ...email,
    buttonLabel: "Open my course",
    buttonUrl: appLink(`/learn/start/${code}`),
  });
}

/** Confirmation email after payment (and the admin's "resend"). */
export const sendConfirmationEmail = internalAction({
  args: { registrationId: v.id("learnRegistrations") },
  handler: async (ctx, args): Promise<void> => {
    await sendCourseLinkEmail(ctx, args.registrationId, "confirmation");
  },
});

/** The latest paid registration for this email whose course is still open, unless a link just went out. */
export const courseLinkTarget = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<Id<"learnRegistrations"> | null> => {
    const courses = await paidLearnRegistrations(ctx, null, args.email);
    const open = courses.find((c) => learnerAccessOpen(c.cohort));
    if (!open) return null;
    const issuedAt = (open.registration.courseLinkExpiresAt ?? 0) - COURSE_LINK_TTL_MS;
    if (Date.now() - issuedAt < COURSE_LINK_RESEND_GAP_MS) return null;
    return open.registration._id;
  },
});

/**
 * "Email me my course link" on the signed-out course page. Always answers the same way, so it
 * never reveals who has registered.
 */
export const requestCourseLink = action({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const email = clean(args.email, 120).toLowerCase();
    if (!EMAIL.test(email)) throw new ConvexError("Enter a valid email address.");
    const registrationId: Id<"learnRegistrations"> | null = await ctx.runQuery(internal.learn.courseLinkTarget, { email });
    if (registrationId) await sendCourseLinkEmail(ctx, registrationId, "sign_in");
    return { ok: true };
  },
});

async function courseLinkRow(ctx: Ctx, code: string) {
  if (!/^[A-Za-z0-9]{24,64}$/.test(code)) return null;
  const hash = await sha256Hex(code);
  return await ctx.db
    .query("learnRegistrations")
    .withIndex("by_course_link", (q) => q.eq("courseLinkHash", hash))
    .first();
}

/** What /learn/start/<code> shows before the tap. */
export const peekCourseLink = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const registration = await courseLinkRow(ctx, args.code.trim());
    if (!registration || registration.status !== "paid") return { state: "not_found" as const };
    const viewer = await getViewer(ctx);
    const email = await verifiedIdentityEmail(ctx);
    if ((viewer?.user && registration.userId === viewer.user._id) || email === registration.email) {
      return { state: "signed_in" as const, firstName: registration.firstName };
    }
    const state = registration.courseLinkUsedAt
      ? ("used" as const)
      : (registration.courseLinkExpiresAt ?? 0) <= Date.now()
        ? ("expired" as const)
        : ("ok" as const);
    return { state, firstName: registration.firstName, maskedEmail: maskEmail(registration.email) };
  },
});

type ConsumedLink =
  | { ok: true; registrationId: Id<"learnRegistrations">; email: string; firstName: string; lastName: string }
  | { ok: false; reason: "not_found" | "used" | "expired" };

export const consumeCourseLink = internalMutation({
  args: { code: v.string() },
  handler: async (ctx, args): Promise<ConsumedLink> => {
    const registration = await courseLinkRow(ctx, args.code);
    if (!registration || registration.status !== "paid") return { ok: false, reason: "not_found" };
    if (registration.courseLinkUsedAt) return { ok: false, reason: "used" };
    if ((registration.courseLinkExpiresAt ?? 0) <= Date.now()) return { ok: false, reason: "expired" };
    await ctx.db.patch(registration._id, { courseLinkUsedAt: Date.now() });
    return {
      ok: true,
      registrationId: registration._id,
      email: registration.email,
      firstName: registration.firstName,
      lastName: registration.lastName,
    };
  },
});

export const releaseCourseLink = internalMutation({
  args: { registrationId: v.id("learnRegistrations") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.registrationId, { courseLinkUsedAt: undefined });
  },
});

/** Clerk's Backend API. Errors carry only Clerk's code, never the email. */
async function clerkApi(path: string, method = "GET", body?: unknown): Promise<any> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("clerk_not_configured");
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: any = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`clerk_${response.status}_${data?.errors?.[0]?.code ?? "error"}`);
  return data;
}

/**
 * The tap on /learn/start/<code>: signs the physio in to the account for the email they paid with
 * (creating it the first time). Opening the email proved they own the address.
 */
export const redeemCourseLink = action({
  args: { code: v.string() },
  handler: async (ctx, args): Promise<{ ok: true; ticket: string } | { ok: false; reason: string }> => {
    const consumed: ConsumedLink = await ctx.runMutation(internal.learn.consumeCourseLink, { code: args.code.trim() });
    if (!consumed.ok) return consumed;
    try {
      const found = await clerkApi(`/users?email_address=${encodeURIComponent(consumed.email)}&limit=1`);
      const userId: string =
        Array.isArray(found) && found[0]?.id
          ? found[0].id
          : (
              await clerkApi("/users", "POST", {
                email_address: [consumed.email],
                first_name: consumed.firstName,
                last_name: consumed.lastName,
                skip_password_requirement: true,
                public_metadata: { source: "rehabify_learn" },
              })
            ).id;
      const token = await clerkApi("/sign_in_tokens", "POST", { user_id: userId, expires_in_seconds: 600 });
      return { ok: true, ticket: String(token.token) };
    } catch (error) {
      console.error("learn_course_link_failed", { reason: error instanceof Error ? error.message.slice(0, 80) : "unknown" });
      await ctx.runMutation(internal.learn.releaseCourseLink, { registrationId: consumed.registrationId });
      return { ok: false, reason: "unavailable" };
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin: sessions, course links and weekly materials
// ─────────────────────────────────────────────────────────────────────────────

function httpsUrl(value: string | undefined, label: string) {
  const url = clean(value, 500);
  if (url && !HTTPS_URL.test(url)) throw new ConvexError(`${label} must start with https://`);
  return url || undefined;
}

/** Sessions, links and weeks of one cohort, for the admin's Course tab. */
export const adminCourseContent = query({
  args: { cohortId: v.id("learnCohorts") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const cohort = await ctx.db.get(args.cohortId);
    if (!cohort) return null;
    const paid = await ctx.db
      .query("learnRegistrations")
      .withIndex("by_cohort_status", (q) => q.eq("cohortId", cohort._id).eq("status", "paid"))
      .take(1000);
    const sessions = (await cohortSessions(ctx, cohort._id))
      .sort((a, b) => a.startsAt - b.startsAt)
      .map((s) => ({
        ...sessionView(s),
        date: zonedDateKey(s.startsAt),
        startTime: zonedTimeKey(s.startsAt),
        endTime: zonedTimeKey(s.endsAt),
        label: lagosDateTime(s.startsAt),
      }));
    const weeks = await Promise.all((await cohortWeeks(ctx, cohort._id)).map((w) => weekView(ctx, w)));
    return {
      cohortId: cohort._id,
      cohortLabel: cohort.cohortLabel,
      startDate: cohort.startDate,
      learners: paid.length,
      links: courseLinksFor(cohort),
      sessions,
      weeks: weeks.sort((a, b) => a.week - b.week),
    };
  },
});

/** Add or change a live session. With `notifyLearners`, a changed link is emailed to every paid physio. */
export const adminSaveSession = mutation({
  args: {
    cohortId: v.id("learnCohorts"),
    sessionId: v.optional(v.id("learnSessions")),
    date: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    title: v.optional(v.string()),
    meetingUrl: v.optional(v.string()),
    recordingUrl: v.optional(v.string()),
    notifyLearners: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const cohort = await ctx.db.get(args.cohortId);
    if (!cohort) throw new ConvexError("Cohort not found.");
    if (!isCalendarDate(args.date)) throw new ConvexError("Choose the session date.");
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!time.test(args.startTime) || !time.test(args.endTime)) throw new ConvexError("Choose a start and end time.");
    const startsAt = zonedDateTimeToUtc(args.date, args.startTime);
    const endsAt = zonedDateTimeToUtc(args.date, args.endTime);
    if (endsAt <= startsAt) throw new ConvexError("The session must end after it starts.");
    const meetingUrl = httpsUrl(args.meetingUrl, "The meeting link");
    const recordingUrl = httpsUrl(args.recordingUrl, "The recording link");
    const title = clean(args.title, 120) || undefined;
    const now = Date.now();

    let sessionId = args.sessionId;
    let linkChanged = false;
    if (sessionId) {
      const existing = await ctx.db.get(sessionId);
      if (!existing || existing.cohortId !== cohort._id) throw new ConvexError("Session not found.");
      linkChanged = (existing.meetingUrl ?? "") !== (meetingUrl ?? "") && Boolean(meetingUrl);
      // A new time gets its own reminders
      const moved = existing.startsAt !== startsAt;
      await ctx.db.patch(sessionId, {
        startsAt,
        endsAt,
        ...(moved ? { remindedDayAt: undefined, remindedHourAt: undefined } : {}),
        title,
        meetingUrl,
        recordingUrl,
        ...(linkChanged ? { linkChangedAt: now } : {}),
        updatedAt: now,
      });
    } else {
      sessionId = await ctx.db.insert("learnSessions", {
        cohortId: cohort._id,
        startsAt,
        endsAt,
        title,
        meetingUrl,
        recordingUrl,
        createdAt: now,
        updatedAt: now,
      });
    }

    let notified = 0;
    if (args.notifyLearners && meetingUrl && (linkChanged || !args.sessionId)) {
      const paid = await ctx.db
        .query("learnRegistrations")
        .withIndex("by_cohort_status", (q) => q.eq("cohortId", cohort._id).eq("status", "paid"))
        .take(1000);
      const when = lagosDateTime(startsAt);
      for (const [i, registration] of paid.entries()) {
        await ctx.scheduler.runAfter(i * 1500, internal.actions.emails.sendPatientCareEmail.sendPatientCareEmail, {
          to: registration.email,
          subject: linkChanged ? `New joining link: ${title ?? "live session"} on ${when}` : `Joining link: ${title ?? "live session"} on ${when}`,
          greetingName: registration.firstName,
          heading: linkChanged ? "The joining link has changed" : "Your joining link is ready",
          paragraphs: [
            `${title ?? `The ${cohort.cohortLabel} live session`} is on ${when}.`,
            linkChanged
              ? "Please use the new link on your course page. The old link won't work."
              : "The link is on your course page, where it's always kept up to date.",
          ],
          buttonLabel: "Open my course",
          buttonUrl: appLink("/learn/course"),
          footnote: LEARN_FOOTNOTE,
        });
      }
      notified = paid.length;
    }
    return { sessionId, notified };
  },
});

export const adminDeleteSession = mutation({
  args: { sessionId: v.id("learnSessions") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.delete(args.sessionId);
  },
});

/** Replace the cohort's course links (they show on every learner's course page at once). */
export const adminSaveCourseLinks = mutation({
  args: { cohortId: v.id("learnCohorts"), links: v.array(v.object({ id: v.optional(v.string()), label: v.string(), url: v.string() })) },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx);
    const cohort = await ctx.db.get(args.cohortId);
    if (!cohort) throw new ConvexError("Cohort not found.");
    if (args.links.length > 12) throw new ConvexError("Add at most 12 links.");
    const links = args.links.map((link, i) => {
      const label = clean(link.label, 60);
      if (!label) throw new ConvexError(`Give link ${i + 1} a name.`);
      const url = httpsUrl(link.url, `The link "${label}"`);
      if (!url) throw new ConvexError(`Add the address for "${label}".`);
      return { id: clean(link.id, 40) || `l${Date.now().toString(36)}${i}`, label, url };
    });
    // The single legacy group link becomes one of these
    await ctx.db.patch(cohort._id, { links, communityLink: undefined, updatedBy: user._id, updatedAt: Date.now() });
  },
});

async function assertCourseFile(ctx: MutationCtx, storageId: Id<"_storage">) {
  const file = await ctx.db.system.get(storageId);
  if (!file) throw new ConvexError("A file didn't finish uploading. Please add it again.");
  if (file.size > MAX_FILE_BYTES) throw new ConvexError("Files can be up to 25 MB.");
  if (!file.contentType || !FILE_TYPES.has(file.contentType)) {
    throw new ConvexError("Upload PDFs, slides (PowerPoint), Word documents or images.");
  }
  return file;
}

/** Create or update a week of materials. Files removed from the week are deleted from storage. */
export const adminSaveWeek = mutation({
  args: {
    cohortId: v.id("learnCohorts"),
    moduleId: v.optional(v.id("learnModules")),
    week: v.number(),
    title: v.string(),
    summary: v.optional(v.string()),
    recordingUrl: v.optional(v.string()),
    files: v.array(v.object({ storageId: v.id("_storage"), name: v.string() })),
    exerciseIds: v.array(v.id("exercises")),
    resourceKeys: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const cohort = await ctx.db.get(args.cohortId);
    if (!cohort) throw new ConvexError("Cohort not found.");
    if (!Number.isInteger(args.week) || args.week < 1 || args.week > 20) throw new ConvexError("Choose a week between 1 and 20.");
    const title = clean(args.title, 120);
    if (!title) throw new ConvexError("Give the week a title, e.g. \"MSK assessment\".");
    if (args.files.length > 10) throw new ConvexError("Add at most 10 files to a week.");
    if (args.exerciseIds.length > 30 || args.resourceKeys.length > 30) throw new ConvexError("Add at most 30 exercises and 30 resources to a week.");

    const files = [];
    for (const f of args.files) {
      const meta = await assertCourseFile(ctx, f.storageId);
      files.push({ storageId: f.storageId, name: clean(f.name, 120) || "Handout", size: meta.size, contentType: meta.contentType ?? "" });
    }
    for (const id of args.exerciseIds) {
      if (!(await ctx.db.get(id))) throw new ConvexError("One of the exercises no longer exists.");
    }
    const resourceKeys = [...new Set(args.resourceKeys.map((k) => clean(k, 80)).filter(Boolean))];

    const fields = {
      week: args.week,
      title,
      summary: clean(args.summary, 1000) || undefined,
      recordingUrl: httpsUrl(args.recordingUrl, "The recording link"),
      files,
      exerciseIds: [...new Set(args.exerciseIds)],
      resourceKeys,
      updatedAt: Date.now(),
    };
    if (args.moduleId) {
      const existing = await ctx.db.get(args.moduleId);
      if (!existing || existing.cohortId !== cohort._id) throw new ConvexError("Week not found.");
      const kept = new Set(files.map((f) => f.storageId));
      for (const old of existing.files) if (!kept.has(old.storageId)) await ctx.storage.delete(old.storageId);
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert("learnModules", { cohortId: cohort._id, ...fields, createdAt: fields.updatedAt });
  },
});

export const adminDeleteWeek = mutation({
  args: { moduleId: v.id("learnModules") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const week = await ctx.db.get(args.moduleId);
    if (!week) return;
    for (const f of week.files) await ctx.storage.delete(f.storageId);
    await ctx.db.delete(week._id);
  },
});

/** Upload target for a handout or slides (the browser posts the file straight to storage). */
export const adminGenerateFileUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Progress, final assessment and certificates
// ─────────────────────────────────────────────────────────────────────────────

const JOIN_WINDOW_MS = 30 * 60 * 1000;
// No 0/O/1/I, so a code read off paper is never ambiguous
const CERT_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CERTIFICATE_NOTE =
  "Professional development certificate. It does not replace professional licensure or specialist accreditation by a regulatory body.";

async function cohortAssessment(ctx: Ctx, cohortId: Id<"learnCohorts">) {
  return await ctx.db
    .query("learnAssessments")
    .withIndex("by_cohort", (q) => q.eq("cohortId", cohortId))
    .first();
}

async function registrationAttempts(ctx: Ctx, registrationId: Id<"learnRegistrations">) {
  return await ctx.db
    .query("learnAttempts")
    .withIndex("by_registration", (q) => q.eq("registrationId", registrationId))
    .take(50);
}

/** The signed-in physio's paid registration for this cohort; throws if they don't have one. */
async function learnerRegistration(ctx: Ctx, cohortId: Id<"learnCohorts">) {
  const viewer = await getViewer(ctx);
  const email = await verifiedIdentityEmail(ctx);
  if (!viewer) throw new ConvexError("Sign in to continue.");
  const courses = await paidLearnRegistrations(ctx, viewer.user ?? null, email);
  const found = courses.find((c) => c.cohort._id === cohortId);
  if (!found) throw new ConvexError("This course isn't on your account.");
  if (!learnerAccessOpen(found.cohort)) throw new ConvexError("This course has closed.");
  return found;
}

function certificateView(registration: Doc<"learnRegistrations">) {
  return registration.certificateCode && !registration.certificateRevokedAt
    ? {
        code: registration.certificateCode,
        name: registration.certificateName ?? `${registration.firstName} ${registration.lastName}`,
        issuedAt: registration.certificateIssuedAt ?? registration.updatedAt,
      }
    : null;
}

/** Certificate details everything that draws a certificate needs (course page and verify page). */
function certificateCohort(cohort: Doc<"learnCohorts">, assessment: Doc<"learnAssessments"> | null) {
  return {
    programTitle: PROGRAM_TITLE,
    cohortLabel: cohort.cohortLabel,
    dateRange: formatCohortRange(cohort.startDate, cohort.endDate),
    duration: cohort.duration,
    signatoryName: assessment?.signatoryName ?? null,
    signatoryTitle: assessment?.signatoryTitle ?? null,
    note: CERTIFICATE_NOTE,
  };
}

/** Where a physio is on the way to their certificate (part of getMyCourse). */
async function progressView(
  ctx: Ctx,
  registration: Doc<"learnRegistrations">,
  cohort: Doc<"learnCohorts">,
  sessions: Doc<"learnSessions">[]
) {
  const assessment = await cohortAssessment(ctx, cohort._id);
  const attempts = await registrationAttempts(ctx, registration._id);
  const sessionIds = new Set(sessions.map((s) => s._id));
  const attendedSessionIds = (registration.attendedSessionIds ?? []).filter((id) => sessionIds.has(id));
  // Never ask for more sessions than the cohort actually has
  const minSessions = Math.min(assessment?.minSessions ?? 0, sessions.length);
  const passed = attempts.some((a) => a.passed);
  const best = attempts.reduce<Doc<"learnAttempts"> | null>((b, a) => (!b || a.scorePct > b.scorePct ? a : b), null);
  const certificate = certificateView(registration);
  const live = assessment && assessment.status !== "draft" && assessment.questions.length > 0 ? assessment : null;
  return {
    attendedSessionIds,
    weeksDone: registration.weeksDone ?? [],
    attended: attendedSessionIds.length,
    minSessions,
    assessment: live
      ? {
          status: live.status as "open" | "closed",
          passMark: live.passMark,
          questions: live.questions.length,
          maxAttempts: live.maxAttempts,
          attemptsUsed: attempts.length,
          bestScore: best?.scorePct ?? null,
        }
      : null,
    passed,
    certificate,
    canClaim: !certificate && passed && attendedSessionIds.length >= minSessions,
    suggestedName: `${registration.firstName} ${registration.lastName}`.trim(),
    certificateCohort: certificateCohort(cohort, assessment),
  };
}

/** "Join live" on the course page: counts as attending when it's tapped around the session. */
export const recordJoin = mutation({
  args: { sessionId: v.id("learnSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;
    const now = Date.now();
    if (now < session.startsAt - JOIN_WINDOW_MS || now > session.endsAt + JOIN_WINDOW_MS) return;
    const { registration } = await learnerRegistration(ctx, session.cohortId);
    const attended = registration.attendedSessionIds ?? [];
    if (attended.includes(session._id)) return;
    await ctx.db.patch(registration._id, { attendedSessionIds: [...attended, session._id], updatedAt: now });
  },
});

/** The physio ticks a week off (their own tracking; not needed for the certificate). */
export const setWeekDone = mutation({
  args: { moduleId: v.id("learnModules"), done: v.boolean() },
  handler: async (ctx, args) => {
    const week = await ctx.db.get(args.moduleId);
    if (!week) throw new ConvexError("This week no longer exists.");
    const { registration } = await learnerRegistration(ctx, week.cohortId);
    const current = (registration.weeksDone ?? []).filter((id) => id !== week._id);
    await ctx.db.patch(registration._id, {
      weeksDone: args.done ? [...current, week._id] : current,
      updatedAt: Date.now(),
    });
  },
});

/** The questions (never the answers) while the assessment is open and the physio has tries left. */
export const getMyAssessment = query({
  args: { cohortId: v.id("learnCohorts") },
  handler: async (ctx, args) => {
    let registration: Doc<"learnRegistrations">;
    try {
      registration = (await learnerRegistration(ctx, args.cohortId)).registration;
    } catch {
      return null;
    }
    const assessment = await cohortAssessment(ctx, args.cohortId);
    if (!assessment || assessment.status !== "open" || assessment.questions.length === 0) return null;
    const attempts = await registrationAttempts(ctx, registration._id);
    return {
      passMark: assessment.passMark,
      maxAttempts: assessment.maxAttempts,
      attemptsUsed: attempts.length,
      passed: attempts.some((a) => a.passed),
      questions: assessment.questions.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options })),
    };
  },
});

export type AssessmentResult = {
  correct: number;
  total: number;
  scorePct: number;
  passed: boolean;
  passMark: number;
  attemptsLeft: number;
  /** Answers and explanations, only once the physio has passed or used every try. */
  review: { prompt: string; options: string[]; chosen: number; answer: number; explanation: string | null }[] | null;
};

export const submitAssessment = mutation({
  args: { cohortId: v.id("learnCohorts"), answers: v.array(v.number()) },
  handler: async (ctx, args): Promise<AssessmentResult> => {
    const { registration } = await learnerRegistration(ctx, args.cohortId);
    const assessment = await cohortAssessment(ctx, args.cohortId);
    if (!assessment || assessment.status !== "open") throw new ConvexError("The assessment isn't open.");
    const attempts = await registrationAttempts(ctx, registration._id);
    if (attempts.some((a) => a.passed)) throw new ConvexError("You've already passed.");
    if (attempts.length >= assessment.maxAttempts) throw new ConvexError("You've used all your attempts.");
    const questions = assessment.questions;
    if (args.answers.length !== questions.length) throw new ConvexError("Answer every question before you submit.");
    args.answers.forEach((a, i) => {
      if (!Number.isInteger(a) || a < 0 || a >= questions[i].options.length) throw new ConvexError("Answer every question before you submit.");
    });

    const correct = questions.filter((q, i) => q.answer === args.answers[i]).length;
    const scorePct = Math.round((correct / questions.length) * 100);
    const passed = scorePct >= assessment.passMark;
    await ctx.db.insert("learnAttempts", {
      registrationId: registration._id,
      cohortId: args.cohortId,
      answers: args.answers,
      correct,
      total: questions.length,
      scorePct,
      passed,
      submittedAt: Date.now(),
    });
    const attemptsLeft = passed ? 0 : assessment.maxAttempts - attempts.length - 1;
    return {
      correct,
      total: questions.length,
      scorePct,
      passed,
      passMark: assessment.passMark,
      attemptsLeft,
      review:
        passed || attemptsLeft === 0
          ? questions.map((q, i) => ({
              prompt: q.prompt,
              options: q.options,
              chosen: args.answers[i],
              answer: q.answer,
              explanation: q.explanation ?? null,
            }))
          : null,
    };
  },
});

async function newCertificateCode(ctx: MutationCtx) {
  for (let tries = 0; tries < 10; tries++) {
    let raw = "";
    for (let i = 0; i < 8; i++) raw += CERT_ALPHABET[Math.floor(Math.random() * CERT_ALPHABET.length)];
    const code = `RHL-${raw.slice(0, 4)}-${raw.slice(4)}`;
    const taken = await ctx.db
      .query("learnRegistrations")
      .withIndex("by_certificate", (q) => q.eq("certificateCode", code))
      .first();
    if (!taken) return code;
  }
  throw new ConvexError("Couldn't create a certificate number. Please try again.");
}

function certificateName(raw: string) {
  const name = clean(raw, 80).replace(/\s+/g, " ");
  if (name.length < 3) throw new ConvexError("Enter your full name as it should appear on the certificate.");
  return name;
}

/** The physio claims their certificate once they've attended enough sessions and passed. */
export const claimCertificate = mutation({
  args: { cohortId: v.id("learnCohorts"), name: v.string() },
  handler: async (ctx, args) => {
    const { registration, cohort } = await learnerRegistration(ctx, args.cohortId);
    if (certificateView(registration)) return registration.certificateCode!;
    const sessions = await cohortSessions(ctx, cohort._id);
    const progress = await progressView(ctx, registration, cohort, sessions);
    if (!progress.passed) throw new ConvexError("Pass the final assessment first.");
    if (progress.attended < progress.minSessions) {
      throw new ConvexError(`Attend at least ${progress.minSessions} live sessions first. Ask the team if your attendance is missing.`);
    }
    const code = await newCertificateCode(ctx);
    const now = Date.now();
    await ctx.db.patch(registration._id, {
      certificateCode: code,
      certificateName: certificateName(args.name),
      certificateIssuedAt: now,
      certificateRevokedAt: undefined,
      updatedAt: now,
    });
    return code;
  },
});

/** Public check of a certificate number (the link printed on every certificate). */
export const verifyCertificate = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase();
    if (!/^RHL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return { state: "not_found" as const };
    const registration = await ctx.db
      .query("learnRegistrations")
      .withIndex("by_certificate", (q) => q.eq("certificateCode", code))
      .first();
    const cohort = registration ? await ctx.db.get(registration.cohortId) : null;
    if (!registration || !cohort) return { state: "not_found" as const };
    if (registration.certificateRevokedAt) return { state: "revoked" as const, code };
    return {
      state: "valid" as const,
      code,
      name: registration.certificateName ?? `${registration.firstName} ${registration.lastName}`,
      issuedAt: registration.certificateIssuedAt ?? registration.updatedAt,
      ...certificateCohort(cohort, await cohortAssessment(ctx, cohort._id)),
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Session reminders (cron): the day before and an hour before
// ─────────────────────────────────────────────────────────────────────────────

function dayWord(startsAt: number, now: number) {
  const day = zonedDateKey(startsAt);
  if (day === zonedDateKey(now)) return "today";
  if (day === zonedDateKey(now + DAY_MS)) return "tomorrow";
  return `on ${lagosShortDate(startsAt)}`;
}

export const sendSessionReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const soon = await ctx.db
      .query("learnSessions")
      .withIndex("by_start", (q) => q.gt("startsAt", now).lte("startsAt", now + DAY_MS))
      .take(50);
    let emails = 0;
    for (const session of soon) {
      const untilStart = session.startsAt - now;
      const kind =
        untilStart <= 70 * 60 * 1000 && !session.remindedHourAt
          ? "hour"
          : untilStart > 3 * HOUR_MS && !session.remindedDayAt && !session.remindedHourAt
            ? "day"
            : null;
      if (!kind) continue;
      await ctx.db.patch(session._id, kind === "hour" ? { remindedHourAt: now, remindedDayAt: session.remindedDayAt ?? now } : { remindedDayAt: now });

      const cohort = await ctx.db.get(session.cohortId);
      if (!cohort) continue;
      const paid = await ctx.db
        .query("learnRegistrations")
        .withIndex("by_cohort_status", (q) => q.eq("cohortId", cohort._id).eq("status", "paid"))
        .take(1000);
      const name = session.title ?? `${cohort.cohortLabel} live session`;
      const when = `${dayWord(session.startsAt, now)} at ${lagosTime(session.startsAt)}`;
      for (const registration of paid) {
        await ctx.scheduler.runAfter(emails * 1500, internal.actions.emails.sendPatientCareEmail.sendPatientCareEmail, {
          to: registration.email,
          subject: kind === "hour" ? `Starting soon: ${name}` : `${name}, ${when}`,
          greetingName: registration.firstName,
          heading: kind === "hour" ? "Your live session starts in an hour" : `Live session ${when}`,
          paragraphs: [
            `${name} runs ${when} (Lagos time), until ${lagosTime(session.endsAt)}.`,
            "Join from your course page: the button turns green 15 minutes before it starts, and the link there is always the current one.",
          ],
          buttonLabel: "Open my course",
          buttonUrl: appLink("/learn/course"),
          footnote: LEARN_FOOTNOTE,
        });
        emails++;
      }
    }
    return { emails };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin: assessment, learner progress and certificates
// ─────────────────────────────────────────────────────────────────────────────

export const adminAssessment = query({
  args: { cohortId: v.id("learnCohorts") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const assessment = await cohortAssessment(ctx, args.cohortId);
    const attempts = assessment
      ? await ctx.db
          .query("learnAttempts")
          .withIndex("by_cohort", (q) => q.eq("cohortId", args.cohortId))
          .take(2000)
      : [];
    return assessment
      ? {
          status: assessment.status,
          passMark: assessment.passMark,
          maxAttempts: assessment.maxAttempts,
          minSessions: assessment.minSessions,
          signatoryName: assessment.signatoryName ?? "",
          signatoryTitle: assessment.signatoryTitle ?? "",
          questions: assessment.questions.map((q) => ({ ...q, explanation: q.explanation ?? "" })),
          attempts: attempts.length,
          updatedAt: assessment.updatedAt,
        }
      : null;
  },
});

export const adminSaveAssessment = mutation({
  args: {
    cohortId: v.id("learnCohorts"),
    status: v.union(v.literal("draft"), v.literal("open"), v.literal("closed")),
    passMark: v.number(),
    maxAttempts: v.number(),
    minSessions: v.number(),
    signatoryName: v.optional(v.string()),
    signatoryTitle: v.optional(v.string()),
    questions: v.array(
      v.object({
        id: v.optional(v.string()),
        prompt: v.string(),
        options: v.array(v.string()),
        answer: v.number(),
        explanation: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx);
    const cohort = await ctx.db.get(args.cohortId);
    if (!cohort) throw new ConvexError("Cohort not found.");
    if (!Number.isInteger(args.passMark) || args.passMark < 1 || args.passMark > 100) throw new ConvexError("Set a pass mark between 1% and 100%.");
    if (!Number.isInteger(args.maxAttempts) || args.maxAttempts < 1 || args.maxAttempts > 10) throw new ConvexError("Allow between 1 and 10 attempts.");
    if (!Number.isInteger(args.minSessions) || args.minSessions < 0 || args.minSessions > 50) throw new ConvexError("Set the sessions to attend between 0 and 50.");
    if (args.questions.length > 60) throw new ConvexError("Add at most 60 questions.");

    const existing = await cohortAssessment(ctx, cohort._id);
    const questions = args.questions.map((q, i) => {
      const prompt = clean(q.prompt, 600);
      if (!prompt) throw new ConvexError(`Question ${i + 1} needs a question.`);
      const options = q.options.map((o) => clean(o, 240));
      if (options.length < 2 || options.length > 6) throw new ConvexError(`Question ${i + 1} needs 2 to 6 answers.`);
      if (options.some((o) => !o)) throw new ConvexError(`Question ${i + 1} has an empty answer.`);
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= options.length) {
        throw new ConvexError(`Choose the correct answer for question ${i + 1}.`);
      }
      return {
        id: clean(q.id, 40) || `q${Date.now().toString(36)}${i}`,
        prompt,
        options,
        answer: q.answer,
        explanation: clean(q.explanation, 600) || undefined,
      };
    });
    if (args.status === "open" && questions.length === 0) throw new ConvexError("Add at least one question before opening the assessment.");
    if (existing && existing.questions.length !== questions.length) {
      const taken = await ctx.db
        .query("learnAttempts")
        .withIndex("by_cohort", (q) => q.eq("cohortId", cohort._id))
        .first();
      // Answers are stored by position, so the questions can't change shape once people have sat it
      if (taken) {
        throw new ConvexError("Physios have already taken this assessment, so you can't add or remove questions. You can still fix wording.");
      }
    }

    const now = Date.now();
    const fields = {
      status: args.status,
      passMark: args.passMark,
      maxAttempts: args.maxAttempts,
      minSessions: args.minSessions,
      signatoryName: clean(args.signatoryName, 80) || undefined,
      signatoryTitle: clean(args.signatoryTitle, 80) || undefined,
      questions,
      updatedBy: user._id,
      updatedAt: now,
    };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("learnAssessments", { cohortId: cohort._id, ...fields, createdAt: now });
  },
});

/** Every paid physio's attendance, assessment and certificate, for the admin's Learners list. */
export const adminLearnerProgress = query({
  args: { cohortId: v.id("learnCohorts") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const assessment = await cohortAssessment(ctx, args.cohortId);
    const sessions = await cohortSessions(ctx, args.cohortId);
    const sessionIds = new Set(sessions.map((s) => s._id));
    const paid = await ctx.db
      .query("learnRegistrations")
      .withIndex("by_cohort_status", (q) => q.eq("cohortId", args.cohortId).eq("status", "paid"))
      .take(1000);
    const rows = [];
    for (const r of paid) {
      const attempts = await registrationAttempts(ctx, r._id);
      rows.push({
        registrationId: r._id,
        name: `${r.firstName} ${r.lastName}`.trim(),
        email: r.email,
        track: TRACK_LABEL[r.track],
        attendedSessionIds: (r.attendedSessionIds ?? []).filter((id) => sessionIds.has(id)),
        weeksDone: (r.weeksDone ?? []).length,
        attempts: attempts.length,
        bestScore: attempts.length ? Math.max(...attempts.map((a) => a.scorePct)) : null,
        passed: attempts.some((a) => a.passed),
        certificate: r.certificateCode
          ? {
              code: r.certificateCode,
              name: r.certificateName ?? `${r.firstName} ${r.lastName}`,
              issuedAt: r.certificateIssuedAt ?? null,
              revoked: Boolean(r.certificateRevokedAt),
            }
          : null,
      });
    }
    return {
      minSessions: Math.min(assessment?.minSessions ?? 0, sessions.length),
      sessions: sessions.map((s) => ({ id: s._id, label: lagosDateTime(s.startsAt), title: s.title ?? null, past: s.endsAt < Date.now() })),
      learners: rows.sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});

export const adminSetAttendance = mutation({
  args: { registrationId: v.id("learnRegistrations"), sessionId: v.id("learnSessions"), attended: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const registration = await ctx.db.get(args.registrationId);
    const session = await ctx.db.get(args.sessionId);
    if (!registration || !session || session.cohortId !== registration.cohortId) throw new ConvexError("Session not found.");
    const current = (registration.attendedSessionIds ?? []).filter((id) => id !== session._id);
    await ctx.db.patch(registration._id, {
      attendedSessionIds: args.attended ? [...current, session._id] : current,
      updatedAt: Date.now(),
    });
  },
});

/** Issue (or correct the name on) a certificate, whatever the physio's progress. */
export const adminIssueCertificate = mutation({
  args: { registrationId: v.id("learnRegistrations"), name: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const registration = await ctx.db.get(args.registrationId);
    if (!registration || registration.status !== "paid") throw new ConvexError("Only paid registrations get a certificate.");
    const keep = registration.certificateCode && !registration.certificateRevokedAt;
    const now = Date.now();
    await ctx.db.patch(registration._id, {
      certificateCode: keep ? registration.certificateCode : await newCertificateCode(ctx),
      certificateName: certificateName(args.name),
      certificateIssuedAt: keep ? registration.certificateIssuedAt ?? now : now,
      certificateRevokedAt: undefined,
      updatedAt: now,
    });
  },
});

export const adminRevokeCertificate = mutation({
  args: { registrationId: v.id("learnRegistrations") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const registration = await ctx.db.get(args.registrationId);
    if (!registration?.certificateCode) return;
    await ctx.db.patch(registration._id, { certificateRevokedAt: Date.now(), updatedAt: Date.now() });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Video courses: on-demand lessons for paid learners
//
// Admins upload straight from the browser to ImageKit (signed upload, private file). Learners
// only ever get a signed playback link that expires, created on request after the same access
// check as the rest of the course, so a shared link stops working.
// ─────────────────────────────────────────────────────────────────────────────

const VIDEO_FOLDER = "/learn/videos";
const POSTER_FOLDER = "/learn/posters";
const COVER_FOLDER = "/learn/covers";
// ImageKit's free plan caps a video file at 100 MB; the admin page checks this before uploading
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const PLAYBACK_LINK_MS = 6 * HOUR_MS;

const videoValidator = v.object({
  fileId: v.string(),
  filePath: v.string(),
  url: v.string(),
  sizeBytes: v.number(),
  durationSec: v.number(),
  posterUrl: v.optional(v.string()),
  posterFileId: v.optional(v.string()),
});

const youtubeValidator = v.object({ videoId: v.string(), durationSec: v.number(), thumbnailUrl: v.string() });

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** A lesson's length and picture, and its YouTube id when it plays from YouTube. */
function lessonMedia(lesson: Doc<"learnVideoLessons">) {
  if (lesson.youtube) {
    return { durationSec: lesson.youtube.durationSec, posterUrl: lesson.youtube.thumbnailUrl, youtubeId: lesson.youtube.videoId };
  }
  return { durationSec: lesson.video?.durationSec ?? 0, posterUrl: lesson.video?.posterUrl ?? null, youtubeId: null };
}

/** The ImageKit files behind a lesson (none for YouTube lessons), for clean-up. */
const lessonFiles = (lesson: Doc<"learnVideoLessons">) => [lesson.video?.fileId, lesson.video?.posterFileId];

/** The video id in any YouTube link (watch, youtu.be, shorts, embed, live), or null. */
function youtubeIdFrom(link: string): string | null {
  const text = link.trim();
  if (YOUTUBE_ID.test(text)) return text;
  let url: URL;
  try {
    url = new URL(text.startsWith("http") ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/)?.[1] ?? null;
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/** Like `clean`, but keeps line breaks (descriptions). */
const cleanText = (value: string | undefined | null, max: number) =>
  (value ?? "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);

type VideoViewer = { email: string; userId?: Id<"users">; isAdmin: boolean; isMskLearner: boolean };

/**
 * Who is watching (null when signed out). Progress is kept by email: a paid MSK learner's
 * registration email (as before), otherwise the account's email.
 */
async function videoViewer(ctx: Ctx): Promise<VideoViewer | null> {
  const viewer = await getViewer(ctx);
  if (!viewer) return null;
  const courses = await paidLearnRegistrations(ctx, viewer.user, await verifiedIdentityEmail(ctx));
  const open = courses.find((c) => learnerAccessOpen(c.cohort));
  const email = (open?.registration.email ?? viewer.user?.email ?? (viewer.user ? `user-${viewer.user._id}` : "")).toLowerCase();
  if (!email) return null;
  return { email, userId: viewer.user?._id, isAdmin: viewer.isAdmin, isMskLearner: Boolean(open) };
}

const courseAccessType = (course: Doc<"learnVideoCourses">) => course.access ?? "msk";

async function activeEnrollment(ctx: Ctx, userId: Id<"users">, courseId: Id<"learnVideoCourses">) {
  const row = await ctx.db
    .query("learnCourseEnrollments")
    .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId))
    .first();
  return row?.status === "active" ? row : null;
}

/** Admins can always watch (to preview); MSK courses need an open MSK seat; others an enrolment. */
async function canWatchCourse(ctx: Ctx, viewer: VideoViewer, course: Doc<"learnVideoCourses">) {
  if (viewer.isAdmin) return true;
  if (courseAccessType(course) === "msk") return viewer.isMskLearner;
  return Boolean(viewer.userId && (await activeEnrollment(ctx, viewer.userId, course._id)));
}

/** The viewer when they may watch this course, else null. */
async function videoLearnerFor(ctx: Ctx, course: Doc<"learnVideoCourses"> | null) {
  const viewer = await videoViewer(ctx);
  if (!viewer || !course || !(await canWatchCourse(ctx, viewer, course))) return null;
  return viewer;
}

async function courseLessons(ctx: Ctx, courseId: Id<"learnVideoCourses">) {
  return await ctx.db
    .query("learnVideoLessons")
    .withIndex("by_course_order", (q) => q.eq("courseId", courseId))
    .take(200);
}

async function videoProgressRow(ctx: Ctx, email: string, courseId: Id<"learnVideoCourses">) {
  return await ctx.db
    .query("learnVideoProgress")
    .withIndex("by_email_course", (q) => q.eq("email", email).eq("courseId", courseId))
    .first();
}

function lessonView(lesson: Doc<"learnVideoLessons">, done: Set<string>) {
  const media = lessonMedia(lesson);
  return {
    id: lesson._id,
    title: lesson.title,
    description: lesson.description ?? null,
    durationSec: media.durationSec,
    posterUrl: media.posterUrl,
    // YouTube lessons play in YouTube's privacy-enhanced player; the rest through signed links
    youtubeId: media.youtubeId,
    done: done.has(lesson._id),
  };
}

/** How far the learner is, and the lesson to resume: the unfinished one they were in, else the next undone one. */
function progressSummary(row: Doc<"learnVideoProgress"> | null, lessons: Doc<"learnVideoLessons">[]) {
  const done = new Set<string>(row?.completedLessonIds ?? []);
  const completed = lessons.filter((l) => done.has(l._id)).length;
  const lastIndex = row?.lastLessonId ? lessons.findIndex((l) => l._id === row.lastLessonId) : -1;
  let index = lastIndex >= 0 && !done.has(lessons[lastIndex]._id) ? lastIndex : -1;
  if (index < 0) {
    const after = lessons.findIndex((l, i) => i > lastIndex && !done.has(l._id));
    index = after >= 0 ? after : lessons.findIndex((l) => !done.has(l._id));
  }
  if (index < 0) index = 0;
  const lesson = lessons[index];
  return {
    started: Boolean(row),
    completed,
    total: lessons.length,
    isComplete: lessons.length > 0 && completed === lessons.length,
    updatedAt: row?.updatedAt ?? null,
    resume: lesson
      ? {
          lessonId: lesson._id,
          number: index + 1,
          title: lesson.title,
          durationSec: lessonMedia(lesson).durationSec,
          positionSec: index === lastIndex ? (row?.lastPositionSec ?? 0) : 0,
        }
      : null,
  };
}

function courseCard(course: Doc<"learnVideoCourses">, lessons: Doc<"learnVideoLessons">[], row: Doc<"learnVideoProgress"> | null) {
  return {
    id: course._id,
    title: course.title,
    summary: course.summary,
    benefits: course.benefits,
    // No cover uploaded: the first lesson's picture (a YouTube lesson brings its own thumbnail)
    coverUrl: course.coverUrl ?? lessons.map((l) => lessonMedia(l).posterUrl).find(Boolean) ?? null,
    lessonCount: lessons.length,
    durationSec: lessons.reduce((sum, l) => sum + lessonMedia(l).durationSec, 0),
    learnerCount: course.learnerCount,
    progress: progressSummary(row, lessons),
  };
}

/** The learner's course library: published courses with lessons, and the one to resume. */
export const getVideoLibrary = query({
  args: {},
  handler: async (ctx) => {
    const learner = await videoViewer(ctx);
    if (!learner) return { state: "no_access" as const };
    const courses = await ctx.db
      .query("learnVideoCourses")
      .withIndex("by_status_order", (q) => q.eq("status", "published"))
      .take(100);
    const cards = [];
    // Free and paid courses this learner hasn't enrolled in yet (shown as "More courses")
    const available: { id: Id<"learnVideoCourses">; title: string; access: "free" | "paid" }[] = [];
    for (const course of courses) {
      const lessons = await courseLessons(ctx, course._id);
      if (lessons.length === 0) continue;
      if (await canWatchCourse(ctx, learner, course)) {
        cards.push(courseCard(course, lessons, await videoProgressRow(ctx, learner.email, course._id)));
      } else if (courseAccessType(course) !== "msk") {
        available.push({ id: course._id, title: course.title, access: courseAccessType(course) as "free" | "paid" });
      }
    }
    if (cards.length === 0 && available.length === 0 && !learner.isMskLearner) return { state: "no_access" as const };
    const resume = cards
      .filter((c) => c.progress.started && !c.progress.isComplete)
      .sort((a, b) => (b.progress.updatedAt ?? 0) - (a.progress.updatedAt ?? 0))[0];
    return { state: "ok" as const, courses: cards, available, resumeCourseId: resume?.id ?? null };
  },
});

/** One course with its lessons, for the course page and the player. */
export const getVideoCourse = query({
  args: { courseId: v.id("learnVideoCourses") },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    const learner = await videoLearnerFor(ctx, course);
    if (!learner || !course || (course.status !== "published" && !learner.isAdmin)) return null;
    const lessons = await courseLessons(ctx, course._id);
    const row = await videoProgressRow(ctx, learner.email, course._id);
    const done = new Set<string>(row?.completedLessonIds ?? []);
    return { ...courseCard(course, lessons, row), lessons: lessons.map((l) => lessonView(l, done)) };
  },
});

export const lessonForPlayback = internalQuery({
  args: { lessonId: v.id("learnVideoLessons") },
  handler: async (ctx, args) => {
    const lesson = await ctx.db.get(args.lessonId);
    const course = lesson ? await ctx.db.get(lesson.courseId) : null;
    const learner = await videoLearnerFor(ctx, course);
    if (!learner) throw new ConvexError("Your course access has ended.");
    if (!lesson || !course || (course.status !== "published" && !learner.isAdmin)) {
      throw new ConvexError("This lesson isn't available.");
    }
    if (!lesson.video) throw new ConvexError("This lesson plays from YouTube.");
    return { url: lesson.video.url, filePath: lesson.video.filePath };
  },
});

/** A playback link for one lesson, valid for a few hours. */
export const getLessonPlayback = action({
  args: { lessonId: v.id("learnVideoLessons") },
  handler: async (ctx, args): Promise<{ url: string; expiresAt: number }> => {
    const lesson: { url: string; filePath: string } = await ctx.runQuery(internal.learn.lessonForPlayback, {
      lessonId: args.lessonId,
    });
    const expiresAt = Date.now() + PLAYBACK_LINK_MS;
    return { url: await signedImagekitUrl(lesson.url, lesson.filePath, expiresAt), expiresAt };
  },
});

/** Where the learner is in a lesson; `completed` once they reach the end. */
export const saveLessonProgress = mutation({
  args: { lessonId: v.id("learnVideoLessons"), positionSec: v.number(), completed: v.boolean() },
  handler: async (ctx, args) => {
    const lesson = await ctx.db.get(args.lessonId);
    const course = lesson ? await ctx.db.get(lesson.courseId) : null;
    const learner = await videoLearnerFor(ctx, course);
    if (!learner) throw new ConvexError("Your course access has ended.");
    if (!lesson || !course) return { completedCourse: false };
    const now = Date.now();
    // YouTube may not have said how long a video is (0); then only the lower bound applies
    const length = lessonMedia(lesson).durationSec;
    const position = Math.max(0, length > 0 ? Math.min(Math.round(args.positionSec), Math.ceil(length)) : Math.round(args.positionSec));

    let row = await videoProgressRow(ctx, learner.email, course._id);
    if (!row) {
      const id = await ctx.db.insert("learnVideoProgress", {
        courseId: course._id,
        email: learner.email,
        userId: learner.userId,
        completedLessonIds: [],
        startedAt: now,
        updatedAt: now,
      });
      // Admins previewing a course don't count as learners
      if (!learner.isAdmin) await ctx.db.patch(course._id, { learnerCount: course.learnerCount + 1 });
      row = await ctx.db.get(id);
      if (!row) return { completedCourse: false };
    }

    const completedIds =
      args.completed && !row.completedLessonIds.includes(lesson._id) ? [...row.completedLessonIds, lesson._id] : row.completedLessonIds;
    const lessons = await courseLessons(ctx, course._id);
    const allDone = lessons.length > 0 && lessons.every((l) => completedIds.includes(l._id));
    await ctx.db.patch(row._id, {
      completedLessonIds: completedIds,
      lastLessonId: lesson._id,
      lastPositionSec: args.completed ? 0 : position,
      completedAt: allDone ? (row.completedAt ?? now) : row.completedAt,
      userId: row.userId ?? learner.userId,
      updatedAt: now,
    });
    return { completedCourse: allDone && !row.completedAt };
  },
});

// ── Admin ────────────────────────────────────────────────────────────────────

export const assertLearnAdmin = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return null;
  },
});

/** Signature for one browser upload to ImageKit. Each upload needs a fresh one. */
export const adminVideoUploadAuth = action({
  args: { kind: v.union(v.literal("video"), v.literal("poster"), v.literal("cover")) },
  handler: async (
    ctx,
    args
  ): Promise<{ token: string; expire: number; signature: string; publicKey: string; folder: string }> => {
    await ctx.runQuery(internal.learn.assertLearnAdmin, {});
    return imagekitUploadAuth(args.kind === "video" ? VIDEO_FOLDER : args.kind === "poster" ? POSTER_FOLDER : COVER_FOLDER);
  },
});

/** Removes replaced or deleted files from ImageKit so they stop using storage. */
export const deleteImagekitFiles = internalAction({
  args: { fileIds: v.array(v.string()) },
  handler: async (_ctx, args) => {
    const key = process.env.IMAGEKIT_PRIVATE_KEY;
    if (!key) return;
    for (const fileId of args.fileIds) {
      const res = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`, {
        method: "DELETE",
        headers: { Authorization: `Basic ${btoa(`${key}:`)}` },
      });
      // 404 means it's already gone; anything else is left for a manual clean-up, never retried
      if (!res.ok && res.status !== 404) console.warn(`ImageKit delete failed (${res.status})`);
    }
  },
});

const removeFilesLater = removeImagekitFilesLater;

function assertImagekitUrl(url: string | undefined, label: string) {
  if (url && !IMAGEKIT_URL.test(url)) throw new ConvexError(`${label} must be an ImageKit link.`);
}

/** Every course with its lessons and numbers, for the admin page. */
export const adminVideoCourses = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const courses = await ctx.db.query("learnVideoCourses").take(200);
    const rows = [];
    for (const course of courses) {
      const lessons = await courseLessons(ctx, course._id);
      const progress = await ctx.db
        .query("learnVideoProgress")
        .withIndex("by_course", (q) => q.eq("courseId", course._id))
        .take(5000);
      rows.push({
        id: course._id,
        title: course.title,
        summary: course.summary,
        benefits: course.benefits,
        coverUrl: course.coverUrl ?? null,
        coverFileId: course.coverFileId ?? null,
        status: course.status,
        order: course.order,
        access: courseAccessType(course),
        rehabifyPrice: course.rehabifyPriceKobo !== undefined ? course.rehabifyPriceKobo / 100 : null,
        externalPrice: course.externalPriceKobo !== undefined ? course.externalPriceKobo / 100 : null,
        enrolledCount: course.enrolledCount ?? 0,
        learnerCount: course.learnerCount,
        completedCount: progress.filter((p) => p.completedAt).length,
        lessonCount: lessons.length,
        durationSec: lessons.reduce((sum, l) => sum + lessonMedia(l).durationSec, 0),
        // The cover learners see: the uploaded one, or the first lesson's picture
        shownCoverUrl: course.coverUrl ?? lessons.map((l) => lessonMedia(l).posterUrl).find(Boolean) ?? null,
        updatedAt: course.updatedAt,
        lessons: lessons.map((l) => ({
          id: l._id,
          title: l.title,
          description: l.description ?? null,
          durationSec: lessonMedia(l).durationSec,
          sizeBytes: l.video?.sizeBytes ?? 0,
          posterUrl: lessonMedia(l).posterUrl,
          youtubeId: lessonMedia(l).youtubeId,
        })),
      });
    }
    return rows.sort((a, b) => a.order - b.order);
  },
});

export const adminSaveVideoCourse = mutation({
  args: {
    courseId: v.optional(v.id("learnVideoCourses")),
    title: v.string(),
    summary: v.string(),
    benefits: v.array(v.string()),
    coverUrl: v.optional(v.string()),
    coverFileId: v.optional(v.string()),
    // Who can watch, and the two prices in naira for a paid course
    access: v.optional(v.union(v.literal("msk"), v.literal("free"), v.literal("paid"))),
    rehabifyPrice: v.optional(v.number()),
    externalPrice: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx);
    const access = args.access ?? "msk";
    const toKobo = (naira: number | undefined) =>
      typeof naira === "number" && Number.isFinite(naira) && naira > 0 ? Math.round(naira * 100) : undefined;
    const rehabifyPriceKobo = access === "paid" ? toKobo(args.rehabifyPrice) : undefined;
    const externalPriceKobo = access === "paid" ? toKobo(args.externalPrice) : undefined;
    if (access === "paid" && (!rehabifyPriceKobo || !externalPriceKobo)) {
      throw new ConvexError("A paid course needs both prices: the Rehabify physiotherapist rate and the external rate.");
    }
    const title = clean(args.title, 120);
    const summary = cleanText(args.summary, 600);
    const benefits = args.benefits.map((b) => clean(b, 160)).filter(Boolean).slice(0, 12);
    if (!title) throw new ConvexError("Give the course a title.");
    if (!summary) throw new ConvexError("Add a short description.");
    if (benefits.length === 0) throw new ConvexError("Add at least one thing learners will get from it.");
    assertImagekitUrl(args.coverUrl, "The cover image");
    const now = Date.now();

    if (args.courseId) {
      const course = await ctx.db.get(args.courseId);
      if (!course) throw new ConvexError("Course not found.");
      if (course.coverFileId && course.coverFileId !== args.coverFileId) await removeFilesLater(ctx, [course.coverFileId]);
      await ctx.db.patch(course._id, {
        title,
        summary,
        benefits,
        coverUrl: args.coverUrl,
        coverFileId: args.coverFileId,
        access,
        rehabifyPriceKobo,
        externalPriceKobo,
        updatedBy: user._id,
        updatedAt: now,
      });
      return course._id;
    }

    const last = (await ctx.db.query("learnVideoCourses").take(200)).reduce((max, c) => Math.max(max, c.order), 0);
    return await ctx.db.insert("learnVideoCourses", {
      title,
      summary,
      benefits,
      coverUrl: args.coverUrl,
      coverFileId: args.coverFileId,
      access,
      rehabifyPriceKobo,
      externalPriceKobo,
      status: "draft",
      order: last + 1,
      learnerCount: 0,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const adminSetVideoCourseStatus = mutation({
  args: { courseId: v.id("learnVideoCourses"), status: v.union(v.literal("draft"), v.literal("published")) },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new ConvexError("Course not found.");
    if (args.status === "published" && (await courseLessons(ctx, course._id)).length === 0) {
      throw new ConvexError("Add at least one lesson before publishing.");
    }
    // A course made from a YouTube link starts without these
    if (args.status === "published" && (!course.summary.trim() || course.benefits.length === 0)) {
      throw new ConvexError("Add a description and what learners will get (Edit course) before publishing.");
    }
    await ctx.db.patch(course._id, {
      status: args.status,
      publishedAt: args.status === "published" ? (course.publishedAt ?? Date.now()) : course.publishedAt,
      updatedBy: user._id,
      updatedAt: Date.now(),
    });
  },
});

export const adminMoveVideoCourse = mutation({
  args: { courseId: v.id("learnVideoCourses"), direction: v.union(v.literal("up"), v.literal("down")) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const courses = (await ctx.db.query("learnVideoCourses").take(200)).sort((a, b) => a.order - b.order);
    const i = courses.findIndex((c) => c._id === args.courseId);
    const j = args.direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= courses.length) return;
    await ctx.db.patch(courses[i]._id, { order: courses[j].order });
    await ctx.db.patch(courses[j]._id, { order: courses[i].order });
  },
});

export const adminDeleteVideoCourse = mutation({
  args: { courseId: v.id("learnVideoCourses") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!course) return;
    if (course.status === "published") throw new ConvexError("Unpublish the course before deleting it.");
    const lessons = await courseLessons(ctx, course._id);
    const files = [course.coverFileId, ...lessons.flatMap(lessonFiles)];
    for (const lesson of lessons) await ctx.db.delete(lesson._id);
    const progress = await ctx.db
      .query("learnVideoProgress")
      .withIndex("by_course", (q) => q.eq("courseId", course._id))
      .take(5000);
    for (const row of progress) await ctx.db.delete(row._id);
    await ctx.db.delete(course._id);
    await removeFilesLater(ctx, files);
  },
});

/** A YouTube video as a lesson keeps only its id, length and YouTube's own thumbnail. */
function checkYoutube(youtube: { videoId: string; durationSec: number; thumbnailUrl: string }) {
  if (!YOUTUBE_ID.test(youtube.videoId)) throw new ConvexError("That isn't a YouTube video link.");
  if (!youtube.thumbnailUrl.startsWith(`https://i.ytimg.com/vi/${youtube.videoId}/`)) {
    throw new ConvexError("The thumbnail must be the video's own YouTube thumbnail.");
  }
  if (!(youtube.durationSec >= 0 && youtube.durationSec <= 24 * 3600)) throw new ConvexError("That video's length doesn't look right.");
  return { videoId: youtube.videoId, durationSec: Math.round(youtube.durationSec), thumbnailUrl: youtube.thumbnailUrl };
}

/**
 * Add a lesson or change one. It plays from an uploaded video or a YouTube video; sending one
 * replaces the other (an uploaded file it replaces is removed).
 */
export const adminSaveVideoLesson = mutation({
  args: {
    courseId: v.id("learnVideoCourses"),
    lessonId: v.optional(v.id("learnVideoLessons")),
    title: v.string(),
    description: v.optional(v.string()),
    video: v.optional(videoValidator),
    youtube: v.optional(youtubeValidator),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new ConvexError("Course not found.");
    const title = clean(args.title, 140);
    if (!title) throw new ConvexError("Give the lesson a title.");
    const description = cleanText(args.description, 1500) || undefined;
    if (args.video && args.youtube) throw new ConvexError("Choose either an uploaded video or a YouTube link, not both.");
    if (args.video) {
      assertImagekitUrl(args.video.url, "The video");
      assertImagekitUrl(args.video.posterUrl, "The poster");
      if (args.video.sizeBytes > MAX_VIDEO_BYTES) throw new ConvexError("Videos must be 100 MB or smaller.");
      if (!(args.video.durationSec > 0)) throw new ConvexError("We couldn't read the video's length. Try another file.");
    }
    const youtube = args.youtube ? checkYoutube(args.youtube) : undefined;
    const now = Date.now();
    await ctx.db.patch(course._id, { updatedAt: now });

    if (args.lessonId) {
      const lesson = await ctx.db.get(args.lessonId);
      if (!lesson || lesson.courseId !== course._id) throw new ConvexError("Lesson not found.");
      const media = args.video ? { video: args.video, youtube: undefined } : youtube ? { video: undefined, youtube } : {};
      // A new upload, or a switch to YouTube, retires the old file
      if (lesson.video && (youtube || (args.video && args.video.fileId !== lesson.video.fileId))) {
        await removeFilesLater(ctx, lessonFiles(lesson));
      }
      await ctx.db.patch(lesson._id, { title, description, ...media, updatedAt: now });
      return lesson._id;
    }

    if (!args.video && !youtube) throw new ConvexError("Upload the lesson video or paste a YouTube link.");
    const last = (await courseLessons(ctx, course._id)).reduce((max, l) => Math.max(max, l.order), 0);
    return await ctx.db.insert("learnVideoLessons", {
      courseId: course._id,
      order: last + 1,
      title,
      description,
      ...(args.video ? { video: args.video } : { youtube }),
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * What YouTube says about a video link: its title, channel, length and best thumbnail. The video
 * must allow playing on other sites, since lessons play inside Rehabify.
 */
export const adminYoutubeInfo = action({
  args: { link: v.string() },
  handler: async (
    ctx,
    args
  ): Promise<{ videoId: string; title: string; channel: string; durationSec: number; thumbnailUrl: string; description: string }> => {
    await ctx.runQuery(internal.learn.assertLearnAdmin, {});
    const videoId = youtubeIdFrom(args.link);
    if (!videoId) throw new ConvexError("Paste a YouTube video link, like https://youtu.be/…");
    const watch = `https://www.youtube.com/watch?v=${videoId}`;

    const oembed = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`);
    if (oembed.status === 401 || oembed.status === 403) {
      throw new ConvexError("This video can't be played on other sites. Turn on embedding for it in YouTube, or choose another.");
    }
    if (!oembed.ok) throw new ConvexError("We couldn't find that video. Check it's public or unlisted, not private.");
    const info = (await oembed.json()) as { title?: string; author_name?: string };

    // The largest thumbnail YouTube made for it (HD videos have maxres)
    let thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    try {
      const maxres = await fetch(`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, { method: "HEAD" });
      if (maxres.ok) thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
    } catch {
      // keep hqdefault
    }

    // Length and description from the watch page; best effort (0 and "" when YouTube doesn't say)
    let durationSec = 0;
    let description = "";
    try {
      const page = await (await fetch(watch, { headers: { "Accept-Language": "en-GB,en;q=0.9" } })).text();
      durationSec = Number(page.match(/"lengthSeconds":"(\d+)"/)?.[1] ?? 0) || 0;
      const raw = page.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/)?.[1];
      if (raw) description = (JSON.parse(`"${raw}"`) as string).slice(0, 600);
    } catch {
      // the lesson still works without them
    }

    return {
      videoId,
      title: clean(info.title ?? "", 140),
      channel: clean(info.author_name ?? "", 120),
      durationSec,
      thumbnailUrl,
      description: cleanText(description, 600),
    };
  },
});

/** A new draft course made from one YouTube video, which becomes its first lesson. */
export const adminCreateCourseFromYoutube = mutation({
  args: { title: v.string(), summary: v.optional(v.string()), youtube: youtubeValidator },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx);
    const title = clean(args.title, 120);
    if (!title) throw new ConvexError("Give the course a title.");
    const youtube = checkYoutube(args.youtube);
    const now = Date.now();
    const last = (await ctx.db.query("learnVideoCourses").take(200)).reduce((max, c) => Math.max(max, c.order), 0);
    const courseId = await ctx.db.insert("learnVideoCourses", {
      title,
      summary: cleanText(args.summary, 600),
      benefits: [],
      status: "draft",
      order: last + 1,
      learnerCount: 0,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("learnVideoLessons", { courseId, order: 1, title: clean(args.title, 140), youtube, createdAt: now, updatedAt: now });
    return courseId;
  },
});

export const adminMoveVideoLesson = mutation({
  args: { lessonId: v.id("learnVideoLessons"), direction: v.union(v.literal("up"), v.literal("down")) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) return;
    const lessons = await courseLessons(ctx, lesson.courseId);
    const i = lessons.findIndex((l) => l._id === lesson._id);
    const j = args.direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= lessons.length) return;
    await ctx.db.patch(lessons[i]._id, { order: lessons[j].order });
    await ctx.db.patch(lessons[j]._id, { order: lessons[i].order });
  },
});

export const adminDeleteVideoLesson = mutation({
  args: { lessonId: v.id("learnVideoLessons") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) return;
    const course = await ctx.db.get(lesson.courseId);
    const lessons = await courseLessons(ctx, lesson.courseId);
    if (course?.status === "published" && lessons.length === 1) {
      throw new ConvexError("A published course needs at least one lesson. Unpublish it first.");
    }
    await ctx.db.delete(lesson._id);
    await removeFilesLater(ctx, lessonFiles(lesson));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Course enrolment (Nov 2026): free and paid video courses
//
// One Rehabify login covers every course. A free course enrols in one tap; a paid one goes
// through Paystack (reference LEARNC_<enrollmentId>_<timestamp>) at the Rehabify physiotherapist
// rate or the external rate, like the MSK program. Courses with access "msk" stay included for
// paid MSK learners. The webhook (recordCoursePaystackWebhook) and the return page
// (verifyCoursePayment) both complete the enrolment; whichever is first wins.
// ─────────────────────────────────────────────────────────────────────────────

const COURSE_REFERENCE = /^LEARNC_([a-z0-9]+)_\d+$/;
const MAX_COURSE_CHECKOUTS_PER_HOUR = 6;

type CourseOffer = {
  id: Id<"learnVideoCourses">;
  title: string;
  summary: string;
  benefits: string[];
  coverUrl: string | null;
  lessonCount: number;
  durationSec: number;
  access: "msk" | "free" | "paid";
  prices: { rehabify: number; external: number } | null;
  viewer: {
    signedIn: boolean;
    canWatch: boolean;
    enrolment: "none" | "pending" | "active" | "refunded" | "cancelled";
    rehabifyRate: boolean;
    priceToPay: number | null;
  };
};

async function courseOffer(ctx: Ctx, course: Doc<"learnVideoCourses">, lessons: Doc<"learnVideoLessons">[]): Promise<CourseOffer> {
  const viewer = await getViewer(ctx);
  const watcher = await videoViewer(ctx);
  const access = courseAccessType(course);
  const row = viewer?.user
    ? await ctx.db
        .query("learnCourseEnrollments")
        .withIndex("by_user_course", (q) => q.eq("userId", viewer.user!._id).eq("courseId", course._id))
        .first()
    : null;
  const rehabifyRate = Boolean(viewer?.user && (await isRehabifyPhysio(ctx, viewer.user)));
  const prices =
    access === "paid" && course.rehabifyPriceKobo && course.externalPriceKobo
      ? { rehabify: course.rehabifyPriceKobo / 100, external: course.externalPriceKobo / 100 }
      : null;
  return {
    id: course._id,
    title: course.title,
    summary: course.summary,
    benefits: course.benefits,
    coverUrl: course.coverUrl ?? lessons.map((l) => lessonMedia(l).posterUrl).find(Boolean) ?? null,
    lessonCount: lessons.length,
    durationSec: lessons.reduce((sum, l) => sum + lessonMedia(l).durationSec, 0),
    access,
    prices,
    viewer: {
      signedIn: Boolean(viewer?.user),
      canWatch: Boolean(watcher && (await canWatchCourse(ctx, watcher, course))),
      enrolment: row?.status ?? "none",
      rehabifyRate,
      priceToPay: prices ? (rehabifyRate ? prices.rehabify : prices.external) : null,
    },
  };
}

/** Every published course with lessons, for /learn/courses (public; signed-in viewers see their state). */
export const getCourseCatalog = query({
  args: {},
  handler: async (ctx): Promise<CourseOffer[]> => {
    const courses = await ctx.db
      .query("learnVideoCourses")
      .withIndex("by_status_order", (q) => q.eq("status", "published"))
      .take(100);
    const offers: CourseOffer[] = [];
    for (const course of courses) {
      const lessons = await courseLessons(ctx, course._id);
      if (lessons.length === 0) continue;
      offers.push(await courseOffer(ctx, course, lessons));
    }
    return offers;
  },
});

/** One course's page: what it covers, its lessons (titles only) and how to get it. */
export const getCourseOfferPage = query({
  args: { courseId: v.string() },
  handler: async (ctx, args) => {
    const courseId = ctx.db.normalizeId("learnVideoCourses", args.courseId);
    const course = courseId ? await ctx.db.get(courseId) : null;
    if (!course || course.status !== "published") return null;
    const lessons = await courseLessons(ctx, course._id);
    if (lessons.length === 0) return null;
    return {
      ...(await courseOffer(ctx, course, lessons)),
      lessons: lessons.map((l) => ({ id: l._id, title: l.title, durationSec: lessonMedia(l).durationSec })),
    };
  },
});

async function enrolmentLearner(ctx: Ctx) {
  const viewer = await getViewer(ctx);
  if (!viewer?.user) throw new ConvexError("Please sign in to enrol.");
  const email = (viewer.user.email ?? "").trim().toLowerCase();
  if (!email || isJoyLoginEmail(email)) {
    throw new ConvexError("Add your email address in your account settings first, so we can send your course details.");
  }
  return { user: viewer.user, email };
}

async function publishedCourse(ctx: Ctx, courseId: Id<"learnVideoCourses">) {
  const course = await ctx.db.get(courseId);
  if (!course || course.status !== "published") throw new ConvexError("This course isn't available.");
  return course;
}

async function countEnrolment(ctx: MutationCtx, course: Doc<"learnVideoCourses">) {
  await ctx.db.patch(course._id, { enrolledCount: (course.enrolledCount ?? 0) + 1 });
}

/** One tap for a free course. */
export const enrollInFreeCourse = mutation({
  args: { courseId: v.id("learnVideoCourses") },
  handler: async (ctx, args) => {
    const { user, email } = await enrolmentLearner(ctx);
    const course = await publishedCourse(ctx, args.courseId);
    if (courseAccessType(course) !== "free") throw new ConvexError("This course isn't free.");
    const now = Date.now();
    const existing = await ctx.db
      .query("learnCourseEnrollments")
      .withIndex("by_user_course", (q) => q.eq("userId", user._id).eq("courseId", course._id))
      .first();
    if (existing?.status === "active") return { enrolled: true, alreadyEnrolled: true };
    if (existing) {
      await ctx.db.patch(existing._id, { status: "active", track: "free", amountKobo: 0, updatedAt: now });
    } else {
      await ctx.db.insert("learnCourseEnrollments", {
        courseId: course._id, userId: user._id, email, track: "free", status: "active",
        amountKobo: 0, currency: "NGN", createdAt: now, updatedAt: now,
      });
    }
    await countEnrolment(ctx, course);
    return { enrolled: true, alreadyEnrolled: false };
  },
});

/** A pending enrolment for a paid course, at the rate this learner pays. */
export const prepareCourseEnrollment = internalMutation({
  args: { courseId: v.id("learnVideoCourses") },
  handler: async (ctx, args) => {
    const { user, email } = await enrolmentLearner(ctx);
    const course = await publishedCourse(ctx, args.courseId);
    if (courseAccessType(course) !== "paid" || !course.rehabifyPriceKobo || !course.externalPriceKobo) {
      throw new ConvexError("This course can't be bought right now.");
    }
    const track: "rehabify" | "external" = (await isRehabifyPhysio(ctx, user)) ? "rehabify" : "external";
    const amountKobo = track === "rehabify" ? course.rehabifyPriceKobo : course.externalPriceKobo;
    const now = Date.now();
    const existing = await ctx.db
      .query("learnCourseEnrollments")
      .withIndex("by_user_course", (q) => q.eq("userId", user._id).eq("courseId", course._id))
      .first();
    if (existing?.status === "active") throw new ConvexError("You're already enrolled. Open the course from My courses.");
    const attempts = (existing?.attemptTimes ?? []).filter((t) => t > now - HOUR_MS);
    if (attempts.length >= MAX_COURSE_CHECKOUTS_PER_HOUR) {
      throw new ConvexError("Too many payment attempts. Please wait a little and try again.");
    }
    let enrollmentId: Id<"learnCourseEnrollments">;
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "pending", track, amountKobo, currency: "NGN", email, attemptTimes: [...attempts, now], updatedAt: now,
      });
      enrollmentId = existing._id;
    } else {
      enrollmentId = await ctx.db.insert("learnCourseEnrollments", {
        courseId: course._id, userId: user._id, email, track, status: "pending", amountKobo, currency: "NGN",
        attemptTimes: [now], createdAt: now, updatedAt: now,
      });
    }
    return { enrollmentId, amountKobo, email, track, courseTitle: course.title };
  },
});

export const recordCoursePaymentAttempt = internalMutation({
  args: { enrollmentId: v.id("learnCourseEnrollments"), reference: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.enrollmentId, { paymentReference: args.reference, updatedAt: Date.now() });
  },
});

/** Starts Paystack checkout for a paid course and returns the payment page. */
export const startCoursePayment = action({
  args: { courseId: v.id("learnVideoCourses"), returnOrigin: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ authorizationUrl: string; reference: string }> => {
    const prepared: { enrollmentId: Id<"learnCourseEnrollments">; amountKobo: number; email: string; track: "rehabify" | "external"; courseTitle: string } =
      await ctx.runMutation(internal.learn.prepareCourseEnrollment, { courseId: args.courseId });
    const origin = checkoutOrigin(args.returnOrigin);
    const reference = `LEARNC_${prepared.enrollmentId}_${Date.now()}`;
    const data = await paystackRequest("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        reference,
        amount: prepared.amountKobo,
        email: prepared.email,
        currency: "NGN",
        callback_url: `${origin}/learn/courses/${args.courseId}`,
        channels: ["card", "bank", "ussd", "bank_transfer"],
        metadata: {
          source: "rehabify_learn_course",
          courseId: args.courseId,
          enrollmentId: prepared.enrollmentId,
          track: prepared.track,
          cancel_action: `${origin}/learn/courses/${args.courseId}?cancelled=1`,
          custom_fields: [
            { display_name: "Course", variable_name: "course", value: prepared.courseTitle },
            { display_name: "Rate", variable_name: "rate", value: TRACK_LABEL[prepared.track] },
          ],
        },
      }),
    });
    const authorizationUrl = typeof data?.authorization_url === "string" ? data.authorization_url : "";
    if (!authorizationUrl.startsWith("https://")) throw new ConvexError("We couldn't start the payment. Please try again.");
    await ctx.runMutation(internal.learn.recordCoursePaymentAttempt, { enrollmentId: prepared.enrollmentId, reference });
    return { authorizationUrl, reference };
  },
});

async function completeCoursePayment(ctx: MutationCtx, reference: string, paid: PaidEvidence) {
  const match = COURSE_REFERENCE.exec(reference);
  const enrollmentId = match ? ctx.db.normalizeId("learnCourseEnrollments", match[1]) : null;
  const enrollment = enrollmentId ? await ctx.db.get(enrollmentId) : null;
  if (!enrollmentId || !enrollment) return { success: false as const, reason: "not_found" };
  const now = Date.now();
  const flag = async (action: string) => {
    const known = enrollment.extraPayments ?? [];
    if (known.some((p) => p.reference === reference)) return;
    await ctx.db.patch(enrollmentId, { extraPayments: [...known, { reference, amountKobo: paid.amountKobo, at: now }], updatedAt: now });
    await ctx.db.insert("systemLogs", {
      action, type: "learn", timestamp: now, userId: String(enrollment.userId),
      targetEntityType: "learn_course_enrollment", targetEntityId: String(enrollmentId),
      details: { reference, amountKobo: paid.amountKobo, currency: paid.currency, priceKobo: enrollment.amountKobo },
    });
  };
  if (enrollment.status === "active") {
    if (enrollment.paidReference !== reference) await flag("learn_course_duplicate_payment");
    return { success: true as const, alreadyCompleted: true };
  }
  if (paid.currency !== enrollment.currency) {
    await flag("learn_course_payment_currency_mismatch");
    return { success: false as const, reason: "currency_mismatch" };
  }
  if (!Number.isFinite(paid.amountKobo) || paid.amountKobo < enrollment.amountKobo) {
    await flag("learn_course_payment_short");
    return { success: false as const, reason: "amount_mismatch" };
  }
  await ctx.db.patch(enrollmentId, {
    status: "active", paidReference: reference, paidAmountKobo: paid.amountKobo,
    paymentChannel: paid.channel, paidAt: now, updatedAt: now,
  });
  const course = await ctx.db.get(enrollment.courseId);
  if (course) await countEnrolment(ctx, course);
  await ctx.db.insert("systemLogs", {
    action: "learn_course_paid", type: "learn", timestamp: now, userId: String(enrollment.userId),
    targetEntityType: "learn_course_enrollment", targetEntityId: String(enrollmentId),
    details: { reference, amountKobo: paid.amountKobo, track: enrollment.track, courseId: String(enrollment.courseId) },
  });
  const user = await ctx.db.get(enrollment.userId);
  if (course) {
    await ctx.scheduler.runAfter(0, internal.actions.emails.sendPatientCareEmail.sendPatientCareEmail, {
      to: enrollment.email,
      subject: `You're enrolled: ${course.title}`,
      greetingName: user?.firstName ?? undefined,
      heading: "You're enrolled",
      paragraphs: [
        `Thank you for joining ${course.title}. Your payment of ${formatNairaFromKobo(paid.amountKobo)} is confirmed, and the course is now in My courses.`,
        "Watch at your own pace; your place in each lesson is saved as you go.",
      ],
      buttonLabel: "Start the course",
      buttonUrl: appLink(`/learn/courses/${course._id}`),
      footnote: "Paystack also emails you a payment receipt.",
    });
  }
  return { success: true as const, alreadyCompleted: false };
}

export const completeCoursePaymentVerified = internalMutation({
  args: { reference: v.string(), amountKobo: v.number(), currency: v.string(), channel: v.optional(v.string()) },
  handler: (ctx, args) => completeCoursePayment(ctx, args.reference, { amountKobo: args.amountKobo, currency: args.currency, channel: args.channel }),
});

/** The return page after Paystack: checks the payment with Paystack and completes the enrolment. */
export const verifyCoursePayment = action({
  args: { reference: v.string() },
  handler: async (ctx, args): Promise<{ status: "paid" | "pending" | "failed" }> => {
    if (!COURSE_REFERENCE.test(args.reference)) return { status: "failed" };
    const transaction = await fetchPaystackTransaction(args.reference);
    if (!transaction) return { status: "pending" };
    if (transaction.status !== "success") return { status: transaction.status === "abandoned" || transaction.status === "ongoing" ? "pending" : "failed" };
    const result: { success: boolean } = await ctx.runMutation(internal.learn.completeCoursePaymentVerified, {
      reference: args.reference, amountKobo: transaction.amount, currency: transaction.currency, channel: transaction.channel,
    });
    return { status: result.success ? "paid" : "failed" };
  },
});

/** Paystack's webhook for LEARNC_ payments (app/api/webhooks/paystack forwards it here). */
export const recordCoursePaystackWebhook = mutation({
  args: { rawBody: v.string(), signature: v.string() },
  handler: async (ctx, args) => {
    if (!(await verifyPaystackSignature(args.rawBody, args.signature))) throw new Error("Invalid Paystack webhook signature");
    let payload: any;
    try {
      payload = JSON.parse(args.rawBody);
    } catch {
      throw new Error("Invalid webhook payload");
    }
    const data = payload?.data ?? {};
    const reference = typeof data.reference === "string" ? data.reference : "";
    if (!reference.startsWith("LEARNC_")) return { handled: false };
    if (payload.event !== "charge.success") return { handled: true, ignored: String(payload.event) };
    if (data.status !== undefined && data.status !== "success") return { handled: true, success: false, reason: `charge_${data.status}` };
    const result = await completeCoursePayment(ctx, reference, {
      amountKobo: Number(data.amount), currency: String(data.currency ?? ""), channel: typeof data.channel === "string" ? data.channel : undefined,
    });
    return { handled: true, ...result };
  },
});
