/**
 * Tells the Rehabify team when money comes in: a bell + phone push for every admin account and
 * one email to the team inboxes (ADMIN_EMAIL, see adminRecipients.ts). issueReceipt calls it once
 * per payment, so every Paystack payment (bookings, Joy, invoices, Flex, clinic plans) is covered.
 * A physio or clinic recording money they took themselves (cash, transfer) is flagged too, since
 * it never passes through Rehabify. Finance shows Rehabify IDs, not patient names.
 */
import { makeFunctionReference } from "convex/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { platformAdminEmails } from "./adminRecipients";
import { appLink } from "./appUrl";
import { currentPaystackMode } from "./paystackMode";
import { insertNotification } from "./pushNotify";

const sendEmail = makeFunctionReference<
  "action",
  { to: string; subject: string; skipGreeting?: boolean; heading: string; paragraphs: string[]; buttonLabel?: string; buttonUrl?: string }
>("actions/emails/sendPatientCareEmail:sendPatientCareEmail");

const TRANSACTIONS = "/dashboard/admin/transactions";
const ADMIN_CAP = 25;

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

const KIND_LABELS: Record<string, string> = {
  rehabify_care: "Rehabify Care (Rehabify keeps its share)",
  independent: "A physio's own invoice (no Rehabify fee)",
  clinic: "A clinic's invoice (no Rehabify fee)",
};

export type AdminPaymentAlert = {
  amountKobo: number;
  /** What it paid for, e.g. "invoice INV-2026-0042" */
  description: string;
  relationship?: string;
  payerUserId?: Id<"users">;
  reference?: string;
  receiptNumber?: string;
  /** Money a physio or clinic says they took themselves: it never reached Rehabify */
  recordedOutside?: { by: string; method?: string };
};

async function payerLabel(ctx: MutationCtx, payerUserId?: Id<"users">) {
  if (!payerUserId) return "a guest";
  const payer = await ctx.db.get(payerUserId);
  return payer?.patientNumber ?? "a patient";
}

export async function alertAdminsOfPayment(ctx: MutationCtx, alert: AdminPaymentAlert) {
  if (!(alert.amountKobo > 0)) return;
  const test = !alert.recordedOutside && currentPaystackMode() === "test";
  const amount = naira(alert.amountKobo);
  const who = await payerLabel(ctx, alert.payerUserId);
  const kind = alert.relationship ? KIND_LABELS[alert.relationship] : undefined;

  const title = alert.recordedOutside
    ? `${amount} recorded as paid outside Rehabify`
    : `${test ? "[TEST] " : ""}Payment received: ${amount}`;
  const body = alert.recordedOutside
    ? `${alert.recordedOutside.by} marked ${alert.description} paid${alert.recordedOutside.method ? ` (${alert.recordedOutside.method.replace(/_/g, " ")})` : ""} for ${who}. No money came through Rehabify.`
    : `${who} paid for ${alert.description}.${kind ? ` ${kind}.` : ""}`;

  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "admin"))
    .take(ADMIN_CAP);
  const now = Date.now();
  for (const admin of admins) {
    await insertNotification(ctx, {
      userId: admin._id,
      type: "payment_received",
      priority: "high",
      status: "pending",
      payload: { title, body, link: TRANSACTIONS, data: { entityType: "payment", actionUrl: TRANSACTIONS, amount: alert.amountKobo } },
      createdAt: now,
    });
  }

  const paragraphs = [
    body,
    ...(alert.receiptNumber ? [`Receipt: ${alert.receiptNumber}`] : []),
    ...(alert.reference ? [`Paystack reference: ${alert.reference}`] : []),
    ...(test ? ["Paystack is in TEST mode, so no real money moved."] : []),
  ];
  for (const to of platformAdminEmails()) {
    await ctx.scheduler.runAfter(0, sendEmail, {
      to,
      subject: title,
      skipGreeting: true,
      heading: title,
      paragraphs,
      buttonLabel: "Open transactions",
      buttonUrl: appLink(TRANSACTIONS),
    });
  }
}
