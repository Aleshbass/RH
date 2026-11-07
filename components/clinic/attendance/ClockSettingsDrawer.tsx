'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Check, ExternalLink, Loader2, LocateFixed, MapPin } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { PatientDrawer, primaryButtonClass, secondaryButtonClass } from '@/components/patient/ui'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { lagosShortDate, lagosTime } from '@/convex/helpers/lagosTime'
import { GRACE_CHOICES_MIN, RADIUS_CHOICES_M, formatDistance } from '@/convex/helpers/clinicClock'
import { clockError, clockRefs, type BoardPerson, type ClockSettings, type DayHours, type Position } from '@/components/clock/clockApi'
import { ChoiceChips, PersonAvatar } from './shared'

type Form = Omit<ClockSettings, 'site' | 'enabledAt'> & { site: (Position & { pinnedAt?: number | null }) | null }

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-pt-line py-5 first:pt-1 last:border-b-0">
      <div>
        <h3 className="text-[15px] font-semibold text-pt-ink">{title}</h3>
        {hint && <p className="mt-0.5 text-[13px] text-pt-muted">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function ToggleRow({ title, hint, checked, onChange }: { title: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-pt-ink">{title}</span>
        {hint && <span className="mt-0.5 block text-[13px] text-pt-muted">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </label>
  )
}

function OptionCard({ selected, title, hint, onClick }: { selected: boolean; title: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50',
        selected ? 'border-pt-ink bg-pt-surface' : 'border-pt-line bg-pt-surface hover:bg-pt-hover'
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-pt-ink bg-pt-primary text-pt-on-primary' : 'border-pt-line-strong'
        )}
      >
        {selected && <Check className="h-3 w-3" />}
      </span>
      <span>
        <span className="block text-sm font-semibold text-pt-ink">{title}</span>
        <span className="mt-0.5 block text-[13px] text-pt-muted">{hint}</span>
      </span>
    </button>
  )
}

/**
 * Everything about how clock-in works at the clinic. Opening it while clock-in is off is the
 * setup: sensible defaults, pin the clinic, then "Turn on clock-in".
 */
export function ClockSettingsDrawer({
  open,
  onOpenChange,
  settings,
  people,
  hoursToday,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: ClockSettings
  people: BoardPerson[]
  hoursToday: DayHours
}) {
  const save = useMutation(clockRefs.saveClockSettings)
  const [form, setForm] = useState<Form>(() => ({ ...settings }))
  const [saving, setSaving] = useState(false)
  const [pinning, setPinning] = useState(false)

  // Fresh copy each time it opens
  useEffect(() => {
    if (open) setForm({ ...settings })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))
  const setup = !settings.enabled

  const pin = () => {
    if (!('geolocation' in navigator)) {
      toast.error('This browser can’t share its location. Try on your phone.')
      return
    }
    setPinning(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPinning(false)
        const accuracyM = Math.round(p.coords.accuracy)
        if (accuracyM > 500) {
          toast.error(`Your location is too rough to pin the clinic (±${formatDistance(accuracyM)}). Try on a phone, near a window.`)
          return
        }
        set('site', { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM, pinnedAt: Date.now() })
        buzzOk()
        toast.success(`Pinned to within ${formatDistance(accuracyM)}. Save to keep it.`)
      },
      (err) => {
        setPinning(false)
        toast.error(err.code === err.PERMISSION_DENIED ? 'Allow location for Rehabify in your browser, then try again.' : 'Couldn’t find your location. Try again.')
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 }
    )
  }

  const submit = async (enable?: boolean) => {
    if (form.locationCheck && !form.site) {
      toast.error('Pin the clinic first, or switch off the location check.')
      return
    }
    setSaving(true)
    try {
      const siteChanged =
        (form.site?.lat ?? null) !== (settings.site?.lat ?? null) || (form.site?.lng ?? null) !== (settings.site?.lng ?? null)
      await save({
        ...(enable !== undefined ? { enabled: enable } : {}),
        locationCheck: form.locationCheck,
        offsiteRule: form.offsiteRule,
        siteRadiusM: form.siteRadiusM,
        graceMinutes: form.graceMinutes,
        remindClockIn: form.remindClockIn,
        remindClockOut: form.remindClockOut,
        ownerAlerts: form.ownerAlerts,
        exemptUserIds: form.exemptUserIds,
        ...(siteChanged ? { site: form.site ? { lat: form.site.lat, lng: form.site.lng, accuracyM: form.site.accuracyM } : null } : {}),
      })
      playSound(enable ? 'approve' : 'success')
      toast.success(enable ? 'Clock-in is on. Your team has been told.' : 'Saved')
      onOpenChange(false)
    } catch (error) {
      playSound('error')
      toast.error(clockError(error, 'Could not save. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  const exempt = new Set(form.exemptUserIds)

  return (
    <PatientDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={setup ? 'Set up clock-in' : 'Clock-in settings'}
      description={setup ? 'Takes a minute. You can change any of this later.' : 'How clocking in works for your team.'}
      className="sm:max-w-lg"
      footer={
        <div className="flex gap-2">
          {setup ? (
            <Button className={cn(primaryButtonClass, 'h-11 flex-1')} disabled={saving} onClick={() => submit(true)}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Turn on clock-in
            </Button>
          ) : (
            <Button className={cn(primaryButtonClass, 'h-11 flex-1')} disabled={saving} onClick={() => submit()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          )}
          <Button variant="ghost" className="h-11 rounded-xl text-pt-muted" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      }
    >
      <Section title="Check they’re at the clinic" hint="Their phone’s location is compared with a pin you drop at the clinic, only at the moment they clock in or out.">
        <ToggleRow title="Check location" checked={form.locationCheck} onChange={(v) => set('locationCheck', v)} />
        {form.locationCheck && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-pt-sunken p-4">
              {form.site ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-sm font-medium text-pt-ink">
                    <MapPin className="h-4 w-4 text-pt-accent-ink" />
                    Clinic pinned{form.site.pinnedAt ? ` · ${lagosShortDate(form.site.pinnedAt)}` : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${form.site.lat},${form.site.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-pt-muted hover:text-pt-ink"
                    >
                      Check on a map
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <Button size="sm" className={cn(secondaryButtonClass, 'h-8')} disabled={pinning} onClick={pin}>
                      {pinning ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="mr-1.5 h-3.5 w-3.5" />}
                      Pin again here
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-pt-ink">
                    <span className="font-semibold">Stand inside the clinic</span> and tap the button. Where your phone is becomes the clinic’s spot.
                  </p>
                  <Button className={cn(primaryButtonClass, 'h-10')} disabled={pinning} onClick={pin}>
                    {pinning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-2 h-4 w-4" />}
                    {pinning ? 'Finding you…' : 'Pin the clinic here'}
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-pt-ink">Counts as “at the clinic” within</p>
              <ChoiceChips
                label="Distance from the pin"
                value={form.siteRadiusM}
                onChange={(v) => set('siteRadiusM', v)}
                options={RADIUS_CHOICES_M.map((m) => ({ value: m, label: formatDistance(m) }))}
              />
            </div>

            <div className="space-y-2" role="radiogroup" aria-label="Clocking in away from the clinic">
              <p className="text-sm font-medium text-pt-ink">Clocking in away from the clinic</p>
              <OptionCard
                selected={form.offsiteRule === 'flag'}
                title="Ask for a reason"
                hint="Home visits, training… They say why, and you see it."
                onClick={() => set('offsiteRule', 'flag')}
              />
              <OptionCard
                selected={form.offsiteRule === 'block'}
                title="Don’t allow it"
                hint="The button only works at the clinic."
                onClick={() => set('offsiteRule', 'block')}
              />
            </div>
          </div>
        )}
      </Section>

      <Section
        title="When they’re expected"
        hint={
          <>
            From your opening hours
            {hoursToday ? ` (today ${lagosTime(hoursToday.openAt)} – ${lagosTime(hoursToday.closeAt)})` : ' (closed today)'}.{' '}
            <Link href="/dashboard/clinic/settings#hours" className="font-medium text-pt-ink underline-offset-2 hover:underline">
              Change hours
            </Link>
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-sm font-medium text-pt-ink">Late after opening time plus</p>
          <ChoiceChips
            label="Minutes before someone counts as late"
            value={form.graceMinutes}
            onChange={(v) => set('graceMinutes', v)}
            options={GRACE_CHOICES_MIN.map((m) => ({ value: m, label: m === 0 ? 'No grace' : `${m} min` }))}
          />
        </div>
      </Section>

      <Section title="Reminders on their phone">
        <ToggleRow
          title="Remind them to clock in"
          hint={`If they’re not in ${form.graceMinutes ? `${form.graceMinutes} minutes after` : 'at'} opening time.`}
          checked={form.remindClockIn}
          onChange={(v) => set('remindClockIn', v)}
        />
        <ToggleRow
          title="Remind them to clock out"
          hint="Half an hour after closing, if they’re still clocked in. Forgotten shifts close at closing time for you to check."
          checked={form.remindClockOut}
          onChange={(v) => set('remindClockOut', v)}
        />
      </Section>

      <Section title="What you hear">
        <div className="space-y-2" role="radiogroup" aria-label="Your notifications">
          <OptionCard
            selected={form.ownerAlerts === 'exceptions'}
            title="Only what needs a look"
            hint="Late or away clock-ins, who isn’t in yet, forgotten clock-outs."
            onClick={() => set('ownerAlerts', 'exceptions')}
          />
          <OptionCard
            selected={form.ownerAlerts === 'every'}
            title="Every clock-in and out"
            hint="A note each time someone arrives or leaves."
            onClick={() => set('ownerAlerts', 'every')}
          />
          <OptionCard selected={form.ownerAlerts === 'none'} title="Nothing" hint="Check the Clock-in page when you like." onClick={() => set('ownerAlerts', 'none')} />
        </div>
      </Section>

      <Section title="Who clocks in" hint="Switch off part-timers who don’t need reminders. They can still clock in.">
        {people.length === 0 ? (
          <p className="text-sm text-pt-muted">Invite clinicians on the Team page. Everyone you add clocks in here.</p>
        ) : (
          <ul className="divide-y divide-pt-line">
            {people.map((person) => (
              <li key={person.userId} className="flex items-center gap-3 py-2.5">
                <PersonAvatar name={person.name} imageUrl={person.imageUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-pt-ink">{person.name}</span>
                <Switch
                  checked={!exempt.has(person.userId)}
                  aria-label={`${person.name} is expected to clock in`}
                  onCheckedChange={(expected) =>
                    set(
                      'exemptUserIds',
                      expected ? form.exemptUserIds.filter((id) => id !== person.userId) : [...form.exemptUserIds, person.userId]
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </PatientDrawer>
  )
}

function buzzOk() {
  try {
    navigator.vibrate?.(15)
  } catch {
    // not supported
  }
}
