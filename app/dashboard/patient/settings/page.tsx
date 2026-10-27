'use client'

import { useEffect, useRef, useState, type ChangeEvent, type ComponentType, type ReactNode } from 'react'
import { useClerk, useUser } from '@clerk/nextjs'
import { isJoyLoginEmail } from '@/lib/auth/joyLoginEmail'
import { useConvex, useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Bell,
  Calendar,
  CheckCircle2,
  Download,
  Loader2,
  Mail,
  Moon,
  Play,
  Shield,
  Sun,
  Trash2,
  User,
  Volume2,
  VolumeX,
} from '@/components/icons'
import { CalendarConnectionStatus } from '@/components/settings/CalendarConnectionStatus'
import { ProfilePhotoUploader } from '@/components/dashboard/shared/ProfilePhotoUploader'
import { RehabifyId } from '@/components/shared/RehabifyId'
import { useClinicTheme } from '@/components/clinic/ClinicTheme'
import { useSoundSetting } from '@/components/patient/shell/PatientControls'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { SUPPORT_EMAIL } from '@/lib/contact'
import { PATIENT_POLICIES, POLICIES } from '@/lib/policies'
import { useConsent } from '@/components/consent/ConsentProvider'
import { DeleteAccountButton } from '@/components/account/DeleteAccountButton'
import {
  IconChip,
  InfoTip,
  PageContainer,
  PageHeader,
  Panel,
  StatusBadge,
  dangerButtonClass,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/patient/ui'

type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say'

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  phone: '',
  dateOfBirth: '',
  gender: '' as Gender | '',
  address: '',
  city: '',
  emergencyName: '',
  emergencyRelationship: '',
  emergencyPhone: '',
}

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'reminders', label: 'Reminders', icon: Bell },
  { id: 'display', label: 'Display & sound', icon: Sun },
  { id: 'privacy', label: 'Privacy & data', icon: Shield },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
] as const

/** Older links use ?tab=notifications for reminders */
const TAB_ALIASES: Record<string, string> = { notifications: 'reminders' }

function readableError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : ''
  const match = raw.match(/(?:Uncaught Error|ConvexError):\s*(.+?)(?:\n|\s+at\s|$)/)
  return match?.[1] || fallback
}

const inputClass = cn(fieldClass, 'h-11 dark:bg-pt-sunken')

function Field({ label, htmlFor, info, hint, children }: { label: string; htmlFor?: string; info?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="flex items-center gap-1 text-sm font-medium text-pt-ink">
        {label}
        {info && <InfoTip>{info}</InfoTip>}
      </Label>
      {children}
      {hint && <p className="text-xs text-pt-muted">{hint}</p>}
    </div>
  )
}

/** A setting with its explanation on the left and the control on the right. */
function SettingRow({
  icon,
  title,
  info,
  description,
  control,
}: {
  icon: ComponentType<{ className?: string }>
  title: ReactNode
  info?: ReactNode
  description?: ReactNode
  control: ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <IconChip icon={icon} tone="neutral" size="sm" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-sm font-semibold text-pt-ink">
          {title}
          {info && <InfoTip>{info}</InfoTip>}
        </p>
        {description && <p className="mt-0.5 text-[13px] text-pt-muted">{description}</p>}
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  )
}

export default function PatientSettingsPage() {
  const { user: clerkUser } = useUser()
  const { openUserProfile } = useClerk()
  const convex = useConvex()
  const patient = useQuery(api.patients.getPatientByUserId, {})
  const currentUser = useQuery(api.users.getMyUser)
  const calendarCredentials = useQuery(
    api.calendar.oauth.getCredentials,
    currentUser ? { userId: currentUser._id } : 'skip'
  ) as { connected: true; updatedAt?: number } | null | undefined
  const updateProfile = useMutation(api.patients.updateMyPatientProfile)
  const updateNotificationPreferences = useMutation(api.users.updateNotificationPreferences)
  const { theme, toggleTheme } = useClinicTheme()
  const [soundsOn, setSoundsOn] = useSoundSetting()
  const themeRowRef = useRef<HTMLDivElement>(null)

  const [form, setForm] = useState(EMPTY_FORM)
  const [formLoaded, setFormLoaded] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingReminders, setSavingReminders] = useState(false)
  const [exporting, setExporting] = useState(false)
  const { openSettings: openCookieSettings } = useConsent()
  const [calendarNotice, setCalendarNotice] = useState<'success' | 'access_denied' | 'error' | null>(null)
  const [activeSection, setActiveSection] = useState<string>('profile')

  // Fill the form once the saved details arrive (not on every live update, so typing isn't overwritten)
  useEffect(() => {
    if (!patient || formLoaded) return
    const profile = patient.profile
    setForm({
      firstName: patient.firstName ?? '',
      lastName: patient.lastName ?? '',
      phone: patient.phone ?? '',
      dateOfBirth: profile?.dateOfBirth?.slice(0, 10) ?? '',
      gender: (profile?.gender as Gender | undefined) ?? '',
      address: profile?.address ?? '',
      city: profile?.city ?? '',
      emergencyName: profile?.emergencyContact?.name ?? '',
      emergencyRelationship: profile?.emergencyContact?.relationship ?? '',
      emergencyPhone: profile?.emergencyContact?.phone ?? '',
    })
    setFormLoaded(true)
  }, [patient, formLoaded])

  // Calendar sign-in results and ?tab= links (e.g. from the "connect your calendar" prompt)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('calendar_success')) setCalendarNotice('success')
    else if (params.get('calendar_error')) setCalendarNotice(params.get('calendar_error') === 'access_denied' ? 'access_denied' : 'error')

    const tab = params.get('tab')
    const target = tab ? TAB_ALIASES[tab] ?? tab : params.get('calendar_success') || params.get('calendar_error') ? 'calendar' : null
    if (target && SECTIONS.some((s) => s.id === target)) {
      setActiveSection(target)
      // Wait a frame so the page has its full height before scrolling
      requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }, [])

  const goTo = (id: string) => {
    setActiveSection(id)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }

  const set = (key: keyof typeof EMPTY_FORM) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleProfileUpdate = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error('Please enter your first and last name')
      return
    }
    const hasEmergency = form.emergencyName.trim() || form.emergencyPhone.trim()
    if (hasEmergency && (!form.emergencyName.trim() || !form.emergencyPhone.trim())) {
      toast.error("Please add both your emergency contact's name and phone number")
      return
    }
    setSavingProfile(true)
    try {
      // Clerk holds the sign-in name; keep it in step so the next sign-in doesn't revert it
      if (clerkUser && (clerkUser.firstName !== form.firstName.trim() || clerkUser.lastName !== form.lastName.trim())) {
        try {
          await clerkUser.update({ firstName: form.firstName.trim(), lastName: form.lastName.trim() })
        } catch (error) {
          console.warn('Could not update the name on the sign-in account:', error)
        }
      }
      await updateProfile({
        firstName: form.firstName,
        lastName: form.lastName,
        phoneNumber: form.phone.trim() || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        address: form.address,
        city: form.city,
        emergencyContact: hasEmergency
          ? {
              name: form.emergencyName.trim(),
              relationship: form.emergencyRelationship.trim() || 'Not specified',
              phone: form.emergencyPhone.trim(),
            }
          : undefined,
      })
      playSound('success')
      toast.success('Profile saved')
    } catch (error) {
      playSound('error')
      toast.error(readableError(error, "We couldn't save your profile. Please try again."))
    } finally {
      setSavingProfile(false)
    }
  }

  const remindersOn = patient?.notificationPreferences?.appointmentReminders !== false
  const handleRemindersChange = async (checked: boolean) => {
    setSavingReminders(true)
    try {
      await updateNotificationPreferences({ notificationPreferences: { appointmentReminders: checked } })
      toast.success(checked ? 'Reminders on' : 'Reminders off')
    } catch (error) {
      toast.error(readableError(error, "We couldn't update your reminders."))
    } finally {
      setSavingReminders(false)
    }
  }

  const handleThemeChange = () => {
    const rect = themeRowRef.current?.getBoundingClientRect()
    toggleTheme(rect ? { x: rect.right - 32, y: rect.top + rect.height / 2 } : undefined)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const data = await convex.query(api.patients.exportMyData, {})
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `rehabify-my-data-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('Your data is downloading')
    } catch (error) {
      toast.error(readableError(error, "We couldn't prepare your data. Please try again."))
    } finally {
      setExporting(false)
    }
  }

  const isDark = theme === 'dark'
  // Patients who joined through Joy sign in with a placeholder address; don't show it as theirs
  const signInEmail = patient?.email && !isJoyLoginEmail(patient.email) ? (patient.email as string) : null

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Settings" description="Your details, reminders, display and data." />

      {/* Jump to a section */}
      <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1 rounded-2xl bg-pt-sunken p-1">
          {SECTIONS.map((section) => {
            const Icon = section.icon
            const active = activeSection === section.id
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => goTo(section.id)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition',
                  active ? 'bg-pt-surface text-pt-ink shadow-pt dark:shadow-none' : 'text-pt-muted hover:text-pt-ink'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {section.label}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Profile */}
      <Panel
        id="profile"
        className="scroll-mt-20"
        title="Profile"
        description="Your physiotherapist sees these details"
        info="Keeping these up to date helps your physio contact you and plan home visits."
      >
        <div className="space-y-5">
          <div className="rounded-2xl bg-pt-sunken p-4">
            <ProfilePhotoUploader currentImageUrl={currentUser?.imageUrl} size="md" />
          </div>

          {!formLoaded ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-11 w-full rounded-xl bg-pt-sunken" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="First name" htmlFor="firstName">
                  <Input id="firstName" value={form.firstName} onChange={set('firstName')} autoComplete="given-name" className={inputClass} />
                </Field>
                <Field label="Last name" htmlFor="lastName">
                  <Input id="lastName" value={form.lastName} onChange={set('lastName')} autoComplete="family-name" className={inputClass} />
                </Field>
              </div>

              {signInEmail ? (
                <Field label="Email" htmlFor="email" hint="The email you sign in with.">
                  <Input id="email" type="email" value={signInEmail} disabled className={inputClass} />
                </Field>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-pt-sun-bg px-4 py-3">
                  <p className="text-sm text-pt-sun-fg">Add an email so you can sign in any time, without waiting for a link.</p>
                  <Button onClick={() => openUserProfile()} className={cn(primaryButtonClass, 'h-9 px-4')}>
                    Add email
                  </Button>
                </div>
              )}

              {currentUser?.patientNumber && (
                <Field
                  label="Patient ID"
                  info="Your permanent Rehabify number. Quote it when you contact a clinic or our support team."
                >
                  <div>
                    <RehabifyId value={currentUser.patientNumber} className="text-xs" />
                  </div>
                </Field>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Phone number" htmlFor="phone" info="So your physio can call you about a visit if they need to.">
                  <Input id="phone" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="+234…" className={inputClass} />
                </Field>
                <Field label="Date of birth" htmlFor="dateOfBirth">
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={form.dateOfBirth}
                    onChange={set('dateOfBirth')}
                    max={new Date().toISOString().slice(0, 10)}
                    className={inputClass}
                  />
                </Field>
              </div>

              <Field label="Gender">
                <Select value={form.gender} onValueChange={(value) => setForm((f) => ({ ...f, gender: value as Gender }))}>
                  <SelectTrigger className={cn(inputClass, 'w-full')} aria-label="Gender">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                    <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
                <Field label="Home address" htmlFor="address" info="Used for home visits, so your physio can find you.">
                  <Input id="address" value={form.address} onChange={set('address')} autoComplete="street-address" className={inputClass} />
                </Field>
                <Field label="City" htmlFor="city">
                  <Input id="city" value={form.city} onChange={set('city')} autoComplete="address-level2" className={inputClass} />
                </Field>
              </div>

              <div className="space-y-3 rounded-2xl bg-pt-sunken p-4">
                <p className="flex items-center gap-1 text-sm font-semibold text-pt-ink">
                  Emergency contact
                  <InfoTip>Someone your physio can call if something happens during a session. Add a name and a phone number.</InfoTip>
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Input aria-label="Emergency contact name" placeholder="Name" value={form.emergencyName} onChange={set('emergencyName')} className={inputClass} />
                  <Input
                    aria-label="Relationship"
                    placeholder="Relationship, e.g. sister"
                    value={form.emergencyRelationship}
                    onChange={set('emergencyRelationship')}
                    className={inputClass}
                  />
                  <Input aria-label="Emergency contact phone" type="tel" placeholder="Phone" value={form.emergencyPhone} onChange={set('emergencyPhone')} className={inputClass} />
                </div>
              </div>

              <Button onClick={handleProfileUpdate} disabled={savingProfile} className={cn(primaryButtonClass, 'h-11 w-full sm:w-auto sm:px-8')}>
                {savingProfile ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : (
                  'Save profile'
                )}
              </Button>
            </>
          )}
        </div>
      </Panel>

      {/* Reminders */}
      <Panel id="reminders" className="scroll-mt-20" title="Reminders">
        <div className="divide-y divide-pt-line">
          <SettingRow
            icon={Bell}
            title="Visit and exercise reminders"
            info="Turn this off if you’d rather not be reminded. You’ll still get messages about bookings, changes and invoices."
            description="An email and dashboard reminder before each visit, and a morning nudge when you have home exercises."
            control={
              <Switch
                id="appointment-reminders"
                checked={remindersOn}
                disabled={patient === undefined || savingReminders}
                onCheckedChange={handleRemindersChange}
                aria-label="Visit and exercise reminders"
                className="data-[state=checked]:bg-pt-accent"
              />
            }
          />
        </div>
        <p className="mt-2 rounded-2xl bg-pt-sunken p-3 text-xs text-pt-muted">
          Messages about your care, such as booking confirmations, changes and invoices, are always sent.
        </p>
      </Panel>

      {/* Display & sound */}
      <Panel
        id="display"
        className="scroll-mt-20"
        title="Display & sound"
        info="These are saved on this device, so you can choose differently on your phone and your laptop."
      >
        <div className="divide-y divide-pt-line">
          <div ref={themeRowRef}>
            <SettingRow
              icon={isDark ? Moon : Sun}
              title="Dark mode"
              info="Easier on the eyes at night. Your choice is shared with the other Rehabify dashboards on this device."
              description={isDark ? 'Dark colours are on.' : 'Light colours are on.'}
              control={
                <Switch
                  checked={isDark}
                  onCheckedChange={handleThemeChange}
                  aria-label="Dark mode"
                  className="data-[state=checked]:bg-pt-accent"
                />
              }
            />
          </div>
          <SettingRow
            icon={soundsOn ? Volume2 : VolumeX}
            title="Sounds"
            info="Short, quiet sounds when something happens, like a booking going through or a message arriving."
            description={soundsOn ? 'Sounds are on.' : 'Sounds are off.'}
            control={
              <Switch checked={soundsOn} onCheckedChange={setSoundsOn} aria-label="Sounds" className="data-[state=checked]:bg-pt-accent" />
            }
          />
        </div>
        <Button
          onClick={() => playSound('booked')}
          disabled={!soundsOn}
          className={cn(secondaryButtonClass, 'mt-3 h-10')}
        >
          <Play className="mr-2 h-3.5 w-3.5" />
          Play a test sound
        </Button>
      </Panel>

      {/* Privacy & data */}
      <Panel id="privacy" className="scroll-mt-20" title="Privacy & data">
        <div className="divide-y divide-pt-line">
          <SettingRow
            icon={Download}
            title="Download your data"
            info="A file with a copy of your profile, visits, bookings, check-ins, exercise programmes and logs, invoices, payments, loans and list of documents."
            description="Get a copy of everything we hold about you."
            control={
              <Button onClick={handleExport} disabled={exporting} className={cn(secondaryButtonClass, 'h-9 px-3')}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Download'}
              </Button>
            }
          />
          <div className="py-3">
            <div className="flex items-start gap-3">
              <IconChip icon={Trash2} tone="rose" size="sm" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-sm font-semibold text-pt-ink">
                  Delete your account
                  <InfoTip>
                    Visit notes, invoices and payments are kept for the time the law requires, under the name “Deleted user”. Everything else is erased.
                  </InfoTip>
                </p>
                <p className="mt-0.5 text-[13px] text-pt-muted">Erase your details and close your account. Cancel any upcoming visits first.</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <DeleteAccountButton
                    triggerClassName={cn(dangerButtonClass, 'inline-flex h-9 items-center px-3 text-sm font-medium')}
                    kept="Visit notes, invoices and payments stay for the time the law requires, under the name “Deleted user”."
                  />
                  <span className="flex items-center gap-1.5 text-xs text-pt-muted">
                    <Mail className="h-3.5 w-3.5" /> Questions? {SUPPORT_EMAIL}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* Policies: everything a patient agrees to, including the Booking Policy */}
      <Panel id="policies" className="scroll-mt-20" title="Policies">
        <ul className="divide-y divide-pt-line">
          {PATIENT_POLICIES.map((id) => (
            <li key={id}>
              <a
                href={POLICIES[id].href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 py-3 text-sm font-medium text-pt-ink hover:underline"
              >
                {POLICIES[id].title}
                <span className="text-xs font-normal text-pt-muted">Updated {POLICIES[id].version}</span>
              </a>
            </li>
          ))}
          <li>
            <button type="button" onClick={openCookieSettings} className="w-full py-3 text-left text-sm font-medium text-pt-ink hover:underline">
              Cookie settings
            </button>
          </li>
        </ul>
      </Panel>

      {/* Calendar */}
      <Panel id="calendar" className="scroll-mt-20" title="Calendar">
        <div className="space-y-3">
          {calendarNotice === 'success' && (
            <p className="flex items-center gap-2 rounded-2xl bg-pt-green-bg px-4 py-3 text-sm text-pt-green-fg">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Google Calendar connected.
            </p>
          )}
          {(calendarNotice === 'access_denied' || calendarNotice === 'error') && (
            <p className="rounded-2xl bg-pt-rose-bg px-4 py-3 text-sm text-pt-rose-fg">
              Couldn’t connect your calendar: {calendarNotice === 'access_denied' ? 'access was denied' : 'something went wrong'}.
            </p>
          )}

          {calendarCredentials ? (
            // Already connected from before: keep the option to disconnect
            <CalendarConnectionStatus currentUser={currentUser} />
          ) : (
            <SettingRow
              icon={Calendar}
              title={
                <span className="flex items-center gap-2">
                  Google Calendar
                  <StatusBadge tone="sun">Coming soon</StatusBadge>
                </span>
              }
              info="We’ll soon add your visits to Google Calendar for you. Until then, your visits and video links are here and in your emails."
              description="Your visits will appear in your calendar automatically."
              control={null}
            />
          )}
        </div>
      </Panel>
    </PageContainer>
  )
}
