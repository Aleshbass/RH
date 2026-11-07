'use client'

import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Loader2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PatientDrawer, fieldClass, primaryButtonClass } from '@/components/patient/ui'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { lagosTime } from '@/convex/helpers/lagosTime'
import { addDays, formatWorked, workedMs } from '@/convex/helpers/clinicClock'
import { clockError, clockRefs, type ShiftView } from '@/components/clock/clockApi'
import { dateInput, dayTitle, fromInputs, timeInput } from './shared'

export type ShiftTarget =
  | { kind: 'correct'; shift: ShiftView; name: string }
  | { kind: 'add'; userId: string; name: string; dateKey: string; open?: string; close?: string }

const REASONS = ['Forgot to clock out', 'Forgot to clock in', 'Phone had no signal', 'Wrong time']

/** Owner: correct a shift's times, or add one someone forgot to clock. A reason is required. */
export function ShiftDrawer({ target, onClose }: { target: ShiftTarget | null; onClose: () => void }) {
  const correct = useMutation(clockRefs.correctShift)
  const add = useMutation(clockRefs.addMissedShift)
  const [date, setDate] = useState('')
  const [inTime, setInTime] = useState('')
  const [outTime, setOutTime] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!target) return
    if (target.kind === 'correct') {
      setDate(dateInput(target.shift.clockInAt))
      setInTime(timeInput(target.shift.clockInAt))
      setOutTime(target.shift.clockOutAt ? timeInput(target.shift.clockOutAt) : '')
    } else {
      setDate(target.dateKey)
      setInTime(target.open ?? '08:00')
      setOutTime(target.close ?? '17:00')
    }
    setReason('')
  }, [target])

  const clockInAt = date && inTime ? fromInputs(date, inTime) : null
  // An out time earlier than the in time is the next morning (a night shift)
  let clockOutAt = date && outTime ? fromInputs(date, outTime) : null
  if (clockInAt !== null && clockOutAt !== null && clockOutAt <= clockInAt) clockOutAt = fromInputs(addDays(date, 1), outTime)
  const stillOpen = target?.kind === 'correct' && target.shift.clockOutAt === null
  const preview =
    clockInAt !== null && (clockOutAt !== null || stillOpen)
      ? formatWorked(
          workedMs({ clockInAt, clockOutAt: clockOutAt ?? null, breaks: target?.kind === 'correct' ? target.shift.breaks : [] }, Date.now())
        )
      : null

  const submit = async () => {
    if (!target || clockInAt === null) return
    if (!reason.trim()) {
      toast.error('Add a reason. They’ll see it with the change.')
      return
    }
    if (target.kind === 'add' && clockOutAt === null) {
      toast.error('Add a clock-out time.')
      return
    }
    setSaving(true)
    try {
      if (target.kind === 'correct') {
        await correct({ shiftId: target.shift._id, clockInAt, ...(clockOutAt !== null ? { clockOutAt } : {}), reason: reason.trim() })
      } else {
        await add({ userId: target.userId, clockInAt, clockOutAt: clockOutAt!, reason: reason.trim() })
      }
      playSound('success')
      toast.success(`Saved. ${target.name.split(' ')[0]} has been told.`)
      onClose()
    } catch (error) {
      playSound('error')
      toast.error(clockError(error, 'Could not save. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PatientDrawer
      open={target !== null}
      onOpenChange={(open) => !open && onClose()}
      title={target?.kind === 'add' ? `Add a shift for ${target.name}` : `Correct ${target?.name ?? ''}’s hours`}
      description={
        target?.kind === 'correct'
          ? `${dayTitle(target.shift.dateKey)} · clocked ${lagosTime(target.shift.clockInAt)} – ${target.shift.clockOutAt ? lagosTime(target.shift.clockOutAt) : 'still in'}`
          : 'For a day they worked but didn’t clock.'
      }
      footer={
        <div className="flex gap-2">
          <Button className={cn(primaryButtonClass, 'h-11 flex-1')} disabled={saving || clockInAt === null} onClick={submit}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save{preview ? ` · ${preview}` : ''}
          </Button>
          <Button variant="ghost" className="h-11 rounded-xl text-pt-muted" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-pt-ink">Date</Label>
          <Input type="date" value={date} max={dateInput(Date.now())} onChange={(e) => setDate(e.target.value)} className={cn(fieldClass, 'h-11')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-pt-ink">Clocked in</Label>
            <Input type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} className={cn(fieldClass, 'h-11')} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-pt-ink">Clocked out</Label>
            <Input
              type="time"
              value={outTime}
              onChange={(e) => setOutTime(e.target.value)}
              className={cn(fieldClass, 'h-11')}
              placeholder={stillOpen ? 'Still in' : undefined}
            />
          </div>
        </div>
        {stillOpen && !outTime && <p className="text-xs text-pt-muted">Leave clock-out empty to keep them clocked in.</p>}
        {clockInAt !== null && clockOutAt !== null && clockOutAt - clockInAt > 12 * 3_600_000 && (
          <p className="text-xs font-medium text-pt-ink">That’s over 12 hours. Check the times.</p>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-pt-ink">Reason</Label>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  reason === r ? 'border-pt-ink bg-pt-primary text-pt-on-primary' : 'border-pt-line-strong bg-pt-surface text-pt-ink hover:bg-pt-hover'
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <Input value={reason} onChange={(e) => setReason(e.target.value.slice(0, 200))} placeholder="Or write your own" className={cn(fieldClass, 'h-11')} />
          <p className="text-xs text-pt-muted">They’re told about the change, with this reason. The original times are kept.</p>
        </div>
      </div>
    </PatientDrawer>
  )
}
