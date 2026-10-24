'use client'

/**
 * Book a patient in, from anywhere in the physio portal: one drawer that replaces the old
 * calendar form, scheduling wizard, video-call form and the patient page's booking dialog.
 *
 * Steps: who (unless a patient is given) → what (a Rehabify service the patient pays for, or a
 * session type for your own patients) → when (your open times, or the slot you clicked on the
 * calendar) → details → done. Modelled on the patient portal's booking drawer.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowRight, CalendarDays, Check, Clock, Home, Loader2, MapPin, MessageSquare, Search, User, Video } from '@/components/icons'
import type { Id } from '@/convex/_generated/dataModel'
import { lagosDate, lagosShortDate, lagosTime, lagosTimeRange } from '@/convex/helpers/lagosTime'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PatientSlotPicker } from '@/components/patient/PatientAppointmentBookingModal'
import { SESSION_TYPES, type SessionType } from '@/components/booking/booking-shared'
import {
  EmptyState,
  IconChip,
  InfoTip,
  PhysioDrawer,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/physio/ui'
import { formatKobo, getService, type ServiceMode } from '@/lib/rehabify-services'
import type { CareBillingMode, MarketplaceSettings, PayoutSchedule, ServiceQuote, TravelZone } from '@/lib/rehabify-api-types'
import { useMutationUntyped, useQueryUntyped } from '@/lib/convexUntyped'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { readableError, scheduleApi } from './shared'

export type BookingPatient = { id: string; name: string }
export type BookingOptions = {
  patient?: BookingPatient
  /** A time already chosen (e.g. clicked on the calendar). */
  slot?: { start: number; end?: number }
  mode?: 'telehealth' | 'in-person'
}

type Step = 'patient' | 'what' | 'when' | 'details' | 'done'
type Slot = { start: number; end: number; duration: number }

type PatientOption = { _id: string; firstName?: string; lastName?: string; email?: string; patientNumber?: string }

/** A Rehabify service this physio offers, for a patient who pays per session. */
type ScheduleService = {
  id: string
  name: string
  mode: ServiceMode
  durationMinutes: number
  durationLabel: string
  priceKobo: number
  payoutKobo: number
  travelApplies: boolean
}

const BookingContext = createContext<(options?: BookingOptions) => void>(() => undefined)

/** Opens the booking drawer: `openBooking({ patient, slot, mode })`, all optional. */
export function useBooking() {
  return useContext(BookingContext)
}

export function BookingProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<BookingOptions | null>(null)
  // A fresh drawer each time, so nothing from the last booking lingers
  const [run, setRun] = useState(0)
  const openBooking = useCallback((next?: BookingOptions) => {
    setOptions(next ?? {})
    setRun((n) => n + 1)
  }, [])
  return (
    <BookingContext.Provider value={openBooking}>
      {children}
      {options && <BookingDrawer key={run} options={options} onClose={() => setOptions(null)} />}
    </BookingContext.Provider>
  )
}

function fullName(p: { firstName?: string; lastName?: string }) {
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Patient'
}

function StepBar({ index, total }: { index: number; total: number }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="flex flex-1 gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= index ? 'bg-pt-ink' : 'bg-pt-line-strong')} />
        ))}
      </div>
      <span className="text-xs font-medium tabular-nums text-pt-muted">
        Step {index + 1} of {total}
      </span>
    </div>
  )
}

/** A big tappable choice: icon, title, a line under it, optional right-hand text, selected state. */
function Choice({
  icon,
  title,
  detail,
  aside,
  selected,
  onClick,
}: {
  icon: ReactNode
  title: string
  detail?: ReactNode
  aside?: ReactNode
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50 active:scale-[0.99]',
        selected ? 'border-pt-ink bg-pt-sunken' : 'border-pt-line-strong bg-pt-surface hover:bg-pt-hover'
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-pt-ink">{title}</span>
        {detail && <span className="mt-0.5 block text-xs text-pt-muted">{detail}</span>}
      </span>
      {aside && <span className="shrink-0 text-right">{aside}</span>}
      <span
        aria-hidden
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-pt-ink bg-pt-ink text-pt-on-primary' : 'border-pt-line-strong'
        )}
      >
        {selected && <Check className="h-3 w-3" />}
      </span>
    </button>
  )
}

function Summary({ patient, title, slot, mode }: { patient: string; title: string; slot: Slot; mode: string }) {
  return (
    <div className="rounded-2xl bg-pt-sunken p-4">
      <p className="text-sm text-pt-muted">
        {title} with <span className="font-semibold text-pt-ink">{patient}</span>
      </p>
      <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-pt-ink">
        <CalendarDays className="h-4 w-4 shrink-0 text-pt-faint" aria-hidden />
        {lagosDate(slot.start)}
      </p>
      <p className="mt-0.5 pl-[22px] text-base font-semibold tabular-nums text-pt-ink">
        {lagosTimeRange(slot.start, slot.end)} <span className="text-sm font-normal text-pt-muted">· {mode}</span>
      </p>
    </div>
  )
}

function BookingDrawer({ options, onClose }: { options: BookingOptions; onClose: () => void }) {
  const [open, setOpen] = useState(true)
  const [patient, setPatient] = useState<BookingPatient | null>(options.patient ?? null)
  const [step, setStep] = useState<Step>(options.patient ? 'what' : 'patient')
  const [search, setSearch] = useState('')
  const [sessionType, setSessionType] = useState<SessionType | null>(null)
  const [mode, setMode] = useState<'telehealth' | 'in-person'>(options.mode ?? 'telehealth')
  const [service, setService] = useState<ScheduleService | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [visit, setVisit] = useState<{ zoneId: string; area: string } | null>(null)
  const [address, setAddress] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ chargeKobo?: number; holdExpiresAt?: number } | null>(null)

  const me = useQueryUntyped(scheduleApi.users.getMyUser) as { _id: string } | null | undefined
  const patients = useQueryUntyped(scheduleApi.patients.getMyPatientOptions, step === 'patient' ? {} : 'skip') as PatientOption[] | undefined
  const billing = useQueryUntyped(scheduleApi.rehabifyFollowUps.getCareBillingMode, patient ? { patientId: patient.id } : 'skip') as
    | CareBillingMode
    | null
    | undefined
  const isRehabify = billing?.mode === 'rehabify'
  const coverage = useQueryUntyped(scheduleApi.marketplaceSettings.getMyMarketplaceSettings, {}) as MarketplaceSettings | null | undefined
  const payoutSchedule = useQueryUntyped(scheduleApi.serviceTariffs.getPayoutSchedule, isRehabify ? {} : 'skip') as PayoutSchedule | null | undefined
  const zones = useQueryUntyped(scheduleApi.travelZones.listZones, isRehabify ? {} : 'skip') as TravelZone[] | undefined
  const quote = useQueryUntyped(
    scheduleApi.booking.getServiceQuote,
    isRehabify && service && (service.mode !== 'home' || visit) ? { serviceId: service.id, zoneId: service.mode === 'home' ? visit?.zoneId : undefined } : 'skip'
  ) as ServiceQuote | undefined

  const createAppointment = useMutationUntyped(scheduleApi.appointments.createAppointment)
  const scheduleFollowUp = useMutationUntyped(scheduleApi.rehabifyFollowUps.scheduleRehabifyFollowUp)

  const offersOnline = coverage?.offersOnlineSessions ?? true

  // Only the Rehabify services this physio offers: video, and home visits where they cover an area
  const services = useMemo<ScheduleService[]>(() => {
    if (!payoutSchedule || !coverage) return []
    const offersHome = coverage.offersInPersonSessions && coverage.coveredZoneIds.length > 0
    const rows = payoutSchedule.services.flatMap((row) => {
      const info = getService(row.id)
      if (!row.active || !info || (row.mode === 'home' ? !offersHome : !coverage.offersOnlineSessions)) return []
      // Treatment follows an assessment; the server refuses it until the patient has had one
      if (info.requiresPriorAssessment && billing?.assessed === false) return []
      return [
        {
          id: row.id,
          name: row.name,
          mode: row.mode,
          durationMinutes: info.durationMinutes,
          durationLabel: row.durationLabel,
          priceKobo: row.priceKobo,
          payoutKobo: row.payoutKobo,
          travelApplies: row.travelApplies,
        },
      ]
    })
    const isTreatment = (id: string) => Number(getService(id)?.kind === 'treatment')
    return rows.sort((a, b) => isTreatment(b.id) - isTreatment(a.id))
  }, [payoutSchedule, coverage, billing?.assessed])

  const coveredZones = useMemo(() => {
    const covered = new Set<string>((coverage?.coveredZoneIds ?? []) as string[])
    return (zones ?? []).filter((zone) => covered.has(zone.id))
  }, [zones, coverage])

  const duration = isRehabify ? service?.durationMinutes ?? 60 : sessionType?.duration ?? 60
  const sessionTitle = isRehabify ? service?.name ?? 'Session' : sessionType?.title ?? 'Session'
  const modeLabel = isRehabify
    ? service?.mode === 'home'
      ? 'Home visit'
      : 'Video call'
    : mode === 'telehealth'
      ? 'Video call'
      : 'In person'
  const firstName = patient?.name.split(' ')[0] ?? 'the patient'

  // The calendar slot, sized to the session once we know how long it is
  const fixedSlot = options.slot ? { start: options.slot.start, end: options.slot.start + duration * 60_000, duration } : null

  const close = () => {
    if (busy) return
    setOpen(false)
    window.setTimeout(onClose, 250)
  }

  const goTo = (next: Step) => setStep(next)
  const afterWhat = () => {
    if (fixedSlot) {
      setSlot(fixedSlot)
      goTo('details')
    } else goTo('when')
  }

  const book = async () => {
    if (!patient || !slot) return
    if (isRehabify && service?.mode === 'home') {
      if (!visit) return toast.error('Choose the patient’s area')
      if (!address.trim()) return toast.error('Add the address for the home visit')
    }
    setBusy(true)
    try {
      if (isRehabify && service) {
        const res = (await scheduleFollowUp({
          patientId: patient.id as Id<'users'>,
          serviceId: service.id,
          slotStart: slot.start,
          zoneId: service.mode === 'home' ? (visit?.zoneId as Id<'travelZones'>) : undefined,
          area: service.mode === 'home' ? visit?.area : undefined,
          patientAddress: service.mode === 'home' ? address.trim() : undefined,
          notes: notes.trim() || undefined,
        })) as { chargeKobo: number; holdExpiresAt: number }
        setResult(res)
      } else {
        await createAppointment({
          patientId: patient.id as Id<'users'>,
          startTime: slot.start,
          endTime: slot.end,
          serviceType: sessionTitle,
          appointmentType: mode,
          location: mode === 'in-person' ? location.trim() || undefined : undefined,
          notesForTherapist: notes.trim() || undefined,
        })
        setResult({})
      }
      playSound('booked')
      goTo('done')
    } catch (error) {
      playSound('error')
      toast.error(readableError(error, 'Couldn’t book that time. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  // ── Steps ──────────────────────────────────────────────────────────────────

  const steps: Step[] = [...(options.patient ? [] : (['patient'] as Step[])), 'what', ...(options.slot ? [] : (['when'] as Step[])), 'details']
  const stepIndex = steps.indexOf(step)

  const titles: Record<Step, { title: string; description?: ReactNode }> = {
    patient: { title: 'New appointment', description: 'Who is it for?' },
    what: { title: patient ? `Book ${firstName}` : 'New appointment', description: isRehabify ? 'Which Rehabify service is this?' : 'What kind of session is this?' },
    when: { title: 'Choose a time', description: `${sessionTitle} · ${duration} min` },
    details: { title: 'Check and book', description: 'Make sure everything looks right' },
    done: { title: isRehabify ? 'Sent to pay' : 'Booked in' },
  }

  let body: ReactNode = null
  let footer: ReactNode = null

  if (step === 'patient') {
    const q = search.trim().toLowerCase()
    const list = (patients ?? []).filter((p) => !q || `${fullName(p)} ${p.email ?? ''} ${p.patientNumber ?? ''}`.toLowerCase().includes(q))
    body = (
      <div>
        <StepBar index={stepIndex} total={steps.length} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pt-faint" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your patients"
            aria-label="Search your patients"
            className={cn(fieldClass, 'h-11 pl-9')}
          />
        </div>
        <p className="mt-2 flex items-center gap-1 text-xs text-pt-muted">
          Only patients in your care are listed
          <InfoTip>Add someone new from Patients first. Once they’re in your care you can book them here.</InfoTip>
        </p>
        <div className="mt-3 space-y-1">
          {patients === undefined ? (
            <div className="flex items-center gap-2 py-8 text-sm text-pt-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your patients…
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={<User />}
              title={q ? 'No patient matches' : 'No patients yet'}
              description={q ? 'Try another name, email or Rehabify ID.' : 'Patients you treat show up here.'}
              action={
                <Button asChild className={cn(secondaryButtonClass, 'h-10')}>
                  <Link href="/dashboard/physiotherapist/patients" onClick={close}>
                    Go to Patients
                  </Link>
                </Button>
              }
            />
          ) : (
            list.slice(0, 60).map((p) => (
              <button
                key={p._id}
                type="button"
                onClick={() => {
                  setPatient({ id: p._id, name: fullName(p) })
                  goTo('what')
                }}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-pt-hover"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pt-sunken text-xs font-semibold text-pt-ink">
                  {fullName(p)
                    .split(' ')
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-pt-ink">{fullName(p)}</span>
                  <span className="block truncate text-xs text-pt-muted">{p.patientNumber ?? p.email ?? ''}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-pt-faint" />
              </button>
            ))
          )}
        </div>
      </div>
    )
  }

  if (step === 'what') {
    const loading = billing === undefined || coverage === undefined || (isRehabify && payoutSchedule === undefined)
    body = (
      <div>
        <StepBar index={stepIndex} total={steps.length} />
        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-pt-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : isRehabify ? (
          <div className="space-y-3">
            <div className="flex gap-2 rounded-2xl bg-pt-blue-bg p-3.5 text-sm text-pt-blue-fg">
              <span>
                {patient?.name} came through Rehabify, so each session is paid at the Rehabify price.
              </span>
              <InfoTip label="How paid sessions work">
                They get a link to pay and have 24 hours to do it. The time is held for them until then. You earn the amount shown once the session is done.
              </InfoTip>
            </div>
            {services.length === 0 ? (
              <EmptyState
                title="No Rehabify services switched on"
                description="Turn on video sessions or home visits in Settings → Services & coverage."
                action={
                  <Button asChild className={cn(secondaryButtonClass, 'h-10')}>
                    <Link href="/dashboard/physiotherapist/settings/marketplace" onClick={close}>
                      Open Services &amp; coverage
                    </Link>
                  </Button>
                }
              />
            ) : (
              services.map((option) => (
                <Choice
                  key={option.id}
                  icon={<IconChip icon={option.mode === 'home' ? Home : Video} tone={option.mode === 'home' ? 'sun' : 'violet'} />}
                  title={option.name}
                  detail={`${option.durationLabel} · ${option.mode === 'home' ? 'Home visit' : 'Video call'}`}
                  aside={
                    <>
                      <span className="block text-sm font-semibold tabular-nums text-pt-ink">
                        {option.travelApplies ? 'From ' : ''}
                        {formatKobo(option.priceKobo)}
                      </span>
                      <span className="block text-[11px] tabular-nums text-pt-muted">You earn {formatKobo(option.payoutKobo)}</span>
                    </>
                  }
                  selected={service?.id === option.id}
                  onClick={() => setService(option)}
                />
              ))
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              {SESSION_TYPES.map((type) => (
                <Choice
                  key={type.id}
                  icon={<IconChip icon={Clock} tone="neutral" />}
                  title={type.title}
                  detail={`${type.duration} min · ${type.description}`}
                  selected={sessionType?.id === type.id}
                  onClick={() => setSessionType(type)}
                />
              ))}
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1 text-sm font-medium text-pt-ink">
                How you’ll meet
                <InfoTip>Video sessions get a private link automatically. It shows on your Schedule and the patient’s, and opens 10 minutes before.</InfoTip>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(['telehealth', 'in-person'] as const)
                  .filter((m) => m === 'in-person' || offersOnline)
                  .map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={mode === m}
                      onClick={() => setMode(m)}
                      className={cn(
                        'flex items-center justify-center gap-2 rounded-2xl border px-3 py-3.5 text-sm font-semibold transition-colors',
                        mode === m ? 'border-pt-ink bg-pt-primary text-pt-on-primary' : 'border-pt-line-strong bg-pt-surface text-pt-ink hover:bg-pt-hover'
                      )}
                    >
                      {m === 'telehealth' ? <Video className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                      {m === 'telehealth' ? 'Video call' : 'In person'}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    )
    const ready = isRehabify ? Boolean(service) : Boolean(sessionType)
    footer = (
      <div className="flex gap-2">
        {!options.patient && (
          <Button className={cn(secondaryButtonClass, 'h-11 flex-1')} onClick={() => goTo('patient')}>
            Back
          </Button>
        )}
        <Button className={cn(primaryButtonClass, 'h-11 flex-[2]')} disabled={!ready} onClick={afterWhat}>
          {ready ? 'Continue' : isRehabify ? 'Choose a service' : 'Choose a session type'}
        </Button>
      </div>
    )
  }

  if (step === 'when' && !me) {
    body = (
      <div className="flex items-center gap-2 py-10 text-sm text-pt-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your diary…
      </div>
    )
  }

  if (step === 'when' && me) {
    body = (
      <div>
        <StepBar index={stepIndex} total={steps.length} />
        <PatientSlotPicker physiotherapistId={me._id} durationMinutes={duration} selected={slot} onSelect={setSlot} />
        <p className="mt-4 flex items-center gap-1 text-xs text-pt-muted">
          Times come from your working hours
          <InfoTip>
            Open times use your working hours, days off and existing bookings, in Lagos time. To book outside them, tap the time on the Calendar instead, or change your hours in Settings → Working hours.
          </InfoTip>
        </p>
      </div>
    )
    footer = (
      <div className="space-y-3">
        {slot && (
          <p className="text-sm text-pt-muted">
            <span className="font-semibold text-pt-ink">
              {lagosShortDate(slot.start)}, {lagosTime(slot.start)}
            </span>{' '}
            · {duration} min
          </p>
        )}
        <div className="flex gap-2">
          <Button className={cn(secondaryButtonClass, 'h-11 flex-1')} onClick={() => goTo('what')}>
            Back
          </Button>
          <Button className={cn(primaryButtonClass, 'h-11 flex-[2]')} disabled={!slot} onClick={() => goTo('details')}>
            {slot ? 'Continue' : 'Pick a time to continue'}
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'details' && slot && patient) {
    const home = isRehabify && service?.mode === 'home'
    body = (
      <div className="space-y-5">
        <StepBar index={stepIndex} total={steps.length} />
        <Summary patient={patient.name} title={sessionTitle} slot={slot} mode={modeLabel} />

        {home && (
          <div className="space-y-4">
            <div>
              <label htmlFor="booking-area" className="mb-1.5 flex items-center gap-1 text-sm font-medium text-pt-ink">
                Patient’s area
                <InfoTip>Only the areas you cover are listed. The travel charge for the area is added to the price.</InfoTip>
              </label>
              <select
                id="booking-area"
                value={visit ? `${visit.zoneId}::${visit.area}` : ''}
                onChange={(e) => {
                  const [zoneId, ...rest] = e.target.value.split('::')
                  setVisit(zoneId ? { zoneId, area: rest.join('::') } : null)
                }}
                className={cn(fieldClass, 'h-11 w-full border px-3 text-sm')}
              >
                <option value="">{zones === undefined ? 'Loading areas…' : 'Choose an area you cover'}</option>
                {coveredZones.map((zone) => (
                  <optgroup key={zone.id} label={`${zone.name}, ${zone.city}`}>
                    {zone.areas.map((area) => (
                      <option key={area} value={`${zone.id}::${area}`}>
                        {area}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="booking-address" className="mb-1.5 block text-sm font-medium text-pt-ink">
                Address for the visit
              </label>
              <Textarea
                id="booking-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="House number, street and any landmarks"
                rows={2}
                maxLength={500}
                className={cn(fieldClass, 'resize-none')}
              />
            </div>
          </div>
        )}

        {!isRehabify && mode === 'in-person' && (
          <div>
            <label htmlFor="booking-location" className="mb-1.5 block text-sm font-medium text-pt-ink">
              Where <span className="font-normal text-pt-faint">(optional)</span>
            </label>
            <Input
              id="booking-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Clinic or the patient’s address"
              maxLength={300}
              className={cn(fieldClass, 'h-11')}
            />
          </div>
        )}

        {isRehabify && service && (
          <div className="rounded-2xl bg-pt-green-bg p-4 text-pt-green-fg">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              {quote?.ok
                ? `${firstName} pays ${formatKobo(quote.chargeKobo)} to confirm`
                : `${firstName} pays ${service.travelApplies ? 'from ' : ''}${formatKobo(service.priceKobo)} to confirm`}
              <InfoTip>
                The price is Rehabify’s standard price{service.travelApplies ? ' plus travel for the area' : ''}. You earn {formatKobo(service.payoutKobo)}
                {service.travelApplies ? ' plus your share of travel' : ''} once the session is done.
              </InfoTip>
            </p>
            <p className="mt-1 text-xs opacity-80">They have 24 hours to pay. If they don’t, the time is released.</p>
          </div>
        )}

        <div>
          <label htmlFor="booking-notes" className="mb-1.5 flex items-center gap-1 text-sm font-medium text-pt-ink">
            {isRehabify ? 'Note for the patient' : 'Note for yourself'} <span className="font-normal text-pt-faint">(optional)</span>
          </label>
          <Textarea
            id="booking-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={isRehabify ? 'e.g. Wear comfortable clothes' : 'Anything to remember for this session'}
            rows={3}
            maxLength={1000}
            className={cn(fieldClass, 'resize-none')}
          />
        </div>
      </div>
    )
    footer = (
      <div className="flex gap-2">
        <Button className={cn(secondaryButtonClass, 'h-11 flex-1')} disabled={busy} onClick={() => goTo(options.slot ? 'what' : 'when')}>
          Back
        </Button>
        <Button className={cn(primaryButtonClass, 'h-11 flex-[2]')} disabled={busy} onClick={() => void book()}>
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Booking…
            </>
          ) : isRehabify ? (
            `Send to ${firstName} to pay`
          ) : (
            `Book ${firstName} in`
          )}
        </Button>
      </div>
    )
  }

  if (step === 'done' && slot && patient) {
    body = (
      <div className="py-4 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-pt-green-bg text-pt-green-fg">
          <Check className="h-7 w-7" />
        </span>
        <h3 className="mt-4 text-xl font-semibold tracking-tight text-pt-ink">
          {isRehabify ? `Sent to ${firstName} to pay` : `${firstName} is booked in`}
        </h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-pt-muted">
          {isRehabify && result?.chargeKobo !== undefined && result.holdExpiresAt
            ? `They pay ${formatKobo(result.chargeKobo)} to confirm. We hold the time until ${lagosShortDate(result.holdExpiresAt)}, ${lagosTime(result.holdExpiresAt)}.`
            : `${firstName} gets a notification to confirm the time. You’ll see it on your Schedule.`}
        </p>
        <div className="mt-5 text-left">
          <Summary patient={patient.name} title={sessionTitle} slot={slot} mode={modeLabel} />
        </div>
      </div>
    )
    footer = (
      <div className="grid grid-cols-2 gap-2">
        <Button asChild className={cn(secondaryButtonClass, 'h-11')}>
          <Link href={`/dashboard/physiotherapist/messages?with=${patient.id}`} onClick={close}>
            <MessageSquare className="mr-2 h-4 w-4" />
            Message
          </Link>
        </Button>
        <Button className={cn(primaryButtonClass, 'h-11')} onClick={close}>
          Done
        </Button>
      </div>
    )
  }

  return (
    <PhysioDrawer open={open} onOpenChange={(next) => !next && close()} title={titles[step].title} description={titles[step].description} footer={footer}>
      <div key={step} className="animate-in fade-in slide-in-from-right-2 duration-200">
        {body}
      </div>
    </PhysioDrawer>
  )
}
