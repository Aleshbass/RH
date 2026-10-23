/**
 * MediLoan status rules (pure, no database). Event names and MyItura loan statuses come from
 * https://myitura.com/api-docs/mediloan; older names we used before are still understood.
 */

export type MediLoanStatus =
  | "initiated"
  | "pending"
  | "approved"
  | "offer_accepted"
  | "disbursed"
  | "declined"
  | "expired"
  | "cancelled"
  | "defaulted"
  | "failed"
  | "repaid";

/** Webhook event → our status. Repayment events don't change the status (see REPAYMENT_EVENTS). */
export const MEDILOAN_EVENT_STATUS: Record<string, MediLoanStatus> = {
  "loan.initiated": "initiated",
  "loan.application.submitted": "pending",
  "loan.approved": "approved",
  "loan.terms.issued": "approved",
  "loan.offer.accepted": "offer_accepted",
  "loan.offer.rejected": "declined",
  "loan.rejected": "declined",
  "loan.disbursed": "disbursed",
  "loan.completed": "repaid",
  "loan.cancelled": "cancelled",
  "loan.defaulted": "defaulted",
  "loan.initiation.expired": "expired",
  // Names from before the published event list
  "loan.pending": "pending",
  "loan.declined": "declined",
  "loan.expired": "expired",
  "loan.repaid": "repaid",
  "loan.failed": "failed",
};

/** Repayment events: recorded on the loan without changing its status. */
export const MEDILOAN_REPAYMENT_EVENTS: Record<string, string> = {
  "loan.repayment.due": "Instalment due",
  "loan.repayment.completed": "Instalment paid",
};

/** A status MyItura reports for an initiation or a loan (GET /sdk/loans) → our status. */
export function statusFromMyItura(status: string | undefined | null): MediLoanStatus | null {
  switch ((status ?? "").toLowerCase()) {
    case "initiated":
      return "initiated";
    case "pending":
    case "under_review":
      return "pending";
    case "approved":
      return "approved";
    case "terms_accepted":
      return "offer_accepted";
    case "terms_declined":
    case "rejected":
      return "declined";
    case "disbursed":
    case "active":
      return "disbursed";
    case "completed":
      return "repaid";
    case "defaulted":
      return "defaulted";
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    default:
      return null;
  }
}

const RANK: Partial<Record<MediLoanStatus, number>> = {
  initiated: 0,
  pending: 1,
  approved: 2,
  offer_accepted: 3,
  disbursed: 4,
  defaulted: 5,
  repaid: 6,
};
const CLOSED = new Set<MediLoanStatus>(["declined", "expired", "cancelled", "failed", "repaid"]);

/**
 * Whether a loan may move from `current` to `next`. Statuses only move forward: a replayed or
 * late event can't reopen a closed loan, step back, or undo a disbursement.
 */
export function canMoveMediLoan(current: MediLoanStatus, next: MediLoanStatus): boolean {
  if (current === next) return false;
  if (CLOSED.has(current)) return false;
  const from = RANK[current];
  const to = RANK[next];
  if (from !== undefined && to !== undefined) return to > from;
  // Moving to a closed status (declined, expired, cancelled, failed) is only possible before the money went out
  return from === undefined || from < (RANK.disbursed ?? 4);
}
