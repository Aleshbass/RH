'use client'

import { useState } from 'react'
import { Eye, EyeOff } from '@/components/icons'
import { AuthField } from '@/components/auth/AuthControls'
import { PIN_LENGTH } from '@/lib/auth/pin'
import { cn } from '@/lib/utils'

/**
 * The 4-digit PIN. Shown while choosing one (so a typo is easy to spot), hidden when signing in.
 * Calls `onComplete` once the fourth digit is typed.
 */
export function PinField({
  id,
  label,
  value,
  onChange,
  onComplete,
  error,
  choosing = false,
  autoFocus,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  error?: string
  choosing?: boolean
  autoFocus?: boolean
  disabled?: boolean
}) {
  const [visible, setVisible] = useState(choosing)
  return (
    <AuthField
      id={id}
      label={label}
      error={error}
      value={value}
      disabled={disabled}
      autoFocus={autoFocus}
      type={visible ? 'text' : 'password'}
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete={choosing ? 'new-password' : 'current-password'}
      maxLength={PIN_LENGTH}
      placeholder="••••"
      onChange={(e) => {
        const next = e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH)
        onChange(next)
        if (next.length === PIN_LENGTH && value.length < PIN_LENGTH) onComplete?.(next)
      }}
      inputClassName={cn('h-[clamp(34px,5.2dvh,42px)] pb-1.5 text-[24px] tracking-[0.6em] placeholder:tracking-[0.6em]')}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide PIN' : 'Show PIN'}
          aria-pressed={visible}
          className="flex h-9 w-9 items-center justify-center rounded-full text-rh-night/45 transition hover:bg-rh-night/[0.05] hover:text-rh-night focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-teal/40"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      }
    />
  )
}
