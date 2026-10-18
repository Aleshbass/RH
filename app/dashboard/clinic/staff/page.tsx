'use client'

import { useEffect, useState } from 'react'
import { useQuery, useAction } from 'convex/react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import EnhancedClinicStaffInviteModal from '@/components/dashboard/clinic/EnhancedClinicStaffInviteModal'
import StaffTable, { type TeamMember } from '@/components/clinic/staff/StaffTable'
import RolesPanel from '@/components/clinic/staff/RolesPanel'
import {
  roleLabel,
  teamError,
  type ClinicRole,
  type StaffInvitation,
} from '@/components/clinic/staff/team-shared'
import { TourGuide } from '@/components/shared/TourGuide'
import { useClinicPreview } from '@/components/clinic/ClinicPreviewContext'
import { PageShell, Panel, StatTile, StatusBadge, primaryButtonClass } from '@/components/clinic/ui'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export default function StaffManagementPage() {
  const { requireFullAccess, isPreviewMode } = useClinicPreview()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [resendingId, setResendingId] = useState<string | null>(null)

  // Preview mode reads as true while the user is still loading, so wait for the user first.
  const me = useQuery(api.users.getMyUser)
  const userLoading = me === undefined

  // The team is clinicians only; an administrator signs in with the owner's account.
  // Team and roles return samples for preview visitors; invitations throw for them, so skip.
  const teamQuery = useQuery(api.clinicTools.getClinicCliniciansWithCaseload, {})
  const roles = useQuery(api.clinicTools.listClinicRoles, {}) as ClinicRole[] | undefined
  const invitationsQuery = useQuery(api.clinics.getClinicInvitations, isPreviewMode ? 'skip' : {}) as
    | StaffInvitation[]
    | undefined

  const resendStaffInvitation = useAction(
    api.actions.clinics.inviteClinicStaff.resendClinicStaffInvitation
  )

  const team = teamQuery as TeamMember[] | undefined
  const invitations: StaffInvitation[] | undefined = isPreviewMode ? [] : invitationsQuery

  const openInvite = () => requireFullAccess('Invite clinician', () => setInviteOpen(true))

  // Open invite modal via deep link: ?action=invite
  useEffect(() => {
    if (userLoading) return
    if (searchParams.get('action') === 'invite') {
      openInvite()
      const params = new URLSearchParams(searchParams.toString())
      params.delete('action')
      const newQuery = params.toString()
      router.replace(newQuery ? `${pathname}?${newQuery}` : pathname, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, pathname, userLoading])

  const handleResend = async (inviteeEmail: string, inviteeName: string | undefined, id: string) => {
    if (!requireFullAccess('Resend invitation')) return
    setResendingId(id)
    try {
      const res = await resendStaffInvitation({ inviteeEmail, inviteeName })
      if (res?.success) {
        toast.success('Invitation resent')
      } else {
        toast.error(res?.message || 'Could not resend invitation')
      }
    } catch (error) {
      toast.error(teamError(error, 'Could not resend invitation'))
      console.error('Resend invitation error:', error)
    } finally {
      setResendingId(null)
    }
  }

  const loading = userLoading || team === undefined || invitations === undefined
  const members = team ?? []
  const openInvitations = (invitations ?? []).filter((inv) => inv.status === 'pending')
  const suspendedCount = members.filter((m) => m.status === 'suspended').length
  const patientsInCare = members.reduce((sum, m) => sum + (m.activeCaseload || 0), 0)
  const visitsThisMonth = members.reduce((sum, m) => sum + (m.monthlyAppointmentsCount || 0), 0)
  const teamHint = suspendedCount > 0 ? `${plural(suspendedCount, 'clinician')} suspended` : undefined

  return (
    <PageShell
      title="Team"
      description="The clinicians at your clinic, which pages they can open, and invitations you've sent."
      actions={
        <Button id="staff-invite-button" size="sm" className={primaryButtonClass} onClick={openInvite}>
          <UserPlus className="mr-1.5 h-4 w-4" />
          Invite clinician
        </Button>
      }
    >
      <EnhancedClinicStaffInviteModal isOpen={inviteOpen} onClose={() => setInviteOpen(false)} />

      {loading ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[92px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </>
      ) : (
        <>
          <div id="staff-stats-cards" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Clinicians" value={members.length} hint={teamHint} />
            <StatTile label="Pending invitations" value={openInvitations.length} />
            <StatTile label="Patients in care" value={patientsInCare} hint="Across all clinicians" />
            <StatTile label="Visits this month" value={visitsThisMonth} />
          </div>

          <div id="staff-list" className="space-y-6">
            <Panel title="Clinicians" description="Treat patients and take bookings.">
              <StaffTable staff={members} roles={roles} onInvite={openInvite} />
            </Panel>
          </div>

          {openInvitations.length > 0 && (
            <Panel title="Pending invitations" description="Sent, but not yet accepted.">
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {openInvitations.map((invitation) => (
                  <li
                    key={invitation._id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5"
                  >
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                        {invitation.inviteeName || invitation.inviteeEmail}
                      </p>
                      <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                        {invitation.inviteeName ? `${invitation.inviteeEmail} · ` : ''}
                        Sent {format(new Date(invitation._creationTime), 'd MMM')}
                      </p>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">
                        {roleLabel(invitation.clinicRoleId, roles)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {invitation.isExpired ? (
                        <StatusBadge tone="amber">Expired</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">Pending</StatusBadge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={resendingId === invitation._id}
                        onClick={() =>
                          handleResend(invitation.inviteeEmail, invitation.inviteeName, invitation._id)
                        }
                      >
                        {resendingId === invitation._id ? 'Sending…' : 'Resend'}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <RolesPanel roles={roles} />
        </>
      )}

      <TourGuide
        tourId="clinic-staff-tour"
        steps={[
          {
            target: '#staff-invite-button',
            title: 'Invite your clinicians',
            content: 'Invite the physiotherapists who work at your clinic. They sign in with their own account.',
            position: 'bottom',
          },
          {
            target: '#staff-stats-cards',
            title: 'Team at a glance',
            content: 'How many clinicians you have, invitations waiting, and the current workload.',
            position: 'bottom',
          },
          {
            target: '#staff-list',
            title: 'Manage your team',
            content: "Pick each person's role, or use the menu on a row to suspend or remove them.",
            position: 'top',
          },
          {
            target: '#staff-roles',
            title: 'Roles',
            content:
              'Choose which pages each role can open. Clinicians without a role can open Appointments and Patients only.',
            position: 'top',
          },
        ]}
      />
    </PageShell>
  )
}
