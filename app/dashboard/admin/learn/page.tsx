'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { formatDistanceToNow } from 'date-fns'
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Circle,
  ExternalLink,
  GraduationCap,
  Hourglass,
  Lock,
  Plus,
  Rocket,
  Trash2,
  Undo2,
  Users,
} from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AdminPage,
  cardClass,
  ConfirmDialog,
  EmptyState,
  formatNaira,
  PageHeader,
  primaryButtonClass,
  softButtonClass,
  StatTile,
  StatusBadge,
  tabsListClass,
} from '@/components/admin/ui'
import { Callout, errorMessage, LoadingBlock } from '@/components/admin/partners/shared'
import { CohortForm } from '@/components/admin/learn/CohortForm'
import { CoursePanel } from '@/components/admin/learn/CoursePanel'
import { InterestPanel, RegistrationsPanel } from '@/components/admin/learn/RegistrationsPanel'
import {
  AUTO_CLOSED,
  COHORT_STATUS,
  draftForNextCohort,
  draftFromCohort,
  type AdminCohort,
  type AdminOverview,
  type CohortStatus,
} from '@/components/admin/learn/types'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type Pending = { status: CohortStatus } | { delete: true } | null

function Visibility({ on, label, detail }: { on: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2.5">
      {on ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-300 dark:text-neutral-600" />
      )}
      <span className="min-w-0">
        <span className={cn('block text-sm font-medium', on ? 'text-rh-ink dark:text-white' : 'text-neutral-500 dark:text-neutral-400')}>
          {label}
        </span>
        <span className="block text-xs text-neutral-500 dark:text-neutral-400">{detail}</span>
      </span>
    </li>
  )
}

function PublishCard({ cohort, onDeleted }: { cohort: AdminCohort; onDeleted: () => void }) {
  const setStatus = useMutation(api.learn.adminSetCohortStatus)
  const remove = useMutation(api.learn.adminDeleteCohort)
  const [pending, setPending] = useState<Pending>(null)

  const live = cohort.status === 'live'
  const onPage = cohort.status !== 'draft' && cohort.closedReason !== 'ended'
  const promoting = live && cohort.isOpen
  const autoClosed = live && cohort.closedReason ? AUTO_CLOSED[cohort.closedReason] : undefined

  const headline =
    cohort.status === 'draft'
      ? 'Draft: only admins can see it'
      : live
        ? cohort.isOpen
          ? 'Live: taking registrations'
          : 'Live, but registration has closed'
        : 'Registration closed'

  const confirmCopy = (() => {
    if (!pending) return null
    if ('delete' in pending) {
      return {
        title: `Delete the ${cohort.cohortLabel}?`,
        description: 'This draft and any unpaid checkouts started for it are removed. This cannot be undone.',
        label: 'Delete draft',
        destructive: true,
      }
    }
    switch (pending.status) {
      case 'live':
        return {
          title: `Make the ${cohort.cohortLabel} live?`,
          description: `Registration opens and it appears on /learn${cohort.showOnLanding ? ', the landing page' : ''}${cohort.showBanner ? ' and the top banner' : ''}. Any other live cohort stops taking registrations.`,
          label: 'Make it live',
          destructive: false,
        }
      case 'closed':
        return {
          title: 'Close registration?',
          description: 'The program page keeps showing the dates as “registration closed”, and the landing section and banner disappear. You can reopen it any time.',
          label: 'Close registration',
          destructive: false,
        }
      default:
        return {
          title: 'Move back to draft?',
          description: 'It disappears from the website completely. Existing registrations are kept.',
          label: 'Move to draft',
          destructive: false,
        }
    }
  })()

  const confirmAction = async () => {
    if (!pending) return
    try {
      if ('delete' in pending) {
        await remove({ cohortId: cohort.id })
        toast.success('Draft deleted')
        onDeleted()
        return
      }
      const result = (await setStatus({ cohortId: cohort.id, status: pending.status })) as { closedOthers: number }
      playSound(pending.status === 'live' ? 'approve' : 'success')
      toast.success(
        pending.status === 'live'
          ? `The ${cohort.cohortLabel} is live${result.closedOthers ? `. ${result.closedOthers} other cohort closed.` : '.'}`
          : pending.status === 'closed'
            ? 'Registration closed'
            : 'Moved to draft'
      )
    } catch (error) {
      toast.error(errorMessage(error, 'Could not update the cohort'))
      throw error
    }
  }

  return (
    <div className={cn(cardClass, 'p-5 sm:p-6')}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={COHORT_STATUS[cohort.status].tone}>{COHORT_STATUS[cohort.status].label}</StatusBadge>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              Updated {formatDistanceToNow(cohort.updatedAt, { addSuffix: true })}
            </span>
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-rh-ink dark:text-white">{headline}</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {cohort.cohortLabel} · {cohort.dateRange} · {cohort.liveSessions}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {cohort.status !== 'draft' && (
            <Button asChild variant="ghost" className={softButtonClass}>
              <Link href="/learn" target="_blank">
                <ExternalLink className="mr-2 h-4 w-4" /> View page
              </Link>
            </Button>
          )}
          {cohort.status === 'draft' && (
            <>
              <Button variant="ghost" className={softButtonClass} onClick={() => setPending({ delete: true })} disabled={cohort.stats.paid > 0}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
              <Button className={primaryButtonClass} onClick={() => setPending({ status: 'live' })}>
                <Rocket className="mr-2 h-4 w-4" /> Make it live
              </Button>
            </>
          )}
          {live && (
            <Button variant="ghost" className={softButtonClass} onClick={() => setPending({ status: 'closed' })}>
              <Lock className="mr-2 h-4 w-4" /> Close registration
            </Button>
          )}
          {cohort.status === 'closed' && (
            <>
              <Button variant="ghost" className={softButtonClass} onClick={() => setPending({ status: 'draft' })}>
                <Undo2 className="mr-2 h-4 w-4" /> Move to draft
              </Button>
              {cohort.closedReason !== 'ended' && (
                <Button className={primaryButtonClass} onClick={() => setPending({ status: 'live' })}>
                  <Rocket className="mr-2 h-4 w-4" /> Reopen registration
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {autoClosed && <Callout tone="warning" className="mt-4" title="Registration closed automatically">{autoClosed} Change the dates or seats below to reopen it.</Callout>}

      <ul className="mt-5 grid grid-cols-1 gap-3 border-t border-black/[0.05] pt-5 sm:grid-cols-3 dark:border-white/[0.06]">
        <Visibility on={onPage} label="Program page" detail={onPage ? (promoting ? 'Open for registration' : 'Shows “registration closed”') : 'Hidden'} />
        <Visibility
          on={promoting && cohort.showOnLanding}
          label="Landing page section"
          detail={!cohort.showOnLanding ? 'Switched off below' : promoting ? 'Showing under the hero' : 'Shows while live and open'}
        />
        <Visibility
          on={promoting && cohort.showBanner}
          label="Top banner"
          detail={!cohort.showBanner ? 'Switched off below' : promoting ? 'Showing on public pages' : 'Shows while live and open'}
        />
      </ul>

      {confirmCopy && (
        <ConfirmDialog
          open={pending !== null}
          onOpenChange={(open) => !open && setPending(null)}
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.label}
          destructive={confirmCopy.destructive}
          onConfirm={confirmAction}
        />
      )}
    </div>
  )
}

function CohortPicker({
  cohorts,
  selectedId,
  onSelect,
}: {
  cohorts: AdminCohort[]
  selectedId: string | null
  onSelect: (id: Id<'learnCohorts'>) => void
}) {
  if (cohorts.length < 2) return null
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {cohorts.map((c) => {
        const active = c.id === selectedId
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-left text-sm transition',
              active
                ? 'bg-rh-lime text-rh-ink shadow-soft dark:bg-rh-lime dark:text-rh-ink'
                : 'bg-white text-rh-ink shadow-soft hover:bg-rh-canvas dark:bg-rh-ink-2 dark:text-white dark:hover:bg-rh-ink-3'
            )}
          >
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                c.status === 'live' ? 'bg-rh-lime' : c.status === 'closed' ? 'bg-amber-400' : 'bg-neutral-300 dark:bg-neutral-600'
              )}
            />
            <span className="font-medium">{c.cohortLabel}</span>
            <span className={cn('text-xs', active ? 'opacity-75' : 'text-neutral-500 dark:text-neutral-400')}>{c.stats.paid} paid</span>
          </button>
        )
      })}
    </div>
  )
}

export default function AdminLearnPage() {
  const overview = useQuery(api.learn.adminOverview, {}) as AdminOverview | undefined
  const [selectedId, setSelectedId] = useState<Id<'learnCohorts'> | 'new' | null>(null)
  const [tab, setTab] = useState('details')

  const cohorts = overview?.cohorts ?? []
  const creating = selectedId === 'new'
  const selected = creating
    ? null
    : cohorts.find((c) => c.id === selectedId) ?? cohorts.find((c) => c.status === 'live') ?? cohorts[0] ?? null

  const header = (
    <PageHeader
      eyebrow="Rehabify Learn"
      title="MSK Specialist Program"
      description="Set each cohort's dates and prices, publish it, add live session links and weekly materials, and see who has registered."
      actions={
        <>
          <Button asChild variant="ghost" className={softButtonClass}>
            <Link href="/learn" target="_blank">
              <ExternalLink className="mr-2 h-4 w-4" /> Program page
            </Link>
          </Button>
          {cohorts.length > 0 && !creating && (
            <Button className={primaryButtonClass} onClick={() => setSelectedId('new')}>
              <Plus className="mr-2 h-4 w-4" /> New cohort
            </Button>
          )}
        </>
      }
    />
  )

  if (overview === undefined) {
    return (
      <AdminPage>
        {header}
        <LoadingBlock />
      </AdminPage>
    )
  }

  if (creating || cohorts.length === 0) {
    const first = cohorts.length === 0
    if (first && !creating) {
      return (
        <AdminPage>
          {header}
          <div className={cardClass}>
            <EmptyState
              icon={<GraduationCap />}
              title="No cohorts yet"
              description="Create the first cohort. It starts as a draft filled in with the November program details, so check it and make it live."
              action={
                <Button className={primaryButtonClass} onClick={() => setSelectedId('new')}>
                  <Plus className="mr-2 h-4 w-4" /> Create the first cohort
                </Button>
              }
            />
          </div>
        </AdminPage>
      )
    }
    return (
      <AdminPage>
        {header}
        <CohortForm
          title={first ? 'First cohort' : 'New cohort'}
          description={
            first
              ? 'Pre-filled with the program as announced. Saving creates a draft; nothing shows on the website until you make it live.'
              : `Copied from the ${cohorts[0].cohortLabel}: pick the new dates. Saving creates a draft.`
          }
          initial={draftForNextCohort(cohorts[0])}
          initialImageUrl={cohorts[0]?.imageUrl ?? null}
          onCancel={cohorts.length ? () => setSelectedId(null) : undefined}
          onSaved={(id) => {
            setSelectedId(id)
            setTab('details')
          }}
        />
      </AdminPage>
    )
  }

  if (!selected) return null
  const capacityHint = selected.capacity !== null ? `of ${selected.capacity} seats` : 'No seat limit'

  return (
    <AdminPage>
      {header}
      <CohortPicker cohorts={cohorts} selectedId={selected.id} onSelect={(id) => setSelectedId(id)} />
      <PublishCard key={`publish-${selected.id}`} cohort={selected} onDeleted={() => setSelectedId(null)} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Paid seats"
          value={selected.stats.paid}
          hint={`${capacityHint} · ${selected.stats.rehabify} Rehabify, ${selected.stats.external} other`}
          icon={Users}
        />
        <StatTile label="Revenue" value={formatNaira(selected.stats.revenue)} hint="Paid registrations" icon={Banknote} tone="mint" />
        <StatTile label="Awaiting payment" value={selected.stats.pending} hint="Started checkout, not paid yet" icon={Hourglass} tone="peach" />
        <StatTile
          label="Needs review"
          value={selected.stats.needsReview}
          hint={selected.stats.needsReview ? 'Duplicate or short payments' : 'Nothing to check'}
          icon={AlertTriangle}
          tone={selected.stats.needsReview ? 'attention' : 'neutral'}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className={tabsListClass}>
          <TabsTrigger value="details">Cohort details</TabsTrigger>
          <TabsTrigger value="course">Course</TabsTrigger>
          <TabsTrigger value="registrations">
            Registrations{selected.stats.paid + selected.stats.pending > 0 ? ` (${selected.stats.paid + selected.stats.pending})` : ''}
          </TabsTrigger>
          <TabsTrigger value="interest">Waiting list{overview.interestCount ? ` (${overview.interestCount})` : ''}</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="mt-4">
          <CohortForm
            key={selected.id}
            cohortId={selected.id}
            title="Cohort details"
            description="What the program page, landing section, banner and confirmation email show. Saved changes appear on the website immediately."
            initial={draftFromCohort(selected)}
            initialImageUrl={selected.imageUrl}
          />
        </TabsContent>
        <TabsContent value="course" className="mt-4">
          <CoursePanel key={selected.id} cohortId={selected.id} />
        </TabsContent>
        <TabsContent value="registrations" className="mt-4">
          <RegistrationsPanel cohort={selected} programUrl={overview.programUrl} />
        </TabsContent>
        <TabsContent value="interest" className="mt-4">
          <InterestPanel />
        </TabsContent>
      </Tabs>
    </AdminPage>
  )
}
