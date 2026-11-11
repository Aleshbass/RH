'use client'

/**
 * A one-time card in the physio portal: "New: Rehabify Scribe is here", what it does and where
 * to find it. Shown once per physio on any device (scribe.getScribeIntro / dismissScribeIntro),
 * and only once the scribe is switched on for them. Using the scribe counts as having seen it.
 * A floating card rather than a dialog, so it never stacks on top of other prompts.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { CalendarPlus, ClipboardList, Dumbbell, Mic, ShieldCheck, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { primaryButtonClass } from '@/components/physio/ui'
import { cn } from '@/lib/utils'
import { SCRIBE_NAME, SCRIBE_PILOT, scribeApi } from './scribeApi'

const POINTS = [
  { icon: Mic, text: 'Words appear live as you and the patient talk: in the room, on video calls, or dictated after.' },
  { icon: ClipboardList, text: 'A full note drafted for you: SOAP, measures, red flags, and what the session didn’t cover.' },
  { icon: Dumbbell, text: 'One tap to send the exercises, book the follow-up and set up the care plan.' },
  { icon: ShieldCheck, text: 'You check and sign every note. The audio is never kept.' },
]

export function ScribeIntro() {
  const intro = useQuery(scribeApi.intro, {})
  const dismiss = useMutation(scribeApi.dismissIntro)
  const [ready, setReady] = useState(false)
  const [closed, setClosed] = useState(false)

  // A moment after the page settles, so it doesn't arrive with everything else
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 1500)
    return () => clearTimeout(timer)
  }, [])

  if (!ready || closed || !intro?.show) return null

  const close = () => {
    setClosed(true)
    void dismiss({}).catch(() => undefined)
  }

  return (
    <aside
      role="dialog"
      aria-labelledby="scribe-intro-title"
      className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 rounded-3xl border border-pt-line bg-pt-surface p-5 text-pt-ink shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)] sm:inset-x-auto sm:right-6 sm:w-[24rem] lg:bottom-6"
    >
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-pt-muted transition-colors hover:bg-pt-hover hover:text-pt-ink"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-pt-primary px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-pt-on-primary">New</span>
        {SCRIBE_PILOT && <span className="rounded-full bg-pt-green-bg px-2 py-0.5 text-xs font-medium text-pt-green-fg">Free during the pilot</span>}
      </div>
      <h2 id="scribe-intro-title" className="mt-3 text-lg font-semibold tracking-tight">
        Meet {SCRIBE_NAME}
      </h2>
      <p className="mt-1 text-sm text-pt-muted">Talk through your session. {SCRIBE_NAME} writes the clinical note for you to check and sign.</p>
      <ul className="mt-4 space-y-2.5">
        {POINTS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2.5 text-sm">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-pt-sunken">
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-center gap-1.5 rounded-xl bg-pt-sunken px-3 py-2 text-xs text-pt-muted">
        <CalendarPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Find it on any patient: <span className="font-medium text-pt-ink">Write a note</span>, or the button on a video call.
      </p>
      <Button className={cn(primaryButtonClass, 'mt-4 h-11 w-full')} onClick={close}>
        Got it
      </Button>
    </aside>
  )
}
