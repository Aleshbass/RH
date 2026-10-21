'use client'

import { useId, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check, ChevronDown, ClipboardList, House, Info, MapPinOff, Repeat, Sparkles, Video } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { CheckItem, displayFont, fieldClass, pillOutline, pillTeal } from '@/components/learn/shared'
import { formatKobo } from '@/lib/rehabify-services'
import { cn } from '@/lib/utils'
import type { ServiceQuote, TravelZone } from '@/lib/rehabify-api-types'
import { findService, getCareHref, modeLabel, WHATSAPP_HELP_URL, type Catalogue, type CatalogueService } from './shared'

type Assessed = 'no' | 'yes'
type Mode = 'virtual' | 'home'
type Zone = TravelZone
type AreaOption = { key: string; area: string; zoneId: Zone['id']; zoneName: string }

const OTHER = '__other'

const SERVICE_FOR: Record<Assessed, Record<Mode, string>> = {
  no: { virtual: 'virtual_assessment', home: 'home_assessment' },
  yes: { virtual: 'virtual_treatment', home: 'home_treatment' },
}

export function CareChooser({ catalogue }: { catalogue: Catalogue }) {
  const [assessed, setAssessed] = useState<Assessed | null>(null)
  const [mode, setMode] = useState<Mode | null>(null)
  const [city, setCity] = useState('')
  const [areaKey, setAreaKey] = useState('')
  const zones = useQuery(api.travelZones.listZones, {}) as Zone[] | undefined

  const cities = useMemo(() => [...new Set((zones ?? []).map((zone) => zone.city))], [zones])
  const areaOptions = useMemo<AreaOption[]>(() => {
    const seen = new Set<string>()
    const options: AreaOption[] = []
    for (const zone of zones ?? []) {
      if (zone.city !== city) continue
      for (const area of zone.areas) {
        const key = area.trim().toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        options.push({ key: `${zone.id}:${key}`, area, zoneId: zone.id, zoneName: zone.name })
      }
    }
    return options.sort((a, b) => a.area.localeCompare(b.area))
  }, [zones, city])

  const selectedArea = areaOptions.find((option) => option.key === areaKey) ?? null
  const noZones = zones !== undefined && zones.length === 0
  const areaUnknown = mode === 'home' && (noZones || city === OTHER || areaKey === OTHER)
  const serviceId = assessed && mode ? SERVICE_FOR[assessed][mode] : null
  const ready = Boolean(serviceId && (mode === 'virtual' || selectedArea))

  const quote = useQuery(
    api.marketplace.booking.getServiceQuote,
    ready && serviceId ? { serviceId, zoneId: mode === 'home' ? selectedArea?.zoneId : undefined } : 'skip'
  ) as Quote

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr] lg:items-start lg:gap-8">
      <div className="space-y-4">
        <Step number={1} title="Have you been assessed by Rehabify?" hint="An assessment comes first, then treatment.">
          <Choice
            name="assessed"
            value="no"
            checked={assessed === 'no'}
            onSelect={() => setAssessed('no')}
            icon={ClipboardList}
            title="No, not yet"
            body="Start with a full assessment"
          />
          <Choice
            name="assessed"
            value="yes"
            checked={assessed === 'yes'}
            onSelect={() => setAssessed('yes')}
            icon={Repeat}
            title="Yes, I have"
            body="Continue with treatment"
          />
        </Step>

        {assessed && (
          <Reveal>
            <Step number={2} title="Video or at home?" hint="Both are with a qualified physiotherapist.">
              <Choice
                name="mode"
                value="virtual"
                checked={mode === 'virtual'}
                onSelect={() => setMode('virtual')}
                icon={Video}
                title="By video"
                body="From wherever you are"
              />
              <Choice
                name="mode"
                value="home"
                checked={mode === 'home'}
                onSelect={() => setMode('home')}
                icon={House}
                title="At home"
                body="A physiotherapist visits you"
              />
            </Step>
          </Reveal>
        )}

        {mode === 'home' && (
          <Reveal>
            <AreaStep
              zones={zones}
              cities={cities}
              city={city}
              onCity={(value) => {
                setCity(value)
                setAreaKey('')
              }}
              areaOptions={areaOptions}
              areaKey={areaKey}
              onArea={setAreaKey}
            />
          </Reveal>
        )}
      </div>

      <div className="lg:sticky lg:top-24">
        <p className="sr-only" aria-live="polite">
          {ready && serviceId ? `Recommended: ${findService(catalogue, serviceId).name}` : ''}
        </p>
        {areaUnknown ? (
          <AreaNotCovered noZones={noZones} onVideo={() => setMode('virtual')} />
        ) : ready && serviceId && assessed ? (
          <Recommendation
            service={findService(catalogue, serviceId)}
            consultation={findService(catalogue, 'recovery_consultation')}
            assessed={assessed}
            quote={quote}
            area={selectedArea}
          />
        ) : (
          <Placeholder />
        )}
      </div>
    </div>
  )
}

function Reveal({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

function StepShell({ number, title, hint, labelId, children }: { number: number; title: string; hint?: string; labelId?: string; children: ReactNode }) {
  return (
    <div className="rounded-[1.75rem] bg-white p-5 shadow-soft sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rh-teal text-sm font-semibold text-white">
          {number}
        </span>
        <div className="min-w-0 pt-0.5">
          <h3 id={labelId} className="text-lg leading-snug text-rh-night">
            {title}
          </h3>
          {hint && <p className="mt-0.5 text-sm text-rh-night/55">{hint}</p>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function Step({ number, title, hint, children }: { number: number; title: string; hint?: string; children: ReactNode }) {
  const labelId = useId()
  return (
    <StepShell number={number} title={title} hint={hint} labelId={labelId}>
      <div role="radiogroup" aria-labelledby={labelId} className="grid gap-3 sm:grid-cols-2">
        {children}
      </div>
    </StepShell>
  )
}

function Choice({
  name,
  value,
  checked,
  onSelect,
  icon: Icon,
  title,
  body,
}: {
  name: string
  value: string
  checked: boolean
  onSelect: () => void
  icon: ComponentType<{ className?: string }>
  title: string
  body: string
}) {
  return (
    <label
      className={cn(
        'relative flex cursor-pointer items-start gap-3.5 rounded-2xl border p-4 transition active:scale-[0.99] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-rh-teal has-[:focus-visible]:ring-offset-2',
        checked ? 'border-rh-teal bg-rh-honeydew' : 'border-rh-night/10 bg-white hover:border-rh-night/25'
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onSelect} className="sr-only" />
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition',
          checked ? 'bg-rh-teal text-white' : 'bg-rh-mist text-rh-teal'
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 pr-5">
        <span className="block text-[15px] font-semibold text-rh-night">{title}</span>
        <span className="mt-0.5 block text-sm leading-5 text-rh-night/60">{body}</span>
      </span>
      {checked && <Check aria-hidden className="absolute right-4 top-4 h-4 w-4 text-rh-teal" strokeWidth={3} />}
    </label>
  )
}

function AreaStep({
  zones,
  cities,
  city,
  onCity,
  areaOptions,
  areaKey,
  onArea,
}: {
  zones: Zone[] | undefined
  cities: string[]
  city: string
  onCity: (value: string) => void
  areaOptions: AreaOption[]
  areaKey: string
  onArea: (value: string) => void
}) {
  const cityId = useId()
  const areaId = useId()

  return (
    <StepShell number={3} title="Where are you?" hint="We check that a physiotherapist covers your area.">
      {zones === undefined ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-12 animate-pulse rounded-2xl bg-rh-night/[0.06]" />
          <div className="h-12 animate-pulse rounded-2xl bg-rh-night/[0.06]" />
        </div>
      ) : zones.length === 0 ? (
        <p className="text-sm text-rh-night/65">Home visits can&apos;t be booked online in any area just yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={cityId} className="mb-1.5 block text-sm font-medium text-rh-night/75">
              City
            </label>
            <Select id={cityId} value={city} onChange={onCity}>
              <option value="" disabled>
                Choose your city
              </option>
              {cities.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              <option value={OTHER}>My city isn&apos;t listed</option>
            </Select>
          </div>
          <div>
            <label htmlFor={areaId} className="mb-1.5 block text-sm font-medium text-rh-night/75">
              Area
            </label>
            <Select id={areaId} value={areaKey} onChange={onArea} disabled={!city || city === OTHER}>
              <option value="" disabled>
                {city && city !== OTHER ? 'Choose your area' : 'Choose a city first'}
              </option>
              {areaOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.area}
                </option>
              ))}
              <option value={OTHER}>My area isn&apos;t listed</option>
            </Select>
          </div>
        </div>
      )}
    </StepShell>
  )
}

function Select({
  id,
  value,
  onChange,
  disabled,
  children,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(fieldClass, 'appearance-none pr-10')}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-rh-night/50" />
    </div>
  )
}

function Placeholder() {
  return (
    <div className="rounded-[1.75rem] border border-dashed border-rh-night/15 bg-white/60 p-7 text-center sm:p-9">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rh-mint text-rh-teal">
        <Sparkles className="h-5 w-5" />
      </span>
      <h3 className="mt-5 text-xl text-rh-night">Your recommendation</h3>
      <p className="mx-auto mt-2 max-w-xs text-[15px] leading-6 text-rh-night/60">
        Answer the questions and we&apos;ll show you the right session, what&apos;s included and the full price.
      </p>
    </div>
  )
}

function AreaNotCovered({ noZones, onVideo }: { noZones: boolean; onVideo: () => void }) {
  return (
    <div className="rounded-[1.75rem] bg-rh-peach p-7 sm:p-8">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/70 text-rh-night">
        <MapPinOff className="h-5 w-5" />
      </span>
      <h3 className="mt-5 text-xl text-rh-night">
        {noZones ? 'Home visits are coming to online booking' : "We can't confirm home visits there yet"}
      </h3>
      <p className="mt-2 text-[15px] leading-6 text-rh-night/70">
        Home visits are booked by area, so we can send a physiotherapist who covers it. You can start by video today, or
        ask us and we&apos;ll check your area.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={onVideo} className={cn(pillTeal, 'h-12')}>
          <Video className="h-4 w-4" /> Choose video instead
        </button>
        <a href={WHATSAPP_HELP_URL} target="_blank" rel="noopener noreferrer" className={cn(pillOutline, 'h-12')}>
          Ask about your area
        </a>
      </div>
    </div>
  )
}

type Quote = ServiceQuote | undefined

function Recommendation({
  service,
  consultation,
  assessed,
  quote,
  area,
}: {
  service: CatalogueService
  consultation: CatalogueService
  assessed: Assessed
  quote: Quote
  area: AreaOption | null
}) {
  const failure = quote && !quote.ok ? quote.message : null
  const priced = quote?.ok ? quote : null
  const href = getCareHref({ service: service.id, zone: area?.zoneId, area: area?.area })

  return (
    <article className="relative overflow-hidden rounded-[1.75rem] bg-white shadow-lift ring-1 ring-rh-night/[0.06]">
      <div className="bg-rh-teal px-6 pb-6 pt-5 text-white sm:px-7">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rh-lime px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-rh-night">
          Recommended for you
        </span>
        <h3 className="mt-3 text-[24px] leading-tight text-white">{service.name}</h3>
        <p className="mt-1 text-sm text-white/75">
          {service.durationLabel} · {modeLabel(service)}
          {area ? ` · ${area.area}` : ''}
        </p>
      </div>

      <div className="px-6 py-6 sm:px-7">
        {failure ? (
          <p className="flex gap-2.5 rounded-2xl bg-rh-peach p-4 text-sm leading-6 text-rh-night">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            {failure}
          </p>
        ) : (
          <dl className="space-y-2.5 text-[15px]">
            <PriceRow label={service.shortName} value={formatKobo(priced?.basePriceKobo ?? service.priceKobo)} />
            {service.mode === 'home' && (
              <PriceRow
                label={`Travel${priced?.zoneName ? ` (${priced.zoneName})` : ''}`}
                value={priced ? (priced.travelSurchargeKobo > 0 ? formatKobo(priced.travelSurchargeKobo) : 'Included') : null}
              />
            )}
            <div className="flex items-end justify-between gap-4 border-t border-rh-night/[0.08] pt-3">
              <dt className="font-semibold text-rh-night">You pay</dt>
              <dd className={cn('text-[30px] leading-none tracking-tight text-rh-night', displayFont)}>
                {priced ? formatKobo(priced.chargeKobo) : <span className="inline-block h-7 w-28 animate-pulse rounded-lg bg-rh-night/[0.07] align-middle" />}
              </dd>
            </div>
            <p className="text-right text-xs text-rh-night/50">All-inclusive. Nothing is added at checkout.</p>
          </dl>
        )}

        <p className="mt-6 text-[15px] leading-6 text-rh-night/75">{service.summary}</p>

        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-rh-night/45">What happens</p>
        <ul className="mt-3 space-y-2.5">
          {service.whatHappens.map((item) => (
            <CheckItem key={item}>{item}</CheckItem>
          ))}
        </ul>

        <p className="mt-5 rounded-2xl bg-rh-honeydew p-4 text-sm leading-6 text-rh-night/80">
          <span className="font-semibold text-rh-night">You receive: </span>
          {service.youReceive}
        </p>
        {service.notIncluded && <p className="mt-3 text-sm leading-6 text-rh-night/55">{service.notIncluded}</p>}

        {failure ? (
          <a href={WHATSAPP_HELP_URL} target="_blank" rel="noopener noreferrer" className={cn(pillOutline, 'mt-6 h-12 w-full text-[15px]')}>
            Ask us on WhatsApp
          </a>
        ) : (
          <Link href={href} className={cn(pillTeal, 'mt-6 h-12 w-full text-[15px]')}>
            Book now <ArrowRight className="h-4 w-4" />
          </Link>
        )}
        <p className="mt-3 text-center text-xs text-rh-night/50">Pick a time from your physiotherapist&apos;s availability. Confirmed once paid.</p>

        {assessed === 'no' ? (
          <p className="mt-5 border-t border-rh-night/[0.08] pt-5 text-sm leading-6 text-rh-night/65">
            Not sure you need a full assessment?{' '}
            <Link href={getCareHref({ service: consultation.id })} className="font-semibold text-rh-teal underline-offset-4 hover:underline">
              Start with a {consultation.durationLabel} Recovery Consultation for {formatKobo(consultation.priceKobo)}
            </Link>
            .
          </p>
        ) : (
          <p className="mt-5 border-t border-rh-night/[0.08] pt-5 text-sm leading-6 text-rh-night/65">
            Treatment sessions follow your Rehabify assessment. If you haven&apos;t had one yet, choose &ldquo;No, not yet&rdquo; above.
          </p>
        )}
      </div>
    </article>
  )
}

function PriceRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-rh-night/65">{label}</dt>
      <dd className="font-semibold tabular-nums text-rh-night">
        {value ?? <span className="inline-block h-4 w-16 animate-pulse rounded bg-rh-night/[0.07] align-middle" />}
      </dd>
    </div>
  )
}
