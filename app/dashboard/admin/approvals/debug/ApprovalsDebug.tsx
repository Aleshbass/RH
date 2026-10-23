'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useAction, useMutation, useQuery } from 'convex/react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Mail, Trash2, UserX } from '@/components/icons'

import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AdminPage,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Panel,
  StatTile,
  StatusBadge,
  inputClass,
  primaryButtonClass,
  softButtonClass,
  tableWrapClass,
} from '@/components/admin/ui'
import { displayName } from '@/components/dashboard/admin/UserManagement'
import { playSound } from '@/lib/sounds'

type DebugRecord = {
  _id: Id<'accountApprovalStatus'>
  userId: Id<'users'>
  status: string
  submittedAt: number
  reviewedAt?: number
  comments?: string
  user: { _id: Id<'users'>; firstName?: string; lastName?: string; email?: string; role?: string } | null
}

type CleanupResult = { deletedCount: number; scanned: number; isDone: boolean; continueCursor: string }
type TestEmailResult = { success: boolean; testEmail: string; messageId?: string; error?: string; message: string }

const MAX_CLEANUP_BATCHES = 50

function statusTone(status: string) {
  if (status === 'approved') return 'green' as const
  if (status === 'declined') return 'red' as const
  return 'amber' as const
}

export function ApprovalsDebug() {
  const records = useQuery(api.users.debugApprovalStatus) as DebugRecord[] | undefined
  const cleanupOrphanedApprovals = useMutation(api.users.cleanupOrphanedApprovals)
  const testNotificationEmail = useAction(api.users.testNotificationEmail)

  const [cleanupOpen, setCleanupOpen] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [lastEmail, setLastEmail] = useState<TestEmailResult | null>(null)

  const stats = useMemo(() => {
    const rows = records ?? []
    return {
      total: rows.length,
      orphaned: rows.filter((r) => r.user === null).length,
      orphanedPending: rows.filter((r) => r.user === null && r.status === 'pending_review').length,
      pending: rows.filter((r) => r.status === 'pending_review').length,
    }
  }, [records])

  const runCleanup = async () => {
    let cursor: string | null = null
    let deleted = 0
    let scanned = 0
    try {
      for (let i = 0; i < MAX_CLEANUP_BATCHES; i++) {
        const result = (await cleanupOrphanedApprovals({ cursor })) as unknown as CleanupResult
        deleted += result.deletedCount
        scanned += result.scanned
        if (result.isDone) break
        cursor = result.continueCursor
      }
      playSound('success')
      toast.success(deleted > 0 ? `Removed ${deleted} orphaned record${deleted === 1 ? '' : 's'}` : 'No orphaned records found', {
        description: `Scanned ${scanned} approval records.`,
      })
    } catch (error) {
      toast.error('Cleanup failed', { description: error instanceof Error ? error.message : 'Please try again.' })
      throw error
    }
  }

  const sendTest = async () => {
    setSending(true)
    try {
      const result = (await testNotificationEmail({ testEmail: testEmail.trim() || undefined })) as TestEmailResult
      setLastEmail(result)
      if (result.success) {
        playSound('success')
        toast.success('Test email sent', { description: result.message })
      } else {
        playSound('error')
        toast.error('Test email failed', { description: result.message })
      }
    } catch (error) {
      playSound('error')
      toast.error('Test email failed', { description: error instanceof Error ? error.message : 'Please try again.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow={
          <Link href="/dashboard/admin/approvals" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="h-3 w-3" />
            Approvals
          </Link>
        }
        title="Approvals debug"
        description="Developer tools for the approval workflow. Only visible in development or with NEXT_PUBLIC_ADMIN_DEV_TOOLS=true."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Records (newest 300)" value={records === undefined ? '—' : stats.total} />
        <StatTile label="Pending review" value={records === undefined ? '—' : stats.pending} tone="peach" />
        <StatTile
          label="Orphaned"
          value={records === undefined ? '—' : stats.orphaned}
          hint="Approval records whose user was deleted"
          tone={stats.orphaned > 0 ? 'attention' : 'teal'}
        />
        <StatTile label="Orphaned and pending" value={records === undefined ? '—' : stats.orphanedPending} tone="rose" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Orphaned records" description="Deletes approval records that point at users who no longer exist." bodyClassName="p-5 pt-3">
          <Button onClick={() => setCleanupOpen(true)} className={softButtonClass}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clean up orphaned records
          </Button>
        </Panel>

        <Panel
          title="Test approval email"
          description="Sends the real account-approved email through Resend. Leave blank to send it to yourself."
          bodyClassName="space-y-3 p-5 pt-3"
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
              aria-label="Test recipient"
            />
            <Button onClick={sendTest} disabled={sending} className={primaryButtonClass}>
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Send test
            </Button>
          </div>
          {lastEmail && (
            <p className="text-xs text-neutral-600 dark:text-neutral-300">
              <StatusBadge tone={lastEmail.success ? 'green' : 'red'} className="mr-2">
                {lastEmail.success ? 'Sent' : 'Failed'}
              </StatusBadge>
              {lastEmail.message}
            </p>
          )}
        </Panel>
      </div>

      <Panel title="Approval records" description="Newest 300 records with their linked user." bodyClassName="pb-2">
        {records === undefined ? (
          <div className="space-y-2 px-5 pb-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-xl dark:bg-white/[0.06]" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <EmptyState icon={<UserX />} title="No approval records" />
        ) : (
          <div className={tableWrapClass}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-5 py-2.5 text-left">User</th>
                  <th className="px-3 py-2.5 text-left">Status</th>
                  <th className="px-3 py-2.5 text-left">Submitted</th>
                  <th className="px-3 py-2.5 text-left">Reviewed</th>
                  <th className="px-5 py-2.5 text-left">Record ID</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r._id} className="border-b">
                    <td className="px-5 py-2.5">
                      {r.user ? (
                        <Link href={`/dashboard/admin/users/${r.user._id}`} className="hover:underline">
                          <span className="font-medium text-rh-night dark:text-white">{displayName(r.user)}</span>
                          <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">{r.user.role ?? 'no role'}</span>
                        </Link>
                      ) : (
                        <StatusBadge tone="red">Orphaned · {r.userId}</StatusBadge>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge tone={statusTone(r.status)}>{r.status.replace('_', ' ')}</StatusBadge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-neutral-500 dark:text-neutral-400">
                      {format(r.submittedAt, 'd MMM yyyy, HH:mm')}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-neutral-500 dark:text-neutral-400">
                      {r.reviewedAt ? format(r.reviewedAt, 'd MMM yyyy, HH:mm') : '—'}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs text-neutral-500 dark:text-neutral-400">{r._id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={cleanupOpen}
        onOpenChange={setCleanupOpen}
        title="Delete orphaned approval records?"
        description="Scans every approval record in batches and deletes the ones whose user no longer exists. Records for existing users are untouched."
        confirmLabel="Clean up"
        destructive
        onConfirm={runCleanup}
      />
    </AdminPage>
  )
}
