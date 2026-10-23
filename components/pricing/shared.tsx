'use client'

/**
 * Pieces shared by /pricing and /rehabify-access: the live service catalogue (with the code
 * defaults from lib/rehabify-services.ts while it loads) and a few layout helpers. Buttons and
 * fields reuse the brand pieces in components/learn/shared.tsx.
 */

import type { ReactNode } from 'react'
import { useQuery } from 'convex/react'
import { motion, useReducedMotion } from 'framer-motion'
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

export function SectionHeading({
  eyebrow,
  title,
  description,
  center = false,
  onDark = false,
}: {
  eyebrow?: string
  title: string
  description?: ReactNode
  center?: boolean
  onDark?: boolean
}) {
  return (
    <div className={cn('max-w-2xl', center && 'mx-auto text-center')}>
      {eyebrow && (
        <p className={cn('mb-3 text-xs font-semibold uppercase tracking-[0.16em]', onDark ? 'text-rh-mint' : 'text-rh-teal')}>{eyebrow}</p>
      )}
      <h2 className={cn('text-[30px] leading-[1.1] tracking-tight sm:text-[42px]', onDark ? 'text-white' : 'text-rh-night')}>{title}</h2>
      {description && (
        <p className={cn('mt-4 text-lg font-medium leading-relaxed', onDark ? 'text-white' : 'text-rh-night/85')}>{description}</p>
      )}
    </div>
  )
}

/** A plain bulleted line. */
export function ListItem({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden className={cn('mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full', onDark ? 'bg-rh-lime' : 'bg-rh-teal')} />
      <span className={cn('text-[15px] font-medium leading-6', onDark ? 'text-white' : 'text-rh-night')}>{children}</span>
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

/** A question and answer that opens in place (no script needed). */
export function FaqItem({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group border-b border-rh-night/10 py-5">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-left text-[17px] font-semibold text-rh-night [&::-webkit-details-marker]:hidden">
        {question}
        <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-2xl leading-none text-rh-teal transition group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="pt-3 text-[15px] font-medium leading-7 text-rh-night/80">{children}</div>
    </details>
  )
}
