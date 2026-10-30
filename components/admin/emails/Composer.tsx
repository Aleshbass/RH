'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { Loader2, Search, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cardClass, ConfirmDialog, inputClass, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { AUDIENCE_LABEL, renderMarketingEmail, type MarketingAudience, type MarketingContent } from '@/lib/email/marketing'
import { marketingApi, type MarketingOverview } from '@/lib/marketingApi'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const AUDIENCES: MarketingAudience[] = ['everyone', 'patients', 'physiotherapists', 'clinics', 'partners', 'contacts', 'individual']
const EMPTY: MarketingContent = { subject: '', previewText: '', heading: '', body: '', ctaLabel: '', ctaUrl: '', imageUrl: '' }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const labelClass = 'text-sm font-medium text-rh-ink dark:text-white'
const hintClass = 'text-xs text-neutral-500 dark:text-neutral-400'

function useDebounced<T>(value: T, ms = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return debounced
}

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message.replace(/^.*ConvexError: /, '').split('\n')[0] : fallback

export function Composer({ overview, onSent }: { overview: MarketingOverview | undefined; onSent: () => void }) {
  const createCampaign = useMutation(marketingApi.createCampaign)
  const sendTest = useMutation(marketingApi.sendTest)

  const [audience, setAudience] = useState<MarketingAudience>('everyone')
  const [content, setContent] = useState<MarketingContent>(EMPTY)
  const [picked, setPicked] = useState<{ email: string; name?: string }[]>([])
  const [pasted, setPasted] = useState('')
  const [search, setSearch] = useState('')
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop')
  const [confirming, setConfirming] = useState(false)
  const [testing, setTesting] = useState(false)

  const q = useDebounced(search.trim())
  const people = useQuery(marketingApi.findPeople, audience === 'individual' && q.length >= 2 ? { q } : 'skip')

  const set = (key: keyof MarketingContent) => (value: string) => setContent((c) => ({ ...c, [key]: value }))

  // One-to-one recipients: picked people plus anything pasted
  const individualEmails = useMemo(() => {
    const fromPaste = pasted.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_RE.test(e))
    return Array.from(new Set([...picked.map((p) => p.email), ...fromPaste]))
  }, [picked, pasted])

  const count = audience === 'individual' ? individualEmails.length : overview?.counts[audience] ?? 0
  const ready = Boolean(content.subject.trim() && content.heading.trim() && content.body.trim()) && count > 0

  const preview = useMemo(
    () =>
      renderMarketingEmail(
        {
          ...content,
          heading: content.heading || 'Your heading',
          body: content.body || 'Your message appears here. Leave a blank line between paragraphs.',
        },
        // Each person sees their own first name ("Hi there," when it isn't known)
        { greetingName: '[First name]', unsubscribeUrl: audience === 'individual' ? undefined : '#' }
      ),
    [content, audience]
  )

  const payload = () => ({
    subject: content.subject,
    heading: content.heading,
    body: content.body,
    previewText: content.previewText || undefined,
    ctaLabel: content.ctaLabel || undefined,
    ctaUrl: content.ctaUrl || undefined,
    imageUrl: content.imageUrl || undefined,
  })

  const test = async () => {
    setTesting(true)
    try {
      const { to } = await sendTest(payload())
      toast.success(`Test sent to ${to}`)
    } catch (error) {
      playSound('error')
      toast.error(errorText(error, 'Could not send the test'))
    } finally {
      setTesting(false)
    }
  }

  const send = async () => {
    try {
      const { recipientCount } = await createCampaign({
        ...payload(),
        audience,
        ...(audience === 'individual' ? { emails: individualEmails } : {}),
      })
      playSound('send')
      toast.success(`Sending to ${recipientCount} ${recipientCount === 1 ? 'person' : 'people'}. Follow it under Sent.`)
      setContent(EMPTY)
      setPicked([])
      setPasted('')
      onSent()
    } catch (error) {
      playSound('error')
      toast.error(errorText(error, 'Could not send the email'))
    } finally {
      setConfirming(false)
    }
  }

  const overToday =
    audience === 'individual' && overview ? Math.max(0, individualEmails.length - (overview.directDailyLimit - overview.directSentToday)) : 0

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-5">
        {/* Audience */}
        <section className={cn(cardClass, 'p-5')}>
          <h2 className="text-base font-semibold text-rh-ink dark:text-white">Who should get it?</h2>
          <div role="radiogroup" aria-label="Audience" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {AUDIENCES.map((a) => {
              const selected = audience === a
              const n = a === 'individual' ? null : overview?.counts[a]
              return (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setAudience(a)}
                  className={cn(
                    'rounded-xl px-3.5 py-3 text-left ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime',
                    selected
                      ? 'bg-rh-ink text-white ring-rh-ink dark:bg-white dark:text-rh-ink'
                      : 'bg-white text-rh-ink ring-black/[0.08] hover:ring-black/20 dark:bg-white/[0.03] dark:text-white dark:ring-white/10',
                    a === 'individual' && 'col-span-2 sm:col-span-1'
                  )}
                >
                  <span className="block text-sm font-semibold">{AUDIENCE_LABEL[a]}</span>
                  <span className={cn('mt-0.5 block text-xs', selected ? 'text-white/70 dark:text-rh-ink/60' : 'text-neutral-500')}>
                    {n === null ? 'Pick people or paste emails' : n === undefined ? '…' : `${n} ${n === 1 ? 'person' : 'people'}`}
                  </span>
                </button>
              )
            })}
          </div>

          {audience === 'individual' && (
            <div className="mt-5 space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search patients, physios, clinics by name or email"
                  className={cn(inputClass, 'pl-9')}
                  aria-label="Search people"
                />
                {q.length >= 2 && people && people.length > 0 && (
                  <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-black/[0.06] bg-white p-1 shadow-lift dark:border-white/10 dark:bg-rh-ink-2">
                    {people.map((p) => (
                      <li key={p.email}>
                        <button
                          type="button"
                          onClick={() => {
                            setPicked((list) => (list.some((x) => x.email === p.email) ? list : [...list, { email: p.email, name: p.name }]))
                            setSearch('')
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-rh-canvas dark:hover:bg-white/[0.05]"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-rh-ink dark:text-white">{p.name}</span>
                            <span className="block truncate text-xs text-neutral-500">{p.email}</span>
                          </span>
                          <span className="shrink-0 text-xs capitalize text-neutral-400">{p.role.replace('_', ' ')}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {picked.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {picked.map((p) => (
                    <li key={p.email} className="inline-flex items-center gap-1.5 rounded-full bg-rh-canvas py-1 pl-3 pr-1 text-sm text-rh-ink dark:bg-white/[0.06] dark:text-white">
                      {p.name || p.email}
                      <button
                        type="button"
                        aria-label={`Remove ${p.email}`}
                        onClick={() => setPicked((list) => list.filter((x) => x.email !== p.email))}
                        className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white dark:hover:bg-white/10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="mk-paste" className={labelClass}>Or paste email addresses</Label>
                <Textarea id="mk-paste" rows={2} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="ada@example.com, tunde@example.com" className={inputClass} />
                <p className={hintClass}>Up to 50 people this way. For more, add them under Contacts and send to Added contacts.</p>
              </div>
            </div>
          )}
        </section>

        {/* Message */}
        <section className={cn(cardClass, 'space-y-4 p-5')}>
          <h2 className="text-base font-semibold text-rh-ink dark:text-white">Message</h2>
          <div className="space-y-1.5">
            <Label htmlFor="mk-subject" className={labelClass}>Subject</Label>
            <Input id="mk-subject" maxLength={150} value={content.subject} onChange={(e) => set('subject')(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mk-preview" className={labelClass}>Preview text <span className="font-normal text-neutral-400">(optional)</span></Label>
            <Input id="mk-preview" maxLength={200} value={content.previewText} onChange={(e) => set('previewText')(e.target.value)} placeholder="The grey line inboxes show after the subject" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mk-heading" className={labelClass}>Heading</Label>
            <Input id="mk-heading" maxLength={150} value={content.heading} onChange={(e) => set('heading')(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mk-body" className={labelClass}>Message</Label>
            <Textarea id="mk-body" rows={9} value={content.body} onChange={(e) => set('body')(e.target.value)} className={cn(inputClass, 'resize-y')} />
            <p className={hintClass}>Leave a blank line between paragraphs. Each email starts with &ldquo;Hello&rdquo; and the person&apos;s first name.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mk-cta-label" className={labelClass}>Button text <span className="font-normal text-neutral-400">(optional)</span></Label>
              <Input id="mk-cta-label" maxLength={60} value={content.ctaLabel} onChange={(e) => set('ctaLabel')(e.target.value)} placeholder="e.g. Book a session" className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mk-cta-url" className={labelClass}>Button link</Label>
              <Input id="mk-cta-url" inputMode="url" value={content.ctaUrl} onChange={(e) => set('ctaUrl')(e.target.value)} placeholder="https://" className={inputClass} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mk-image" className={labelClass}>Image link <span className="font-normal text-neutral-400">(optional)</span></Label>
            <Input id="mk-image" inputMode="url" value={content.imageUrl} onChange={(e) => set('imageUrl')(e.target.value)} placeholder="https://… (shown above the message)" className={inputClass} />
          </div>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={hintClass}>
            {audience === 'individual'
              ? overview
                ? `${overview.directSentToday} of ${overview.directDailyLimit} one-to-one emails sent today. Any over the limit go out tomorrow.`
                : ''
              : 'Group emails go out as Resend Broadcasts. Everyone can unsubscribe in one click.'}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="ghost"
              onClick={test}
              disabled={testing || !(content.subject.trim() && content.heading.trim() && content.body.trim())}
              className={softButtonClass}
            >
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send me a test
            </Button>
            <Button onClick={() => setConfirming(true)} disabled={!ready} className={primaryButtonClass}>
              Send to {count} {count === 1 ? 'person' : 'people'}
            </Button>
          </div>
        </div>
      </div>

      {/* Live preview: the same HTML the send uses */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className={cn(cardClass, 'overflow-hidden')}>
          <div className="flex items-center justify-between border-b border-black/[0.05] px-4 py-3 dark:border-white/[0.06]">
            <p className="text-sm font-semibold text-rh-ink dark:text-white">Preview</p>
            <div className="inline-flex rounded-lg bg-rh-canvas p-0.5 dark:bg-white/[0.06]" role="group" aria-label="Preview size">
              {(['desktop', 'phone'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={device === d}
                  onClick={() => setDevice(d)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium capitalize',
                    device === d ? 'bg-white text-rh-ink shadow-sm dark:bg-rh-ink-3 dark:text-white' : 'text-neutral-500'
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="border-b border-black/[0.05] px-4 py-3 dark:border-white/[0.06]">
            <p className="truncate text-sm font-semibold text-rh-ink dark:text-white">{content.subject || 'Subject line'}</p>
            <p className="truncate text-xs text-neutral-500">{content.previewText || content.heading || 'Preview text'}</p>
          </div>
          <div className="flex justify-center bg-rh-canvas p-3 dark:bg-black/20">
            <iframe
              title="Email preview"
              srcDoc={preview}
              sandbox=""
              className={cn('h-[620px] rounded-xl border-0 bg-white transition-[width] duration-300', device === 'phone' ? 'w-[360px] max-w-full' : 'w-full')}
            />
          </div>
        </div>
      </aside>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Send to ${count} ${count === 1 ? 'person' : 'people'}?`}
        description={
          audience === 'individual'
            ? overToday > 0
              ? `${overToday} of these will go out tomorrow to stay within today's sending limit.`
              : 'They go out within a minute.'
            : `"${content.subject}" goes to ${AUDIENCE_LABEL[audience].toLowerCase()} as a Resend Broadcast. Large audiences take a few minutes to prepare.`
        }
        confirmLabel="Send now"
        onConfirm={send}
      />
    </div>
  )
}
