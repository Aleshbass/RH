'use client'

/**
 * The group home (owner 2026-11-15), on a group's private room page: the lead's pinned note, the
 * group's upcoming Spaces, then tabs for Posts, Work (assignments with who has done them), the
 * group's own leaderboard and its people. Leads (and Learn admins) also get the invite link + QR.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import {
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  Copy,
  Crown,
  Flame,
  HeartPulse,
  Loader2,
  Megaphone,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
  WhatsApp,
} from '@/components/icons'
import { QrCode } from '@/components/shared/QrCode'
import type { Id } from '@/convex/_generated/dataModel'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { fieldClass, pillInk, pillLime, pillOutline } from '../shared'
import { formatPoints } from '../points/pointsApi'
import { simPath } from '../sims/simApi'
import { Avatar, EmptyState, Sheet, Skeleton } from './ui'
import { relativeTime, spacePath } from './socialApi'
import { coursePath, groupApi, type AssignmentKind, type GroupAssignment, type GroupPerson } from './groupApi'

type GroupId = Id<'learnGroups'>
type Tab = 'posts' | 'work' | 'board' | 'people'
const TABS: { id: Tab; label: string }[] = [
  { id: 'posts', label: 'Posts' },
  { id: 'work', label: 'Work' },
  { id: 'board', label: 'Leaderboard' },
  { id: 'people', label: 'People' },
]

const errorText = (err: unknown, fallback: string) => {
  const data = (err as { data?: unknown })?.data
  return typeof data === 'string' && data ? data : fallback
}

const dayLabel = (at: number) => new Date(at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' })
const timeLabel = (at: number) =>
  new Date(at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' })

export function GroupHub({ groupId, posts }: { groupId: GroupId; posts: ReactNode }) {
  const home = useQuery(groupApi.home, { groupId })
  const [tab, setTab] = useState<Tab>('posts')

  // Links from notifications open a tab (?tab=work)
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab')
    if (TABS.some((t) => t.id === wanted)) setTab(wanted as Tab)
  }, [])

  return (
    <div>
      {home && <PinnedNote groupId={groupId} note={home.announcement} canManage={home.canManage} />}
      {home && home.spaces.length > 0 && (
        <div className="mt-4 flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {home.spaces.map((s) => (
            <Link
              key={s.id}
              href={spacePath(s.id)}
              className="flex min-w-[220px] items-center gap-3 rounded-2xl border border-rh-ink/[0.08] bg-white px-4 py-3 text-sm transition hover:border-rh-ink/20"
            >
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', s.status === 'live' ? 'bg-rose-500 text-white' : 'bg-rh-ink/[0.06] text-rh-ink')}>
                <Calendar className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-rh-ink">{s.title}</span>
                <span className={cn('block text-xs', s.status === 'live' ? 'font-semibold text-rose-600' : 'text-rh-ink/55')}>
                  {s.status === 'live' ? 'Live now · group Space' : s.at ? `${timeLabel(s.at)} · group Space` : 'Group Space'}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-5 flex gap-1 overflow-x-auto rounded-full bg-rh-ink/[0.05] p-1 [scrollbar-width:none] sm:mt-6" role="tablist" aria-label="Group">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold transition sm:text-sm',
              tab === t.id ? 'bg-white text-rh-ink shadow-sm' : 'text-rh-ink/55 hover:text-rh-ink'
            )}
          >
            {t.label}
            {t.id === 'work' && home && home.openAssignments > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rh-lime px-1.5 text-[11px] font-bold text-rh-ink">{home.openAssignments}</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'posts' && posts}
        {tab === 'work' && <WorkTab groupId={groupId} />}
        {tab === 'board' && <BoardTab groupId={groupId} />}
        {tab === 'people' && <PeopleTab groupId={groupId} />}
      </div>
    </div>
  )
}

// ── Pinned note ───────────────────────────────────────────────────────────────

function PinnedNote({ groupId, note, canManage }: { groupId: GroupId; note: { text: string; at: number; by: string } | null; canManage: boolean }) {
  const save = useMutation(groupApi.setAnnouncement)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (value: string) => {
    setBusy(true)
    try {
      await save({ groupId, text: value })
      setEditing(false)
      toast.success(value.trim() ? 'Note pinned for the group' : 'Note removed')
    } catch (err) {
      toast.error(errorText(err, 'That didn’t save. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <div className="mt-6 rounded-2xl border border-rh-ink/[0.1] bg-white p-4">
        <label htmlFor="group-note" className="text-sm font-semibold text-rh-ink">
          Pinned note
        </label>
        <textarea
          id="group-note"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={600}
          placeholder="e.g. This week: finish lessons 3 and 4, and try the back pain case before Thursday’s Space."
          className={cn(fieldClass, 'mt-2 h-auto py-3 leading-6')}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void submit(text)} disabled={busy} className={cn(pillInk, 'h-10 px-4 text-sm')}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Pin it
          </button>
          <button type="button" onClick={() => setEditing(false)} className={cn(pillOutline, 'h-10 px-4 text-sm')}>
            Cancel
          </button>
        </div>
      </div>
    )
  }
  if (!note) {
    if (!canManage) return null
    return (
      <button
        type="button"
        onClick={() => {
          setText('')
          setEditing(true)
        }}
        className="mt-6 flex w-full items-center gap-2 rounded-2xl border border-dashed border-rh-ink/15 px-4 py-3 text-left text-sm font-semibold text-rh-ink/60 transition hover:border-rh-ink/30 hover:text-rh-ink"
      >
        <Megaphone className="h-4 w-4" /> Pin a note for the group
      </button>
    )
  }
  return (
    <div className="mt-6 rounded-2xl border border-rh-ink/[0.08] bg-white p-4 shadow-[inset_4px_0_0_0_var(--color-rh-lime)]">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-rh-ink/50">
          <Megaphone className="h-3.5 w-3.5" /> Pinned by {note.by} · {relativeTime(note.at)}
        </p>
        {canManage && (
          <span className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => {
                setText(note.text)
                setEditing(true)
              }}
              aria-label="Edit the note"
              className="flex h-8 w-8 items-center justify-center rounded-full text-rh-ink/50 hover:bg-rh-ink/[0.05] hover:text-rh-ink"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => void submit('')} aria-label="Remove the note" className="flex h-8 w-8 items-center justify-center rounded-full text-rh-ink/50 hover:bg-rh-ink/[0.05] hover:text-rh-ink">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>
      <p className="mt-2 whitespace-pre-line text-[15px] leading-6 text-rh-ink">{note.text}</p>
    </div>
  )
}

// ── Invite ────────────────────────────────────────────────────────────────────

/** Header button for leads: the group's invite link, QR and WhatsApp. */
export function GroupInviteButton({ groupId, groupName, className }: { groupId: GroupId; groupName: string; className?: string }) {
  const home = useQuery(groupApi.home, { groupId })
  const setInvite = useMutation(groupApi.setInvite)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!home?.canManage || !home.invite) return null
  const url = home.invite.url

  const act = async (action: 'on' | 'new' | 'off') => {
    setBusy(true)
    try {
      await setInvite({ groupId, action })
      if (action === 'new') toast.success('New link made. The old one no longer works.')
      if (action === 'off') toast.success('Invite link turned off')
    } catch (err) {
      toast.error(errorText(err, 'That didn’t work. Try again.'))
    } finally {
      setBusy(false)
    }
  }
  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      playSound('success')
      toast.success('Link copied')
    } catch {
      toast.error('Couldn’t copy. Press and hold the link instead.')
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn(pillOutline, 'h-12 shrink-0 px-5', className)}>
        <UserPlus className="h-4 w-4" /> Invite
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Invite people to ${groupName}`}>
        {url ? (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-rh-ink/65">Anyone with this link can join the group after signing in to Rehabify Learn. Make a new link to stop the old one working.</p>
            <div className="flex flex-col items-center gap-4 rounded-2xl bg-rh-cream p-4 sm:flex-row sm:items-center">
              <QrCode value={url} size={148} label={`QR code to join ${groupName}`} />
              <div className="min-w-0 flex-1 space-y-2.5">
                <p className="break-all rounded-xl bg-white px-3 py-2.5 font-mono text-[13px] text-rh-ink">{url}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void copy()} className={cn(pillInk, 'h-10 flex-1 px-3 text-sm')}>
                    <Copy className="h-4 w-4" /> Copy link
                  </button>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`Join our group “${groupName}” on Rehabify Learn: ${url}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(pillOutline, 'h-10 flex-1 px-3 text-sm')}
                  >
                    <WhatsApp className="h-4 w-4" /> WhatsApp
                  </a>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void act('new')} disabled={busy} className={cn(pillOutline, 'h-10 px-4 text-sm')}>
                <RefreshCw className="h-4 w-4" /> Make a new link
              </button>
              <button type="button" onClick={() => void act('off')} disabled={busy} className="h-10 rounded-full px-4 text-sm font-semibold text-rh-ink/60 hover:bg-rh-ink/[0.05]">
                Turn the link off
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-rh-ink/65">
              Turn on an invite link to share in WhatsApp groups or show as a QR code in class. People join after signing in to Rehabify Learn; you can turn it off any time.
            </p>
            <button type="button" onClick={() => void act('on')} disabled={busy} className={cn(pillInk, 'h-11 w-full px-5')}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Turn on the invite link
            </button>
          </div>
        )}
      </Sheet>
    </>
  )
}

// ── Work (assignments) ────────────────────────────────────────────────────────

const KIND_META: Record<AssignmentKind, { label: string; icon: typeof BookOpen }> = {
  course: { label: 'Course', icon: BookOpen },
  lesson: { label: 'Lesson', icon: PlayCircle },
  sim: { label: 'Simulation case', icon: HeartPulse },
}

function WorkTab({ groupId }: { groupId: GroupId }) {
  const data = useQuery(groupApi.assignments, { groupId })
  const [setting, setSetting] = useState(false)
  if (data === undefined) return <Skeleton className="h-40 rounded-3xl" />
  if (data === null) return null
  return (
    <div className="space-y-3">
      {data.canManage && (
        <div className="flex justify-end">
          <button type="button" onClick={() => setSetting(true)} className={cn(pillInk, 'h-11 px-5')}>
            <Plus className="h-4 w-4" /> Set work
          </button>
        </div>
      )}
      {data.items.length === 0 ? (
        <EmptyState icon={<BookOpen className="h-5 w-5" />} title="No work set yet">
          {data.canManage
            ? 'Set a course, a lesson or a simulation case for the group, with a due date. You’ll see who has done it.'
            : 'When your group lead sets a course, lesson or case, it shows here with a due date.'}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {data.items.map((item) => (
            <AssignmentCard key={item.id} item={item} canManage={data.canManage} />
          ))}
        </ul>
      )}
      {data.canManage && <SetWorkSheet groupId={groupId} open={setting} onClose={() => setSetting(false)} />}
    </div>
  )
}

function AssignmentCard({ item, canManage }: { item: GroupAssignment; canManage: boolean }) {
  const remove = useMutation(groupApi.removeAssignment)
  const [showWho, setShowWho] = useState(false)
  const meta = KIND_META[item.kind]
  const Icon = meta.icon
  const now = Date.now()
  const mine = item.mine
  const late = Boolean(item.dueAt && item.dueAt < now && mine && mine.state !== 'done')
  const href = item.kind === 'sim' && item.caseSlug ? simPath(item.caseSlug) : item.courseId ? coursePath(item.courseId) : null

  const onRemove = async () => {
    if (!window.confirm(`Remove “${item.title}” from the group’s work?`)) return
    try {
      await remove({ assignmentId: item.id })
      toast.success('Removed')
    } catch (err) {
      toast.error(errorText(err, 'Couldn’t remove it.'))
    }
  }

  return (
    <li className="rounded-3xl border border-rh-ink/[0.07] bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', mine?.state === 'done' ? 'bg-rh-lime text-rh-ink' : 'bg-rh-ink/[0.06] text-rh-ink')}>
          {mine?.state === 'done' ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-rh-ink/45">{meta.label}</p>
          <p className="mt-0.5 text-[16px] font-semibold leading-snug text-rh-ink">{item.title}</p>
          {item.note && <p className="mt-1 whitespace-pre-line text-sm leading-6 text-rh-ink/65">{item.note}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {item.dueAt && (
              <span className={cn('rounded-full px-2.5 py-1 font-semibold', late ? 'bg-rose-100 text-rose-700' : 'bg-rh-ink/[0.06] text-rh-ink/70')}>
                {late ? 'Overdue · ' : 'Due '}
                {dayLabel(item.dueAt)}
              </span>
            )}
            {mine && (
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 font-semibold',
                  mine.state === 'done' ? 'bg-rh-lime/25 text-rh-ink' : mine.state === 'started' ? 'bg-amber-100 text-amber-800' : 'bg-rh-ink/[0.06] text-rh-ink/60'
                )}
              >
                {mine.state === 'done' ? `Done · ${mine.detail ?? ''}`.replace(/ · $/, '') : mine.state === 'started' ? (mine.detail ?? 'In progress') : 'To do'}
              </span>
            )}
            <span className="text-rh-ink/45">Set by {item.by}</span>
          </div>
          {mine?.state === 'started' && item.kind === 'course' && mine.pct > 0 && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-rh-ink/[0.07]">
              <div className="h-full rounded-full bg-rh-lime" style={{ width: `${mine.pct}%` }} />
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {href && mine?.state !== 'done' && (
          <Link href={href} className={cn(pillLime, 'h-10 px-4 text-sm')}>
            {mine?.state === 'started' ? 'Carry on' : 'Start'}
          </Link>
        )}
        {href && mine?.state === 'done' && (
          <Link href={href} className={cn(pillOutline, 'h-10 px-4 text-sm')}>
            Open again
          </Link>
        )}
        {canManage && (
          <>
            <button type="button" onClick={() => setShowWho((s) => !s)} className={cn(pillOutline, 'h-10 px-4 text-sm')}>
              Who’s done it <ChevronDown className={cn('h-4 w-4 transition', showWho && 'rotate-180')} />
            </button>
            <button type="button" onClick={() => void onRemove()} className="h-10 rounded-full px-3 text-sm font-semibold text-rh-ink/50 hover:bg-rh-ink/[0.05] hover:text-rh-ink">
              Remove
            </button>
          </>
        )}
      </div>
      {showWho && <WhoDoneIt assignmentId={item.id} dueAt={item.dueAt} />}
    </li>
  )
}

function WhoDoneIt({ assignmentId, dueAt }: { assignmentId: Id<'learnGroupAssignments'>; dueAt: number | null }) {
  const data = useQuery(groupApi.assignmentProgress, { assignmentId })
  if (data === undefined) return <Skeleton className="mt-4 h-24 rounded-2xl" />
  if (data === null) return null
  return (
    <div className="mt-4 rounded-2xl bg-rh-cream p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-rh-ink">
          {data.done} of {data.total} done
        </p>
        <div className="h-2 w-32 overflow-hidden rounded-full bg-rh-ink/[0.08]">
          <div className="h-full rounded-full bg-rh-lime" style={{ width: `${data.total ? (data.done / data.total) * 100 : 0}%` }} />
        </div>
      </div>
      <ul className="mt-3 divide-y divide-rh-ink/[0.06]">
        {data.people.map((p) => {
          const late = Boolean(dueAt && p.state === 'done' && p.at && p.at > dueAt)
          return (
            <li key={p.userId} className="flex items-center gap-3 py-2.5">
              <Avatar name={p.name} imageUrl={p.imageUrl} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-rh-ink">
                  {p.name}
                  {p.role === 'lead' && <span className="ml-1.5 rounded-full bg-rh-lime px-1.5 py-px text-[10px] font-semibold text-rh-ink">Champion</span>}
                </span>
                {p.detail && <span className="block truncate text-xs text-rh-ink/50">{p.detail}</span>}
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                  p.state === 'done' ? 'bg-rh-lime/25 text-rh-ink' : p.state === 'started' ? 'bg-amber-100 text-amber-800' : 'bg-rh-ink/[0.06] text-rh-ink/55'
                )}
              >
                {p.state === 'done' ? (late ? 'Done late' : 'Done') : p.state === 'started' ? (p.pct ? `${p.pct}%` : 'Started') : 'Not yet'}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function SetWorkSheet({ groupId, open, onClose }: { groupId: GroupId; open: boolean; onClose: () => void }) {
  const options = useQuery(groupApi.assignable, open ? { groupId } : 'skip')
  const create = useMutation(groupApi.createAssignment)
  const [kind, setKind] = useState<AssignmentKind>('course')
  const [courseId, setCourseId] = useState('')
  const [lessonId, setLessonId] = useState('')
  const [caseSlug, setCaseSlug] = useState('')
  const [due, setDue] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const course = options?.courses.find((c) => c.id === courseId)
  const ready = kind === 'sim' ? Boolean(caseSlug) : kind === 'lesson' ? Boolean(lessonId) : Boolean(courseId)
  const today = useMemo(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }), [])

  const reset = () => {
    setCourseId('')
    setLessonId('')
    setCaseSlug('')
    setDue('')
    setNote('')
  }
  const submit = async () => {
    setBusy(true)
    try {
      await create({
        groupId,
        kind,
        courseId: kind !== 'sim' && courseId ? (courseId as Id<'learnVideoCourses'>) : undefined,
        lessonId: kind === 'lesson' && lessonId ? (lessonId as Id<'learnVideoLessons'>) : undefined,
        caseSlug: kind === 'sim' ? caseSlug : undefined,
        note: note.trim() || undefined,
        // The end of the chosen day in Lagos
        dueAt: due ? new Date(`${due}T23:59:00+01:00`).getTime() : undefined,
      })
      playSound('success')
      toast.success('Work set. The group has been told.')
      reset()
      onClose()
    } catch (err) {
      toast.error(errorText(err, 'That didn’t save. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Set work for the group"
      footer={
        <button type="button" onClick={() => void submit()} disabled={!ready || busy} className={cn(pillInk, 'h-12 w-full')}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Set it and tell the group
        </button>
      }
    >
      {options === undefined ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : options === null ? (
        <p className="text-sm text-rh-ink/60">Only the group’s champion can set work.</p>
      ) : (
        <div className="space-y-5">
          <div className="flex gap-1 rounded-full bg-rh-ink/[0.05] p-1" role="radiogroup" aria-label="What to set">
            {(['course', 'lesson', 'sim'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={cn('h-10 flex-1 rounded-full text-sm font-semibold transition', kind === k ? 'bg-white text-rh-ink shadow-sm' : 'text-rh-ink/55')}
              >
                {k === 'sim' ? 'Case' : KIND_META[k].label}
              </button>
            ))}
          </div>

          {kind === 'sim' ? (
            <label className="block">
              <span className="text-sm font-semibold text-rh-ink">Simulation case</span>
              <select value={caseSlug} onChange={(e) => setCaseSlug(e.target.value)} className={cn(fieldClass, 'mt-2')}>
                <option value="">Choose a case</option>
                {options.cases.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.title}
                  </option>
                ))}
              </select>
              {options.cases.length === 0 && <span className="mt-1.5 block text-xs text-rh-ink/50">No cases are live yet. They show here once published.</span>}
            </label>
          ) : (
            <>
              <label className="block">
                <span className="text-sm font-semibold text-rh-ink">Course</span>
                <select
                  value={courseId}
                  onChange={(e) => {
                    setCourseId(e.target.value)
                    setLessonId('')
                  }}
                  className={cn(fieldClass, 'mt-2')}
                >
                  <option value="">Choose a course</option>
                  {options.courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
              {kind === 'lesson' && (
                <label className="block">
                  <span className="text-sm font-semibold text-rh-ink">Lesson</span>
                  <select value={lessonId} onChange={(e) => setLessonId(e.target.value)} disabled={!course} className={cn(fieldClass, 'mt-2')}>
                    <option value="">{course ? 'Choose a lesson' : 'Choose a course first'}</option>
                    {course?.lessons.map((l, i) => (
                      <option key={l.id} value={l.id}>
                        {i + 1}. {l.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}

          <label className="block">
            <span className="text-sm font-semibold text-rh-ink">Due date (optional)</span>
            <input type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} className={cn(fieldClass, 'mt-2')} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-rh-ink">Note for the group (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. Watch it before Thursday’s Space; we’ll go through the questions together."
              className={cn(fieldClass, 'mt-2 h-auto py-3 leading-6')}
            />
          </label>
        </div>
      )}
    </Sheet>
  )
}

// ── Leaderboard and people ────────────────────────────────────────────────────

function BoardTab({ groupId }: { groupId: GroupId }) {
  const data = useQuery(groupApi.people, { groupId })
  const [period, setPeriod] = useState<'month' | 'all'>('month')
  if (data === undefined) return <Skeleton className="h-64 rounded-3xl" />
  if (data === null) return null
  const score = (p: GroupPerson) => (period === 'month' ? p.month : p.total)
  const ranked = data.people.filter((p) => !p.hidden && score(p) > 0).sort((a, b) => score(b) - score(a))
  const me = data.people.find((p) => p.isMe)
  let rank = 0
  let last = -1
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full bg-rh-ink/[0.05] p-1">
          {(
            [
              ['month', data.monthLabel],
              ['all', 'All time'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPeriod(id)}
              className={cn('h-9 rounded-full px-4 text-sm font-semibold transition', period === id ? 'bg-white text-rh-ink shadow-sm' : 'text-rh-ink/55')}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-rh-ink/45">Points from Learn</span>
      </div>
      {ranked.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon={<Crown className="h-5 w-5" />} title="No points yet">
            Lessons, courses, cases, posts and Spaces all earn points. The first to score tops the group.
          </EmptyState>
        </div>
      ) : (
        <ol className="mt-4 space-y-2">
          {ranked.map((p, i) => {
            if (score(p) !== last) {
              rank = i + 1
              last = score(p)
            }
            return (
              <li
                key={p.userId}
                className={cn('flex items-center gap-3 rounded-2xl border bg-white px-3 py-2.5', p.isMe ? 'border-rh-lime ring-1 ring-rh-lime/60' : 'border-rh-ink/[0.07]')}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums',
                    rank === 1 ? 'bg-amber-300 text-amber-950' : rank === 2 ? 'bg-slate-200 text-slate-800' : rank === 3 ? 'bg-orange-200 text-orange-900' : 'text-rh-ink/55'
                  )}
                >
                  {rank}
                </span>
                <Avatar name={p.name} imageUrl={p.imageUrl} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-rh-ink">
                    {p.isMe ? `${p.name} (you)` : p.name}
                    {p.role === 'lead' && <span className="ml-1.5 rounded-full bg-rh-lime px-1.5 py-px text-[10px] font-semibold text-rh-ink">Champion</span>}
                  </span>
                  {p.streak > 1 && (
                    <span className="flex items-center gap-1 text-xs text-rh-ink/50">
                      <Flame className="h-3 w-3 text-orange-500" /> {p.streak}-day streak
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-rh-ink">{formatPoints(score(p))}</span>
              </li>
            )
          })}
        </ol>
      )}
      {me?.hidden && <p className="mt-3 text-xs text-rh-ink/50">You’re hidden from leaderboards. Change that in My progress.</p>}
    </div>
  )
}

function PeopleTab({ groupId }: { groupId: GroupId }) {
  const data = useQuery(groupApi.people, { groupId })
  if (data === undefined) return <Skeleton className="h-64 rounded-3xl" />
  if (data === null) return null
  const people = [...data.people].sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'lead' ? -1 : 1))
  return (
    <ul className="divide-y divide-rh-ink/[0.06] rounded-3xl border border-rh-ink/[0.07] bg-white px-4">
      {people.map((p) => (
        <li key={p.userId} className="flex items-center gap-3 py-3">
          <Avatar name={p.name} imageUrl={p.imageUrl} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-rh-ink">
              {p.isMe ? `${p.name} (you)` : p.name}
              {p.role === 'lead' && <span className="ml-1.5 rounded-full bg-rh-lime px-1.5 py-px text-[10px] font-semibold text-rh-ink">Champion</span>}
            </span>
            <span className="block truncate text-xs text-rh-ink/50">
              {p.tag ? `${p.tag} · ` : ''}joined {relativeTime(p.joinedAt)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
