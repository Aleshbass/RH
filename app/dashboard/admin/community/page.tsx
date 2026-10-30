'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Flag, Loader2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { AdminPage, EmptyState, PageHeader, Panel, StatusBadge, inputClass, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { communityRefs } from '@/components/community/refs'
import type { Id } from '@/convex/_generated/dataModel'
import { cn } from '@/lib/utils'

type ReportedTemplate = {
  _id: Id<'programTemplates'>
  title: string
  author: string
  reports: { reason: string; at: number }[]
  hidden: boolean
  items: number
}

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const templatesRef = makeFunctionReference<'query', Record<string, never>, ReportedTemplate[]>('exercisePrograms:adminReportedTemplates')
const hideTemplateRef = makeFunctionReference<'mutation', { templateId: Id<'programTemplates'>; hidden: boolean }, { ok: boolean }>(
  'exercisePrograms:adminSetTemplateHidden'
)

const errorText = (error: unknown, fallback: string) =>
  error instanceof ConvexError && typeof error.data === 'string' ? error.data : fallback

/**
 * Community and shared templates: reports to look at (three reports hide a post, answer or
 * template until someone here decides), and who the case leads and moderators are.
 */
export default function AdminCommunityPage() {
  const data = useQuery(communityRefs.adminOverview, {})
  const templates = useQuery(templatesRef, {})
  const moderate = useMutation(communityRefs.moderate)
  const hideTemplate = useMutation(hideTemplateRef)
  const setRole = useMutation(communityRefs.adminSetRole)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function run(key: string, action: () => Promise<unknown>, done: string) {
    setBusy(key)
    try {
      await action()
      toast.success(done)
    } catch (error) {
      toast.error(errorText(error, 'That didn’t work.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Rehabify Physios"
        title="Community"
        description="Case of the Week, questions and shared templates. Physios report anything that names a patient or is unsafe; three reports hide it until you decide."
      />

      <Panel title="Reports" description="Hide it, or dismiss the report and keep it up.">
        {data === undefined ? (
          <Skeleton className="m-6 h-20 rounded-2xl" />
        ) : !data || data.reports.length === 0 ? (
          <EmptyState icon={<Flag />} title="No open reports" />
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {data.reports.map((r) => (
              <li key={r._id} className="space-y-2 px-5 py-4 sm:px-6">
                <p className="text-xs text-neutral-500">
                  On <Link className="font-semibold text-rh-ink underline-offset-4 hover:underline dark:text-white" href={`/dashboard/physiotherapist/community/${r.postId}`}>{r.postTitle}</Link> ·{' '}
                  {r.answerId ? 'an answer' : 'the post'} · reported by {r.by} · {format(r.at, 'd MMM, HH:mm')}
                  {r.hidden && <StatusBadge tone="red" className="ml-2">Hidden now</StatusBadge>}
                </p>
                <p className="rounded-xl bg-rh-canvas px-3 py-2 text-sm text-rh-ink dark:bg-white/[0.04] dark:text-white">{r.text}</p>
                <p className="text-xs text-neutral-500">Reason: {r.reason}</p>
                <div className="flex gap-2">
                  <Button size="sm" className={cn(primaryButtonClass, 'h-8')} disabled={busy === r._id} onClick={() => void run(r._id, () => moderate({ postId: r.postId, answerId: r.answerId ?? undefined, hidden: true }), 'Hidden')}>
                    Hide
                  </Button>
                  <Button size="sm" className={cn(softButtonClass, 'h-8')} disabled={busy === r._id} onClick={() => void run(r._id, () => moderate({ postId: r.postId, answerId: r.answerId ?? undefined, hidden: false }), 'Kept up')}>
                    Keep it up
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Reported templates" description="Public programme templates other physios flagged.">
        {templates === undefined ? (
          <Skeleton className="m-6 h-16 rounded-2xl" />
        ) : templates.length === 0 ? (
          <p className="px-6 pb-6 pt-2 text-sm text-neutral-500">None.</p>
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {templates.map((t) => (
              <li key={t._id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-rh-ink dark:text-white">
                    {t.title} <span className="font-normal text-neutral-500">by {t.author} · {t.items} items</span>
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs text-neutral-500">
                    {t.reports.map((r, i) => (
                      <li key={i}>“{r.reason}” · {format(r.at, 'd MMM')}</li>
                    ))}
                  </ul>
                </div>
                <Button
                  size="sm"
                  className={cn(t.hidden ? softButtonClass : primaryButtonClass, 'h-8')}
                  disabled={busy === t._id}
                  onClick={() => void run(t._id, () => hideTemplate({ templateId: t._id, hidden: !t.hidden }), t.hidden ? 'Shown again, reports cleared' : 'Hidden from Community')}
                >
                  {t.hidden ? 'Show again' : 'Hide'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Case leads and moderators" description="Case leads publish the Case of the Week and mark helpful answers. Moderators hide posts.">
        <div className="grid gap-3 px-5 pb-4 pt-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end sm:px-6">
          <div className="space-y-1.5">
            <Label htmlFor="role-email">Physio’s email</Label>
            <Input id="role-email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </div>
          {(['lead', 'moderator', 'none'] as const).map((role) => (
            <Button
              key={role}
              className={cn(role === 'lead' ? primaryButtonClass : softButtonClass, 'h-10')}
              disabled={!email.trim() || busy === role}
              onClick={() => void run(role, () => setRole({ email, role }), role === 'none' ? 'Role removed' : `Now a ${role === 'lead' ? 'case lead' : 'moderator'}`)}
            >
              {busy === role ? <Loader2 className="h-4 w-4 animate-spin" /> : role === 'lead' ? 'Make case lead' : role === 'moderator' ? 'Make moderator' : 'Remove role'}
            </Button>
          ))}
        </div>
        {data?.roles.length ? (
          <ul className="divide-y divide-black/[0.05] border-t border-black/[0.05] dark:divide-white/[0.06] dark:border-white/[0.06]">
            {data.roles.map((r) => (
              <li key={r._id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm sm:px-6">
                <span className="text-rh-ink dark:text-white">
                  {r.name} <span className="text-neutral-500">{r.email}</span>
                </span>
                <StatusBadge tone={r.role === 'lead' ? 'green' : 'neutral'}>{r.role === 'lead' ? 'Case lead' : 'Moderator'}</StatusBadge>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </AdminPage>
  )
}
