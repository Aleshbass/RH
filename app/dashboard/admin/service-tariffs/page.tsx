'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { HandHeart, History, Loader2, MapPinned, Save, Send } from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  AdminPage,
  ConfirmDialog,
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
import {
  formatKobo,
  getService,
  quoteService,
  type BookableServiceId,
  type RehabifyQuote,
  type ServiceTariff,
  type TariffTable,
} from '@/lib/rehabify-services'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

/** serviceTariffs.adminGetTariffs, written out (the generated api can lose its types). */
type TariffsData = {
  version: number
  settings: { accessCapacity: number; accessIntakeOpen: boolean; networkTermsEnforcedAt?: number }
  services: {
    id: BookableServiceId
    name: string
    mode: 'virtual' | 'home'
    durationLabel: string
    priceKobo: number
    payoutKobo: number
    assistedPriceKobo: number | null
    assistedPayoutKobo: number | null
    travelApplies: boolean
    active: boolean
  }[]
  history: { version: number; createdAt: number; createdBy: string | null; note: string | null }[]
}

type ServiceRow = TariffsData['services'][number]

/** serviceTariffs.adminNetworkReadiness */
type Readiness = {
  termsVersion: string
  physios: {
    userId: string
    name: string
    email: string | null
    listed: boolean
    clinicMember: boolean
    acceptedTerms: boolean
    acceptedAt: number | null
    accessOptIn: boolean
    offersVideo: boolean
    offersHome: boolean
    homeWithoutZones: boolean
  }[]
  totals: {
    approved: number
    listed: number
    accepted: number
    wouldBeDelisted: number
    clinicMembersExcluded: number
    homeWithoutZones: number
    accessOptIns: number
  }
}

/** The form works in naira; the backend stores kobo. */
type RowForm = {
  price: string
  payout: string
  accessPrice: string
  accessPayout: string
  travelApplies: boolean
  active: boolean
}

type TariffPayload = {
  serviceId: BookableServiceId
  priceKobo: number
  payoutKobo: number
  assistedPriceKobo?: number
  assistedPayoutKobo?: number
  travelApplies: boolean
  active: boolean
}

const nairaText = (kobo: number | null) => (kobo === null ? '' : String(kobo / 100))

const toKobo = (value: string): number | undefined => {
  const clean = value.replace(/[,\s₦]/g, '')
  if (!clean) return undefined
  const n = Number(clean)
  return Number.isFinite(n) ? Math.round(n * 100) : NaN
}

const toRowForm = (row: ServiceRow): RowForm => ({
  price: nairaText(row.priceKobo),
  payout: nairaText(row.payoutKobo),
  accessPrice: nairaText(row.assistedPriceKobo),
  accessPayout: nairaText(row.assistedPayoutKobo),
  travelApplies: row.travelApplies,
  active: row.active,
})

function rowErrors(form: RowForm): string[] {
  const price = toKobo(form.price)
  const payout = toKobo(form.payout)
  const accessPrice = toKobo(form.accessPrice)
  const accessPayout = toKobo(form.accessPayout)
  const errors: string[] = []
  if (price === undefined || Number.isNaN(price) || price <= 0) errors.push('Enter a patient price above ₦0.')
  if (payout === undefined || Number.isNaN(payout) || payout < 0) errors.push('Enter the physio payout (₦0 or more).')
  else if (price !== undefined && !Number.isNaN(price) && payout > price) errors.push("The payout can't be more than the price.")
  if ((accessPrice === undefined) !== (accessPayout === undefined)) {
    errors.push('Set both Access amounts, or leave both blank.')
  } else if (accessPrice !== undefined && accessPayout !== undefined) {
    if (Number.isNaN(accessPrice) || Number.isNaN(accessPayout) || accessPrice < 0 || accessPayout < 0) {
      errors.push('Access amounts must be ₦0 or more.')
    } else if (price !== undefined && !Number.isNaN(price) && accessPrice > price) {
      errors.push("The Access price can't be more than the standard price.")
    }
  }
  return errors
}

function toPayload(row: ServiceRow, form: RowForm): TariffPayload {
  const payload: TariffPayload = {
    serviceId: row.id,
    priceKobo: toKobo(form.price) ?? 0,
    payoutKobo: toKobo(form.payout) ?? 0,
    travelApplies: row.mode === 'home' && form.travelApplies,
    active: form.active,
  }
  const accessPrice = toKobo(form.accessPrice)
  const accessPayout = toKobo(form.accessPayout)
  if (accessPrice !== undefined && accessPayout !== undefined) {
    payload.assistedPriceKobo = accessPrice
    payload.assistedPayoutKobo = accessPayout
  }
  return payload
}

const savedPayload = (row: ServiceRow): TariffPayload => toPayload(row, toRowForm(row))

/** Rehabify's share of one session, before travel and any partner commission. */
function marginFor(payload: TariffPayload, mode: 'virtual' | 'home', assisted: boolean): RehabifyQuote | null {
  const tariff: ServiceTariff = {
    priceKobo: payload.priceKobo,
    payoutKobo: payload.payoutKobo,
    assistedPriceKobo: payload.assistedPriceKobo,
    assistedPayoutKobo: payload.assistedPayoutKobo,
    travelApplies: false,
    active: true,
  }
  try {
    return quoteService({
      serviceId: payload.serviceId,
      tariffs: { [payload.serviceId]: tariff } as TariffTable,
      zone: mode === 'home' ? { name: '', surchargeKobo: 0 } : null,
      assisted,
    })
  } catch {
    return null
  }
}

const dateInputValue = (ts?: number) => (ts ? format(ts, 'yyyy-MM-dd') : '')

const switchClass =
  'data-[state=checked]:bg-rh-teal data-[state=unchecked]:bg-neutral-200 dark:data-[state=checked]:bg-rh-aqua dark:data-[state=unchecked]:bg-white/15'

export default function AdminServiceTariffsPage() {
  const data = useQuery(api.serviceTariffs.adminGetTariffs) as unknown as TariffsData | undefined
  const readiness = useQuery(api.serviceTariffs.adminNetworkReadiness) as unknown as Readiness | undefined
  const saveTariffs = useMutation(api.serviceTariffs.adminSaveTariffs)

  const [forms, setForms] = useState<Record<string, RowForm> | null>(null)
  const [baseVersion, setBaseVersion] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Load the saved schedule once (don't overwrite what the admin is typing on live updates)
  useEffect(() => {
    if (data && forms === null) {
      setForms(Object.fromEntries(data.services.map((row) => [row.id, toRowForm(row)])))
      setBaseVersion(data.version)
    }
  }, [data, forms])

  const loadLatest = () => {
    if (!data) return
    setForms(Object.fromEntries(data.services.map((row) => [row.id, toRowForm(row)])))
    setBaseVersion(data.version)
  }

  const rows = useMemo(() => {
    if (!data || !forms) return []
    return data.services.map((row) => {
      const form = forms[row.id] ?? toRowForm(row)
      const payload = toPayload(row, form)
      return { row, form, payload, errors: rowErrors(form), changed: JSON.stringify(payload) !== JSON.stringify(savedPayload(row)) }
    })
  }, [data, forms])

  const changedCount = rows.filter((r) => r.changed).length
  const hasErrors = rows.some((r) => r.errors.length > 0)

  const setRow = (id: string, patch: Partial<RowForm>) =>
    setForms((prev) => (prev ? { ...prev, [id]: { ...prev[id], ...patch } } : prev))

  // Throwing keeps the dialog open (ConfirmDialog plays the error sound)
  const publish = async () => {
    try {
      const result = (await saveTariffs({ tariffs: rows.map((r) => r.payload), note: note.trim() || undefined })) as { version: number }
      setBaseVersion(result.version)
      setNote('')
      playSound('success')
      toast.success(`Version ${result.version} published. New bookings use it straight away.`)
    } catch (err) {
      toast.error(errorText(err, 'Could not publish the new prices. Please try again.'))
      throw err
    }
  }

  if (!data || !forms) {
    return (
      <AdminPage>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20 rounded-lg" />
          <Skeleton className="h-8 w-56 rounded-lg" />
          <Skeleton className="h-4 w-full max-w-lg rounded-lg" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
          <div className="space-y-6">
            <Skeleton className="h-72 rounded-2xl" />
            <Skeleton className="h-56 rounded-2xl" />
          </div>
        </div>
      </AdminPage>
    )
  }

  const current = data.history.find((h) => h.version === data.version)
  const newerVersion = baseVersion !== null && data.version > baseVersion

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Marketplace"
        title="Pricing & payouts"
        description={
          <>
            One price for each Rehabify service across the network, and the fixed amount each physiotherapist is paid for
            it. Rehabify absorbs Paystack&apos;s fee. Every publish is a new version: new bookings use it straight away and
            existing bookings keep the price they were booked at.
            <span className="mt-1 block text-xs text-neutral-400 dark:text-neutral-500">
              {data.version === 0
                ? 'Using the default figures. Publishing creates version 1.'
                : `Version ${data.version} in force${current ? `, published ${format(current.createdAt, 'd MMM yyyy, HH:mm')}${current.createdBy ? ` by ${current.createdBy}` : ''}` : ''}`}
            </span>
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm" className={softButtonClass}>
              <Link href="/dashboard/admin/travel-zones">
                <MapPinned className="mr-1.5 h-4 w-4" />
                Travel zones
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className={softButtonClass}>
              <Link href="/dashboard/admin/rehabify-access">
                <HandHeart className="mr-1.5 h-4 w-4" />
                Rehabify Access
              </Link>
            </Button>
          </>
        }
      />

      {data.version === 0 ? (
        <Callout tone="warning" title="Payouts and Rehabify Access aren’t active yet">
          The figures below are working defaults. Until you review them and publish, physiotherapists see “Payout being
          confirmed” instead of amounts, payout emails aren’t sent, and Rehabify Access can’t be turned on. Set the payouts
          and Access rates, then use Publish and activate.
        </Callout>
      ) : (
        <Callout tone="info" title={`Version ${data.version} is active`}>
          Physiotherapists see these payouts, and Rehabify Access uses these Access rates
          {data.settings.accessIntakeOpen ? ' (taking applications).' : '. Turn on “Taking applications” in Programme settings to open Access.'}
        </Callout>
      )}

      {newerVersion && (
        <Callout tone="info" title={`Version ${data.version} was published while you were editing`}>
          <span className="flex flex-wrap items-center gap-2">
            Load it before making changes, or your publish will replace it.
            <Button size="sm" className={cn(softButtonClass, 'h-7 text-xs')} onClick={loadLatest}>
              Load version {data.version}
            </Button>
          </span>
        </Callout>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel
            title="Services"
            description="Amounts in naira. Leave both Access amounts blank if a service isn't offered under Rehabify Access."
            actions={changedCount > 0 ? <StatusBadge tone="amber">{changedCount} changed</StatusBadge> : undefined}
            bodyClassName="mt-2 divide-y divide-black/[0.05] border-t border-black/[0.05] dark:divide-white/[0.06] dark:border-white/[0.06]"
          >
            {rows.map(({ row, form, payload, errors, changed }) => (
              <ServiceEditor
                key={row.id}
                row={row}
                form={form}
                payload={payload}
                errors={errors}
                changed={changed}
                onChange={(patch) => setRow(row.id, patch)}
              />
            ))}
            <p className="px-5 py-3 text-xs text-neutral-500 dark:text-neutral-400">
              Margins are worked out before any travel charge and before partner commission. The free{' '}
              {getService('automated_screening')?.name ?? 'automated screening'} isn&apos;t bookable yet, so it has no price here.
            </p>
          </Panel>

          <Panel title="Publish" description="Patients see new prices and physiotherapists see new payouts as soon as you publish." bodyClassName="space-y-3 p-5 pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="tariff-note" className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                What changed <span className="font-normal text-neutral-400">(optional)</span>
              </Label>
              <Input
                id="tariff-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                placeholder="e.g. Payouts confirmed by leadership, 19 Oct"
                className={inputClass}
              />
            </div>
            {hasErrors && <p className="text-xs text-rose-600 dark:text-rose-300">Fix the highlighted services before publishing.</p>}
            <Button
              onClick={() => setConfirmOpen(true)}
              // The first publish activates the figures, even if none were changed
              disabled={(changedCount === 0 && data.version > 0) || hasErrors}
              className={cn(primaryButtonClass, 'w-full sm:w-auto')}
            >
              <Send className="mr-2 h-4 w-4" />
              {data.version === 0 ? 'Publish and activate' : 'Publish new version'}
            </Button>
          </Panel>
        </div>

        <div className="space-y-6">
          <ProgrammeSettings
            settings={data.settings}
            wouldBeDelisted={readiness?.totals.wouldBeDelisted}
            // Access opens only on published Access rates (the server checks this too)
            accessRatesActive={
              data.version > 0 &&
              data.services.some((s) => s.active && s.assistedPriceKobo !== null && s.assistedPayoutKobo !== null)
            }
          />
          <NetworkRollout readiness={readiness} />
          <VersionHistory history={data.history} currentVersion={data.version} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={data.version === 0 ? 'Publish and activate these figures?' : `Publish version ${data.version + 1}?`}
        description={
          data.version === 0
            ? 'Physiotherapists will see these payouts, and Rehabify Access can then be turned on with these Access rates. New bookings use them straight away.'
            : `${changedCount} service${changedCount === 1 ? '' : 's'} changed. New bookings use these prices and payouts straight away. Existing bookings keep theirs.`
        }
        confirmLabel={data.version === 0 ? 'Publish and activate' : 'Publish'}
        onConfirm={publish}
      />
    </AdminPage>
  )
}

function ServiceEditor({
  row,
  form,
  payload,
  errors,
  changed,
  onChange,
}: {
  row: ServiceRow
  form: RowForm
  payload: TariffPayload
  errors: string[]
  changed: boolean
  onChange: (patch: Partial<RowForm>) => void
}) {
  const id = useId()
  const standard = errors.length === 0 ? marginFor(payload, row.mode, false) : null
  const offeredUnderAccess = payload.assistedPriceKobo !== undefined && payload.assistedPayoutKobo !== undefined
  const assisted = errors.length === 0 && offeredUnderAccess ? marginFor(payload, row.mode, true) : null

  return (
    <div className={cn('space-y-3 px-5 py-4', !form.active && 'bg-neutral-50/70 dark:bg-white/[0.02]')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-rh-night dark:text-white">
            {row.name}
            {changed && <StatusBadge tone="amber">Edited</StatusBadge>}
            {!form.active && <StatusBadge>Off</StatusBadge>}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {row.mode === 'home' ? 'Home visit' : 'Virtual'} · {row.durationLabel}
          </p>
        </div>
        <label htmlFor={`${id}-active`} className="flex cursor-pointer items-center gap-2 text-xs font-medium text-neutral-600 dark:text-neutral-300">
          {form.active ? 'Offered' : 'Not offered'}
          <Switch id={`${id}-active`} checked={form.active} onCheckedChange={(active) => onChange({ active })} className={switchClass} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MoneyField id={`${id}-price`} label="Patient price" value={form.price} onChange={(price) => onChange({ price })} />
        <MoneyField id={`${id}-payout`} label="Physio payout" value={form.payout} onChange={(payout) => onChange({ payout })} />
        <MoneyField
          id={`${id}-access-price`}
          label="Access price"
          value={form.accessPrice}
          placeholder="Not offered"
          onChange={(accessPrice) => onChange({ accessPrice })}
        />
        <MoneyField
          id={`${id}-access-payout`}
          label="Access payout"
          value={form.accessPayout}
          placeholder="Not offered"
          onChange={(accessPayout) => onChange({ accessPayout })}
        />
      </div>

      {row.mode === 'home' && (
        <label htmlFor={`${id}-travel`} className="flex cursor-pointer items-start justify-between gap-3 rounded-xl bg-rh-canvas px-3 py-2.5 dark:bg-white/[0.04]">
          <span className="min-w-0">
            <span className="block text-xs font-medium text-rh-night dark:text-white">Add the travel-zone charge</span>
            <span className="block text-[11px] text-neutral-500 dark:text-neutral-400">
              The patient&apos;s zone surcharge is added on top of this price, and the price shows as &ldquo;From&rdquo;.
            </span>
          </span>
          <Switch
            id={`${id}-travel`}
            checked={form.travelApplies}
            onCheckedChange={(travelApplies) => onChange({ travelApplies })}
            className={cn('mt-0.5', switchClass)}
          />
        </label>
      )}

      {errors.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-rose-600 dark:text-rose-300">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : (
        <div className="space-y-0.5 text-xs">
          {standard && <MarginLine quote={standard} />}
          {assisted ? (
            <MarginLine quote={assisted} assisted />
          ) : (
            <p className="text-neutral-500 dark:text-neutral-400">Not offered under Rehabify Access.</p>
          )}
        </div>
      )}
    </div>
  )
}

function MarginLine({ quote, assisted = false }: { quote: RehabifyQuote; assisted?: boolean }) {
  const fee = formatKobo(quote.feeEstimateKobo)
  if (quote.rehabifyKobo <= 0) {
    return (
      <p className="font-medium text-rose-600 dark:text-rose-300">
        {assisted ? 'Rehabify subsidy under Access' : 'Rehabify makes a loss'}:{' '}
        <span className="tabular-nums">{formatKobo(-quote.rehabifyKobo)}</span> per session after Paystack (~{fee})
      </p>
    )
  }
  return (
    <p className="text-neutral-600 dark:text-neutral-300">
      {assisted ? 'Under Access, Rehabify keeps ' : 'Rehabify keeps '}
      <span className="font-semibold tabular-nums text-rh-night dark:text-white">{formatKobo(quote.rehabifyKobo)}</span> after Paystack (~{fee})
    </p>
  )
}

function MoneyField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
        {label}
      </Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">₦</span>
        <Input
          id={id}
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClass, 'pl-7 tabular-nums placeholder:text-xs')}
        />
      </div>
    </div>
  )
}

function ProgrammeSettings({
  settings,
  wouldBeDelisted,
  accessRatesActive,
}: {
  settings: TariffsData['settings']
  wouldBeDelisted?: number
  accessRatesActive: boolean
}) {
  const saveSettings = useMutation(api.serviceTariffs.adminSavePricingSettings)
  const [capacity, setCapacity] = useState(String(settings.accessCapacity))
  const [intakeOpen, setIntakeOpen] = useState(settings.accessIntakeOpen)
  const [termsDate, setTermsDate] = useState(dateInputValue(settings.networkTermsEnforcedAt))
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const id = useId()

  const capacityNumber = Number(capacity)
  const capacityValid = capacity.trim() !== '' && Number.isInteger(capacityNumber) && capacityNumber >= 0 && capacityNumber <= 10_000
  const termsAt = termsDate ? new Date(`${termsDate}T00:00:00`).getTime() : undefined
  const termsChanged = termsDate !== dateInputValue(settings.networkTermsEnforcedAt)
  const changed = capacityNumber !== settings.accessCapacity || intakeOpen !== settings.accessIntakeOpen || termsChanged
  const delistWarning = Boolean(termsAt && termsChanged && (wouldBeDelisted ?? 0) > 0)

  /** Throws on failure so the confirm dialog stays open. */
  const save = async () => {
    setSaving(true)
    try {
      await saveSettings({ accessCapacity: capacityNumber, accessIntakeOpen: intakeOpen, networkTermsEnforcedAt: termsAt })
      playSound('success')
      toast.success('Programme settings saved.')
    } catch (err) {
      toast.error(errorText(err, 'Could not save the settings. Please try again.'))
      throw err
    } finally {
      setSaving(false)
    }
  }

  const onSave = () => {
    if (!capacityValid) return
    if (delistWarning) setConfirmOpen(true)
    else save().catch(() => playSound('error'))
  }

  const delistCount = wouldBeDelisted ?? 0
  const savedTermsAt = settings.networkTermsEnforcedAt
  return (
    <Panel title="Programme settings" description="Rehabify Access places and the network terms deadline." bodyClassName="space-y-4 p-5 pt-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-capacity`} className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
          Rehabify Access places
        </Label>
        <Input
          id={`${id}-capacity`}
          inputMode="numeric"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          className={cn(inputClass, 'tabular-nums', !capacityValid && 'border-rose-400 dark:border-rose-400')}
        />
        <p className={cn('text-xs', capacityValid ? 'text-neutral-500 dark:text-neutral-400' : 'text-rose-600 dark:text-rose-300')}>
          {capacityValid ? 'How many Access arrangements can be active at once.' : 'Enter a whole number from 0 to 10,000.'}
        </p>
      </div>

      <label htmlFor={`${id}-intake`} className="flex cursor-pointer items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-rh-night dark:text-white">Taking applications</span>
          <span className="block text-xs text-neutral-500 dark:text-neutral-400">
            {accessRatesActive || intakeOpen
              ? 'When off, the Access form tells patients to check back later. Reviews and existing arrangements carry on.'
              : 'Set the Access price and payout for at least one service and publish them first. Then you can turn Access on.'}
          </span>
        </span>
        <Switch
          id={`${id}-intake`}
          checked={intakeOpen}
          onCheckedChange={setIntakeOpen}
          disabled={!accessRatesActive && !intakeOpen}
          className={cn('mt-0.5', switchClass)}
        />
      </label>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-terms`} className="flex items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-300">
          Network terms required from
          {savedTermsAt ? (
            savedTermsAt <= Date.now() ? (
              <StatusBadge tone="green">In force</StatusBadge>
            ) : (
              <StatusBadge tone="amber">{formatDistanceToNowStrict(savedTermsAt, { addSuffix: true })}</StatusBadge>
            )
          ) : (
            <StatusBadge>Not enforced</StatusBadge>
          )}
        </Label>
        <div className="flex gap-2">
          <Input
            id={`${id}-terms`}
            type="date"
            value={termsDate}
            onChange={(e) => setTermsDate(e.target.value)}
            className={cn(inputClass, 'dark:[color-scheme:dark]')}
          />
          {termsDate && (
            <Button type="button" variant="ghost" size="sm" className="h-10 rounded-xl text-xs dark:text-neutral-200" onClick={() => setTermsDate('')}>
              Clear
            </Button>
          )}
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          From this date, physiotherapists who haven&apos;t accepted the Rehabify network terms stop being bookable. Leave it
          empty while acceptances are still coming in.
        </p>
        {delistWarning && (
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            {delistCount} listed physiotherapist{delistCount === 1 ? ' hasn’t' : 's haven’t'} accepted yet. See Network rollout below.
          </p>
        )}
      </div>

      <Button onClick={onSave} disabled={saving || !changed || !capacityValid} className={cn(primaryButtonClass, 'w-full')}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save settings
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Require the network terms?"
        description={`From ${termsAt ? format(termsAt, 'd MMM yyyy') : 'that date'}, ${delistCount} physiotherapist${delistCount === 1 ? '' : 's'} who ${delistCount === 1 ? 'hasn’t' : 'haven’t'} accepted the network terms will stop being bookable on the website and through Joy, until they accept.`}
        confirmLabel="Save and enforce"
        destructive
        onConfirm={save}
      />
    </Panel>
  )
}

function NetworkRollout({ readiness }: { readiness: Readiness | undefined }) {
  const [showList, setShowList] = useState(false)
  if (!readiness) return <Skeleton className="h-64 rounded-2xl" />
  const { totals } = readiness
  const pending = readiness.physios.filter((p) => p.listed && !p.clinicMember && !p.acceptedTerms)
  const tiles: { label: string; value: number; hint?: string; tone?: 'attention' }[] = [
    { label: 'Accepted terms', value: totals.accepted, hint: `of ${totals.listed} listed` },
    { label: 'Would be delisted', value: totals.wouldBeDelisted, tone: totals.wouldBeDelisted > 0 ? 'attention' : undefined },
    { label: 'Clinic members', value: totals.clinicMembersExcluded, hint: 'not in the network' },
    { label: 'Home visits, no zones', value: totals.homeWithoutZones, tone: totals.homeWithoutZones > 0 ? 'attention' : undefined },
    { label: 'Access opt-ins', value: totals.accessOptIns },
  ]

  return (
    <Panel
      title="Network rollout"
      description={`Listed independent physiotherapists against the current network terms (version ${readiness.termsVersion}).`}
      bodyClassName="space-y-3 p-5 pt-3"
    >
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className={cn(
              'rounded-xl bg-rh-canvas px-3 py-2.5 dark:bg-white/[0.04]',
              tile.tone === 'attention' && 'ring-1 ring-amber-300/70 dark:ring-amber-500/30'
            )}
          >
            <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">{tile.label}</p>
            <p className="text-lg font-semibold tabular-nums text-rh-night dark:text-white">{tile.value.toLocaleString()}</p>
            {tile.hint && <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{tile.hint}</p>}
          </div>
        ))}
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Home visits without zones: physios offering home visits who haven&apos;t chosen the zones they cover, so they
        can&apos;t be booked for home services.
      </p>

      {pending.length > 0 ? (
        <div>
          <Button size="sm" variant="ghost" className="h-8 rounded-lg px-2 text-xs dark:text-neutral-200" onClick={() => setShowList((v) => !v)}>
            {showList ? 'Hide' : 'Show'} the {pending.length} who haven&apos;t accepted
          </Button>
          {showList && (
            <ul className="mt-2 max-h-80 divide-y divide-black/[0.05] overflow-y-auto rounded-xl border border-black/[0.06] dark:divide-white/[0.06] dark:border-white/10">
              {pending.map((physio) => (
                <li key={physio.userId}>
                  <Link
                    href={`/dashboard/admin/users/${physio.userId}`}
                    className="flex items-start justify-between gap-2 px-3 py-2 transition-colors hover:bg-rh-canvas dark:hover:bg-white/[0.03]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-rh-night dark:text-white">{physio.name}</span>
                      {physio.email && <span className="block truncate text-[11px] text-neutral-500 dark:text-neutral-400">{physio.email}</span>}
                    </span>
                    <span className="flex shrink-0 flex-wrap justify-end gap-1">
                      {physio.offersVideo && <StatusBadge tone="teal">Video</StatusBadge>}
                      {physio.offersHome && <StatusBadge tone={physio.homeWithoutZones ? 'amber' : 'neutral'}>{physio.homeWithoutZones ? 'Home, no zones' : 'Home'}</StatusBadge>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Every listed physiotherapist has accepted the current terms.</p>
      )}
    </Panel>
  )
}

function VersionHistory({ history, currentVersion }: { history: TariffsData['history']; currentVersion: number }) {
  return (
    <Panel title="Version history" description="The 20 most recent versions." bodyClassName="pt-2">
      {history.length === 0 ? (
        <EmptyState icon={<History />} title="No versions yet" description="You're on the default figures. Your first publish becomes version 1." />
      ) : (
        <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {history.map((entry) => (
            <li key={entry.version} className="px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-rh-night dark:text-white">Version {entry.version}</span>
                {entry.version === currentVersion && <StatusBadge tone="green">In force</StatusBadge>}
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {format(entry.createdAt, 'd MMM yyyy, HH:mm')}
                {entry.createdBy ? ` · ${entry.createdBy}` : ''}
              </p>
              {entry.note && <p className="mt-1 text-xs text-neutral-700 dark:text-neutral-300">{entry.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
