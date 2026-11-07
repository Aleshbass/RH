'use client'

import { Mail, Phone, WhatsApp } from '@/components/icons'
import { StatusBadge } from '@/components/admin/ui'
import { cn } from '@/lib/utils'
import { FORMAT_LABEL, MISSING_LABEL, SOURCE_LABEL, placeText, type PatientFactsRow, type PatientSource } from './patientApi'

const SOURCE_TONE: Record<PatientSource, 'green' | 'teal' | 'amber' | 'red' | 'neutral'> = {
  joy: 'green',
  doctor: 'teal',
  partner: 'teal',
  clinic: 'neutral',
  physio: 'neutral',
  find_a_physio: 'teal',
  website: 'amber',
}

/** Where the patient came from, as tags. */
export function SourceTags({ sources, className }: { sources: PatientSource[]; className?: string }) {
  return (
    <span className={cn('inline-flex flex-wrap gap-1', className)}>
      {sources.map((s) => (
        <StatusBadge key={s} tone={SOURCE_TONE[s]}>
          {SOURCE_LABEL[s]}
        </StatusBadge>
      ))}
    </span>
  )
}

/** "34 · Lekki, Lagos · Low back pain · Home visit", with what's missing flagged. */
export function FactsLine({ facts, className }: { facts: PatientFactsRow; className?: string }) {
  const place = placeText(facts)
  const parts = [
    facts.age !== null ? `${facts.age} yrs` : null,
    facts.gender && facts.gender !== 'prefer_not_to_say' ? facts.gender[0].toUpperCase() + facts.gender.slice(1) : null,
    place || null,
    facts.complaint,
    facts.format ? FORMAT_LABEL[facts.format] : null,
    facts.language && !/^en/i.test(facts.language) ? facts.language : null,
  ].filter(Boolean)
  return (
    <div className={cn('space-y-1', className)}>
      {parts.length > 0 && <p className="text-sm text-rh-ink/85 dark:text-white/85">{parts.join(' · ')}</p>}
      {(facts.redFlags.length > 0 || facts.triageLevel === 'red') && (
        <p className="text-xs font-semibold text-rose-600 dark:text-rose-300">
          Red flag{facts.redFlags.length > 1 ? 's' : ''}: {facts.redFlags.join('; ') || 'triaged red'}. Urgent care, not routine booking.
        </p>
      )}
      {facts.missing.length > 0 && (
        <p className="text-xs text-[#b4690e] dark:text-amber-300">Missing: {facts.missing.map((m) => MISSING_LABEL[m] ?? m).join(', ')}</p>
      )}
    </div>
  )
}

/** wa.me wants the international number without "+"; Nigerian local numbers start with 0. */
export function whatsappDigits(phone: string | null) {
  let digits = (phone ?? '').replace(/\D/g, '')
  if (digits.startsWith('0')) digits = `234${digits.slice(1)}`
  return digits.length >= 10 ? digits : null
}

const pill =
  'inline-flex items-center gap-1.5 rounded-full bg-rh-canvas px-3 py-1.5 text-xs font-semibold text-rh-ink hover:bg-rh-honeydew dark:bg-white/[0.06] dark:text-white'

export function ContactButtons({ phone, email }: { phone: string | null; email: string | null }) {
  const wa = whatsappDigits(phone)
  return (
    <>
      {wa && (
        <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className={pill}>
          <WhatsApp className="h-3.5 w-3.5 text-[#25D366]" /> WhatsApp
        </a>
      )}
      {phone && (
        <a href={`tel:${phone}`} className={pill}>
          <Phone className="h-3.5 w-3.5" /> {phone}
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className={pill}>
          <Mail className="h-3.5 w-3.5" /> Email
        </a>
      )}
    </>
  )
}

export const pillClass = pill
