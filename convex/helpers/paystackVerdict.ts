/**
 * What Paystack says happened to a saved-card charge (charge_authorization), for actions.
 *
 * "success" and "failed" are final. "unknown" means ask again later: Paystack didn't answer, or the
 * charge is still going through. Never charge a card again while the last charge is unknown, or a
 * timeout that did take the money becomes a double charge.
 *
 * Only for saved-card charges: an "abandoned" checkout link can still be paid later.
 */
export type PaystackVerdict =
  | { outcome: "success"; tx: Record<string, any> }
  | { outcome: "failed"; reason: string }
  | { outcome: "unknown"; reason: string };

const FINAL_FAILURES = ["failed", "abandoned", "reversed"];

export async function paystackChargeVerdict(reference: string): Promise<PaystackVerdict> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return { outcome: "unknown", reason: "Payments aren't configured" };
  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await response.json().catch(() => null)) as { status?: boolean; message?: string; data?: Record<string, any> } | null;
    if (response.ok && data?.status && data.data && data.data.reference === reference) {
      const status = String(data.data.status ?? "");
      if (status === "success") return { outcome: "success", tx: data.data };
      if (FINAL_FAILURES.includes(status)) {
        return { outcome: "failed", reason: String(data.data.gateway_response || status).slice(0, 200) };
      }
      return { outcome: "unknown", reason: status || "pending" };
    }
    // Paystack never saw this reference: the card wasn't charged
    if ((response.status === 400 || response.status === 404) && /not found/i.test(String(data?.message ?? ""))) {
      return { outcome: "failed", reason: "The charge didn't reach the bank" };
    }
    return { outcome: "unknown", reason: `Paystack answered HTTP ${response.status}` };
  } catch (err) {
    return { outcome: "unknown", reason: err instanceof Error ? err.message.slice(0, 200) : "No answer from Paystack" };
  }
}
