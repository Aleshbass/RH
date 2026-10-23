'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import type { getPatientCareTeam } from '@/convex/patients'
import type { QueryResult } from '@/lib/convexUntyped'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Calendar as CalendarIcon, Check, Clock, Loader2, MapPin, Search, User, Video } from '@/components/icons'
import { formatLagos, lagosDate, lagosDateTime, lagosTime, lagosTimeRange, startOfZonedDay, zonedDateKey } from '@/convex/helpers/lagosTime'
import { useGoogleBusyRefresh } from '@/lib/hooks/useGoogleBusyRefresh'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import {
  IconChip,
  InfoTip,
  PatientDrawer,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/patient/ui'

type Slot = { start: number; end: number; duration: number }

const DAY_MS = 24 * 60 * 60 * 1000

/* ---------------------------------------------------------------------------------------------- */
/* Slot picker                                                                                    */
/* ---------------------------------------------------------------------------------------------- */

/**
 * Open times from the physio's working hours, days off and existing bookings, grouped by Lagos
 * day: a row of day chips, then the times for the chosen day. `excludeAppointmentId` frees the
 * visit's own time when moving it. Patient-portal styling of the shared SlotPicker.
 */
export function PatientSlotPicker({
  physiotherapistId,
  durationMinutes,
  excludeAppointmentId,
  selected,
  onSelect,
  days = 21,
}: {
  physiotherapistId: string
  durationMinutes: number
  excludeAppointmentId?: string
  selected: Slot | null
  onSelect: (slot: Slot | null) => void
  days?: number
}) {
  const range = useMemo(() => {
    const start = startOfZonedDay(Date.now())
    return { startDate: start, endDate: start + days * DAY_MS - 1 }
  }, [days])

  useGoogleBusyRefresh(physiotherapistId)
  const slots = useQuery(api.calendar.availability.getAvailableSlots, {
    physiotherapistId: physiotherapistId as Id<'users'>,
    ...range,
    sessionDuration: durationMinutes,
    excludeAppointmentId: excludeAppointmentId as Id<'appointments'> | undefined,
  }) as Slot[] | undefined

  const byDay = useMemo(() => {
    const groups = new Map<string, Slot[]>()
    const now = Date.now()
    for (const slot of (slots ?? []).filter((s) => s.start > now).sort((a, b) => a.start - b.start)) {
      const key = zonedDateKey(slot.start)
      groups.set(key, [...(groups.get(key) ?? []), slot])
    }
    return groups
  }, [slots])

  const [day, setDay] = useState<string | null>(null)
  useEffect(() => {
    if (byDay.size === 0) return
    if (!day || !byDay.has(day)) setDay(selected ? zonedDateKey(selected.start) : [...byDay.keys()][0])
  }, [byDay, day, selected])

  if (slots === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl bg-pt-sunken py-10 text-sm text-pt-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking open times…
      </div>
    )
  }
  if (byDay.size === 0) {
    return (
      <div className="rounded-2xl bg-pt-sunken px-4 py-8 text-center">
        <p className="text-sm font-semibold text-pt-ink">No open times right now</p>
        <p className="mt-1 text-sm text-pt-muted">
          Nothing free in the next {days >= 14 ? `${Math.round(days / 7)} weeks` : `${days} days`}. Send your physio a message to arrange a time.
        </p>
      </div>
    )
  }

  const daySlots = (day && byDay.get(day)) || []

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium text-pt-ink">Day</p>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="listbox" aria-label="Day">
          {[...byDay.entries()].map(([key, list]) => {
            const active = key === day
            const first = list[0].start
            return (
              <button
                key={key}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setDay(key)
                  if (selected && zonedDateKey(selected.start) !== key) onSelect(null)
                }}
                className={cn(
                  'flex w-[60px] shrink-0 flex-col items-center rounded-2xl px-2 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50',
                  active ? 'bg-pt-primary text-pt-on-primary' : 'bg-pt-sunken text-pt-ink hover:bg-pt-hover'
                )}
              >
                <span className={cn('text-[11px] font-medium uppercase', active ? 'opacity-80' : 'text-pt-muted')}>
                  {formatLagos(first, { weekday: 'short' }, 'en-NG')}
                </span>
                <span className="text-lg font-semibold leading-tight tabular-nums">{formatLagos(first, { day: 'numeric' }, 'en-NG')}</span>
                <span className={cn('text-[11px]', active ? 'opacity-80' : 'text-pt-muted')}>
                  {formatLagos(first, { month: 'short' }, 'en-NG')}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1 text-sm font-medium text-pt-ink">
          Time
          <InfoTip>Times are Lagos time (WAT). Each time shown is free in your physio&apos;s diary right now.</InfoTip>
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {daySlots.map((slot) => {
            const active = selected?.start === slot.start
            return (
              <button
                key={slot.start}
                type="button"
                onClick={() => onSelect(active ? null : slot)}
                aria-pressed={active}
                className={cn(
                  'h-11 rounded-xl border text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50',
                  active
                    ? 'border-transparent bg-pt-primary text-pt-on-primary'
                    : 'border-pt-line-strong bg-pt-surface text-pt-ink hover:bg-pt-hover'
                )}
              >
                {lagosTime(slot.start)}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------------------------- */
/* Booking drawer                                                                                 */
/* ---------------------------------------------------------------------------------------------- */

interface PatientAppointmentBookingModalProps {
  isOpen: boolean
  onClose: () => void
  preselectedPhysiotherapistId?: Id<'users'>
  onAppointmentBooked?: () => void
}

type Step = 'when' | 'details' | 'success'
type AppointmentType = 'telehealth' | 'in-person'
type CareTeamMember = { physiotherapist: { _id: string; firstName?: string; lastName?: string } } | null

const SERVICE_TYPES = [
  'Initial Consultation',
  'Follow-up Session',
  'Physical Assessment',
  'Exercise Therapy',
  'Manual Therapy',
  'Rehabilitation Session',
  'Progress Review',
  'Discharge Planning',
  'Massage Therapy',
]

const SESSION_MINUTES = 60
const BOOKING_WINDOW_DAYS = 60

function errorMessage(error: unknown) {
  // ConvexError keeps its readable message in `data`, also in production
  const data = (error as { data?: unknown } | null)?.data
  if (typeof data === 'string' && data.trim()) return data
  const raw = error instanceof Error ? error.message : ''
  // Convex prefixes server errors with request details; keep the readable part
  const match = raw.match(/(?:Uncaught Error|ConvexError):\s*(.+?)(?:\n|\s+at\s|$)/)
  return match?.[1] || "We couldn't book that time. Please try again."
}

function StepDots({ step }: { step: Step }) {
  const index = step === 'when' ? 0 : 1
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="flex flex-1 gap-1.5" aria-hidden>
        {[0, 1].map((i) => (
          <span key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= index ? 'bg-pt-ink' : 'bg-pt-line-strong')} />
        ))}
      </div>
      <span className="text-xs font-medium tabular-nums text-pt-muted">Step {index + 1} of 2</span>
    </div>
  )
}

/**
 * Book a visit with one of the patient's physios, in a drawer: pick a day and time from their
 * real availability, then say what it's for and how to meet. The physio confirms the request.
 * Physios who bill through Rehabify are booked (and paid) on their booking page instead.
 */
export function PatientAppointmentBookingModal({
  isOpen,
  onClose,
  preselectedPhysiotherapistId,
  onAppointmentBooked,
}: PatientAppointmentBookingModalProps) {
  const [step, setStep] = useState<Step>('when')
  const [slot, setSlot] = useState<Slot | null>(null)
  const [serviceType, setServiceType] = useState<string>('')
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('telehealth')
  const [location, setLocation] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [physiotherapistId, setPhysiotherapistId] = useState<string>('')

  // Typed from the query itself: the generated `api` type degrades to `any` in the full app build
  const careTeam = useQuery(api.patients.getPatientCareTeam, isOpen ? {} : 'skip') as
    | QueryResult<typeof getPatientCareTeam>
    | undefined as CareTeamMember[] | undefined
  const requestAppointment = useMutation(api.appointments.requestAppointment)

  // Rehabify patients book and pay for sessions on the physio's booking page instead
  const billingMode = useQuery(
    api.rehabifyFollowUps.getCareBillingMode,
    isOpen && physiotherapistId ? { physiotherapistId: physiotherapistId as Id<'users'> } : 'skip'
  ) as { mode: 'rehabify' | 'own' } | null | undefined
  const paidOnRehabify = billingMode?.mode === 'rehabify'

  useEffect(() => {
    if (preselectedPhysiotherapistId) {
      setPhysiotherapistId(preselectedPhysiotherapistId)
    } else if (careTeam && careTeam.length > 0 && !physiotherapistId) {
      setPhysiotherapistId(careTeam[0]?.physiotherapist?._id || '')
    }
  }, [preselectedPhysiotherapistId, careTeam, physiotherapistId])

  // Fresh start every time the drawer opens
  useEffect(() => {
    if (isOpen) {
      setStep('when')
      setSlot(null)
      setServiceType('')
      setAppointmentType('telehealth')
      setLocation('')
      setNotes('')
      setIsSubmitting(false)
    }
  }, [isOpen])

  const selectedPhysiotherapist = careTeam?.find((member) => member?.physiotherapist?._id === physiotherapistId)
  const physioName = selectedPhysiotherapist
    ? `${selectedPhysiotherapist.physiotherapist.firstName ?? ''} ${selectedPhysiotherapist.physiotherapist.lastName ?? ''}`.trim()
    : ''

  const handleSubmit = async () => {
    if (!slot || !serviceType || !physiotherapistId || paidOnRehabify) return
    if (appointmentType === 'in-person' && !location.trim()) {
      toast.error('Please enter the address for your visit')
      return
    }

    setIsSubmitting(true)
    try {
      await requestAppointment({
        physiotherapistId: physiotherapistId as Id<'users'>,
        startTime: slot.start,
        endTime: slot.end,
        serviceType,
        appointmentType,
        location: appointmentType === 'in-person' ? location.trim() : undefined,
        notes: notes.trim() || undefined,
      })
      playSound('booked')
      setStep('success')
      setIsSubmitting(false)
      onAppointmentBooked?.()
    } catch (error) {
      console.error('Error booking appointment:', error)
      playSound('error')
      toast.error(errorMessage(error))
      setIsSubmitting(false)
    }
  }

  const noCareTeam = careTeam !== undefined && careTeam.length === 0 && !preselectedPhysiotherapistId
  const canBookHere = !noCareTeam && !paidOnRehabify && !!physiotherapistId

  const title = step === 'success' ? 'Request sent' : step === 'details' ? 'Your visit' : 'Book a session'
  const description =
    step === 'success'
      ? undefined
      : step === 'details'
        ? 'Tell your physio what the visit is for'
        : physioName
          ? `With ${physioName}`
          : 'Pick a day and time that suits you'

  let footer: ReactNode = undefined
  if (step === 'when' && canBookHere) {
    footer = (
      <div className="space-y-2">
        {slot && (
          <p className="text-center text-sm text-pt-muted">
            <span className="font-semibold text-pt-ink">{lagosDateTime(slot.start)}</span> · {SESSION_MINUTES} min
          </p>
        )}
        <Button className={cn(primaryButtonClass, 'h-11 w-full')} disabled={!slot} onClick={() => setStep('details')}>
          {slot ? 'Continue' : 'Pick a time to continue'}
        </Button>
      </div>
    )
  } else if (step === 'details') {
    footer = (
      <div className="flex gap-2">
        <Button className={cn(secondaryButtonClass, 'h-11 flex-1')} onClick={() => setStep('when')} disabled={isSubmitting}>
          Back
        </Button>
        <Button
          className={cn(primaryButtonClass, 'h-11 flex-[2]')}
          disabled={!serviceType || isSubmitting || (appointmentType === 'in-person' && !location.trim())}
          onClick={handleSubmit}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
            </>
          ) : (
            'Request this time'
          )}
        </Button>
      </div>
    )
  } else if (step === 'success') {
    footer = (
      <Button className={cn(primaryButtonClass, 'h-11 w-full')} onClick={onClose}>
        Done
      </Button>
    )
  }

  return (
    <PatientDrawer
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onClose()
      }}
      title={title}
      description={description}
      footer={footer}
    >
      {step !== 'success' && canBookHere && <StepDots step={step} />}

      {step === 'when' &&
        (noCareTeam ? (
          <div className="flex flex-col items-center py-8 text-center">
            <IconChip icon={User} tone="sun" size="lg" />
            <p className="mt-3 text-[15px] font-semibold text-pt-ink">You&apos;re not linked to a physiotherapist yet</p>
            <p className="mt-1 max-w-xs text-sm text-pt-muted">Find a physio and book your first session from their page.</p>
            <Button asChild className={cn(primaryButtonClass, 'mt-5 h-11 px-5')}>
              <Link href="/find-a-physio" onClick={onClose}>
                <Search className="mr-2 h-4 w-4" />
                Find a physio
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {!preselectedPhysiotherapistId && (careTeam?.length ?? 0) > 1 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-pt-ink">Physiotherapist</label>
                <Select
                  value={physiotherapistId}
                  onValueChange={(value) => {
                    setPhysiotherapistId(value)
                    setSlot(null)
                  }}
                >
                  <SelectTrigger className={cn(fieldClass, 'h-11')}>
                    <SelectValue placeholder="Choose your physiotherapist" />
                  </SelectTrigger>
                  <SelectContent>
                    {careTeam?.map(
                      (member) =>
                        member && (
                          <SelectItem key={member.physiotherapist._id} value={member.physiotherapist._id}>
                            {member.physiotherapist.firstName} {member.physiotherapist.lastName}
                          </SelectItem>
                        )
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {paidOnRehabify ? (
              <div className="space-y-3 rounded-2xl bg-pt-sunken p-5 text-sm">
                <p className="font-semibold text-pt-ink">
                  Sessions with {physioName || 'your physiotherapist'} are booked and paid on Rehabify
                </p>
                <p className="text-pt-muted">
                  Choose a service and a time on their booking page. The price you see is the price you pay, and your booking is confirmed once paid.
                </p>
                <Button asChild className={cn(primaryButtonClass, 'h-11 w-full')}>
                  <Link href={`/book/${physiotherapistId}`} onClick={onClose}>
                    Go to the booking page
                  </Link>
                </Button>
              </div>
            ) : physiotherapistId ? (
              <PatientSlotPicker
                physiotherapistId={physiotherapistId}
                durationMinutes={SESSION_MINUTES}
                selected={slot}
                onSelect={setSlot}
                days={BOOKING_WINDOW_DAYS}
              />
            ) : (
              <div className="flex items-center justify-center gap-2 rounded-2xl bg-pt-sunken py-10 text-sm text-pt-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            )}
          </div>
        ))}

      {step === 'details' && slot && (
        <div className="space-y-5">
          <div className="space-y-2 rounded-2xl bg-pt-sunken p-4 text-sm text-pt-ink">
            <p className="flex items-center gap-2">
              <User className="h-4 w-4 text-pt-muted" />
              {physioName || 'Your physiotherapist'}
            </p>
            <p className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-pt-muted" />
              {lagosDate(slot.start)}
            </p>
            <p className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-pt-muted" />
              {lagosTimeRange(slot.start, slot.end)} (Lagos time)
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-pt-ink">What is this visit for?</label>
            <Select value={serviceType} onValueChange={setServiceType}>
              <SelectTrigger className={cn(fieldClass, 'h-11')}>
                <SelectValue placeholder="Choose a service" />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <p className="flex items-center gap-1 text-sm font-medium text-pt-ink">
              How would you like to meet?
              <InfoTip>A video call happens on your phone or laptop. In person means your physio sees you at the address you give.</InfoTip>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: 'telehealth', label: 'Video call', Icon: Video },
                  { value: 'in-person', label: 'In person', Icon: MapPin },
                ] as const
              ).map(({ value, label, Icon }) => {
                const active = appointmentType === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAppointmentType(value)}
                    aria-pressed={active}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-2xl border px-3 py-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50',
                      active
                        ? 'border-transparent bg-pt-primary text-pt-on-primary'
                        : 'border-pt-line-strong bg-pt-surface text-pt-ink hover:bg-pt-hover'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                )
              })}
            </div>
            {appointmentType === 'telehealth' && (
              <p className="text-xs text-pt-muted">Once your physio confirms, the video link appears on your dashboard and in your email.</p>
            )}
          </div>

          {appointmentType === 'in-person' && (
            <div className="space-y-2">
              <label htmlFor="visit-address" className="text-sm font-medium text-pt-ink">
                Address
              </label>
              <Input
                id="visit-address"
                className={cn(fieldClass, 'h-11')}
                placeholder="House number, street and city"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="visit-notes" className="text-sm font-medium text-pt-ink">
              Anything your physio should know? <span className="font-normal text-pt-faint">(optional)</span>
            </label>
            <Textarea
              id="visit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
              placeholder="e.g. my knee pain has got worse since last week"
              className={cn(fieldClass, 'min-h-[88px]')}
            />
          </div>
        </div>
      )}

      {step === 'success' && slot && (
        <div className="flex flex-col items-center py-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-pt-green-bg text-pt-green-fg">
            <Check className="h-6 w-6" />
          </span>
          <p className="mt-4 text-lg font-semibold text-pt-ink">Your request is with {physioName || 'your physio'}</p>
          <p className="mt-1 max-w-xs text-sm text-pt-muted">
            They&apos;ll confirm <span className="font-medium text-pt-ink">{lagosDateTime(slot.start)}</span> or suggest another time. We&apos;ll
            let you know either way.
          </p>
        </div>
      )}
    </PatientDrawer>
  )
}
