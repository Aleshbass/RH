'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { useMutation, useQuery } from 'convex/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Check,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  Loader2,
  Search,
  ShieldAlert,
  ShieldCheck,
  User,
  X,
} from '@/components/icons'

import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  AdminPage,
  ConfirmDialog,
  EmptyState,
  FilterChips,
  IconChip,
  PageHeader,
  Panel,
  StatusBadge,
  cardClass,
  downloadCsv,
  inputClass,
  primaryButtonClass,
  softButtonClass,
  tableWrapClass,
} from '@/components/admin/ui'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type RegistrationStatus = 'pending' | 'verified' | 'rejected' | 'listed'
type StatusFilter = RegistrationStatus | 'all'

interface RegistryEntry {
  _id: Id<'physioRegistry'>
  fullName: string
  email: string
  phone: string
  practiceName?: string
  practiceAddress?: string
  yearsOfExperience: number
  licenseNumber: string
  regulatoryBody: string
  licenseCountry: string
  licenseExpiryDate: string
  specialties: string[]
  languages: string[]
  bio?: string
  websiteUrl?: string
  verificationStatus: string
  rejectionReason?: string
  verifiedAt?: number
  submittedAt: number
}

type RegistryDetail = RegistryEntry & {
  licenseCertUrl: string | null
  photoIdUrl: string | null
  insuranceUrl: string | null
  profilePhotoUrl: string | null
}

type RegistryCounts = { counts: Record<string, number>; capped: string[]; cap: number }

const LIST_LIMIT = 200

const STATUS_META: Record<RegistrationStatus, { label: string; tone: 'amber' | 'green' | 'red' | 'teal'; icon: typeof Clock }> = {
  pending: { label: 'Pending', tone: 'amber', icon: Clock },
  verified: { label: 'Verified', tone: 'green', icon: ShieldCheck },
  rejected: { label: 'Rejected', tone: 'red', icon: ShieldAlert },
  listed: { label: 'Listed', tone: 'teal', icon: Globe },
}

function RegistryStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status as RegistrationStatus] ?? { label: status, tone: 'teal' as const, icon: Globe }
  const Icon = meta.icon
  return (
    <StatusBadge tone={meta.tone} className="gap-1">
      <Icon className="h-3 w-3" />
      {meta.label}
    </StatusBadge>
  )
}

function InfoLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2 text-sm">
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className="font-medium text-rh-night dark:text-white">{children}</span>
    </div>
  )
}

const registryApi = api.physioRegistry

export default function PhysioRegistryAdminPage() {
  const reduceMotion = useReducedMotion()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState<Id<'physioRegistry'> | null>(null)
  const [rejectTarget, setRejectTarget] = useState<{ id: Id<'physioRegistry'>; name: string } | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [approvingId, setApprovingId] = useState<string | null>(null)

  const registrations = useQuery(api.physioRegistry.adminListRegistrations, {
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: LIST_LIMIT,
  }) as RegistryEntry[] | undefined
  const counts = (useQuery as any)(registryApi.adminRegistrationCounts) as RegistryCounts | undefined
  const selectedEntry = useQuery(api.physioRegistry.adminGetRegistration, selectedId ? { id: selectedId } : 'skip') as
    | RegistryDetail
    | null
    | undefined

  const approve = useMutation(api.physioRegistry.adminApprove)
  const reject = useMutation(api.physioRegistry.adminReject)

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return registrations ?? []
    return (registrations ?? []).filter(
      (r) => r.fullName.toLowerCase().includes(q) || r.licenseNumber.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)
    )
  }, [registrations, searchQuery])

  const countFor = (status: RegistrationStatus) => counts?.counts[status]
  const totalCount = counts ? Object.values(counts.counts).reduce((s, n) => s + n, 0) : undefined

  const handleApprove = async (id: Id<'physioRegistry'>, name: string) => {
    setApprovingId(id)
    try {
      await approve({ id })
      playSound('approve')
      toast.success(`${name} verified`)
    } catch (e) {
      playSound('error')
      toast.error('Could not verify this registration', { description: e instanceof Error ? e.message : 'Please try again.' })
    } finally {
      setApprovingId(null)
    }
  }

  const confirmReject = async () => {
    if (!rejectTarget) return
    const reason = rejectionReason.trim()
    if (!reason) {
      toast.error('Add a rejection reason first')
      throw new Error('Rejection reason required')
    }
    try {
      await reject({ id: rejectTarget.id, reason })
      playSound('reject')
      toast.success(`${rejectTarget.name} rejected`)
      setRejectTarget(null)
      setRejectionReason('')
    } catch (e) {
      toast.error('Could not reject this registration', { description: e instanceof Error ? e.message : 'Please try again.' })
      throw e
    }
  }

  const exportCsv = () =>
    downloadCsv(
      `physio-registry-${statusFilter}-${format(new Date(), 'yyyy-MM-dd')}`,
      filtered.map((r) => ({
        name: r.fullName,
        email: r.email,
        phone: r.phone,
        licenseNumber: r.licenseNumber,
        regulatoryBody: r.regulatoryBody,
        country: r.licenseCountry,
        licenseExpiry: r.licenseExpiryDate,
        status: r.verificationStatus,
        submitted: new Date(r.submittedAt).toISOString(),
      }))
    )

  const rejectDialog = (
    <ConfirmDialog
      open={!!rejectTarget}
      onOpenChange={(o) => {
        if (!o) {
          setRejectTarget(null)
          setRejectionReason('')
        }
      }}
      title={`Reject ${rejectTarget?.name ?? 'registration'}?`}
      description="The reason is stored on the registration so the team can see why it was turned down."
      confirmLabel="Reject registration"
      destructive
      onConfirm={confirmReject}
    >
      <Textarea
        autoFocus
        rows={3}
        value={rejectionReason}
        onChange={(e) => setRejectionReason(e.target.value)}
        placeholder="For example: licence number does not match the MRTB register."
        className={inputClass}
        aria-label="Rejection reason"
      />
    </ConfirmDialog>
  )

  // ── Detail view ──────────────────────────────────────────────────────────
  if (selectedId) {
    const back = (
      <Button onClick={() => setSelectedId(null)} className={softButtonClass} size="sm">
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to registry
      </Button>
    )

    if (selectedEntry === undefined) {
      return (
        <AdminPage className="max-w-4xl">
          {back}
          <Skeleton className="h-[420px] w-full rounded-2xl dark:bg-white/[0.06]" />
        </AdminPage>
      )
    }

    if (selectedEntry === null) {
      return (
        <AdminPage className="max-w-4xl">
          {back}
          <Panel>
            <EmptyState icon={<ShieldAlert />} title="Registration not found" description="It may have been deleted." />
          </Panel>
        </AdminPage>
      )
    }

    const docs = [
      { label: 'Licence certificate', url: selectedEntry.licenseCertUrl },
      { label: 'Government photo ID', url: selectedEntry.photoIdUrl },
      { label: 'Proof of insurance', url: selectedEntry.insuranceUrl },
    ].filter((d): d is { label: string; url: string } => !!d.url)
    const canReview = selectedEntry.verificationStatus === 'pending' || selectedEntry.verificationStatus === 'listed'

    return (
      <AdminPage className="max-w-4xl">
        {back}

        <section className={cn(cardClass, 'p-5 sm:p-6')}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              {selectedEntry.profilePhotoUrl ? (
                <Image
                  src={selectedEntry.profilePhotoUrl}
                  alt=""
                  width={64}
                  height={64}
                  unoptimized
                  className="h-16 w-16 rounded-full object-cover ring-2 ring-rh-mist dark:ring-white/10"
                />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-rh-mist text-rh-teal dark:bg-rh-aqua/10 dark:text-rh-aqua">
                  <User className="h-7 w-7" />
                </span>
              )}
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight text-rh-night dark:text-white">{selectedEntry.fullName}</h1>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {selectedEntry.email} · {selectedEntry.phone}
                </p>
                <div className="mt-1.5">
                  <RegistryStatusBadge status={selectedEntry.verificationStatus} />
                </div>
              </div>
            </div>

            {canReview && (
              <div className="flex shrink-0 gap-2">
                <Button
                  onClick={() => handleApprove(selectedEntry._id, selectedEntry.fullName)}
                  disabled={approvingId === selectedEntry._id}
                  className={primaryButtonClass}
                >
                  {approvingId === selectedEntry._id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                  Verify
                </Button>
                <Button
                  onClick={() => setRejectTarget({ id: selectedEntry._id, name: selectedEntry.fullName })}
                  className="rounded-xl bg-rh-blush text-[#be123c] hover:bg-rose-100 dark:bg-rose-400/10 dark:text-rose-300 dark:hover:bg-rose-400/20"
                >
                  <X className="mr-1.5 h-4 w-4" />
                  Reject
                </Button>
              </div>
            )}
          </div>

          {selectedEntry.rejectionReason && (
            <div className="mt-5 rounded-xl bg-rh-blush p-4 text-sm text-[#be123c] dark:bg-rose-400/10 dark:text-rose-300">
              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider opacity-80">Rejection reason</p>
              <p className="whitespace-pre-wrap">{selectedEntry.rejectionReason}</p>
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-rh-teal dark:text-rh-aqua">Personal</p>
              <InfoLine label="Full name">{selectedEntry.fullName}</InfoLine>
              <InfoLine label="Email">{selectedEntry.email}</InfoLine>
              <InfoLine label="Phone">{selectedEntry.phone}</InfoLine>
              {selectedEntry.practiceName && <InfoLine label="Practice">{selectedEntry.practiceName}</InfoLine>}
              {selectedEntry.practiceAddress && <InfoLine label="Address">{selectedEntry.practiceAddress}</InfoLine>}
              <InfoLine label="Experience">{selectedEntry.yearsOfExperience} years</InfoLine>
              {selectedEntry.websiteUrl && (
                <InfoLine label="Website">
                  <a href={selectedEntry.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-rh-teal hover:underline dark:text-rh-aqua">
                    {selectedEntry.websiteUrl}
                  </a>
                </InfoLine>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-rh-teal dark:text-rh-aqua">Licence</p>
              <InfoLine label="Licence #">
                <span className="font-mono">{selectedEntry.licenseNumber}</span>
              </InfoLine>
              <InfoLine label="Regulatory body">{selectedEntry.regulatoryBody}</InfoLine>
              <InfoLine label="Country">{selectedEntry.licenseCountry}</InfoLine>
              <InfoLine label="Expiry">{selectedEntry.licenseExpiryDate}</InfoLine>
            </div>
          </div>

          {(selectedEntry.specialties.length > 0 || selectedEntry.languages.length > 0) && (
            <div className="mt-6 space-y-3">
              {selectedEntry.specialties.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-rh-teal dark:text-rh-aqua">Specialties</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedEntry.specialties.map((s) => (
                      <StatusBadge key={s} tone="teal">
                        {s}
                      </StatusBadge>
                    ))}
                  </div>
                </div>
              )}
              {selectedEntry.languages.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-rh-teal dark:text-rh-aqua">Languages</p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-300">{selectedEntry.languages.join(', ')}</p>
                </div>
              )}
            </div>
          )}

          {selectedEntry.bio && (
            <div className="mt-6">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-rh-teal dark:text-rh-aqua">Bio</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{selectedEntry.bio}</p>
            </div>
          )}

          <div className="mt-6">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-rh-teal dark:text-rh-aqua">Documents</p>
            {docs.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No documents could be loaded.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {docs.map((d) => (
                  <a
                    key={d.label}
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl bg-rh-canvas p-3 transition-colors hover:bg-rh-mist dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
                  >
                    <IconChip icon={FileText} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-rh-night dark:text-white">{d.label}</span>
                      <span className="block text-xs text-neutral-500 dark:text-neutral-400">Opens in a new tab</span>
                    </span>
                    <ExternalLink className="h-4 w-4 text-neutral-400" />
                  </a>
                ))}
              </div>
            )}
          </div>

          <p className="mt-6 border-t border-black/[0.05] pt-4 text-xs text-neutral-500 dark:border-white/[0.06] dark:text-neutral-400">
            Submitted {format(selectedEntry.submittedAt, 'd MMM yyyy, HH:mm')}
            {selectedEntry.verifiedAt && ` · Verified ${format(selectedEntry.verifiedAt, 'd MMM yyyy, HH:mm')}`}
          </p>
        </section>

        {rejectDialog}
      </AdminPage>
    )
  }

  // ── List view ────────────────────────────────────────────────────────────
  const capped = (registrations?.length ?? 0) >= LIST_LIMIT

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Rehabify Physios"
        title="Public registry"
        description="Physiotherapists who signed up to the public register. Check their licence against the regulator before verifying."
        actions={
          <Button onClick={exportCsv} disabled={filtered.length === 0} className={softButtonClass}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <Panel bodyClassName="pb-2">
        <div className="space-y-2 px-5 pb-3 pt-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <FilterChips
              value={statusFilter}
              onChange={(v) => setStatusFilter(v)}
              options={[
                { value: 'pending', label: 'Pending', count: countFor('pending') },
                { value: 'listed', label: 'Listed', count: countFor('listed') },
                { value: 'verified', label: 'Verified', count: countFor('verified') },
                { value: 'rejected', label: 'Rejected', count: countFor('rejected') },
                { value: 'all', label: 'All', count: totalCount },
              ]}
            />
            <div className="relative w-full lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, licence number or email"
                className={cn(inputClass, 'h-10 pl-9')}
                aria-label="Search registrations"
              />
            </div>
          </div>
          {(capped || (counts && counts.capped.length > 0)) && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Showing the newest {LIST_LIMIT} registrations{statusFilter === 'all' ? '' : ' in this status'}; search covers those rows only.
              {counts && counts.capped.length > 0 ? ` Counts above ${counts.cap} show as ${counts.cap}.` : ''}
            </p>
          )}
        </div>

        {registrations === undefined ? (
          <div className="space-y-2 px-5 pb-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl dark:bg-white/[0.06]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ShieldAlert />}
            title={searchQuery ? 'No matching registrations' : 'No registrations here'}
            description={searchQuery ? 'Try a different name or licence number.' : 'New registrations will appear here.'}
          />
        ) : (
          <div className={tableWrapClass}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-5 py-2.5 text-left">Name</th>
                  <th className="px-3 py-2.5 text-left">Licence #</th>
                  <th className="hidden px-3 py-2.5 text-left md:table-cell">Body</th>
                  <th className="px-3 py-2.5 text-left">Status</th>
                  <th className="hidden px-3 py-2.5 text-left sm:table-cell">Submitted</th>
                  <th className="px-5 py-2.5 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {filtered.map((reg) => (
                    <motion.tr
                      key={reg._id}
                      layout={!reduceMotion}
                      initial={reduceMotion ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="cursor-pointer border-b transition-colors"
                      onClick={() => setSelectedId(reg._id)}
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium text-rh-night dark:text-white">{reg.fullName}</p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">{reg.email}</p>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-neutral-700 dark:text-neutral-300">{reg.licenseNumber}</td>
                      <td className="hidden px-3 py-3 text-neutral-600 dark:text-neutral-300 md:table-cell">{reg.regulatoryBody}</td>
                      <td className="px-3 py-3">
                        <RegistryStatusBadge status={reg.verificationStatus} />
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-3 text-neutral-500 dark:text-neutral-400 sm:table-cell">
                        {format(reg.submittedAt, 'd MMM yyyy')}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          size="sm"
                          className={softButtonClass}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedId(reg._id)
                          }}
                        >
                          <Eye className="mr-1.5 h-4 w-4" />
                          Review
                        </Button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {rejectDialog}
    </AdminPage>
  )
}
