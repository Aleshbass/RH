/**
 * Paystack test and live modes are separate: a subaccount created with a test key doesn't exist
 * in live mode (and the other way round), so a checkout naming it is rejected. Payout accounts
 * record the mode they were created in, and checkouts only split to an account from the
 * current mode; otherwise Rehabify holds the money until the account is reconnected.
 */
export type PaystackMode = "test" | "live";

export function currentPaystackMode(): PaystackMode {
  return (process.env.PAYSTACK_SECRET_KEY ?? "").startsWith("sk_live_") ? "live" : "test";
}

/** The account's subaccount code if it works with the current key, else null. Older rows were made on test keys. */
export function usableSubaccount(
  row: { subaccountCode?: string | null; paystackMode?: PaystackMode } | null | undefined
): string | null {
  if (!row?.subaccountCode) return null;
  return (row.paystackMode ?? "test") === currentPaystackMode() ? row.subaccountCode : null;
}

/** Paid with a Paystack test key (admin/testPayments.ts): no real money moved, so money figures skip it. */
export function isTestMoney(row: { paystackMode?: PaystackMode } | null | undefined): boolean {
  return row?.paystackMode === "test";
}
