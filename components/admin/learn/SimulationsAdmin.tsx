'use client'

/**
 * Admin › Learn › Simulations. Cases come from the repo (content/sim-cases) as drafts. A physio
 * (admin or Learn instructor) play-tests and signs off each version; an admin publishes it.
 * Also shows how learners play each case and the "Sim Pass" interest count.
 */

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { BarChart3, CheckCircle2, ExternalLink, HeartPulse, Loader2, RefreshCw, ShieldCheck, Users } from '@/components/icons'
import { useConsoleRole } from '@/components/admin/shell/consoleRole'
import { hasLearnAdmin } from '@/components/admin/shell/adminNav'
import { AdminPage, EmptyState, inputClass, PageHeader, Panel, primaryButtonClass, softButtonClass, StatTile, StatusBadge } from '@/components/admin/ui'
import { AdminDrawer, Field } from '@/components/admin/learn/drawer'
import { LoadingBlock, textareaClass } from '@/components/admin/partners/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { simApi, type SimAdminCase } from '@/components/learn/sims/simApi'
import { learnUrl } from '@/lib/site-hosts'
import { cn } from '@/lib/utils'

const errorText = (err: unknown, fallback: string) => {
  const data = (err as { data?: unknown })?.data
  return typeof data === 'string' && data ? data : fallback
}

const TAG_BAR: Record<string, string> = {
  critical: 'bg-rh-ink dark:bg-rh-lime',
  'high-yield': 'bg-emerald-500',
  neutral: 'bg-neutral-400',
  wasteful: 'bg-amber-400',
  harmful: 'bg-rose-500',
}

function SignOffDrawer({ item, onClose }: { item: SimAdminCase | null; onClose: () => void }) {
  const signOff = useMutation(simApi.adminSignOff)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!item) return
    setBusy(true)
    try {
      await signOff({ slug: item.slug, reviewerName: name, note: note || undefined })
      toast.success(`Version ${item.version} signed off`)
      setChecked(false)
      setNote('')
      onClose()
    } catch (err) {
      toast.error(errorText(err, 'Couldn’t sign off.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <AdminDrawer
      open={Boolean(item)}
      onOpenChange={(open) => !open && onClose()}
      title={item ? `Sign off: ${item.title}` : 'Sign off'}
      description={item ? `Version ${item.version}. Play-test it first, then confirm the clinical content is right.` : undefined}
      footer={
        <Button onClick={() => void submit()} disabled={!checked || name.trim().length < 3 || busy} className={primaryButtonClass}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Sign off version {item?.version}
        </Button>
      }
    >
      {item && (
        <div className="space-y-5">
          <a
            href={learnUrl(`/simulations/${item.slug}?preview=1`)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-rh-ink underline-offset-4 hover:underline dark:text-white"
          >
            Play-test this version <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <div>
            <p className="text-sm font-semibold text-rh-ink dark:text-white">References in this case</p>
            <ul className="mt-2 space-y-1.5 text-sm text-neutral-600 dark:text-neutral-300">
              {item.references.map((r) => (
                <li key={r.label}>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {r.label}
                    </a>
                  ) : (
                    r.label
                  )}
                </li>
              ))}
            </ul>
          </div>
          <Field label="Reviewing physiotherapist" htmlFor="sim-reviewer" hint="Full name and credentials, e.g. Mary Akinwola, BPT, MSc">
            <Input id="sim-reviewer" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Note (optional)" htmlFor="sim-note">
            <textarea id="sim-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} className={textareaClass} />
          </Field>
          <label className="flex items-start gap-3 rounded-2xl bg-rh-canvas p-4 text-sm text-rh-ink dark:bg-white/[0.04] dark:text-white">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-4 w-4" />
            I’ve played this version and checked the clinical content, scoring and feedback against the references.
          </label>
        </div>
      )}
    </AdminDrawer>
  )
}

function CaseStats({ slug }: { slug: string }) {
  const stats = useQuery(simApi.adminStats, { slug })
  if (stats === undefined) return <LoadingBlock />
  if (!stats) return null
  if (stats.started === 0) return <p className="text-sm text-neutral-500">No plays yet.</p>
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 text-xs">
        <StatusBadge>{stats.started} started</StatusBadge>
        <StatusBadge>{stats.finished} finished</StatusBadge>
        <StatusBadge tone="green">{stats.passed} passed</StatusBadge>
        {Object.entries(stats.outcomes).map(([outcome, count]) => (
          <StatusBadge key={outcome} tone={outcome === 'good' ? 'green' : outcome === 'harm' ? 'red' : 'amber'}>
            {count} {outcome}
          </StatusBadge>
        ))}
      </div>
      {stats.nodes.map((node) => {
        const total = node.choices.reduce((sum, c) => sum + c.count, 0)
        return (
          <div key={node.id} className="rounded-2xl border border-black/[0.06] p-4 dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-rh-ink dark:text-white">{node.prompt}</p>
              {node.stoppedHere > 0 && <StatusBadge tone="amber">{node.stoppedHere} stopped here</StatusBadge>}
            </div>
            <ul className="mt-3 space-y-2">
              {node.choices.map((c) => (
                <li key={c.id} className="text-xs">
                  <div className="flex justify-between gap-3 text-neutral-600 dark:text-neutral-300">
                    <span className="min-w-0 truncate">{c.label}</span>
                    <span className="shrink-0 tabular-nums">{c.count}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.06]">
                    <div className={cn('h-full rounded-full', TAG_BAR[c.tag] ?? 'bg-neutral-400')} style={{ width: total ? `${(c.count / total) * 100}%` : '0%' }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

export function SimulationsAdmin() {
  const data = useQuery(simApi.adminCases, {})
  const load = useMutation(simApi.adminLoad)
  const publish = useMutation(simApi.adminPublish)
  const unpublish = useMutation(simApi.adminUnpublish)
  const isAdmin = hasLearnAdmin(useConsoleRole())
  const [loading, setLoading] = useState(false)
  const [signing, setSigning] = useState<SimAdminCase | null>(null)
  const [statsFor, setStatsFor] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const loadCases = async () => {
    setLoading(true)
    try {
      const report = await load({})
      const changed = report.filter((r) => r.result === 'added' || r.result === 'updated').length
      const skipped = report.filter((r) => r.result === 'skipped')
      toast.success(changed ? `${changed} case${changed === 1 ? '' : 's'} loaded as drafts` : 'Everything is up to date')
      for (const s of skipped) toast.error(`${s.slug}: ${s.message}`)
    } catch (err) {
      toast.error(errorText(err, 'Couldn’t load the cases.'))
    } finally {
      setLoading(false)
    }
  }

  const act = async (slug: string, action: 'publish' | 'unpublish') => {
    setBusy(`${action}:${slug}`)
    try {
      if (action === 'publish') await publish({ slug })
      else await unpublish({ slug })
      toast.success(action === 'publish' ? 'Published' : 'Unpublished')
    } catch (err) {
      toast.error(errorText(err, 'Couldn’t update the case.'))
    } finally {
      setBusy(null)
    }
  }

  const header = (
    <PageHeader
      eyebrow="Rehabify Learn"
      title="Simulations"
      description="Timed clinical cases. Each version needs a physiotherapist’s sign-off before an admin publishes it; learners only ever play published versions."
      actions={
        <Button className={softButtonClass} onClick={() => void loadCases()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Load cases from the repo
        </Button>
      }
    />
  )

  if (data === undefined) {
    return (
      <AdminPage>
        {header}
        <LoadingBlock />
      </AdminPage>
    )
  }
  if (data === null) {
    return (
      <AdminPage>
        {header}
        <EmptyState title="Only the Rehabify Learn team can manage simulations" />
      </AdminPage>
    )
  }

  const live = data.cases.filter((c) => c.published).length
  const plays = data.cases.reduce((sum, c) => sum + c.plays, 0)
  const completions = data.cases.reduce((sum, c) => sum + c.completions, 0)
  const passes = data.cases.reduce((sum, c) => sum + c.passes, 0)

  return (
    <AdminPage>
      {header}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Cases live" value={`${live} / ${data.cases.length}`} icon={HeartPulse} />
        <StatTile label="Plays" value={plays} icon={Users} />
        <StatTile label="Pass rate" value={completions ? `${Math.round((passes / completions) * 100)}%` : '–'} icon={CheckCircle2} />
        <StatTile label="Sim Pass interest" value={data.interestCount} hint="Learners asking to be told about the paid pass" icon={BarChart3} />
      </div>

      {data.cases.length === 0 ? (
        <EmptyState
          icon={<HeartPulse className="h-5 w-5" />}
          title="No cases loaded yet"
          description={`${data.repo.length} case${data.repo.length === 1 ? ' is' : 's are'} ready in the repo. Load them as drafts to play-test and sign off.`}
          action={
            <Button className={primaryButtonClass} onClick={() => void loadCases()} disabled={loading}>
              Load cases
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {data.cases.map((item) => {
            const repoVersion = data.repo.find((r) => r.slug === item.slug)?.version
            return (
              <Panel
                key={item.slug}
                title={item.title}
                description={`${item.slug} · version ${item.version} · ${item.mode === 'triage' ? 'Triage' : 'Full case'} · ${item.specialty}`}
                actions={
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={learnUrl(`/simulations/${item.slug}?preview=1`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(softButtonClass, 'inline-flex h-9 items-center px-3 text-sm')}
                    >
                      Play-test <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                    </a>
                    <Button className={softButtonClass} onClick={() => setSigning(item)} disabled={item.problems.length > 0}>
                      <ShieldCheck className="mr-1.5 h-4 w-4" /> Sign off
                    </Button>
                    {isAdmin &&
                      (item.published?.version === item.version ? (
                        <Button className={softButtonClass} onClick={() => void act(item.slug, 'unpublish')} disabled={busy === `unpublish:${item.slug}`}>
                          Unpublish
                        </Button>
                      ) : (
                        <Button
                          className={primaryButtonClass}
                          onClick={() => void act(item.slug, 'publish')}
                          disabled={!item.signedOffCurrent || busy === `publish:${item.slug}`}
                          title={item.signedOffCurrent ? undefined : 'Needs a sign-off of this version first'}
                        >
                          Publish v{item.version}
                        </Button>
                      ))}
                  </div>
                }
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {item.published ? (
                    <StatusBadge tone="green">Live: version {item.published.version}</StatusBadge>
                  ) : (
                    <StatusBadge>Not published</StatusBadge>
                  )}
                  {item.signedOffCurrent ? (
                    <StatusBadge tone="green">
                      Signed off by {item.signOff?.reviewerName} · {new Date(item.signOff!.at).toLocaleDateString('en-GB')}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="amber">Version {item.version} needs a sign-off</StatusBadge>
                  )}
                  {repoVersion !== undefined && repoVersion !== item.version && <StatusBadge tone="amber">Repo has version {repoVersion}: load cases</StatusBadge>}
                  <span className="text-neutral-500">
                    {item.plays} plays · {item.completions} finished · {item.passes} passed
                    {item.average !== null ? ` · average ${item.average}%` : ''}
                  </span>
                </div>
                {item.signOff?.note && item.signedOffCurrent && <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">“{item.signOff.note}”</p>}
                {item.problems.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-rose-700 dark:text-rose-300">
                    {item.problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => setStatsFor((s) => (s === item.slug ? null : item.slug))}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-rh-ink hover:underline dark:text-white"
                >
                  <BarChart3 className="h-4 w-4" /> {statsFor === item.slug ? 'Hide how learners play it' : 'How learners play it'}
                </button>
                {statsFor === item.slug && (
                  <div className="mt-4">
                    <CaseStats slug={item.slug} />
                  </div>
                )}
              </Panel>
            )
          })}
        </div>
      )}
      <SignOffDrawer item={signing} onClose={() => setSigning(null)} />
    </AdminPage>
  )
}
