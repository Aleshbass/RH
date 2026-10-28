'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { format } from 'date-fns'
import { AlertCircle, Info, Lock } from '@/components/icons'
import { formatKobo, type ClinicBillingBanner as Banner } from '@/lib/clinicSubscriptions'
import { cn } from '@/lib/utils'

const bannerRef = makeFunctionReference<'query', Record<string, never>, Banner>('clinicBilling:getMyClinicBillingBanner')

export const CLINIC_PLAN_PATH = '/dashboard/clinic/billing/plan'

/**
 * Rehabify's own billing for the clinic: allowance warnings at 80% and 100%, an overdue invoice,
 * and read-only. Nothing shows for a clinic whose billing isn't switched on.
 */
export default function ClinicBillingBanner() {
  const banner = useQuery(bannerRef, {})
  const pathname = usePathname()
  if (!banner) return null
  const onPlanPage = pathname === CLINIC_PLAN_PATH

  const owed = formatKobo(banner.owedKobo)
  const content =
    banner.kind === 'read_only'
      ? {
          tone: 'amber' as const,
          icon: Lock,
          text: (
            <>
              <span className="font-medium">Your clinic is read-only because a Rehabify invoice is overdue.</span> You can still view and
              export everything, bill your patients and remove team members, and your patients keep their programmes.{' '}
              {banner.canPay ? 'Paying lifts this straight away.' : 'Ask the clinic owner to pay it.'}
            </>
          ),
          action: banner.canPay ? 'Pay now' : null,
        }
      : banner.kind === 'past_due'
        ? {
            tone: 'amber' as const,
            icon: AlertCircle,
            text: (
              <>
                <span className="font-medium">A Rehabify invoice of {owed} is overdue.</span>{' '}
                {banner.readOnlyFrom
                  ? `Please pay it before ${format(new Date(banner.readOnlyFrom), 'd MMMM')}, when your account would become read-only.`
                  : 'Please pay it to keep everything running.'}
              </>
            ),
            action: 'Pay now',
          }
        : banner.kind === 'allowance_100'
          ? {
              tone: 'amber' as const,
              icon: Info,
              text: (
                <>
                  <span className="font-medium">You&apos;ve reached your {banner.allowance} active patient programmes.</span> Each extra one is
                  ₦500 this month, or you can ask to upgrade.
                </>
              ),
              action: 'See your plan',
            }
          : {
              tone: 'neutral' as const,
              icon: Info,
              text: (
                <>
                  <span className="font-medium">You&apos;ve used 80% of your active patient programmes.</span> Each one over {banner.allowance} is
                  ₦500 a month.
                </>
              ),
              action: 'See your plan',
            }

  const Icon = content.icon
  return (
    <div
      className={cn(
        'border-b px-4 py-2.5 sm:px-6',
        content.tone === 'amber'
          ? 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30'
          : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
      )}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2">
        <Icon
          className={cn('h-4 w-4 shrink-0', content.tone === 'amber' ? 'text-amber-700 dark:text-amber-400' : 'text-neutral-500 dark:text-neutral-400')}
        />
        <p
          className={cn(
            'min-w-0 flex-1 text-sm',
            content.tone === 'amber' ? 'text-amber-900 dark:text-amber-200' : 'text-neutral-700 dark:text-neutral-200'
          )}
        >
          {content.text}
        </p>
        {content.action && !onPlanPage && (
          <Link
            href={CLINIC_PLAN_PATH}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium',
              content.action === 'Pay now'
                ? 'bg-rh-lime text-rh-ink hover:bg-rh-lime-deep'
                : 'border border-neutral-200 text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800'
            )}
          >
            {content.action}
          </Link>
        )}
      </div>
    </div>
  )
}
