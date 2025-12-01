import PatientListModal from './PatientListModal'
import MessageModal from './MessageModal'
import { MessageSquare } from 'lucide-react'

import { useState } from 'react'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    MoreHorizontal,
    Search,
    Filter,
    UserPlus,
    Mail,
    Shield,
    Trash2,
    CheckCircle,
    XCircle,
    Calendar,
    Users
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AvailabilityScheduler } from "@/components/onboarding/common/AvailabilityScheduler"
import { Id } from "@/convex/_generated/dataModel"

interface StaffMember {
    _id: Id<"users">
    userId?: Id<"users">
    firstName?: string
    lastName?: string
    email?: string
    role: "physiotherapist" | "clinic_owner" | "admin"
    status?: "active" | "invited" | "inactive"
    availabilitySchedule?: any
    imageUrl?: string
}

interface StaffTableProps {
    staff: StaffMember[]
    onRefresh?: () => void
}

export default function StaffTable({ staff, onRefresh }: StaffTableProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [roleFilter, setRoleFilter] = useState<string>('all')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [viewAvailabilityStaff, setViewAvailabilityStaff] = useState<StaffMember | null>(null)
    const [viewPatientsStaff, setViewPatientsStaff] = useState<StaffMember | null>(null)
    const [messageStaff, setMessageStaff] = useState<StaffMember | null>(null)

    // ... existing mutations and actions

    // ... existing filter logic

    const filteredStaff = staff.filter((member) => {
        const matchesSearch = (
            member.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            member.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            member.email?.toLowerCase().includes(searchTerm.toLowerCase())
        )
        const matchesRole = roleFilter === 'all' || member.role === roleFilter
        const matchesStatus = statusFilter === 'all' || (member.status || 'active') === statusFilter

        return matchesSearch && matchesRole && matchesStatus
    })

    return (
        <>
            <Card>
                {/* ... existing CardHeader */}

                <CardContent>
                    <div className="space-y-4">
                        {filteredStaff.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                No staff members found matching your filters.
                            </div>
                        ) : (
                            filteredStaff.map((member) => (
                                <div key={member._id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                                    {/* ... existing member details */}

                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-56">
                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                            <DropdownMenuSeparator />

                                            {/* Role Management */}
                                            {/* ... existing role items */}

                                            <DropdownMenuSeparator />

                                            {/* View Availability */}
                                            {member.role === 'physiotherapist' && (
                                                <>
                                                    <DropdownMenuItem onClick={() => setViewAvailabilityStaff(member)}>
                                                        <Calendar className="h-4 w-4 mr-2" />
                                                        View Availability
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => setViewPatientsStaff(member)}>
                                                        <Users className="h-4 w-4 mr-2" />
                                                        View Patients
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => setMessageStaff(member)}>
                                                        <MessageSquare className="h-4 w-4 mr-2" />
                                                        Message
                                                    </DropdownMenuItem>
                                                </>
                                            )}

                                            <DropdownMenuSeparator />

                                            {/* Status Management */}
                                            {/* ... existing status items */}

                                            {/* Resend Invitation */}
                                            {/* ... existing resend item */}

                                            {/* Terminate */}
                                            {/* ... existing terminate item */}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Availability Dialog */}
            <Dialog open={!!viewAvailabilityStaff} onOpenChange={(open) => !open && setViewAvailabilityStaff(null)}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            Availability Schedule: {viewAvailabilityStaff?.firstName} {viewAvailabilityStaff?.lastName}
                        </DialogTitle>
                    </DialogHeader>

                    {viewAvailabilityStaff?.availabilitySchedule ? (
                        <AvailabilityScheduler
                            value={viewAvailabilityStaff.availabilitySchedule}
                            onChange={() => { }} // Read-only
                            readOnly={true}
                        />
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                            <p>No availability schedule set for this staff member.</p>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Patient List Modal */}
            {viewPatientsStaff && (
                <PatientListModal
                    isOpen={!!viewPatientsStaff}
                    onClose={() => setViewPatientsStaff(null)}
                    physiotherapistId={viewPatientsStaff.userId || viewPatientsStaff._id} // Handle potential ID structure differences
                    physiotherapistName={`${viewPatientsStaff.firstName || ''} ${viewPatientsStaff.lastName || ''}`.trim()}
                    allStaff={staff}
                />
            )}

            {/* Message Modal */}
            {messageStaff && (
                <MessageModal
                    isOpen={!!messageStaff}
                    onClose={() => setMessageStaff(null)}
                    recipientId={messageStaff.userId || messageStaff._id}
                    recipientName={`${messageStaff.firstName || ''} ${messageStaff.lastName || ''}`.trim()}
                />
            )}
        </>
    )
}
