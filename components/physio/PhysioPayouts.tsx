'use client'

/**
 * The physio's Rehabify Care payouts (convex/payouts.ts getMyPayouts): each session's payout by
 * stage, and a statement for every Friday transfer. Only payout amounts, never what the patient
 * paid. Independent physios never see this (the query returns null for them too).
 */

import { useMemo, useState, type ComponentType } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { CheckCircle2, ChevronRight, Hourglass, NotebookPen, Pause, ReceiptText, Send, TriangleAlert } from '@/components/icons'
import { formatLagos } from '@/convex/helpers/lagosTime'
import { cn } from '@/lib/utils'
import {
  DetailRow,
  EmptyState,
  LoadingBlocks,
  Panel,
  PhysioDrawer,
  SectionLabel,
  StatusBadge,
  listRowClass,
  softButtonClass,
  type Tone,
} from '@/components/physio/ui'

type Stage = 'awaiting_note' | 'pending' | 'available' | 'on_hold' | 'paying' | 'paid' | 'failed'

type PayoutLine = {
  _id: string
  stage: Stage
  amountKobo: number
  reason: 'session' | 'late_cancellation' | 'no_show'
  patient: string
  service: string
  sessionAt: number | null
  noteDueAt: number | null
  noteOverdue: boolean
  availableAt: number | null
  heldReason: string | null
  runWeekOf: string | null
  writeNoteHref: string | null
  completedAt: number | null
  transferReference: string | null
}

type Statement = {
  _id: string
  weekOf: string | null
  status: 'sending' | 'otp_required' | 'pending' | 'success' | 'failed' | 'reversed'
  amountKobo: number
  reference: string
  sentAt: number | null
  completedAt: number | null
  bankName: string | null
  accountLast4: string | null
  lines: { patient: string; service: string; sessionAt: number | null; amountKobo: number }[]
}

type MyPayouts = {
  bank: { bankName: string; accountName: string; last4: string } | null
  nextRunFriday: string
  lines: PayoutLine[]
  statements: Statement[]
} | null

// A plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const myPayoutsRef = makeFunctionReference<'query', Record<string, never>, MyPayouts>('payouts:getMyPayouts')

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`
const day = (ms: number) => formatLagos(ms, { day: 'numeric', month: 'short', year: 'numeric' }, 'en-GB')
const dayTime = (ms: number) => formatLagos(ms, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }, 'en-GB')
/** "Fri 31 Oct" for a Lagos "YYYY-MM-DD". */
const friday = (key: string) => formatLagos(Date.parse(`${key}T11:00:00Z`), { weekday: 'short', day: 'numeric', month: 'short' }, 'en-GB')

const GROUPS: { stage: Stage; title: string; icon: ComponentType<{ className?: string }>; tone: Tone }[] = [
  { stage: 'awaiting_note', title: 'Waiting for your note', icon: NotebookPen, tone: 'amber' },
  { stage: 'pending', title: 'Pending', icon: Hourglass, tone: 'neutral' },
  { stage: 'available', title: 'Available', icon: CheckCircle2, tone: 'green' },
  { stage: 'on_hold', title: 'On hold', icon: Pause, tone: 'rose' },
  { stage: 'paying', title: 'Being sent', icon: Send, tone: 'blue' },
  { stage: 'failed', title: 'Didn’t go through', icon: TriangleAlert, tone: 'rose' },
]

function lineDetail(line: PayoutLine, nextRunFriday: string) {
  switch (line.stage) {
    case 'awaiting_note':
      return line.noteOverdue
        ? 'Your note is overdue. Write it to start the 48 hours.'
        : `Write your note by ${line.noteDueAt ? dayTime(line.noteDueAt) : 'tomorrow'}. The 48 hours start when it’s done.`
    case 'pending':
      return line.availableAt ? `Available on ${dayTime(line.availableAt)}` : 'Pending'
    case 'available':
      return `In the run on ${friday(line.runWeekOf ?? nextRunFriday)}`
    case 'on_hold':
      return line.heldReason ?? 'On hold'
    case 'paying':
      return 'Sent to your bank. It usually arrives within minutes.'
    case 'failed':
      return 'It didn’t reach your bank. We’re sorting it out and will send it again.'
    default:
      return line.completedAt ? `Paid ${day(line.completedAt)}` : 'Paid'
  }
}

function statementBadge(status: Statement['status']) {
  if (status === 'success') return <StatusBadge tone="green">Paid</StatusBadge>
  if (status === 'failed' || status === 'reversed') return <StatusBadge tone="rose">Didn’t go through</StatusBadge>
  return <StatusBadge tone="blue">Being sent</StatusBadge>
}

export function PhysioPayouts() {
  const data = useQuery(myPayoutsRef, {})
  const [openStatement, setOpenStatement] = useState<Statement | null>(null)

  const grouped = useMemo(() => {
    const map = new Map<Stage, PayoutLine[]>()
    for (const line of data?.lines ?? []) map.set(line.stage, [...(map.get(line.stage) ?? []), line])
    return map
  }, [data])

  // Independent physios: nothing to show
  if (data === null) return null

  const paidByHand = grouped.get('paid') ?? []
  const totals = (stage: Stage) => (grouped.get(stage) ?? []).reduce((sum, line) => sum + line.amountKobo, 0)
  const hasAnything = Boolean(data && (data.lines.length > 0 || data.statements.length > 0))

  return (
    <div id="payouts" className="scroll-mt-24">
      <Panel
        title="Rehabify Care payouts"
        description={
          data?.bank
            ? `Paid on Fridays to ${data.bank.bankName} ending ${data.bank.last4}. You get the full amount: no fees or deductions.`
            : 'Paid on Fridays. You get the full amount: no fees or deductions.'
        }
        info="After a session, mark it complete and write your note within 24 hours. The payout is then Pending for 48 hours, becomes Available, and goes out in the next Friday run. If a patient raises a concern about a session, its payout is on hold until we’ve looked into it."
      >
        {data === undefined ? (
          <LoadingBlocks rows={3} className="p-5" />
        ) : !hasAnything ? (
          <EmptyState
            icon={<ReceiptText />}
            title="No payouts yet"
            description="When you complete a Rehabify Care session and write your note, its payout shows here."
          />
        ) : (
          <div className="space-y-6 px-5 pb-5 pt-3 sm:px-6">
            {!data.bank && (
              <p className="rounded-2xl bg-pt-amber-bg px-4 py-3 text-sm text-pt-amber-fg">
                Add a payout account so we can pay you.{' '}
                <Link href="/dashboard/physiotherapist/settings/payout" className="font-semibold underline underline-offset-2">
                  Add account
                </Link>
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GROUPS.slice(0, 4).map((group) => (
                <div key={group.stage} className="rounded-2xl bg-pt-sunken px-3.5 py-3">
                  <p className="text-xs font-medium text-pt-muted">{group.title}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-pt-ink">{naira(totals(group.stage))}</p>
                  <p className="text-[11px] text-pt-faint">
                    {(grouped.get(group.stage) ?? []).length} {(grouped.get(group.stage) ?? []).length === 1 ? 'session' : 'sessions'}
                  </p>
                </div>
              ))}
            </div>

            {GROUPS.map((group) => {
              const lines = grouped.get(group.stage) ?? []
              if (lines.length === 0) return null
              const Icon = group.icon
              return (
                <section key={group.stage} className="space-y-2">
                  <SectionLabel className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    {group.title}
                  </SectionLabel>
                  <ul className="divide-y divide-pt-line rounded-2xl border border-pt-line">
                    {lines.map((line) => (
                      <li key={line._id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-pt-ink">
                            {line.patient} · {line.service}
                          </p>
                          <p className="text-xs text-pt-muted">
                            {line.sessionAt ? `${day(line.sessionAt)} · ` : ''}
                            {lineDetail(line, data.nextRunFriday)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {line.writeNoteHref && (
                            <Link href={line.writeNoteHref} className={cn(softButtonClass, 'inline-flex h-8 items-center px-3 text-xs font-semibold')}>
                              Write note
                            </Link>
                          )}
                          <span className="text-sm font-semibold tabular-nums text-pt-ink">{naira(line.amountKobo)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}

            {(data.statements.length > 0 || paidByHand.length > 0) && (
              <section className="space-y-2">
                <SectionLabel className="flex items-center gap-1.5">
                  <ReceiptText className="h-3.5 w-3.5" />
                  Paid
                </SectionLabel>
                <ul className="rounded-2xl border border-pt-line p-1">
                  {data.statements.map((statement) => (
                    <li key={statement._id}>
                      <button
                        type="button"
                        className={cn(listRowClass, 'w-full rounded-xl px-3 text-left sm:px-3')}
                        onClick={() => setOpenStatement(statement)}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-pt-ink">
                            {statement.weekOf ? `Run of ${friday(statement.weekOf)}` : 'Payout'}
                            {statementBadge(statement.status)}
                          </p>
                          <p className="text-xs text-pt-muted">
                            {statement.lines.length} {statement.lines.length === 1 ? 'session' : 'sessions'}
                            {statement.completedAt && statement.status === 'success' ? ` · sent ${day(statement.completedAt)}` : ''}
                          </p>
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-pt-ink">{naira(statement.amountKobo)}</span>
                        <ChevronRight className="h-4 w-4 text-pt-faint" />
                      </button>
                    </li>
                  ))}
                  {paidByHand.map((line) => (
                    <li key={line._id} className="flex items-center gap-3 px-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-pt-ink">
                          {line.patient} · {line.service}
                        </p>
                        <p className="text-xs text-pt-muted">
                          {lineDetail(line, data.nextRunFriday)}
                          {line.transferReference ? ` · Ref ${line.transferReference}` : ''}
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-pt-ink">{naira(line.amountKobo)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </Panel>

      <PhysioDrawer
        open={openStatement !== null}
        onOpenChange={(open) => !open && setOpenStatement(null)}
        title={openStatement?.weekOf ? `Statement: run of ${friday(openStatement.weekOf)}` : 'Statement'}
        description={openStatement ? `${naira(openStatement.amountKobo)} · ${openStatement.lines.length} ${openStatement.lines.length === 1 ? 'session' : 'sessions'}` : undefined}
      >
        {openStatement && (
          <div className="space-y-5">
            <div className="divide-y divide-pt-line rounded-2xl border border-pt-line px-3">
              <DetailRow label="Status">{statementBadge(openStatement.status)}</DetailRow>
              {openStatement.completedAt && openStatement.status === 'success' && <DetailRow label="Sent">{day(openStatement.completedAt)}</DetailRow>}
              <DetailRow label="Paid to">
                {openStatement.bankName ?? 'Your bank'}
                {openStatement.accountLast4 ? ` ending ${openStatement.accountLast4}` : ''}
              </DetailRow>
              <DetailRow label="Transfer reference">
                <span className="break-all font-mono text-xs">{openStatement.reference}</span>
              </DetailRow>
            </div>

            <div className="space-y-2">
              <SectionLabel>Sessions</SectionLabel>
              <ul className="divide-y divide-pt-line rounded-2xl border border-pt-line">
                {openStatement.lines.map((line, index) => (
                  <li key={index} className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-pt-ink">{line.patient}</p>
                      <p className="text-xs text-pt-muted">
                        {line.service}
                        {line.sessionAt ? ` · ${day(line.sessionAt)}` : ''}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-pt-ink">{naira(line.amountKobo)}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-semibold text-pt-ink">Total</span>
                  <span className="text-sm font-semibold tabular-nums text-pt-ink">{naira(openStatement.amountKobo)}</span>
                </li>
              </ul>
              <p className="text-xs text-pt-muted">Paid in full, with no fees or deductions.</p>
            </div>
          </div>
        )}
      </PhysioDrawer>
    </div>
  )
}
