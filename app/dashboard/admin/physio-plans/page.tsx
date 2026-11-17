'use client'

/**
 * Admin › Physio plans (owner spec 17 Nov 2026): every price, limit and date for Free and
 * Individual Pro, free-Pro grants with a reason, and the Plans report (convex/physioPlans.ts).
 */

import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Loader2 } from '@/components/icons'
import { AdminPage, PageHeader, Panel, StatTile, StatusBadge, inputClass, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { naira, type PhysioPlanSettings } from '@/lib/physioPlans'
import { cn } from '@/lib/utils'
import { planApi } from '@/components/physio/plan/planApi'

const errorText = (err: unknown) => {
  const data = (err as { data?: unknown })?.data
  return typeof data === 'string' ? data : 'Something went wrong. Please try again.'
}

type Field = { key: keyof PhysioPlanSettings; label: string; kind: 'naira' | 'number' | 'date'; hint?: string }
const FIELDS: { title: string; fields: Field[] }[] = [
  {
    title: 'Prices',
    fields: [
      { key: 'proPriceKobo', label: 'Individual Pro, a month', kind: 'naira' },
      { key: 'foundingPriceKobo', label: 'Founding price, a month', kind: 'naira' },
      { key: 'foundingMonths', label: 'Founding price lasts (months)', kind: 'number' },
      { key: 'foundingCutoff', label: 'Founding physios joined by', kind: 'date' },
      { key: 'joyPerPatientKobo', label: 'Joy per patient a month (Free)', kind: 'naira' },
      { key: 'scribeTopUpKobo', label: 'Scribe top-up price', kind: 'naira' },
      { key: 'scribeTopUpSessions', label: 'Sessions in a top-up', kind: 'number' },
    ],
  },
  {
    title: 'Limits',
    fields: [
      { key: 'freePatientsPerMonth', label: 'Free: patients a month', kind: 'number', hint: 'Different patients on programmes the physio covers' },
      { key: 'freeScribeSessions', label: 'Free: Scribe sessions a month', kind: 'number' },
      { key: 'proScribeSessions', label: 'Pro: Scribe sessions a month', kind: 'number' },
      { key: 'proJoyPatients', label: 'Pro: Joy patients included', kind: 'number' },
    ],
  },
  {
    title: 'Dates and billing',
    fields: [
      { key: 'launchDate', label: 'Pro opens', kind: 'date', hint: 'New physios are on Free limits from this day' },
      { key: 'limitsDate', label: 'Free limits for everyone', kind: 'date' },
      { key: 'reminderDays', label: 'Reminder before renewal (days)', kind: 'number' },
      { key: 'retryDays', label: 'Card retries (days)', kind: 'number' },
      { key: 'graceDays', label: 'Grace after retries (days)', kind: 'number' },
    ],
  },
]

const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'neutral' | 'teal'> = {
  active: 'green',
  scheduled: 'teal',
  past_due: 'amber',
  paused: 'neutral',
  cancelled: 'neutral',
  expired: 'red',
}

export default function PhysioPlansAdminPage() {
  const data = useQuery(planApi.adminOverview, {})
  const save = useMutation(planApi.adminSave)
  const grant = useMutation(planApi.adminGrant)
  const revoke = useMutation(planApi.adminRevoke)
  const [form, setForm] = useState<Record<string, string>>({})
  const [abroad, setAbroad] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [g, setG] = useState({ email: '', days: '30', reason: '' })

  useEffect(() => {
    if (!data || Object.keys(form).length) return
    const s = data.settings
    const next: Record<string, string> = {}
    for (const group of FIELDS)
      for (const f of group.fields) {
        const value = s[f.key]
        next[f.key] = f.kind === 'naira' ? String(Math.round(Number(value) / 100)) : String(value)
      }
    setForm(next)
    setAbroad(s.abroadFreePro)
  }, [data, form])

  const run = async (key: string, task: () => Promise<unknown>, done: string) => {
    setBusy(key)
    try {
      await task()
      toast.success(done)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  const saveSettings = () =>
    run(
      'save',
      () => {
        const args: Record<string, number | string | boolean> = { abroadFreePro: abroad }
        for (const group of FIELDS)
          for (const f of group.fields) {
            const raw = form[f.key]
            if (raw === undefined || raw === '') continue
            args[f.key] = f.kind === 'date' ? raw : f.kind === 'naira' ? Math.round(Number(raw) * 100) : Number(raw)
          }
        return save(args)
      },
      'Saved. Physios see the new numbers straight away.'
    )

  const counts = data?.counts ?? {}
  return (
    <AdminPage>
      <PageHeader title="Physio plans" description="Free and Individual Pro for independent physiotherapists: prices, limits, dates, free Pro and who is paying." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="On Pro" value={counts.active ?? 0} hint={`${counts.past_due ?? 0} past due`} />
        <StatTile label="Locked in" value={counts.scheduled ?? 0} hint="Charged when Pro opens" />
        <StatTile label="Monthly Pro revenue" value={data ? naira(data.monthlyKobo) : '—'} hint="Active, not cancelling" />
        <StatTile label="Paid this month" value={data ? naira(data.paidThisMonthKobo) : '—'} />
        <StatTile label="Free Pro grants" value={data?.grants.length ?? 0} />
      </div>

      <Panel title="Prices, limits and dates" description="Changes apply at once. Prices already charged don't change; renewals use the new price.">
        <div className="space-y-6 p-5">
          {FIELDS.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold text-rh-ink dark:text-white">{group.title}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.fields.map((f) => (
                  <label key={f.key} className="space-y-1 text-sm text-rh-ink dark:text-white">
                    <span>{f.label}</span>
                    <div className="relative">
                      {f.kind === 'naira' && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">₦</span>}
                      <input
                        type={f.kind === 'date' ? 'date' : 'number'}
                        min={0}
                        value={form[f.key] ?? ''}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                        className={cn(inputClass, f.kind === 'naira' && 'pl-7')}
                      />
                    </div>
                    {f.hint && <span className="block text-xs text-neutral-500">{f.hint}</span>}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm text-rh-ink dark:text-white">
            <input type="checkbox" checked={abroad} onChange={(e) => setAbroad(e.target.checked)} />
            Physios outside Nigeria get Pro free as testers
          </label>
          <button type="button" className={primaryButtonClass} disabled={busy !== null || !data} onClick={saveSettings}>
            {busy === 'save' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save
          </button>
        </div>
      </Panel>

      <Panel title="Give free Pro" description="For testers, partners or to make up for a problem. They get Pro until the end date, then their own plan.">
        <form
          className="grid gap-3 p-5 sm:grid-cols-[1.3fr_0.5fr_1.5fr_auto]"
          onSubmit={(e) => {
            e.preventDefault()
            run(
              'grant',
              async () => {
                await grant({ email: g.email, days: Number(g.days), reason: g.reason })
                setG({ email: '', days: '30', reason: '' })
              },
              'Free Pro given'
            )
          }}
        >
          <input value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} placeholder="Physio's email" aria-label="Physio's email" className={inputClass} />
          <input type="number" min={1} max={730} value={g.days} onChange={(e) => setG({ ...g, days: e.target.value })} aria-label="Days" className={inputClass} />
          <input value={g.reason} onChange={(e) => setG({ ...g, reason: e.target.value })} placeholder="Why" aria-label="Reason" className={inputClass} />
          <button type="submit" className={primaryButtonClass} disabled={busy !== null}>
            {busy === 'grant' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Give Pro
          </button>
        </form>
        {data && data.grants.length > 0 && (
          <ul className="divide-y divide-black/[0.05] border-t border-black/[0.05] dark:divide-white/[0.06] dark:border-white/[0.06]">
            {data.grants.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-rh-ink dark:text-white">{x.name}</span>
                  <span className="text-neutral-500"> · {x.email} · until {format(x.until, 'd MMM yyyy')} · {x.reason}</span>
                </span>
                <button type="button" className={softButtonClass} onClick={() => run(`r-${x.id}`, () => revoke({ grantId: x.id }), 'Grant ended')}>
                  End
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Pro physios">
        {!data ? (
          <p className="p-5 text-sm text-neutral-500">Loading…</p>
        ) : data.subscriptions.length === 0 ? (
          <p className="p-5 text-sm text-neutral-500">Nobody has chosen Pro yet.</p>
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {data.subscriptions.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-rh-ink dark:text-white">{x.name}</span>
                  <span className="text-neutral-500"> · {x.email}</span>
                  <span className="block text-xs text-neutral-500">
                    {x.founding ? 'Founding · ' : ''}
                    {naira(x.priceKobo)} a month
                    {x.periodEnd ? ` · ${x.cancelAtPeriodEnd ? 'ends' : 'renews'} ${format(x.periodEnd, 'd MMM yyyy')}` : ''}
                    {x.lastError ? ` · last card error: ${x.lastError}` : ''}
                  </span>
                </span>
                <StatusBadge tone={STATUS_TONE[x.status] ?? 'neutral'}>{x.status.replace('_', ' ')}</StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </AdminPage>
  )
}
