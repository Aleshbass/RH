/**
 * The patient's answer to "did you pay the physio or clinic directly?" (helpers/visitCheckIns.ts),
 * and the weekly referral billing report for admins. The check-in page needs no sign-in: the
 * unguessable token in the link is the patient's.
 */
import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { platformAdminEmails } from "./helpers/adminRecipients";
import { appLink } from "./helpers/appUrl";
import { lagosDate } from "./helpers/lagosTime";
import { insertNotification } from "./helpers/pushNotify";
import { providerName } from "./helpers/visitCheckIns";

const sendEmail = makeFunctionReference<
  "action",
  { to: string; subject: string; skipGreeting?: boolean; heading: string; paragraphs: string[]; buttonLabel?: string; buttonUrl?: string }
>("actions/emails/sendPatientCareEmail:sendPatientCareEmail");

const DAY = 24 * 60 * 60 * 1000;
const MAX_NAIRA = 10_000_000;
const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;
const METHOD_LABEL: Record<string, string> = { cash: "cash", bank_transfer: "bank transfer", pos: "POS", other: "another way" };

async function tellAdmins(
  ctx: { db: any; scheduler: any },
  args: { title: string; body: string; paragraphs?: string[]; link: string; buttonLabel: string }
) {
  const admins = (await ctx.db
    .query("users")
    .withIndex("by_role", (q: any) => q.eq("role", "admin"))
    .take(25)) as Doc<"users">[];
  const now = Date.now();
  for (const admin of admins) {
    await insertNotification(ctx, {
      userId: admin._id,
      type: "system_alert",
      priority: "high",
      status: "pending",
      payload: { title: args.title, body: args.body, link: args.link, data: { actionUrl: args.link } },
      createdAt: now,
    });
  }
  for (const to of platformAdminEmails()) {
    await ctx.scheduler.runAfter(0, sendEmail, {
      to,
      subject: args.title,
      skipGreeting: true,
      heading: args.title,
      paragraphs: args.paragraphs ?? [args.body],
      buttonLabel: args.buttonLabel,
      buttonUrl: appLink(args.link),
    });
  }
}

/** What the check-in page shows: who they saw and when, and whether they've answered. */
export const getVisitCheckIn = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const token = args.token.trim();
    if (token.length < 16) return null;
    const row = await ctx.db
      .query("visitPaymentCheckIns")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!row) return null;
    return {
      provider: await providerName(ctx, row.physiotherapistId, row.clinicId),
      visitDate: lagosDate(row.visitAt),
      answered: row.answeredAt !== undefined,
      paidDirectly: row.paidDirectly ?? null,
    };
  },
});

/** The patient's answer. A yes (money paid directly) is flagged to admins straight away. */
export const answerVisitCheckIn = mutation({
  args: {
    token: v.string(),
    paidDirectly: v.boolean(),
    amountNaira: v.optional(v.number()),
    method: v.optional(v.union(v.literal("cash"), v.literal("bank_transfer"), v.literal("pos"), v.literal("other"))),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("visitPaymentCheckIns")
      .withIndex("by_token", (q) => q.eq("token", args.token.trim()))
      .first();
    if (!row) throw new ConvexError("This link isn't valid any more.");
    if (row.answeredAt !== undefined) return { alreadyAnswered: true };

    let amountKobo: number | undefined;
    if (args.paidDirectly) {
      const amount = args.amountNaira ?? 0;
      if (!Number.isFinite(amount) || amount < 0 || amount > MAX_NAIRA) throw new ConvexError("Please enter the amount in naira.");
      amountKobo = Math.round(amount * 100) || undefined;
    }
    const now = Date.now();
    await ctx.db.patch(row._id, {
      answeredAt: now,
      paidDirectly: args.paidDirectly,
      amountKobo,
      method: args.paidDirectly ? args.method ?? "other" : undefined,
    });

    if (args.paidDirectly) {
      const patient = await ctx.db.get(row.patientId);
      const provider = await providerName(ctx, row.physiotherapistId, row.clinicId);
      const how = METHOD_LABEL[args.method ?? "other"];
      const what = amountKobo ? `${naira(amountKobo)} by ${how}` : `money (amount not given) by ${how}`;
      await tellAdmins(ctx, {
        title: "A Rehabify patient paid a provider directly",
        body: `${patient?.patientNumber ?? "A patient"} says they paid ${provider} ${what} for their visit on ${lagosDate(row.visitAt)}. ${row.kind === "clinic_referral" ? "Rehabify referred them to this clinic." : "They're a Rehabify Care patient."} Rehabify's share wasn't collected.`,
        link: "/dashboard/admin/physiotherapists",
        buttonLabel: "Open physiotherapists",
      });
    }
    return { alreadyAnswered: false };
  },
});

/**
 * Weekly (Monday morning): clinics whose Rehabify-referred patients had more finished visits last
 * week than online payments, plus what patients reported paying directly. Sent only when there's
 * something to look at.
 */
export const weeklyReferralBillingReport = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const since = now - 7 * DAY;
    const visits = await ctx.db
      .query("appointments")
      .withIndex("by_start_time", (q) => q.gte("startTime", since).lt("startTime", now))
      .take(5000);

    type ClinicTally = { visits: number; paid: number };
    const byClinic = new Map<Id<"clinics">, ClinicTally>();
    const referralCache = new Map<string, boolean>();
    for (const visit of visits) {
      if (visit.status !== "completed" || visit.isRecordOnly || !visit.clinicId) continue;
      const key = `${visit.clinicId}:${visit.patientId}`;
      if (!referralCache.has(key)) {
        const rows = await ctx.db
          .query("patientPhysiotherapistRelationships")
          .withIndex("by_patient", (q) => q.eq("patientId", visit.patientId))
          .take(50);
        referralCache.set(key, rows.some((row) => row.clinicId === visit.clinicId && row.source === "rehabify_referral"));
      }
      if (!referralCache.get(key)) continue;
      const tally = byClinic.get(visit.clinicId) ?? { visits: 0, paid: 0 };
      tally.visits++;
      byClinic.set(visit.clinicId, tally);
    }
    // Online payments those clinics took from the same patients in the last two weeks
    for (const [clinicId, tally] of byClinic) {
      const invoices = await ctx.db
        .query("invoices")
        .withIndex("by_clinic_id_and_status", (q) => q.eq("clinicId", clinicId).eq("status", "paid"))
        .order("desc")
        .take(300);
      tally.paid = invoices.filter(
        (invoice) =>
          invoice.patientSource === "rehabify_referral" &&
          invoice.paymentMethod === "paystack" &&
          invoice.paystackMode !== "test" &&
          (invoice.paymentDate ?? 0) >= now - 14 * DAY
      ).length;
    }

    const lines: string[] = [];
    for (const [clinicId, tally] of byClinic) {
      if (tally.visits <= tally.paid) continue;
      const clinic = await ctx.db.get(clinicId);
      lines.push(`${clinic?.name ?? "A clinic"}: ${tally.visits} referral visit${tally.visits === 1 ? "" : "s"} done, ${tally.paid} paid online.`);
    }

    const answers = await ctx.db
      .query("visitPaymentCheckIns")
      .withIndex("by_answered", (q) => q.gte("answeredAt", since))
      .take(1000);
    const direct = answers.filter((row) => row.paidDirectly);
    if (direct.length > 0) {
      const total = direct.reduce((sum, row) => sum + (row.amountKobo ?? 0), 0);
      lines.push(`${direct.length} patient${direct.length === 1 ? "" : "s"} said they paid a provider directly${total > 0 ? ` (${naira(total)} in all)` : ""}.`);
    }
    if (lines.length === 0) return { sent: false };

    await tellAdmins(ctx, {
      title: "Weekly check: Rehabify patients billed outside Rehabify?",
      body: lines.join(" "),
      paragraphs: ["From the last 7 days:", ...lines, "Visits without an online payment may have been paid in cash. Check with the clinic or the patient."],
      link: "/dashboard/admin/clinics",
      buttonLabel: "Open clinics",
    });
    return { sent: true, lines: lines.length };
  },
});
