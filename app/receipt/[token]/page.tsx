import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { makeFunctionReference } from 'convex/server'
import { getConvexClient } from '@/lib/convex-client'
import { PrintButton } from './PrintButton'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Receipt | Rehabify',
  robots: { index: false, follow: false },
}

type Receipt = {
  number: string
  kind: 'payment' | 'refund'
  name: string | null
  email: string | null
  description: string
  lines: { label: string; amountKobo: number }[]
  totalKobo: number
  reference: string | null
  relationship: 'rehabify_care' | 'independent' | 'clinic' | null
  paidAt: number
}

// A plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const receiptRef = makeFunctionReference<'query', { token: string }, Receipt | null>('payments:receiptByToken')

const naira = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: kobo % 100 ? 2 : 0, maximumFractionDigits: 2 })}`
const dateTime = (ms: number) =>
  new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })

/** A printable receipt for one payment or refund, opened from the emailed link. */
export default async function ReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let receipt: Receipt | null = null
  try {
    receipt = await getConvexClient().query(receiptRef, { token })
  } catch {
    receipt = null
  }
  if (!receipt) notFound()
  const refund = receipt.kind === 'refund'

  return (
    <main className="min-h-screen bg-rh-canvas px-4 py-10 text-rh-ink print:bg-white print:p-0 sm:py-16">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex justify-end print:hidden">
          <PrintButton />
        </div>
        <article className="rounded-[1.75rem] bg-white p-6 sm:p-10 print:rounded-none print:p-0">
          <header className="flex items-start justify-between gap-4">
            <Image src="/logos/MainRehabify.svg" alt="Rehabify" width={132} height={36} className="h-9 w-auto" />
            <div className="text-right">
              <h1 className="text-xl font-bold tracking-tight">{refund ? 'Refund receipt' : 'Receipt'}</h1>
              <p className="mt-0.5 font-mono text-sm text-rh-ink/60">{receipt.number}</p>
            </div>
          </header>

          <dl className="mt-8 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-rh-ink/50">{refund ? 'Refunded to' : 'Paid by'}</dt>
              <dd className="mt-0.5 font-medium">{receipt.name ?? receipt.email ?? '—'}</dd>
              {receipt.name && receipt.email && <dd className="text-rh-ink/60">{receipt.email}</dd>}
            </div>
            <div className="sm:text-right">
              <dt className="text-rh-ink/50">{refund ? 'Refunded on' : 'Paid on'}</dt>
              <dd className="mt-0.5 font-medium">{dateTime(receipt.paidAt)}</dd>
            </div>
          </dl>

          <p className="mt-6 text-sm text-rh-ink/70">For {receipt.description}</p>

          <table className="mt-4 w-full border-collapse text-sm">
            <tbody>
              {receipt.lines.map((line, i) => (
                <tr key={i} className="border-t border-rh-ink/10">
                  <td className="py-3">{line.label}</td>
                  <td className="py-3 text-right tabular-nums">{naira(line.amountKobo)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-rh-ink">
                <td className="py-3 font-semibold">{refund ? 'Total refunded' : 'Total paid'}</td>
                <td className="py-3 text-right text-lg font-bold tabular-nums">{naira(receipt.totalKobo)}</td>
              </tr>
            </tbody>
          </table>

          {receipt.reference && (
            <p className="mt-4 text-xs text-rh-ink/50">
              Payment reference <span className="font-mono">{receipt.reference}</span>
            </p>
          )}
          {refund && (
            <p className="mt-4 rounded-2xl bg-rh-canvas px-4 py-3 text-sm text-rh-ink/75">
              Refunds go back to the card or account you paid with. Banks usually show them within 5 to 10 business days.
            </p>
          )}

          <footer className="mt-10 border-t border-rh-ink/10 pt-5 text-xs leading-5 text-rh-ink/50">
            <p>Rehabify Limited · RC 6989173 · Okeoffa, Babasale, Oje, Ibadan, Oyo State, Nigeria</p>
            {receipt.relationship === 'rehabify_care' && <p>Medical services are exempt from VAT under the Nigeria Tax Act 2025.</p>}
            {receipt.relationship === 'clinic' && <p>Paid to the clinic through Rehabify. The clinic’s own payment terms apply.</p>}
            {receipt.relationship === 'independent' && <p>Paid to your physiotherapist through Rehabify. Their own payment terms apply.</p>}
            <p>Questions? support@physioaroundme.com, quoting {receipt.number}.</p>
          </footer>
        </article>
      </div>
    </main>
  )
}
