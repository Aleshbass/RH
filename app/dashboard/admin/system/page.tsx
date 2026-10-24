'use client'

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import { Loader2, Mail, Store, UserPlus, Wrench } from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  AdminPage,
  ConfirmDialog,
  IconChip,
  PageHeader,
  Panel,
  StatusBadge,
  inputClass,
  primaryButtonClass,
  softButtonClass,
} from '@/components/admin/ui'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type Controls = {
  maintenanceMode: boolean
  maintenanceMessage: string
  allowPatientSignups: boolean
  allowPhysioSignups: boolean
  allowClinicSignups: boolean
  marketplaceEnabled: boolean
  supportEmail: string
}

const FIELDS: (keyof Controls)[] = [
  'maintenanceMode',
  'maintenanceMessage',
  'allowPatientSignups',
  'allowPhysioSignups',
  'allowClinicSignups',
  'marketplaceEnabled',
  'supportEmail',
]

const MAX_MESSAGE = 500

function pick(source: Controls): Controls {
  return Object.fromEntries(FIELDS.map((k) => [k, source[k]])) as Controls
}

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error && typeof (error as { data: unknown }).data === 'string') {
    return (error as { data: string }).data
  }
  return error instanceof Error ? error.message : 'Something went wrong'
}

export default function AdminSettingsPage() {
  const saved = useQuery(api.platformSettings.getPlatformControls)
  const update = useMutation(api.platformSettings.updatePlatformControls)
  const reduceMotion = useReducedMotion()

  const [draft, setDraft] = useState<Controls | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmMaintenance, setConfirmMaintenance] = useState(false)

  const savedControls = useMemo(() => (saved ? pick(saved) : null), [saved])
  const dirty = !!draft && !!savedControls && FIELDS.some((k) => draft[k] !== savedControls[k])

  // Load the saved values, and follow changes made elsewhere while nothing is being edited
  useEffect(() => {
    if (savedControls && !dirty) setDraft(savedControls)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedControls])

  const set = <K extends keyof Controls>(key: K, value: Controls[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d))

  const emailInvalid = !!draft?.supportEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.supportEmail.trim())
  const messageTooLong = (draft?.maintenanceMessage.length ?? 0) > MAX_MESSAGE

  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const result = await update(draft)
      playSound('success')
      toast.success(result.changed ? 'Settings saved' : 'Nothing to change')
    } catch (error) {
      playSound('error')
      toast.error('Could not save settings', { description: errorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  const requestSave = () => {
    if (!draft || emailInvalid || messageTooLong) return
    if (draft.maintenanceMode && !savedControls?.maintenanceMode) setConfirmMaintenance(true)
    else void save()
  }

  return (
    <AdminPage className="pb-24">
      <PageHeader
        eyebrow="Platform"
        title="Settings"
        description="Switches that change what visitors and new users can do. Changes apply as soon as you save."
        actions={
          saved?.updatedAt ? (
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              Last changed {formatDistanceToNow(saved.updatedAt, { addSuffix: true })}
              {saved.updatedByName ? ` by ${saved.updatedByName}` : ''}
            </span>
          ) : undefined
        }
      />

      {!draft ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {draft.maintenanceMode && savedControls?.maintenanceMode && (
            <div className="flex items-start gap-3 rounded-2xl bg-rh-peach px-4 py-3 text-sm text-[#8a5208] dark:bg-amber-400/10 dark:text-amber-200">
              <Wrench className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                <span className="font-semibold">Maintenance mode is on.</span> Visitors and signed-in users who aren&apos;t
                admins see the maintenance screen.
              </p>
            </div>
          )}

          <SettingsGroup
            icon={Wrench}
            title="Maintenance"
            description="Cover the site with a maintenance screen while you work on something."
          >
            <SwitchRow
              label="Maintenance mode"
              description="Every page shows the maintenance screen, except sign-in and the admin console. Admins are never blocked. This is a screen in the browser; background jobs and webhooks keep running."
              checked={draft.maintenanceMode}
              onChange={(v) => set('maintenanceMode', v)}
              tone="warning"
            />
            <div className="space-y-1.5 px-5 py-4">
              <Label htmlFor="maintenance-message" className="text-sm font-medium text-rh-ink dark:text-white">
                Message for visitors
              </Label>
              <Textarea
                id="maintenance-message"
                value={draft.maintenanceMessage}
                onChange={(e) => set('maintenanceMessage', e.target.value)}
                placeholder="We're making some improvements and will be back shortly."
                rows={3}
                className={cn(inputClass, messageTooLong && 'border-rose-400 dark:border-rose-400')}
              />
              <p className={cn('text-xs', messageTooLong ? 'text-rose-600 dark:text-rose-300' : 'text-neutral-500 dark:text-neutral-400')}>
                {draft.maintenanceMessage.length}/{MAX_MESSAGE} characters. Leave empty to use the default message.
              </p>
            </div>
          </SettingsGroup>

          <SettingsGroup
            icon={UserPlus}
            title="New registrations"
            description="Pause self sign-up for an account type. Existing accounts are not affected."
          >
            <SwitchRow
              label="Patients can sign up"
              description="Controls the Patient choice on the role-selection page."
              checked={draft.allowPatientSignups}
              onChange={(v) => set('allowPatientSignups', v)}
            />
            <SwitchRow
              label="Physiotherapists can sign up"
              description="Controls the Physiotherapist choice on the role-selection page."
              checked={draft.allowPhysioSignups}
              onChange={(v) => set('allowPhysioSignups', v)}
            />
            <SwitchRow
              label="Clinics can sign up"
              description="Controls the Clinic owner choice on the role-selection page."
              checked={draft.allowClinicSignups}
              onChange={(v) => set('allowClinicSignups', v)}
            />
            <p className="px-5 pb-4 pt-1 text-xs text-neutral-500 dark:text-neutral-400">
              A paused choice is greyed out and the server refuses it too. Patient invites, guest bookings and Joy referrals
              still create patient accounts.
            </p>
          </SettingsGroup>

          <SettingsGroup icon={Store} title="Marketplace" description="Public physiotherapist search and online booking.">
            <SwitchRow
              label="Marketplace bookings"
              description="When off, Find a physio, Find my physio and the booking pages show a “booking is paused” screen to everyone except admins. Booking confirmations for paid bookings stay reachable."
              checked={draft.marketplaceEnabled}
              onChange={(v) => set('marketplaceEnabled', v)}
            />
          </SettingsGroup>

          <SettingsGroup icon={Mail} title="Support" description="Where the team can be reached.">
            <div className="space-y-1.5 px-5 py-4">
              <Label htmlFor="support-email" className="text-sm font-medium text-rh-ink dark:text-white">
                Support email
              </Label>
              <Input
                id="support-email"
                type="email"
                value={draft.supportEmail}
                onChange={(e) => set('supportEmail', e.target.value)}
                placeholder="support@example.com"
                className={cn(inputClass, 'max-w-md', emailInvalid && 'border-rose-400 dark:border-rose-400')}
              />
              <p className={cn('text-xs', emailInvalid ? 'text-rose-600 dark:text-rose-300' : 'text-neutral-500 dark:text-neutral-400')}>
                {emailInvalid ? 'Enter a valid email address.' : 'Saved for the team’s reference. It isn’t shown to users yet.'}
              </p>
            </div>
          </SettingsGroup>
        </>
      )}

      <AnimatePresence>
        {dirty && (
          <motion.div
            key="save-bar"
            initial={reduceMotion ? false : { y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { y: 24, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="sticky bottom-4 z-30"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-rh-ink px-4 py-3 text-white shadow-lift dark:bg-rh-ink-3 dark:ring-1 dark:ring-white/10">
              <p className="text-sm">
                You have unsaved changes
                {(emailInvalid || messageTooLong) && <span className="ml-2 text-amber-300">Fix the highlighted fields first.</span>}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-xl text-white hover:bg-white/10 hover:text-white"
                  onClick={() => savedControls && setDraft(savedControls)}
                  disabled={saving}
                >
                  Discard
                </Button>
                <Button
                  size="sm"
                  className={cn(primaryButtonClass, 'bg-rh-lime text-rh-ink hover:bg-rh-lime-deep')}
                  onClick={requestSave}
                  disabled={saving || emailInvalid || messageTooLong}
                >
                  {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Save changes
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmMaintenance}
        onOpenChange={setConfirmMaintenance}
        title="Turn on maintenance mode?"
        description="Everyone except admins will see the maintenance screen right away, including patients and physiotherapists in the middle of using the app."
        confirmLabel="Turn on and save"
        destructive
        onConfirm={save}
      />
    </AdminPage>
  )
}

function SettingsGroup({
  icon,
  title,
  description,
  children,
}: {
  icon: typeof Wrench
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <Panel
      title={
        <span className="flex items-center gap-2.5">
          <IconChip icon={icon} className="h-8 w-8 rounded-lg" />
          {title}
        </span>
      }
      description={<span className="mt-1 block">{description}</span>}
      bodyClassName="mt-2 divide-y divide-black/[0.04] border-t border-black/[0.04] dark:divide-white/[0.06] dark:border-white/[0.06]"
    >
      {children}
    </Panel>
  )
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
  tone,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
  tone?: 'warning'
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm font-medium text-rh-ink dark:text-white">
          {label}
          {tone === 'warning' && checked && <StatusBadge tone="amber">On</StatusBadge>}
        </label>
        <p className="mt-0.5 max-w-2xl text-xs text-neutral-500 dark:text-neutral-400">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className={cn(
          'mt-0.5 data-[state=checked]:bg-rh-lime data-[state=unchecked]:bg-neutral-200 dark:data-[state=checked]:bg-rh-lime dark:data-[state=unchecked]:bg-white/15',
          tone === 'warning' && 'data-[state=checked]:bg-amber-500 dark:data-[state=checked]:bg-amber-400'
        )}
      />
    </div>
  )
}
