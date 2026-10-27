'use client'

/**
 * Rehabify's services as a physio sees them, for patients who pay per session: the services this
 * physio offers (with what the physio earns, never what the patient pays), the areas they cover
 * for home visits, and the pieces the booking and accept-a-request drawers both use.
 */

import { useMemo, type ReactNode } from 'react'
import { Check } from '@/components/icons'
import { Textarea } from '@/components/ui/textarea'
import { InfoTip, fieldClass } from '@/components/physio/ui'
import { getService, type ServiceMode } from '@/lib/rehabify-services'
import type { CareBillingMode, MarketplaceSettings, PayoutSchedule, TravelZone } from '@/lib/rehabify-api-types'
import { useQueryUntyped } from '@/lib/convexUntyped'
import { cn } from '@/lib/utils'
import { useCareBillingMode, usePracticeMode } from '@/components/physio/practiceMode'
import { scheduleApi } from './shared'

/** A Rehabify service this physio offers, for a patient who pays per session. */
export type ScheduleService = {
  id: string
  name: string
  mode: ServiceMode
  durationMinutes: number
  durationLabel: string
  payoutKobo: number
  travelApplies: boolean
}

export type HomeVisit = { zoneId: string; area: string }

/**
 * Whether this patient pays Rehabify prices, and if so the services and areas the physio can
 * offer them. Pass no patient to skip the queries. Independent physios only have their own
 * patients, so nothing about Rehabify services, payouts or areas is loaded for them.
 */
export function useRehabifyServices(patientId: string | null | undefined) {
  const practice = usePracticeMode()
  const billing: CareBillingMode | null | undefined = useCareBillingMode(patientId)
  const isRehabify = billing?.mode === 'rehabify'
  // Video and home-visit coverage are Rehabify network settings: an independent physio has none
  const coverageQuery = useQueryUntyped(
    scheduleApi.marketplaceSettings.getMyMarketplaceSettings,
    patientId && practice.loaded && !practice.isIndependent ? {} : 'skip'
  ) as MarketplaceSettings | null | undefined
  const coverage = practice.isIndependent ? null : coverageQuery
  const payoutSchedule = useQueryUntyped(scheduleApi.serviceTariffs.getPayoutSchedule, isRehabify ? {} : 'skip') as PayoutSchedule | null | undefined
  const zones = useQueryUntyped(scheduleApi.travelZones.listZones, isRehabify ? {} : 'skip') as TravelZone[] | undefined
  /** True while anything the booking and invoice drawers need is still on its way. */
  const loading = Boolean(patientId) && (billing === undefined || coverage === undefined || (isRehabify && payoutSchedule === undefined))

  // Only the Rehabify services this physio offers: video, and home visits where they cover an area
  const services = useMemo<ScheduleService[]>(() => {
    if (!payoutSchedule || !coverage) return []
    const offersHome = coverage.offersInPersonSessions && coverage.coveredZoneIds.length > 0
    const rows = payoutSchedule.services.flatMap((row) => {
      const info = getService(row.id)
      if (!row.active || !info || (row.mode === 'home' ? !offersHome : !coverage.offersOnlineSessions)) return []
      // Treatment follows an assessment; the server refuses it until the patient has had one
      if (info.requiresPriorAssessment && billing?.assessed === false) return []
      return [
        {
          id: row.id,
          name: row.name,
          mode: row.mode,
          durationMinutes: info.durationMinutes,
          durationLabel: row.durationLabel,
          payoutKobo: row.payoutKobo,
          travelApplies: row.travelApplies,
        },
      ]
    })
    const isTreatment = (id: string) => Number(getService(id)?.kind === 'treatment')
    return rows.sort((a, b) => isTreatment(b.id) - isTreatment(a.id))
  }, [payoutSchedule, coverage, billing?.assessed])

  const coveredZones = useMemo(() => {
    const covered = new Set<string>((coverage?.coveredZoneIds ?? []) as string[])
    return (zones ?? []).filter((zone) => covered.has(zone.id))
  }, [zones, coverage])

  return { billing, isRehabify, coverage, payoutSchedule, zones, services, coveredZones, loading }
}

/**
 * What the physio earns for a service: their payout, plus their share of the area's travel
 * charge on a home visit that carries one (null until that area is chosen). Same sums as the
 * server's quote, so it matches the payout the booking records.
 */
export function earningsFor(service: ScheduleService, zone: TravelZone | null | undefined): number | null {
  if (!service.travelApplies) return service.payoutKobo
  if (!zone) return null
  const share = Math.min(100, Math.max(0, zone.physioTravelSharePercent ?? 100))
  return service.payoutKobo + Math.round((Math.max(0, Math.round(zone.surchargeKobo)) * share) / 100)
}

const KIND_RANK: Record<string, number> = { treatment: 0, assessment: 1, consultation: 2 }

/**
 * The service to start with for a patient's request: the one they picked if the physio offers
 * it, else the same kind of visit (video or home) they asked for, treatment once they've been
 * assessed, else an assessment.
 */
export function suggestService(services: ScheduleService[], request: { serviceType?: string; home: boolean }): ScheduleService | null {
  const named = services.find((service) => service.name === request.serviceType)
  if (named) return named
  const sameMode = services.filter((service) => service.mode === (request.home ? 'home' : 'virtual'))
  const pool = sameMode.length > 0 ? sameMode : services
  const rank = (service: ScheduleService) => KIND_RANK[getService(service.id)?.kind ?? ''] ?? 3
  return [...pool].sort((a, b) => rank(a) - rank(b))[0] ?? null
}

/** A big tappable choice: icon, title, a line under it, optional right-hand text, selected state. */
export function Choice({
  icon,
  title,
  detail,
  aside,
  selected,
  onClick,
}: {
  icon: ReactNode
  title: string
  detail?: ReactNode
  aside?: ReactNode
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50 active:scale-[0.99]',
        selected ? 'border-pt-ink bg-pt-sunken' : 'border-pt-line-strong bg-pt-surface hover:bg-pt-hover'
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-pt-ink">{title}</span>
        {detail && <span className="mt-0.5 block text-xs text-pt-muted">{detail}</span>}
      </span>
      {aside && <span className="shrink-0 text-right">{aside}</span>}
      <span
        aria-hidden
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-pt-ink bg-pt-ink text-pt-on-primary' : 'border-pt-line-strong'
        )}
      >
        {selected && <Check className="h-3 w-3" />}
      </span>
    </button>
  )
}

/** The patient's area (from the zones this physio covers) and address, for a home visit. */
export function HomeVisitFields({
  idPrefix,
  zones,
  coveredZones,
  visit,
  onVisit,
  address,
  onAddress,
}: {
  idPrefix: string
  zones: TravelZone[] | undefined
  coveredZones: TravelZone[]
  visit: HomeVisit | null
  onVisit: (visit: HomeVisit | null) => void
  address: string
  onAddress: (address: string) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-area`} className="mb-1.5 flex items-center gap-1 text-sm font-medium text-pt-ink">
          Patient’s area
          <InfoTip>Only the areas you cover are listed. Your share of the area’s travel charge is added to your payout.</InfoTip>
        </label>
        <select
          id={`${idPrefix}-area`}
          value={visit ? `${visit.zoneId}::${visit.area}` : ''}
          onChange={(e) => {
            const [zoneId, ...rest] = e.target.value.split('::')
            onVisit(zoneId ? { zoneId, area: rest.join('::') } : null)
          }}
          className={cn(fieldClass, 'h-11 w-full border px-3 text-sm')}
        >
          <option value="">{zones === undefined ? 'Loading areas…' : 'Choose an area you cover'}</option>
          {coveredZones.map((zone) => (
            <optgroup key={zone.id} label={`${zone.name}, ${zone.city}`}>
              {zone.areas.map((area) => (
                <option key={area} value={`${zone.id}::${area}`}>
                  {area}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-address`} className="mb-1.5 block text-sm font-medium text-pt-ink">
          Address for the visit
        </label>
        <Textarea
          id={`${idPrefix}-address`}
          value={address}
          onChange={(e) => onAddress(e.target.value)}
          placeholder="House number, street and any landmarks"
          rows={2}
          maxLength={500}
          className={cn(fieldClass, 'resize-none')}
        />
      </div>
    </div>
  )
}
