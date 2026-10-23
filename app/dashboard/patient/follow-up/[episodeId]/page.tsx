'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { Check, Loader2, Phone, Star } from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
  EmptyState,
  InfoTip,
  LoadingBlocks,
  PageContainer,
  PageHeader,
  Panel,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/patient/ui'
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

const RATING_WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent']

const HOME = '/dashboard/patient'

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
      <PageContainer className="max-w-lg">
        <section className="flex flex-col items-center rounded-3xl bg-pt-green-bg px-6 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-pt-surface text-pt-green-fg">
            <Check className="h-6 w-6" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-pt-ink">Thank you</h1>
          <p className="mt-2 max-w-sm text-sm text-pt-muted">
            {wantsCall ? 'Someone from the Rehabify team will call you soon.' : 'Your answer helps us look after you and every patient after you.'}
          </p>
          <Button asChild className={cn(primaryButtonClass, 'mt-6 h-11 px-6')}>
            <Link href={HOME}>Back to home</Link>
          </Button>
        </section>
      </PageContainer>
    )
  }

  if (pending === undefined) {
    return (
      <PageContainer className="max-w-lg">
        <LoadingBlocks rows={4} />
      </PageContainer>
    )
  }

  if (!entry) {
    return (
      <PageContainer className="max-w-lg">
        <Panel>
          <EmptyState
            icon={Check}
            title="Nothing to answer here"
            description="You may already have told us how it went. Thank you!"
            action={
              <Button asChild className={cn(secondaryButtonClass, 'h-11 px-5')}>
                <Link href={HOME}>Back to home</Link>
              </Button>
            }
          />
        </Panel>
      </PageContainer>
    )
  }

  return (
    <PageContainer className="max-w-lg">
      <PageHeader
        back={{ href: HOME, label: 'Home' }}
        title="How are you getting on?"
        description={`Since finishing your treatment with ${entry.physioName}. It takes about a minute.`}
        info="Rehabify checks in a little while after treatment ends, to make sure you’re still doing well. Your answers go to the Rehabify care team."
      />

      <Panel bodyClassName="space-y-7 p-5 sm:p-6">
        <div>
          <p className="text-sm font-semibold text-pt-ink">How happy were you with your care?</p>
          <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label="Rating out of 5">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={`${value} star${value === 1 ? '' : 's'}`}
                onClick={() => setRating(value)}
                className="rounded-xl p-1.5 transition-transform hover:bg-pt-hover active:scale-90"
              >
                <Star className={cn('h-8 w-8', value <= rating ? 'text-[#e8a54f]' : 'text-pt-line-strong')} />
              </button>
            ))}
            {rating > 0 && <span className="ml-2 text-sm font-medium text-pt-muted">{RATING_WORDS[rating]}</span>}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-pt-ink">How is your recovery going?</p>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Recovery">
            {RECOVERY.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={recovery === option.value}
                onClick={() => setRecovery(option.value)}
                className={cn(
                  'rounded-full border px-3.5 py-2 text-sm transition-all active:scale-95',
                  recovery === option.value
                    ? 'border-pt-primary bg-pt-primary font-medium text-pt-on-primary'
                    : 'border-pt-line bg-pt-surface text-pt-ink hover:bg-pt-hover'
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
          className={cn(fieldClass, 'resize-none rounded-2xl')}
          placeholder="Anything you’d like to tell us? (optional)"
          aria-label="Comments"
        />

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-pt-sunken p-4">
          <Checkbox
            checked={wantsCall}
            onCheckedChange={(checked) => setWantsCall(Boolean(checked))}
            className="mt-0.5 border-pt-line-strong data-[state=checked]:border-pt-primary data-[state=checked]:bg-pt-primary data-[state=checked]:text-pt-on-primary"
          />
          <span className="flex flex-1 items-start gap-2 text-sm text-pt-ink">
            <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pt-muted" />
            <span className="flex-1">I’d like someone from Rehabify to call me</span>
            <InfoTip>Tick this if something isn’t right or you’d rather talk it through. The Rehabify care team will call you.</InfoTip>
          </span>
        </label>

        <Button onClick={submit} disabled={saving} className={cn(primaryButtonClass, 'h-11 w-full')}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Send
        </Button>
      </Panel>
    </PageContainer>
  )
}
