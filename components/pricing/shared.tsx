'use client'

/**
 * Pieces shared by /pricing and /rehabify-access: the live service catalogue (with the code
 * defaults from lib/rehabify-services.ts while it loads) and a few layout helpers in the landing
 * page's style: canvas, ink and white, with lime only for the main action.
 */

import type { ReactNode } from 'react'
import { useQuery } from 'convex/react'
import { motion, useReducedMotion } from 'framer-motion'
import { Plus } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { cn } from '@/lib/utils'
import { joyWhatsAppUrl } from '@/lib/joyWhatsApp'
import { REHABIFY_SERVICES, defaultTariffs, formatKobo, isBookableServiceId } from '@/lib/rehabify-services'
import type { Catalogue, CatalogueService } from '@/lib/rehabify-api-types'

export type { Catalogue, CatalogueService }

/** Same shape as serviceTariffs.getCatalogue, from the code defaults. */
function defaultCatalogue(): Catalogue {
  const tariffs = defaultTariffs()
  return {
    version: 0,
    services: REHABIFY_SERVICES.map((service) => {
      const tariff = isBookableServiceId(service.id) ? tariffs[service.id] : null
      return {
        id: service.id,
        name: service.name,
        shortName: service.shortName,
        mode: service.mode,
        kind: service.kind,
        durationMinutes: service.durationMinutes,
        durationLabel: service.durationLabel,
        bookable: service.bookable && Boolean(tariff?.active),
        requiresPriorAssessment: service.requiresPriorAssessment,
        priceKobo: tariff?.priceKobo ?? 0,
        travelApplies: tariff?.travelApplies ?? false,
        offeredUnderAccess: tariff?.assistedPriceKobo !== undefined && tariff?.assistedPayoutKobo !== undefined,
        summary: service.summary,
        whatHappens: service.whatHappens,
        youReceive: service.youReceive,
        notIncluded: service.notIncluded ?? null,
      }
    }),
  }
}

const DEFAULT_CATALOGUE = defaultCatalogue()

/** Live prices; the server-rendered copy, then the code defaults, until the query loads. */
export function useCatalogue(initial?: Catalogue | null): Catalogue {
  const live = useQuery(api.serviceTariffs.getCatalogue, {}) as Catalogue | undefined
  return live ?? initial ?? DEFAULT_CATALOGUE
}

export function findService(catalogue: Catalogue, id: string): CatalogueService {
  return catalogue.services.find((s) => s.id === id) ?? DEFAULT_CATALOGUE.services.find((s) => s.id === id)!
}

/** "₦20,000", "From ₦30,000" (travel added) or "Free". */
export function servicePrice(service: CatalogueService): string {
  if (service.priceKobo === 0) return 'Free'
  return service.travelApplies ? `From ${formatKobo(service.priceKobo)}` : formatKobo(service.priceKobo)
}

/** The pricing page shows the consultation price (and the free screening); every other price appears when the patient books. */
export function showsPrice(service: Pick<CatalogueService, 'id' | 'kind'>): boolean {
  return service.id === 'recovery_consultation' || service.kind === 'screening'
}

/** Bookings from the pricing page go through Joy on WhatsApp. */
export function bookWithJoyUrl(service?: Pick<CatalogueService, 'name'>, area?: string): string {
  if (!service) return joyWhatsAppUrl("Hi Joy! I'd like to book physiotherapy with Rehabify.")
  return joyWhatsAppUrl(`Hi Joy! I'd like to book the ${service.name}${area ? ` in ${area}` : ''}.`)
}

export const WHATSAPP_HELP_URL = joyWhatsAppUrl('Hi Joy! I have a question about booking physiotherapy with Rehabify.')

/** Main action: lime with ink text. Add `w-full` or spacing at the call site. */
export const ctaPrimary =
  'group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-rh-lime px-7 text-[15px] font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'

/** Second action on a light background. */
export const ctaSecondary =
  'inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-7 text-[15px] font-semibold text-rh-ink ring-1 ring-inset ring-rh-ink/10 transition-colors hover:ring-rh-ink/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2'

/** Second action on ink. */
export const ctaSecondaryOnDark =
  'inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-[15px] font-semibold text-white ring-1 ring-inset ring-white/25 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime focus-visible:ring-offset-2 focus-visible:ring-offset-rh-ink'

/** Inline text link on a light background. */
export const textLink = 'font-semibold text-rh-ink underline decoration-rh-ink/30 underline-offset-4 transition-colors hover:decoration-rh-ink'

export function SectionHeading({
  title,
  description,
  center = false,
  onDark = false,
}: {
  /** @deprecated No longer shown: headings stand on their own. Kept so older callers still compile. */
  eyebrow?: string
  title: string
  description?: ReactNode
  center?: boolean
  onDark?: boolean
}) {
  return (
    <div className={cn('max-w-2xl', center && 'mx-auto text-center')}>
      <h2 className={cn('text-[34px] font-bold leading-[1.05] tracking-tight sm:text-5xl', onDark ? 'text-white' : 'text-rh-ink')}>
        {title}
      </h2>
      {description && (
        <p
          className={cn(
            'mt-4 max-w-xl text-base font-medium leading-relaxed sm:text-lg',
            center && 'mx-auto',
            onDark ? 'text-white/75' : 'text-rh-ink/75'
          )}
        >
          {description}
        </p>
      )}
    </div>
  )
}

/** A plain bulleted line. */
export function ListItem({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden className={cn('mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full', onDark ? 'bg-rh-lime' : 'bg-rh-ink/40')} />
      <span className={cn('text-[15px] font-medium leading-6', onDark ? 'text-white/85' : 'text-rh-ink/80')}>{children}</span>
    </li>
  )
}

export function FadeUp({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  )
}

/** A question and answer that opens in place (no script needed). Wrap a list of them in `border-b border-rh-ink/10`. */
export function FaqItem({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group border-t border-rh-ink/10">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-left text-lg font-semibold leading-snug text-rh-ink sm:text-xl [&::-webkit-details-marker]:hidden">
        {question}
        <Plus aria-hidden className="h-4 w-4 shrink-0 transition-transform duration-300 group-open:rotate-45 motion-reduce:transition-none" />
      </summary>
      <div className="-mt-2 max-w-2xl pb-6 text-[15px] font-medium leading-relaxed text-rh-ink/70 sm:text-base">{children}</div>
    </details>
  )
}
