'use client'

import { useQuery } from 'convex/react'
import { FlaskConical } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { cn } from '@/lib/utils'

/**
 * Shown on every payment screen while Paystack is on test keys (the server's secret key or the
 * browser's public key), so nobody mistakes a test payment for real money.
 */
export function PaystackTestModeBanner({ className }: { className?: string }) {
  const mode = useQuery(api.paymentMode.getPaymentMode, {}) as { testMode: boolean } | undefined
  const publicKeyIsTest = (process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? '').startsWith('pk_test_')
  if (!mode?.testMode && !publicKeyIsTest) return null

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-100',
        className
      )}
    >
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <span className="font-semibold">Test mode.</span> Payments use Paystack test keys: no real money is charged
        or paid out. Use a Paystack test card.
      </p>
    </div>
  )
}
