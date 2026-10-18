'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation } from 'convex/react'
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
} from '@/components/ui/dialog'
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
} from 'lucide-react'
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
import { useClinicPreview } from '@/components/clinic/ClinicPreviewContext'
import {
  EmptyState,
  PageShell,
  Panel,
  StatusBadge,
  primaryButtonClass,
} from '@/components/clinic/ui'
import { friendlyError, useClinicianOptions } from '@/components/clinic/patients/patient-record-shared'

// ─── Types & helpers ─────────────────────────────────────────────────────────

type Person = { _id: string; firstName?: string; lastName?: string; email?: string; imageUrl?: string } | null | undefined

type Appointment = {
  _id: string
  startTime: number
  endTime: number
  status: string
  appointmentType?: 'in-person' | 'telehealth' | string
  serviceType?: string
  notesForTherapist?: string
  physiotherapistId?: string
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

function dayKey(date: Date) {
  return format(date, 'EEEE').toLowerCase()
}

function statusBadge(status: string) {
  switch (status) {
    case 'scheduled':
      return <StatusBadge tone="teal">Booked</StatusBadge>
    case 'confirmed':
      return <StatusBadge tone="teal">Confirmed</StatusBadge>
    case 'completed':
      return <StatusBadge tone="green">Attended</StatusBadge>
    case 'no_show':
      return <StatusBadge tone="amber">No-show</StatusBadge>
    case 'cancelled_by_patient':
      return <StatusBadge tone="red">Cancelled by patient</StatusBadge>
    case 'cancelled_by_therapist':
      return <StatusBadge tone="red">Cancelled</StatusBadge>
    default:
      return <StatusBadge>{status.replace(/_/g, ' ')}</StatusBadge>
  }
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
  const { requireFullAccess } = useClinicPreview()

  const appointmentsRaw = useQuery(api.clinics.getClinicAppointments, {})
  const patientsRaw = useQuery(api.clinics.getClinicPatients, {})
  const setup = useQuery(api.clinicTools.getClinicSetupDetails, {})

  const updateStatus = useMutation(api.clinicTools.updateAppointmentStatus)

  const [view, setView] = useState<'list' | 'week'>('list')
  const [listTab, setListTab] = useState<'today' | 'upcoming' | 'past'>('today')
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [clinicianFilter, setClinicianFilter] = useState('all')

  const [bookOpen, setBookOpen] = useState(false)
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null)

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
    status: 'scheduled' | 'completed' | 'cancelled' | 'no_show',
    cancellationReason?: string
  ) => {
    const labels = {
      scheduled: 'Reopen appointment',
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
        completed: 'Marked as attended',
        cancelled: 'Appointment cancelled',
        no_show: 'Marked as no-show',
      } as const
      toast.success(done[status])
      return true
    } catch (err: any) {
      toast.error(friendlyError(err, 'Could not update the appointment. Please try again.'))
      return false
    }
  }

  const openBook = () => requireFullAccess('Book appointment', () => setBookOpen(true))

  const actionsMenu = (apt: Appointment, trigger: React.ReactNode) => {
    const isOpen = OPEN_STATUSES.has(apt.status)
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 text-sm">
          {apt.status !== 'completed' && (
            <DropdownMenuItem
              onClick={() => requireFullAccess('Reschedule appointment', () => setRescheduleTarget(apt))}
            >
              {clinicians.length > 1 ? 'Reschedule or reassign' : 'Reschedule'}
            </DropdownMenuItem>
          )}
          {isOpen && (
            <>
              <DropdownMenuItem onClick={() => setStatus(apt, 'completed')}>Mark attended</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatus(apt, 'no_show')}>Mark no-show</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600 dark:text-red-400"
                onClick={() => requireFullAccess('Cancel appointment', () => setCancelTarget(apt))}
              >
                Cancel appointment
              </DropdownMenuItem>
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
        <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
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
      actions={bookButton}
    >
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
                className="w-48 max-w-full rounded-lg border-neutral-200 bg-white text-sm text-neutral-700 shadow-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
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
            <span className="ml-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {format(weekStart, 'd MMM')} – {format(weekEnd, 'd MMM yyyy')}
            </span>
          </div>
        )}
      </div>

      {view === 'list' ? (
        <Panel bodyClassName="divide-y divide-neutral-200 dark:divide-neutral-800">
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
                    className="h-8 w-8 shrink-0 text-neutral-500"
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
                    ? 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950'
                    : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800 md:flex-col md:items-start md:gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      {format(day, 'EEE')}
                    </span>
                    <span
                      className={cn(
                        'inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-sm font-semibold tabular-nums',
                        today
                          ? 'bg-[#005b57] text-white dark:bg-[#2dd4bf] dark:text-neutral-950'
                          : 'text-neutral-900 dark:text-white'
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                  </div>
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    {closed ? 'Closed' : hours ? `${hours.open}–${hours.close}` : ''}
                  </span>
                </div>
                <div className="space-y-1.5 p-2">
                  {dayApts.length === 0 ? (
                    <p className="px-1 py-1 text-xs text-neutral-400 dark:text-neutral-500">
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
                                'w-full min-w-0 rounded-lg border px-2 py-1.5 text-left transition-colors hover:border-neutral-300 dark:hover:border-neutral-700',
                                OPEN_STATUSES.has(apt.status)
                                  ? 'border-l-2 border-neutral-200 border-l-[#005b57] bg-white dark:border-neutral-800 dark:border-l-[#2dd4bf] dark:bg-neutral-900'
                                  : 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950',
                                inactive && 'opacity-60'
                              )}
                            >
                              <p className="text-[11px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
                                {format(new Date(apt.startTime), 'HH:mm')}
                                {apt.appointmentType === 'telehealth' && ' · Video'}
                              </p>
                              <p
                                className={cn(
                                  'truncate text-xs font-medium text-neutral-900 dark:text-white',
                                  inactive && 'line-through'
                                )}
                              >
                                {personName(apt.patient, 'Patient')}
                              </p>
                              <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
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
        onOpenChange={setBookOpen}
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
        onClose={() => setCancelTarget(null)}
        onConfirm={async (reason) => {
          if (!cancelTarget) return
          const ok = await setStatus(cancelTarget, 'cancelled', reason)
          if (ok) setCancelTarget(null)
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
        className="inline-flex whitespace-nowrap rounded-lg border border-neutral-200 bg-white p-0.5 dark:border-neutral-800 dark:bg-neutral-900"
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
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
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
    <div className="flex items-start gap-3 px-4 py-3 sm:items-center sm:px-5">
      <div className="w-16 shrink-0 sm:w-20">
        <p className="text-sm font-semibold tabular-nums text-neutral-900 dark:text-white">
          {format(start, 'HH:mm')}
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {showDate ? format(start, 'EEE d MMM') : durationLabel(minutes)}
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">
            {personName(apt.patient, 'Patient')}
          </p>
          {statusBadge(apt.status)}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="truncate">with {personName(apt.physiotherapist, 'clinician')}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            {isVideo && <Video className="h-3 w-3" />}
            {isVideo ? 'Video' : 'In clinic'}
          </span>
          {apt.serviceType && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{apt.serviceType}</span>
            </>
          )}
        </p>
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patients: { id: string; name: string; email: string }[]
  patientsLoading: boolean
  clinicians: ClinicianOption[]
  services: ServiceOption[]
  workingHours?: Record<string, DayHours>
}) {
  const { requireFullAccess } = useClinicPreview()
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

  const filteredPatients = search.trim()
    ? patients.filter((p) =>
        `${p.name} ${p.email}`.toLowerCase().includes(search.trim().toLowerCase())
      )
    : patients
  const selectedPatient = patients.find((p) => p.id === form.patientId)
  const durations = Array.from(new Set([...BASE_DURATIONS, form.duration])).sort((a, b) => a - b)
  const warning = hoursWarning(workingHours, form.date, form.time, form.duration)

  const reset = () => {
    setForm(empty)
    setSearch('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!requireFullAccess('Book appointment')) return
    if (!form.patientId) return toast.error('Choose a patient.')
    if (!form.clinicianId) return toast.error('Choose a clinician.')
    if (!form.date || !form.time) return toast.error('Choose a date and time.')
    const start = toTimestamp(form.date, form.time)
    if (Number.isNaN(start)) return toast.error('That date or time is not valid.')
    if (start < Date.now() - 5 * 60000) return toast.error('Pick a time that has not passed yet.')

    setSaving(true)
    try {
      await bookAppointment({
        patientId: form.patientId as Id<'users'>,
        physiotherapistId: form.clinicianId as Id<'users'>,
        startTime: start,
        endTime: start + form.duration * 60000,
        appointmentType: form.mode,
        notes: form.note.trim() || undefined,
        serviceType: form.service !== 'none' ? form.service : undefined,
      })
      playSound('booked')
      toast.success(`Booked for ${format(start, 'EEE d MMM, HH:mm')}`)
      reset()
      onOpenChange(false)
    } catch (err: any) {
      toast.error(friendlyError(err, 'Could not book the appointment. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (saving) return
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Book appointment</DialogTitle>
          <DialogDescription className="text-sm">Choose the patient, clinician and time.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Patient</Label>
            {!patientsLoading && patients.length === 0 ? (
              <p className="rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
                You have no patients yet.{' '}
                <Link href="/dashboard/clinic/patients" className="font-medium text-[#005b57] underline dark:text-[#2dd4bf]">
                  Add a patient
                </Link>{' '}
                first.
              </p>
            ) : (
              <>
                {patients.length > 6 && (
                  <Input
                    placeholder="Search by name or email"
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
                      <p className="px-2 py-1.5 text-sm text-neutral-500">No match</p>
                    ) : (
                      filteredPatients.slice(0, 100).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="block truncate">
                            {p.name}
                            {p.email && <span className="text-neutral-500"> · {p.email}</span>}
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
                  <p className="px-2 py-1.5 text-sm text-neutral-500">No clinicians yet</p>
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
                Service <span className="font-normal text-neutral-500">(optional)</span>
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
              <Input
                type="date"
                value={form.date}
                min={format(new Date(), 'yyyy-MM-dd')}
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
          {warning && <p className="text-xs text-amber-700 dark:text-amber-400">{warning}</p>}

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
                      'h-9 rounded-lg border text-sm font-medium transition-colors',
                      active
                        ? 'border-[#005b57] bg-[#005b57]/5 text-[#005b57] dark:border-[#2dd4bf] dark:bg-[#2dd4bf]/10 dark:text-[#2dd4bf]'
                        : 'border-neutral-200 text-neutral-700 hover:border-neutral-300 dark:border-neutral-800 dark:text-neutral-300'
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
              Note for the clinician <span className="font-normal text-neutral-500">(optional)</span>
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
              {saving ? 'Booking…' : 'Book appointment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  const { requireFullAccess } = useClinicPreview()
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
        {warning && <p className="text-xs text-amber-700 dark:text-amber-400">{warning}</p>}
        <div className="space-y-1.5">
          <Label className="text-sm">
            Reason <span className="font-normal text-neutral-500">(optional)</span>
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
  onClose,
  onConfirm,
}: {
  apt: Appointment | null
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
          <DialogTitle className="text-base font-semibold">Cancel this appointment?</DialogTitle>
          <DialogDescription className="text-sm">
            {apt
              ? `${personName(apt.patient, 'Patient')} · ${format(new Date(apt.startTime), 'EEE d MMM, HH:mm')}. You can reopen it later if needed.`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-sm">
            Reason <span className="font-normal text-neutral-500">(optional)</span>
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
            className="h-9 bg-red-600 text-white hover:bg-red-700"
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
            Cancel appointment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
