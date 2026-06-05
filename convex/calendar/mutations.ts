// @ts-nocheck
/**
 * Internal mutations for calendar operations
 * These are non-node mutations that can be called from node actions
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * Internal mutation to save Google Meet link to appointment
 * Called from createEvent action after calendar event is created
 */
export const updateAppointmentMeetLink = internalMutation({
    args: {
        appointmentId: v.id("appointments"),
        googleMeetLink: v.string(),
        googleCalendarEventId: v.string(),
        googleCalendarLink: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        console.log("[MEET LINK] Saving Google Meet link to appointment:", args.appointmentId);
        console.log("[MEET LINK] Meet Link:", args.googleMeetLink);

        await ctx.db.patch(args.appointmentId, {
            googleMeetLink: args.googleMeetLink,
            googleCalendarEventId: args.googleCalendarEventId,
            googleCalendarLink: args.googleCalendarLink,
            isOnline: true,
        } as any);

        console.log("[MEET LINK] Successfully saved Google Meet link to appointment");
        return { success: true };
    },
});
