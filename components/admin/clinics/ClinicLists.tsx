'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { format, formatDistanceToNow } from 'date-fns'
import { ArrowUpRight, ChevronRight, Inbox, MailQuestion, Search, Users } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, FilterChips, Panel, StatusBadge, inputClass } from '@/components/admin/ui'
import { humanize, initialsOf, tintFor, userHref } from '@/components/admin/clinics/shared'
import type { ClinicPatientsResult, ClinicReferralsResult, ClinicStaffResult } from '@/components/admin/clinics/types'
import { RehabifyId } from '@/components/shared/RehabifyId'
import { matchesRehabifyId } from '@/convex/helpers/rehabifyIdFormat'
import { cn } from '@/lib/utils'

type Tone = 'neutral' | 'teal' | 'green' | 'amber' | 'red'

function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 rounded-2xl" />
      ))}
    </div>
  )
}

/** A person row that opens their admin user page. */
function PersonRow({
  userId,
  name,
  imageUrl,
  subtitle,
  meta,
  badges,
}: {
  userId: string
  name: string | null
  imageUrl: string | null
  subtitle: ReactNode
  meta?: ReactNode
  badges?: ReactNode
}) {
  return (
    <li>
      <Link
        href={userHref(userId)}
        className="group flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-rh-canvas dark:hover:bg-white/[0.03]"
      >
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarImage src={imageUrl ?? undefined} alt="" />
          <AvatarFallback className={cn('text-sm font-semibold', tintFor(userId))}>{initialsOf(name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-rh-night dark:text-white">{name ?? 'Unnamed'}</p>
            {badges}
          </div>
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</p>
        </div>
        {meta && <div className="hidden shrink-0 text-right text-xs text-neutral-500 dark:text-neutral-400 sm:block">{meta}</div>}
        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5 dark:text-neutral-600" />
      </Link>
    </li>
  )
}

const KIND_LABEL = { owner: 'Owner', clinician: 'Clinician', front_desk: 'Front desk' } as const
const MEMBER_STATUS: Record<string, { label: string; tone: Tone }> = {
  suspended: { label: 'Suspended by clinic', tone: 'amber' },
  terminated: { label: 'Removed', tone: 'neutral' },
}

export function ClinicStaffTab({ clinicId }: { clinicId: Id<'clinics'> }) {
  const data = useQuery(api.adminClinics.listClinicStaff, { clinicId }) as ClinicStaffResult | undefined

  return (
    <div className="space-y-4">
      <Panel title="Team" description="The owner, clinicians and front-desk staff who use this clinic's dashboard">
        {data === undefined ? (
          <ListSkeleton />
        ) : !data || data.members.length === 0 ? (
          <EmptyState icon={<Users />} title="No team yet" />
        ) : (
          <ul className="p-2">
            {data.members.map((m) => {
              const status = MEMBER_STATUS[m.status]
              return (
                <PersonRow
                  key={m.userId}
                  userId={m.userId}
                  name={m.name}
                  imageUrl={m.imageUrl}
                  subtitle={[m.email, m.phoneNumber].filter(Boolean).join(' · ') || 'No contact details'}
                  badges={
                    <>
                      <StatusBadge tone={m.kind === 'owner' ? 'teal' : 'neutral'}>{KIND_LABEL[m.kind]}</StatusBadge>
                      {status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
                      {m.kind === 'clinician' && m.approvalStatus && m.approvalStatus !== 'approved' && (
                        <StatusBadge tone="amber">{m.approvalStatus === 'declined' ? 'Physio declined' : 'Physio not approved'}</StatusBadge>
                      )}
                    </>
                  }
                  meta={
                    <>
                      <p>{m.roleName}</p>
                      <p>Since {format(m.joinedAt, 'MMM yyyy')}</p>
                    </>
                  }
                />
              )
            })}
          </ul>
        )}
      </Panel>

      {data && data.invitations.length > 0 && (
        <Panel title="Invitations waiting" description="Sent by the clinic, not answered yet">
          <ul className="p-2">
            {data.invitations.map((inv) => (
              <li key={inv._id} className="flex items-center gap-3 rounded-2xl px-3 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rh-canvas text-neutral-400 dark:bg-white/[0.05]">
                  <MailQuestion className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-rh-night dark:text-white">{inv.inviteeName || inv.inviteeEmail}</p>
                  <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {inv.inviteeName ? `${inv.inviteeEmail} · ` : ''}
                    {inv.roleName ?? humanize(inv.role)} · sent {formatDistanceToNow(inv.createdAt, { addSuffix: true })}
                  </p>
                </div>
                {inv.expired ? <StatusBadge tone="neutral">Expired</StatusBadge> : <StatusBadge tone="amber">Pending</StatusBadge>}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}

type CareFilter = 'all' | 'active' | 'paused' | 'discharged'
const CARE_STATUS: Record<Exclude<CareFilter, 'all'>, { label: string; tone: Tone }> = {
  active: { label: 'In care', tone: 'green' },
  paused: { label: 'Paused', tone: 'amber' },
  discharged: { label: 'Discharged', tone: 'neutral' },
}
const SOURCE_LABEL: Record<string, string> = {
  clinic_direct: 'Added by clinic',
  rehabify_referral: 'Rehabify referral',
  referred: 'Referred',
  existing_patient: 'Existing patient',
  marketplace: 'Marketplace',
  booking_link: 'Booking link',
  invite: 'Invited',
  joy_whatsapp: 'Joy · WhatsApp',
}

export function ClinicPatientsTab({ clinicId }: { clinicId: Id<'clinics'> }) {
  const data = useQuery(api.adminClinics.listClinicPatients, { clinicId }) as ClinicPatientsResult | undefined
  const [term, setTerm] = useState('')
  const [care, setCare] = useState<CareFilter>('all')

  const patients = useMemo(() => data?.patients ?? [], [data])
  const counts = useMemo(() => {
    const c = { all: patients.length, active: 0, paused: 0, discharged: 0 }
    for (const p of patients) c[p.careStatus] += 1
    return c
  }, [patients])
  const q = term.trim().toLowerCase()
  const filtered = patients.filter(
    (p) =>
      (care === 'all' || p.careStatus === care) &&
      (!q ||
        [p.name, p.email, p.phoneNumber, p.clinicianName].filter(Boolean).join(' ').toLowerCase().includes(q) ||
        matchesRehabifyId(p.patientNumber, q))
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterChips<CareFilter>
          value={care}
          onChange={setCare}
          options={[
            { value: 'all', label: 'All', count: data ? counts.all : undefined },
            { value: 'active', label: 'In care', count: data ? counts.active : undefined },
            { value: 'paused', label: 'Paused', count: data ? counts.paused : undefined },
            { value: 'discharged', label: 'Discharged', count: data ? counts.discharged : undefined },
          ]}
        />
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search patients or IDs"
            aria-label="Search this clinic's patients"
            className={cn(inputClass, 'h-10 pl-9')}
          />
        </div>
      </div>

      <Panel>
        {data === undefined ? (
          <ListSkeleton rows={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={patients.length === 0 ? 'No patients yet' : 'No patients match'}
            description={patients.length === 0 ? 'Patients appear here once the clinic adds them or accepts a referral.' : 'Try another search or filter.'}
          />
        ) : (
          <>
            <ul className="p-2">
              {filtered.map((p) => (
                <PersonRow
                  key={p.userId}
                  userId={p.userId}
                  name={p.name}
                  imageUrl={p.imageUrl}
                  subtitle={[p.clinicianName ? `With ${p.clinicianName}` : null, p.email ?? p.phoneNumber].filter(Boolean).join(' · ') || 'No contact details'}
                  badges={
                    <>
                      <RehabifyId value={p.patientNumber} copyable={false} />
                      <StatusBadge tone={CARE_STATUS[p.careStatus].tone}>{CARE_STATUS[p.careStatus].label}</StatusBadge>
                      <StatusBadge tone="neutral" className="hidden sm:inline-flex">
                        {SOURCE_LABEL[p.source] ?? humanize(p.source)}
                      </StatusBadge>
                    </>
                  }
                  meta={
                    <p>
                      {p.careStatus !== 'active' && p.endDate
                        ? `Until ${format(p.endDate, 'd MMM yyyy')}`
                        : `Since ${format(p.startDate, 'd MMM yyyy')}`}
                    </p>
                  }
                />
              ))}
            </ul>
            {data?.hasMore && (
              <p className="border-t border-black/[0.05] px-5 py-3 text-xs text-neutral-500 dark:border-white/[0.06] dark:text-neutral-400">
                Showing the first {patients.length} patients.
              </p>
            )}
          </>
        )}
      </Panel>
    </div>
  )
}

// Referrals the clinic still has to act on read amber; finished ones green; dead ends grey
const REFERRAL_TONE: Record<string, Tone> = {
  received: 'amber',
  pending: 'amber',
  consent_pending: 'amber',
  completed: 'green',
  closed: 'green',
  paid_out: 'green',
  cancelled: 'neutral',
  not_suitable: 'neutral',
  refunded: 'neutral',
  redirected_for_safety: 'neutral',
}

export function ClinicReferralsTab({ clinicId }: { clinicId: Id<'clinics'> }) {
  const referrals = useQuery(api.adminClinics.listClinicReferrals, { clinicId }) as ClinicReferralsResult | undefined
  const [show, setShow] = useState<'open' | 'all'>('open')
  const openCount = referrals?.filter((r) => r.open).length
  const rows = (referrals ?? []).filter((r) => show === 'all' || r.open)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips<'open' | 'all'>
          value={show}
          onChange={setShow}
          options={[
            { value: 'open', label: 'Open', count: openCount },
            { value: 'all', label: 'All', count: referrals?.length },
          ]}
        />
        <Link href="/dashboard/admin/referrals" className="inline-flex items-center gap-1 text-sm font-medium text-rh-teal hover:underline dark:text-rh-aqua">
          Route referrals
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      <Panel>
        {referrals === undefined ? (
          <ListSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title={referrals.length === 0 ? 'No referrals routed here' : 'No open referrals'}
            description={
              referrals.length === 0
                ? 'Referrals you assign to this clinic from Inbound referrals show up here.'
                : 'Every referral routed to this clinic has finished.'
            }
          />
        ) : (
          <ul className="p-2">
            {rows.map((r) => {
              const body = (
                <>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rh-mist text-xs font-semibold text-rh-teal dark:bg-rh-aqua/10 dark:text-rh-aqua">
                    {initialsOf(r.patientName, 'R')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-rh-night dark:text-white">{r.patientName}</p>
                      <StatusBadge tone={REFERRAL_TONE[r.status] ?? 'teal'}>{humanize(r.status)}</StatusBadge>
                      {r.priority && r.priority !== 'standard' && <StatusBadge tone="red">{humanize(r.priority)}</StatusBadge>}
                    </div>
                    <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {[r.trackingCode, r.condition, r.partnerId ? `via ${r.partnerId}` : null].filter(Boolean).join(' · ') || 'Referral'}
                    </p>
                  </div>
                  <div className="hidden shrink-0 text-right text-xs text-neutral-500 dark:text-neutral-400 sm:block">
                    <p>{format(r.createdAt, 'd MMM yyyy')}</p>
                    <p>Updated {formatDistanceToNow(r.updatedAt, { addSuffix: true })}</p>
                  </div>
                </>
              )
              // Once the patient has an account, the row opens it
              return (
                <li key={r._id}>
                  {r.patientId ? (
                    <Link
                      href={userHref(r.patientId)}
                      className="group flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-rh-canvas dark:hover:bg-white/[0.03]"
                    >
                      {body}
                      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5 dark:text-neutral-600" />
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 rounded-2xl px-3 py-3">
                      {body}
                      <span className="h-4 w-4 shrink-0" />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}
