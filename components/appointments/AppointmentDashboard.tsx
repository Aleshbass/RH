'use client';

import React from 'react';
import { format } from 'date-fns';
import { Calendar, Clock, AlertCircle, CheckCircle2, History } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { awaitingConfirmationFrom, hasPendingProposal, isOpenAppointment } from '@/convex/helpers/appointmentStatus';
import { lagosShortDate, lagosTimeRange } from '@/convex/helpers/lagosTime';
import { AppointmentPlace, AppointmentStatusBadge, PhysioAppointmentActions } from '@/components/appointments/appointment-ui';

interface AppointmentDashboardProps {
    appointments: any[];
    onNewAppointment: () => void;
    onAppointmentClick: (appointment: any) => void;
}

export function AppointmentDashboard({ appointments, onNewAppointment, onAppointmentClick }: AppointmentDashboardProps) {
    const now = new Date();
    const nowMs = now.getTime();
    // Booked and not over yet (in progress counts: it can be marked completed)
    const isLive = (a: any) => isOpenAppointment(a.status) && a.endTime > nowMs;

    // Requests the patient made: the physio accepts, declines or proposes another time
    const unconfirmed = appointments.filter(a =>
        isLive(a) && a.startTime > nowMs && awaitingConfirmationFrom(a) === 'provider' && !hasPendingProposal(a)
    ).sort((a, b) => a.startTime - b.startTime);

    const upcoming = appointments.filter(a =>
        isLive(a) && !unconfirmed.includes(a)
    ).sort((a, b) => a.startTime - b.startTime);

    // Finished, cancelled, or past visits still open (those can be marked completed / no-show)
    const past = appointments.filter(a =>
        !isLive(a)
    ).sort((a, b) => b.startTime - a.startTime).slice(0, 10); // Show last 10

    // A render function, not a nested component: a nested component type changes on every
    // render, which would remount the cards and close their action dialogs on each data update
    const renderCard = (appointment: any, type: 'unconfirmed' | 'upcoming' | 'past') => (
        <div
            key={appointment._id}
            onClick={() => onAppointmentClick(appointment)}
            className={cn(
                "bg-white p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md",
                type === 'unconfirmed' ? "border-amber-200 bg-amber-50/30" : "border-gray-100 shadow-sm",
                // Finished history is muted; past visits still open need an action, so stay bright
                type === 'past' && !isOpenAppointment(appointment.status) && "opacity-75"
            )}
        >
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border border-gray-100">
                        <AvatarImage src={appointment.patient?.imageUrl} />
                        <AvatarFallback className={cn(
                            "text-sm font-medium",
                            type === 'unconfirmed' ? "bg-amber-100 text-amber-700" : "bg-rh-lime/5 text-rh-ink"
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
                <AppointmentStatusBadge appointment={appointment} viewer="provider" />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 bg-gray-50/50 p-2 rounded-lg">
                <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span className="whitespace-nowrap">{lagosShortDate(appointment.startTime)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <span className="whitespace-nowrap">{lagosTimeRange(appointment.startTime, appointment.endTime)}</span>
                </div>
            </div>

            <AppointmentPlace appointment={appointment} viewer="provider" className="mt-2 px-1" />

            {appointment.cancellationReason && appointment.status?.startsWith('cancelled') && (
                <p className="mt-2 px-1 text-xs text-gray-500 line-clamp-2">Reason: {appointment.cancellationReason}</p>
            )}

            <div className="mt-3 space-y-2 empty:hidden">
                <PhysioAppointmentActions appointment={appointment} />
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
                        You have <span className="font-semibold text-gray-900">{upcoming.length + unconfirmed.length}</span> upcoming appointments
                        {unconfirmed.length > 0 && <>, <span className="font-semibold text-amber-700">{unconfirmed.length}</span> waiting for your answer</>}
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
                        <h3 className="text-lg font-bold text-gray-900">Needs your confirmation</h3>
                        <Badge variant="secondary" className="ml-auto">{unconfirmed.length}</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {unconfirmed.map(apt => renderCard(apt, 'unconfirmed'))}
                    </div>
                </section>
            )}

            {/* Upcoming Section */}
            <section>
                <div className="flex items-center gap-2 mb-4 px-1">
                    <CheckCircle2 className="h-5 w-5 text-rh-ink" />
                    <h3 className="text-lg font-bold text-gray-900">Upcoming</h3>
                </div>
                {upcoming.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        <p className="text-gray-500">No upcoming appointments</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {upcoming.map(apt => renderCard(apt, 'upcoming'))}
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {past.map(apt => renderCard(apt, 'past'))}
                    </div>
                </section>
            )}
        </div>
    );
}
