'use client'

import { useState, type ReactNode } from 'react'
import Image from 'next/image'
import { useMutation } from 'convex/react'
import { CalendarDays, Clock3, Loader2, MonitorPlay, Video } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { defaultCohortLabel, formatCohortRange, isCalendarDate } from '@/convex/helpers/learnFormat'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cardClass, formatNaira, inputClass, Panel, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { errorMessage, hintClass, labelClass, textareaClass } from '@/components/admin/partners/shared'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { CohortImagePicker } from './CohortImagePicker'
import type { CohortDraft } from './types'

function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
  className,
}: {
  label: string
  htmlFor: string
  hint?: ReactNode
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </label>
      {children}
      {hint && <p className={hintClass}>{hint}</p>}
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="border-t border-black/[0.05] px-5 py-5 first:border-t-0 dark:border-white/[0.06]">
      <p className="text-sm font-semibold text-rh-night dark:text-white">{title}</p>
      {description && <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{description}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  )
}

function ToggleRow({
  id,
  title,
  description,
  checked,
  onChange,
}: {
  id: string
  title: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-black/[0.06] p-3.5 dark:border-white/[0.08]"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-rh-night dark:text-white">{title}</span>
        <span className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">{description}</span>
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

function Preview({ draft, imageUrl }: { draft: CohortDraft; imageUrl: string | null }) {
  const datesOk = isCalendarDate(draft.startDate) && isCalendarDate(draft.endDate)
  const dateRange = datesOk ? formatCohortRange(draft.startDate, draft.endDate) : 'Choose the dates'
  const rows = [
    { icon: CalendarDays, label: 'Next cohort', value: dateRange },
    { icon: Video, label: 'Live sessions', value: draft.liveSessions || '—' },
    { icon: Clock3, label: 'Duration', value: draft.duration || '—' },
    { icon: MonitorPlay, label: 'Format', value: draft.format || '—' },
  ]
  const price = (value: string) => (Number(value) > 0 ? formatNaira(Number(value)) : '—')
  return (
    <div className="space-y-3 lg:sticky lg:top-24">
      <p className="px-1 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">How it reads on the site</p>
      <div className={cn(cardClass, 'overflow-hidden p-5')}>
        {imageUrl && draft.imageStorageId && (
          <div className="relative -mx-5 -mt-5 mb-4 aspect-[16/10]">
            <Image
              src={imageUrl}
              alt={draft.imageAlt || 'Cohort image'}
              fill
              sizes="300px"
              className="object-cover"
              unoptimized={imageUrl.startsWith('blob:')}
            />
          </div>
        )}
        <p className="text-sm font-semibold text-rh-night dark:text-white">
          {draft.cohortLabel || (datesOk ? defaultCohortLabel(draft.startDate) : 'Next cohort')}
        </p>
        <div className="mt-4 space-y-3.5">
          {rows.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rh-mist text-rh-teal dark:bg-rh-aqua/10 dark:text-rh-aqua">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{label}</p>
                <p className="text-sm font-medium text-rh-night dark:text-white">{value}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-rh-teal p-3 text-white">
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/70">Rehabify PT</p>
            <p className="text-lg font-semibold tabular-nums">{price(draft.rehabifyPrice)}</p>
          </div>
          <div className="rounded-xl bg-rh-mint p-3 text-rh-night dark:bg-emerald-400/10 dark:text-emerald-100">
            <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">Other PT</p>
            <p className="text-lg font-semibold tabular-nums">{price(draft.externalPrice)}</p>
          </div>
        </div>
      </div>
      {draft.showBanner && (
        <div className="overflow-hidden rounded-xl bg-rh-night px-3 py-2.5 text-[11px] text-white">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rh-lime align-middle" />
          {draft.bannerText || (
            <>
              <span className="font-semibold">Rehabify MSK Specialist Program</span>
              <span className="text-white/70"> — next cohort {dateRange}</span>
            </>
          )}
          <span className="ml-2 rounded-full bg-rh-lime px-2 py-0.5 font-semibold text-rh-night">Register</span>
        </div>
      )}
    </div>
  )
}

/** Create or edit a cohort. Saving never changes whether it's live; that's the publish card. */
export function CohortForm({
  cohortId,
  initial,
  initialImageUrl = null,
  onSaved,
  onCancel,
  title,
  description,
}: {
  cohortId?: Id<'learnCohorts'>
  initial: CohortDraft
  initialImageUrl?: string | null
  onSaved?: (id: Id<'learnCohorts'>) => void
  onCancel?: () => void
  title: string
  description?: string
}) {
  const save = useMutation(api.learn.adminSaveCohort)
  const [draft, setDraft] = useState<CohortDraft>(initial)
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)

  const set = <K extends keyof CohortDraft>(key: K) => (value: CohortDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const text = (key: keyof CohortDraft) => ({
    id: `cohort-${key}`,
    value: draft[key] as string,
    onChange: (e: { target: { value: string } }) => set(key)(e.target.value as never),
    className: inputClass,
  })

  const submit = async () => {
    const problems: string[] = []
    if (!isCalendarDate(draft.startDate) || !isCalendarDate(draft.endDate)) problems.push('choose the start and end dates')
    if (!draft.liveSessions.trim() || !draft.duration.trim() || !draft.format.trim()) problems.push('fill in the schedule')
    if (!(Number(draft.rehabifyPrice) > 0) || !(Number(draft.externalPrice) > 0)) problems.push('set both prices')
    if (problems.length) {
      playSound('error')
      toast.error(`Almost there: ${problems.join(', ')}.`)
      return
    }
    setSaving(true)
    try {
      const capacity = draft.capacity.trim() === '' ? undefined : Number(draft.capacity)
      const id = (await save({
        cohortId,
        cohortLabel: draft.cohortLabel,
        startDate: draft.startDate,
        endDate: draft.endDate,
        registrationDeadline: draft.registrationDeadline || undefined,
        liveSessions: draft.liveSessions,
        duration: draft.duration,
        format: draft.format,
        rehabifyPrice: Number(draft.rehabifyPrice),
        externalPrice: Number(draft.externalPrice),
        capacity,
        showOnLanding: draft.showOnLanding,
        showBanner: draft.showBanner,
        bannerText: draft.bannerText || undefined,
        communityLink: draft.communityLink || undefined,
        welcomeNote: draft.welcomeNote || undefined,
        imageStorageId: draft.imageStorageId,
        imageAlt: draft.imageAlt || undefined,
      })) as Id<'learnCohorts'>
      playSound('success')
      toast.success(cohortId ? 'Cohort updated. The website shows the changes right away.' : 'Draft saved. Make it live when you are ready.')
      onSaved?.(id)
    } catch (error) {
      playSound('error')
      toast.error(errorMessage(error, 'Could not save the cohort'))
    } finally {
      setSaving(false)
    }
  }

  const range = isCalendarDate(draft.startDate) && isCalendarDate(draft.endDate) ? formatCohortRange(draft.startDate, draft.endDate) : null

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      <Panel title={title} description={description} bodyClassName="pb-2">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Section title="Dates" description="Calendar dates in Lagos time.">
            <Field label="Starts" htmlFor="cohort-startDate" required>
              <Input type="date" {...text('startDate')} />
            </Field>
            <Field label="Ends" htmlFor="cohort-endDate" required hint={range ? <>Shows as “{range}”</> : undefined}>
              <Input type="date" min={draft.startDate || undefined} {...text('endDate')} />
            </Field>
            <Field
              label="Registration deadline"
              htmlFor="cohort-registrationDeadline"
              hint="Optional. Registration closes at the end of this day. Leave empty to keep it open until you close it."
              className="sm:col-span-2"
            >
              <Input type="date" max={draft.endDate || undefined} {...text('registrationDeadline')} className={cn(inputClass, 'sm:max-w-[50%]')} />
            </Field>
          </Section>

          <Section title="Schedule">
            <Field label="Live sessions" htmlFor="cohort-liveSessions" required>
              <Input placeholder="Sundays, 5:00–7:00 PM" maxLength={120} {...text('liveSessions')} />
            </Field>
            <Field label="Duration" htmlFor="cohort-duration" required hint="Also used in the headline: “…in 5 Weeks”.">
              <Input placeholder="5 weeks" maxLength={60} {...text('duration')} />
            </Field>
            <Field label="Format" htmlFor="cohort-format" required>
              <Input placeholder="Online + live clinical demonstrations" maxLength={120} {...text('format')} />
            </Field>
            <Field label="Cohort name" htmlFor="cohort-cohortLabel" hint="Optional. Used in emails and on the page.">
              <Input
                placeholder={isCalendarDate(draft.startDate) ? defaultCohortLabel(draft.startDate) : 'November 2026 cohort'}
                maxLength={80}
                {...text('cohortLabel')}
              />
            </Field>
          </Section>

          <Section title="Prices & seats" description="Charged in naira through Paystack. Changes apply to new checkouts.">
            <Field label="Rehabify physiotherapists (₦)" htmlFor="cohort-rehabifyPrice" required>
              <Input type="number" inputMode="numeric" min={100} step={100} {...text('rehabifyPrice')} />
            </Field>
            <Field label="Other physiotherapists (₦)" htmlFor="cohort-externalPrice" required>
              <Input type="number" inputMode="numeric" min={100} step={100} {...text('externalPrice')} />
            </Field>
            <Field label="Seats" htmlFor="cohort-capacity" hint="Optional. Leave empty for unlimited. The page shows “seats left” near the end.">
              <Input type="number" inputMode="numeric" min={1} step={1} placeholder="Unlimited" {...text('capacity')} />
            </Field>
          </Section>

          <Section title="On the website" description="Only while the cohort is live and taking registrations.">
            <ToggleRow
              id="cohort-showOnLanding"
              title="Landing page section"
              description="A section under the hero on the home page."
              checked={draft.showOnLanding}
              onChange={set('showOnLanding')}
            />
            <ToggleRow
              id="cohort-showBanner"
              title="Top banner"
              description="A slim bar above the menu on public pages."
              checked={draft.showBanner}
              onChange={set('showBanner')}
            />
            <Field label="Banner text" htmlFor="cohort-bannerText" hint="Optional. Leave empty for the standard text shown in the preview." className="sm:col-span-2">
              <Input placeholder="Rehabify MSK Specialist Program — next cohort …" maxLength={140} {...text('bannerText')} />
            </Field>
          </Section>

          <Section
            title="Image"
            description="Optional. A photo makes the landing-page section and the program page richer. Without one, they use the brand-colour layout."
          >
            <CohortImagePicker
              storageId={draft.imageStorageId}
              previewUrl={imageUrl}
              alt={draft.imageAlt}
              onChange={(storageId, previewUrl) => {
                setDraft((d) => ({ ...d, imageStorageId: storageId }))
                setImageUrl(previewUrl)
              }}
              onAltChange={set('imageAlt')}
            />
          </Section>

          <Section title="After payment" description="Sent in the confirmation email.">
            <Field label="Cohort group link" htmlFor="cohort-communityLink" hint="Optional, e.g. a WhatsApp group invite. Must start with https://">
              <Input type="url" placeholder="https://chat.whatsapp.com/…" maxLength={500} {...text('communityLink')} />
            </Field>
            <Field label="Welcome note" htmlFor="cohort-welcomeNote" hint="Optional. One extra paragraph in the email." className="sm:col-span-2">
              <textarea
                id="cohort-welcomeNote"
                rows={3}
                maxLength={500}
                value={draft.welcomeNote}
                onChange={(e) => set('welcomeNote')(e.target.value)}
                className={textareaClass}
                placeholder="We'll send the Zoom link for the first session on Friday."
              />
            </Field>
          </Section>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/[0.05] px-5 py-4 dark:border-white/[0.06]">
            {dirty && !saving && <span className="mr-auto text-xs text-amber-600 dark:text-amber-300">Unsaved changes</span>}
            {onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel} className={softButtonClass} disabled={saving}>
                Cancel
              </Button>
            )}
            {cohortId && dirty && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraft(initial)
                  setImageUrl(initialImageUrl)
                }}
                className={softButtonClass}
                disabled={saving}
              >
                Discard
              </Button>
            )}
            <Button type="submit" className={primaryButtonClass} disabled={saving || (Boolean(cohortId) && !dirty)}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {cohortId ? 'Save changes' : 'Save draft'}
            </Button>
          </div>
        </form>
      </Panel>
      <Preview draft={draft} imageUrl={imageUrl} />
    </div>
  )
}
