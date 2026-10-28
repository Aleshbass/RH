'use client'

/**
 * Admin "Course" tab for a Rehabify Learn cohort: live sessions (with their meeting links),
 * course links, and each week's materials. Everything shows on paid physios' /learn/course
 * page as soon as it's saved.
 */

import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarPlus,
  Check,
  ExternalLink,
  FileText,
  Library,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Rotate3d,
  Search,
  Trash2,
  Upload,
  Video,
} from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import type { adminCourseContent } from '@/convex/learn'
import type { LibraryItem } from '@/convex/exerciseLibrary'
import type { listResources } from '@/convex/libraryResources'
import type { QueryResult } from '@/lib/convexUntyped'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog, EmptyState, inputClass, Panel, primaryButtonClass, softButtonClass, StatusBadge } from '@/components/admin/ui'
import { Callout, errorMessage, hintClass, labelClass, LoadingBlock, textareaClass } from '@/components/admin/partners/shared'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { AssessmentSummary, LearnersPanel } from './AssessmentPanels'
import { AdminDrawer, Field } from './drawer'

type Content = NonNullable<QueryResult<typeof adminCourseContent>>
type Session = Content['sessions'][number]
type Week = Content['weeks'][number]
type Resource = NonNullable<QueryResult<typeof listResources>>[number]

const MAX_FILE_BYTES = 25 * 1024 * 1024
const FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'image/png',
  'image/jpeg',
  'image/webp',
]

function addDays(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function fileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}


// ─────────────────────────────────────────────────────────────────────────────
// Live sessions
// ─────────────────────────────────────────────────────────────────────────────

type SessionDraft = {
  id?: Id<'learnSessions'>
  date: string
  startTime: string
  endTime: string
  title: string
  meetingUrl: string
  recordingUrl: string
  repeatWeeks: number
  notify: boolean
  originalUrl: string
}

function draftForSession(session: Session): SessionDraft {
  return {
    id: session.id,
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    title: session.title ?? '',
    meetingUrl: session.meetingUrl ?? '',
    recordingUrl: session.recordingUrl ?? '',
    repeatWeeks: 1,
    notify: true,
    originalUrl: session.meetingUrl ?? '',
  }
}

function draftForNewSession(content: Content): SessionDraft {
  const last = content.sessions[content.sessions.length - 1]
  return {
    date: last ? addDays(last.date, 7) : content.startDate,
    startTime: last?.startTime ?? '17:00',
    endTime: last?.endTime ?? '19:00',
    title: '',
    meetingUrl: last?.meetingUrl ?? '',
    recordingUrl: '',
    repeatWeeks: 1,
    notify: true,
    originalUrl: '',
  }
}

function SessionDrawer({
  cohortId,
  learners,
  draft,
  setDraft,
}: {
  cohortId: Id<'learnCohorts'>
  learners: number
  draft: SessionDraft | null
  setDraft: (draft: SessionDraft | null) => void
}) {
  const save = useMutation(api.learn.adminSaveSession)
  const remove = useMutation(api.learn.adminDeleteSession)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isNew = !draft?.id
  const url = draft?.meetingUrl.trim() ?? ''
  const canNotify = Boolean(draft && url && (isNew || url !== draft.originalUrl) && learners > 0)
  const set = <K extends keyof SessionDraft>(key: K) => (value: SessionDraft[K]) => draft && setDraft({ ...draft, [key]: value })

  const submit = async () => {
    if (!draft) return
    setBusy(true)
    try {
      let notified = 0
      const count = isNew ? draft.repeatWeeks : 1
      for (let i = 0; i < count; i++) {
        // With a repeat, learners get one email (for the first session), not one per week
        const result = (await save({
          cohortId,
          sessionId: draft.id,
          date: addDays(draft.date, i * 7),
          startTime: draft.startTime,
          endTime: draft.endTime,
          title: draft.title || undefined,
          meetingUrl: draft.meetingUrl || undefined,
          recordingUrl: i === 0 ? draft.recordingUrl || undefined : undefined,
          notifyLearners: canNotify && draft.notify && i === 0,
        })) as { notified: number }
        notified += result.notified
      }
      playSound('success')
      toast.success(
        `${count > 1 ? `${count} sessions added` : isNew ? 'Session added' : 'Session saved'}${notified ? `. Emailing ${notified} ${notified === 1 ? 'learner' : 'learners'}.` : '.'}`
      )
      setDraft(null)
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save the session'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminDrawer
      open={draft !== null}
      onOpenChange={(open) => !open && !busy && setDraft(null)}
      title={isNew ? 'Add a live session' : 'Edit live session'}
      description="Times are Lagos time. Learners see the join button 15 minutes before it starts."
      footer={
        <>
          {!isNew && (
            <Button variant="ghost" className={cn(softButtonClass, 'mr-auto')} onClick={() => setConfirmDelete(true)} disabled={busy}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          )}
          <Button variant="ghost" className={cn(softButtonClass, isNew && 'ml-auto')} onClick={() => setDraft(null)} disabled={busy}>
            Cancel
          </Button>
          <Button className={primaryButtonClass} onClick={() => void submit()} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isNew ? 'Add session' : 'Save'}
          </Button>
        </>
      }
    >
      {draft && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date" htmlFor="session-date">
            <Input id="session-date" type="date" value={draft.date} onChange={(e) => set('date')(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Starts" htmlFor="session-start">
            <Input id="session-start" type="time" value={draft.startTime} onChange={(e) => set('startTime')(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Ends" htmlFor="session-end">
            <Input id="session-end" type="time" value={draft.endTime} onChange={(e) => set('endTime')(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Title" htmlFor="session-title" hint="Optional, e.g. “Week 2: The shoulder”." className="sm:col-span-3">
            <Input id="session-title" maxLength={120} value={draft.title} onChange={(e) => set('title')(e.target.value)} className={inputClass} />
          </Field>
          <Field
            label="Meeting link"
            htmlFor="session-url"
            hint="Zoom, Google Meet or Teams. Change it any time: learners always see the current link."
            className="sm:col-span-3"
          >
            <Input
              id="session-url"
              type="url"
              placeholder="https://meet.google.com/…"
              maxLength={500}
              value={draft.meetingUrl}
              onChange={(e) => set('meetingUrl')(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Recording link" htmlFor="session-recording" hint="Add after the session. YouTube links play on the course page." className="sm:col-span-3">
            <Input
              id="session-recording"
              type="url"
              placeholder="https://youtu.be/…"
              maxLength={500}
              value={draft.recordingUrl}
              onChange={(e) => set('recordingUrl')(e.target.value)}
              className={inputClass}
            />
          </Field>
          {isNew && (
            <Field label="Repeat" htmlFor="session-repeat" hint="Adds the same time on the following weeks." className="sm:col-span-3">
              <select
                id="session-repeat"
                value={draft.repeatWeeks}
                onChange={(e) => set('repeatWeeks')(Number(e.target.value))}
                className={cn(inputClass, 'h-9 w-full border px-3 text-sm sm:w-56')}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? 'Just this session' : `Weekly, ${n} sessions`}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {canNotify && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-rh-canvas p-3.5 sm:col-span-3 dark:bg-white/[0.04]">
              <input
                type="checkbox"
                checked={draft.notify}
                onChange={(e) => set('notify')(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-rh-ink"
              />
              <span className="text-sm">
                <span className="block font-medium text-rh-ink dark:text-white">Tell learners</span>
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                  {isNew ? 'Email' : 'Email the new link to'} all {learners} paid {learners === 1 ? 'physio' : 'physios'}. The email opens their course
                  page, never the raw link, so it stays right if you change it again.
                </span>
              </span>
            </label>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this session?"
        description="It disappears from learners' course page. Nobody is emailed."
        confirmLabel="Delete session"
        destructive
        onConfirm={async () => {
          if (!draft?.id) return
          try {
            await remove({ sessionId: draft.id })
            toast.success('Session deleted')
            setDraft(null)
          } catch (error) {
            toast.error(errorMessage(error, 'Could not delete the session'))
            throw error
          }
        }}
      />
    </AdminDrawer>
  )
}

function SessionsPanel({ content, onEdit, onAdd }: { content: Content; onEdit: (s: Session) => void; onAdd: () => void }) {
  const now = Date.now()
  return (
    <Panel
      title="Live sessions"
      description="Each session's time and meeting link. Learners join from their course page."
      actions={
        <Button size="sm" className={primaryButtonClass} onClick={onAdd}>
          <Plus className="mr-1.5 h-4 w-4" /> Add session
        </Button>
      }
    >
      {content.sessions.length === 0 ? (
        <EmptyState icon={<CalendarPlus />} title="No sessions yet" description="Add the first live session. You can repeat it weekly in one go." />
      ) : (
        <ul className="divide-y divide-black/[0.05] px-2 pb-2 dark:divide-white/[0.06]">
          {content.sessions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onEdit(s)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-rh-canvas dark:hover:bg-white/[0.04]"
              >
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-sm font-medium', s.endsAt < now ? 'text-neutral-500' : 'text-rh-ink dark:text-white')}>
                    {s.title ?? 'Live session'}
                  </span>
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                    {s.label} – {s.endTime}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap justify-end gap-1">
                  {s.endsAt < now ? (
                    s.recordingUrl ? <StatusBadge tone="green">Recording</StatusBadge> : <StatusBadge tone="amber">No recording</StatusBadge>
                  ) : s.meetingUrl ? (
                    <StatusBadge tone="green">Link set</StatusBadge>
                  ) : (
                    <StatusBadge tone="amber">No link yet</StatusBadge>
                  )}
                </span>
                <Pencil className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Course links
// ─────────────────────────────────────────────────────────────────────────────

type LinkRow = { id?: string; label: string; url: string }

function LinksPanel({ cohortId, links }: { cohortId: Id<'learnCohorts'>; links: Content['links'] }) {
  const saveLinks = useMutation(api.learn.adminSaveCourseLinks)
  const [rows, setRows] = useState<LinkRow[]>(links)
  const [busy, setBusy] = useState(false)
  const dirty = JSON.stringify(rows) !== JSON.stringify(links)

  const update = (i: number, patch: Partial<LinkRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const move = (i: number, by: number) => {
    const next = [...rows]
    const [row] = next.splice(i, 1)
    next.splice(i + by, 0, row)
    setRows(next)
  }

  const submit = async () => {
    setBusy(true)
    try {
      await saveLinks({ cohortId, links: rows.filter((r) => r.label.trim() || r.url.trim()) })
      playSound('success')
      toast.success('Course links saved. Learners see them now.')
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save the links'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      title="Course links"
      description="WhatsApp group, Drive folder, forms, reading lists. Shown on every learner's course page."
      actions={
        dirty ? (
          <Button size="sm" className={primaryButtonClass} onClick={() => void submit()} disabled={busy}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />} Save links
          </Button>
        ) : undefined
      }
      bodyClassName="space-y-2 px-5 pb-5 pt-2"
    >
      {rows.length === 0 && <p className="text-sm text-neutral-500 dark:text-neutral-400">No links yet.</p>}
      {rows.map((row, i) => (
        <div key={row.id ?? `new-${i}`} className="flex flex-col gap-2 rounded-xl bg-rh-canvas p-2.5 sm:flex-row sm:items-center dark:bg-white/[0.04]">
          <Input
            aria-label="Link name"
            placeholder="Name, e.g. Cohort WhatsApp group"
            maxLength={60}
            value={row.label}
            onChange={(e) => update(i, { label: e.target.value })}
            className={cn(inputClass, 'sm:w-56')}
          />
          <Input
            aria-label="Link address"
            type="url"
            placeholder="https://…"
            maxLength={500}
            value={row.url}
            onChange={(e) => update(i, { url: e.target.value })}
            className={cn(inputClass, 'flex-1')}
          />
          <div className="flex shrink-0 gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove link">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
      {rows.length < 12 && (
        <Button variant="ghost" size="sm" className={softButtonClass} onClick={() => setRows([...rows, { label: '', url: '' }])}>
          <Plus className="mr-1.5 h-4 w-4" /> Add link
        </Button>
      )}
    </Panel>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekly materials
// ─────────────────────────────────────────────────────────────────────────────

type WeekFile = { storageId: Id<'_storage'>; name: string; size: number; contentType: string }
type WeekDraft = {
  id?: Id<'learnModules'>
  week: number
  title: string
  summary: string
  recordingUrl: string
  files: WeekFile[]
  exercises: { id: Id<'exercises'>; name: string }[]
  resources: { key: string; title: string }[]
}

function draftForWeek(week: Week): WeekDraft {
  return {
    id: week.id,
    week: week.week,
    title: week.title,
    summary: week.summary ?? '',
    recordingUrl: week.recordingUrl ?? '',
    files: week.files.map((f) => ({ storageId: f.storageId, name: f.name, size: f.size, contentType: f.contentType })),
    exercises: week.exercises.map((e) => ({ id: e._id, name: e.name })),
    resources: week.resources.map((r) => ({ key: r.key, title: r.title })),
  }
}

function draftForNewWeek(content: Content): WeekDraft {
  const used = new Set(content.weeks.map((w) => w.week))
  let week = 1
  while (used.has(week) && week < 20) week++
  return { week, title: '', summary: '', recordingUrl: '', files: [], exercises: [], resources: [] }
}

function PickerSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn(inputClass, 'pl-9')} />
    </div>
  )
}

function PickRow({ selected, title, meta, icon, onToggle }: { selected: boolean; title: string; meta: string; icon: ReactNode; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
        selected ? 'bg-rh-honeydew/60 dark:bg-emerald-400/10' : 'hover:bg-rh-canvas dark:hover:bg-white/[0.04]'
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rh-canvas text-neutral-600 dark:bg-white/[0.06] dark:text-neutral-300">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-rh-ink dark:text-white">{title}</span>
        <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">{meta}</span>
      </span>
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
          selected ? 'border-rh-ink bg-rh-ink text-white dark:border-white dark:bg-white dark:text-rh-ink' : 'border-black/15 dark:border-white/20'
        )}
      >
        {selected && <Check className="h-3 w-3" />}
      </span>
    </button>
  )
}

function ExercisePicker({ draft, setDraft }: { draft: WeekDraft; setDraft: (d: WeekDraft) => void }) {
  const library = useQuery(api.exerciseLibrary.listLibrary, {}) as { items: LibraryItem[] } | null | undefined
  const [search, setSearch] = useState('')
  const items = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (library?.items ?? [])
      .filter((e) => e.animation)
      .filter((e) => !q || `${e.name} ${e.bodyParts.join(' ')} ${e.conditions.join(' ')}`.toLowerCase().includes(q))
  }, [library, search])
  const chosen = new Set(draft.exercises.map((e) => e.id))
  const toggle = (e: LibraryItem) =>
    setDraft({
      ...draft,
      exercises: chosen.has(e._id) ? draft.exercises.filter((x) => x.id !== e._id) : [...draft.exercises, { id: e._id, name: e.name }],
    })
  return (
    <div className="space-y-3">
      <PickerSearch value={search} onChange={setSearch} placeholder="Search 3D exercises" />
      {library === undefined ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-1">
          {items.map((e) => (
            <PickRow
              key={e._id}
              selected={chosen.has(e._id)}
              title={e.name}
              meta={`${e.bodyParts.join(', ')}${e.animation?.status === 'draft' ? ' · awaiting sign-off' : ''}`}
              icon={<Rotate3d className="h-4 w-4" />}
              onToggle={() => toggle(e)}
            />
          ))}
          {items.length === 0 && <p className="py-6 text-center text-sm text-neutral-500">No exercises match.</p>}
        </div>
      )}
    </div>
  )
}

function ResourcePicker({ draft, setDraft }: { draft: WeekDraft; setDraft: (d: WeekDraft) => void }) {
  const resources = useQuery(api.libraryResources.listResources, {}) as Resource[] | null | undefined
  const [search, setSearch] = useState('')
  const items = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (resources ?? []).filter((r) => !q || `${r.title} ${r.condition} ${r.region} ${r.source}`.toLowerCase().includes(q))
  }, [resources, search])
  const chosen = new Set(draft.resources.map((r) => r.key))
  const toggle = (r: Resource) =>
    setDraft({
      ...draft,
      resources: chosen.has(r.key) ? draft.resources.filter((x) => x.key !== r.key) : [...draft.resources, { key: r.key, title: r.title }],
    })
  return (
    <div className="space-y-3">
      <PickerSearch value={search} onChange={setSearch} placeholder="Search videos, pages and guides" />
      {resources === undefined ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-1">
          {items.slice(0, 120).map((r) => (
            <PickRow
              key={r.key}
              selected={chosen.has(r.key)}
              title={r.title}
              meta={`${r.kind === 'youtube' ? 'Video' : r.kind === 'guide' ? 'Guide' : 'Web page'} · ${r.region} · ${r.condition}`}
              icon={r.kind === 'youtube' ? <Video className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              onToggle={() => toggle(r)}
            />
          ))}
          {items.length > 120 && <p className="py-2 text-center text-xs text-neutral-500">Search to see more ({items.length} match).</p>}
          {items.length === 0 && <p className="py-6 text-center text-sm text-neutral-500">Nothing matches.</p>}
        </div>
      )}
    </div>
  )
}

function Chips<T>({ items, label, onRemove }: { items: T[]; label: (item: T) => string; onRemove: (item: T) => void }) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className="inline-flex max-w-full items-center gap-1 rounded-full bg-rh-canvas py-1 pl-3 pr-1 text-xs font-medium text-rh-ink dark:bg-white/[0.06] dark:text-white">
          <span className="truncate">{label(item)}</span>
          <button
            type="button"
            onClick={() => onRemove(item)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
            aria-label={`Remove ${label(item)}`}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )
}

function WeekDrawer({
  cohortId,
  draft,
  setDraft,
}: {
  cohortId: Id<'learnCohorts'>
  draft: WeekDraft | null
  setDraft: Dispatch<SetStateAction<WeekDraft | null>>
}) {
  const save = useMutation(api.learn.adminSaveWeek)
  const remove = useMutation(api.learn.adminDeleteWeek)
  const uploadUrl = useMutation(api.learn.adminGenerateFileUploadUrl)
  const [mode, setMode] = useState<'form' | 'exercises' | 'resources'>('form')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isNew = !draft?.id
  const set = <K extends keyof WeekDraft>(key: K) => (value: WeekDraft[K]) => draft && setDraft({ ...draft, [key]: value })

  const close = () => {
    if (busy || uploading) return
    setMode('form')
    setDraft(null)
  }

  const addFiles = async (list: FileList | null) => {
    if (!draft || !list) return
    const files = Array.from(list)
    const added: WeekFile[] = []
    setUploading(files.length)
    for (const file of files) {
      if (!FILE_TYPES.includes(file.type)) {
        toast.error(`${file.name}: upload PDFs, slides, Word documents or images.`)
        continue
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} is over 25 MB.`)
        continue
      }
      try {
        const url = (await uploadUrl({})) as string
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': file.type }, body: file })
        if (!res.ok) throw new Error('upload failed')
        const { storageId } = (await res.json()) as { storageId: Id<'_storage'> }
        added.push({ storageId, name: file.name.replace(/\.[a-z0-9]+$/i, ''), size: file.size, contentType: file.type })
      } catch {
        toast.error(`${file.name} didn't upload. Please try again.`)
      } finally {
        setUploading((n) => n - 1)
      }
    }
    // Functional update: the form may have changed while files uploaded
    if (added.length) setDraft((d) => d && { ...d, files: [...d.files, ...added].slice(0, 10) })
  }

  const submit = async () => {
    if (!draft) return
    setBusy(true)
    try {
      await save({
        cohortId,
        moduleId: draft.id,
        week: draft.week,
        title: draft.title,
        summary: draft.summary || undefined,
        recordingUrl: draft.recordingUrl || undefined,
        files: draft.files.map((f) => ({ storageId: f.storageId, name: f.name })),
        exerciseIds: draft.exercises.map((e) => e.id),
        resourceKeys: draft.resources.map((r) => r.key),
      })
      playSound('success')
      toast.success(`Week ${draft.week} saved. Learners see it now.`)
      setMode('form')
      setDraft(null)
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save the week'))
    } finally {
      setBusy(false)
    }
  }

  const picking = mode !== 'form'

  return (
    <AdminDrawer
      open={draft !== null}
      onOpenChange={(open) => !open && close()}
      title={
        picking ? (
          <button type="button" onClick={() => setMode('form')} className="inline-flex items-center gap-2 hover:opacity-70">
            <ArrowLeft className="h-4 w-4" /> {mode === 'exercises' ? 'Choose 3D exercises' : 'Choose videos and leaflets'}
          </button>
        ) : isNew ? (
          'Add a week'
        ) : (
          `Week ${draft?.week ?? ''}`
        )
      }
      description={picking ? 'Tap to add or remove. Your choices are kept when you go back.' : 'Slides, the recording and what to study this week.'}
      footer={
        picking ? (
          <Button className={cn(primaryButtonClass, 'ml-auto')} onClick={() => setMode('form')}>
            Done ({mode === 'exercises' ? draft?.exercises.length ?? 0 : draft?.resources.length ?? 0} chosen)
          </Button>
        ) : (
          <>
            {!isNew && (
              <Button variant="ghost" className={cn(softButtonClass, 'mr-auto')} onClick={() => setConfirmDelete(true)} disabled={busy}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            )}
            <Button variant="ghost" className={cn(softButtonClass, isNew && 'ml-auto')} onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button className={primaryButtonClass} onClick={() => void submit()} disabled={busy || uploading > 0}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save week
            </Button>
          </>
        )
      }
    >
      {draft && mode === 'exercises' && <ExercisePicker draft={draft} setDraft={setDraft} />}
      {draft && mode === 'resources' && <ResourcePicker draft={draft} setDraft={setDraft} />}
      {draft && mode === 'form' && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
            <Field label="Week" htmlFor="week-number">
              <select
                id="week-number"
                value={draft.week}
                onChange={(e) => set('week')(Number(e.target.value))}
                className={cn(inputClass, 'h-9 w-full border px-3 text-sm')}
              >
                {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    Week {n}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title" htmlFor="week-title">
              <Input id="week-title" maxLength={120} placeholder="e.g. Assessing the shoulder" value={draft.title} onChange={(e) => set('title')(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Field label="Summary" htmlFor="week-summary" hint="Optional. What this week covers and what to prepare.">
            <textarea id="week-summary" rows={4} maxLength={1000} value={draft.summary} onChange={(e) => set('summary')(e.target.value)} className={textareaClass} />
          </Field>
          <Field label="Recording link" htmlFor="week-recording" hint="YouTube (unlisted is fine) plays on the course page; other links open in a new tab.">
            <Input
              id="week-recording"
              type="url"
              placeholder="https://youtu.be/…"
              maxLength={500}
              value={draft.recordingUrl}
              onChange={(e) => set('recordingUrl')(e.target.value)}
              className={inputClass}
            />
          </Field>

          <div className="space-y-2">
            <p className={labelClass}>Slides and handouts</p>
            {draft.files.map((f, i) => (
              <div key={f.storageId} className="flex items-center gap-2 rounded-xl bg-rh-canvas p-2 dark:bg-white/[0.04]">
                <FileText className="ml-1 h-4 w-4 shrink-0 text-neutral-500" />
                <Input
                  aria-label="File name"
                  value={f.name}
                  maxLength={120}
                  onChange={(e) => set('files')(draft.files.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  className={cn(inputClass, 'h-8 flex-1')}
                />
                <span className="shrink-0 text-xs text-neutral-500">{fileSize(f.size)}</span>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => set('files')(draft.files.filter((_, j) => j !== i))} aria-label="Remove file">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {draft.files.length < 10 && (
              <label
                className={cn(
                  softButtonClass,
                  'inline-flex h-9 cursor-pointer items-center px-3 text-sm font-medium',
                  uploading > 0 && 'pointer-events-none opacity-60'
                )}
              >
                {uploading > 0 ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {uploading > 0 ? 'Uploading…' : 'Upload files'}
                <input
                  type="file"
                  multiple
                  accept=".pdf,.ppt,.pptx,.doc,.docx,image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    void addFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>
            )}
            <p className={hintClass}>PDF, PowerPoint, Word or images, up to 25 MB each. Removed files are deleted when you save.</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className={labelClass}>3D exercises to study</p>
              <Button size="sm" variant="ghost" className={softButtonClass} onClick={() => setMode('exercises')}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Choose
              </Button>
            </div>
            <Chips items={draft.exercises} label={(e) => e.name} onRemove={(e) => set('exercises')(draft.exercises.filter((x) => x.id !== e.id))} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className={labelClass}>Videos, pages and leaflets</p>
              <Button size="sm" variant="ghost" className={softButtonClass} onClick={() => setMode('resources')}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Choose
              </Button>
            </div>
            <Chips items={draft.resources} label={(r) => r.title} onRemove={(r) => set('resources')(draft.resources.filter((x) => x.key !== r.key))} />
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete week ${draft?.week ?? ''}?`}
        description="Its files are deleted too, and it disappears from learners' course page."
        confirmLabel="Delete week"
        destructive
        onConfirm={async () => {
          if (!draft?.id) return
          try {
            await remove({ moduleId: draft.id })
            toast.success('Week deleted')
            setDraft(null)
          } catch (error) {
            toast.error(errorMessage(error, 'Could not delete the week'))
            throw error
          }
        }}
      />
    </AdminDrawer>
  )
}

function WeeksPanel({ content, onEdit, onAdd }: { content: Content; onEdit: (w: Week) => void; onAdd: () => void }) {
  return (
    <Panel
      title="Weekly materials"
      description="Recording, slides and what to study. Add a week after each live session."
      actions={
        <Button size="sm" className={primaryButtonClass} onClick={onAdd}>
          <Plus className="mr-1.5 h-4 w-4" /> Add week
        </Button>
      }
    >
      {content.weeks.length === 0 ? (
        <EmptyState icon={<Library />} title="No weeks yet" description="Add week 1 with its slides, recording and exercises." />
      ) : (
        <ul className="divide-y divide-black/[0.05] px-2 pb-2 dark:divide-white/[0.06]">
          {content.weeks.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => onEdit(w)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-rh-canvas dark:hover:bg-white/[0.04]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rh-canvas text-sm font-semibold text-rh-ink dark:bg-white/[0.06] dark:text-white">
                  {w.week}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-rh-ink dark:text-white">{w.title}</span>
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                    {[
                      w.recordingUrl ? 'Recording' : 'No recording',
                      `${w.files.length} ${w.files.length === 1 ? 'file' : 'files'}`,
                      `${w.exercises.length} exercises`,
                      `${w.resources.length} resources`,
                    ].join(' · ')}
                  </span>
                </span>
                <Pencil className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function CoursePanel({ cohortId }: { cohortId: Id<'learnCohorts'> }) {
  const content = useQuery(api.learn.adminCourseContent, { cohortId }) as Content | null | undefined
  const [session, setSession] = useState<SessionDraft | null>(null)
  const [week, setWeek] = useState<WeekDraft | null>(null)

  if (content === undefined) return <LoadingBlock />
  if (content === null) return <Callout tone="warning">This cohort no longer exists.</Callout>

  return (
    <div className="space-y-4">
      <Callout title="Everything here appears on learners' course page as soon as you save">
        {content.learners} paid {content.learners === 1 ? 'physio sees' : 'physios see'} it at{' '}
        <Link href="/learn/course" target="_blank" className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
          /learn/course <ExternalLink className="h-3 w-3" />
        </Link>
        . Calendar invites and emails point there too, so changing a meeting link never leaves anyone with an old one.
      </Callout>
      <div className="grid gap-4 xl:grid-cols-2">
        <SessionsPanel content={content} onEdit={(s) => setSession(draftForSession(s))} onAdd={() => setSession(draftForNewSession(content))} />
        <div className="space-y-4">
          <LinksPanel key={JSON.stringify(content.links)} cohortId={content.cohortId} links={content.links} />
          <WeeksPanel content={content} onEdit={(w) => setWeek(draftForWeek(w))} onAdd={() => setWeek(draftForNewWeek(content))} />
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <AssessmentSummary cohortId={content.cohortId} />
        <LearnersPanel cohortId={content.cohortId} />
      </div>
      <SessionDrawer cohortId={content.cohortId} learners={content.learners} draft={session} setDraft={setSession} />
      <WeekDrawer cohortId={content.cohortId} draft={week} setDraft={setWeek} />
      <p className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
        <Link2 className="h-3.5 w-3.5" /> Paid physios now see only the published video courses (Learn → Courses), until 90 days after the cohort ends. The sessions and weekly materials here aren’t shown to them.
      </p>
    </div>
  )
}
