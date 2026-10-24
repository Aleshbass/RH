'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { formatDistanceToNow } from 'date-fns'
import { Check, Loader2, Megaphone, Send } from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  AdminPage,
  ConfirmDialog,
  EmptyState,
  FilterChips,
  PageHeader,
  Panel,
  StatusBadge,
  inputClass,
  primaryButtonClass,
  softButtonClass,
} from '@/components/admin/ui'
import { formatCount, roleLabel, type RoleCountsResult } from '@/components/admin/activityMeta'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type Priority = 'low' | 'medium' | 'high'

/** A platformAnnouncements row (convex/schema.ts), as returned by api.admin.getAnnouncements. */
type AnnouncementRow = {
  _id: string
  title: string
  message: string
  priority: Priority
  targetRoles: string[]
  status: 'sending' | 'sent' | 'failed'
  recipientCount: number
  createdByName: string
  createdAt: number
}

const AUDIENCES = ['patient', 'physiotherapist', 'clinic_owner', 'clinic_staff', 'doctor', 'partner', 'admin'] as const
type Audience = (typeof AUDIENCES)[number]

const AUDIENCE_LABEL: Record<string, string> = {
  patient: 'Patients',
  physiotherapist: 'Physiotherapists',
  clinic_owner: 'Clinic owners',
  clinic_staff: 'Clinic staff',
  doctor: 'Doctors',
  partner: 'Partners',
  admin: 'Admins',
}
const audienceLabel = (role: string) => AUDIENCE_LABEL[role] ?? roleLabel(role)

const MAX_TITLE = 120
const MAX_MESSAGE = 1000

const PRIORITY_TONE = { low: 'neutral', medium: 'teal', high: 'amber' } as const

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error && typeof (error as { data: unknown }).data === 'string') {
    return (error as { data: string }).data
  }
  return error instanceof Error ? error.message : 'Something went wrong'
}

export function AnnouncementSystem() {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [audience, setAudience] = useState<Audience[]>([])
  const [priority, setPriority] = useState<Priority>('medium')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const broadcast = useMutation(api.admin.broadcastAnnouncement)
  const history = useQuery(api.admin.getAnnouncements, { limit: 20 }) as { items: AnnouncementRow[]; hasMore: boolean } | undefined
  const roles = useQuery(api.admin.getUserRoleCounts) as RoleCountsResult | undefined

  const toggle = (role: Audience) =>
    setAudience((current) => (current.includes(role) ? current.filter((r) => r !== role) : [...current, role]))

  const reach = roles
    ? audience.reduce(
        (acc, role) => {
          const c = roles.byRole[role]
          return { count: acc.count + (c?.count ?? 0), capped: acc.capped || !!c?.capped }
        },
        { count: 0, capped: false }
      )
    : undefined

  const titleTooLong = title.trim().length > MAX_TITLE
  const messageTooLong = message.trim().length > MAX_MESSAGE
  const canSend = title.trim() && message.trim() && audience.length > 0 && !titleTooLong && !messageTooLong

  const reset = () => {
    setTitle('')
    setMessage('')
    setAudience([])
    setPriority('medium')
  }

  const send = async () => {
    try {
      await broadcast({ title: title.trim(), message: message.trim(), targetRoles: audience, priority })
      playSound('success')
      toast.success('Announcement on its way', {
        description: 'It’s being delivered in the background. Progress shows under Sent.',
      })
      reset()
    } catch (error) {
      playSound('error')
      toast.error('Could not send the announcement', { description: errorMessage(error) })
    }
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Platform"
        title="Announcements"
        description="Send an in-app notification to groups of users. No email or push is sent."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="New announcement" className="lg:col-span-2" bodyClassName="space-y-5 px-5 pb-5 pt-3">
          <div className="space-y-1.5">
            <Label htmlFor="announcement-title" className="text-sm font-medium text-rh-ink dark:text-white">
              Title
            </Label>
            <Input
              id="announcement-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. New booking hours over the holidays"
              className={cn(inputClass, titleTooLong && 'border-rose-400 dark:border-rose-400')}
            />
            <p className={cn('text-xs', titleTooLong ? 'text-rose-600 dark:text-rose-300' : 'text-neutral-500 dark:text-neutral-400')}>
              {title.trim().length}/{MAX_TITLE}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="announcement-message" className="text-sm font-medium text-rh-ink dark:text-white">
              Message
            </Label>
            <Textarea
              id="announcement-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What do people need to know?"
              rows={5}
              className={cn(inputClass, messageTooLong && 'border-rose-400 dark:border-rose-400')}
            />
            <p className={cn('text-xs', messageTooLong ? 'text-rose-600 dark:text-rose-300' : 'text-neutral-500 dark:text-neutral-400')}>
              {message.trim().length}/{MAX_MESSAGE}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-rh-ink dark:text-white">Who should get it</p>
            <div className="flex flex-wrap gap-2">
              {AUDIENCES.map((role) => {
                const active = audience.includes(role)
                const c = roles?.byRole[role]
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggle(role)}
                    aria-pressed={active}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition',
                      active
                        ? 'border-rh-lime bg-rh-honeydew text-rh-ink dark:border-rh-lime dark:bg-white/[0.06] dark:text-rh-lime'
                        : 'border-black/10 bg-white text-neutral-600 hover:border-rh-lime/40 dark:border-white/10 dark:bg-rh-ink-3 dark:text-neutral-300'
                    )}
                  >
                    {active && <Check className="h-3.5 w-3.5" />}
                    {audienceLabel(role)}
                    {c && <span className="text-xs tabular-nums opacity-60">{formatCount(c)}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-rh-ink dark:text-white">Priority</p>
            <FilterChips<Priority>
              value={priority}
              onChange={setPriority}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Normal' },
                { value: 'high', label: 'High' },
              ]}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.04] pt-4 dark:border-white/[0.06]">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {audience.length === 0
                ? 'Choose at least one group.'
                : reach
                  ? `Reaches about ${formatCount(reach)} account${reach.count === 1 ? '' : 's'} (suspended staff are skipped).`
                  : 'Counting recipients…'}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className={softButtonClass} onClick={reset} disabled={!title && !message && audience.length === 0}>
                Clear
              </Button>
              <Button size="sm" className={primaryButtonClass} onClick={() => setConfirmOpen(true)} disabled={!canSend}>
                <Send className="mr-1.5 h-4 w-4" /> Send announcement
              </Button>
            </div>
          </div>
        </Panel>

        <Panel title="Preview" description="How it appears in the notification centre" bodyClassName="px-5 pb-5 pt-3">
          {title || message ? (
            <div className="rounded-xl border border-black/[0.06] bg-rh-canvas p-4 dark:border-white/[0.06] dark:bg-rh-ink-3">
              <div className="flex items-start justify-between gap-2">
                <p className="break-words text-sm font-semibold text-rh-ink dark:text-white">{title || 'Announcement title'}</p>
                <StatusBadge tone={PRIORITY_TONE[priority]}>{priority === 'medium' ? 'normal' : priority}</StatusBadge>
              </div>
              <p className="mt-1 whitespace-pre-line break-words text-sm text-neutral-600 dark:text-neutral-300">
                {message || 'Your message will appear here.'}
              </p>
              <p className="mt-3 text-xs text-neutral-400">Just now · Announcement</p>
            </div>
          ) : (
            <EmptyState icon={<Megaphone />} title="Nothing to preview yet" description="Start writing and the preview appears here." />
          )}
        </Panel>
      </div>

      <Panel title="Sent" description="The 20 most recent announcements" bodyClassName="pb-2 pt-1">
        {!history ? (
          <div className="space-y-2 px-5 py-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : history.items.length === 0 ? (
          <EmptyState icon={<Megaphone />} title="No announcements yet" description="Announcements you send appear here with their delivery progress." />
        ) : (
          <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
            {history.items.map((a) => (
              <li key={a._id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-rh-ink dark:text-white">{a.title}</p>
                    <p className="mt-0.5 line-clamp-2 break-words text-sm text-neutral-600 dark:text-neutral-300">{a.message}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <StatusBadge tone={PRIORITY_TONE[a.priority]}>{a.priority === 'medium' ? 'normal' : a.priority}</StatusBadge>
                    {a.status === 'sending' ? (
                      <StatusBadge tone="amber">
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Sending · {a.recipientCount.toLocaleString()}
                      </StatusBadge>
                    ) : a.status === 'sent' ? (
                      <StatusBadge tone="green">Sent to {a.recipientCount.toLocaleString()}</StatusBadge>
                    ) : (
                      <StatusBadge tone="red">Failed</StatusBadge>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  {a.targetRoles.map(audienceLabel).join(', ')} · by {a.createdByName} ·{' '}
                  {formatDistanceToNow(a.createdAt, { addSuffix: true })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Send this announcement?"
        description={
          reach
            ? `It goes to ${audience.map((r) => audienceLabel(r).toLowerCase()).join(', ')}: about ${formatCount(reach)} people. It can’t be recalled once sent.`
            : 'It can’t be recalled once sent.'
        }
        confirmLabel="Send now"
        onConfirm={send}
      />
    </AdminPage>
  )
}
