"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
    ArrowRight,
    Banknote,
    Check,
    ChevronLeft,
    ChevronRight,
    Clock,
    Loader2,
    MapPin,
    Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LAGOS_TIME_ZONE, zonedDateKey, zonedDateTimeToUtc } from "@/convex/helpers/lagosTime";
import { useGoogleBusyRefresh } from "@/lib/hooks/useGoogleBusyRefresh";

export interface AvailableSlot {
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
    offersInPersonSessions?: boolean;
    /** Replaces the compact host header at the top of the left column (e.g. photo + bio). */
    host?: ReactNode;
    /** Price rows shown with the session details, e.g. [{ label: "Video call", amount: "₦6,000" }]. */
    prices?: { label: string; amount: string }[];
    /** Extra content at the bottom of the left column. */
    sidebarFooter?: ReactNode;
    /** Controlled selection. Leave undefined to let the widget manage it. */
    selectedSlot?: AvailableSlot | null;
    /** Called with the picked slot, or null when the selection is cleared (another day picked). */
    onSlotSelect?: (slot: AvailableSlot | null) => void;
    /** Shows a "Next" button beside the selected time on large screens (cal.com style). */
    onContinue?: () => void;
    continueLabel?: string;
    className?: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

function dayKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Calendar cell of a slot: its Lagos date, keyed like dayKey (month 0-based). */
function slotDay(timestamp: number): { year: number; month: number; day: number; key: string } {
    const [year, month, day] = zonedDateKey(timestamp).split("-").map(Number);
    return { year, month: month - 1, day, key: `${year}-${month - 1}-${day}` };
}

/** Midnight (Lagos) starting the given calendar month; month may overflow (13 → next year). */
function lagosMonthStart(year: number, month: number): number {
    const first = new Date(Date.UTC(year, month, 1));
    return zonedDateTimeToUtc(first.toISOString().slice(0, 10), "00:00");
}

function monthDays(year: number, month: number): (number | null)[] {
    const leading = new Date(year, month, 1).getDay();
    const count = new Date(year, month + 1, 0).getDate();
    return [...Array<null>(leading).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
}

export default function CalendarBookingWidget({
    physiotherapistId,
    physiotherapistName,
    physiotherapistImage,
    sessionDuration = 60,
    sessionTitle,
    sessionDescription,
    offersOnlineSessions = true,
    offersInPersonSessions = false,
    host,
    prices,
    sidebarFooter,
    selectedSlot: controlledSlot,
    onSlotSelect,
    onContinue,
    continueLabel = "Next",
    className,
}: CalendarBookingWidgetProps) {
    const reduceMotion = useReducedMotion();
    const today = new Date();
    // Calendar cells are Lagos days: a slot sits on its Lagos date in any browser zone
    const initialDay = controlledSlot ? slotDay(controlledSlot.start) : null;
    const initialDate = initialDay ? new Date(initialDay.year, initialDay.month, initialDay.day) : null;

    const [currentMonth, setCurrentMonth] = useState((initialDate ?? today).getMonth());
    const [currentYear, setCurrentYear] = useState((initialDate ?? today).getFullYear());
    const [selectedDate, setSelectedDate] = useState<Date | null>(initialDate);
    const [internalSlot, setInternalSlot] = useState<AvailableSlot | null>(controlledSlot ?? null);
    const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("12h");
    const autoPicked = useRef(Boolean(initialDate));
    const slotsRef = useRef<HTMLDivElement>(null);

    const selectedSlot = controlledSlot !== undefined ? controlledSlot : internalSlot;

    // Current month plus the next one, so "next available" can look ahead.
    const dateRange = useMemo(
        () => ({
            startDate: lagosMonthStart(currentYear, currentMonth),
            endDate: lagosMonthStart(currentYear, currentMonth + 2) - 1,
        }),
        [currentYear, currentMonth]
    );

    // Only real availability is bookable; undefined while loading.
    useGoogleBusyRefresh(physiotherapistId);
    const availableSlots = useQuery(api.calendar.availability.getAvailableSlots, {
        physiotherapistId,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        sessionDuration,
    }) as AvailableSlot[] | undefined;

    const upcomingSlots = useMemo(() => {
        if (!availableSlots) return undefined;
        const now = Date.now();
        return availableSlots.filter((slot) => slot.start > now).sort((a, b) => a.start - b.start);
    }, [availableSlots]);

    const daysWithSlots = useMemo(() => {
        const keys = new Set<string>();
        for (const slot of upcomingSlots ?? []) keys.add(slotDay(slot.start).key);
        return keys;
    }, [upcomingSlots]);

    const days = useMemo(() => monthDays(currentYear, currentMonth), [currentYear, currentMonth]);

    const monthHasSlots = useMemo(
        () => days.some((day) => day !== null && daysWithSlots.has(dayKey(new Date(currentYear, currentMonth, day)))),
        [days, daysWithSlots, currentYear, currentMonth]
    );

    const nextAvailableAfterMonth = useMemo(() => {
        const monthEnd = lagosMonthStart(currentYear, currentMonth + 1);
        return upcomingSlots?.find((slot) => slot.start >= monthEnd) ?? null;
    }, [upcomingSlots, currentYear, currentMonth]);

    const slotsForSelectedDate = useMemo(() => {
        if (!selectedDate || !upcomingSlots) return [];
        const key = dayKey(selectedDate);
        return upcomingSlots.filter((slot) => slotDay(slot.start).key === key);
    }, [selectedDate, upcomingSlots]);

    // Open on the first day with openings so patients see times straight away.
    useEffect(() => {
        if (autoPicked.current || !upcomingSlots) return;
        autoPicked.current = true;
        const first = upcomingSlots[0];
        if (!first) return;
        const day = slotDay(first.start);
        setCurrentMonth(day.month);
        setCurrentYear(day.year);
        setSelectedDate(new Date(day.year, day.month, day.day));
    }, [upcomingSlots]);

    // Lagos time, the physio's schedule zone
    const formatTime = (timestamp: number) =>
        new Date(timestamp).toLocaleTimeString("en-US", {
            hour: timeFormat === "12h" ? "numeric" : "2-digit",
            minute: "2-digit",
            hour12: timeFormat === "12h",
            timeZone: LAGOS_TIME_ZONE,
        });

    const shiftMonth = (delta: number) => {
        const next = new Date(currentYear, currentMonth + delta, 1);
        setCurrentMonth(next.getMonth());
        setCurrentYear(next.getFullYear());
    };

    const canGoPrevious = currentYear > today.getFullYear() || (currentYear === today.getFullYear() && currentMonth > today.getMonth());

    const setSlot = (slot: AvailableSlot | null) => {
        setInternalSlot(slot);
        onSlotSelect?.(slot);
    };

    const pickDate = (date: Date, scroll: boolean) => {
        setSelectedDate(date);
        if (selectedSlot) setSlot(null);
        // On stacked layouts, bring the times into view after picking a day.
        if (scroll && typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
            window.requestAnimationFrame(() =>
                slotsRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" })
            );
        }
    };

    const jumpTo = (slot: AvailableSlot) => {
        const day = slotDay(slot.start);
        setCurrentMonth(day.month);
        setCurrentYear(day.year);
        pickDate(new Date(day.year, day.month, day.day), true);
    };

    const title =
        sessionTitle ||
        (sessionDuration <= 30 ? "Quick Check-in" : sessionDuration <= 45 ? "Follow-up Session" : "Initial Consultation");

    const loading = availableSlots === undefined;

    return (
        <div
            className={cn(
                "overflow-hidden rounded-[28px] bg-white text-rh-night shadow-[0_30px_80px_-30px_rgba(0,0,0,0.55)] ring-1 ring-rh-night/10",
                "dark:bg-rh-ink-2 dark:text-white dark:ring-white/10",
                className
            )}
        >
            <div className="flex flex-col lg:flex-row">
                {/* Left — host and session details */}
                <aside className="w-full border-b border-rh-night/10 p-5 sm:p-6 lg:w-[300px] lg:shrink-0 lg:border-b-0 lg:border-r dark:border-white/10">
                    {host ?? (
                        <div className="flex items-center gap-3">
                            {physiotherapistImage ? (
                                <Image
                                    src={physiotherapistImage}
                                    alt={physiotherapistName}
                                    width={40}
                                    height={40}
                                    unoptimized
                                    className="h-10 w-10 rounded-full object-cover ring-1 ring-rh-night/10 dark:ring-white/10"
                                />
                            ) : (
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rh-night text-sm font-semibold text-white dark:bg-rh-lime dark:text-rh-night" aria-hidden>
                                    {physiotherapistName.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]).join("")}
                                </div>
                            )}
                            <span className="truncate text-sm font-medium text-rh-night/70 dark:text-white/70">{physiotherapistName}</span>
                        </div>
                    )}

                    <div className={cn(host ? "mt-6 border-t border-rh-night/10 pt-5 dark:border-white/10" : "mt-5")}>
                        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
                        {sessionDescription && (
                            <p className="mt-1 text-sm text-rh-night/60 dark:text-white/60">{sessionDescription}</p>
                        )}

                        <ul className="mt-4 space-y-2.5 text-sm font-medium text-rh-night/80 dark:text-white/80">
                            <li className="flex items-center gap-2.5">
                                <Clock className="h-4 w-4 shrink-0 text-rh-night/50 dark:text-white/50" aria-hidden />
                                {sessionDuration} min
                            </li>
                            {offersOnlineSessions && (
                                <li className="flex items-center gap-2.5">
                                    <Video className="h-4 w-4 shrink-0 text-rh-night/50 dark:text-white/50" aria-hidden />
                                    Video call
                                </li>
                            )}
                            {offersInPersonSessions && (
                                <li className="flex items-center gap-2.5">
                                    <MapPin className="h-4 w-4 shrink-0 text-rh-night/50 dark:text-white/50" aria-hidden />
                                    In person
                                </li>
                            )}
                        </ul>

                        {prices && prices.length > 0 && (
                            <div className="mt-4 rounded-2xl bg-rh-canvas/70 p-3.5 ring-1 ring-inset ring-rh-night/[0.06] dark:bg-white/[0.04] dark:ring-white/10">
                                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-rh-night/55 dark:text-white/50">
                                    <Banknote className="h-3.5 w-3.5" aria-hidden />
                                    Session fee
                                </p>
                                <ul className="mt-2 space-y-1.5">
                                    {prices.map((row) => (
                                        <li key={row.label} className="flex items-baseline justify-between gap-3 text-sm">
                                            <span className="text-rh-night/70 dark:text-white/65">{row.label}</span>
                                            <span className="font-semibold tabular-nums">{row.amount}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    {sidebarFooter}
                </aside>

                {/* Centre — calendar */}
                <section className="flex-1 border-b border-rh-night/10 p-5 sm:p-6 lg:border-b-0 lg:border-r dark:border-white/10" aria-label="Choose a date">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 text-base font-semibold">
                            <span>
                                {MONTHS[currentMonth]} <span className="font-normal text-rh-night/50 dark:text-white/50">{currentYear}</span>
                            </span>
                            {loading && <Loader2 className="h-4 w-4 animate-spin text-rh-night/40 dark:text-white/40" aria-label="Loading availability" />}
                        </h3>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => shiftMonth(-1)}
                                aria-label="Previous month"
                                disabled={!canGoPrevious}
                                className="flex h-9 w-9 items-center justify-center rounded-full text-rh-night/70 transition-colors hover:bg-rh-night/[0.06] hover:text-rh-night focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
                            >
                                <ChevronLeft className="h-5 w-5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => shiftMonth(1)}
                                aria-label="Next month"
                                className="flex h-9 w-9 items-center justify-center rounded-full text-rh-night/70 transition-colors hover:bg-rh-night/[0.06] hover:text-rh-night focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
                            >
                                <ChevronRight className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wider text-rh-night/45 dark:text-white/45">
                        {WEEKDAYS.map((day) => (
                            <div key={day} className="py-2">{day}</div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                        {days.map((day, index) => {
                            if (day === null) return <div key={`empty-${index}`} className="aspect-square" />;
                            const date = new Date(currentYear, currentMonth, day);
                            const available = daysWithSlots.has(dayKey(date));
                            const selected = selectedDate ? dayKey(selectedDate) === dayKey(date) : false;
                            const isToday = dayKey(date) === dayKey(today);
                            const label = date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

                            return (
                                <button
                                    key={day}
                                    type="button"
                                    onClick={() => available && pickDate(date, true)}
                                    disabled={!available}
                                    aria-pressed={selected}
                                    aria-label={`${label}${available ? "" : ", no openings"}`}
                                    className={cn(
                                        "relative flex aspect-square items-center justify-center rounded-xl text-sm tabular-nums transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime focus-visible:ring-offset-1",
                                        !available && "cursor-default text-rh-night/30 dark:text-white/25",
                                        available && !selected &&
                                            "bg-rh-night/[0.06] font-semibold text-rh-night hover:bg-rh-night/[0.12] hover:ring-1 hover:ring-rh-night/25 active:scale-95 dark:bg-white/[0.07] dark:text-white dark:hover:bg-white/[0.14] dark:hover:ring-white/25",
                                        selected && "bg-rh-lime font-bold text-rh-night shadow-[0_8px_20px_-8px_rgba(0,205,15,0.8)]"
                                    )}
                                >
                                    {day}
                                    {isToday && (
                                        <span
                                            className={cn(
                                                "absolute bottom-1.5 h-1 w-1 rounded-full",
                                                selected ? "bg-rh-night" : "bg-rh-night/60 dark:bg-rh-lime"
                                            )}
                                            aria-hidden
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {!loading && !monthHasSlots && (
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-rh-canvas/70 px-4 py-3 text-sm dark:bg-white/[0.04]">
                            <span className="text-rh-night/65 dark:text-white/60">No openings in {MONTHS[currentMonth]}.</span>
                            {nextAvailableAfterMonth ? (
                                <button
                                    type="button"
                                    onClick={() => jumpTo(nextAvailableAfterMonth)}
                                    className="inline-flex items-center gap-1 rounded-full font-semibold text-rh-night underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime dark:text-rh-lime"
                                >
                                    Next opening{" "}
                                    {new Date(nextAvailableAfterMonth.start).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: LAGOS_TIME_ZONE })}
                                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => shiftMonth(1)}
                                    className="inline-flex items-center gap-1 rounded-full font-semibold text-rh-night underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime dark:text-rh-lime"
                                >
                                    Check next month <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                                </button>
                            )}
                        </div>
                    )}
                </section>

                {/* Right — times */}
                <section ref={slotsRef} className="w-full scroll-mt-4 p-5 sm:p-6 lg:w-[272px] lg:shrink-0" aria-label="Choose a time">
                    {selectedDate ? (
                        <>
                            <div className="mb-4 flex items-center justify-between gap-2">
                                <h4 className="text-sm font-semibold">
                                    {selectedDate.toLocaleDateString("en-GB", { weekday: "short" })}{" "}
                                    <span className="text-rh-night/55 dark:text-white/55">
                                        {selectedDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                    </span>
                                </h4>
                                <div className="flex rounded-full bg-rh-night/[0.06] p-0.5 text-xs font-medium dark:bg-white/[0.08]" role="group" aria-label="Time format">
                                    {(["12h", "24h"] as const).map((format) => (
                                        <button
                                            key={format}
                                            type="button"
                                            onClick={() => setTimeFormat(format)}
                                            aria-pressed={timeFormat === format}
                                            className={cn(
                                                "rounded-full px-2.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime",
                                                timeFormat === format
                                                    ? "bg-white text-rh-night shadow-sm dark:bg-white/90"
                                                    : "text-rh-night/55 hover:text-rh-night dark:text-white/55 dark:hover:text-white"
                                            )}
                                        >
                                            {format}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {loading ? (
                                <div className="flex items-center justify-center py-10">
                                    <Loader2 className="h-6 w-6 animate-spin text-rh-night/40 dark:text-white/40" />
                                </div>
                            ) : slotsForSelectedDate.length === 0 ? (
                                <p className="py-10 text-center text-sm text-rh-night/55 dark:text-white/55">No times left on this day.</p>
                            ) : (
                                <AnimatePresence mode="wait" initial={false}>
                                    <motion.ul
                                        key={dayKey(selectedDate)}
                                        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                                        transition={{ duration: reduceMotion ? 0 : 0.18 }}
                                        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:max-h-[420px] lg:grid-cols-1 lg:overflow-y-auto lg:pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-rh-night/20 dark:[&::-webkit-scrollbar-thumb]:bg-white/20"
                                    >
                                        {slotsForSelectedDate.map((slot) => {
                                            const isSelected = selectedSlot?.start === slot.start;
                                            return (
                                                <li key={slot.start} className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSlot(slot)}
                                                        aria-pressed={isSelected}
                                                        className={cn(
                                                            "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border text-sm font-semibold tabular-nums transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime focus-visible:ring-offset-1 active:scale-[0.97]",
                                                            isSelected
                                                                ? "border-rh-night bg-rh-night text-white dark:border-rh-lime dark:bg-rh-lime dark:text-rh-night"
                                                                : "border-rh-night/15 bg-white text-rh-night hover:border-rh-night hover:shadow-sm dark:border-white/15 dark:bg-transparent dark:text-white dark:hover:border-white/60"
                                                        )}
                                                    >
                                                        {isSelected ? (
                                                            <Check className="h-4 w-4 text-rh-lime dark:text-rh-night" aria-hidden />
                                                        ) : (
                                                            <span className="h-1.5 w-1.5 rounded-full bg-rh-lime" aria-hidden />
                                                        )}
                                                        {formatTime(slot.start)}
                                                    </button>
                                                    {isSelected && onContinue && (
                                                        <motion.button
                                                            type="button"
                                                            onClick={onContinue}
                                                            initial={reduceMotion ? false : { opacity: 0, width: 0 }}
                                                            animate={{ opacity: 1, width: "auto" }}
                                                            transition={{ duration: reduceMotion ? 0 : 0.2 }}
                                                            className="hidden min-h-11 shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-xl bg-rh-lime px-4 text-sm font-semibold text-rh-night transition-[filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-night focus-visible:ring-offset-1 active:scale-[0.97] lg:flex"
                                                        >
                                                            {continueLabel}
                                                            <ArrowRight className="h-4 w-4" aria-hidden />
                                                        </motion.button>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </motion.ul>
                                </AnimatePresence>
                            )}
                        </>
                    ) : (
                        <div className="flex h-full min-h-[120px] flex-col items-center justify-center text-center">
                            {loading ? (
                                <Loader2 className="h-6 w-6 animate-spin text-rh-night/40 dark:text-white/40" aria-label="Loading availability" />
                            ) : (
                                <p className="text-sm text-rh-night/55 dark:text-white/55">
                                    {upcomingSlots && upcomingSlots.length === 0 ? "No openings at the moment." : "Pick a day to see times."}
                                </p>
                            )}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
