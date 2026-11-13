'use client'

/** Learn home: the simulation cases, once any are live. */

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { ArrowRight } from '@/components/icons'
import { cn } from '@/lib/utils'
import { displayFont } from '../shared'
import { simApi, SIMULATIONS_PATH } from './simApi'
import { CaseCard } from './SimLobby'

export function SimsHomeBand() {
  const data = useQuery(simApi.list, {})
  const cases = data?.cases.filter((c) => c.live).slice(0, 3) ?? []
  if (cases.length === 0) return null
  return (
    <section className="bg-white px-4 py-16 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h2 className={cn('text-[30px] leading-[1.1] tracking-tight text-rh-ink sm:text-[40px]', displayFont)}>Practise real cases</h2>
            <p className="mt-3 text-[16px] leading-relaxed text-rh-ink/60">
              Timed clinical simulations with voice-acted patients and a live monitor. Make the calls, then see how an expert would handle it.
            </p>
          </div>
          <Link href={SIMULATIONS_PATH} className="inline-flex items-center gap-1.5 text-sm font-semibold text-rh-ink hover:underline">
            All simulations <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cases.map((card, i) => (
            <CaseCard key={card.slug} card={card} index={i} />
          ))}
        </ul>
      </div>
    </section>
  )
}
