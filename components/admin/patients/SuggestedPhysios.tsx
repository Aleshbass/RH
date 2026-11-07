'use client'

import { useState } from 'react'
import { useAction, useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Loader2, Search, Stethoscope } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog, EmptyState, StatusBadge, cardClass, inputClass, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { PersonAvatar } from '@/components/admin/physios/shared'
import { FORMAT_LABEL as PHYSIO_FORMAT_LABEL, lagosTime } from '@/components/admin/physios/WorkDetails'
import { errorMessage } from '@/components/partners/portal/shared'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import type { Id } from '@/convex/_generated/dataModel'
import { patientApi, placeText, type CareFormat, type PatientRecord, type SuggestedPhysio, type Suggestions } from './patientApi'

const SPECIALTIES = ['Orthopaedic', 'Sports', 'Neurological', 'Geriatric', 'Paediatric', 'Women’s health', 'Cardiopulmonary']

const dayText = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short' }).format(t)

/**
 * Physios who could take this patient, ranked by the matching rules, with their next free time.
 * Pairing links them and tells the physio; a paid booking waiting on a physio is moved instead.
 */
export function SuggestedPhysios({ record, onOpenPhysio }: { record: PatientRecord; onOpenPhysio: (id: string) => void }) {
  const suggest = useAction(patientApi.suggestPhysios)
  const pair = useMutation(patientApi.pairWithPhysio)
  const reassign = useMutation(patientApi.reassignBooking)
  const [format, setFormat] = useState<CareFormat>(record.format ?? 'online')
  const [specialty, setSpecialty] = useState('')
  const [result, setResult] = useState<Suggestions | null>(null)
  const [loading, setLoading] = useState(false)
  const [choice, setChoice] = useState<SuggestedPhysio | null>(null)
  const [note, setNote] = useState('')

  // A paid booking still waiting for a physio: move it (its money goes with it) rather than pair
  const waiting = record.bookings.find((b) => b.awaitingPhysio && b.paid)

  const find = async () => {
    setLoading(true)
    try {
      setResult(await suggest({ patientId: record.userId, format, specialty: specialty.trim() || undefined }))
    } catch (error) {
      toast.error(errorMessage(error, "Couldn’t find physios. Please try again."))
    } finally {
      setLoading(false)
    }
  }

  const confirm = async () => {
    if (!choice) return
    try {
      if (waiting) {
        await reassign({ bookingId: waiting.id, newPhysiotherapistId: choice.userId as Id<'users'>, reason: note.trim() || 'Moved by the care team' })
        toast.success(`Booking moved to ${choice.name}`)
      } else {
        const res = await pair({ patientId: record.userId, physiotherapistId: choice.userId, note: note.trim() || undefined })
        toast.success(`Paired with ${res.physioName}. They've been told by app, phone and email.`)
      }
      playSound('success')
      setChoice(null)
      setNote('')
    } catch (error) {
      // The dialog plays the error sound and stays open
      toast.error(errorMessage(error, "That didn’t go through. Please try again."))
      throw error
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={format} onValueChange={(v) => setFormat(v as CareFormat)}>
          <SelectTrigger className={cn(inputClass, 'h-10 sm:w-[150px]')} aria-label="Format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="online">Video</SelectItem>
            <SelectItem value="home_visit">Home visit</SelectItem>
            <SelectItem value="clinic">Clinic visit</SelectItem>
          </SelectContent>
        </Select>
        <Input
          list="ps-specialties"
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          placeholder="Specialty (optional)"
          className={cn(inputClass, 'sm:flex-1')}
        />
        <datalist id="ps-specialties">
          {SPECIALTIES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <Button onClick={() => void find()} disabled={loading} className={cn(primaryButtonClass, 'h-10')}>
          {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}
          {result ? 'Search again' : 'Find physios'}
        </Button>
      </div>
      {format === 'home_visit' && !record.area && (
        <p className="text-xs text-[#b4690e] dark:text-amber-300">Add the patient&apos;s area first: home visits are matched by travel zone.</p>
      )}
      {waiting && (
        <p className="text-xs text-neutral-600 dark:text-neutral-300">
          They&apos;ve paid for {waiting.line}
          {waiting.physioName ? ` with ${waiting.physioName}, who hasn't answered yet` : ''}. Choosing a physio here moves that booking.
        </p>
      )}

      {result && (
        <>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {result.considered} network physio{result.considered === 1 ? '' : 's'} checked for {PHYSIO_FORMAT_LABEL[format]?.toLowerCase() ?? format}
            {placeText(result.patient) ? ` near ${placeText(result.patient)}` : ''}
            {result.patient.zone ? ` (zone: ${result.patient.zone})` : ''}. Best fit first.
          </p>
          {result.physios.length === 0 ? (
            <EmptyState icon={<Stethoscope />} title="No network physios to suggest" description="No live physio offers this yet. Try another format, or hand to the care team." />
          ) : (
            <ul className="space-y-2">
              {result.physios.map((p) => (
                <li key={p.userId} className={cn(cardClass, 'flex flex-col gap-3 p-3 sm:flex-row sm:items-start')}>
                  <button type="button" onClick={() => onOpenPhysio(p.userId)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                    <PersonAvatar id={p.userId} name={p.name} imageUrl={p.imageUrl} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-rh-ink underline-offset-2 hover:underline dark:text-white">{p.name}</span>
                      <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                        {[p.location, p.specializations.slice(0, 2).join(', '), p.formats.map((f) => PHYSIO_FORMAT_LABEL[f] ?? f).join(' & ')].filter(Boolean).join(' · ')}
                      </span>
                      <span className="mt-1 block text-xs font-medium text-rh-ink dark:text-white">
                        {p.nextSlot ? `Next free: ${dayText(p.nextSlot)}, ${lagosTime(p.nextSlot)}` : 'No free time this week'}
                        <span className="font-normal text-neutral-500"> · {p.booked7d} booked this week · {p.recentReferrals} referral{p.recentReferrals === 1 ? '' : 's'} in 30 days</span>
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {record.viewedPhysios.some((v) => v.physioId === p.userId) && <StatusBadge tone="teal">They looked at this profile</StatusBadge>}
                        {p.fits.map((f) => (
                          <StatusBadge key={f} tone="green">{f}</StatusBadge>
                        ))}
                        {p.gaps.map((g) => (
                          <StatusBadge key={g} tone="amber">{g}</StatusBadge>
                        ))}
                      </span>
                    </span>
                  </button>
                  <Button size="sm" onClick={() => setChoice(p)} className={cn(waiting ? primaryButtonClass : softButtonClass, 'h-9 shrink-0')}>
                    {waiting ? 'Move booking' : 'Pair'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <ConfirmDialog
        open={choice !== null}
        onOpenChange={(open) => !open && setChoice(null)}
        title={choice ? (waiting ? `Move the booking to ${choice.name}?` : `Pair ${record.name} with ${choice.name}?`) : ''}
        description={
          waiting
            ? 'The paid booking, its appointment and the patient link move to this physio. They get the request to accept.'
            : 'They become the patient’s physio. We tell them by app, phone and email with what we know, and close this patient’s open “looking for care” items.'
        }
        confirmLabel={waiting ? 'Move booking' : 'Pair'}
        onConfirm={confirm}
      >
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the physio (optional)" className={inputClass} />
      </ConfirmDialog>
    </div>
  )
}
