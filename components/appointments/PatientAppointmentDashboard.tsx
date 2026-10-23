'use client';

import React, { useState } from 'react';
import { Calendar, Clock, AlertCircle, CheckCircle2, History, Repeat, Video, MessageCircle, FileText, XCircle, Star, TrendingUp, Activity, CalendarDays, ChevronRight, Copy, ExternalLink } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion, AnimatePresence } from 'framer-motion';
import { TourGuide } from '@/components/shared/TourGuide';
import { awaitingConfirmationFrom, hasPendingProposal, isOpenAppointment } from '@/convex/helpers/appointmentStatus';
import { formatLagos, lagosDateTime, lagosTime, lagosTimeRange } from '@/convex/helpers/lagosTime';
import { AppointmentPlace, AppointmentStatusBadge, meetingLinkOf } from '@/components/appointments/appointment-ui';

interface PatientAppointmentDashboardProps {
    appointments: any[];
    onNewAppointment: () => void;
    onCancel: (appointment: any) => void;
    onReschedule: (appointment: any) => void;
    onConfirm: (appointment: any) => void;
    onRateVisit?: (appointment: any) => void;
    /** The physio proposed another time: accept it, or keep the original */
    onRespondToProposal?: (appointment: any, accept: boolean) => void;
}

export function PatientAppointmentDashboard({
    appointments,
    onNewAppointment,
    onCancel,
    onReschedule,
    onConfirm,
    onRateVisit,
    onRespondToProposal
}: PatientAppointmentDashboardProps) {
    const router = useRouter();
    const now = new Date();
    const nowMs = now.getTime();
    const [activeTab, setActiveTab] = useState('upcoming');

    // Booked and not over yet
    const isLive = (a: any) => isOpenAppointment(a.status) && a.endTime > nowMs;

    // Needs the patient's answer: a new time the physio proposed, or a visit the physio booked.
    // A visit the patient asked for waits for the physio instead (shown under Upcoming).
    const unconfirmed = appointments.filter(a =>
        isLive(a) && (hasPendingProposal(a) || awaitingConfirmationFrom(a) === 'patient')
    ).sort((a, b) => a.startTime - b.startTime);

    const upcoming = appointments.filter(a =>
        isLive(a) && !unconfirmed.includes(a)
    ).sort((a, b) => a.startTime - b.startTime);

    const past = appointments.filter(a =>
        !isLive(a)
    ).sort((a, b) => b.startTime - a.startTime);

    const completedCount = appointments.filter(a => a.status === 'completed').length;
    const nextAppointment = [...upcoming, ...unconfirmed].sort((a, b) => a.startTime - b.startTime)[0];

    // Calculate streak (mock logic for now, can be enhanced)
    const streak = completedCount > 0 ? Math.min(completedCount, 5) : 0;

    const AppointmentCard = ({ appointment, type }: { appointment: any, type: 'unconfirmed' | 'upcoming' | 'past' }) => {
        // Check both appointmentType === 'telehealth' AND isOnline === true (for marketplace bookings)
        const canJoinCall = (appointment.appointmentType === 'telehealth' || appointment.isOnline === true) &&
            isLive(appointment);

        // Get the meeting link from any of the possible fields (Stream, Google Meet, or one the physio added)
        const meetingLink = meetingLinkOf(appointment);
        const proposal = hasPendingProposal(appointment);
        const waitingOnPhysio = awaitingConfirmationFrom(appointment) === 'provider';

        const handleStartVideoCall = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (meetingLink) {
                window.open(meetingLink, '_blank');
            } else {
                router.push(`/dashboard/patient/video-calls`);
            }
        };

        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                    "bg-white p-5 rounded-2xl border transition-all hover:shadow-lg flex flex-col gap-4 group",
                    type === 'unconfirmed' ? "border-amber-200 bg-amber-50/30" : "border-gray-100 shadow-sm"
                )}
            >
                {/* Header */}
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12 border-2 border-white shadow-sm">
                            <AvatarImage src={appointment.physiotherapist?.imageUrl} />
                            <AvatarFallback className={cn(
                                "text-sm font-bold",
                                type === 'unconfirmed' ? "bg-amber-100 text-amber-700" : "bg-brand/10 text-brand"
                            )}>
                                {appointment.physiotherapistName ? appointment.physiotherapistName.split(' ').map((n: string) => n[0]).join('').substring(0, 2) : 'PT'}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <h4 className="font-bold text-gray-900 leading-tight">
                                {appointment.physiotherapistName || 'Physiotherapist'}
                            </h4>
                            <p className="text-sm text-gray-500 font-medium">{appointment.serviceType}</p>
                        </div>
                    </div>
                    <AppointmentStatusBadge
                        appointment={appointment}
                        viewer="patient"
                        className={cn(type === 'unconfirmed' && "animate-pulse")}
                    />
                </div>

                {/* Date & Time Pill (Lagos time) */}
                <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-xl border border-gray-100/50">
                    <div className="flex flex-col items-center justify-center bg-white rounded-lg p-2 shadow-sm border border-gray-100 min-w-[50px]">
                        <span className="text-xs font-bold text-gray-400 uppercase">{formatLagos(appointment.startTime, { month: 'short' })}</span>
                        <span className="text-xl font-bold text-gray-900">{formatLagos(appointment.startTime, { day: 'numeric' })}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="font-semibold text-gray-900">{formatLagos(appointment.startTime, { weekday: 'long' })}</span>
                        <div className="flex items-center gap-1.5 text-sm text-gray-500">
                            <Clock className="h-3.5 w-3.5" />
                            <span>{lagosTimeRange(appointment.startTime, appointment.endTime)}</span>
                        </div>
                    </div>
                </div>

                {/* The physio proposed another time */}
                {proposal && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <p className="font-semibold">New time proposed: {lagosDateTime(appointment.proposedStartTime)}</p>
                        <p className="mt-0.5 text-amber-800">
                            {lagosTime(appointment.proposedStartTime)} – {lagosTime(appointment.proposedEndTime)}, Lagos time
                        </p>
                        {appointment.proposalNote && (
                            <p className="mt-1 text-amber-800">&ldquo;{appointment.proposalNote}&rdquo;</p>
                        )}
                    </div>
                )}

                {/* Where: the address, or the video call when there's no link to show yet */}
                {!(canJoinCall && meetingLink) && (
                    <AppointmentPlace appointment={appointment} viewer="patient" className="px-1" />
                )}

                {/* Meeting Link Section - Always visible for online appointments */}
                {canJoinCall && meetingLink && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Video className="h-4 w-4 text-blue-600 shrink-0" />
                                <span className="text-sm font-medium text-blue-700">Video Call</span>
                            </div>
                            <button
                                onClick={handleStartVideoCall}
                                className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
                            >
                                <ExternalLink className="h-3 w-3" />
                                Join
                            </button>
                        </div>
                        {/* Show actual meeting link with copy button */}
                        <div className="flex items-center gap-2 bg-white rounded-md p-2 border border-blue-100">
                            <a
                                href={meetingLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:text-blue-800 truncate flex-1 underline"
                            >
                                {meetingLink}
                            </a>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(meetingLink);
                                    // Optional: Show a toast notification
                                    const btn = e.currentTarget;
                                    btn.classList.add('text-green-600');
                                    setTimeout(() => btn.classList.remove('text-green-600'), 1500);
                                }}
                                className="p-1.5 hover:bg-blue-100 rounded transition-colors shrink-0"
                                title="Copy meeting link"
                            >
                                <Copy className="h-3.5 w-3.5 text-blue-600" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="mt-auto pt-2 flex flex-wrap gap-2">
                    {type === 'unconfirmed' && proposal && (
                        <>
                            <Button
                                size="sm"
                                onClick={() => onRespondToProposal?.(appointment, true)}
                                className="bg-gray-900 hover:bg-black text-white flex-1 rounded-xl h-10 font-medium"
                            >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Accept new time
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onRespondToProposal?.(appointment, false)}
                                className="flex-1 rounded-xl h-10 border-gray-200"
                            >
                                Keep original time
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onCancel(appointment)}
                                className="w-full rounded-xl h-9 text-gray-500 hover:text-red-600 hover:bg-red-50"
                            >
                                {appointment.status === 'scheduled' ? 'Cancel request' : 'Cancel visit'}
                            </Button>
                        </>
                    )}

                    {type === 'unconfirmed' && !proposal && (
                        <>
                            <Button
                                size="sm"
                                onClick={() => onConfirm(appointment)}
                                className="bg-gray-900 hover:bg-black text-white flex-1 rounded-xl h-10 font-medium"
                            >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Confirm
                            </Button>
                            {canJoinCall && meetingLink && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleStartVideoCall}
                                    className="flex-1 rounded-xl h-10 border-blue-200 text-blue-700 hover:bg-blue-50"
                                >
                                    <Video className="h-4 w-4 mr-2" />
                                    Join Call
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onReschedule(appointment)}
                                className="flex-1 rounded-xl h-10 border-gray-200"
                            >
                                Reschedule
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onCancel(appointment)}
                                className="w-full rounded-xl h-9 text-gray-500 hover:text-red-600 hover:bg-red-50"
                            >
                                Cancel
                            </Button>
                        </>
                    )}

                    {type === 'upcoming' && (
                        <div className="w-full space-y-2">
                            {waitingOnPhysio && (
                                <p className="text-xs text-gray-500">
                                    Your physio will confirm this time, or suggest another. We&apos;ll let you know.
                                </p>
                            )}
                            <div className="flex gap-2 w-full">
                                {canJoinCall && meetingLink && appointment.status === 'confirmed' && (
                                    <Button
                                        size="sm"
                                        onClick={handleStartVideoCall}
                                        className="flex-1 rounded-xl h-10 bg-blue-600 text-white hover:bg-blue-700"
                                    >
                                        <Video className="h-4 w-4 mr-2" />
                                        Join
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => onReschedule(appointment)}
                                    className="flex-1 rounded-xl h-10 border-gray-200"
                                >
                                    Reschedule
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => onCancel(appointment)}
                                    className="flex-1 rounded-xl h-10 border-gray-200 text-gray-600 hover:text-red-600 hover:bg-red-50 hover:border-red-100"
                                >
                                    {waitingOnPhysio ? 'Cancel request' : 'Cancel'}
                                </Button>
                            </div>
                        </div>
                    )}

                    {type === 'past' && appointment.status === 'completed' && !appointment.feedbackSubmitted && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onRateVisit && onRateVisit(appointment)}
                            className="w-full rounded-xl h-10 border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
                        >
                            <Star className="h-4 w-4 mr-2" />
                            Rate Visit
                        </Button>
                    )}

                    {type === 'past' && appointment.cancellationReason && appointment.status?.startsWith('cancelled') && (
                        <p className="w-full text-xs text-gray-500">Reason: {appointment.cancellationReason}</p>
                    )}
                </div>
            </motion.div>
        );
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-20">
            {/* Header & Progress Section */}
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div id="appointments-header">
                        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Your Journey</h1>
                        <p className="text-gray-500">Track your recovery progress</p>
                    </div>
                    <Button id="book-new-session-btn" onClick={onNewAppointment} className="bg-gray-900 text-white hover:bg-black rounded-full px-6 h-12 shadow-lg shadow-gray-200 transition-transform hover:scale-105 active:scale-95">
                        <Calendar className="h-4 w-4 mr-2" />
                        Book New Session
                    </Button>
                </div>

                {/* Stats Grid */}
                <div id="appointments-stats" className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-2 text-gray-500 mb-2">
                            <Activity className="h-4 w-4" />
                            <span className="text-xs font-medium uppercase tracking-wider">Completed</span>
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{completedCount}</div>
                        <p className="text-xs text-gray-400 mt-1">Sessions done</p>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-2 text-brand mb-2">
                            <CalendarDays className="h-4 w-4" />
                            <span className="text-xs font-medium uppercase tracking-wider">Upcoming</span>
                        </div>
                        <div className="text-2xl font-bold text-brand">{upcoming.length + unconfirmed.length}</div>
                        <p className="text-xs text-gray-400 mt-1">Scheduled</p>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm col-span-2 md:col-span-2 relative overflow-hidden group hover:shadow-md transition-all">
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 text-brand mb-2">
                                <TrendingUp className="h-4 w-4" />
                                <span className="text-xs font-medium uppercase tracking-wider">Next Session</span>
                            </div>
                            {nextAppointment ? (
                                <div>
                                    <div className="text-lg font-bold text-gray-900 truncate">
                                        {formatLagos(nextAppointment.startTime, { weekday: 'long', month: 'short', day: 'numeric' }, 'en-US')}
                                    </div>
                                    <div className="text-gray-500 text-sm flex items-center gap-2 mt-1">
                                        <Clock className="h-3 w-3" />
                                        {lagosTime(nextAppointment.startTime)} • {nextAppointment.physiotherapistName}
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <div className="text-lg font-bold text-gray-900">No upcoming sessions</div>
                                    <div className="text-gray-500 text-sm mt-1">Book a session to keep your streak!</div>
                                </div>
                            )}
                        </div>
                        {/* Decorative circles - subtle for light mode */}
                        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-brand/5 rounded-full blur-2xl"></div>
                        <div className="absolute top-0 right-0 w-16 h-16 bg-brand/5 rounded-full blur-xl"></div>
                    </div>
                </div>
            </div>

            {/* Tabs & Content */}
            <Tabs defaultValue="upcoming" className="space-y-6" onValueChange={setActiveTab}>
                <TabsList id="appointments-tabs" className="bg-gray-100 p-1 rounded-full w-full md:w-auto inline-flex">
                    <TabsTrigger id="tab-upcoming" value="upcoming" className="rounded-full px-6 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm text-gray-500">
                        Upcoming
                        {(upcoming.length + unconfirmed.length) > 0 && (
                            <span className="ml-2 bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded-full">{upcoming.length + unconfirmed.length}</span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger id="tab-past" value="past" className="rounded-full px-6 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm text-gray-500">
                        History
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="upcoming" className="space-y-6 focus-visible:outline-none">
                    {unconfirmed.length > 0 && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider px-1">Needs your answer</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {unconfirmed.map(apt => (
                                    <AppointmentCard key={apt._id} appointment={apt} type="unconfirmed" />
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider px-1">Upcoming</h3>
                        {upcoming.length === 0 && unconfirmed.length === 0 ? (
                            <div className="text-center py-16 bg-gray-50/50 rounded-3xl border border-dashed border-gray-200">
                                <div className="bg-white p-4 rounded-full shadow-sm inline-block mb-4">
                                    <Calendar className="h-8 w-8 text-gray-300" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">No upcoming sessions</h3>
                                <p className="text-gray-500 max-w-xs mx-auto mt-2 mb-6">
                                    Consistency is key to recovery. Schedule your next session today.
                                </p>
                                <Button onClick={onNewAppointment} variant="outline" className="rounded-full">
                                    Book Now
                                </Button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {upcoming.map(apt => (
                                    <AppointmentCard key={apt._id} appointment={apt} type="upcoming" />
                                ))}
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="past" className="space-y-4 focus-visible:outline-none">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {past.map(apt => (
                            <AppointmentCard key={apt._id} appointment={apt} type="past" />
                        ))}
                    </div>
                    {past.length === 0 && (
                        <div className="text-center py-12 text-gray-500">
                            No past appointments found.
                        </div>
                    )}
                </TabsContent>
            </Tabs>
            <TourGuide
                tourId="patient-appointments-tour"
                steps={[
                    {
                        target: "#appointments-header",
                        title: "Appointments Dashboard",
                        content: "Track your recovery journey and manage your sessions.",
                        position: "bottom",
                    },
                    {
                        target: "#book-new-session-btn",
                        title: "Book a Session",
                        content: "Schedule a new appointment with your physiotherapist.",
                        position: "bottom",
                    },
                    {
                        target: "#appointments-stats",
                        title: "Your Progress",
                        content: "View your completed sessions, upcoming appointments, and streaks.",
                        position: "bottom",
                    },
                    {
                        target: "#tab-upcoming",
                        title: "Upcoming Sessions",
                        content: "See what's next on your schedule and confirm pending appointments.",
                        position: "bottom",
                    },
                    {
                        target: "#tab-past",
                        title: "History",
                        content: "Review past appointments and rate your completed visits.",
                        position: "bottom",
                    },
                ]}
            />
        </div>
    );
}
