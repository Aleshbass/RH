'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { Building2, Check, Loader2, MapPin, Monitor, Search, Stethoscope } from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { inputClass, primaryButtonClass, softButtonClass, StatusBadge } from '@/components/admin/ui'
import {
  Callout,
  dialogClass,
  dialogTitleClass,
  errorMessage,
  formatKobo,
  hintClass,
  insetClass,
  labelClass,
  selectContentClass,
  textareaClass,
} from '@/components/admin/partners/shared'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

export type ReferralRow = FunctionReturnType<typeof api.adminReferrals.getInboundReferrals>['referrals'][number]
export type ReferralStatus = ReferralRow['status']

export type ReferralStage = 'new' | 'contacted' | 'booked' | 'in_treatment' | 'completed' | 'closed'

/** Mirrors REFERRAL_STAGES in convex/adminReferrals.ts. */
export const STAGES: { value: ReferralStage; label: string; statuses: ReferralStatus[] }[] = [
  { value: 'new', label: 'New', statuses: ['received', 'pending', 'consent_pending'] },
  { value: 'contacted', label: 'Contacted', statuses: ['contacted', 'intake_started', 'intake_completed', 'qualified'] },
  { value: 'booked', label: 'Booked', statuses: ['booked', 'attended'] },
  { value: 'in_treatment', label: 'In treatment', statuses: ['treatment_active', 'in_treatment'] },
  { value: 'completed', label: 'Completed', statuses: ['completed', 'paid_out'] },
  { value: 'closed', label: 'Closed', statuses: ['closed', 'cancelled', 'not_suitable', 'redirected_for_safety', 'refunded'] },
]

export const STATUS_LABEL: Record<ReferralStatus, string> = {
  received: 'Received',
  consent_pending: 'Consent pending',
  contacted: 'Contacted',
  intake_started: 'Intake started',
  intake_completed: 'Intake completed',
  qualified: 'Qualified',
  redirected_for_safety: 'Redirected for safety',
  booked: 'Booked',
  attended: 'Attended',
  treatment_active: 'In treatment',
  completed: 'Completed',
  cancelled: 'Cancelled',
  not_suitable: 'Not suitable',
  refunded: 'Refunded',
  closed: 'Closed',
  pending: 'Pending',
  in_treatment: 'In treatment',
  paid_out: 'Paid out',
}

const LEGACY_STATUSES: ReferralStatus[] = ['pending', 'in_treatment', 'paid_out']

export function statusTone(status: ReferralStatus): 'neutral' | 'teal' | 'green' | 'amber' | 'red' {
  if (status === 'cancelled' || status === 'not_suitable' || status === 'refunded' || status === 'redirected_for_safety') return 'red'
  const stage = STAGES.find((s) => s.statuses.includes(status))?.value
  if (stage === 'new') return 'amber'
  if (stage === 'completed' || stage === 'in_treatment') return 'green'
  if (stage === 'closed') return 'neutral'
  return 'teal'
}

type Physio = { id: Id<'users'>; name: string; email: string; location: string; offersOnline: boolean; offersInPerson: boolean }
type RoutableClinic = { _id: Id<'clinics'>; name: string; city: string }
type RouteMode = 'clinic' | 'physio'

export function ReferralManageDialog({ referral, onClose }: { referral: ReferralRow | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={!!referral} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className={`${dialogClass} max-h-[90vh] overflow-y-auto sm:max-w-[560px]`}>
        {referral && <ManageForm key={referral._id} referral={referral} onClose={onClose} onBusyChange={setBusy} />}
      </DialogContent>
    </Dialog>
  )
}

function ManageForm({ referral, onClose, onBusyChange }: { referral: ReferralRow; onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  const updateReferral = useMutation(api.adminReferrals.updateReferralStatus)
  const assignClinic = useMutation(api.adminReferrals.assignReferralToClinic)
  const assignPhysio = useMutation(api.adminReferrals.assignPhysiotherapistToReferral)
  const clinics = useQuery(api.adminReferrals.listClinicsForReferralRouting)
  const physiosRaw = useQuery(api.admin.marketplaceBookings.adminGetAllPhysiosForSelect)
  const physios = useMemo(() => ((physiosRaw ?? []) as (Physio | null)[]).filter((p): p is Physio => p !== null), [physiosRaw])

  const [status, setStatus] = useState<ReferralStatus>(referral.status)
  const [commission, setCommission] = useState(referral.commissionEarned ? String(referral.commissionEarned / 100) : '')
  const [notes, setNotes] = useState('')
  const [mode, setMode] = useState<RouteMode>(!referral.assignedClinicId && referral.assignedPhysiotherapistId ? 'physio' : 'clinic')
  const [clinicId, setClinicId] = useState<string>(referral.assignedClinicId ?? 'none')
  const [physioId, setPhysioId] = useState<Id<'users'> | null>(referral.assignedPhysiotherapistId ?? null)
  const [physioSearch, setPhysioSearch] = useState('')
  const [saving, setSavingState] = useState(false)
  const setSaving = (value: boolean) => {
    setSavingState(value)
    onBusyChange(value)
  }

  const showCommission = status === 'completed' || status === 'paid_out'
  const isSandbox = referral.environment === 'sandbox'

  const filteredPhysios = useMemo(() => {
    const q = physioSearch.trim().toLowerCase()
    const rows = q
      ? physios.filter((p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.location.toLowerCase().includes(q))
      : physios
    return rows.slice(0, 50)
  }, [physios, physioSearch])

  const save = async () => {
    const parsed = commission.trim() ? parseFloat(commission) : NaN
    const commissionKobo = showCommission && !isNaN(parsed) ? Math.round(parsed * 100) : undefined
    const statusChanged = status !== referral.status
    const commissionChanged = commissionKobo !== undefined && commissionKobo !== referral.commissionEarned
    const trimmedNotes = notes.trim()

    const currentClinic = referral.assignedClinicId ?? 'none'
    const clinicChanged = mode === 'clinic' && clinicId !== currentClinic
    const physioChanged = mode === 'physio' && !!physioId && physioId !== referral.assignedPhysiotherapistId
    // Choosing Rehabify for a referral that is still routed to a clinic takes it back from the clinic
    const unrouteOnly = mode === 'physio' && !!physioId && !physioChanged && !!referral.assignedClinicId

    if (!statusChanged && !commissionChanged && !trimmedNotes && !clinicChanged && !physioChanged && !unrouteOnly) {
      toast.info('Nothing to save')
      onClose()
      return
    }

    setSaving(true)
    try {
      if (statusChanged || commissionChanged || trimmedNotes) {
        await updateReferral({
          referralId: referral._id,
          status,
          notes: trimmedNotes || undefined,
          commissionEarned: commissionChanged ? commissionKobo : undefined,
        })
      }
      if (clinicChanged) {
        await assignClinic({ referralId: referral._id, clinicId: clinicId === 'none' ? undefined : (clinicId as Id<'clinics'>) })
      }
      if (physioChanged && physioId) {
        await assignPhysio({ referralId: referral._id, physiotherapistUserId: physioId, clinicalNotes: trimmedNotes || undefined, unrouteClinic: true })
      } else if (unrouteOnly) {
        await assignClinic({ referralId: referral._id, clinicId: undefined })
      }
      playSound('success')
      toast.success(physioChanged ? 'Physiotherapist assigned and partner notified' : 'Referral updated')
      onClose()
    } catch (error) {
      playSound('error')
      toast.error(errorMessage(error, 'Failed to update the referral'))
    } finally {
      setSaving(false)
    }
  }

  const routeButton = (value: RouteMode, label: string, Icon: typeof Building2) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition',
        mode === value ? 'bg-white text-rh-ink shadow-soft dark:bg-rh-ink-3 dark:text-rh-lime' : 'text-neutral-500 hover:text-rh-ink dark:text-neutral-400 dark:hover:text-white'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )

  return (
    <>
      <DialogHeader>
        <DialogTitle className={dialogTitleClass}>
          {referral.patientFirstName} {referral.patientLastName}
        </DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={statusTone(referral.status)}>{STATUS_LABEL[referral.status]}</StatusBadge>
          {referral.trackingCode && <span className="font-mono text-xs">{referral.trackingCode}</span>}
          {isSandbox && <StatusBadge tone="neutral">Sandbox</StatusBadge>}
          <span className="text-xs">
            · {referral.partnerName || referral.doctorName}
            {referral.partnerType === 'doctor' ? ' (doctor referral)' : ''}
          </span>
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        {/* Status */}
        <section className="space-y-3">
          <div className="space-y-1.5">
            <span className={labelClass}>Status</span>
            <Select value={status} onValueChange={(value) => setStatus(value as ReferralStatus)}>
              <SelectTrigger className={cn(inputClass, 'w-full')} aria-label="Referral status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={selectContentClass}>
                {STAGES.map((stage) => (
                  <SelectGroup key={stage.value}>
                    <SelectLabel>{stage.label}</SelectLabel>
                    {stage.statuses
                      .filter((s) => !LEGACY_STATUSES.includes(s) || s === referral.status)
                      .map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABEL[s]}
                          {LEGACY_STATUSES.includes(s) ? ' (legacy)' : ''}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <p className={hintClass}>Partner-attributed referrals send the partner a status update when the public status changes.</p>
          </div>

          {showCommission && (
            <div className="space-y-1.5">
              <label htmlFor="referral-commission" className={labelClass}>
                Earned commission (₦)
              </label>
              <Input
                id="referral-commission"
                type="number"
                placeholder="Amount in Naira"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                className={inputClass}
              />
              <p className={hintClass}>Total credited to the referring doctor.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="referral-notes" className={labelClass}>
              Admin note
            </label>
            <textarea
              id="referral-notes"
              placeholder="Added to the referral's audit trail (not shown to the partner)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={textareaClass}
            />
          </div>

          {referral.clinicalNotes && (
            <div className="space-y-1">
              <span className={labelClass}>Clinical notes from the referrer</span>
              <p className={cn(insetClass, 'whitespace-pre-wrap text-xs text-rh-ink dark:text-neutral-200')}>{referral.clinicalNotes}</p>
            </div>
          )}
        </section>

        {/* Routing */}
        <section className="space-y-3 border-t border-black/[0.06] pt-4 dark:border-white/[0.08]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={labelClass}>Who handles this referral</span>
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Now:{' '}
              {referral.assignedClinicName
                ? `${referral.assignedClinicName} (clinic)`
                : referral.assignedPhysiotherapistName
                  ? referral.assignedPhysiotherapistName
                  : 'Not assigned'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-rh-canvas p-1 dark:bg-white/[0.04]">
            {routeButton('clinic', 'Partner clinic', Building2)}
            {routeButton('physio', 'Rehabify physiotherapist', Stethoscope)}
          </div>

          {mode === 'clinic' ? (
            <div className="space-y-1.5">
              <Select value={clinicId} onValueChange={setClinicId}>
                <SelectTrigger className={cn(inputClass, 'w-full')} aria-label="Route to clinic">
                  <SelectValue placeholder="Not routed to a clinic" />
                </SelectTrigger>
                <SelectContent className={selectContentClass}>
                  <SelectItem value="none">Not routed to a clinic</SelectItem>
                  {clinics?.map((clinic: RoutableClinic) => (
                    <SelectItem key={clinic._id} value={clinic._id}>
                      {clinic.name}
                      {clinic.city ? ` · ${clinic.city}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className={hintClass}>Only the selected clinic sees this referral in its dashboard. Suspended clinics are not listed.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input
                  placeholder="Search name, email or location"
                  value={physioSearch}
                  onChange={(e) => setPhysioSearch(e.target.value)}
                  className={cn(inputClass, 'pl-9')}
                />
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl bg-rh-canvas p-1.5 dark:bg-white/[0.03]" role="listbox" aria-label="Physiotherapists">
                {physiosRaw === undefined ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-rh-ink dark:text-rh-lime" />
                  </div>
                ) : filteredPhysios.length === 0 ? (
                  <p className="py-6 text-center text-xs text-neutral-500 dark:text-neutral-400">No approved physiotherapists match.</p>
                ) : (
                  filteredPhysios.map((p) => {
                    const selected = p.id === physioId
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => setPhysioId(p.id)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition',
                          selected ? 'bg-white shadow-soft ring-1 ring-rh-lime/30 dark:bg-rh-ink-3 dark:ring-white/10' : 'hover:bg-white/70 dark:hover:bg-white/[0.05]'
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-rh-ink dark:text-white">{p.name}</span>
                          <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                            {p.location && (
                              <span className="inline-flex items-center gap-0.5">
                                <MapPin className="h-3 w-3" /> {p.location}
                              </span>
                            )}
                            {p.offersOnline && (
                              <span className="inline-flex items-center gap-0.5">
                                <Monitor className="h-3 w-3" /> Online
                              </span>
                            )}
                            {p.offersInPerson && (
                              <span className="inline-flex items-center gap-0.5">
                                <Building2 className="h-3 w-3" /> In person
                              </span>
                            )}
                          </span>
                        </span>
                        {selected && <Check className="h-4 w-4 shrink-0 text-rh-ink dark:text-rh-lime" />}
                      </button>
                    )
                  })
                )}
              </div>
              <p className={hintClass}>
                {physios.length > 50 && filteredPhysios.length === 50 ? 'Showing the first 50 matches; search to narrow down. ' : ''}
                Assigning sends the partner a provider-matched update and removes any clinic routing.
                {isSandbox ? ' In sandbox the provider is simulated.' : ''}
              </p>
            </div>
          )}
        </section>

        {(referral.referringDoctorId || referral.partnerType === 'doctor') && (
          <Callout tone="info" title="Referring doctor">
            The doctor earns commission when this patient pays (bookings and clinic invoices), under their contract. It is paid with the monthly
            partner payouts to the bank account in their portal.
            {referral.commissionEarned ? ` Paid by hand before payouts moved to partner payouts: ${formatKobo(referral.commissionEarned)}.` : ''}
          </Callout>
        )}
      </div>

      <DialogFooter className="gap-2">
        <Button variant="ghost" onClick={onClose} disabled={saving} className={softButtonClass}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving || (mode === 'physio' && !physioId && status === referral.status && !notes.trim())} className={primaryButtonClass}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </DialogFooter>
    </>
  )
}
