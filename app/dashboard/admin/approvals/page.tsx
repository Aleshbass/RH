'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Hourglass,
  MapPin,
  Phone,
  Stethoscope,
  Trash2,
  Wrench,
  X,
} from '@/components/icons'

import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
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
  Stagger,
  StaggerItem,
  StatusBadge,
  inputClass,
  primaryButtonClass,
  softButtonClass,
} from '@/components/admin/ui'
import { devToolsEnabled } from '@/components/admin/shell/adminNav'
import { UserApprovalDialog, documentLabel } from '@/components/admin/UserApprovalDialog'
import { RoleBadge, UserAvatar, displayName } from '@/components/dashboard/admin/UserManagement'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type QueueItem = {
  _id: Id<'accountApprovalStatus'>
  userId: Id<'users'>
  submittedAt: number
  requiredDocuments?: string[]
  user: {
    _id: Id<'users'>
    firstName?: string
    lastName?: string
    email?: string
    phoneNumber?: string
    imageUrl?: string
    role?: string
    _creationTime: number
  }
  summary: {
    licenseNumber?: string
    location?: string
    yearsOfExperience?: number
    clinicName?: string
    specializations?: string[]
  }
  documents: { _id: string; fileName: string; documentType: string; uploadedAt?: number }[]
}

type RoleFilter = 'all' | 'physiotherapist' | 'clinic_owner' | 'other'
type Leaving = 'approve' | 'decline' | 'delete'

const QUEUE_LIMIT = 100

const approvalApi = api.accountApproval

export default function AdminApprovalsPage() {
  const reduceMotion = useReducedMotion()
  const showDevTools = devToolsEnabled()

  const queue = (useQuery as any)(approvalApi.adminListApprovalQueue, { limit: QUEUE_LIMIT }) as QueueItem[] | undefined
  const approveUser = useMutation(api.users.approveUser)
  const declineUser = useMutation(api.users.declineUser)
  const deleteUser = useMutation(api.users.adminDeleteUser)

  const [filter, setFilter] = useState<RoleFilter>('all')
  const [reviewUserId, setReviewUserId] = useState<Id<'users'> | null>(null)
  const [approveTarget, setApproveTarget] = useState<QueueItem | null>(null)
  const [declineTarget, setDeclineTarget] = useState<QueueItem | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<QueueItem | null>(null)
  // How each row should animate out once the reactive query drops it
  const [leaving, setLeaving] = useState<Record<string, Leaving>>({})

  const markLeaving = (userId: string, kind: Leaving) => setLeaving((prev) => ({ ...prev, [userId]: kind }))
  const clearLeaving = (userId: string) =>
    setLeaving((prev) => {
      const next = { ...prev }
      delete next[userId]
      return next
    })

  const counts = useMemo(() => {
    const rows = queue ?? []
    const physio = rows.filter((r) => r.user.role === 'physiotherapist').length
    const clinic = rows.filter((r) => r.user.role === 'clinic_owner').length
    return { all: rows.length, physiotherapist: physio, clinic_owner: clinic, other: rows.length - physio - clinic }
  }, [queue])

  const visible = useMemo(() => {
    const rows = queue ?? []
    if (filter === 'all') return rows
    if (filter === 'other') return rows.filter((r) => r.user.role !== 'physiotherapist' && r.user.role !== 'clinic_owner')
    return rows.filter((r) => r.user.role === filter)
  }, [queue, filter])

  const oldest = queue && queue.length > 0 ? queue[0] : null
  const capped = (queue?.length ?? 0) >= QUEUE_LIMIT

  // ── Actions ──────────────────────────────────────────────────────────────

  const runApprove = async (userId: Id<'users'>, name: string, comments?: string) => {
    markLeaving(userId, 'approve')
    try {
      await approveUser({ userId, comments })
      playSound('approve')
      toast.success(`${name} approved`, { description: 'They can sign in to their dashboard now. An approval email is on its way.' })
    } catch (error) {
      clearLeaving(userId)
      toast.error(`Could not approve ${name}`, {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
      throw error
    }
  }

  const runDecline = async (userId: Id<'users'>, name: string, reason: string) => {
    markLeaving(userId, 'decline')
    try {
      await declineUser({ userId, comments: reason })
      playSound('reject')
      toast.success(`${name} declined`, { description: 'They have been emailed the reason. You can find them under Declined.' })
    } catch (error) {
      clearLeaving(userId)
      toast.error(`Could not decline ${name}`, {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
      throw error
    }
  }

  const confirmQuickApprove = async () => {
    if (!approveTarget) return
    await runApprove(approveTarget.userId, displayName(approveTarget.user))
    setApproveTarget(null)
  }

  const confirmDecline = async () => {
    if (!declineTarget) return
    const reason = declineReason.trim()
    if (!reason) {
      toast.error('Add a reason first', { description: 'The applicant sees it in their decline email.' })
      throw new Error('Decline reason required')
    }
    await runDecline(declineTarget.userId, displayName(declineTarget.user), reason)
    setDeclineTarget(null)
    setDeclineReason('')
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const name = displayName(deleteTarget.user)
    markLeaving(deleteTarget.userId, 'delete')
    try {
      await deleteUser({ userId: deleteTarget.userId })
      playSound('reject')
      toast.success(`${name} deleted`, { description: 'The account, profile and application were removed.' })
      if (reviewUserId === deleteTarget.userId) setReviewUserId(null)
      setDeleteTarget(null)
    } catch (error) {
      clearLeaving(deleteTarget.userId)
      toast.error(`Could not delete ${name}`, {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
      throw error
    }
  }

  // Review dialog handlers: the dialog stays open if these throw
  const reviewApprove = async (userId: Id<'users'>, comments?: string) => {
    const item = queue?.find((q) => q.userId === userId)
    try {
      await runApprove(userId, displayName(item?.user), comments)
    } catch (error) {
      playSound('error')
      throw error
    }
  }
  const reviewDecline = async (userId: Id<'users'>, comments: string) => {
    const item = queue?.find((q) => q.userId === userId)
    try {
      await runDecline(userId, displayName(item?.user), comments)
    } catch (error) {
      playSound('error')
      throw error
    }
  }

  const exitFor = (kind?: Leaving) => {
    if (reduceMotion) return { opacity: 0 }
    if (kind === 'approve') return { opacity: 0, x: 48, transition: { duration: 0.25 } }
    if (kind === 'decline' || kind === 'delete') return { opacity: 0, x: -48, transition: { duration: 0.25 } }
    return { opacity: 0, transition: { duration: 0.2 } }
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Rehabify Physios"
        title="Approvals"
        description="New physiotherapist and clinic applications, oldest first. Check their licence and ID before approving."
        actions={
          showDevTools ? (
            <Button asChild className={softButtonClass}>
              <Link href="/dashboard/admin/approvals/debug">
                <Wrench className="mr-2 h-4 w-4" />
                Debug tools
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StaggerItem>
          <StatTile
            label="Waiting for review"
            value={queue === undefined ? '—' : `${counts.all}${capped ? '+' : ''}`}
            icon={Clock}
            tone={counts.all > 0 ? 'attention' : 'teal'}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Physiotherapists" value={queue === undefined ? '—' : counts.physiotherapist} icon={Stethoscope} />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Clinic owners" value={queue === undefined ? '—' : counts.clinic_owner} icon={Building2} tone="mint" />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Oldest waiting"
            value={oldest ? formatDistanceToNowStrict(oldest.submittedAt) : '—'}
            hint={oldest ? `Since ${format(oldest.submittedAt, 'd MMM yyyy')}` : 'Nothing waiting'}
            icon={Hourglass}
            tone="peach"
          />
        </StaggerItem>
      </Stagger>

      <Panel
        title="Review queue"
        description={capped ? `Showing the oldest ${QUEUE_LIMIT} applications.` : undefined}
        actions={
          queue && queue.length > 0 ? (
            <FilterChips
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: counts.all },
                { value: 'physiotherapist', label: 'Physios', count: counts.physiotherapist },
                { value: 'clinic_owner', label: 'Clinics', count: counts.clinic_owner },
                ...(counts.other > 0 ? [{ value: 'other' as const, label: 'Other', count: counts.other }] : []),
              ]}
            />
          ) : undefined
        }
        bodyClassName="pb-2 pt-2"
      >
        {queue === undefined ? (
          <div className="space-y-2 px-5 pb-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl dark:bg-white/[0.06]" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 />}
            title="All caught up"
            description={filter === 'all' ? 'No applications are waiting for review.' : 'Nothing waiting in this group.'}
          />
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            <AnimatePresence initial={false}>
              {visible.map((item) => {
                const name = displayName(item.user)
                const busy = !!leaving[item.userId]
                const docs = item.documents
                const waitingDays = Math.floor((Date.now() - item.submittedAt) / 86_400_000)
                return (
                  <motion.li
                    key={item._id}
                    layout={!reduceMotion}
                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, x: 0, y: 0 }}
                    exit={exitFor(leaving[item.userId])}
                    transition={{ duration: 0.22 }}
                    className={cn('px-5 py-4', busy && 'pointer-events-none opacity-60')}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <UserAvatar user={item.user} className="h-11 w-11" />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/dashboard/admin/users/${item.userId}`}
                              className="truncate text-[15px] font-semibold text-rh-night hover:underline dark:text-white"
                            >
                              {name}
                            </Link>
                            <RoleBadge role={item.user.role} />
                            <StatusBadge tone={waitingDays >= 3 ? 'amber' : 'neutral'} className="gap-1">
                              <Clock className="h-3 w-3" />
                              {format(item.submittedAt, 'd MMM yyyy')} · {formatDistanceToNowStrict(item.submittedAt, { addSuffix: true })}
                            </StatusBadge>
                          </div>
                          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                            {item.user.email && <span className="truncate">{item.user.email}</span>}
                            {item.user.phoneNumber && (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {item.user.phoneNumber}
                              </span>
                            )}
                          </p>
                          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-neutral-600 dark:text-neutral-300">
                            {item.summary.clinicName && (
                              <span className="inline-flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {item.summary.clinicName}
                              </span>
                            )}
                            {item.summary.licenseNumber && <span className="font-mono">Licence {item.summary.licenseNumber}</span>}
                            {item.summary.yearsOfExperience !== undefined && <span>{item.summary.yearsOfExperience} yrs experience</span>}
                            {item.summary.location && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {item.summary.location}
                              </span>
                            )}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            {docs.length === 0 ? (
                              <StatusBadge tone="amber" className="gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                No documents uploaded
                              </StatusBadge>
                            ) : (
                              <>
                                {docs.slice(0, 4).map((d) => (
                                  <StatusBadge key={d._id} tone="teal" className="gap-1">
                                    <FileText className="h-3 w-3" />
                                    {documentLabel(d.documentType)}
                                  </StatusBadge>
                                ))}
                                {docs.length > 4 && <StatusBadge>+{docs.length - 4} more</StatusBadge>}
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                        <Button size="sm" onClick={() => setApproveTarget(item)} disabled={busy} className={primaryButtonClass}>
                          <Check className="mr-1.5 h-4 w-4" />
                          Approve
                        </Button>
                        <Button size="sm" onClick={() => setReviewUserId(item.userId)} disabled={busy} className={softButtonClass}>
                          <Eye className="mr-1.5 h-4 w-4" />
                          Review
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setDeclineReason('')
                            setDeclineTarget(item)
                          }}
                          disabled={busy}
                          className="rounded-xl bg-rh-blush text-[#be123c] hover:bg-rose-100 dark:bg-rose-400/10 dark:text-rose-300 dark:hover:bg-rose-400/20"
                        >
                          <X className="mr-1.5 h-4 w-4" />
                          Decline
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteTarget(item)}
                          disabled={busy}
                          className="h-9 w-9 rounded-xl text-neutral-400 hover:bg-rh-blush hover:text-rose-600 dark:hover:bg-rose-400/10 dark:hover:text-rose-300"
                          aria-label={`Delete ${name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        )}
      </Panel>

      <UserApprovalDialog
        userId={reviewUserId}
        isOpen={!!reviewUserId}
        onClose={() => setReviewUserId(null)}
        onApprove={reviewApprove}
        onDecline={reviewDecline}
      />

      <ConfirmDialog
        open={!!approveTarget}
        onOpenChange={(o) => !o && setApproveTarget(null)}
        title={`Approve ${displayName(approveTarget?.user)}?`}
        description={
          approveTarget && approveTarget.documents.length === 0
            ? 'They have not uploaded any documents. Approving gives them access straight away and sends an approval email.'
            : 'They get access to their dashboard straight away and receive an approval email.'
        }
        confirmLabel="Approve"
        onConfirm={confirmQuickApprove}
      />

      <ConfirmDialog
        open={!!declineTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeclineTarget(null)
            setDeclineReason('')
          }
        }}
        title={`Decline ${displayName(declineTarget?.user)}?`}
        description="They will be emailed this reason and can reapply after fixing it."
        confirmLabel="Decline application"
        destructive
        onConfirm={confirmDecline}
      >
        <Textarea
          autoFocus
          rows={3}
          value={declineReason}
          onChange={(e) => setDeclineReason(e.target.value)}
          placeholder="For example: the licence uploaded has expired."
          className={inputClass}
          aria-label="Reason for declining"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete ${displayName(deleteTarget?.user)}?`}
        description="This permanently removes the account, its profile and this application. It cannot be undone. To turn someone down, decline instead."
        confirmLabel="Delete user"
        destructive
        onConfirm={confirmDelete}
      />
    </AdminPage>
  )
}
