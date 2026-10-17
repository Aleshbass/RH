'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ArrowLeft, Banknote, Building2, Inbox, Mail, ShieldCheck, ShieldOff, Users } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  AdminPage,
  ConfirmDialog,
  EmptyState,
  Panel,
  StatTile,
  Stagger,
  StaggerItem,
  dangerButtonClass,
  formatNaira,
  inputClass,
  primaryButtonClass,
  softButtonClass,
  tabsListClass,
} from '@/components/admin/ui'
import { ApprovalBadge, ClinicAvatar, ClinicStatusBadge, CLINICS_BASE, countLabel } from '@/components/admin/clinics/shared'
import { ClinicFeesTab, ClinicOverviewTab } from '@/components/admin/clinics/ClinicOverview'
import { ClinicPatientsTab, ClinicReferralsTab, ClinicStaffTab } from '@/components/admin/clinics/ClinicLists'
import type { ClinicDetailResult } from '@/components/admin/clinics/types'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const errorText = (err: unknown, fallback: string) =>
  err instanceof ConvexError && typeof err.data === 'string' ? err.data : err instanceof Error && err.message ? err.message : fallback

const backLink = (
  <Link
    href={CLINICS_BASE}
    className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-rh-teal hover:underline dark:text-rh-aqua"
  >
    <ArrowLeft className="h-3.5 w-3.5" />
    All clinics
  </Link>
)

export default function AdminClinicDetailPage() {
  const params = useParams<{ clinicId: string }>()
  const clinicId = params.clinicId as Id<'clinics'>
  const data = useQuery(api.adminClinics.getClinic, { clinicId }) as ClinicDetailResult | undefined
  const setClinicStatus = useMutation(api.adminClinics.setClinicStatus)

  const [tab, setTab] = useState('overview')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [reason, setReason] = useState('')

  if (data === undefined) {
    return (
      <AdminPage>
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-56 rounded-lg" />
            <Skeleton className="h-4 w-40 rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </AdminPage>
    )
  }

  if (data === null) {
    return (
      <AdminPage>
        {backLink}
        <Panel>
          <EmptyState
            icon={<Building2 />}
            title="Clinic not found"
            description="It may have been removed, or the link is wrong."
            action={
              <Button asChild className={primaryButtonClass}>
                <Link href={CLINICS_BASE}>Back to all clinics</Link>
              </Button>
            }
          />
        </Panel>
      </AdminPage>
    )
  }

  const { clinic, owner, counts, billing } = data
  const suspended = clinic.status === 'suspended'

  const openDialog = () => {
    setReason('')
    setDialogOpen(true)
  }

  const changeStatus = async () => {
    const next = suspended ? 'active' : 'suspended'
    try {
      await setClinicStatus({ clinicId, status: next, reason: next === 'suspended' ? reason.trim() || undefined : undefined })
      playSound(next === 'suspended' ? 'reject' : 'approve')
      toast.success(next === 'suspended' ? `${clinic.name} is suspended` : `${clinic.name} is active again`)
    } catch (err) {
      toast.error(errorText(err, 'Could not change the clinic status. Please try again.'))
      // Keeps the dialog open; ConfirmDialog plays the error sound
      throw err
    }
  }

  const place = [clinic.city, clinic.state].filter(Boolean).join(', ')

  return (
    <AdminPage>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-3">
          {backLink}
          <div className="flex min-w-0 items-center gap-4">
            <ClinicAvatar id={clinic._id} name={clinic.name} logoUrl={clinic.logoUrl} size="lg" />
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-rh-night dark:text-white sm:text-[28px]">{clinic.name}</h1>
                <ClinicStatusBadge status={clinic.status} />
                <ApprovalBadge status={data.approval.status} hideApproved />
              </div>
              <p className="mt-1 truncate text-sm text-neutral-500 dark:text-neutral-400">
                {[place || null, owner?.name ? `Owned by ${owner.name}` : null, `Joined ${format(clinic.createdAt, 'd MMM yyyy')}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {owner?.email && (
            <Button asChild variant="outline" className={softButtonClass}>
              <a href={`mailto:${owner.email}`}>
                <Mail className="mr-2 h-4 w-4" />
                Email owner
              </a>
            </Button>
          )}
          {suspended ? (
            <Button className={primaryButtonClass} onClick={openDialog}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Reactivate clinic
            </Button>
          ) : (
            <Button className={dangerButtonClass} onClick={openDialog}>
              <ShieldOff className="mr-2 h-4 w-4" />
              Suspend clinic
            </Button>
          )}
        </div>
      </div>

      {suspended && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rh-blush/60 p-4 dark:border-rose-400/20 dark:bg-rose-400/10">
          <ShieldOff className="mt-0.5 h-5 w-5 shrink-0 text-[#be123c] dark:text-rose-300" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-rh-night dark:text-white">
              Suspended{clinic.suspendedAt ? ` on ${format(clinic.suspendedAt, 'd MMM yyyy, HH:mm')}` : ''}
              {clinic.suspendedByName ? ` by ${clinic.suspendedByName}` : ''}
            </p>
            <p className="mt-0.5 text-neutral-600 dark:text-neutral-300">
              {clinic.suspendedReason ? `Reason: ${clinic.suspendedReason}. ` : ''}
              The clinic&apos;s team can sign in and look, but can&apos;t make changes, and new referrals can&apos;t be routed here.
            </p>
          </div>
        </div>
      )}

      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StaggerItem>
          <StatTile
            label="Team"
            value={countLabel(counts.staff + 1)}
            hint={counts.pendingInvitations ? `${counts.pendingInvitations} invitation${counts.pendingInvitations === 1 ? '' : 's'} waiting` : 'Including the owner'}
            icon={Users}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Patients in care"
            value={countLabel(counts.activePatients, counts.patientsCapped)}
            hint={`${countLabel(counts.patients, counts.patientsCapped)} in total`}
            icon={Users}
            tone="mint"
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Open referrals"
            value={countLabel(counts.openReferrals)}
            hint={`${countLabel(counts.referrals, counts.referralsCapped)} routed here`}
            icon={Inbox}
            tone={suspended && counts.openReferrals > 0 ? 'attention' : 'teal'}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Payments received"
            value={formatNaira(billing.paidKobo / 100)}
            hint={data.payoutAccount ? 'Payout account connected' : 'No payout account'}
            icon={Banknote}
            tone={data.payoutAccount ? 'peach' : 'attention'}
          />
        </StaggerItem>
      </Stagger>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className={tabsListClass}>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="staff">Staff &amp; physios</TabsTrigger>
          <TabsTrigger value="patients">Patients</TabsTrigger>
          <TabsTrigger value="referrals">Referrals</TabsTrigger>
          <TabsTrigger value="fees">Fees &amp; payouts</TabsTrigger>
        </TabsList>
        {/* Inactive tabs unmount, so each list only loads when it's opened */}
        <TabsContent value="overview" className="mt-0">
          <ClinicOverviewTab data={data} />
        </TabsContent>
        <TabsContent value="staff" className="mt-0">
          <ClinicStaffTab clinicId={clinicId} />
        </TabsContent>
        <TabsContent value="patients" className="mt-0">
          <ClinicPatientsTab clinicId={clinicId} />
        </TabsContent>
        <TabsContent value="referrals" className="mt-0">
          <ClinicReferralsTab clinicId={clinicId} />
        </TabsContent>
        <TabsContent value="fees" className="mt-0">
          <ClinicFeesTab data={data} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={suspended ? `Reactivate ${clinic.name}?` : `Suspend ${clinic.name}?`}
        description={
          suspended
            ? 'The clinic’s team can make changes again and referrals can be routed to it. The owner is notified.'
            : 'The owner and team can still sign in and see their data, but every change is blocked and no new referrals can be routed here. The owner is notified.'
        }
        confirmLabel={suspended ? 'Reactivate' : 'Suspend clinic'}
        destructive={!suspended}
        onConfirm={changeStatus}
      >
        {!suspended && (
          <div className="space-y-1.5">
            <Label htmlFor="suspend-reason" className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Reason (shared with the owner)
            </Label>
            <Textarea
              id="suspend-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="e.g. Registration documents could not be verified"
              className={cn(inputClass, 'resize-none')}
            />
            {counts.openReferrals > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {counts.openReferrals} open referral{counts.openReferrals === 1 ? ' stays' : 's stay'} assigned to this clinic. Reassign
                them from Inbound referrals if needed.
              </p>
            )}
          </div>
        )}
      </ConfirmDialog>
    </AdminPage>
  )
}
