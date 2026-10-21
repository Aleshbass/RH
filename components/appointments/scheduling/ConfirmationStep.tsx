'use client';

import React, { useState } from 'react';
import type { WizardData } from './types';
import { format } from 'date-fns';
import { Calendar, Clock, User, FileText, CheckCircle2, Video } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import { GoogleCalendarRequiredModal } from '@/components/modals/GoogleCalendarRequiredModal';
import { playSound } from '@/lib/sounds';
import { zonedDateTimeToUtc } from '@/convex/helpers/lagosTime';

interface ConfirmationStepProps {
    data: WizardData;
    onUpdate: (updates: Partial<WizardData>) => void;
    onConfirm: () => Promise<void>;
    onSuccess: () => void;
}

export function ConfirmationStep({ data, onUpdate, onSuccess }: ConfirmationStepProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [googleMeetLink, setGoogleMeetLink] = useState<string | undefined>();
    const [googleCalendarLink, setGoogleCalendarLink] = useState<string | undefined>();
    const [showCalendarModal, setShowCalendarModal] = useState(false);

    const createAppointment = useMutation(api.appointments.createAppointment);

    // Get current user to check calendar connection
    const currentUser = useQuery(api.users.getMyUser);
    const hasGoogleCalendar = useQuery(
        api.calendar.oauth.hasGoogleCalendarConnected,
        currentUser ? { userId: currentUser._id } : 'skip'
    );

    const handleConfirm = async () => {
        if (!data.patientId || !data.date || !data.time || !data.serviceType) {
            toast.error('Missing required information');
            return;
        }

        // Check if Google Meet is selected but calendar not connected
        if (data.manualMeetingLink === 'google_meet' && !hasGoogleCalendar) {
            setShowCalendarModal(true);
            return;
        }

        try {
            setIsSubmitting(true);
            // The picked day and time are Lagos wall-clock time (Convex and some browsers aren't in Lagos)
            const startTime = zonedDateTimeToUtc(format(data.date, 'yyyy-MM-dd'), data.time);
            const endTime = startTime + (data.duration || 60) * 60 * 1000;

            const result = await createAppointment({
                patientId: data.patientId as Id<"users">,
                startTime,
                endTime,
                serviceType: data.serviceType,
                notesForTherapist: data.notes,
                // Both choices here are video platforms (Rehabify Video or Google Meet)
                appointmentType: 'telehealth',
                manualMeetingLink: data.manualMeetingLink || undefined,
            });

            console.log('Appointment creation result:', result);

            if (result.success) {
                playSound('booked');
                toast.success('Appointment scheduled successfully!');
                if (result.googleMeetLink) setGoogleMeetLink(result.googleMeetLink);
                if (result.googleCalendarLink) setGoogleCalendarLink(result.googleCalendarLink);
                setShowSuccess(true);
                // Do not call onSuccess() here, wait for user to click Close
            }
        } catch (error) {
            console.error('Failed to create appointment:', error);
            // ConvexError carries a readable reason, e.g. a Rehabify patient who pays per session
            toast.error(error instanceof ConvexError && typeof error.data === 'string' ? error.data : 'Failed to create appointment');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (showSuccess) {
        return (
            <div className="flex flex-col h-full bg-white text-gray-900 items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-300">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>

                <h2 className="text-2xl font-bold mb-2">This meeting is scheduled</h2>
                <p className="text-gray-600 mb-8 max-w-md">
                    We sent an email with a calendar invitation with the details to everyone.
                </p>

                <div className="w-full max-w-md bg-gray-50 rounded-xl p-6 text-left space-y-4 mb-8 border">
                    <div className="grid grid-cols-[60px_1fr] gap-4">
                        <span className="font-medium text-gray-900">What</span>
                        <span className="text-gray-600">
                            {data.duration} Min Meeting with {data.patientName}
                        </span>
                    </div>

                    <div className="grid grid-cols-[60px_1fr] gap-4">
                        <span className="font-medium text-gray-900">When</span>
                        <div className="text-gray-600">
                            <div>{data.date && format(data.date, 'EEEE, MMMM do, yyyy')}</div>
                            <div>{data.time} - {data.time && data.duration && format(new Date(new Date(`2000-01-01T${data.time}`).getTime() + data.duration * 60000), 'h:mm a')}</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-[60px_1fr] gap-4">
                        <span className="font-medium text-gray-900">Who</span>
                        <div className="text-gray-600">
                            <div>{data.patientName}</div>
                            <div className="text-sm text-gray-500">{data.patientEmail}</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-[60px_1fr] gap-4">
                        <span className="font-medium text-gray-900">Where</span>
                        <div className="flex flex-col gap-2">
                            {data.manualMeetingLink === 'google_meet' ? (
                                googleMeetLink ? (
                                    <a
                                        href={googleMeetLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 text-[#005b57] hover:text-[#00443e] hover:underline font-medium"
                                    >
                                        <Video className="w-4 h-4" />
                                        <span>Join Google Meet</span>
                                    </a>
                                ) : (
                                    <div className="flex items-center gap-2 text-gray-600">
                                        <Video className="w-4 h-4" />
                                        <span>Google Meet (link generating...)</span>
                                    </div>
                                )
                            ) : (
                                <div className="flex items-center gap-2 text-gray-600">
                                    <Video className="w-4 h-4" />
                                    <span>Rehabify Video</span>
                                </div>
                            )}
                            {googleCalendarLink && (
                                <a
                                    href={googleCalendarLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-[#005b57] hover:underline inline-flex items-center gap-1"
                                >
                                    <Calendar className="w-3 h-3" />
                                    View in Google Calendar
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex gap-4">
                    <Button onClick={onSuccess} variant="outline">Close</Button>
                    <Button
                        onClick={() => window.open(googleCalendarLink || 'https://calendar.google.com/calendar/r', '_blank')}
                        className="bg-gray-900 text-white hover:bg-gray-800"
                    >
                        {googleCalendarLink ? 'View in Google Calendar' : 'Open Google Calendar'}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="bg-[#005b57]/5 p-4 rounded-lg space-y-3">
                <h3 className="font-semibold text-[#00443e] flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" />
                    Confirm Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2 text-[#00443e]">
                        <User className="h-4 w-4 opacity-70" />
                        <span>{data.patientName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[#00443e]">
                        <Calendar className="h-4 w-4 opacity-70" />
                        <span>{data.date && format(data.date, 'MMMM d, yyyy')}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[#00443e]">
                        <Clock className="h-4 w-4 opacity-70" />
                        <span>{data.time && format(new Date(`2000-01-01T${data.time}`), 'h:mm a')} ({data.duration} min)</span>
                    </div>
                </div>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto pr-2">
                <div className="space-y-2">
                    <Label>Service Type *</Label>
                    <Select
                        value={data.serviceType}
                        onValueChange={(value) => onUpdate({ serviceType: value })}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select service..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="physiotherapy">Physiotherapy</SelectItem>
                            <SelectItem value="massage">Massage Therapy</SelectItem>
                            <SelectItem value="consultation">Consultation</SelectItem>
                            <SelectItem value="followup">Follow-up</SelectItem>
                            <SelectItem value="assessment">Assessment</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                        <span>📹</span> Video Platform
                    </Label>
                    <div className="grid grid-cols-2 gap-3">
                        <div
                            className={`cursor-pointer border rounded-lg p-3 flex flex-col items-center gap-2 transition-all ${!data.manualMeetingLink ? 'border-[#005b57] bg-[#005b57]/5 ring-1 ring-[#005b57]' : 'border-gray-200 hover:border-gray-300'}`}
                            onClick={() => onUpdate({ manualMeetingLink: '' })}
                        >
                            <div className="bg-white p-1.5 rounded-full shadow-sm">
                                <svg className="w-5 h-5 text-[#005b57]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <span className="font-medium text-xs">Rehabify Video</span>
                        </div>

                        <div
                            className={`cursor-pointer border rounded-lg p-3 flex flex-col items-center gap-2 transition-all ${data.manualMeetingLink === 'google_meet' ? 'border-[#005b57] bg-[#005b57]/5 ring-1 ring-[#005b57]' : 'border-gray-200 hover:border-gray-300'}`}
                            onClick={() => onUpdate({ manualMeetingLink: 'google_meet' })}
                        >
                            <div className="bg-white p-1.5 rounded-full shadow-sm">
                                <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.11c-.22-.66-.35-1.36-.35-2.11s.13-1.45.35-2.11V7.05H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.95l3.66-2.84z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51z" fill="#EA4335" />
                                </svg>
                            </div>
                            <span className="font-medium text-xs">Google Meet</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label>Notes (Optional)</Label>
                    <Textarea
                        value={data.notes}
                        onChange={(e) => onUpdate({ notes: e.target.value })}
                        placeholder="Add any notes for this session..."
                        className="resize-none h-24"
                    />
                </div>
            </div>

            <Button
                className="w-full bg-[#005b57] hover:bg-[#00443e] text-lg py-6"
                onClick={handleConfirm}
                disabled={isSubmitting || !data.serviceType}
            >
                {isSubmitting ? (
                    <>Booking...</>
                ) : (
                    <>Confirm Booking</>
                )}
            </Button>

            <GoogleCalendarRequiredModal
                isOpen={showCalendarModal}
                onClose={() => setShowCalendarModal(false)}
                onRefresh={() => {
                    setShowCalendarModal(false);
                    // The hasGoogleCalendar query will automatically refetch
                    // and when user clicks Confirm again, it will proceed if connected
                }}
            />
        </div>
    );
}
