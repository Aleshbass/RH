'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { FileText, Rocket, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cardClass, ConfirmDialog, EmptyState, Panel, primaryButtonClass, StatusBadge, tableWrapClass } from '@/components/admin/ui'
import { cn } from '@/lib/utils'
import { type PartnerApplication, type PartnerReview, type ReasonRequest } from './PartnerReview'
import { Callout, insetClass, linkClass, LoadingBlock, ProductionStatusBadge } from './shared'

export function GoLiveTab({
  applications,
  review,
  onRequestReason,
}: {
  applications: PartnerApplication[] | undefined
  review: PartnerReview
  onRequestReason: (request: ReasonRequest) => void
}) {
  const [confirm, setConfirm] = useState<{ partner: PartnerApplication; action: 'approve' | 'reinstate' } | null>(null)
  const requests = (applications ?? []).filter((p) => p.approvalStatus === 'approved' && p.productionStatus === 'requested')
  const livePartners = (applications ?? []).filter((p) => p.productionStatus === 'approved' || p.productionStatus === 'suspended')

  return (
    <div className="space-y-6">
      <Callout tone="info" title="Production (go-live) access">
        Approved partners start in sandbox. Live API keys, the live webhook endpoint and live referral links only work after you approve production
        access here. Suspending production disables live keys immediately; sandbox keeps working.
      </Callout>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-rh-night dark:text-white">
          Waiting for review <span className="tabular-nums text-neutral-400">({requests.length})</span>
        </h3>
        {applications === undefined ? (
          <LoadingBlock />
        ) : requests.length === 0 ? (
          <div className={cardClass}>
            <EmptyState icon={<Rocket />} title="No go-live requests" description="Requests from partners ready to go live appear here." />
          </div>
        ) : (
          requests.map((partner) => {
            const busy = review.busyId === partner._id
            return (
              <div key={partner._id} className={cn(cardClass, 'flex flex-col gap-4 p-5 ring-1 ring-amber-300/70 dark:ring-amber-500/30 md:flex-row md:items-start')}>
                <div className="min-w-0 flex-1 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-semibold text-rh-night dark:text-white">{partner.name}</h4>
                    <StatusBadge tone="teal" className="uppercase">
                      {partner.type}
                    </StatusBadge>
                    <span className="font-mono text-neutral-400">{partner.code}</span>
                  </div>
                  <p className="text-neutral-500 dark:text-neutral-400">
                    Requested {partner.productionRequestedAt ? format(partner.productionRequestedAt, "d MMM yyyy 'at' h:mm a") : 'recently'}
                    {partner.contactEmail ? ` · ${partner.contactEmail}` : ''}
                  </p>
                  {partner.productionRequestNote ? (
                    <p className={cn(insetClass, 'whitespace-pre-wrap break-words text-rh-night dark:text-neutral-200')}>{partner.productionRequestNote}</p>
                  ) : (
                    <p className="italic text-neutral-400">No note provided.</p>
                  )}
                  <Link
                    href={`/dashboard/admin/referrals?partner=${encodeURIComponent(partner.code)}`}
                    className={cn(linkClass, 'inline-flex items-center gap-1')}
                  >
                    <FileText className="h-3.5 w-3.5" /> View this partner&apos;s referrals
                  </Link>
                </div>
                <div className="flex shrink-0 gap-2 md:w-48 md:flex-col">
                  <Button disabled={busy} onClick={() => setConfirm({ partner, action: 'approve' })} className={cn(primaryButtonClass, 'flex-1')}>
                    <Rocket className="mr-1.5 h-4 w-4" /> Approve go-live
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => onRequestReason({ kind: 'production', action: 'reject', partner })}
                    className="flex-1 rounded-xl text-rose-700 hover:bg-rh-blush hover:text-rose-800 dark:text-rose-300 dark:hover:bg-rose-400/10"
                  >
                    <XCircle className="mr-1.5 h-4 w-4" /> Decline
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </section>

      <Panel title="Partners with production access" description={`${livePartners.length} partner${livePartners.length === 1 ? '' : 's'}`}>
        {livePartners.length === 0 ? (
          <EmptyState title="No partners are live yet" />
        ) : (
          <div className={cn(tableWrapClass, 'px-2 pb-2')}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last review</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {livePartners.map((partner) => {
                  const busy = review.busyId === partner._id
                  return (
                    <TableRow key={partner._id}>
                      <TableCell>
                        <div className="font-medium text-rh-night dark:text-white">{partner.name}</div>
                        <div className="font-mono text-[10px] text-neutral-400">{partner.code}</div>
                      </TableCell>
                      <TableCell>
                        <ProductionStatusBadge status={partner.productionStatus} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
                        {partner.productionReviewedAt
                          ? `${format(partner.productionReviewedAt, 'd MMM yyyy')} · ${partner.productionReviewedBy || 'Admin'}`
                          : '—'}
                      </TableCell>
                      <TableCell className="max-w-xs whitespace-normal text-xs text-neutral-500 dark:text-neutral-400">
                        {partner.productionRejectionReason || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {partner.productionStatus === 'approved' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => onRequestReason({ kind: 'production', action: 'suspend', partner })}
                            className="h-8 rounded-xl text-xs text-rose-700 hover:bg-rh-blush dark:text-rose-300 dark:hover:bg-rose-400/10"
                          >
                            Suspend live
                          </Button>
                        ) : (
                          <Button size="sm" disabled={busy} onClick={() => setConfirm({ partner, action: 'reinstate' })} className={cn(primaryButtonClass, 'h-8 text-xs')}>
                            Reinstate
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.action === 'reinstate' ? `Reinstate live access for ${confirm.partner.name}?` : `Approve go-live for ${confirm?.partner.name ?? 'partner'}?`}
        description={
          confirm?.action === 'reinstate'
            ? 'Live API keys start working again straight away.'
            : 'Live keys, the live webhook and live referral links start working. Real patients will be contacted for their live referrals.'
        }
        confirmLabel={confirm?.action === 'reinstate' ? 'Reinstate' : 'Approve go-live'}
        onConfirm={async () => {
          if (confirm) await review.reviewProduction(confirm.partner, confirm.action)
        }}
      />
    </div>
  )
}
