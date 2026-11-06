'use client'

/**
 * Admin › Clinic plans: the subscription prices and the wording on the website's clinic page
 * (convex/clinicPlans.ts). A clinic already on a plan keeps its fee until its plan is changed in
 * its Subscription tab.
 */

import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { AdminPage, PageHeader, Panel, inputClass, primaryButtonClass } from '@/components/admin/ui'
import { isUnlimitedSeats, type ClinicPlanCatalogue, type ClinicPlanId } from '@/lib/clinicPlans'
import { cn } from '@/lib/utils'

type AdminData = { catalogue: ClinicPlanCatalogue; updatedAt: number | null; updatedByName: string | null; unlimitedSeats: number }
type PlanForm = {
  id: ClinicPlanId
  name: string
  fee: string
  priceNote: string
  features: string
  unlimitedSeats: boolean
  seats: string
  patients: string
  featured: boolean
}
type SaveArgs = {
  plans: {
    id: ClinicPlanId
    name: string
    monthlyFeeNaira?: number
    priceNote: string
    features: string[]
    unlimitedSeats?: boolean
    seatLimit?: number
    patientAllowance?: number
    featured: boolean
  }[]
  includes: string[]
  excludes: string[]
}

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const getRef = makeFunctionReference<'query', Record<string, never>, AdminData>('clinicPlans:adminGet')
const saveRef = makeFunctionReference<'mutation', SaveArgs, { ok: boolean }>('clinicPlans:adminSave')

const lines = (text: string) => text.split('\n').map((s) => s.trim()).filter(Boolean)

export default function ClinicPlansPage() {
  const data = useQuery(getRef, {})
  const save = useMutation(saveRef)
  const [plans, setPlans] = useState<PlanForm[] | null>(null)
  const [includes, setIncludes] = useState('')
  const [excludes, setExcludes] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!data || plans) return
    setPlans(
      data.catalogue.plans.map((p) => ({
        id: p.id,
        name: p.name,
        fee: p.monthlyFeeKobo === null ? '' : String(Math.round(p.monthlyFeeKobo / 100)),
        priceNote: p.priceNote,
        features: p.features.join('\n'),
        unlimitedSeats: isUnlimitedSeats(p.seatLimit),
        seats: p.seatLimit !== null && !isUnlimitedSeats(p.seatLimit) ? String(p.seatLimit) : '',
        patients: p.programmeAllowance === null ? '' : String(p.programmeAllowance),
        featured: Boolean(p.featured),
      }))
    )
    setIncludes(data.catalogue.includes.join('\n'))
    setExcludes(data.catalogue.excludes.join('\n'))
  }, [data, plans])

  const update = (id: ClinicPlanId, change: Partial<PlanForm>) =>
    setPlans((current) => current?.map((p) => (p.id === id ? { ...p, ...change } : p)) ?? current)

  const submit = async () => {
    if (!plans) return
    setBusy(true)
    try {
      await save({
        plans: plans.map((p) => ({
          id: p.id,
          name: p.name,
          priceNote: p.priceNote,
          features: lines(p.features),
          featured: p.featured,
          ...(p.id === 'enterprise'
            ? {}
            : {
                monthlyFeeNaira: Number(p.fee.replace(/[^\d.]/g, '')),
                unlimitedSeats: p.unlimitedSeats,
                seatLimit: p.unlimitedSeats ? undefined : Number(p.seats),
                patientAllowance: Number(p.patients),
              }),
        })),
        includes: lines(includes),
        excludes: lines(excludes),
      })
      toast.success('Clinic plans saved. The website shows them now.')
    } catch (error) {
      toast.error(error instanceof ConvexError && typeof error.data === 'string' ? error.data : 'Couldn’t save. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminPage>
      <PageHeader
        title="Clinic plans"
        description="The monthly subscription prices and what each plan says on the website’s clinic page. Clinics already on a plan keep their current price until you change their plan in their Subscription tab."
      />
      {!data || !plans ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            {plans.map((p) => {
              const enterprise = p.id === 'enterprise'
              return (
                <Panel key={p.id}>
                  <div className="space-y-4 p-5">
                    <div>
                      <Label htmlFor={`${p.id}-name`} className="text-xs font-medium">Plan name</Label>
                      <Input id={`${p.id}-name`} className={cn(inputClass, 'mt-1.5')} value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} />
                    </div>
                    {enterprise ? (
                      <p className="text-sm text-neutral-500">Price: Custom (set per clinic in its Subscription tab).</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor={`${p.id}-fee`} className="text-xs font-medium">Price a month (₦)</Label>
                          <Input id={`${p.id}-fee`} inputMode="numeric" className={cn(inputClass, 'mt-1.5')} value={p.fee} onChange={(e) => update(p.id, { fee: e.target.value })} />
                        </div>
                        <div>
                          <Label htmlFor={`${p.id}-patients`} className="text-xs font-medium">Patients with Joy</Label>
                          <Input id={`${p.id}-patients`} inputMode="numeric" className={cn(inputClass, 'mt-1.5')} value={p.patients} onChange={(e) => update(p.id, { patients: e.target.value.replace(/\D/g, '') })} />
                        </div>
                      </div>
                    )}
                    <div>
                      <Label htmlFor={`${p.id}-note`} className="text-xs font-medium">Under the price</Label>
                      <Input id={`${p.id}-note`} className={cn(inputClass, 'mt-1.5')} value={p.priceNote} onChange={(e) => update(p.id, { priceNote: e.target.value })} />
                    </div>
                    {!enterprise && (
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={p.unlimitedSeats} onChange={(e) => update(p.id, { unlimitedSeats: e.target.checked })} />
                          Unlimited clinicians
                        </label>
                        {!p.unlimitedSeats && (
                          <div>
                            <Label htmlFor={`${p.id}-seats`} className="text-xs font-medium">Clinician seats</Label>
                            <Input id={`${p.id}-seats`} inputMode="numeric" className={cn(inputClass, 'mt-1.5')} value={p.seats} onChange={(e) => update(p.id, { seats: e.target.value.replace(/\D/g, '') })} />
                          </div>
                        )}
                      </div>
                    )}
                    <div>
                      <Label htmlFor={`${p.id}-features`} className="text-xs font-medium">Lines on the card (one per line)</Label>
                      <Textarea id={`${p.id}-features`} rows={4} className={cn(inputClass, 'mt-1.5 h-auto py-2')} value={p.features} onChange={(e) => update(p.id, { features: e.target.value })} />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={p.featured} onChange={(e) => update(p.id, { featured: e.target.checked })} />
                      Highlight this plan (dark card)
                    </label>
                  </div>
                </Panel>
              )
            })}
          </div>

          <Panel>
            <div className="grid gap-4 p-5 lg:grid-cols-2">
              <div>
                <Label htmlFor="includes" className="text-xs font-medium">Included in every plan (one per line)</Label>
                <Textarea id="includes" rows={9} className={cn(inputClass, 'mt-1.5 h-auto py-2')} value={includes} onChange={(e) => setIncludes(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="excludes" className="text-xs font-medium">Not included (one per line, leave empty to hide)</Label>
                <Textarea id="excludes" rows={9} className={cn(inputClass, 'mt-1.5 h-auto py-2')} value={excludes} onChange={(e) => setExcludes(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.05] px-5 py-4 dark:border-white/[0.06]">
              <p className="text-xs text-neutral-500">
                {data.updatedAt ? `Last saved ${format(data.updatedAt, 'd MMM yyyy, HH:mm')} by ${data.updatedByName}` : 'Showing the default plans.'} Prices exclude VAT.
              </p>
              <button type="button" disabled={busy} onClick={() => void submit()} className={cn(primaryButtonClass, 'h-10')}>
                Save plans
              </button>
            </div>
          </Panel>
        </>
      )}
    </AdminPage>
  )
}
