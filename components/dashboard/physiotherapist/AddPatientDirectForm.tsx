'use client'

import { useState } from 'react'
import { useAction } from 'convex/react'
import { Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
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

interface AddPatientDirectFormProps {
  onSuccess?: () => void
  onCancel?: () => void
}

/**
 * Invite a patient by email. They join Rehabify with the link and appear in the physio's
 * patients once they accept. The physio says where the patient came from, which is kept on
 * the patient's record and care episode.
 */
export default function AddPatientDirectForm({ onSuccess, onCancel }: AddPatientDirectFormProps) {
  const createInvitation = useAction(api.actions.patients.invitePatient.createPatientInvitationWithNotification)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
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
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Enter a valid email address'
    if (!source) next.source = 'Choose where this patient came from'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    try {
      const result = await createInvitation({
        patientEmail: email.trim().toLowerCase(),
        patientName: `${firstName.trim()} ${lastName.trim()}`,
        notes: note.trim() || undefined,
        sendEmail: true,
        source: source!,
        referredBy: source === 'referred' ? referredBy.trim() || undefined : undefined,
      })
      if (!result?.success) throw new Error(result?.message || 'We couldn’t send the invitation.')
      playSound('success')
      toast.success(`Invitation sent to ${firstName.trim()}`, {
        description: 'They’ll appear in your patients once they accept.',
      })
      onSuccess?.()
    } catch (error) {
      toast.error((error as Error).message || 'We couldn’t send the invitation. Try again.')
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

      <div>
        <Label htmlFor="ap-email">Email</Label>
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
                    ? 'border-rh-teal bg-rh-mist ring-1 ring-rh-teal dark:border-rh-aqua dark:bg-rh-aqua/10 dark:ring-rh-aqua'
                    : 'border-black/[0.08] hover:border-rh-teal/40 hover:bg-rh-canvas dark:border-white/10 dark:hover:bg-white/[0.04]'
                )}
              >
                <span className="block text-sm font-semibold text-rh-night dark:text-white">{option.title}</span>
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
        We’ll email {firstName.trim() || 'them'} an invitation to join Rehabify. They appear in your patients once they accept.
      </p>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
          Send invitation
        </Button>
      </div>
    </form>
  )
}
