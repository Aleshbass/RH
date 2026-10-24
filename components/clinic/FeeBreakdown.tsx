'use client'

import { useQuery } from 'convex/react'
import { ChevronRight } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import {
  DEFAULT_CLINIC_FEE_CONFIG,
  clinicPaymentSplit,
  normalizeClinicFeeConfig,
  type ClinicFeeConfig,
} from '@/convex/clinicFees'
import { formatNaira } from '@/components/clinic/ui'
import { cn } from '@/lib/utils'

const naira = (kobo: number) => formatNaira(kobo / 100)
const percent = (value: number) => `${Math.round(value * 100) / 100}%`

/**
 * The clinic fee numbers Rehabify admins have set. Live: an admin change shows up here
 * immediately. Falls back to the defaults while loading.
 */
export function useClinicFeeConfig(): ClinicFeeConfig {
  const settings = useQuery(api.clinicFeeSettings.getClinicFeeSettings)
  return settings ? normalizeClinicFeeConfig(settings) : DEFAULT_CLINIC_FEE_CONFIG
}

/** What happens to an online (Paystack) payment of this amount, as a few compact rows. */
export function FeeBreakdown({
  amountNaira,
  config,
  className,
}: {
  amountNaira: number
  /** Override the live settings (e.g. the admin preview of unsaved numbers) */
  config?: ClinicFeeConfig
  className?: string
}) {
  const liveConfig = useClinicFeeConfig()
  const split = clinicPaymentSplit(Math.round(amountNaira * 100), config ?? liveConfig)
  const rows = [
    { label: 'Patient pays', value: naira(split.totalKobo), show: true },
    { label: 'Paystack fee', value: `−${naira(split.paystackFeeKobo)}`, show: split.paystackFeeKobo > 0 },
    { label: `Rehabify ${percent(split.rehabifySharePercent)}`, value: `−${naira(split.rehabifyKobo)}`, show: split.rehabifyKobo > 0 },
    { label: 'Stamp duty on your payout', value: `−${naira(split.stampDutyKobo)}`, show: split.stampDutyKobo > 0 },
  ]

  return (
    <dl className={cn('space-y-0.5 text-xs tabular-nums text-neutral-500 dark:text-neutral-400', className)}>
      {rows
        .filter((row) => row.show)
        .map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="min-w-0">{row.label}</dt>
            <dd className="shrink-0">{row.value}</dd>
          </div>
        ))}
      <div className="flex items-baseline justify-between gap-3 border-t border-neutral-200 pt-1 font-medium text-neutral-900 dark:border-neutral-800 dark:text-white">
        <dt className="min-w-0">You receive</dt>
        <dd className="shrink-0">{naira(split.clinicKobo)}</dd>
      </div>
    </dl>
  )
}

type PayoutAccountSummary = { bankName: string; accountNumberLast4: string }

/**
 * Collapsible explanation of the payment model with a worked example.
 * `account`: the connected payout account, `null` when none is connected, or leave it out
 * for a general explanation.
 */
export function HowPayoutsWork({
  account,
  className,
}: {
  account?: PayoutAccountSummary | null
  className?: string
}) {
  const config = useClinicFeeConfig()
  const exampleNaira = 20_000
  const rehabifyPercent = 100 - config.clinicSharePercent

  return (
    <details
      className={cn(
        'group rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900',
        className
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime dark:text-white dark:focus-visible:ring-rh-lime sm:px-5 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400 transition-transform group-open:rotate-90" />
        How payouts work
      </summary>
      <div className="space-y-3 border-t border-neutral-200 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400 sm:px-5">
        <p>
          When a patient pays online with a Paystack link, Paystack&apos;s fee comes off first. What&apos;s left is
          split {percent(config.clinicSharePercent)} to you and {percent(rehabifyPercent)} to Rehabify. Stamp duty is
          then taken from your share when it&apos;s paid into your bank.
        </p>
        <p>Cash, POS and bank transfer payments you mark as paid have no fees. You keep all of it.</p>

        <div className="max-w-xs">
          <p className="mb-1 text-xs font-medium text-neutral-900 dark:text-white">
            Example: a {formatNaira(exampleNaira)} online payment
          </p>
          <FeeBreakdown amountNaira={exampleNaira} config={config} />
        </div>

        <ul className="list-disc space-y-1 pl-4 text-xs">
          <li>
            Paystack fee: {percent(config.paystackPercent)}
            {config.paystackFlatKobo > 0 && ` + ${naira(config.paystackFlatKobo)}`}, capped at{' '}
            {naira(config.paystackFeeCapKobo)}.
            {config.paystackFlatKobo > 0 && config.paystackFlatWaivedBelowKobo > 0 &&
              ` The ${naira(config.paystackFlatKobo)} is waived on payments under ${naira(config.paystackFlatWaivedBelowKobo)}.`}
          </li>
          {config.stampDutyKobo > 0 && (
            <li>
              Stamp duty: {naira(config.stampDutyKobo)} on payouts of {naira(config.stampDutyFromKobo)} or more.
            </li>
          )}
        </ul>
        <p className="text-xs">
          Paystack sets its fee and the government sets stamp duty, so these amounts are estimates. Each invoice keeps
          the amounts worked out when it was created.
        </p>
        <p className="text-xs">
          {account
            ? `Paystack pays your share to ${account.bankName} ••${account.accountNumberLast4} on its normal settlement schedule.`
            : account === null
              ? 'No bank account is connected, so online payments settle to Rehabify and we transfer your share manually.'
              : 'With a connected bank account, Paystack pays your share to it on its normal settlement schedule. Without one, online payments settle to Rehabify and we transfer your share manually.'}
        </p>
      </div>
    </details>
  )
}
