'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { format, addDays } from 'date-fns'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Loader2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PhysioDrawer, StatusBadge, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/components/physio/ui'
import { programError } from '@/components/exercise-programs/errors'
import type { Id } from '@/convex/_generated/dataModel'
import { INSTRUMENTS } from '@/lib/questionnaires/instruments'
import { suggestInstruments } from '@/lib/questionnaires/scoring'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { whenText } from './display'
import { questionnaireRefs, type PatientQuestionnaires } from './refs'

type Due = 'visit' | 'date' | 'none'

/** Choose questionnaires for the patient to fill in, and when by (their next visit by default). */
export function SendQuestionnaireDrawer({
  open,
  onOpenChange,
  patientId,
  patientName,
  data,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: Id<'users'>
  patientName: string
  data: NonNullable<PatientQuestionnaires>
}) {
  const send = useMutation(questionnaireRefs.send)
  const suggested = useMemo(() => suggestInstruments(data.condition), [data.condition])
  // Suggested ones first (best fit at the top), then the rest in catalogue order
  const ordered = useMemo(
    () => [...INSTRUMENTS].sort((a, b) => rank(suggested, a.key) - rank(suggested, b.key)),
    [suggested]
  )
  const waiting = useMemo(
    () => new Set(data.items.filter((i) => i.status === 'pending' && !i.expired && i.physiotherapistId === data.viewerId).map((i) => i.instrument)),
    [data.items, data.viewerId]
  )
  const [picked, setPicked] = useState<string[]>([])
  const [due, setDue] = useState<Due>('none')
  const [date, setDate] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  // Fresh choices each time it opens: the best fit ticked, due before the next visit if there is one
  useEffect(() => {
    if (!open) return
    setPicked(suggested.length > 2 ? [suggested[0]] : [])
    setDue(data.nextVisit ? 'visit' : 'date')
    setDate(format(addDays(new Date(), 3), 'yyyy-MM-dd'))
    setMessage('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toggle = (key: string, on: boolean) => setPicked((prev) => (on ? [...prev, key] : prev.filter((k) => k !== key)))
  const minutes = INSTRUMENTS.filter((d) => picked.includes(d.key)).reduce((n, d) => n + d.minutes, 0)

  const submit = async () => {
    if (picked.length === 0) return toast.error('Choose at least one questionnaire.')
    let dueAt: number | undefined
    if (due === 'date') {
      if (!date) return toast.error('Choose a due date.')
      dueAt = new Date(`${date}T09:00`).getTime()
    }
    setSaving(true)
    try {
      const result = await send({
        patientId,
        instruments: picked,
        message: message.trim() || undefined,
        appointmentId: due === 'visit' && data.nextVisit ? data.nextVisit.appointmentId : undefined,
        dueAt,
      })
      playSound('success')
      toast.success(
        result.updated.length > 0 && result.sent === 0
          ? `${result.updated.join(', ')} already waiting. Due date updated and ${patientName} reminded.`
          : `Sent to ${patientName}. You’ll be told when they’ve filled ${picked.length === 1 ? 'it' : 'them'} in.`
      )
      onOpenChange(false)
    } catch (error) {
      playSound('error')
      toast.error(programError(error, 'Couldn’t send. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PhysioDrawer
      open={open}
      onOpenChange={(next) => !saving && onOpenChange(next)}
      title="Send questionnaires"
      description={`${patientName} fills them in on their phone. Rehabify scores them and tracks the change.`}
      className="sm:max-w-lg"
      footer={
        <div className="flex gap-2">
          <Button className={cn(secondaryButtonClass, 'h-11 flex-1 sm:flex-none sm:px-6')} disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className={cn(primaryButtonClass, 'h-11 flex-1')} disabled={saving || picked.length === 0} onClick={() => void submit()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {picked.length > 1 ? `Send ${picked.length} questionnaires` : 'Send'}
            {minutes > 0 && <span className="ml-1.5 font-normal opacity-70">· ~{minutes} min</span>}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold text-pt-ink">Which ones</legend>
          {ordered.map((def) => {
            const checked = picked.includes(def.key)
            // PSFS and NPRS are always offered last; only the body-part matches get the badge
            const isSuggested = !!data.condition && suggested.slice(0, -2).includes(def.key)
            const id = `send-${def.key}`
            return (
              <label
                key={def.key}
                htmlFor={id}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-2xl border p-3.5 transition-colors',
                  checked ? 'border-pt-primary bg-pt-sunken' : 'border-pt-line hover:bg-pt-hover'
                )}
              >
                <Checkbox id={id} checked={checked} onCheckedChange={(v) => toggle(def.key, v === true)} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold text-pt-ink">{def.short}</span>
                    <span className="text-xs text-pt-faint">~{def.minutes} min</span>
                    {isSuggested && <StatusBadge tone="green">Fits “{shorten(data.condition ?? '')}”</StatusBadge>}
                    {waiting.has(def.key) && <StatusBadge tone="blue">Already waiting</StatusBadge>}
                  </span>
                  <span className="mt-0.5 block text-xs text-pt-muted">{def.name}</span>
                  <span className="mt-1 block text-[13px] text-pt-muted">{def.summary}</span>
                </span>
              </label>
            )
          })}
          <p className="pt-1 text-xs text-pt-muted">
            ODI, NDI, QuickDASH, Oxford scores, MSK-HQ and STarT Back are licensed: score them on the official form and add the total as an outcome
            measure in your clinical note.
          </p>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold text-pt-ink">Fill in by</legend>
          {data.nextVisit && (
            <DueOption checked={due === 'visit'} onSelect={() => setDue('visit')} label="Before their next visit" hint={whenText(data.nextVisit.startTime)} />
          )}
          <DueOption checked={due === 'date'} onSelect={() => setDue('date')} label="A date">
            {due === 'date' && (
              <Input
                type="date"
                value={date}
                min={format(new Date(), 'yyyy-MM-dd')}
                max={format(addDays(new Date(), 90), 'yyyy-MM-dd')}
                onChange={(e) => setDate(e.target.value)}
                className={cn(fieldClass, 'mt-2 h-10 w-full sm:w-48')}
                aria-label="Due date"
              />
            )}
          </DueOption>
          <DueOption checked={due === 'none'} onSelect={() => setDue('none')} label="No due date" />
          {due !== 'none' && <p className="text-xs text-pt-muted">They get a reminder the day before if they haven’t filled it in.</p>}
        </fieldset>

        <div className="space-y-2">
          <label htmlFor="questionnaire-message" className="text-sm font-semibold text-pt-ink">
            Note for {patientName} <span className="font-normal text-pt-faint">(optional)</span>
          </label>
          <Textarea
            id="questionnaire-message"
            value={message}
            maxLength={500}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. This helps me see how your knee is coming along since we started."
            className={cn(fieldClass, 'min-h-20')}
          />
        </div>
      </div>
    </PhysioDrawer>
  )
}

function rank(suggested: string[], key: string) {
  const i = suggested.indexOf(key)
  return i === -1 ? 100 : i
}

function shorten(text: string) {
  return text.length > 24 ? `${text.slice(0, 23)}…` : text
}

function DueOption({
  checked,
  onSelect,
  label,
  hint,
  children,
}: {
  checked: boolean
  onSelect: () => void
  label: string
  hint?: string
  children?: ReactNode
}) {
  return (
    <div className={cn('rounded-2xl border p-3.5 transition-colors', checked ? 'border-pt-primary bg-pt-sunken' : 'border-pt-line')}>
      <label className="flex cursor-pointer items-center gap-3">
        <input type="radio" name="questionnaire-due" checked={checked} onChange={onSelect} className="h-4 w-4 accent-current text-pt-ink" />
        <span className="text-sm font-medium text-pt-ink">{label}</span>
        {hint && <span className="text-sm text-pt-muted">· {hint}</span>}
      </label>
      {children}
    </div>
  )
}
