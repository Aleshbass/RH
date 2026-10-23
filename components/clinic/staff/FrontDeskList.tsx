'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { MoreHorizontal, Users } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useClinicAccess } from '@/components/clinic/ClinicAccessContext'
import { EmptyState, StatusBadge } from '@/components/clinic/ui'
import { isMissingId } from '@/components/clinic/patients/patient-record-shared'
import { MemberRoleSelect } from './MemberRoleSelect'
import { teamError, type ClinicRole, type FrontDeskMember } from './team-shared'

const fullName = (m: FrontDeskMember | null) => (m ? `${m.firstName} ${m.lastName}`.trim() : '')

function statusBadge(status: string) {
  if (status === 'suspended') return <StatusBadge tone="amber">Suspended</StatusBadge>
  return <StatusBadge tone="green">Active</StatusBadge>
}

/**
 * Receptionists and administrators: people who use the dashboard but don't treat patients.
 */
export default function FrontDeskList({
  staff,
  roles,
  onInvite,
}: {
  staff: FrontDeskMember[]
  roles: ClinicRole[] | undefined
  onInvite?: () => void
}) {
  const { isOwner, requireFullAccess } = useClinicAccess()
  const updateStaffStatus = useMutation(api.clinics.updateStaffStatus)
  const removeFrontDesk = useMutation(api.clinicTools.removeFrontDeskStaff)

  const [statusChangeFor, setStatusChangeFor] = useState<FrontDeskMember | null>(null)
  const [removeFor, setRemoveFor] = useState<FrontDeskMember | null>(null)
  const [busy, setBusy] = useState(false)

  // Suspend and remove are owner-only
  const showMenu = isOwner

  const ownerAction = (member: FrontDeskMember, actionName: string, open: () => void) => {
    if (!isOwner || isMissingId(member.userId)) {
      requireFullAccess(actionName)
      return
    }
    open()
  }

  const handleStatusChange = async () => {
    if (!statusChangeFor) return
    const suspending = statusChangeFor.status !== 'suspended'
    setBusy(true)
    try {
      await updateStaffStatus({
        staffId: statusChangeFor.userId,
        newStatus: suspending ? 'suspended' : 'active',
      })
      toast.success(`${fullName(statusChangeFor)} ${suspending ? 'suspended' : 'reactivated'}`)
      setStatusChangeFor(null)
    } catch (err) {
      toast.error(teamError(err, suspending ? 'Could not suspend this person' : 'Could not reactivate this person'))
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    if (!removeFor) return
    setBusy(true)
    try {
      await removeFrontDesk({ memberId: removeFor.userId })
      toast.success(`${fullName(removeFor) || removeFor.email} removed from your clinic`)
      setRemoveFor(null)
    } catch (err) {
      toast.error(teamError(err, 'Could not remove this person'))
    } finally {
      setBusy(false)
    }
  }

  if (staff.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-8 w-8" />}
        title="No front desk staff yet"
        description="Receptionists and administrators use the dashboard but don't treat patients."
        action={
          onInvite ? (
            <Button variant="outline" size="sm" onClick={onInvite}>
              Invite front desk
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <div>
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {staff.map((member) => {
          const name = fullName(member) || member.email || 'Team member'
          const isSuspended = member.status === 'suspended'
          return (
            <li
              key={member.userId}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  {(member.firstName?.[0] || member.email?.[0] || 'T').toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{name}</p>
                    {statusBadge(member.status)}
                  </div>
                  <p className="break-all text-xs text-neutral-500 dark:text-neutral-400 sm:truncate sm:break-normal">
                    {member.email || 'No email'}
                    {member.joinedAt ? ` · Joined ${format(new Date(member.joinedAt), 'd MMM yyyy')}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex min-w-0 items-center gap-2 pl-12 sm:pl-0">
                <MemberRoleSelect
                  memberId={member.userId}
                  memberName={name}
                  roleId={member.clinicRoleId}
                  roles={roles}
                  kind="front_desk"
                  className="flex-1 sm:flex-none"
                />
                {showMenu && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0">
                        <MoreHorizontal className="h-4 w-4 text-neutral-500" />
                        <span className="sr-only">Actions for {name}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        onClick={() =>
                          ownerAction(member, isSuspended ? 'Reactivate team member' : 'Suspend team member', () =>
                            setStatusChangeFor(member)
                          )
                        }
                      >
                        {isSuspended ? 'Reactivate' : 'Suspend'}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                        onClick={() => ownerAction(member, 'Remove team member', () => setRemoveFor(member))}
                      >
                        Remove from clinic
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {/* Suspend / reactivate */}
      <AlertDialog open={!!statusChangeFor} onOpenChange={(open) => !open && !busy && setStatusChangeFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusChangeFor?.status === 'suspended' ? 'Reactivate' : 'Suspend'} {fullName(statusChangeFor)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusChangeFor?.status === 'suspended'
                ? 'They will be able to use the clinic dashboard again.'
                : "They stay on your team but can't use the clinic dashboard until you reactivate them."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void handleStatusChange()
              }}
            >
              {busy ? 'Saving…' : statusChangeFor?.status === 'suspended' ? 'Reactivate' : 'Suspend'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove */}
      <AlertDialog open={!!removeFor} onOpenChange={(open) => !open && !busy && setRemoveFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {fullName(removeFor) || removeFor?.email} from your clinic?</AlertDialogTitle>
            <AlertDialogDescription>
              Their account stays, but they lose access to your clinic dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault()
                void handleRemove()
              }}
            >
              {busy ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
