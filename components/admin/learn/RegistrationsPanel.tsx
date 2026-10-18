'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { format, formatDistanceToNow } from 'date-fns'
import { LayoutGroup } from 'framer-motion'
import {
  AlertTriangle,
  BadgeCheck,
  CheckCheck,
  ChevronRight,
  Copy,
  Download,
  Hourglass,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCw,
  Search,
  Stethoscope,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ConfirmDialog,
  downloadCsv,
  EmptyState,
  FilterChips,
  formatNaira,
  inputClass,
  Panel,
  primaryButtonClass,
  softButtonClass,
  StatTile,
  StatusBadge,
  tableWrapClass,
} from '@/components/admin/ui'
import { Callout, dialogClass, dialogTitleClass, errorMessage, insetClass, labelClass, LoadingBlock, textareaClass } from '@/components/admin/partners/shared'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import {
  REGISTRATION_STATUS,
  TRACK_LABEL,
  whatsAppNumber,
  type AdminCohort,
  type AdminRegistration,
  type InterestRow,
  type RegistrationStatus,
  type Track,
} from './types'

type StatusFilter = 'all' | RegistrationStatus
type TrackFilter = 'all' | Track

const PROGRAM_TITLE = 'Rehabify MSK Specialist Program'
const TRACK_EXPORT_LABEL: Record<Track, string> = { rehabify: 'Rehabify physio', external: 'Other physio' }

const when = (ts: number | null) => (ts ? format(ts, 'd MMM yyyy, HH:mm') : '—')
const ago = (ts: number) => formatDistanceToNow(ts, { addSuffix: true })
const fullName = (r: AdminRegistration) => `${r.firstName} ${r.lastName}`.trim()
const startedAt = (r: AdminRegistration) => r.lastAttemptAt ?? r.createdAt
const paidAmount = (r: AdminRegistration) => r.amountPaid ?? r.price

const RECHECK_MESSAGE: Record<string, string> = {
  paid: 'Paystack confirms the payment. The seat is now paid and the confirmation email is on its way.',
  already_paid: 'This registration is already paid.',
  no_checkout: "They haven't started a checkout yet, so there's nothing to check.",
  not_found: 'Paystack has no record of this checkout. They may have closed it before paying.',
  abandoned: 'Paystack says the checkout was not completed (abandoned).',
  failed: 'Paystack says the payment failed.',
  amount_mismatch: 'Paystack shows a payment smaller than the price. It is flagged on the registration.',
  currency_mismatch: 'Paystack shows a payment in another currency. It is flagged on the registration.',
}

// ─────────────────────────────────────────────────────────────────────────────
// Following up on unfinished payments
// ─────────────────────────────────────────────────────────────────────────────

function followUp(r: AdminRegistration, cohort: AdminCohort, programUrl: string) {
  const link = `${programUrl}/register?track=${r.track}`
  const intro = `Hi ${r.firstName}, this is Rehabify. You started registering for the ${PROGRAM_TITLE} (${cohort.cohortLabel}, ${cohort.dateRange}) but the payment wasn't completed.`
  const finish = `You can finish your registration in a minute here: ${link}`
  const phone = whatsAppNumber(r.phone)
  return {
    whatsApp: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(`${intro} ${finish}\n\nAny questions? Just reply to this message.`)}` : null,
    email: `mailto:${r.email}?subject=${encodeURIComponent(`Complete your ${PROGRAM_TITLE} registration`)}&body=${encodeURIComponent(
      `${intro}\n\n${finish}\n\nAny questions? Just reply to this email.\n\nRehabify`
    )}`,
  }
}

async function copyPhone(phone: string) {
  try {
    await navigator.clipboard.writeText(phone)
    toast.success(`Copied ${phone}`)
  } catch {
    toast.error('Could not copy. Select the number and copy it instead.')
  }
}

const iconButton =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-rh-mist hover:text-rh-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-teal/40 disabled:pointer-events-none disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-rh-aqua'

/** WhatsApp, email, copy phone and the "contacted" marker for one unpaid registration. */
function FollowUpActions({
  row,
  cohort,
  programUrl,
  size = 'icon',
}: {
  row: AdminRegistration
  cohort: AdminCohort
  programUrl: string
  size?: 'icon' | 'full'
}) {
  const update = useMutation(api.learn.adminUpdateRegistration)
  const [busy, setBusy] = useState(false)
  const links = followUp(row, cohort, programUrl)
  const contacted = row.contactedAt !== null

  const toggleContacted = async () => {
    setBusy(true)
    try {
      await update({ registrationId: row.id, contacted: !contacted })
      if (!contacted) playSound('success')
      toast.success(contacted ? 'Contacted marker removed' : `${row.firstName} marked as contacted`)
    } catch (error) {
      playSound('error')
      toast.error(errorMessage(error, 'Could not update'))
    } finally {
      setBusy(false)
    }
  }

  // Row actions must not open the details dialog
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

  if (size === 'full') {
    return (
      <div className="flex flex-wrap gap-2">
        {links.whatsApp ? (
          <Button asChild variant="ghost" className={softButtonClass}>
            <a href={links.whatsApp} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
            </a>
          </Button>
        ) : (
          <Button variant="ghost" className={softButtonClass} disabled title="This phone number can't be used for WhatsApp">
            <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
          </Button>
        )}
        <Button asChild variant="ghost" className={softButtonClass}>
          <a href={links.email}>
            <Mail className="mr-2 h-4 w-4" /> Email
          </a>
        </Button>
        <Button variant="ghost" className={softButtonClass} onClick={() => copyPhone(row.phone)}>
          <Copy className="mr-2 h-4 w-4" /> Copy phone
        </Button>
        <Button variant="ghost" className={cn(softButtonClass, contacted && 'ring-1 ring-emerald-500/40')} onClick={toggleContacted} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-2 h-4 w-4" />}
          {contacted ? 'Contacted ✓ (undo)' : 'Mark contacted'}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-end gap-0.5" onClick={stop} onKeyDown={stop}>
      {links.whatsApp ? (
        <a href={links.whatsApp} target="_blank" rel="noopener noreferrer" className={iconButton} title="Message on WhatsApp" aria-label={`WhatsApp ${row.firstName}`}>
          <MessageCircle className="h-4 w-4" />
        </a>
      ) : (
        <span className={cn(iconButton, 'opacity-40')} title="Phone number can't be used for WhatsApp">
          <MessageCircle className="h-4 w-4" />
        </span>
      )}
      <a href={links.email} className={iconButton} title="Email" aria-label={`Email ${row.firstName}`}>
        <Mail className="h-4 w-4" />
      </a>
      <button type="button" className={iconButton} title="Copy phone number" aria-label={`Copy ${row.firstName}'s phone number`} onClick={() => copyPhone(row.phone)}>
        <Copy className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={cn(iconButton, contacted && 'text-emerald-600 dark:text-emerald-400')}
        title={contacted ? 'Contacted. Click to undo.' : 'Mark as contacted'}
        aria-label={contacted ? `Undo contacted for ${row.firstName}` : `Mark ${row.firstName} as contacted`}
        aria-pressed={contacted}
        onClick={toggleContacted}
        disabled={busy}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Details dialog
// ─────────────────────────────────────────────────────────────────────────────

function Detail({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={labelClass}>{label}</p>
      <p className={cn('mt-0.5 break-words text-sm text-rh-night dark:text-white', mono && 'font-mono text-xs')}>{value || '—'}</p>
    </div>
  )
}

function RegistrationDialog({
  row,
  cohort,
  programUrl,
  onClose,
}: {
  row: AdminRegistration
  cohort: AdminCohort
  programUrl: string
  onClose: () => void
}) {
  const update = useMutation(api.learn.adminUpdateRegistration)
  const resend = useMutation(api.learn.adminResendConfirmation)
  const recheck = useAction(api.learn.adminRecheckPayment)
  const [notes, setNotes] = useState(row.adminNotes)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'refunded' | 'cancelled' | null>(null)

  const run = async (key: string, work: () => Promise<unknown>, success?: string) => {
    setBusy(key)
    try {
      await work()
      if (success) {
        playSound('success')
        toast.success(success)
      }
    } catch (error) {
      playSound('error')
      toast.error(errorMessage(error, 'Something went wrong'))
      throw error
    } finally {
      setBusy(null)
    }
  }

  const status = REGISTRATION_STATUS[row.status]

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className={cn(dialogClass, 'max-h-[90vh] overflow-y-auto sm:max-w-2xl')}>
          <DialogHeader>
            <DialogTitle className={dialogTitleClass}>
              {fullName(row)}
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            </DialogTitle>
            <DialogDescription>
              {TRACK_LABEL[row.track]} · {formatNaira(row.price)}
              {row.hasAccount ? ' · Has a Rehabify account' : ' · Registered without an account'}
            </DialogDescription>
          </DialogHeader>

          {row.extraPayments.length > 0 && (
            <Callout tone="warning" title="Payment needs attention">
              <ul className="mt-1 space-y-0.5">
                {row.extraPayments.map((p) => (
                  <li key={p.reference}>
                    {formatNaira(p.amount)} on {when(p.at)} · <span className="font-mono">{p.reference}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5">
                {row.status === 'paid'
                  ? 'A second payment came in after the seat was paid for. Refund it in Paystack, then clear it here.'
                  : 'A payment came in below the price or in another currency, so the seat was not confirmed. Refund it or contact them, then clear it here.'}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className={cn(softButtonClass, 'mt-2 h-8')}
                disabled={busy !== null}
                onClick={() =>
                  run('clear', () => update({ registrationId: row.id, clearFlaggedPayments: true }), 'Marked as resolved').catch(() => {})
                }
              >
                {busy === 'clear' && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Mark as resolved
              </Button>
            </Callout>
          )}

          {row.status === 'pending' && (
            <div className={cn(insetClass, 'space-y-3 p-4')}>
              <div>
                <p className="text-sm font-semibold text-rh-night dark:text-white">Didn&apos;t finish paying</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Started {ago(startedAt(row))} · {row.paymentAttempts} {row.paymentAttempts === 1 ? 'attempt' : 'attempts'}
                  {row.contactedAt ? ` · Contacted ${ago(row.contactedAt)}` : ' · Not contacted yet'}
                </p>
              </div>
              <FollowUpActions row={row} cohort={cohort} programUrl={programUrl} size="full" />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Detail label="Email" value={<a className="text-rh-teal hover:underline dark:text-rh-aqua" href={`mailto:${row.email}`}>{row.email}</a>} />
            <Detail label="Phone" value={<a className="text-rh-teal hover:underline dark:text-rh-aqua" href={`tel:${row.phone}`}>{row.phone}</a>} />
            <Detail label="Licence number" value={row.licenseNumber} />
            <Detail label="Works at" value={row.workplace} />
            <Detail label="City" value={row.city} />
            <Detail label="Years in practice" value={row.yearsOfPractice} />
            <Detail label="Registered" value={when(row.createdAt)} />
            <Detail label="Last checkout started" value={when(row.lastAttemptAt)} />
            <Detail label="Paid" value={row.paidAt ? `${when(row.paidAt)}${row.paymentChannel ? ` · ${row.paymentChannel.replace(/_/g, ' ')}` : ''}` : '—'} />
            <Detail label="Amount paid" value={row.amountPaid !== null ? formatNaira(row.amountPaid) : '—'} />
            <Detail label="Confirmation email" value={row.confirmationEmailSentAt ? `Sent ${when(row.confirmationEmailSentAt)}` : 'Not sent'} />
            <Detail label="Checkout attempts" value={String(row.paymentAttempts)} />
            <Detail label="Payment reference" value={row.paidReference || row.paymentReference} mono />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="learn-admin-notes" className={labelClass}>
              Notes (only admins see these)
            </label>
            <textarea id="learn-admin-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaClass} />
            {notes !== row.adminNotes && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  className={primaryButtonClass}
                  disabled={busy !== null}
                  onClick={() => run('notes', () => update({ registrationId: row.id, adminNotes: notes }), 'Notes saved').catch(() => {})}
                >
                  {busy === 'notes' && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Save notes
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-black/[0.05] pt-4 dark:border-white/[0.06]">
            {row.status === 'pending' && (
              <>
                <Button
                  className={primaryButtonClass}
                  disabled={busy !== null}
                  onClick={() =>
                    run('recheck', async () => {
                      const result = (await recheck({ registrationId: row.id })) as { status: string }
                      const message = RECHECK_MESSAGE[result.status] ?? `Paystack status: ${result.status}`
                      if (result.status === 'paid') {
                        playSound('paid')
                        toast.success(message)
                      } else toast.info(message)
                    }).catch(() => {})
                  }
                >
                  {busy === 'recheck' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Check payment with Paystack
                </Button>
                <Button variant="ghost" className={softButtonClass} disabled={busy !== null} onClick={() => setConfirm('cancelled')}>
                  Cancel registration
                </Button>
              </>
            )}
            {row.status === 'paid' && (
              <>
                <Button
                  className={primaryButtonClass}
                  disabled={busy !== null}
                  onClick={() => run('resend', () => resend({ registrationId: row.id }), `Confirmation email sent to ${row.email}`).catch(() => {})}
                >
                  {busy === 'resend' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                  Resend confirmation email
                </Button>
                <Button variant="ghost" className={softButtonClass} disabled={busy !== null} onClick={() => setConfirm('refunded')}>
                  Mark refunded
                </Button>
              </>
            )}
            {row.status === 'cancelled' && (
              <Button
                variant="ghost"
                className={softButtonClass}
                disabled={busy !== null}
                onClick={() => run('reopen', () => update({ registrationId: row.id, status: 'pending' }), 'Registration reopened').catch(() => {})}
              >
                Reopen registration
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        destructive
        title={confirm === 'refunded' ? `Mark ${row.firstName}'s registration refunded?` : `Cancel ${row.firstName}'s registration?`}
        description={
          confirm === 'refunded'
            ? 'Refund the payment in your Paystack dashboard first. This only updates the record here and frees the seat.'
            : "They haven't paid. Cancelling removes it from the awaiting-payment list; if they pay later, the seat is still confirmed."
        }
        confirmLabel={confirm === 'refunded' ? 'Mark refunded' : 'Cancel registration'}
        onConfirm={() =>
          run('status', () => update({ registrationId: row.id, status: confirm! }), confirm === 'refunded' ? 'Marked refunded' : 'Registration cancelled')
        }
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The list
// ─────────────────────────────────────────────────────────────────────────────

function SummaryTile({ onClick, active, children }: { onClick: () => void; active: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'block w-full rounded-2xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-teal dark:focus-visible:ring-rh-aqua',
        active && 'ring-2 ring-rh-teal/60 dark:ring-rh-aqua/50'
      )}
    >
      {children}
    </button>
  )
}

export function RegistrationsPanel({ cohort, programUrl }: { cohort: AdminCohort; programUrl: string }) {
  const rows = useQuery(api.learn.adminListRegistrations, { cohortId: cohort.id }) as AdminRegistration[] | undefined
  const [status, setStatus] = useState<StatusFilter>('all')
  const [track, setTrack] = useState<TrackFilter>('all')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const all = useMemo(() => rows ?? [], [rows])

  // Each filter's counts respect the other filter, so "Awaiting payment + Rehabify" adds up
  const statusCounts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: 0, paid: 0, pending: 0, cancelled: 0, refunded: 0 }
    for (const r of all) {
      if (track !== 'all' && r.track !== track) continue
      c.all += 1
      c[r.status] += 1
    }
    return c
  }, [all, track])

  const trackCounts = useMemo(() => {
    const c: Record<TrackFilter, number> = { all: 0, rehabify: 0, external: 0 }
    for (const r of all) {
      if (status !== 'all' && r.status !== status) continue
      c.all += 1
      c[r.track] += 1
    }
    return c
  }, [all, status])

  const summary = useMemo(() => {
    const paid = (t: Track) => all.filter((r) => r.status === 'paid' && r.track === t)
    const pending = all.filter((r) => r.status === 'pending')
    return {
      rehabify: { count: paid('rehabify').length, total: paid('rehabify').reduce((s, r) => s + paidAmount(r), 0) },
      external: { count: paid('external').length, total: paid('external').reduce((s, r) => s + paidAmount(r), 0) },
      pending: pending.length,
      contacted: pending.filter((r) => r.contactedAt !== null).length,
    }
  }, [all])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = all.filter((r) => {
      if (status !== 'all' && r.status !== status) return false
      if (track !== 'all' && r.track !== track) return false
      if (!q) return true
      return [fullName(r), r.email, r.phone, r.licenseNumber, r.workplace].some((v) => v.toLowerCase().includes(q))
    })
    // Following up: the people who have waited longest come first
    return status === 'pending' ? [...list].sort((a, b) => startedAt(a) - startedAt(b)) : list
  }, [all, status, track, search])

  const open = all.find((r) => r.id === openId) ?? null

  const showOnly = (nextStatus: StatusFilter, nextTrack: TrackFilter) => {
    const same = status === nextStatus && track === nextTrack
    setStatus(same ? 'all' : nextStatus)
    setTrack(same ? 'all' : nextTrack)
  }

  const exportCsv = () => {
    const parts = [status !== 'all' && REGISTRATION_STATUS[status].label, track !== 'all' && TRACK_EXPORT_LABEL[track]].filter(Boolean)
    const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    downloadCsv(
      `msk-${slug(cohort.cohortLabel)}-registrations${parts.length ? `-${slug(parts.join(' '))}` : ''}`,
      visible.map((r) => ({
        'First name': r.firstName,
        'Last name': r.lastName,
        Email: r.email,
        Phone: r.phone,
        Type: TRACK_EXPORT_LABEL[r.track],
        'Price (NGN)': r.price,
        Status: REGISTRATION_STATUS[r.status].label,
        'Paid (NGN)': r.amountPaid ?? '',
        'Paid at': r.paidAt ? new Date(r.paidAt).toISOString() : '',
        'Checkout attempts': r.paymentAttempts,
        'Last attempt at': r.lastAttemptAt ? new Date(r.lastAttemptAt).toISOString() : '',
        'Contacted at': r.contactedAt ? new Date(r.contactedAt).toISOString() : '',
        'Licence number': r.licenseNumber,
        'Works at': r.workplace,
        City: r.city,
        'Years in practice': r.yearsOfPractice,
        Reference: r.paidReference || r.paymentReference,
        'Registered at': new Date(r.createdAt).toISOString(),
        Notes: r.adminNotes,
      }))
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryTile onClick={() => showOnly('paid', 'rehabify')} active={status === 'paid' && track === 'rehabify'}>
          <StatTile
            label="Rehabify physios paid"
            value={summary.rehabify.count}
            hint={`${formatNaira(summary.rehabify.total)} · ${formatNaira(cohort.rehabifyPrice)} each`}
            icon={BadgeCheck}
          />
        </SummaryTile>
        <SummaryTile onClick={() => showOnly('paid', 'external')} active={status === 'paid' && track === 'external'}>
          <StatTile
            label="Other physios paid"
            value={summary.external.count}
            hint={`${formatNaira(summary.external.total)} · ${formatNaira(cohort.externalPrice)} each`}
            icon={Stethoscope}
            tone="mint"
          />
        </SummaryTile>
        <SummaryTile onClick={() => showOnly('pending', 'all')} active={status === 'pending' && track === 'all'}>
          <StatTile
            label="Didn't finish paying"
            value={summary.pending}
            hint={summary.pending ? `${summary.contacted} of ${summary.pending} contacted` : 'Nobody to follow up'}
            icon={Hourglass}
            tone={summary.pending > summary.contacted ? 'attention' : 'peach'}
          />
        </SummaryTile>
      </div>

      <Panel
        title="Registrations"
        description="Everyone who started registering for this cohort. Click a row for details; follow up on unfinished payments from the row."
        actions={
          <Button variant="ghost" size="sm" className={softButtonClass} onClick={exportCsv} disabled={visible.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Export CSV{visible.length ? ` (${visible.length})` : ''}
          </Button>
        }
      >
        <div className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <LayoutGroup id="learn-status-filter">
              <FilterChips
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'all', label: 'All', count: statusCounts.all },
                  { value: 'paid', label: 'Paid', count: statusCounts.paid },
                  { value: 'pending', label: 'Awaiting payment', count: statusCounts.pending },
                  { value: 'cancelled', label: 'Cancelled', count: statusCounts.cancelled },
                  { value: 'refunded', label: 'Refunded', count: statusCounts.refunded },
                ]}
              />
            </LayoutGroup>
            <LayoutGroup id="learn-track-filter">
              <FilterChips
                value={track}
                onChange={setTrack}
                options={[
                  { value: 'all', label: 'All physios', count: trackCounts.all },
                  { value: 'rehabify', label: `Rehabify physios (${formatNaira(cohort.rehabifyPrice)})`, count: trackCounts.rehabify },
                  { value: 'external', label: `Other physios (${formatNaira(cohort.externalPrice)})`, count: trackCounts.external },
                ]}
              />
            </LayoutGroup>
          </div>
          <div className="relative lg:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, phone…" className={cn(inputClass, 'pl-9')} />
          </div>
        </div>

        {status === 'pending' && visible.length > 0 && (
          <p className="px-5 pb-3 text-xs text-neutral-500 dark:text-neutral-400">
            Oldest first. Message them on WhatsApp or email from the row, then tick them off as contacted.
          </p>
        )}

        {rows === undefined ? (
          <LoadingBlock />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={all.length === 0 ? 'No registrations yet' : 'Nothing matches'}
            description={all.length === 0 ? 'Registrations appear here as soon as someone starts a checkout.' : 'Try another filter or search.'}
          />
        ) : (
          <div className={tableWrapClass}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead className="pr-5 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => {
                  const badge = REGISTRATION_STATUS[r.status]
                  return (
                    <TableRow
                      key={r.id}
                      tabIndex={0}
                      onClick={() => setOpenId(r.id)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setOpenId(r.id)
                        }
                      }}
                      className="cursor-pointer focus-visible:bg-rh-canvas focus-visible:outline-none dark:focus-visible:bg-white/[0.04]"
                    >
                      <TableCell className="pl-5">
                        <p className="flex items-center gap-1.5 font-medium text-rh-night dark:text-white">
                          {fullName(r)}
                          {r.extraPayments.length > 0 && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-label="Payment needs attention" />}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">{r.email}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-neutral-600 dark:text-neutral-300">{r.phone}</TableCell>
                      <TableCell>
                        <StatusBadge tone={r.track === 'rehabify' ? 'teal' : 'neutral'}>{TRACK_LABEL[r.track]}</StatusBadge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums text-rh-night dark:text-white">
                        {formatNaira(r.status === 'paid' ? paidAmount(r) : r.price)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
                        {r.status === 'paid' && r.paidAt ? (
                          <>Paid {format(r.paidAt, 'd MMM, HH:mm')}</>
                        ) : r.status === 'pending' ? (
                          <>
                            <span className="block">
                              Started {ago(startedAt(r))} · {r.paymentAttempts} {r.paymentAttempts === 1 ? 'attempt' : 'attempts'}
                            </span>
                            {r.contactedAt ? (
                              <span className="block text-emerald-600 dark:text-emerald-400">Contacted {ago(r.contactedAt)}</span>
                            ) : (
                              <span className="block text-amber-600 dark:text-amber-300">Not contacted</span>
                            )}
                          </>
                        ) : (
                          <>Registered {format(r.createdAt, 'd MMM, HH:mm')}</>
                        )}
                      </TableCell>
                      <TableCell className="pr-5">
                        <div className="flex items-center justify-end gap-1">
                          {r.status === 'pending' && <FollowUpActions row={r} cohort={cohort} programUrl={programUrl} />}
                          <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {open && <RegistrationDialog key={open.id} row={open} cohort={cohort} programUrl={programUrl} onClose={() => setOpenId(null)} />}
      </Panel>
    </div>
  )
}

export function InterestPanel() {
  const rows = useQuery(api.learn.adminListInterest, {}) as InterestRow[] | undefined
  return (
    <Panel
      title="Waiting for the next cohort"
      description="People who asked to be told when registration opens. Export them when you launch a cohort."
      actions={
        <Button
          variant="ghost"
          size="sm"
          className={softButtonClass}
          disabled={!rows?.length}
          onClick={() =>
            rows &&
            downloadCsv(
              'msk-program-interest',
              rows.map((r) => ({ Email: r.email, Name: r.name, 'Joined at': new Date(r.createdAt).toISOString() }))
            )
          }
        >
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      }
    >
      {rows === undefined ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Mail />}
          title="No one on the list yet"
          description="When registration is closed, the program page offers a “notify me” form. Sign-ups land here."
        />
      ) : (
        <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-rh-night dark:text-white">{r.email}</p>
                {r.name && <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{r.name}</p>}
              </div>
              <span className={cn(insetClass, 'shrink-0 px-2 py-1 text-xs text-neutral-500 dark:text-neutral-400')}>
                {format(r.createdAt, 'd MMM yyyy')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
