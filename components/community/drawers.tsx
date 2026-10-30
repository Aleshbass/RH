'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from 'convex/react'
import { ConvexError } from 'convex/values'
import { toast } from 'sonner'
import { Check, Loader2, Plus, ShieldCheck, Trash2, TriangleAlert } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PhysioDrawer, fieldClass, primaryButtonClass } from '@/components/physio/ui'
import { RegionChips } from '@/components/exercise-programs/templates'
import { ANONYMISED_TEXT, privacyIssues } from '@/lib/community/privacy'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { communityRefs } from './refs'

const errorText = (error: unknown, fallback: string) =>
  error instanceof ConvexError && typeof error.data === 'string' ? error.data : fallback

/** Live warnings while typing: anything that could identify the patient. */
export function PrivacyWarnings({ text }: { text: string }) {
  const issues = useMemo(() => privacyIssues(text), [text])
  if (!issues.length) return null
  return (
    <ul className="space-y-1">
      {issues.map((i) => (
        <li key={i.issue} className={cn('flex items-start gap-1.5 text-xs', i.blocking ? 'text-pt-rose-fg' : 'text-pt-muted')}>
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          {i.message}
        </li>
      ))}
    </ul>
  )
}

export function AnonymisedTick({ checked, onChange, text = ANONYMISED_TEXT }: { checked: boolean; onChange: (v: boolean) => void; text?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} aria-pressed={checked} className="flex w-full items-start gap-3 rounded-2xl bg-pt-sunken/70 p-4 text-left">
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
          checked ? 'border-pt-primary bg-pt-primary text-pt-on-primary' : 'border-pt-line-strong bg-pt-surface'
        )}
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
      <span className="text-[13px] leading-relaxed text-pt-ink">
        <ShieldCheck className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
        {text}
      </span>
    </button>
  )
}

export function AskQuestionDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const ask = useMutation(communityRefs.ask)
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [region, setRegion] = useState<string | null>(null)
  const [senior, setSenior] = useState(false)
  const [anonymised, setAnonymised] = useState(false)
  const [busy, setBusy] = useState(false)
  const blocked = privacyIssues(`${title}\n${body}`).some((i) => i.blocking)

  async function submit() {
    setBusy(true)
    try {
      const { postId } = await ask({ title, body, bodyRegion: region ?? undefined, needsSenior: senior, anonymised })
      playSound('send')
      toast.success('Question posted')
      onOpenChange(false)
      setTitle('')
      setBody('')
      setRegion(null)
      setSenior(false)
      setAnonymised(false)
      router.push(`/dashboard/physiotherapist/community/${postId}`)
    } catch (error) {
      playSound('error')
      toast.error(errorText(error, 'Couldn’t post that. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PhysioDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Ask the community"
      description="Other Rehabify physios answer. Keep the patient anonymous."
      footer={
        <Button
          className={cn(primaryButtonClass, 'h-11 w-full')}
          disabled={busy || !anonymised || blocked || title.trim().length < 10 || body.trim().length < 20}
          onClick={() => void submit()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Post question'}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="cq-title" className="text-sm font-semibold text-pt-ink">Your question</label>
          <Input id="cq-title" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 160))} placeholder="e.g. Best home progression for chronic Achilles pain?" className={cn(fieldClass, 'h-11')} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="cq-body" className="text-sm font-semibold text-pt-ink">Details</label>
          <Textarea
            id="cq-body"
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 3000))}
            placeholder="Age, job, how long, what you’ve tried, what you found on assessment. No names or exact dates."
            className={cn(fieldClass, 'resize-none border p-3 text-[15px] leading-relaxed')}
          />
          <PrivacyWarnings text={`${title}\n${body}`} />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-pt-ink">Body area</p>
          <RegionChips value={region} onChange={setRegion} />
        </div>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-pt-line px-4 py-3">
          <span>
            <span className="block text-sm font-semibold text-pt-ink">Needs a senior view</span>
            <span className="block text-xs text-pt-muted">Flags it for case leads and experienced physios</span>
          </span>
          <input type="checkbox" className="h-4 w-4 accent-[#16181c]" checked={senior} onChange={(e) => setSenior(e.target.checked)} />
        </label>
        <AnonymisedTick checked={anonymised} onChange={setAnonymised} />
      </div>
    </PhysioDrawer>
  )
}

/** Sunday 21:00 Lagos time, at least 2 days away. */
function nextSundayEvening() {
  const now = new Date()
  const d = new Date(now)
  d.setDate(now.getDate() + ((7 - now.getDay()) % 7 || 7))
  if (d.getTime() - now.getTime() < 2 * 86_400_000) d.setDate(d.getDate() + 7)
  d.setHours(21, 0, 0, 0)
  return d
}

export function PublishCaseDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const publish = useMutation(communityRefs.publishCase)
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [region, setRegion] = useState<string | null>(null)
  const [options, setOptions] = useState(['', '', ''])
  const [closes, setCloses] = useState(() => nextSundayEvening().toISOString().slice(0, 10))
  const [anonymised, setAnonymised] = useState(false)
  const [busy, setBusy] = useState(false)
  const all = `${title}\n${body}\n${options.join('\n')}`
  const blocked = privacyIssues(all).some((i) => i.blocking)

  async function submit() {
    setBusy(true)
    try {
      const closesAt = new Date(`${closes}T21:00:00+01:00`).getTime()
      const res = await publish({ title, body, bodyRegion: region ?? undefined, pollOptions: options, closesAt, anonymised })
      playSound('booked')
      toast.success(`Case #${res.caseNumber} is live`, { description: 'Every physio has been told.' })
      onOpenChange(false)
      router.push(`/dashboard/physiotherapist/community/${res.postId}`)
    } catch (error) {
      playSound('error')
      toast.error(errorText(error, 'Couldn’t publish the case.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PhysioDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Publish Case of the Week"
      description="An anonymised case, a poll of likely diagnoses, and your reveal when it closes."
      footer={
        <Button
          className={cn(primaryButtonClass, 'h-11 w-full')}
          disabled={busy || !anonymised || blocked || title.trim().length < 10 || body.trim().length < 40 || options.filter((o) => o.trim()).length < 2}
          onClick={() => void submit()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Publish case'}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="cc-title" className="text-sm font-semibold text-pt-ink">Headline</label>
          <Input id="cc-title" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 200))} placeholder="45-year-old trader, 6 weeks of outer hip pain, worse lying on that side" className={cn(fieldClass, 'h-11')} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="cc-body" className="text-sm font-semibold text-pt-ink">The case</label>
          <Textarea id="cc-body" rows={7} value={body} onChange={(e) => setBody(e.target.value.slice(0, 4000))} placeholder="History, findings, what’s been ruled out. Change details that could identify the patient." className={cn(fieldClass, 'resize-none border p-3 text-[15px] leading-relaxed')} />
          <PrivacyWarnings text={all} />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-pt-ink">Poll: what’s most likely?</p>
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <Input value={o} onChange={(e) => setOptions((list) => list.map((x, j) => (j === i ? e.target.value.slice(0, 80) : x)))} placeholder={`Option ${i + 1}`} className={cn(fieldClass, 'h-10')} />
              {options.length > 2 && (
                <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-pt-faint" onClick={() => setOptions((list) => list.filter((_, j) => j !== i))} aria-label="Remove option">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {options.length < 5 && (
            <Button type="button" variant="ghost" size="sm" className="h-8 text-pt-ink" onClick={() => setOptions((list) => [...list, ''])}>
              <Plus className="mr-1 h-4 w-4" /> Add an option
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="cc-closes" className="text-sm font-semibold text-pt-ink">Closes (9 pm)</label>
            <Input id="cc-closes" type="date" value={closes} onChange={(e) => setCloses(e.target.value)} className={cn(fieldClass, 'h-10')} />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-pt-ink">Body area</p>
          <RegionChips value={region} onChange={setRegion} />
        </div>
        <AnonymisedTick checked={anonymised} onChange={setAnonymised} text="The patient agreed to their case being used for teaching, and I’ve changed or removed anything that could identify them." />
      </div>
    </PhysioDrawer>
  )
}
