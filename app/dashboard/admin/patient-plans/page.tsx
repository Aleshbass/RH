'use client'

import { useMemo, useState } from 'react'
import { makeFunctionReference } from 'convex/server'
import { useMutation, useQuery } from 'convex/react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { CalendarClock, Layers, Receipt, Search, UserCheck } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AdminPage,
  ConfirmDialog,
  EmptyState,
  FilterChips,
  PageHeader,
  Panel,
  StatTile,
  StatusBadge,
  inputClass,
  primaryButtonClass,
  softButtonClass,
  tableWrapClass,
} from '@/components/admin/ui'
import { errorText } from '@/components/admin/finance/format'
import type { adminFindPatientForPlan, adminPatientPlans } from '@/convex/exercisePrograms'
import type { QueryResult } from '@/lib/convexUntyped'
import { formatKobo } from '@/lib/rehabify-services'
import { recoveryPlan, type PaidRecoveryPlanId } from '@/lib/recoveryPlans'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type Overview = QueryResult<typeof adminPatientPlans>
type Row = Overview['rows'][number]
type FoundPatient = QueryResult<typeof adminFindPatientForPlan>[number]

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const overviewRef = makeFunctionReference<'query', Record<string, never>, Overview>('exercisePrograms:adminPatientPlans')
const findRef = makeFunctionReference<'query', { search: string }, FoundPatient[]>('exercisePrograms:adminFindPatientForPlan')
const launchRef = makeFunctionReference<'mutation', { plan: PaidRecoveryPlanId; live: boolean }, unknown>('exercisePrograms:adminSetPlanLaunch')
const grantRef = makeFunctionReference<
  'mutation',
  { patientId: string; plan: PaidRecoveryPlanId; source: 'admin' | 'welcome'; note?: string },
  { status: string; costLabel: string }
>('exercisePrograms:adminGrantPlan')

const switchClass =
  'data-[state=checked]:bg-rh-lime data-[state=unchecked]:bg-neutral-200 dark:data-[state=checked]:bg-rh-lime dark:data-[state=unchecked]:bg-white/15'

const STATUS: Record<Row['status'], { label: string; tone: 'green' | 'amber' | 'neutral' | 'red' }> = {
  pending_activation: { label: 'Waiting for programme', tone: 'amber' },
  active: { label: 'Active', tone: 'green' },
  expired: { label: 'Ended', tone: 'neutral' },
  refunded: { label: 'Refunded', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'red' },
}

const SOURCE: Record<Row['source'], string> = { purchase: 'Paid', admin: 'Free (admin)', welcome: 'Free (welcome)', package: 'Package' }

const LAUNCH_COPY: Record<PaidRecoveryPlanId, { on: string; off: string }> = {
  flex: {
    on: 'Independent physios’ own patients will need Flex (₦1,500 for 30 days) to watch demonstrations and log their progress. Their steps and notes stay free. Rehabify Care and clinic patients aren’t affected.',
    off: 'Nobody will be asked to pay for Flex and nobody can buy it. If Flex Max is also off, demonstrations and logging open for everyone again. Periods already bought keep running.',
  },
  flex_max: {
    on: 'Independent physios’ own patients can buy Flex Max (₦3,500 for 30 days): everything in Flex plus Joy reminders and support on WhatsApp. Joy reads who has it.',
    off: 'Nobody can buy Flex Max. Periods already bought keep running until they end.',
  },
}

type Filter = 'all' | 'active' | 'pending_activation' | 'ended' | 'refunds'

function LaunchSwitches({ live }: { live: Overview['live'] }) {
  const setLaunch = useMutation(launchRef)
  const [change, setChange] = useState<{ plan: PaidRecoveryPlanId; live: boolean } | null>(null)

  const rows: { id: PaidRecoveryPlanId; on: boolean }[] = [
    { id: 'flex', on: live.flexLive },
    { id: 'flex_max', on: live.flexMaxLive },
  ]
  const name = change ? recoveryPlan(change.plan).name : ''

  return (
    <Panel
      title="Launch"
      description={
        live.updatedAt ? `Last changed ${format(live.updatedAt, 'd MMM yyyy, h:mm a')}` : 'Both are off: nobody is gated and nobody can buy.'
      }
    >
      <ul className="divide-y divide-black/[0.05] px-5 pb-2 dark:divide-white/[0.06]">
        {rows.map((row) => {
          const plan = recoveryPlan(row.id)
          return (
            <li key={row.id} className="flex items-start justify-between gap-4 py-4">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-rh-ink dark:text-white">
                  {plan.name}
                  <StatusBadge tone={row.on ? 'green' : 'neutral'}>{row.on ? 'Live' : 'Coming soon'}</StatusBadge>
                </p>
                <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                  {plan.priceLabel}. {plan.description}
                </p>
              </div>
              <Switch
                checked={row.on}
                onCheckedChange={(value) => setChange({ plan: row.id, live: value })}
                className={cn('mt-0.5', switchClass)}
                aria-label={`${plan.name} on sale`}
              />
            </li>
          )
        })}
      </ul>
      <ConfirmDialog
        open={change !== null}
        onOpenChange={(open) => !open && setChange(null)}
        title={change?.live ? `Launch ${name}?` : `Switch ${name} off?`}
        description={change ? LAUNCH_COPY[change.plan][change.live ? 'on' : 'off'] : undefined}
        confirmLabel={change?.live ? `Launch ${name}` : `Switch ${name} off`}
        destructive={change?.live === false}
        onConfirm={async () => {
          if (!change) return
          try {
            await setLaunch(change)
            playSound('success')
            toast.success(change.live ? `${name} is live` : `${name} is off`)
          } catch (error) {
            toast.error(errorText(error, 'Couldn’t save that.'))
            throw error
          }
        }}
      />
    </Panel>
  )
}

function GrantPanel() {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const found = useQuery(findRef, query.length >= 3 ? { search: query } : 'skip')
  const grant = useMutation(grantRef)
  const [patient, setPatient] = useState<FoundPatient | null>(null)
  const [plan, setPlan] = useState<PaidRecoveryPlanId>('flex')
  const [source, setSource] = useState<'welcome' | 'admin'>('welcome')
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)

  return (
    <Panel title="Give a free activation" description="A welcome gift or a goodwill gesture. Recorded as ₦0, with the plan’s price as Rehabify’s cost.">
      <div className="space-y-4 px-5 pb-5 pt-2">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault()
            setPatient(null)
            setQuery(search.trim())
          }}
        >
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rehabify ID (RH-P-…) or email"
            className={cn(inputClass, 'h-11')}
            aria-label="Find a patient"
          />
          <Button type="submit" className={cn(softButtonClass, 'h-11 shrink-0')}>
            <Search className="mr-2 h-4 w-4" /> Find
          </Button>
        </form>

        {query.length >= 3 && found !== undefined && found.length === 0 && (
          <p className="text-sm text-neutral-500">No patient with that Rehabify ID or email.</p>
        )}
        {found && found.length > 0 && !patient && (
          <ul className="space-y-1.5">
            {found.map((row) => (
              <li key={row._id}>
                <button
                  type="button"
                  onClick={() => setPatient(row)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl bg-rh-canvas px-3 py-2.5 text-left text-sm transition hover:bg-rh-honeydew dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-rh-ink dark:text-white">{row.name}</span>
                    <span className="ml-2 font-mono text-xs text-neutral-500">{row.patientNumber ?? 'No ID yet'}</span>
                  </span>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {row.current ? `${row.current.name}${row.current.expiresAt ? ` until ${format(row.current.expiresAt, 'd MMM')}` : ''}` : 'Basic'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {patient && (
          <div className="space-y-4 rounded-2xl bg-rh-canvas p-4 dark:bg-white/[0.04]">
            <p className="text-sm text-rh-ink dark:text-white">
              For <span className="font-semibold">{patient.name}</span>{' '}
              <span className="font-mono text-xs text-neutral-500">{patient.patientNumber}</span>
              <button type="button" onClick={() => setPatient(null)} className="ml-2 text-xs text-neutral-500 underline-offset-4 hover:underline">
                Change
              </button>
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-neutral-500">Plan</Label>
                <FilterChips<PaidRecoveryPlanId>
                  value={plan}
                  onChange={setPlan}
                  options={[
                    { value: 'flex', label: 'Flex' },
                    { value: 'flex_max', label: 'Flex Max' },
                  ]}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-neutral-500">Reason</Label>
                <FilterChips<'welcome' | 'admin'>
                  value={source}
                  onChange={setSource}
                  options={[
                    { value: 'welcome', label: 'Welcome' },
                    { value: 'admin', label: 'Other' },
                  ]}
                />
              </div>
            </div>
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Note for the team (optional)"
              maxLength={300}
              className={cn(inputClass, 'h-11')}
            />
            <Button type="button" onClick={() => setConfirming(true)} className={cn(primaryButtonClass, 'h-11 w-full sm:w-auto')}>
              Give 30 days of {recoveryPlan(plan).name}
            </Button>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Give ${recoveryPlan(plan).name} free?`}
        description={`${patient?.name ?? 'This patient'} gets 30 days of ${recoveryPlan(plan).name}, starting when their programme is ready. It costs Rehabify ${formatKobo(recoveryPlan(plan).priceKobo)}.`}
        confirmLabel="Give it"
        onConfirm={async () => {
          if (!patient) return
          try {
            const result = await grant({ patientId: patient._id, plan, source, note: note.trim() || undefined })
            playSound('success')
            toast.success(result.status === 'active' ? `${recoveryPlan(plan).name} is on for ${patient.name}` : `Given. It starts when ${patient.name}’s programme is ready.`)
            setPatient(null)
            setNote('')
          } catch (error) {
            toast.error(errorText(error, 'Couldn’t give that.'))
            throw error
          }
        }}
      />
    </Panel>
  )
}

function EntitlementsTable({ rows }: { rows: Row[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const visible = useMemo(
    () =>
      rows.filter((row) =>
        filter === 'all'
          ? true
          : filter === 'active'
            ? row.status === 'active'
            : filter === 'pending_activation'
              ? row.status === 'pending_activation'
              : filter === 'ended'
                ? row.status === 'expired'
                : row.status === 'refunded' || row.status === 'cancelled'
      ),
    [rows, filter]
  )
  const count = (f: Filter) => rows.filter((row) => (f === 'refunds' ? row.status === 'refunded' || row.status === 'cancelled' : f === 'ended' ? row.status === 'expired' : row.status === f)).length

  return (
    <Panel title="Plans" description="The latest 200, newest first. Patients are shown by Rehabify ID.">
      <div className="px-5 pb-3 pt-2">
        <FilterChips<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: rows.length },
            { value: 'active', label: 'Active', count: count('active') },
            { value: 'pending_activation', label: 'Waiting', count: count('pending_activation') },
            { value: 'ended', label: 'Ended', count: count('ended') },
            { value: 'refunds', label: 'Refunds', count: count('refunds') },
          ]}
        />
      </div>
      {visible.length === 0 ? (
        <EmptyState icon={<Layers />} title="Nothing here yet" description="Plans appear here once patients buy them or you give one." />
      ) : (
        <div className={tableWrapClass}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>How</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead>Bought</TableHead>
                <TableHead>Runs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => (
                <TableRow key={row._id}>
                  <TableCell className="font-mono text-xs">{row.patientNumber ?? '—'}</TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    <StatusBadge tone={STATUS[row.status].tone}>
                      {row.startsLater ? 'Starts later' : STATUS[row.status].label}
                      {row.refundRequested && row.status === 'cancelled' ? ' · refund asked' : ''}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-sm text-neutral-600 dark:text-neutral-300">{SOURCE[row.source]}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.amountKobo > 0 ? formatKobo(row.amountKobo) : <span className="text-neutral-500">₦0 ({formatKobo(row.listPriceKobo ?? 0)} cost)</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{format(row.purchasedAt, 'd MMM yyyy')}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {row.activatedAt && row.expiresAt ? `${format(row.activatedAt, 'd MMM')} – ${format(row.expiresAt, 'd MMM')}` : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  )
}

/** Flex and Flex Max: launch switches, numbers, free activations and every period. */
export default function AdminPatientPlansPage() {
  const data = useQuery(overviewRef, {})

  return (
    <AdminPage>
      <PageHeader
        title="Patient plans"
        description="Flex and Flex Max for independent physios’ own patients. Rehabify Care and clinic patients always have them included, and Basic is always free."
      />
      {data === undefined ? (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <LaunchSwitches live={data.live} />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Active now" value={data.stats.active} hint={`${data.stats.activeFlexMax} on Flex Max`} icon={UserCheck} />
            <StatTile label="Waiting for programme" value={data.stats.waiting} icon={CalendarClock} tone={data.stats.waiting ? 'attention' : 'default'} />
            <StatTile
              label="Revenue this month"
              value={formatKobo(data.stats.revenueThisMonthKobo)}
              hint={`${data.stats.purchasesThisMonth} paid`}
              icon={Receipt}
            />
            <StatTile
              label="Free this month"
              value={data.stats.freeThisMonth}
              hint={`${formatKobo(data.stats.freeValueThisMonthKobo)} cost to Rehabify`}
              icon={Layers}
            />
          </div>
          {data.stats.refundsRequested > 0 && (
            <p className="rounded-2xl bg-rh-peach px-4 py-3 text-sm text-[#7c4a0a] dark:bg-white/[0.06] dark:text-amber-200">
              {data.stats.refundsRequested} Flex refund{data.stats.refundsRequested === 1 ? ' is' : 's are'} waiting for approval on the Refunds page.
            </p>
          )}
          <GrantPanel />
          <EntitlementsTable rows={data.rows} />
        </>
      )}
      {data !== undefined && data.rows.length === 0 && !data.live.flexLive && !data.live.flexMaxLive && (
        <p className="text-xs text-neutral-500">Nothing changes for patients until you launch a plan.</p>
      )}
    </AdminPage>
  )
}
