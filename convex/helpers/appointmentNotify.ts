/**
 * Notifications, emails and Google Calendar follow-ups for appointment changes, shared by the
 * physio/patient flows (appointments.ts) and the clinic portal (clinicTools.ts).
 */
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { appLink } from "./appUrl";

type Person = Pick<Doc<"users">, "firstName" | "lastName"> | null | undefined;

export function personName(person: Person, fallback: string): string {
  return [person?.firstName, person?.lastName].filter(Boolean).join(" ") || fallback;
}

/** Where a user manages their appointments. */
export function appointmentsPathFor(user: Pick<Doc<"users">, "role"> | null | undefined): string {
  if (user?.role === "patient") return "/dashboard/patient/appointments";
  if (user?.role === "physiotherapist") return "/dashboard/physiotherapist/appointments";
  return "/dashboard/clinic/appointments";
}

/** "by video call" / "at <address>" / "in person", for messages about a visit. */
export function visitPlace(apt: Pick<Doc<"appointments">, "appointmentType" | "isOnline" | "location">): string {
  if (apt.appointmentType === "telehealth" || apt.isOnline) return "by video call";
  return apt.location ? `at ${apt.location}` : "in person";
}

/** In-app notification about an appointment. */
export async function notifyAboutAppointment(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    type: string;
    title: string;
    body: string;
    appointmentId: Id<"appointments">;
    actionUrl: string;
  }
) {
  await ctx.db.insert("notifications", {
    userId: args.userId,
    type: args.type,
    priority: "medium",
    status: "pending",
    payload: {
      title: args.title,
      body: args.body,
      data: { entityId: args.appointmentId, entityType: "appointment", actionUrl: args.actionUrl },
    },
    createdAt: Date.now(),
  });
}

/** A plain branded email with a button back to the app (scheduled; never fails the mutation). */
export async function emailAboutAppointment(
  ctx: MutationCtx,
  args: {
    to: string | undefined;
    audience: "patient" | "provider";
    subject: string;
    greetingName?: string;
    heading: string;
    paragraphs: string[];
    buttonLabel: string;
    buttonPath: string;
  }
) {
  if (!args.to) return;
  try {
    await ctx.scheduler.runAfter(0, internal.actions.emails.sendPatientCareEmail.sendPatientCareEmail, {
      to: args.to,
      subject: args.subject,
      greetingName: args.greetingName,
      heading: args.heading,
      paragraphs: args.paragraphs,
      buttonLabel: args.buttonLabel,
      buttonUrl: appLink(args.buttonPath),
      footnote:
        args.audience === "provider"
          ? "You're receiving this because you provide care on Rehabify Health. Questions? Write to support@physioaroundme.com."
          : undefined,
    });
  } catch (err) {
    console.error("Failed to schedule appointment email:", err);
  }
}

/**
 * Moves or removes the visit's Google Calendar event, when it has one. Best effort: the
 * calendar call runs later and a failure there never undoes the appointment change.
 * A moved visit that was booked and paid on Rehabify also moves its booking, so the booking
 * pages, payouts and reminders show the new time.
 */
export async function syncGoogleCalendarEvent(
  ctx: MutationCtx,
  appointmentId: Id<"appointments">,
  change: { startTime: number; endTime: number } | "delete"
) {
  if (change !== "delete") {
    const bookings = await ctx.db
      .query("marketplaceBookings")
      .withIndex("by_appointment", (q) => q.eq("appointmentId", appointmentId))
      .collect();
    for (const booking of bookings) {
      await ctx.db.patch(booking._id, {
        sessionDate: change.startTime,
        sessionDuration: Math.max(1, Math.round((change.endTime - change.startTime) / 60_000)),
      });
    }
  }

  const events = await ctx.db
    .query("calendarEvents")
    .withIndex("by_appointment_id", (q) => q.eq("appointmentId", appointmentId))
    .collect();
  for (const event of events) {
    try {
      if (change === "delete") {
        await ctx.scheduler.runAfter(0, internal.calendar.nodeActions.deleteEvent, {
          userId: event.userId,
          eventId: event.googleEventId,
          calendarId: event.calendarId,
        });
        await ctx.db.delete(event._id);
      } else {
        await ctx.scheduler.runAfter(0, internal.calendar.nodeActions.updateEvent, {
          userId: event.userId,
          eventId: event.googleEventId,
          calendarId: event.calendarId,
          startTime: change.startTime,
          endTime: change.endTime,
        });
        await ctx.db.patch(event._id, { updatedAt: Date.now() });
      }
    } catch (err) {
      console.error("Failed to schedule Google Calendar update for appointment", appointmentId, err);
    }
  }
}

/** Patch that clears a pending proposal of another time. */
export const CLEAR_PROPOSAL = {
  proposedStartTime: undefined,
  proposedEndTime: undefined,
  proposedBy: undefined,
  proposedAt: undefined,
  proposalNote: undefined,
} as const;
