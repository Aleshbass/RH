'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Loader2, UserPlus } from '@/components/icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { primaryButtonClass } from '@/components/physio/ui'
import { DuplicateHint, formatLocalPhone, useDuplicateCheck } from '@/components/patient-join/useDuplicateCheck'
import { cn } from '@/lib/utils'
import { playSound } from '@/lib/sounds'

type Source = 'referred' | 'existing_patient'

const SOURCES: { value: Source; title: string; hint: string }[] = [
  { value: 'existing_patient', title: 'My existing patient', hint: 'Someone I already treat' },
  { value: 'referred', title: 'Referred to me', hint: 'By a doctor, hospital or another clinician' },
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
 * Add a patient: their WhatsApp number first (checked against your list as you type, so nobody is
 * added twice), then their name. Email, where they came from and a note are optional, tucked away.
 * Next the physio sends their personal link on WhatsApp (components/patient-join): they join with
 * their phone number and a PIN. Someone already on Rehabify by email is invited instead.
 */
export default function AddPatientDirectForm({ onSuccess, onAdded, onCancel }: AddPatientDirectFormProps) {
  const addPatient = useMutation(addPatientRecordRef)
  const [phone, setPhone] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [source, setSource] = useState<Source>('existing_patient')
  const [referredBy, setReferredBy] = useState('')
  const [note, setNote] = useState('')
  const [more, setMore] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const duplicate = useDuplicateCheck(phone)

  const useExisting = () => {
    if (!duplicate) return
    playSound('success')
    onAdded?.({ patientId: duplicate.patientId, name: duplicate.name })
    onSuccess?.()
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (phone.replace(/\D/g, '').length < 10) next.phone = 'Enter their WhatsApp number. They join and sign in with it'
    if (!firstName.trim()) next.firstName = 'Enter their first name'
    if (!lastName.trim()) next.lastName = 'Enter their last name'
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      next.email = 'Check the email address, or leave it empty'
      setMore(true)
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    try {
      const result = await addPatient({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: phone.trim(),
        email: email.trim().toLowerCase() || undefined,
        source,
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
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="ap-phone">WhatsApp number</Label>
        <Input
          id="ap-phone"
          className="mt-1.5 h-11 text-[15px]"
          type="tel"
          inputMode="tel"
          autoFocus
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => setPhone((value) => formatLocalPhone(value))}
          placeholder="0803 123 4567"
          autoComplete="off"
        />
        {fieldError('phone')}
        <DuplicateHint duplicate={duplicate} onUse={useExisting} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="ap-first">First name</Label>
          <Input id="ap-first" className="mt-1.5 h-11" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off" />
          {fieldError('firstName')}
        </div>
        <div>
          <Label htmlFor="ap-last">Last name</Label>
          <Input id="ap-last" className="mt-1.5 h-11" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" />
          {fieldError('lastName')}
        </div>
      </div>

      <div className="rounded-2xl border border-black/[0.06] dark:border-white/10">
        <button
          type="button"
          onClick={() => setMore((open) => !open)}
          aria-expanded={more}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-rh-ink dark:text-white"
        >
          <span>
            More details <span className="font-normal text-neutral-500 dark:text-neutral-400">(optional)</span>
          </span>
          <ChevronDown className={cn('h-4 w-4 text-neutral-400 transition-transform duration-200', more && 'rotate-180')} />
        </button>
        <AnimatePresence initial={false}>
          {more && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="space-y-4 px-4 pb-4">
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
                <div>
                  <Label>Where did they come from?</Label>
                  <div className="mt-1.5 grid grid-cols-2 gap-2" role="radiogroup">
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
                              ? 'border-rh-lime bg-rh-honeydew ring-1 ring-rh-lime dark:bg-white/[0.06]'
                              : 'border-black/[0.08] hover:border-rh-lime/40 dark:border-white/10'
                          )}
                        >
                          <span className="block text-sm font-semibold text-rh-ink dark:text-white">{option.title}</span>
                          <span className="block text-xs text-neutral-500 dark:text-neutral-400">{option.hint}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                {source === 'referred' && (
                  <div>
                    <Label htmlFor="ap-ref">Referred by</Label>
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
                  <Label htmlFor="ap-note">Note</Label>
                  <Textarea
                    id="ap-note"
                    className="mt-1.5 resize-none"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Anything to remember, e.g. what they're coming in for"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting} className={cn(primaryButtonClass, 'h-11 sm:min-w-[180px]')}>
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
          Add and continue
        </Button>
      </div>
    </form>
  )
}
