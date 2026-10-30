'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Award, Loader2, Plus } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AdminPage, EmptyState, PageHeader, Panel, StatusBadge, inputClass, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { rewardRefs, type AdminRewards } from '@/components/rewards/refs'
import { REWARD_KIND, cpdHours, type RewardKind } from '@/lib/rewards/rules'
import { cn } from '@/lib/utils'

type Item = AdminRewards['items'][number]

const errorText = (error: unknown, fallback: string) =>
  error instanceof ConvexError && typeof error.data === 'string' ? error.data : fallback

const KINDS = Object.entries(REWARD_KIND).map(([value, k]) => ({ value: value as RewardKind, label: k.label }))

/**
 * Reward points: what physios can buy with them, requests to arrange (masterclass seats), the
 * physios with the most points, and adding or taking away points by hand with a reason.
 */
export default function AdminRewardsPage() {
  const data = useQuery(rewardRefs.adminOverview, {})
  const addStarters = useMutation(rewardRefs.adminAddStarters)
  const handle = useMutation(rewardRefs.adminHandle)
  const [editing, setEditing] = useState<Item | 'new' | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function act(id: AdminRewards['pending'][number]['_id'], action: 'fulfil' | 'cancel') {
    setBusyId(id)
    try {
      await handle({ redemptionId: id, action })
      toast.success(action === 'fulfil' ? 'Confirmed. The physio has been told.' : 'Cancelled and points given back.')
    } catch (error) {
      toast.error(errorText(error, 'Couldn’t update that request.'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Rehabify Physios"
        title="Rewards & points"
        description="Physios earn points for helping others and for good care, never for referrals. Set what points buy and arrange requests."
        actions={
          <Button className={cn(primaryButtonClass, 'h-10')} onClick={() => setEditing('new')}>
            <Plus className="mr-1.5 h-4 w-4" />
            New reward
          </Button>
        }
      />

      {data === undefined ? (
        <Skeleton className="h-64 rounded-3xl" />
      ) : (
        <>
          <Panel title="Requests to arrange" description="Masterclass seats and other rewards the team confirms by hand.">
            {data.pending.length ? (
              <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {data.pending.map((r) => (
                  <li key={r._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-rh-ink dark:text-white">{r.name}</p>
                      <p className="text-xs text-neutral-500">
                        {r.title} · {r.cost.toLocaleString()} pts · {format(r.at, 'd MMM, HH:mm')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className={cn(softButtonClass, 'h-8')} disabled={busyId === r._id} onClick={() => void act(r._id, 'cancel')}>
                        Cancel & refund
                      </Button>
                      <Button size="sm" className={cn(primaryButtonClass, 'h-8')} disabled={busyId === r._id} onClick={() => void act(r._id, 'fulfil')}>
                        {busyId === r._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm'}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-6 pb-6 pt-2 text-sm text-neutral-500">Nothing waiting.</p>
            )}
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel
              title="Rewards catalogue"
              actions={
                data.items.length < 4 && (
                  <Button
                    size="sm"
                    className={cn(softButtonClass, 'h-8')}
                    onClick={() =>
                      void addStarters({}).then(
                        (r) => toast.success(r.added ? `Added ${r.added} starter rewards.` : 'The starter rewards are already there.'),
                        (e) => toast.error(errorText(e, 'Couldn’t add them.'))
                      )
                    }
                  >
                    Add starter rewards
                  </Button>
                )
              }
            >
              {data.items.length ? (
                <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                  {data.items.map((i) => (
                    <li key={i._id}>
                      <button type="button" onClick={() => setEditing(i)} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-rh-canvas sm:px-6 dark:hover:bg-white/[0.03]">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-rh-ink dark:text-white">{i.title}</span>
                          <span className="text-xs text-neutral-500">
                            {REWARD_KIND[i.kind].label}
                            {i.durationDays ? ` · ${i.durationDays} days` : ''}
                            {i.stock !== null ? ` · ${i.stock} left` : ''}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {!i.active && <StatusBadge tone="neutral">Hidden</StatusBadge>}
                          <span className="text-sm font-semibold tabular-nums text-rh-ink dark:text-white">{i.cost ? `${i.cost.toLocaleString()} pts` : 'Free'}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<Award />} title="No rewards yet" description="Add the starter rewards, then set their prices." />
              )}
            </Panel>

            <Panel title="Most points (last 12 months)">
              {data.top.length ? (
                <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                  {data.top.map((p, i) => (
                    <li key={p.userId} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm sm:px-6">
                      <span className="min-w-0 truncate text-rh-ink dark:text-white">
                        <span className="mr-2 tabular-nums text-neutral-400">{i + 1}</span>
                        {p.name}
                      </span>
                      <span className="shrink-0 text-xs text-neutral-500">
                        {p.tier} · {p.earned12m.toLocaleString()} earned · {p.balance.toLocaleString()} left
                        {p.cpdMinutes ? ` · CPD ${cpdHours(p.cpdMinutes)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-6 pb-6 pt-2 text-sm text-neutral-500">No points earned yet.</p>
              )}
            </Panel>
          </div>

          <AdjustPanel />

          <Panel title="Recent redemptions">
            {data.recent.length ? (
              <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {data.recent.map((r) => (
                  <li key={r._id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm sm:px-6">
                    <span className="min-w-0 truncate text-rh-ink dark:text-white">
                      {r.name} · {r.title}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-neutral-500">
                      {format(r.at, 'd MMM')}
                      <StatusBadge tone={r.status === 'pending' ? 'teal' : r.status === 'cancelled' ? 'neutral' : 'green'}>{r.status}</StatusBadge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-6 pb-6 pt-2 text-sm text-neutral-500">None yet.</p>
            )}
          </Panel>
        </>
      )}

      <ItemSheet item={editing} onClose={() => setEditing(null)} />
    </AdminPage>
  )
}

function AdjustPanel() {
  const adjust = useMutation(rewardRefs.adminAdjust)
  const [email, setEmail] = useState('')
  const [points, setPoints] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      const res = await adjust({ email, points: Number(points), reason })
      toast.success(`Done. Their balance is now ${res.balance.toLocaleString()} points.`)
      setPoints('')
      setReason('')
    } catch (error) {
      toast.error(errorText(error, 'Couldn’t adjust the points.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Add or take away points" description="For corrections and one-off thanks. The physio sees your reason.">
      <div className="grid gap-3 px-5 pb-5 pt-3 sm:grid-cols-[1fr_120px_1.4fr_auto] sm:items-end sm:px-6">
        <div className="space-y-1.5">
          <Label htmlFor="adj-email">Physio’s email</Label>
          <Input id="adj-email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="adj-points">Points</Label>
          <Input id="adj-points" className={inputClass} inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="50 or -50" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="adj-reason">Reason</Label>
          <Input id="adj-reason" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ran the October masterclass" />
        </div>
        <Button className={cn(primaryButtonClass, 'h-10')} disabled={busy || !email || !points || !reason} onClick={() => void save()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </Button>
      </div>
    </Panel>
  )
}

function ItemSheet({ item, onClose }: { item: Item | 'new' | null; onClose: () => void }) {
  const open = item !== null
  const existing = item && item !== 'new' ? item : null
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{existing ? 'Edit reward' : 'New reward'}</SheetTitle>
          <SheetDescription>Physios see the name, price and description on their Me page.</SheetDescription>
        </SheetHeader>
        {open && <ItemForm key={existing?._id ?? 'new'} existing={existing} onDone={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

function ItemForm({ existing, onDone }: { existing: Item | null; onDone: () => void }) {
  const save = useMutation(rewardRefs.adminSaveItem)
  const [kind, setKind] = useState<RewardKind>(existing?.kind ?? 'masterclass_seat')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [description, setDescription] = useState(existing?.description ?? REWARD_KIND[existing?.kind ?? 'masterclass_seat'].effect)
  const [cost, setCost] = useState(String(existing?.cost ?? 500))
  const [days, setDays] = useState(String(existing?.durationDays ?? 7))
  const [stock, setStock] = useState(existing?.stock !== null && existing?.stock !== undefined ? String(existing.stock) : '')
  const [active, setActive] = useState(existing?.active ?? true)
  const [busy, setBusy] = useState(false)
  const timed = kind === 'featured_profile' || kind === 'referral_boost'

  async function submit() {
    setBusy(true)
    try {
      await save({
        itemId: existing?._id,
        kind,
        title,
        description,
        cost: Number(cost),
        durationDays: timed ? Number(days) : undefined,
        stock: stock.trim() ? Number(stock) : undefined,
        active,
      })
      toast.success('Saved')
      onDone()
    } catch (error) {
      toast.error(errorText(error, 'Couldn’t save the reward.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 px-4 pb-6">
      <div className="space-y-1.5">
        <Label>Type</Label>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => {
                setKind(k.value)
                if (!existing) setDescription(REWARD_KIND[k.value].effect)
              }}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium',
                kind === k.value ? 'bg-rh-lime text-rh-ink' : 'bg-rh-canvas text-neutral-600 dark:bg-white/[0.06] dark:text-neutral-300'
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="r-title">Name</Label>
        <Input id="r-title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Masterclass seat" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="r-desc">What the physio gets</Label>
        <Textarea id="r-desc" className={inputClass} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="r-cost">Points</Label>
          <Input id="r-cost" className={inputClass} inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
        {timed && (
          <div className="space-y-1.5">
            <Label htmlFor="r-days">Days</Label>
            <Input id="r-days" className={inputClass} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="r-stock">Stock</Label>
          <Input id="r-stock" className={inputClass} inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="No limit" />
        </div>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-xl bg-rh-canvas px-4 py-3 text-sm dark:bg-white/[0.04]">
        Show to physios
        <Switch checked={active} onCheckedChange={setActive} />
      </label>
      <Button className={cn(primaryButtonClass, 'h-11 w-full')} disabled={busy} onClick={() => void submit()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save reward'}
      </Button>
    </div>
  )
}
