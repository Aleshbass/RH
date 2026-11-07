'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { format } from 'date-fns'
import { Download, Search, SearchX, Users } from '@/components/icons'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState, FilterChips, StatusBadge, cardClass, downloadCsv, inputClass, softButtonClass, tabsListClass } from '@/components/admin/ui'
import { AUDIENCE_LABEL, renderMarketingEmail } from '@/lib/email/marketing'
import { marketingApi, type MarketingCampaignDetail, type MarketingRecipient } from '@/lib/marketingApi'
import type { Id } from '@/convex/_generated/dataModel'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'opened' | 'not_opened' | 'bounced' | 'waiting' | 'failed'

const SEGMENT_LABEL: Record<string, string> = {
  patients: 'Patient',
  physiotherapists: 'Physio',
  clinics: 'Clinic',
  partners: 'Partner',
  contacts: 'Contact',
}

function recipientState(r: MarketingRecipient): { label: string; tone: 'green' | 'teal' | 'amber' | 'red' | 'neutral' } {
  if (r.status === 'pending') return { label: 'Waiting', tone: 'amber' }
  if (r.status === 'failed') return { label: 'Failed', tone: 'red' }
  if (r.bounced) return { label: 'Bounced', tone: 'red' }
  if (r.complained) return { label: 'Marked as spam', tone: 'red' }
  if (r.clicked) return { label: 'Clicked', tone: 'green' }
  if (r.opened) return { label: 'Opened', tone: 'green' }
  if (r.delivered) return { label: 'Delivered', tone: 'teal' }
  return { label: 'Sent', tone: 'neutral' }
}

/**
 * Right-hand drawer for one sent campaign: the email exactly as it went out, and everyone it was
 * sent to with what Resend reported back (delivered, opened, bounced).
 */
export function CampaignSheet({ campaignId, onClose }: { campaignId: Id<'marketingCampaigns'> | null; onClose: () => void }) {
  // Keep the last campaign while the drawer slides closed
  const [shownId, setShownId] = useState(campaignId)
  if (campaignId && campaignId !== shownId) setShownId(campaignId)
  const data = useQuery(marketingApi.campaignDetail, shownId ? { campaignId: shownId } : 'skip')

  return (
    <Sheet open={Boolean(campaignId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto border-black/[0.06] bg-rh-canvas p-0 dark:border-white/[0.08] dark:bg-rh-ink sm:max-w-2xl"
      >
        {data === null ? (
          <>
            <SheetHeader className="sr-only">
              <SheetTitle>Campaign not found</SheetTitle>
              <SheetDescription>It may have been removed.</SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState icon={<SearchX />} title="We couldn't find this email" />
            </div>
          </>
        ) : data === undefined ? (
          <div className="space-y-3 p-5">
            <SheetHeader className="sr-only">
              <SheetTitle>Loading email</SheetTitle>
              <SheetDescription>Loading the email and its recipients.</SheetDescription>
            </SheetHeader>
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-[420px] w-full rounded-2xl" />
          </div>
        ) : (
          <SheetBody data={data} />
        )}
      </SheetContent>
    </Sheet>
  )
}

function SheetBody({ data }: { data: MarketingCampaignDetail }) {
  const { campaign, recipients, listSource, truncated } = data
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  // Same renderer as the real send; group emails greet by first name, so show a sample greeting
  const html = useMemo(
    () => renderMarketingEmail(campaign, { greetingName: campaign.audience === 'individual' ? recipients[0]?.name?.split(' ')[0] || 'there' : 'there' }),
    [campaign, recipients]
  )

  const counts = useMemo(
    () => ({
      all: recipients.length,
      opened: recipients.filter((r) => r.opened || r.clicked).length,
      not_opened: recipients.filter((r) => r.status === 'sent' && !r.opened && !r.clicked && !r.bounced).length,
      bounced: recipients.filter((r) => r.bounced || r.complained).length,
      waiting: recipients.filter((r) => r.status === 'pending').length,
      failed: recipients.filter((r) => r.status === 'failed').length,
    }),
    [recipients]
  )

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return recipients.filter((r) => {
      if (q && !r.email.includes(q) && !(r.name ?? '').toLowerCase().includes(q)) return false
      if (filter === 'opened') return r.opened || r.clicked
      if (filter === 'not_opened') return r.status === 'sent' && !r.opened && !r.clicked && !r.bounced
      if (filter === 'bounced') return r.bounced || r.complained
      if (filter === 'waiting') return r.status === 'pending'
      if (filter === 'failed') return r.status === 'failed'
      return true
    })
  }, [recipients, filter, search])

  const filterOptions = (
    [
      { value: 'all', label: 'Everyone', count: counts.all },
      { value: 'opened', label: 'Opened', count: counts.opened },
      { value: 'not_opened', label: 'Not opened', count: counts.not_opened },
      { value: 'bounced', label: 'Bounced', count: counts.bounced },
      { value: 'waiting', label: 'Waiting', count: counts.waiting },
      { value: 'failed', label: 'Failed', count: counts.failed },
    ] as { value: Filter; label: string; count: number }[]
  ).filter((o) => o.value === 'all' || o.count > 0)

  const exportCsv = () =>
    downloadCsv(`email-${format(campaign.createdAt, 'yyyy-MM-dd')}-recipients`, recipients.map((r) => ({
      Name: r.name ?? '',
      Email: r.email,
      Group: r.segment ? SEGMENT_LABEL[r.segment] ?? r.segment : '',
      Status: recipientState(r).label,
      Delivered: r.delivered ? 'yes' : '',
      Opened: r.opened ? 'yes' : '',
      Clicked: r.clicked ? 'yes' : '',
      Bounced: r.bounced ? 'yes' : '',
    })))

  return (
    <div className="flex min-h-full flex-col">
      <SheetHeader className="gap-1.5 border-b border-black/[0.05] bg-white px-5 pb-5 pt-5 text-left dark:border-white/[0.06] dark:bg-rh-ink-2">
        <SheetTitle className="pr-8 text-lg font-semibold leading-tight text-rh-ink dark:text-white">{campaign.subject}</SheetTitle>
        <SheetDescription className="text-xs text-neutral-500 dark:text-neutral-400">
          {AUDIENCE_LABEL[campaign.audience]} · {format(campaign.createdAt, 'd MMM yyyy, HH:mm')} · sent by {campaign.createdByName}
        </SheetDescription>
      </SheetHeader>

      <Tabs defaultValue="recipients" className="flex-1 space-y-4 p-5">
        <TabsList className={tabsListClass}>
          <TabsTrigger value="recipients">Recipients ({recipients.length}{truncated ? '+' : ''})</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
        </TabsList>

        <TabsContent value="recipients" className="mt-0 space-y-3">
          {listSource === 'events' && (
            <p className="rounded-xl bg-rh-peach p-3 text-xs text-[#b4690e] dark:bg-amber-400/10 dark:text-amber-300">
              This email went out before recipient lists were kept, so this shows only the people Resend reported a delivery or open for.
            </p>
          )}
          {truncated && <p className="text-xs text-neutral-500">Showing the first {recipients.length} people.</p>}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email" className={cn(inputClass, 'pl-9 sm:w-[240px]')} />
            </div>
            <button type="button" onClick={exportCsv} disabled={recipients.length === 0} className={cn(softButtonClass, 'h-9 gap-1.5')}>
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
          <FilterChips value={filter} onChange={setFilter} options={filterOptions} />

          {recipients.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title={campaign.status === 'preparing' || campaign.status === 'sending' ? 'Still sending' : 'No recipients recorded'}
              description={
                campaign.status === 'preparing' || campaign.status === 'sending'
                  ? 'People appear here as each group goes out.'
                  : 'Resend hasn’t reported any deliveries for this email.'
              }
            />
          ) : shown.length === 0 ? (
            <EmptyState icon={<SearchX />} title="No one matches" />
          ) : (
            <ul className={cn(cardClass, 'divide-y divide-black/[0.05] overflow-hidden dark:divide-white/[0.06]')}>
              {shown.map((r) => {
                const state = recipientState(r)
                const name = r.name || r.email
                return (
                  <li key={r.email} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      {r.userId ? (
                        <Link
                          href={`/dashboard/admin/users/${r.userId}`}
                          className="block truncate text-sm font-medium text-rh-ink underline-offset-2 hover:underline dark:text-white"
                        >
                          {name}
                        </Link>
                      ) : (
                        <p className="truncate text-sm font-medium text-rh-ink dark:text-white">{name}</p>
                      )}
                      <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                        {r.name ? r.email : null}
                        {r.segment && SEGMENT_LABEL[r.segment] ? `${r.name ? ' · ' : ''}${SEGMENT_LABEL[r.segment]}` : null}
                        {r.status === 'failed' && r.error ? ` · ${r.error}` : null}
                      </p>
                    </div>
                    <StatusBadge tone={state.tone} className="shrink-0">
                      {state.label}
                    </StatusBadge>
                  </li>
                )
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="email" className="mt-0">
          <div className={cn(cardClass, 'overflow-hidden')}>
            <div className="border-b border-black/[0.05] px-4 py-3 dark:border-white/[0.06]">
              <p className="truncate text-sm font-semibold text-rh-ink dark:text-white">{campaign.subject}</p>
              <p className="truncate text-xs text-neutral-500">{campaign.previewText || campaign.heading}</p>
            </div>
            <div className="flex justify-center bg-rh-canvas p-3 dark:bg-black/20">
              <iframe title="Email as sent" srcDoc={html} sandbox="" className="h-[620px] w-full rounded-xl border-0 bg-white" />
            </div>
          </div>
          {campaign.audience !== 'individual' && (
            <p className="mt-2 text-xs text-neutral-500">Each person saw their own first name in the greeting, and an unsubscribe link at the bottom.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
