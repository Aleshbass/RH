'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { Loader2, UserPlus } from '@/components/icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { primaryButtonClass } from '@/components/physio/ui'
import { cn } from '@/lib/utils'
import { playSound } from '@/lib/sounds'

type Source = 'referred' | 'existing_patient'

const SOURCES: { value: Source; title: string; hint: string }[] = [
  { value: 'referred', title: 'Referred to me', hint: 'By a doctor, hospital or another clinician' },
  { value: 'existing_patient', title: 'My existing patient', hint: 'Someone I already treat' },
]

type AddResult =
  | { mode: 'added'; patientId: string; name: string; invited: boolean; patientNumber?: string | null }
  | { mode: 'existing'; patientId: string; name: string; invited: false }
  | { mode: 'invited'; patientId: null; name: string; invited: true; patientNumber?: string | null }

// By name: the generated `api` type is at TypeScript's depth limit
const addPatientRecordRef = makeFunctionReference<
  'mutation',
  {
    firstName: string
    lastName: string
    phoneNumber?: string
    email?: string
    source?: Source
    referredBy?: string
    note?: string
  },
  AddResult
>('physioPatients:addPatientRecord')

/** A patient who is on your list now and can be booked straight away. */
export type AddedPatient = { patientId: string; name: string }

interface AddPatientDirectFormProps {
  onSuccess?: () => void
  /** The patient is on your list now (new, or already yours): e.g. the booking drawer books them next */
  onAdded?: (patient: AddedPatient) => void
  onCancel?: () => void
}

function errorText(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === 'string') return error.data
  return 'We couldn’t add the patient. Try again.'
}

/**
 * Add a patient to your list. Name and phone are required; email is optional (many patients have
 * none). Next the physio sends their personal link on WhatsApp (components/patient-join): they
 * join with their phone number and a PIN. Someone already on Rehabify by email is invited instead,
 * and appears once they accept (their record is never linked just by typing their email).
 */
export default function AddPatientDirectForm({ onSuccess, onAdded, onCancel }: AddPatientDirectFormProps) {
  const addPatient = useMutation(addPatientRecordRef)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [source, setSource] = useState<Source | null>(null)
  const [referredBy, setReferredBy] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (!firstName.trim()) next.firstName = 'Enter their first name'
    if (!lastName.trim()) next.lastName = 'Enter their last name'
    if (phone.replace(/\D/g, '').length < 10) next.phone = 'Enter their phone number. They join and sign in with it'
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Check the email address, or leave it empty'
    if (!source) next.source = 'Choose where this patient came from'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    try {
      const result = await addPatient({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: phone.trim(),
        email: email.trim().toLowerCase() || undefined,
        source: source!,
        referredBy: source === 'referred' ? referredBy.trim() || undefined : undefined,
        note: note.trim() || undefined,
      })
      playSound('success')
      if (result.mode === 'invited') {
        toast.success(`Invitation sent to ${firstName.trim()}`, {
          description: `${result.patientNumber ? `Already on Rehabify as ${result.patientNumber}. ` : 'Already on Rehabify. '}They appear in your patients once they accept.`,
        })
        onSuccess?.()
        return
      }
      if (result.mode === 'existing') {
        toast.success(`${result.name} is already your patient`)
      } else {
        toast.success(result.patientNumber ? `${result.name} added · ${result.patientNumber}` : `${result.name} added`)
      }
      onAdded?.({ patientId: result.patientId, name: result.name })
      onSuccess?.()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setSubmitting(false)
    }
  }

  const fieldError = (key: string) =>
    errors[key] ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[key]}</p> : null

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ap-first">First name</Label>
          <Input id="ap-first" className="mt-1.5" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off" />
          {fieldError('firstName')}
        </div>
        <div>
          <Label htmlFor="ap-last">Last name</Label>
          <Input id="ap-last" className="mt-1.5" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" />
          {fieldError('lastName')}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ap-phone">
            Phone <span className="font-normal text-neutral-400">(their WhatsApp number)</span>
          </Label>
          <Input
            id="ap-phone"
            className="mt-1.5"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0801 234 5678"
            autoComplete="off"
          />
          {fieldError('phone')}
        </div>
        <div>
          <Label htmlFor="ap-email">
            Email <span className="font-normal text-neutral-400">(if they have one)</span>
          </Label>
          <Input
            id="ap-email"
            className="mt-1.5"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="patient@example.com"
            autoComplete="off"
          />
          {fieldError('email')}
        </div>
      </div>

      <div>
        <Label>Where did this patient come from?</Label>
        <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup">
          {SOURCES.map((option) => {
            const selected = source === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setSource(option.value)}
                className={cn(
                  'rounded-2xl border p-3 text-left transition-all active:scale-[0.98]',
                  selected
                    ? 'border-rh-lime bg-rh-honeydew ring-1 ring-rh-lime dark:border-rh-lime dark:bg-white/[0.06] dark:ring-rh-lime'
                    : 'border-black/[0.08] hover:border-rh-lime/40 hover:bg-rh-canvas dark:border-white/10 dark:hover:bg-white/[0.04]'
                )}
              >
                <span className="block text-sm font-semibold text-rh-ink dark:text-white">{option.title}</span>
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">{option.hint}</span>
              </button>
            )
          })}
        </div>
        {fieldError('source')}
      </div>

      {source === 'referred' && (
        <div>
          <Label htmlFor="ap-ref">Referred by (optional)</Label>
          <Input
            id="ap-ref"
            className="mt-1.5"
            value={referredBy}
            onChange={(e) => setReferredBy(e.target.value)}
            placeholder="e.g. Dr Okafor, LUTH Orthopaedics"
          />
        </div>
      )}

      <div>
        <Label htmlFor="ap-note">Note (optional)</Label>
        <Textarea
          id="ap-note"
          className="mt-1.5 resize-none"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything to remember, e.g. what they're coming in for"
        />
      </div>

      <p className="rounded-xl bg-rh-canvas px-3 py-2 text-xs text-neutral-600 dark:bg-white/[0.04] dark:text-neutral-400">
        {`${firstName.trim() || 'They'}’ll be on your list now. Next, send them their link on WhatsApp: they join with their phone number and a PIN, no email needed.`}
      </p>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
          Add patient
        </Button>
      </div>
    </form>
  )
}
