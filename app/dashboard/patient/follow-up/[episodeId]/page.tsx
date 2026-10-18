'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { Check, Loader2, Star } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type Recovery = 'fully_recovered' | 'much_better' | 'a_little_better' | 'no_change' | 'worse'

const RECOVERY: { value: Recovery; label: string }[] = [
  { value: 'fully_recovered', label: 'Fully recovered' },
  { value: 'much_better', label: 'Much better' },
  { value: 'a_little_better', label: 'A little better' },
  { value: 'no_change', label: 'About the same' },
  { value: 'worse', label: 'Worse' },
]

/** Rehabify's after-care question, about two weeks after a physio completes treatment. */
export default function FollowUpPage() {
  const { episodeId } = useParams<{ episodeId: string }>()
  const pending = useQuery(api.physioCare.getMyFollowUps, {}) as
    | { episodeId: string; completedAt?: number; physioName: string }[]
    | undefined
  const respond = useMutation(api.physioCare.respondToFollowUp)
  const [rating, setRating] = useState(0)
  const [recovery, setRecovery] = useState<Recovery | null>(null)
  const [comment, setComment] = useState('')
  const [wantsCall, setWantsCall] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const entry = pending?.find((p) => p.episodeId === episodeId)

  const submit = async () => {
    if (!rating) return toast.error('Choose a rating from 1 to 5 stars.')
    if (!recovery) return toast.error('Tell us how your recovery is going.')
    setSaving(true)
    try {
      await respond({ episodeId: episodeId as Id<'careEpisodes'>, rating, recovery, comment: comment || undefined, wantsCall })
      playSound('success')
      setDone(true)
    } catch (error) {
      toast.error((error as Error).message || 'Couldn’t send your answer')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#d4fae8] text-[#005b57]">
          <Check className="h-7 w-7" strokeWidth={3} />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-[#002e2c]">Thank you</h1>
        <p className="mt-2 text-sm text-neutral-600">
          {wantsCall ? 'Someone from the Rehabify team will call you soon.' : 'Your answer helps us look after you and every patient after you.'}
        </p>
        <Button asChild className="mt-6 rounded-2xl bg-[#005b57] text-white hover:bg-[#00443e]">
          <Link href="/dashboard/patient">Back to home</Link>
        </Button>
      </div>
    )
  }

  if (pending === undefined) {
    return <div className="mx-auto max-w-lg px-4 py-12 text-center text-sm text-neutral-500">Loading…</div>
  }

  if (!entry) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <h1 className="text-xl font-semibold text-[#002e2c]">Nothing to answer here</h1>
        <p className="mt-2 text-sm text-neutral-600">You may already have told us how it went. Thank you!</p>
        <Button asChild variant="outline" className="mt-6 rounded-2xl">
          <Link href="/dashboard/patient">Back to home</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#005b57]">Rehabify follow-up</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#002e2c]">How are you getting on?</h1>
        <p className="mt-1 text-sm text-neutral-600">Since finishing your treatment with {entry.physioName}.</p>
      </div>

      <section className="space-y-6 rounded-3xl bg-white p-6 shadow-[0_10px_30px_-14px_rgba(0,46,44,0.18)]">
        <div>
          <p className="text-sm font-medium text-[#002e2c]">How happy were you with your care?</p>
          <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Rating out of 5">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={`${value} star${value === 1 ? '' : 's'}`}
                onClick={() => setRating(value)}
                className="rounded-lg p-1 transition-transform active:scale-90"
              >
                <Star className={cn('h-9 w-9', value <= rating ? 'fill-[#e8a54f] text-[#e8a54f]' : 'text-neutral-300')} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-[#002e2c]">How is your recovery going?</p>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Recovery">
            {RECOVERY.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={recovery === option.value}
                onClick={() => setRecovery(option.value)}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-sm transition-all active:scale-95',
                  recovery === option.value ? 'border-[#005b57] bg-[#005b57] font-medium text-white' : 'border-black/[0.08] hover:bg-[#e6f0ef]'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          className="resize-none rounded-2xl"
          placeholder="Anything you’d like to tell us? (optional)"
          aria-label="Comments"
        />

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-rh-canvas p-3">
          <Checkbox checked={wantsCall} onCheckedChange={(checked) => setWantsCall(Boolean(checked))} className="mt-0.5" />
          <span className="text-sm text-[#002e2c]">I’d like someone from Rehabify to call me</span>
        </label>

        <Button onClick={submit} disabled={saving} className="h-11 w-full rounded-2xl bg-[#005b57] text-white hover:bg-[#00443e]">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Send
        </Button>
      </section>
    </div>
  )
}
