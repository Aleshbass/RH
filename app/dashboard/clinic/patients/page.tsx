'use client'

import { useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronRight, Phone, Search, UserPlus, Users } from 'lucide-react'
import { differenceInCalendarDays, format } from 'date-fns'
import AddPatientModal from '@/components/clinic/patients/AddPatientModal'
import PatientClinicalRecordDrawer from '@/components/clinic/patients/PatientClinicalRecordDrawer'
import { useClinicPreview } from '@/components/clinic/ClinicPreviewContext'
import { EmptyState, PageShell, Panel, StatusBadge, primaryButtonClass } from '@/components/clinic/ui'
import { cn } from '@/lib/utils'

type SourceFilter = 'all' | 'rehabify' | 'clinic'

const FILTERS: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'rehabify', label: 'Referred by Rehabify' },
  { value: 'clinic', label: 'Clinic patients' },
]

type CareStatus = 'active' | 'paused' | 'discharged'
type StatusFilter = CareStatus | 'all'

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'In care' },
  { value: 'paused', label: 'Paused' },
  { value: 'discharged', label: 'Discharged' },
  { value: 'all', label: 'All' },
]

// How each status filter reads in a sentence, e.g. "3 discharged patients"
const STATUS_NOUN: Record<StatusFilter, { one: string; many: string }> = {
  active: { one: 'patient in care', many: 'patients in care' },
  paused: { one: 'paused patient', many: 'paused patients' },
  discharged: { one: 'discharged patient', many: 'discharged patients' },
  all: { one: 'patient', many: 'patients' },
}

const SOURCE_SUFFIX: Record<SourceFilter, string> = {
  all: '',
  rehabify: ' referred by Rehabify',
  clinic: ' from your clinic',
}

interface PatientRow {
  _id: string
  firstName: string
  lastName: string
  email: string
  phoneNumber?: string
  imageUrl?: string
  clinician: string
  isReferral: boolean
  lastVisit: number | null
  careStatus: CareStatus
}

function fullName(first?: string, last?: string) {
  return `${first ?? ''} ${last ?? ''}`.trim()
}

function describeLastVisit(days: number | null) {
  if (days === null) return 'No visit yet'
  if (days === 0) return 'Last seen today'
  if (days === 1) return 'Last seen yesterday'
  if (days < 14) return `Last seen ${days} days ago`
  return `Last seen ${Math.floor(days / 7)} weeks ago`
}

function describeCheckInDue(at: number) {
  const days = differenceInCalendarDays(new Date(), new Date(at))
  if (days === 0) return 'Check-in due today'
  if (days === 1) return 'Check-in due yesterday'
  if (days > 1 && days < 14) return `Check-in due ${days} days ago`
  return `Check-in due ${format(new Date(at), 'd MMM')}`
}

export default function ClinicPatientsPage() {
  const { requireFullAccess } = useClinicPreview()
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState<SourceFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false)

  const clinicPatients = useQuery(api.clinics.getClinicPatients, {})
  const followUpQueue = useQuery(api.clinicTools.getClinicFollowUpQueue, {})

  const rows = useMemo<PatientRow[]>(() => {
    if (!clinicPatients) return []
    const now = Date.now()
    return clinicPatients.map((p: any) => {
      const lastSession: number | undefined = p.stats?.lastSessionDate
      return {
        _id: String(p._id),
        firstName: p.firstName ?? '',
        lastName: p.lastName ?? '',
        email: p.email ?? '',
        phoneNumber: p.phoneNumber ?? undefined,
        imageUrl: p.imageUrl ?? undefined,
        clinician: p.primaryPhysiotherapist
          ? fullName(p.primaryPhysiotherapist.firstName, p.primaryPhysiotherapist.lastName)
          : '',
        isReferral: p.source === 'rehabify_referral',
        // lastSessionDate can be a future booking, so only past visits count as "last visit"
        lastVisit: lastSession && lastSession <= now ? lastSession : null,
        // Preview sample rows have no careStatus; they are all in care
        careStatus: p.careStatus === 'paused' || p.careStatus === 'discharged' ? p.careStatus : 'active',
      }
    })
  }, [clinicPatients])

  const statusRows = useMemo(
    () => (statusFilter === 'all' ? rows : rows.filter((p) => p.careStatus === statusFilter)),
    [rows, statusFilter]
  )

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return statusRows.filter((p) => {
      if (filter === 'rehabify' && !p.isReferral) return false
      if (filter === 'clinic' && p.isReferral) return false
      if (!term) return true
      return (
        fullName(p.firstName, p.lastName).toLowerCase().includes(term) ||
        p.email.toLowerCase().includes(term) ||
        (p.phoneNumber ?? '').replace(/\s/g, '').includes(term.replace(/\s/g, ''))
      )
    })
  }, [statusRows, filter, searchTerm])

  const openAddPatient = () => requireFullAccess('Add patient', () => setIsAddPatientOpen(true))

  const addButton = (
    <Button size="sm" onClick={openAddPatient} className={cn(primaryButtonClass, 'h-9')}>
      <UserPlus className="mr-1.5 h-4 w-4" />
      Add patient
    </Button>
  )

  const dueForCheckIn = (followUpQueue ?? []).slice(0, 5)
  const isSearching = Boolean(searchTerm.trim())

  const statusNoun = STATUS_NOUN[statusFilter]
  const inCareCount = rows.filter((p) => p.careStatus === 'active').length
  const countLabel = `${statusRows.length} ${statusRows.length === 1 ? statusNoun.one : statusNoun.many}`
  const description =
    clinicPatients === undefined
      ? undefined
      : statusFilter === 'active'
        ? `${countLabel} at your clinic`
        : statusFilter === 'all'
          ? `${countLabel} · ${inCareCount} in care`
          : countLabel

  return (
    <PageShell title="Patients" description={description} actions={addButton}>
      {dueForCheckIn.length > 0 && (
        <Panel
          title="Due for a check-in"
          description="Check-in date reached, or nothing booked and not seen for a week."
          actions={
            followUpQueue && followUpQueue.length > 5 ? (
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Showing 5 of {followUpQueue.length}
              </span>
            ) : undefined
          }
        >
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {dueForCheckIn.map((item: any) => (
              <li
                key={item.patientId}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{item.patientName}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {[
                      typeof item.checkInDueAt === 'number' ? describeCheckInDue(item.checkInDueAt) : null,
                      describeLastVisit(item.daysSinceLastVisit),
                      item.phone,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {item.phone && (
                    <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                      <a href={`tel:${item.phone.replace(/\s/g, '')}`}>
                        <Phone className="mr-1 h-3.5 w-3.5" />
                        Call
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setSelectedPatientId(String(item.patientId))}
                  >
                    Open record
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            type="search"
            placeholder="Search by name, phone or email"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 border-neutral-200 bg-white pl-9 text-sm dark:border-neutral-800 dark:bg-neutral-900"
            aria-label="Search patients"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter patients by source">
            {FILTERS.map((f) => {
              const active = filter === f.value
              return (
                <button
                  key={f.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    'shrink-0 rounded-lg border px-3 py-1.5 text-sm transition-colors',
                    active
                      ? 'border-[#005b57] bg-[#005b57]/10 font-medium text-[#005b57] dark:border-[#2dd4bf] dark:bg-[#2dd4bf]/10 dark:text-[#2dd4bf]'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-700'
                  )}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
            <SelectTrigger
              aria-label="Filter patients by care status"
              className="h-9 w-full border-neutral-200 bg-white text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 sm:ml-auto sm:w-40"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Panel>
        {clinicPatients === undefined ? (
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="h-3 w-56 max-w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          rows.length === 0 ? (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="No patients yet"
              description="Add the patients you are treating so you can keep their notes, home programmes and documents in one place."
              action={addButton}
            />
          ) : isSearching ? (
            <EmptyState
              icon={<Search className="h-8 w-8" />}
              title={`No ${statusNoun.many}${SOURCE_SUFFIX[filter]} match`}
              description="Try a different name, phone number or email."
              action={
                <Button variant="outline" size="sm" onClick={() => setSearchTerm('')}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title={`No ${statusNoun.many}${SOURCE_SUFFIX[filter]}`}
              action={
                filter !== 'all' ? (
                  <Button variant="outline" size="sm" onClick={() => setFilter('all')}>
                    Show all sources
                  </Button>
                ) : statusFilter === 'active' ? (
                  addButton
                ) : undefined
              }
            />
          )
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {filtered.map((p) => {
              const name = fullName(p.firstName, p.lastName) || p.email || 'Patient'
              const initials = `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase() || 'P'
              const meta = [
                p.phoneNumber,
                p.clinician || 'No clinician',
                p.lastVisit ? `Last visit ${format(new Date(p.lastVisit), 'd MMM yyyy')}` : 'No visit yet',
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <li key={p._id}>
                  <button
                    type="button"
                    onClick={() => setSelectedPatientId(p._id)}
                    className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none dark:hover:bg-neutral-800/50 dark:focus-visible:bg-neutral-800/50 sm:px-5"
                  >
                    <Avatar className="h-9 w-9 shrink-0 border border-neutral-200 dark:border-neutral-800">
                      <AvatarImage src={p.imageUrl} alt="" />
                      <AvatarFallback className="bg-neutral-100 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="min-w-0 truncate text-sm font-medium text-neutral-900 dark:text-white">
                          {name}
                        </span>
                        {p.careStatus === 'paused' && <StatusBadge>Paused</StatusBadge>}
                        {p.careStatus === 'discharged' && <StatusBadge>Discharged</StatusBadge>}
                        {p.isReferral && <StatusBadge tone="teal">Referred by Rehabify</StatusBadge>}
                      </div>
                      <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{meta}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <AddPatientModal isOpen={isAddPatientOpen} onClose={() => setIsAddPatientOpen(false)} />

      <PatientClinicalRecordDrawer
        patientId={selectedPatientId}
        isOpen={!!selectedPatientId}
        onClose={() => setSelectedPatientId(null)}
      />
    </PageShell>
  )
}
