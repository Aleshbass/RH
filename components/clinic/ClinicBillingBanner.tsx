'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { format } from 'date-fns'
import { AlertCircle, Info, Lock } from '@/components/icons'
import { formatKobo, type ClinicBillingBanner as Banner } from '@/lib/clinicSubscriptions'
import { ClinicNotice, noticeActionClass, noticeSecondaryClass } from '@/components/clinic/ClinicStatusBanner'

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
          tone: 'ink' as const,
          icon: Lock,
          text: (
            <>
              <span className="font-semibold">Your clinic is read-only because a Rehabify invoice is overdue.</span> You can still view and
              export everything, bill your patients and remove team members, and your patients keep their programmes.{' '}
              {banner.canPay ? 'Paying lifts this straight away.' : 'Ask the clinic owner to pay it.'}
            </>
          ),
          action: banner.canPay ? 'Pay now' : null,
        }
      : banner.kind === 'past_due'
        ? {
            tone: 'ink' as const,
            icon: AlertCircle,
            text: (
              <>
                <span className="font-semibold">A Rehabify invoice of {owed} is overdue.</span>{' '}
                {banner.readOnlyFrom
                  ? `Please pay it before ${format(new Date(banner.readOnlyFrom), 'd MMMM')}, when your account would become read-only.`
                  : 'Please pay it to keep everything running.'}
              </>
            ),
            action: 'Pay now',
          }
        : banner.kind === 'allowance_100'
          ? {
              tone: 'ink' as const,
              icon: Info,
              text: (
                <>
                  <span className="font-semibold">You&apos;ve reached your {banner.allowance} active patient programmes.</span> Each extra one is
                  ₦500 this month, or you can ask to upgrade.
                </>
              ),
              action: 'See your plan',
            }
          : {
              tone: 'quiet' as const,
              icon: Info,
              text: (
                <>
                  <span className="font-semibold">You&apos;ve used 80% of your active patient programmes.</span> Each one over {banner.allowance} is
                  ₦500 a month.
                </>
              ),
              action: 'See your plan',
            }

  return (
    <ClinicNotice
      tone={content.tone}
      icon={content.icon}
      action={
        content.action && !onPlanPage ? (
          <Link href={CLINIC_PLAN_PATH} className={content.action === 'Pay now' ? noticeActionClass : noticeSecondaryClass}>
            {content.action}
          </Link>
        ) : undefined
      }
    >
      {content.text}
    </ClinicNotice>
  )
}
