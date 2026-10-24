'use client'

import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { Loader2 } from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { primaryButtonClass } from '@/components/physio/ui'
import { programError } from '@/components/exercise-programs/errors'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { OUTCOME_LABELS, SOURCE_LABELS, type EpisodeSource, type Outcome, type Workspace } from './shared'

const dialogClass = 'max-h-[90vh] overflow-y-auto rounded-3xl border-0 p-6 sm:max-w-lg dark:bg-rh-ink-2'

function ChoiceGrid<T extends string>({
  options,
  value,
  onChange,
  columns = 2,
}: {
  options: { value: T; label: string; hint?: string }[]
  value: T | null
  onChange: (value: T) => void
  columns?: 2 | 3
}) {
  return (
    <div className={cn('grid gap-2', columns === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2')} role="radiogroup">
      {options.map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-2xl border p-3 text-left transition-all active:scale-[0.98]',
              selected
                ? 'border-rh-lime bg-rh-honeydew ring-1 ring-rh-lime dark:border-rh-lime dark:bg-white/[0.06] dark:ring-rh-lime'
                : 'border-black/[0.08] hover:border-rh-lime/40 hover:bg-rh-canvas dark:border-white/10 dark:hover:bg-white/[0.04]'
            )}
          >
            <span className="block text-sm font-semibold text-rh-ink dark:text-white">{option.label}</span>
            {option.hint && <span className="block text-xs text-neutral-500 dark:text-neutral-400">{option.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function EpisodeDialog({
  open,
  onOpenChange,
  workspace,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspace: Workspace
}) {
  const update = useMutation(api.physioCare.updateCareEpisode)
  const [source, setSource] = useState<EpisodeSource>(workspace.episode.source)
  const [referredBy, setReferredBy] = useState(workspace.episode.referredBy ?? '')
  const [condition, setCondition] = useState(workspace.episode.condition ?? '')
  const [planned, setPlanned] = useState(workspace.episode.plannedSessions ? String(workspace.episode.plannedSessions) : '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setSource(workspace.episode.source)
    setReferredBy(workspace.episode.referredBy ?? '')
    setCondition(workspace.episode.condition ?? '')
    setPlanned(workspace.episode.plannedSessions ? String(workspace.episode.plannedSessions) : '')
  }, [open, workspace.episode])

  const save = async () => {
    setSaving(true)
    try {
      await update({
        patientId: workspace.patient._id,
        source,
        referredBy: source === 'referred' ? referredBy : '',
        condition,
        plannedSessions: planned ? Number(planned) : 0,
      })
      toast.success('Care details saved')
      onOpenChange(false)
    } catch (error) {
      toast.error(programError(error, 'Couldn’t save. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const sourceOptions = (['referred', 'existing_patient', 'marketplace', 'booking_link', 'invite', 'other'] as EpisodeSource[]).map(
    (value) => ({ value, label: SOURCE_LABELS[value] })
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogClass}>
        <DialogHeader className="text-left">
          <DialogTitle className="text-xl font-semibold tracking-tight">Care details</DialogTitle>
          <DialogDescription>What you’re treating and how this patient came to you.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-1">
          <div>
            <Label htmlFor="ep-condition">What you’re treating</Label>
            <Input
              id="ep-condition"
              className="mt-1.5"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              placeholder="e.g. Post-op ACL reconstruction, left knee"
            />
          </div>
          <div>
            <Label>Source</Label>
            <div className="mt-1.5">
              <ChoiceGrid options={sourceOptions} value={source} onChange={setSource} columns={3} />
            </div>
          </div>
          {source === 'referred' && (
            <div>
              <Label htmlFor="ep-ref">Referred by</Label>
              <Input id="ep-ref" className="mt-1.5" value={referredBy} onChange={(e) => setReferredBy(e.target.value)} placeholder="e.g. Dr Okafor, LUTH" />
            </div>
          )}
          <div>
            <Label htmlFor="ep-planned">Planned sessions</Label>
            <Input
              id="ep-planned"
              className="mt-1.5 w-32"
              inputMode="numeric"
              value={planned}
              onChange={(e) => setPlanned(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="8"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving} className={primaryButtonClass}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const OUTCOMES: { value: Outcome; label: string; hint: string }[] = [
  { value: 'goals_met', label: OUTCOME_LABELS.goals_met, hint: 'Back to what they wanted to do' },
  { value: 'partially_met', label: OUTCOME_LABELS.partially_met, hint: 'Better, with some way to go' },
  { value: 'not_met', label: OUTCOME_LABELS.not_met, hint: 'Little change' },
  { value: 'referred_on', label: OUTCOME_LABELS.referred_on, hint: 'Needs another specialist' },
  { value: 'stopped_attending', label: OUTCOME_LABELS.stopped_attending, hint: 'Stopped coming' },
]

const FOLLOW_UPS = [
  { value: '7', label: '1 week' },
  { value: '14', label: '2 weeks' },
  { value: '30', label: '1 month' },
] as const

export function CompleteCareDialog({
  open,
  onOpenChange,
  workspace,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspace: Workspace
}) {
  const completeCare = useMutation(api.physioCare.completeCare)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [summary, setSummary] = useState('')
  const [advice, setAdvice] = useState('')
  const [cancelUpcoming, setCancelUpcoming] = useState(true)
  const [followUp, setFollowUp] = useState<'7' | '14' | '30'>('14')
  const [saving, setSaving] = useState(false)
  const name = workspace.patient.firstName || 'this patient'

  useEffect(() => {
    if (open) {
      setOutcome(null)
      setSummary('')
      setAdvice('')
      setCancelUpcoming(true)
      setFollowUp('14')
    }
  }, [open])

  const submit = async () => {
    if (!outcome) return toast.error('Choose how care ended.')
    if (summary.trim().length < 10) return toast.error('Write a short discharge summary.')
    setSaving(true)
    try {
      const result = await completeCare({
        patientId: workspace.patient._id as Id<'users'>,
        outcome,
        dischargeSummary: summary,
        homeAdvice: advice || undefined,
        cancelUpcoming,
        followUpInDays: Number(followUp),
      })
      playSound('success')
      toast.success(`Care with ${name} is complete`, {
        description:
          result.cancelledAppointments > 0
            ? `${result.cancelledAppointments} upcoming booking${result.cancelledAppointments === 1 ? '' : 's'} cancelled. Rehabify will check in with them later.`
            : 'Rehabify will check in with them later to see how they’re doing.',
      })
      onOpenChange(false)
    } catch (error) {
      toast.error(programError(error, 'Couldn’t complete care. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogClass}>
        <DialogHeader className="text-left">
          <DialogTitle className="text-xl font-semibold tracking-tight">Complete care</DialogTitle>
          <DialogDescription>
            Closes this course of treatment, completes the care plan and adds a discharge note. {name} keeps their records and
            home advice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div>
            <Label>How did it go?</Label>
            <div className="mt-1.5">
              <ChoiceGrid options={OUTCOMES} value={outcome} onChange={setOutcome} />
            </div>
          </div>
          <div>
            <Label htmlFor="cc-summary">Discharge summary</Label>
            <Textarea
              id="cc-summary"
              className="mt-1.5 resize-none"
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Where they started, what you did, where they are now."
            />
          </div>
          <div>
            <Label htmlFor="cc-advice">Advice to keep going at home (optional)</Label>
            <Textarea
              id="cc-advice"
              className="mt-1.5 resize-none"
              rows={2}
              value={advice}
              onChange={(e) => setAdvice(e.target.value)}
              placeholder={`What should ${name} keep doing?`}
            />
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-rh-canvas p-3 dark:bg-white/[0.04]">
            <Checkbox checked={cancelUpcoming} onCheckedChange={(checked) => setCancelUpcoming(Boolean(checked))} className="mt-0.5" />
            <span className="text-sm text-rh-ink dark:text-neutral-200">
              Cancel any upcoming bookings with {name}
              {workspace.nextAppointment ? '' : <span className="text-neutral-500"> (none booked)</span>}
            </span>
          </label>
          <div>
            <Label>Rehabify checks in with {name} after</Label>
            <div className="mt-1.5 inline-flex rounded-xl bg-rh-canvas p-1 dark:bg-white/[0.05]" role="radiogroup">
              {FOLLOW_UPS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={followUp === option.value}
                  onClick={() => setFollowUp(option.value)}
                  className={cn(
                    'rounded-lg px-3.5 py-1.5 text-sm transition-all',
                    followUp === option.value
                      ? 'bg-white font-semibold text-rh-ink shadow-sm dark:bg-rh-ink-3 dark:text-rh-lime'
                      : 'text-neutral-600 hover:text-rh-ink dark:text-neutral-400 dark:hover:text-white'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              We email them to ask how they’re doing. If they’re struggling or ask for a call, our team follows up personally.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving} className={primaryButtonClass}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Complete care
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
