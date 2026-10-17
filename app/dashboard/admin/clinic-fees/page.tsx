'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { format } from 'date-fns'
import { Building2, Loader2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import {
  DEFAULT_CLINIC_FEE_CONFIG,
  clinicPaymentSplit,
  normalizeClinicFeeConfig,
  type ClinicFeeConfig,
} from '@/convex/clinicFees'
import { FeeBreakdown } from '@/components/clinic/FeeBreakdown'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AdminPage,
  ConfirmDialog,
  PageHeader,
  Panel,
  inputClass,
  primaryButtonClass,
  softButtonClass,
  tableWrapClass,
} from '@/components/admin/ui'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

/** The form works in naira and percent; the backend stores kobo. */
type FormValues = {
  clinicSharePercent: string
  paystackPercent: string
  paystackFlatNaira: string
  paystackFlatWaivedBelowNaira: string
  paystackFeeCapNaira: string
  stampDutyNaira: string
  stampDutyFromNaira: string
}

const toForm = (config: ClinicFeeConfig): FormValues => ({
  clinicSharePercent: String(config.clinicSharePercent),
  paystackPercent: String(config.paystackPercent),
  paystackFlatNaira: String(config.paystackFlatKobo / 100),
  paystackFlatWaivedBelowNaira: String(config.paystackFlatWaivedBelowKobo / 100),
  paystackFeeCapNaira: String(config.paystackFeeCapKobo / 100),
  stampDutyNaira: String(config.stampDutyKobo / 100),
  stampDutyFromNaira: String(config.stampDutyFromKobo / 100),
})

const num = (value: string) => Number(value.replace(/,/g, '').trim())

const toConfig = (form: FormValues): ClinicFeeConfig =>
  normalizeClinicFeeConfig({
    clinicSharePercent: num(form.clinicSharePercent),
    paystackPercent: num(form.paystackPercent),
    paystackFlatKobo: Math.round(num(form.paystackFlatNaira) * 100),
    paystackFlatWaivedBelowKobo: Math.round(num(form.paystackFlatWaivedBelowNaira) * 100),
    paystackFeeCapKobo: Math.round(num(form.paystackFeeCapNaira) * 100),
    stampDutyKobo: Math.round(num(form.stampDutyNaira) * 100),
    stampDutyFromKobo: Math.round(num(form.stampDutyFromNaira) * 100),
  })

const naira = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

const EXAMPLE_AMOUNTS = [5_000, 10_000, 20_000, 50_000, 150_000]

const errorText = (err: unknown, fallback: string) =>
  err instanceof ConvexError && typeof err.data === 'string' ? err.data : fallback

export default function AdminClinicFeesPage() {
  const settings = useQuery(api.clinicFeeSettings.getClinicFeeSettings)
  const updateSettings = useMutation(api.clinicFeeSettings.updateClinicFeeSettings)
  const resetSettings = useMutation(api.clinicFeeSettings.resetClinicFeeSettings)

  const [form, setForm] = useState<FormValues | null>(null)
  const [previewAmount, setPreviewAmount] = useState('20000')
  const [saving, setSaving] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  // Load the saved numbers once (don't overwrite what the admin is typing on live updates)
  useEffect(() => {
    if (settings && form === null) setForm(toForm(normalizeClinicFeeConfig(settings)))
  }, [settings, form])

  const draft = useMemo(() => (form ? toConfig(form) : DEFAULT_CLINIC_FEE_CONFIG), [form])
  const saved = settings ? normalizeClinicFeeConfig(settings) : null
  const changed = Boolean(form && saved && JSON.stringify(draft) !== JSON.stringify(saved))

  const formErrors = form
    ? [
        !(num(form.clinicSharePercent) >= 0 && num(form.clinicSharePercent) <= 100) && 'Clinic share must be between 0 and 100%.',
        !(num(form.paystackPercent) >= 0 && num(form.paystackPercent) <= 20) && 'Paystack percentage must be between 0 and 20%.',
        !(num(form.paystackFeeCapNaira) > 0) && 'Paystack fee cap must be more than ₦0.',
        [form.paystackFlatNaira, form.paystackFlatWaivedBelowNaira, form.stampDutyNaira, form.stampDutyFromNaira].some(
          (value) => !(num(value) >= 0)
        ) && 'Amounts must be ₦0 or more.',
      ].filter(Boolean) as string[]
    : []

  const set = (key: keyof FormValues) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => (prev ? { ...prev, [key]: event.target.value } : prev))

  const handleSave = async () => {
    if (!form || formErrors.length) return
    setSaving(true)
    try {
      await updateSettings(draft)
      playSound('success')
      toast.success('Clinic fees updated. New payment requests use them straight away.')
    } catch (err) {
      playSound('error')
      toast.error(errorText(err, 'Could not save the fees. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  // Throwing keeps the dialog open (ConfirmDialog plays the error sound)
  const handleReset = async () => {
    setSaving(true)
    try {
      await resetSettings({})
      setForm(toForm(DEFAULT_CLINIC_FEE_CONFIG))
      playSound('success')
      toast.success('Reset to Paystack standard rates and an 80/20 split.')
    } catch (err) {
      toast.error(errorText(err, 'Could not reset the fees. Please try again.'))
      throw err
    } finally {
      setSaving(false)
    }
  }

  if (!settings || !form) {
    return (
      <AdminPage className="max-w-5xl">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20 rounded-lg" />
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-4 w-full max-w-lg rounded-lg" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
          <div className="space-y-6 lg:col-span-2">
            <Skeleton className="h-56 rounded-2xl" />
            <Skeleton className="h-56 rounded-2xl" />
          </div>
        </div>
      </AdminPage>
    )
  }

  const rehabifyPercent = Math.round((100 - draft.clinicSharePercent) * 100) / 100
  const previewNaira = Math.max(0, num(previewAmount) || 0)

  return (
    <AdminPage className="max-w-5xl">
      <PageHeader
        eyebrow="Clinics"
        title="Clinic fees"
        description={
          <>
            How clinic payments made online are shared. Clinics see changes in their payment form immediately; invoices
            already sent keep their amounts.
            <span className="mt-1 block text-xs text-neutral-400 dark:text-neutral-500">
              {settings.isCustom && settings.updatedAt
                ? `Last changed ${format(new Date(settings.updatedAt), 'd MMM yyyy, HH:mm')}${settings.updatedBy ? ` by ${settings.updatedBy}` : ''}`
                : 'Using the default numbers'}
            </span>
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm" className={softButtonClass}>
              <Link href="/dashboard/admin/clinics">
                <Building2 className="mr-1.5 h-4 w-4" />
                All clinics
              </Link>
            </Button>
            <Button variant="outline" size="sm" className={softButtonClass} onClick={() => setResetOpen(true)} disabled={saving}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Reset to defaults
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !changed || formErrors.length > 0} className={primaryButtonClass}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Save changes
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Panel title="Split" description="Shared after Paystack's fee is taken off." bodyClassName="grid grid-cols-1 gap-4 p-5 pt-3 sm:grid-cols-2">
            <Field label="Clinic share (%)" hint={`Rehabify gets ${rehabifyPercent}%`}>
              <Input inputMode="decimal" value={form.clinicSharePercent} onChange={set('clinicSharePercent')} className={inputClass} />
            </Field>
          </Panel>

          <Panel
            title="Paystack card fee"
            description="Taken off the payment before the split. Rehabify's account pays it to Paystack."
            bodyClassName="grid grid-cols-1 gap-4 p-5 pt-3 sm:grid-cols-2"
          >
            <Field label="Percentage (%)">
              <Input inputMode="decimal" value={form.paystackPercent} onChange={set('paystackPercent')} className={inputClass} />
            </Field>
            <Field label="Flat fee (₦)">
              <Input inputMode="decimal" value={form.paystackFlatNaira} onChange={set('paystackFlatNaira')} className={inputClass} />
            </Field>
            <Field label="No flat fee below (₦)" hint="Set 0 to always charge it">
              <Input
                inputMode="decimal"
                value={form.paystackFlatWaivedBelowNaira}
                onChange={set('paystackFlatWaivedBelowNaira')}
                className={inputClass}
              />
            </Field>
            <Field label="Fee cap (₦)">
              <Input inputMode="decimal" value={form.paystackFeeCapNaira} onChange={set('paystackFeeCapNaira')} className={inputClass} />
            </Field>
          </Panel>

          <Panel
            title="Stamp duty"
            description="Charged on the payout to the clinic's bank and taken from the clinic's share."
            bodyClassName="grid grid-cols-1 gap-4 p-5 pt-3 sm:grid-cols-2"
          >
            <Field label="Amount (₦)" hint="Set 0 to turn it off">
              <Input inputMode="decimal" value={form.stampDutyNaira} onChange={set('stampDutyNaira')} className={inputClass} />
            </Field>
            <Field label="On payouts from (₦)">
              <Input inputMode="decimal" value={form.stampDutyFromNaira} onChange={set('stampDutyFromNaira')} className={inputClass} />
            </Field>
          </Panel>

          {formErrors.length > 0 && (
            <ul className="space-y-1 rounded-2xl border border-rose-200 bg-rh-blush/60 px-4 py-3 text-sm text-[#be123c] dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">
              {formErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Panel
            title="What the clinic sees"
            description={`The breakdown in the clinic's payment form${changed ? ', with your unsaved changes' : ''}.`}
            bodyClassName="space-y-3 p-5 pt-3"
          >
            <Field label="Patient pays (₦)">
              <Input inputMode="decimal" value={previewAmount} onChange={(e) => setPreviewAmount(e.target.value)} className={inputClass} />
            </Field>
            <FeeBreakdown amountNaira={previewNaira} config={draft} className="text-sm" />
          </Panel>

          <Panel title="Examples" bodyClassName={cn(tableWrapClass, 'pt-2')}>
            <Table className="text-xs tabular-nums">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-9 pl-5">Paid</TableHead>
                  <TableHead className="h-9 px-2 text-right">Paystack</TableHead>
                  <TableHead className="h-9 px-2 text-right">Rehabify</TableHead>
                  <TableHead className="h-9 px-2 text-right">Stamp</TableHead>
                  <TableHead className="h-9 pr-5 text-right">Clinic gets</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {EXAMPLE_AMOUNTS.map((amount) => {
                  const split = clinicPaymentSplit(amount * 100, draft)
                  return (
                    <TableRow key={amount}>
                      <TableCell className="py-2 pl-5 text-rh-night dark:text-white">{naira(split.totalKobo)}</TableCell>
                      <TableCell className="px-2 py-2 text-right text-neutral-600 dark:text-neutral-300">{naira(split.paystackFeeKobo)}</TableCell>
                      <TableCell className="px-2 py-2 text-right text-neutral-600 dark:text-neutral-300">{naira(split.rehabifyKobo)}</TableCell>
                      <TableCell className="px-2 py-2 text-right text-neutral-600 dark:text-neutral-300">{naira(split.stampDutyKobo)}</TableCell>
                      <TableCell className="py-2 pr-5 text-right font-medium text-rh-night dark:text-white">{naira(split.clinicKobo)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset clinic fees?"
        description="This goes back to Paystack's standard rates (1.5% + ₦100, capped at ₦2,000), ₦50 stamp duty on payouts of ₦10,000 or more, and an 80/20 split. Existing invoices keep their amounts."
        confirmLabel="Reset"
        onConfirm={handleReset}
      />
    </AdminPage>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{label}</Label>
      {children}
      {hint && <p className="text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>}
    </div>
  )
}
