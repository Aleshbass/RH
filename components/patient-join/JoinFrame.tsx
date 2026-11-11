'use client'

import Image from 'next/image'
import type { ReactNode } from 'react'
import { Loader2 } from '@/components/icons'
import { AuthShell } from '@/components/auth/AuthShell'
import { SPACE, StepHeading } from '@/components/auth/AuthControls'
import { cn } from '@/lib/utils'

/** The physio (and clinic) the patient is joining: a face they recognise builds trust. */
export function SenderRow({ name, imageUrl, clinicName }: { name: string | null; imageUrl: string | null; clinicName: string | null }) {
  if (!name && !clinicName) return null
  const initials =
    (name ?? clinicName ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'R'
  return (
    <div className="mb-[clamp(12px,2.4dvh,20px)] flex items-center gap-3 rounded-2xl bg-rh-honeydew px-3.5 py-2.5 ring-1 ring-inset ring-rh-mint">
      {imageUrl ? (
        <Image src={imageUrl} alt="" width={40} height={40} unoptimized className="h-10 w-10 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rh-night text-sm font-semibold text-rh-lime">
          {initials}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-rh-night">{name ?? clinicName}</p>
        <p className="truncate text-xs text-rh-night/60">{name && clinicName ? clinicName : 'Your physiotherapist'}</p>
      </div>
    </div>
  )
}

/** A message screen (link used, expired, signed in elsewhere…) in the sign-in frame. */
export function JoinMessage({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <AuthShell>
      <StepHeading eyebrow="Rehabify" title={title} subtitle={children} />
      {actions && <div className={cn('flex flex-col gap-3', SPACE.section)}>{actions}</div>}
    </AuthShell>
  )
}

export function JoinLoading() {
  return (
    <AuthShell>
      <p role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-rh-night/60">
        <Loader2 className="h-4 w-4 animate-spin" />
        Opening…
      </p>
    </AuthShell>
  )
}

export const primaryLinkClass =
  'inline-flex h-[clamp(44px,6.4dvh,52px)] w-full items-center justify-center gap-2 rounded-full bg-rh-night px-6 text-[15px] font-semibold text-white transition hover:bg-rh-teal-deep active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rh-teal/25'
export const secondaryLinkClass =
  'inline-flex h-[clamp(44px,6.4dvh,52px)] w-full items-center justify-center gap-2 rounded-full border border-rh-night/10 bg-white px-6 text-[15px] font-semibold text-rh-night transition hover:border-rh-night/20 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rh-teal/25'
