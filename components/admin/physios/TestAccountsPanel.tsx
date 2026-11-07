'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog, Panel, StatusBadge, dangerButtonClass } from '@/components/admin/ui'
import { errorMessage } from '@/components/partners/portal/shared'
import type { Id } from '@/convex/_generated/dataModel'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type Candidate = {
  userId: Id<'users'>
  name: string
  email: string | null
  role: string
  rehabifyId: string | null
  joinedAt: number
  onMarketplace: boolean
  livePayments: number
  reasons: string[]
}

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const listRef = makeFunctionReference<'query', Record<string, never>, Candidate[]>('adminCleanup:listTestCandidates')
const deleteRef = makeFunctionReference<
  'mutation',
  { userIds: Id<'users'>[] },
  { deleted: string[]; skipped: { name: string; reason: string }[] }
>('adminCleanup:deleteTestAccounts')

const ROLE_LABEL: Record<string, string> = { physiotherapist: 'Physio', patient: 'Patient', family_member: 'Family', doctor: 'Doctor' }

/**
 * Accounts that look like tests, to clear before launch. Nothing is ticked until an admin ticks
 * it, and nothing is deleted until they confirm. Accounts with real payments can't be deleted.
 */
export function TestAccountsPanel() {
  const rows = useQuery(listRef, {})
  const remove = useMutation(deleteRef)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)

  const deletable = useMemo(() => (rows ?? []).filter((r) => r.livePayments === 0), [rows])
  const chosen = (rows ?? []).filter((r) => picked.has(r.userId))
  if (!rows || rows.length === 0) return null

  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const run = async () => {
    try {
      const res = await remove({ userIds: chosen.map((r) => r.userId) })
      playSound('success')
      toast.success(`Deleted ${res.deleted.length} test account${res.deleted.length === 1 ? '' : 's'}`)
      if (res.skipped.length) toast.message(`Kept ${res.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}`)
      setPicked(new Set())
    } catch (error) {
      toast.error(errorMessage(error, "Couldn’t delete those accounts. Please try again."))
      throw error
    }
  }

  return (
    <Panel
      title={`Test accounts (${rows.length})`}
      description="Accounts whose name or email looks like a test. Tick the ones to remove before launch, then delete. Real people named like a test are never ticked for you."
      actions={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPicked(picked.size === deletable.length ? new Set() : new Set(deletable.map((r) => r.userId)))}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-rh-ink hover:bg-rh-canvas dark:text-white dark:hover:bg-white/[0.06]"
          >
            {picked.size === deletable.length ? 'Untick all' : 'Tick all'}
          </button>
          <button type="button" disabled={chosen.length === 0} onClick={() => setConfirming(true)} className={cn(dangerButtonClass, 'h-9 px-3 text-xs')}>
            Delete {chosen.length || ''} selected
          </button>
        </div>
      }
    >
      <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
        {rows.map((r) => {
          const locked = r.livePayments > 0
          return (
            <li key={r.userId} className="flex items-start gap-3 px-5 py-3">
              <Checkbox
                checked={picked.has(r.userId)}
                disabled={locked}
                onCheckedChange={(on) => toggle(r.userId, on === true)}
                aria-label={`Select ${r.name}`}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-rh-ink dark:text-white">
                  {r.name}
                  <StatusBadge tone="neutral">{ROLE_LABEL[r.role] ?? r.role}</StatusBadge>
                  {r.onMarketplace && <StatusBadge tone="red">On Find a Physio</StatusBadge>}
                  {locked && <StatusBadge tone="amber">Has real payments, can&apos;t delete</StatusBadge>}
                </p>
                <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {[r.email, r.rehabifyId, `joined ${format(r.joinedAt, 'd MMM yyyy')}`].filter(Boolean).join(' · ')}
                </p>
                <p className="text-xs text-[#b4690e] dark:text-amber-300">{r.reasons.join(' · ')}</p>
              </div>
            </li>
          )
        })}
      </ul>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        destructive
        title={`Delete ${chosen.length} account${chosen.length === 1 ? '' : 's'} for good?`}
        description={`This removes ${chosen.map((r) => r.name).join(', ')}: their profile, approval and patient links. It can't be undone. Their sign-in stays, so if they sign in again they start as a new, empty account.`}
        confirmLabel="Delete for good"
        onConfirm={run}
      />
    </Panel>
  )
}
