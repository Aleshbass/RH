'use client'

import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Star } from '@/components/icons'
import { lagosDate } from '@/convex/helpers/lagosTime'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { PatientDrawer, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/components/patient/ui'

interface AppointmentFeedbackModalProps {
  isOpen: boolean
  onClose: () => void
  appointmentId: Id<'appointments'>
  physiotherapistName: string
  /** The visit's start: milliseconds (as a number or numeric string) or a date string. */
  appointmentDate: string
  serviceType: string
}

type CategoryKey = 'overall_experience' | 'communication' | 'treatment_effectiveness' | 'professionalism'

const CATEGORIES: { key: CategoryKey; label: string; hint: string }[] = [
  { key: 'overall_experience', label: 'Overall', hint: 'How the visit went as a whole' },
  { key: 'communication', label: 'Communication', hint: 'Did they listen and explain clearly?' },
  { key: 'treatment_effectiveness', label: 'Treatment', hint: 'Did it help?' },
  { key: 'professionalism', label: 'Professionalism', hint: 'On time, respectful, prepared' },
]

const RATING_WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent']

function visitTime(value: string) {
  const ms = /^\d+$/.test(value.trim()) ? Number(value) : Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function StarRating({ value, onChange, label }: { value: number; onChange: (rating: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} out of 5`}
          onClick={() => onChange(star)}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50 active:scale-90"
        >
          <Star className={cn('h-5 w-5 transition-colors', star <= value ? 'text-[#f5a524]' : 'text-pt-line-strong')} />
        </button>
      ))}
    </div>
  )
}

/** Rate a finished visit: four quick star ratings and an optional comment. */
export function AppointmentFeedbackModal({
  isOpen,
  onClose,
  appointmentId,
  physiotherapistName,
  appointmentDate,
  serviceType,
}: AppointmentFeedbackModalProps) {
  const [ratings, setRatings] = useState<Partial<Record<CategoryKey, number>>>({})
  const [feedback, setFeedback] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submitFeedback = useMutation(api.appointments.submitPatientFeedback)

  useEffect(() => {
    if (isOpen) {
      setRatings({})
      setFeedback('')
    }
  }, [isOpen])

  const rated = CATEGORIES.filter((category) => ratings[category.key]).length
  const complete = rated === CATEGORIES.length
  const when = visitTime(appointmentDate)
  const physio = physiotherapistName || 'your physio'

  const handleSubmit = async () => {
    if (!complete) {
      toast.error('Please rate all four parts of your visit')
      return
    }
    setIsSubmitting(true)
    try {
      const values = CATEGORIES.map((category) => ratings[category.key] ?? 0)
      const overallRating = Math.round(values.reduce((sum, rating) => sum + rating, 0) / values.length)
      await submitFeedback({
        appointmentId,
        rating: overallRating,
        feedback: feedback.trim(),
        categoryRatings: ratings as Record<CategoryKey, number>,
      })
      playSound('success')
      toast.success('Thank you for your feedback')
      onClose()
    } catch (error) {
      console.error('Error submitting feedback:', error)
      playSound('error')
      toast.error('We couldn’t send your feedback. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <PatientDrawer
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onClose()
      }}
      title="Rate your visit"
      description={`${serviceType}${when ? ` · ${lagosDate(when)}` : ''} with ${physio}`}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button className={cn(secondaryButtonClass, 'h-11')} onClick={onClose} disabled={isSubmitting}>
            Later
          </Button>
          <Button className={cn(primaryButtonClass, 'h-11')} onClick={handleSubmit} disabled={isSubmitting || !complete}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {complete ? 'Send feedback' : `${rated} of ${CATEGORIES.length} rated`}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <ul className="divide-y divide-pt-line rounded-2xl border border-pt-line">
          {CATEGORIES.map((category) => {
            const value = ratings[category.key] ?? 0
            return (
              <li key={category.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-pt-ink">{category.label}</p>
                  <p className="text-xs text-pt-muted">{value ? RATING_WORDS[value] : category.hint}</p>
                </div>
                <StarRating
                  value={value}
                  label={category.label}
                  onChange={(rating) => setRatings((current) => ({ ...current, [category.key]: rating }))}
                />
              </li>
            )
          })}
        </ul>

        <div className="space-y-2">
          <label htmlFor="visit-feedback" className="text-sm font-medium text-pt-ink">
            Anything else? <span className="font-normal text-pt-faint">(optional)</span>
          </label>
          <Textarea
            id="visit-feedback"
            placeholder="What went well, or what could be better"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
            className={cn(fieldClass, 'resize-none')}
          />
          <p className="text-xs text-pt-muted">Your feedback helps us keep care at Rehabify good.</p>
        </div>
      </div>
    </PatientDrawer>
  )
}
