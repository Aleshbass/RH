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
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, ArrowRightLeft, Users, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Id } from '@/convex/_generated/dataModel'

interface PatientListModalProps {
    isOpen: boolean
    onClose: () => void
    physiotherapistId: string
    physiotherapistName: string
    allStaff: any[] // List of all staff for reassignment options
}

export default function PatientListModal({
    isOpen,
    onClose,
    physiotherapistId,
    physiotherapistName,
    allStaff
}: PatientListModalProps) {
    const [reassigningPatientId, setReassigningPatientId] = useState<string | null>(null)
    const [targetPhysioId, setTargetPhysioId] = useState<string>('')

    // Fetch patients for this physiotherapist
    const patients = useQuery(api.patients.getPhysiotherapistPatients,
        isOpen ? { physiotherapistId: physiotherapistId as Id<"users"> } : "skip"
    )

    const reassignPatient = useMutation(api.patients.reassignPatient)

    const handleReassign = async () => {
        if (!reassigningPatientId || !targetPhysioId) return

        try {
            await reassignPatient({
                patientId: reassigningPatientId as Id<"users">,
                currentPhysiotherapistId: physiotherapistId as Id<"users">,
                newPhysiotherapistId: targetPhysioId as Id<"users">,
                reason: "Clinic owner reassignment"
            })

            toast.success('Patient reassigned successfully')
            setReassigningPatientId(null)
            setTargetPhysioId('')
        } catch (error) {
            toast.error('Failed to reassign patient')
            console.error('Reassignment error:', error)
        }
    }

    // Filter out the current physiotherapist from the target list
    const availablePhysios = allStaff.filter(
        staff => staff.userId !== physiotherapistId && staff.role === 'physiotherapist' && staff.status === 'active'
    )

    const getStageColor = (stage: string) => {
        switch (stage) {
            case 'Initial': return 'bg-blue-100 text-blue-800'
            case 'Mid': return 'bg-purple-100 text-purple-800'
            case 'Discharge Readiness': return 'bg-green-100 text-green-800'
            default: return 'bg-gray-100 text-gray-800'
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Patient List: {physiotherapistName}</DialogTitle>
                    <DialogDescription>
                        View and manage patients assigned to this physiotherapist.
                    </DialogDescription>
                </DialogHeader>

                {patients === undefined ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                    </div>
                ) : patients.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                        <Users className="h-12 w-12 mb-4 text-gray-300" />
                        <p>No patients assigned to this physiotherapist.</p>
                    </div>
                ) : (
                    <ScrollArea className="flex-1 pr-4">
                        <div className="space-y-4">
                            {patients.map((patient: any) => (
                                <div key={patient._id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors gap-4">
                                    <div className="flex items-center space-x-4">
                                        <Avatar className="h-10 w-10">
                                            <AvatarImage src={patient.imageUrl} />
                                            <AvatarFallback>{patient.firstName?.[0]}{patient.lastName?.[0]}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <h4 className="font-medium">{patient.firstName} {patient.lastName}</h4>
                                            <div className="flex items-center gap-2 mt-1">
                                                <Badge variant="secondary" className={getStageColor(patient.stage)}>
                                                    {patient.stage}
                                                </Badge>
                                                <span className="text-xs text-gray-500 flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {patient.sessionCount} sessions
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {reassigningPatientId === patient._id ? (
                                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-200">
                                            <Select value={targetPhysioId} onValueChange={setTargetPhysioId}>
                                                <SelectTrigger className="w-[200px]">
                                                    <SelectValue placeholder="Select new physio" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availablePhysios.map(physio => (
                                                        <SelectItem key={physio.userId} value={physio.userId}>
                                                            {physio.user?.firstName} {physio.user?.lastName}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                size="sm"
                                                onClick={handleReassign}
                                                disabled={!targetPhysioId}
                                            >
                                                Confirm
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => {
                                                    setReassigningPatientId(null)
                                                    setTargetPhysioId('')
                                                }}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setReassigningPatientId(patient._id)}
                                        >
                                            <ArrowRightLeft className="h-3 w-3 mr-2" />
                                            Reassign
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                )}
            </DialogContent>
        </Dialog>
    )
}
