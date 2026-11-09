'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { CreditCard, FileSignature, Loader2, ReceiptText, Users } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  ConfirmDialog,
  EmptyState,
  Panel,
  StatTile,
  StatusBadge,
  dangerButtonClass,
  inputClass,
  primaryButtonClass,
  softButtonClass,
} from '@/components/admin/ui'
import { useClinicPlans } from '@/lib/useClinicPlans'
import { seatsLabel } from '@/lib/clinicPlans'
import { CLINICS_BASE } from '@/components/admin/clinics/shared'
import {
  SUBSCRIPTION_STATUS_LABEL,
  formatKobo,
  type AdminClinicSubscription,
  type ClinicBillingAttentionRow,
  type ClinicPlanKey,
  type ClinicSubscriptionStatus,
} from '@/lib/clinicSubscriptions'
import { cn } from '@/lib/utils'

const subscriptionRef = makeFunctionReference<'query', { clinicId: string }, AdminClinicSubscription>(
  'clinicBilling:adminGetClinicSubscription'
)
type SaveArgs = {
  clinicId: string
  plan: ClinicPlanKey
  billingStartDate: string
  seatLimit?: number
  programmeAllowance?: number
  monthlyFeeNaira?: number
  note?: string
  switchOn?: boolean
}
const saveRef = makeFunctionReference<'mutation', SaveArgs, { subscriptionId: string; switchedOn: boolean }>(
  'clinicBilling:adminSaveClinicSubscription'
)
const switchOffRef = makeFunctionReference<'mutation', { clinicId: string }, { changed: boolean }>(
  'clinicBilling:adminSwitchClinicBillingOff'
)
const markPaidRef = makeFunctionReference<'mutation', { invoiceId: string; note: string }, { success: boolean }>(
  'clinicBilling:adminMarkSubscriptionInvoicePaid'
)
const voidRef = makeFunctionReference<'mutation', { invoiceId: string; reason: string; reissue?: boolean }, { success: boolean }>(
  'clinicBilling:adminVoidSubscriptionInvoice'
)

const errorText = (err: unknown, fallback: string) =>
  err instanceof ConvexError && typeof err.data === 'string' ? err.data : err instanceof Error && err.message ? err.message : fallback

const day = (ms: number | null | undefined) => (typeof ms === 'number' ? format(new Date(ms), 'd MMM yyyy') : '—')

const STATUS_TONE: Record<ClinicSubscriptionStatus, 'neutral' | 'green' | 'amber' | 'red'> = {
  inactive: 'neutral',
  active: 'green',
  past_due: 'amber',
  read_only: 'red',
  cancelled: 'neutral',
}

const isOn = (status: ClinicSubscriptionStatus | undefined) => status === 'active' || status === 'past_due' || status === 'read_only'

type Form = {
  plan: ClinicPlanKey
  startDate: string
  seats: string
  allowance: string
  feeNaira: string
  note: string
}

export function ClinicSubscriptionTab({ clinicId }: { clinicId: string }) {
  // Plans as an admin last set them (Admin › Clinic plans)
  const { plans: CLINIC_PLANS } = useClinicPlans()
  const data = useQuery(subscriptionRef, { clinicId })
  const save = useMutation(saveRef)
  const switchOff = useMutation(switchOffRef)
  const markPaid = useMutation(markPaidRef)
  const voidInvoice = useMutation(voidRef)

  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<'on' | 'off' | null>(null)
  const [payFor, setPayFor] = useState<{ id: string; label: string } | null>(null)
  const [payNote, setPayNote] = useState('')
  const [voidFor, setVoidFor] = useState<{ id: string; label: string } | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [reissue, setReissue] = useState(false)

  // Fill the form once: the saved plan, else the plan signed in the clinic's agreement
  useEffect(() => {
    if (!data || form) return
    const sub = data.subscription
    const plan: ClinicPlanKey = sub?.plan ?? data.agreement?.plan ?? 'starter'
    setForm({
      plan,
      startDate: sub && (isOn(sub.status) || sub.status === 'inactive') ? sub.billingStartDate : data.suggestedStartDate,
      seats: sub?.plan === 'enterprise' ? String(sub.seatLimit) : '',
      allowance: sub?.plan === 'enterprise' ? String(sub.programmeAllowance) : '',
      feeNaira: sub?.plan === 'enterprise' ? String(sub.monthlyFeeKobo / 100) : '',
      note: sub?.note ?? '',
    })
  }, [data, form])

  if (data === undefined || (data && !form)) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    )
  }
  if (data === null || !form) {
    return (
      <Panel>
        <EmptyState icon={<CreditCard />} title="Clinic not found" />
      </Panel>
    )
  }

  const sub = data.subscription
  const on = isOn(sub?.status)
  const started = on && sub?.currentPeriodStart !== null && sub?.currentPeriodStart !== undefined
  const standard = CLINIC_PLANS.find((p) => p.id === form.plan)
  const standardSeats = standard?.seatLimit != null ? seatsLabel(standard.seatLimit) : ''
  const enterprise = form.plan === 'enterprise'
  const seatLimit = enterprise ? Number(form.seats) || 0 : (standard?.seatLimit ?? 0)
  const allowance = enterprise ? Number(form.allowance) || 0 : (standard?.programmeAllowance ?? 0)

  const args = (switchOn?: boolean): SaveArgs => ({
    clinicId,
    plan: form.plan,
    billingStartDate: form.startDate,
    ...(enterprise
      ? { seatLimit: Number(form.seats), programmeAllowance: Number(form.allowance), monthlyFeeNaira: Number(form.feeNaira) }
      : {}),
    note: form.note.trim() || undefined,
    switchOn,
  })

  const doSave = async () => {
    setSaving(true)
    try {
      await save(args())
      toast.success(on ? 'Plan updated' : 'Plan saved. Billing is still off.')
    } catch (err) {
      toast.error(errorText(err, 'Could not save the plan.'))
    } finally {
      setSaving(false)
    }
  }

  const set = (patch: Partial<Form>) => setForm((current) => (current ? { ...current, ...patch } : current))
  const seatsOver = data.usage.seatsUsed > seatLimit && seatLimit > 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Billing"
          value={sub ? SUBSCRIPTION_STATUS_LABEL[sub.status] : 'Not set up'}
          hint={
            sub?.launchWeekFree
              ? `Free for launch week · billing starts ${day(sub.billingStartsAt)}`
              : (sub?.currentPeriodLabel ?? (sub && on ? `Starts ${day(sub.billingStartsAt)}` : 'Clinic works as before'))
          }
          icon={CreditCard}
          tone={sub?.status === 'read_only' || sub?.status === 'past_due' ? 'attention' : 'teal'}
        />
        <StatTile
          label="Clinician seats"
          value={`${data.usage.seatsUsed} of ${sub && on ? sub.seatLimit : seatLimit || '—'}`}
          hint={data.usage.seatsPending ? `${data.usage.seatsPending} invitation${data.usage.seatsPending === 1 ? '' : 's'} waiting` : 'Owner and front desk are free'}
          icon={Users}
          tone={seatsOver ? 'attention' : 'teal'}
        />
        <StatTile
          label="Active programmes"
          value={`${data.usage.activeProgrammes} of ${sub && on ? sub.programmeAllowance : allowance || '—'}`}
          hint="Patients active in the last 30 days"
          icon={ReceiptText}
          tone={sub && on && data.usage.activeProgrammes >= sub.programmeAllowance && sub.programmeAllowance > 0 ? 'attention' : 'teal'}
        />
        <StatTile
          label="Next invoice"
          value={sub?.nextInvoiceAt ? day(sub.nextInvoiceAt) : '—'}
          hint={sub ? `${formatKobo(sub.monthlyFeeKobo)} a month` : undefined}
          icon={FileSignature}
        />
      </div>

      <Panel
        title="Subscription"
        description="Plan from the Clinic Master SaaS Agreement. Nothing changes for the clinic until billing is switched on."
        actions={sub ? <StatusBadge tone={STATUS_TONE[sub.status]}>{SUBSCRIPTION_STATUS_LABEL[sub.status]}</StatusBadge> : undefined}
        bodyClassName="space-y-5 px-5 pb-5 pt-3"
      >
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          {data.agreement
            ? `Agreement signed ${day(data.agreement.signedAt)}${data.agreement.plan ? ` on ${CLINIC_PLANS.find((p) => p.id === data.agreement?.plan)?.name}` : ''}${
                data.agreement.countersigned ? ', countersigned.' : ', waiting for Rehabify’s countersignature.'
              }`
            : 'This clinic hasn’t signed the Clinic Master SaaS Agreement yet.'}
        </p>

        {data.launchWeek && !started && (
          <div className="rounded-xl bg-rh-honeydew px-4 py-3 text-sm text-rh-ink dark:bg-white/[0.06] dark:text-white">
            <span className="font-semibold">Launch week offer:</span> clinics are free from {data.launchWeek.label}. Put the clinic on its
            plan now and switch billing on: the plan works straight away, and the first invoice is on the billing start date
            (16 November at the earliest).
          </div>
        )}

        {sub?.upgradeRequestedPlan && (
          <div className="rounded-xl bg-rh-honeydew px-4 py-3 text-sm text-rh-ink dark:bg-white/[0.06] dark:text-white">
            The clinic asked to move to {CLINIC_PLANS.find((p) => p.id === sub.upgradeRequestedPlan)?.name ?? sub.upgradeRequestedPlan}
            {sub.upgradeRequestedAt ? ` on ${day(sub.upgradeRequestedAt)}` : ''}. Pick the plan below and save.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sub-plan" className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Plan
            </Label>
            <select
              id="sub-plan"
              value={form.plan}
              onChange={(e) => set({ plan: e.target.value as ClinicPlanKey })}
              className={cn(inputClass, 'h-10 w-full border px-3 text-sm')}
            >
              {CLINIC_PLANS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.price}
                  {p.monthlyFeeKobo ? ' a month' : ''}
                  {data.agreement?.plan === p.id ? ' (signed)' : ''}
                </option>
              ))}
            </select>
            {standard && !enterprise && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {standardSeats.charAt(0).toUpperCase() + standardSeats.slice(1)}, {standard.programmeAllowance} patients with Joy recovery support. Excludes VAT.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sub-start" className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Billing starts
            </Label>
            <Input
              id="sub-start"
              type="date"
              value={form.startDate}
              min={started ? undefined : data.earliestStartDate}
              disabled={started}
              onChange={(e) => set({ startDate: e.target.value })}
              className={cn(inputClass, 'h-10')}
            />
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {started
                ? 'Billing has started, so this can’t change.'
                : data.launchWeek
                  ? 'Launch week is free, so the earliest is 16 November. First invoice on this date, then the same day each month.'
                  : 'First invoice on this date, then the same day each month. The 1st keeps it to calendar months.'}
            </p>
          </div>
        </div>

        {enterprise && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {(
              [
                { key: 'feeNaira', label: 'Monthly fee (₦, excl. VAT)', placeholder: '150000' },
                { key: 'seats', label: 'Clinician seats', placeholder: '25' },
                { key: 'allowance', label: 'Programme allowance', placeholder: '300' },
              ] as const
            ).map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`sub-${field.key}`} className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  {field.label}
                </Label>
                <Input
                  id={`sub-${field.key}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={form[field.key]}
                  placeholder={field.placeholder}
                  onChange={(e) => set({ [field.key]: e.target.value } as Partial<Form>)}
                  className={cn(inputClass, 'h-10')}
                />
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="sub-note" className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Note (admins only)
          </Label>
          <Textarea
            id="sub-note"
            value={form.note}
            onChange={(e) => set({ note: e.target.value })}
            maxLength={500}
            rows={2}
            placeholder="e.g. Enterprise terms agreed by email on 3 November"
            className={cn(inputClass, 'resize-none')}
          />
        </div>

        {seatsOver && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            The clinic has {data.usage.seatsUsed} clinicians, more than this plan&apos;s {seatLimit}. Nobody is removed; they just can&apos;t add more.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-black/[0.05] pt-4 dark:border-white/[0.06]">
          <Button variant="outline" className={softButtonClass} onClick={doSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {sub ? 'Save changes' : 'Save plan'}
          </Button>
          {on ? (
            <Button className={dangerButtonClass} onClick={() => setConfirm('off')}>
              Switch billing off
            </Button>
          ) : (
            <Button className={primaryButtonClass} onClick={() => setConfirm('on')}>
              Switch billing on
            </Button>
          )}
          {on && <p className="text-xs text-neutral-500 dark:text-neutral-400">Plan changes apply to seats and the allowance now. A higher fee is charged pro rata for the rest of this period, on the next invoice; a lower fee starts with the next invoice.</p>}
        </div>
      </Panel>

      <Panel title="Invoices" description="Rehabify’s invoices to this clinic. Payable within 7 days.">
        {data.invoices.length === 0 ? (
          <EmptyState icon={<ReceiptText />} title="No invoices yet" description="The first one is issued on the billing start date." />
        ) : (
          <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
            {data.invoices.map((inv) => (
              <li key={inv._id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-rh-ink dark:text-white">{inv.number}</p>
                    <StatusBadge tone={inv.status === 'paid' ? 'green' : inv.status === 'void' ? 'neutral' : inv.overdue ? 'red' : 'amber'}>
                      {inv.status === 'paid' ? 'Paid' : inv.status === 'void' ? 'Void' : inv.overdue ? 'Overdue' : 'Open'}
                    </StatusBadge>
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {inv.periodLabel} · issued {day(inv.issuedAt)} · due {day(inv.dueAt)}
                    {inv.noticeSentAt ? ` · notice sent ${day(inv.noticeSentAt)}` : ''}
                    {inv.readOnlyFrom && inv.status === 'open' ? ` · read-only from ${day(inv.readOnlyFrom)}` : ''}
                  </p>
                  {inv.lines.map((line, i) => (
                    <p key={i} className="text-xs text-neutral-500 dark:text-neutral-400">
                      {line.label} · {formatKobo(line.amountKobo)}
                    </p>
                  ))}
                  {inv.status === 'paid' && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      Paid {day(inv.paidAt)} {inv.paymentMethod === 'bank_transfer' ? 'by bank transfer' : 'through Paystack'}
                      {inv.paymentNote ? ` · ${inv.paymentNote}` : ''}
                      {inv.receiptUrl ? (
                        <>
                          {' · '}
                          <a href={inv.receiptUrl} target="_blank" rel="noreferrer" className="font-medium text-rh-ink hover:underline dark:text-rh-lime">
                            {inv.receiptNumber ?? 'Receipt'}
                          </a>
                        </>
                      ) : null}
                    </p>
                  )}
                  {inv.status === 'void' && inv.voidReason && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Voided: {inv.voidReason}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <p className="text-sm font-semibold tabular-nums text-rh-ink dark:text-white">{formatKobo(inv.amountKobo)}</p>
                  {inv.status === 'open' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className={softButtonClass}
                        onClick={() => {
                          setPayNote('')
                          setPayFor({ id: inv._id, label: `${inv.number} · ${formatKobo(inv.amountKobo)}` })
                        }}
                      >
                        Mark paid
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-xl text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-400/10"
                        onClick={() => {
                          setVoidReason('')
                          setReissue(false)
                          setVoidFor({ id: inv._id, label: inv.number })
                        }}
                      >
                        Void
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ConfirmDialog
        open={confirm === 'on'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Switch billing on?"
        description={`The clinic goes on ${CLINIC_PLANS.find((p) => p.id === form.plan)?.name ?? 'this plan'} with ${seatLimit > 0 ? seatsLabel(seatLimit) : 'its clinician seats'}.${
          data.launchWeek ? ` It's free for launch week (${data.launchWeek.label}).` : ''
        } The first invoice is issued on ${
          form.startDate ? format(new Date(`${form.startDate}T00:00:00`), 'd MMM yyyy') : 'the start date'
        } and the owner is emailed now.`}
        confirmLabel="Switch billing on"
        onConfirm={async () => {
          try {
            await save(args(true))
            toast.success('Billing is on')
          } catch (err) {
            toast.error(errorText(err, 'Could not switch billing on.'))
            throw err
          }
        }}
      />

      <ConfirmDialog
        open={confirm === 'off'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Switch billing off?"
        description="No more invoices are issued, seat limits stop and read-only lifts. Open invoices stay payable; void them if they're not owed."
        confirmLabel="Switch billing off"
        destructive
        onConfirm={async () => {
          try {
            await switchOff({ clinicId })
            toast.success('Billing is off')
          } catch (err) {
            toast.error(errorText(err, 'Could not switch billing off.'))
            throw err
          }
        }}
      />

      <ConfirmDialog
        open={payFor !== null}
        onOpenChange={(open) => !open && setPayFor(null)}
        title={`Mark ${payFor?.label ?? 'invoice'} as paid?`}
        description="For a bank transfer to Rehabify. The clinic gets a receipt, and read-only lifts if nothing else is overdue."
        confirmLabel="Mark paid"
        onConfirm={async () => {
          if (!payFor) return
          try {
            await markPaid({ invoiceId: payFor.id, note: payNote })
            toast.success('Invoice marked as paid')
          } catch (err) {
            toast.error(errorText(err, 'Could not mark it as paid.'))
            throw err
          }
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="pay-note" className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Note
          </Label>
          <Input
            id="pay-note"
            value={payNote}
            onChange={(e) => setPayNote(e.target.value)}
            maxLength={300}
            placeholder="e.g. GTBank transfer, ref 0012345678, 4 Nov"
            className={inputClass}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={voidFor !== null}
        onOpenChange={(open) => !open && setVoidFor(null)}
        title={`Void ${voidFor?.label ?? 'invoice'}?`}
        description="The clinic no longer owes it. If it was the overdue one, past due or read-only lifts."
        confirmLabel="Void invoice"
        destructive
        onConfirm={async () => {
          if (!voidFor) return
          try {
            await voidInvoice({ invoiceId: voidFor.id, reason: voidReason, reissue })
            toast.success(reissue ? 'Invoice voided and reissued' : 'Invoice voided')
          } catch (err) {
            toast.error(errorText(err, 'Could not void the invoice.'))
            throw err
          }
        }}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="void-reason" className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Reason
            </Label>
            <Input
              id="void-reason"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              maxLength={300}
              placeholder="e.g. Wrong plan"
              className={inputClass}
            />
          </div>
          <label className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <Checkbox checked={reissue} onCheckedChange={(checked) => setReissue(checked === true)} className="mt-0.5" />
            Issue a corrected invoice for the same period at the current plan fee
          </label>
        </div>
      </ConfirmDialog>
    </div>
  )
}

const attentionRef = makeFunctionReference<'query', Record<string, never>, ClinicBillingAttentionRow[]>(
  'clinicBilling:adminClinicBillingAttention'
)

/** Clinics behind on Rehabify's invoices (for the clinics list). Nothing shows when none are. */
export function ClinicBillingAttentionPanel() {
  const rows = useQuery(attentionRef, {})
  if (!rows || rows.length === 0) return null
  return (
    <Panel title="Unpaid subscriptions" description="Clinics with an overdue Rehabify invoice. Open one to see its invoices.">
      <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
        {rows.map((row) => (
          <li key={row.clinicId}>
            <Link
              href={`${CLINICS_BASE}/${row.clinicId}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 transition-colors hover:bg-rh-canvas dark:hover:bg-white/[0.03]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-rh-ink dark:text-white">{row.clinicName}</p>
                  <StatusBadge tone={row.status === 'read_only' ? 'red' : 'amber'}>{SUBSCRIPTION_STATUS_LABEL[row.status]}</StatusBadge>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {row.planName} · {row.openInvoices} open invoice{row.openInvoices === 1 ? '' : 's'}
                  {row.oldestDueAt ? ` · oldest due ${day(row.oldestDueAt)}` : ''}
                  {row.status === 'read_only' && row.readOnlySince ? ` · read-only since ${day(row.readOnlySince)}` : ''}
                  {row.status === 'past_due' && row.readOnlyFrom ? ` · read-only from ${day(row.readOnlyFrom)}` : ''}
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums text-rh-ink dark:text-white">{formatKobo(row.owedKobo)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
