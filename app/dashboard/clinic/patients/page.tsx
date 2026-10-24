'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronRight, Inbox, Phone, Search, UserPlus, Users } from '@/components/icons'
import { differenceInCalendarDays, format } from 'date-fns'
import AddPatientModal from '@/components/clinic/patients/AddPatientModal'
import PatientClinicalRecordDrawer from '@/components/clinic/patients/PatientClinicalRecordDrawer'
import {
  ReferralInbox,
  ReferralProgressBadge,
  isWaitingReferral,
  type ClinicReferral,
} from '@/components/clinic/patients/ReferralInbox'
import { useClinicAccess } from '@/components/clinic/ClinicAccessContext'
import { EmptyState, PageShell, Panel, StatusBadge, primaryButtonClass } from '@/components/clinic/ui'
import { RehabifyId } from '@/components/shared/RehabifyId'
import { matchesRehabifyId } from '@/convex/helpers/rehabifyIdFormat'
import { cn } from '@/lib/utils'

type SourceFilter = 'all' | 'referred' | 'clinic'

const FILTERS: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'referred', label: 'Referred by Rehabify' },
  { value: 'clinic', label: 'Clinic patients' },
]

/** ?filter=referred (old links used "rehabify"), ?filter=clinic, otherwise all */
function parseFilter(value: string | null): SourceFilter {
  if (value === 'referred' || value === 'rehabify' || value === 'referrals') return 'referred'
  if (value === 'clinic') return 'clinic'
  return 'all'
}

/** Keeps the address bar in step (shareable, survives refresh) without a navigation. */
function replaceQuery(changes: Record<string, string | null>) {
  const url = new URL(window.location.href)
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) url.searchParams.delete(key)
    else url.searchParams.set(key, value)
  }
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

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
  referred: ' referred by Rehabify',
  clinic: ' from your clinic',
}

interface PatientRow {
  _id: string
  firstName: string
  lastName: string
  email: string
  phoneNumber?: string
  imageUrl?: string
  patientNumber?: string
  clinician: string
  isReferral: boolean
  /** Progress of the Rehabify referral this patient came from, when known */
  referralStatus: string | null
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

// useSearchParams needs a Suspense boundary for the static build
export default function ClinicPatientsPage() {
  return (
    <Suspense
      fallback={
        <PageShell title="Patients">
          <Skeleton className="h-64 rounded-xl" />
        </PageShell>
      }
    >
      <ClinicPatients />
    </Suspense>
  )
}

function ClinicPatients() {
  const { requireFullAccess, canUse } = useClinicAccess()
  const searchParams = useSearchParams()
  const urlFilter = parseFilter(searchParams.get('filter'))
  const urlPatient = searchParams.get('patient')
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilterState] = useState<SourceFilter>(urlFilter)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(urlPatient)
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false)

  // Links like ?filter=referred (old Referrals page) and ?patient=<id> (clinician home)
  useEffect(() => setFilterState(urlFilter), [urlFilter])
  useEffect(() => {
    if (urlPatient) setSelectedPatientId(urlPatient)
  }, [urlPatient])

  const setFilter = (next: SourceFilter) => {
    setFilterState(next)
    replaceQuery({ filter: next === 'all' ? null : next })
  }
  const closeRecord = () => {
    setSelectedPatientId(null)
    if (urlPatient) replaceQuery({ patient: null })
  }

  // Patients needs the Patients page; the referral inbox needs Referrals (a role can have either)
  const seesPatients = canUse('patients')
  const seesReferrals = canUse('referrals')

  const clinicPatients = useQuery(api.clinics.getClinicPatients, seesPatients ? {} : 'skip')
  const followUpQueue = useQuery(api.clinicTools.getClinicFollowUpQueue, seesPatients ? {} : 'skip')
  const referralsRaw = useQuery(api.clinicTools.getClinicRehabifyReferrals, seesReferrals ? {} : 'skip') as
    | ClinicReferral[]
    | undefined

  // Accepted referrals point at the patient record they became
  const referralByPatient = useMemo(() => {
    const map = new Map<string, ClinicReferral>()
    for (const ref of referralsRaw ?? []) {
      if (!ref.patientId) continue
      const current = map.get(String(ref.patientId))
      if (!current || ref.createdAt > current.createdAt) map.set(String(ref.patientId), ref)
    }
    return map
  }, [referralsRaw])

  const rows = useMemo<PatientRow[]>(() => {
    if (!clinicPatients) return []
    const now = Date.now()
    return clinicPatients.map((p: any) => {
      const lastSession: number | undefined = p.stats?.lastSessionDate
      const referral = referralByPatient.get(String(p._id))
      return {
        _id: String(p._id),
        firstName: p.firstName ?? '',
        lastName: p.lastName ?? '',
        email: p.email ?? '',
        phoneNumber: p.phoneNumber ?? undefined,
        imageUrl: p.imageUrl ?? undefined,
        patientNumber: p.patientNumber ?? undefined,
        clinician: p.primaryPhysiotherapist
          ? fullName(p.primaryPhysiotherapist.firstName, p.primaryPhysiotherapist.lastName)
          : '',
        isReferral: p.source === 'rehabify_referral' || Boolean(referral),
        referralStatus: referral?.status ?? null,
        // lastSessionDate can be a future booking, so only past visits count as "last visit"
        lastVisit: lastSession && lastSession <= now ? lastSession : null,
        // Patients without a care status are in care
        careStatus: p.careStatus === 'paused' || p.careStatus === 'discharged' ? p.careStatus : 'active',
      }
    })
  }, [clinicPatients, referralByPatient])

  const waitingReferrals = useMemo(() => (referralsRaw ?? []).filter(isWaitingReferral), [referralsRaw])
  // Earlier referrals with no matching row (e.g. the patient record is gone), so none drop out of sight
  const unmatchedReferrals = useMemo(() => {
    const earlier = (referralsRaw ?? []).filter((ref) => !isWaitingReferral(ref))
    if (!seesPatients) return earlier
    if (clinicPatients === undefined) return []
    const ids = new Set(rows.map((r) => r._id))
    return earlier.filter((ref) => !ref.patientId || !ids.has(String(ref.patientId)))
  }, [referralsRaw, rows, clinicPatients, seesPatients])

  const statusRows = useMemo(
    () => (statusFilter === 'all' ? rows : rows.filter((p) => p.careStatus === statusFilter)),
    [rows, statusFilter]
  )

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return statusRows.filter((p) => {
      if (filter === 'referred' && !p.isReferral) return false
      if (filter === 'clinic' && p.isReferral) return false
      if (!term) return true
      return (
        fullName(p.firstName, p.lastName).toLowerCase().includes(term) ||
        p.email.toLowerCase().includes(term) ||
        (p.phoneNumber ?? '').replace(/\s/g, '').includes(term.replace(/\s/g, '')) ||
        matchesRehabifyId(p.patientNumber, term)
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
  const description = !seesPatients
    ? 'Patients Rehabify has referred to your clinic.'
    : clinicPatients === undefined
      ? undefined
      : statusFilter === 'active'
        ? `${countLabel} at your clinic`
        : statusFilter === 'all'
          ? `${countLabel} · ${inCareCount} in care`
          : countLabel

  const referralInbox =
    referralsRaw === undefined ? (
      <Skeleton className="h-28 rounded-xl" />
    ) : (
      <ReferralInbox waiting={waitingReferrals} others={unmatchedReferrals} />
    )

  // A role with Referrals but not Patients: just the referral inbox
  if (!seesPatients) {
    return (
      <PageShell title="Patients" description={description}>
        {referralInbox}
      </PageShell>
    )
  }

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
            placeholder="Search by name, phone, email or patient ID"
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
                      ? 'border-rh-lime bg-rh-lime/10 font-medium text-rh-ink dark:border-rh-lime dark:bg-white/[0.06] dark:text-rh-lime'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-700'
                  )}
                >
                  {f.label}
                  {f.value === 'referred' && waitingReferrals.length > 0 && (
                    <span
                      className="ml-1.5 inline-block min-w-5 rounded-full bg-rh-lime px-1.5 text-center text-[11px] font-medium leading-5 text-rh-ink dark:bg-rh-lime dark:text-neutral-950"
                      aria-label={`${waitingReferrals.length} new`}
                    >
                      {waitingReferrals.length}
                    </span>
                  )}
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

      {/* Rehabify referrals: the inbox under "Referred by Rehabify", a pointer to it elsewhere */}
      {seesReferrals &&
        (filter === 'referred' ? (
          referralInbox
        ) : waitingReferrals.length > 0 ? (
          <button
            type="button"
            onClick={() => setFilter('referred')}
            className="flex w-full items-center gap-3 rounded-xl border border-amber-300 bg-white px-4 py-3 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-amber-700/60 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800/50"
          >
            <Inbox className="h-4 w-4 shrink-0 text-neutral-400" />
            <span className="min-w-0 flex-1">
              {waitingReferrals.length} new referral{waitingReferrals.length === 1 ? '' : 's'} from Rehabify waiting for
              your response
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
          </button>
        ) : null)}

      {filter === 'referred' && seesReferrals && (
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Referred patients</h2>
      )}

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
          rows.length === 0 && filter !== 'referred' ? (
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
                        <RehabifyId value={p.patientNumber} copyable={false} />
                        {p.careStatus === 'paused' && <StatusBadge>Paused</StatusBadge>}
                        {p.careStatus === 'discharged' && <StatusBadge>Discharged</StatusBadge>}
                        {p.isReferral && <StatusBadge tone="teal">Referred by Rehabify</StatusBadge>}
                        {p.referralStatus && <ReferralProgressBadge status={p.referralStatus} />}
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
        onClose={closeRecord}
      />
    </PageShell>
  )
}
