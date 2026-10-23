'use client';

import React, { useState } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, isBefore, startOfDay } from 'date-fns';
import { ChevronLeft, ChevronRight } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DateSelectionStepProps {
    selectedDate?: Date;
    onSelect: (date: Date) => void;
}

export function DateSelectionStep({ selectedDate, onSelect }: DateSelectionStepProps) {
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const daysInMonth = eachDayOfInterval({
        start: startOfMonth(currentMonth),
        end: endOfMonth(currentMonth),
    });

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Calculate padding days for the grid
    const startDay = startOfMonth(currentMonth).getDay();
    const paddingDays = Array(startDay).fill(null);

    return (
        <div className="flex flex-col items-center justify-center h-full">
            <div className="w-full max-w-sm">
                <div className="flex items-center justify-between mb-6">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                        disabled={isBefore(endOfMonth(subMonths(currentMonth, 1)), startOfDay(new Date()))}
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <h2 className="text-lg font-semibold text-gray-900">
                        {format(currentMonth, 'MMMM yyyy')}
                    </h2>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                    >
                        <ChevronRight className="h-5 w-5" />
                    </Button>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-2">
                    {weekDays.map((day) => (
                        <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
                            {day}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                    {paddingDays.map((_, i) => (
                        <div key={`padding-${i}`} />
                    ))}
                    {daysInMonth.map((date) => {
                        const isPast = isBefore(date, startOfDay(new Date()));
                        const isSelected = selectedDate && isSameDay(date, selectedDate);
                        const isCurrentMonth = isSameMonth(date, currentMonth);

                        return (
                            <button
                                key={date.toString()}
                                onClick={() => !isPast && onSelect(date)}
                                disabled={isPast}
                                className={cn(
                                    "h-10 w-10 rounded-full flex items-center justify-center text-sm transition-all relative",
                                    !isPast && "hover:bg-[#005b57]/5 hover:text-[#005b57]",
                                    isSelected && "bg-[#005b57] text-white hover:bg-[#00443e] hover:text-white shadow-md",
                                    isToday(date) && !isSelected && "text-[#005b57] font-bold",
                                    isPast && "text-gray-300 cursor-not-allowed",
                                    !isCurrentMonth && "invisible"
                                )}
                            >
                                {format(date, 'd')}
                                {isToday(date) && !isSelected && (
                                    <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#005b57] rounded-full" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
