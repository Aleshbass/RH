/**
 * Calendar Availability Types
 *
 * Based on Cal.com patterns:
 * - Buffer times are per-event-type (before/after), default 0
 * - Date overrides for holidays/vacation
 * - Weekly recurring schedule
 */

import { v } from "convex/values";

// Time slot validator (e.g., "09:00")
export const timeSlotValidator = v.object({
    start: v.string(), // "HH:MM" format
    end: v.string(), // "HH:MM" format
});

// Single day availability
export const dayAvailabilityValidator = v.object({
    dayOfWeek: v.number(), // 0=Sunday, 1=Monday, ..., 6=Saturday
    isAvailable: v.boolean(),
    slots: v.array(timeSlotValidator), // Multiple slots per day (e.g., 9-12, 13-17 for lunch break)
});

// Date override (holidays, vacation, custom hours)
export const dateOverrideValidator = v.object({
    date: v.string(), // "YYYY-MM-DD" format
    isAvailable: v.boolean(),
    slots: v.optional(v.array(timeSlotValidator)), // Custom hours for that day
    reason: v.optional(v.string()), // "National Holiday", "Vacation", etc.
});

// Buffer settings (Cal.com style - before and after)
export const bufferSettingsValidator = v.object({
    beforeEvent: v.number(), // minutes before each event
    afterEvent: v.number(), // minutes after each event (for cleaning, notes)
});

// Complete availability schedule
export const availabilityScheduleValidator = v.object({
    timezone: v.string(), // "Africa/Lagos", "Europe/London", etc.
    defaultSessionDuration: v.number(), // minutes (default 60)
    buffer: bufferSettingsValidator,
    weeklyHours: v.array(dayAvailabilityValidator),
    dateOverrides: v.optional(v.array(dateOverrideValidator)),
});

// TypeScript types derived from validators
export type TimeSlot = {
    start: string;
    end: string;
};

export type DayAvailability = {
    dayOfWeek: number;
    isAvailable: boolean;
    slots: TimeSlot[];
};

export type DateOverride = {
    date: string;
    isAvailable: boolean;
    slots?: TimeSlot[];
    reason?: string;
};

export type BufferSettings = {
    beforeEvent: number;
    afterEvent: number;
};

export type AvailabilitySchedule = {
    timezone: string;
    defaultSessionDuration: number;
    buffer: BufferSettings;
    weeklyHours: DayAvailability[];
    dateOverrides?: DateOverride[];
};

// Available slot returned to clients
export type AvailableSlot = {
    start: number; // Unix timestamp
    end: number; // Unix timestamp
    duration: number; // minutes
};

// Busy block from external calendar or appointments
export type BusyBlock = {
    start: number; // Unix timestamp
    end: number; // Unix timestamp
    source: "rehabify" | "google_calendar" | "outlook";
    eventId?: string;
};

// Default availability schedule for new physiotherapists
export const DEFAULT_AVAILABILITY_SCHEDULE: AvailabilitySchedule = {
    timezone: "Africa/Lagos",
    defaultSessionDuration: 60, // 1 hour
    buffer: {
        beforeEvent: 0, // Cal.com default
        afterEvent: 15, // 15 min for notes/cleaning (physio-specific)
    },
    weeklyHours: [
        { dayOfWeek: 0, isAvailable: false, slots: [] }, // Sunday
        { dayOfWeek: 1, isAvailable: true, slots: [{ start: "09:00", end: "17:00" }] }, // Monday
        { dayOfWeek: 2, isAvailable: true, slots: [{ start: "09:00", end: "17:00" }] }, // Tuesday
        { dayOfWeek: 3, isAvailable: true, slots: [{ start: "09:00", end: "17:00" }] }, // Wednesday
        { dayOfWeek: 4, isAvailable: true, slots: [{ start: "09:00", end: "17:00" }] }, // Thursday
        { dayOfWeek: 5, isAvailable: true, slots: [{ start: "09:00", end: "17:00" }] }, // Friday
        { dayOfWeek: 6, isAvailable: false, slots: [] }, // Saturday
    ],
    dateOverrides: [],
};
