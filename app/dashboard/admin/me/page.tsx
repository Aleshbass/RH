'use client'

/**
 * Admin › My page (owner 2026-11-17): what this admin tracks every day. They tick widgets from
 * everything on the platform (lib/adminWidgets.ts); admins limited to some pages only get widgets
 * for those. Numbers come from convex/adminMyPage.ts and update live.
 */

import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { formatDistanceToNowStrict } from 'date-fns'
import { toast } from 'sonner'
import { ArrowRight, Check, Loader2, Search, SlidersHorizontal, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { AdminPage, PageHeader, Panel, checkboxClass, fieldClass, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { ContactLinks } from '@/components/admin/contactLinks'
import { useAdminAccess } from '@/components/admin/shell/consoleRole'
import { ADMIN_WIDGETS, DEFAULT_ADMIN_WIDGETS, widgetAllowed, type AdminWidget, type AdminWidgetGroup, type AdminWidgetKey } from '@/lib/adminWidgets'
import { naira } from '@/lib/physioPlans'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Summary = Record<string, any> | null
type Contact = { kind: 'physio' | 'clinic'; id: string; name: string; detail: string | null; phone: string | null; email: string | null; href: string }

// By name: the generated api type is at TypeScript's depth limit (TS2589)
const meRef = makeFunctionReference<'query', Record<string, never>, { full: boolean; pages: string[]; widgets: string[] | null } | null>('adminAccess:me')
const myUserRef = makeFunctionReference<'query', Record<string, never>, { firstName?: string } | null>('users:getMyUser')
const summaryRef = makeFunctionReference<'query', { widgets: string[] }, Summary>('adminMyPage:summary')
const contactsRef = makeFunctionReference<'query', { term: string }, Contact[]>('adminMyPage:contacts')
const saveRef = makeFunctionReference<'mutation', { widgets: string[] }, null>('adminAccess:saveMyWidgets')

const GROUPS: AdminWidgetGroup[] = ['Clinics & growth', 'People', 'Care', 'Money', 'Platform']

function greeting() {
  const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Africa/Lagos' }))
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function Big({ value, label, tone }: { value: ReactNode; label: string; tone?: 'warn' | 'good' }) {
  return (
    <div className="min-w-0">
      <p
        className={cn(
          'text-2xl font-semibold tabular-nums tracking-tight text-rh-ink dark:text-white',
          tone === 'warn' && 'text-[#be123c] dark:text-rose-300',
          tone === 'good' && 'text-[#047857] dark:text-rh-lime'
        )}
      >
        {value}
      </p>
      <p className="truncate text-xs text-neutral-500">{label}</p>
    </div>
  )
}

function Card({ widget, children, wide }: { widget: AdminWidget; children: ReactNode; wide?: boolean }) {
  return (
    <section className={cn('flex flex-col rounded-2xl border border-black/[0.04] bg-white p-4 shadow-soft dark:border-white/[0.06] dark:bg-rh-ink-2 dark:shadow-none', wide && 'md:col-span-2')}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-rh-ink dark:text-white">{widget.title}</h3>
        <Link href={widget.pages[0]} className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-rh-ink dark:hover:text-white">
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="flex-1">{children}</div>
    </section>
  )
}

function QuickContact() {
  const [term, setTerm] = useState('')
  const deferred = useDeferredValue(term.trim())
  const results = useQuery(contactsRef, deferred.length >= 2 ? { term: deferred } : 'skip')
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Physio or clinic name, email or ID" aria-label="Find a physio or clinic" className={cn(fieldClass, 'pl-9')} />
      </div>
      {deferred.length >= 2 && results === undefined && <p className="text-xs text-neutral-500">Searching…</p>}
      {results && results.length === 0 && <p className="text-xs text-neutral-500">Nobody matches.</p>}
      <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
        {results?.map((r) => (
          <li key={`${r.kind}-${r.id}`} className="flex items-center justify-between gap-2 py-2">
            <Link href={r.href} className="min-w-0 hover:underline">
              <span className="block truncate text-sm font-medium text-rh-ink dark:text-white">{r.name}</span>
              <span className="block truncate text-xs text-neutral-500">
                {r.kind === 'clinic' ? 'Clinic' : 'Physio'}
                {r.detail ? ` · ${r.detail}` : ''}
              </span>
            </Link>
            <ContactLinks phone={r.phone} email={r.email} name={r.name} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function WidgetBody({ widget, data }: { widget: AdminWidget; data: any }) {
  if (widget.key === 'contacts') return <QuickContact />
  if (data === undefined) return <div className="h-12 animate-pulse rounded-xl bg-rh-canvas dark:bg-white/[0.04]" />
  if (data === null) return <p className="text-xs text-neutral-500">Not available.</p>
  const grid = (items: ReactNode) => <div className="grid grid-cols-3 gap-3">{items}</div>
  switch (widget.key) {
    case 'sessions':
      return grid(
        <>
          <Big value={data.completed} label="Completed, all time" tone="good" />
          <Big value={data.upcoming} label="Coming up" />
          <Big value={data.overdue} label="Past, not marked" tone={data.overdue ? 'warn' : undefined} />
        </>
      )
    case 'journeys':
      return grid(
        <>
          <Big value={data.inTreatment} label="In treatment" />
          <Big value={data.attention} label="Need attention" tone={data.attention ? 'warn' : undefined} />
          <Big value={data.physioUnpaid} label="Physio not paid yet" />
        </>
      )
    case 'signups':
      return grid(
        <>
          <Big value={data.physios} label="Physios this week" />
          <Big value={data.patients} label="Patients" />
          <Big value={data.clinics} label="Clinic owners" />
        </>
      )
    case 'clinicSignups':
      return (
        <div className="space-y-2">
          <Big value={data.count} label="New clinics this week" />
          <ul className="space-y-1 text-xs">
            {data.latest.map((c: any) => (
              <li key={c.id} className="flex justify-between gap-2">
                <Link href={`/dashboard/admin/clinics/${c.id}`} className="truncate font-medium text-rh-ink hover:underline dark:text-white">
                  {c.name}
                </Link>
                <span className="shrink-0 text-neutral-500">{formatDistanceToNowStrict(c.at, { addSuffix: true })}</span>
              </li>
            ))}
          </ul>
        </div>
      )
    case 'clinicPlans':
      return grid(
        <>
          <Big value={data.onPlan} label="On a plan" />
          <Big value={data.pastDue + data.readOnly} label={`Past due${data.readOnly ? ` (${data.readOnly} read-only)` : ''}`} tone={data.pastDue + data.readOnly ? 'warn' : undefined} />
          <Big value={naira(data.owedKobo)} label="Owed" />
        </>
      )
    case 'outreach':
      return (
        <div className="space-y-2">
          {grid(
            <>
              <Big value={data.repliesThisWeek} label="Replies this week" tone={data.repliesThisWeek ? 'good' : undefined} />
              <Big value={data.sentToday} label="Sent today" />
              <Big value={data.inSequence} label="In a sequence" />
            </>
          )}
          <p className="text-xs text-neutral-500">
            Sending is <span className={cn('font-semibold', data.sendingOn ? 'text-[#047857] dark:text-rh-lime' : 'text-[#b4690e]')}>{data.sendingOn ? 'on' : 'off'}</span>
            {data.latestReply && ` · last reply ${formatDistanceToNowStrict(data.latestReply.at, { addSuffix: true })}`}
          </p>
        </div>
      )
    case 'emails':
      return data.latest.length === 0 ? (
        <p className="text-xs text-neutral-500">No campaigns yet.</p>
      ) : (
        <ul className="space-y-2">
          {data.latest.map((c: any) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-rh-ink dark:text-white">{c.subject}</span>
                <span className="text-neutral-500">{formatDistanceToNowStrict(c.at, { addSuffix: true })} · {c.status}</span>
              </span>
              <span className="shrink-0 text-right tabular-nums text-neutral-500">
                <span className="font-semibold text-rh-ink dark:text-white">{c.sent}</span> sent
                {c.opened !== null && (
                  <>
                    {' '}
                    · <span className="font-semibold text-rh-ink dark:text-white">{c.opened}</span> opened
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )
    case 'physioPro':
      return grid(
        <>
          <Big value={data.active} label="On Pro" tone="good" />
          <Big value={data.scheduled} label="Locked in" />
          <Big value={data.pastDue} label="Past due" tone={data.pastDue ? 'warn' : undefined} />
        </>
      )
    case 'payouts':
      return grid(
        <>
          <Big value={data.waiting} label="Waiting" />
          <Big value={naira(data.waitingKobo)} label="To pay out" />
          <Big value={data.failed} label="Failed" tone={data.failed ? 'warn' : undefined} />
        </>
      )
    case 'awadoc':
      return (
        <div className="space-y-1.5">
          <Big value={data.errors} label={`Failed of ${data.total} in the last day`} tone={data.errors ? 'warn' : 'good'} />
          {data.lastError && <p className="truncate text-xs text-neutral-500">{data.lastError}</p>}
        </div>
      )
    default:
      return <Big value={data.count} label={widget.hint} tone={data.count ? 'warn' : undefined} />
  }
}

export default function MyPage() {
  const access = useAdminAccess()
  const me = useQuery(meRef, {})
  const user = useQuery(myUserRef, {})
  const save = useMutation(saveRef)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<AdminWidgetKey[]>([])
  const [saving, setSaving] = useState(false)

  const allowed = useMemo(() => ADMIN_WIDGETS.filter((w) => widgetAllowed(w, access)), [access])
  const chosen = useMemo<AdminWidgetKey[]>(() => {
    const saved = me?.widgets as AdminWidgetKey[] | null | undefined
    const keys = saved ?? DEFAULT_ADMIN_WIDGETS
    const ok = keys.filter((k) => allowed.some((w) => w.key === k))
    // Nothing they can see yet: their first few
    return ok.length ? ok : allowed.slice(0, 6).map((w) => w.key)
  }, [me, allowed])
  const summary = useQuery(summaryRef, me === undefined ? 'skip' : { widgets: chosen })

  useEffect(() => {
    if (editing) setDraft(chosen)
  }, [editing, chosen])

  const toggle = (key: AdminWidgetKey) => setDraft((d) => (d.includes(key) ? d.filter((k) => k !== key) : [...d, key]))
  const onSave = async () => {
    setSaving(true)
    try {
      // Keep the order of the list, so groups stay together
      await save({ widgets: ADMIN_WIDGETS.map((w) => w.key).filter((k) => draft.includes(k)) })
      playSound('success')
      toast.success('Your page is saved.')
      setEditing(false)
    } catch {
      toast.error('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const widgets = chosen.map((k) => ADMIN_WIDGETS.find((w) => w.key === k)!).filter(Boolean)

  return (
    <AdminPage>
      <PageHeader
        title={`${greeting()}${user?.firstName ? `, ${user.firstName}` : ''}`}
        description="Your page: the things you track every day. Choose what's on it."
        actions={
          <Button type="button" className={softButtonClass} onClick={() => setEditing((e) => !e)}>
            {editing ? <X className="h-4 w-4" /> : <SlidersHorizontal className="h-4 w-4" />} {editing ? 'Close' : 'Choose widgets'}
          </Button>
        }
      />

      {editing && (
        <Panel title="Choose widgets" description={access.full ? 'Everything on the platform.' : 'Widgets for the pages you can open.'}>
          <div className="space-y-4 p-5 pt-2">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {GROUPS.map((group) => {
                const items = allowed.filter((w) => w.group === group)
                if (!items.length) return null
                return (
                  <div key={group}>
                    <p className="pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{group}</p>
                    <div className="space-y-0.5">
                      {items.map((w) => (
                        <label key={w.key} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-rh-canvas dark:hover:bg-white/[0.04]">
                          <input type="checkbox" className={cn(checkboxClass, 'mt-0.5')} checked={draft.includes(w.key)} onChange={() => toggle(w.key)} />
                          <span>
                            <span className="block text-sm font-medium text-rh-ink dark:text-white">{w.title}</span>
                            <span className="block text-xs text-neutral-500">{w.hint}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-end gap-2 border-t border-black/[0.05] pt-4 dark:border-white/[0.06]">
              <Button type="button" className={softButtonClass} onClick={() => setDraft(allowed.map((w) => w.key))}>
                Tick all
              </Button>
              <Button type="button" className={primaryButtonClass} onClick={onSave} disabled={saving || draft.length === 0}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save my page
              </Button>
            </div>
          </div>
        </Panel>
      )}

      {allowed.length === 0 ? (
        <Panel>
          <p className="p-8 text-center text-sm text-neutral-500">No widgets for your pages yet. A full admin can add pages for you in Admin access.</p>
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {widgets.map((w) => (
            <Card key={w.key} widget={w} wide={w.key === 'contacts' || w.key === 'emails'}>
              <WidgetBody widget={w} data={summary === undefined ? undefined : summary?.[w.key] ?? null} />
            </Card>
          ))}
        </div>
      )}
    </AdminPage>
  )
}
