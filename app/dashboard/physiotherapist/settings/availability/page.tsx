'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { Loader2 } from '@/components/icons';
import { toast } from 'sonner';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AvailabilityScheduler, type OperatingHours } from '@/components/onboarding/common/AvailabilityScheduler';
import { primaryButtonClass } from '@/components/physio/ui';
import { SettingsPageHeader, SettingsSection } from '@/components/physio/SettingsUI';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type WeeklySchedule = {
    weeklyHours: { dayOfWeek: number; isAvailable: boolean; slots: { start: string; end: string }[] }[];
    [key: string]: unknown;
};

/** Monday to Friday, 9 to 5: what a new physio starts with. */
const STARTER_HOURS: OperatingHours = Object.fromEntries(
    DAYS.map((day) => [
        day,
        { isOpen: day !== 'saturday' && day !== 'sunday', slots: [{ start: '09:00', end: '17:00' }] },
    ])
);

function isWeeklySchedule(value: unknown): value is WeeklySchedule {
    return Boolean(value && typeof value === 'object' && Array.isArray((value as WeeklySchedule).weeklyHours));
}

/**
 * The calendar stores hours as `weeklyHours` (with date overrides); onboarding stored them by
 * day name. The editor works with day names, so convert in and back out without losing the rest.
 */
function toEditable(schedule: unknown): OperatingHours {
    if (isWeeklySchedule(schedule)) {
        const hours: OperatingHours = {};
        for (const day of DAYS) hours[day] = { isOpen: false, slots: [{ start: '09:00', end: '17:00' }] };
        for (const entry of schedule.weeklyHours) {
            const day = DAYS[entry.dayOfWeek];
            if (day) hours[day] = { isOpen: entry.isAvailable, slots: entry.slots.length ? entry.slots : [{ start: '09:00', end: '17:00' }] };
        }
        return hours;
    }
    // getCurrentUser returns {} when no hours were ever saved
    if (schedule && typeof schedule === 'object' && Object.keys(schedule).length > 0) return schedule as OperatingHours;
    return STARTER_HOURS;
}

function fromEditable(hours: OperatingHours, original: unknown) {
    if (!isWeeklySchedule(original)) return hours;
    return {
        ...original,
        weeklyHours: DAYS.map((day, dayOfWeek) => ({
            dayOfWeek,
            isAvailable: Boolean(hours[day]?.isOpen),
            slots: hours[day]?.slots ?? [],
        })),
    };
}

function findProblem(hours: OperatingHours): string | null {
    const openDays = DAYS.filter((day) => hours[day]?.isOpen);
    if (openDays.length === 0) return 'Open at least one day so patients can book you.';
    for (const day of openDays) {
        const slots = hours[day].slots;
        if (slots.length === 0) return `Add hours for ${day[0].toUpperCase()}${day.slice(1)}, or switch it off.`;
        for (const slot of slots) {
            if (slot.end <= slot.start) {
                return `On ${day[0].toUpperCase()}${day.slice(1)}, the end time must be after the start time.`;
            }
        }
    }
    return null;
}

type DateOverride = { date: string; isAvailable: boolean; reason?: string };

function todayIso() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Single days when the physio isn't taking bookings (holidays, leave, conferences). */
function DaysOff() {
    const user = useQuery(api.users.getMyUser);
    const schedule = useQuery(
        api.calendar.availability.getAvailabilitySchedule,
        user?._id ? { physiotherapistId: user._id } : 'skip'
    ) as { dateOverrides?: DateOverride[] } | undefined;
    const setOverride = useMutation(api.calendar.availability.setDateOverride);
    const removeOverride = useMutation(api.calendar.availability.removeDateOverride);
    const [date, setDate] = useState('');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);

    const today = todayIso();
    const upcoming = (schedule?.dateOverrides ?? [])
        .filter((o) => !o.isAvailable && o.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date));

    const add = async () => {
        if (!date) return;
        setBusy(true);
        try {
            await setOverride({ override: { date, isAvailable: false, reason: reason.trim() || undefined } });
            setDate('');
            setReason('');
            toast.success('Day off added');
        } catch (error) {
            toast.error((error as Error).message || 'Couldn’t add that day');
        } finally {
            setBusy(false);
        }
    };

    return (
        <SettingsSection title="Days off" description="Patients can’t book you on these dates.">
            <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                        type="date"
                        min={today}
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        aria-label="Date"
                        className="sm:w-44"
                    />
                    <Input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Reason (optional, only you see it)"
                        aria-label="Reason"
                        className="flex-1"
                    />
                    <Button variant="outline" onClick={add} disabled={!date || busy || !schedule}>
                        Add day off
                    </Button>
                </div>
                {upcoming.length > 0 && (
                    <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-white/[0.07]">
                        {upcoming.map((o) => (
                            <li key={o.date} className="flex items-center justify-between gap-3 px-3 py-2">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-neutral-900 dark:text-white">
                                        {new Date(`${o.date}T12:00:00`).toLocaleDateString('en-NG', {
                                            weekday: 'short',
                                            day: 'numeric',
                                            month: 'short',
                                            year: 'numeric',
                                        })}
                                    </p>
                                    {o.reason && (
                                        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{o.reason}</p>
                                    )}
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-neutral-500"
                                    onClick={() =>
                                        removeOverride({ date: o.date }).catch(() => toast.error('Couldn’t remove that day'))
                                    }
                                >
                                    Remove
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </SettingsSection>
    );
}

export default function AvailabilitySettingsPage() {
    const currentUserProfile = useQuery(api.queries.getCurrentUser);
    const updateAvailability = useMutation(api.physiotherapists.updateAvailability);
    const [hours, setHours] = useState<OperatingHours | null>(null);
    const [original, setOriginal] = useState<unknown>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (hours !== null || currentUserProfile === undefined) return;
        const stored = (currentUserProfile?.profileData as { availabilitySchedule?: unknown } | undefined)
            ?.availabilitySchedule;
        setOriginal(stored ?? null);
        setHours(toEditable(stored));
    }, [currentUserProfile, hours]);

    const handleSave = async () => {
        if (!hours) return;
        const problem = findProblem(hours);
        if (problem) {
            toast.error(problem);
            return;
        }
        setIsSaving(true);
        try {
            // Merge into the latest stored schedule so days off added meanwhile are kept
            const latest =
                (currentUserProfile?.profileData as { availabilitySchedule?: unknown } | undefined)
                    ?.availabilitySchedule ?? original;
            const next = fromEditable(hours, latest);
            await updateAvailability({ availabilitySchedule: next });
            setOriginal(next);
            toast.success('Working hours saved');
        } catch (error) {
            toast.error((error as Error).message || 'Couldn’t save your hours. Try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <SettingsPageHeader
                title="Working hours"
                description="Patients can book you during these hours. Times are Lagos time (WAT)."
            />
            <SettingsSection
                footer={
                    <Button onClick={handleSave} disabled={isSaving || !hours} className={primaryButtonClass}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save hours
                    </Button>
                }
            >
                {hours ? (
                    <AvailabilityScheduler value={hours} onChange={setHours} />
                ) : (
                    <div className="space-y-3">
                        {[...Array(7)].map((_, i) => (
                            <Skeleton key={i} className="h-12 rounded-lg" />
                        ))}
                    </div>
                )}
            </SettingsSection>
            <DaysOff />
        </div>
    );
}
