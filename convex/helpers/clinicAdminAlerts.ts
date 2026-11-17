/**
 * Clinic billing problems a person has to sort out (a short payment, a refund that failed):
 * a bell + push alert to every admin, linking to the clinic.
 */
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { insertNotification } from "./pushNotify";

export async function alertAdminsAboutClinic(ctx: MutationCtx, title: string, body: string, clinicId: Id<"clinics">) {
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "admin"))
    .take(25);
  const now = Date.now();
  for (const admin of admins) {
    await insertNotification(ctx, {
      userId: admin._id,
      type: "system_alert",
      priority: "medium",
      status: "pending",
      payload: { title, body, data: { entityId: clinicId, entityType: "clinic", actionUrl: `/dashboard/admin/clinics/${clinicId}` } },
      createdAt: now,
    });
  }
}

/** Every Paystack reference started for an invoice (older invoices only kept the latest). */
export function invoiceReferences(invoice: { paystackReferences?: string[]; paystackReference?: string }): string[] {
  return invoice.paystackReferences ?? (invoice.paystackReference ? [invoice.paystackReference] : []);
}

/** The list with `reference` added last (kept to the newest 12). */
export function withReference(list: string[] | undefined, reference: string): string[] {
  return [...(list ?? []).filter((r) => r !== reference), reference].slice(-12);
}

/** When a Rehabify reference (…_<milliseconds>) was started, or null. */
export function referenceTime(reference: string): number | null {
  const ms = Number(/_(\d{12,})$/.exec(reference)?.[1]);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}
