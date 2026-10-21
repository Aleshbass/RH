// @ts-nocheck
import { v } from "convex/values";
import { action, mutation, internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { api } from "../_generated/api";

/**
 * Async wrapper for creating calendar events
 * This is called via scheduler from mutations
 */
export const createCalendarEventAsync = internalAction({
    args: {
        userId: v.id("users"),
        appointmentId: v.id("appointments"),
        summary: v.string(),
        description: v.optional(v.string()),
        startTime: v.number(),
        endTime: v.number(),
        attendees: v.optional(v.array(v.object({
            email: v.string(),
            displayName: v.optional(v.string()),
        }))),
        createMeetLink: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        try {

            // Call the main calendar event creation action
            const result = await ctx.runAction(internal.calendar.service.createCalendarEventInternal, args);

            if (result.success && result.meetLink) {
                // Update the appointment with the Google Meet link
                await ctx.runMutation(internal.calendar.service.updateAppointmentWithMeetLink, {
                    appointmentId: args.appointmentId,
                    googleMeetLink: result.meetLink,
                    googleCalendarLink: result.htmlLink,
                });


                // Send a follow-up email with the Google Meet link
                if (args.attendees && args.attendees.length > 0) {
                    const attendee = args.attendees[0];
                    await ctx.runAction(internal.calendar.async.sendMeetLinkEmail, {
                        to: attendee.email,
                        displayName: attendee.displayName || attendee.email,
                        meetingLink: result.meetLink,
                        calendarLink: result.htmlLink,
                        startTime: args.startTime,
                    });
                }
            }

            return result;
        } catch (error) {
            console.error("[CREATE CALENDAR ASYNC] Failed to create calendar event:", error);
            // Don't throw - we don't want to fail the appointment
            return { success: false, error: String(error) };
        }
    },
});

// Internal mutation to update appointment with Meet link
export const updateAppointmentWithMeetLink = internalMutation({
    args: {
        appointmentId: v.id("appointments"),
        googleMeetLink: v.string(),
        googleCalendarLink: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const updateData: any = {
            googleMeetLink: args.googleMeetLink,
        };

        if (args.googleCalendarLink) {
            updateData.googleCalendarLink = args.googleCalendarLink;
        }

        await ctx.db.patch(args.appointmentId, updateData);
    },
});

// Send email with Google Meet link
export const sendMeetLinkEmail = internalAction({
    args: {
        to: v.string(),
        displayName: v.string(),
        meetingLink: v.string(),
        calendarLink: v.optional(v.string()),
        startTime: v.number(),
    },
    handler: async (ctx, args) => {

        try {
            // Send email with Google Meet link using the email service
            await ctx.runAction(internal.actions.emails.sendGoogleMeetLinkEmail.sendGoogleMeetLinkEmail, {
                to: args.to,
                displayName: args.displayName,
                meetingLink: args.meetingLink,
                calendarLink: args.calendarLink,
                appointmentDate: args.startTime,
            });

            return { success: true };
        } catch (error) {
            console.error("[SEND MEET LINK] Failed to send email:", error);
            return { success: false, error: String(error) };
        }
    },
});

