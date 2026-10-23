'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { format } from 'date-fns'
import { Clock, Eye, Save, ShieldCheck } from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cardClass, ConfirmDialog, inputClass, Panel, primaryButtonClass, StatusBadge } from '@/components/admin/ui'
import { paystackFeeEstimateKobo } from '@/lib/rehabify-services'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { Callout, errorMessage, hintClass, labelClass, linkClass, LoadingBlock } from './shared'

type InboundBearer = 'physiotherapist' | 'patient' | 'rehabify' | 'split_proportional'
type OutboundBearer = 'physiotherapist' | 'partner' | 'rehabify' | 'split_proportional'

const INBOUND_BEARERS: InboundBearer[] = ['physiotherapist', 'patient', 'rehabify', 'split_proportional']
const OUTBOUND_BEARERS: OutboundBearer[] = ['physiotherapist', 'partner', 'rehabify', 'split_proportional']

const naira = (value: number) => `₦${Math.round(value).toLocaleString('en-NG')}`

function SplitInput({
  id,
  label,
  hint,
  value,
  onChange,
  swatch,
}: {
  id: string
  label: string
  hint: string
  value: number
  onChange: (value: number) => void
  swatch: string
}) {
  return (
    <div className="space-y-1.5 rounded-xl bg-rh-canvas p-3 dark:bg-white/[0.04]">
      <label htmlFor={id} className={cn(labelClass, 'flex items-center gap-1.5')}>
        <span className={cn('h-2.5 w-2.5 rounded-full', swatch)} />
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min="0"
          max="100"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn(inputClass, 'pr-7 text-sm font-semibold tabular-nums')}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-neutral-400">%</span>
      </div>
      <p className={hintClass}>{hint}</p>
    </div>
  )
}

function SimulationCard({
  title,
  amount,
  rows,
  net,
}: {
  title: string
  amount: number
  rows: { label: string; value: string; tone?: 'muted' | 'danger' }[]
  net: { label: string; value: string }
}) {
  return (
    <div className="space-y-2.5 rounded-xl bg-white p-4 shadow-soft dark:bg-rh-ink-3 dark:shadow-none">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-rh-night dark:text-white">{title}</span>
        <StatusBadge tone="teal">{naira(amount)}</StatusBadge>
      </div>
      <div className="space-y-1.5 text-xs">
        {rows.map((row) => (
          <div
            key={row.label}
            className={cn(
              'flex justify-between gap-3',
              row.tone === 'muted' && 'text-[11px] text-neutral-500 dark:text-neutral-400',
              row.tone === 'danger' && 'text-[11px] text-rose-600 dark:text-rose-300',
              !row.tone && 'text-rh-night dark:text-neutral-200'
            )}
          >
            <span>{row.label}</span>
            <span className="tabular-nums">{row.value}</span>
          </div>
        ))}
        <div className="flex justify-between rounded-lg bg-rh-mist px-2 py-1.5 font-semibold text-rh-teal dark:bg-rh-aqua/10 dark:text-rh-aqua">
          <span>{net.label}</span>
          <span className="tabular-nums">{net.value}</span>
        </div>
      </div>
    </div>
  )
}

/** The standard-pricing example in the preview (serviceTariffs.adminGetTariffs). */
type TariffExample = { services: { id: string; name: string; priceKobo: number; payoutKobo: number; active: boolean }[] }

export function RevenueSettingsTab() {
  const settings = useQuery(api.platformSettings.getPlatformRevenueSettings)
  const updateSettings = useMutation(api.platformSettings.updatePlatformRevenueSettings)
  const tariffs = useQuery(api.serviceTariffs.adminGetTariffs) as unknown as TariffExample | undefined

  const [physioPercent, setPhysioPercent] = useState(80)
  const [rehabifyPercent, setRehabifyPercent] = useState(10)
  const [partnerPercent, setPartnerPercent] = useState(10)
  // No longer edited here (standard pricing replaced them); saved back unchanged
  const [virtualRateNaira, setVirtualRateNaira] = useState(6000)
  const [inPersonRateNaira, setInPersonRateNaira] = useState(10000)
  const [feeBearerInbound, setFeeBearerInbound] = useState<InboundBearer>('physiotherapist')
  const [feeBearerOutbound, setFeeBearerOutbound] = useState<OutboundBearer>('physiotherapist')
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Load the saved settings into the form
  useEffect(() => {
    if (!settings) return
    setPhysioPercent(settings.physiotherapistPercent)
    setRehabifyPercent(settings.rehabifyPercent)
    setPartnerPercent(settings.partnerPercent)
    setVirtualRateNaira(Math.round(settings.defaultVirtualRateKobo / 100))
    setInPersonRateNaira(Math.round(settings.defaultInPersonRateKobo / 100))
    const inbound = settings.paystackFeeBearerInbound as InboundBearer | undefined
    const outbound = settings.paystackFeeBearerOutbound as OutboundBearer | undefined
    if (inbound && INBOUND_BEARERS.includes(inbound)) setFeeBearerInbound(inbound)
    if (outbound && OUTBOUND_BEARERS.includes(outbound)) setFeeBearerOutbound(outbound)
  }, [settings])

  const total = Number(physioPercent) + Number(rehabifyPercent) + Number(partnerPercent)
  const totalValid = total === 100

  const validate = () => {
    if (!totalValid) {
      toast.error(`Total percentage must equal 100%. Current sum: ${total}%`)
      return false
    }
    return true
  }

  const save = async () => {
    try {
      await updateSettings({
        physiotherapistPercent: Number(physioPercent),
        rehabifyPercent: Number(rehabifyPercent),
        partnerPercent: Number(partnerPercent),
        defaultVirtualRateKobo: Math.round(virtualRateNaira * 100),
        defaultInPersonRateKobo: Math.round(inPersonRateNaira * 100),
        payoutSchedule: 'end_of_month',
        paystackFeeBearerInbound: feeBearerInbound,
        paystackFeeBearerOutbound: feeBearerOutbound,
      })
      playSound('success')
      toast.success('Revenue split saved. Changes are live platform-wide.')
    } catch (error) {
      playSound('error')
      toast.error(errorMessage(error, 'Failed to update revenue settings'))
    }
  }

  if (settings === undefined) return <LoadingBlock className="h-64" />

  const share = (amount: number, percent: number) => Math.round((amount * percent) / 100)

  // Standard pricing example: fixed physio payout, partner % of the price before travel, Rehabify absorbs Paystack
  const example =
    tariffs?.services.find((s) => s.id === 'virtual_assessment' && s.active) ?? tariffs?.services.find((s) => s.active) ?? null
  const examplePrice = example ? example.priceKobo / 100 : 0
  const examplePayout = example ? example.payoutKobo / 100 : 0
  const exampleFee = example ? paystackFeeEstimateKobo(example.priceKobo) / 100 : 0
  const examplePartner = share(examplePrice, partnerPercent)

  return (
    <div className="space-y-6">
      <Callout tone="info" title="Partner revenue split">
        Sets the default commission a referring partner earns on each paid booking. A signed partner contract overrides it for that partner. Saving
        applies straight away to payment reconciliation and the partner portal.
        <span className="mt-1 block">
          Marketplace prices and physiotherapist payouts now live in{' '}
          <Link href="/dashboard/admin/service-tariffs" className={linkClass}>
            Admin › Pricing & payouts
          </Link>
          , and Rehabify absorbs Paystack&apos;s fee. On those bookings the physiotherapist gets their fixed payout and the partner percentage is
          worked out on the session price before any travel charge. The physiotherapist and Rehabify percentages only apply to older bookings.
        </span>
        {settings.isCustom && 'updatedBy' in settings && (
          <span className="mt-1 block text-neutral-500 dark:text-neutral-400">
            Last saved {format(settings.updatedAt, 'd MMM yyyy, h:mm a')}
            {settings.updatedBy ? ` by ${settings.updatedBy}` : ''}.
          </span>
        )}
      </Callout>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <Panel
            title="Revenue split"
            actions={<StatusBadge tone={totalValid ? 'green' : 'red'}>{totalValid ? 'Total 100%' : `Total ${total}% (must be 100%)`}</StatusBadge>}
            bodyClassName="space-y-4 px-5 pb-5 pt-3"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SplitInput id="split-physio" label="Physiotherapist" hint="Standard: 80%" value={physioPercent} onChange={setPhysioPercent} swatch="bg-rh-teal dark:bg-rh-aqua" />
              <SplitInput id="split-rehabify" label="Rehabify" hint="Standard: 10% platform fee" value={rehabifyPercent} onChange={setRehabifyPercent} swatch="bg-rh-amber" />
              <SplitInput id="split-partner" label="Referring partner" hint="Standard: 10% commission" value={partnerPercent} onChange={setPartnerPercent} swatch="bg-[#7c9cf5]" />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
                <span>Distribution</span>
                <span className="tabular-nums">
                  {physioPercent} / {rehabifyPercent} / {partnerPercent}
                </span>
              </div>
              <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.06]">
                <div style={{ width: `${Math.min(100, Math.max(0, physioPercent))}%` }} className="bg-rh-teal transition-all dark:bg-rh-aqua" title={`Physiotherapist: ${physioPercent}%`} />
                <div style={{ width: `${Math.min(100, Math.max(0, rehabifyPercent))}%` }} className="bg-rh-amber transition-all" title={`Rehabify: ${rehabifyPercent}%`} />
                <div style={{ width: `${Math.min(100, Math.max(0, partnerPercent))}%` }} className="bg-[#7c9cf5] transition-all" title={`Referring partner: ${partnerPercent}%`} />
              </div>
            </div>
          </Panel>

          <Panel title="Fees and stamp duty" description="Payment collection charges and outbound transfer levies." bodyClassName="space-y-4 px-5 pb-5 pt-3">
            <p className="text-xs text-neutral-600 dark:text-neutral-300">
              Rehabify absorbs Paystack&apos;s collection fee, so patients pay the published price and nothing is added at checkout.
            </p>
            <Callout tone="info" title="Stamp duty (EMTL)">
              Under the Finance Act and Electronic Money Transfer Levy, electronic transfers of ₦10,000 and above attract a ₦50 stamp duty. It is shown
              as its own deduction on every partner invoice.
            </Callout>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-rh-canvas px-3 py-2.5 text-xs dark:bg-white/[0.04]">
              <span className="flex items-center gap-2 text-rh-night dark:text-neutral-200">
                <Clock className="h-4 w-4 text-rh-teal dark:text-rh-aqua" />
                Payout schedule: end-of-month consolidated payouts
              </span>
              <StatusBadge tone="teal">Active</StatusBadge>
            </div>
          </Panel>

          <Button
            onClick={() => validate() && setConfirmOpen(true)}
            disabled={!totalValid}
            className={cn(primaryButtonClass, 'h-11 w-full')}
          >
            <Save className="mr-2 h-4 w-4" />
            Save platform settings
          </Button>
        </div>

        <div className="space-y-6 lg:col-span-5">
          <div className={cn(cardClass, 'space-y-3 bg-rh-cream/60 p-5 dark:bg-rh-ink-2')}>
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[15px] font-semibold text-rh-night dark:text-white">
                <Eye className="h-4 w-4 text-rh-teal dark:text-rh-aqua" /> Live preview
              </h3>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">Updates as you type</span>
            </div>
            {example && (
              <SimulationCard
                title={`${example.name}, referred by a partner`}
                amount={examplePrice}
                rows={[
                  { label: 'Physiotherapist (fixed payout)', value: naira(examplePayout) },
                  { label: `Referring partner (${partnerPercent}%)`, value: naira(examplePartner) },
                  { label: 'Paystack fee (Rehabify absorbs)', value: `~${naira(exampleFee)}`, tone: 'muted' },
                ]}
                net={{ label: 'Rehabify keeps', value: naira(examplePrice - examplePayout - examplePartner - exampleFee) }}
              />
            )}
            <SimulationCard
              title="Partner batch example"
              amount={100000}
              rows={[
                { label: `Physiotherapists (${physioPercent}%)`, value: naira(share(100000, physioPercent)) },
                { label: `Rehabify (${rehabifyPercent}%)`, value: naira(share(100000, rehabifyPercent)) },
                { label: `Partner gross (${partnerPercent}%)`, value: naira(share(100000, partnerPercent)) },
                { label: 'Paystack transfer fee', value: '-₦50', tone: 'danger' },
                { label: 'Stamp duty (EMTL, ₦10k+)', value: '-₦50', tone: 'danger' },
              ]}
              net={{ label: 'Net transfer to partner', value: naira(share(100000, partnerPercent) - 100) }}
            />
          </div>

          <Panel title="Partner transparency" bodyClassName="px-5 pb-5 pt-2">
            <ul className="space-y-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
              <li className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rh-teal dark:text-rh-aqua" />
                <span>
                  <strong className="text-rh-night dark:text-white">Partner portal:</strong> partners see what the physiotherapist charged and each
                  party&apos;s share, line by line.
                </span>
              </li>
              <li className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rh-teal dark:text-rh-aqua" />
                <span>
                  <strong className="text-rh-night dark:text-white">Paystack and bank transfer:</strong> both are recorded and split the same way, so
                  nothing is lost.
                </span>
              </li>
              <li className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rh-teal dark:text-rh-aqua" />
                <span>
                  <strong className="text-rh-night dark:text-white">Month-end audit:</strong> every figure reconciles with the monthly payout summary.
                </span>
              </li>
            </ul>
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Save platform revenue settings?"
        description={`Referring partners without a contract will earn ${partnerPercent}% (older bookings split ${physioPercent}% / ${rehabifyPercent}% / ${partnerPercent}%). This applies platform-wide straight away.`}
        confirmLabel="Save settings"
        onConfirm={save}
      >
        <p className="text-xs text-neutral-500 dark:text-neutral-400">Commissions already earned keep their recorded amounts.</p>
      </ConfirmDialog>
    </div>
  )
}
