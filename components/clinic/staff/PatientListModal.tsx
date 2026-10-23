'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Users } from '@/components/icons'
import { toast } from 'sonner'
import { Id } from '@/convex/_generated/dataModel'
import { EmptyState, StatusBadge, primaryButtonClass } from '@/components/clinic/ui'
import { useClinicPreview } from '@/components/clinic/ClinicPreviewContext'

/** Accepts both getClinicCliniciansWithCaseload rows and getClinicStaff rows. */
interface StaffOption {
    userId: string
    role?: string
    status?: string
    firstName?: string
    lastName?: string
    user?: { firstName?: string; lastName?: string } | null
}

interface PatientListModalProps {
    isOpen: boolean
    onClose: () => void
    physiotherapistId: string
    physiotherapistName: string
    allStaff: StaffOption[] // List of all staff for reassignment options
}

function stageTone(stage?: string) {
    switch (stage) {
        case 'Mid': return 'teal' as const
        case 'Discharge Readiness': return 'green' as const
        default: return 'neutral' as const
    }
}

export default function PatientListModal({
    isOpen,
    onClose,
    physiotherapistId,
    physiotherapistName,
    allStaff
}: PatientListModalProps) {
    const { requireFullAccess } = useClinicPreview()
    const [reassigningPatientId, setReassigningPatientId] = useState<string | null>(null)
    const [targetPhysioId, setTargetPhysioId] = useState<string>('')
    const [saving, setSaving] = useState(false)

    const currentUser = useQuery(api.users.getMyUser)

    // Fetch patients for this physiotherapist
    const patients = useQuery(api.patients.getPhysiotherapistPatients,
        isOpen ? { physiotherapistId: physiotherapistId as Id<"users"> } : "skip"
    )

    const reassignPatient = useMutation(api.patients.reassignPatient)

    const resetReassign = () => {
        setReassigningPatientId(null)
        setTargetPhysioId('')
    }

    const handleReassign = async () => {
        if (!reassigningPatientId || !targetPhysioId) return
        if (!requireFullAccess('Reassign patient')) return

        setSaving(true)
        try {
            await reassignPatient({
                patientId: reassigningPatientId as Id<"users">,
                currentPhysiotherapistId: physiotherapistId as Id<"users">,
                newPhysiotherapistId: targetPhysioId as Id<"users">,
                reason: "Clinic owner reassignment"
            })

            toast.success('Patient reassigned')
            resetReassign()
        } catch (error) {
            toast.error('Could not reassign patient')
            console.error('Reassignment error:', error)
        } finally {
            setSaving(false)
        }
    }

    // Active physiotherapists other than the one whose list this is
    const otherPhysios = allStaff
        .filter(
            (staff) =>
                staff.userId !== physiotherapistId &&
                (staff.role ?? 'physiotherapist') === 'physiotherapist' &&
                (staff.status ?? 'active') === 'active'
        )
        .map((staff) => ({
            id: staff.userId,
            label: `${staff.firstName ?? staff.user?.firstName ?? ''} ${staff.lastName ?? staff.user?.lastName ?? ''}`.trim() || 'Clinician',
        }))

    // The clinic owner can always take the patient
    const ownerId = currentUser?._id as string | undefined
    const reassignOptions = [
        ...(ownerId && ownerId !== physiotherapistId ? [{ id: ownerId, label: 'You (owner)' }] : []),
        ...otherPhysios.filter((p) => p.id !== ownerId),
    ]

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="flex max-w-2xl flex-col">
                <DialogHeader>
                    <DialogTitle className="text-base font-semibold">Patients: {physiotherapistName || 'Clinician'}</DialogTitle>
                    <DialogDescription>
                        Patients currently under this clinician&apos;s care. Reassign to move a patient to someone else.
                    </DialogDescription>
                </DialogHeader>

                {patients === undefined ? (
                    <div className="space-y-2">
                        {[0, 1, 2].map((i) => (
                            <Skeleton key={i} className="h-16 w-full rounded-xl" />
                        ))}
                    </div>
                ) : patients.length === 0 ? (
                    <EmptyState
                        icon={<Users className="h-8 w-8" />}
                        title="No patients assigned"
                        description="This clinician doesn't have any active patients."
                    />
                ) : (
                    <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
                        <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {patients.map((patient: any) => (
                                <li key={patient._id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <Avatar className="h-9 w-9 shrink-0">
                                            <AvatarImage src={patient.imageUrl} alt="" />
                                            <AvatarFallback className="bg-neutral-100 text-xs dark:bg-neutral-800">
                                                {patient.firstName?.[0]}{patient.lastName?.[0]}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                                                {patient.firstName} {patient.lastName}
                                            </p>
                                            <div className="mt-0.5 flex flex-wrap items-center gap-2">
                                                {patient.stage && <StatusBadge tone={stageTone(patient.stage)}>{patient.stage}</StatusBadge>}
                                                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                                    {patient.sessionCount ?? 0} sessions
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {reassigningPatientId === patient._id ? (
                                        <div className="flex flex-wrap gap-2">
                                            {reassignOptions.length === 0 ? (
                                                <p className="w-full text-xs text-neutral-500 sm:w-[200px]">No one else to reassign to.</p>
                                            ) : (
                                                <Select value={targetPhysioId} onValueChange={setTargetPhysioId}>
                                                    <SelectTrigger className="w-full sm:w-[200px]">
                                                        <SelectValue placeholder="Choose clinician" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {reassignOptions.map((option) => (
                                                            <SelectItem key={option.id} value={option.id}>
                                                                {option.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                            <Button
                                                size="sm"
                                                className={primaryButtonClass}
                                                onClick={handleReassign}
                                                disabled={!targetPhysioId || saving}
                                            >
                                                {saving ? 'Moving…' : 'Confirm'}
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={resetReassign} disabled={saving}>
                                                Cancel
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="self-start sm:self-auto"
                                            onClick={() => {
                                                setTargetPhysioId('')
                                                setReassigningPatientId(patient._id)
                                            }}
                                        >
                                            Reassign
                                        </Button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
