'use client'

/**
 * The home exercise programme at the end of a consult (owner 2026-11-27: "build an exercise
 * programme"): picked in the real Rehabify library picker (LibraryPicker, the 78 exercises physios
 * prescribe) and dosed the way a programme is sent on the platform. Marked by the case's rules on
 * the server (learnSimConsult:submitProgramme), without AI.
 */

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Dumbbell, Loader2, Minus, Plus, Send, X } from '@/components/icons'
import { LibraryPicker, entryPoster } from '@/components/exercise-programs/LibraryPicker'
import type { LibraryEntry } from '@/components/exercise-programs/types'
import { cn } from '@/lib/utils'
import { displayFont, pillInk, pillOutline } from '../../shared'
import { consultApi, errorText, simPath, simTrack, type SimAttempt } from '../simApi'
import { PlayerFrame } from '../v2/parts'
import { FREQUENCIES, simLibrary } from './simLibrary'

type Row = { slug: string; entry: LibraryEntry; side: 'L' | 'R' | null; sets: number; reps: number; hold: number | null; frequency: string }

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-9 text-[11px] font-semibold uppercase tracking-wide text-rh-ink/45">{label}</span>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Fewer ${label}`} className="flex h-7 w-7 items-center justify-center rounded-full bg-rh-ink/[0.06] text-rh-ink active:scale-95">
        <Minus className="h-3 w-3" />
      </button>
      <span className="w-7 text-center font-mono text-sm tabular-nums text-rh-ink">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`More ${label}`} className="flex h-7 w-7 items-center justify-center rounded-full bg-rh-ink/[0.06] text-rh-ink active:scale-95">
        <Plus className="h-3 w-3" />
      </button>
    </div>
  )
}

export function ConsultProgramme({ attempt }: { attempt: SimAttempt }) {
  const router = useRouter()
  const submit = useMutation(consultApi.submitProgramme)
  const c = attempt.case
  const info = attempt.consult
  const first = info?.patientFirstName ?? c.patient.name.split(' ')[0]
  const him = c.patient.sex === 'F' ? 'her' : 'him'
  const max = info?.programmeMax ?? 5
  // The injured side, from the complaint ("Left ankle pain…")
  const injured: 'L' | 'R' = /\bright\b/i.test(c.patient.presentingComplaint) ? 'R' : 'L'
  const library = useMemo(() => simLibrary(), [])
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState<null | 'send' | 'skip'>(null)
  const [confirmSkip, setConfirmSkip] = useState(false)
  const selected = useMemo(() => new Set(rows.map((r) => r.slug)), [rows])

  const toggle = (entry: LibraryEntry) => {
    const slug = String(entry._id)
    setRows((list) =>
      list.some((r) => r.slug === slug)
        ? list.filter((r) => r.slug !== slug)
        : [
            ...list,
            {
              slug,
              entry,
              side: entry.sided ? injured : null,
              sets: entry.defaults.sets,
              reps: entry.defaults.reps,
              hold: entry.defaults.holdSeconds,
              frequency: entry.defaults.frequency,
            },
          ]
    )
  }
  const update = (slug: string, patch: Partial<Row>) => setRows((list) => list.map((r) => (r.slug === slug ? { ...r, ...patch } : r)))

  const send = async (skip: boolean) => {
    if (busy) return
    setBusy(skip ? 'skip' : 'send')
    try {
      await submit({
        attemptId: attempt.attemptId,
        skip,
        items: skip ? [] : rows.map((r) => ({ exerciseId: r.slug, side: r.side, sets: r.sets, reps: r.reps, holdSeconds: r.hold, frequency: r.frequency })),
      })
      simTrack('sim_consult_stage', { case: c.slug, from: 'programme', exercises: skip ? 0 : rows.length })
    } catch (err) {
      toast.error(errorText(err, 'That didn’t go through. Try again.'))
      setBusy(null)
    }
  }

  return (
    <PlayerFrame low>
      <div className="learn-fixed-dark flex h-14 shrink-0 items-center gap-1 bg-[rgb(8_16_15)] px-1.5 text-white">
        <button type="button" onClick={() => router.push(simPath(c.slug))} aria-label="Leave the case" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-white/10">
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold leading-tight">Home exercise programme</p>
          <p className="truncate text-[11px] leading-tight text-white/55">
            {c.patient.name}, {c.patient.age} · {c.patient.presentingComplaint}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="rounded-2xl bg-rh-ink/[0.05] px-4 py-3 text-[13px] leading-5 text-rh-ink/70">
          <p className={cn('text-[17px] text-rh-ink', displayFont)}>Build {first}’s home programme</p>
          <p className="mt-1">
            Pick from the Rehabify exercise library and set the dose, as you’d send it to a real patient. Think about the stage of healing, and keep it to what {c.patient.sex === 'F' ? 'she' : 'he'}’ll actually do (up to {max}).
          </p>
        </div>

        {/* The programme so far */}
        <div className="mt-4 rounded-2xl bg-white p-3 shadow-sm sm:p-4">
          <p className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-rh-ink/50">
            <span>Programme for {him}</span>
            <span className={cn(rows.length > max && 'text-rose-600')}>
              {rows.length} {rows.length === 1 ? 'exercise' : 'exercises'}
              {rows.length > max ? ` · more than ${max}` : ''}
            </span>
          </p>
          {rows.length === 0 ? (
            <p className="flex items-center gap-2 py-5 text-sm text-rh-ink/50">
              <Dumbbell className="h-4 w-4" /> Tap exercises in the library below to add them.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {rows.map((r) => {
                const poster = entryPoster(r.entry)
                return (
                  <li key={r.slug} className="rounded-2xl border border-rh-ink/[0.08] p-3">
                    <div className="flex items-start gap-3">
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-pt-sunken">
                        {poster && <Image src={poster} alt="" fill sizes="56px" unoptimized className="object-contain p-1" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-tight text-rh-ink">{r.entry.name}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-rh-ink/55">{r.entry.description}</p>
                      </div>
                      <button type="button" onClick={() => toggle(r.entry)} aria-label={`Remove ${r.entry.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-rh-ink/45 hover:bg-rh-ink/5">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                      <Stepper label="Sets" value={r.sets} min={1} max={10} onChange={(sets) => update(r.slug, { sets })} />
                      <Stepper label="Reps" value={r.reps} min={1} max={50} onChange={(reps) => update(r.slug, { reps })} />
                      {r.hold !== null && <Stepper label="Hold" value={r.hold} min={1} max={120} onChange={(hold) => update(r.slug, { hold })} />}
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <select
                        value={r.frequency}
                        onChange={(e) => update(r.slug, { frequency: e.target.value })}
                        aria-label="How often"
                        className="h-8 rounded-full border border-rh-ink/10 bg-rh-cream px-3 text-xs font-semibold text-rh-ink"
                      >
                        {FREQUENCIES.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                      {r.side && (
                        <span className="inline-flex overflow-hidden rounded-full border border-rh-ink/10 text-xs font-semibold">
                          {(['L', 'R'] as const).map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => update(r.slug, { side: s })}
                              className={cn('h-8 px-3', r.side === s ? 'bg-rh-ink text-white' : 'bg-white text-rh-ink/60')}
                            >
                              {s === 'L' ? 'Left' : 'Right'}
                            </button>
                          ))}
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* The library */}
        <div className="mt-4 rounded-2xl bg-white p-3 text-rh-ink shadow-sm sm:p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-rh-ink/50">Rehabify exercise library</p>
          <LibraryPicker items={library} selected={selected} onToggle={toggle} selectLabel="Add to the programme" />
        </div>
      </div>

      <div className="shrink-0 border-t border-rh-ink/[0.08] bg-white px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        {confirmSkip ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="flex-1 text-[13px] leading-5 text-rh-ink/70">Without a programme you can’t pass this case. Skip it anyway?</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmSkip(false)} className={cn(pillOutline, 'h-10 px-4 text-sm')}>
                Build it
              </button>
              <button type="button" onClick={() => void send(true)} disabled={Boolean(busy)} className={cn(pillInk, 'h-10 px-4 text-sm')}>
                {busy === 'skip' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Skip
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setConfirmSkip(true)} disabled={Boolean(busy)} className="h-11 px-3 text-sm font-semibold text-rh-ink/55 hover:text-rh-ink">
              Skip
            </button>
            <button type="button" onClick={() => void send(false)} disabled={Boolean(busy) || rows.length === 0} className={cn(pillInk, 'ml-auto h-11 px-6 text-[15px]')}>
              {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send the programme
            </button>
          </div>
        )}
      </div>
    </PlayerFrame>
  )
}
