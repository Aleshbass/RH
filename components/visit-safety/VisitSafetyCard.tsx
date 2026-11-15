'use client'

/**
 * "Visit safety" in a home visit's appointment drawer: "On my way" before the visit, then the
 * check-in, "Left safely" and help controls (VisitSafetyPanel). Hidden for video and clinic visits.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQuery } from 'convex/react'
import { Car, ShieldCheck } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { lagosTime } from '@/convex/helpers/lagosTime'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { InfoTip, primaryButtonClass } from '@/components/physio/ui'
import { VisitSafetyPanel } from './VisitSafetyPanel'
import { SafetyGuideButton } from './SafetyGuide'
import { currentPosition, safetyApi } from './safetyApi'

export function VisitSafetyCard({ appointmentId, patientFirstName }: { appointmentId: string; patientFirstName: string }) {
  const state = useQuery(safetyApi.forAppointment, { appointmentId })
  const startVisit = useMutation(safetyApi.startVisit)
  const [busy, setBusy] = useState(false)

  if (!state) return null
  const { visit } = state
  if (!visit && !state.canStart && !(state.open && !state.tooLate)) return null

  const start = async () => {
    setBusy(true)
    try {
      const pos = await currentPosition(5000)
      await startVisit({ appointmentId, ...pos })
      playSound('success')
      toast.success(`${patientFirstName} has your photo and their door code.`)
    } catch (error) {
      playSound('error')
      const data = (error as { data?: unknown })?.data
      toast.error(typeof data === 'string' ? data : 'That didn’t work. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-pt-line p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-pt-ink">
          <ShieldCheck className="h-4 w-4 text-pt-green-fg" />
          Visit safety
          <InfoTip label="How visit safety works">
            Tap On my way when you set off: {patientFirstName} gets your photo, licence number and a 4-digit code. At the door they give you the
            code, which checks you in. Tap Left safely when you go. If the visit runs 20 minutes over, we ask if you’re OK; no answer in 10
            minutes and the care team calls you. Hold the help button any time and they get your location at once.
          </InfoTip>
        </h3>
        <SafetyGuideButton />
      </div>

      {visit ? (
        <VisitSafetyPanel visit={visit} />
      ) : state.canStart ? (
        <>
          <p className="text-sm text-pt-muted">
            Tap this when you set off. {patientFirstName} gets your photo and a door code to give you when you arrive.
          </p>
          <Button className={cn(primaryButtonClass, 'h-11 w-full')} disabled={busy} onClick={() => void start()}>
            <Car className="mr-2 h-4 w-4" />
            On my way
          </Button>
        </>
      ) : (
        <p className="text-sm text-pt-muted">“On my way” opens at {lagosTime(state.opensAt)} on the day of the visit.</p>
      )}
    </section>
  )
}

