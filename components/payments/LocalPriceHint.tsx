'use client'

/**
 * "About GH₵190" under a Naira price, for people outside Nigeria: a physio practising there, or a
 * patient of one (convex/exchangeRates.ts, official rate refreshed daily). Paystack still charges
 * Naira and the payer's bank sets the final rate, so this is only a guide. Shows nothing in Nigeria,
 * when signed out, or when there's no fresh rate.
 */
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { formatMoney } from '@/lib/practiceCountries'
import { cn } from '@/lib/utils'

const myNairaRateRef = makeFunctionReference<
  'query',
  Record<string, never>,
  { currency: string; perNaira: number; fetchedAt: number } | null
>('exchangeRates:getMyNairaRate')

export function LocalPriceHint({ naira, className }: { naira: number; className?: string }) {
  const rate = useQuery(myNairaRateRef, {})
  if (!rate || !(naira > 0)) return null
  return (
    <p className={cn('text-xs leading-5', className)}>
      About {formatMoney(naira * rate.perNaira, rate.currency)}. You’re charged in Naira and your bank sets the final
      rate.{' '}
      <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
        Rates By Exchange Rate API
      </a>
    </p>
  )
}
