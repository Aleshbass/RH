'use client'

import { useEffect, useRef, useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { toast } from 'sonner'
import { Building2, Loader2, Plus, Trash2, Upload, X } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useClinicAccess } from '@/components/clinic/ClinicAccessContext'
import { BankLogo } from '@/components/clinic/BankLogo'
import { HowPayoutsWork } from '@/components/clinic/FeeBreakdown'
import { PageShell, Panel, StatusBadge, primaryButtonClass } from '@/components/clinic/ui'
import { RehabifyId } from '@/components/shared/RehabifyId'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
type Day = (typeof DAYS)[number]
type Hours = Record<Day, { open: string; close: string; active: boolean }>
type PriceItem = { name: string; priceNaira: string; durationMinutes: string }
type TagField = 'services' | 'facilities'

type FormState = {
  name: string
  contactEmail: string
  contactPhone: string
  website: string
  address: string
  city: string
  state: string
  description: string
  specializations: string
  services: string[]
  facilities: string[]
  workingHours: Hours
  priceList: PriceItem[]
}

const approvalBadge: Record<string, { label: string; tone: 'green' | 'amber' | 'red' | 'neutral' }> = {
  approved: { label: 'Verified', tone: 'green' },
  pending_review: { label: 'Under review', tone: 'amber' },
  declined: { label: 'Not approved', tone: 'red' },
  not_submitted: { label: 'Not submitted', tone: 'neutral' },
}

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const LOGO_MAX_BYTES = 2 * 1024 * 1024
const MAX_TAGS = 50

/** Convex only passes ConvexError messages through to the browser in production */
function errorText(err: unknown, fallback: string) {
  return err instanceof ConvexError ? String(err.data) : fallback
}

/** Add typed text to a tag list: commas split it, duplicates (any case) are skipped */
function mergeTags(list: string[], raw: string) {
  const next = [...list]
  for (const part of raw.split(',')) {
    const tag = part.trim().replace(/\s+/g, ' ')
    if (tag && next.length < MAX_TAGS && !next.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      next.push(tag)
    }
  }
  return next
}

export default function ClinicSettingsPage() {
  const { requireFullAccess } = useClinicAccess()
  const setup = useQuery(api.clinicTools.getClinicSetupDetails, {})
  const updateSetup = useMutation(api.clinicTools.updateClinicSetupDetails)

  const [form, setForm] = useState<FormState | null>(null)
  const [drafts, setDrafts] = useState<Record<TagField, string>>({ services: '', facilities: '' })
  const [savingSection, setSavingSection] = useState<string | null>(null)
  const initialised = useRef(false)

  // Load once: later live updates must not overwrite edits the owner hasn't saved yet
  useEffect(() => {
    if (!setup || initialised.current) return
    initialised.current = true
    setForm({
      name: setup.name || '',
      contactEmail: setup.contactEmail || '',
      contactPhone: setup.contactPhone || '',
      website: setup.website || '',
      address: setup.address || '',
      city: setup.city || '',
      state: setup.state || '',
      description: setup.description || '',
      specializations: (setup.specializations || []).join(', '),
      services: setup.services || [],
      facilities: setup.facilities || [],
      workingHours: setup.workingHours as Hours,
      priceList: (setup.priceList || []).map((item: any) => ({
        name: item.name,
        priceNaira: String(item.priceNaira),
        durationMinutes: item.durationMinutes ? String(item.durationMinutes) : '',
      })),
    })
  }, [setup])

  // Jump to #prices / #payouts links from the home checklist once the page has rendered
  useEffect(() => {
    if (form && window.location.hash) {
      document.querySelector(window.location.hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [form !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  // setup is null only for someone outside a clinic, whom the portal is already sending elsewhere
  if (!setup || form === null) {
    return (
      <PageShell title="Clinic settings">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </PageShell>
    )
  }

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))

  const updateDay = (day: Day, patch: Partial<Hours[Day]>) =>
    setForm((prev) =>
      prev ? { ...prev, workingHours: { ...prev.workingHours, [day]: { ...prev.workingHours[day], ...patch } } } : prev
    )

  const updatePrice = (index: number, patch: Partial<PriceItem>) =>
    setForm((prev) =>
      prev ? { ...prev, priceList: prev.priceList.map((item, i) => (i === index ? { ...item, ...patch } : item)) } : prev
    )

  const save = async (section: string) => {
    if (!requireFullAccess('Save clinic settings')) return
    if (!form.name.trim()) {
      toast.error('Clinic name is required')
      return
    }
    for (const item of form.priceList) {
      if (item.name.trim() && !(Number(item.priceNaira) > 0)) {
        toast.error(`Enter a price for "${item.name.trim()}"`)
        return
      }
    }

    // Text typed into a tag box but not added yet is saved too
    const services = mergeTags(form.services, drafts.services)
    const facilities = mergeTags(form.facilities, drafts.facilities)

    setSavingSection(section)
    try {
      const specs = form.specializations.split(',').map((s) => s.trim()).filter(Boolean)
      await updateSetup({
        name: form.name.trim(),
        contactEmail: form.contactEmail.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
        website: form.website.trim(),
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        state: form.state.trim(),
        description: form.description.trim() || undefined,
        specializations: specs,
        services,
        facilities,
        workingHours: form.workingHours,
        priceList: form.priceList
          .filter((item) => item.name.trim())
          .map((item) => ({
            name: item.name.trim(),
            priceNaira: Number(item.priceNaira),
            durationMinutes: Number(item.durationMinutes) > 0 ? Number(item.durationMinutes) : undefined,
          })),
      })
      setForm((prev) => (prev ? { ...prev, services, facilities } : prev))
      setDrafts({ services: '', facilities: '' })
      toast.success('Saved')
    } catch (err) {
      toast.error(errorText(err, 'Could not save your changes'))
    } finally {
      setSavingSection(null)
    }
  }

  const saveButton = (section: string) => (
    <Button size="sm" className={primaryButtonClass} onClick={() => save(section)} disabled={savingSection !== null}>
      {savingSection === section && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
      Save
    </Button>
  )

  const approval = approvalBadge[setup.approvalStatus] ?? approvalBadge.not_submitted

  return (
    <PageShell title="Clinic settings" description="What patients see, when you're open, what you charge and where you get paid.">
      <LogoSection logoUrl={setup.logoUrl ?? null} />

      <Panel
        title="Verification"
        actions={<StatusBadge tone={approval.tone}>{approval.label}</StatusBadge>}
      >
        <p className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400 sm:px-5">
          {setup.approvalStatus === 'approved'
            ? 'Your clinic is verified. Booking, billing and referrals are switched on.'
            : setup.approvalStatus === 'pending_review'
              ? "We're checking your documents. You'll get an email once your clinic is approved."
              : setup.approvalStatus === 'declined'
                ? 'Your application was not approved. Contact support@physioaroundme.com to update your documents.'
                : 'Finish clinic setup to submit your documents for verification.'}
        </p>
      </Panel>

      <Panel title="Clinic details" actions={saveButton('details')}>
        <div id="details" className="grid scroll-mt-20 grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
          {setup.clinicNumber && (
            <Field label="Clinic ID" hint="Your permanent Rehabify clinic number. Quote it when you contact support." className="sm:col-span-2">
              <div>
                <RehabifyId value={setup.clinicNumber} />
              </div>
            </Field>
          )}
          <Field label="Clinic name" className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => update('name', e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.contactEmail} onChange={(e) => update('contactEmail', e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input type="tel" value={form.contactPhone} onChange={(e) => update('contactPhone', e.target.value)} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input value={form.address} onChange={(e) => update('address', e.target.value)} />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={(e) => update('city', e.target.value)} />
          </Field>
          <Field label="State">
            <Input value={form.state} onChange={(e) => update('state', e.target.value)} />
          </Field>
          <Field label="Website (optional)" className="sm:col-span-2">
            <Input placeholder="https://" value={form.website} onChange={(e) => update('website', e.target.value)} />
          </Field>
          <Field label="About your clinic" className="sm:col-span-2">
            <Textarea rows={3} value={form.description} onChange={(e) => update('description', e.target.value)} />
          </Field>
          <Field label="Specialties" hint="Separate with commas, e.g. Sports injuries, Back pain" className="sm:col-span-2">
            <Input value={form.specializations} onChange={(e) => update('specializations', e.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel
        title="Services and facilities"
        description="The care you offer and what's available on site."
        actions={saveButton('offer')}
      >
        <div id="offer" className="grid scroll-mt-20 grid-cols-1 gap-5 p-4 sm:grid-cols-2 sm:p-5">
          <TagListInput
            id="services-input"
            label="Services"
            placeholder="e.g. Post-surgery rehabilitation"
            emptyText="No services added yet."
            values={form.services}
            draft={drafts.services}
            onDraftChange={(value) => setDrafts((prev) => ({ ...prev, services: value }))}
            onChange={(values) => update('services', values)}
          />
          <TagListInput
            id="facilities-input"
            label="Facilities"
            placeholder="e.g. Exercise gym, Parking"
            emptyText="No facilities added yet."
            values={form.facilities}
            draft={drafts.facilities}
            onDraftChange={(value) => setDrafts((prev) => ({ ...prev, facilities: value }))}
            onChange={(values) => update('facilities', values)}
          />
        </div>
      </Panel>

      <Panel title="Opening hours" actions={saveButton('hours')}>
        <ul id="hours" className="scroll-mt-20 divide-y divide-neutral-200 dark:divide-neutral-800">
          {DAYS.map((day) => {
            const hours = form.workingHours[day]
            return (
              <li key={day} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                <div className="flex w-32 items-center gap-3">
                  <Switch
                    checked={hours.active}
                    onCheckedChange={(checked) => updateDay(day, { active: checked })}
                    aria-label={`Open on ${day}`}
                  />
                  <span className="text-sm capitalize text-neutral-900 dark:text-white">{day}</span>
                </div>
                {hours.active ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      className="h-9 w-[7.5rem]"
                      value={hours.open}
                      onChange={(e) => updateDay(day, { open: e.target.value })}
                      aria-label={`${day} opening time`}
                    />
                    <span className="text-sm text-neutral-400">to</span>
                    <Input
                      type="time"
                      className="h-9 w-[7.5rem]"
                      value={hours.close}
                      onChange={(e) => updateDay(day, { close: e.target.value })}
                      aria-label={`${day} closing time`}
                    />
                  </div>
                ) : (
                  <span className="text-sm text-neutral-400 dark:text-neutral-500">Closed</span>
                )}
              </li>
            )
          })}
        </ul>
      </Panel>

      <Panel
        title="Services and prices"
        description="Used when you book appointments and request payments."
        actions={saveButton('prices')}
      >
        <div id="prices" className="scroll-mt-20 space-y-3 p-4 sm:p-5">
          {form.priceList.length === 0 && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No services yet. Add what you charge for, e.g. &quot;Initial assessment&quot;.
            </p>
          )}
          {form.priceList.map((item, index) => (
            <div key={index} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_9rem_7rem_auto] sm:items-end">
              <Field label={index === 0 ? 'Service' : undefined} className="col-span-2 sm:col-span-1">
                <Input
                  placeholder="Service name"
                  value={item.name}
                  onChange={(e) => updatePrice(index, { name: e.target.value })}
                />
              </Field>
              <Field label={index === 0 ? 'Price (₦)' : undefined}>
                <Input
                  inputMode="numeric"
                  placeholder="15000"
                  value={item.priceNaira}
                  onChange={(e) => updatePrice(index, { priceNaira: e.target.value.replace(/[^\d]/g, '') })}
                />
              </Field>
              <Field label={index === 0 ? 'Minutes' : undefined} className="hidden sm:block">
                <Input
                  inputMode="numeric"
                  placeholder="60"
                  value={item.durationMinutes}
                  onChange={(e) => updatePrice(index, { durationMinutes: e.target.value.replace(/[^\d]/g, '') })}
                />
              </Field>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 self-end p-0 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                aria-label={`Remove ${item.name || 'service'}`}
                onClick={() => update('priceList', form.priceList.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => update('priceList', [...form.priceList, { name: '', priceNaira: '', durationMinutes: '' }])}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add service
          </Button>
        </div>
      </Panel>

      <PayoutSection />
    </PageShell>
  )
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label?: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      {label && <Label className="mb-1.5 block text-sm">{label}</Label>}
      {children}
      {hint && <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>}
    </div>
  )
}

/** A text box with an Add button, and the added items as removable chips. */
function TagListInput({
  id,
  label,
  placeholder,
  emptyText,
  values,
  draft,
  onDraftChange,
  onChange,
}: {
  id: string
  label: string
  placeholder: string
  emptyText: string
  values: string[]
  draft: string
  onDraftChange: (value: string) => void
  onChange: (values: string[]) => void
}) {
  const full = values.length >= MAX_TAGS

  const add = () => {
    if (!draft.trim()) return
    onChange(mergeTags(values, draft))
    onDraftChange('')
  }

  return (
    <div className="min-w-0">
      <Label htmlFor={id} className="mb-1.5 block text-sm">
        {label}
      </Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          maxLength={80}
          disabled={full}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <Button type="button" variant="outline" className="h-9 shrink-0" onClick={add} disabled={!draft.trim() || full}>
          Add
        </Button>
      </div>
      {values.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={label}>
          {values.map((value) => (
            <li
              key={value}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 py-0.5 pl-2 pr-0.5 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              <span className="min-w-0 truncate">{value}</span>
              <button
                type="button"
                aria-label={`Remove ${value}`}
                onClick={() => onChange(values.filter((item) => item !== value))}
                className="shrink-0 rounded p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-white dark:focus-visible:ring-rh-lime"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{emptyText}</p>
      )}
      {full && <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">You can add up to {MAX_TAGS}.</p>}
    </div>
  )
}

/** Upload, replace or remove the logo shown at the top of the clinic dashboard. Saves straight away. */
function LogoSection({ logoUrl }: { logoUrl: string | null }) {
  const { requireFullAccess } = useClinicAccess()
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const updateLogo = useMutation(api.clinicTools.updateClinicLogo)
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  const choose = () =>
    requireFullAccess('Upload logo', () => {
      fileInput.current?.click()
    })

  const upload = async (file: File) => {
    if (!LOGO_TYPES.includes(file.type)) {
      toast.error('Choose a PNG, JPG or WebP image')
      return
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast.error('The logo must be smaller than 2 MB')
      return
    }
    setBusy('upload')
    try {
      const uploadUrl = await generateUploadUrl({ fileType: file.type, fileName: file.name.slice(-200) })
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!response.ok) throw new Error('Upload failed')
      const { storageId } = (await response.json()) as { storageId: Id<'_storage'> }
      await updateLogo({ storageId })
      toast.success('Logo updated')
    } catch (err) {
      toast.error(errorText(err, 'Could not upload the logo. Please try again.'))
    } finally {
      setBusy(null)
    }
  }

  const remove = () =>
    requireFullAccess('Remove logo', async () => {
      setBusy('remove')
      try {
        await updateLogo({ storageId: null })
        toast.success('Logo removed')
      } catch (err) {
        toast.error(errorText(err, 'Could not remove the logo'))
      } finally {
        setBusy(null)
      }
    })

  return (
    <Panel title="Logo" description="Shown at the top of your dashboard.">
      <div id="logo" className="flex scroll-mt-20 flex-wrap items-center gap-4 p-4 sm:p-5">
        {logoUrl && failedUrl !== logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt="Clinic logo"
            onError={() => setFailedUrl(logoUrl)}
            className="h-16 w-16 shrink-0 rounded-lg border border-neutral-200 bg-white object-cover dark:border-neutral-800"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-500">
            <Building2 className="h-6 w-6" />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={choose} disabled={busy !== null}>
              {busy === 'upload' ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-4 w-4" />
              )}
              {logoUrl ? 'Replace logo' : 'Upload logo'}
            </Button>
            {logoUrl && (
              <Button
                size="sm"
                variant="ghost"
                className="text-neutral-600 hover:text-red-600 dark:text-neutral-300 dark:hover:text-red-400"
                onClick={remove}
                disabled={busy !== null}
              >
                {busy === 'remove' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            PNG, JPG or WebP, up to 2 MB. A square image works best.
          </p>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={LOGO_TYPES.join(',')}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            // Clear it so choosing the same file again still triggers a change
            e.target.value = ''
            if (file) void upload(file)
          }}
        />
      </div>
    </Panel>
  )
}

type Bank = { name: string; code: string; slug: string | null }

/**
 * Connect a bank account as a Paystack subaccount so the clinic's share settles to it directly.
 * Only the owner can connect, change or remove it; team members see which account is connected.
 */
function PayoutSection() {
  const { requireFullAccess, isOwner } = useClinicAccess()
  const account = useQuery(api.clinicBilling.getClinicPayoutAccount, {})
  const listBanks = useAction(api.clinicBilling.listBanks)
  const verifyAccount = useAction(api.clinicBilling.verifyPayoutAccount)
  const connectAccount = useAction(api.clinicBilling.connectPayoutAccount)
  const removeAccount = useAction(api.clinicBilling.removePayoutAccount)

  const [editing, setEditing] = useState(false)
  const [banks, setBanks] = useState<Bank[] | null>(null)
  const [bankError, setBankError] = useState<string | null>(null)
  const [bankAttempt, setBankAttempt] = useState(0)
  const [bankCode, setBankCode] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [resolvedName, setResolvedName] = useState<string | null>(null)
  const [busy, setBusy] = useState<'verify' | 'connect' | 'remove' | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const showForm = isOwner && account !== undefined && (editing || account === null)

  useEffect(() => {
    if (!showForm || banks !== null) return
    let cancelled = false
    listBanks({})
      .then((list) => {
        if (!cancelled) setBanks(list)
      })
      .catch((err) => {
        if (!cancelled) setBankError(errorText(err, 'Could not load the list of banks'))
      })
    return () => {
      cancelled = true
    }
  }, [showForm, banks, bankAttempt, listBanks])

  // Any change to the details invalidates the name we looked up
  useEffect(() => setResolvedName(null), [bankCode, accountNumber])

  const resetForm = () => {
    setEditing(false)
    setBankCode('')
    setAccountNumber('')
    setResolvedName(null)
  }

  const verify = async () => {
    if (!requireFullAccess('Connect bank account')) return
    setBusy('verify')
    try {
      const { accountName } = await verifyAccount({ bankCode, accountNumber })
      setResolvedName(accountName)
    } catch (err) {
      toast.error(errorText(err, 'We could not find that account'))
    } finally {
      setBusy(null)
    }
  }

  const connect = async () => {
    if (!requireFullAccess('Connect bank account')) return
    const bank = banks?.find((b) => b.code === bankCode)
    if (!bank) return
    setBusy('connect')
    try {
      await connectAccount({ bankCode, bankName: bank.name, bankSlug: bank.slug ?? undefined, accountNumber })
      toast.success('Bank account connected')
      resetForm()
    } catch (err) {
      toast.error(errorText(err, 'Could not connect the account'))
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    setBusy('remove')
    try {
      await removeAccount({})
      toast.success('Bank account removed')
      setConfirmRemove(false)
      resetForm()
    } catch (err) {
      toast.error(errorText(err, 'Could not remove the account'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel
      title="Payouts"
      description="Paystack sends your share of each online payment to this account."
      actions={
        account === undefined ? undefined : account ? (
          <StatusBadge tone="green">Connected</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Not connected</StatusBadge>
        )
      }
    >
      <div id="payouts" className="scroll-mt-20 space-y-4 p-4 sm:p-5">
        {account === undefined ? (
          <Skeleton className="h-10 w-full rounded-lg" />
        ) : !showForm && account ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <BankLogo name={account.bankName} slug={account.bankSlug} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{account.accountName}</p>
                <p className="truncate text-sm tabular-nums text-neutral-500 dark:text-neutral-400">
                  {account.bankName} ••{account.accountNumberLast4}
                </p>
              </div>
            </div>
            {isOwner ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => requireFullAccess('Change bank account', () => setEditing(true))}
                >
                  Change account
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-neutral-600 hover:text-red-600 dark:text-neutral-300 dark:hover:text-red-400"
                  onClick={() => requireFullAccess('Remove bank account', () => setConfirmRemove(true))}
                >
                  Remove account
                </Button>
              </div>
            ) : (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Only the clinic owner can change this.</p>
            )}
          </div>
        ) : !isOwner ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No bank account is connected. Only the clinic owner can connect one.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Bank">
                <Select value={bankCode} onValueChange={setBankCode} disabled={!banks}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder={banks ? 'Choose your bank' : bankError ? 'Banks unavailable' : 'Loading banks…'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 max-w-[calc(100vw-2rem)]">
                    {(banks ?? []).map((bank) => (
                      <SelectItem key={bank.code} value={bank.code} className="[&>span:last-child]:min-w-0">
                        <span className="flex min-w-0 items-center gap-2">
                          <BankLogo name={bank.name} slug={bank.slug} size="sm" />
                          <span className="truncate">{bank.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {bankError && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {bankError}.{' '}
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={() => {
                        setBankError(null)
                        setBanks(null)
                        setBankAttempt((n) => n + 1)
                      }}
                    >
                      Try again
                    </button>
                  </p>
                )}
              </Field>
              <Field label="Account number">
                <Input
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10 digits"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                />
              </Field>
            </div>

            {resolvedName ? (
              <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800 sm:flex-row sm:items-center">
                <p className="min-w-0 flex-1 text-sm text-neutral-700 dark:text-neutral-300">
                  Account name: <span className="font-medium text-neutral-900 dark:text-white">{resolvedName}</span>
                </p>
                <Button size="sm" className={primaryButtonClass} onClick={connect} disabled={busy !== null}>
                  {busy === 'connect' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Yes, connect this account
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={verify}
                  disabled={!bankCode || accountNumber.length !== 10 || busy !== null}
                >
                  {busy === 'verify' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Check account
                </Button>
                {account && (
                  <Button size="sm" variant="ghost" onClick={resetForm} disabled={busy !== null}>
                    Cancel
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {account !== undefined && <HowPayoutsWork account={account} />}
      </div>

      <AlertDialog open={confirmRemove} onOpenChange={(open) => !open && busy !== 'remove' && setConfirmRemove(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this bank account?</AlertDialogTitle>
            <AlertDialogDescription>
              Online payments will settle to Rehabify and we&apos;ll transfer your share manually until you connect a
              new account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === 'remove'}>Keep account</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy === 'remove'}
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault()
                void remove()
              }}
            >
              {busy === 'remove' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Remove account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  )
}
