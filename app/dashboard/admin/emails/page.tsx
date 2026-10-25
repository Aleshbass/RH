'use client'

import { Suspense, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Loader2, Mail, Search, Users } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AdminPage,
  cardClass,
  EmptyState,
  inputClass,
  listRowClass,
  PageHeader,
  Panel,
  primaryButtonClass,
  StatusBadge,
  tabsListClass,
} from '@/components/admin/ui'
import { Composer } from '@/components/admin/emails/Composer'
import { AUDIENCE_LABEL } from '@/lib/email/marketing'
import { marketingApi, type MarketingCampaign } from '@/lib/marketingApi'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type Tab = 'compose' | 'sent' | 'contacts'
const TABS: Tab[] = ['compose', 'sent', 'contacts']

const STATUS: Record<MarketingCampaign['status'], { label: string; tone: 'amber' | 'teal' | 'green' | 'red' }> = {
  preparing: { label: 'Preparing audience', tone: 'amber' },
  sending: { label: 'Sending', tone: 'teal' },
  sent: { label: 'Sent', tone: 'green' },
  partial: { label: 'Partly sent', tone: 'amber' },
  failed: { label: 'Failed', tone: 'red' },
}

function campaignProgress(c: MarketingCampaign) {
  if (c.status === 'sent') return `Sent to ${c.sentCount} ${c.sentCount === 1 ? 'person' : 'people'}`
  if (c.audience === 'individual') {
    const waiting = c.pendingCount
    return `${c.sentCount} of ${c.recipientCount} sent${waiting > 0 ? ` · ${waiting} waiting` : ''}${c.failedCount ? ` · ${c.failedCount} failed` : ''}`
  }
  if (c.status === 'preparing' || c.status === 'sending') return `${c.recipientCount} people · preparing the audience in Resend`
  return `${c.sentCount} of ${c.recipientCount} sent`
}

/** "ada@x.com, Ada Obi" or "Ada Obi <ada@x.com>" or just "ada@x.com", one per line. */
function parseContacts(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const angle = line.match(/^(.*)<([^>]+)>$/)
      if (angle) return { email: angle[2].trim(), name: angle[1].trim().replace(/^"|"$/g, '') || undefined }
      const [first, ...rest] = line.split(/[,;\t]/).map((p) => p.trim())
      if (first.includes('@')) return { email: first, name: rest.join(' ').trim() || undefined }
      const email = rest.find((p) => p.includes('@'))
      return email ? { email, name: first || undefined } : { email: first }
    })
}

function SentList() {
  const campaigns = useQuery(marketingApi.campaigns, {})
  return (
    <Panel>
      {campaigns === undefined ? (
        <div className="space-y-2 p-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-black/[0.04] dark:bg-white/[0.04]" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState icon={<Mail />} title="Nothing sent yet" description="Emails you send appear here with their progress." />
      ) : (
        <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {campaigns.map((c) => (
            <li key={c._id} className={cn(listRowClass, 'flex-col items-stretch gap-1.5 py-4 sm:flex-row sm:items-center sm:gap-4')}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-rh-ink dark:text-white">{c.subject}</p>
                <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {AUDIENCE_LABEL[c.audience]} · {format(c.createdAt, "d MMM yyyy, HH:mm")} · {c.createdByName}
                </p>
                <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">{campaignProgress(c)}</p>
                {c.lastError && (c.status === 'failed' || c.status === 'partial') && (
                  <p className="mt-1 text-xs text-rose-600">{c.lastError}</p>
                )}
              </div>
              <StatusBadge tone={STATUS[c.status].tone} className="self-start sm:self-center">
                {STATUS[c.status].label}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function ContactsPanel() {
  const contacts = useQuery(marketingApi.contacts, {})
  const addContacts = useMutation(marketingApi.addContacts)
  const removeContact = useMutation(marketingApi.removeContact)
  const [text, setText] = useState('')
  const [tags, setTags] = useState('')
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')

  const parsed = useMemo(() => parseContacts(text), [text])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (contacts ?? []).filter(
      (c) => !q || c.email.includes(q) || (c.name ?? '').toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q))
    )
  }, [contacts, search])

  const add = async () => {
    setAdding(true)
    try {
      const { added, skipped } = await addContacts({
        contacts: parsed,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      })
      playSound('success')
      toast.success(`Added ${added} ${added === 1 ? 'contact' : 'contacts'}${skipped ? `, skipped ${skipped} (already added or not a valid email)` : ''}`)
      setText('')
    } catch (error) {
      playSound('error')
      toast.error(error instanceof Error ? error.message.replace(/^.*ConvexError: /, '').split('\n')[0] : 'Could not add contacts')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      <section className={cn(cardClass, 'space-y-4 self-start p-5')}>
        <div>
          <h2 className="text-base font-semibold text-rh-ink dark:text-white">Add contacts</h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            People without a Rehabify account, such as investors or event sign-ups. Send to them with &ldquo;Added contacts&rdquo;.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ct-list" className="text-sm font-medium text-rh-ink dark:text-white">Emails</Label>
          <Textarea
            id="ct-list"
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'ada@example.com, Ada Obi\ntunde@example.com'}
            className={cn(inputClass, 'font-mono text-xs')}
          />
          <p className="text-xs text-neutral-500">One per line. A name after a comma is optional.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ct-tags" className="text-sm font-medium text-rh-ink dark:text-white">Tags <span className="font-normal text-neutral-400">(optional)</span></Label>
          <Input id="ct-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. investors, launch event" className={inputClass} />
        </div>
        <Button onClick={add} disabled={adding || parsed.length === 0} className={cn(primaryButtonClass, 'w-full')}>
          {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Add {parsed.length > 0 ? parsed.length : ''} {parsed.length === 1 ? 'contact' : 'contacts'}
        </Button>
        <p className="text-xs text-neutral-500">People who unsubscribe from an email are handled by Resend and won&apos;t get group emails again.</p>
      </section>

      <Panel>
        <div className="flex flex-col gap-3 border-b border-black/[0.05] p-4 dark:border-white/[0.06] sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-sm font-semibold text-rh-ink dark:text-white">
            {contacts === undefined ? 'Contacts' : `${contacts.length} ${contacts.length === 1 ? 'contact' : 'contacts'}`}
          </p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className={cn(inputClass, 'pl-9 sm:w-[220px]')} />
          </div>
        </div>
        {contacts === undefined ? (
          <div className="h-40 animate-pulse" />
        ) : shown.length === 0 ? (
          <EmptyState icon={<Users />} title={contacts.length === 0 ? 'No contacts yet' : 'No matches'} description={contacts.length === 0 ? 'Add people on the left.' : undefined} />
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {shown.map((c) => (
              <li key={c._id} className={listRowClass}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-rh-ink dark:text-white">{c.name || c.email}</span>
                  {c.name && <span className="block truncate text-xs text-neutral-500">{c.email}</span>}
                </span>
                <span className="hidden gap-1 sm:flex">
                  {c.tags.map((t) => (
                    <StatusBadge key={t} tone="neutral">{t}</StatusBadge>
                  ))}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  onClick={async () => {
                    try {
                      await removeContact({ id: c._id })
                      toast.success('Contact removed')
                    } catch {
                      toast.error('Could not remove the contact')
                    }
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function EmailsAdmin() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const raw = searchParams?.get('tab') as Tab | null
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'compose'
  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams?.toString())
    params.set('tab', next)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }
  const overview = useQuery(marketingApi.overview, {})

  return (
    <AdminPage>
      <PageHeader
        title="Email campaigns"
        description="Send news and updates to patients, physiotherapists, clinics, partners, or anyone you add."
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="space-y-4">
        <TabsList className={tabsListClass}>
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
        </TabsList>
        <TabsContent value="compose" className="mt-0">
          <Composer overview={overview} onSent={() => setTab('sent')} />
        </TabsContent>
        <TabsContent value="sent" className="mt-0">
          <SentList />
        </TabsContent>
        <TabsContent value="contacts" className="mt-0">
          <ContactsPanel />
        </TabsContent>
      </Tabs>
    </AdminPage>
  )
}

export default function AdminEmailsPage() {
  return (
    <Suspense fallback={null}>
      <EmailsAdmin />
    </Suspense>
  )
}
