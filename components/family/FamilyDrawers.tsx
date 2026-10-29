'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Check, Loader2, WhatsApp } from '@/components/icons'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { PatientDrawer, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/components/patient/ui'
import { joyWhatsAppUrl } from '@/lib/joyWhatsApp'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { RELATIONSHIPS, careRefs } from './refs'

function errorText(err: unknown, fallback: string) {
  const data = (err as { data?: unknown })?.data
  if (typeof data === 'string' && data.trim()) return data
  const message = (err as Error)?.message ?? ''
  return message && !message.includes('Server Error') && !message.includes('[CONVEX') ? message : fallback
}

function Chips<T extends string>({ options, value, onChange, label }: { options: readonly { value: T; label: string }[]; value: T | null; onChange: (value: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-full border px-3.5 py-1.5 text-sm transition active:scale-[0.98]',
            value === option.value ? 'border-pt-primary bg-pt-primary font-medium text-pt-on-primary' : 'border-pt-line bg-pt-surface text-pt-muted hover:border-pt-line-strong hover:text-pt-ink'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** A Joy message that starts finding a physio for the person, with what Joy needs to know. */
export function findPhysioWithJoy(name: string, relationship: string, city?: string | null) {
  return joyWhatsAppUrl(
    `Hi Joy, I'm booking physiotherapy for my ${relationship.toLowerCase()}, ${name}${city ? `, in ${city}` : ''}. Can you help me find a physio?`
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Add someone I care for
// ─────────────────────────────────────────────────────────────────────────────

const GENDERS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
] as const

export function AddPersonDrawer({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (open: boolean) => void; onAdded: (patientId: Id<'users'>) => void }) {
  const addPerson = useMutation(careRefs.addPerson)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [relationship, setRelationship] = useState<string>('')
  const [other, setOther] = useState('')
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState<'female' | 'male' | 'other' | null>(null)
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [condition, setCondition] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setFirstName('')
    setLastName('')
    setRelationship('')
    setOther('')
    setDob('')
    setGender(null)
    setPhone('')
    setCity('')
    setCondition('')
  }

  const save = async () => {
    const rel = relationship === 'Other' ? other.trim() : relationship
    if (!firstName.trim() || !lastName.trim()) return toast.error('Add their first and last name')
    if (!rel) return toast.error('Choose how you’re related')
    setSaving(true)
    try {
      const { patientId } = await addPerson({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        relationship: rel,
        dateOfBirth: dob || undefined,
        gender: gender ?? undefined,
        phone: phone.trim() || undefined,
        city: city.trim() || undefined,
        condition: condition.trim() || undefined,
      })
      playSound('success')
      toast.success(`${firstName.trim()} added`, { description: 'You manage their care here.' })
      reset()
      onOpenChange(false)
      onAdded(patientId)
    } catch (err) {
      playSound('error')
      toast.error(errorText(err, 'Could not add them. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PatientDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      title="Add someone you care for"
      description="For a parent, child or relative whose care you arrange. You manage their profile."
      footer={
        <Button className={cn(primaryButtonClass, 'h-11 w-full')} disabled={saving} onClick={() => void save()}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Add them
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="person-first" className="text-xs font-medium text-pt-ink">
              First name
            </Label>
            <Input id="person-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={cn(fieldClass, 'h-11')} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-last" className="text-xs font-medium text-pt-ink">
              Last name
            </Label>
            <Input id="person-last" value={lastName} onChange={(e) => setLastName(e.target.value)} className={cn(fieldClass, 'h-11')} autoComplete="off" />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-pt-ink">They are your</p>
          <Chips
            label="Relationship"
            options={[...RELATIONSHIPS.filter((r) => r !== 'Carer').map((r) => ({ value: r, label: r })), { value: 'Client', label: 'Client (I’m a carer)' }, { value: 'Other', label: 'Other' }]}
            value={relationship || null}
            onChange={setRelationship}
          />
          {relationship === 'Other' && <Input value={other} onChange={(e) => setOther(e.target.value)} placeholder="e.g. Grandmother, Uncle" className={cn(fieldClass, 'h-10')} aria-label="Relationship" />}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="person-dob" className="text-xs font-medium text-pt-ink">
              Date of birth (optional)
            </Label>
            <Input id="person-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={cn(fieldClass, 'h-11')} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-pt-ink">Sex (optional)</p>
            <Chips label="Sex" options={GENDERS} value={gender} onChange={setGender} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="person-phone" className="text-xs font-medium text-pt-ink">
              Their phone (optional)
            </Label>
            <Input id="person-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="If they have one" className={cn(fieldClass, 'h-11')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-city" className="text-xs font-medium text-pt-ink">
              City or area
            </Label>
            <Input id="person-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Lekki, Lagos" className={cn(fieldClass, 'h-11')} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="person-condition" className="text-xs font-medium text-pt-ink">
            What they need help with (optional)
          </Label>
          <Textarea
            id="person-condition"
            rows={3}
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            placeholder="e.g. Knee pain after a fall, recovering from a stroke"
            className={fieldClass}
          />
          <p className="text-xs text-pt-muted">Their physio sees this before the first visit.</p>
        </div>
      </div>
    </PatientDrawer>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Their own login
// ─────────────────────────────────────────────────────────────────────────────

/**
 * For someone a caregiver set up: add their email and they get a link to create their own login.
 * Signing up with that email hands them this profile, history included; the caregiver keeps helping.
 */
export function OwnLoginDrawer({ open, onOpenChange, patientId, firstName }: { open: boolean; onOpenChange: (open: boolean) => void; patientId: Id<'users'>; firstName: string }) {
  const invite = useMutation(careRefs.ownLogin)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [sent, setSent] = useState<{ email: string; whatsappText: string; phone: string } | null>(null)

  const close = (next: boolean) => {
    if (!next) {
      setSent(null)
      setEmail('')
      setPhone('')
    }
    onOpenChange(next)
  }

  const save = async () => {
    if (!email.trim()) return toast.error(`Add ${firstName}'s email`)
    setSaving(true)
    try {
      const result = await invite({ patientId, email: email.trim(), phone: phone.trim() || undefined })
      playSound('send')
      setSent({ email: email.trim(), whatsappText: result.whatsappText, phone: phone.trim() })
    } catch (err) {
      playSound('error')
      toast.error(errorText(err, 'Could not send the invite. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PatientDrawer
      open={open}
      onOpenChange={close}
      title={sent ? 'Invite sent' : `Give ${firstName} their own login`}
      description={sent ? undefined : `So ${firstName} can see their visits and exercises on their own phone. You keep helping.`}
      footer={
        sent ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button className={cn(secondaryButtonClass, 'w-full')} onClick={() => close(false)}>
              Done
            </Button>
            <Button asChild className={cn(primaryButtonClass, 'w-full')}>
              <a href={`https://wa.me/${sent.phone.replace(/\D/g, '')}?text=${encodeURIComponent(sent.whatsappText)}`} target="_blank" rel="noopener noreferrer">
                <WhatsApp className="mr-2 h-4 w-4" />
                Also send on WhatsApp
              </a>
            </Button>
          </div>
        ) : (
          <Button className={cn(primaryButtonClass, 'h-11 w-full')} disabled={saving} onClick={() => void save()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send the invite
          </Button>
        )
      }
    >
      {sent ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-2xl bg-pt-green-bg p-4 text-pt-green-fg">
            <Check className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">We emailed {sent.email}.</p>
          </div>
          <p className="text-sm leading-relaxed text-pt-muted">
            When {firstName} signs up with that email, this profile becomes theirs, with every visit, plan and exercise. You&apos;ll be told,
            and you keep your access unless they change it.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="own-email" className="text-xs font-medium text-pt-ink">
              {firstName}&apos;s email
            </Label>
            <Input id="own-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" className={cn(fieldClass, 'h-11')} />
            <p className="text-xs text-pt-muted">They must sign up with this exact email.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="own-phone" className="text-xs font-medium text-pt-ink">
              Their WhatsApp number (optional)
            </Label>
            <Input id="own-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 000 0000" className={cn(fieldClass, 'h-11')} />
          </div>
        </div>
      )}
    </PatientDrawer>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Check in for them
// ─────────────────────────────────────────────────────────────────────────────

const MOODS = [
  { value: 'great', label: 'Great' },
  { value: 'good', label: 'Good' },
  { value: 'okay', label: 'Okay' },
  { value: 'low', label: 'Low' },
] as const
const EXERCISES = [
  { value: 'all', label: 'All of them' },
  { value: 'some', label: 'Some' },
  { value: 'none', label: 'None' },
] as const

function painTone(score: number) {
  if (score >= 7) return 'bg-pt-rose-bg text-pt-rose-fg'
  if (score >= 4) return 'bg-pt-neutral-bg text-pt-ink'
  return 'bg-pt-green-bg text-pt-green-fg'
}

export function CheckInForDrawer({
  open,
  onOpenChange,
  patientId,
  firstName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: Id<'users'>
  firstName: string
}) {
  const checkIn = useMutation(careRefs.checkInFor)
  const [pain, setPain] = useState(3)
  const [mood, setMood] = useState<(typeof MOODS)[number]['value'] | null>(null)
  const [exercises, setExercises] = useState<(typeof EXERCISES)[number]['value'] | null>(null)
  const [note, setNote] = useState('')
  const [concern, setConcern] = useState(false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!exercises) return toast.error(`Say whether ${firstName} did their exercises`)
    setSaving(true)
    try {
      const result = await checkIn({ patientId, painScore: pain, mood: mood ?? undefined, exercisesDone: exercises, note: note.trim() || undefined, concern })
      playSound('success')
      toast.success('Check-in sent', {
        description: result.flagged ? `Their physio has been told${concern ? ' about your concern' : ''}.` : 'Thank you. Their physio can see it.',
      })
      setNote('')
      setConcern(false)
      setMood(null)
      setExercises(null)
      onOpenChange(false)
    } catch (err) {
      playSound('error')
      toast.error(errorText(err, 'Could not send the check-in. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PatientDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={`How is ${firstName} today?`}
      description="A quick check-in for their physio. It takes a minute."
      footer={
        <Button className={cn(primaryButtonClass, 'h-11 w-full')} disabled={saving} onClick={() => void save()}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Send check-in
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-pt-ink">Pain right now</p>
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums', painTone(pain))}>{pain}/10</span>
          </div>
          <div className="grid grid-cols-11 gap-1" role="radiogroup" aria-label="Pain from 0 to 10">
            {Array.from({ length: 11 }, (_, n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={pain === n}
                onClick={() => setPain(n)}
                className={cn(
                  'h-10 rounded-lg text-sm font-semibold tabular-nums transition',
                  pain === n ? 'bg-pt-primary text-pt-on-primary' : 'bg-pt-sunken text-pt-muted hover:bg-pt-hover hover:text-pt-ink'
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-[11px] text-pt-faint">
            <span>No pain</span>
            <span>Worst</span>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-pt-ink">Home exercises since the last check-in</p>
          <Chips label="Exercises done" options={EXERCISES} value={exercises} onChange={setExercises} />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-pt-ink">Mood (optional)</p>
          <Chips label="Mood" options={MOODS} value={mood} onChange={setMood} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="checkin-note" className="text-sm font-semibold text-pt-ink">
            Anything their physio should know? (optional)
          </Label>
          <Textarea id="checkin-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Walked to the gate today. Knee swollen in the evening." className={fieldClass} />
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-pt-sunken px-4 py-3">
          <span>
            <span className="block text-sm font-semibold text-pt-ink">I’m worried about something</span>
            <span className="block text-xs text-pt-muted">Their physio is alerted straight away</span>
          </span>
          <Switch checked={concern} onCheckedChange={setConcern} aria-label="I'm worried about something" className="data-[state=checked]:bg-pt-accent" />
        </label>
      </div>
    </PatientDrawer>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Ask for a visit
// ─────────────────────────────────────────────────────────────────────────────

export function RequestVisitDrawer({
  open,
  onOpenChange,
  patientId,
  firstName,
  relationship,
  city,
  goesTo,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: Id<'users'>
  firstName: string
  relationship: string
  city: string | null
  /** Who answers: their clinic's name, their physio, or nobody yet (Joy finds one) */
  goesTo: string | null
}) {
  const request = useMutation(careRefs.requestVisit)
  const [times, setTimes] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const close = (next: boolean) => {
    if (!next) {
      setDone(null)
      setTimes('')
      setMessage('')
    }
    onOpenChange(next)
  }

  const save = async () => {
    setSaving(true)
    try {
      const result = await request({ patientId, preferredTimes: times.trim() || undefined, message: message.trim() || undefined })
      if (result.route === 'joy') {
        window.open(findPhysioWithJoy(firstName, relationship, city), '_blank', 'noopener,noreferrer')
        close(false)
        return
      }
      playSound('send')
      setDone(result.to)
    } catch (err) {
      playSound('error')
      toast.error(errorText(err, 'Could not send the request. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PatientDrawer
      open={open}
      onOpenChange={close}
      title={done ? 'Request sent' : `Ask for a visit for ${firstName}`}
      description={done ? undefined : goesTo ? `${goesTo} gets your request and books a time.` : 'Joy on WhatsApp finds a physio near them.'}
      footer={
        done ? (
          <Button className={cn(secondaryButtonClass, 'w-full')} onClick={() => close(false)}>
            Done
          </Button>
        ) : goesTo ? (
          <Button className={cn(primaryButtonClass, 'h-11 w-full')} disabled={saving} onClick={() => void save()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send request
          </Button>
        ) : (
          <Button asChild className={cn(primaryButtonClass, 'h-11 w-full')}>
            <a href={findPhysioWithJoy(firstName, relationship, city)} target="_blank" rel="noopener noreferrer" onClick={() => close(false)}>
              <WhatsApp className="mr-2 h-4 w-4" />
              Find a physio with Joy
            </a>
          </Button>
        )
      }
    >
      {done ? (
        <div className="flex items-start gap-3 rounded-2xl bg-pt-green-bg p-4 text-pt-green-fg">
          <Check className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">
            {done} has your request. You&apos;ll get a notification here when the visit is booked.
          </p>
        </div>
      ) : goesTo ? (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="visit-times" className="text-xs font-medium text-pt-ink">
              Good days and times
            </Label>
            <Input id="visit-times" value={times} onChange={(e) => setTimes(e.target.value)} placeholder="e.g. Weekday mornings, or Saturday" className={cn(fieldClass, 'h-11')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="visit-message" className="text-xs font-medium text-pt-ink">
              Anything else (optional)
            </Label>
            <Textarea id="visit-message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. A home visit would be easier, she can’t climb stairs" className={fieldClass} />
          </div>
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-pt-muted">
          {firstName} doesn&apos;t have a physio on Rehabify yet. Joy asks a few questions on WhatsApp, finds a physio near them (a home visit, a clinic or online) and books the first visit.
        </p>
      )}
    </PatientDrawer>
  )
}
