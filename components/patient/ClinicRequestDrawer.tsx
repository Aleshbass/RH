'use client'

import { useState } from 'react'
import { makeFunctionReference } from 'convex/server'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { CalendarPlus, Loader2, Stethoscope, UserRound } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { PatientDrawer, accentButtonClass } from '@/components/patient/ui'
import { programError } from '@/components/exercise-programs/errors'
import { useCareHome } from '@/components/patient/careHome'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type Kind = 'appointment' | 'change_clinician' | 'service'

const requestRef = makeFunctionReference<
  'mutation',
  { kind: Kind; message?: string; preferredTimes?: string; service?: string },
  { requestId: string; clinicName: string }
>('patients:requestFromClinic')

const OPTIONS: { kind: Kind; title: string; hint: string; icon: typeof CalendarPlus }[] = [
  { kind: 'appointment', title: 'Another appointment', hint: 'A time that isn’t in the booking calendar', icon: CalendarPlus },
  { kind: 'change_clinician', title: 'A different clinician', hint: 'See someone else at the clinic', icon: UserRound },
  { kind: 'service', title: 'A service', hint: 'Something the clinic offers', icon: Stethoscope },
]

/**
 * Clinic mode: ask the clinic for another appointment, a different clinician or a service. The
 * clinic answers from its Appointments page and the patient gets a notification.
 */
export function ClinicRequestDrawer({
  open,
  onOpenChange,
  initialKind = 'appointment',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialKind?: Kind
}) {
  const { clinic } = useCareHome()
  const send = useMutation(requestRef)
  const [kind, setKind] = useState<Kind>(initialKind)
  const [service, setService] = useState('')
  const [preferredTimes, setPreferredTimes] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const clinicName = clinic?.name ?? 'your clinic'

  const submit = async () => {
    if (kind === 'service' && !service.trim()) {
      toast.error('Say which service you’d like.')
      return
    }
    setSending(true)
    try {
      await send({
        kind,
        message: message.trim() || undefined,
        preferredTimes: preferredTimes.trim() || undefined,
        service: kind === 'service' ? service.trim() : undefined,
      })
      playSound('success')
      toast.success(`Sent to ${clinicName}`, { description: 'They’ll get back to you, usually within a working day.' })
      setMessage('')
      setPreferredTimes('')
      setService('')
      onOpenChange(false)
    } catch (error) {
      toast.error(programError(error, 'We couldn’t send that. Please try again.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <PatientDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={`Ask ${clinicName}`}
      description="The clinic arranges it and lets you know."
      footer={
        <Button onClick={() => void submit()} disabled={sending} className={cn(accentButtonClass, 'h-11 w-full')}>
          {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Send request
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-2" role="radiogroup" aria-label="What do you need?">
          {OPTIONS.map((option) => {
            const Icon = option.icon
            const active = kind === option.kind
            return (
              <button
                key={option.kind}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setKind(option.kind)}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors',
                  active ? 'border-pt-ink bg-pt-sunken' : 'border-pt-line hover:bg-pt-hover'
                )}
              >
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', active ? 'bg-pt-primary text-pt-on-primary' : 'bg-pt-sunken text-pt-ink')}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-pt-ink">{option.title}</span>
                  <span className="block truncate text-xs text-pt-muted">{option.hint}</span>
                </span>
              </button>
            )
          })}
        </div>

        {kind === 'service' && (
          <div className="space-y-1.5">
            <Label htmlFor="req-service" className="text-sm font-medium">Which service?</Label>
            {clinic && clinic.services.length > 0 ? (
              <select
                id="req-service"
                value={service}
                onChange={(e) => setService(e.target.value)}
                className="h-11 w-full rounded-xl border border-pt-line bg-pt-surface px-3 text-sm text-pt-ink"
              >
                <option value="">Choose a service</option>
                {clinic.services.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            ) : (
              <Input id="req-service" value={service} onChange={(e) => setService(e.target.value)} placeholder="e.g. Sports massage" className="h-11 rounded-xl" />
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="req-times" className="text-sm font-medium">When suits you? <span className="font-normal text-pt-faint">(optional)</span></Label>
          <Input id="req-times" value={preferredTimes} onChange={(e) => setPreferredTimes(e.target.value)} placeholder="e.g. Weekday mornings, or Saturday" className="h-11 rounded-xl" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="req-message" className="text-sm font-medium">Anything else? <span className="font-normal text-pt-faint">(optional)</span></Label>
          <Textarea id="req-message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} className="resize-none rounded-xl" placeholder="Tell the clinic what you need" />
        </div>
      </div>
    </PatientDrawer>
  )
}
