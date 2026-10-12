'use client'

import Link from 'next/link'
import { useClinicPreview } from './ClinicPreviewContext'
import { Clock, Eye, AlertCircle } from 'lucide-react'

/**
 * One calm line explaining why live actions are disabled, with a single next step.
 */
export default function ClinicPreviewBanner() {
  const { isPreviewMode, isPendingApproval, isOnboardingIncomplete, isDeclined } = useClinicPreview()

  if (!isPreviewMode && !isDeclined) {
    return null
  }

  const content = isDeclined
    ? {
        icon: AlertCircle,
        text: 'Your clinic application was not approved. Contact support@rehabify.ng to update your documents.',
        action: null,
      }
    : isPendingApproval
      ? {
          icon: Clock,
          text: "We're reviewing your clinic. You can look around; booking, billing and patient records unlock once you're approved.",
          action: null,
        }
      : {
          icon: Eye,
          text: "You're viewing sample data. Finish setting up your clinic to add real patients and take payments.",
          action: isOnboardingIncomplete ? { href: '/clinic-owner', label: 'Finish setup' } : null,
        }

  const Icon = content.icon

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/30 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2">
        <Icon className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
        <p className="min-w-0 flex-1 text-sm text-amber-900 dark:text-amber-200">{content.text}</p>
        {content.action && (
          <Link
            href={content.action.href}
            className="rounded-md bg-[#005b57] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#00443e]"
          >
            {content.action.label}
          </Link>
        )}
      </div>
    </div>
  )
}
