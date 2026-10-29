'use client'

import { useState } from 'react'
import { Building2 } from '@/components/icons'
import { cn } from '@/lib/utils'
import { useClinicAccess } from '@/components/clinic/ClinicAccessContext'

/**
 * The clinic's logo (or initials) and name, with "on Rehabify" under it, as in the physio
 * portal's clinic mode. Falls back to "Your clinic" while loading.
 */
export function ClinicBrand({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { clinicName, logoUrl } = useClinicAccess()
  const [logoFailed, setLogoFailed] = useState(false)
  const name = clinicName || 'Your clinic'
  const initials = clinicName
    ? clinicName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase())
        .join('')
    : null

  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      {logoUrl && !logoFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          onError={() => setLogoFailed(true)}
          className="h-8 w-8 shrink-0 rounded-lg border border-pt-line bg-pt-surface object-cover"
        />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pt-primary text-xs font-bold text-pt-on-primary">
          {initials || <Building2 className="h-3.5 w-3.5" />}
        </span>
      )}
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold leading-tight text-pt-ink" title={name}>
            {name}
          </span>
          <span className="block text-[11px] leading-tight text-pt-faint">on Rehabify</span>
        </span>
      )}
    </span>
  )
}

/** Small attribution at the foot of the clinic menu. */
export function PoweredByRehabify({ className }: { className?: string }) {
  return (
    <p className={cn('text-[11px] text-pt-faint', className)}>
      Powered by{' '}
      <a
        href="https://physioaroundme.com"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-pt-muted hover:text-pt-ink"
      >
        Rehabify Health
      </a>
    </p>
  )
}
