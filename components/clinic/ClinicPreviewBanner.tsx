'use client'

import Link from 'next/link'
import { useClinicPreview } from './ClinicPreviewContext'
import { Clock, Eye, AlertCircle } from 'lucide-react'

/**
 * One calm line explaining why live actions are disabled, with a single next step.
 */
export default function ClinicPreviewBanner() {
  const { isPreviewMode, isPendingApproval, isOnboardingIncomplete, isDeclined, isStaff, isSuspended, isLoaded } =
    useClinicPreview()

  if (!isLoaded || (!isPreviewMode && !isDeclined)) {
    return null
  }

  const content = isSuspended
    ? {
        icon: AlertCircle,
        text: 'The clinic owner has paused your access. You can look around, but changes are turned off.',
        action: null,
      }
    : isStaff && (isDeclined || isOnboardingIncomplete)
    ? {
        icon: Clock,
        text: "The clinic isn't fully set up yet, so changes are turned off. The clinic owner can finish it.",
        action: null,
      }
    : isDeclined
    ? {
        icon: AlertCircle,
        text: 'Your clinic application was not approved. Contact support@rehabify.ng to update your documents.',
        action: null,
      }
    : isPendingApproval
      ? {
          icon: Clock,
          text: isStaff
            ? 'Rehabify is still verifying this clinic. You can look around; changes unlock once it is approved.'
            : "We're reviewing your clinic. You can look around; booking, billing and patient records unlock once you're approved.",
          action: null,
        }
      : {
          icon: Eye,
          text: "You're viewing sample data. Finish setting up your clinic to add real patients and take payments.",
          // Signed-out visitors are asked to sign in there and brought straight back
          action: { href: '/clinic-owner', label: isOnboardingIncomplete ? 'Finish setup' : 'Set up your clinic' },
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
