"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
    Clock,
    Plus,
    Trash2,
    Save,
    Loader2,
    Calendar,
    Globe,
    Info,
    Copy,
    Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TimeSlot {
    start: string;
    end: string;
}

interface DayAvailability {
    dayOfWeek: number;
    isAvailable: boolean;
    slots: TimeSlot[];
}

interface BufferSettings {
    beforeEvent: number;
    afterEvent: number;
}

interface AvailabilitySchedule {
    timezone: string;
    defaultSessionDuration: number;
    buffer: BufferSettings;
    weeklyHours: DayAvailability[];
    dateOverrides?: Array<{
        date: string;
        isAvailable: boolean;
        slots?: TimeSlot[];
        reason?: string;
    }>;
}

const DAYS_OF_WEEK = [
    { value: 0, label: "Sunday", short: "Sun" },
    { value: 1, label: "Monday", short: "Mon" },
    { value: 2, label: "Tuesday", short: "Tue" },
    { value: 3, label: "Wednesday", short: "Wed" },
    { value: 4, label: "Thursday", short: "Thu" },
    { value: 5, label: "Friday", short: "Fri" },
    { value: 6, label: "Saturday", short: "Sat" },
];

const TIMEZONES = [
    { value: "Africa/Lagos", label: "West Africa Time (WAT)" },
    { value: "Africa/Nairobi", label: "East Africa Time (EAT)" },
    { value: "Africa/Cairo", label: "Egypt Standard Time" },
    { value: "Africa/Johannesburg", label: "South Africa Standard Time" },
    { value: "Europe/London", label: "Greenwich Mean Time (GMT)" },
    { value: "America/New_York", label: "Eastern Time (ET)" },
    { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
];

const SESSION_DURATIONS = [
    { value: 30, label: "30 minutes" },
    { value: 45, label: "45 minutes" },
    { value: 60, label: "1 hour" },
    { value: 90, label: "1.5 hours" },
    { value: 120, label: "2 hours" },
];

const BUFFER_OPTIONS = [
    { value: 0, label: "No buffer" },
    { value: 5, label: "5 minutes" },
    { value: 10, label: "10 minutes" },
    { value: 15, label: "15 minutes" },
    { value: 30, label: "30 minutes" },
];

const DEFAULT_SCHEDULE: AvailabilitySchedule = {
    timezone: "Africa/Lagos",
    defaultSessionDuration: 60,
    buffer: { beforeEvent: 0, afterEvent: 15 },
    weeklyHours: DAYS_OF_WEEK.map((day) => ({
        dayOfWeek: day.value,
        isAvailable: day.value >= 1 && day.value <= 5, // Mon-Fri
        slots: day.value >= 1 && day.value <= 5 ? [{ start: "09:00", end: "17:00" }] : [],
    })),
};

interface AvailabilitySettingsProps {
    physiotherapistId?: Id<"users">;
}

export default function AvailabilitySettings({ physiotherapistId }: AvailabilitySettingsProps) {
    const [schedule, setSchedule] = useState<AvailabilitySchedule>(DEFAULT_SCHEDULE);
    const [isSaving, setIsSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    // Fetch current availability schedule from Convex
    const currentSchedule = useQuery(
        api.calendar.availability.getAvailabilitySchedule,
        physiotherapistId ? { physiotherapistId } : "skip"
    );

    // Update availability mutations
    const updateAvailabilityNew = useMutation(api.calendar.availability.updateAvailabilitySchedule);
    const updateAvailabilityLegacy = useMutation(api.physiotherapists.updateAvailability);

    // Load schedule from Convex, or localStorage as fallback
    useEffect(() => {
        if (currentSchedule) {
            // Use Convex data if available
            setSchedule(currentSchedule as AvailabilitySchedule);
        } else if (typeof window !== "undefined" && physiotherapistId) {
            // Fallback to localStorage
            const stored = localStorage.getItem(`availability_${physiotherapistId}`);
            if (stored) {
                try {
                    setSchedule(JSON.parse(stored));
                } catch {
                    // ignore
                }
            }
        }
    }, [currentSchedule, physiotherapistId]);


    // Toggle day availability
    const toggleDay = (dayOfWeek: number) => {
        setSchedule((prev) => ({
            ...prev,
            weeklyHours: prev.weeklyHours.map((day) =>
                day.dayOfWeek === dayOfWeek
                    ? {
                        ...day,
                        isAvailable: !day.isAvailable,
                        slots: !day.isAvailable ? [{ start: "09:00", end: "17:00" }] : [],
                    }
                    : day
            ),
        }));
    };

    // Update slot time
    const updateSlot = (dayOfWeek: number, slotIndex: number, field: "start" | "end", value: string) => {
        setSchedule((prev) => ({
            ...prev,
            weeklyHours: prev.weeklyHours.map((day) =>
                day.dayOfWeek === dayOfWeek
                    ? {
                        ...day,
                        slots: day.slots.map((slot, idx) =>
                            idx === slotIndex ? { ...slot, [field]: value } : slot
                        ),
                    }
                    : day
            ),
        }));
    };

    // Add slot to day
    const addSlot = (dayOfWeek: number) => {
        setSchedule((prev) => ({
            ...prev,
            weeklyHours: prev.weeklyHours.map((day) =>
                day.dayOfWeek === dayOfWeek
                    ? { ...day, slots: [...day.slots, { start: "09:00", end: "17:00" }] }
                    : day
            ),
        }));
    };

    // Remove slot from day
    const removeSlot = (dayOfWeek: number, slotIndex: number) => {
        setSchedule((prev) => ({
            ...prev,
            weeklyHours: prev.weeklyHours.map((day) =>
                day.dayOfWeek === dayOfWeek
                    ? { ...day, slots: day.slots.filter((_, idx) => idx !== slotIndex) }
                    : day
            ),
        }));
    };

    // Save changes
    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Try the new typed mutation first
            try {
                await updateAvailabilityNew({ schedule });
            } catch {
                // Fallback to legacy mutation
                await updateAvailabilityLegacy({ availabilitySchedule: schedule });
            }

            // Also save to localStorage as backup
            if (typeof window !== "undefined" && physiotherapistId) {
                localStorage.setItem(`availability_${physiotherapistId}`, JSON.stringify(schedule));
            }

            toast.success("Availability updated successfully");
        } catch (error: any) {
            console.error("Failed to save availability:", error);
            toast.error("Failed to save", {
                description: error.message || "Please try again",
            });
        } finally {
            setIsSaving(false);
        }
    };

    // Copy booking link - now uses the base URL for session type selection
    const copyBookingLink = () => {
        const link = `${window.location.origin}/book/${physiotherapistId}`;
        navigator.clipboard.writeText(link);
        setCopied(true);
        toast.success("Booking link copied!");
        setTimeout(() => setCopied(false), 2000);
    };

    const getDayLabel = (dayOfWeek: number) => {
        return DAYS_OF_WEEK.find((d) => d.value === dayOfWeek)?.label || "";
    };

    return (
        <div className="space-y-6">
            {/* Booking Link */}
            {physiotherapistId && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-[#005b57]" />
                            Your Booking Link
                        </CardTitle>
                        <CardDescription>
                            Share this link with patients to let them book sessions with you
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-3">
                            <Input
                                readOnly
                                value={`${typeof window !== "undefined" ? window.location.origin : ""}/book/${physiotherapistId}`}
                                className="font-mono text-sm"
                            />
                            <Button onClick={copyBookingLink} variant="outline" className="flex-shrink-0">
                                {copied ? (
                                    <Check className="w-4 h-4 text-green-600" />
                                ) : (
                                    <Copy className="w-4 h-4" />
                                )}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* General Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-[#005b57]" />
                        General Settings
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Timezone */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <Globe className="w-4 h-4" />
                                Timezone
                            </Label>
                            <Select
                                value={schedule.timezone}
                                onValueChange={(value) => setSchedule((prev) => ({ ...prev, timezone: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {TIMEZONES.map((tz) => (
                                        <SelectItem key={tz.value} value={tz.value}>
                                            {tz.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Default Session Duration */}
                        <div className="space-y-2">
                            <Label>Default Session Duration</Label>
                            <Select
                                value={schedule.defaultSessionDuration.toString()}
                                onValueChange={(value) =>
                                    setSchedule((prev) => ({
                                        ...prev,
                                        defaultSessionDuration: parseInt(value),
                                    }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SESSION_DURATIONS.map((d) => (
                                        <SelectItem key={d.value} value={d.value.toString()}>
                                            {d.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Buffer Settings */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label>Buffer Before Event</Label>
                            <Select
                                value={schedule.buffer.beforeEvent.toString()}
                                onValueChange={(value) =>
                                    setSchedule((prev) => ({
                                        ...prev,
                                        buffer: { ...prev.buffer, beforeEvent: parseInt(value) },
                                    }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {BUFFER_OPTIONS.map((b) => (
                                        <SelectItem key={b.value} value={b.value.toString()}>
                                            {b.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500">Preparation time before each session</p>
                        </div>

                        <div className="space-y-2">
                            <Label>Buffer After Event</Label>
                            <Select
                                value={schedule.buffer.afterEvent.toString()}
                                onValueChange={(value) =>
                                    setSchedule((prev) => ({
                                        ...prev,
                                        buffer: { ...prev.buffer, afterEvent: parseInt(value) },
                                    }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {BUFFER_OPTIONS.map((b) => (
                                        <SelectItem key={b.value} value={b.value.toString()}>
                                            {b.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500">Time for notes/cleanup after each session</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Weekly Hours */}
            <Card>
                <CardHeader>
                    <CardTitle>Weekly Hours</CardTitle>
                    <CardDescription>
                        Set your regular working hours for each day of the week
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {schedule.weeklyHours
                        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                        .map((day) => (
                            <div key={day.dayOfWeek} className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Switch
                                            checked={day.isAvailable}
                                            onCheckedChange={() => toggleDay(day.dayOfWeek)}
                                        />
                                        <span
                                            className={cn(
                                                "font-medium w-24",
                                                !day.isAvailable && "text-gray-400"
                                            )}
                                        >
                                            {getDayLabel(day.dayOfWeek)}
                                        </span>
                                    </div>

                                    {day.isAvailable && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => addSlot(day.dayOfWeek)}
                                            className="text-[#005b57] hover:text-[#00443e]"
                                        >
                                            <Plus className="w-4 h-4 mr-1" />
                                            Add Slot
                                        </Button>
                                    )}
                                </div>

                                {day.isAvailable && day.slots.length > 0 && (
                                    <div className="ml-12 space-y-2">
                                        {day.slots.map((slot, slotIdx) => (
                                            <div key={slotIdx} className="flex items-center gap-2">
                                                <Input
                                                    type="time"
                                                    value={slot.start}
                                                    onChange={(e) =>
                                                        updateSlot(day.dayOfWeek, slotIdx, "start", e.target.value)
                                                    }
                                                    className="w-28"
                                                />
                                                <span className="text-gray-400">to</span>
                                                <Input
                                                    type="time"
                                                    value={slot.end}
                                                    onChange={(e) =>
                                                        updateSlot(day.dayOfWeek, slotIdx, "end", e.target.value)
                                                    }
                                                    className="w-28"
                                                />
                                                {day.slots.length > 1 && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => removeSlot(day.dayOfWeek, slotIdx)}
                                                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {day.isAvailable && day.slots.length === 0 && (
                                    <p className="ml-12 text-sm text-gray-500 italic">
                                        No slots configured. Click "Add Slot" to set working hours.
                                    </p>
                                )}

                                {day.dayOfWeek < 6 && <Separator className="mt-4" />}
                            </div>
                        ))}
                </CardContent>
            </Card>

            {/* Info */}
            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
                <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="font-medium mb-1">How availability works</p>
                    <ul className="list-disc list-inside space-y-1 text-blue-700">
                        <li>Patients can only book during your available hours</li>
                        <li>Buffer times prevent back-to-back sessions</li>
                        <li>Your Google Calendar events will also block time slots (if connected)</li>
                        <li>Add multiple slots per day for lunch breaks (e.g., 9-12 and 1-5)</li>
                    </ul>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
                <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-[#005b57] hover:bg-[#00443e] min-w-32"
                >
                    {isSaving ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        <>
                            <Save className="w-4 h-4 mr-2" />
                            Save Changes
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
