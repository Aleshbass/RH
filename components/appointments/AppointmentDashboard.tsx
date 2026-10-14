'use client';

import React from 'react';
import { format, isBefore, isAfter, startOfDay } from 'date-fns';
import { Calendar, Clock, AlertCircle, CheckCircle2, History, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface AppointmentDashboardProps {
    appointments: any[];
    onNewAppointment: () => void;
    onAppointmentClick: (appointment: any) => void;
}

export function AppointmentDashboard({ appointments, onNewAppointment, onAppointmentClick }: AppointmentDashboardProps) {
    const now = new Date();

    // Unconfirmed appointments that need action - only show if they have additional flags
    // Since we're now showing 'scheduled' in upcoming, we can remove this or make it more specific
    const unconfirmed = appointments.filter(a =>
        false // Disabled for now since scheduled appointments show in upcoming
    );

    const upcoming = appointments.filter(a =>
        (a.status === 'confirmed' || a.status === 'scheduled') && !isBefore(new Date(a.startTime), now)
    ).sort((a, b) => a.startTime - b.startTime);

    const past = appointments.filter(a =>
        isBefore(new Date(a.startTime), now) || ['completed', 'cancelled_by_patient', 'cancelled_by_therapist'].includes(a.status)
    ).sort((a, b) => b.startTime - a.startTime).slice(0, 10); // Show last 10

    const AppointmentCard = ({ appointment, type }: { appointment: any, type: 'unconfirmed' | 'upcoming' | 'past' }) => (
        <div
            onClick={() => onAppointmentClick(appointment)}
            className={cn(
                "bg-white p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md",
                type === 'unconfirmed' ? "border-amber-200 bg-amber-50/30" : "border-gray-100 shadow-sm"
            )}
        >
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border border-gray-100">
                        <AvatarImage src={appointment.patient?.imageUrl} />
                        <AvatarFallback className={cn(
                            "text-sm font-medium",
                            type === 'unconfirmed' ? "bg-amber-100 text-amber-700" : "bg-[#005b57]/5 text-[#005b57]"
                        )}>
                            {appointment.patient?.firstName?.[0]}{appointment.patient?.lastName?.[0]}
                        </AvatarFallback>
                    </Avatar>
                    <div>
                        <h4 className="font-semibold text-gray-900 line-clamp-1">
                            {appointment.patient?.firstName} {appointment.patient?.lastName}
                        </h4>
                        <p className="text-sm text-gray-500 line-clamp-1">{appointment.serviceType}</p>
                    </div>
                </div>
                {type === 'unconfirmed' && (
                    <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 shrink-0">
                        Action
                    </Badge>
                )}
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-600 bg-gray-50/50 p-2 rounded-lg">
                <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span className="whitespace-nowrap">{format(new Date(appointment.startTime), 'MMM d')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <span className="whitespace-nowrap">{format(new Date(appointment.startTime), 'h:mm a')}</span>
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-8 pb-20 max-w-7xl mx-auto">
            {/* Quick Stats / Welcome */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-1">
                        {format(now, 'EEEE, MMMM d')}
                    </h2>
                    <p className="text-gray-500">
                        You have <span className="font-semibold text-gray-900">{upcoming.length}</span> upcoming appointments
                    </p>
                </div>
                <Button onClick={onNewAppointment} className="w-full sm:w-auto bg-black text-white hover:bg-gray-800 px-6">
                    + New Appointment
                </Button>
            </div>

            {/* Unconfirmed Section */}
            {unconfirmed.length > 0 && (
                <section>
                    <div className="flex items-center gap-2 mb-4 px-1">
                        <AlertCircle className="h-5 w-5 text-amber-600" />
                        <h3 className="text-lg font-bold text-gray-900">Needs Confirmation</h3>
                        <Badge variant="secondary" className="ml-auto">{unconfirmed.length}</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {unconfirmed.map(apt => (
                            <AppointmentCard key={apt._id} appointment={apt} type="unconfirmed" />
                        ))}
                    </div>
                </section>
            )}

            {/* Upcoming Section */}
            <section>
                <div className="flex items-center gap-2 mb-4 px-1">
                    <CheckCircle2 className="h-5 w-5 text-[#005b57]" />
                    <h3 className="text-lg font-bold text-gray-900">Upcoming</h3>
                </div>
                {upcoming.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        <p className="text-gray-500">No upcoming appointments</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {upcoming.map(apt => (
                            <AppointmentCard key={apt._id} appointment={apt} type="upcoming" />
                        ))}
                    </div>
                )}
            </section>

            {/* Past Section */}
            {past.length > 0 && (
                <section>
                    <div className="flex items-center gap-2 mb-4 px-1">
                        <History className="h-5 w-5 text-gray-400" />
                        <h3 className="text-lg font-bold text-gray-500">Recent History</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-75">
                        {past.map(apt => (
                            <AppointmentCard key={apt._id} appointment={apt} type="past" />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
