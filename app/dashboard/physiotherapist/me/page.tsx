'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useConvex, useMutation, useQuery } from 'convex/react'
import { format, formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Download, FileSignature, GraduationCap, History, Loader2, MessageCircle, Rocket, Star, TrendingUp } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  EmptyState,
  InfoTip,
  PageContainer,
  PageHeader,
  PageSkeleton,
  Panel,
  PhysioDrawer,
  StatusBadge,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/physio/ui'
import { TierBadge } from '@/components/rewards/TierBadge'
import { rewardRefs, type MyRewards } from '@/components/rewards/refs'
import { EARN, REWARD_KIND, cpdHours } from '@/lib/rewards/rules'
import { downloadCpdRecord } from '@/lib/rewards/cpdRecord'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type Data = NonNullable<MyRewards>
type Item = Data['items'][number]

const n = (value: number) => value.toLocaleString('en-NG')

/** Me: reward points and tier, what earned them, what they buy, and the CPD record. */
export default function MePage() {
  const data = useQuery(rewardRefs.mine, {})
  const [item, setItem] = useState<Item | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  if (data === undefined) return <PageSkeleton />
  if (data === null) {
    return (
      <PageContainer>
        <EmptyState title="Me opens once your account is approved" />
      </PageContainer>
    )
  }

  const progress = data.next ? Math.min(100, Math.round(((data.earned12m - data.tier.min) / (data.next.min - data.tier.min)) * 100)) : 100
  const running = data.redemptions.filter((r) => r.status === 'pending' || (r.status === 'active' && r.endsAt && r.endsAt > Date.now()))

  return (
    <PageContainer>
      <PageHeader
        title="About me"
        actions={
          <>
            <Button asChild variant="outline" className={cn(secondaryButtonClass, 'h-10 rounded-full px-4')}>
              <Link href="/dashboard/physiotherapist/me/outcomes">
                <TrendingUp className="mr-1.5 h-4 w-4" />
                Outcomes
              </Link>
            </Button>
            <Button asChild variant="outline" className={cn(secondaryButtonClass, 'h-10 rounded-full px-4')}>
              <Link href="/dashboard/physiotherapist/me/feedback">
                <MessageCircle className="mr-1.5 h-4 w-4" />
                Feedback
              </Link>
            </Button>
            <Button asChild variant="outline" className={cn(secondaryButtonClass, 'h-10 rounded-full px-4')}>
              <Link href="/dashboard/physiotherapist/settings/agreements">
                <FileSignature className="mr-1.5 h-4 w-4" />
                Agreements
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          {/* Points */}
          <section className="rounded-3xl bg-pt-primary p-6 text-pt-on-primary sm:p-8">
            <div className="flex items-start justify-between gap-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider opacity-70">
                Reward points
                <InfoTip label="About points">
                  Points reward helping other clinicians and good care: templates others use, exercises in the library, complete
                  scores at discharge, helpful answers. They last 12 months. Your tier comes from points earned in the last 12 months,
                  so spending never lowers it.
                </InfoTip>
              </p>
              <TierBadge tier={data.tier.key} name={data.tier.name} />
            </div>
            <p className="mt-3 text-[56px] font-semibold leading-none tabular-nums tracking-tight text-pt-accent sm:text-[64px]">{n(data.balance)}</p>
            <p className="mt-3 text-sm opacity-80">
              {data.weekPoints ? `+${n(data.weekPoints)} this week · ` : ''}points last 12 months
            </p>
            <div className="mt-5">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-pt-accent transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-xs opacity-70">
                {data.next ? `${n(data.next.needed)} more to ${data.next.name}` : 'Platinum: the top tier'}
              </p>
            </div>
          </section>

          {(data.featuredUntil || data.boostUntil) && (
            <div className="flex flex-wrap gap-2">
              {data.featuredUntil && <StatusBadge tone="green">Featured until {format(data.featuredUntil, 'd MMM, HH:mm')}</StatusBadge>}
              {data.boostUntil && <StatusBadge tone="green">Referral boost until {format(data.boostUntil, 'd MMM, HH:mm')}</StatusBadge>}
            </div>
          )}

          <Panel
            title="Earned this week"
            actions={
              <Button variant="ghost" size="sm" className="h-8 rounded-lg text-pt-muted" onClick={() => setHistoryOpen(true)}>
                <History className="mr-1.5 h-3.5 w-3.5" />
                All activity
              </Button>
            }
          >
            {data.week.length ? (
              <ul className="px-5 pb-4 pt-2 sm:px-6">
                {data.week.map((r) => (
                  <li key={r._id} className="flex items-center justify-between gap-4 py-2.5 text-[15px]">
                    <span className="min-w-0 truncate text-pt-ink">{r.label}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-pt-green-fg">+{r.points}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-6 pb-6 pt-2 text-sm text-pt-muted">Nothing yet this week. See how to earn below.</p>
            )}
          </Panel>

          <Panel title="How to earn">
            <ul className="grid gap-x-6 px-5 pb-5 pt-2 sm:grid-cols-2 sm:px-6">
              {Object.values(EARN).map((rule) => (
                <li key={rule.label} className="flex items-center justify-between gap-3 border-b border-pt-line py-2.5 text-sm last:border-0 sm:[&:nth-last-child(2)]:border-0">
                  <span className="text-pt-muted">{rule.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-pt-ink">+{rule.points}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <Panel title="Spend your points">
            {data.items.length ? (
              <div className="grid grid-cols-2 gap-3 px-5 pb-5 pt-3 sm:px-6">
                {data.items.map((i) => (
                  <button
                    key={i._id}
                    type="button"
                    onClick={() => setItem(i)}
                    className="flex min-h-[96px] flex-col justify-between rounded-3xl border border-pt-line bg-pt-surface p-4 text-left transition hover:bg-pt-hover active:scale-[0.98]"
                  >
                    <span className="text-[15px] font-semibold leading-snug text-pt-ink">{i.title}</span>
                    <span className="mt-2 text-sm text-pt-muted">
                      {i.kind === 'cpd_certificate' ? `Free · ${cpdHours(data.cpd.minutes)} logged` : `${n(i.cost)} pts`}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-6 pb-6 pt-2 text-sm text-pt-muted">Rewards are coming soon.</p>
            )}
            <p className="px-5 pb-5 text-xs leading-relaxed text-pt-faint sm:px-6">
              Points reward helping others and good care. They never come from referring patients.
            </p>
          </Panel>

          {running.length > 0 && (
            <Panel title="Your rewards">
              <ul className="px-5 pb-4 pt-2 sm:px-6">
                {running.map((r) => (
                  <li key={r._id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0 truncate text-pt-ink">{r.title}</span>
                    <StatusBadge tone={r.status === 'pending' ? 'blue' : 'green'}>
                      {r.status === 'pending' ? 'Being arranged' : `Until ${format(r.endsAt!, 'd MMM')}`}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel
            title={`CPD this year: ${cpdHours(data.cpd.minutes)}`}
            info="Learning you do on Rehabify is logged here: Case of the Week, Rehabify Learn sessions and masterclasses. It’s a record of learning, not accredited CPD credit."
          >
            {data.cpd.entries.length ? (
              <ul className="px-5 pb-2 pt-2 sm:px-6">
                {data.cpd.entries.slice(0, 6).map((e) => (
                  <li key={e._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-pt-ink">{e.label}</span>
                    <span className="shrink-0 text-pt-muted">{cpdHours(e.minutes)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 px-5 pb-3 pt-2 text-sm text-pt-muted sm:px-6">
                <GraduationCap className="h-4 w-4" />
                Answer the Case of the Week to log your first hour.
              </p>
            )}
            <div className="px-5 pb-5 sm:px-6">
              <CpdDownloadButton />
            </div>
          </Panel>
        </div>
      </div>

      <RedeemDrawer item={item} data={data} onClose={() => setItem(null)} />

      <PhysioDrawer open={historyOpen} onOpenChange={setHistoryOpen} title="All activity" description="Your last 60 point changes.">
        <ul className="divide-y divide-pt-line">
          {data.history.map((r) => (
            <li key={r._id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate text-pt-ink">{r.label}</span>
                <span className="text-xs text-pt-faint">{formatDistanceToNow(r.at, { addSuffix: true })}</span>
              </span>
              <span className={cn('shrink-0 font-semibold tabular-nums', r.points > 0 ? 'text-pt-green-fg' : 'text-pt-muted')}>
                {r.points > 0 ? `+${n(r.points)}` : `−${n(Math.abs(r.points))}`}
              </span>
            </li>
          ))}
          {data.history.length === 0 && <li className="py-6 text-center text-sm text-pt-muted">No points yet.</li>}
        </ul>
      </PhysioDrawer>
    </PageContainer>
  )
}

function CpdDownloadButton({ className }: { className?: string }) {
  const convex = useConvex()
  const [busy, setBusy] = useState(false)
  async function download() {
    setBusy(true)
    try {
      const record = await convex.query(rewardRefs.cpdRecord, {})
      if (!record) throw new Error('none')
      await downloadCpdRecord(record)
      playSound('success')
    } catch {
      playSound('error')
      toast.error('Couldn’t make the PDF. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button variant="outline" className={cn(secondaryButtonClass, 'h-10 w-full', className)} onClick={() => void download()} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
      Download CPD record (PDF)
    </Button>
  )
}

function RedeemDrawer({ item, data, onClose }: { item: Item | null; data: Data; onClose: () => void }) {
  const redeem = useMutation(rewardRefs.redeem)
  const [busy, setBusy] = useState(false)
  if (!item) return null

  const isCpd = item.kind === 'cpd_certificate'
  const short = item.cost - data.balance
  const running =
    item.kind === 'featured_profile' ? data.featuredUntil : item.kind === 'referral_boost' ? data.boostUntil : null

  async function confirm() {
    if (!item) return
    setBusy(true)
    try {
      const res = await redeem({ itemId: item._id })
      playSound(res.status === 'active' ? 'paid' : 'success')
      toast.success(
        res.status === 'active' && res.endsAt
          ? `${item.title} is on until ${format(res.endsAt, 'd MMM, HH:mm')}.`
          : 'Done. The Rehabify team will confirm by email.'
      )
      onClose()
    } catch (err) {
      playSound('error')
      const msg = (err as { data?: unknown })?.data
      toast.error(typeof msg === 'string' ? msg : 'Couldn’t redeem that. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PhysioDrawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={item.title}
      description={isCpd ? `${cpdHours(data.cpd.minutes)} logged in ${data.cpd.year}` : `${n(item.cost)} points`}
      footer={
        isCpd ? (
          <CpdDownloadButton className="h-11" />
        ) : (
          <Button className={cn(primaryButtonClass, 'h-11 w-full')} onClick={() => void confirm()} disabled={busy || short > 0}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : short > 0 ? `${n(short)} more points needed` : `Use ${n(item.cost)} points`}
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pt-sunken text-pt-ink">
          {item.kind === 'featured_profile' ? <Star className="h-5 w-5" /> : item.kind === 'referral_boost' ? <Rocket className="h-5 w-5" /> : <GraduationCap className="h-5 w-5" />}
        </div>
        <p className="text-[15px] leading-relaxed text-pt-ink">{item.description || REWARD_KIND[item.kind].effect}</p>
        {item.durationDays && <p className="text-sm text-pt-muted">Runs for {item.durationDays} days from now{running ? `, added after the one running until ${format(running, 'd MMM')}` : ''}.</p>}
        {!isCpd && (
          <div className="rounded-2xl bg-pt-sunken/60 p-4 text-sm">
            <div className="flex justify-between text-pt-muted">
              <span>Your points</span>
              <span className="tabular-nums">{n(data.balance)}</span>
            </div>
            <div className="mt-1 flex justify-between font-semibold text-pt-ink">
              <span>After</span>
              <span className="tabular-nums">{short > 0 ? '–' : n(data.balance - item.cost)}</span>
            </div>
          </div>
        )}
      </div>
    </PhysioDrawer>
  )
}
