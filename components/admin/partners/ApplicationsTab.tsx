'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { format } from 'date-fns'
import { Building2, CheckCircle2, ExternalLink, FileText, Link2, Mail, Phone, Plus, Rocket, Search, Stethoscope, XCircle } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  cardClass,
  ConfirmDialog,
  EmptyState,
  FilterChips,
  inputClass,
  primaryButtonClass,
  softButtonClass,
  StatusBadge,
} from '@/components/admin/ui'
import { cn } from '@/lib/utils'
import { CreatePartnerDialog, ReferralLinkDialog } from './PartnerDialogs'
import { type PartnerApplication, type PartnerReview, type ReasonRequest } from './PartnerReview'
import { Callout, insetClass, LoadingBlock, PartnerAvatar, PartnerTypeBadge, ProductionStatusBadge, linkClass } from './shared'

type ApprovalFilter = 'all' | 'pending' | 'approved' | 'rejected'
type KindFilter = 'all' | 'organisations' | 'doctors'

const isKind = (partner: PartnerApplication, k: KindFilter) =>
  k === 'all' || (k === 'doctors' ? partner.type === 'doctor' : partner.type !== 'doctor')

/** What an admin checks before approving a referring doctor. */
function DoctorDetails({ partner }: { partner: PartnerApplication }) {
  const details = partner.doctorDetails
  if (!details) {
    return (
      <Callout tone="warning" title="No doctor profile found">
        This doctor hasn&apos;t finished their profile, so there is no licence number to check yet.
      </Callout>
    )
  }
  return (
    <div className={cn(insetClass, 'space-y-2.5 text-xs')}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-neutral-500 dark:text-neutral-400">MDCN folio / licence</span>
        <span className="font-mono text-sm font-semibold text-rh-night dark:text-white">{details.medicalLicenseNumber || 'Not given'}</span>
      </div>
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {details.specialty && (
          <div>
            <dt className="text-neutral-500 dark:text-neutral-400">Specialty</dt>
            <dd className="font-medium text-rh-night dark:text-white">{details.specialty}</dd>
          </div>
        )}
        {details.hospitalAffiliation && (
          <div>
            <dt className="text-neutral-500 dark:text-neutral-400">Hospital / practice</dt>
            <dd className="font-medium text-rh-night dark:text-white">{details.hospitalAffiliation}</dd>
          </div>
        )}
      </dl>
      {details.bio && <p className="leading-relaxed text-neutral-600 dark:text-neutral-300">{details.bio}</p>}
      {partner.approvalStatus === 'pending' && (
        <p className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
          <Stethoscope className="h-3.5 w-3.5" /> Verify the folio on the MDCN register before approving.
        </p>
      )}
    </div>
  )
}

function ApprovalBadge({ status }: { status: string }) {
  if (status === 'approved') return <StatusBadge tone="green">Approved</StatusBadge>
  if (status === 'rejected') return <StatusBadge tone="red">Declined</StatusBadge>
  return <StatusBadge tone="amber">Pending review</StatusBadge>
}

const actionLinkClass =
  'flex w-full items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-medium text-rh-night shadow-soft transition hover:text-rh-teal dark:bg-rh-ink-3 dark:text-neutral-200 dark:shadow-none dark:hover:text-rh-aqua'

export function ApplicationsTab({
  applications,
  review,
  onRequestReason,
  onOpenGoLive,
}: {
  applications: PartnerApplication[] | undefined
  review: PartnerReview
  onRequestReason: (request: ReasonRequest) => void
  onOpenGoLive: () => void
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ApprovalFilter>('all')
  const [kind, setKind] = useState<KindFilter>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [linkPartner, setLinkPartner] = useState<PartnerApplication | null>(null)
  const [confirm, setConfirm] = useState<{ partner: PartnerApplication; kind: 'approve' | 'reapprove' | 'grant_live' } | null>(null)

  const counts = useMemo(() => {
    const all = applications ?? []
    const rows = all.filter((p) => isKind(p, kind))
    return {
      all: rows.length,
      pending: rows.filter((p) => p.approvalStatus === 'pending').length,
      approved: rows.filter((p) => p.approvalStatus === 'approved').length,
      rejected: rows.filter((p) => p.approvalStatus === 'rejected').length,
      kinds: {
        all: all.length,
        organisations: all.filter((p) => p.type !== 'doctor').length,
        doctors: all.filter((p) => p.type === 'doctor').length,
      },
    }
  }, [applications, kind])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (applications ?? []).filter((partner) => {
      if (!isKind(partner, kind)) return false
      if (filter !== 'all' && partner.approvalStatus !== filter) return false
      if (!q) return true
      const email = (partner.contactEmail || partner.ownerEmail || '').toLowerCase()
      return partner.name.toLowerCase().includes(q) || partner.code.toLowerCase().includes(q) || email.includes(q)
    })
  }, [applications, filter, kind, search])

  const runConfirm = async () => {
    if (!confirm) return
    // The review hook shows the toast and sound for success and failure
    if (confirm.kind === 'grant_live') await review.reviewProduction(confirm.partner, 'approve')
    else await review.reviewPartner(confirm.partner, 'approve')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2">
          <FilterChips
            value={kind}
            onChange={setKind}
            options={[
              { value: 'all', label: 'Everyone', count: counts.kinds.all },
              { value: 'organisations', label: 'Organisations', count: counts.kinds.organisations },
              { value: 'doctors', label: 'Doctors', count: counts.kinds.doctors },
            ]}
          />
          <FilterChips
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'pending', label: 'Pending', count: counts.pending },
              { value: 'approved', label: 'Approved', count: counts.approved },
              { value: 'rejected', label: 'Declined', count: counts.rejected },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              placeholder="Search name, code or email"
              className={cn(inputClass, 'pl-9 sm:w-[260px]')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button onClick={() => setCreateOpen(true)} className={primaryButtonClass}>
            <Plus className="mr-1.5 h-4 w-4" /> Create partner
          </Button>
        </div>
      </div>

      <Callout tone="info">
        Approving an organisation gives it <strong>sandbox</strong> access only. Live keys, webhooks and links are unlocked separately under{' '}
        <strong>Go-live</strong>. Referring <strong>doctors</strong> are live as soon as you approve them, so check their licence first.
      </Callout>

      {applications === undefined ? (
        <LoadingBlock className="h-48" />
      ) : filtered.length === 0 ? (
        <div className={cardClass}>
          <EmptyState
            icon={<Building2 />}
            title="No partner applications found"
            description={
              search || filter !== 'all'
                ? 'Try adjusting your search or filters.'
                : 'When healthcare institutions register on the partner portal, their applications appear here.'
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((partner) => {
            const busy = review.busyId === partner._id
            const isDoctor = partner.type === 'doctor'
            return (
              <div key={partner._id} className={cn(cardClass, 'flex flex-col overflow-hidden md:flex-row')}>
                <div className="min-w-0 flex-1 space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <PartnerAvatar
                        name={partner.name}
                        logo={
                          partner.logoUrl ? (
                            <Image src={partner.logoUrl} alt={partner.name} width={44} height={44} unoptimized className="h-full w-full bg-white object-contain p-1" />
                          ) : isDoctor ? (
                            <Stethoscope className="h-5 w-5" />
                          ) : undefined
                        }
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-semibold text-rh-night dark:text-white">{partner.name}</h3>
                          <PartnerTypeBadge type={partner.type} />
                          <span className="font-mono text-xs text-neutral-400">{partner.code}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                          {isDoctor ? 'Signed up' : 'Applied'} {format(partner.createdAt, "d MMM yyyy 'at' h:mm a")}
                        </p>
                      </div>
                    </div>
                    <ApprovalBadge status={partner.approvalStatus} />
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                    {partner.contactEmail && (
                      <a href={`mailto:${partner.contactEmail}`} className={cn(linkClass, 'inline-flex items-center gap-1.5')}>
                        <Mail className="h-3.5 w-3.5" /> {partner.contactEmail}
                      </a>
                    )}
                    {partner.contactPhone && (
                      <a href={`tel:${partner.contactPhone}`} className={cn(linkClass, 'inline-flex items-center gap-1.5')}>
                        <Phone className="h-3.5 w-3.5" /> {partner.contactPhone}
                      </a>
                    )}
                  </div>

                  {isDoctor && <DoctorDetails partner={partner} />}

                  {partner.approvedAt && (
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Approved {format(partner.approvedAt, 'd MMM yyyy')} by {partner.approvedBy || 'Admin'}
                    </p>
                  )}

                  {isDoctor ? (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                      <span>Referrals</span>
                      {partner.approvalStatus === 'approved' ? (
                        <ProductionStatusBadge status={partner.productionStatus} />
                      ) : (
                        <StatusBadge tone="neutral">Live on approval</StatusBadge>
                      )}
                    </div>
                  ) : partner.approvalStatus === 'approved' && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                      <span>Production access</span>
                      <ProductionStatusBadge status={partner.productionStatus} />
                      {partner.productionStatus === 'requested' && (
                        <button type="button" onClick={onOpenGoLive} className={linkClass}>
                          Review request
                        </button>
                      )}
                      {(partner.productionStatus === 'not_requested' || partner.productionStatus === 'rejected') && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirm({ partner, kind: 'grant_live' })}
                          className={cn(linkClass, 'disabled:opacity-50')}
                        >
                          Grant live access
                        </button>
                      )}
                    </div>
                  )}

                  {partner.rejectionReason && <Callout tone="danger" title="Decline reason">{partner.rejectionReason}</Callout>}
                </div>

                <div className="flex w-full flex-col justify-center gap-2 border-t border-black/[0.05] bg-rh-canvas/60 p-5 dark:border-white/[0.06] dark:bg-white/[0.02] md:w-64 md:border-l md:border-t-0">
                  {partner.approvalStatus === 'pending' ? (
                    <>
                      <Button disabled={busy} onClick={() => setConfirm({ partner, kind: 'approve' })} className={primaryButtonClass}>
                        <CheckCircle2 className="mr-1.5 h-4 w-4" /> {isDoctor ? 'Approve doctor' : 'Approve partner'}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => onRequestReason({ kind: 'application', partner })}
                        className="rounded-xl text-rose-700 hover:bg-rh-blush hover:text-rose-800 dark:text-rose-300 dark:hover:bg-rose-400/10"
                      >
                        <XCircle className="mr-1.5 h-4 w-4" /> Decline
                      </Button>
                    </>
                  ) : partner.approvalStatus === 'rejected' ? (
                    <Button variant="ghost" disabled={busy} onClick={() => setConfirm({ partner, kind: 'reapprove' })} className={softButtonClass}>
                      Re-approve access
                    </Button>
                  ) : (
                    <>
                      <p className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {isDoctor ? 'Referring live' : 'Portal access active'}
                      </p>
                      <button type="button" onClick={() => setLinkPartner(partner)} className={actionLinkClass}>
                        <Link2 className="h-3.5 w-3.5" /> Generate referral link
                      </button>
                      <Link href={`/dashboard/admin/referrals?partner=${encodeURIComponent(partner.code)}`} className={actionLinkClass}>
                        <FileText className="h-3.5 w-3.5" /> View referrals
                      </Link>
                      <a href="/partners/portal" target="_blank" rel="noreferrer" className={actionLinkClass}>
                        <ExternalLink className="h-3.5 w-3.5" /> Open partner portal
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => onRequestReason({ kind: 'application', partner })}
                        className="h-8 rounded-xl text-xs text-rose-600 hover:bg-rh-blush hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-400/10"
                      >
                        {isDoctor ? 'Revoke doctor access' : 'Revoke partner access'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm?.kind === 'grant_live'
            ? `Grant live access to ${confirm.partner.name}?`
            : confirm?.kind === 'reapprove'
              ? `Re-approve ${confirm?.partner.name}?`
              : `Approve ${confirm?.partner.name ?? 'partner'}?`
        }
        description={
          confirm?.kind === 'grant_live'
            ? 'This skips the go-live request. Live keys, webhooks and links start working, and real patients are contacted for live referrals.'
            : confirm?.partner.type === 'doctor'
              ? 'They can refer real patients straight away, and their referrals and referral link earn commission under their contract (or the platform default share). They are emailed.'
              : 'The partner gets sandbox access and is emailed. Live access still needs a separate go-live approval.'
        }
        confirmLabel={confirm?.kind === 'grant_live' ? 'Grant live access' : 'Approve'}
        onConfirm={runConfirm}
      >
        {confirm?.kind === 'grant_live' && (
          <p className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            <Rocket className="h-3.5 w-3.5" /> You can suspend live access later from the Go-live tab.
          </p>
        )}
      </ConfirmDialog>

      <CreatePartnerDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ReferralLinkDialog partner={linkPartner} onClose={() => setLinkPartner(null)} />
    </div>
  )
}
