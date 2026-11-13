'use client'

/** Learn › Simulations: the cases, your best scores, and the Sim Pass interest button. */

import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { toast } from 'sonner'
import { Activity, BellRing, Check, Clock, Loader2, MapPin, Play, Volume2 } from '@/components/icons'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { displayFont, pillLime } from '../shared'
import { JoinPrompt } from '../social/ui'
import { DISCLAIMER, errorText, modeLabel, simApi, simPath, SIMULATIONS_PATH, simTrack, SPECIALTY_LABEL, type SimCaseCard } from './simApi'
import { Difficulty, SceneArt } from './SimPlayer'

export function CaseCard({ card, index }: { card: SimCaseCard; index: number }) {
  const mine = card.mine
  return (
    <motion.li initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}>
      <Link
        href={simPath(card.slug)}
        className="group flex h-full flex-col overflow-hidden rounded-[28px] border border-rh-ink/[0.08] bg-white transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(10,20,18,0.45)]"
      >
        <div className="relative">
          <SceneArt scene={card.cover} patientName={card.patient.name} setting={card.setting} className="aspect-[16/10] w-full" sizes="(min-width: 1024px) 400px, 100vw" />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-bold', card.mode === 'triage' ? 'bg-rh-lime text-[#0b1312]' : 'bg-white text-[#0b1312]')}>
              {modeLabel(card)}
            </span>
            {!card.live && <span className="rounded-full bg-amber-300 px-2.5 py-1 text-[11px] font-bold text-[#3b2a00]">Draft</span>}
          </div>
          {mine?.best !== null && mine?.best !== undefined && (
            <span
              className={cn(
                'absolute right-3 top-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold',
                mine.passed ? 'bg-rh-lime text-[#0b1312]' : 'bg-white text-[#0b1312]'
              )}
            >
              {mine.passed && <Check className="h-3 w-3" />} Best {mine.best}%
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-center gap-2 text-xs font-semibold text-rh-ink/55">
            <span>{SPECIALTY_LABEL[card.specialty] ?? card.specialty}</span>
            <Difficulty level={card.difficulty} className="text-rh-ink/70" />
          </div>
          <h3 className="mt-2 text-[18px] font-semibold leading-snug text-rh-ink">{card.title}</h3>
          <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-rh-ink/60">{card.summary}</p>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-rh-ink/50">
            <MapPin className="h-3 w-3" /> {card.patient.name}, {card.patient.age} · {card.setting}
          </p>
          <span className="mt-auto flex items-center justify-between pt-5">
            <span className="text-xs text-rh-ink/45">{card.plays > 0 ? `${card.plays} plays` : 'New'}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rh-ink px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-black">
              <Play className="h-3.5 w-3.5" /> {mine?.activeAttemptId ? 'Resume' : mine?.tries ? 'Play again' : 'Play'}
            </span>
          </span>
        </div>
      </Link>
    </motion.li>
  )
}

function ComingSoon({ member, interested }: { member: boolean; interested: boolean }) {
  const register = useMutation(simApi.registerInterest)
  const [done, setDone] = useState(interested)
  const [busy, setBusy] = useState(false)
  return (
    <div className="rounded-[28px] bg-rh-ink p-8 text-white sm:p-10">
      <p className={cn('text-[26px] leading-tight tracking-tight', displayFont)}>The first cases are in clinical review</p>
      <p className="mt-2 max-w-lg text-[15px] leading-6 text-white/70">
        Our physiotherapists are checking every case before it goes live. Get a message the day they open.
      </p>
      {member &&
        (done ? (
          <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold">
            <Check className="h-4 w-4 text-rh-lime" /> You’re on the list
          </p>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await register({})
                setDone(true)
                playSound('success')
                simTrack('sim_interest', { case: 'lobby' })
              } catch (err) {
                toast.error(errorText(err, 'Couldn’t save that.'))
              } finally {
                setBusy(false)
              }
            }}
            className={cn(pillLime, 'mt-5 h-12 px-6')}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Notify me
          </button>
        ))}
    </div>
  )
}

export function SimLobby() {
  const data = useQuery(simApi.list, {})
  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <div className="max-w-2xl">
        <h1 className={cn('text-[36px] leading-tight tracking-tight text-rh-ink sm:text-[48px]', displayFont)}>Simulations</h1>
        <p className="mt-2 text-[16px] leading-7 text-rh-ink/60">
          Real cases with the clock running. Decide what you’d do, watch the patient respond, then see how an expert would handle it.
        </p>
        <ul className="mt-5 flex flex-wrap gap-2 text-sm text-rh-ink/70">
          {[
            { icon: Clock, text: 'Timed triage and full cases' },
            { icon: Volume2, text: 'Voice-acted Nigerian patients' },
            { icon: Activity, text: 'Live bedside monitor' },
          ].map((item) => (
            <li key={item.text} className="flex items-center gap-1.5 rounded-full border border-rh-ink/[0.08] px-3 py-1.5">
              <item.icon className="h-3.5 w-3.5" /> {item.text}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-10">
        {data === undefined ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-96 animate-pulse rounded-[28px] bg-rh-ink/[0.05]" />
            ))}
          </div>
        ) : data.cases.length === 0 ? (
          <ComingSoon member={data.member} interested={data.interested} />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.cases.map((card, i) => (
              <CaseCard key={card.slug} card={card} index={i} />
            ))}
          </ul>
        )}
      </div>

      {data && !data.member && (
        <div className="mt-10">
          <JoinPrompt signedIn={data.signedIn} returnTo={SIMULATIONS_PATH}>
            Join Rehabify Learn for free to play the cases and keep your scores.
          </JoinPrompt>
        </div>
      )}
      <p className="mt-12 max-w-2xl text-xs leading-5 text-rh-ink/45">{DISCLAIMER}</p>
    </main>
  )
}
