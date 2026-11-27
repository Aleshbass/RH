'use client'

/**
 * The end of a scored case, as swipeable cards (owner 2026-11-14: "use that carousel again" instead
 * of a long scrolling page): how it went, critical actions, your decisions, what an expert would do,
 * findings you missed, take-home points with references, then sharing and the Sim Pass. Same
 * full-screen phone frame as the player (ScoredPlayer); the cards themselves are v2/parts.tsx
 * DebriefCards, shared with the reviewers' preview.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { BellRing, Check, Loader2, RotateCcw, X } from '@/components/icons'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { pillInk, pillLime, pillOutline } from '../shared'
import { DISCLAIMER, errorText, simApi, simPath, SIMULATIONS_PATH, simTrack } from './simApi'
import { ShareReplayCard } from './replay/ShareReplay'
import { DebriefCards, PlayerFrame } from './v2/parts'
import { ConsultDebrief } from './consult/ConsultDebrief'

function InterestCard({ slug, interested }: { slug: string; interested: boolean }) {
  const register = useMutation(simApi.registerInterest)
  const [done, setDone] = useState(interested)
  const [busy, setBusy] = useState(false)
  const join = async () => {
    setBusy(true)
    try {
      await register({ caseSlug: slug })
      setDone(true)
      playSound('success')
      simTrack('sim_interest', { case: slug })
    } catch (err) {
      toast.error(errorText(err, 'Couldn’t save that. Try again.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="learn-fixed-dark rounded-[22px] bg-rh-ink p-5 text-white">
      <p className="text-[18px] font-semibold leading-tight">Want more cases like this?</p>
      <p className="mt-2 text-sm leading-6 text-white/70">
        Sim Pass is coming: new cases every month across MSK, neuro, cardio-respiratory and sports, with scored certificates you can share.
      </p>
      {done ? (
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold">
          <Check className="h-4 w-4 text-rh-lime" /> You’re on the list. We’ll let you know.
        </p>
      ) : (
        <button type="button" onClick={() => void join()} disabled={busy} className={cn(pillLime, 'mt-4 h-11 px-5')}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Get notified
        </button>
      )}
    </div>
  )
}

export function SimDebrief({ attemptId, slug }: { attemptId: string; slug: string }) {
  const data = useQuery(simApi.debrief, { attemptId })
  const start = useMutation(simApi.start)
  const router = useRouter()
  const [restarting, setRestarting] = useState(false)
  const announced = useRef(false)

  // Full screen: the page behind doesn't scroll
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  // The cards play the result sound and confetti; this just records the result once
  useEffect(() => {
    if (!data || announced.current) return
    announced.current = true
    const s = data.debrief.score
    simTrack('sim_finish', { case: slug, pct: s.pct, passed: s.passed, outcome: s.outcome, reason: s.reason ?? 'none', preview: data.preview })
  }, [data, slug])

  const frame = (children: React.ReactNode) => <PlayerFrame>{children}</PlayerFrame>

  if (data === undefined) {
    return frame(
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-rh-ink/40" />
      </div>
    )
  }
  if (data === null) {
    return frame(
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-rh-ink/60">This debrief isn’t available.</p>
        <Link href={SIMULATIONS_PATH} className={cn(pillOutline, 'h-11 px-5')}>
          All simulations
        </Link>
      </div>
    )
  }
  // A conversation ("talk to the patient") has its own debrief: coaching, the note, the transcript
  if (data.consult) return <ConsultDebrief data={data} />

  const { debrief: d, case: c } = data

  const again = async () => {
    setRestarting(true)
    try {
      const res = await start({ slug: c.slug, preview: data.preview || undefined })
      router.replace(`${simPath(c.slug)}?attempt=${res.attemptId}`)
    } catch (err) {
      toast.error(errorText(err, 'Couldn’t start again.'))
      setRestarting(false)
    }
  }

  return frame(
    <>
      <div className="learn-fixed-dark flex shrink-0 items-center gap-3 bg-[rgb(8_16_15)] px-3 py-2.5 text-white">
        <Link href={SIMULATIONS_PATH} aria-label="Back to all simulations" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-white/10">
          <X className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight">{c.title}</p>
          <p className="truncate text-xs text-white/55">Debrief{data.preview ? ' · preview, not scored' : ''}</p>
        </div>
      </div>
      <DebriefCards
        d={d}
        stats={{ best: data.best, average: data.average }}
        extra={{
          title: 'Share your run',
          body: (
            <div className="space-y-4">
              <ShareReplayCard attemptId={attemptId} slug={c.slug} pct={d.score.pct} title={c.title} />
              {!data.preview && <InterestCard slug={c.slug} interested={data.interested} />}
              <p className="text-xs leading-5 text-rh-ink/45">{DISCLAIMER}</p>
            </div>
          ),
        }}
        footer={
          <>
            <button type="button" onClick={() => void again()} disabled={restarting} className={cn(pillInk, 'h-12 flex-1')}>
              {restarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Try again
            </button>
            <Link href={SIMULATIONS_PATH} className="flex h-12 flex-1 items-center justify-center rounded-full border border-rh-ink/15 text-sm font-semibold text-rh-ink">
              Other cases
            </Link>
          </>
        }
      />
    </>
  )
}
