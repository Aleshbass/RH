/**
 * Renewing Flex and Flex Max by themselves (rules in helpers/flexCards.ts). The hourly sweep
 * (exercisePrograms.sweepPatientPlans) schedules chargeFlexRenewal 24 hours before a period ends
 * for patients who ticked "Renew automatically"; a success goes through the same path as any Flex
 * payment (completeVerifiedFlexPayment: receipt, the next 30 days follow on).
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { paystackRequest } from "./clinicBilling";
import { appLink } from "./helpers/appUrl";
import { MAX_RENEW_ATTEMPTS, activeFlexCard, flexCardView } from "./helpers/flexCards";
import { flexReference, isLive, patientEntitlements, patientFlexContext, planName, planPriceKobo, planSettings, type PaidPlan } from "./helpers/patientPlans";
import { insertNotification } from "./helpers/pushNotify";
import { currentUser } from "./helpers/careAccess";

const completeFlexRef = makeFunctionReference<
  "mutation",
  { reference: string; amountKobo: number; currency: string; channel?: string },
  { success: boolean }
>("exercisePrograms:completeVerifiedFlexPayment");
const infoRef = makeFunctionReference<"query", { entitlementId: Id<"patientPlanEntitlements"> }, RenewalInfo>("flexRenewal:renewalInfo");
const recordRef = makeFunctionReference<
  "mutation",
  { entitlementId: Id<"patientPlanEntitlements">; cardId: Id<"patientPlanCards">; reference: string; status: string; message?: string },
  null
>("flexRenewal:recordRenewalAttempt");
const sendCareEmail = makeFunctionReference<
  "action",
  { to: string; subject: string; greetingName?: string; heading: string; paragraphs: string[]; buttonLabel?: string; buttonUrl?: string; footnote?: string }
>("actions/emails/sendPatientCareEmail:sendPatientCareEmail");

type RenewalInfo =
  | { ok: false; reason: string }
  | {
      ok: true;
      patientId: Id<"users">;
      plan: PaidPlan;
      amountKobo: number;
      cardId: Id<"patientPlanCards">;
      authorizationCode: string;
      email: string;
      patientNumber: string | null;
    };

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG")}`;
const RENEW_PATH = "/dashboard/patient#your-plan";

/** Whether this ending period may be renewed now, and with which card. */
export const renewalInfo = internalQuery({
  args: { entitlementId: v.id("patientPlanEntitlements") },
  handler: async (ctx, args): Promise<RenewalInfo> => {
    const row = await ctx.db.get(args.entitlementId);
    if (!row || row.status !== "active" || row.expiresAt === undefined) return { ok: false, reason: "not_active" };
    const card = await activeFlexCard(ctx, row.patientId);
    if (!card) return { ok: false, reason: "no_card" };
    if (!isLive(await planSettings(ctx), row.plan)) return { ok: false, reason: "plan_off" };
    // Their care changed (Rehabify Care or a clinic): Flex is included now, so nothing to charge
    if (!(await patientFlexContext(ctx, row.patientId)).independent) return { ok: false, reason: "included_now" };
    const others = await patientEntitlements(ctx, row.patientId, 20);
    const followOn = others.some(
      (o) => o._id !== row._id && (o.status === "pending_activation" || (o.status === "active" && (o.expiresAt ?? 0) > row.expiresAt!))
    );
    if (followOn) return { ok: false, reason: "already_renewed" };
    const patient = await ctx.db.get(row.patientId);
    return {
      ok: true,
      patientId: row.patientId,
      plan: row.plan,
      amountKobo: planPriceKobo(row.plan),
      cardId: card._id,
      authorizationCode: card.authorizationCode,
      email: card.email,
      patientNumber: patient?.patientNumber ?? null,
    };
  },
});

/** Records a renewal charge; tells the patient when the card was declined. */
export const recordRenewalAttempt = internalMutation({
  args: {
    entitlementId: v.id("patientPlanEntitlements"),
    cardId: v.id("patientPlanCards"),
    reference: v.string(),
    status: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    const row = await ctx.db.get(args.entitlementId);
    if (!card || !row) return null;
    const now = Date.now();
    const sameRound = card.renewingEntitlementId === args.entitlementId;
    const attempts = (sameRound ? card.attempts ?? 0 : 0) + 1;
    await ctx.db.patch(card._id, {
      renewingEntitlementId: args.entitlementId,
      attempts,
      lastAttemptAt: now,
      lastStatus: args.status,
      lastMessage: args.message?.slice(0, 200),
      lastReference: args.reference,
    });
    if (args.status === "success" || args.status === "pending") return null;
    const patient = await ctx.db.get(row.patientId);
    if (!patient) return null;
    const name = planName(row.plan);
    const final = attempts >= MAX_RENEW_ATTEMPTS;
    const label = flexCardView(card)?.label ?? "your card";
    await insertNotification(ctx, {
      userId: patient._id,
      type: "patient_plan",
      priority: "medium",
      status: "pending",
      payload: {
        title: `We couldn't renew your ${name}`,
        body: final ? `Your card was declined. Renew from your dashboard to keep demonstrations and tracking.` : `Your card was declined. We'll try once more in 12 hours.`,
        data: { actionUrl: RENEW_PATH },
      },
      createdAt: now,
    });
    const to = (patient.email ?? card.email).trim().toLowerCase();
    if (final && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) && !to.endsWith("@placeholder.patient") && !to.endsWith(".invalid")) {
      await ctx.scheduler.runAfter(0, sendCareEmail, {
        to,
        subject: `We couldn't renew your ${name}`,
        greetingName: patient.firstName,
        heading: `Your ${name} didn't renew`,
        paragraphs: [
          `We tried to charge ${label} ${naira(planPriceKobo(row.plan))} to renew your ${name}${args.message ? `, and the bank said: “${args.message.slice(0, 100)}”` : ""}.`,
          "To keep your exercise demonstrations and progress tracking, renew from your dashboard with another card or a transfer. If you'd rather stop, there's nothing to do: your exercises stay free on Basic.",
        ],
        buttonLabel: "Renew now",
        buttonUrl: appLink(RENEW_PATH),
      });
    }
    return null;
  },
});

/** Charges the same plan to the saved card (scheduled by the hourly sweep). */
export const chargeFlexRenewal = internalAction({
  args: { entitlementId: v.id("patientPlanEntitlements") },
  handler: async (ctx, args) => {
    const info = await ctx.runQuery(infoRef, args);
    if (!info.ok) return { charged: false, reason: info.reason };
    const reference = flexReference(info.patientId, info.plan, Date.now());
    let status = "failed";
    let message: string | undefined;
    try {
      const data = await paystackRequest("/transaction/charge_authorization", {
        method: "POST",
        body: JSON.stringify({
          authorization_code: info.authorizationCode,
          email: info.email,
          amount: info.amountKobo,
          currency: "NGN",
          reference,
          metadata: { source: "rehabify_flex", plan: info.plan, automatic: true, rehabify_id: info.patientNumber },
        }),
      });
      status = typeof data?.status === "string" ? data.status : "failed";
      message = typeof data?.gateway_response === "string" ? data.gateway_response : undefined;
      if (status === "success") {
        await ctx.runMutation(completeFlexRef, {
          reference,
          amountKobo: Number(data.amount) || 0,
          currency: String(data.currency || ""),
          channel: "card",
        });
      } else if (status !== "failed") {
        // send_otp, pending…: the FLEX_ webhook settles it if it goes through
        status = "pending";
      }
    } catch (err) {
      message = err instanceof Error ? err.message : "Paystack didn't answer";
    }
    await ctx.runMutation(recordRef, { entitlementId: args.entitlementId, cardId: info.cardId, reference, status, message });
    return { charged: status === "success" };
  },
});

/** "Turn off automatic renewal": the card is forgotten; the current 30 days carry on. */
export const stopFlexAutoRenew = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user || user.role !== "patient") throw new ConvexError("Sign in to your Rehabify account first.");
    const card = await activeFlexCard(ctx, user._id);
    if (!card) return null;
    const now = Date.now();
    await ctx.db.patch(card._id, { status: "removed", removedAt: now });
    await ctx.db.insert("systemLogs", {
      type: "payment",
      action: "flex_auto_renew_off",
      timestamp: now,
      userId: String(user._id),
      targetEntityType: "patient_plan_card",
      targetEntityId: String(card._id),
      details: {},
    });
    return null;
  },
});
