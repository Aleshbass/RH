'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { CheckCircle2, Loader2 } from '@/components/icons'
import { cn } from '@/lib/utils'

type CheckIn = { provider: string; visitDate: string; answered: boolean; paidDirectly: boolean | null } | null
type Method = 'cash' | 'bank_transfer' | 'pos' | 'other'

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const checkInRef = makeFunctionReference<'query', { token: string }, CheckIn>('visitCheckIns:getVisitCheckIn')
const answerRef = makeFunctionReference<
  'mutation',
  { token: string; paidDirectly: boolean; amountNaira?: number; method?: Method },
  { alreadyAnswered: boolean }
>('visitCheckIns:answerVisitCheckIn')

const METHODS: { id: Method; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'bank_transfer', label: 'Bank transfer' },
  { id: 'pos', label: 'POS' },
  { id: 'other', label: 'Other' },
]

const card = 'rounded-[1.75rem] bg-white p-6 sm:p-8'
const choice = 'w-full rounded-2xl border border-rh-ink/10 px-4 py-3.5 text-left text-[15px] font-medium transition-colors hover:border-rh-ink/30'

export function VisitCheckIn({ token }: { token: string }) {
  const data = useQuery(checkInRef, { token })
  const answer = useMutation(answerRef)
  const [paidDirectly, setPaidDirectly] = useState<boolean | null>(null)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<Method>('cash')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const header = <Image src="/logos/MainRehabify.svg" alt="Rehabify" width={120} height={33} className="mb-6 h-8 w-auto" />

  if (data === undefined) {
    return (
      <div className={cn(card, 'flex items-center gap-2 text-sm text-rh-ink/60')}>
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    )
  }
  if (data === null) {
    return (
      <div className={card}>
        {header}
        <h1 className="text-xl font-bold">This link isn’t valid</h1>
        <p className="mt-2 text-sm text-rh-ink/70">Open the latest email from Rehabify, or write to support@physioaroundme.com.</p>
      </div>
    )
  }
  if (done || data.answered) {
    return (
      <div className={card}>
        {header}
        <CheckCircle2 className="h-8 w-8 text-[#00cd0f]" />
        <h1 className="mt-3 text-xl font-bold">Thank you</h1>
        <p className="mt-2 text-sm text-rh-ink/70">
          {(done ? paidDirectly : data.paidDirectly)
            ? 'We’ve noted it. Someone from Rehabify may contact you to sort it out. Next time, please pay through Rehabify only.'
            : 'That’s all we needed. Thanks for paying through Rehabify.'}
        </p>
      </div>
    )
  }

  const submit = async (paid: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const naira = Number(amount.replace(/[^\d.]/g, ''))
      await answer({
        token,
        paidDirectly: paid,
        ...(paid ? { amountNaira: Number.isFinite(naira) && naira > 0 ? naira : undefined, method } : {}),
      })
      setPaidDirectly(paid)
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*ConvexError:\s*/, '') : 'That didn’t work. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={card}>
      {header}
      <h1 className="text-xl font-bold leading-snug">Did you pay {data.provider} anything directly for your visit on {data.visitDate}?</h1>
      <p className="mt-2 text-sm text-rh-ink/70">
        As a Rehabify patient you pay through Rehabify, not to the physio or clinic. Your answer goes to Rehabify only.
      </p>

      {paidDirectly !== true ? (
        <div className="mt-6 space-y-2.5">
          <button type="button" disabled={busy} className={choice} onClick={() => void submit(false)}>
            No, I only paid through Rehabify
          </button>
          <button type="button" disabled={busy} className={choice} onClick={() => setPaidDirectly(true)}>
            Yes, I paid them directly
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="amount" className="mb-1.5 block text-sm font-medium">
              How much? (₦)
            </label>
            <input
              id="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 20000"
              className="h-12 w-full rounded-xl border border-rh-ink/15 px-3 text-base outline-none focus:border-rh-ink/40"
            />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">How did you pay?</p>
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setMethod(option.id)}
                  className={cn(
                    'h-11 rounded-xl border text-sm font-medium',
                    method === option.id ? 'border-rh-ink bg-rh-ink text-white' : 'border-rh-ink/15 hover:border-rh-ink/30'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => setPaidDirectly(null)} className="h-12 flex-1 rounded-full border border-rh-ink/15 text-sm font-semibold">
              Back
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit(true)}
              className="inline-flex h-12 flex-[2] items-center justify-center rounded-full bg-rh-ink text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  )
}
