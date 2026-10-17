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
import { appLink, publicAppUrl } from "./helpers/appUrl";
import { getViewer, requireAdmin } from "./helpers/partnerAccess";
import { verifyPaystackSignature } from "./helpers/paystackSignature";
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

async function scheduleConfirmationEmail(ctx: MutationCtx, registrationId: Id<"learnRegistrations">) {
  const registration = await ctx.db.get(registrationId);
  if (!registration || registration.status !== "paid") return;
  const cohort = await ctx.db.get(registration.cohortId);
  if (!cohort) return;

  const paragraphs = [
    `Thank you for registering for the ${PROGRAM_TITLE}. We've received your payment of ${formatNairaFromKobo(
      registration.paidAmountKobo ?? registration.amountKobo
    )}.`,
    `Program dates: ${formatCohortRange(cohort.startDate, cohort.endDate)}`,
    `Live sessions: ${cohort.liveSessions}`,
    `Duration: ${cohort.duration}. Format: ${cohort.format}.`,
    ...(cohort.welcomeNote ? [cohort.welcomeNote] : []),
    "Can't make a live session? Every session is recorded, so you can watch it later.",
    `Registration: ${TRACK_LABEL[registration.track]}. Payment reference: ${registration.paidReference ?? "—"}.`,
  ];

  await ctx.scheduler.runAfter(0, internal.actions.emails.sendPatientCareEmail.sendPatientCareEmail, {
    to: registration.email,
    subject: `You're registered: ${PROGRAM_TITLE}`,
    greetingName: registration.firstName,
    heading: `Your place in the ${cohort.cohortLabel} is confirmed`,
    paragraphs,
    buttonLabel: cohort.communityLink ? "Join the cohort group" : "View the program",
    buttonUrl: cohort.communityLink ?? appLink("/learn"),
    footnote:
      "You're receiving this because you registered for a Rehabify Learn program. Questions? Write to support@rehabify.ng.",
  });
  await ctx.db.patch(registration._id, { confirmationEmailSentAt: Date.now() });
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
    communityLink: string | null;
  };
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
        communityLink: isPaid ? cohort.communityLink ?? null : null,
      },
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
