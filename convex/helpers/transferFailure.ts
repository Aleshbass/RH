/**
 * A Paystack transfer refusal in plain words, where we know it (convex/payouts.ts stores it; the
 * admin payout run shows it, also for transfers recorded before this existed).
 *
 * Payouts are Paystack transfers from Rehabify's Paystack BALANCE, so "Your balance is not enough
 * to fulfil this request" means the balance needs a top-up before the transfer can be retried.
 */
export const LOW_BALANCE_MESSAGE = "Not enough money in Rehabify's Paystack balance. Top it up, then press Retry.";

export function plainTransferFailure(message: string): string {
  if (/balance is not enough|insufficient balance|not enough balance/i.test(message)) return LOW_BALANCE_MESSAGE;
  return message;
}
