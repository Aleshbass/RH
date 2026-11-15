'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { ChevronRight, ShieldAlert } from '@/components/icons'
import { safetyApi } from './safetyApi'

/** Red strip across the admin console while a home-visit safety alert is open. */
export function SafetyAlertBanner() {
  const open = useQuery(safetyApi.adminOpenAlerts, {})
  if (!open || open.count === 0 || !open.newest) return null
  const what = open.newest.kind === 'panic' ? 'pressed the help button' : 'didn’t answer after a home visit'
  return (
    <Link
      href="/dashboard/admin/safety"
      className="mx-4 mt-2 flex items-center gap-3 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white sm:mx-6 lg:mx-8"
    >
      <ShieldAlert className="h-5 w-5 shrink-0 animate-pulse" />
      <span className="min-w-0 flex-1">
        {open.newest.physioName} {what}.{open.count > 1 ? ` ${open.count} open alerts.` : ''} Call them now.
      </span>
      <ChevronRight className="h-4 w-4 shrink-0" />
    </Link>
  )
}
