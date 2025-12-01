'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
    FileText,
    Flag,
    Download,
    Clock,
    User,
    AlertTriangle,
    CheckCircle,
    X
} from 'lucide-react'
import { format } from 'date-fns'
import type { Id } from '@/convex/_generated/dataModel'

interface PatientClinicalViewProps {
    patientId: Id<'users'> | null
    isOpen: boolean
    onClose: () => void
}

export default function PatientClinicalView({ patientId, isOpen, onClose }: PatientClinicalViewProps) {
    const [flagReason, setFlagReason] = useState('')
    const [isFlagging, setIsFlagging] = useState(false)

    const patientDetails = useQuery(api.patients.getPatientDetails,
        patientId ? { patientId } : "skip"
    )

    const toggleFlag = useMutation(api.patients.togglePatientFlag)

    if (!patientId) return null

    const handleToggleFlag = async () => {
        if (!patientDetails?.patientRecord) return

        const isCurrentlyFlagged = patientDetails.patientRecord.isFlagged

        if (!isCurrentlyFlagged && !flagReason) {
            toast.error("Please provide a reason for flagging this patient")
            return
        }

        try {
            await toggleFlag({
                patientId,
                isFlagged: !isCurrentlyFlagged,
                reason: !isCurrentlyFlagged ? flagReason : undefined
            })
            toast.success(isCurrentlyFlagged ? "Patient unflagged" : "Patient flagged for review")
            if (isCurrentlyFlagged) {
                setFlagReason('')
            }
            setIsFlagging(false)
        } catch (error) {
            toast.error("Failed to update flag status")
        }
    }

    const exportCaseFile = () => {
        window.print()
    }

    if (!patientDetails) {
        return null // Or a loading skeleton
    }

    const { user, patientRecord, sessionLogs } = patientDetails

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <style jsx global>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .print-content, .print-content * {
                        visibility: visible;
                    }
                    .print-content {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        height: auto;
                        overflow: visible !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                    /* Ensure scroll areas are expanded */
                    [data-radix-scroll-area-viewport] {
                        overflow: visible !important;
                    }
                }
            `}</style>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0 print-content">
                {/* Header */}
                <div className="p-6 border-b flex items-start justify-between bg-gray-50/50">
                    <div className="flex items-center gap-4">
                        <Avatar className="h-16 w-16 border-2 border-white shadow-sm">
                            <AvatarImage src={user?.imageUrl} />
                            <AvatarFallback className="text-lg">
                                {user?.firstName?.[0]}{user?.lastName?.[0]}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <div className="flex items-center gap-2">
                                <DialogTitle className="text-2xl font-bold">
                                    {user?.firstName} {user?.lastName}
                                </DialogTitle>
                                {patientRecord?.isFlagged && (
                                    <Badge variant="destructive" className="gap-1">
                                        <Flag className="h-3 w-3" />
                                        Flagged for Review
                                    </Badge>
                                )}
                            </div>
                            <DialogDescription className="mt-1 flex items-center gap-2">
                                <span className="flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    {user?.email}
                                </span>
                                <span>•</span>
                                <span>{sessionLogs?.length || 0} Sessions</span>
                            </DialogDescription>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 no-print">
                        <Button variant="outline" onClick={exportCaseFile}>
                            <Download className="h-4 w-4 mr-2" />
                            Export Case File
                        </Button>
                        <Button
                            variant={patientRecord?.isFlagged ? "outline" : "destructive"}
                            onClick={() => setIsFlagging(!isFlagging)}
                        >
                            <Flag className="h-4 w-4 mr-2" />
                            {patientRecord?.isFlagged ? "Resolve Flag" : "Flag for Review"}
                        </Button>
                    </div>
                </div>

                {/* Flagging Interface */}
                {isFlagging && (
                    <div className="p-4 bg-red-50 border-b animate-in slide-in-from-top-2">
                        <div className="flex items-start gap-4">
                            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                            <div className="flex-1 space-y-2">
                                <h4 className="font-semibold text-red-900">
                                    {patientRecord?.isFlagged ? "Resolve Flag" : "Flag Patient for Review"}
                                </h4>
                                <p className="text-sm text-red-700">
                                    {patientRecord?.isFlagged
                                        ? "Are you sure you want to resolve this flag? This action will be logged."
                                        : "Flagging a patient highlights their file for administrative review. Please provide a reason."
                                    }
                                </p>
                                {!patientRecord?.isFlagged && (
                                    <Textarea
                                        placeholder="Reason for flagging (e.g., billing issue, safety concern)..."
                                        value={flagReason}
                                        onChange={(e) => setFlagReason(e.target.value)}
                                        className="bg-white"
                                    />
                                )}
                                <div className="flex gap-2 mt-2">
                                    <Button
                                        size="sm"
                                        variant={patientRecord?.isFlagged ? "outline" : "destructive"}
                                        onClick={handleToggleFlag}
                                    >
                                        {patientRecord?.isFlagged ? "Confirm Resolution" : "Flag Patient"}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setIsFlagging(false)}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-hidden">
                    <Tabs defaultValue="notes" className="h-full flex flex-col">
                        <div className="px-6 pt-4 border-b">
                            <TabsList className="no-print">
                                <TabsTrigger value="notes">Clinical Notes</TabsTrigger>
                                <TabsTrigger value="info">Patient Info</TabsTrigger>
                                <TabsTrigger value="history">History</TabsTrigger>
                            </TabsList>
                        </div>

                        <TabsContent value="notes" className="flex-1 overflow-hidden p-0 m-0">
                            <ScrollArea className="h-full">
                                <div className="p-6 space-y-6">
                                    {sessionLogs?.length === 0 ? (
                                        <div className="text-center py-12 text-gray-500">
                                            <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
                                            <p>No session notes available yet.</p>
                                        </div>
                                    ) : (
                                        sessionLogs?.map((log: any) => (
                                            <div key={log._id} className="border rounded-lg p-4 space-y-3 bg-white shadow-sm">
                                                <div className="flex items-center justify-between border-b pb-3">
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline">
                                                            {format(new Date(log.sessionDate), 'MMM dd, yyyy')}
                                                        </Badge>
                                                        <span className="text-sm text-gray-500 flex items-center gap-1">
                                                            <Clock className="h-3 w-3" />
                                                            {format(new Date(log.sessionDate), 'HH:mm')}
                                                        </span>
                                                    </div>
                                                    <div className="text-sm font-medium text-gray-600">
                                                        Dr. {log.physiotherapist?.firstName} {log.physiotherapist?.lastName}
                                                    </div>
                                                </div>

                                                <div className="grid md:grid-cols-2 gap-6">
                                                    <div className="space-y-1">
                                                        <Label className="text-xs text-gray-500 uppercase tracking-wider">Subjective</Label>
                                                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                                            {log.subjectiveAssessment || "No notes"}
                                                        </p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-xs text-gray-500 uppercase tracking-wider">Objective</Label>
                                                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                                            {log.objectiveAssessment || "No notes"}
                                                        </p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-xs text-gray-500 uppercase tracking-wider">Treatment</Label>
                                                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                                            {log.treatmentAdministered || "No notes"}
                                                        </p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-xs text-gray-500 uppercase tracking-wider">Plan</Label>
                                                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                                            {log.planForNextSession || "No notes"}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent value="info" className="flex-1 overflow-auto p-6">
                            <div className="grid gap-6 md:grid-cols-2">
                                <div className="space-y-4">
                                    <h3 className="font-semibold text-lg">Personal Information</h3>
                                    <div className="grid gap-2 text-sm">
                                        <div className="grid grid-cols-3">
                                            <span className="text-gray-500">Phone</span>
                                            <span className="col-span-2 font-medium">{user?.phoneNumber || 'N/A'}</span>
                                        </div>
                                        <div className="grid grid-cols-3">
                                            <span className="text-gray-500">Email</span>
                                            <span className="col-span-2 font-medium">{user?.email}</span>
                                        </div>
                                        <div className="grid grid-cols-3">
                                            <span className="text-gray-500">Address</span>
                                            <span className="col-span-2 font-medium">{patientRecord?.address || 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="font-semibold text-lg">Medical Profile</h3>
                                    <div className="grid gap-2 text-sm">
                                        <div className="grid grid-cols-3">
                                            <span className="text-gray-500">Conditions</span>
                                            <span className="col-span-2 font-medium">
                                                {patientRecord?.currentConditions?.join(', ') || 'None listed'}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-3">
                                            <span className="text-gray-500">Allergies</span>
                                            <span className="col-span-2 font-medium text-red-600">
                                                {patientRecord?.allergies?.join(', ') || 'None'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog>
    )
}
