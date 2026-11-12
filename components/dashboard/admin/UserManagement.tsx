'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState, type ComponentType } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  Building2,
  Crown,
  Download,
  Eye,
  HeartHandshake,
  Loader2,
  MoreHorizontal,
  Search,
  Shield,
  Stethoscope,
  Trash2,
  User,
  UserCog,
  UserRound,
  Users,
  Briefcase,
  Handshake,
  HelpCircle,
  Newspaper,
  GraduationCap,
} from '@/components/icons'

import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
  primaryButtonClass,
  softButtonClass,
  tableWrapClass,
} from '@/components/admin/ui'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { RehabifyId } from '@/components/shared/RehabifyId'
import { parseRehabifyId } from '@/convex/helpers/rehabifyIdFormat'

// ─── Shared helpers (also used by the user detail, approvals and declined pages) ─────────

type BadgeTone = 'neutral' | 'teal' | 'green' | 'amber' | 'red'

export const ROLE_META: Record<
  string,
  { label: string; plural: string; icon: ComponentType<{ className?: string }>; tone: BadgeTone }
> = {
  physiotherapist: { label: 'Physiotherapist', plural: 'Physiotherapists', icon: Stethoscope, tone: 'teal' },
  patient: { label: 'Patient', plural: 'Patients', icon: UserRound, tone: 'neutral' },
  clinic_owner: { label: 'Clinic owner', plural: 'Clinic owners', icon: Building2, tone: 'green' },
  clinic_staff: { label: 'Clinic staff', plural: 'Clinic staff', icon: Briefcase, tone: 'green' },
  doctor: { label: 'Doctor', plural: 'Doctors', icon: Stethoscope, tone: 'teal' },
  family_member: { label: 'Family member', plural: 'Family members', icon: HeartHandshake, tone: 'neutral' },
  partner: { label: 'Partner', plural: 'Partners', icon: Handshake, tone: 'amber' },
  admin: { label: 'Administrator', plural: 'Administrators', icon: Shield, tone: 'red' },
  blog_editor: { label: 'Blog writer', plural: 'Blog writers', icon: Newspaper, tone: 'amber' },
  learn_instructor: { label: 'Learn instructor', plural: 'Learn instructors', icon: GraduationCap, tone: 'amber' },
  none: { label: 'No role yet', plural: 'No role yet', icon: HelpCircle, tone: 'neutral' },
}

export function roleMeta(role?: string | null) {
  return ROLE_META[role || 'none'] ?? { label: role ?? 'Unknown', plural: role ?? 'Unknown', icon: User, tone: 'neutral' as BadgeTone }
}

export function RoleBadge({ role }: { role?: string | null }) {
  const meta = roleMeta(role)
  const Icon = meta.icon
  return (
    <StatusBadge tone={meta.tone} className="gap-1">
      <Icon className="h-3 w-3" />
      {meta.label}
    </StatusBadge>
  )
}

export function displayName(u: { firstName?: string; lastName?: string; email?: string } | null | undefined) {
  if (!u) return 'Unknown user'
  return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || 'Unnamed user'
}

export function UserAvatar({
  user,
  className,
}: {
  user: { firstName?: string; lastName?: string; email?: string; imageUrl?: string | null } | null | undefined
  className?: string
}) {
  const initial = (user?.firstName?.charAt(0) || user?.email?.charAt(0) || 'U').toUpperCase()
  return (
    <Avatar className={cn('h-9 w-9', className)}>
      {user?.imageUrl ? <AvatarImage src={user.imageUrl} alt="" className="object-cover" /> : null}
      <AvatarFallback className="bg-rh-honeydew text-xs font-semibold text-rh-ink dark:bg-white/[0.06] dark:text-rh-lime">
        {initial}
      </AvatarFallback>
    </Avatar>
  )
}

/** Roles an admin can assign with users.setUserRole. */
export const ASSIGNABLE_ROLES = ['patient', 'physiotherapist', 'clinic_owner', 'family_member', 'blog_editor', 'learn_instructor', 'admin'] as const
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

/**
 * Change-role dialog shared by the users list and the user detail page.
 * Plays 'success' on change and 'error' on failure.
 */
export function RoleChangeDialog({
  user,
  open,
  onOpenChange,
}: {
  user: { _id: Id<'users'>; firstName?: string; lastName?: string; email?: string; imageUrl?: string; role?: string } | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const setUserRole = useMutation(api.users.setUserRole)
  const [selected, setSelected] = useState<AssignableRole>('patient')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && user) {
      setSelected((ASSIGNABLE_ROLES as readonly string[]).includes(user.role ?? '') ? (user.role as AssignableRole) : 'patient')
    }
  }, [open, user])

  const save = async () => {
    if (!user) return
    if (selected === user.role) {
      onOpenChange(false)
      return
    }
    setSaving(true)
    try {
      await setUserRole({ userId: user._id, role: selected })
      playSound('success')
      toast.success(`${displayName(user)} is now ${roleMeta(selected).label.toLowerCase()}`)
      onOpenChange(false)
    } catch (error) {
      playSound('error')
      toast.error('Could not change the role', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="rounded-2xl sm:max-w-md dark:border-white/10 dark:bg-rh-ink-2">
        <DialogHeader>
          <DialogTitle className="dark:text-white">Change role</DialogTitle>
          <DialogDescription>Roles decide which dashboard a person lands on and what they can see.</DialogDescription>
        </DialogHeader>

        {user && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 rounded-xl bg-rh-canvas p-3 dark:bg-white/[0.04]">
              <UserAvatar user={user} className="h-10 w-10" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-rh-ink dark:text-white">{displayName(user)}</p>
                <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{user.email}</p>
              </div>
              <div className="ml-auto">
                <RoleBadge role={user.role} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">New role</label>
              <Select value={selected} onValueChange={(v) => setSelected(v as AssignableRole)}>
                <SelectTrigger className={inputClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:border-white/10 dark:bg-rh-ink-2">
                  {ASSIGNABLE_ROLES.map((role) => {
                    const meta = roleMeta(role)
                    const Icon = meta.icon
                    return (
                      <SelectItem key={role} value={role}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {meta.label}
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            {selected === 'blog_editor' && user.role !== 'blog_editor' && (
              <div className="flex items-start gap-2 rounded-xl bg-rh-honeydew p-3 text-xs text-rh-ink dark:bg-white/[0.06] dark:text-white/80">
                <Newspaper className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Blog writers only see the blog in the admin console. They write posts and send them for review; an administrator publishes them.</p>
              </div>
            )}

            {selected === 'learn_instructor' && user.role !== 'learn_instructor' && (
              <div className="flex items-start gap-2 rounded-xl bg-rh-honeydew p-3 text-xs text-rh-ink dark:bg-white/[0.06] dark:text-white/80">
                <GraduationCap className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Learn instructors only see Rehabify Learn video courses. They build their own courses and send them for review; an administrator publishes them.</p>
              </div>
            )}

            {selected === 'admin' && user.role !== 'admin' && (
              <div className="flex items-start gap-2 rounded-xl bg-rh-peach p-3 text-xs text-[#b4690e] dark:bg-amber-400/10 dark:text-amber-300">
                <Crown className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Administrators get full access to the admin console, including payouts, approvals and every account.</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving} className="rounded-xl dark:text-white dark:hover:bg-white/[0.06]">
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !user || selected === user.role} className={primaryButtonClass}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function accountStatus(u: { approvalStatus?: string | null; status?: string; onboarded?: boolean }): {
  label: string
  tone: BadgeTone
} {
  if (u.status === 'suspended') return { label: 'Suspended', tone: 'red' }
  if (u.status === 'terminated') return { label: 'Terminated', tone: 'red' }
  if (u.approvalStatus === 'pending_review') return { label: 'Pending review', tone: 'amber' }
  if (u.approvalStatus === 'declined') return { label: 'Declined', tone: 'red' }
  if (u.approvalStatus === 'approved') return { label: 'Approved', tone: 'green' }
  return u.onboarded ? { label: 'Active', tone: 'teal' } : { label: 'Onboarding', tone: 'neutral' }
}

// ─── Users & roles page ──────────────────────────────────────────────────────────────

type RoleFilter =
  | 'all'
  | 'physiotherapist'
  | 'patient'
  | 'clinic_owner'
  | 'clinic_staff'
  | 'doctor'
  | 'family_member'
  | 'partner'
  | 'blog_editor'
  | 'learn_instructor'
  | 'admin'
  | 'none'

const ROLE_FILTERS: RoleFilter[] = [
  'all',
  'physiotherapist',
  'patient',
  'clinic_owner',
  'clinic_staff',
  'doctor',
  'family_member',
  'partner',
  'blog_editor',
  'learn_instructor',
  'admin',
  'none',
]

type UserRow = {
  _id: Id<'users'>
  _creationTime: number
  firstName?: string
  lastName?: string
  email?: string
  imageUrl?: string
  phoneNumber?: string
  role?: string
  onboarded: boolean
  status?: string
  lastLoginAt?: number
  patientNumber?: string
  staffNumber?: string
  approvalStatus: 'pending_review' | 'approved' | 'declined' | null
}

type RoleCounts = { counts: Record<string, number>; capped: string[]; cap: number }

const PAGE_SIZE = 25
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const usersApi = api.users

function headerFor(role: RoleFilter) {
  if (role === 'physiotherapist')
    return {
      eyebrow: 'Rehabify Physios',
      title: 'All physiotherapists',
      description: 'Every physiotherapist account, their approval state and when they joined.',
    }
  if (role === 'patient')
    return {
      eyebrow: 'Patients & Care',
      title: 'All patients',
      description: 'Patient accounts across the marketplace, clinics and partner referrals.',
    }
  return {
    eyebrow: 'Platform',
    title: 'Users & roles',
    description: 'Find any account, change what role it has, or remove it.',
  }
}

export function UserManagement() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const reduceMotion = useReducedMotion()

  const roleParam = searchParams?.get('role') ?? 'all'
  const role: RoleFilter = (ROLE_FILTERS as string[]).includes(roleParam) ? (roleParam as RoleFilter) : 'all'

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const [roleTarget, setRoleTarget] = useState<UserRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null)

  const me = useQuery(api.users.getMyUser)
  const roleCounts = (useQuery as any)(usersApi.adminUserRoleCounts) as RoleCounts | undefined
  const { results, status, loadMore } = (usePaginatedQuery as any)(
    usersApi.adminListUsers,
    { role: role === 'all' ? undefined : role, search: search || undefined },
    { initialNumItems: PAGE_SIZE }
  ) as { results: UserRow[]; status: 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted'; loadMore: (n: number) => void }

  const deleteUser = useMutation(api.users.adminDeleteUser)

  const setRole = (next: RoleFilter) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    if (next === 'all') params.delete('role')
    else params.set('role', next)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const countLabel = (key: string) => {
    if (!roleCounts) return undefined
    const n = roleCounts.counts[key] ?? 0
    return n
  }
  const countText = (key: string) => {
    if (!roleCounts) return '—'
    const n = roleCounts.counts[key] ?? 0
    return roleCounts.capped.includes(key) ? `${roleCounts.cap}+` : n.toLocaleString()
  }
  const totalText = useMemo(() => {
    if (!roleCounts) return '—'
    const total = Object.values(roleCounts.counts).reduce((s, n) => s + n, 0)
    return `${total.toLocaleString()}${roleCounts.capped.length ? '+' : ''}`
  }, [roleCounts])

  const chipOptions = ROLE_FILTERS.filter((r) => r === 'all' || r === role || (roleCounts?.counts[r] ?? 1) > 0).map((r) => ({
    value: r,
    label: r === 'all' ? 'All' : roleMeta(r).plural,
    count: r === 'all' ? undefined : countLabel(r),
  }))

  const header = headerFor(role)
  const searchingWithinPages = !!search && !EMAIL_RE.test(search) && !parseRehabifyId(search)

  const exportCsv = () => {
    if (results.length === 0) return
    downloadCsv(
      `rehabify-${role === 'all' ? 'users' : role}-${format(new Date(), 'yyyy-MM-dd')}`,
      results.map((u) => ({
        id: u._id,
        patientId: u.patientNumber ?? '',
        clinicianId: u.staffNumber ?? '',
        name: displayName(u),
        email: u.email ?? '',
        phone: u.phoneNumber ?? '',
        role: u.role ?? '',
        status: accountStatus(u).label,
        joined: new Date(u._creationTime).toISOString(),
        lastLogin: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : '',
      }))
    )
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteUser({ userId: deleteTarget._id })
      playSound('reject')
      toast.success(`${displayName(deleteTarget)} was deleted`, {
        description: 'Their account, profile and approval record were removed.',
      })
      setDeleteTarget(null)
    } catch (error) {
      toast.error('Could not delete this user', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
      throw error
    }
  }

  const isLoadingFirst = status === 'LoadingFirstPage'

  return (
    <AdminPage>
      <PageHeader
        eyebrow={header.eyebrow}
        title={header.title}
        description={header.description}
        actions={
          <Button onClick={exportCsv} disabled={results.length === 0} className={softButtonClass}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StaggerItem>
          <StatTile label="All accounts" value={totalText} icon={Users} href="/dashboard/admin/users" />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Physiotherapists"
            value={countText('physiotherapist')}
            icon={Stethoscope}
            href="/dashboard/admin/users?role=physiotherapist"
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Patients" value={countText('patient')} icon={UserRound} tone="mint" href="/dashboard/admin/users?role=patient" />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Clinic owners"
            value={countText('clinic_owner')}
            icon={Building2}
            tone="peach"
            href="/dashboard/admin/users?role=clinic_owner"
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Administrators" value={countText('admin')} icon={Shield} tone="rose" href="/dashboard/admin/users?role=admin" />
        </StaggerItem>
      </Stagger>

      <Panel bodyClassName="pb-2">
        <div className="space-y-3 px-5 pb-3 pt-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <FilterChips value={role} onChange={setRole} options={chipOptions} />
            <div className="relative w-full lg:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name, email, phone or ID"
                className={cn(inputClass, 'h-10 pl-9')}
                aria-label="Search users"
              />
            </div>
          </div>
          {searchingWithinPages && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Name and phone search looks through the accounts loaded so far. Type a full email address for an exact match,
              or load more to search further back.
            </p>
          )}
        </div>

        {isLoadingFirst ? (
          <div className="space-y-2 px-5 pb-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl dark:bg-white/[0.06]" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={search ? 'No matching accounts' : 'No accounts here yet'}
            description={
              search
                ? status === 'CanLoadMore'
                  ? 'Nothing in the accounts loaded so far. Load more to keep searching.'
                  : 'Try a different name or the full email address.'
                : 'Accounts with this role will show up here.'
            }
            action={
              search && status === 'CanLoadMore' ? (
                <Button onClick={() => loadMore(PAGE_SIZE * 2)} className={softButtonClass}>
                  Search further back
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className={tableWrapClass}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-5 py-2.5 text-left">User</th>
                  <th className="px-3 py-2.5 text-left">Role</th>
                  <th className="px-3 py-2.5 text-left">Status</th>
                  <th className="hidden px-3 py-2.5 text-left md:table-cell">Joined</th>
                  <th className="px-5 py-2.5 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {results.map((u) => {
                    const st = accountStatus(u)
                    const isMe = me?._id === u._id
                    return (
                      <motion.tr
                        key={u._id}
                        layout={!reduceMotion}
                        initial={reduceMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -16 }}
                        transition={{ duration: 0.2 }}
                        className="cursor-pointer border-b transition-colors"
                        onClick={() => router.push(`/dashboard/admin/users/${u._id}`)}
                      >
                        <td className="px-5 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <UserAvatar user={u} />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-rh-ink dark:text-white">
                                {displayName(u)}
                                {isMe && <span className="ml-1.5 text-xs font-normal text-neutral-400">(you)</span>}
                              </p>
                              <div className="flex min-w-0 items-center gap-1.5">
                                <RehabifyId value={u.patientNumber} />
                                <RehabifyId value={u.staffNumber} />
                                <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{u.email ?? 'No email'}</p>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <RoleBadge role={u.role} />
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-3 text-neutral-500 dark:text-neutral-400 md:table-cell">
                          {format(new Date(u._creationTime), 'd MMM yyyy')}
                        </td>
                        <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg dark:text-neutral-300 dark:hover:bg-white/[0.06]"
                                aria-label={`Actions for ${displayName(u)}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44 rounded-xl dark:border-white/10 dark:bg-rh-ink-2">
                              <DropdownMenuLabel className="truncate text-xs text-neutral-500">{displayName(u)}</DropdownMenuLabel>
                              <DropdownMenuSeparator className="dark:bg-white/10" />
                              <DropdownMenuItem asChild>
                                <Link href={`/dashboard/admin/users/${u._id}`}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  View
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setRoleTarget(u)}>
                                <UserCog className="mr-2 h-4 w-4" />
                                Change role
                              </DropdownMenuItem>
                              {!isMe && (
                                <>
                                  <DropdownMenuSeparator className="dark:bg-white/10" />
                                  <DropdownMenuItem
                                    onSelect={() => setDeleteTarget(u)}
                                    className="text-rose-600 focus:text-rose-600 dark:text-rose-300 dark:focus:text-rose-300"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </motion.tr>
                    )
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}

        {!isLoadingFirst && results.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs text-neutral-500 dark:text-neutral-400">
            <span>
              Showing {results.length.toLocaleString()} {results.length === 1 ? 'account' : 'accounts'}
              {status === 'Exhausted' ? '' : ' so far'}
            </span>
            {(status === 'CanLoadMore' || status === 'LoadingMore') && (
              <Button onClick={() => loadMore(PAGE_SIZE)} disabled={status === 'LoadingMore'} className={softButtonClass} size="sm">
                {status === 'LoadingMore' && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Load more
              </Button>
            )}
          </div>
        )}
      </Panel>

      <RoleChangeDialog user={roleTarget} open={!!roleTarget} onOpenChange={(o) => !o && setRoleTarget(null)} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete ${displayName(deleteTarget)}?`}
        description="This permanently removes the account, its patient/physio/clinic profile and any approval record. It cannot be undone."
        confirmLabel="Delete user"
        destructive
        onConfirm={confirmDelete}
      />
    </AdminPage>
  )
}
