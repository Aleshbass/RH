'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { ClinicDetailResult } from '@/components/admin/clinics/types'
import { format } from 'date-fns'
import { ArrowUpRight, Banknote, FileText, Landmark, Mail, Percent, Phone, UserRound } from '@/components/icons'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { EmptyState, IconChip, Panel, StatusBadge, formatNaira, softButtonClass } from '@/components/admin/ui'
import { ApprovalBadge, initialsOf, tintFor, userHref } from '@/components/admin/clinics/shared'
import { cn } from '@/lib/utils'
import { HeldTransfer } from '@/components/admin/clinics/HeldTransfer'

export type ClinicDetail = NonNullable<ClinicDetailResult>

const naira = (kobo: number) => formatNaira(kobo / 100)
const linkClass = 'font-medium text-rh-ink hover:underline dark:text-rh-lime'

function Detail({ label, value, href, mono }: { label: string; value: ReactNode; href?: string; mono?: boolean }) {
  const empty = value === null || value === undefined || value === ''
  return (
    <div className="min-w-0">
      <dt className="text-xs text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className={cn('mt-0.5 break-words text-sm text-rh-ink dark:text-white', mono && 'font-mono text-[13px]')}>
        {empty ? (
          <span className="text-neutral-400 dark:text-neutral-500">Not given</span>
        ) : href ? (
          <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className={linkClass}>
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <StatusBadge key={item} tone="teal">
          {item}
        </StatusBadge>
      ))}
    </div>
  )
}

const websiteHref = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`)

export function ClinicOverviewTab({ data }: { data: ClinicDetail }) {
  const { clinic, owner, ownerProfile, approval, documents } = data
  const services = Array.from(new Set([...clinic.services, ...clinic.specializations]))

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Panel title="Clinic details" bodyClassName="px-5 pb-5 pt-3">
          {clinic.description && <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-300">{clinic.description}</p>}
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Detail label="Registration number" value={clinic.registrationNumber} mono />
            <Detail label="Clinic type" value={clinic.clinicType} />
            <Detail label="Established" value={clinic.yearEstablished} />
            <Detail label="Address" value={clinic.address ?? clinic.location} />
            <Detail label="City" value={[clinic.city, clinic.state, clinic.country].filter(Boolean).join(', ')} />
            <Detail label="Phone" value={clinic.contactPhone} href={clinic.contactPhone ? `tel:${clinic.contactPhone}` : undefined} />
            <Detail label="Email" value={clinic.contactEmail} href={clinic.contactEmail ? `mailto:${clinic.contactEmail}` : undefined} />
            <Detail label="Website" value={clinic.website} href={clinic.website ? websiteHref(clinic.website) : undefined} />
            {ownerProfile?.businessLicense && <Detail label="Business licence" value={ownerProfile.businessLicense} mono />}
            {ownerProfile?.taxId && <Detail label="Tax ID" value={ownerProfile.taxId} mono />}
            <Detail label="Joined Rehabify" value={format(clinic.createdAt, 'd MMM yyyy')} />
          </dl>
        </Panel>

        <Panel title="Services and prices" bodyClassName="space-y-4 px-5 pb-5 pt-3">
          {services.length > 0 ? <Chips items={services} /> : <p className="text-sm text-neutral-500 dark:text-neutral-400">No services listed.</p>}
          {clinic.facilities.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs text-neutral-500 dark:text-neutral-400">Facilities</p>
              <Chips items={clinic.facilities} />
            </div>
          )}
          {clinic.priceList.length > 0 && (
            <ul className="divide-y divide-black/[0.05] rounded-xl border border-black/[0.05] dark:divide-white/[0.06] dark:border-white/[0.06]">
              {clinic.priceList.map((item) => (
                <li key={item.name} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 truncate text-rh-ink dark:text-white">
                    {item.name}
                    {item.durationMinutes ? <span className="text-neutral-500 dark:text-neutral-400"> · {item.durationMinutes} min</span> : null}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums text-rh-ink dark:text-white">{formatNaira(item.priceNaira)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {(clinic.outsideImageUrl || clinic.insideImageUrl) && (
          <Panel title="Photos" bodyClassName="grid gap-3 px-5 pb-5 pt-3 sm:grid-cols-2">
            {[
              { url: clinic.outsideImageUrl, label: 'Outside' },
              { url: clinic.insideImageUrl, label: 'Inside' },
            ].map((photo) =>
              photo.url ? (
                <figure key={photo.label} className="overflow-hidden rounded-xl bg-rh-canvas dark:bg-rh-ink-3">
                  <Image src={photo.url} alt={`${clinic.name}, ${photo.label.toLowerCase()}`} width={640} height={400} unoptimized className="aspect-[16/10] w-full object-cover" />
                  <figcaption className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">{photo.label}</figcaption>
                </figure>
              ) : null
            )}
          </Panel>
        )}
      </div>

      <div className="space-y-4">
        <Panel title="Owner" bodyClassName="space-y-4 px-5 pb-5 pt-3">
          {owner ? (
            <>
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11 shrink-0">
                  <AvatarImage src={owner.imageUrl ?? undefined} alt="" />
                  <AvatarFallback className={cn('text-sm font-semibold', tintFor(owner._id))}>{initialsOf(owner.name, 'O')}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-rh-ink dark:text-white">{owner.name}</p>
                  {!owner.onboarded && <p className="text-xs text-amber-700 dark:text-amber-300">Hasn&apos;t finished registration</p>}
                </div>
              </div>
              <div className="space-y-1.5 text-sm">
                {owner.email && (
                  <a href={`mailto:${owner.email}`} className="flex items-center gap-2 text-neutral-600 hover:text-rh-ink dark:text-neutral-300 dark:hover:text-rh-lime">
                    <Mail className="h-4 w-4 shrink-0 text-neutral-400" />
                    <span className="truncate">{owner.email}</span>
                  </a>
                )}
                {owner.phoneNumber && (
                  <a href={`tel:${owner.phoneNumber}`} className="flex items-center gap-2 text-neutral-600 hover:text-rh-ink dark:text-neutral-300 dark:hover:text-rh-lime">
                    <Phone className="h-4 w-4 shrink-0 text-neutral-400" />
                    {owner.phoneNumber}
                  </a>
                )}
              </div>
              <Button asChild size="sm" variant="outline" className={cn(softButtonClass, 'w-full')}>
                <Link href={userHref(owner._id)}>
                  <UserRound className="mr-2 h-4 w-4" />
                  Open owner&apos;s account
                </Link>
              </Button>
            </>
          ) : (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">The owner&apos;s account no longer exists.</p>
          )}

          <div className="rounded-xl bg-rh-canvas p-3 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Registration review</p>
              <ApprovalBadge status={approval.status} />
            </div>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {approval.reviewedAt
                ? `Reviewed ${format(approval.reviewedAt, 'd MMM yyyy')}`
                : approval.submittedAt
                  ? `Submitted ${format(approval.submittedAt, 'd MMM yyyy')}`
                  : 'Not submitted yet'}
            </p>
            {approval.comments && <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">{approval.comments}</p>}
            {approval.status === 'pending_review' && (
              <Link href="/dashboard/admin/approvals" className={cn(linkClass, 'mt-2 inline-flex items-center gap-1 text-xs')}>
                Review in Approvals
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </Panel>

        <Panel title="Documents" description="Uploaded during registration">
          {documents.length === 0 ? (
            <EmptyState icon={<FileText />} title="No documents" description="This clinic hasn't uploaded any registration documents." />
          ) : (
            <ul className="p-2">
              {documents.map((doc) => (
                <li key={doc._id}>
                  <a
                    href={doc.url ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-rh-canvas dark:hover:bg-white/[0.03]',
                      !doc.url && 'pointer-events-none opacity-60'
                    )}
                  >
                    <IconChip icon={FileText} tone="neutral" className="h-8 w-8 rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-rh-ink dark:text-white">{doc.label}</span>
                      <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                        {doc.fileName} · {format(doc.uploadedAt, 'd MMM yyyy')}
                      </span>
                    </span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-neutral-300 dark:text-neutral-600" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

export function ClinicFeesTab({ data }: { data: ClinicDetail }) {
  const { payoutAccount, billing, fees } = data
  const rehabifyPercent = Math.round((100 - fees.clinicSharePercent) * 100) / 100

  const money = [
    { label: 'Paid', value: naira(billing.paidKobo), hint: `${naira(billing.onlinePaidKobo)} online` },
    { label: 'Rehabify fees', value: naira(billing.rehabifyFeesKobo), hint: 'Referred Rehabify Care patients only' },
    {
      label: 'Unpaid',
      value: naira(billing.unpaidKobo),
      hint: `${billing.unpaidCount} ${billing.unpaidCount === 1 ? 'invoice' : 'invoices'}${billing.overdueCount ? `, ${billing.overdueCount} overdue` : ''}`,
    },
    {
      label: 'Held by Rehabify',
      value: naira(billing.heldByRehabifyKobo),
      hint: billing.heldByRehabifyKobo > 0 ? 'Owed to the clinic by manual transfer' : 'Nothing waiting',
      attention: billing.heldByRehabifyKobo > 0,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Panel
          title="Payout account"
          description="Where Paystack sends the clinic's share of online payments"
          bodyClassName="px-5 pb-5 pt-3"
        >
          {payoutAccount ? (
            <div className="flex items-start gap-3">
              <IconChip icon={Landmark} tone="mint" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-rh-ink dark:text-white">
                    {payoutAccount.bankName} ••{payoutAccount.accountNumberLast4}
                  </p>
                  <StatusBadge tone="green">Connected</StatusBadge>
                </div>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">{payoutAccount.accountName}</p>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Subaccount <span className="font-mono">{payoutAccount.subaccountCode}</span> · connected{' '}
                  {format(payoutAccount.connectedAt, 'd MMM yyyy')}
                  {payoutAccount.updatedAt > payoutAccount.connectedAt ? `, updated ${format(payoutAccount.updatedAt, 'd MMM yyyy')}` : ''}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl bg-rh-peach/60 p-3 dark:bg-amber-400/10">
              <IconChip icon={Banknote} tone="peach" />
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-rh-ink dark:text-white">No payout account connected</p>
                <p className="text-neutral-600 dark:text-neutral-300">
                  Online payments settle to Rehabify, so the clinic&apos;s share has to be transferred manually. The owner can
                  connect a bank account in their clinic settings.
                </p>
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="Payments"
          description={billing.capped ? `Across the latest ${billing.invoiceCount} invoices` : `Across ${billing.invoiceCount} ${billing.invoiceCount === 1 ? 'invoice' : 'invoices'}`}
          bodyClassName="grid grid-cols-2 gap-3 px-5 pb-5 pt-3 sm:grid-cols-4"
        >
          {money.map((m) => (
            <div
              key={m.label}
              className={cn('rounded-xl bg-rh-canvas p-3 dark:bg-white/[0.03]', m.attention && 'ring-1 ring-amber-300/70 dark:ring-amber-500/30')}
            >
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{m.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-rh-ink dark:text-white">{m.value}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-neutral-500 dark:text-neutral-400">{m.hint}</p>
            </div>
          ))}
          <HeldTransfer clinicId={data.clinic._id} heldKobo={billing.heldByRehabifyKobo} />
          {billing.lastPaidAt && (
            <p className="col-span-full text-xs text-neutral-500 dark:text-neutral-400">
              Last payment {format(billing.lastPaidAt, 'd MMM yyyy')}
            </p>
          )}
        </Panel>
      </div>

      <Panel
        title="Fee settings"
        description="The same numbers apply to every clinic"
        bodyClassName="space-y-4 px-5 pb-5 pt-3"
      >
        <dl className="space-y-2 text-sm">
          {[
            ['Clinic share', `${fees.clinicSharePercent}%`],
            ['Rehabify share', `${rehabifyPercent}%`],
            ['Paystack fee', `${fees.paystackPercent}%${fees.paystackFlatKobo > 0 ? ` + ${naira(fees.paystackFlatKobo)}` : ''}`],
            ['Paystack fee cap', naira(fees.paystackFeeCapKobo)],
            ['Stamp duty', fees.stampDutyKobo > 0 ? `${naira(fees.stampDutyKobo)} from ${naira(fees.stampDutyFromKobo)}` : 'Off'],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <dt className="text-neutral-500 dark:text-neutral-400">{label}</dt>
              <dd className="font-medium tabular-nums text-rh-ink dark:text-white">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {fees.isCustom && fees.updatedAt
            ? `Last changed ${format(fees.updatedAt, 'd MMM yyyy')}${fees.updatedBy ? ` by ${fees.updatedBy}` : ''}`
            : 'Using the default numbers'}
        </p>
        <Button asChild variant="outline" className={cn(softButtonClass, 'w-full')}>
          <Link href="/dashboard/admin/clinic-fees">
            <Percent className="mr-2 h-4 w-4" />
            Edit clinic fees
          </Link>
        </Button>
      </Panel>
    </div>
  )
}
