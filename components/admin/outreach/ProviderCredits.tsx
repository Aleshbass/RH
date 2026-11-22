'use client'

/**
 * Admin › Employer outreach: what each contact-data provider has left this month (Hunter searches
 * and checks, Apollo connected or not, Prospeo credits), from convex/employerContacts.ts. The
 * numbers are cached on the server for 10 minutes, so opening the page costs nothing.
 */

import { useEffect, useRef, useState } from 'react'
import { useAction, useQuery } from 'convex/react'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { Loader2, RefreshCw } from '@/components/icons'
import { StatusBadge, cardClass } from '@/components/admin/ui'
import { cn } from '@/lib/utils'
import { employerApi, type ContactProvider, type ProviderView } from './employerApi'

const NAME: Record<ContactProvider, string> = { hunter: 'Hunter', apollo: 'Apollo', prospeo: 'Prospeo' }

const renews = (day: string | null) => {
  if (!day) return ''
  const at = Date.parse(`${day}T00:00:00Z`)
  return Number.isFinite(at) ? ` · renews ${format(at, 'd MMM')}` : ''
}

function line(provider: ContactProvider, p: ProviderView): { tone: 'green' | 'amber' | 'red' | 'neutral'; status: string; detail: string } {
  if (!p.configured) return { tone: 'neutral', status: 'Not set up', detail: `Add ${provider.toUpperCase()}_API_KEY on Convex` }
  if (p.ok === null) return { tone: 'neutral', status: 'Checking…', detail: '' }
  if (!p.ok) return { tone: 'red', status: 'Not working', detail: p.message ?? 'The key was refused' }
  if (provider === 'apollo') return { tone: 'green', status: 'Connected', detail: 'People search is free; looking up an email uses a credit' }
  const parts: string[] = []
  if (p.searchesLeft !== null) parts.push(`${p.searchesLeft} of ${p.searchesAvailable ?? '?'} searches`)
  if (p.verificationsLeft !== null) parts.push(`${p.verificationsLeft} of ${p.verificationsAvailable ?? '?'} checks`)
  if (!parts.length && p.creditsLeft !== null) parts.push(`${p.creditsLeft} of ${p.creditsAvailable ?? '?'} credits`)
  const empty = [p.searchesLeft, p.verificationsLeft, p.creditsLeft].some((n) => n === 0)
  return {
    tone: empty ? 'amber' : 'green',
    status: parts.length ? `${parts.join(' · ')} left` : 'Connected',
    detail: `${p.plan ? `${p.plan} plan` : ''}${renews(p.resetDate)}`.replace(/^ · /, ''),
  }
}

export function ProviderCredits() {
  const data = useQuery(employerApi.providers, {})
  const refresh = useAction(employerApi.refreshProviders)
  const [busy, setBusy] = useState(false)
  const asked = useRef(false)

  // Once per visit: the server answers from its 10-minute cache unless a run spent something
  useEffect(() => {
    if (asked.current) return
    asked.current = true
    refresh({}).catch(() => undefined)
  }, [refresh])

  if (!data) return null
  const checked = (['hunter', 'apollo', 'prospeo'] as const).map((k) => data[k].checkedAt ?? 0).reduce((a, b) => Math.max(a, b), 0)

  return (
    <section className={cn(cardClass, 'flex flex-col gap-3 p-4 sm:flex-row sm:items-start')} aria-label="Contact data credits">
      <div className="grid flex-1 gap-3 sm:grid-cols-3">
        {(['hunter', 'apollo', 'prospeo'] as const).map((k) => {
          const l = line(k, data[k])
          return (
            <div key={k} className="min-w-0 space-y-0.5">
              <p className="flex items-center gap-2 text-sm font-medium text-rh-ink dark:text-white">
                {NAME[k]} <StatusBadge tone={l.tone}>{l.tone === 'green' ? 'On' : l.tone === 'neutral' && !data[k].configured ? 'Off' : l.tone === 'amber' ? 'Low' : l.tone === 'red' ? 'Problem' : '…'}</StatusBadge>
              </p>
              <p className="text-xs text-rh-ink dark:text-neutral-200">{l.status}</p>
              {l.detail && <p className="truncate text-xs text-neutral-500">{l.detail}</p>}
            </div>
          )
        })}
      </div>
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-1 self-start text-xs text-neutral-500 hover:underline"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await refresh({ force: true })
          } catch {
            // The strip keeps the last numbers
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        {checked ? `Checked ${formatDistanceToNowStrict(checked, { addSuffix: true })}` : 'Check now'}
      </button>
    </section>
  )
}
