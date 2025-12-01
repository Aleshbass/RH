import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Plus, Trash2 } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from 'sonner';

// Generate time options outside component to avoid recalculation
const generateTimeOptions = () => {
    const options = [];
    for (let i = 0; i < 24 * 4; i++) {
        const hour = Math.floor(i / 4);
        const minute = (i % 4) * 15;
        const ampm = hour >= 12 ? 'pm' : 'am';
        const displayHour = hour % 12 === 0 ? 12 : hour % 12;
        const displayMinute = minute.toString().padStart(2, '0');
        const value = `${hour.toString().padStart(2, '0')}:${displayMinute}`;
        const label = `${displayHour}:${displayMinute}${ampm}`;
        options.push({ value, label });
    }
    return options;
};

const TIME_OPTIONS = generateTimeOptions();
const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export type TimeSlot = { start: string; end: string };
export type DaySchedule = { isOpen: boolean; slots: TimeSlot[] };
export type OperatingHours = Record<string, DaySchedule>;

interface AvailabilitySchedulerProps {
    value: OperatingHours;
    onChange: (value: OperatingHours) => void;
    readOnly?: boolean;
}

export const AvailabilityScheduler = React.memo(({ value, onChange, readOnly = false }: AvailabilitySchedulerProps) => {

    // Ensure value has all days (handle undefined/partial initial state)
    const safeValue = useMemo(() => {
        const defaults: OperatingHours = {};
        DAYS_OF_WEEK.forEach(day => {
            defaults[day] = value?.[day] || { isOpen: false, slots: [{ start: '09:00', end: '17:00' }] };
        });
        return { ...defaults, ...value };
    }, [value]);

    const handleDayToggle = (day: string, isOpen: boolean) => {
        onChange({
            ...safeValue,
            [day]: { ...safeValue[day], isOpen }
        });
    };

    const updateSlot = (day: string, index: number, field: 'start' | 'end', time: string) => {
        const newSlots = [...safeValue[day].slots];
        newSlots[index] = { ...newSlots[index], [field]: time };
        onChange({
            ...safeValue,
            [day]: { ...safeValue[day], slots: newSlots }
        });
    };

    const addSlot = (day: string) => {
        const newSlots = [...safeValue[day].slots, { start: '09:00', end: '17:00' }];
        onChange({
            ...safeValue,
            [day]: { ...safeValue[day], slots: newSlots }
        });
    };

    const removeSlot = (day: string, index: number) => {
        const newSlots = safeValue[day].slots.filter((_, i) => i !== index);
        onChange({
            ...safeValue,
            [day]: { ...safeValue[day], slots: newSlots }
        });
    };

    const copyHoursTo = (sourceDay: string, targetDays: string[]) => {
        const sourceSchedule = safeValue[sourceDay];
        const newHours = { ...safeValue };
        targetDays.forEach(day => {
            newHours[day] = JSON.parse(JSON.stringify(sourceSchedule));
        });
        onChange(newHours);
        toast.success(`Copied hours from ${sourceDay} to ${targetDays.length} days`);
    };

    return (
        <div className="bg-gray-50 p-3 sm:p-4 rounded-xl border border-gray-200">
            {DAYS_OF_WEEK.map((day) => (
                <div key={day} className="flex flex-col py-3 sm:py-4 border-b border-gray-200 last:border-0">
                    {/* Mobile-first: Day header with toggle */}
                    <div className="flex items-center justify-between sm:justify-start mb-3 sm:mb-0">
                        <div className="flex items-center gap-3 sm:gap-4 sm:w-32">
                            <Switch
                                checked={safeValue[day]?.isOpen}
                                onCheckedChange={(checked) => handleDayToggle(day, checked)}
                                disabled={readOnly}
                            />
                            <span className="capitalize font-medium text-gray-700 text-sm sm:text-base">{day}</span>
                        </div>

                        {/* Copy button - mobile optimized */}
                        {!readOnly && safeValue[day]?.isOpen && (
                            <div className="sm:hidden">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-600" title="Copy times" type="button">
                                            <Copy className="w-4 h-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48">
                                        <DropdownMenuLabel>Copy times to...</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => copyHoursTo(day, DAYS_OF_WEEK.filter(d => d !== day))}>
                                            Select All
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        {DAYS_OF_WEEK.filter(d => d !== day).map(targetDay => (
                                            <DropdownMenuItem key={targetDay} onClick={() => copyHoursTo(day, [targetDay])}>
                                                <span className="capitalize">{targetDay}</span>
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        )}
                    </div>

                    {/* Time slots - mobile-first stacked layout */}
                    <div className="sm:flex-1 sm:ml-36">
                        {safeValue[day]?.isOpen ? (
                            <div className="space-y-2 sm:space-y-3">
                                {safeValue[day].slots.map((slot, index) => (
                                    <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-end">
                                        {/* Time inputs - stacked on mobile, horizontal on desktop */}
                                        <div className="flex items-center gap-2 w-full sm:w-auto">
                                            <Select
                                                value={slot.start}
                                                onValueChange={(val) => updateSlot(day, index, 'start', val)}
                                                disabled={readOnly}
                                            >
                                                <SelectTrigger className="flex-1 sm:w-28 h-11 sm:h-9 text-sm bg-white">
                                                    <SelectValue placeholder="Start" />
                                                </SelectTrigger>
                                                <SelectContent className="h-60">
                                                    {TIME_OPTIONS.map((t) => (
                                                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <span className="text-gray-400 px-1">-</span>
                                            <Select
                                                value={slot.end}
                                                onValueChange={(val) => updateSlot(day, index, 'end', val)}
                                                disabled={readOnly}
                                            >
                                                <SelectTrigger className="flex-1 sm:w-28 h-11 sm:h-9 text-sm bg-white">
                                                    <SelectValue placeholder="End" />
                                                </SelectTrigger>
                                                <SelectContent className="h-60">
                                                    {TIME_OPTIONS.map((t) => (
                                                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>

                                            {/* Action buttons */}
                                            {!readOnly && (
                                                <>
                                                    {index === 0 ? (
                                                        <div className="flex items-center gap-1">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-11 w-11 sm:h-8 sm:w-8 text-gray-400 hover:text-gray-600"
                                                                onClick={() => addSlot(day)}
                                                                title="Add time slot"
                                                                type="button"
                                                            >
                                                                <Plus className="w-4 h-4" />
                                                            </Button>
                                                            {/* Desktop copy button */}
                                                            <div className="hidden sm:block">
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger asChild>
                                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-600" title="Copy times" type="button">
                                                                            <Copy className="w-4 h-4" />
                                                                        </Button>
                                                                    </DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="end" className="w-48">
                                                                        <DropdownMenuLabel>Copy times to...</DropdownMenuLabel>
                                                                        <DropdownMenuSeparator />
                                                                        <DropdownMenuItem onClick={() => copyHoursTo(day, DAYS_OF_WEEK.filter(d => d !== day))}>
                                                                            Select All
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuSeparator />
                                                                        {DAYS_OF_WEEK.filter(d => d !== day).map(targetDay => (
                                                                            <DropdownMenuItem key={targetDay} onClick={() => copyHoursTo(day, [targetDay])}>
                                                                                <span className="capitalize">{targetDay}</span>
                                                                            </DropdownMenuItem>
                                                                        ))}
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-11 w-11 sm:h-8 sm:w-8 text-red-400 hover:text-red-600"
                                                            onClick={() => removeSlot(day, index)}
                                                            type="button"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex py-2 sm:justify-end">
                                <span className="text-gray-400 text-sm italic">Unavailable</span>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
});

AvailabilityScheduler.displayName = 'AvailabilityScheduler';

