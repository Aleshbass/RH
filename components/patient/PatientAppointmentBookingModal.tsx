'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { toast } from 'sonner'
import { Id } from '@/convex/_generated/dataModel'
import { format, addDays, setHours, setMinutes, isBefore, startOfToday } from 'date-fns'
import { ChevronLeft, X, Check, Video, Calendar as CalendarIcon, Clock, User, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { playSound } from '@/lib/sounds'

interface PatientAppointmentBookingModalProps {
    isOpen: boolean
    onClose: () => void
    preselectedPhysiotherapistId?: Id<'users'>
    onAppointmentBooked?: () => void
}

type Step = 'date' | 'time' | 'details' | 'success'
type VideoPlatform = 'rehabify' | 'google_meet'
type AppointmentType = 'telehealth' | 'in-person'

const SERVICE_TYPES = [
    'Initial Consultation',
    'Follow-up Session',
    'Physical Assessment',
    'Exercise Therapy',
    'Manual Therapy',
    'Rehabilitation Session',
    'Progress Review',
    'Discharge Planning',
    'Massage Therapy',
]

const TIME_SLOTS = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30'
]

export function PatientAppointmentBookingModal({
    isOpen,
    onClose,
    preselectedPhysiotherapistId,
    onAppointmentBooked,
}: PatientAppointmentBookingModalProps) {
    const [step, setStep] = useState<Step>('date')
    const [date, setDate] = useState<Date | undefined>(undefined)
    const [time, setTime] = useState<string | null>(null)
    const [serviceType, setServiceType] = useState<string>('')
    const [appointmentType, setAppointmentType] = useState<AppointmentType>('telehealth')
    const [location, setLocation] = useState<string>('')
    const [videoPlatform, setVideoPlatform] = useState<VideoPlatform>('rehabify')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [physiotherapistId, setPhysiotherapistId] = useState<string>('')

    // Get patient's care team
    const careTeam = useQuery(api.patients.getPatientCareTeam)
    const user = useQuery(api.users.getMyUser)
    const googleCredentials = useQuery(api.calendar.oauth.getCredentials, user ? { userId: user._id } : 'skip')

    // Create appointment mutation
    const createAppointment = useMutation(api.appointments.createAppointment)

    useEffect(() => {
        if (preselectedPhysiotherapistId) {
            setPhysiotherapistId(preselectedPhysiotherapistId)
        } else if (careTeam && careTeam.length > 0 && !physiotherapistId) {
            // Default to first physiotherapist if none selected
            setPhysiotherapistId(careTeam[0].physiotherapist?._id || '')
        }
    }, [preselectedPhysiotherapistId, careTeam, physiotherapistId])

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setStep('date')
            setDate(undefined)
            setTime(null)
            setServiceType('')
            setAppointmentType('telehealth')
            setLocation('')
            setVideoPlatform('rehabify')
            setIsSubmitting(false)
        }
    }, [isOpen])

    const handleDateSelect = (selectedDate: Date | undefined) => {
        if (selectedDate) {
            setDate(selectedDate)
            setStep('time')
        }
    }

    const handleTimeSelect = (selectedTime: string) => {
        setTime(selectedTime)
        setStep('details')
    }

    const handleBack = () => {
        if (step === 'time') setStep('date')
        else if (step === 'details') setStep('time')
    }

    const handleSubmit = async () => {
        if (!date || !time || !serviceType || !physiotherapistId || !user) return
        if (appointmentType === 'in-person' && (!location || location.trim() === '')) {
            toast.error('Please enter an exact street address for the appointment');
            return;
        }

        setIsSubmitting(true)

        try {
            const [hours, minutes] = time.split(':').map(Number)
            const startDateTime = setMinutes(setHours(date, hours), minutes)
            const endDateTime = setMinutes(setHours(date, hours + 60), minutes) // Default 60 min

            await createAppointment({
                patientId: user._id,
                physiotherapistId: physiotherapistId as Id<'users'>,
                startTime: startDateTime.getTime(),
                endTime: endDateTime.getTime(),
                serviceType: serviceType,
                appointmentType: appointmentType,
                manualMeetingLink: appointmentType === 'telehealth' && videoPlatform === 'google_meet' ? 'pending-generation' : undefined,
                location: appointmentType === 'in-person' ? location : undefined,
                status: 'scheduled',
            })

            playSound('booked')
            setStep('success')
            onAppointmentBooked?.()
        } catch (error) {
            console.error('Error booking appointment:', error)
            toast.error('Failed to book appointment')
            setIsSubmitting(false)
        }
    }

    const selectedPhysiotherapist = careTeam?.find(
        (member: any) => member.physiotherapist?._id === physiotherapistId
    )

    const renderHeader = () => {
        if (step === 'success') return null

        const title = step === 'date' ? 'Select Date' : step === 'time' ? 'Select Time' : 'Confirm Details'

        return (
            <div className="flex items-center gap-3">
                {step !== 'date' && (
                    <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                )}
                <DialogTitle className="text-lg font-semibold text-gray-900">
                    {title}
                </DialogTitle>
            </div>
        )
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
            <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden bg-white">
                {step !== 'success' && (
                    <div className="px-6 pt-6 pb-3">
                        {renderHeader()}
                        {/* Progress Bar */}
                        <div className="h-1 bg-gray-100 w-full rounded-full overflow-hidden mt-4">
                            <div
                                className="h-full bg-blue-500 transition-all duration-300 ease-in-out"
                                style={{
                                    width: step === 'date' ? '33%' : step === 'time' ? '66%' : '100%'
                                }}
                            />
                        </div>
                    </div>
                )}

                <div className={step === 'date' ? 'px-4 pb-6' : 'px-6 pb-6'}>
                    {step === 'date' && (
                        <Calendar
                            mode="single"
                            selected={date}
                            onSelect={handleDateSelect}
                            {...({ disabled: (date: Date) => isBefore(date, startOfToday()) } as any)}
                            initialFocus
                            className="w-full"
                        />
                    )}

                    {step === 'time' && (
                        <div className="space-y-4">
                            <div className="text-center mb-6">
                                <h3 className="font-medium text-lg">
                                    {date ? format(date, 'EEEE, MMMM d') : ''}
                                </h3>
                                <p className="text-sm text-gray-500">Select a time for your appointment</p>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                {TIME_SLOTS.map((slot) => (
                                    <Button
                                        key={slot}
                                        variant="outline"
                                        className="hover:bg-[#005b57] hover:text-white transition-colors"
                                        onClick={() => handleTimeSelect(slot)}
                                    >
                                        {format(setMinutes(setHours(new Date(), parseInt(slot.split(':')[0])), parseInt(slot.split(':')[1])), 'h:mm a')}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 'details' && (
                        <div className="space-y-6">
                            <div className="bg-blue-50 p-4 rounded-lg space-y-3">
                                <h3 className="font-semibold text-blue-900 flex items-center gap-2">
                                    <Check className="h-4 w-4" /> Confirm Details
                                </h3>

                                <div className="space-y-2 text-sm text-blue-800">
                                    <div className="flex items-center gap-2">
                                        <User className="h-4 w-4 opacity-70" />
                                        <span>{selectedPhysiotherapist?.physiotherapist?.firstName} {selectedPhysiotherapist?.physiotherapist?.lastName}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <CalendarIcon className="h-4 w-4 opacity-70" />
                                        <span>{date ? format(date, 'MMMM d, yyyy') : ''}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Clock className="h-4 w-4 opacity-70" />
                                        <span>{time ? format(setMinutes(setHours(new Date(), parseInt(time.split(':')[0])), parseInt(time.split(':')[1])), 'h:mm a') : ''} (60 min)</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Physiotherapist *</label>
                                    <Select
                                        value={physiotherapistId}
                                        onValueChange={(value) => setPhysiotherapistId(value)}
                                        disabled={!!preselectedPhysiotherapistId || !careTeam || careTeam.length === 0}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select physiotherapist" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {careTeam?.map((member: { physiotherapist: { _id: string; firstName: string; lastName: string; }; }) => (
                                                <SelectItem
                                                    key={member.physiotherapist?._id}
                                                    value={member.physiotherapist?._id || ''}
                                                >
                                                    {member.physiotherapist?.firstName} {member.physiotherapist?.lastName}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Service Type *</label>
                                    <Select value={serviceType} onValueChange={setServiceType}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select service type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {SERVICE_TYPES.map((type) => (
                                                <SelectItem key={type} value={type}>{type}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Appointment Type *</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div
                                            className={cn(
                                                "border rounded-lg p-3 cursor-pointer transition-all hover:border-[#005b57]",
                                                appointmentType === 'telehealth' ? "border-[#005b57] bg-[#005b57]/5 ring-1 ring-[#005b57]" : "border-gray-200"
                                            )}
                                            onClick={() => setAppointmentType('telehealth')}
                                        >
                                            <div className="flex flex-col items-center gap-2 text-center">
                                                <Video className={cn("h-5 w-5", appointmentType === 'telehealth' ? "text-[#005b57]" : "text-gray-500")} />
                                                <span className="text-sm font-medium">Telehealth</span>
                                            </div>
                                        </div>

                                        <div
                                            className={cn(
                                                "border rounded-lg p-3 cursor-pointer transition-all hover:border-[#005b57]",
                                                appointmentType === 'in-person' ? "border-[#005b57] bg-[#005b57]/5 ring-1 ring-[#005b57]" : "border-gray-200"
                                            )}
                                            onClick={() => setAppointmentType('in-person')}
                                        >
                                            <div className="flex flex-col items-center gap-2 text-center">
                                                <MapPin className={cn("h-5 w-5", appointmentType === 'in-person' ? "text-[#005b57]" : "text-gray-500")} />
                                                <span className="text-sm font-medium">In-person</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {appointmentType === 'in-person' ? (
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Exact Address *</label>
                                        <input
                                            type="text"
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#005b57] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            placeholder="Enter house number, street name, and city..."
                                            value={location}
                                            onChange={(e) => setLocation(e.target.value)}
                                        />
                                        <p className="text-xs text-gray-500">
                                            Please provide an exact address so your physiotherapist can navigate to you.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Video Platform</label>
                                        <div className="grid grid-cols-2 gap-4">
                                        <div
                                            className={cn(
                                                "border rounded-lg p-4 cursor-pointer transition-all hover:border-[#005b57]",
                                                videoPlatform === 'rehabify' ? "border-[#005b57] bg-[#005b57]/5 ring-1 ring-[#005b57]" : "border-gray-200"
                                            )}
                                            onClick={() => setVideoPlatform('rehabify')}
                                        >
                                            <div className="flex flex-col items-center gap-2 text-center">
                                                <div className="h-8 w-8 rounded-full bg-[#005b57] flex items-center justify-center text-white">
                                                    <Video className="h-4 w-4" />
                                                </div>
                                                <span className="text-sm font-medium">Rehabify Video</span>
                                            </div>
                                        </div>

                                        <div
                                            className={cn(
                                                "border rounded-lg p-4 cursor-pointer transition-all hover:border-[#005b57]",
                                                videoPlatform === 'google_meet' ? "border-[#005b57] bg-[#005b57]/5 ring-1 ring-[#005b57]" : "border-gray-200"
                                            )}
                                            onClick={() => setVideoPlatform('google_meet')}
                                        >
                                            <div className="flex flex-col items-center gap-2 text-center">
                                                <div className="h-8 w-8 rounded-full bg-white border flex items-center justify-center">
                                                    <img src="https://www.gstatic.com/meet/google_meet_primary_horizontal_2020q4_475x124_be869f6d52660a998c915584fc294866.png" alt="Google Meet" className="h-4 w-auto object-contain" />
                                                </div>
                                                <span className="text-sm font-medium">Google Meet</span>
                                            </div>
                                        </div>
                                    </div>
                                    {videoPlatform === 'google_meet' && !googleCredentials && (
                                        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                                            <div className="bg-amber-100 p-1 rounded-full mt-0.5">
                                                <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                </svg>
                                            </div>
                                            <div className="text-sm text-amber-800">
                                                <p className="font-medium">Google Calendar not connected</p>
                                                <p className="mt-1 text-amber-700">
                                                    You need to connect your Google account to use Google Meet.
                                                    <a href="/dashboard/patient/settings?tab=calendar" target="_blank" className="underline font-semibold ml-1 hover:text-amber-900">
                                                        Connect in Settings
                                                    </a>
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                )}
                            </div>

                            <Button
                                className="w-full bg-[#005b57] hover:bg-[#00443e] mt-4"
                                disabled={
                                    !serviceType ||
                                    isSubmitting ||
                                    (appointmentType === 'telehealth' && videoPlatform === 'google_meet' && !googleCredentials) ||
                                    (appointmentType === 'in-person' && (!location || location.trim() === ''))
                                }
                                onClick={handleSubmit}
                            >
                                {isSubmitting ? 'Confirming...' : 'Confirm Booking'}
                            </Button>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center space-y-6 py-6">
                            <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                                <Check className="h-8 w-8 text-green-600" />
                            </div>

                            <div className="space-y-2">
                                <h2 className="text-2xl font-bold text-gray-900">This meeting is scheduled</h2>
                                <p className="text-gray-500">We sent an email with a calendar invitation with the details to everyone.</p>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-6 text-left space-y-4 max-w-sm mx-auto">
                                <div className="grid grid-cols-[60px_1fr] gap-4">
                                    <span className="font-semibold text-gray-900">What</span>
                                    <span className="text-gray-600">60 Min Meeting with {selectedPhysiotherapist?.physiotherapist?.firstName} {selectedPhysiotherapist?.physiotherapist?.lastName}</span>
                                </div>
                                <div className="grid grid-cols-[60px_1fr] gap-4">
                                    <span className="font-semibold text-gray-900">When</span>
                                    <span className="text-gray-600">
                                        {date && format(date, 'EEEE, MMMM d, yyyy')}
                                        <br />
                                        {time} - {time && format(setMinutes(setHours(new Date(), parseInt(time.split(':')[0]) + 1), parseInt(time.split(':')[1])), 'HH:mm')}
                                    </span>
                                </div>
                                <div className="grid grid-cols-[60px_1fr] gap-4">
                                    <span className="font-semibold text-gray-900">Who</span>
                                    <div className="text-gray-600">
                                        <p>{user?.firstName} {user?.lastName}</p>
                                        <p className="text-sm text-gray-500">{user?.email}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-[60px_1fr] gap-4">
                                    <span className="font-semibold text-gray-900">Where</span>
                                    <div className="flex items-center gap-2 text-gray-600">
                                        {appointmentType === 'in-person' ? (
                                            <>
                                                <MapPin className="h-4 w-4" /> {location}
                                            </>
                                        ) : videoPlatform === 'rehabify' ? (
                                            <>
                                                <Video className="h-4 w-4" /> Rehabify Video
                                            </>
                                        ) : (
                                            <>
                                                <img src="https://www.gstatic.com/meet/google_meet_primary_horizontal_2020q4_475x124_be869f6d52660a998c915584fc294866.png" alt="Google Meet" className="h-3 w-auto" /> Google Meet
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3 justify-center pt-4">
                                <Button variant="outline" onClick={onClose}>
                                    Close
                                </Button>
                                <Button className="bg-[#0f172a] text-white hover:bg-[#1e293b]">
                                    Open Google Calendar
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
