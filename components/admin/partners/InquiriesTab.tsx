'use client'

import { useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { format } from 'date-fns'
import { Mail, MessageSquare, Phone, Search } from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cardClass, EmptyState, FilterChips, inputClass, primaryButtonClass, softButtonClass, StatusBadge } from '@/components/admin/ui'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { errorMessage, insetClass, linkClass, LoadingBlock, selectContentClass } from './shared'

type InquiryStatus = 'new' | 'contacted' | 'closed'
type Inquiry = FunctionReturnType<typeof api.adminPartnerships.getPartnershipInquiries>[number] & {
  // Older website forms sent these; keep showing them when present
  organizationName?: string
  organizationType?: string
  contactName?: string
  phone?: string
  employeeCount?: string | number
}

const STATUS_TONE: Record<InquiryStatus, 'amber' | 'teal' | 'neutral'> = { new: 'amber', contacted: 'teal', closed: 'neutral' }
const STATUS_LABEL: Record<InquiryStatus, string> = { new: 'New', contacted: 'Contacted', closed: 'Closed' }

// "Book a demo" requests from the partners page share this table, marked kind: "demo"
type InquiryKind = 'all' | 'demo' | 'partnership'
const isDemo = (inquiry: Inquiry) => inquiry.kind === 'demo'

export function InquiriesTab({ inquiries }: { inquiries: Inquiry[] | undefined }) {
  const updateStatus = useMutation(api.adminPartnerships.updatePartnershipInquiryStatus)
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<InquiryKind>('all')
  const [filter, setFilter] = useState<'all' | InquiryStatus>('all')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const ofKind = useMemo(
    () => (inquiries ?? []).filter((i) => kind === 'all' || (kind === 'demo' ? isDemo(i) : !isDemo(i))),
    [inquiries, kind],
  )

  const kindCounts = useMemo(() => {
    const rows = inquiries ?? []
    const demos = rows.filter(isDemo).length
    return { all: rows.length, demo: demos, partnership: rows.length - demos }
  }, [inquiries])

  const counts = useMemo(() => ({
    all: ofKind.length,
    new: ofKind.filter((i) => i.status === 'new').length,
    contacted: ofKind.filter((i) => i.status === 'contacted').length,
    closed: ofKind.filter((i) => i.status === 'closed').length,
  }), [ofKind])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return ofKind.filter((inquiry) => {
      if (filter !== 'all' && inquiry.status !== filter) return false
      if (!q) return true
      const org = (inquiry.organization || inquiry.organizationName || '').toLowerCase()
      const contact = (inquiry.name || inquiry.contactName || '').toLowerCase()
      return org.includes(q) || contact.includes(q) || (inquiry.email || '').toLowerCase().includes(q)
    })
  }, [ofKind, filter, search])

  const changeStatus = async (inquiry: Inquiry, status: InquiryStatus) => {
    setUpdatingId(inquiry._id)
    try {
      await updateStatus({ id: inquiry._id, status })
      toast.success(`Marked as ${STATUS_LABEL[status].toLowerCase()}`)
    } catch (error) {
      playSound('error')
      toast.error(errorMessage(error, 'Failed to update status'))
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <FilterChips
        value={kind}
        onChange={setKind}
        options={[
          { value: 'all', label: 'Everything', count: kindCounts.all },
          { value: 'demo', label: 'Demo requests', count: kindCounts.demo },
          { value: 'partnership', label: 'Partnerships', count: kindCounts.partnership },
        ]}
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'new', label: 'New', count: counts.new },
            { value: 'contacted', label: 'Contacted', count: counts.contacted },
            { value: 'closed', label: 'Closed', count: counts.closed },
          ]}
        />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder="Search organisation, contact or email"
            className={cn(inputClass, 'pl-9 sm:w-[280px]')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {inquiries === undefined ? (
        <LoadingBlock className="h-48" />
      ) : filtered.length === 0 ? (
        <div className={cardClass}>
          <EmptyState
            icon={<MessageSquare />}
            title="No inquiries found"
            description={
              search || filter !== 'all' || kind !== 'all'
                ? 'Try adjusting your search or filters.'
                : 'Partnership inquiries and demo requests from the website appear here.'
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((inquiry) => {
            const status = inquiry.status as InquiryStatus
            return (
              <div key={inquiry._id} className={cn(cardClass, 'flex flex-col overflow-hidden md:flex-row')}>
                <div className="min-w-0 flex-1 space-y-4 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-rh-ink dark:text-white">
                          {inquiry.organization || inquiry.organizationName || 'Partner organisation'}
                        </h3>
                        {isDemo(inquiry) && <StatusBadge tone="teal">Demo request</StatusBadge>}
                        {inquiry.organizationType && <StatusBadge tone="teal">{inquiry.organizationType}</StatusBadge>}
                        <StatusBadge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusBadge>
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                        Submitted {format(inquiry.createdAt ?? inquiry._creationTime, "d MMM yyyy 'at' h:mm a")}
                      </p>
                    </div>
                    <Select value={status} onValueChange={(value) => changeStatus(inquiry, value as InquiryStatus)} disabled={updatingId === inquiry._id}>
                      <SelectTrigger className={cn(inputClass, 'h-8 w-[140px] text-xs')} aria-label="Inquiry status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className={selectContentClass}>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="contacted">Contacted</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                    <div>
                      <p className="text-neutral-500 dark:text-neutral-400">Contact person</p>
                      <p className="text-sm font-medium text-rh-ink dark:text-white">{inquiry.name || inquiry.contactName || 'Contact'}</p>
                      <a href={`mailto:${inquiry.email}`} className={cn(linkClass, 'text-sm')}>
                        {inquiry.email}
                      </a>
                    </div>
                    <div>
                      <p className="text-neutral-500 dark:text-neutral-400">Phone & details</p>
                      {inquiry.phone ? (
                        <a href={`tel:${inquiry.phone}`} className={cn(linkClass, 'text-sm')}>
                          {inquiry.phone}
                        </a>
                      ) : (
                        <p className="text-sm text-neutral-400">Not given</p>
                      )}
                      {inquiry.employeeCount && (
                        <p className="text-neutral-500 dark:text-neutral-400">{inquiry.employeeCount} expected patients / staff</p>
                      )}
                    </div>
                  </div>

                  {inquiry.message ? (
                    <p className={cn(insetClass, 'whitespace-pre-wrap text-sm text-rh-ink dark:text-neutral-200')}>{inquiry.message}</p>
                  ) : null}
                </div>

                <div className="flex w-full flex-col justify-center gap-2 border-t border-black/[0.05] bg-rh-canvas/60 p-5 dark:border-white/[0.06] dark:bg-white/[0.02] md:w-56 md:border-l md:border-t-0">
                  <Button asChild className={primaryButtonClass}>
                    <a href={`mailto:${inquiry.email}?subject=${isDemo(inquiry) ? 'Your Rehabify demo' : 'Partnership with RehabifyHealth'}`}>
                      <Mail className="mr-2 h-4 w-4" /> Email contact
                    </a>
                  </Button>
                  {inquiry.phone && (
                    <Button asChild variant="ghost" className={softButtonClass}>
                      <a href={`tel:${inquiry.phone}`}>
                        <Phone className="mr-2 h-4 w-4" /> Call
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
