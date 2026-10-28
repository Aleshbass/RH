// @ts-nocheck
/**
 * Availability Management Module
 *
 * Provides:
 * - getAvailableSlots: Calculate free slots for a physiotherapist
 * - updateAvailability: Update working hours
 * - setDateOverride: Add/modify date-specific overrides
 *
 * Based on Cal.com patterns with physio-specific features.
 */

import { v } from "convex/values";
import { query, mutation, action, internalAction, internalMutation, type QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { getCallerOrNull } from "./access";
import {
    availabilityScheduleValidator,
    dateOverrideValidator,
    DEFAULT_AVAILABILITY_SCHEDULE,
    AvailabilitySchedule,
    AvailableSlot,
    BusyBlock,
    TimeSlot,
    DayAvailability,
} from "./availabilityTypes";
import { LAGOS_TIME_ZONE, startOfZonedDay, zonedDateTimeToUtc } from "../helpers/lagosTime";
import { isLiveHold } from "../helpers/slotHolds";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Type for old onboarding OperatingHours format
 */
type OperatingHours = Record<string, { isOpen: boolean; slots: Array<{ start: string; end: string }> }>;

/**
 * Map day names to day numbers (0=Sunday, 1=Monday, etc.)
 */
const DAY_NAME_TO_NUMBER: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
};

/**
 * Convert old OperatingHours format from onboarding to new AvailabilitySchedule format
 * This provides backward compatibility for physios who completed onboarding before the update
 */
function convertOperatingHoursToSchedule(operatingHours: OperatingHours): AvailabilitySchedule {
    const weeklyHours: DayAvailability[] = [];

    for (const [dayName, schedule] of Object.entries(operatingHours)) {
        const dayOfWeek = DAY_NAME_TO_NUMBER[dayName.toLowerCase()];
        if (dayOfWeek === undefined) continue;

        const slots: TimeSlot[] = schedule.slots.map(slot => ({
            start: slot.start,
            end: slot.end,
        }));

        weeklyHours.push({
            dayOfWeek,
            isAvailable: schedule.isOpen,
            slots: slots.length > 0 ? slots : [{ start: "09:00", end: "17:00" }],
        });
    }

    // Sort by day of week
    weeklyHours.sort((a, b) => a.dayOfWeek - b.dayOfWeek);

    return {
        timezone: "Africa/Lagos", // Default timezone
        defaultSessionDuration: 60, // Default 1 hour
        buffer: {
            beforeEvent: 0,
            afterEvent: 15,
        },
        weeklyHours,
        dateOverrides: [],
    };
}

/**
 * Check if the stored schedule is the old OperatingHours format
 */
function isOldOperatingHoursFormat(schedule: unknown): schedule is OperatingHours {
    if (!schedule || typeof schedule !== 'object') return false;
    const obj = schedule as Record<string, unknown>;
    // Check for day names like "monday", "tuesday", etc.
    return 'monday' in obj || 'tuesday' in obj || 'wednesday' in obj;
}

/**
 * Normalize availability schedule - handles both old and new formats
 */
function normalizeAvailabilitySchedule(schedule: unknown): AvailabilitySchedule {
    if (!schedule) {
        return DEFAULT_AVAILABILITY_SCHEDULE;
    }

    // Check if it's the old OperatingHours format from onboarding
    if (isOldOperatingHoursFormat(schedule)) {
        return convertOperatingHoursToSchedule(schedule);
    }

    // Assume it's the new format; hours without a zone are Lagos time
    const current = schedule as AvailabilitySchedule;
    return current.timezone ? current : { ...current, timezone: LAGOS_TIME_ZONE };
}

/**
 * Parse "HH:MM" string to minutes since midnight
 */
function parseTimeToMinutes(time: string): number {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
}

/**
 * Convert minutes since midnight to "HH:MM" string
 */
function minutesToTimeString(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

/**
 * Get the day of week for a given timestamp in a timezone
 */
function getDayOfWeek(timestamp: number, timezone: string): number {
    const date = new Date(timestamp);
    // Use Intl to get proper timezone-aware day
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
    });
    const dayName = formatter.format(date);
    const dayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
    };
    return dayMap[dayName] ?? 0;
}

/**
 * Get date string "YYYY-MM-DD" for a timestamp in a timezone
 */
function getDateString(timestamp: number, timezone: string): string {
    const date = new Date(timestamp);
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    return formatter.format(date);
}

/**
 * Get start of day timestamp for a date in a timezone
 */
function getStartOfDay(timestamp: number, timezone: string): number {
    return startOfZonedDay(timestamp, timezone || LAGOS_TIME_ZONE);
}

/**
 * Convert a time slot on a specific date to timestamps.
 * The hours are wall-clock time in the schedule's zone; Convex itself runs in UTC.
 */
function slotToTimestamps(
    dateStr: string,
    slot: TimeSlot,
    timezone: string
): { start: number; end: number } {
    const zone = timezone || LAGOS_TIME_ZONE;
    return {
        start: zonedDateTimeToUtc(dateStr, slot.start, zone),
        end: zonedDateTimeToUtc(dateStr, slot.end, zone),
    };
}

/**
 * Subtract busy blocks from available slots
 * Returns remaining free time slots
 */
function subtractBusyBlocks(
    availableSlots: Array<{ start: number; end: number }>,
    busyBlocks: BusyBlock[]
): Array<{ start: number; end: number }> {
    if (busyBlocks.length === 0) return availableSlots;

    let result = [...availableSlots];

    for (const busy of busyBlocks) {
        const newResult: Array<{ start: number; end: number }> = [];

        for (const slot of result) {
            // No overlap - keep slot as is
            if (busy.end <= slot.start || busy.start >= slot.end) {
                newResult.push(slot);
                continue;
            }

            // Busy block completely covers slot - remove it
            if (busy.start <= slot.start && busy.end >= slot.end) {
                continue;
            }

            // Busy block overlaps start of slot
            if (busy.start <= slot.start && busy.end < slot.end) {
                newResult.push({ start: busy.end, end: slot.end });
                continue;
            }

            // Busy block overlaps end of slot
            if (busy.start > slot.start && busy.end >= slot.end) {
                newResult.push({ start: slot.start, end: busy.start });
                continue;
            }

            // Busy block is in the middle - split the slot
            if (busy.start > slot.start && busy.end < slot.end) {
                newResult.push({ start: slot.start, end: busy.start });
                newResult.push({ start: busy.end, end: slot.end });
            }
        }

        result = newResult;
    }

    return result;
}

/**
 * Apply buffer times to slots
 */
function applyBuffers(
    slots: Array<{ start: number; end: number }>,
    beforeBuffer: number,
    afterBuffer: number
): Array<{ start: number; end: number }> {
    return slots.map((slot) => ({
        start: slot.start + beforeBuffer * 60 * 1000,
        end: slot.end - afterBuffer * 60 * 1000,
    })).filter((slot) => slot.start < slot.end); // Remove invalid slots
}

/**
 * Split slots into bookable chunks based on session duration
 */
function splitIntoBookableSlots(
    slots: Array<{ start: number; end: number }>,
    sessionDuration: number
): AvailableSlot[] {
    const result: AvailableSlot[] = [];
    const durationMs = sessionDuration * 60 * 1000;

    for (const slot of slots) {
        let currentStart = slot.start;

        while (currentStart + durationMs <= slot.end) {
            result.push({
                start: currentStart,
                end: currentStart + durationMs,
                duration: sessionDuration,
            });
            currentStart += durationMs;
        }
    }

    return result;
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get available booking slots for a physiotherapist
 *
 * This is the main slot calculation function that:
 * 1. Fetches the physio's availability schedule
 * 2. Gets existing Rehabify appointments
 * 3. Fetches Google Calendar busy times (if connected)
 * 4. Subtracts all busy blocks from working hours
 * 5. Applies buffers and returns bookable slots
 */
export const getAvailableSlots = query({
    args: {
        physiotherapistId: v.id("users"),
        startDate: v.number(), // Unix timestamp
        endDate: v.number(), // Unix timestamp
        sessionDuration: v.optional(v.number()), // Override default duration
        // Moving a visit: its own current time doesn't block the new one
        excludeAppointmentId: v.optional(v.id("appointments")),
    },
    handler: async (ctx, args): Promise<AvailableSlot[]> => {
        // 1. Get physiotherapist profile and availability
        const physioProfile = await ctx.db
            .query("physiotherapistProfiles")
            .withIndex("by_user_id", (q) => q.eq("userId", args.physiotherapistId))
            .unique();

        if (!physioProfile) {
            throw new Error("Physiotherapist profile not found");
        }

        // Parse availability - handles both old onboarding format and new format
        const availability = normalizeAvailabilitySchedule(physioProfile.availabilitySchedule);

        const sessionDuration = args.sessionDuration || availability.defaultSessionDuration;

        // 2. Get existing Rehabify appointments in the date range
        const appointments = await ctx.db
            .query("appointments")
            .withIndex("by_physiotherapist_id_and_time", (q) =>
                q.eq("physiotherapistId", args.physiotherapistId)
            )
            .filter((q) =>
                q.and(
                    q.gte(q.field("startTime"), args.startDate),
                    q.lte(q.field("startTime"), args.endDate),
                    q.neq(q.field("status"), "cancelled_by_patient"),
                    q.neq(q.field("status"), "cancelled_by_therapist")
                )
            )
            .collect();

        // Convert appointments to busy blocks
        const rehabifyBusy: BusyBlock[] = appointments
            .filter((apt) => apt._id !== args.excludeAppointmentId)
            .map((apt) => ({
                start: apt.startTime,
                end: apt.endTime,
                source: "rehabify" as const,
                eventId: apt._id,
            }));

        // A pending Marketplace/Joy booking is a real, short-lived hold.  It
        // must be removed from availability as well as checked by the booking
        // mutation; otherwise the patient can select a time that RH will
        // immediately reject as already held.
        const activeHolds = await ctx.db
            .query("marketplaceBookings")
            .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", args.physiotherapistId))
            .collect();
        const holdBusy: BusyBlock[] = activeHolds
            .filter((booking) =>
                // Unpaid holds, and paid requests waiting for the physio's answer
                isLiveHold(booking, Date.now()) &&
                (booking.sessionDate ?? 0) < args.endDate &&
                (booking.sessionDate ?? 0) + booking.sessionDuration * 60_000 > args.startDate
            )
            .map((booking) => ({
                start: booking.sessionDate,
                end: booking.sessionDate + booking.sessionDuration * 60_000,
                source: "rehabify" as const,
                eventId: booking._id,
            }));

        // Google Calendar busy times, cached by refreshGoogleBusy when a booking page opens
        const googleBusy: BusyBlock[] = (await getCachedGoogleBusy(ctx, args.physiotherapistId))
            .filter((block) => block.start < args.endDate && block.end > args.startDate)
            .map((block) => ({ start: block.start, end: block.end, source: "google_calendar" as const }));

        // 3. Generate available slots for each day in range
        const allSlots: Array<{ start: number; end: number }> = [];
        let currentDay = args.startDate;
        const oneDayMs = 24 * 60 * 60 * 1000;

        while (currentDay <= args.endDate) {
            const dateStr = getDateString(currentDay, availability.timezone);
            const dayOfWeek = getDayOfWeek(currentDay, availability.timezone);

            // Check for date override first
            const override = availability.dateOverrides?.find((o) => o.date === dateStr);

            let daySlots: TimeSlot[];

            if (override) {
                // Use override settings
                if (!override.isAvailable) {
                    currentDay += oneDayMs;
                    continue; // Skip this day entirely
                }
                daySlots = override.slots || [];
            } else {
                // Use weekly schedule
                const daySchedule = availability.weeklyHours.find(
                    (d) => d.dayOfWeek === dayOfWeek
                );
                if (!daySchedule || !daySchedule.isAvailable) {
                    currentDay += oneDayMs;
                    continue;
                }
                daySlots = daySchedule.slots;
            }

            // Convert time slots to timestamps
            for (const slot of daySlots) {
                const { start, end } = slotToTimestamps(dateStr, slot, availability.timezone);
                // Only add slots that are in the future
                if (end > Date.now()) {
                    allSlots.push({ start, end });
                }
            }

            currentDay += oneDayMs;
        }

        // 4. Subtract busy blocks
        const afterBusy = subtractBusyBlocks(allSlots, [...rehabifyBusy, ...holdBusy, ...googleBusy]);

        // 5. Apply buffers
        const afterBuffers = applyBuffers(
            afterBusy,
            availability.buffer.beforeEvent,
            availability.buffer.afterEvent
        );

        // 6. Split into bookable slots
        const bookableSlots = splitIntoBookableSlots(afterBuffers, sessionDuration);

        return bookableSlots;
    },
});

/**
 * Whether [start, end) falls inside the physio's working hours that day (weekly hours or a date
 * override). Bookings and calendar busy times are not checked here.
 */
export function isWithinWorkingHours(schedule: unknown, start: number, end: number): boolean {
    const availability = normalizeAvailabilitySchedule(schedule);
    const dateStr = getDateString(start, availability.timezone);
    const override = availability.dateOverrides?.find((o) => o.date === dateStr);
    let daySlots: TimeSlot[];
    if (override) {
        if (!override.isAvailable) return false;
        daySlots = override.slots || [];
    } else {
        const daySchedule = availability.weeklyHours.find((d) => d.dayOfWeek === getDayOfWeek(start, availability.timezone));
        if (!daySchedule || !daySchedule.isAvailable) return false;
        daySlots = daySchedule.slots;
    }
    return daySlots.some((slot) => {
        const window = slotToTimestamps(dateStr, slot, availability.timezone);
        return window.start <= start && end <= window.end;
    });
}

/**
 * Get availability schedule for a physiotherapist
 *
 * Public: working hours are what a booking page shows. Only the physiotherapist
 * (or an admin) gets the private reasons on date overrides ("Vacation", ...).
 */
export const getAvailabilitySchedule = query({
    args: {
        physiotherapistId: v.id("users"),
    },
    handler: async (ctx, args): Promise<AvailabilitySchedule> => {
        const physioProfile = await ctx.db
            .query("physiotherapistProfiles")
            .withIndex("by_user_id", (q) => q.eq("userId", args.physiotherapistId))
            .unique();

        if (!physioProfile) {
            throw new Error("Physiotherapist profile not found");
        }

        // Normalize to handle both old onboarding format and new format
        const schedule = normalizeAvailabilitySchedule(physioProfile.availabilitySchedule);

        const caller = await getCallerOrNull(ctx);
        if (caller && (caller._id === args.physiotherapistId || caller.role === "admin")) {
            return schedule;
        }

        // Everyone else: only the fields needed to show bookable hours.
        return {
            timezone: schedule.timezone,
            defaultSessionDuration: schedule.defaultSessionDuration,
            buffer: schedule.buffer,
            weeklyHours: schedule.weeklyHours,
            dateOverrides: (schedule.dateOverrides ?? []).map((o) => ({
                date: o.date,
                isAvailable: o.isAvailable,
                slots: o.slots,
            })),
        };
    },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Update availability schedule
 */
export const updateAvailabilitySchedule = mutation({
    args: {
        schedule: availabilityScheduleValidator,
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Not authenticated");
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique();

        if (!user || user.role !== "physiotherapist") {
            throw new Error("Only physiotherapists can update availability");
        }

        const physioProfile = await ctx.db
            .query("physiotherapistProfiles")
            .withIndex("by_user_id", (q) => q.eq("userId", user._id))
            .unique();

        if (!physioProfile) {
            throw new Error("Physiotherapist profile not found");
        }

        await ctx.db.patch(physioProfile._id, {
            availabilitySchedule: args.schedule,
        });

        return { success: true };
    },
});

/**
 * Add or update a date override
 */
export const setDateOverride = mutation({
    args: {
        override: dateOverrideValidator,
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Not authenticated");
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique();

        if (!user || user.role !== "physiotherapist") {
            throw new Error("Only physiotherapists can set date overrides");
        }

        const physioProfile = await ctx.db
            .query("physiotherapistProfiles")
            .withIndex("by_user_id", (q) => q.eq("userId", user._id))
            .unique();

        if (!physioProfile) {
            throw new Error("Physiotherapist profile not found");
        }

        // Onboarding stored hours by day name; convert first or the override is lost on read
        const currentSchedule: AvailabilitySchedule = normalizeAvailabilitySchedule(
            physioProfile.availabilitySchedule
        );

        // Remove existing override for this date if any
        const existingOverrides = currentSchedule.dateOverrides || [];
        const filteredOverrides = existingOverrides.filter(
            (o) => o.date !== args.override.date
        );

        // Add the new override
        const updatedOverrides = [...filteredOverrides, args.override];

        await ctx.db.patch(physioProfile._id, {
            availabilitySchedule: {
                ...currentSchedule,
                dateOverrides: updatedOverrides,
            },
        });

        return { success: true };
    },
});

/**
 * Remove a date override
 */
export const removeDateOverride = mutation({
    args: {
        date: v.string(), // "YYYY-MM-DD"
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Not authenticated");
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique();

        if (!user || user.role !== "physiotherapist") {
            throw new Error("Only physiotherapists can remove date overrides");
        }

        const physioProfile = await ctx.db
            .query("physiotherapistProfiles")
            .withIndex("by_user_id", (q) => q.eq("userId", user._id))
            .unique();

        if (!physioProfile) {
            throw new Error("Physiotherapist profile not found");
        }

        // Onboarding stored hours by day name; convert first or the override is lost on read
        const currentSchedule: AvailabilitySchedule = normalizeAvailabilitySchedule(
            physioProfile.availabilitySchedule
        );

        const updatedOverrides = (currentSchedule.dateOverrides || []).filter(
            (o) => o.date !== args.date
        );

        await ctx.db.patch(physioProfile._id, {
            availabilitySchedule: {
                ...currentSchedule,
                dateOverrides: updatedOverrides,
            },
        });

        return { success: true };
    },
});

// ============================================================================
// INTERNAL QUERIES (for use by actions)
// ============================================================================

import { internalQuery } from "../_generated/server";

/**
 * Internal query for getting available slots (used by actions)
 */
export const getAvailableSlotsInternal = internalQuery({
    args: {
        physiotherapistId: v.id("users"),
        startDate: v.number(),
        endDate: v.number(),
        sessionDuration: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<AvailableSlot[]> => {
        // 1. Get physiotherapist profile and availability
        const physioProfile = await ctx.db
            .query("physiotherapistProfiles")
            .withIndex("by_user_id", (q) => q.eq("userId", args.physiotherapistId))
            .unique();

        if (!physioProfile) {
            return [];
        }

        // Keep this internal path consistent with the public availability
        // query. Test and legacy providers can still have the onboarding
        // operating-hours shape, which must be normalized before use.
        const availability = normalizeAvailabilitySchedule(physioProfile.availabilitySchedule);

        const sessionDuration = args.sessionDuration || availability.defaultSessionDuration;

        // 2. Get existing Rehabify appointments in the date range
        const appointments = await ctx.db
            .query("appointments")
            .withIndex("by_physiotherapist_id_and_time", (q) =>
                q.eq("physiotherapistId", args.physiotherapistId)
            )
            .filter((q) =>
                q.and(
                    q.gte(q.field("startTime"), args.startDate),
                    q.lte(q.field("startTime"), args.endDate),
                    q.neq(q.field("status"), "cancelled_by_patient"),
                    q.neq(q.field("status"), "cancelled_by_therapist")
                )
            )
            .collect();

        // Convert appointments to busy blocks
        const rehabifyBusy: BusyBlock[] = appointments.map((apt) => ({
            start: apt.startTime,
            end: apt.endTime,
            source: "rehabify" as const,
            eventId: apt._id,
        }));

        const activeHolds = await ctx.db
            .query("marketplaceBookings")
            .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", args.physiotherapistId))
            .collect();
        const holdBusy: BusyBlock[] = activeHolds
            .filter((booking) =>
                // Unpaid holds, and paid requests waiting for the physio's answer
                isLiveHold(booking, Date.now()) &&
                (booking.sessionDate ?? 0) < args.endDate &&
                (booking.sessionDate ?? 0) + booking.sessionDuration * 60_000 > args.startDate
            )
            .map((booking) => ({
                start: booking.sessionDate,
                end: booking.sessionDate + booking.sessionDuration * 60_000,
                source: "rehabify" as const,
                eventId: booking._id,
            }));

        // 3. Generate available slots for each day in range
        const allSlots: Array<{ start: number; end: number }> = [];
        let currentDay = args.startDate;
        const oneDayMs = 24 * 60 * 60 * 1000;

        while (currentDay <= args.endDate) {
            const dateStr = getDateString(currentDay, availability.timezone);
            const dayOfWeek = getDayOfWeek(currentDay, availability.timezone);

            // Check for date override first
            const override = availability.dateOverrides?.find((o) => o.date === dateStr);

            let daySlots: TimeSlot[];

            if (override) {
                // Use override settings
                if (!override.isAvailable) {
                    currentDay += oneDayMs;
                    continue;
                }
                daySlots = override.slots || [];
            } else {
                // Use weekly schedule
                const daySchedule = availability.weeklyHours.find(
                    (d) => d.dayOfWeek === dayOfWeek
                );
                if (!daySchedule || !daySchedule.isAvailable) {
                    currentDay += oneDayMs;
                    continue;
                }
                daySlots = daySchedule.slots;
            }

            // Convert time slots to timestamps
            for (const slot of daySlots) {
                const { start, end } = slotToTimestamps(dateStr, slot, availability.timezone);
                if (end > Date.now()) {
                    allSlots.push({ start, end });
                }
            }

            currentDay += oneDayMs;
        }

        // 4. Subtract busy blocks
        const afterBusy = subtractBusyBlocks(allSlots, [...rehabifyBusy, ...holdBusy]);

        // 5. Apply buffers
        const afterBuffers = applyBuffers(
            afterBusy,
            availability.buffer.beforeEvent,
            availability.buffer.afterEvent
        );

        // 6. Split into bookable slots
        return splitIntoBookableSlots(afterBuffers, sessionDuration);
    },
});

// ============================================================================
// ACTIONS (for Google Calendar integration)
// ============================================================================

/**
 * Get available slots with Google Calendar busy time
 * This is an action because it needs to call external APIs
 */
export const getAvailableSlotsWithGoogleCalendar = internalAction({
    args: {
        physiotherapistId: v.id("users"),
        startDate: v.number(),
        endDate: v.number(),
        sessionDuration: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<AvailableSlot[]> => {
        // First get the base available slots
        const baseSlots = await ctx.runQuery(
            internal.calendar.availability.getAvailableSlotsInternal,
            {
                physiotherapistId: args.physiotherapistId,
                startDate: args.startDate,
                endDate: args.endDate,
                sessionDuration: args.sessionDuration,
            }
        );

        // Check if user has Google Calendar connected
        const credentials = await ctx.runQuery(
            internal.calendar.oauth.getCredentialsInternal,
            { userId: args.physiotherapistId }
        );

        if (!credentials) {
            return baseSlots;
        }

        // Fetch Google Calendar busy times
        try {
            const googleBusy: Array<{ start: number; end: number }> = await ctx.runAction(
                internal.calendar.nodeActions.getFreeBusy,
                {
                    userId: args.physiotherapistId,
                    timeMin: args.startDate,
                    timeMax: args.endDate,
                }
            );

            // Convert to busy blocks
            const googleBusyBlocks: BusyBlock[] = googleBusy.map((block) => ({
                start: block.start,
                end: block.end,
                source: "google_calendar" as const,
            }));

            // Filter out slots that conflict with Google Calendar
            const filteredSlots = baseSlots.filter((slot: AvailableSlot) => {
                return !googleBusyBlocks.some(
                    (busy) => busy.start < slot.end && busy.end > slot.start
                );
            });

            return filteredSlots;
        } catch (error) {
            console.error("Failed to fetch Google Calendar busy times:", error);
            return baseSlots;
        }
    },
});

// ============================================================================
// GOOGLE CALENDAR BUSY TIMES (cache)
// ============================================================================

/** How far ahead busy times are fetched, and how long a fetch stays fresh. */
const GOOGLE_BUSY_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
const GOOGLE_BUSY_FRESH_MS = 5 * 60 * 1000;

/** The physio's cached Google Calendar busy times (empty when not connected or never fetched). */
export async function getCachedGoogleBusy(
    ctx: QueryCtx,
    physiotherapistId: Id<"users">
): Promise<Array<{ start: number; end: number }>> {
    const cache = await ctx.db
        .query("googleBusyCache")
        .withIndex("by_user_id", (q) => q.eq("userId", physiotherapistId))
        .first();
    return cache?.blocks ?? [];
}

export const saveGoogleBusy = internalMutation({
    args: {
        userId: v.id("users"),
        rangeStart: v.number(),
        rangeEnd: v.number(),
        blocks: v.array(v.object({ start: v.number(), end: v.number() })),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("googleBusyCache")
            .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
            .first();
        const row = { ...args, blocks: args.blocks.slice(0, 2000), fetchedAt: Date.now() };
        if (existing) await ctx.db.patch(existing._id, row);
        else await ctx.db.insert("googleBusyCache", row);
    },
});

export const getGoogleBusyCacheInfo = internalQuery({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const cache = await ctx.db
            .query("googleBusyCache")
            .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
            .first();
        return cache ? { fetchedAt: cache.fetchedAt } : null;
    },
});

/**
 * Refresh a physio's Google Calendar busy times. Booking pages call this when they open; the
 * slot list (getAvailableSlots) then updates on its own. Public because guests book too: it
 * returns nothing, and fetches at most once every five minutes per physio.
 */
export const refreshGoogleBusy = action({
    args: { physiotherapistId: v.id("users") },
    handler: async (ctx, args): Promise<null> => {
        const info = await ctx.runQuery(internal.calendar.availability.getGoogleBusyCacheInfo, {
            userId: args.physiotherapistId,
        });
        if (info && Date.now() - info.fetchedAt < GOOGLE_BUSY_FRESH_MS) return null;

        const credentials = await ctx.runQuery(internal.calendar.oauth.getCredentialsInternal, {
            userId: args.physiotherapistId,
        });
        if (!credentials) return null;

        const rangeStart = Date.now();
        const rangeEnd = rangeStart + GOOGLE_BUSY_WINDOW_MS;
        const blocks: Array<{ start: number; end: number }> = await ctx.runAction(
            internal.calendar.nodeActions.getFreeBusy,
            { userId: args.physiotherapistId, timeMin: rangeStart, timeMax: rangeEnd }
        );
        await ctx.runMutation(internal.calendar.availability.saveGoogleBusy, {
            userId: args.physiotherapistId,
            rangeStart,
            rangeEnd,
            blocks: blocks.filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start),
        });
        return null;
    },
});
