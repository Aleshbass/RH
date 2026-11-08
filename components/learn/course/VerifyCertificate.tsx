'use client'

/**
 * /learn/verify/<code>: anyone (an employer, a clinic) can check a Rehabify Learn certificate.
 * Shows the certificate as issued, so what they see matches what the physio holds.
 */

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from 'convex/react'
import { BadgeCheck, Search, SearchX, ShieldAlert } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { verifyCertificate } from '@/convex/learn'
import type { QueryResult } from '@/lib/convexUntyped'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { displayFont, fieldClass, pillInk } from '../shared'
import { CertificatePreview, useCertificate } from './Certificate'
import { dateOnly } from './shared'

type Verified = QueryResult<typeof verifyCertificate>

function Lookup({ initial = '' }: { initial?: string }) {
  const router = useRouter()
  const [code, setCode] = useState(initial)
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const clean = code.trim().toUpperCase()
        if (clean) router.push(`/learn/verify/${encodeURIComponent(clean)}`)
      }}
    >
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="RHL-XXXX-XXXX"
        aria-label="Certificate number"
        className={cn(fieldClass, 'flex-1 uppercase tracking-wide')}
      />
      <button type="submit" className={cn(pillInk, 'h-12 shrink-0 px-5')}>
        <Search className="h-4 w-4" /> Check
      </button>
    </form>
  )
}

function Valid({ result }: { result: Extract<Verified, { state: 'valid' }> }) {
  useEffect(() => playSound('approve'), [result.code])
  const { src, failed } = useCertificate({
    name: result.name,
    code: result.code,
    programTitle: result.programTitle,
    cohortLabel: result.cohortLabel,
    dateRange: result.dateRange,
    duration: result.duration,
    issuedAt: result.issuedAt,
    signatoryName: result.signatoryName,
    signatoryTitle: result.signatoryTitle,
    signatures: result.signatures,
    note: result.note,
  })
  return (
    <>
      <div className="flex items-start gap-4 rounded-[1.75rem] bg-rh-ink p-5 text-white sm:p-6">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rh-lime text-rh-ink">
          <BadgeCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rh-lime">Valid certificate</p>
          <p className={cn('mt-1 text-[24px] leading-tight', displayFont)}>{result.name}</p>
          <p className="mt-1 text-sm leading-6 text-white/70">
            Completed the {result.programTitle}, {result.cohortLabel} ({result.dateRange}). Issued {dateOnly(result.issuedAt)}.
          </p>
        </div>
      </div>
      <CertificatePreview src={src} failed={failed} className="mt-5" />
    </>
  )
}

export function VerifyCertificate() {
  const params = useParams()
  const code = decodeURIComponent(String(params.code ?? ''))
  const result = useQuery(api.learn.verifyCertificate, { code }) as Verified | undefined

  return (
    <div className="min-h-[100dvh] bg-rh-cream">
      <header className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
        <Link href="/learn" className="flex items-center gap-2" aria-label="Rehabify Learn">
          <Image src="/logos/Ink%20MainRehabify.svg" alt="Rehabify" width={96} height={30} className="h-7 w-auto" />
          <span className="rounded-full bg-rh-ink px-2 py-0.5 text-[11px] font-semibold text-rh-lime">Learn</span>
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
        <h1 className={cn('text-[30px] leading-tight tracking-tight text-rh-ink sm:text-[38px]', displayFont)}>Certificate check</h1>
        <p className="mt-1 text-[15px] text-rh-ink/60">Rehabify Learn certificates carry a number you can check here.</p>

        <div className="mt-6">
          {result === undefined ? (
            <div className="h-28 animate-pulse rounded-[1.75rem] bg-white" />
          ) : result.state === 'valid' ? (
            <Valid result={result} />
          ) : (
            <div className="flex items-start gap-4 rounded-[1.75rem] bg-white p-5 sm:p-6">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rh-rose text-rh-ink">
                {result.state === 'revoked' ? <ShieldAlert className="h-5 w-5" /> : <SearchX className="h-5 w-5" />}
              </span>
              <div>
                <p className="text-[17px] font-semibold text-rh-ink">
                  {result.state === 'revoked' ? 'This certificate has been withdrawn' : 'No certificate with this number'}
                </p>
                <p className="mt-1 text-sm leading-6 text-rh-ink/60">
                  {result.state === 'revoked'
                    ? `Certificate ${result.code} is no longer valid.`
                    : 'Check the number on the certificate. It looks like RHL-7K2M-9QXA.'}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 rounded-[1.75rem] bg-white/70 p-5 ring-1 ring-inset ring-rh-ink/[0.06] sm:p-6">
          <p className="text-sm font-semibold text-rh-ink">Check another certificate</p>
          <div className="mt-3">
            <Lookup />
          </div>
        </div>
      </main>
    </div>
  )
}
