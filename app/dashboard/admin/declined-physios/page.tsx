'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation } from 'convex/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { AlertCircle, Download, Eye, Phone, Search, Stethoscope, Trash2, Users, XCircle } from 'lucide-react'

import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { useQueryUntyped } from '@/lib/convexUntyped'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
  downloadCsv,
  inputClass,
  softButtonClass,
} from '@/components/admin/ui'
import { RoleBadge, UserAvatar, displayName } from '@/components/dashboard/admin/UserManagement'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type DeclinedApproval = {
  _id: Id<'accountApprovalStatus'>
  _creationTime: number
  userId: Id<'users'>
  status: string
  submittedAt: number
  reviewedAt?: number
  reviewedBy?: Id<'users'>
  comments?: string
  user: {
    _id: Id<'users'>
    role?: string
    firstName?: string
    lastName?: string
    email?: string
    imageUrl?: string
    phoneNumber?: string
  } | null
}

type Filter = 'all' | 'physiotherapist' | 'other'

export default function DeclinedPhysiosPage() {
  const reduceMotion = useReducedMotion()
  // Newest 300 declined records (bounded server-side)
  const declined = useQueryUntyped(api.users.getDeclinedApprovals) as DeclinedApproval[] | undefined
  const deleteUser = useMutation(api.users.adminDeleteUser)

  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DeclinedApproval | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const rows = useMemo(() => (declined ?? []).filter((a) => a.user !== null), [declined])
  const physioCount = rows.filter((a) => a.user?.role === 'physiotherapist').length

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((a) => {
      if (filter === 'physiotherapist' && a.user?.role !== 'physiotherapist') return false
      if (filter === 'other' && a.user?.role === 'physiotherapist') return false
      if (!term) return true
      return (
        displayName(a.user).toLowerCase().includes(term) ||
        (a.user?.email ?? '').toLowerCase().includes(term) ||
        (a.comments ?? '').toLowerCase().includes(term)
      )
    })
  }, [rows, filter, search])

  const lastThirtyDays = rows.filter((a) => a.reviewedAt && Date.now() - a.reviewedAt < 30 * 86_400_000).length

  const exportCsv = () =>
    downloadCsv(
      `rehabify-declined-${format(new Date(), 'yyyy-MM-dd')}`,
      visible.map((a) => ({
        name: displayName(a.user),
        email: a.user?.email ?? '',
        phone: a.user?.phoneNumber ?? '',
        role: a.user?.role ?? '',
        submitted: new Date(a.submittedAt).toISOString(),
        declined: a.reviewedAt ? new Date(a.reviewedAt).toISOString() : '',
        reason: a.comments ?? '',
      }))
    )

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const name = displayName(deleteTarget.user)
    setDeletingId(deleteTarget.userId)
    try {
      await deleteUser({ userId: deleteTarget.userId })
      playSound('reject')
      toast.success(`${name} deleted`, { description: 'The account, profile and application were removed.' })
      setDeleteTarget(null)
    } catch (error) {
      setDeletingId(null)
      toast.error(`Could not delete ${name}`, {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
      throw error
    }
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Rehabify Physios"
        title="Declined applications"
        description="People whose applications were turned down, with the reason they were given."
        actions={
          <Button onClick={exportCsv} disabled={visible.length === 0} className={softButtonClass}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StaggerItem>
          <StatTile label="Physiotherapists" value={declined === undefined ? '—' : physioCount} icon={Stethoscope} tone="rose" />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Other applicants" value={declined === undefined ? '—' : rows.length - physioCount} icon={Users} />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Declined in the last 30 days" value={declined === undefined ? '—' : lastThirtyDays} icon={XCircle} tone="peach" />
        </StaggerItem>
      </Stagger>

      <Panel bodyClassName="pb-2">
        <div className="flex flex-col gap-3 px-5 pb-3 pt-4 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All', count: rows.length },
              { value: 'physiotherapist', label: 'Physiotherapists', count: physioCount },
              { value: 'other', label: 'Others', count: rows.length - physioCount },
            ]}
          />
          <div className="relative w-full lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email or reason"
              className={cn(inputClass, 'h-10 pl-9')}
              aria-label="Search declined applications"
            />
          </div>
        </div>

        {declined === undefined ? (
          <div className="space-y-2 px-5 pb-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl dark:bg-white/[0.06]" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<AlertCircle />}
            title={rows.length === 0 ? 'No declined applications' : 'Nothing matches'}
            description={rows.length === 0 ? 'Applications you decline will show up here.' : 'Try another search or filter.'}
          />
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            <AnimatePresence initial={false}>
              {visible.map((a) => {
                const name = displayName(a.user)
                const busy = deletingId === a.userId
                return (
                  <motion.li
                    key={a._id}
                    layout={!reduceMotion}
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -48, transition: { duration: 0.25 } }}
                    transition={{ duration: 0.2 }}
                    className={cn('px-5 py-4', busy && 'pointer-events-none opacity-60')}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <UserAvatar user={a.user} className="h-11 w-11" />
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/dashboard/admin/users/${a.userId}`}
                              className="truncate text-[15px] font-semibold text-rh-night hover:underline dark:text-white"
                            >
                              {name}
                            </Link>
                            <RoleBadge role={a.user?.role} />
                            {a.reviewedAt && (
                              <StatusBadge tone="red" className="gap-1">
                                <XCircle className="h-3 w-3" />
                                Declined {format(a.reviewedAt, 'd MMM yyyy')}
                              </StatusBadge>
                            )}
                          </div>
                          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                            {a.user?.email && <span className="truncate">{a.user.email}</span>}
                            {a.user?.phoneNumber && (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {a.user.phoneNumber}
                              </span>
                            )}
                            <span>Applied {format(a.submittedAt, 'd MMM yyyy')}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 lg:w-[420px] lg:shrink-0">
                        <div className="rounded-xl bg-rh-blush p-3 text-sm text-[#be123c] dark:bg-rose-400/10 dark:text-rose-300">
                          <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider opacity-80">Reason given</p>
                          <p className="whitespace-pre-wrap leading-relaxed">{a.comments?.trim() || 'No reason recorded.'}</p>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <Button asChild size="sm" className={softButtonClass}>
                            <Link href={`/dashboard/admin/users/${a.userId}`}>
                              <Eye className="mr-1.5 h-4 w-4" />
                              View profile
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteTarget(a)}
                            disabled={busy}
                            className="rounded-xl text-rose-600 hover:bg-rh-blush hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-400/10"
                          >
                            <Trash2 className="mr-1.5 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        )}
      </Panel>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete ${displayName(deleteTarget?.user)}?`}
        description="This permanently removes the account, its profile and this declined application. It cannot be undone."
        confirmLabel="Delete user"
        destructive
        onConfirm={confirmDelete}
      />
    </AdminPage>
  )
}
