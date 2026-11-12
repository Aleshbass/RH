/**
 * Receipts for every payment and every refund (Payment Policy section 7). Call issueReceipt once
 * the money has moved: it's idempotent per payment or refund, numbers receipts in order
 * (RH-RCT-100001…), and emails the payer a link that opens without signing in.
 */
import { makeFunctionReference } from "convex/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { appLink } from "./appUrl";
import { randomToken } from "./exerciseCrypto";
import { alertAdminsOfPayment } from "./adminPaymentAlerts";
import { isJoyLoginEmail } from "../../lib/auth/joyLoginEmail";

export type ReceiptRelationship = "rehabify_care" | "independent" | "clinic";

export type ReceiptInput = {
  kind: "payment" | "refund";
  payerUserId?: Id<"users">;
  email?: string;
  name?: string;
  /** What it was for, e.g. "marketplace_booking", "invoice", "flex", "clinic_subscription" */
  relatedType: string;
  relatedId: string;
  relationship?: ReceiptRelationship;
  /** One line people recognise, e.g. "Virtual assessment with Ada Obi, 3 November 2026" */
  description: string;
  /** Service, travel, discounts (negative). The total is their sum. */
  lines: { label: string; amountKobo: number }[];
  /** The Paystack reference of the payment (or of the refunded payment) */
  reference?: string;
  /** One receipt per key: the payment reference, or the Paystack refund id for refunds */
  dedupeKey: string;
  paidAt: number;
  /** Email the receipt (default). Off where the flow already sends its own receipt email. */
  notify?: boolean;
};

const RECEIPT_START = 100001;

const sendEmail = makeFunctionReference<
  "action",
  { to: string; subject: string; greetingName?: string; heading: string; paragraphs: string[]; buttonLabel?: string; buttonUrl?: string; footnote?: string }
>("actions/emails/sendPatientCareEmail:sendPatientCareEmail");

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

async function nextReceiptNumber(ctx: MutationCtx) {
  const counter = await ctx.db
    .query("idCounters")
    .withIndex("by_kind", (q) => q.eq("kind", "receipt"))
    .unique();
  const n = counter?.next ?? RECEIPT_START;
  if (counter) await ctx.db.patch(counter._id, { next: n + 1 });
  else await ctx.db.insert("idCounters", { kind: "receipt", next: n + 1 });
  return `RH-RCT-${n}`;
}

/** Issues (or returns the existing) receipt for one payment or refund, and emails it. */
export async function issueReceipt(ctx: MutationCtx, input: ReceiptInput): Promise<Id<"receipts">> {
  const dedupeKey = `${input.kind}:${input.dedupeKey}`;
  const existing = await ctx.db
    .query("receipts")
    .withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey))
    .first();
  if (existing) return existing._id;

  const totalKobo = input.lines.reduce((sum, line) => sum + line.amountKobo, 0);
  const accessToken = randomToken(24);
  const number = await nextReceiptNumber(ctx);
  const id = await ctx.db.insert("receipts", {
    number,
    kind: input.kind,
    payerUserId: input.payerUserId,
    email: input.email?.trim().toLowerCase() || undefined,
    name: input.name?.trim() || undefined,
    relatedType: input.relatedType,
    relatedId: input.relatedId,
    relationship: input.relationship,
    description: input.description,
    lines: input.lines,
    totalKobo,
    reference: input.reference,
    dedupeKey,
    paidAt: input.paidAt,
    accessToken,
    issuedAt: Date.now(),
  });

  // The team hears about every payment once (bell, phone push, email)
  if (input.kind === "payment") {
    await alertAdminsOfPayment(ctx, {
      amountKobo: totalKobo,
      description: input.description,
      relationship: input.relationship,
      payerUserId: input.payerUserId,
      reference: input.reference,
      receiptNumber: number,
    });
  }

  // A private Rehabify address (WhatsApp-only patients, phone + PIN logins) delivers nowhere:
  // those patients get the receipt on WhatsApp and in their dashboard instead
  const to = input.email?.trim();
  if (to && !isJoyLoginEmail(to) && input.notify !== false) {
    const refund = input.kind === "refund";
    await ctx.scheduler.runAfter(0, sendEmail, {
      to,
      subject: refund ? `Your refund of ${naira(totalKobo)} (${number})` : `Your receipt for ${naira(totalKobo)} (${number})`,
      greetingName: input.name?.split(" ")[0],
      heading: refund ? "Your refund is on its way" : "Thanks for your payment",
      paragraphs: [
        refund
          ? `We've sent ${naira(totalKobo)} back to the card or account you paid with, for ${input.description}. Banks usually show it within 5 to 10 business days.`
          : `We've received ${naira(totalKobo)} for ${input.description}.`,
        `Your receipt number is ${number}. You can view or print it any time.`,
      ],
      buttonLabel: "View receipt",
      buttonUrl: appLink(`/receipt/${accessToken}`),
      footnote: "Questions about a payment? Write to support@physioaroundme.com with your receipt number.",
    });
  }
  return id;
}
