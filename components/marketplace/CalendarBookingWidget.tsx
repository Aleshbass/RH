"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
    ChevronLeft,
    ChevronRight,
    Clock,
    Video,
    Globe,
    Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AvailableSlot {
    start: number;
    end: number;
    duration: number;
}

interface CalendarBookingWidgetProps {
    physiotherapistId: Id<"users">;
    physiotherapistName: string;
    physiotherapistImage?: string;
    sessionDuration?: number;
    sessionTitle?: string;
    sessionDescription?: string;
    offersOnlineSessions?: boolean;
    timezone?: string;
    onSlotSelect?: (slot: AvailableSlot) => void;
}

// Helper to generate calendar days
function getMonthDays(year: number, month: number) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay(); // 0 = Sunday

    const days: (number | null)[] = [];

    // Add empty slots for days before the first of the month
    for (let i = 0; i < startingDay; i++) {
        days.push(null);
    }

    // Add all days of the month
    for (let i = 1; i <= daysInMonth; i++) {
        days.push(i);
    }

    return days;
}

// Generate mock slots as fallback (Mon-Fri 9am-5pm)
function generateMockSlots(
    startDate: number,
    endDate: number,
    sessionDuration: number
): AvailableSlot[] {
    const slots: AvailableSlot[] = [];
    const durationMs = sessionDuration * 60 * 1000;
    const interval = sessionDuration <= 30 ? 15 : 30; // 15-min intervals for short sessions
    const now = Date.now();

    const currentDay = new Date(startDate);
    currentDay.setHours(0, 0, 0, 0);

    while (currentDay.getTime() <= endDate) {
        const dayOfWeek = currentDay.getDay();

        // Only Mon-Sat (adjust as needed)
        if (dayOfWeek >= 1 && dayOfWeek <= 6) {
            // 9am to 5pm with configurable intervals
            for (let minutes = 9 * 60; minutes < 17 * 60; minutes += interval) {
                const slotStart = new Date(currentDay);
                slotStart.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);

                // Only future slots
                if (slotStart.getTime() > now) {
                    slots.push({
                        start: slotStart.getTime(),
                        end: slotStart.getTime() + durationMs,
                        duration: sessionDuration,
                    });
                }
            }
        }

        currentDay.setDate(currentDay.getDate() + 1);
    }

    return slots;
}

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

export default function CalendarBookingWidget({
    physiotherapistId,
    physiotherapistName,
    physiotherapistImage,
    sessionDuration = 60,
    sessionTitle,
    sessionDescription,
    offersOnlineSessions = true,
    timezone = "Africa/Lagos",
    onSlotSelect,
}: CalendarBookingWidgetProps) {
    const today = new Date();
    const [currentMonth, setCurrentMonth] = useState(today.getMonth());
    const [currentYear, setCurrentYear] = useState(today.getFullYear());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
    const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("12h");

    // Calculate date range for the current view
    const dateRange = useMemo(() => {
        const start = new Date(currentYear, currentMonth, 1);
        const end = new Date(currentYear, currentMonth + 2, 0);
        return {
            startDate: start.getTime(),
            endDate: end.getTime(),
        };
    }, [currentYear, currentMonth]);

    // Try to use real Convex query, fallback to mock if not available
    const convexSlots = useQuery(api.calendar.availability.getAvailableSlots, {
        physiotherapistId,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        sessionDuration,
    });

    // Use Convex slots if available, otherwise generate mock slots
    const availableSlots = useMemo(() => {
        if (convexSlots !== undefined) {
            return convexSlots;
        }
        // Fallback to mock while loading or if API not ready
        return generateMockSlots(dateRange.startDate, dateRange.endDate, sessionDuration);
    }, [convexSlots, dateRange.startDate, dateRange.endDate, sessionDuration]);

    // Generate calendar days
    const days = useMemo(
        () => getMonthDays(currentYear, currentMonth),
        [currentYear, currentMonth]
    );

    // Check if a day has available slots
    const dayHasSlots = (day: number): boolean => {
        if (!availableSlots) return false;
        const date = new Date(currentYear, currentMonth, day);
        const dayStart = date.setHours(0, 0, 0, 0);
        const dayEnd = date.setHours(23, 59, 59, 999);

        return availableSlots.some(
            (slot: AvailableSlot) => slot.start >= dayStart && slot.start <= dayEnd
        );
    };

    // Get slots for selected date
    const slotsForSelectedDate = useMemo(() => {
        if (!selectedDate || !availableSlots) return [];

        const dayStart = new Date(selectedDate).setHours(0, 0, 0, 0);
        const dayEnd = new Date(selectedDate).setHours(23, 59, 59, 999);

        return availableSlots
            .filter((slot: AvailableSlot) => slot.start >= dayStart && slot.start <= dayEnd)
            .sort((a: AvailableSlot, b: AvailableSlot) => a.start - b.start);
    }, [selectedDate, availableSlots]);

    // Format time based on 12h/24h preference
    const formatTime = (timestamp: number): string => {
        const date = new Date(timestamp);
        if (timeFormat === "12h") {
            return date.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
            });
        } else {
            return date.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            });
        }
    };

    // Navigate months
    const goToPreviousMonth = () => {
        if (currentMonth === 0) {
            setCurrentMonth(11);
            setCurrentYear(currentYear - 1);
        } else {
            setCurrentMonth(currentMonth - 1);
        }
    };

    const goToNextMonth = () => {
        if (currentMonth === 11) {
            setCurrentMonth(0);
            setCurrentYear(currentYear + 1);
        } else {
            setCurrentMonth(currentMonth + 1);
        }
    };

    // Check if day is in the past
    const isDayPast = (day: number): boolean => {
        const date = new Date(currentYear, currentMonth, day);
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        return date < todayStart;
    };

    // Check if day is today
    const isToday = (day: number): boolean => {
        return (
            day === today.getDate() &&
            currentMonth === today.getMonth() &&
            currentYear === today.getFullYear()
        );
    };

    // Check if day is selected
    const isSelected = (day: number): boolean => {
        if (!selectedDate) return false;
        return (
            selectedDate.getDate() === day &&
            selectedDate.getMonth() === currentMonth &&
            selectedDate.getFullYear() === currentYear
        );
    };

    // Handle slot selection
    const handleSlotClick = (slot: AvailableSlot) => {
        setSelectedSlot(slot);
        onSlotSelect?.(slot);
    };

    // Can't go to previous month if it's the current month
    const canGoPrevious = !(
        currentMonth === today.getMonth() && currentYear === today.getFullYear()
    );

    // Get session title based on duration
    const getSessionTitle = () => {
        if (sessionTitle) return sessionTitle;
        if (sessionDuration <= 30) return "Quick Check-in";
        if (sessionDuration <= 45) return "Follow-up Session";
        return "Initial Consultation";
    };

    return (
        <div className="bg-[#1a1a1a] text-white rounded-xl overflow-hidden shadow-2xl">
            <div className="flex flex-col lg:flex-row">
                {/* Left Sidebar - Profile Info */}
                <div className="w-full lg:w-64 p-6 border-b lg:border-b-0 lg:border-r border-gray-800">
                    {/* Profile */}
                    <div className="flex items-center gap-3 mb-2">
                        {physiotherapistImage ? (
                            <img
                                src={physiotherapistImage}
                                alt={physiotherapistName}
                                className="w-10 h-10 rounded-full object-cover"
                            />
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold">
                                {physiotherapistName
                                    .split(" ")
                                    .map((n) => n[0])
                                    .join("")}
                            </div>
                        )}
                    </div>
                    <span className="text-sm text-gray-400">{physiotherapistName}</span>

                    {/* Session Info */}
                    <h2 className="text-xl font-bold mt-4 mb-1">
                        {getSessionTitle()}
                    </h2>
                    {sessionDescription && (
                        <p className="text-sm text-gray-500 mb-4">{sessionDescription}</p>
                    )}

                    <div className="space-y-3 text-sm text-gray-400 mt-4">
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            <span>{sessionDuration}m</span>
                        </div>

                        {offersOnlineSessions && (
                            <div className="flex items-center gap-2">
                                <Video className="w-4 h-4 text-teal-400" />
                                <span>Video Call</span>
                            </div>
                        )}

                        <div className="flex items-center gap-2">
                            <Globe className="w-4 h-4" />
                            <span>{timezone}</span>
                        </div>
                    </div>
                </div>

                {/* Center - Calendar */}
                <div className="flex-1 p-6 border-b lg:border-b-0 lg:border-r border-gray-800">
                    {/* Month Navigation */}
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-medium">
                            <span className="text-gray-400">{MONTHS[currentMonth]}</span>{" "}
                            {currentYear}
                        </h3>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={goToPreviousMonth}
                                disabled={!canGoPrevious}
                                className={cn(
                                    "p-2 rounded-lg transition-colors",
                                    canGoPrevious
                                        ? "hover:bg-gray-800 text-gray-400 hover:text-white"
                                        : "text-gray-700 cursor-not-allowed"
                                )}
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button
                                onClick={goToNextMonth}
                                className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Weekday Headers */}
                    <div className="grid grid-cols-7 mb-2">
                        {WEEKDAYS.map((day) => (
                            <div
                                key={day}
                                className="text-center text-xs text-gray-500 font-medium py-2"
                            >
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7 gap-1">
                        {days.map((day, index) => {
                            if (day === null) {
                                return <div key={`empty-${index}`} className="aspect-square" />;
                            }

                            const past = isDayPast(day);
                            const hasSlots = dayHasSlots(day);
                            const selected = isSelected(day);
                            const isTodayDay = isToday(day);

                            return (
                                <button
                                    key={day}
                                    onClick={() => {
                                        if (!past && hasSlots) {
                                            setSelectedDate(new Date(currentYear, currentMonth, day));
                                            setSelectedSlot(null);
                                        }
                                    }}
                                    disabled={past || !hasSlots}
                                    className={cn(
                                        "aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition-all relative",
                                        past && "text-gray-700 cursor-not-allowed",
                                        !past && !hasSlots && "text-gray-600 cursor-not-allowed",
                                        !past &&
                                        hasSlots &&
                                        !selected &&
                                        "bg-gray-800 text-white hover:bg-gray-700 cursor-pointer",
                                        selected && "bg-white text-black",
                                        isTodayDay && !selected && "ring-1 ring-teal-500"
                                    )}
                                >
                                    {day}
                                    {isTodayDay && !selected && (
                                        <span className="absolute bottom-1 w-1 h-1 bg-teal-500 rounded-full" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Right - Time Slots */}
                <div className="w-full lg:w-56 p-6">
                    {selectedDate ? (
                        <>
                            {/* Selected Date Header */}
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-medium">
                                    {selectedDate.toLocaleDateString("en-US", {
                                        weekday: "short",
                                    })}{" "}
                                    {selectedDate.getDate()}
                                </h4>
                                <div className="flex items-center gap-1 text-xs">
                                    <button
                                        onClick={() => setTimeFormat("12h")}
                                        className={cn(
                                            "px-2 py-1 rounded",
                                            timeFormat === "12h"
                                                ? "bg-gray-700 text-white"
                                                : "text-gray-500 hover:text-gray-300"
                                        )}
                                    >
                                        12h
                                    </button>
                                    <button
                                        onClick={() => setTimeFormat("24h")}
                                        className={cn(
                                            "px-2 py-1 rounded",
                                            timeFormat === "24h"
                                                ? "bg-gray-700 text-white"
                                                : "text-gray-500 hover:text-gray-300"
                                        )}
                                    >
                                        24h
                                    </button>
                                </div>
                            </div>

                            {/* Time Slots */}
                            {availableSlots === undefined ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
                                </div>
                            ) : slotsForSelectedDate.length === 0 ? (
                                <p className="text-gray-500 text-sm text-center py-8">
                                    No available slots for this date
                                </p>
                            ) : (
                                <div className="space-y-2 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                                    {slotsForSelectedDate.map((slot: AvailableSlot) => {
                                        const isSlotSelected =
                                            selectedSlot?.start === slot.start;

                                        return (
                                            <button
                                                key={slot.start}
                                                onClick={() => handleSlotClick(slot)}
                                                className={cn(
                                                    "w-full py-3 px-4 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                                                    isSlotSelected
                                                        ? "bg-teal-600 text-white"
                                                        : "bg-gray-800 text-white hover:bg-gray-700 border border-gray-700"
                                                )}
                                            >
                                                <span
                                                    className={cn(
                                                        "w-2 h-2 rounded-full",
                                                        isSlotSelected ? "bg-white" : "bg-teal-500"
                                                    )}
                                                />
                                                {formatTime(slot.start)}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <p className="text-gray-500 text-sm">
                                Select a date to view available times
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer - Rehabify Branding (like Cal.com) */}
            <div className="py-4 text-center">
                <a
                    href="https://physioaroundme.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-400 font-bold font-cal hover:text-gray-300 transition-colors"
                >
                    physioaroundme.com
                </a>
            </div>
            {/* Custom Scrollbar Styles */}
            <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #2a2a2a;
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #4a4a4a;
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #5a5a5a;
        }
      `}</style>
        </div>
    );
}
