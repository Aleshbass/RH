'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useMutation, useQuery } from 'convex/react'
import { format } from 'date-fns'
import { Building2, CheckCircle2, Clock, Eye, Layers, Loader2, Plus, RefreshCw, Rotate3d, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Doc, Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AdminPage,
  ConfirmDialog,
  EmptyState,
  FilterChips,
  PageHeader,
  Panel,
  Stagger,
  StaggerItem,
  StatTile,
  StatusBadge,
  cardClass,
  inputClass,
  listRowClass,
  primaryButtonClass,
  softButtonClass,
  tabsListClass,
} from '@/components/admin/ui'
import { ExercisePreviewDialog } from '@/components/exercise-programs/ExercisePreviewDialog'
import type { LibraryEntry } from '@/components/exercise-programs/types'
import { EXERCISE_CATALOG, posterUrl } from '@/convex/exerciseLibraryCatalog'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const errorText = (e: unknown, fallback: string) => (e as Error)?.message?.replace(/^.*ConvexError: /, '') || fallback

// Query results are cast: the generated `api` type degrades to `any` in this app.
type SignOffStatus = {
  version: string
  items: { slug: string; name: string; sided: boolean; exercise: LibraryEntry | null; approvedAt: number | null; approvedByName: string | null }[]
}
type LicenceRow = Doc<'libraryLicences'> & {
  members: { _id: Id<'libraryLicenceMembers'>; userId: Id<'users'>; name: string; email: string | null; addedAt: number }[]
  viewsLast30Days: number
}

type SignOffFilter = 'all' | 'awaiting' | 'approved'

function SignOff() {
  const status = useQuery(api.exerciseLibrary.adminLibraryStatus) as SignOffStatus | undefined
  const sync = useMutation(api.exerciseLibrary.syncLibrary)
  const setApproval = useMutation(api.exerciseLibrary.setAnimationApproval)
  const [preview, setPreview] = useState<LibraryEntry | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [filter, setFilter] = useState<SignOffFilter>('all')
  const [withdraw, setWithdraw] = useState<SignOffStatus['items'][number] | null>(null)

  const runSync = async (overwriteText: boolean) => {
    setSyncing(true)
    try {
      const res = await sync({ overwriteText })
      playSound('success')
      toast.success(`Library synced: ${res.created} added, ${res.updated} updated`)
    } catch (e) {
      playSound('error')
      toast.error(errorText(e, 'Sync failed'))
    } finally {
      setSyncing(false)
    }
  }

  const approve = async (exerciseId: Id<'exercises'>, approved: boolean) => {
    try {
      await setApproval({ exerciseId, approved })
      playSound(approved ? 'approve' : 'reject')
      toast.success(approved ? 'Signed off. Patients can now watch it.' : 'Sign-off withdrawn. Patients see the steps only.')
    } catch (e) {
      playSound('error')
      toast.error(errorText(e, 'Couldn’t update the sign-off'))
      throw e
    }
  }

  if (status === undefined) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-rh-teal dark:text-rh-aqua" />
      </div>
    )
  }

  const isApproved = (i: SignOffStatus['items'][number]) => i.exercise?.animation?.status === 'approved'
  const approvedCount = status.items.filter(isApproved).length
  const missing = status.items.filter((i) => !i.exercise).length
  const awaiting = status.items.length - approvedCount - missing
  const visible = status.items.filter((i) => (filter === 'all' ? true : filter === 'approved' ? isApproved(i) : !isApproved(i)))

  return (
    <div className="space-y-5">
      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StaggerItem><StatTile label="3D exercises" value={status.items.length} icon={Layers} hint="In the built catalog" /></StaggerItem>
        <StaggerItem><StatTile label="Signed off" value={approvedCount} icon={ShieldCheck} tone="mint" hint="Visible to patients" /></StaggerItem>
        <StaggerItem>
          <StatTile label="Awaiting sign-off" value={awaiting} icon={Clock} tone={awaiting > 0 ? 'attention' : 'teal'} hint="Patients see steps only" />
        </StaggerItem>
        <StaggerItem><StatTile label="Library version" value={EXERCISE_CATALOG.version.slice(0, 7)} icon={Rotate3d} hint={missing ? `${missing} not synced yet` : 'All synced'} /></StaggerItem>
      </Stagger>

      <Panel
        title="Clinical sign-off"
        description="A licensed physiotherapist reviews each 3D demonstration before patients can watch it."
        actions={
          <>
            <Button size="sm" variant="ghost" className={softButtonClass} onClick={() => runSync(true)} disabled={syncing}>
              Refresh text
            </Button>
            <Button size="sm" className={primaryButtonClass} onClick={() => runSync(false)} disabled={syncing}>
              {syncing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              Sync library
            </Button>
          </>
        }
      >
        <div className="space-y-4 px-5 pb-5 pt-3">
          <FilterChips
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All', count: status.items.length },
              { value: 'awaiting', label: 'Awaiting sign-off', count: status.items.length - approvedCount },
              { value: 'approved', label: 'Signed off', count: approvedCount },
            ]}
          />
          {visible.length === 0 ? (
            <EmptyState icon={<ShieldCheck />} title="Nothing here" description="No exercises match this filter." />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((item) => {
                const ex = item.exercise
                const approved = isApproved(item)
                const clipId = item.sided ? `${item.slug}-left` : item.slug
                return (
                  <li key={item.slug} className={cn(cardClass, 'flex gap-3 p-3', approved && 'ring-1 ring-emerald-300/70 dark:ring-emerald-500/30')}>
                    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-rh-mist dark:bg-white/[0.05]">
                      <Image src={posterUrl(clipId)} alt={item.name} fill sizes="96px" className="object-contain" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="font-semibold text-rh-night dark:text-white">{item.name}</p>
                      <div className="flex flex-wrap gap-1">
                        {!ex ? (
                          <StatusBadge>Not synced</StatusBadge>
                        ) : approved ? (
                          <StatusBadge tone="green"><ShieldCheck className="mr-1 h-3 w-3" />Signed off</StatusBadge>
                        ) : (
                          <StatusBadge tone="amber">Awaiting sign-off</StatusBadge>
                        )}
                        {item.sided && <StatusBadge>Left / right</StatusBadge>}
                      </div>
                      {approved && item.approvedAt && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          by {item.approvedByName} · {format(item.approvedAt, 'd MMM yyyy')}
                        </p>
                      )}
                      {ex && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <Button size="sm" variant="ghost" className={cn(softButtonClass, 'h-8')} onClick={() => setPreview(ex)}>
                            <Eye className="mr-1 h-3.5 w-3.5" />Review
                          </Button>
                          {approved ? (
                            <Button size="sm" variant="ghost" className="h-8 rounded-xl" onClick={() => setWithdraw(item)}>
                              Withdraw
                            </Button>
                          ) : (
                            <Button size="sm" className={cn(primaryButtonClass, 'h-8')} onClick={() => approve(ex._id, true).catch(() => {})}>
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Sign off
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Panel>

      <ExercisePreviewDialog entry={preview} onOpenChange={(o) => !o && setPreview(null)} />
      <ConfirmDialog
        open={Boolean(withdraw)}
        onOpenChange={(o) => !o && setWithdraw(null)}
        title={`Withdraw sign-off for ${withdraw?.name ?? 'this exercise'}?`}
        description="Patients will stop seeing the 3D demonstration straight away and get the written steps instead."
        confirmLabel="Withdraw sign-off"
        destructive
        onConfirm={() => (withdraw?.exercise ? approve(withdraw.exercise._id, false) : undefined)}
      />
    </div>
  )
}

const PLANS = ['trial', 'standard', 'enterprise'] as const
type Plan = (typeof PLANS)[number]

function Licences() {
  const licences = useQuery(api.libraryLicences.listLicences) as LicenceRow[] | undefined
  const create = useMutation(api.libraryLicences.createLicence)
  const update = useMutation(api.libraryLicences.updateLicence)
  const addMember = useMutation(api.libraryLicences.addLicenceMember)
  const removeMember = useMutation(api.libraryLicences.removeLicenceMember)
  const [form, setForm] = useState({ orgName: '', sector: '', seats: '5', plan: 'trial' as Plan, days: '30' })
  const [creating, setCreating] = useState(false)
  const [emails, setEmails] = useState<Record<string, string>>({})
  const [suspend, setSuspend] = useState<LicenceRow | null>(null)
  const [removing, setRemoving] = useState<{ licence: LicenceRow; member: LicenceRow['members'][number] } | null>(null)

  const submit = async () => {
    setCreating(true)
    try {
      await create({
        orgName: form.orgName,
        sector: form.sector,
        plan: form.plan,
        seats: Number(form.seats) || 1,
        expiresAt: form.days ? Date.now() + Number(form.days) * 86_400_000 : undefined,
      })
      playSound('success')
      toast.success('Licence created')
      setForm({ orgName: '', sector: '', seats: '5', plan: 'trial', days: '30' })
    } catch (e) {
      playSound('error')
      toast.error(errorText(e, 'Couldn’t create the licence'))
    } finally {
      setCreating(false)
    }
  }

  const setStatus = async (licence: LicenceRow, status: 'active' | 'suspended') => {
    try {
      await update({ licenceId: licence._id, status })
      playSound(status === 'active' ? 'approve' : 'reject')
      toast.success(status === 'active' ? `${licence.orgName} reactivated` : `${licence.orgName} suspended. Their next view is refused.`)
    } catch (e) {
      playSound('error')
      toast.error(errorText(e, 'Couldn’t update the licence'))
      throw e
    }
  }

  const add = async (licence: LicenceRow) => {
    try {
      await addMember({ licenceId: licence._id, email: emails[licence._id] ?? '' })
      playSound('success')
      toast.success('Member added')
      setEmails((current) => ({ ...current, [licence._id]: '' }))
    } catch (e) {
      playSound('error')
      toast.error(errorText(e, 'Couldn’t add them'))
    }
  }

  return (
    <div className="space-y-5">
      <Panel
        title="New licence"
        description="For organisations outside physiotherapy: gyms, HMOs, hospitals, corporate wellness. Members get the whole 3D library, watermarked with the organisation's name. Billing comes later."
      >
        <div className="space-y-4 px-5 pb-5 pt-3">
          <div className="grid gap-3 sm:grid-cols-6">
            <div className="sm:col-span-2">
              <Label htmlFor="lic-org">Organisation</Label>
              <Input id="lic-org" className={cn(inputClass, 'mt-1.5')} value={form.orgName} onChange={(e) => setForm({ ...form, orgName: e.target.value })} placeholder="e.g. FitLife Gyms" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="lic-sector">Sector</Label>
              <Input id="lic-sector" className={cn(inputClass, 'mt-1.5')} value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} placeholder="Gym" />
            </div>
            <div>
              <Label htmlFor="lic-seats">Seats</Label>
              <Input id="lic-seats" inputMode="numeric" className={cn(inputClass, 'mt-1.5')} value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value.replace(/\D/g, '') })} />
            </div>
            <div>
              <Label htmlFor="lic-days">Days</Label>
              <Input id="lic-days" inputMode="numeric" className={cn(inputClass, 'mt-1.5')} value={form.days} placeholder="No end" onChange={(e) => setForm({ ...form, days: e.target.value.replace(/\D/g, '') })} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FilterChips value={form.plan} onChange={(plan) => setForm({ ...form, plan })} options={PLANS.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))} />
            <Button className={primaryButtonClass} onClick={submit} disabled={!form.orgName.trim() || creating}>
              {creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
              Create licence
            </Button>
          </div>
        </div>
      </Panel>

      {licences === undefined ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-rh-teal dark:text-rh-aqua" />
        </div>
      ) : licences.length === 0 ? (
        <Panel>
          <EmptyState icon={<Building2 />} title="No licences yet" description="Create one above when an organisation signs up to use the library." />
        </Panel>
      ) : (
        licences.map((l) => (
          <Panel
            key={l._id}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {l.orgName}
                <StatusBadge tone={l.status === 'active' ? 'green' : l.status === 'suspended' ? 'red' : 'neutral'}>{l.status}</StatusBadge>
                <StatusBadge>{l.plan}</StatusBadge>
              </span>
            }
            description={`${l.sector} · ${l.members.length} of ${l.seats} seats · ${l.viewsLast30Days} exercise views in 30 days · ${l.expiresAt ? `ends ${format(l.expiresAt, 'd MMM yyyy')}` : 'no end date'}`}
            actions={
              l.status === 'active' ? (
                <Button size="sm" variant="ghost" className="rounded-xl text-rose-600 hover:bg-rh-blush dark:text-rose-300 dark:hover:bg-rose-400/10" onClick={() => setSuspend(l)}>
                  Suspend
                </Button>
              ) : (
                <Button size="sm" className={primaryButtonClass} onClick={() => setStatus(l, 'active').catch(() => {})}>
                  Reactivate
                </Button>
              )
            }
          >
            {l.members.length > 0 && (
              <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
                {l.members.map((m) => (
                  <li key={m._id} className={listRowClass}>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-medium text-rh-night dark:text-white">{m.name}</span>{' '}
                      <span className="text-neutral-500 dark:text-neutral-400">{m.email}</span>
                    </span>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-neutral-400 hover:text-rose-600" onClick={() => setRemoving({ licence: l, member: m })} aria-label={`Remove ${m.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2 border-t border-black/[0.04] px-5 py-4 dark:border-white/[0.06]">
              <Input
                value={emails[l._id] ?? ''}
                onChange={(e) => setEmails((current) => ({ ...current, [l._id]: e.target.value }))}
                placeholder="Member's Rehabify email"
                className={cn(inputClass, 'max-w-xs')}
              />
              <Button variant="ghost" className={softButtonClass} onClick={() => add(l)} disabled={!(emails[l._id] ?? '').trim()}>
                <UserPlus className="mr-1.5 h-4 w-4" />Add member
              </Button>
            </div>
          </Panel>
        ))
      )}

      <ConfirmDialog
        open={Boolean(suspend)}
        onOpenChange={(o) => !o && setSuspend(null)}
        title={`Suspend ${suspend?.orgName ?? 'this licence'}?`}
        description="Members lose access at their next exercise view. You can reactivate the licence at any time."
        confirmLabel="Suspend licence"
        destructive
        onConfirm={() => (suspend ? setStatus(suspend, 'suspended') : undefined)}
      />
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.member.name ?? 'this member'}?`}
        description={`They'll lose access to the library through ${removing?.licence.orgName ?? 'this licence'}.`}
        confirmLabel="Remove member"
        destructive
        onConfirm={async () => {
          if (!removing) return
          try {
            await removeMember({ memberId: removing.member._id })
            playSound('reject')
            toast.success('Member removed')
          } catch (e) {
            playSound('error')
            toast.error(errorText(e, 'Couldn’t remove them'))
            throw e
          }
        }}
      />
    </div>
  )
}

export default function AdminExerciseLibraryPage() {
  return (
    <AdminPage>
      <PageHeader
        eyebrow="Content"
        title="3D library & licences"
        description="Sign off each 3D demonstration before patients see it, and manage organisations that license the library."
      />
      <Tabs defaultValue="signoff" className="space-y-5">
        <TabsList className={tabsListClass}>
          <TabsTrigger value="signoff">Clinical sign-off</TabsTrigger>
          <TabsTrigger value="licences">Licences</TabsTrigger>
        </TabsList>
        <TabsContent value="signoff" className="mt-0">
          <SignOff />
        </TabsContent>
        <TabsContent value="licences" className="mt-0">
          <Licences />
        </TabsContent>
      </Tabs>
    </AdminPage>
  )
}
