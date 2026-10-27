'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import Link from 'next/link'
import { HOW_YOU_WORK_HREF } from '@/components/physio/practiceMode'
import { Plus, X } from '@/components/icons'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/** Title + short explanation at the top of each settings page. */
export function SettingsPageHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-rh-ink dark:text-white">{title}</h1>
      {description && <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>}
    </div>
  )
}

/** A grouped card, like a section in Apple's Settings. */
export function SettingsSection({
  id,
  title,
  description,
  children,
  footer,
  className,
}: {
  id?: string
  title?: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      className={cn(
        'scroll-mt-24 overflow-hidden rounded-2xl border border-black/[0.04] bg-white shadow-soft dark:border-white/[0.06] dark:bg-rh-ink-2 dark:shadow-none',
        className
      )}
    >
      {(title || description) && (
        <div className="px-4 pb-1 pt-4 sm:px-6">
          {title && <h2 className="text-[15px] font-semibold tracking-tight text-rh-ink dark:text-white">{title}</h2>}
          {description && <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{description}</p>}
        </div>
      )}
      <div className="p-4 sm:p-6">{children}</div>
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-2 bg-rh-canvas/70 px-4 py-3 dark:bg-white/[0.02] sm:px-6">
          {footer}
        </div>
      )}
    </section>
  )
}

/**
 * For pages about Rehabify Care (prices, payouts, services, network terms) that an independent
 * physio can still reach by URL: a short note instead of the page.
 */
export function OwnPatientsOnlyNotice({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <SettingsPageHeader title={title} />
      <SettingsSection>
        <OwnPatientsOnlyText />
      </SettingsSection>
    </div>
  )
}

export function OwnPatientsOnlyText() {
  return (
    <p className="text-sm text-neutral-600 dark:text-neutral-400">
      You see your own patients only, so Rehabify prices and payouts don’t apply to you.{' '}
      <Link href={HOW_YOU_WORK_HREF} className="font-medium text-rh-ink hover:underline dark:text-rh-lime">
        Change this in How you work
      </Link>
      .
    </p>
  )
}

export const fieldLabelClass = 'text-sm font-medium text-neutral-700 dark:text-neutral-300'
export const fieldHintClass = 'mt-1 text-xs text-neutral-500 dark:text-neutral-400'

export const COMMON_SPECIALISATIONS = [
  'Orthopaedic',
  'Sports',
  'Neurological',
  'Paediatric',
  'Geriatric',
  'Cardiopulmonary',
  'Women’s health',
  'Post-surgical rehab',
  'Back and neck pain',
]

/**
 * Tap-to-toggle chips for common specialisations, plus a field for anything else.
 */
export function SpecialisationPicker({
  value,
  onChange,
}: {
  value: string[]
  onChange: (next: string[]) => void
}) {
  const [custom, setCustom] = useState('')
  const lower = value.map((v) => v.toLowerCase())
  const toggle = (item: string) => {
    onChange(lower.includes(item.toLowerCase()) ? value.filter((v) => v.toLowerCase() !== item.toLowerCase()) : [...value, item])
  }
  const addCustom = () => {
    const trimmed = custom.trim()
    if (trimmed && !lower.includes(trimmed.toLowerCase())) onChange([...value, trimmed])
    setCustom('')
  }
  const extras = value.filter((v) => !COMMON_SPECIALISATIONS.some((c) => c.toLowerCase() === v.toLowerCase()))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {[...COMMON_SPECIALISATIONS, ...extras].map((item) => {
          const selected = lower.includes(item.toLowerCase())
          return (
            <button
              key={item}
              type="button"
              onClick={() => toggle(item)}
              aria-pressed={selected}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-all active:scale-95',
                selected
                  ? 'border-rh-lime bg-rh-lime text-rh-ink shadow-sm dark:border-rh-lime dark:bg-rh-lime dark:text-rh-ink'
                  : 'border-black/[0.08] bg-white text-neutral-700 hover:border-rh-lime/40 hover:bg-rh-honeydew dark:border-white/10 dark:bg-transparent dark:text-neutral-300 dark:hover:bg-white/[0.05]'
              )}
            >
              {item}
              {selected && extras.includes(item) && <X className="h-3 w-3" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
      <div className="flex gap-2">
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addCustom()
            }
          }}
          placeholder="Add another"
          aria-label="Add another specialisation"
          className="h-10"
        />
        <Button type="button" variant="outline" onClick={addCustom} className="h-10 shrink-0" disabled={!custom.trim()}>
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>
    </div>
  )
}
