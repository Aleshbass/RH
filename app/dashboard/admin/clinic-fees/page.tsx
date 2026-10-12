'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { format } from 'date-fns'
import { Loader2, RotateCcw } from 'lucide-react'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
      toast.success('Clinic fees updated. New payment requests use them straight away.')
    } catch (err) {
      toast.error(errorText(err, 'Could not save the fees. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setSaving(true)
    try {
      await resetSettings({})
      setForm(toForm(DEFAULT_CLINIC_FEE_CONFIG))
      toast.success('Reset to Paystack standard rates and an 80/20 split.')
    } catch (err) {
      toast.error(errorText(err, 'Could not reset the fees. Please try again.'))
    } finally {
      setSaving(false)
      setResetOpen(false)
    }
  }

  if (!settings || !form) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#005b57]" />
      </div>
    )
  }

  const rehabifyPercent = Math.round((100 - draft.clinicSharePercent) * 100) / 100
  const previewNaira = Math.max(0, num(previewAmount) || 0)

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 pt-6 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Clinic fees</h1>
          <p className="mt-1 text-sm text-gray-500">
            How clinic payments made online are shared. Clinics see changes in their payment form immediately;
            invoices already sent keep their amounts.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {settings.isCustom && settings.updatedAt
              ? `Last changed ${format(new Date(settings.updatedAt), 'd MMM yyyy, HH:mm')}${settings.updatedBy ? ` by ${settings.updatedBy}` : ''}`
              : 'Using the default numbers'}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => setResetOpen(true)} disabled={saving}>
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Reset to defaults
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !changed || formErrors.length > 0}
            className="bg-[#005b57] text-white hover:bg-[#00443e]"
          >
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Save changes
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Split</CardTitle>
              <CardDescription>Shared after Paystack&apos;s fee is taken off.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Clinic share (%)" hint={`Rehabify gets ${rehabifyPercent}%`}>
                <Input inputMode="decimal" value={form.clinicSharePercent} onChange={set('clinicSharePercent')} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Paystack card fee</CardTitle>
              <CardDescription>Taken off the payment before the split. Rehabify&apos;s account pays it to Paystack.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Percentage (%)">
                <Input inputMode="decimal" value={form.paystackPercent} onChange={set('paystackPercent')} />
              </Field>
              <Field label="Flat fee (₦)">
                <Input inputMode="decimal" value={form.paystackFlatNaira} onChange={set('paystackFlatNaira')} />
              </Field>
              <Field label="No flat fee below (₦)" hint="Set 0 to always charge it">
                <Input
                  inputMode="decimal"
                  value={form.paystackFlatWaivedBelowNaira}
                  onChange={set('paystackFlatWaivedBelowNaira')}
                />
              </Field>
              <Field label="Fee cap (₦)">
                <Input inputMode="decimal" value={form.paystackFeeCapNaira} onChange={set('paystackFeeCapNaira')} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stamp duty</CardTitle>
              <CardDescription>Charged on the payout to the clinic&apos;s bank and taken from the clinic&apos;s share.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Amount (₦)" hint="Set 0 to turn it off">
                <Input inputMode="decimal" value={form.stampDutyNaira} onChange={set('stampDutyNaira')} />
              </Field>
              <Field label="On payouts from (₦)">
                <Input inputMode="decimal" value={form.stampDutyFromNaira} onChange={set('stampDutyFromNaira')} />
              </Field>
            </CardContent>
          </Card>

          {formErrors.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">What the clinic sees</CardTitle>
              <CardDescription>The breakdown in the clinic&apos;s payment form{changed ? ', with your unsaved changes' : ''}.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Patient pays (₦)">
                <Input inputMode="decimal" value={previewAmount} onChange={(e) => setPreviewAmount(e.target.value)} />
              </Field>
              <FeeBreakdown amountNaira={previewNaira} config={draft} className="text-sm" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Examples</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="px-4 py-2 font-medium">Paid</th>
                    <th className="px-2 py-2 text-right font-medium">Paystack</th>
                    <th className="px-2 py-2 text-right font-medium">Rehabify</th>
                    <th className="px-2 py-2 text-right font-medium">Stamp</th>
                    <th className="px-4 py-2 text-right font-medium">Clinic gets</th>
                  </tr>
                </thead>
                <tbody>
                  {EXAMPLE_AMOUNTS.map((amount) => {
                    const split = clinicPaymentSplit(amount * 100, draft)
                    return (
                      <tr key={amount} className="border-b last:border-0">
                        <td className="px-4 py-2">{naira(split.totalKobo)}</td>
                        <td className="px-2 py-2 text-right">{naira(split.paystackFeeKobo)}</td>
                        <td className="px-2 py-2 text-right">{naira(split.rehabifyKobo)}</td>
                        <td className="px-2 py-2 text-right">{naira(split.stampDutyKobo)}</td>
                        <td className="px-4 py-2 text-right font-medium text-gray-900">{naira(split.clinicKobo)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={resetOpen} onOpenChange={(open) => !saving && setResetOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset clinic fees?</AlertDialogTitle>
            <AlertDialogDescription>
              This goes back to Paystack&apos;s standard rates (1.5% + ₦100, capped at ₦2,000), ₦50 stamp duty on
              payouts of ₦10,000 or more, and an 80/20 split. Existing invoices keep their amounts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} disabled={saving} className="bg-[#005b57] hover:bg-[#00443e]">
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-gray-700">{label}</Label>
      {children}
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  )
}
