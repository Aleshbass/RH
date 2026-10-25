'use client'

import { Suspense, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from 'convex/react'
import { format } from 'date-fns'
import { Banknote, Inbox, Rocket, ShieldCheck } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdminPage, PageHeader, Stagger, StaggerItem, StatTile, tabsListClass } from '@/components/admin/ui'
import { ApplicationsTab } from '@/components/admin/partners/ApplicationsTab'
import { GoLiveTab } from '@/components/admin/partners/GoLiveTab'
import { InquiriesTab } from '@/components/admin/partners/InquiriesTab'
import { PartnerPayoutsTab } from '@/components/admin/partners/PartnerPayoutsTab'
import { type PendingCommission, PendingCommissionsPanel } from '@/components/admin/partners/PendingCommissionsPanel'
import { type PartnerApplication, ReasonDialog, type ReasonRequest, usePartnerReview } from '@/components/admin/partners/PartnerReview'
import { RevenueSettingsTab } from '@/components/admin/partners/RevenueSettingsTab'
import { formatKobo, LoadingBlock } from '@/components/admin/partners/shared'

const TABS = ['applications', 'golive', 'inquiries', 'bulk_payouts', 'revenue'] as const
type TabId = (typeof TABS)[number]

const BASE_PATH = '/dashboard/admin/partnerships'

function parseTab(value: string | null): TabId {
  return TABS.includes(value as TabId) ? (value as TabId) : 'applications'
}

function TabCount({ value, tone = 'neutral' }: { value: number; tone?: 'neutral' | 'attention' }) {
  if (!value) return null
  return (
    <span
      className={
        tone === 'attention'
          ? 'ml-1.5 rounded-full bg-rh-amber px-1.5 text-[10px] font-semibold tabular-nums text-rh-ink'
          : 'ml-1.5 rounded-full bg-black/[0.06] px-1.5 text-[10px] font-semibold tabular-nums dark:bg-white/10'
      }
    >
      {value}
    </span>
  )
}

function PartnershipsContent() {
  const router = useRouter()
  const pathname = usePathname() ?? BASE_PATH
  const searchParams = useSearchParams()
  const urlTab = parseTab(searchParams?.get('tab') ?? null)
  const [tab, setTabState] = useState<TabId>(urlTab)

  // Follow the URL when it changes from outside (sidebar links, back/forward)
  useEffect(() => setTabState(urlTab), [urlTab])

  const setTab = (next: TabId) => {
    setTabState(next)
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('tab', next)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const applications = useQuery(api.adminPartnerships.getPartnerApplications, {})
  const inquiries = useQuery(api.adminPartnerships.getPartnershipInquiries)
  const [billingPeriod, setBillingPeriod] = useState(() => format(new Date(), 'yyyy-MM'))
  const payoutSummary = useQuery(api.monthlySettlements.getMonthlyBulkPayoutSummary, { billingPeriod })
  const pendingCommissions = useQuery(api.commercialTerms.adminListPendingCommissions, {}) as PendingCommission[] | undefined
  const awaitingApproval = pendingCommissions?.length ?? 0

  const review = usePartnerReview()
  const [reasonRequest, setReasonRequest] = useState<ReasonRequest | null>(null)

  const pendingCount = applications?.filter((p: PartnerApplication) => p.approvalStatus === 'pending').length ?? 0
  const goLiveCount =
    applications?.filter((p: PartnerApplication) => p.approvalStatus === 'approved' && p.productionStatus === 'requested').length ?? 0
  const newInquiries = inquiries?.filter((i: { status: string }) => i.status === 'new').length ?? 0

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Partners"
        title="Partners & revenue"
        description="Partner and referring-doctor applications, go-live reviews, website inquiries and demo requests, monthly payouts and the platform revenue split."
      />

      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StaggerItem>
          <StatTile
            label="Pending applications"
            value={applications === undefined ? '…' : pendingCount}
            hint={applications ? `${applications.length} partner organisations` : undefined}
            icon={ShieldCheck}
            tone={pendingCount > 0 ? 'attention' : 'teal'}
            href={`${BASE_PATH}?tab=applications`}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Go-live requests"
            value={applications === undefined ? '…' : goLiveCount}
            hint="Waiting for production access"
            icon={Rocket}
            tone={goLiveCount > 0 ? 'attention' : 'teal'}
            href={`${BASE_PATH}?tab=golive`}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="New inquiries"
            value={inquiries === undefined ? '…' : newInquiries}
            hint={inquiries ? `${inquiries.length} in total` : undefined}
            icon={Inbox}
            tone={newInquiries > 0 ? 'peach' : 'teal'}
            href={`${BASE_PATH}?tab=inquiries`}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Partner payable now"
            value={payoutSummary ? formatKobo(payoutSummary.totals.totalPartnerCommission) : '…'}
            hint={
              awaitingApproval > 0
                ? `${awaitingApproval} commission${awaitingApproval === 1 ? '' : 's'} awaiting approval`
                : payoutSummary
                  ? `Up to ${payoutSummary.billingPeriodLabel}`
                  : undefined
            }
            icon={Banknote}
            tone={awaitingApproval > 0 ? 'attention' : 'mint'}
            href={`${BASE_PATH}?tab=bulk_payouts`}
          />
        </StaggerItem>
      </Stagger>

      <Tabs value={tab} onValueChange={(value) => setTab(parseTab(value))} className="space-y-4">
        <TabsList className={tabsListClass}>
          <TabsTrigger value="applications">
            Applications
            <TabCount value={pendingCount} tone="attention" />
          </TabsTrigger>
          <TabsTrigger value="golive">
            Go-live
            <TabCount value={goLiveCount} tone="attention" />
          </TabsTrigger>
          <TabsTrigger value="inquiries">
            Inquiries &amp; demos
            <TabCount value={newInquiries} />
          </TabsTrigger>
          <TabsTrigger value="bulk_payouts">
            Partner payouts
            <TabCount value={awaitingApproval} tone="attention" />
          </TabsTrigger>
          <TabsTrigger value="revenue">Revenue settings</TabsTrigger>
        </TabsList>

        <TabsContent value="applications" className="mt-0">
          <ApplicationsTab applications={applications} review={review} onRequestReason={setReasonRequest} onOpenGoLive={() => setTab('golive')} />
        </TabsContent>
        <TabsContent value="golive" className="mt-0">
          <GoLiveTab applications={applications} review={review} onRequestReason={setReasonRequest} />
        </TabsContent>
        <TabsContent value="inquiries" className="mt-0">
          <InquiriesTab inquiries={inquiries} />
        </TabsContent>
        <TabsContent value="bulk_payouts" className="mt-0 space-y-5">
          {/* Approved ones join the payouts below */}
          <PendingCommissionsPanel rows={pendingCommissions} />
          <PartnerPayoutsTab summary={payoutSummary} billingPeriod={billingPeriod} onBillingPeriodChange={setBillingPeriod} />
        </TabsContent>
        <TabsContent value="revenue" className="mt-0">
          <RevenueSettingsTab />
        </TabsContent>
      </Tabs>

      <ReasonDialog request={reasonRequest} onClose={() => setReasonRequest(null)} review={review} />
    </AdminPage>
  )
}

export default function AdminPartnershipsPage() {
  return (
    <Suspense
      fallback={
        <AdminPage>
          <PageHeader eyebrow="Partners" title="Partners & revenue" />
          <LoadingBlock className="h-64" />
        </AdminPage>
      }
    >
      <PartnershipsContent />
    </Suspense>
  )
}
