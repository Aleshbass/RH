'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/clinic/drawerDialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Plus,
  Video,
} from '@/components/icons'
import {
  addDays,
  addWeeks,
  format,
  isSameDay,
  isToday,
  startOfDay,
  startOfWeek,
} from 'date-fns'
import { cn } from '@/lib/utils'
import { playSound } from '@/lib/sounds'
import { CLINIC_BOOK_EVENT, listenForShortcut, takeQueryParam } from '@/components/clinic/clinicEvents'
import { useClinicAccess } from '@/components/clinic/ClinicAccessContext'
import { BookingRequests } from '@/components/clinic/appointments/BookingRequests'
import AddPatientModal from '@/components/clinic/patients/AddPatientModal'
import { RepeatPlanner, useRepeatPlan } from '@/components/appointments/RepeatPlanner'
import {
  EmptyState,
  PageShell,
  Panel,
  StatusBadge,
  primaryButtonClass,
} from '@/components/clinic/ui'
import { friendlyError, useClinicianOptions } from '@/components/clinic/patients/patient-record-shared'
import { appointmentStatusLabel } from '@/convex/helpers/appointmentStatus'
import {
  AppointmentPlace,
  appointmentBadgeTone,
  type AppointmentLike,
} from '@/components/appointments/appointment-ui'

// ─── Types & helpers ─────────────────────────────────────────────────────────

type Person = { _id: string; firstName?: string; lastName?: string; email?: string; imageUrl?: string } | null | undefined

type Appointment = AppointmentLike & {
  _id: string
  startTime: number
  endTime: number
  status: string
  appointmentType?: 'in-person' | 'telehealth' | string
  serviceType?: string
  notesForTherapist?: string
  physiotherapistId?: string
  /** Set on visits booked together as a repeat */
  repeatGroup?: string
  patient?: Person
  physiotherapist?: Person
}

type ServiceOption = { name: string; priceNaira?: number; durationMinutes?: number }
type DayHours = { open: string; close: string; active: boolean }

type ClinicianOption = { id: string; name: string }

const OPEN_STATUSES = new Set(['scheduled', 'confirmed'])
const BASE_DURATIONS = [15, 30, 45, 60, 75, 90, 120]

function personName(p: Person, fallback: string) {
  const name = `${p?.firstName ?? ''} ${p?.lastName ?? ''}`.trim()
  return name || p?.email || fallback
}

function clinicianIdOf(apt: Appointment) {
  return String(apt.physiotherapistId ?? apt.physiotherapist?._id ?? '')
}

function toTimestamp(date: string, time: string) {
  return new Date(`${date}T${time}:00`).getTime()
}

// By name: the generated `api` type is at TypeScript's depth limit
const cancelRepeatVisitsRef = makeFunctionReference<
  'mutation',
  { appointmentId: Id<'appointments'>; cancellationReason?: string },
  { success: boolean; cancelled: number }
>('clinicTools:cancelClinicRepeatVisits')

function dayKey(date: Date) {
  return format(date, 'EEEE').toLowerCase()
}

// Same labels as the physio and patient views (the clinic is the provider side)
function statusBadge(apt: Appointment) {
  return (
    <StatusBadge tone={appointmentBadgeTone(apt, 'provider')}>
      {appointmentStatusLabel(apt, 'provider')}
    </StatusBadge>
  )
}

function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/** Returns a short warning when the chosen slot falls outside the clinic's opening hours. */
function hoursWarning(
  workingHours: Record<string, DayHours> | undefined,
  date: string,
  time: string,
  duration: number
) {
  if (!workingHours || !date || !time) return null
  const day = new Date(`${date}T00:00:00`)
  const hours = workingHours[dayKey(day)]
  if (!hours) return null
  if (!hours.active) return `Your clinic is closed on ${format(day, 'EEEE')}s.`
  const start = time
  const endDate = new Date(toTimestamp(date, time) + duration * 60000)
  const end = format(endDate, 'HH:mm')
  if (start < hours.open || end > hours.close || !isSameDay(endDate, day)) {
    return `This is outside your opening hours (${hours.open}–${hours.close}).`
  }
  return null
}

const fieldClass = 'h-9 text-sm'

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ClinicAppointmentsPage() {
  const { requireFullAccess } = useClinicAccess()

  const appointmentsRaw = useQuery(api.clinics.getClinicAppointments, {})
  const patientsRaw = useQuery(api.clinics.getClinicPatients, {})
  const setup = useQuery(api.clinicTools.getClinicSetupDetails, {})

  const updateStatus = useMutation(api.clinicTools.updateAppointmentStatus)
  const cancelRepeatVisits = useMutation(cancelRepeatVisitsRef)

  const [view, setView] = useState<'list' | 'week'>('list')
  const [listTab, setListTab] = useState<'today' | 'upcoming' | 'past'>('today')
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [clinicianFilter, setClinicianFilter] = useState('all')

  const [bookOpen, setBookOpen] = useState(false)
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null)
  // Cancel this visit and the later ones booked with it
  const [cancelRepeats, setCancelRepeats] = useState(false)

  const allAppointments = useMemo(
    () => (appointmentsRaw as Appointment[] | undefined) ?? [],
    [appointmentsRaw]
  )
  const appointments = useMemo(
    () =>
      clinicianFilter === 'all'
        ? allAppointments
        : allAppointments.filter((a) => clinicianIdOf(a) === clinicianFilter),
    [allAppointments, clinicianFilter]
  )
  const workingHours = setup?.workingHours as Record<string, DayHours> | undefined
  const services = ((setup?.priceList ?? []) as ServiceOption[]).filter((s) => s?.name)

  // The owner and active clinicians (front-desk staff can't see patients themselves)
  const clinicianOptions = useClinicianOptions()
  const clinicians = useMemo<ClinicianOption[]>(
    () => clinicianOptions.options.map((o) => ({ id: o.id, name: o.label })),
    [clinicianOptions.options]
  )

  // Clinicians other than the signed-in person; the filter is only useful when there are some
  const otherClinicians = useMemo(
    () => clinicians.filter((c) => c.id !== clinicianOptions.meId),
    [clinicians, clinicianOptions.meId]
  )

  const patients = useMemo(
    () =>
      ((patientsRaw ?? []) as any[]).map((p) => ({
        id: String(p._id),
        name: personName(p, 'Patient'),
        email: (p.email as string | undefined) ?? '',
        phone: (p.phoneNumber as string | undefined) ?? '',
      })),
    [patientsRaw]
  )

  const groups = useMemo(() => {
    const now = Date.now()
    const todayList: Appointment[] = []
    const upcoming: Appointment[] = []
    const past: Appointment[] = []
    for (const apt of appointments) {
      const start = new Date(apt.startTime)
      if (isToday(start)) todayList.push(apt)
      else if (apt.startTime > now) upcoming.push(apt)
      else past.push(apt)
    }
    todayList.sort((a, b) => a.startTime - b.startTime)
    upcoming.sort((a, b) => a.startTime - b.startTime)
    past.sort((a, b) => b.startTime - a.startTime)
    return { today: todayList, upcoming, past }
  }, [appointments])

  const setStatus = async (
    apt: Appointment,
    status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show',
    cancellationReason?: string
  ) => {
    const labels = {
      scheduled: 'Reopen appointment',
      confirmed: 'Confirm appointment',
      completed: 'Mark attended',
      cancelled: 'Cancel appointment',
      no_show: 'Mark no-show',
    } as const
    if (!requireFullAccess(labels[status])) return false
    try {
      await updateStatus({
        appointmentId: apt._id as Id<'appointments'>,
        status,
        cancellationReason: cancellationReason || undefined,
      })
      const done = {
        scheduled: 'Appointment reopened',
        confirmed: 'Appointment confirmed. The patient has been told.',
        completed: 'Marked as attended',
        cancelled: 'Appointment cancelled',
        no_show: 'Marked as no-show',
      } as const
      playSound(status === 'cancelled' || status === 'no_show' ? 'reject' : status === 'confirmed' ? 'approve' : 'success')
      toast.success(done[status])
      return true
    } catch (err: any) {
      toast.error(friendlyError(err, 'Could not update the appointment. Please try again.'))
      return false
    }
  }

  const openBook = () => requireFullAccess('Book appointment', () => setBookOpen(true))
  // "Book appointment" in the top bar or on Home (?book=1) opens the form here
  // A patient's request (Requests panel): the booking form opens with them already chosen
  const [bookPreset, setBookPreset] = useState<{ patientId: string; clinicianId: string | null } | null>(null)
  const bookFor = (patientId: string, clinicianId: string | null) =>
    requireFullAccess('Book appointment', () => {
      setBookPreset({ patientId, clinicianId })
      setBookOpen(true)
    })
  // From a patient's record (?book=1&patient=<id>) the form opens with them chosen
  const openBookRef = useRef<() => void>(() => undefined)
  openBookRef.current = () => {
    const patientId = takeQueryParam('patient')
    if (patientId) bookFor(patientId, null)
    else openBook()
  }
  useEffect(() => listenForShortcut(CLINIC_BOOK_EVENT, 'book', () => openBookRef.current()), [])

  const actionsMenu = (apt: Appointment, trigger: React.ReactNode) => {
    const isOpen = OPEN_STATUSES.has(apt.status)
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 text-sm">
          {apt.status !== 'completed' && (
            <DropdownMenuItem
              onClick={() => requireFullAccess('Reschedule appointment', () => setRescheduleTarget(apt))}
            >
              {clinicians.length > 1 ? 'Reschedule or reassign' : 'Reschedule'}
            </DropdownMenuItem>
          )}
          {apt.status === 'scheduled' && apt.endTime > Date.now() && (
            <DropdownMenuItem onClick={() => setStatus(apt, 'confirmed')}>Confirm appointment</DropdownMenuItem>
          )}
          {isOpen && (
            <>
              <DropdownMenuItem onClick={() => setStatus(apt, 'completed')}>Mark attended</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatus(apt, 'no_show')}>Mark no-show</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-pt-rose-fg focus:text-pt-rose-fg"
                onClick={() =>
                  requireFullAccess('Cancel appointment', () => {
                    setCancelRepeats(false)
                    setCancelTarget(apt)
                  })
                }
              >
                Cancel appointment
              </DropdownMenuItem>
              {apt.repeatGroup && (
                <DropdownMenuItem
                  className="text-pt-rose-fg focus:text-pt-rose-fg"
                  onClick={() =>
                    requireFullAccess('Cancel appointment', () => {
                      setCancelRepeats(true)
                      setCancelTarget(apt)
                    })
                  }
                >
                  Cancel this and later repeats
                </DropdownMenuItem>
              )}
            </>
          )}
          {!isOpen && (
            <DropdownMenuItem onClick={() => setStatus(apt, 'scheduled')}>Reopen</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const bookButton = (
    <Button size="sm" onClick={openBook} className={cn('h-9', primaryButtonClass)}>
      <Plus className="mr-1.5 h-4 w-4" />
      Book appointment
    </Button>
  )

  if (appointmentsRaw === undefined) {
    return (
      <PageShell title="Appointments" actions={bookButton}>
        <Skeleton className="h-9 w-64 rounded-lg" />
        <div className="space-y-2 rounded-2xl border border-pt-line bg-pt-surface p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </PageShell>
    )
  }

  const listItems = groups[listTab]
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekEnd = addDays(weekStart, 6)

  return (
    <PageShell
      title="Appointments"
      description="Book, move and track visits for your patients."
      info="Every visit at your clinic, for every clinician. Patients book their own clinician in their portal; requests for other times or clinicians show at the top."
      actions={bookButton}
    >
      <BookingRequests onBook={bookFor} />

      {/* View switch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <Segmented
            value={view}
            onChange={(v) => setView(v as 'list' | 'week')}
            options={[
              { value: 'list', label: 'List' },
              { value: 'week', label: 'Week' },
            ]}
          />
          {otherClinicians.length > 0 && (
            <Select value={clinicianFilter} onValueChange={setClinicianFilter}>
              <SelectTrigger
                size="sm"
                aria-label="Filter by clinician"
                className="w-48 max-w-full rounded-lg border-pt-line bg-pt-surface text-sm text-pt-ink shadow-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clinicians</SelectItem>
                {clinicianOptions.meId && <SelectItem value={clinicianOptions.meId}>You</SelectItem>}
                {otherClinicians.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="block truncate">{c.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {view === 'list' ? (
          <Segmented
            value={listTab}
            onChange={(v) => setListTab(v as typeof listTab)}
            options={[
              { value: 'today', label: `Today (${groups.today.length})` },
              { value: 'upcoming', label: `Upcoming (${groups.upcoming.length})` },
              { value: 'past', label: `Past (${groups.past.length})` },
            ]}
          />
        ) : (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Previous week"
              onClick={() => setWeekStart((d) => addWeeks(d, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-sm"
              onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Next week"
              onClick={() => setWeekStart((d) => addWeeks(d, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="ml-1 text-sm font-medium text-pt-ink">
              {format(weekStart, 'd MMM')} – {format(weekEnd, 'd MMM yyyy')}
            </span>
          </div>
        )}
      </div>

      {view === 'list' ? (
        <Panel bodyClassName="divide-y divide-pt-line">
          {listItems.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-8 w-8" />}
              title={
                listTab === 'today'
                  ? 'No appointments today'
                  : listTab === 'upcoming'
                    ? 'No upcoming appointments'
                    : 'No past appointments'
              }
              description={listTab === 'past' ? undefined : 'Book a visit and it will show here.'}
              action={
                listTab === 'past' ? undefined : (
                  <Button size="sm" onClick={openBook} className={primaryButtonClass}>
                    Book appointment
                  </Button>
                )
              }
            />
          ) : (
            listItems.map((apt) => (
              <AppointmentRow
                key={apt._id}
                apt={apt}
                showDate={listTab !== 'today'}
                menu={actionsMenu(
                  apt,
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-pt-muted"
                    aria-label="Appointment actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                )}
              />
            ))
          )}
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
          {weekDays.map((day) => {
            const hours = workingHours?.[dayKey(day)]
            const closed = hours ? !hours.active : false
            const dayApts = appointments
              .filter((a) => isSameDay(new Date(a.startTime), day))
              .sort((a, b) => a.startTime - b.startTime)
            const today = isToday(day)
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'min-w-0 rounded-xl border md:min-h-[220px]',
                  closed
                    ? 'border-pt-line bg-pt-sunken'
                    : 'border-pt-line bg-pt-surface'
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b border-pt-line px-3 py-2 md:flex-col md:items-start md:gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-pt-muted">
                      {format(day, 'EEE')}
                    </span>
                    <span
                      className={cn(
                        'inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-sm font-semibold tabular-nums',
                        today
                          ? 'bg-rh-lime text-rh-ink dark:bg-rh-lime dark:text-neutral-950'
                          : 'text-pt-ink'
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                  </div>
                  <span className="text-[11px] text-pt-muted">
                    {closed ? 'Closed' : hours ? `${hours.open}–${hours.close}` : ''}
                  </span>
                </div>
                <div className="space-y-1.5 p-2">
                  {dayApts.length === 0 ? (
                    <p className="px-1 py-1 text-xs text-pt-faint">
                      {closed ? '' : 'No visits'}
                    </p>
                  ) : (
                    dayApts.map((apt) => {
                      const inactive = !OPEN_STATUSES.has(apt.status) && apt.status !== 'completed'
                      return (
                        <div key={apt._id}>
                          {actionsMenu(
                            apt,
                            <button
                              type="button"
                              className={cn(
                                'w-full min-w-0 rounded-lg border px-2 py-1.5 text-left transition-colors hover:border-pt-line-strong',
                                OPEN_STATUSES.has(apt.status)
                                  ? 'border-l-2 border-pt-line border-l-rh-lime bg-pt-surface dark:border-l-rh-lime'
                                  : 'border-pt-line bg-pt-sunken',
                                inactive && 'opacity-60'
                              )}
                            >
                              <p className="text-[11px] font-medium tabular-nums text-pt-muted">
                                {format(new Date(apt.startTime), 'HH:mm')}
                                {apt.appointmentType === 'telehealth' && ' · Video'}
                              </p>
                              <p
                                className={cn(
                                  'truncate text-xs font-medium text-pt-ink',
                                  inactive && 'line-through'
                                )}
                              >
                                {personName(apt.patient, 'Patient')}
                              </p>
                              <p className="truncate text-[11px] text-pt-muted">
                                {personName(apt.physiotherapist, 'Clinician')}
                              </p>
                            </button>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <BookDialog
        open={bookOpen}
        onOpenChange={(open) => {
          setBookOpen(open)
          if (!open) setBookPreset(null)
        }}
        preset={bookPreset}
        patients={patients}
        patientsLoading={patientsRaw === undefined}
        clinicians={clinicians}
        services={services}
        workingHours={workingHours}
      />

      <RescheduleDialog
        apt={rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        workingHours={workingHours}
        clinicians={clinicians}
      />

      <CancelDialog
        apt={cancelTarget}
        repeats={cancelRepeats}
        onClose={() => setCancelTarget(null)}
        onConfirm={async (reason) => {
          if (!cancelTarget) return
          if (!cancelRepeats) {
            const ok = await setStatus(cancelTarget, 'cancelled', reason)
            if (ok) setCancelTarget(null)
            return
          }
          try {
            const result = await cancelRepeatVisits({
              appointmentId: cancelTarget._id as Id<'appointments'>,
              cancellationReason: reason || undefined,
            })
            playSound('reject')
            toast.success(`${result.cancelled} visit${result.cancelled === 1 ? '' : 's'} cancelled. The patient has been told.`)
            setCancelTarget(null)
          } catch (err: any) {
            toast.error(friendlyError(err, 'Could not cancel the visits. Please try again.'))
          }
        }}
      />
    </PageShell>
  )
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="max-w-full overflow-x-auto">
      <div
        role="tablist"
        className="inline-flex whitespace-nowrap rounded-lg border border-pt-line bg-pt-surface p-0.5"
      >
        {options.map((o) => {
          const active = o.value === value
          return (
            <button
              key={o.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(o.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-pt-primary text-pt-on-primary'
                  : 'text-pt-muted hover:text-pt-ink'
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AppointmentRow({
  apt,
  showDate,
  menu,
}: {
  apt: Appointment
  showDate: boolean
  menu: React.ReactNode
}) {
  const start = new Date(apt.startTime)
  const minutes = Math.round((apt.endTime - apt.startTime) / 60000)
  const isVideo = apt.appointmentType === 'telehealth'
  return (
    <div className="flex items-start gap-3 px-5 py-3 sm:items-center sm:px-6">
      <div className="w-16 shrink-0 sm:w-20">
        <p className="text-sm font-semibold tabular-nums text-pt-ink">
          {format(start, 'HH:mm')}
        </p>
        <p className="text-xs text-pt-muted">
          {showDate ? format(start, 'EEE d MMM') : durationLabel(minutes)}
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-sm font-medium text-pt-ink">
            {personName(apt.patient, 'Patient')}
          </p>
          {statusBadge(apt)}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-pt-muted">
          <span className="truncate">with {personName(apt.physiotherapist, 'clinician')}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            {isVideo && <Video className="h-3 w-3" />}
            {isVideo ? 'Video' : apt.location ? 'In person' : 'In clinic'}
          </span>
          {apt.serviceType && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{apt.serviceType}</span>
            </>
          )}
        </p>
        {/* The address for a visit away from the clinic, or the join link for a video visit */}
        {(isVideo || apt.location) && (
          <AppointmentPlace appointment={apt} viewer="provider" className="mt-1 text-xs" />
        )}
      </div>
      {menu}
    </div>
  )
}

function BookDialog({
  open,
  onOpenChange,
  patients,
  patientsLoading,
  clinicians,
  services,
  workingHours,
  preset,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Open with this patient (and clinician) already chosen */
  preset?: { patientId: string; clinicianId: string | null } | null
  patients: { id: string; name: string; email: string; phone: string }[]
  patientsLoading: boolean
  clinicians: ClinicianOption[]
  services: ServiceOption[]
  workingHours?: Record<string, DayHours>
}) {
  const { requireFullAccess } = useClinicAccess()
  const bookAppointment = useMutation(api.clinicTools.bookClinicAppointment)

  const empty = {
    patientId: '',
    clinicianId: '',
    service: 'none',
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '09:00',
    duration: 60,
    mode: 'in-person' as 'in-person' | 'telehealth',
    note: '',
  }
  const [form, setForm] = useState(empty)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  // A patient added from this form, shown as chosen before the patient list catches up
  const [addOpen, setAddOpen] = useState(false)
  const [added, setAdded] = useState<{ id: string; name: string } | null>(null)
  useEffect(() => {
    if (open && preset) setForm((current) => ({ ...current, patientId: preset.patientId, clinicianId: preset.clinicianId ?? '' }))
  }, [open, preset])

  const filteredPatients = search.trim()
    ? patients.filter((p) =>
        `${p.name} ${p.email} ${p.phone}`.toLowerCase().includes(search.trim().toLowerCase())
      )
    : patients
  const selectedPatient = patients.find((p) => p.id === form.patientId) ?? (added?.id === form.patientId ? added : undefined)

  const startAt = form.date && form.time ? toTimestamp(form.date, form.time) : NaN
  // Already over: a visit that happened but was never entered. It is saved as attended.
  const isPast = !Number.isNaN(startAt) && startAt + form.duration * 60000 <= Date.now()
  // A course of visits: the planner checks the clinician's diary and the patient's care plan
  const repeat = useRepeatPlan({
    firstStart: Number.isNaN(startAt) ? null : startAt,
    durationMinutes: form.duration,
    physiotherapistId: form.clinicianId || null,
    patientId: form.patientId || null,
  })
  const durations = Array.from(new Set([...BASE_DURATIONS, form.duration])).sort((a, b) => a - b)
  const warning = hoursWarning(workingHours, form.date, form.time, form.duration)

  const reset = () => {
    setForm(empty)
    setSearch('')
    setAdded(null)
    repeat.setEnabled(false)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!requireFullAccess('Book appointment')) return
    if (!form.patientId) return toast.error('Choose a patient.')
    if (!form.clinicianId) return toast.error('Choose a clinician.')
    if (!form.date || !form.time) return toast.error('Choose a date and time.')
    const start = toTimestamp(form.date, form.time)
    if (Number.isNaN(start)) return toast.error('That date or time is not valid.')

    setSaving(true)
    try {
      const result = await bookAppointment({
        patientId: form.patientId as Id<'users'>,
        physiotherapistId: form.clinicianId as Id<'users'>,
        startTime: start,
        endTime: start + form.duration * 60000,
        appointmentType: form.mode,
        notes: form.note.trim() || undefined,
        serviceType: form.service !== 'none' ? form.service : undefined,
        repeatStartTimes: repeat.bookStarts.length > 0 ? repeat.bookStarts : undefined,
      })
      playSound('booked')
      const skipped = ((result?.skipped ?? []) as number[]).map((t) => format(t, 'EEE d MMM'))
      if (repeat.total > 1) {
        toast.success(`${result?.booked ?? repeat.total} visits booked`, {
          description: skipped.length
            ? `Not booked, because the clinician already has a visit then: ${skipped.join(', ')}.`
            : `From ${format(start, 'EEE d MMM, HH:mm')}.`,
          duration: skipped.length ? 12000 : undefined,
        })
      } else if (result?.past) {
        toast.success(`Saved as an attended visit on ${format(start, 'EEE d MMM, HH:mm')}`)
      } else {
        toast.success(`Booked for ${format(start, 'EEE d MMM, HH:mm')}`)
      }
      reset()
      onOpenChange(false)
    } catch (err: any) {
      toast.error(friendlyError(err, 'Could not book the appointment. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Adding a patient opens on top of this form; closing that one must not close this
        if (saving || addOpen) return
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Book appointment</DialogTitle>
          <DialogDescription className="text-sm">
            Choose the patient, clinician and time. A visit that already happened can be added with its past date.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm">Patient</Label>
              <button
                type="button"
                onClick={() => requireFullAccess('Add patient', () => setAddOpen(true))}
                className="inline-flex items-center gap-1 text-sm font-medium text-rh-ink underline-offset-2 hover:underline dark:text-rh-lime"
              >
                <Plus className="h-3.5 w-3.5" /> New patient
              </button>
            </div>
            {!patientsLoading && patients.length === 0 && !selectedPatient ? (
              <p className="rounded-lg border border-pt-line px-3 py-2 text-sm text-pt-muted">
                You have no patients yet. Use “New patient” to add one here.
              </p>
            ) : (
              <>
                {patients.length > 6 && (
                  <Input
                    placeholder="Search by name, phone or email"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className={fieldClass}
                  />
                )}
                <Select value={form.patientId} onValueChange={(v) => setForm({ ...form, patientId: v })}>
                  <SelectTrigger className={fieldClass}>
                    <SelectValue placeholder={patientsLoading ? 'Loading patients…' : 'Choose a patient'}>
                      {selectedPatient?.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {filteredPatients.length === 0 ? (
                      <p className="px-2 py-1.5 text-sm text-pt-muted">No match</p>
                    ) : (
                      filteredPatients.slice(0, 100).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="block truncate">
                            {p.name}
                            {p.email && <span className="text-pt-muted"> · {p.email}</span>}
                          </span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Clinician</Label>
            <Select value={form.clinicianId} onValueChange={(v) => setForm({ ...form, clinicianId: v })}>
              <SelectTrigger className={fieldClass}>
                <SelectValue placeholder="Choose a clinician" />
              </SelectTrigger>
              <SelectContent>
                {clinicians.length === 0 ? (
                  <p className="px-2 py-1.5 text-sm text-pt-muted">No clinicians yet</p>
                ) : (
                  clinicians.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {services.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-sm">
                Service <span className="font-normal text-pt-muted">(optional)</span>
              </Label>
              <Select
                value={form.service}
                onValueChange={(v) => {
                  const svc = services.find((s) => s.name === v)
                  setForm({
                    ...form,
                    service: v,
                    duration: svc?.durationMinutes && svc.durationMinutes > 0 ? svc.durationMinutes : form.duration,
                  })
                }}
              >
                <SelectTrigger className={fieldClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific service</SelectItem>
                  {services.map((s) => (
                    <SelectItem key={s.name} value={s.name}>
                      {s.name}
                      {s.durationMinutes ? ` · ${durationLabel(s.durationMinutes)}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Date</Label>
              {/* Past dates are allowed: a visit that happened but was never entered */}
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className={fieldClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Time</Label>
              <Input
                type="time"
                step={300}
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className={fieldClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Length</Label>
              <Select
                value={String(form.duration)}
                onValueChange={(v) => setForm({ ...form, duration: Number(v) })}
              >
                <SelectTrigger className={fieldClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {durations.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {durationLabel(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {warning && <p className="text-xs text-pt-amber-fg">{warning}</p>}
          {isPast && (
            <p className="rounded-lg bg-pt-accent-soft px-3 py-2 text-xs text-pt-ink">
              This time has passed, so it is saved as a visit the patient attended. No reminder or confirmation is sent.
            </p>
          )}

          <RepeatPlanner repeat={repeat} />

          <div className="space-y-1.5">
            <Label className="text-sm">Where</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: 'in-person', label: 'In clinic' },
                  { value: 'telehealth', label: 'Video' },
                ] as const
              ).map((m) => {
                const active = form.mode === m.value
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setForm({ ...form, mode: m.value })}
                    aria-pressed={active}
                    className={cn(
                      'h-9 rounded-xl border text-sm font-medium transition-colors',
                      active
                        ? 'border-pt-primary bg-pt-primary text-pt-on-primary'
                        : 'border-pt-line text-pt-ink hover:border-pt-line-strong'
                    )}
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">
              Note for the clinician <span className="font-normal text-pt-muted">(optional)</span>
            </Label>
            <Textarea
              rows={2}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="e.g. First visit, knee pain after surgery"
              className="text-sm"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              disabled={saving}
              onClick={() => {
                reset()
                onOpenChange(false)
              }}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving} className={cn('h-9', primaryButtonClass)}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {saving
                ? 'Booking…'
                : repeat.total > 1
                  ? `Book ${repeat.total} sessions`
                  : isPast
                    ? 'Save past visit'
                    : 'Book appointment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    {/* A new patient without leaving the booking: they come back already chosen */}
    <AddPatientModal
      isOpen={addOpen}
      onClose={() => setAddOpen(false)}
      onSuccess={(patient) => {
        setAdded({ id: patient.patientId, name: patient.name })
        setForm((current) => ({ ...current, patientId: patient.patientId, clinicianId: patient.clinicianId || current.clinicianId }))
      }}
    />
    </>
  )
}

function RescheduleDialog({
  apt,
  onClose,
  workingHours,
  clinicians,
}: {
  apt: Appointment | null
  onClose: () => void
  workingHours?: Record<string, DayHours>
  clinicians: ClinicianOption[]
}) {
  return (
    <Dialog open={!!apt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        {apt && (
          <RescheduleForm
            key={apt._id}
            apt={apt}
            onClose={onClose}
            workingHours={workingHours}
            clinicians={clinicians}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function RescheduleForm({
  apt,
  onClose,
  workingHours,
  clinicians,
}: {
  apt: Appointment
  onClose: () => void
  workingHours?: Record<string, DayHours>
  clinicians: ClinicianOption[]
}) {
  const { requireFullAccess } = useClinicAccess()
  const reschedule = useMutation(api.clinicTools.rescheduleClinicAppointment)
  const currentLength = Math.max(5, Math.round((apt.endTime - apt.startTime) / 60000))
  const currentClinicianId = clinicianIdOf(apt)
  const [date, setDate] = useState(format(new Date(apt.startTime), 'yyyy-MM-dd'))
  const [time, setTime] = useState(format(new Date(apt.startTime), 'HH:mm'))
  const [duration, setDuration] = useState(currentLength)
  const [clinicianId, setClinicianId] = useState(currentClinicianId)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  // Keep the current clinician selectable even if they're no longer active staff
  const clinicianOptions =
    currentClinicianId && !clinicians.some((c) => c.id === currentClinicianId)
      ? [{ id: currentClinicianId, name: personName(apt.physiotherapist, 'Current clinician') }, ...clinicians]
      : clinicians
  const canReassign = clinicianOptions.length > 1
  const clinicianChanged = !!clinicianId && clinicianId !== currentClinicianId
  const newClinicianName = clinicianOptions.find((c) => c.id === clinicianId)?.name

  const durations = Array.from(new Set([...BASE_DURATIONS, currentLength, duration])).sort((a, b) => a - b)
  const warning = hoursWarning(workingHours, date, time, duration)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!requireFullAccess('Reschedule appointment')) return
    if (!date || !time) return toast.error('Choose a date and time.')
    const start = toTimestamp(date, time)
    if (Number.isNaN(start)) return toast.error('That date or time is not valid.')
    if (start < startOfDay(new Date()).getTime()) return toast.error('Pick a date from today onwards.')
    setSaving(true)
    try {
      await reschedule({
        appointmentId: apt._id as Id<'appointments'>,
        startTime: start,
        endTime: start + duration * 60000,
        reason: reason.trim() || undefined,
        physiotherapistId: clinicianChanged ? (clinicianId as Id<'users'>) : undefined,
      })
      playSound('booked')
      toast.success(
        clinicianChanged
          ? `Moved to ${format(start, 'EEE d MMM, HH:mm')} with ${newClinicianName ?? 'the new clinician'}`
          : `Moved to ${format(start, 'EEE d MMM, HH:mm')}`
      )
      onClose()
    } catch (err: any) {
      toast.error(friendlyError(err, 'Could not reschedule. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-base font-semibold">
          {canReassign ? 'Reschedule or reassign' : 'Reschedule'}
        </DialogTitle>
        <DialogDescription className="text-sm">
          {personName(apt.patient, 'Patient')} · currently {format(new Date(apt.startTime), 'EEE d MMM, HH:mm')}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        {canReassign && (
          <div className="space-y-1.5">
            <Label className="text-sm">Clinician</Label>
            <Select value={clinicianId} onValueChange={setClinicianId}>
              <SelectTrigger className={cn(fieldClass, 'w-full')}>
                <SelectValue placeholder="Choose a clinician" />
              </SelectTrigger>
              <SelectContent>
                {clinicianOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="block truncate">{c.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-sm">Date</Label>
            <Input
              type="date"
              value={date}
              min={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => setDate(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Time</Label>
            <Input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} className={fieldClass} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Length</Label>
            <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
              <SelectTrigger className={fieldClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {durations.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {durationLabel(d)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {warning && <p className="text-xs text-pt-amber-fg">{warning}</p>}
        <div className="space-y-1.5">
          <Label className="text-sm">
            Reason <span className="font-normal text-pt-muted">(optional)</span>
          </Label>
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Patient asked for a later time"
            className="text-sm"
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="sm" className="h-9" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving} className={cn('h-9', primaryButtonClass)}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

function CancelDialog({
  apt,
  repeats,
  onClose,
  onConfirm,
}: {
  apt: Appointment | null
  /** Also cancel the later visits booked with this one */
  repeats?: boolean
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  return (
    <Dialog
      open={!!apt}
      onOpenChange={(o) => {
        if (!o && !saving) {
          setReason('')
          onClose()
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {repeats ? 'Cancel this and the later repeat visits?' : 'Cancel this appointment?'}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {apt
              ? `${personName(apt.patient, 'Patient')} · ${format(new Date(apt.startTime), 'EEE d MMM, HH:mm')}. ${
                  repeats
                    ? 'Every upcoming visit booked with this one, from this date on, is cancelled. Earlier visits stay.'
                    : 'You can reopen it later if needed.'
                }`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-sm">
            Reason <span className="font-normal text-pt-muted">(optional)</span>
          </Label>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="text-sm" />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={saving}
            onClick={() => {
              setReason('')
              onClose()
            }}
          >
            Keep appointment
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            className="h-9 bg-pt-rose-bg text-pt-rose-fg hover:brightness-95"
            onClick={async () => {
              setSaving(true)
              try {
                await onConfirm(reason.trim())
                setReason('')
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {repeats ? 'Cancel these visits' : 'Cancel appointment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
