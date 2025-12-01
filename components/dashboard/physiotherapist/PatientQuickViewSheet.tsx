'use client'

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Calendar, Clock, FileText, User, ArrowRight, Edit2, MessageCircle } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { useRouter } from 'next/navigation'

interface Patient {
    _id: string
    firstName: string
    lastName: string
    imageUrl?: string
    email?: string
    phoneNumber?: string
    profile?: {
        gender?: string
        dateOfBirth?: string
    }
    stats: {
        appointmentCount: number
        lastSessionDate?: number
    }
}

interface PatientQuickViewSheetProps {
    patient: Patient | null
    isOpen: boolean
    onClose: () => void
}

export function PatientQuickViewSheet({ patient, isOpen, onClose }: PatientQuickViewSheetProps) {
    const router = useRouter()

    if (!patient) return null

    const handleViewProfile = () => {
        onClose()
        router.push(`/dashboard/physiotherapist/patients/${patient._id}`)
    }

    const handleEditProfile = () => {
        onClose()
        router.push(`/dashboard/physiotherapist/patients/${patient._id}?tab=overview`)
    }

    const handleWhatsAppMessage = (phoneNumber: string) => {
        // Remove any non-digit characters from phone number
        const cleanPhone = phoneNumber.replace(/\D/g, '')
        // Open WhatsApp with the patient's number
        window.open(`https://wa.me/${cleanPhone}`, '_blank')
    }

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="sm:max-w-md">
                <SheetHeader className="space-y-4">
                    <div className="flex items-start justify-between">
                        <div className="flex-1" />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleEditProfile}
                            className="h-8 px-2 text-gray-500 hover:text-gray-900"
                        >
                            <Edit2 className="h-4 w-4 mr-1" />
                            <span className="text-xs">Edit</span>
                        </Button>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                        <Avatar className="h-24 w-24 mb-4">
                            <AvatarImage src={patient.imageUrl} />
                            <AvatarFallback className="text-2xl">
                                {patient.firstName?.[0]}{patient.lastName?.[0]}
                            </AvatarFallback>
                        </Avatar>
                        <SheetTitle className="text-2xl font-bold text-center">
                            {patient.firstName} {patient.lastName}
                        </SheetTitle>
                        <SheetDescription className="text-center">
                            {patient.email}
                        </SheetDescription>
                    </div>
                </SheetHeader>

                <div className="py-6 space-y-6">
                    {/* Quick Stats */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-4 rounded-lg text-center">
                            <div className="flex justify-center mb-2">
                                <Calendar className="h-5 w-5 text-blue-600" />
                            </div>
                            <p className="text-2xl font-bold text-gray-900">{patient.stats.appointmentCount}</p>
                            <p className="text-xs text-gray-500">Total Appointments</p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg text-center">
                            <div className="flex justify-center mb-2">
                                <Clock className="h-5 w-5 text-green-600" />
                            </div>
                            <p className="text-sm font-medium text-gray-900 mt-1">
                                {patient.stats.lastSessionDate
                                    ? formatDistanceToNow(new Date(patient.stats.lastSessionDate), { addSuffix: true })
                                    : 'Never'}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">Last Session</p>
                        </div>
                    </div>

                    {/* Contact Info & Demographics */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Patient Details</h3>
                        <div className="bg-white border rounded-lg divide-y">
                            <div className="p-3 flex items-center gap-3">
                                <User className="h-4 w-4 text-gray-400" />
                                <div className="flex-1">
                                    <p className="text-xs text-gray-500">Full Name</p>
                                    <p className="text-sm font-medium text-gray-900">{patient.firstName} {patient.lastName}</p>
                                </div>
                            </div>

                            <div className="p-3 flex items-center gap-3">
                                <div className="h-4 w-4 flex items-center justify-center text-gray-400 text-xs font-bold">#</div>
                                <div className="flex-1">
                                    <p className="text-xs text-gray-500">Phone Number</p>
                                    {patient.phoneNumber ? (
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-sm font-medium text-gray-900">{patient.phoneNumber}</p>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleWhatsAppMessage(patient.phoneNumber!)}
                                                className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                                            >
                                                <MessageCircle className="h-3.5 w-3.5 mr-1" />
                                                <span className="text-xs">WhatsApp</span>
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1 text-amber-600">
                                            <span className="text-sm font-medium">Not provided</span>
                                            <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 rounded-full border border-amber-200">Ask Patient</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-3 flex items-center gap-3">
                                <div className="h-4 w-4 flex items-center justify-center text-gray-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs text-gray-500">Age</p>
                                    {patient.profile?.dateOfBirth ? (
                                        <p className="text-sm font-medium text-gray-900">
                                            {(() => {
                                                const birthDate = new Date(patient.profile!.dateOfBirth!);
                                                const ageDifMs = Date.now() - birthDate.getTime();
                                                const ageDate = new Date(ageDifMs);
                                                return Math.abs(ageDate.getUTCFullYear() - 1970);
                                            })()}
                                        </p>
                                    ) : (
                                        <div className="flex items-center gap-1 text-amber-600">
                                            <span className="text-sm font-medium">Not set</span>
                                            <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 rounded-full border border-amber-200">Ask for DOB</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-3 flex items-center gap-3">
                                <div className="h-4 w-4 flex items-center justify-center text-gray-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs text-gray-500">Gender</p>
                                    {patient.profile?.gender && patient.profile.gender !== 'prefer_not_to_say' ? (
                                        <p className="text-sm font-medium text-gray-900 capitalize">
                                            {patient.profile.gender}
                                        </p>
                                    ) : (
                                        <div className="flex items-center gap-1 text-amber-600">
                                            <span className="text-sm font-medium capitalize">{patient.profile?.gender?.replace(/_/g, ' ') || 'Not specified'}</span>
                                            <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 rounded-full border border-amber-200">Ask Patient</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {patient.email && (
                                <div className="p-3 flex items-center gap-3">
                                    <div className="h-4 w-4 flex items-center justify-center text-gray-400">@</div>
                                    <div className="flex-1">
                                        <p className="text-xs text-gray-500">Email</p>
                                        <p className="text-sm font-medium text-gray-900">{patient.email}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <SheetFooter className="pt-4 border-t">
                    <Button className="w-full bg-[#005b57] hover:bg-[#00443e]" onClick={handleViewProfile}>
                        View Full Profile
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    )
}
