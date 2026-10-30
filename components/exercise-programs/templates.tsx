'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { toast } from 'sonner'
import { BookOpen, Building2, Copy, Dumbbell, Flag, Globe, Layers, Loader2, Lock, Pencil, Plus, Search, Send, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState, PhysioDrawer, StatusBadge, fieldClass, primaryButtonClass, secondaryButtonClass, softButtonClass } from '@/components/physio/ui'
import { TierBadge } from '@/components/rewards/TierBadge'
import type { Id } from '@/convex/_generated/dataModel'
import { REGIONS } from '@/lib/outcomes/stats'
import type { TierKey } from '@/lib/rewards/rules'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import type { CareTeamProgram } from './types'

/**
 * Programme templates: named home programmes a physio keeps and reuses ("Knee OA, early
 * loading"), private, shared with their clinic, or open to every physio on Rehabify. Others can
 * use one for a patient or copy it; the author is credited and earns points (convex/exercisePrograms.ts).
 */

export type TemplateVisibility = 'private' | 'clinic' | 'public'
export type TemplateScope = 'mine' | 'clinic' | 'community'

export type TemplateRow = {
  _id: Id<'programTemplates'>
  title: string
  description: string | null
  bodyRegion: string | null
  visibility: TemplateVisibility
  mine: boolean
  copied: boolean
  author: { name: string; tierKey: TierKey; tierName: string }
  sendCount: number
  copyCount: number
  usedBy: number
  exerciseCount: number
  educationCount: number
  preview: string[]
  hidden: boolean
  updatedAt: number
}

export type TemplateDetail = TemplateRow & {
  goals: string[]
  note: string | null
  items: CareTeamProgram['items']
  privateOwn: { _id: Id<'exercises'>; name: string; inReview: boolean }[]
}

export type TemplateItemInput = {
  exerciseId?: Id<'exercises'>
  kind?: 'exercise' | 'education'
  name?: string
  side?: 'L' | 'R'
  sets?: number
  reps?: number
  holdSeconds?: number
  frequency?: string
  note?: string
  resourceKey?: string
}

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const q = <Args extends Record<string, unknown>, Result>(name: string) => makeFunctionReference<'query', Args, Result>(name)
const m = <Args extends Record<string, unknown>, Result>(name: string) => makeFunctionReference<'mutation', Args, Result>(name)

export const templateRefs = {
  list: q<{ scope: TemplateScope }, TemplateRow[] | null>('exercisePrograms:listProgramTemplates'),
  get: q<{ templateId: Id<'programTemplates'> }, TemplateDetail | null>('exercisePrograms:getProgramTemplate'),
  save: m<
    {
      templateId?: Id<'programTemplates'>
      title: string
      description?: string
      bodyRegion?: string
      goals?: string[]
      note?: string
      items: TemplateItemInput[]
      visibility: TemplateVisibility
    },
    { templateId: Id<'programTemplates'> }
  >('exercisePrograms:saveProgramTemplate'),
  copy: m<{ templateId: Id<'programTemplates'> }, { templateId: Id<'programTemplates'> }>('exercisePrograms:copyProgramTemplate'),
  archive: m<{ templateId: Id<'programTemplates'> }, { ok: boolean }>('exercisePrograms:archiveProgramTemplate'),
  report: m<{ templateId: Id<'programTemplates'>; reason: string }, { ok: boolean }>('exercisePrograms:reportProgramTemplate'),
}

const errorText = (error: unknown, fallback: string) =>
  error instanceof ConvexError && typeof error.data === 'string' ? error.data : fallback

export const VISIBILITY: Record<TemplateVisibility, { label: string; hint: string; icon: typeof Lock }> = {
  private: { label: 'Only me', hint: 'Just for you', icon: Lock },
  clinic: { label: 'My clinic', hint: 'Your clinic team can use it', icon: Building2 },
  public: { label: 'Every physio', hint: 'Any physio on Rehabify can use or copy it, with credit to you', icon: Globe },
}

/** Private / clinic / everyone, as three big choices. */
export function VisibilityChoice({
  value,
  onChange,
  hasClinic,
}: {
  value: TemplateVisibility
  onChange: (v: TemplateVisibility) => void
  hasClinic: boolean
}) {
  const options = (Object.keys(VISIBILITY) as TemplateVisibility[]).filter((v) => v !== 'clinic' || hasClinic)
  return (
    <div className="grid gap-2">
      {options.map((v) => {
        const Icon = VISIBILITY[v].icon
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            className={cn(
              'flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition',
              value === v ? 'bg-pt-primary text-pt-on-primary' : 'bg-pt-sunken text-pt-ink hover:bg-pt-hover'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{VISIBILITY[v].label}</span>
              <span className={cn('block text-xs', value === v ? 'opacity-75' : 'text-pt-muted')}>{VISIBILITY[v].hint}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function RegionChips({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {REGIONS.filter((r) => r !== 'Other').map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(value === r ? null : r)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition',
            value === r ? 'bg-pt-primary text-pt-on-primary' : 'bg-pt-sunken text-pt-muted hover:text-pt-ink'
          )}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

function counts(t: TemplateRow) {
  const parts = []
  if (t.exerciseCount) parts.push(`${t.exerciseCount} exercise${t.exerciseCount === 1 ? '' : 's'}`)
  if (t.educationCount) parts.push(`${t.educationCount} education`)
  return parts.join(' · ')
}

function TemplateCard({ t, onOpen }: { t: TemplateRow; onOpen: () => void }) {
  const Vis = VISIBILITY[t.visibility].icon
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full flex-col rounded-3xl border border-pt-line bg-pt-surface p-4 text-left transition hover:-translate-y-0.5 hover:shadow-pt-lift active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[15px] font-semibold leading-snug text-pt-ink">{t.title}</p>
        {t.mine && <Vis className="mt-1 h-3.5 w-3.5 shrink-0 text-pt-faint" aria-label={VISIBILITY[t.visibility].label} />}
      </div>
      <p className="mt-1 line-clamp-2 text-[13px] text-pt-muted">{t.preview.join(' · ')}</p>
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-3 text-xs text-pt-muted">
        {!t.mine || t.copied ? (
          <span className="inline-flex items-center gap-1.5">
            {t.author.name}
            <TierBadge tier={t.author.tierKey} name={t.author.tierName} />
          </span>
        ) : null}
        <span>{counts(t)}</span>
        {t.usedBy > 0 && <span>Used by {t.usedBy}</span>}
        {t.bodyRegion && <StatusBadge tone="neutral">{t.bodyRegion}</StatusBadge>}
      </div>
    </button>
  )
}

/** Library → Templates: yours, your clinic's and the community's, with search and body area. */
export function TemplatesTab({
  hasClinic,
  onUse,
  onNew,
  onEdit,
}: {
  hasClinic: boolean
  onUse: (templateId: Id<'programTemplates'>) => void
  onNew: () => void
  onEdit: (templateId: Id<'programTemplates'>) => void
}) {
  const [scope, setScope] = useState<TemplateScope>('mine')
  const rows = useQuery(templateRefs.list, { scope })
  const [search, setSearch] = useState('')
  const [region, setRegion] = useState<string | null>(null)
  const [open, setOpen] = useState<Id<'programTemplates'> | null>(null)

  const list = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (rows ?? []).filter(
      (t) =>
        (!region || t.bodyRegion === region) &&
        (!term || `${t.title} ${t.description ?? ''} ${t.preview.join(' ')} ${t.author.name}`.toLowerCase().includes(term))
    )
  }, [rows, search, region])

  const scopes: { key: TemplateScope; label: string }[] = [
    { key: 'mine', label: 'Mine' },
    ...(hasClinic ? [{ key: 'clinic' as const, label: 'My clinic' }] : []),
    { key: 'community', label: 'Community' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-full bg-pt-sunken p-1" role="tablist">
          {scopes.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={scope === s.key}
              onClick={() => setScope(s.key)}
              className={cn('h-8 rounded-full px-4 text-sm font-semibold transition', scope === s.key ? 'bg-pt-surface text-pt-ink shadow-sm' : 'text-pt-muted')}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pt-faint" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates" className={cn(fieldClass, 'h-10 pl-9')} />
          </div>
          <Button className={cn(primaryButtonClass, 'h-10')} onClick={onNew}>
            <Plus className="mr-1.5 h-4 w-4" />
            New
          </Button>
        </div>
      </div>
      <RegionChips value={region} onChange={setRegion} />

      {rows === undefined ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-3xl bg-pt-sunken" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Layers />}
          title={scope === 'mine' ? 'No templates yet' : scope === 'clinic' ? 'Nothing shared in your clinic yet' : 'No community templates yet'}
          description={
            scope === 'mine'
              ? 'When you send a programme, tick “Save as a template” to reuse it next time. Or start one here.'
              : scope === 'community'
                ? 'Share one of yours with every physio. You earn points each time another physio uses it.'
                : 'Templates your clinic team shares show here.'
          }
          action={
            scope === 'mine' ? (
              <Button className={primaryButtonClass} onClick={onNew}>
                <Plus className="mr-1.5 h-4 w-4" />
                New template
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((t) => (
            <TemplateCard key={t._id} t={t} onOpen={() => setOpen(t._id)} />
          ))}
        </div>
      )}

      <TemplateDrawer
        templateId={open}
        onClose={() => setOpen(null)}
        onUse={(id) => {
          setOpen(null)
          onUse(id)
        }}
        onEdit={(id) => {
          setOpen(null)
          onEdit(id)
        }}
        onCopied={(id) => {
          setScope('mine')
          setOpen(id)
        }}
      />
    </div>
  )
}

export function TemplateDrawer({
  templateId,
  onClose,
  onUse,
  onEdit,
  onCopied,
}: {
  templateId: Id<'programTemplates'> | null
  onClose: () => void
  onUse: (id: Id<'programTemplates'>) => void
  onEdit?: (id: Id<'programTemplates'>) => void
  onCopied?: (id: Id<'programTemplates'>) => void
}) {
  const t = useQuery(templateRefs.get, templateId ? { templateId } : 'skip')
  const copy = useMutation(templateRefs.copy)
  const archive = useMutation(templateRefs.archive)
  const report = useMutation(templateRefs.report)
  const [busy, setBusy] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState('')

  async function run(key: string, action: () => Promise<unknown>, done: string) {
    setBusy(key)
    try {
      await action()
      playSound('success')
      toast.success(done)
    } catch (error) {
      playSound('error')
      toast.error(errorText(error, 'That didn’t work. Try again.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <PhysioDrawer
      open={Boolean(templateId)}
      onOpenChange={(o) => {
        if (!o) {
          onClose()
          setReporting(false)
          setReason('')
        }
      }}
      title={t?.title ?? 'Template'}
      description={t ? [t.bodyRegion, counts(t)].filter(Boolean).join(' · ') : undefined}
      footer={
        t && (
          <div className="grid grid-cols-2 gap-2">
            <Button className={cn(primaryButtonClass, 'h-11', t.mine && 'col-span-2')} onClick={() => onUse(t._id)}>
              <Send className="mr-1.5 h-4 w-4" />
              Use for a patient
            </Button>
            {!t.mine && (
              <Button
                variant="outline"
                className={cn(secondaryButtonClass, 'h-11')}
                disabled={busy === 'copy'}
                onClick={() =>
                  void run(
                    'copy',
                    async () => {
                      const res = await copy({ templateId: t._id })
                      onCopied?.(res.templateId)
                    },
                    `Copied to your templates. ${t.author.name} keeps the credit.`
                  )
                }
              >
                {busy === 'copy' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="mr-1.5 h-4 w-4" />}
                Copy to mine
              </Button>
            )}
          </div>
        )
      }
    >
      {t === undefined ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-pt-muted" />
        </div>
      ) : t === null ? (
        <p className="py-8 text-center text-sm text-pt-muted">This template isn’t available any more.</p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm text-pt-muted">
            {(!t.mine || t.copied) && (
              <span className="inline-flex items-center gap-1.5">
                By {t.author.name}
                <TierBadge tier={t.author.tierKey} name={t.author.tierName} />
              </span>
            )}
            {t.mine && <StatusBadge tone="neutral">{VISIBILITY[t.visibility].label}</StatusBadge>}
            {t.usedBy > 0 && <span>Used by {t.usedBy} {t.usedBy === 1 ? 'physio' : 'physios'}</span>}
            {t.copyCount > 0 && <span>· Copied {t.copyCount}×</span>}
          </div>
          {t.description && <p className="text-[15px] leading-relaxed text-pt-ink">{t.description}</p>}

          {t.privateOwn.length > 0 && (
            <p className="rounded-2xl bg-pt-sunken/70 px-4 py-3 text-[13px] leading-relaxed text-pt-muted">
              Others see {t.privateOwn.map((e) => e.name).join(', ')} by name, dose and steps only. Offer{' '}
              {t.privateOwn.length === 1 ? 'it' : 'them'} to the Rehabify library from My exercises to share your video too
              {t.privateOwn.some((e) => e.inReview) ? ' (some are already in review)' : ''}.
            </p>
          )}

          <ol className="space-y-2">
            {t.items.map((item) => (
              <li key={item.index} className="flex items-start gap-3 rounded-2xl border border-pt-line px-4 py-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-pt-sunken text-pt-muted">
                  {item.kind === 'education' ? <BookOpen className="h-3.5 w-3.5" /> : <Dumbbell className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-pt-ink">
                    {item.name}
                    {item.side ? ` · ${item.side === 'L' ? 'left' : 'right'}` : ''}
                  </span>
                  {item.kind !== 'education' && (
                    <span className="block text-xs text-pt-muted">
                      {[item.sets && item.reps ? `${item.sets} × ${item.reps}` : null, item.holdSeconds ? `hold ${item.holdSeconds}s` : null, item.frequency]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                  {item.note && <span className="mt-1 block text-xs leading-relaxed text-pt-muted">{item.note}</span>}
                </span>
              </li>
            ))}
          </ol>

          {t.goals.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-pt-faint">Goals</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-pt-ink">
                {t.goals.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          )}

          {t.mine ? (
            <div className="flex flex-wrap gap-2">
              {onEdit && (
                <Button size="sm" className={cn(softButtonClass, 'h-9')} onClick={() => onEdit(t._id)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
              <Button
                size="sm"
                className={cn(softButtonClass, 'h-9')}
                disabled={busy === 'archive'}
                onClick={() =>
                  void run(
                    'archive',
                    async () => {
                      await archive({ templateId: t._id })
                      onClose()
                    },
                    'Template removed'
                  )
                }
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Remove
              </Button>
            </div>
          ) : reporting ? (
            <div className="space-y-2">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What’s wrong with it?" className={cn(fieldClass, 'h-10')} />
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="h-9" onClick={() => setReporting(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className={cn(softButtonClass, 'h-9')}
                  disabled={!reason.trim() || busy === 'report'}
                  onClick={() =>
                    void run(
                      'report',
                      async () => {
                        await report({ templateId: t._id, reason })
                        setReporting(false)
                      },
                      'Thanks. The Rehabify team will look at it.'
                    )
                  }
                >
                  Send report
                </Button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setReporting(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-pt-faint hover:text-pt-ink">
              <Flag className="h-3 w-3" />
              Report a problem
            </button>
          )}
        </div>
      )}
    </PhysioDrawer>
  )
}

/** Inside the programme builder: pick a template to start from. */
export function TemplatePickerDrawer({
  open,
  onOpenChange,
  onPick,
  hasClinic,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (templateId: Id<'programTemplates'>) => void
  hasClinic: boolean
}) {
  const [scope, setScope] = useState<TemplateScope>('mine')
  const rows = useQuery(templateRefs.list, open ? { scope } : 'skip')
  const [search, setSearch] = useState('')
  const list = (rows ?? []).filter((t) => !search.trim() || `${t.title} ${t.preview.join(' ')}`.toLowerCase().includes(search.trim().toLowerCase()))
  return (
    <PhysioDrawer open={open} onOpenChange={onOpenChange} title="Start from a template" description="Its exercises, doses and notes load in. Change anything before you send.">
      <div className="space-y-3">
        <div className="inline-flex rounded-full bg-pt-sunken p-1">
          {(['mine', ...(hasClinic ? ['clinic'] : []), 'community'] as TemplateScope[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={cn('h-8 rounded-full px-3.5 text-sm font-semibold transition', scope === s ? 'bg-pt-surface text-pt-ink shadow-sm' : 'text-pt-muted')}
            >
              {s === 'mine' ? 'Mine' : s === 'clinic' ? 'My clinic' : 'Community'}
            </button>
          ))}
        </div>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className={cn(fieldClass, 'h-10')} />
        {rows === undefined ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-pt-muted" />
          </div>
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-sm text-pt-muted">No templates here yet.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((t) => (
              <li key={t._id}>
                <button
                  type="button"
                  onClick={() => onPick(t._id)}
                  className="w-full rounded-2xl border border-pt-line px-4 py-3 text-left transition hover:bg-pt-hover"
                >
                  <span className="block text-sm font-semibold text-pt-ink">{t.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-pt-muted">
                    {counts(t)}
                    {!t.mine ? ` · by ${t.author.name}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PhysioDrawer>
  )
}
