'use client'

import { useEffect, useRef, useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useClinicPreview } from '@/components/clinic/ClinicPreviewContext'
import { PageShell, Panel, StatusBadge, formatNaira, primaryButtonClass } from '@/components/clinic/ui'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
type Day = (typeof DAYS)[number]
type Hours = Record<Day, { open: string; close: string; active: boolean }>
type PriceItem = { name: string; priceNaira: string; durationMinutes: string }

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
  workingHours: Hours
  priceList: PriceItem[]
}

const approvalBadge: Record<string, { label: string; tone: 'green' | 'amber' | 'red' | 'neutral' }> = {
  approved: { label: 'Verified', tone: 'green' },
  pending_review: { label: 'Under review', tone: 'amber' },
  declined: { label: 'Not approved', tone: 'red' },
  not_submitted: { label: 'Not submitted', tone: 'neutral' },
  preview: { label: 'Preview', tone: 'neutral' },
}

export default function ClinicSettingsPage() {
  const { requireFullAccess } = useClinicPreview()
  const setup = useQuery(api.clinicTools.getClinicSetupDetails, {})
  const updateSetup = useMutation(api.clinicTools.updateClinicSetupDetails)

  const [form, setForm] = useState<FormState | null>(null)
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

  if (setup === undefined || form === null) {
    return (
      <PageShell title="Clinic settings">
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
        workingHours: form.workingHours,
        priceList: form.priceList
          .filter((item) => item.name.trim())
          .map((item) => ({
            name: item.name.trim(),
            priceNaira: Number(item.priceNaira),
            durationMinutes: Number(item.durationMinutes) > 0 ? Number(item.durationMinutes) : undefined,
          })),
      })
      toast.success('Saved')
    } catch (err: any) {
      toast.error(err?.message || 'Could not save your changes')
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
                ? 'Your application was not approved. Contact support@rehabify.ng to update your documents.'
                : 'Finish clinic setup to submit your documents for verification.'}
        </p>
      </Panel>

      <Panel title="Clinic details" actions={saveButton('details')}>
        <div id="details" className="grid scroll-mt-20 grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
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
                  <span className="text-sm text-neutral-400">Closed</span>
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
            <p className="text-sm text-neutral-500">No services yet. Add what you charge for, e.g. "Initial assessment".</p>
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
                className="h-9 w-9 self-end p-0 text-neutral-400 hover:text-red-600"
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

      <PayoutSection disabled={setup.approvalStatus === 'preview'} />
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
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  )
}

/**
 * Connect a bank account as a Paystack subaccount so the clinic's share settles to it directly.
 */
function PayoutSection({ disabled }: { disabled: boolean }) {
  const { requireFullAccess } = useClinicPreview()
  const account = useQuery(api.clinicBilling.getClinicPayoutAccount, {})
  const listBanks = useAction(api.clinicBilling.listBanks)
  const verifyAccount = useAction(api.clinicBilling.verifyPayoutAccount)
  const connectAccount = useAction(api.clinicBilling.connectPayoutAccount)

  const [editing, setEditing] = useState(false)
  const [banks, setBanks] = useState<{ name: string; code: string }[] | null>(null)
  const [bankError, setBankError] = useState<string | null>(null)
  const [bankCode, setBankCode] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [resolvedName, setResolvedName] = useState<string | null>(null)
  const [busy, setBusy] = useState<'verify' | 'connect' | null>(null)

  const showForm = editing || account === null

  useEffect(() => {
    if (!showForm || banks !== null || disabled) return
    listBanks({})
      .then(setBanks)
      .catch((err: any) => setBankError(err?.message || 'Could not load banks'))
  }, [showForm, banks, disabled, listBanks])

  // Any change to the details invalidates the name we looked up
  useEffect(() => setResolvedName(null), [bankCode, accountNumber])

  const verify = async () => {
    if (!requireFullAccess('Connect bank account')) return
    setBusy('verify')
    try {
      const { accountName } = await verifyAccount({ bankCode, accountNumber })
      setResolvedName(accountName)
    } catch (err: any) {
      toast.error(err?.message || 'We could not find that account')
    } finally {
      setBusy(null)
    }
  }

  const connect = async () => {
    const bank = banks?.find((b) => b.code === bankCode)
    if (!bank) return
    setBusy('connect')
    try {
      await connectAccount({ bankCode, bankName: bank.name, accountNumber })
      toast.success('Bank account connected')
      setEditing(false)
      setBankCode('')
      setAccountNumber('')
    } catch (err: any) {
      toast.error(err?.message || 'Could not connect the account')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel
      title="Payouts"
      description="Paystack sends your share of each payment to this account."
      actions={
        account && !editing ? (
          <Button size="sm" variant="outline" onClick={() => requireFullAccess('Change bank account', () => setEditing(true))}>
            Change
          </Button>
        ) : undefined
      }
    >
      <div id="payouts" className="scroll-mt-20 p-4 sm:p-5">
        {account === undefined ? (
          <Skeleton className="h-10 w-full rounded-lg" />
        ) : !showForm && account ? (
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{account.accountName}</p>
              <p className="text-sm text-neutral-500">
                {account.bankName} ••{account.accountNumberLast4}
              </p>
            </div>
          </div>
        ) : disabled ? (
          <p className="text-sm text-neutral-500">Finish clinic setup to connect a bank account.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Bank">
                <Select value={bankCode} onValueChange={setBankCode} disabled={!banks}>
                  <SelectTrigger>
                    <SelectValue placeholder={banks ? 'Choose your bank' : bankError ? 'Banks unavailable' : 'Loading banks…'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {(banks ?? []).map((bank) => (
                      <SelectItem key={bank.code} value={bank.code}>
                        {bank.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {bankError && <p className="mt-1 text-xs text-red-600">{bankError}</p>}
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
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                )}
              </div>
            )}
            <p className="text-xs text-neutral-500">
              Rehabify keeps 10% of each online payment ({formatNaira(1500)} on a {formatNaira(15000)} session) and pays
              Paystack&apos;s fees. The rest settles to this account on Paystack&apos;s normal schedule.
            </p>
          </div>
        )}
      </div>
    </Panel>
  )
}
