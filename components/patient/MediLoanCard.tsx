'use client'

import { useState } from 'react'
import { useQuery } from 'convex/react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Banknote, ExternalLink, Loader2, WalletCards } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import {
  InfoTip,
  Panel,
  PatientDrawer,
  StatusBadge,
  primaryButtonClass,
  secondaryButtonClass,
  type Tone,
} from '@/components/patient/ui'
import { formatKobo } from '@/lib/rehabify-services'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

/**
 * MediLoan (by MyItura) for patients: the "Pay with MediLoan" button for an unpaid booking or
 * invoice, the status words used everywhere, and the Home card listing their loans.
 * MyItura texts the application link; the loan pays the provider when it pays out.
 */

export type MediLoanStatus =
  | 'initiated'
  | 'pending'
  | 'approved'
  | 'offer_accepted'
  | 'disbursed'
  | 'declined'
  | 'expired'
  | 'cancelled'
  | 'defaulted'
  | 'failed'
  | 'repaid'

/** api.mediloan.getMyLoans */
export type MyLoan = {
  _id: string
  status: MediLoanStatus
  treatment: string
  amountKobo: number
  amountApprovedKobo: number | null
  physioName: string | null
  invoiceId: string | null
  invoiceNumber: string | null
  bookingId: string | null
  applicationUrl: string | null
  expiresAt: string | null
  repaymentStatus: string | null
  disbursedAt: number | null
  createdAt: number
  updatedAt: number
}

export const MEDILOAN_STATUS: Record<MediLoanStatus, { label: string; tone: Tone; explain: string }> = {
  initiated: {
    label: 'Link sent',
    tone: 'blue',
    explain: 'MyItura has texted you a link to apply. Open it to start your application; it takes a few minutes.',
  },
  pending: {
    label: 'Applied',
    tone: 'amber',
    explain: 'You’ve applied. MyItura is reviewing your details and will let you know.',
  },
  approved: {
    label: 'Approved — accept the terms',
    tone: 'green',
    explain: 'MyItura approved your loan. Open MediLoan to read and accept the terms so it can pay out.',
  },
  offer_accepted: {
    label: 'Terms accepted',
    tone: 'green',
    explain: 'You accepted the terms. MyItura pays your provider shortly; your booking or invoice updates then.',
  },
  disbursed: {
    label: 'Paid out',
    tone: 'green',
    explain: 'MyItura paid for your care. You now repay MyItura on the schedule you agreed.',
  },
  repaid: { label: 'Repaid', tone: 'green', explain: 'You’ve repaid the loan in full. Well done.' },
  declined: {
    label: 'Not approved',
    tone: 'rose',
    explain: 'MyItura didn’t approve this loan. You can still pay another way.',
  },
  expired: {
    label: 'Link expired',
    tone: 'neutral',
    explain: 'The application wasn’t finished within 7 days. You can start a new one.',
  },
  cancelled: { label: 'Cancelled', tone: 'neutral', explain: 'This application was cancelled. You can pay another way.' },
  defaulted: {
    label: 'Repayment overdue',
    tone: 'rose',
    explain: 'A repayment to MyItura is overdue. Contact MyItura to sort it out.',
  },
  failed: { label: 'Failed', tone: 'rose', explain: 'Something went wrong with this application. You can try again or pay another way.' },
}

/** Applications still in progress: no second loan, and the usual "Pay" steps aside. */
export const OPEN_MEDILOAN = new Set<MediLoanStatus>(['initiated', 'pending', 'approved', 'offer_accepted'])
/** Applications that ended without paying: the patient can pay another way (or try again). */
export const CLOSED_UNPAID_MEDILOAN = new Set<MediLoanStatus>(['declined', 'expired', 'cancelled', 'failed'])

export function mediLoanMeta(status: string) {
  return MEDILOAN_STATUS[status as MediLoanStatus] ?? { label: status, tone: 'neutral' as Tone, explain: '' }
}

/** Badge + "i" for a loan status. */
export function MediLoanStatusBadge({ status }: { status: string }) {
  const meta = mediLoanMeta(status)
  return (
    <span className="inline-flex items-center gap-1">
      <StatusBadge tone={meta.tone} dot>
        MediLoan: {meta.label}
      </StatusBadge>
      {meta.explain && <InfoTip label="What this MediLoan status means">{meta.explain}</InfoTip>}
    </span>
  )
}

type StartResponse = { success?: boolean; error?: string; data?: { message?: string; applicationUrl?: string | null } }

/**
 * "Pay with MediLoan" for one unpaid booking or invoice: a button that opens a short
 * explanation, then starts the application. The amount is what's owed; the server decides it.
 */
export function PayWithMediLoan({
  target,
  amountKobo,
  what,
  className,
  onStarted,
}: {
  target: { bookingId: string } | { invoiceId: string }
  amountKobo: number
  /** e.g. "this booking", "invoice #INV-1" */
  what: string
  className?: string
  onStarted?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [applicationUrl, setApplicationUrl] = useState<string | null>(null)

  const start = async () => {
    setStarting(true)
    setError('')
    try {
      const res = await fetch('/api/myitura/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target),
      })
      const data = (await res.json().catch(() => ({}))) as StartResponse
      if (!res.ok || !data.success) throw new Error(data.error || 'MediLoan couldn’t start. Please try again.')
      playSound('success')
      toast.success(data.data?.message ?? 'MediLoan started. MyItura is texting you the application link.')
      setApplicationUrl(data.data?.applicationUrl ?? null)
      onStarted?.()
    } catch (err) {
      playSound('error')
      setError((err as Error).message)
    } finally {
      setStarting(false)
    }
  }

  const close = (next: boolean) => {
    if (starting) return
    setOpen(next)
    if (!next) {
      setError('')
      setApplicationUrl(null)
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className={cn(secondaryButtonClass, 'h-10', className)}>
        <WalletCards className="mr-1.5 h-4 w-4" aria-hidden />
        Pay with MediLoan
      </Button>
      <PatientDrawer
        open={open}
        onOpenChange={close}
        title={applicationUrl ? 'Your MediLoan has started' : 'Pay with MediLoan'}
        description={applicationUrl ? undefined : `Spread the cost of ${what} (${formatKobo(amountKobo)})`}
        footer={
          applicationUrl ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild className={cn(primaryButtonClass, 'h-11 w-full')}>
                <a href={applicationUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open application
                </a>
              </Button>
              <Button onClick={() => close(false)} className={cn(secondaryButtonClass, 'h-11 w-full')}>
                Done
              </Button>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={() => close(false)} disabled={starting} className={cn(secondaryButtonClass, 'h-11 w-full')}>
                Not now
              </Button>
              <Button onClick={start} disabled={starting} className={cn(primaryButtonClass, 'h-11 w-full')}>
                {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WalletCards className="mr-2 h-4 w-4" />}
                Start my application
              </Button>
            </div>
          )
        }
      >
        {applicationUrl ? (
          <div className="space-y-3 text-sm leading-relaxed text-pt-ink">
            <p>MyItura is texting you a link to apply. You can also open it now.</p>
            <p className="text-pt-muted">
              Once MyItura approves the loan and you accept the terms, it pays for {what}, and we confirm it. You’ll see each step on your Home page.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <ol className="space-y-3">
              {[
                ['MyItura texts you a link', 'Apply on your phone. They check your ID and details; it takes a few minutes.'],
                ['MyItura decides', 'If they approve, you read and accept the loan terms in MediLoan.'],
                ['Your care is paid', `MyItura pays for ${what}, and we confirm it for you.`],
                ['You repay MyItura', 'In instalments, on the schedule you agree with them.'],
              ].map(([title, body], index) => (
                <li key={title} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pt-sunken text-xs font-semibold text-pt-ink">
                    {index + 1}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-pt-ink">{title}</span>
                    <span className="block text-sm text-pt-muted">{body}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="rounded-2xl bg-pt-sunken px-4 py-3 text-xs leading-relaxed text-pt-muted">
              MediLoan is provided by MyItura, an independent lender. They decide on the loan and handle repayments; Rehabify doesn’t
              see your financial details.
            </p>
            {error && <p className="rounded-2xl bg-pt-rose-bg px-4 py-3 text-sm text-pt-rose-fg">{error}</p>}
          </div>
        )}
      </PatientDrawer>
    </>
  )
}

/** Patient Home: every MediLoan with where it stands. Renders nothing when there are none. */
export function MediLoanCard() {
  const loans = useQuery(api.mediloan.getMyLoans) as MyLoan[] | undefined
  if (!loans || loans.length === 0) return null

  return (
    <Panel
      title="MediLoan"
      description="Paying for your care with a loan from MyItura"
      info="MediLoan is provided by MyItura, an independent lender. They decide on the loan, pay your provider when it’s approved and handle your repayments."
    >
      <ul className="space-y-3">
        {loans.map((loan) => {
          const meta = mediLoanMeta(loan.status)
          const paidOut = loan.status === 'disbursed' || loan.status === 'repaid' || loan.status === 'defaulted'
          const approvedDiffers = loan.amountApprovedKobo !== null && loan.amountApprovedKobo !== loan.amountKobo
          const forWhat = loan.invoiceNumber ? `Invoice #${loan.invoiceNumber}` : loan.bookingId ? 'Your booking' : null
          return (
            <li key={loan._id} className="space-y-3 rounded-2xl bg-pt-sunken p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <span className="inline-flex items-center gap-1">
                    <StatusBadge tone={meta.tone} dot>
                      {meta.label}
                    </StatusBadge>
                    {meta.explain && <InfoTip label="What this status means">{meta.explain}</InfoTip>}
                  </span>
                  <p className="text-[15px] font-semibold text-pt-ink">{loan.treatment}</p>
                  <p className="text-sm text-pt-muted">
                    {[forWhat, loan.physioName ? `with ${loan.physioName}` : null].filter(Boolean).join(' · ') ||
                      `Started ${format(loan.createdAt, 'd MMM yyyy')}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold tabular-nums text-pt-ink">{formatKobo(loan.amountKobo)}</p>
                  {approvedDiffers && (
                    <p className="text-xs text-pt-muted">Approved {formatKobo(loan.amountApprovedKobo ?? 0)}</p>
                  )}
                </div>
              </div>

              {paidOut && loan.disbursedAt && (
                <p className="flex items-center gap-1.5 text-sm text-pt-ink">
                  <Banknote className="h-4 w-4 shrink-0 text-pt-green-fg" aria-hidden />
                  Paid to your provider on {format(loan.disbursedAt, 'd MMM yyyy')} · you repay MyItura
                </p>
              )}
              {loan.repaymentStatus && <p className="text-xs text-pt-muted">Repayments: {loan.repaymentStatus}</p>}

              {loan.applicationUrl && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild size="sm" className={cn(primaryButtonClass, 'h-10 px-4')}>
                    <a href={loan.applicationUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden />
                      {loan.status === 'initiated' ? 'Start application' : 'Continue application'}
                    </a>
                  </Button>
                  {loan.expiresAt && !Number.isNaN(Date.parse(loan.expiresAt)) && (
                    <span className="text-xs text-pt-muted">Link works until {format(Date.parse(loan.expiresAt), 'd MMM')}</span>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
