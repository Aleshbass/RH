'use client'

/**
 * Learn super admins (Mary 2026-11-14): platform admins add people who run the Learn community:
 * groups, posts, Spaces, simulations and the leaderboard. Courses, the MSK program and
 * certificates stay with platform admins (owner 2026-11-17).
 * It's a flag on top of their account, so a physio stays a physio.
 */
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { GraduationCap, Loader2, Mail, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog, EmptyState, Panel, inputClass, primaryButtonClass } from '@/components/admin/ui'
import { roleMeta } from '@/components/dashboard/admin/UserManagement'
import {
  learnAdminAddRef,
  learnAdminCancelInviteRef,
  learnAdminListRef,
  learnAdminPendingRef,
  learnAdminRemoveRef,
  type LearnAdminRow,
} from '@/lib/learnAdminsApi'
import { cn } from '@/lib/utils'

const message = (e: unknown) => {
  const data = (e as { data?: unknown })?.data
  return typeof data === 'string' ? data : 'Something went wrong. Try again.'
}

export function LearnSuperAdmins() {
  const rows = useQuery(learnAdminListRef, {})
  const add = useMutation(learnAdminAddRef)
  const remove = useMutation(learnAdminRemoveRef)
  const pending = useQuery(learnAdminPendingRef, {})
  const cancelInvite = useMutation(learnAdminCancelInviteRef)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<LearnAdminRow | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    try {
      const res = await add({ email: email.trim() })
      toast.success(
        res.pending
          ? `${res.name} has no account yet. They'll become a super admin when they sign up with this email.`
          : res.already
            ? `${res.name} is already a Learn super admin.`
            : `${res.name} is now a Learn super admin.`
      )
      setEmail('')
    } catch (err) {
      toast.error(message(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      title="Learn super admins"
      description="They run the Learn community: groups, posts (including deleting anyone's), Spaces, simulations and the leaderboard. Not courses, the MSK program or certificates, and nothing else on the platform. Their own account type stays the same."
      bodyClassName="p-0"
    >
      <form onSubmit={submit} className="flex flex-col gap-2 px-5 pb-4 pt-3 sm:flex-row">
        <div className="relative flex-1">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Their email (an account now, or when they sign up)"
            className={cn(inputClass, 'pl-9')}
            aria-label="Email of the person to make a Learn super admin"
            inputMode="email"
            autoComplete="off"
          />
        </div>
        <Button type="submit" className={primaryButtonClass} disabled={busy || !email.trim()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GraduationCap className="mr-2 h-4 w-4" />}
          Make super admin
        </Button>
      </form>

      {rows === undefined ? (
        <div className="flex justify-center border-t border-black/[0.05] py-8 dark:border-white/[0.06]">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="border-t border-black/[0.05] dark:border-white/[0.06]">
          <EmptyState icon={<GraduationCap />} title="No Learn super admins yet" description="Add their email. Without an account yet, they become a super admin when they sign up." />
        </div>
      ) : (
        <ul className="divide-y divide-black/[0.05] border-t border-black/[0.05] dark:divide-white/[0.06] dark:border-white/[0.06]">
          {rows.map((r) => (
            <li key={r.userId} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-rh-ink dark:text-white">{r.name}</p>
                <p className="truncate text-xs text-neutral-500">
                  {[r.email, r.role ? roleMeta(r.role).label : null, `added by ${r.addedBy} ${formatDistanceToNow(r.addedAt, { addSuffix: true })}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 shrink-0 rounded-xl p-0 text-neutral-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                aria-label={`Remove ${r.name} as a Learn super admin`}
                onClick={() => setRemoving(r)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {pending && pending.length > 0 && (
        <div className="border-t border-black/[0.05] dark:border-white/[0.06]">
          <p className="px-5 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Waiting to sign up · {pending.length}</p>
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {pending.map((p) => (
              <li key={p.email} className="flex items-center gap-3 px-5 py-2.5">
                <p className="min-w-0 flex-1 truncate text-sm text-neutral-600 dark:text-neutral-300">
                  {p.email} <span className="text-xs text-neutral-400">· added {formatDistanceToNow(p.createdAt, { addSuffix: true })}</span>
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 rounded-lg px-2 text-xs text-neutral-500 hover:text-rose-600"
                  onClick={async () => {
                    try {
                      await cancelInvite({ email: p.email })
                      toast.success(`${p.email} removed from the waiting list.`)
                    } catch (err) {
                      toast.error(message(err))
                    }
                  }}
                >
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing ? `Remove ${removing.name}?` : 'Remove?'}
        description="They lose Learn admin powers straight away. Their own account is unchanged."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (!removing) return
          try {
            await remove({ userId: removing.userId })
            toast.success(`${removing.name} is no longer a Learn super admin.`)
          } catch (err) {
            toast.error(message(err))
          } finally {
            setRemoving(null)
          }
        }}
      />
    </Panel>
  )
}
