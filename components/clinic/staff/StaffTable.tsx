'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Calendar, MessageSquare, MoreHorizontal, Search, Users } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import PatientListModal from './PatientListModal'
import MessageModal from './MessageModal'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AvailabilityScheduler, type OperatingHours } from '@/components/onboarding/common/AvailabilityScheduler'
import { EmptyState, StatusBadge, primaryButtonClass } from '@/components/clinic/ui'
import { useClinicPreview } from '@/components/clinic/ClinicPreviewContext'
import { MemberRoleSelect } from './MemberRoleSelect'
import { teamError, type ClinicRole } from './team-shared'

/** Shape returned by api.clinicTools.getClinicCliniciansWithCaseload */
export interface TeamMember {
    profileId: string
    userId: Id<'users'>
    firstName: string
    lastName: string
    email: string
    phoneNumber?: string
    imageUrl?: string
    role: string
    status: string
    specializations?: string[]
    licenseNumber?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    availabilitySchedule?: any
    activeCaseload: number
    monthlyAppointmentsCount: number
    /** Dashboard role; null means full access */
    clinicRoleId?: Id<'clinicRoles'> | null
}

/** The backend falls back to this placeholder when no license is on file. */
const LICENSE_PLACEHOLDER = 'Verified MRTBN'

export function hasLicense(member: TeamMember) {
    return Boolean(member.licenseNumber && member.licenseNumber !== LICENSE_PLACEHOLDER)
}

const fullName = (m: TeamMember | null) => (m ? `${m.firstName} ${m.lastName}`.trim() : '')

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
const DEFAULT_WEEK: OperatingHours = Object.fromEntries(
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => [
        day,
        { isOpen: WEEKDAYS.includes(day), slots: [{ start: '09:00', end: '17:00' }] },
    ])
)

/** The per-day shape the scheduler edits ({ monday: { isOpen, slots } }). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isOldFormatSchedule(schedule: any): schedule is OperatingHours {
    return Boolean(schedule && typeof schedule === 'object' && ('monday' in schedule || 'tuesday' in schedule))
}

function statusBadge(status: string) {
    if (status === 'suspended') return <StatusBadge tone="amber">Suspended</StatusBadge>
    if (status === 'terminated') return <StatusBadge tone="red">Removed</StatusBadge>
    return <StatusBadge tone="green">Active</StatusBadge>
}

interface StaffTableProps {
    staff: TeamMember[]
    /** Dashboard roles for the per-member role picker */
    roles?: ClinicRole[]
    onInvite?: () => void
}

export default function StaffTable({ staff, roles, onInvite }: StaffTableProps) {
    const { requireFullAccess, isStaff } = useClinicPreview()
    const [searchTerm, setSearchTerm] = useState('')
    const [availabilityFor, setAvailabilityFor] = useState<TeamMember | null>(null)
    const [patientsFor, setPatientsFor] = useState<TeamMember | null>(null)
    const [messageFor, setMessageFor] = useState<TeamMember | null>(null)
    const [statusChangeFor, setStatusChangeFor] = useState<TeamMember | null>(null)
    const [removeFor, setRemoveFor] = useState<TeamMember | null>(null)
    const [busy, setBusy] = useState(false)

    const updateStaffStatus = useMutation(api.clinics.updateStaffStatus)
    const removeClinician = useMutation(api.clinicTools.removeClinician)
    const updateClinicianAvailability = useMutation(api.clinicTools.updateClinicianAvailability)
    const [draftSchedule, setDraftSchedule] = useState<OperatingHours | null>(null)

    const closeAvailability = () => {
        setAvailabilityFor(null)
        setDraftSchedule(null)
    }

    const startEditingAvailability = () => {
        if (!availabilityFor) return
        requireFullAccess('Edit working hours', () => {
            const current = availabilityFor.availabilitySchedule
            setDraftSchedule(isOldFormatSchedule(current) ? current : DEFAULT_WEEK)
        })
    }

    const handleSaveAvailability = async () => {
        if (!availabilityFor || !draftSchedule) return
        setBusy(true)
        try {
            await updateClinicianAvailability({
                clinicianId: availabilityFor.userId,
                availabilitySchedule: draftSchedule,
            })
            toast.success(`Working hours saved for ${fullName(availabilityFor)}`)
            closeAvailability()
        } catch (error) {
            toast.error(teamError(error, 'Could not save working hours'))
        } finally {
            setBusy(false)
        }
    }

    const term = searchTerm.trim().toLowerCase()
    const filteredStaff = term
        ? staff.filter((m) =>
            `${m.firstName} ${m.lastName} ${m.email}`.toLowerCase().includes(term)
        )
        : staff

    const handleStatusChange = async () => {
        if (!statusChangeFor) return
        const suspending = statusChangeFor.status !== 'suspended'
        setBusy(true)
        try {
            await updateStaffStatus({
                staffId: statusChangeFor.userId,
                newStatus: suspending ? 'suspended' : 'active',
            })
            toast.success(suspending ? `${fullName(statusChangeFor)} suspended` : `${fullName(statusChangeFor)} reactivated`)
            setStatusChangeFor(null)
        } catch (error) {
            toast.error(teamError(error, suspending ? 'Could not suspend clinician' : 'Could not reactivate clinician'))
        } finally {
            setBusy(false)
        }
    }

    const handleRemove = async () => {
        if (!removeFor) return
        setBusy(true)
        try {
            const result = await removeClinician({ clinicianId: removeFor.userId })
            const moved = result?.patientsMoved ?? 0
            toast.success(
                moved > 0
                    ? `${fullName(removeFor)} removed. ${moved} patient${moved === 1 ? '' : 's'} moved to you.`
                    : `${fullName(removeFor)} removed from your clinic`
            )
            setRemoveFor(null)
        } catch (error) {
            toast.error(teamError(error, 'Could not remove clinician'))
        } finally {
            setBusy(false)
        }
    }

    if (staff.length === 0) {
        return (
            <EmptyState
                icon={<Users className="h-8 w-8" />}
                title="No clinicians yet"
                description="Invite physiotherapists to join your clinic. They will appear here once they accept."
                action={
                    onInvite ? (
                        <Button variant="outline" size="sm" onClick={onInvite}>
                            Invite clinician
                        </Button>
                    ) : undefined
                }
            />
        )
    }

    return (
        <div>
            {staff.length > 5 && (
                <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800 sm:px-5">
                    <div className="relative w-full sm:max-w-xs">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                        <Input
                            placeholder="Search by name or email"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-9 pl-9 text-sm"
                        />
                    </div>
                </div>
            )}

            {filteredStaff.length === 0 ? (
                <EmptyState title="No matches" description="Try a different name or email." />
            ) : (
                <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {filteredStaff.map((member) => {
                        const name = fullName(member) || 'Clinician'
                        const isSuspended = member.status === 'suspended'
                        // The owner can appear here when they also see patients; they always have full access
                        const isOwnerRow = member.role === 'clinic_owner'
                        // Suspend and remove are owner-only
                        const canManageMember = !isStaff && !isOwnerRow
                        return (
                            <li
                                key={member.profileId}
                                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                            >
                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                    <Avatar className="h-9 w-9 shrink-0">
                                        <AvatarImage src={member.imageUrl} alt="" />
                                        <AvatarFallback className="bg-neutral-100 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                                            {(member.firstName?.[0] || member.email?.[0] || 'C').toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{name}</p>
                                            {statusBadge(member.status)}
                                        </div>
                                        <p className="break-all text-xs text-neutral-500 dark:text-neutral-400 sm:truncate sm:break-normal">
                                            {member.email || 'No email'}
                                        </p>
                                        {hasLicense(member) && (
                                            <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                                License {member.licenseNumber}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex min-w-0 flex-col gap-3 pl-12 sm:flex-row sm:items-center sm:gap-4 sm:pl-0">
                                    {isOwnerRow ? (
                                        <p className="text-xs text-neutral-600 dark:text-neutral-400 sm:w-44">
                                            Owner, full access
                                        </p>
                                    ) : (
                                        <MemberRoleSelect
                                            memberId={member.userId}
                                            memberName={name}
                                            roleId={member.clinicRoleId}
                                            roles={roles}
                                        />
                                    )}

                                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                                        <div className="flex gap-5 text-xs text-neutral-500 dark:text-neutral-400">
                                            <div>
                                                <p className="text-sm font-medium tabular-nums text-neutral-900 dark:text-white">
                                                    {member.activeCaseload}
                                                </p>
                                                <p>Active patients</p>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium tabular-nums text-neutral-900 dark:text-white">
                                                    {member.monthlyAppointmentsCount}
                                                </p>
                                                <p>Visits this month</p>
                                            </div>
                                        </div>

                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0">
                                                    <MoreHorizontal className="h-4 w-4 text-neutral-500" />
                                                    <span className="sr-only">Actions for {name}</span>
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-52">
                                                <DropdownMenuItem onClick={() => setAvailabilityFor(member)}>
                                                    <Calendar className="mr-2 h-4 w-4 text-neutral-500" />
                                                    Working hours
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() =>
                                                        String(member.userId).startsWith('prev_')
                                                            ? requireFullAccess('View clinician patients')
                                                            : setPatientsFor(member)
                                                    }
                                                >
                                                    <Users className="mr-2 h-4 w-4 text-neutral-500" />
                                                    View patients
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => requireFullAccess('Message clinician', () => setMessageFor(member))}
                                                >
                                                    <MessageSquare className="mr-2 h-4 w-4 text-neutral-500" />
                                                    Message
                                                </DropdownMenuItem>
                                                {canManageMember && (
                                                    <>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={() =>
                                                                requireFullAccess(
                                                                    isSuspended ? 'Reactivate clinician' : 'Suspend clinician',
                                                                    () => setStatusChangeFor(member)
                                                                )
                                                            }
                                                        >
                                                            {isSuspended ? 'Reactivate' : 'Suspend'}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                                                            onClick={() => requireFullAccess('Remove clinician', () => setRemoveFor(member))}
                                                        >
                                                            Remove from clinic
                                                        </DropdownMenuItem>
                                                    </>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            </li>
                        )
                    })}
                </ul>
            )}

            {/* Availability */}
            <Dialog open={!!availabilityFor} onOpenChange={(open) => !open && !busy && closeAvailability()}>
                <DialogContent className="max-w-2xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold">Working hours</DialogTitle>
                        <DialogDescription>
                            {fullName(availabilityFor)}
                            {draftSchedule ? ' · Patients can only book inside these hours.' : ''}
                        </DialogDescription>
                    </DialogHeader>
                    {draftSchedule ? (
                        <>
                            <AvailabilityScheduler value={draftSchedule} onChange={setDraftSchedule} />
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => setDraftSchedule(null)} disabled={busy}>
                                    Cancel
                                </Button>
                                <Button size="sm" className={primaryButtonClass} onClick={handleSaveAvailability} disabled={busy}>
                                    {busy ? 'Saving…' : 'Save hours'}
                                </Button>
                            </div>
                        </>
                    ) : availabilityFor && isOldFormatSchedule(availabilityFor.availabilitySchedule) ? (
                        <>
                            <AvailabilityScheduler
                                value={availabilityFor.availabilitySchedule}
                                onChange={() => {}}
                                readOnly={true}
                            />
                            <div className="flex justify-end">
                                <Button variant="outline" size="sm" onClick={startEditingAvailability}>
                                    Edit hours
                                </Button>
                            </div>
                        </>
                    ) : (
                        <EmptyState
                            icon={<Calendar className="h-8 w-8" />}
                            title="No working hours set"
                            description="Set the hours this clinician sees patients."
                            action={
                                <Button variant="outline" size="sm" onClick={startEditingAvailability}>
                                    Set hours
                                </Button>
                            }
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Suspend / reactivate */}
            <AlertDialog open={!!statusChangeFor} onOpenChange={(open) => !open && !busy && setStatusChangeFor(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {statusChangeFor?.status === 'suspended' ? 'Reactivate' : 'Suspend'} {fullName(statusChangeFor)}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {statusChangeFor?.status === 'suspended'
                                ? 'They will be able to see patients and take bookings again.'
                                : 'They stay on your team, but are marked as suspended until you reactivate them. Their patients are not moved.'}
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
                        <AlertDialogTitle>Remove {fullName(removeFor)} from your clinic?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {removeFor && removeFor.activeCaseload > 0
                                ? `Their ${removeFor.activeCaseload} active patient${removeFor.activeCaseload === 1 ? '' : 's'} will be moved to you. You can reassign them to another clinician afterwards.`
                                : 'They have no active patients. Their account stays, but they will no longer be part of your clinic.'}
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

            {patientsFor && (
                <PatientListModal
                    isOpen={!!patientsFor}
                    onClose={() => setPatientsFor(null)}
                    physiotherapistId={patientsFor.userId}
                    physiotherapistName={fullName(patientsFor)}
                    allStaff={staff}
                />
            )}

            {messageFor && (
                <MessageModal
                    isOpen={!!messageFor}
                    onClose={() => setMessageFor(null)}
                    recipientId={messageFor.userId}
                    recipientName={fullName(messageFor)}
                />
            )}
        </div>
    )
}
