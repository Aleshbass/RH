'use client'

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { format, formatDistanceToNowStrict } from 'date-fns'
import {
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  DoorOpen,
  HandHeart,
  Inbox,
  Loader2,
  PlayCircle,
  Search,
  Tags,
  Users,
  XCircle,
} from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  AdminPage,
  ConfirmDialog,
  EmptyState,
  FilterChips,
  PageHeader,
  Panel,
  StatTile,
  StatusBadge,
  Stagger,
  StaggerItem,
  inputClass,
  listRowClass,
  primaryButtonClass,
  softButtonClass,
} from '@/components/admin/ui'
import { Callout } from '@/components/admin/partners/shared'
import { errorText } from '@/components/admin/finance/format'
import { ACCESS_STATUS_LABELS, FUNDING_OPTIONS, INCOME_BANDS, SITUATIONS } from '@/lib/rehabify-access'
import { formatKobo, getService } from '@/lib/rehabify-services'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type AppStatus = 'submitted' | 'under_review' | 'approved' | 'declined' | 'waitlisted' | 'withdrawn'
type Checklist = {
  identityVerified: boolean
  financialNeedConfirmed: boolean
  clinicalNeedConfirmed: boolean
  alternativesExplored: boolean
}

/** rehabifyAccess.adminListApplications, written out (the generated api can lose its types). */
type Application = {
  _id: Id<'assistedCareApplications'>
  patientId: Id<'users'>
  serviceNeeded: string
  isCurrentPatient: boolean
  currentPhysiotherapistId?: Id<'users'>
  situation: string
  incomeBand: string
  alternativeFunding: string
  clinicalNeed: string
  statement?: string
  city?: string
  area?: string
  phone?: string
  consentAt: number
  status: AppStatus
  reviewChecklist?: Checklist
  reviewNotes?: string
  decisionReason?: string
  reviewedAt?: number
  createdAt: number
  updatedAt: number
  patientName: string
  patientEmail: string | null
  patientNumber: string | null
  currentPhysiotherapistName: string | null
  award: {
    id: Id<'accessAwards'>
    status: 'active' | 'completed' | 'expired' | 'revoked'
    sessionsGranted: number
    sessionsUsed: number
    expiresAt: number
    reassessAt: number | null
    serviceIds: string[]
    serviceNames: string[]
    physiotherapistId: Id<'users'>
    physiotherapistName: string
  } | null
}

type ListResult = {
  applications: Application[]
  capacity: number
  activeAwards: number
  intakeOpen: boolean
  openCount: number
  statusCounts: Record<string, number>
}
type AccessTariff = { id: string; name: string; mode: 'virtual' | 'home'; priceKobo: number; assistedPriceKobo: number | null; assistedPayoutKobo: number | null }
type EligiblePhysio = {
  userId: Id<'users'>
  name: string
  specializations: string[]
  yearsOfExperience: number | null
  location: string | null
  activeAccessCases: number
}
type ZoneOption = { id: Id<'travelZones'>; city: string; name: string; areas: string[]; surchargeKobo: number }

type Tab = 'submitted' | 'under_review' | 'waitlisted' | 'approved' | 'declined' | 'all'

const TABS: { value: Tab; label: string }[] = [
  { value: 'submitted', label: 'New' },
  { value: 'under_review', label: 'In review' },
  { value: 'waitlisted', label: 'Waitlisted' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'all', label: 'All' },
]

const STATUS_TONE: Record<AppStatus, 'neutral' | 'teal' | 'green' | 'amber' | 'red'> = {
  submitted: 'amber',
  under_review: 'teal',
  approved: 'green',
  declined: 'red',
  waitlisted: 'neutral',
  withdrawn: 'neutral',
}

const AWARD_LABELS: Record<string, { label: string; tone: 'neutral' | 'teal' | 'green' | 'amber' | 'red' }> = {
  active: { label: 'Active', tone: 'green' },
  completed: { label: 'All sessions used', tone: 'teal' },
  expired: { label: 'Expired', tone: 'neutral' },
  revoked: { label: 'Ended', tone: 'red' },
}

const CHECKS: { key: keyof Checklist; label: string; hint: string }[] = [
  { key: 'identityVerified', label: 'Identity confirmed', hint: 'The applicant is who they say, and matches their Rehabify account.' },
  { key: 'financialNeedConfirmed', label: 'Financial need confirmed', hint: 'Their situation and income band were discussed and are credible.' },
  { key: 'clinicalNeedConfirmed', label: 'Clinical need confirmed', hint: 'Physiotherapy is appropriate for what they need help with.' },
  { key: 'alternativesExplored', label: 'Other funding explored', hint: 'HMO, employer, family or other support has been considered.' },
]

const NO_CHECKS: Checklist = { identityVerified: false, financialNeedConfirmed: false, clinicalNeedConfirmed: false, alternativesExplored: false }

const optionLabel = (options: readonly { value: string; label: string }[], value: string) =>
  options.find((o) => o.value === value)?.label ?? value.replace(/_/g, ' ')

const serviceLabel = (id: string) => (id === 'not_sure' ? 'Not sure yet' : getService(id)?.name ?? id.replace(/_/g, ' '))

const statusLabel = (status: string) => ACCESS_STATUS_LABELS[status] ?? status.replace(/_/g, ' ')

const normalise = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')

const intIn = (value: string, min: number, max: number) => {
  const n = Number(value)
  return value.trim() !== '' && Number.isInteger(n) && n >= min && n <= max
}

export default function AdminRehabifyAccessPage() {
  const data = useQuery(api.rehabifyAccess.adminListApplications, {}) as unknown as ListResult | undefined
  const [tab, setTab] = useState<Tab>('submitted')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<Id<'assistedCareApplications'> | null>(null)

  // Per-status totals come from the server, so they stay right beyond the rows listed
  const counts = useMemo(() => data?.statusCounts ?? {}, [data])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (data?.applications ?? [])
      .filter((app) => tab === 'all' || app.status === tab)
      .filter(
        (app) =>
          !term ||
          [app.patientName, app.patientEmail, app.patientNumber, app.phone, app.city, app.area]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(term))
      )
  }, [data, tab, search])

  const selected = data?.applications.find((app) => app._id === selectedId) ?? null
  const placesLeft = data ? Math.max(0, data.capacity - data.activeAwards) : 0
  const usedPercent = data && data.capacity > 0 ? Math.min(100, Math.round((data.activeAwards / data.capacity) * 100)) : 100

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Marketplace"
        title="Rehabify Access"
        description="Applications for assisted care. Review each one against the same checks, then approve within capacity, add to the waiting list or decline."
        actions={
          <Button asChild variant="outline" size="sm" className={softButtonClass}>
            <Link href="/dashboard/admin/service-tariffs">
              <Tags className="mr-1.5 h-4 w-4" />
              Access rates and capacity
            </Link>
          </Button>
        }
      />

      <Callout tone="info" title="The same criteria for everyone">
        Every application is checked against the same four points before it can be approved. Approved patients pay the
        published Access rate for each service, set in Pricing & payouts. There are no one-off prices or discounts.
      </Callout>

      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatTile
            label="New"
            icon={Inbox}
            value={data ? counts.submitted ?? 0 : '–'}
            hint="waiting for a first look"
            tone={data && (counts.submitted ?? 0) > 0 ? 'attention' : 'teal'}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="In review" icon={ClipboardCheck} value={data ? counts.under_review ?? 0 : '–'} hint={data ? `${counts.waitlisted ?? 0} on the waiting list` : undefined} />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Places in use"
            icon={Users}
            tone={data && placesLeft === 0 ? 'attention' : 'mint'}
            value={data ? `${data.activeAwards} / ${data.capacity}` : '–'}
            hint={
              data ? (
                <span className="block space-y-1">
                  <span className="block h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.08]">
                    <span
                      className={cn('block h-full rounded-full', placesLeft === 0 ? 'bg-amber-500' : 'bg-rh-teal dark:bg-rh-aqua')}
                      style={{ width: `${usedPercent}%` }}
                    />
                  </span>
                  <span className="block">{placesLeft === 0 ? 'Full: waitlist or raise capacity' : `${placesLeft} place${placesLeft === 1 ? '' : 's'} left`}</span>
                </span>
              ) : undefined
            }
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Intake"
            icon={DoorOpen}
            tone={data && !data.intakeOpen ? 'neutral' : 'teal'}
            value={data ? (data.intakeOpen ? 'Open' : 'Closed') : '–'}
            hint={data ? (data.intakeOpen ? 'patients can apply' : 'the form asks patients to check back') : undefined}
          />
        </StaggerItem>
      </Stagger>

      <Panel>
        <div className="flex flex-col gap-3 border-b border-black/[0.05] p-4 dark:border-white/[0.06] sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips
            value={tab}
            onChange={setTab}
            options={TABS.map((t) => ({ ...t, count: data ? (t.value === 'all' ? Object.values(counts).reduce((sum, n) => sum + n, 0) : counts[t.value] ?? 0) : undefined }))}
          />
          <div className="relative w-full lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, Rehabify ID, area"
              aria-label="Search applications"
              className={cn(inputClass, 'pl-9')}
            />
          </div>
        </div>

        {data === undefined ? (
          <div className="space-y-3 p-4 sm:px-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<HandHeart />}
            title={search.trim() ? 'No applications match' : tab === 'submitted' ? 'No new applications' : 'No applications here'}
            description={search.trim() ? 'Try a different search.' : 'Patients apply for Rehabify Access from the Access page.'}
          />
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {visible.map((app) => (
              <li key={app._id}>
                <button type="button" onClick={() => setSelectedId(app._id)} className={cn(listRowClass, 'w-full items-start text-left')}>
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rh-mist text-xs font-semibold text-rh-teal dark:bg-rh-aqua/10 dark:text-rh-aqua">
                    {app.patientName[0]?.toUpperCase() ?? '?'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-rh-night dark:text-white">{app.patientName}</span>
                      {app.patientNumber && <span className="font-mono text-[11px] text-neutral-400">{app.patientNumber}</span>}
                      <StatusBadge tone={STATUS_TONE[app.status]}>{statusLabel(app.status)}</StatusBadge>
                      {app.award && <StatusBadge tone={AWARD_LABELS[app.award.status]?.tone}>{AWARD_LABELS[app.award.status]?.label}</StatusBadge>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-neutral-600 dark:text-neutral-300">
                      {serviceLabel(app.serviceNeeded)} · {optionLabel(SITUATIONS, app.situation)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {app.award
                        ? `${app.award.sessionsUsed} of ${app.award.sessionsGranted} sessions used · until ${format(app.award.expiresAt, 'd MMM yyyy')}`
                        : [app.area, app.city].filter(Boolean).join(', ') || optionLabel(INCOME_BANDS, app.incomeBand)}
                    </span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400" title={format(app.createdAt, 'd MMM yyyy, HH:mm')}>
                    {formatDistanceToNowStrict(app.createdAt, { addSuffix: true })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {data && data.applications.length >= 200 && (
          <p className="border-t border-black/[0.05] px-5 py-3 text-xs text-neutral-500 dark:border-white/[0.06] dark:text-neutral-400">
            Showing the 200 most recent applications.
          </p>
        )}
      </Panel>

      <ApplicationSheet
        application={selected}
        placesLeft={placesLeft}
        onClose={() => setSelectedId(null)}
      />
    </AdminPage>
  )
}

function ApplicationSheet({
  application,
  placesLeft,
  onClose,
}: {
  application: Application | null
  placesLeft: number
  onClose: () => void
}) {
  const startReview = useMutation(api.rehabifyAccess.adminStartReview)
  const [starting, setStarting] = useState(false)

  const begin = async () => {
    if (!application) return
    setStarting(true)
    try {
      await startReview({ applicationId: application._id })
      playSound('success')
      toast.success('Review started.')
    } catch (err) {
      playSound('error')
      toast.error(errorText(err, 'Could not start the review.'))
    } finally {
      setStarting(false)
    }
  }

  return (
    <Sheet open={Boolean(application)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto border-black/[0.06] bg-rh-canvas p-0 dark:border-white/[0.08] dark:bg-rh-ink sm:max-w-xl">
        {application && (
          <div className="flex min-h-full flex-col">
            <SheetHeader className="space-y-2 border-b border-black/[0.05] bg-white px-5 py-4 text-left dark:border-white/[0.06] dark:bg-rh-ink-2">
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <StatusBadge tone={STATUS_TONE[application.status]}>{statusLabel(application.status)}</StatusBadge>
                {application.patientNumber && <span className="font-mono text-[11px] text-neutral-400">{application.patientNumber}</span>}
              </div>
              <SheetTitle className="text-lg text-rh-night dark:text-white">{application.patientName}</SheetTitle>
              <SheetDescription className="text-xs">
                Applied {format(application.createdAt, 'd MMM yyyy, HH:mm')}
                {application.reviewedAt ? ` · last decision ${formatDistanceToNowStrict(application.reviewedAt, { addSuffix: true })}` : ''}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-4 px-5 py-4">
              <ApplicationDetails application={application} />

              {(application.status === 'submitted' || application.status === 'waitlisted') && (
                <Card>
                  {application.status === 'waitlisted' && application.decisionReason && (
                    <p className="mb-2 text-xs text-neutral-600 dark:text-neutral-300">
                      <span className="font-medium">Waiting list note:</span> {application.decisionReason}
                    </p>
                  )}
                  <p className="text-sm text-rh-night dark:text-neutral-100">
                    {application.status === 'submitted'
                      ? 'Start the review to work through the checks. It shows as In review, so nobody else picks it up.'
                      : 'Resume the review when a place is free or their situation has changed.'}
                  </p>
                  <Button className={cn(primaryButtonClass, 'mt-3')} onClick={begin} disabled={starting}>
                    {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                    {application.status === 'submitted' ? 'Start review' : 'Resume review'}
                  </Button>
                </Card>
              )}

              {application.status === 'under_review' && (
                <ReviewForm key={application._id} application={application} placesLeft={placesLeft} />
              )}

              {application.status === 'approved' && <AwardPanel key={application._id} application={application} />}

              {application.status === 'declined' && (
                <Card title="Decision">
                  <p className="text-sm text-rh-night dark:text-neutral-100">Not approved. The patient sees this reason:</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">{application.decisionReason ?? 'No reason recorded.'}</p>
                  <ReviewRecord application={application} />
                </Card>
              )}

              {application.status === 'withdrawn' && (
                <Card>
                  <p className="text-sm text-neutral-600 dark:text-neutral-300">The patient withdrew this application.</p>
                </Card>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Card({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl bg-white p-4 shadow-soft dark:bg-rh-ink-2 dark:shadow-none', className)}>
      {title && <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{title}</p>}
      {children}
    </section>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="text-sm text-rh-night dark:text-neutral-100">{children}</p>
    </div>
  )
}

function ApplicationDetails({ application }: { application: Application }) {
  return (
    <>
      <Card title="Patient">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Fact label="Email">{application.patientEmail ?? 'Not given'}</Fact>
          <Fact label="Phone">{application.phone ?? 'Not given'}</Fact>
          <Fact label="Area">{[application.area, application.city].filter(Boolean).join(', ') || 'Not given'}</Fact>
          <Fact label="Already a Rehabify patient">
            {application.isCurrentPatient ? `Yes${application.currentPhysiotherapistName ? `, with ${application.currentPhysiotherapistName}` : ''}` : 'No'}
          </Fact>
        </div>
        <Link
          href={`/dashboard/admin/users/${application.patientId}`}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-rh-teal hover:underline dark:text-rh-aqua"
        >
          Open profile <ArrowUpRight className="h-3 w-3" />
        </Link>
      </Card>

      <Card title="Their answers">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Fact label="Care needed">{serviceLabel(application.serviceNeeded)}</Fact>
          <Fact label="Situation">{optionLabel(SITUATIONS, application.situation)}</Fact>
          <Fact label="Monthly income">{optionLabel(INCOME_BANDS, application.incomeBand)}</Fact>
          <Fact label="Other funding">{optionLabel(FUNDING_OPTIONS, application.alternativeFunding)}</Fact>
        </div>
        <div className="mt-3 space-y-3">
          <Fact label="What they need help with">
            <span className="whitespace-pre-wrap">{application.clinicalNeed}</span>
          </Fact>
          {application.statement && (
            <Fact label="Anything else they told us">
              <span className="whitespace-pre-wrap">{application.statement}</span>
            </Fact>
          )}
        </div>
        <p className="mt-3 text-[11px] text-neutral-500 dark:text-neutral-400">
          Consent given {format(application.consentAt, 'd MMM yyyy, HH:mm')}. Income is asked in bands only.
        </p>
      </Card>
    </>
  )
}

function ReviewRecord({ application }: { application: Application }) {
  const checklist = application.reviewChecklist
  if (!checklist && !application.reviewNotes) return null
  return (
    <div className="mt-3 space-y-2 border-t border-black/[0.05] pt-3 dark:border-white/[0.06]">
      {checklist && (
        <ul className="space-y-1 text-xs">
          {CHECKS.map((check) => (
            <li key={check.key} className={cn('flex items-center gap-1.5', checklist[check.key] ? 'text-emerald-700 dark:text-emerald-300' : 'text-neutral-500 dark:text-neutral-400')}>
              <CheckCircle2 className={cn('h-3.5 w-3.5', !checklist[check.key] && 'opacity-30')} />
              {check.label}
            </li>
          ))}
        </ul>
      )}
      {application.reviewNotes && (
        <p className="whitespace-pre-wrap text-xs text-neutral-600 dark:text-neutral-300">
          <span className="font-medium">Review notes:</span> {application.reviewNotes}
        </p>
      )}
    </div>
  )
}

function ReviewForm({ application, placesLeft }: { application: Application; placesLeft: number }) {
  const tariffs = useQuery(api.rehabifyAccess.adminAccessTariffs) as unknown as AccessTariff[] | undefined
  const zones = useQuery(api.travelZones.listZones) as unknown as ZoneOption[] | undefined
  const approve = useMutation(api.rehabifyAccess.adminApprove)
  const decide = useMutation(api.rehabifyAccess.adminDecide)
  const id = useId()

  const [checklist, setChecklist] = useState<Checklist>(application.reviewChecklist ?? NO_CHECKS)
  const [serviceIds, setServiceIds] = useState<string[]>([])
  const [zoneId, setZoneId] = useState<string>('')
  const [physioId, setPhysioId] = useState<Id<'users'> | null>(null)
  const [sessions, setSessions] = useState('6')
  const [validDays, setValidDays] = useState('90')
  const [reassessDays, setReassessDays] = useState('')
  const [notes, setNotes] = useState(application.reviewNotes ?? '')
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState<'approve' | 'declined' | 'waitlisted' | null>(null)

  const offered = useMemo(() => (tariffs ?? []).filter((t) => t.assistedPriceKobo !== null && t.assistedPayoutKobo !== null), [tariffs])
  const notOffered = (tariffs ?? []).filter((t) => t.assistedPriceKobo === null || t.assistedPayoutKobo === null)

  // Start with the service they asked for, when it's offered under Access
  useEffect(() => {
    if (tariffs && serviceIds.length === 0 && offered.some((t) => t.id === application.serviceNeeded)) {
      setServiceIds([application.serviceNeeded])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tariffs])

  // Pre-pick the zone that lists their area
  useEffect(() => {
    if (!zones || zoneId || !application.area) return
    const area = normalise(application.area)
    const city = application.city ? normalise(application.city) : null
    const match = zones.find((z) => (!city || normalise(z.city) === city) && z.areas.some((a) => normalise(a) === area))
    if (match) setZoneId(match.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones])

  const needsZone = serviceIds.some((sid) => offered.find((t) => t.id === sid)?.mode === 'home')
  const canQueryPhysios = serviceIds.length > 0 && (!needsZone || Boolean(zoneId))
  const eligible = useQuery(
    api.rehabifyAccess.adminEligiblePhysios,
    canQueryPhysios ? { serviceIds, zoneId: needsZone ? (zoneId as Id<'travelZones'>) : undefined } : 'skip'
  ) as unknown as EligiblePhysio[] | undefined

  // Keep the pick valid as the services change; prefer their current physio
  useEffect(() => {
    if (!eligible) return
    if (physioId && !eligible.some((p) => p.userId === physioId)) setPhysioId(null)
    if (!physioId && application.currentPhysiotherapistId && eligible.some((p) => p.userId === application.currentPhysiotherapistId)) {
      setPhysioId(application.currentPhysiotherapistId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible])

  const allChecked = Object.values(checklist).every(Boolean)
  const currentIneligible =
    Boolean(application.currentPhysiotherapistId) && eligible !== undefined && !eligible.some((p) => p.userId === application.currentPhysiotherapistId)

  const approveProblems = [
    !allChecked && 'Complete all four checks.',
    serviceIds.length === 0 && 'Choose at least one service.',
    needsZone && !zoneId && 'Choose the patient’s travel zone for home visits.',
    !physioId && 'Choose a physiotherapist.',
    !intIn(sessions, 1, 24) && 'Sessions must be between 1 and 24.',
    !intIn(validDays, 7, 180) && 'The arrangement must last between 7 and 180 days.',
    reassessDays.trim() !== '' && !intIn(reassessDays, 1, 180) && 'Reassess after 1 to 180 days, or leave it blank.',
    placesLeft <= 0 && 'All places are in use. Add them to the waiting list, or raise capacity.',
  ].filter(Boolean) as string[]

  const toggleService = (sid: string) => setServiceIds((prev) => (prev.includes(sid) ? prev.filter((s) => s !== sid) : [...prev, sid]))

  const chosenPhysio = eligible?.find((p) => p.userId === physioId)
  const chosenServices = offered.filter((t) => serviceIds.includes(t.id))

  /** Throws on failure so the confirm dialog stays open. */
  const submitApprove = async () => {
    if (!physioId) return
    try {
      await approve({
        applicationId: application._id,
        physiotherapistId: physioId,
        serviceIds,
        sessionsGranted: Number(sessions),
        validForDays: Number(validDays),
        reassessAfterDays: reassessDays.trim() ? Number(reassessDays) : undefined,
        zoneId: needsZone && zoneId ? (zoneId as Id<'travelZones'>) : undefined,
        checklist,
        reviewNotes: notes.trim() || undefined,
      })
      playSound('approve')
      toast.success(`${application.patientName} approved for Rehabify Access. They've been notified.`)
    } catch (err) {
      toast.error(errorText(err, 'Could not approve the application.'))
      throw err
    }
  }

  const submitDecision = async (decision: 'declined' | 'waitlisted') => {
    try {
      await decide({
        applicationId: application._id,
        decision,
        reason: reason.trim() || undefined,
        checklist,
        reviewNotes: notes.trim() || undefined,
      })
      playSound(decision === 'declined' ? 'reject' : 'success')
      toast.success(decision === 'declined' ? 'Application declined.' : 'Added to the waiting list.')
    } catch (err) {
      toast.error(errorText(err, 'Could not save the decision.'))
      throw err
    }
  }

  const zonesByCity = useMemo(() => {
    const groups = new Map<string, ZoneOption[]>()
    for (const zone of zones ?? []) groups.set(zone.city, [...(groups.get(zone.city) ?? []), zone])
    return [...groups.entries()]
  }, [zones])

  return (
    <>
      <Card title="Review checks">
        <ul className="space-y-3">
          {CHECKS.map((check) => (
            <li key={check.key}>
              <label htmlFor={`${id}-${check.key}`} className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  id={`${id}-${check.key}`}
                  checked={checklist[check.key]}
                  onCheckedChange={(value) => setChecklist((prev) => ({ ...prev, [check.key]: value === true }))}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium text-rh-night dark:text-white">{check.label}</span>
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400">{check.hint}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-1.5">
          <Label htmlFor={`${id}-notes`} className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Review notes <span className="font-normal text-neutral-400">(only admins see these)</span>
          </Label>
          <Textarea
            id={`${id}-notes`}
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Who you spoke to, what you verified."
            className={inputClass}
          />
        </div>
      </Card>

      <Card title="Approve">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Services covered</p>
            {tariffs === undefined ? (
              <Skeleton className="h-20 rounded-xl" />
            ) : offered.length === 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                No service has an Access rate yet. Set one in{' '}
                <Link href="/dashboard/admin/service-tariffs" className="font-medium underline">
                  Pricing & payouts
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-2">
                {offered.map((t) => {
                  const checked = serviceIds.includes(t.id)
                  return (
                    <li key={t.id}>
                      <label
                        htmlFor={`${id}-svc-${t.id}`}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                          checked ? 'border-rh-teal bg-rh-mist/60 dark:border-rh-aqua dark:bg-rh-aqua/10' : 'border-black/[0.06] dark:border-white/10'
                        )}
                      >
                        <Checkbox id={`${id}-svc-${t.id}`} checked={checked} onCheckedChange={() => toggleService(t.id)} className="mt-0.5" />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-rh-night dark:text-white">
                            {t.name}
                            {t.id === application.serviceNeeded && <StatusBadge tone="teal">Requested</StatusBadge>}
                          </span>
                          <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                            Patient pays {formatKobo(t.assistedPriceKobo ?? 0)} (standard {formatKobo(t.priceKobo)}) · physio paid{' '}
                            {formatKobo(t.assistedPayoutKobo ?? 0)}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
            {notOffered.length > 0 && (
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Not offered under Access: {notOffered.map((t) => t.name).join(', ')}.</p>
            )}
          </div>

          {needsZone && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Patient&apos;s travel zone</Label>
              <Select value={zoneId} onValueChange={setZoneId}>
                <SelectTrigger className={cn(inputClass, 'w-full')}>
                  <SelectValue placeholder={zones === undefined ? 'Loading zones…' : zones.length === 0 ? 'No active zones' : 'Choose a zone'} />
                </SelectTrigger>
                <SelectContent className="dark:border-white/10 dark:bg-rh-ink-2">
                  {zonesByCity.map(([city, cityZones]) => (
                    <SelectGroup key={city}>
                      <SelectLabel>{city}</SelectLabel>
                      {cityZones.map((zone) => (
                        <SelectItem key={zone.id} value={zone.id}>
                          {zone.name} ({zone.areas.slice(0, 3).join(', ')}
                          {zone.areas.length > 3 ? '…' : ''})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {application.area ? `They gave their area as ${[application.area, application.city].filter(Boolean).join(', ')}.` : 'They didn’t give an area.'}{' '}
                The zone&apos;s travel charge is added to home treatment where it applies.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Physiotherapist</p>
            {!canQueryPhysios ? (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {serviceIds.length === 0 ? 'Choose the services first.' : 'Choose the travel zone first.'}
              </p>
            ) : eligible === undefined ? (
              <Skeleton className="h-16 rounded-xl" />
            ) : eligible.length === 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                No physiotherapist can take these services at the Access rate{needsZone ? ' in this zone' : ''}. Only physios who
                have opted in to Access, whose minimum payout the Access rate meets, and who cover the area appear here.
              </p>
            ) : (
              <ul className="max-h-72 divide-y divide-black/[0.05] overflow-y-auto rounded-xl border border-black/[0.06] dark:divide-white/[0.06] dark:border-white/10">
                {eligible.map((p) => {
                  const selected = p.userId === physioId
                  const isCurrent = p.userId === application.currentPhysiotherapistId
                  return (
                    <li key={p.userId}>
                      <button
                        type="button"
                        onClick={() => setPhysioId(p.userId)}
                        aria-pressed={selected}
                        className={cn(
                          'w-full border-l-[3px] px-3 py-2.5 text-left transition-colors',
                          selected ? 'border-l-rh-teal bg-rh-mist dark:border-l-rh-aqua dark:bg-rh-aqua/10' : 'border-l-transparent hover:bg-rh-canvas dark:hover:bg-white/[0.03]'
                        )}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-rh-night dark:text-white">
                              {p.name}
                              {isCurrent && <StatusBadge tone="green">Current physio</StatusBadge>}
                            </span>
                            <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                              {[
                                p.location,
                                p.yearsOfExperience !== null ? `${p.yearsOfExperience} yrs` : null,
                                p.specializations.slice(0, 2).join(', ') || null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </span>
                          <span className="shrink-0 text-[11px] text-neutral-500 dark:text-neutral-400">
                            {p.activeAccessCases} Access case{p.activeAccessCases === 1 ? '' : 's'}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {currentIneligible && application.currentPhysiotherapistName && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                {application.currentPhysiotherapistName}, their current physio, can&apos;t take these services at the Access
                rate (not opted in, minimum not met, or area not covered).
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <NumberField id={`${id}-sessions`} label="Sessions" value={sessions} onChange={setSessions} hint="1 to 24" />
            <NumberField id={`${id}-days`} label="Valid for (days)" value={validDays} onChange={setValidDays} hint="7 to 180" />
            <NumberField id={`${id}-reassess`} label="Reassess after (days)" value={reassessDays} onChange={setReassessDays} hint="Optional" />
          </div>

          {approveProblems.length > 0 && (
            <ul className="space-y-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              {approveProblems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}

          <Button className={cn(primaryButtonClass, 'w-full sm:w-auto')} disabled={approveProblems.length > 0} onClick={() => setConfirm('approve')}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Approve
          </Button>
        </div>
      </Card>

      <Card title="Not approving">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-reason`} className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Reason <span className="font-normal text-neutral-400">(the patient sees this; required to decline)</span>
          </Label>
          <Textarea
            id={`${id}-reason`}
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. All places are in use at the moment; we'll contact you when one is free."
            className={inputClass}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button className={softButtonClass} onClick={() => setConfirm('waitlisted')}>
            <Clock className="mr-2 h-4 w-4" />
            Add to waiting list
          </Button>
          <Button
            variant="outline"
            className="rounded-xl dark:border-white/10 dark:bg-transparent dark:text-white"
            disabled={!reason.trim()}
            onClick={() => setConfirm('declined')}
          >
            <XCircle className="mr-2 h-4 w-4" />
            Decline
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm === 'approve' ? 'Approve Rehabify Access?' : confirm === 'declined' ? 'Decline this application?' : 'Add to the waiting list?'}
        description={
          confirm === 'approve'
            ? `${application.patientName} can book ${sessions} session${sessions === '1' ? '' : 's'} of ${chosenServices.map((s) => s.name).join(', ')} at the Access rate with ${chosenPhysio?.name ?? 'the chosen physio'}, for ${validDays} days. They're notified straight away.`
            : confirm === 'declined'
              ? 'The patient is told the application wasn’t approved, with your reason.'
              : 'The application stays open and the patient sees they’re on the waiting list. Resume the review when a place is free.'
        }
        confirmLabel={confirm === 'approve' ? 'Approve' : confirm === 'declined' ? 'Decline' : 'Add to waiting list'}
        destructive={confirm === 'declined'}
        onConfirm={() => (confirm === 'approve' ? submitApprove() : confirm ? submitDecision(confirm) : undefined)}
      />
    </>
  )
}

function NumberField({ id, label, value, onChange, hint }: { id: string; label: string; value: string; onChange: (value: string) => void; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
        {label}
      </Label>
      <Input id={id} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputClass, 'tabular-nums')} />
      {hint && <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{hint}</p>}
    </div>
  )
}

function AwardPanel({ application }: { application: Application }) {
  const updateAward = useMutation(api.rehabifyAccess.adminUpdateAward)
  const id = useId()
  const [extraSessions, setExtraSessions] = useState('0')
  const [extraDays, setExtraDays] = useState('30')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const award = application.award

  if (!award) {
    return (
      <Card title="Arrangement">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">Approved, but the arrangement record wasn&apos;t found.</p>
        <ReviewRecord application={application} />
      </Card>
    )
  }

  const meta = AWARD_LABELS[award.status] ?? { label: award.status, tone: 'neutral' as const }
  const extendValid = intIn(extraSessions, 0, 24) && intIn(extraDays, 0, 180) && (Number(extraSessions) > 0 || Number(extraDays) > 0)

  const extend = async () => {
    setBusy(true)
    try {
      await updateAward({
        awardId: award.id,
        action: 'extend',
        extraSessions: Number(extraSessions),
        extraDays: Number(extraDays),
        note: note.trim() || undefined,
      })
      playSound('success')
      toast.success('Arrangement updated.')
      setNote('')
    } catch (err) {
      playSound('error')
      toast.error(errorText(err, 'Could not update the arrangement.'))
    } finally {
      setBusy(false)
    }
  }

  const end = async () => {
    try {
      await updateAward({ awardId: award.id, action: 'end', note: note.trim() || undefined })
      playSound('reject')
      toast.success('Arrangement ended. Any sessions left can no longer be booked at the Access rate.')
    } catch (err) {
      toast.error(errorText(err, 'Could not end the arrangement.'))
      throw err
    }
  }

  return (
    <Card title="Arrangement">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
        <span className="text-sm font-semibold tabular-nums text-rh-night dark:text-white">
          {award.sessionsUsed} of {award.sessionsGranted} sessions used
        </span>
      </div>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        {award.expiresAt > Date.now() ? 'Valid until' : 'Ended on'} {format(award.expiresAt, 'd MMM yyyy')}
        {award.reassessAt ? ` · reassess ${format(award.reassessAt, 'd MMM yyyy')}` : ''}
      </p>
      <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-neutral-500 dark:text-neutral-400">Physiotherapist</dt>
          <dd className="font-medium text-rh-night dark:text-white">{award.physiotherapistName}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500 dark:text-neutral-400">Services</dt>
          <dd className="font-medium text-rh-night dark:text-white">{award.serviceNames.join(', ')}</dd>
        </div>
      </dl>
      <ReviewRecord application={application} />

      <div className="mt-4 space-y-3 border-t border-black/[0.05] pt-4 dark:border-white/[0.06]">
        <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Reassessment</p>
        <div className="grid grid-cols-2 gap-3">
          <NumberField id={`${id}-extra-sessions`} label="Add sessions" value={extraSessions} onChange={setExtraSessions} hint="0 to 24" />
          <NumberField id={`${id}-extra-days`} label="Add days" value={extraDays} onChange={setExtraDays} hint="0 to 180" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-award-note`} className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Note <span className="font-normal text-neutral-400">(optional)</span>
          </Label>
          <Input
            id={`${id}-award-note`}
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Reassessed with the physio, progressing well"
            className={inputClass}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className={primaryButtonClass} disabled={busy || !extendValid} onClick={extend}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Extend
          </Button>
          {award.status === 'active' && (
            <Button variant="outline" className="rounded-xl dark:border-white/10 dark:bg-transparent dark:text-white" disabled={busy} onClick={() => setConfirmEnd(true)}>
              End arrangement
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title="End this arrangement?"
        description={`${application.patientName} won't be able to book any remaining sessions at the Access rate. Bookings already made aren’t changed.`}
        confirmLabel="End arrangement"
        destructive
        onConfirm={end}
      />
    </Card>
  )
}
