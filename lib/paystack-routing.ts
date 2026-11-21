/**
 * Money routing for the checkouts our Next.js routes start: Rehabify Care bookings on the web
 * (app/api/payments/marketplace) and through Joy (app/api/v1/joy/bookings/[bookingId]/payment).
 *
 * The rules live in Convex (convex/helpers/paystackRouting.ts): with the switch on (Admin ›
 * Finance › Money routing), the physio's fixed share stays in Rehabify's main Paystack account,
 * whose settlements stay in the balance that pays payout runs, and Rehabify's part goes to
 * Rehabify's revenue sub-account (its bank). Off, or on any problem here, there is no split and
 * the checkout is exactly what it was before.
 */
import { makeFunctionReference } from 'convex/server'
import type { Id } from '@/convex/_generated/dataModel'
import { getConvexClient } from '@/lib/convex-client'
import { convexServerSecret } from '@/lib/convex-server-secret'

/** Paystack's split fields on /transaction/initialize. */
export type PaystackSplit = { subaccount?: string; transaction_charge?: number; bearer?: 'account' | 'subaccount' }

// Plain references: the generated api type is at TypeScript's depth limit
const bookingSplitRef = makeFunctionReference<
  'query',
  { serverSecret: string; bookingId: Id<'marketplaceBookings'>; amountKobo: number },
  { split: PaystackSplit; keyMode: 'test' | 'live' }
>('paystackRouting:bookingCheckoutSplit')
const reportProblemRef = makeFunctionReference<'mutation', { serverSecret: string; source: string; message: string }, null>(
  'paystackRouting:reportSplitProblem'
)

/** The mode of this server's Paystack key (same rule as convex/helpers/paystackMode.ts). */
const serverKeyMode = () => ((process.env.PAYSTACK_SECRET_KEY ?? '').startsWith('sk_live_') ? 'live' : 'test')

/** The split for a Rehabify Care booking's checkout, or {} (no split) when routing is off or anything is unclear. */
export async function bookingCheckoutSplit(bookingId: string, amountKobo: number): Promise<PaystackSplit> {
  try {
    const result = await getConvexClient().query(bookingSplitRef, {
      serverSecret: convexServerSecret(),
      bookingId: bookingId as Id<'marketplaceBookings'>,
      amountKobo,
    })
    // The sub-account exists only under the Paystack mode of Convex's key: if this server's key is in
    // the other mode (e.g. a test key on a preview), Paystack would refuse it, so don't send it
    if (!result?.split?.subaccount || result.keyMode !== serverKeyMode()) return {}
    return result.split
  } catch {
    // Routing must never stop a payment
    return {}
  }
}

/**
 * POSTs /transaction/initialize with the split. If Paystack answers with a refusal, the refusal is
 * noted on the Money routing page and the same checkout is sent again without the split (exactly
 * as before routing), so a routing problem never stops a patient paying; the money then simply
 * stays in the main account. A refused initialize creates no transaction, so the reference can be
 * reused. Network errors and unreadable answers are returned to the caller as before.
 */
export async function initializeCheckout(source: string, body: Record<string, unknown>, split: PaystackSplit): Promise<Response> {
  const send = (routed: PaystackSplit) =>
    fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, ...routed }),
    })
  if (!split.subaccount) return send({})
  const response = await send(split)
  const data = (await response.clone().json().catch(() => null)) as { status?: boolean; message?: string } | null
  if (data === null || data.status === true) return response
  const message = (typeof data.message === 'string' ? data.message : `HTTP ${response.status}`).replace(/[^\s@]+@[^\s@]+/g, '[redacted]').slice(0, 200)
  // No keys, emails or amounts: the product and Paystack's reason only
  console.warn('paystack_routing_split_refused', { source, message })
  try {
    await getConvexClient().mutation(reportProblemRef, { serverSecret: convexServerSecret(), source, message })
  } catch {
    // The payment matters more than the note
  }
  return send({})
}
