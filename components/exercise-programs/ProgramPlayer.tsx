'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { format } from 'date-fns'
import { BookOpen, Camera, Check, CheckCircle2, ChevronRight, Dumbbell, ExternalLink, Loader2, Mic, PartyPopper, Play, ShieldAlert, Timer, X } from '@/components/icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { ExerciseViewer } from '@/components/exercise3d/ExerciseViewer'
import { CameraCoach, type CoachActions } from '@/components/guided-session/CameraCoach'
import { VideoEmbed } from '@/components/media/VideoEmbed'
import { posterUrl } from '@/convex/exerciseLibraryCatalog'
import type { GrantContext, ViewerGrant } from '@/lib/exercise3d/useViewerGrant'
import { motionExerciseForClip } from '@/lib/motion/exercises'
import { youtubeIdFrom } from '@/lib/youtube'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { PdfViewer } from './PdfViewer'
import { OwnMediaView } from './OwnMediaView'
import { useExerciseMediaLinks } from './ownMedia'
import { programError } from './errors'
import { FlexUpgradeCard } from './FlexUpgradeCard'
import type { PaidPlan } from './flex'
import { doseLabel, isLocalImage, sideLabel, type LogInput, type ProgramForPlayer, type ProgramItem } from './types'

/** How a patient gets Flex from where they are (dashboard checkout, or sign-in from a link). */
export type FlexActions = {
  onChoose?: (plan: PaidPlan) => void
  busy?: PaidPlan | null
  signInHref?: string
}

const REST_SECONDS = 20
const PAIN_FACES = ['😀', '🙂', '🙂', '😐', '😐', '😕', '😕', '😣', '😣', '😫', '😫']

function VoiceNote({ url, seconds, from }: { url: string; seconds: number | null; from: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-rh-honeydew p-2.5 pl-3 dark:bg-white/[0.05]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rh-lime text-rh-ink dark:bg-rh-lime dark:text-rh-ink">
        <Mic className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-rh-ink dark:text-white">
          Voice note from {from}
          {seconds ? <span className="text-neutral-500"> · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span> : null}
        </p>
        <audio controls preload="none" src={url} className="mt-1 h-8 w-full" controlsList="nodownload noplaybackrate" />
      </div>
    </div>
  )
}

function LogDialog({
  item,
  open,
  onOpenChange,
  onSubmit,
}: {
  item: ProgramItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: Omit<LogInput, 'itemIndex'>) => Promise<void>
}) {
  const [pain, setPain] = useState(2)
  const [difficulty, setDifficulty] = useState<'easy' | 'ok' | 'hard'>('ok')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (open) {
      setPain(2)
      setDifficulty('ok')
      setNote('')
    }
  }, [open])

  if (!item) return null
  const submit = async () => {
    setSaving(true)
    try {
      await onSubmit({ painScore: pain, difficulty, note: note.trim() || undefined, setsDone: item.sets ?? undefined })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>How did {item.name || 'that'} go?</DialogTitle>
          <DialogDescription>Your physiotherapist sees this, so they can adjust your programme.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-1">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-rh-ink dark:text-white">Pain during the exercise</p>
              <span className="text-2xl" aria-hidden>{PAIN_FACES[pain]}</span>
            </div>
            <Slider className="mt-3" min={0} max={10} step={1} value={[pain]} onValueChange={(v) => setPain(v[0] ?? 0)} aria-label="Pain from 0 to 10" />
            <div className="mt-1.5 flex justify-between text-xs text-neutral-500">
              <span>0 none</span>
              <span className={cn('font-semibold tabular-nums', pain >= 7 ? 'text-rose-600' : 'text-rh-ink')}>{pain}/10</span>
              <span>10 worst</span>
            </div>
            {pain >= 7 && (
              <p className="mt-2 rounded-xl bg-rh-blush p-2.5 text-xs text-rose-700 dark:bg-rose-400/10 dark:text-rose-300">
                That&apos;s a lot of pain. Stop this exercise for today; your physiotherapist will be told.
              </p>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-rh-ink dark:text-white">How hard was it?</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(['easy', 'ok', 'hard'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-sm font-medium transition active:scale-95',
                    difficulty === d
                      ? 'border-rh-lime bg-rh-lime text-rh-ink dark:border-rh-lime dark:bg-rh-lime dark:text-rh-ink'
                      : 'border-black/[0.08] hover:bg-rh-honeydew dark:border-white/10'
                  )}
                >
                  {d === 'easy' ? 'Easy' : d === 'ok' ? 'Just right' : 'Hard'}
                </button>
              ))}
            </div>
          </div>
          <Textarea rows={2} className="resize-none" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything to tell your physio? (optional)" />
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving} className="w-full rounded-xl bg-rh-lime text-rh-ink hover:bg-rh-lime-deep sm:w-auto">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Guided sets: counts reps from the animation loop, rests between sets, celebrates at the end. */
function Guided({ item, rep, onFinish, onExit }: { item: ProgramItem & { sets: number; reps: number }; rep: number; onFinish: () => void; onExit: () => void }) {
  const [set, setSet] = useState(1)
  const [base, setBase] = useState(rep)
  const [rest, setRest] = useState(0)
  const finished = useRef(false)
  const done = rep - base

  useEffect(() => {
    if (rest > 0 || finished.current) return
    if (done >= item.reps) {
      playSound('success')
      if (set >= item.sets) {
        finished.current = true
        void import('canvas-confetti').then(({ default: confetti }) => confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 }, colors: ['#00cd0f', '#00cd0f', '#00cd0f', '#ffffff'] }))
        onFinish()
      } else {
        setRest(REST_SECONDS)
      }
    }
  }, [done, item.reps, item.sets, set, rest, onFinish])

  useEffect(() => {
    if (rest <= 0) return
    const t = setTimeout(() => {
      if (rest === 1) {
        setSet((s) => s + 1)
        setBase(rep)
      }
      setRest((r) => r - 1)
    }, 1000)
    return () => clearTimeout(t)
  }, [rest, rep])

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-rh-ink p-3 text-white">
      <div className="flex-1">
        {rest > 0 ? (
          <p className="flex items-center gap-2 text-sm font-medium">
            <Timer className="h-4 w-4 text-rh-lime" /> Rest {rest}s, then set {set + 1} of {item.sets}
          </p>
        ) : (
          <>
            <p className="text-[11px] uppercase tracking-wider text-white/60">Set {set} of {item.sets}</p>
            <p className="text-lg font-semibold tabular-nums">
              Rep {Math.min(done + 1, item.reps)} <span className="text-white/50">of {item.reps}</span>
            </p>
          </>
        )}
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-rh-lime transition-all" style={{ width: `${(((set - 1) * item.reps + Math.min(done, item.reps)) / (item.sets * item.reps)) * 100}%` }} />
        </div>
      </div>
      <button type="button" onClick={onExit} className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Stop guided mode">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/** A hospital PDF leaflet from the library, read inside the app on request. */
function Leaflet({ resource }: { resource: NonNullable<ProgramItem['resource']> }) {
  const [open, setOpen] = useState(false)
  return open ? (
    <PdfViewer docKey={resource.key} sourceUrl={resource.url ?? null} sourceName={resource.source} />
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.08] px-3 py-2 text-sm font-medium text-rh-ink transition hover:bg-rh-honeydew dark:border-white/10 dark:text-rh-lime dark:hover:bg-white/[0.05]"
    >
      <BookOpen className="h-4 w-4" /> Read the leaflet
    </button>
  )
}

/** Education picked from the Rehabify Library: its video, guide and link (leaflets open in the app). */
function LibraryResource({ resource }: { resource: NonNullable<ProgramItem['resource']> }) {
  const leaflet = resource.kind === 'link' && /\.pdf(?:$|[?#])/i.test(resource.url ?? '')
  return (
    <div className="mt-4 space-y-3">
      {resource.steps.length > 0 &&
        (resource.kind === 'link' ? (
          <div className="space-y-1.5 text-sm text-neutral-700 dark:text-neutral-200">
            {resource.steps.map((step, i) => <p key={i}>{step}</p>)}
          </div>
        ) : (
          <ol className="space-y-2.5">
            {resource.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-neutral-700 dark:text-neutral-200">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rh-lime text-xs font-semibold text-rh-ink dark:bg-rh-lime dark:text-rh-ink">{i + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        ))}
      {resource.stop && (
        <div className="flex gap-3 rounded-2xl bg-pt-rose-bg p-3.5 text-sm text-pt-rose-fg">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-pt-ink">{resource.stop}</p>
        </div>
      )}
      {leaflet && <Leaflet resource={resource} />}
      {resource.url && resource.kind !== 'youtube' && !leaflet && (
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.08] px-3 py-2 text-sm font-medium text-rh-ink transition hover:bg-rh-honeydew dark:border-white/10 dark:text-rh-lime dark:hover:bg-white/[0.05]"
        >
          <ExternalLink className="h-4 w-4" /> Open the {resource.source} page
        </a>
      )}
      <p className="text-xs text-neutral-500">From the Rehabify Library · {resource.source}</p>
    </div>
  )
}

const STAFF_CONTEXT: GrantContext = { kind: 'staff' }

const celebrate = () =>
  void import('canvas-confetti').then(({ default: confetti }) =>
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.7 }, colors: ['#00cd0f', '#00cd0f', '#00cd0f', '#ffffff'] })
  )

/** The last step of the day: send the session to the care team. Green once it's sent. */
function FinishCard({
  doneCount,
  total,
  finishedAt,
  from,
  onOpen,
  className,
}: {
  doneCount: number
  total: number
  finishedAt: number | null
  from: string
  onOpen: () => void
  className?: string
}) {
  if (finishedAt) {
    return (
      <div className={cn('flex items-center gap-3 rounded-2xl bg-rh-lime p-4 text-rh-ink', className)}>
        <CheckCircle2 className="h-7 w-7 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Sent to {from} today</p>
          <p className="text-xs">
            {doneCount} of {total} done. See you tomorrow.
          </p>
        </div>
      </div>
    )
  }
  const all = total > 0 && doneCount >= total
  return (
    <div className={cn('rounded-2xl border border-black/[0.05] bg-white p-4 dark:border-white/[0.06] dark:bg-rh-ink-2', className)}>
      <p className="text-sm font-semibold text-rh-ink dark:text-white">{all ? 'That’s everything for today' : 'Finished for today?'}</p>
      <p className="mt-0.5 text-xs text-neutral-500">
        {doneCount === 0
          ? `Tick off what you do, then send it to ${from}.`
          : `${doneCount} of ${total} done. Send it to ${from} so they can see how you’re getting on.`}
      </p>
      <Button
        disabled={doneCount === 0}
        onClick={onOpen}
        className="mt-3 h-11 w-full rounded-xl bg-rh-lime text-base font-semibold text-rh-ink hover:bg-rh-lime-deep disabled:opacity-50"
      >
        <Check className="mr-1.5 h-5 w-5" strokeWidth={3} /> Done for today
      </Button>
    </div>
  )
}

function FinishDialog({
  open,
  onOpenChange,
  doneCount,
  total,
  from,
  onSend,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  doneCount: number
  total: number
  from: string
  onSend: () => Promise<void>
}) {
  const [sending, setSending] = useState(false)
  const all = total > 0 && doneCount >= total
  const send = async () => {
    setSending(true)
    try {
      await onSend()
      onOpenChange(false)
    } catch {
      // The player has already shown why
    } finally {
      setSending(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <span className="mx-auto mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-rh-lime text-rh-ink sm:mx-0">
            <PartyPopper className="h-7 w-7" />
          </span>
          <DialogTitle>{all ? 'That’s everything for today' : 'Finish for today?'}</DialogTitle>
          <DialogDescription>
            {all
              ? `You did all ${total}. Send it to ${from} so they can see it.`
              : `You’ve done ${doneCount} of ${total}. Send it to ${from} now, or keep going and send it later.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          {!all && (
            <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={sending}>
              Keep going
            </Button>
          )}
          <Button onClick={send} disabled={sending} className="h-11 w-full rounded-xl bg-rh-lime text-base font-semibold text-rh-ink hover:bg-rh-lime-deep sm:w-auto">
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-5 w-5" strokeWidth={3} />}
            Send to my physio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ProgramPlayer({
  program,
  doneToday,
  requestGrant,
  mediaContext = STAFF_CONTEXT,
  onLog,
  onMarkDone,
  onFinish,
  finishedToday = null,
  readOnly,
  flex,
  coach,
}: {
  program: ProgramForPlayer
  doneToday: number[]
  requestGrant: (clipIds: string[]) => Promise<ViewerGrant>
  /** Who is watching, for the physio's own photos and videos (same as the 3D grant) */
  mediaContext?: GrantContext
  onLog?: (input: LogInput) => Promise<void>
  /** Marks an education or activity item done for today; without it those items can't be ticked */
  onMarkDone?: (itemIndex: number) => Promise<void>
  /** "Done for today": sends the day's session to the care team */
  onFinish?: () => Promise<void>
  /** When today's session was sent, if it was */
  finishedToday?: number | null
  readOnly?: boolean
  /** How the patient gets Flex when this programme needs it (program.plan) */
  flex?: FlexActions
  /** Camera coach for the exercises it follows (components/guided-session); omitted where it isn't offered */
  coach?: CoachActions
}) {
  // An independent physio's own patient without Flex: the steps stay (Basic); demonstrations and
  // logging are replaced by the upgrade card. The server refuses them too (patientPlans.ts).
  const locked = !readOnly && Boolean(program.plan?.locked)
  const requestMedia = useExerciseMediaLinks(mediaContext)
  const [selected, setSelected] = useState(0)
  const [rep, setRep] = useState(0)
  const [guided, setGuided] = useState(false)
  const [coachOpen, setCoachOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)
  const [marking, setMarking] = useState(false)
  // The 3D demonstration is actually playing (approved, loaded, not in low-data mode). The
  // viewer reports it on every change, including when it mounts for the next exercise.
  const [playing3d, setPlaying3d] = useState(false)
  const detailRef = useRef<HTMLDivElement>(null)
  const item = program.items[selected] ?? null
  const isEducation = item?.kind === 'education'
  // Education items have no dose, so there is nothing to count through
  const dosed = item && item.sets !== null && item.reps !== null ? { ...item, sets: item.sets, reps: item.reps } : null
  const done = useMemo(() => new Set(doneToday), [doneToday])
  // The camera coach follows a few exercises so far (lib/motion/exercises.ts)
  const motion = !readOnly && !locked && coach && !isEducation ? motionExerciseForClip(item?.clipId) : null
  // Education and activity items count towards "done today" where they can be ticked off
  const canTick = Boolean(onMarkDone) && !readOnly && !locked
  const exerciseItems = program.items.filter((it) => canTick || it.kind !== 'education')
  const doneCount = exerciseItems.filter((it) => done.has(it.index)).length
  const canFinish = Boolean(onFinish) && !readOnly && !locked && exerciseItems.length > 0
  const from = program.clinicName ?? program.senderName

  useEffect(() => {
    setRep(0)
    setGuided(false)
    setCoachOpen(false)
  }, [selected])

  const choose = (index: number) => {
    setSelected(index)
    if (window.matchMedia('(max-width: 1023px)').matches) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /** After an item is done: on to the next one, or the final "Done for today" when that was the last. */
  const afterDone = (index: number, message: string) => {
    playSound('success')
    const left = exerciseItems.filter((it) => it.index !== index && !done.has(it.index))
    if (left.length === 0 && canFinish && !finishedToday) {
      setFinishOpen(true)
      return
    }
    toast.success(message)
    const next = program.items.findIndex((it, i) => i > selected && (canTick || it.kind !== 'education') && !done.has(it.index))
    if (next >= 0) setSelected(next)
  }

  const log = async (input: Omit<LogInput, 'itemIndex'>) => {
    if (!onLog || !item) return
    try {
      await onLog({ itemIndex: item.index, ...input })
      afterDone(item.index, 'Logged. Nice work!')
    } catch (error) {
      toast.error(programError(error, 'Couldn’t save that. Check your connection and try again.'))
      throw error
    }
  }

  const markDone = async () => {
    if (!onMarkDone || !item || marking) return
    setMarking(true)
    try {
      await onMarkDone(item.index)
      afterDone(item.index, 'Done. Nice work!')
    } catch (error) {
      toast.error(programError(error, 'Couldn’t save that. Check your connection and try again.'))
    } finally {
      setMarking(false)
    }
  }

  const finish = async () => {
    if (!onFinish) return
    try {
      await onFinish()
      playSound('success')
      celebrate()
      toast.success(`Sent to ${from}. Well done!`)
    } catch (error) {
      toast.error(programError(error, 'Couldn’t send that. Check your connection and try again.'))
      throw error
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-black/[0.04] bg-white p-5 shadow-soft dark:border-white/[0.06] dark:bg-rh-ink-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-rh-ink dark:text-rh-lime">Home exercise programme</p>
            <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-rh-ink dark:text-white">{program.title}</h2>
            <p className="text-sm text-neutral-500">From {from} · {format(program.createdAt, 'd MMM yyyy')}</p>
          </div>
          {exerciseItems.length > 0 && !locked && (
            <div className="flex items-center gap-2 rounded-2xl bg-rh-canvas px-3 py-2 dark:bg-white/[0.04]">
              <CheckCircle2 className="h-4 w-4 text-rh-lime" />
              <span className="text-sm font-medium tabular-nums text-rh-ink dark:text-white">
                {doneCount} of {exerciseItems.length} done today
              </span>
            </div>
          )}
          {locked && (
            <span className="rounded-full bg-rh-canvas px-3 py-1.5 text-xs font-medium text-rh-ink dark:bg-white/[0.06] dark:text-white">
              Basic: your steps, free
            </span>
          )}
          {!readOnly && program.plan?.needsFlex && program.plan.hasFlex && program.plan.expiresAt && (
            <span className="rounded-full bg-rh-lime px-3 py-1.5 text-xs font-semibold text-rh-ink">
              {program.plan.plan === 'flex_max' ? 'Flex Max' : 'Flex'} until {format(program.plan.expiresAt, 'd MMM')}
            </span>
          )}
        </div>
        {(program.voiceNoteUrl || program.note) && (
          <div className="mt-4 space-y-3">
            {program.voiceNoteUrl && <VoiceNote url={program.voiceNoteUrl} seconds={program.voiceNoteSeconds} from={from} />}
            {program.note && <p className="whitespace-pre-line rounded-2xl bg-rh-cream p-3.5 text-sm text-rh-ink dark:bg-white/[0.04] dark:text-neutral-200">{program.note}</p>}
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-3">
        <ol className="space-y-2">
          {program.items.map((it, i) => {
            const education = it.kind === 'education'
            const isDone = (canTick || !education) && !locked && done.has(it.index)
            const side = sideLabel(it.exercise?.animation?.slug, it.side)
            const detail = education
              ? it.resource
                ? `${it.resource.youtubeId ? 'Video' : it.resource.kind === 'link' ? 'Web page' : 'Guide'} · ${it.resource.source}`
                : 'Information to read'
              : [doseLabel(it), it.frequency].filter(Boolean).join(' · ')
            return (
              <li key={it.index}>
                <button
                  type="button"
                  onClick={() => choose(i)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl border p-2 pr-3 text-left transition active:scale-[0.99]',
                    i === selected
                      ? 'border-rh-lime/50 bg-white shadow-soft ring-2 ring-rh-lime/15 dark:border-white/10 dark:bg-rh-ink-2'
                      : 'border-black/[0.05] bg-white/70 hover:bg-white dark:border-white/[0.06] dark:bg-white/[0.02]',
                    // Done today: the whole row goes green
                    isDone && 'border-rh-lime/60 bg-rh-honeydew hover:bg-rh-honeydew dark:border-rh-lime/40 dark:bg-rh-lime/10'
                  )}
                >
                  <span
                    className={cn(
                      'relative h-16 w-16 shrink-0 overflow-hidden rounded-xl',
                      education ? 'bg-rh-cream dark:bg-amber-400/10' : 'bg-rh-honeydew dark:bg-white/[0.05]'
                    )}
                  >
                    {education ? (
                      <BookOpen className="m-5 h-6 w-6 text-[#b4690e] dark:text-amber-300" />
                    ) : it.clipId ? (
                      <Image src={posterUrl(it.clipId)} alt="" fill sizes="64px" unoptimized className="object-contain" draggable={false} />
                    ) : (
                      <Dumbbell className="m-5 h-6 w-6 text-rh-ink" />
                    )}
                    {isDone && (
                      <span className="absolute inset-0 flex items-center justify-center bg-rh-lime/80 text-rh-ink">
                        <Check className="h-6 w-6" strokeWidth={3} />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-rh-ink dark:text-white">{it.name}</span>
                    {detail && <span className="block truncate text-xs text-neutral-500">{detail}</span>}
                    {side && <span className="mt-0.5 inline-block rounded-full bg-rh-peach px-2 py-0.5 text-[10px] font-medium text-[#b4690e]">{side}</span>}
                    {coach && !readOnly && !locked && !education && motionExerciseForClip(it.clipId) && (
                      <span className="ml-1 mt-0.5 inline-flex items-center gap-1 rounded-full bg-rh-honeydew px-2 py-0.5 text-[10px] font-semibold text-rh-ink dark:bg-white/[0.06] dark:text-rh-lime">
                        <Camera className="h-2.5 w-2.5" /> Camera coach
                      </span>
                    )}
                  </span>
                  {isDone ? (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rh-lime text-rh-ink">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                  ) : (
                    <ChevronRight className="h-4 w-4 text-neutral-400" />
                  )}
                </button>
              </li>
            )
          })}
        </ol>
        {canFinish && (
          <FinishCard className="hidden lg:block" doneCount={doneCount} total={exerciseItems.length} finishedAt={finishedToday} from={from} onOpen={() => setFinishOpen(true)} />
        )}
        </div>

        {item && (
          <div ref={detailRef} className="scroll-mt-20 space-y-4">
            {isEducation ? (
              item.resource?.youtubeId ? <VideoEmbed youtubeId={item.resource.youtubeId} className="rounded-3xl" /> : null
            ) : locked ? (
              <FlexUpgradeCard offer={program.plan?.offer ?? []} onChoose={flex?.onChoose} busy={flex?.busy} signInHref={flex?.signInHref} />
            ) : item.exercise?.ownMedia && item.exerciseId ? (
              <div className="space-y-1.5">
                <OwnMediaView exerciseId={item.exerciseId} name={item.name} requestLinks={requestMedia} />
                {/* Credit for a physio who shared their exercise to the Rehabify library */}
                {item.exercise.author && <p className="px-1 text-xs text-pt-muted">Demonstrated by {item.exercise.author.name}</p>}
              </div>
            ) : !item.clipId && item.exercise?.videoUrl ? (
              // A video link the physio added (YouTube or a direct file)
              <VideoEmbed
                youtubeId={youtubeIdFrom(item.exercise.videoUrl) ?? undefined}
                url={youtubeIdFrom(item.exercise.videoUrl) ? undefined : item.exercise.videoUrl}
                className="rounded-3xl"
              />
            ) : item.clipId && coachOpen ? (
              // The camera coach has its own 3D coach; one WebGL scene at a time on small phones
              <div className="relative aspect-square max-h-[min(72vh,620px)] w-full overflow-hidden rounded-3xl bg-rh-honeydew dark:bg-white/[0.04]">
                <Image src={posterUrl(item.clipId)} alt={item.name} fill sizes="(max-width: 1024px) 100vw, 640px" unoptimized className="object-contain p-4" draggable={false} />
              </div>
            ) : item.clipId ? (
              <ExerciseViewer
                clipId={item.clipId}
                requestGrant={requestGrant}
                onRep={setRep}
                onReadyChange={setPlaying3d}
                className="max-h-[min(72vh,620px)]"
              />
            ) : (
              <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-3xl bg-rh-honeydew text-sm text-neutral-500 dark:bg-white/[0.04]">
                {item.exercise?.imageUrl ? (
                  <Image
                    src={item.exercise.imageUrl}
                    alt={item.exercise.name}
                    fill
                    sizes="(max-width: 1024px) 100vw, 800px"
                    unoptimized={!isLocalImage(item.exercise.imageUrl)}
                    className="object-cover"
                  />
                ) : (
                  'Follow the steps below.'
                )}
              </div>
            )}

            {guided && dosed && <Guided item={dosed} rep={rep} onFinish={() => { setGuided(false); if (onLog && !readOnly) setLogOpen(true) }} onExit={() => setGuided(false)} />}

            <section className="rounded-3xl border border-black/[0.04] bg-white p-5 shadow-soft dark:border-white/[0.06] dark:bg-rh-ink-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold tracking-tight text-rh-ink dark:text-white">{item.name}</h3>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                    {isEducation && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rh-cream px-2.5 py-1 font-medium text-[#b4690e] dark:bg-amber-400/10 dark:text-amber-300">
                        <BookOpen className="h-3 w-3" /> {item.resource?.youtubeId ? 'Video to watch' : 'Information to read'}
                      </span>
                    )}
                    {item.sets !== null && <span className="rounded-full bg-rh-honeydew px-2.5 py-1 font-medium text-rh-ink dark:bg-white/[0.06] dark:text-rh-lime">{item.sets} sets</span>}
                    {item.reps !== null && <span className="rounded-full bg-rh-honeydew px-2.5 py-1 font-medium text-rh-ink dark:bg-white/[0.06] dark:text-rh-lime">{item.reps} reps</span>}
                    {item.holdSeconds ? <span className="rounded-full bg-rh-honeydew px-2.5 py-1 font-medium text-rh-ink dark:bg-white/[0.06] dark:text-rh-lime">hold {item.holdSeconds}s</span> : null}
                    {!isEducation && item.frequency && (
                      <span className="rounded-full bg-rh-canvas px-2.5 py-1 text-neutral-600 dark:bg-white/[0.05] dark:text-neutral-300">{item.frequency}</span>
                    )}
                    {sideLabel(item.exercise?.animation?.slug, item.side) && (
                      <span className="rounded-full bg-rh-peach px-2.5 py-1 font-medium text-[#b4690e]">{sideLabel(item.exercise?.animation?.slug, item.side)}</span>
                    )}
                  </div>
                </div>
                {isEducation && canTick && (
                  done.has(item.index) ? (
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-rh-lime px-3 py-2 text-sm font-semibold text-rh-ink">
                      <Check className="h-4 w-4" strokeWidth={3} /> Done today
                    </span>
                  ) : (
                    <Button className="rounded-xl bg-rh-lime text-rh-ink hover:bg-rh-lime-deep" onClick={() => void markDone()} disabled={marking}>
                      {marking ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                      Mark as done
                    </Button>
                  )
                )}
                {!readOnly && !isEducation && !locked && (
                  <div className="flex flex-wrap gap-2">
                    {motion && item.clipId && (
                      <Button variant="outline" className="rounded-xl" onClick={() => setCoachOpen(true)}>
                        <Camera className="mr-1.5 h-4 w-4" /> Camera coach
                      </Button>
                    )}
                    {/* Guided sets count reps from the animation, so they need the 3D demonstration playing */}
                    {item.animated && playing3d && dosed && !guided && (
                      <Button variant="outline" className="rounded-xl" onClick={() => setGuided(true)}>
                        <Play className="mr-1.5 h-4 w-4" /> Do it with me
                      </Button>
                    )}
                    {onLog && (
                      <Button className="rounded-xl bg-rh-lime text-rh-ink hover:bg-rh-lime-deep" onClick={() => setLogOpen(true)}>
                        {done.has(item.index) ? <PartyPopper className="mr-1.5 h-4 w-4" /> : <Check className="mr-1.5 h-4 w-4" />}
                        {done.has(item.index) ? 'Log again' : 'I did it'}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {item.note &&
                (isEducation && !item.resource ? (
                  // Education the care team wrote: the note is the content
                  <p className="mt-4 whitespace-pre-line rounded-2xl bg-rh-cream p-3.5 text-sm text-rh-ink dark:bg-white/[0.04] dark:text-neutral-200">{item.note}</p>
                ) : (
                  <p className="mt-4 whitespace-pre-line rounded-2xl bg-rh-cream p-3.5 text-sm text-rh-ink dark:bg-white/[0.04] dark:text-neutral-200">
                    <span className="font-semibold">Note from {from}: </span>
                    {item.note}
                  </p>
                ))}

              {isEducation && item.resource && <LibraryResource resource={item.resource} />}

              {item.exercise && item.exercise.instructions.length > 0 && (
                <ol className="mt-4 space-y-2.5">
                  {item.exercise.instructions.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm text-neutral-700 dark:text-neutral-200">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rh-lime text-xs font-semibold text-rh-ink dark:bg-rh-lime dark:text-rh-ink">{i + 1}</span>
                      <span className="pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
              )}

              {item.exercise && item.exercise.precautions.length > 0 && (
                <div className="mt-4 flex gap-3 rounded-2xl bg-rh-peach p-3.5 text-sm text-[#7c4a0a] dark:bg-amber-400/10 dark:text-amber-200">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
                  <ul className="space-y-1">
                    {item.exercise.precautions.map((p, i) => <li key={i}>{p}</li>)}
                    <li>Stop and contact your physiotherapist if pain is sharp or keeps getting worse.</li>
                  </ul>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {canFinish && (
        <FinishCard className="lg:hidden" doneCount={doneCount} total={exerciseItems.length} finishedAt={finishedToday} from={from} onOpen={() => setFinishOpen(true)} />
      )}

      <LogDialog item={item} open={logOpen && !locked} onOpenChange={setLogOpen} onSubmit={log} />
      <FinishDialog open={finishOpen && canFinish} onOpenChange={setFinishOpen} doneCount={doneCount} total={exerciseItems.length} from={from} onSend={finish} />

      {coachOpen && coach && motion && item?.clipId && (
        <CameraCoach
          coach={coach}
          clipId={item.clipId}
          exercise={motion}
          name={item.name}
          itemIndex={item.index}
          plan={{ sets: item.sets ?? 1, reps: item.reps ?? 10 }}
          requestGrant={requestGrant}
          onSaved={() => {
            setCoachOpen(false)
            playSound('success')
            toast.success('Session saved. Your physio can see it.')
            // Pain and effort go in the usual log, so high pain still alerts the physio
            if (onLog) setLogOpen(true)
          }}
          onClose={() => setCoachOpen(false)}
        />
      )}
    </div>
  )
}
