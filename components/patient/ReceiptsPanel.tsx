'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ChevronRight, Receipt } from '@/components/icons'
import { Panel, StatusBadge } from '@/components/patient/ui'

type ReceiptRow = {
  number: string
  kind: 'payment' | 'refund'
  description: string
  totalKobo: number
  paidAt: number
  token: string
}

// A plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const myReceiptsRef = makeFunctionReference<'query', Record<string, never>, ReceiptRow[]>('payments:myReceipts')

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`
const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' })

/** Every payment and refund receipt, each opening a printable copy. */
export function ReceiptsPanel() {
  const receipts = useQuery(myReceiptsRef, {})
  if (!receipts?.length) return null
  return (
    <Panel title="Receipts" description="For every payment and refund. Open one to print or save it.">
      <ul className="divide-y divide-pt-line">
        {receipts.map((receipt) => (
          <li key={receipt.number}>
            <Link href={`/receipt/${receipt.token}`} target="_blank" className="flex items-center gap-3 py-3 transition-colors hover:text-pt-ink">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pt-sunken text-pt-muted">
                <Receipt className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-pt-ink">{receipt.description}</span>
                <span className="text-xs text-pt-muted">
                  {receipt.number} · {day(receipt.paidAt)}
                </span>
              </span>
              {receipt.kind === 'refund' && <StatusBadge tone="green">Refund</StatusBadge>}
              <span className="text-sm font-semibold tabular-nums text-pt-ink">{naira(receipt.totalKobo)}</span>
              <ChevronRight className="h-4 w-4 text-pt-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
