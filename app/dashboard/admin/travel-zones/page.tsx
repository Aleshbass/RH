'use client'

import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { format } from 'date-fns'
import { Loader2, MapPinned, Pencil, Plus, Tags, Users, X } from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  AdminPage,
  EmptyState,
  PageHeader,
  Panel,
  StatusBadge,
  inputClass,
  primaryButtonClass,
  softButtonClass,
} from '@/components/admin/ui'
import { Callout } from '@/components/admin/partners/shared'
import { errorText } from '@/components/admin/finance/format'
import { NIGERIA_LOCATIONS } from '@/lib/nigeria-locations'
import { formatKobo } from '@/lib/rehabify-services'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

/** travelZones.adminListZones */
type Zone = {
  _id: Id<'travelZones'>
  city: string
  name: string
  areas: string[]
  surchargeKobo: number
  physioTravelSharePercent: number
  active: boolean
  sortOrder?: number
  createdAt: number
  updatedAt: number
  updatedBy?: string
  physiosCovering: number
}

type TariffSummary = { services: { id: string; name: string; mode: 'virtual' | 'home'; travelApplies: boolean; active: boolean }[] }

type FormState = {
  city: string
  name: string
  areas: string[]
  surcharge: string
  share: string
  active: boolean
  sortOrder: string
}

const EMPTY_FORM: FormState = { city: '', name: '', areas: [], surcharge: '', share: '100', active: true, sortOrder: '' }

const titleCase = (value: string) => value.replace(/(^|[\s-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())

const KNOWN_PLACES = Object.keys(NIGERIA_LOCATIONS).map(titleCase)

const switchClass =
  'data-[state=checked]:bg-rh-teal data-[state=unchecked]:bg-neutral-200 dark:data-[state=checked]:bg-rh-aqua dark:data-[state=unchecked]:bg-white/15'

const num = (value: string) => Number(value.replace(/[,\s₦%]/g, ''))

export default function AdminTravelZonesPage() {
  const zones = useQuery(api.travelZones.adminListZones) as unknown as Zone[] | undefined
  const tariffs = useQuery(api.serviceTariffs.adminGetTariffs) as unknown as TariffSummary | undefined
  const [editing, setEditing] = useState<Zone | 'new' | null>(null)

  const byCity = useMemo(() => {
    const groups = new Map<string, Zone[]>()
    for (const zone of zones ?? []) groups.set(zone.city, [...(groups.get(zone.city) ?? []), zone])
    return [...groups.entries()]
  }, [zones])

  const travelServices = tariffs?.services.filter((s) => s.mode === 'home' && s.travelApplies && s.active) ?? []
  const activeCount = zones?.filter((z) => z.active).length ?? 0

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Marketplace"
        title="Travel zones"
        description="The areas we cover for home visits, grouped by city, and the travel charge for each zone."
        actions={
          <>
            <Button asChild variant="outline" size="sm" className={softButtonClass}>
              <Link href="/dashboard/admin/service-tariffs">
                <Tags className="mr-1.5 h-4 w-4" />
                Pricing & payouts
              </Link>
            </Button>
            <Button size="sm" className={primaryButtonClass} onClick={() => setEditing('new')}>
              <Plus className="mr-1.5 h-4 w-4" />
              New zone
            </Button>
          </>
        }
      />

      <Callout tone="info" title="How travel zones work">
        Patients choose their area when they book a home visit. Home services with the travel charge switched on in Pricing &
        payouts add that zone&apos;s charge to the price. Areas that aren&apos;t in any active zone aren&apos;t offered home
        visits. An area can only be in one active zone per city, so every patient gets one price.
        {tariffs && (
          <span className="mt-1 block text-neutral-600 dark:text-neutral-300">
            {travelServices.length > 0
              ? `The travel charge applies to: ${travelServices.map((s) => s.name).join(', ')}.`
              : 'No home service adds a travel charge right now, so zones only decide which areas are covered.'}
          </span>
        )}
      </Callout>

      {zones === undefined ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : zones.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<MapPinned />}
            title="No travel zones yet"
            description="Until you add a zone, no area is offered home visits."
            action={
              <Button size="sm" className={primaryButtonClass} onClick={() => setEditing('new')}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add the first zone
              </Button>
            }
          />
        </Panel>
      ) : (
        <>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {zones.length} zone{zones.length === 1 ? '' : 's'} in {byCity.length} cit{byCity.length === 1 ? 'y' : 'ies'} · {activeCount} active
          </p>
          {byCity.map(([city, cityZones]) => (
            <Panel
              key={city}
              title={city}
              description={`${cityZones.length} zone${cityZones.length === 1 ? '' : 's'} · ${cityZones.reduce((sum, z) => sum + (z.active ? z.areas.length : 0), 0)} areas covered`}
              bodyClassName="mt-2 divide-y divide-black/[0.05] border-t border-black/[0.05] dark:divide-white/[0.06] dark:border-white/[0.06]"
            >
              {cityZones.map((zone) => (
                <ZoneRow key={zone._id} zone={zone} onEdit={() => setEditing(zone)} />
              ))}
            </Panel>
          ))}
        </>
      )}

      <ZoneSheet zone={editing} zones={zones ?? []} onClose={() => setEditing(null)} />
    </AdminPage>
  )
}

function ZoneRow({ zone, onEdit }: { zone: Zone; onEdit: () => void }) {
  const physioShare = Math.round((zone.surchargeKobo * zone.physioTravelSharePercent) / 100)
  return (
    <div className={cn('flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start', !zone.active && 'opacity-70')}>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-rh-night dark:text-white">{zone.name}</p>
          <StatusBadge tone={zone.active ? 'green' : 'neutral'}>{zone.active ? 'Active' : 'Off'}</StatusBadge>
          {zone.sortOrder !== undefined && <span className="text-[11px] text-neutral-400">Order {zone.sortOrder}</span>}
        </div>
        <p className="text-xs text-neutral-600 dark:text-neutral-300">
          <span className="font-semibold tabular-nums text-rh-night dark:text-white">{formatKobo(zone.surchargeKobo)}</span> travel charge
          {zone.surchargeKobo > 0 && (
            <>
              {' '}
              · physio gets {zone.physioTravelSharePercent}% ({formatKobo(physioShare)})
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-1">
          {zone.areas.map((area) => (
            <span key={area} className="rounded-full bg-rh-canvas px-2 py-0.5 text-[11px] text-neutral-700 dark:bg-white/[0.06] dark:text-neutral-300">
              {area}
            </span>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
        <span
          className={cn(
            'inline-flex items-center gap-1 text-xs',
            zone.active && zone.physiosCovering === 0 ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-neutral-500 dark:text-neutral-400'
          )}
        >
          <Users className="h-3.5 w-3.5" />
          {zone.physiosCovering} physio{zone.physiosCovering === 1 ? '' : 's'} covering
        </span>
        <Button size="sm" className={cn(softButtonClass, 'h-8 text-xs')} onClick={onEdit}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Edit
        </Button>
      </div>
    </div>
  )
}

function ZoneSheet({ zone, zones, onClose }: { zone: Zone | 'new' | null; zones: Zone[]; onClose: () => void }) {
  const createZone = useMutation(api.travelZones.adminCreateZone)
  const updateZone = useMutation(api.travelZones.adminUpdateZone)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const id = useId()

  const zoneKey = zone === 'new' ? 'new' : zone?._id ?? null
  useEffect(() => {
    if (!zone) return
    setForm(
      zone === 'new'
        ? EMPTY_FORM
        : {
            city: zone.city,
            name: zone.name,
            areas: zone.areas,
            surcharge: String(zone.surchargeKobo / 100),
            share: String(zone.physioTravelSharePercent),
            active: zone.active,
            sortOrder: zone.sortOrder === undefined ? '' : String(zone.sortOrder),
          }
    )
    // Reset only when a different zone opens, not on every live update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneKey])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }))

  const cities = useMemo(() => [...new Set([...zones.map((z) => z.city), 'Lagos', 'Abuja', 'Port Harcourt', 'Ibadan'])], [zones])
  const suggestions = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const place of [...zones.flatMap((z) => z.areas), ...KNOWN_PLACES]) {
      const key = place.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(place)
    }
    return out
  }, [zones])

  // Mirrors the server rule: an area can be in only one active zone per city
  const currentId = zone && zone !== 'new' ? zone._id : null
  const clashes = useMemo(() => {
    if (!form.active) return []
    const city = form.city.trim().toLowerCase()
    const taken = new Map<string, string>()
    for (const z of zones) {
      if (z._id === currentId || !z.active || z.city.trim().toLowerCase() !== city) continue
      for (const area of z.areas) taken.set(area.toLowerCase(), z.name)
    }
    return form.areas.filter((area) => taken.has(area.toLowerCase())).map((area) => `${area} is already in ${taken.get(area.toLowerCase())}`)
  }, [form.active, form.city, form.areas, zones, currentId])

  const surchargeNaira = num(form.surcharge || '0')
  const share = num(form.share)
  const sortOrder = form.sortOrder.trim() ? num(form.sortOrder) : undefined
  const errors = [
    !form.city.trim() && 'Enter the city.',
    !form.name.trim() && 'Enter a zone name.',
    form.areas.length === 0 && 'Add at least one area.',
    !(Number.isFinite(surchargeNaira) && surchargeNaira >= 0) && 'The travel charge must be ₦0 or more.',
    !(share >= 0 && share <= 100) && "The physio's share must be between 0% and 100%.",
    sortOrder !== undefined && !Number.isFinite(sortOrder) && 'The sort order must be a number.',
  ].filter(Boolean) as string[]

  const surchargeKobo = Number.isFinite(surchargeNaira) ? Math.round(surchargeNaira * 100) : 0
  const physioKobo = share >= 0 && share <= 100 ? Math.round((surchargeKobo * share) / 100) : 0

  const save = async () => {
    if (errors.length || clashes.length) return
    setSaving(true)
    const fields = {
      city: form.city.trim(),
      name: form.name.trim(),
      areas: form.areas,
      surchargeKobo,
      physioTravelSharePercent: share,
      active: form.active,
      sortOrder,
    }
    try {
      if (zone && zone !== 'new') {
        await updateZone({ zoneId: zone._id, ...fields })
        toast.success(`${fields.name} updated.`)
      } else {
        await createZone(fields)
        toast.success(`${fields.name} added.`)
      }
      playSound('success')
      onClose()
    } catch (err) {
      playSound('error')
      toast.error(errorText(err, 'Could not save the zone. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const isNew = zone === 'new'
  return (
    <Sheet open={zone !== null} onOpenChange={(open) => !open && !saving && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto border-black/[0.06] bg-rh-canvas p-0 dark:border-white/[0.08] dark:bg-rh-ink sm:max-w-lg">
        <SheetHeader className="space-y-1 border-b border-black/[0.05] bg-white px-5 py-4 text-left dark:border-white/[0.06] dark:bg-rh-ink-2">
          <SheetTitle className="text-lg text-rh-night dark:text-white">{isNew ? 'New travel zone' : `Edit ${zone ? zone.name : 'zone'}`}</SheetTitle>
          <SheetDescription className="text-xs">
            {isNew
              ? 'A named group of areas in one city with a fixed travel charge.'
              : zone
                ? `Last changed ${format(zone.updatedAt, 'd MMM yyyy, HH:mm')}${zone.updatedBy ? ` by ${zone.updatedBy}` : ''}. Existing bookings keep the charge they were booked at.`
                : null}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-5 py-4">
          <section className="space-y-4 rounded-2xl bg-white p-4 shadow-soft dark:bg-rh-ink-2 dark:shadow-none">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-city`} className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  City
                </Label>
                <Input
                  id={`${id}-city`}
                  list={`${id}-cities`}
                  value={form.city}
                  onChange={(e) => set('city', e.target.value)}
                  placeholder="e.g. Lagos"
                  className={inputClass}
                />
                <datalist id={`${id}-cities`}>
                  {cities.map((city) => (
                    <option key={city} value={city} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-name`} className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Zone name
                </Label>
                <Input
                  id={`${id}-name`}
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="e.g. Mainland North"
                  className={inputClass}
                />
              </div>
            </div>

            <AreaInput id={`${id}-areas`} areas={form.areas} onChange={(areas) => set('areas', areas)} suggestions={suggestions} />
            {clashes.length > 0 && (
              <ul className="space-y-0.5 text-xs text-rose-600 dark:text-rose-300">
                {clashes.map((clash) => (
                  <li key={clash}>{clash}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-4 rounded-2xl bg-white p-4 shadow-soft dark:bg-rh-ink-2 dark:shadow-none">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-surcharge`} className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Travel charge (₦)
                </Label>
                <Input
                  id={`${id}-surcharge`}
                  inputMode="decimal"
                  value={form.surcharge}
                  onChange={(e) => set('surcharge', e.target.value)}
                  placeholder="0"
                  className={cn(inputClass, 'tabular-nums')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-share`} className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Physio&apos;s share (%)
                </Label>
                <Input
                  id={`${id}-share`}
                  inputMode="decimal"
                  value={form.share}
                  onChange={(e) => set('share', e.target.value)}
                  className={cn(inputClass, 'tabular-nums')}
                />
              </div>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {surchargeKobo > 0
                ? `The physio is paid ${formatKobo(physioKobo)} of the ${formatKobo(surchargeKobo)} charge on top of their service payout; Rehabify keeps ${formatKobo(surchargeKobo - physioKobo)}.`
                : 'No travel charge: home services in this zone cost the standard price.'}
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label htmlFor={`${id}-active`} className="flex cursor-pointer items-start justify-between gap-3 sm:col-span-1">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-rh-night dark:text-white">Active</span>
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400">Off removes these areas from home visits.</span>
                </span>
                <Switch id={`${id}-active`} checked={form.active} onCheckedChange={(v) => set('active', v)} className={cn('mt-0.5', switchClass)} />
              </label>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-sort`} className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Sort order <span className="font-normal text-neutral-400">(optional)</span>
                </Label>
                <Input
                  id={`${id}-sort`}
                  inputMode="numeric"
                  value={form.sortOrder}
                  onChange={(e) => set('sortOrder', e.target.value)}
                  placeholder="Lower shows first"
                  className={cn(inputClass, 'tabular-nums')}
                />
              </div>
            </div>
          </section>

          {errors.length > 0 && (form.name || form.city || form.areas.length > 0) && (
            <ul className="space-y-1 rounded-2xl border border-rose-200 bg-rh-blush/60 px-4 py-3 text-sm text-[#be123c] dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={onClose} disabled={saving} className={cn(softButtonClass, 'w-full sm:w-auto')}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || errors.length > 0 || clashes.length > 0} className={cn(primaryButtonClass, 'w-full sm:w-auto')}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isNew ? 'Add zone' : 'Save changes'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** Areas as chips: type and press Enter or a comma, or pick a suggestion. Pasting a list works too. */
function AreaInput({
  id,
  areas,
  onChange,
  suggestions,
}: {
  id: string
  areas: string[]
  onChange: (areas: string[]) => void
  suggestions: string[]
}) {
  const [text, setText] = useState('')

  const add = (values: string[]) => {
    const next = [...areas]
    for (const raw of values) {
      const value = raw.trim().replace(/\s+/g, ' ')
      if (value && !next.some((area) => area.toLowerCase() === value.toLowerCase())) next.push(value)
    }
    if (next.length !== areas.length) onChange(next)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      add([text])
      setText('')
    } else if (event.key === 'Backspace' && !text && areas.length > 0) {
      onChange(areas.slice(0, -1))
    }
  }

  const term = text.trim().toLowerCase()
  const matches = term
    ? suggestions.filter((s) => s.toLowerCase().includes(term) && !areas.some((a) => a.toLowerCase() === s.toLowerCase())).slice(0, 8)
    : []

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
        Areas
      </Label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-black/10 bg-white p-2 focus-within:ring-2 focus-within:ring-rh-teal/30 dark:border-white/10 dark:bg-rh-ink-3 dark:focus-within:ring-rh-aqua/30">
        {areas.map((area) => (
          <span key={area} className="inline-flex items-center gap-1 rounded-full bg-rh-mist py-0.5 pl-2.5 pr-1 text-xs font-medium text-rh-teal dark:bg-rh-aqua/10 dark:text-rh-aqua">
            {area}
            <button
              type="button"
              onClick={() => onChange(areas.filter((a) => a !== area))}
              className="rounded-full p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
              aria-label={`Remove ${area}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          onChange={(e) => {
            const value = e.target.value
            if (value.includes(',')) {
              const parts = value.split(',')
              add(parts.slice(0, -1))
              setText(parts[parts.length - 1])
            } else {
              setText(value)
            }
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (text.trim()) {
              add([text])
              setText('')
            }
          }}
          placeholder={areas.length ? 'Add another area' : 'e.g. Ikeja, Maryland, Ogba'}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm text-rh-night outline-none placeholder:text-neutral-400 dark:text-white dark:placeholder:text-neutral-500"
        />
      </div>
      {matches.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {matches.map((match) => (
            <button
              key={match}
              type="button"
              // Keep focus in the input so blur doesn't add the half-typed text first
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                add([match])
                setText('')
              }}
              className="rounded-full border border-black/10 px-2 py-0.5 text-[11px] text-neutral-600 hover:border-rh-teal hover:text-rh-teal dark:border-white/10 dark:text-neutral-300 dark:hover:border-rh-aqua dark:hover:text-rh-aqua"
            >
              + {match}
            </button>
          ))}
        </div>
      )}
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Press Enter or type a comma after each area. Patients pick from these names.</p>
    </div>
  )
}
