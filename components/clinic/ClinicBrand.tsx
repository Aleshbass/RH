'use client'

import { useState } from 'react'
import { Building2 } from '@/components/icons'
import { cn } from '@/lib/utils'
import { useClinicAccess } from '@/components/clinic/ClinicAccessContext'

/**
 * The clinic's logo (or initials) and name. Falls back to "Rehabify Clinic" while loading.
 */
export function ClinicBrand({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { clinicName, logoUrl } = useClinicAccess()
  const [logoFailed, setLogoFailed] = useState(false)
  const name = clinicName || 'Rehabify Clinic'
  const initials = clinicName
    ? clinicName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase())
        .join('')
    : null

  return (
    <span className={cn('flex min-w-0 items-center gap-2', className)}>
      {logoUrl && !logoFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          onError={() => setLogoFailed(true)}
          className="h-7 w-7 shrink-0 rounded-md border border-neutral-200 bg-white object-cover dark:border-neutral-800"
        />
      ) : (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#005b57] text-[11px] font-semibold text-white">
          {initials || <Building2 className="h-3.5 w-3.5" />}
        </span>
      )}
      {!compact && (
        <span className="truncate text-sm font-semibold text-neutral-900 dark:text-white" title={name}>
          {name}
        </span>
      )}
    </span>
  )
}

/** Small attribution shown at the bottom of the clinic dashboard. */
export function PoweredByRehabify({ className }: { className?: string }) {
  return (
    <p className={cn('text-[11px] text-neutral-400 dark:text-neutral-500', className)}>
      Powered by{' '}
      <a
        href="https://physioaroundme.com"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-neutral-500 hover:text-[#005b57] dark:text-neutral-400 dark:hover:text-[#2dd4bf]"
      >
        Rehabify Health
      </a>
    </p>
  )
}
