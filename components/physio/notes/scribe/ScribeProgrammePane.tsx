'use client'

/**
 * The home programme Rehabify Scribe drafted from the session, beside the note at sign-off. The
 * physio checks each exercise (matched to the 3D library or their own), the dose that was said,
 * fills any blanks, sorts out exercises that aren't in the library (pick a similar one, add their
 * own with a photo or video, or send it as written), and can record a voice note for the patient.
 * Nothing is sent from here: "Approve and send" in the note drawer does it (WorkspaceDrawers.tsx).
 */
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Camera, Check, Dumbbell, Mail, Mic, Plus, Search, Smartphone, Square, Trash2, WhatsApp } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { InfoTip, fieldClass, secondaryButtonClass } from '@/components/physio/ui'
import type { NoteMedia } from '@/components/physio/NoteMedia'
import { OwnExerciseSheet } from '@/components/exercise-programs/OwnExerciseSheet'
import { useExerciseMediaLinks } from '@/components/exercise-programs/ownMedia'
import type { LibraryEntry } from '@/components/exercise-programs/types'
import { cn } from '@/lib/utils'
import type { ProgrammeDelivery } from './scribeApi'
import { similarExercises } from './scribeTools'
import { unresolvedRows, type ProgrammeReview, type ReviewRow } from './scribeProgramme'

const ACTION_LABEL: Record<ReviewRow['action'], { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-pt-green-bg text-pt-green-fg' },
  change: { label: 'Change', className: 'bg-pt-blue-bg text-pt-blue-fg' },
  continue: { label: 'Keep', className: 'bg-pt-neutral-bg text-pt-muted' },
  stop: { label: 'Stop', className: 'bg-pt-rose-bg text-pt-rose-fg' },
}
const FREQUENCIES = ['Once a day', 'Twice a day', '3 times a day', '3 times a week', 'Every other day']

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

function NumInput({ label, value, onChange, max }: { label: string; value: number | null; onChange: (value: number | null) => void; max: number }) {
  return (
    <label className="block min-w-0">
      <span className="text-[11px] font-medium uppercase tracking-wider text-pt-muted">{label}</span>
      <Input
        inputMode="numeric"
        className={cn(fieldClass, 'mt-1 h-9 px-2', value === null && 'border-dashed')}
        value={value ?? ''}
        placeholder="—"
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d]/g, '').slice(0, 3)
          onChange(raw ? Math.min(max, Math.max(1, Number(raw))) : null)
        }}
      />
    </label>
  )
}

/** Where it goes, said before the physio approves */
export function DeliveryLine({ delivery, patientFirstName }: { delivery: ProgrammeDelivery | undefined; patientFirstName: string }) {
  if (delivery === undefined) return <p className="text-xs text-pt-muted">Checking how {patientFirstName} gets it…</p>
  if (delivery === null) return null
  const ways = [
    delivery.whatsapp && { icon: WhatsApp, text: 'WhatsApp (Joy)' },
    delivery.app && { icon: Smartphone, text: 'their app' },
    delivery.email && { icon: Mail, text: 'email' },
  ].filter(Boolean) as { icon: typeof Mail; text: string }[]
  if (!ways.length) {
    return (
      <p className="flex items-start gap-1.5 rounded-xl bg-pt-amber-bg px-3 py-2 text-xs text-pt-amber-fg">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {patientFirstName} has no way to see it yet. After sending, connect them to Joy or share a WhatsApp link from their Exercises tab.
      </p>
    )
  }
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-pt-muted">
      <span>Goes to {patientFirstName} on</span>
      {ways.map(({ icon: Icon, text }) => (
        <span key={text} className="inline-flex items-center gap-1 rounded-full bg-pt-sunken px-2 py-0.5 font-medium text-pt-ink">
          <Icon className="h-3 w-3" aria-hidden /> {text}
        </span>
      ))}
    </p>
  )
}

/** Not in the library: pick a similar one (or search), add your own, or send it as written. */
function Unmatched({
  row,
  library,
  onPick,
  onAddOwn,
  onAsWritten,
}: {
  row: ReviewRow
  library: LibraryEntry[]
  onPick: (entry: LibraryEntry) => void
  onAddOwn: () => void
  onAsWritten: () => void
}) {
  const [picking, setPicking] = useState(false)
  const [search, setSearch] = useState('')
  const options = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q) return library.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 8)
    return similarExercises(row.heard, library, 5)
  }, [library, row.heard, search])
  return (
    <div className="mt-2 rounded-xl bg-pt-amber-bg px-3 py-2.5 text-sm text-pt-amber-fg">
      <p className="flex items-center gap-1.5 font-semibold">
        <AlertTriangle className="h-4 w-4" aria-hidden /> Not in your library
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" className={cn(secondaryButtonClass, 'h-8 px-3')} onClick={() => setPicking((v) => !v)}>
          <Search className="mr-1 h-3.5 w-3.5" /> Pick a similar one
        </Button>
        <Button type="button" size="sm" className={cn(secondaryButtonClass, 'h-8 px-3')} onClick={onAddOwn}>
          <Camera className="mr-1 h-3.5 w-3.5" /> Add your own
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-pt-amber-fg underline-offset-2 hover:underline" onClick={onAsWritten}>
          Send as written
        </Button>
      </div>
      {picking && (
        <div className="mt-2 space-y-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your library" className={cn(fieldClass, 'h-9 text-pt-ink')} aria-label="Search the exercise library" />
          {options.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {options.map((entry) => (
                <li key={entry._id}>
                  <button
                    type="button"
                    onClick={() => onPick(entry)}
                    className="rounded-full border border-pt-line-strong bg-pt-surface px-3 py-1 text-sm text-pt-ink transition hover:bg-pt-hover active:scale-95"
                  >
                    {entry.name}
                    {entry.animation && <span className="ml-1 text-xs text-pt-muted">3D</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs">Nothing close. Search, or add your own.</p>
          )}
        </div>
      )}
    </div>
  )
}

export function ScribeProgrammePane({
  review,
  onChange,
  library,
  currentTitle,
  delivery,
  patientFirstName,
  media,
  onFillBlanks,
  problemRowKey,
}: {
  review: ProgrammeReview
  onChange: (next: ProgrammeReview) => void
  /** The physio's exercise library (3D, clinic and their own); undefined while loading */
  library: LibraryEntry[] | undefined
  /** The current programme the review would update, if the patient has one */
  currentTitle: string | null
  delivery: ProgrammeDelivery | undefined
  patientFirstName: string
  /** The voice note for the patient */
  media: NoteMedia
  onFillBlanks: () => void
  /** The row the last "Approve" stopped at */
  problemRowKey?: string | null
}) {
  const requestLinks = useExerciseMediaLinks({ kind: 'staff' })
  const [ownFor, setOwnFor] = useState<ReviewRow | null>(null)
  const byId = useMemo(() => new Map((library ?? []).map((e) => [e._id as string, e])), [library])

  const patchRow = (key: string, patch: Partial<ReviewRow>) =>
    onChange({ ...review, rows: review.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) })
  const pick = (row: ReviewRow, entry: LibraryEntry) =>
    patchRow(row.key, { exerciseId: entry._id, name: entry.name, match: 'library', asWritten: false, side: entry.sided ? row.side : null })

  const blanks = review.rows.some((r) => r.include && r.action !== 'continue' && r.action !== 'stop' && (r.sets === null || r.reps === null || !r.frequency.trim()))
  const unresolved = unresolvedRows(review).length
  const sending = review.rows.filter((r) => r.include && r.action !== 'continue').length

  return (
    <section aria-label="Home programme" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-pt-ink">
          <Dumbbell className="h-4 w-4" aria-hidden /> Home programme
          <InfoTip>
            Drafted from what you said in the session and matched to your exercise library. Only the doses you said are filled in. Check each one:
            nothing reaches {patientFirstName} until you approve.
          </InfoTip>
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-pt-ink">
          <Checkbox checked={review.include} onCheckedChange={(v) => onChange({ ...review, include: v === true })} aria-label="Send the programme" />
          Send it
        </label>
      </div>

      {!review.include ? (
        <p className="rounded-xl bg-pt-sunken px-3 py-2.5 text-sm text-pt-muted">The programme won’t be sent. Tick “Send it” to include it.</p>
      ) : (
        <>
          <DeliveryLine delivery={delivery} patientFirstName={patientFirstName} />

          {currentTitle && (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Which programme">
              {(
                [
                  { value: 'update', label: `Update “${currentTitle}”` },
                  { value: 'new', label: 'New programme' },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={review.target === option.value}
                  onClick={() => onChange({ ...review, target: option.value })}
                  className={cn(
                    'max-w-full truncate rounded-full border px-3 py-1.5 text-sm transition active:scale-95',
                    review.target === option.value ? 'border-pt-primary bg-pt-primary text-pt-on-primary' : 'border-pt-line-strong text-pt-ink hover:bg-pt-hover'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          {(review.target === 'new' || !currentTitle) && (
            <label className="block">
              <span className="text-sm font-medium text-pt-ink">Programme title</span>
              <Input value={review.title} onChange={(e) => onChange({ ...review, title: e.target.value })} className={cn(fieldClass, 'mt-1 h-10')} maxLength={120} />
            </label>
          )}

          <ul className="space-y-2">
            {review.rows.map((row) => {
              const entry = row.exerciseId ? byId.get(row.exerciseId) : undefined
              const name = entry?.name ?? row.name
              const action = ACTION_LABEL[row.action]
              const doseless = row.action === 'continue' || row.action === 'stop'
              const unmatched = row.action === 'new' && !row.exerciseId && !row.asWritten
              return (
                <li
                  key={row.key}
                  className={cn(
                    'rounded-xl border p-3 transition-opacity',
                    problemRowKey === row.key ? 'border-pt-rose-fg' : 'border-pt-line',
                    !row.include && row.action !== 'continue' && 'opacity-60'
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    {row.action !== 'continue' && (
                      <Checkbox
                        checked={row.include}
                        onCheckedChange={(v) => patchRow(row.key, { include: v === true })}
                        className="mt-0.5"
                        aria-label={`Include ${name}`}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', action.className)}>{action.label}</span>
                        <span className="font-medium text-pt-ink">{name}</span>
                        {entry?.animation && <span className="text-xs text-pt-muted">3D</span>}
                        {row.asWritten && <span className="text-xs text-pt-muted">(as written, no demo)</span>}
                      </p>
                      {name.toLowerCase() !== row.heard.toLowerCase() && <p className="mt-0.5 text-xs text-pt-muted">Heard “{row.heard}”</p>}
                      {row.match === 'name' && row.exerciseId && (
                        <p className="mt-0.5 text-xs text-pt-muted">
                          Matched by name, so check it’s the right one.{' '}
                          <button type="button" className="font-semibold text-pt-ink underline-offset-2 hover:underline" onClick={() => patchRow(row.key, { exerciseId: null, match: 'none', name: row.heard })}>
                            Not this one
                          </button>
                        </p>
                      )}
                      {row.action === 'continue' && <p className="mt-0.5 text-xs text-pt-muted">Keeps going as it is.</p>}
                      {row.action === 'stop' && <p className="mt-0.5 text-xs text-pt-muted">Taken out of the programme.</p>}
                      {row.dosage && !doseless && <p className="mt-0.5 text-xs text-pt-muted">You said: “{row.dosage}”</p>}
                    </div>
                  </div>

                  {unmatched && row.include && (
                    <Unmatched
                      row={row}
                      library={library ?? []}
                      onPick={(e) => pick(row, e)}
                      onAddOwn={() => setOwnFor(row)}
                      onAsWritten={() => patchRow(row.key, { asWritten: true })}
                    />
                  )}

                  {!doseless && row.include && !unmatched && (
                    <div className="mt-2.5 space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <NumInput label="Sets" value={row.sets} max={10} onChange={(v) => patchRow(row.key, { sets: v })} />
                        <NumInput label="Reps" value={row.reps} max={50} onChange={(v) => patchRow(row.key, { reps: v })} />
                        <NumInput label="Hold (s)" value={row.hold} max={120} onChange={(v) => patchRow(row.key, { hold: v })} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block min-w-0">
                          <span className="text-[11px] font-medium uppercase tracking-wider text-pt-muted">How often</span>
                          <Input
                            list="scribe-frequencies"
                            className={cn(fieldClass, 'mt-1 h-9 px-2', !row.frequency.trim() && 'border-dashed')}
                            value={row.frequency}
                            placeholder="—"
                            onChange={(e) => patchRow(row.key, { frequency: e.target.value })}
                          />
                        </label>
                        <label className="block min-w-0">
                          <span className="text-[11px] font-medium uppercase tracking-wider text-pt-muted">Duration</span>
                          <Input className={cn(fieldClass, 'mt-1 h-9 px-2')} value={row.duration} placeholder="e.g. 10 minutes" onChange={(e) => patchRow(row.key, { duration: e.target.value })} />
                        </label>
                      </div>
                      {(entry?.sided || (!entry && row.side)) && (
                        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Side for ${name}`}>
                          {(row.action === 'change' ? (['L', 'R'] as const) : (['L', 'R', 'both'] as const)).map((side) => (
                            <button
                              key={side}
                              type="button"
                              role="radio"
                              aria-checked={row.side === side}
                              onClick={() => patchRow(row.key, { side })}
                              className={cn(
                                'rounded-full border px-3 py-1 text-xs transition active:scale-95',
                                row.side === side ? 'border-pt-primary bg-pt-primary text-pt-on-primary' : 'border-pt-line-strong text-pt-ink hover:bg-pt-hover'
                              )}
                            >
                              {side === 'L' ? 'Left' : side === 'R' ? 'Right' : 'Both sides'}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <datalist id="scribe-frequencies">
            {FREQUENCIES.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {blanks && (
              <Button type="button" size="sm" className={cn(secondaryButtonClass, 'h-9 px-3')} onClick={onFillBlanks}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Fill in the usual dose
              </Button>
            )}
            {unresolved > 0 && (
              <span className="text-xs text-pt-amber-fg">
                {unresolved} not in your library: sort {unresolved === 1 ? 'it' : 'them'} out or untick {unresolved === 1 ? 'it' : 'them'}.
              </span>
            )}
            {!blanks && unresolved === 0 && sending > 0 && (
              <span className="flex items-center gap-1 text-xs text-pt-green-fg">
                <Check className="h-3.5 w-3.5" aria-hidden /> Ready to send
              </span>
            )}
          </div>

          <label className="block">
            <span className="text-sm font-medium text-pt-ink">Instructions for {patientFirstName}</span>
            <Textarea
              value={review.note}
              onChange={(e) => onChange({ ...review, note: e.target.value })}
              rows={2}
              maxLength={2000}
              placeholder="Optional, e.g. stop if the pain goes above 5 out of 10"
              className="mt-1 rounded-xl text-sm"
            />
          </label>

          <div>
            <p className="flex items-center gap-1 text-sm font-medium text-pt-ink">
              Voice note for {patientFirstName}
              <InfoTip>Say it in your own words. They can play it in their programme, and on WhatsApp when they’re connected to Joy.</InfoTip>
            </p>
            <div className="mt-1.5">
              {media.recording ? (
                <Button type="button" className="h-10 rounded-xl bg-pt-rose-bg px-4 text-pt-rose-fg shadow-none hover:brightness-95" onClick={media.stopRecording}>
                  <Square className="mr-1.5 h-3.5 w-3.5 fill-current" /> Stop · {clock(media.elapsed)}
                </Button>
              ) : media.voice ? (
                <div className="flex items-center gap-2 rounded-xl bg-pt-sunken p-2 pl-3">
                  <Mic className="h-4 w-4 shrink-0 text-pt-ink" aria-hidden />
                  <audio controls src={media.voice.previewUrl} className="h-9 min-w-0 flex-1" />
                  <button type="button" onClick={media.removeVoice} aria-label="Remove the voice note" className="rounded-full p-2 text-pt-muted hover:bg-pt-hover hover:text-pt-rose-fg">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  className={cn(secondaryButtonClass, 'h-10 px-4')}
                  disabled={media.uploading || !media.canRecord}
                  onClick={() => void media.startRecording()}
                  title={!media.canRecord ? 'This browser can’t record audio' : undefined}
                >
                  <Mic className="mr-1.5 h-4 w-4" /> {media.uploading ? 'Uploading…' : 'Record a voice note'}
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      <OwnExerciseSheet
        open={ownFor !== null}
        onOpenChange={(open) => !open && setOwnFor(null)}
        requestLinks={requestLinks}
        initialName={ownFor?.heard}
        initialDose={ownFor ? { sets: ownFor.sets, reps: ownFor.reps, holdSeconds: ownFor.hold } : undefined}
        onSaved={(exerciseId) => {
          if (ownFor) patchRow(ownFor.key, { exerciseId, match: 'library', asWritten: false })
          setOwnFor(null)
          toast.success('Added to your exercises', { description: 'It’s in this programme too.' })
        }}
      />
    </section>
  )
}
