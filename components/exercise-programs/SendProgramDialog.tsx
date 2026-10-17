'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useMutation, useQuery } from 'convex/react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Loader2, Mic, Send, Square, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useNoteMedia } from '@/components/physio/NoteMedia'
import { primaryButtonClass } from '@/components/physio/ui'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { ExercisePreviewDialog } from './ExercisePreviewDialog'
import { LibraryPicker, entryPoster } from './LibraryPicker'
import { isLocalImage, sideLabel, type LibraryData, type LibraryEntry } from './types'

type Draft = {
  key: string
  entry: LibraryEntry
  side: 'L' | 'R' | 'both' | null
  sets: number
  reps: number
  hold: number | null
  frequency: string
  note: string
}

const FREQUENCIES = ['Once a day', 'Twice a day', '3 times a day', '3 times a week', 'Every other day']

function draftFor(entry: LibraryEntry): Draft {
  return {
    key: `${entry._id}-${Math.random().toString(36).slice(2, 8)}`,
    entry,
    side: entry.sided ? 'L' : null,
    sets: entry.defaults.sets,
    reps: entry.defaults.reps,
    hold: entry.defaults.holdSeconds,
    frequency: entry.defaults.frequency,
    note: '',
  }
}

function NumberField({ label, value, onChange, min, max }: { label: string; value: number | null; onChange: (v: number | null) => void; min: number; max: number }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">{label}</span>
      <Input
        inputMode="numeric"
        className="mt-1 h-9 rounded-lg"
        value={value ?? ''}
        placeholder="—"
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d]/g, '')
          if (!raw) return onChange(null)
          onChange(Math.max(min, Math.min(max, Number(raw))))
        }}
      />
    </label>
  )
}

export function SendProgramDialog({
  patientId,
  patientName,
  open,
  onOpenChange,
  initial,
  onSent,
}: {
  patientId: Id<'users'>
  patientName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: LibraryEntry[]
  onSent?: (programId: Id<'exercisePrograms'>) => void
}) {
  const library = useQuery(api.exerciseLibrary.listLibrary, open ? {} : 'skip') as LibraryData | null | undefined
  const create = useMutation(api.exercisePrograms.createProgram)
  const media = useNoteMedia()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState<LibraryEntry | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep(initial?.length ? 2 : 1)
    setDrafts((initial ?? []).map(draftFor))
    setTitle('')
    setNote('')
    media.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const selected = useMemo(() => new Set(drafts.map((d) => d.entry._id as string)), [drafts])
  const toggle = (entry: LibraryEntry) =>
    setDrafts((current) => (current.some((d) => d.entry._id === entry._id) ? current.filter((d) => d.entry._id !== entry._id) : [...current, draftFor(entry)]))
  const update = (key: string, patch: Partial<Draft>) => setDrafts((current) => current.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  const move = (index: number, by: number) =>
    setDrafts((current) => {
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(Math.max(0, Math.min(next.length, index + by)), 0, item)
      return next
    })

  const send = async () => {
    if (!title.trim()) return toast.error('Give the programme a title.')
    if (media.busy) return toast.error('Wait for the voice note to finish uploading.')
    const items = drafts.flatMap((d) => {
      const base = {
        exerciseId: d.entry._id,
        sets: d.sets,
        reps: d.reps,
        holdSeconds: d.hold ?? undefined,
        frequency: d.frequency.trim() || 'Once a day',
        note: d.note.trim() || undefined,
      }
      if (d.side === 'both') return [{ ...base, side: 'L' as const }, { ...base, side: 'R' as const }]
      return [{ ...base, side: d.side ?? undefined }]
    })
    setSending(true)
    try {
      const programId = await create({
        patientId,
        title: title.trim(),
        note: note.trim() || undefined,
        voiceNoteStorageId: media.voiceStorageId,
        voiceNoteSeconds: media.voice?.seconds,
        items,
      })
      playSound('send')
      toast.success('Exercises sent', { description: `${patientName} can see them in their app now.` })
      onOpenChange(false)
      onSent?.(programId)
    } catch (error) {
      toast.error((error as Error).message?.replace(/^.*ConvexError: /, '') || 'Couldn’t send the programme')
    } finally {
      setSending(false)
    }
  }

  const steps = ['Choose exercises', 'Set the dose', 'Add your notes']

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
        <DialogContent className="flex max-h-[94vh] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-5xl">
          <DialogHeader className="border-b border-black/[0.05] px-6 pb-4 pt-5 dark:border-white/[0.06]">
            <DialogTitle>Send exercises to {patientName}</DialogTitle>
            <DialogDescription>They&apos;ll see a 3D demonstration of each exercise, with your notes, in their app.</DialogDescription>
            <ol className="mt-3 flex flex-wrap gap-2 text-xs">
              {steps.map((label, i) => (
                <li
                  key={label}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium',
                    step === i + 1 ? 'bg-rh-teal text-white dark:bg-rh-aqua dark:text-rh-night' : step > i + 1 ? 'bg-rh-mint text-[#047857]' : 'bg-rh-canvas text-neutral-500 dark:bg-white/[0.05]'
                  )}
                >
                  <span className="tabular-nums">{i + 1}</span> {label}
                </li>
              ))}
            </ol>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {step === 1 &&
              (library === undefined ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-rh-teal" /></div>
              ) : !library ? (
                <p className="py-10 text-center text-sm text-neutral-500">The exercise library isn&apos;t available to your account.</p>
              ) : (
                <LibraryPicker items={library.items} selected={selected} onToggle={toggle} onPreview={setPreview} />
              ))}

            {step === 2 && (
              <ul className="space-y-3">
                {drafts.map((d, index) => (
                  <li key={d.key} className="rounded-2xl border border-black/[0.06] bg-white p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                    <div className="flex gap-3">
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-rh-mist dark:bg-white/[0.05]">
                        {entryPoster(d.entry) && (
                          <Image
                            src={entryPoster(d.entry)!}
                            alt=""
                            fill
                            sizes="80px"
                            unoptimized={!isLocalImage(entryPoster(d.entry)!)}
                            className="object-contain"
                            draggable={false}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-rh-night dark:text-white">{d.entry.name}</p>
                          <div className="flex shrink-0 items-center">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(index, 1)} disabled={index === drafts.length - 1} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-neutral-400 hover:text-red-600" onClick={() => setDrafts((c) => c.filter((x) => x.key !== d.key))} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </div>
                        {d.entry.sided && (
                          <div className="flex flex-wrap gap-1.5">
                            {(['L', 'R', 'both'] as const).map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => update(d.key, { side: s })}
                                className={cn(
                                  'rounded-full border px-3 py-1 text-xs font-medium transition active:scale-95',
                                  d.side === s ? 'border-rh-teal bg-rh-teal text-white dark:border-rh-aqua dark:bg-rh-aqua dark:text-rh-night' : 'border-black/[0.08] hover:bg-rh-mist dark:border-white/10'
                                )}
                              >
                                {s === 'both' ? 'Both sides' : sideLabel(d.entry.animation?.slug, s)}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-[5rem_5rem_6rem_1fr]">
                          <NumberField label="Sets" value={d.sets} min={1} max={10} onChange={(v) => update(d.key, { sets: v ?? 1 })} />
                          <NumberField label="Reps" value={d.reps} min={1} max={50} onChange={(v) => update(d.key, { reps: v ?? 1 })} />
                          <NumberField label="Hold (s)" value={d.hold} min={1} max={120} onChange={(v) => update(d.key, { hold: v })} />
                          <label className="col-span-3 block sm:col-span-1">
                            <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">How often</span>
                            <Input list="rh-frequencies" className="mt-1 h-9 rounded-lg" value={d.frequency} onChange={(e) => update(d.key, { frequency: e.target.value })} />
                          </label>
                        </div>
                        <Input className="h-9 rounded-lg" value={d.note} onChange={(e) => update(d.key, { note: e.target.value })} placeholder="Note for this exercise (optional), e.g. Only bend to where it's comfortable" />
                      </div>
                    </div>
                  </li>
                ))}
                <datalist id="rh-frequencies">{FREQUENCIES.map((f) => <option key={f} value={f} />)}</datalist>
              </ul>
            )}

            {step === 3 && (
              <div className="mx-auto max-w-2xl space-y-5">
                <div>
                  <Label htmlFor="hep-title">Programme title</Label>
                  <Input id="hep-title" className="mt-1.5 rounded-xl" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Knee strength, weeks 1–2" />
                </div>
                <div>
                  <Label htmlFor="hep-note">Note to {patientName} (optional)</Label>
                  <Textarea id="hep-note" className="mt-1.5 resize-none rounded-xl" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="How to fit these into the day, what to expect, when to stop…" />
                </div>
                <div>
                  <Label>Voice note (optional)</Label>
                  <p className="text-xs text-neutral-500">Talk them through it. Up to 10 minutes; it plays at the top of their programme.</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {media.recording ? (
                      <Button type="button" variant="outline" onClick={media.stopRecording} className="rounded-full border-rose-300 bg-rh-blush text-rose-700">
                        <span className="mr-2 h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
                        Stop · {Math.floor(media.elapsed / 60)}:{String(media.elapsed % 60).padStart(2, '0')}
                        <Square className="ml-2 h-3.5 w-3.5 fill-current" />
                      </Button>
                    ) : !media.voice ? (
                      <Button type="button" variant="outline" onClick={() => void media.startRecording()} disabled={!media.canRecord || media.uploading} className="rounded-full">
                        <Mic className="mr-2 h-4 w-4 text-rh-teal" /> Record a voice note
                      </Button>
                    ) : null}
                    {media.uploading && <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</span>}
                  </div>
                  {media.voice && (
                    <div className="mt-2 flex items-center gap-2 rounded-2xl bg-rh-mist p-2 pl-3 dark:bg-white/[0.05]">
                      <Mic className="h-4 w-4 shrink-0 text-rh-teal" />
                      <audio controls src={media.voice.previewUrl} className="h-9 min-w-0 flex-1" />
                      <Button type="button" variant="ghost" size="icon" onClick={media.removeVoice} aria-label="Remove voice note"><X className="h-4 w-4" /></Button>
                    </div>
                  )}
                </div>
                <div className="rounded-2xl bg-rh-canvas p-4 text-sm dark:bg-white/[0.03]">
                  <p className="font-medium text-rh-night dark:text-white">{drafts.reduce((n, d) => n + (d.side === 'both' ? 2 : 1), 0)} exercises</p>
                  <p className="mt-0.5 text-neutral-500">{drafts.map((d) => d.entry.name).join(' · ')}</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-black/[0.05] px-6 py-4 dark:border-white/[0.06]">
            <div className="text-sm text-neutral-500">{drafts.length > 0 && step === 1 && `${drafts.length} selected`}</div>
            <div className="flex gap-2">
              {step > 1 && (
                <Button variant="ghost" onClick={() => setStep((s) => (s - 1) as 1 | 2)} disabled={sending}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
                </Button>
              )}
              {step < 3 ? (
                <Button className={primaryButtonClass} disabled={drafts.length === 0} onClick={() => setStep((s) => (s + 1) as 2 | 3)}>
                  Next <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              ) : (
                <Button className={primaryButtonClass} onClick={send} disabled={sending || drafts.length === 0}>
                  {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Send to {patientName}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ExercisePreviewDialog entry={preview} onOpenChange={(o) => !o && setPreview(null)} />
    </>
  )
}
