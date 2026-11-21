'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { Cake, CalendarCheck, Gift, Loader2, MoreHorizontal, PhoneCall, Settings, WhatsApp } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  IconChip,
  Panel,
  PhysioDrawer,
  StatusBadge,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
  type Tone,
} from '@/components/physio/ui'
import { programError } from '@/components/exercise-programs/errors'
import { careMomentsApi, type CareMomentItem, type CareMomentSettings } from '@/lib/careMomentsApi'
import {
  BIRTHDAY_TEMPLATE_HINT,
  momentDayLabel,
  momentMessage,
  momentSummary,
  momentTitle,
  whatsappHref,
  type CareMomentKind,
} from '@/convex/helpers/careMoments'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const KIND_STYLE: Record<CareMomentKind, { icon: typeof Cake; tone: Tone }> = {
  birthday: { icon: Cake, tone: 'rose' },
  care_anniversary: { icon: CalendarCheck, tone: 'violet' },
  discharge_checkin: { icon: PhoneCall, tone: 'blue' },
  team_birthday: { icon: Gift, tone: 'sun' },
}

const INFO =
  "Patients' birthdays, a year since their first visit, and a check-in 3 months after they finish treatment, for the next two weeks. Patients' birthday wishes go out at 8am on the day unless you turn that off. Your team's birthdays show here too, for you to wish them yourself."

/** What happened to a moment, once someone dealt with it. */
function handledBadge(item: CareMomentItem) {
  if (item.status === 'sent') return <StatusBadge tone="green">{item.autoSent ? 'Wished automatically' : 'Sent'}</StatusBadge>
  if (item.status === 'called') return <StatusBadge tone="blue">Called</StatusBadge>
  if (item.status === 'skipped') return <StatusBadge tone="neutral">Skipped</StatusBadge>
  return null
}

/**
 * Home's "Birthdays and milestones", for a clinic (scope "clinic": owner and front desk) or a physio
 * (scope "physio": their own patients, and their clinic patients). Renders nothing for anyone else.
 */
export function CareMomentsPanel({ scope, className }: { scope: 'clinic' | 'physio'; className?: string }) {
  const data = useQuery(careMomentsApi.moments, { scope })
  const mark = useMutation(careMomentsApi.mark)
  const [sending, setSending] = useState<CareMomentItem | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  if (data === null) return null

  const setStatus = async (item: CareMomentItem, status: 'called' | 'skipped' | 'upcoming') => {
    try {
      await mark({ momentId: item._id, status })
      if (status !== 'upcoming') playSound('success')
    } catch (error) {
      playSound('error')
      toast.error(programError(error, 'Couldn’t save that. Please try again.'))
    }
  }

  const missing = data?.missingBirthdayCount ?? 0

  return (
    <div id="moments" className={className}>
      <Panel
        title="Birthdays and milestones"
        info={INFO}
        actions={
          data?.canEditSettings ? (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="rounded-full p-2 text-pt-muted transition-colors hover:bg-pt-hover hover:text-pt-ink"
              aria-label="Birthday and milestone settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          ) : undefined
        }
      >
        {data === undefined ? (
          <div className="space-y-2 px-5 pb-5 pt-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <div className="flex items-center gap-3 px-5 pb-5 pt-2 sm:px-6">
            <IconChip icon={Cake} tone="rose" />
            <p className="text-sm text-pt-muted">No birthdays or milestones in the next two weeks.</p>
          </div>
        ) : (
          <ul className="pb-2 pt-1">
            {data.items.map((item) => {
              const style = KIND_STYLE[item.kind]
              const when = momentDayLabel(item.date, data.today)
              const whatsapp = whatsappHref(item.whatsappPhone, item.message)
              const open = item.status === 'upcoming'
              return (
                <li key={item._id} className="flex items-center gap-3 px-5 py-2.5 sm:px-6">
                  <IconChip icon={style.icon} tone={style.tone} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold text-pt-ink">
                      <span className="truncate">{item.name}</span>
                      <span className={cn('shrink-0 text-xs font-medium', when === 'Today' ? 'text-pt-rose-fg' : 'text-pt-muted')}>{when}</span>
                    </p>
                    <p className="truncate text-xs text-pt-muted">
                      {momentSummary(item.kind, item.years)}
                      {item.clinicianName ? ` · ${item.clinicianName}` : ''}
                    </p>
                  </div>
                  {open ? (
                    <div className="flex shrink-0 items-center gap-1">
                      {whatsapp && (
                        <a
                          href={whatsapp}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full p-2 text-pt-muted transition-colors hover:bg-pt-hover hover:text-pt-ink"
                          aria-label={`WhatsApp ${item.name}`}
                        >
                          <WhatsApp className="h-4 w-4" />
                        </a>
                      )}
                      <Button size="sm" className={cn(primaryButtonClass, 'h-8 rounded-full px-3 text-xs')} onClick={() => setSending(item)}>
                        {item.kind === 'birthday' || item.kind === 'team_birthday' ? 'Wish' : 'Message'}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="rounded-full p-2 text-pt-muted transition-colors hover:bg-pt-hover hover:text-pt-ink"
                            aria-label="More"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setStatus(item, 'called')}>I called them</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setStatus(item, 'skipped')}>Skip</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : (
                    <div className="flex shrink-0 items-center gap-1">
                      {handledBadge(item)}
                      {item.status !== 'sent' && (
                        <button
                          type="button"
                          onClick={() => setStatus(item, 'upcoming')}
                          className="rounded-full px-2 py-1 text-xs font-medium text-pt-muted hover:bg-pt-hover hover:text-pt-ink"
                        >
                          Undo
                        </button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {missing > 0 && (
          <p className="border-t border-pt-line px-5 py-3 text-xs text-pt-muted sm:px-6">
            {missing} of your {Math.max(data?.patientCount ?? 0, missing)} patients {missing === 1 ? "hasn't" : "haven't"} shared their
            birthday yet. We ask them on their Home, so this fills in by itself.
          </p>
        )}
      </Panel>

      {sending && <SendMomentDrawer item={sending} onClose={() => setSending(null)} />}
      {data?.canEditSettings && (
        <MomentSettingsDrawer scope={scope} open={settingsOpen} onOpenChange={setSettingsOpen} settings={data.settings} />
      )}
    </div>
  )
}

function SendMomentDrawer({ item, onClose }: { item: CareMomentItem; onClose: () => void }) {
  const send = useMutation(careMomentsApi.send)
  const [message, setMessage] = useState(item.message)
  const [saving, setSaving] = useState(false)
  const whatsapp = whatsappHref(item.whatsappPhone, message)

  const submit = async () => {
    setSaving(true)
    try {
      await send({ momentId: item._id, message })
      playSound('send')
      toast.success(`Sent to ${item.firstName ?? item.name}`)
      onClose()
    } catch (error) {
      playSound('error')
      toast.error(programError(error, 'Couldn’t send it. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PhysioDrawer
      open
      onOpenChange={(next) => !next && !saving && onClose()}
      title={item.kind === 'birthday' || item.kind === 'team_birthday' ? `Wish ${item.firstName ?? item.name} a happy birthday` : momentTitle(item.kind, item.firstName, item.years)}
      description={`From ${item.sender}, in their Rehabify app and by email.`}
      footer={
        <div className="flex gap-2">
          {whatsapp && (
            <Button asChild className={cn(secondaryButtonClass, 'h-11 flex-1')}>
              <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                <WhatsApp className="mr-2 h-4 w-4" />
                WhatsApp
              </a>
            </Button>
          )}
          <Button onClick={submit} disabled={saving || !message.trim()} className={cn(primaryButtonClass, 'h-11 flex-1')}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send
          </Button>
        </div>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="moment-message">Message</Label>
        <Textarea
          id="moment-message"
          rows={6}
          maxLength={1000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={cn(fieldClass, 'resize-none')}
        />
        <p className="text-xs text-pt-muted">
          {item.whatsappPhone
            ? 'WhatsApp opens a chat with this message ready. Sending here puts it in their app and inbox.'
            : 'There’s no phone number on file, so this goes to their app and inbox.'}
        </p>
      </div>
    </PhysioDrawer>
  )
}

function SettingRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <Label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-semibold text-pt-ink">{label}</span>
        <span className="block text-xs font-normal text-pt-muted">{hint}</span>
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function MomentSettingsDrawer({
  scope,
  open,
  onOpenChange,
  settings,
}: {
  scope: 'clinic' | 'physio'
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: CareMomentSettings
}) {
  const save = useMutation(careMomentsApi.saveSettings)
  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setForm(settings)
  }, [open, settings])

  const set = <K extends keyof CareMomentSettings>(key: K) => (value: CareMomentSettings[K]) => setForm((f) => ({ ...f, [key]: value }))

  const submit = async () => {
    setSaving(true)
    try {
      await save({ scope, ...form, birthdayMessage: form.birthdayMessage ?? undefined })
      toast.success('Saved')
      onOpenChange(false)
    } catch (error) {
      toast.error(programError(error, 'Couldn’t save. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const sender = scope === 'clinic' ? 'your clinic' : 'you'

  return (
    <PhysioDrawer
      open={open}
      onOpenChange={(next) => !saving && onOpenChange(next)}
      title="Birthdays and milestones"
      description="Small moments that keep patients close between treatments."
      footer={
        <div className="flex gap-2">
          <Button className={cn(secondaryButtonClass, 'h-11 flex-1')} onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving} className={cn(primaryButtonClass, 'h-11 flex-1')}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <SettingRow
          id="moment-auto"
          label="Send birthday wishes automatically"
          hint={`At 8am on the day, from ${sender}, in the app and by email. You can still send your own first.`}
          checked={form.autoBirthday}
          onChange={set('autoBirthday')}
        />
        <div className="space-y-1.5">
          <Label htmlFor="moment-template">Birthday message</Label>
          <Textarea
            id="moment-template"
            rows={5}
            maxLength={600}
            value={form.birthdayMessage ?? ''}
            onChange={(e) => set('birthdayMessage')(e.target.value || null)}
            placeholder={momentMessage('birthday', { firstName: '{firstName}', sender: '{sender}' })}
            className={cn(fieldClass, 'resize-none')}
          />
          <p className="text-xs text-pt-muted">Leave empty to use ours. {BIRTHDAY_TEMPLATE_HINT}</p>
        </div>
        <SettingRow
          id="moment-anniversary"
          label="Care anniversaries"
          hint="A reminder when it's a year since a patient's first visit, with a message ready to send."
          checked={form.anniversaries}
          onChange={set('anniversaries')}
        />
        <SettingRow
          id="moment-checkin"
          label="3-month check-ins"
          hint="A reminder to ask how they're doing 3 months after they finish treatment."
          checked={form.dischargeCheckins}
          onChange={set('dischargeCheckins')}
        />
        <SettingRow
          id="moment-past"
          label="Include past patients"
          hint="Keep celebrating with patients for a year after their care ends."
          checked={form.includePastPatients}
          onChange={set('includePastPatients')}
        />
      </div>
    </PhysioDrawer>
  )
}
