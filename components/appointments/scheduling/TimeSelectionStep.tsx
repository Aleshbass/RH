'use client';

import React, { useState, useMemo } from 'react';
import { format, addMinutes, isBefore, setHours, setMinutes, startOfDay } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryUntyped } from '@/lib/convexUntyped';
import { api } from '@/convex/_generated/api';
import { Loader2 } from 'lucide-react';
import { zonedDateTimeToUtc } from '@/convex/helpers/lagosTime';

interface TimeSelectionStepProps {
    selectedDate: Date;
    selectedTime?: string;
    duration: number;
    physiotherapistId: string;
    onSelect: (time: string) => void;
}

export function TimeSelectionStep({ selectedDate, selectedTime, duration, physiotherapistId, onSelect }: TimeSelectionStepProps) {
    // Fetch existing appointments for conflict checking (the picked day is a Lagos day)
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    const dayStart = zonedDateTimeToUtc(dateKey, '00:00');
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    const apiRoot = api as unknown as Record<string, unknown>;
    const appointmentsModule = apiRoot['appointments'] as Record<string, unknown>;
    const getMyAppointmentsQuery = appointmentsModule['getMyAppointments'];

    const appointments = useQueryUntyped(getMyAppointmentsQuery, {
        startDate: dayStart,
        endDate: dayEnd,
        status: undefined,
        physiotherapistId: physiotherapistId,
    }) as any[] | undefined;

    // Generate slots
    const slots = useMemo(() => {
        const timeSlots: string[] = [];
        let currentTime = setMinutes(setHours(selectedDate, 8), 0); // Start at 8:00 AM
        const endTime = setMinutes(setHours(selectedDate, 18), 0); // End at 6:00 PM

        while (isBefore(currentTime, endTime)) {
            // Wall-clock label, read as Lagos time (as the booking is saved)
            const timeString = format(currentTime, 'HH:mm');
            const slotStart = zonedDateTimeToUtc(dateKey, timeString);
            const slotEnd = slotStart + duration * 60 * 1000;

            // Check conflict
            const hasConflict = appointments?.some(apt => {
                if (apt.status === 'cancelled_by_patient' || apt.status === 'cancelled_by_therapist') return false;
                return (
                    (slotStart >= apt.startTime && slotStart < apt.endTime) ||
                    (slotEnd > apt.startTime && slotEnd <= apt.endTime) ||
                    (slotStart <= apt.startTime && slotEnd >= apt.endTime)
                );
            });

            // Check past time if today
            const isPast = slotStart < Date.now();

            if (!hasConflict && !isPast) {
                timeSlots.push(timeString);
            }

            currentTime = addMinutes(currentTime, 30); // 30 min intervals
        }

        return timeSlots;
    }, [selectedDate, dateKey, duration, appointments]);

    if (appointments === undefined) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900">
                    {format(selectedDate, 'EEEE, MMMM d')}
                </h3>
                <p className="text-gray-500 text-sm">Select a time for your appointment</p>
            </div>

            <ScrollArea className="flex-1 -mx-2 px-2">
                {slots.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        No available slots for this date.
                    </div>
                ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                        {slots.map((time) => (
                            <Button
                                key={time}
                                variant={selectedTime === time ? 'default' : 'outline'}
                                className={selectedTime === time ? 'bg-[#005b57] hover:bg-[#00443e]' : 'hover:border-[#005b57]/30 hover:text-[#005b57]'}
                                onClick={() => onSelect(time)}
                            >
                                {format(new Date(`2000-01-01T${time}`), 'h:mm a')}
                            </Button>
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}
