'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { format } from 'date-fns'
import { BookOpen, Check, CheckCircle2, ChevronRight, Dumbbell, ExternalLink, Loader2, Mic, PartyPopper, Play, ShieldAlert, Timer, X } from '@/components/icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { ExerciseViewer } from '@/components/exercise3d/ExerciseViewer'
import { VideoEmbed } from '@/components/media/VideoEmbed'
import { posterUrl } from '@/convex/exerciseLibraryCatalog'
import type { ViewerGrant } from '@/lib/exercise3d/useViewerGrant'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { programError } from './errors'
import { doseLabel, isLocalImage, sideLabel, type LogInput, type ProgramForPlayer, type ProgramItem } from './types'

const REST_SECONDS = 20
const PAIN_FACES = ['😀', '🙂', '🙂', '😐', '😐', '😕', '😕', '😣', '😣', '😫', '😫']

function VoiceNote({ url, seconds, from }: { url: string; seconds: number | null; from: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-rh-mist p-2.5 pl-3 dark:bg-white/[0.05]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rh-teal text-white dark:bg-rh-aqua dark:text-rh-night">
        <Mic className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-rh-night dark:text-white">
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
              <p className="text-sm font-medium text-rh-night dark:text-white">Pain during the exercise</p>
              <span className="text-2xl" aria-hidden>{PAIN_FACES[pain]}</span>
            </div>
            <Slider className="mt-3" min={0} max={10} step={1} value={[pain]} onValueChange={(v) => setPain(v[0] ?? 0)} aria-label="Pain from 0 to 10" />
            <div className="mt-1.5 flex justify-between text-xs text-neutral-500">
              <span>0 none</span>
              <span className={cn('font-semibold tabular-nums', pain >= 7 ? 'text-rose-600' : 'text-rh-teal')}>{pain}/10</span>
              <span>10 worst</span>
            </div>
            {pain >= 7 && (
              <p className="mt-2 rounded-xl bg-rh-blush p-2.5 text-xs text-rose-700 dark:bg-rose-400/10 dark:text-rose-300">
                That&apos;s a lot of pain. Stop this exercise for today; your physiotherapist will be told.
              </p>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-rh-night dark:text-white">How hard was it?</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(['easy', 'ok', 'hard'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-sm font-medium transition active:scale-95',
                    difficulty === d
                      ? 'border-rh-teal bg-rh-teal text-white dark:border-rh-aqua dark:bg-rh-aqua dark:text-rh-night'
                      : 'border-black/[0.08] hover:bg-rh-mist dark:border-white/10'
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
          <Button onClick={submit} disabled={saving} className="w-full rounded-xl bg-rh-teal text-white hover:bg-rh-teal-deep sm:w-auto">
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
        void import('canvas-confetti').then(({ default: confetti }) => confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 }, colors: ['#005b57', '#00cd0f', '#2dd4bf', '#ffffff'] }))
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
    <div className="flex items-center gap-3 rounded-2xl bg-rh-night p-3 text-white">
      <div className="flex-1">
        {rest > 0 ? (
          <p className="flex items-center gap-2 text-sm font-medium">
            <Timer className="h-4 w-4 text-rh-aqua" /> Rest {rest}s, then set {set + 1} of {item.sets}
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

/** Education picked from the Rehabify Library: its video, guide and link. */
function LibraryResource({ resource }: { resource: NonNullable<ProgramItem['resource']> }) {
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
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rh-teal text-xs font-semibold text-white dark:bg-rh-aqua dark:text-rh-night">{i + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        ))}
      {resource.stop && (
        <div className="flex gap-3 rounded-2xl bg-rh-peach p-3.5 text-sm text-[#7c4a0a] dark:bg-amber-400/10 dark:text-amber-200">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{resource.stop}</p>
        </div>
      )}
      {resource.url && resource.kind !== 'youtube' && (
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.08] px-3 py-2 text-sm font-medium text-rh-teal transition hover:bg-rh-mist dark:border-white/10 dark:text-rh-aqua dark:hover:bg-white/[0.05]"
        >
          <ExternalLink className="h-4 w-4" /> Open the {resource.source} page
        </a>
      )}
      <p className="text-xs text-neutral-500">From the Rehabify Library · {resource.source}</p>
    </div>
  )
}

export function ProgramPlayer({
  program,
  doneToday,
  requestGrant,
  onLog,
  readOnly,
}: {
  program: ProgramForPlayer
  doneToday: number[]
  requestGrant: (clipIds: string[]) => Promise<ViewerGrant>
  onLog?: (input: LogInput) => Promise<void>
  readOnly?: boolean
}) {
  const [selected, setSelected] = useState(0)
  const [rep, setRep] = useState(0)
  const [guided, setGuided] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  // The 3D demonstration is actually playing (approved, loaded, not in low-data mode). The
  // viewer reports it on every change, including when it mounts for the next exercise.
  const [playing3d, setPlaying3d] = useState(false)
  const detailRef = useRef<HTMLDivElement>(null)
  const item = program.items[selected] ?? null
  const isEducation = item?.kind === 'education'
  // Education items have no dose, so there is nothing to count through
  const dosed = item && item.sets !== null && item.reps !== null ? { ...item, sets: item.sets, reps: item.reps } : null
  const done = useMemo(() => new Set(doneToday), [doneToday])
  // Education is read, not logged, so it doesn't count towards "done today"
  const exerciseItems = program.items.filter((it) => it.kind !== 'education')
  const doneCount = exerciseItems.filter((it) => done.has(it.index)).length
  const from = program.clinicName ?? program.senderName

  useEffect(() => {
    setRep(0)
    setGuided(false)
  }, [selected])

  const choose = (index: number) => {
    setSelected(index)
    if (window.matchMedia('(max-width: 1023px)').matches) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const log = async (input: Omit<LogInput, 'itemIndex'>) => {
    if (!onLog || !item) return
    try {
      await onLog({ itemIndex: item.index, ...input })
      playSound('success')
      toast.success('Logged. Nice work!')
      const next = program.items.findIndex((it, i) => i > selected && it.kind !== 'education' && !done.has(it.index))
      if (next >= 0) setSelected(next)
    } catch (error) {
      toast.error(programError(error, 'Couldn’t save that. Check your connection and try again.'))
      throw error
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-black/[0.04] bg-white p-5 shadow-soft dark:border-white/[0.06] dark:bg-rh-ink-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-rh-teal dark:text-rh-aqua">Home exercise programme</p>
            <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-rh-night dark:text-white">{program.title}</h2>
            <p className="text-sm text-neutral-500">From {from} · {format(program.createdAt, 'd MMM yyyy')}</p>
          </div>
          {exerciseItems.length > 0 && (
            <div className="flex items-center gap-2 rounded-2xl bg-rh-canvas px-3 py-2 dark:bg-white/[0.04]">
              <CheckCircle2 className="h-4 w-4 text-rh-lime" />
              <span className="text-sm font-medium tabular-nums text-rh-night dark:text-white">
                {doneCount} of {exerciseItems.length} done today
              </span>
            </div>
          )}
        </div>
        {(program.voiceNoteUrl || program.note) && (
          <div className="mt-4 space-y-3">
            {program.voiceNoteUrl && <VoiceNote url={program.voiceNoteUrl} seconds={program.voiceNoteSeconds} from={from} />}
            {program.note && <p className="whitespace-pre-line rounded-2xl bg-rh-cream p-3.5 text-sm text-rh-night dark:bg-white/[0.04] dark:text-neutral-200">{program.note}</p>}
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <ol className="space-y-2">
          {program.items.map((it, i) => {
            const education = it.kind === 'education'
            const isDone = !education && done.has(it.index)
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
                      ? 'border-rh-teal/50 bg-white shadow-soft ring-2 ring-rh-teal/15 dark:border-rh-aqua/40 dark:bg-rh-ink-2'
                      : 'border-black/[0.05] bg-white/70 hover:bg-white dark:border-white/[0.06] dark:bg-white/[0.02]'
                  )}
                >
                  <span
                    className={cn(
                      'relative h-16 w-16 shrink-0 overflow-hidden rounded-xl',
                      education ? 'bg-rh-cream dark:bg-amber-400/10' : 'bg-rh-mist dark:bg-white/[0.05]'
                    )}
                  >
                    {education ? (
                      <BookOpen className="m-5 h-6 w-6 text-[#b4690e] dark:text-amber-300" />
                    ) : it.clipId ? (
                      <Image src={posterUrl(it.clipId)} alt="" fill sizes="64px" className="object-contain" draggable={false} />
                    ) : (
                      <Dumbbell className="m-5 h-6 w-6 text-rh-teal" />
                    )}
                    {isDone && (
                      <span className="absolute inset-0 flex items-center justify-center bg-rh-teal/70 text-white">
                        <Check className="h-6 w-6" strokeWidth={3} />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-rh-night dark:text-white">{it.name}</span>
                    {detail && <span className="block truncate text-xs text-neutral-500">{detail}</span>}
                    {side && <span className="mt-0.5 inline-block rounded-full bg-rh-peach px-2 py-0.5 text-[10px] font-medium text-[#b4690e]">{side}</span>}
                  </span>
                  <ChevronRight className="h-4 w-4 text-neutral-400" />
                </button>
              </li>
            )
          })}
        </ol>

        {item && (
          <div ref={detailRef} className="scroll-mt-20 space-y-4">
            {isEducation ? (
              item.resource?.youtubeId ? <VideoEmbed youtubeId={item.resource.youtubeId} className="rounded-3xl" /> : null
            ) : item.clipId ? (
              <ExerciseViewer
                clipId={item.clipId}
                requestGrant={requestGrant}
                onRep={setRep}
                onReadyChange={setPlaying3d}
                className="max-h-[min(72vh,620px)]"
              />
            ) : (
              <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-3xl bg-rh-mist text-sm text-neutral-500 dark:bg-white/[0.04]">
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
                  <h3 className="text-lg font-semibold tracking-tight text-rh-night dark:text-white">{item.name}</h3>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                    {isEducation && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rh-cream px-2.5 py-1 font-medium text-[#b4690e] dark:bg-amber-400/10 dark:text-amber-300">
                        <BookOpen className="h-3 w-3" /> {item.resource?.youtubeId ? 'Video to watch' : 'Information to read'}
                      </span>
                    )}
                    {item.sets !== null && <span className="rounded-full bg-rh-mist px-2.5 py-1 font-medium text-rh-teal dark:bg-rh-aqua/10 dark:text-rh-aqua">{item.sets} sets</span>}
                    {item.reps !== null && <span className="rounded-full bg-rh-mist px-2.5 py-1 font-medium text-rh-teal dark:bg-rh-aqua/10 dark:text-rh-aqua">{item.reps} reps</span>}
                    {item.holdSeconds ? <span className="rounded-full bg-rh-mist px-2.5 py-1 font-medium text-rh-teal dark:bg-rh-aqua/10 dark:text-rh-aqua">hold {item.holdSeconds}s</span> : null}
                    {!isEducation && item.frequency && (
                      <span className="rounded-full bg-rh-canvas px-2.5 py-1 text-neutral-600 dark:bg-white/[0.05] dark:text-neutral-300">{item.frequency}</span>
                    )}
                    {sideLabel(item.exercise?.animation?.slug, item.side) && (
                      <span className="rounded-full bg-rh-peach px-2.5 py-1 font-medium text-[#b4690e]">{sideLabel(item.exercise?.animation?.slug, item.side)}</span>
                    )}
                  </div>
                </div>
                {!readOnly && !isEducation && (
                  <div className="flex gap-2">
                    {/* Guided sets count reps from the animation, so they need the 3D demonstration playing */}
                    {item.animated && playing3d && dosed && !guided && (
                      <Button variant="outline" className="rounded-xl" onClick={() => setGuided(true)}>
                        <Play className="mr-1.5 h-4 w-4" /> Do it with me
                      </Button>
                    )}
                    {onLog && (
                      <Button className="rounded-xl bg-rh-teal text-white hover:bg-rh-teal-deep" onClick={() => setLogOpen(true)}>
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
                  <p className="mt-4 whitespace-pre-line rounded-2xl bg-rh-cream p-3.5 text-sm text-rh-night dark:bg-white/[0.04] dark:text-neutral-200">{item.note}</p>
                ) : (
                  <p className="mt-4 whitespace-pre-line rounded-2xl bg-rh-cream p-3.5 text-sm text-rh-night dark:bg-white/[0.04] dark:text-neutral-200">
                    <span className="font-semibold">Note from {from}: </span>
                    {item.note}
                  </p>
                ))}

              {isEducation && item.resource && <LibraryResource resource={item.resource} />}

              {item.exercise && item.exercise.instructions.length > 0 && (
                <ol className="mt-4 space-y-2.5">
                  {item.exercise.instructions.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm text-neutral-700 dark:text-neutral-200">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rh-teal text-xs font-semibold text-white dark:bg-rh-aqua dark:text-rh-night">{i + 1}</span>
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

      <LogDialog item={item} open={logOpen} onOpenChange={setLogOpen} onSubmit={log} />
    </div>
  )
}
