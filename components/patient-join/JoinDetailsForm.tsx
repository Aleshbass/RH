'use client'

import Link from 'next/link'
import { useState, type FormEvent, type ReactNode } from 'react'
import { AuthField, FormNotice, PrimaryButton, SPACE } from '@/components/auth/AuthControls'
import { weakPinReason } from '@/lib/auth/pin'
import { PATIENT_CONSENT_POLICIES, policyVersions } from '@/lib/policies'
import { cn } from '@/lib/utils'
import { PinField } from './PinField'

export type JoinDetails = {
  firstName: string
  lastName: string
  phone: string
  email?: string
  pin: string
  accepted: Record<string, string>
}

/**
 * Name, phone, (optional email) and a new 4-digit PIN, then one button. Tapping it accepts the
 * Terms and Privacy Policy, recorded with the versions shown here.
 */
export function JoinDetailsForm({
  initial,
  showEmail = false,
  submitLabel,
  pinLabel = 'Choose a 4-digit PIN',
  pinHint = 'You’ll sign in with your phone number and this PIN.',
  onSubmit,
  formError,
  children,
}: {
  initial?: { firstName?: string; lastName?: string; phone?: string }
  showEmail?: boolean
  submitLabel: string
  pinLabel?: string
  pinHint?: string
  /** Resolves to a field error to show, or null when it went through */
  onSubmit: (details: JoinDetails) => Promise<{ field?: 'name' | 'phone' | 'pin'; message: string } | null>
  formError?: ReactNode
  children?: ReactNode
}) {
  const [firstName, setFirstName] = useState(initial?.firstName ?? '')
  const [lastName, setLastName] = useState(initial?.lastName ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<{ field?: 'name' | 'phone' | 'pin'; message: string } | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim()) return setError({ field: 'name', message: 'Enter your first and last name.' })
    if (phone.replace(/\D/g, '').length < 10) return setError({ field: 'phone', message: 'Enter your phone number, e.g. 0803 123 4567.' })
    const weak = weakPinReason(pin, phone)
    if (weak) return setError({ field: 'pin', message: weak })
    setPending(true)
    setError(null)
    try {
      const problem = await onSubmit({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: showEmail ? email.trim() || undefined : undefined,
        pin,
        accepted: policyVersions(PATIENT_CONSENT_POLICIES),
      })
      if (problem) setError(problem)
    } finally {
      setPending(false)
    }
  }

  const fieldError = (field: 'name' | 'phone' | 'pin') => (error?.field === field ? error.message : undefined)

  return (
    <form onSubmit={submit} noValidate className={cn('flex flex-col', SPACE.section, SPACE.fields)}>
      <div className="grid grid-cols-2 gap-[clamp(8px,1.4dvh,12px)]">
        <AuthField
          id="join-first"
          label="First name"
          autoComplete="given-name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          error={fieldError('name')}
        />
        <AuthField id="join-last" label="Last name" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
      </div>
      <AuthField
        id="join-phone"
        label="Phone number"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="0803 123 4567"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={fieldError('phone')}
      />
      {showEmail && (
        <AuthField
          id="join-email"
          label="Email (optional)"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="Only if you use one"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      )}
      <div>
        <PinField id="join-pin" label={pinLabel} value={pin} onChange={setPin} error={fieldError('pin')} choosing />
        {!fieldError('pin') && <p className="px-1 pt-1 text-xs text-rh-night/55">{pinHint}</p>}
      </div>
      {error && !error.field && <FormNotice>{error.message}</FormNotice>}
      {formError}
      <PrimaryButton loading={pending} className="mt-1">
        {submitLabel}
      </PrimaryButton>
      <p className="px-1 text-center text-xs leading-relaxed text-rh-night/55">
        By tapping {submitLabel} you agree to our{' '}
        <Link href="/terms-and-conditions" target="_blank" className="font-semibold text-rh-teal underline-offset-2 hover:underline">
          Terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy-policy" target="_blank" className="font-semibold text-rh-teal underline-offset-2 hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
      {children}
    </form>
  )
}
