'use client'

import { useId, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { useQuery } from 'convex/react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check, ChevronDown, ClipboardList, House, Info, MapPinOff, Repeat, Video } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { displayFont, fieldClass } from '@/components/learn/shared'
import { formatKobo } from '@/lib/rehabify-services'
import { cn } from '@/lib/utils'
import type { ServiceQuote, TravelZone } from '@/lib/rehabify-api-types'
import {
  bookWithJoyUrl,
  ctaPrimary,
  ctaSecondary,
  findService,
  ListItem,
  showsPrice,
  WHATSAPP_HELP_URL,
  type Catalogue,
  type CatalogueService,
} from './shared'

type Assessed = 'no' | 'yes'
type Mode = 'virtual' | 'home'
type Zone = TravelZone
type AreaOption = { key: string; area: string; zoneId: Zone['id']; zoneName: string }

const OTHER = '__other'

/** New patients start with the Recovery Consultation (as Joy does); assessed patients pick treatment by video or at home. */
const FIRST_STEP = 'recovery_consultation'
const TREATMENT_FOR: Record<Mode, string> = { virtual: 'virtual_treatment', home: 'home_treatment' }

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
  const atHome = assessed === 'yes' && mode === 'home'
  const areaUnknown = atHome && (noZones || city === OTHER || areaKey === OTHER)
  const serviceId = assessed === 'no' ? FIRST_STEP : assessed === 'yes' && mode ? TREATMENT_FOR[mode] : null
  const ready = Boolean(serviceId && (!atHome || selectedArea))

  const quote = useQuery(
    api.marketplace.booking.getServiceQuote,
    ready && serviceId ? { serviceId, zoneId: atHome ? selectedArea?.zoneId : undefined } : 'skip'
  ) as Quote

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr] lg:items-start lg:gap-8">
      <div className="space-y-4">
        <Step number={1} title="Have you been assessed by Rehabify?" hint="New patients start with a Recovery Consultation.">
          <Choice
            name="assessed"
            value="no"
            checked={assessed === 'no'}
            onSelect={() => setAssessed('no')}
            icon={ClipboardList}
            title="No, not yet"
            body="Start with a Recovery Consultation"
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

        {assessed === 'yes' && (
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

        {atHome && (
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
    <div className="rounded-[2rem] bg-white p-6 sm:p-7">
      <div className="flex items-start gap-4">
        <span aria-hidden className="w-6 shrink-0 pt-1 text-sm font-semibold tabular-nums text-rh-ink/40">
          {String(number).padStart(2, '0')}
        </span>
        <div className="min-w-0">
          <h3 id={labelId} className="text-[20px] font-bold leading-snug tracking-tight text-rh-ink">
            {title}
          </h3>
          {hint && <p className="mt-1 text-[15px] font-medium text-rh-ink/65">{hint}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
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
        'relative flex cursor-pointer items-start gap-3.5 rounded-2xl p-4 ring-inset transition active:scale-[0.99] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-rh-ink',
        checked ? 'bg-rh-canvas ring-2 ring-rh-ink' : 'bg-white ring-1 ring-rh-ink/10 hover:ring-rh-ink/25'
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onSelect} className="sr-only" />
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-rh-ink transition-colors',
          checked ? 'bg-rh-lime' : 'bg-rh-canvas'
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 pr-5">
        <span className="block text-base font-semibold text-rh-ink">{title}</span>
        <span className="mt-0.5 block text-sm font-medium leading-5 text-rh-ink/65">{body}</span>
      </span>
      {checked && <Check aria-hidden className="absolute right-4 top-4 h-4 w-4 text-rh-ink" />}
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
          <div className="h-12 animate-pulse rounded-2xl bg-rh-ink/[0.06]" />
          <div className="h-12 animate-pulse rounded-2xl bg-rh-ink/[0.06]" />
        </div>
      ) : zones.length === 0 ? (
        <p className="text-[15px] font-medium text-rh-ink/70">Home visits can&apos;t be booked online in any area just yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={cityId} className="mb-1.5 block text-sm font-semibold text-rh-ink/75">
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
            <label htmlFor={areaId} className="mb-1.5 block text-sm font-semibold text-rh-ink/75">
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
      <ChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-rh-ink/50" />
    </div>
  )
}

function Placeholder() {
  return (
    <div className="rounded-[2rem] border border-dashed border-rh-ink/15 p-8 text-center sm:p-10">
      <h3 className="text-[22px] font-bold leading-tight tracking-tight text-rh-ink">Your recommendation</h3>
      <p className="mx-auto mt-2 max-w-xs text-[15px] font-medium leading-6 text-rh-ink/65">
        Answer the questions to see the right session and what&apos;s included.
      </p>
    </div>
  )
}

function AreaNotCovered({ noZones, onVideo }: { noZones: boolean; onVideo: () => void }) {
  return (
    <div className="rounded-[2rem] bg-white p-7 sm:p-9">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rh-canvas text-rh-ink">
        <MapPinOff className="h-5 w-5" />
      </span>
      <h3 className="mt-5 text-[22px] font-bold leading-tight tracking-tight text-rh-ink">
        {noZones ? 'Home visits are coming to online booking' : "We can't confirm home visits there yet"}
      </h3>
      <p className="mt-2 text-[15px] font-medium leading-6 text-rh-ink/70">
        Home visits are booked by area. Start by video today, or ask us to check your area.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={onVideo} className={ctaPrimary}>
          <Video className="h-4 w-4" /> Choose video instead
        </button>
        <a href={WHATSAPP_HELP_URL} target="_blank" rel="noopener noreferrer" className={ctaSecondary}>
          Ask about your area
        </a>
      </div>
    </div>
  )
}

type Quote = ServiceQuote | undefined

function Recommendation({
  service,
  assessed,
  quote,
  area,
}: {
  service: CatalogueService
  assessed: Assessed
  quote: Quote
  area: AreaOption | null
}) {
  const failure = quote && !quote.ok ? quote.message : null
  const priced = quote?.ok ? quote : null

  return (
    <article className="overflow-hidden rounded-[2rem] bg-white">
      <div className="bg-rh-ink px-7 pb-7 pt-6 text-white sm:px-9">
        <p className="text-sm font-semibold text-white/60">Recommended for you</p>
        <h3 className="mt-2 text-[26px] font-bold leading-tight tracking-tight text-white">{service.name}</h3>
        <p className="mt-1 text-[15px] font-medium text-white/70">
          {service.durationLabel}
          {area ? ` · ${area.area}` : ''}
        </p>
      </div>

      <div className="px-7 py-7 sm:px-9">
        {failure ? (
          <p className="mb-6 flex gap-2.5 rounded-2xl bg-rh-canvas p-4 text-[15px] font-medium leading-6 text-rh-ink">
            <Info className="mt-1 h-4 w-4 shrink-0" />
            {failure}
          </p>
        ) : showsPrice(service) ? (
          <div className="mb-6 flex items-end justify-between gap-4 border-b border-rh-ink/10 pb-5">
            <p className="text-base font-semibold text-rh-ink">You pay</p>
            <p className={cn('text-[32px] leading-none tracking-tight text-rh-ink', displayFont)}>
              {formatKobo(priced?.chargeKobo ?? service.priceKobo)}
            </p>
          </div>
        ) : null}

        <p className="text-[15px] font-medium leading-6 text-rh-ink/80">{service.summary}</p>

        <ul className="mt-5 space-y-2.5">
          {service.whatHappens.map((item) => (
            <ListItem key={item}>{item}</ListItem>
          ))}
        </ul>

        <p className="mt-5 rounded-2xl bg-rh-canvas p-4 text-[15px] font-medium leading-6 text-rh-ink/80">
          <span className="font-semibold text-rh-ink">You receive: </span>
          {service.youReceive}
        </p>
        {service.notIncluded && <p className="mt-3 text-sm font-medium leading-6 text-rh-ink/65">{service.notIncluded}</p>}

        {failure ? (
          <a href={WHATSAPP_HELP_URL} target="_blank" rel="noopener noreferrer" className={cn(ctaSecondary, 'mt-6 w-full')}>
            Ask us on WhatsApp
          </a>
        ) : (
          <>
            <a
              href={bookWithJoyUrl(service, area?.area)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(ctaPrimary, 'mt-6 w-full')}
            >
              Book now <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
            <p className="mt-3 text-center text-sm font-medium text-rh-ink/60">Opens WhatsApp, where Joy books your session.</p>
          </>
        )}

        {assessed === 'yes' && (
          <p className="mt-5 border-t border-rh-ink/10 pt-5 text-sm font-medium leading-6 text-rh-ink/65">
            Treatment sessions follow your Rehabify assessment. If you haven&apos;t had one yet, choose &ldquo;No, not yet&rdquo; above.
          </p>
        )}
      </div>
    </article>
  )
}
