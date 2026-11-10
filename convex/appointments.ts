import { startVisitPaymentCheckIn } from "./helpers/visitCheckIns";
import { insertNotification } from "./helpers/pushNotify";
import { ConvexError, v } from "convex/values";
import { mutation, query, internalQuery, type MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { onPatientSessionCompleted } from "./helpers/partnerAttribution";
import { isRehabifyCare, mustPayToConfirm, needsInvoiceOnAccept, releaseCancelledVisit, settleNoShow, settlePatientCancellation, useFreeReschedule } from "./rehabifyFollowUps";
import { lagosDate, lagosDateTime, lagosShortDate, lagosTime, lagosTimeRange, startOfZonedDay, zonedDateTimeToUtc } from "./helpers/lagosTime";
import { awaitingConfirmationFrom, isOpenAppointment } from "./helpers/appointmentStatus";
import { isGoogleBusy } from "./helpers/slotHolds";
import { requireClinicCareAccess } from "./helpers/careAccess";
import {
  CLEAR_PROPOSAL,
  emailAboutAppointment,
  notifyAboutAppointment,
  personName,
  syncGoogleCalendarEvent,
  visitPlace,
} from "./helpers/appointmentNotify";

const PATIENT_APPOINTMENTS = "/dashboard/patient/appointments";
const PHYSIO_APPOINTMENTS = "/dashboard/physiotherapist/appointments";

/** True when [start, end) overlaps another live visit of this physio (ignoring `exceptId`). */
async function physioHasClash(
  ctx: any,
  physiotherapistId: Id<"users">,
  start: number,
  end: number,
  exceptId?: Id<"appointments">
) {
  const nearby = await ctx.db
    .query("appointments")
    .withIndex("by_physiotherapist_id_and_time", (q: any) =>
      q.eq("physiotherapistId", physiotherapistId).gte("startTime", start - 24 * 60 * 60 * 1000).lt("startTime", end)
    )
    .collect();
  return nearby.some(
    (apt: any) =>
      apt._id !== exceptId &&
      !apt.isRecordOnly &&
      isOpenAppointment(apt.status) &&
      apt.startTime < end &&
      apt.endTime > start
  );
}

/** Schedules a video room for a telehealth visit that has no link yet (Stream, hosted by the physio). */
async function ensureVideoRoom(ctx: any, appointment: any, title: string) {
  const isVideo = appointment.appointmentType === "telehealth" || appointment.isOnline === true;
  const hasLink = appointment.meetingLink || appointment.googleMeetLink || /^https?:\/\//i.test(appointment.manualMeetingLink ?? "");
  if (!isVideo || hasLink || appointment.videoCallId) return;
  await ctx.scheduler.runAfter(0, internal.videoCalls.createAppointmentVideoCall, {
    appointmentId: appointment._id,
    hostId: appointment.physiotherapistId,
    participants: [appointment.patientId, appointment.physiotherapistId],
    title,
  });
}

/**
 * Get authenticated user with role-based validation
 */
async function getAuthenticatedUser(ctx: any, allowedRoles: string[] = ["physiotherapist", "clinic_owner"]) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .unique();

  if (!user) {
    throw new Error("User not found");
  }

  if (!allowedRoles.includes(user.role)) {
    throw new Error(`Access denied. ${allowedRoles.join(" or ")} privileges required.`);
  }

  // Check approval status for physiotherapists only
  if (user.role === "physiotherapist") {
    const approvalStatus = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_user_id", (q: any) => q.eq("userId", user._id))
      .unique();

    if (!approvalStatus || approvalStatus.status !== "approved") {
      throw new Error("Account not approved. Please wait for admin approval.");
    }
  }

  return user;
}

/**
 * Create a new appointment
 */
export const createAppointment = mutation({
  args: {
    patientId: v.id("users"),
    startTime: v.number(),
    endTime: v.number(),
    serviceType: v.string(),
    notesForPatient: v.optional(v.string()),
    notesForTherapist: v.optional(v.string()),
    // Enhanced appointment features
    priority: v.optional(v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("urgent")
    )),
    appointmentType: v.optional(v.union(
      v.literal("in-person"),
      v.literal("telehealth")
    )),
    isPinned: v.optional(v.boolean()),
    colorCode: v.optional(v.string()),
    manualMeetingLink: v.optional(v.string()),
    location: v.optional(v.string()),
    // Repeat visits: start times of the later visits (same length, type and place)
    repeatStartTimes: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    appointmentId: Id<"appointments">;
    message: string;
    googleMeetLink?: string;
    googleCalendarLink?: string;
    /** The first visit was already over, so it was saved as attended */
    past?: boolean;
    booked?: number;
    /** Repeat times skipped because they clash with another visit */
    skipped?: number[];
  }> => {
    const user = await getAuthenticatedUser(ctx);

    // Verify user has access to this patient
    const relationship = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q) =>
        q.eq("patientId", args.patientId).eq("physiotherapistId", user._id)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      // Old data can hold two links to the same physio; .unique() would throw
      .first();

    if (!relationship) {
      throw new Error("Access denied. Patient not assigned to you.");
    }
    // A clinic's patient: the clinic's rules apply (team, suspension, read-only, role)
    if (relationship.clinicId) await requireClinicCareAccess(ctx, user, relationship.clinicId, { area: "appointments" });

    // Rehabify patients pay for each session: their follow-ups go through scheduleRehabifyFollowUp
    if (await isRehabifyCare(ctx, args.patientId, user._id)) {
      throw new ConvexError("This is a Rehabify patient, so sessions are paid. Schedule a Rehabify session and they'll pay to confirm it.");
    }

    // Get physiotherapist profile to get clinic info
    const physiotherapistProfile = await ctx.db.get(user.physiotherapistProfileId!);
    if (!physiotherapistProfile) {
      throw new Error("Physiotherapist profile not found");
    }

    const length = args.endTime - args.startTime;
    if (!(length > 0)) throw new ConvexError("The visit must end after it starts.");
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    // A visit that already happened can be added afterwards (agreed by phone and never entered)
    if (args.startTime < now - 366 * DAY) throw new ConvexError("That date is more than a year ago. Check the date.");
    const repeats = [...new Set(args.repeatStartTimes ?? [])].filter((t) => t > args.startTime).sort((a, b) => a - b);
    if (repeats.length > MAX_REPEAT_VISITS - 1) throw new ConvexError(`You can book up to ${MAX_REPEAT_VISITS} visits at once.`);
    if ((repeats[repeats.length - 1] ?? args.startTime) > now + 366 * DAY) throw new ConvexError("Repeat visits can be booked up to a year ahead.");

    // Visits of this physio's that overlap [start, end) and still stand
    const clashesWith = async (start: number, end: number) =>
      (
        await ctx.db
          .query("appointments")
          .withIndex("by_physiotherapist_id_and_time", (q) =>
            q.eq("physiotherapistId", user._id).gte("startTime", start - DAY).lt("startTime", end)
          )
          .collect()
      ).filter(
        (a) => !a.isRecordOnly && a.status !== "cancelled_by_patient" && a.status !== "cancelled_by_therapist" && a.startTime < end && a.endTime > start
      );

    const conflictingAppointments = await clashesWith(args.startTime, args.endTime);
    if (conflictingAppointments.length > 0) {
      const sorted = conflictingAppointments.sort((a, b) => a.startTime - b.startTime);
      const details = sorted.slice(0, 3).map((a) => `${lagosShortDate(a.startTime)}, ${lagosTimeRange(a.startTime, a.endTime)}`).join("; ");
      throw new ConvexError(`That time overlaps another appointment (${details}). Pick another time.`);
    }

    // "google_meet" is the wizard's platform choice, not a link
    const manualMeetingLink = args.manualMeetingLink === "google_meet" ? undefined : args.manualMeetingLink;
    const repeatGroup = repeats.length > 0 ? `rg_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}` : undefined;

    const insertVisit = (startTime: number) => {
      // Already over: saved as attended, since nobody can confirm a visit in the past
      const past = startTime + length <= now;
      return ctx.db.insert("appointments", {
        patientId: args.patientId,
        physiotherapistId: user._id,
        // The visit belongs to the care relationship's clinic, never the physio's other work
        clinicId: relationship.clinicId,
        startTime,
        endTime: startTime + length,
        serviceType: args.serviceType,
        status: past ? "completed" : "scheduled",
        // The physio set this time, so the patient is the one who confirms it
        requestedBy: "provider",
        notesForPatient: args.notesForPatient,
        notesForTherapist: args.notesForTherapist,
        // Enhanced appointment features
        priority: args.priority || "low",
        appointmentType: args.appointmentType || "in-person",
        isPinned: args.isPinned || false,
        colorCode: args.colorCode || "#3B82F6", // Default blue
        manualMeetingLink,
        location: args.location,
        repeatGroup,
      });
    };

    // Create the appointment(s): later repeats that clash are skipped and reported
    const appointmentId = await insertVisit(args.startTime);
    const upcoming: { id: Id<"appointments">; startTime: number }[] = args.endTime > now ? [{ id: appointmentId, startTime: args.startTime }] : [];
    const skipped: number[] = [];
    for (const startTime of repeats) {
      if ((await clashesWith(startTime, startTime + length)).length > 0) {
        skipped.push(startTime);
        continue;
      }
      const id = await insertVisit(startTime);
      if (startTime + length > now) upcoming.push({ id, startTime });
    }
    const booked = 1 + repeats.length - skipped.length;
    const firstIsPast = args.endTime <= now;

    // A visit that already happened needs no notifications, email or video room
    if (upcoming.length === 0) {
      return {
        success: true,
        appointmentId,
        message: firstIsPast && booked === 1 ? "Saved as an attended visit." : `${booked} visits saved.`,
        past: firstIsPast,
        booked,
        skipped,
      };
    }
    const firstUpcoming = upcoming[0];

    // Create notifications for both patient and therapist
    const patient = await ctx.db.get(args.patientId);
    const patientName = personName(patient, "Patient");
    const physiotherapistName = `${(user as any)?.firstName || ''} ${(user as any)?.lastName || ''}`.trim() || 'Physiotherapist';
    // Compute clinic information for emails (best-effort)
    let clinicName = 'Rehabify Health';
    let clinicAddress = '';
    if ((physiotherapistProfile as any)?.clinicId) {
      const clinic = await ctx.db.get((physiotherapistProfile as any).clinicId);
      if (clinic) {
        clinicName = (clinic as any).name || clinicName;
        clinicAddress = (clinic as any).address || '';
      }
    }
    // Precompute a friendly time range string for emails (Convex runs in UTC; people read Lagos time)
    const appointmentTimeStr = lagosTimeRange(firstUpcoming.startTime, firstUpcoming.startTime + length);
    // Repeat visits: one message for the whole set, not one per visit
    const moreVisits = upcoming.length - 1;

    // Notification for patient
    await insertNotification(ctx, {
      userId: args.patientId,
      type: "appointment_scheduled",
      priority: "medium",
      status: "pending",
      payload: {
        title: moreVisits > 0 ? `${upcoming.length} Appointments Scheduled` : "Appointment Scheduled",
        body:
          moreVisits > 0
            ? `${physiotherapistName} booked ${upcoming.length} visits, starting ${lagosDateTime(firstUpcoming.startTime)}. Please confirm them on your appointments page.`
            : `${physiotherapistName} booked a visit for ${lagosDateTime(firstUpcoming.startTime)}. Please confirm it on your appointments page.`,
        data: {
          entityId: firstUpcoming.id,
          entityType: "appointment",
          actionUrl: "/dashboard/patient/appointments",
        },
      },
      createdAt: Date.now(),
    });

    // Email: confirmation to patient (schedule as action)
    const patientEmail = patient?.email as string | undefined;
    if (patientEmail) {
      await ctx.scheduler.runAfter(0, internal.actions.emails.sendAppointmentScheduledEmail.sendAppointmentScheduledEmail, {
        to: patientEmail,
        patientName,
        physiotherapistName,
        appointmentDate: firstUpcoming.startTime,
        appointmentTime: appointmentTimeStr,
        clinicName,
        clinicAddress,
        calendarLink: "/dashboard/patient/appointments",
        rescheduleLink: "/dashboard/patient/appointments",
      });
    }

    // External calendar sync disabled: no Google Calendar events scheduled

    await insertNotification(ctx, {
      userId: user._id,
      type: "appointment_scheduled",
      priority: "medium",
      status: "pending",
      payload: {
        title: moreVisits > 0 ? "Appointments Created" : "Appointment Created",
        body: moreVisits > 0 ? `${upcoming.length} visits scheduled with ${patientName}` : `Appointment scheduled with ${patientName}`,
        data: {
          entityId: firstUpcoming.id,
          entityType: "appointment",
          actionUrl: "/dashboard/physiotherapist/appointments",
        },
      },
      createdAt: Date.now(),
    });

    // Auto-create video room for telehealth appointments
    if (args.appointmentType === 'telehealth') {
      try {
        // Check physiotherapist's video platform preference
        let preferredPlatform: 'stream' | 'google_meet' = 'stream';
        if (user.physiotherapistProfileId) {
          const physioProfile = await ctx.db.get(user.physiotherapistProfileId);
          if (physioProfile && 'videoPlatformPreference' in physioProfile) {
            preferredPlatform = (physioProfile.videoPlatformPreference as 'stream' | 'google_meet') ?? 'stream';
          }
        }

        // A link typed by the physio is used as is; otherwise the wizard's choice, then their preference
        const wantsGoogleMeet = args.manualMeetingLink === 'google_meet' || (!manualMeetingLink && preferredPlatform === 'google_meet');

        // A room for each upcoming visit (a visit that already happened needs none)
        for (const visit of upcoming) {
          if (!wantsGoogleMeet && !manualMeetingLink) {
            // Stream room via an internal action: scheduled functions have no signed-in user,
            // so the public createVideoCall would refuse. The link is saved on the appointment.
            await ctx.scheduler.runAfter(0, internal.videoCalls.createAppointmentVideoCall, {
              appointmentId: visit.id,
              hostId: user._id,
              participants: [args.patientId, user._id],
              title: `Appointment: ${patientName}`,
            });
          } else if (wantsGoogleMeet) {
            // Schedule Google Meet link generation via Google Calendar API
            await ctx.scheduler.runAfter(0, internal.calendar.service.createCalendarEventAsync, {
              userId: user._id,
              appointmentId: visit.id,
              summary: `${args.serviceType} - ${patientName}`,
              description: args.notesForTherapist || `Telehealth ${args.serviceType} Appointment`,
              startTime: visit.startTime,
              endTime: visit.startTime + length,
              attendees: patient?.email ? [{ email: patient.email, displayName: patientName }] : [],
              createMeetLink: true,
            });
          }
        }
      } catch (error) {
        console.error('Failed to create video call for appointment:', error);
        // Don't fail appointment creation if video call fails
      }
    }

    return {
      success: true,
      appointmentId,
      message: booked > 1 ? `${booked} appointments created.` : "Appointment created successfully.",
      past: firstIsPast,
      booked,
      skipped,
    };
  },
});

/** Most visits one booking can create (repeats included). */
const MAX_REPEAT_VISITS = 40;

/**
 * Get appointments for physiotherapist
 */
export const getMyAppointments = query({
  args: {
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    status: v.optional(v.union(
      v.literal("scheduled"),
      v.literal("confirmed"),
      v.literal("completed"),
      v.literal("cancelled_by_patient"),
      v.literal("cancelled_by_therapist"),
      v.literal("no_show")
    )),
    limit: v.optional(v.number()),
    physiotherapistId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const limit = args.limit ?? 100;

    if (user.role === "physiotherapist") {
      // For physiotherapists, get their own appointments
      // The date range is part of the index lookup, so a day or week view reads only that range
      // instead of the physio's whole appointment history
      let appointmentsQuery = ctx.db
        .query("appointments")
        .withIndex("by_physiotherapist_id_and_time", (q) => {
          const own = q.eq("physiotherapistId", user._id);
          if (args.startDate !== undefined && args.endDate !== undefined) {
            return own.gte("startTime", args.startDate).lte("startTime", args.endDate);
          }
          if (args.startDate !== undefined) return own.gte("startTime", args.startDate);
          if (args.endDate !== undefined) return own.lte("startTime", args.endDate);
          return own;
        });

      // Apply status filter if provided
      if (args.status) {
        appointmentsQuery = appointmentsQuery.filter((q) =>
          q.eq(q.field("status"), args.status!)
        );
      }

      // Record-only entries just anchor clinical notes; they aren't visits
      appointmentsQuery = appointmentsQuery.filter((q) => q.neq(q.field("isRecordOnly"), true));

      const appointments = await appointmentsQuery.order("desc").take(limit);

      // Get patient details for each appointment
      const appointmentsWithPatients = await Promise.all(
        appointments.map(async (appointment) => {
          const patient = await ctx.db.get(appointment.patientId);
          return {
            ...appointment,
            // Rehabify patients pay per session, so their requests are accepted with an invoice
            needsInvoice: await needsInvoiceOnAccept(ctx, appointment),
            // Paid through Rehabify Care: cancelling sends the patient another physio or a refund
            paidThroughRehabify: await ctx.db
              .query("marketplaceBookings")
              .withIndex("by_appointment", (q) => q.eq("appointmentId", appointment._id))
              .first()
              .then((b) => Boolean(b && b.paymentStatus === "completed" && b.pricingModel)),
            patient: patient ? {
              _id: patient._id,
              firstName: patient.firstName,
              lastName: patient.lastName,
              email: patient.email,
              imageUrl: patient.imageUrl,
              phoneNumber: patient.phoneNumber,
            } : null,
          };
        })
      );

      return appointmentsWithPatients;
    } else if (user.role === "clinic_owner") {
      // For clinic owners, get all appointments for their clinic's physiotherapists
      const clinicPhysiotherapists = await ctx.db
        .query("physiotherapistProfiles")
        .withIndex("by_clinic_id", (q) => q.eq("clinicId", user.clinicId!))
        .collect();

      const physiotherapistIds = clinicPhysiotherapists
        .map(profile => profile.userId);

      // Get appointments for all clinic physiotherapists
      const allAppointments = await Promise.all(
        physiotherapistIds.map(physioId => {
          // If specific physiotherapist requested, skip others
          if (args.physiotherapistId && args.physiotherapistId !== physioId) {
            return [];
          }

          return ctx.db
            .query("appointments")
            .withIndex("by_physiotherapist_id_and_time", (q) =>
              q.eq("physiotherapistId", physioId)
            )
            .collect();
        })
      );

      // Flatten and sort appointments
      const flatAppointments = allAppointments.flat()
        .sort((a, b) => b.startTime - a.startTime)
        .slice(0, limit);

      // Apply filters and return early for clinic owners
      let filteredAppointments = flatAppointments;

      if (args.startDate) {
        filteredAppointments = filteredAppointments.filter(apt => apt.startTime >= args.startDate!);
      }

      if (args.endDate) {
        filteredAppointments = filteredAppointments.filter(apt => apt.startTime <= args.endDate!);
      }

      if (args.status) {
        filteredAppointments = filteredAppointments.filter(apt => apt.status === args.status);
      }

      // Get patient details for each appointment
      const appointmentsWithPatients = await Promise.all(
        filteredAppointments.map(async (appointment) => {
          const patient = await ctx.db.get(appointment.patientId);
          return {
            ...appointment,
            needsInvoice: false, // clinic visits are priced by the clinic
            patient: patient ? {
              _id: patient._id,
              firstName: patient.firstName,
              lastName: patient.lastName,
              email: patient.email,
              imageUrl: patient.imageUrl,
              phoneNumber: patient.phoneNumber,
            } : null,
          };
        })
      );

      return appointmentsWithPatients;
    } else {
      throw new Error("Access denied. Physiotherapist or clinic owner privileges required.");
    }
  },
});

/**
 * Update appointment status
 */
export const updateAppointmentStatus = mutation({
  args: {
    appointmentId: v.id("appointments"),
    status: v.union(
      v.literal("confirmed"),
      v.literal("completed"),
      v.literal("cancelled_by_therapist"),
      v.literal("no_show")
    ),
    cancellationReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, ["physiotherapist", "clinic_owner"]);

    // Get the appointment
    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) {
      throw new Error("Appointment not found");
    }

    // Verify physiotherapist owns this appointment
    if (appointment.physiotherapistId !== user._id) {
      throw new Error("Access denied. Appointment not assigned to you.");
    }

    // Only a live visit can change; a finished or cancelled one stays as it is
    // (a no-show may still be corrected to completed).
    const correctingNoShow = appointment.status === "no_show" && args.status === "completed";
    if (!isOpenAppointment(appointment.status) && !correctingNoShow) {
      throw new ConvexError("This visit is already finished or cancelled, so it can't be changed.");
    }
    if (args.status === "confirmed" && appointment.status !== "scheduled") {
      throw new ConvexError("This visit is already confirmed.");
    }
    if (args.status === "confirmed" && appointment.endTime < Date.now()) {
      throw new ConvexError("This visit's time has passed. Propose another time instead.");
    }
    // A Rehabify patient's request is confirmed by paying: the physio accepts it with an invoice
    if (args.status === "confirmed" && (await needsInvoiceOnAccept(ctx, appointment))) {
      throw new ConvexError("This is a paid Rehabify visit. Use Accept & send invoice so the patient can pay to confirm it.");
    }
    // Any other unpaid Rehabify Care visit can't be confirmed or closed: the patient pays Rehabify first
    // (otherwise it could be held and paid for outside Rehabify)
    if (args.status !== "cancelled_by_therapist" && (await mustPayToConfirm(ctx, appointment))) {
      throw new ConvexError("This Rehabify patient hasn't paid for this visit. Schedule it as a Rehabify session so they pay to confirm it, or cancel it.");
    }
    // Completing (or marking a no-show) only once the visit has started: completion releases the payout
    if ((args.status === "completed" || args.status === "no_show") && appointment.startTime > Date.now()) {
      throw new ConvexError("This visit hasn't started yet, so it can't be marked as done.");
    }

    // Update the appointment
    const updateData: any = { status: args.status };
    if (args.cancellationReason) {
      updateData.cancellationReason = args.cancellationReason.trim().slice(0, 500);
    }
    // Confirming or cancelling settles any time the physio had offered instead
    if (args.status === "confirmed" || args.status === "cancelled_by_therapist") {
      Object.assign(updateData, CLEAR_PROPOSAL);
    }

    await ctx.db.patch(args.appointmentId, updateData);

    if (args.status === "cancelled_by_therapist") {
      await syncGoogleCalendarEvent(ctx, args.appointmentId, "delete");
      // Paid through Rehabify: the patient picks another physio or a full refund; no payout
      await releaseCancelledVisit(ctx, appointment);
    }
    // The patient didn't come: no refund, and the physio is paid in full (Payment Policy 4.3)
    if (args.status === "no_show") {
      await settleNoShow(ctx, appointment);
    }

    // A completed session moves the patient's booked partner referral into treatment
    // (fires referral.in_treatment to the partner).
    if (args.status === "completed") {
      await onPatientSessionCompleted(ctx, appointment.patientId);
      // A Rehabify patient is asked privately whether they paid the provider directly
      await startVisitPaymentCheckIn(ctx, appointment);
    }

    // Create notification for patient
    const patient = await ctx.db.get(appointment.patientId);
    const patientName = personName(patient, "Patient");

    let notificationTitle = "";
    let notificationMessage = "";

    const physioName = personName(user, "Your physiotherapist");
    const when = lagosDateTime(appointment.startTime);

    switch (args.status) {
      case "confirmed":
        notificationTitle = "Appointment Confirmed";
        notificationMessage = `${physioName} confirmed your visit on ${when}.`;
        break;
      case "completed":
        notificationTitle = "Appointment Completed";
        notificationMessage = "Your appointment has been completed";
        break;
      case "cancelled_by_therapist":
        notificationTitle = appointment.status === "scheduled" ? "Appointment Request Declined" : "Appointment Cancelled";
        notificationMessage = args.cancellationReason
          ? `${physioName} can't see you on ${when}: ${args.cancellationReason}`
          : `${physioName} can't see you on ${when}.`;
        break;
      case "no_show":
        notificationTitle = "Missed Appointment";
        notificationMessage = "You missed your scheduled appointment";
        break;
    }

    const notificationTypes = {
      confirmed: "appointment_confirmed",
      completed: "appointment_completed",
      cancelled_by_therapist: "appointment_cancelled",
      no_show: "appointment_no_show",
    } as const;

    // Confirmed telehealth visit without a link yet (e.g. no Google Calendar): make a Stream room
    if (args.status === "confirmed") {
      await ensureVideoRoom(ctx, appointment, `Appointment: ${patientName}`);
      await emailAboutAppointment(ctx, {
        to: patient?.email,
        audience: "patient",
        subject: `Your visit with ${physioName} is confirmed`,
        greetingName: patient?.firstName,
        heading: "Your visit is confirmed",
        paragraphs: [
          `${physioName} confirmed your ${appointment.serviceType} on ${lagosDate(appointment.startTime)}, ${lagosTimeRange(appointment.startTime, appointment.endTime)} (Lagos time), ${visitPlace(appointment)}.`,
          appointment.appointmentType === "telehealth" || appointment.isOnline
            ? "Your video link is on your appointments page."
            : "If you need to change or cancel, you can do it from your appointments page.",
        ],
        buttonLabel: "View my appointments",
        buttonPath: PATIENT_APPOINTMENTS,
      });
    }

    await insertNotification(ctx, {
      userId: appointment.patientId,
      type: notificationTypes[args.status],
      priority: "medium",
      status: "pending",
      payload: {
        title: notificationTitle,
        body: notificationMessage,
        data: {
          entityId: args.appointmentId,
          entityType: "appointment",
          actionUrl: "/dashboard/patient/appointments",
        },
      },
      createdAt: Date.now(),
    });

    // If therapist cancelled, send email to patient
    if (args.status === "cancelled_by_therapist" && patient?.email) {
      try {
        // Determine names and timing for email content
        const physiotherapist = appointment.physiotherapistId
          ? await ctx.db.get(appointment.physiotherapistId)
          : null;
        const physiotherapistName = personName(physiotherapist, "your physiotherapist");
        const patientNameForEmail = personName(patient, "Your patient");
        const appointmentTimeStr = lagosTimeRange(appointment.startTime, appointment.endTime);

        await ctx.scheduler.runAfter(0, internal.actions.emails.sendAppointmentCanceledPatientEmail.sendAppointmentCanceledPatientEmail, {
          to: patient.email as string,
          patientName: patientNameForEmail,
          physiotherapistName,
          appointmentDate: appointment.startTime,
          appointmentTime: appointmentTimeStr,
          cancellationReason: args.cancellationReason,
          rescheduleLink: "/dashboard/patient/appointments",
          // A pending request that the physio turned down reads as declined, not cancelled
          subjectOverride: appointment.status === "scheduled" && awaitingConfirmationFrom(appointment) === "provider"
            ? `${physiotherapistName} can't take your appointment request`
            : undefined,
        });
      } catch (err) {
        console.error("Failed to schedule patient cancellation email (provider-initiated):", err);
      }
    }

    // AUTOMATED PAYOUT GENERATION
    // If appointment is marked as completed, check for paid invoice and generate payout
    if (args.status === "completed") {
      // Rehabify-priced bookings carry their own invoice; others link the appointment from
      // the invoice's relatedAppointmentIds.
      const booking = await ctx.db
        .query("marketplaceBookings")
        .withIndex("by_appointment", (q) => q.eq("appointmentId", args.appointmentId))
        .first();
      const bookingInvoice = booking?.invoiceId ? await ctx.db.get(booking.invoiceId) : null;
      const invoice =
        bookingInvoice?.status === "paid"
          ? bookingInvoice
          : await ctx.db
              .query("invoices")
              .withIndex("by_patient_id", (q) => q.eq("patientId", appointment.patientId))
              .filter((q) => q.eq(q.field("status"), "paid"))
              .collect()
              .then((invoices) =>
                invoices.find((inv) => inv.relatedAppointmentIds?.includes(args.appointmentId))
              );

      // Only money Rehabify holds is paid out: marketplace bookings, Paystack payments that weren't
      // split straight to the provider, and MediLoan. Cash or transfers the provider took directly
      // (no payoutRoute) are already theirs. A clinic's invoice is the clinic's money, never the
      // individual clinician's: what Rehabify held for it is transferred to the clinic (admin Finance).
      if (invoice && invoice.payoutRoute === "held_by_platform" && !invoice.clinicId) {
        // Check if payout already exists for this invoice to prevent duplicates
        const existingPayout = await ctx.db
          .query("payouts")
          .withIndex("by_payout_invoice_id", (q) => q.eq("invoiceId", invoice._id))
          .first();

        if (!existingPayout) {
          // The physio's share: the booking's fixed payout (plus travel share) under standard
          // pricing, else the invoice's share. Rehabify's share stays with the platform.
          const physiotherapistEarning =
            booking?.pricingModel && booking.invoiceId === invoice._id
              ? booking.physiotherapistEarnings
              : invoice.feeBreakdown?.physiotherapistEarnings || (invoice.physiotherapistShare || 0);

          if (physiotherapistEarning > 0 && appointment.physiotherapistId) {
            const payment = await ctx.db
              .query("payments")
              .withIndex("by_invoice_id", (q) => q.eq("invoiceId", invoice._id))
              .filter((q) => q.eq(q.field("status"), "completed"))
              .first();
            await ctx.db.insert("payouts", {
              invoiceId: invoice._id,
              ...(payment ? { paymentId: payment._id } : {}),
              amount: physiotherapistEarning,
              status: "pending",
              type: "physiotherapist_earning",
              userId: appointment.physiotherapistId,
              // Links the payout to the visit: it waits for the session note (helpers/payoutStage.ts)
              reason: "session",
              appointmentId: args.appointmentId,
              ...(booking ? { bookingId: booking._id } : {}),
              sessionAt: appointment.startTime,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
          }
        }
      }

      // ── Decrement sessionsRemaining on linked package booking ──────────
      // Find the most recent confirmed package booking for this patient+physio pair
      const packageBooking = appointment.physiotherapistId
        ? await ctx.db
            .query("marketplaceBookings")
            .withIndex("by_patient", (q) => q.eq("patientId", appointment.patientId))
            .filter((q) =>
              q.and(
                q.eq(q.field("physiotherapistId"), appointment.physiotherapistId),
                q.eq(q.field("sessionType"), "package"),
                q.eq(q.field("bookingStatus"), "confirmed")
              )
            )
            .order("desc")
            .first()
        : null;

      if (packageBooking && (packageBooking.sessionsRemaining ?? 0) > 0) {
        await ctx.db.patch(packageBooking._id, {
          sessionsRemaining: Math.max(0, (packageBooking.sessionsRemaining ?? 1) - 1),
          updatedAt: Date.now(),
        } as any);
      }
    }

    return {
      success: true,
      message: `Appointment ${args.status.replace('_', ' ')}`,
    };
  },
});

/**
 * Reschedule an appointment
 */
export const rescheduleAppointment = mutation({
  args: {
    appointmentId: v.id("appointments"),
    newStartTime: v.number(),
    newEndTime: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, ["physiotherapist", "clinic_owner"]);

    // Get the appointment
    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) {
      throw new Error("Appointment not found");
    }

    // Verify physiotherapist owns this appointment
    if (appointment.physiotherapistId !== user._id) {
      throw new Error("Access denied. Appointment not assigned to you.");
    }

    // Only live visits move; a completed or cancelled one must not be reopened by a drag
    if (!isOpenAppointment(appointment.status) || appointment.isRecordOnly) {
      throw new ConvexError("Only upcoming visits can be moved. This one is already finished or cancelled.");
    }
    if (args.newEndTime <= args.newStartTime) {
      throw new ConvexError("The visit must end after it starts.");
    }
    if (args.newStartTime < Date.now() - 60_000) {
      throw new ConvexError("Pick a time in the future.");
    }

    // Check for time conflicts (excluding the current appointment)
    const conflictingAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_physiotherapist_id_and_time", (q) =>
        q.eq("physiotherapistId", user._id)
      )
      .filter((q) =>
        q.and(
          q.neq(q.field("_id"), args.appointmentId),
          q.or(
            q.and(q.lte(q.field("startTime"), args.newStartTime), q.gt(q.field("endTime"), args.newStartTime)),
            q.and(q.lt(q.field("startTime"), args.newEndTime), q.gte(q.field("endTime"), args.newEndTime)),
            q.and(q.gte(q.field("startTime"), args.newStartTime), q.lte(q.field("endTime"), args.newEndTime))
          )
        )
      )
      .filter((q) =>
        q.and(
          q.neq(q.field("status"), "cancelled_by_patient"),
          q.neq(q.field("status"), "cancelled_by_therapist")
        )
      )
      .collect();

    if (conflictingAppointments.length > 0) {
      throw new ConvexError("That time overlaps another appointment. Pick another time.");
    }

    // Keep old times for email content before updating
    const oldStart = appointment.startTime;
    const oldEnd = appointment.endTime;

    // Update the appointment. The physio set the new time, so the patient confirms it.
    await ctx.db.patch(args.appointmentId, {
      startTime: args.newStartTime,
      endTime: args.newEndTime,
      status: "scheduled", // Reset to scheduled after rescheduling
      requestedBy: "provider",
      rescheduledFromAppointmentId: args.appointmentId,
      ...CLEAR_PROPOSAL,
    });
    await syncGoogleCalendarEvent(ctx, args.appointmentId, { startTime: args.newStartTime, endTime: args.newEndTime });

    // Create notification for patient
    const patient = await ctx.db.get(appointment.patientId);

    await insertNotification(ctx, {
      userId: appointment.patientId,
      type: "appointment_rescheduled",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Appointment Rescheduled",
        body: `${personName(user, "Your physiotherapist")} moved your visit to ${lagosDateTime(args.newStartTime)}. Please confirm the new time.`,
        data: {
          entityId: args.appointmentId,
          entityType: "appointment",
          actionUrl: "/dashboard/patient/appointments",
        },
      },
      createdAt: Date.now(),
    });

    // Email: notify physiotherapist (provider-facing) about reschedule
    const physiotherapist = appointment.physiotherapistId
      ? await ctx.db.get(appointment.physiotherapistId)
      : null;
    const physioEmail = physiotherapist?.email as string | undefined;
    const physiotherapistName = personName(physiotherapist, "Physiotherapist");
    const patientNameForEmail = personName(patient, "Patient");
    const oldTimeStr = lagosTimeRange(oldStart, oldEnd);
    const newTimeStr = lagosTimeRange(args.newStartTime, args.newEndTime);
    if (physioEmail) {
      await ctx.scheduler.runAfter(0, internal.actions.emails.sendAppointmentRescheduledProviderEmail.sendAppointmentRescheduledProviderEmail, {
        to: physioEmail,
        patientName: patientNameForEmail,
        physiotherapistName,
        oldDate: oldStart,
        oldTime: oldTimeStr,
        newDate: args.newStartTime,
        newTime: newTimeStr,
        viewLink: "/dashboard/physiotherapist/appointments",
        subjectOverride: `Appointment rescheduled: ${patientNameForEmail}`,
      });
    }

    // Email: notify patient about reschedule
    const patientEmail = patient?.email as string | undefined;
    if (patientEmail) {
      await ctx.scheduler.runAfter(0, internal.actions.emails.sendAppointmentRescheduledPatientEmail.sendAppointmentRescheduledPatientEmail, {
        to: patientEmail,
        patientName: patientNameForEmail,
        physiotherapistName,
        oldDate: oldStart,
        oldTime: oldTimeStr,
        newDate: args.newStartTime,
        newTime: newTimeStr,
        viewLink: "/dashboard/patient/appointments",
        subjectOverride: `Appointment rescheduled: ${physiotherapistName}`,
      });
    }

    return {
      success: true,
      message: "Appointment rescheduled successfully.",
    };
  },
});

/**
 * Physio offers the patient another time for a visit (a request they can't take, or a confirmed
 * visit they need to move). The visit keeps its time and status until the patient answers.
 */
export const proposeNewTime = mutation({
  args: {
    appointmentId: v.id("appointments"),
    startTime: v.number(),
    endTime: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, ["physiotherapist"]);

    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) {
      throw new ConvexError("Appointment not found.");
    }
    if (appointment.physiotherapistId !== user._id) {
      throw new ConvexError("Only this visit's physiotherapist can propose another time.");
    }
    if (!isOpenAppointment(appointment.status) || appointment.isRecordOnly) {
      throw new ConvexError("Only upcoming visits can be moved. This one is already finished or cancelled.");
    }
    if (args.endTime <= args.startTime || args.endTime - args.startTime > 4 * 60 * 60_000) {
      throw new ConvexError("Please choose a valid session length.");
    }
    if (args.startTime < Date.now()) {
      throw new ConvexError("Pick a time in the future.");
    }
    if (args.startTime === appointment.startTime && args.endTime === appointment.endTime) {
      throw new ConvexError("That's the visit's current time. Pick a different one.");
    }
    if (await physioHasClash(ctx, user._id, args.startTime, args.endTime, appointment._id)) {
      throw new ConvexError("That time overlaps another appointment. Pick another time.");
    }

    const note = args.note?.trim().slice(0, 500) || undefined;
    await ctx.db.patch(args.appointmentId, {
      proposedStartTime: args.startTime,
      proposedEndTime: args.endTime,
      proposedBy: user._id,
      proposedAt: Date.now(),
      proposalNote: note,
    });

    const patient = await ctx.db.get(appointment.patientId);
    const physioName = personName(user, "Your physiotherapist");
    await notifyAboutAppointment(ctx, {
      userId: appointment.patientId,
      type: "appointment_time_proposed",
      title: "New time proposed",
      body: `${physioName} proposed moving your visit from ${lagosDateTime(appointment.startTime)} to ${lagosDateTime(args.startTime)}.${note ? ` "${note}"` : ""}`,
      appointmentId: args.appointmentId,
      actionUrl: PATIENT_APPOINTMENTS,
    });
    await emailAboutAppointment(ctx, {
      to: patient?.email,
      audience: "patient",
      subject: `${physioName} proposed a new time for your visit`,
      greetingName: patient?.firstName,
      heading: "Your physio proposed a new time",
      paragraphs: [
        `${physioName} proposed moving your ${appointment.serviceType} from ${lagosDate(appointment.startTime)}, ${lagosTimeRange(appointment.startTime, appointment.endTime)} to ${lagosDate(args.startTime)}, ${lagosTimeRange(args.startTime, args.endTime)} (Lagos time).`,
        ...(note ? [`Their note: "${note}"`] : []),
        "Open your appointments to accept the new time or keep the original one.",
      ],
      buttonLabel: "Answer now",
      buttonPath: PATIENT_APPOINTMENTS,
    });

    return { success: true, message: "New time sent. We'll let you know when the patient answers." };
  },
});

/**
 * Patient answers the physio's proposed time. Accept: the visit moves there and is confirmed
 * (if the time is still free). Decline: the visit keeps its original time; a pending request
 * goes back to the physio to confirm or decline.
 */
export const respondToProposedTime = mutation({
  args: {
    appointmentId: v.id("appointments"),
    accept: v.boolean(),
  },
  handler: async (ctx, args) => {
    const patient = await getAuthenticatedPatient(ctx);

    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment || appointment.patientId !== patient._id) {
      throw new ConvexError("This is not your appointment.");
    }
    const start = appointment.proposedStartTime;
    const end = appointment.proposedEndTime;
    if (start === undefined || end === undefined || !isOpenAppointment(appointment.status)) {
      throw new ConvexError("There's no new time waiting for your answer.");
    }

    const physiotherapist = await ctx.db.get(appointment.physiotherapistId);
    const patientName = personName(patient, "Your patient");
    const physioName = personName(physiotherapist, "your physiotherapist");

    if (args.accept) {
      if (start < Date.now()) {
        throw new ConvexError("That time has passed. Keep your original time or ask your physio for another.");
      }
      if (await physioHasClash(ctx, appointment.physiotherapistId, start, end, appointment._id)) {
        throw new ConvexError("That time has just been taken. Keep your original time or ask your physio for another.");
      }

      // A Rehabify patient's request moves to the new time and still waits for the physio's
      // invoice: paying it is what confirms the visit
      if (await needsInvoiceOnAccept(ctx, appointment)) {
        await ctx.db.patch(args.appointmentId, { startTime: start, endTime: end, ...CLEAR_PROPOSAL });
        await notifyAboutAppointment(ctx, {
          userId: appointment.physiotherapistId,
          type: "appointment_rescheduled",
          title: "New time accepted: send the invoice",
          body: `${patientName} accepted ${lagosDateTime(start)}. Accept & send the invoice so they can pay to confirm it.`,
          appointmentId: args.appointmentId,
          actionUrl: PHYSIO_APPOINTMENTS,
        });
        return { success: true, message: "Moved to the new time. Your physio will send the invoice, and paying it confirms your visit." };
      }
      // Any other unpaid Rehabify Care visit is confirmed by paying, never by accepting a time
      if (await mustPayToConfirm(ctx, appointment)) {
        throw new ConvexError("This visit is paid through Rehabify, so paying is what confirms it. Ask your physio to send you the payment request.");
      }

      await ctx.db.patch(args.appointmentId, {
        startTime: start,
        endTime: end,
        status: "confirmed",
        requestedBy: "provider",
        rescheduledFromAppointmentId: args.appointmentId,
        ...CLEAR_PROPOSAL,
      });
      await syncGoogleCalendarEvent(ctx, args.appointmentId, { startTime: start, endTime: end });
      await ensureVideoRoom(ctx, appointment, `Appointment: ${patientName}`);

      await notifyAboutAppointment(ctx, {
        userId: appointment.physiotherapistId,
        type: "appointment_confirmed",
        title: "New time accepted",
        body: `${patientName} accepted ${lagosDateTime(start)}. The visit is confirmed.`,
        appointmentId: args.appointmentId,
        actionUrl: PHYSIO_APPOINTMENTS,
      });
      await notifyAboutAppointment(ctx, {
        userId: patient._id,
        type: "appointment_confirmed",
        title: "Appointment Confirmed",
        body: `Your visit with ${physioName} is now on ${lagosDateTime(start)}.`,
        appointmentId: args.appointmentId,
        actionUrl: PATIENT_APPOINTMENTS,
      });
      if (physiotherapist?.email) {
        try {
          await ctx.scheduler.runAfter(0, internal.actions.emails.sendAppointmentRescheduledProviderEmail.sendAppointmentRescheduledProviderEmail, {
            to: physiotherapist.email,
            patientName,
            physiotherapistName: personName(physiotherapist, "Physiotherapist"),
            oldDate: appointment.startTime,
            oldTime: lagosTimeRange(appointment.startTime, appointment.endTime),
            newDate: start,
            newTime: lagosTimeRange(start, end),
            viewLink: PHYSIO_APPOINTMENTS,
            subjectOverride: `${patientName} accepted your new time`,
          });
        } catch (err) {
          console.error("Failed to schedule proposal-accepted email:", err);
        }
      }

      return { success: true, message: "Your visit is moved and confirmed." };
    }

    await ctx.db.patch(args.appointmentId, { ...CLEAR_PROPOSAL });
    const stillPending = appointment.status === "scheduled";
    const keptWhen = lagosDateTime(appointment.startTime);
    await notifyAboutAppointment(ctx, {
      userId: appointment.physiotherapistId,
      type: "appointment_time_declined",
      title: "Patient kept the original time",
      body: `${patientName} declined ${lagosDateTime(start)} and kept ${keptWhen}.${stillPending ? " Their request still needs your answer." : ""}`,
      appointmentId: args.appointmentId,
      actionUrl: PHYSIO_APPOINTMENTS,
    });
    await emailAboutAppointment(ctx, {
      to: physiotherapist?.email,
      audience: "provider",
      subject: `${patientName} kept the original time`,
      greetingName: physiotherapist?.firstName,
      heading: "Your proposed time was declined",
      paragraphs: [
        `${patientName} declined ${lagosDate(start)}, ${lagosTimeRange(start, end)} and kept ${lagosDate(appointment.startTime)}, ${lagosTimeRange(appointment.startTime, appointment.endTime)} (Lagos time).`,
        stillPending
          ? "Their request is still waiting: confirm it, decline it, or propose another time."
          : "The visit stays confirmed at the original time.",
      ],
      buttonLabel: "Open appointments",
      buttonPath: PHYSIO_APPOINTMENTS,
    });

    return {
      success: true,
      message: stillPending
        ? "Kept your original time. Your physio will confirm it or suggest another."
        : "Kept your original time.",
    };
  },
});

/**
 * Update appointment status
 */
export const getTodaysSchedule = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx, ["physiotherapist", "clinic_owner"]);

    // Today's boundaries in Lagos (Convex runs in UTC)
    const startOfDay = startOfZonedDay(Date.now());
    const endOfDay = startOfDay + (24 * 60 * 60 * 1000) - 1;

    // Get appointments for today
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_physiotherapist_id_and_time", (q) =>
        q.eq("physiotherapistId", user._id).gte("startTime", startOfDay)
      )
      .filter((q) => q.lte(q.field("startTime"), endOfDay))
      .order("asc")
      .collect();

    // Get patient details for each appointment
    const appointmentsWithPatients = await Promise.all(
      appointments.map(async (appointment) => {
        const patient = await ctx.db.get(appointment.patientId);
        return {
          ...appointment,
          patient: patient ? {
            _id: patient._id,
            firstName: patient.firstName,
            lastName: patient.lastName,
            email: patient.email,
            imageUrl: patient.imageUrl,
            phoneNumber: patient.phoneNumber,
          } : null,
        };
      })
    );

    return appointmentsWithPatients;
  },
});

/**
 * Get appointment details including session logs
 */
export const getAppointmentDetails = query({
  args: {
    appointmentId: v.id("appointments"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, ["physiotherapist", "clinic_owner"]);

    // Get the appointment
    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) {
      throw new Error("Appointment not found");
    }

    // Verify physiotherapist owns this appointment
    if (appointment.physiotherapistId !== user._id) {
      throw new Error("Access denied. Appointment not assigned to you.");
    }

    // Get patient details
    const patient = await ctx.db.get(appointment.patientId);

    // Get session log if exists (a visit can have more than one note; .unique() would throw)
    const sessionLog = await ctx.db
      .query("sessionLogs")
      .withIndex("by_appointment_id", (q) => q.eq("appointmentId", args.appointmentId))
      .first();

    return {
      appointment: {
        ...appointment,
        patient: patient ? {
          _id: patient._id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          email: patient.email,
          imageUrl: patient.imageUrl,
          phoneNumber: patient.phoneNumber,
        } : null,
      },
      sessionLog,
    };
  },
});

// =============================================================
//  Update arbitrary appointment fields (pin, priority, color, reschedule)
// =============================================================
export const updateAppointmentFields = mutation({
  args: {
    appointmentId: v.id("appointments"),
    updates: v.object({
      startTime: v.optional(v.number()),
      endTime: v.optional(v.number()),
      isPinned: v.optional(v.boolean()),
      priority: v.optional(
        v.union(
          v.literal("low"),
          v.literal("medium"),
          v.literal("high"),
          v.literal("urgent")
        )
      ),
      colorCode: v.optional(v.string()),
      manualMeetingLink: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { appointmentId, updates }) => {
    const user = await getAuthenticatedUser(ctx, ["physiotherapist", "clinic_owner"]);

    const appointment = await ctx.db.get(appointmentId);
    if (!appointment) throw new Error("Appointment not found");
    if (appointment.physiotherapistId !== user._id) {
      throw new Error("Access denied");
    }
    // Only labels here. Times move through rescheduleAppointment / proposeNewTime, which check clashes,
    // tell the patient and keep a paid visit from being backdated (e.g. to claim a no-show payout).
    const { startTime, endTime, ...labels } = updates;
    if ((startTime !== undefined && startTime !== appointment.startTime) || (endTime !== undefined && endTime !== appointment.endTime)) {
      throw new ConvexError("Use Suggest another time to change when a visit happens.");
    }

    await ctx.db.patch(appointmentId, labels);
    return { success: true };
  },
});

// ==== New Query: Get appointments for a patient ====
export const getPatientAppointments = query({
  args: {
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("scheduled"),
        v.literal("confirmed"),
        v.literal("completed"),
        v.literal("cancelled_by_patient"),
        v.literal("cancelled_by_therapist"),
        v.literal("no_show")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Ensure the caller is the patient themselves. Return nothing (not throw) while the
    // session or user row is still settling, like getMyUser and getPatientStats do.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const patient = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!patient || patient.role !== "patient") return [];

    const limit = args.limit ?? 100;

    let appointmentsQuery = ctx.db
      .query("appointments")
      .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", patient._id));

    if (args.startDate) {
      appointmentsQuery = appointmentsQuery.filter((q) => q.gte(q.field("startTime"), args.startDate!));
    }

    if (args.endDate) {
      appointmentsQuery = appointmentsQuery.filter((q) => q.lte(q.field("startTime"), args.endDate!));
    }

    if (args.status) {
      appointmentsQuery = appointmentsQuery.filter((q) => q.eq(q.field("status"), args.status!));
    }

    // Record-only rows anchor a physio's notes/check-ins and are not visits. Take the newest
    // `limit` (so long-term patients keep their upcoming visits), returned oldest first.
    const results = (
      await appointmentsQuery
        .filter((q) => q.neq(q.field("isRecordOnly"), true))
        .order("desc")
        .take(limit)
    ).reverse();

    // Get physiotherapist details and feedback status for each appointment
    const appointmentsWithDetails = await Promise.all(
      results.map(async ({ notesForTherapist: _privateNotes, ...appointment }) => {
        const physiotherapist = await ctx.db.get(appointment.physiotherapistId);
        if (!physiotherapist) return appointment;

        // Check if feedback has been submitted for completed appointments
        let feedbackSubmitted = false;
        if (appointment.status === "completed") {
          const feedback = await ctx.db
            .query("appointmentFeedback")
            .withIndex("by_appointment", (q) => q.eq("appointmentId", appointment._id))
            .first();
          feedbackSubmitted = !!feedback;
        }

        return {
          ...appointment,
          physiotherapistName: personName(physiotherapist, "Your physiotherapist"),
          physiotherapistEmail: physiotherapist.email,
          feedbackSubmitted,
        };
      })
    );

    return appointmentsWithDetails;
  },
});

// ==== Patient-Specific Appointment Management Functions ====

/**
 * Get authenticated patient user and validate permissions
 */
async function getAuthenticatedPatient(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .unique();

  if (!user) {
    throw new Error("User not found");
  }

  if (user.role !== "patient") {
    throw new Error("Access denied. Patient privileges required.");
  }

  return user;
}

/**
 * Get available physiotherapists for a patient
 */
export const getMyPhysiotherapists = query({
  args: {},
  handler: async (ctx) => {
    const patient = await getAuthenticatedPatient(ctx);

    // Get all active relationships
    const relationships = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    // Get physiotherapist details
    const physiotherapists = await Promise.all(
      relationships.map(async (relationship) => {
        const physiotherapist = await ctx.db.get(relationship.physiotherapistId);
        if (!physiotherapist) return null;

        const physiotherapistProfile = physiotherapist.physiotherapistProfileId
          ? await ctx.db.get(physiotherapist.physiotherapistProfileId)
          : null;

        return {
          _id: physiotherapist._id,
          firstName: physiotherapist.firstName,
          lastName: physiotherapist.lastName,
          email: physiotherapist.email,
          imageUrl: physiotherapist.imageUrl,
          specializations: physiotherapistProfile?.specializations || [],
          isPrimary: relationship.isPrimaryPhysiotherapist,
          relationshipId: relationship._id,
        };
      })
    );

    return physiotherapists.filter(Boolean);
  },
});

/**
 * Get available time slots for a physiotherapist
 */
export const getAvailableTimeSlots = query({
  args: {
    physiotherapistId: v.id("users"),
    date: v.string(), // YYYY-MM-DD format
    serviceType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patient = await getAuthenticatedPatient(ctx);

    // Verify patient has relationship with this physiotherapist
    const relationship = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q) =>
        q.eq("patientId", patient._id).eq("physiotherapistId", args.physiotherapistId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      // Old data can hold two links to the same physio; .unique() would throw
      .first();

    if (!relationship) {
      throw new Error("Access denied. You are not assigned to this physiotherapist.");
    }

    // The physio's real openings that day (working hours, days off, bookings and holds),
    // with the Lagos day boundaries: Convex runs in UTC.
    const startOfDay = zonedDateTimeToUtc(args.date, "00:00");
    const endOfDay = startOfDay + (24 * 60 * 60 * 1000) - 1;
    const openings: Array<{ start: number; end: number }> = await ctx.runQuery(
      internal.calendar.availability.getAvailableSlotsInternal,
      { physiotherapistId: args.physiotherapistId, startDate: startOfDay, endDate: endOfDay }
    );

    return openings
      .filter((slot) => slot.start >= startOfDay && slot.start <= endOfDay && slot.start > Date.now())
      .map((slot) => ({
        startTime: slot.start,
        endTime: slot.end,
        startTimeFormatted: lagosTime(slot.start),
        endTimeFormatted: lagosTime(slot.end),
        available: true,
      }));
  },
});

/**
 * Request an appointment (patient-initiated)
 */
export const requestAppointment = mutation({
  args: {
    physiotherapistId: v.id("users"),
    startTime: v.number(),
    endTime: v.number(),
    serviceType: v.string(),
    notes: v.optional(v.string()),
    appointmentType: v.optional(v.union(v.literal("in-person"), v.literal("telehealth"))),
    location: v.optional(v.string()), // Address for in-person visits
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    appointmentId: Id<"appointments">;
    message: string;
    googleMeetLink?: string;
    googleCalendarLink?: string;
  }> => {
    const patient = await getAuthenticatedPatient(ctx);

    if (args.startTime < Date.now() - 60_000) {
      throw new ConvexError("Please choose a time in the future.");
    }
    if (args.endTime <= args.startTime || args.endTime - args.startTime > 4 * 60 * 60_000) {
      throw new ConvexError("Please choose a valid session length.");
    }
    if (args.appointmentType === "in-person" && !args.location?.trim()) {
      throw new ConvexError("Please enter the address for an in-person visit.");
    }

    // Verify patient has relationship with this physiotherapist
    const relationship = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q) =>
        q.eq("patientId", patient._id).eq("physiotherapistId", args.physiotherapistId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!relationship) {
      throw new Error("Access denied. You are not assigned to this physiotherapist.");
    }

    // Rehabify patients pay per session: the physio accepts and sends the invoice
    // (rehabifyFollowUps.acceptRequestWithInvoice), and paying confirms the visit
    const paidVisit = await isRehabifyCare(ctx, patient._id, args.physiotherapistId);

    // Get physiotherapist info for clinic details
    const physiotherapist = await ctx.db.get(args.physiotherapistId);
    if (!physiotherapist) {
      throw new Error("Physiotherapist not found");
    }

    const physiotherapistProfile = physiotherapist.physiotherapistProfileId
      ? await ctx.db.get(physiotherapist.physiotherapistProfileId)
      : null;

    // Check for time conflicts
    const conflictingAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_physiotherapist_id_and_time", (q) =>
        q.eq("physiotherapistId", args.physiotherapistId)
      )
      .filter((q) =>
        q.or(
          q.and(q.lte(q.field("startTime"), args.startTime), q.gt(q.field("endTime"), args.startTime)),
          q.and(q.lt(q.field("startTime"), args.endTime), q.gte(q.field("endTime"), args.endTime)),
          q.and(q.gte(q.field("startTime"), args.startTime), q.lte(q.field("endTime"), args.endTime))
        )
      )
      .filter((q) =>
        q.and(
          q.neq(q.field("status"), "cancelled_by_patient"),
          q.neq(q.field("status"), "cancelled_by_therapist")
        )
      )
      .collect();

    if (conflictingAppointments.length > 0) {
      throw new ConvexError("That time has just been taken. Please choose another time.");
    }
    // Busy in the physio's Google Calendar (cached free/busy)
    if (await isGoogleBusy(ctx, args.physiotherapistId, { start: args.startTime, end: args.endTime })) {
      throw new ConvexError("That time isn't available any more. Please choose another time.");
    }

    // Create the appointment
    const appointmentId = await ctx.db.insert("appointments", {
      patientId: patient._id,
      physiotherapistId: args.physiotherapistId,
      clinicId: (physiotherapistProfile as any)?.clinicId || undefined,
      startTime: args.startTime,
      endTime: args.endTime,
      serviceType: args.serviceType,
      status: "scheduled",
      // The patient asked for this time, so the physio is the one who confirms it
      requestedBy: "patient",
      notesForPatient: undefined,
      notesForTherapist: args.notes,
      appointmentType: args.appointmentType || "telehealth", // Default to telehealth for patient booking as per design
      location: args.appointmentType === "in-person" ? args.location?.trim() : undefined,
    });

    const patientName = personName(patient, "Your patient");
    const physiotherapistName = personName(physiotherapist, "your physiotherapist");

    // Generate Google Meet link if telehealth
    let googleMeetLink: string | undefined;
    let googleCalendarLink: string | undefined;

    // A paid visit gets its calendar event once it's paid (the request is replaced on accept)
    if (!paidVisit && (args.appointmentType === 'telehealth' || !args.appointmentType)) {
      // Schedule Google Meet link generation

      await ctx.scheduler.runAfter(0, internal.calendar.service.createCalendarEventAsync, {
        userId: args.physiotherapistId,
        appointmentId: appointmentId,
        summary: `${args.serviceType} - ${patientName}`,
        description: args.notes || `Telehealth ${args.serviceType} Appointment`,
        startTime: args.startTime,
        endTime: args.endTime,
        attendees: patient.email ? [{ email: patient.email }] : [],
        createMeetLink: true,
      });

    }

    // Determine clinic info for emails
    let clinicName = 'Rehabify Health';
    let clinicAddress = '';
    if ((physiotherapistProfile as any)?.clinicId) {
      const clinic = await ctx.db.get((physiotherapistProfile as any).clinicId);
      if (clinic) {
        clinicName = (clinic as any).name || clinicName;
        clinicAddress = (clinic as any).address || '';
      }
    }
    // Convex runs in UTC; show times as patients and physios see them
    const appointmentTimeStr = lagosTimeRange(args.startTime, args.endTime);

    // Create notification for physiotherapist
    await insertNotification(ctx, {
      userId: args.physiotherapistId,
      type: "appointment_scheduled",
      priority: "medium",
      status: "pending",
      payload: {
        title: "New Appointment Request",
        body: paidVisit
          ? `${patientName} asked for a visit on ${lagosDateTime(args.startTime)}. It's a paid Rehabify visit: accept it and send the invoice, decline it, or propose another time.`
          : `${patientName} asked for a visit on ${lagosDateTime(args.startTime)}. Accept it, decline it, or propose another time.`,
        data: {
          entityId: appointmentId,
          entityType: "appointment",
          actionUrl: "/dashboard/physiotherapist/appointments",
        },
      },
      createdAt: Date.now(),
    });

    // Create notification for patient
    await insertNotification(ctx, {
      userId: patient._id,
      type: "appointment_scheduled",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Appointment Requested",
        body: paidVisit
          ? `You asked ${physiotherapistName} for a visit on ${lagosDateTime(args.startTime)}. When they accept, you'll get the invoice. Paying it confirms your visit.`
          : `You asked ${physiotherapistName} for a visit on ${lagosDateTime(args.startTime)}. We'll let you know when they confirm.`,
        data: {
          entityId: appointmentId,
          entityType: "appointment",
          actionUrl: "/dashboard/patient/appointments",
        },
      },
      createdAt: Date.now(),
    });

    // Send emails: provider notification and patient confirmation
    const physioEmail = physiotherapist.email as string | undefined;
    if (physioEmail) {
      await ctx.scheduler.runAfter(0, internal.actions.emails.sendAppointmentRequestedEmail.sendAppointmentRequestedEmail, {
        to: physioEmail,
        patientName,
        physiotherapistName,
        appointmentDate: args.startTime,
        appointmentTime: appointmentTimeStr,
        clinicName,
        clinicAddress,
        viewLink: "/dashboard/physiotherapist/appointments",
        approveLink: "/dashboard/physiotherapist/appointments",
        subjectOverride: `New appointment request from ${patientName}`,
      });
    }

    // The patient's copy says it's a request: the physio still has to confirm it
    await emailAboutAppointment(ctx, {
      to: patient.email as string | undefined,
      audience: "patient",
      subject: `Your appointment request to ${physiotherapistName}`,
      greetingName: patient.firstName,
      heading: "We've sent your request",
      paragraphs: [
        `You asked ${physiotherapistName} for a ${args.serviceType} on ${lagosDate(args.startTime)}, ${appointmentTimeStr} (Lagos time), ${args.appointmentType === "in-person" ? `at ${args.location?.trim()}` : "by video call"}.`,
        paidVisit
          ? "Your physio will accept it and send you the invoice, or propose another time. Your visit is confirmed once you pay."
          : "Your physio will confirm it, or propose another time. We'll email you either way.",
      ],
      buttonLabel: "View my appointments",
      buttonPath: PATIENT_APPOINTMENTS,
    });

    return {
      success: true,
      appointmentId,
      message: paidVisit
        ? "Request sent. When your physio accepts, you'll get the invoice to pay."
        : "Appointment requested successfully. You'll be notified when it's confirmed.",
      googleMeetLink,
      googleCalendarLink,
    };
  },
});

/**
 * Cancel appointment as patient
 */
export const cancelAppointmentAsPatient = mutation({
  args: {
    appointmentId: v.id("appointments"),
    cancellationReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patient = await getAuthenticatedPatient(ctx);

    // Get the appointment
    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) {
      throw new Error("Appointment not found");
    }

    // Verify patient owns this appointment
    if (appointment.patientId !== patient._id) {
      throw new Error("Access denied. This is not your appointment.");
    }

    // Pending requests and confirmed visits can both be cancelled
    if (!isOpenAppointment(appointment.status)) {
      throw new ConvexError("This appointment is already completed or cancelled.");
    }
    const wasRequest = appointment.status === "scheduled";

    // Update the appointment
    await ctx.db.patch(args.appointmentId, {
      status: "cancelled_by_patient",
      cancellationReason: args.cancellationReason?.trim().slice(0, 500) || undefined,
      ...CLEAR_PROPOSAL,
    });
    await syncGoogleCalendarEvent(ctx, args.appointmentId, "delete");
    // A paid Rehabify Care visit: the refund and the physio's share follow Payment Policy 4.3
    const careOutcome = await settlePatientCancellation(ctx, appointment);

    // Get physiotherapist info for notification
    const physiotherapist = await ctx.db.get(appointment.physiotherapistId);
    const patientName = personName(patient, "Your patient");
    const physiotherapistName = personName(physiotherapist, "your physiotherapist");

    // Create notification for physiotherapist
    await insertNotification(ctx, {
      userId: appointment.physiotherapistId,
      type: "appointment_cancelled",
      priority: "medium",
      status: "pending",
      payload: {
        title: wasRequest ? "Appointment Request Withdrawn" : "Appointment Cancelled",
        body: args.cancellationReason
          ? `${patientName} cancelled their ${wasRequest ? "request for" : "visit on"} ${lagosDateTime(appointment.startTime)}: ${args.cancellationReason}`
          : `${patientName} cancelled their ${wasRequest ? "request for" : "visit on"} ${lagosDateTime(appointment.startTime)}`,
        data: {
          entityId: args.appointmentId,
          entityType: "appointment",
          actionUrl: "/dashboard/physiotherapist/appointments",
        },
      },
      createdAt: Date.now(),
    });

    // Create notification for patient
    await insertNotification(ctx, {
      userId: patient._id,
      type: "appointment_cancelled",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Appointment Cancelled",
        body: `Your appointment with ${physiotherapistName} on ${lagosDateTime(appointment.startTime)} has been cancelled`,
        data: {
          entityId: args.appointmentId,
          entityType: "appointment",
          actionUrl: "/dashboard/patient/appointments",
        },
      },
      createdAt: Date.now(),
    });

    // Email: notify physiotherapist (provider-facing) about cancellation
    const physioEmail = physiotherapist?.email as string | undefined;
    const appointmentTimeStr = lagosTimeRange(appointment.startTime, appointment.endTime);
    if (physioEmail) {
      await ctx.scheduler.runAfter(0, internal.actions.emails.sendAppointmentCanceledProviderEmail.sendAppointmentCanceledProviderEmail, {
        to: physioEmail,
        patientName,
        physiotherapistName,
        appointmentDate: appointment.startTime,
        appointmentTime: appointmentTimeStr,
        cancellationReason: args.cancellationReason,
        viewLink: "/dashboard/physiotherapist/appointments",
        subjectOverride: `Appointment canceled: ${patientName}`,
      });
    }

    // Email: notify patient (patient-facing) about their cancellation
    const patientEmail = patient.email as string | undefined;
    if (patientEmail) {
      try {
        await ctx.scheduler.runAfter(0, internal.actions.emails.sendAppointmentCanceledPatientEmail.sendAppointmentCanceledPatientEmail, {
          to: patientEmail,
          patientName,
          physiotherapistName,
          appointmentDate: appointment.startTime,
          appointmentTime: appointmentTimeStr,
          cancellationReason: args.cancellationReason,
          rescheduleLink: "/dashboard/patient/appointments",
        });
      } catch (err) {
        console.error("Failed to schedule patient cancellation email:", err);
      }
    }

    return {
      success: true,
      message: careOutcome
        ? careOutcome.refundKobo > 0
          ? `Cancelled. We'll refund ₦${Math.round(careOutcome.refundKobo / 100).toLocaleString("en-NG")} to how you paid, usually within 5 to 10 business days.`
          : "Cancelled. Under 2 hours before the visit there's no refund (Payment Policy 4.3)."
        : "Appointment cancelled successfully.",
    };
  },
});

/**
 * Confirm appointment as patient
 */
export const confirmAppointmentAsPatient = mutation({
  args: {
    appointmentId: v.id("appointments"),
  },
  handler: async (ctx, args) => {
    const patient = await getAuthenticatedPatient(ctx);

    // Get the appointment
    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) {
      throw new Error("Appointment not found");
    }

    // Verify patient owns this appointment
    if (appointment.patientId !== patient._id) {
      throw new Error("Access denied. This is not your appointment.");
    }

    // Check if appointment can be confirmed
    if (appointment.status !== "scheduled") {
      throw new ConvexError("Only pending appointments can be confirmed.");
    }
    // The side that didn't set the time confirms it: a patient's own request waits for the physio
    if (awaitingConfirmationFrom(appointment) !== "patient") {
      throw new ConvexError("Your physio confirms this visit. We'll let you know when they do.");
    }
    if (appointment.endTime < Date.now()) {
      throw new ConvexError("This visit's time has passed.");
    }
    // Rehabify Care visits are confirmed by paying, not by accepting (own and clinic patients are)
    if (await mustPayToConfirm(ctx, appointment)) {
      throw new ConvexError("This visit is paid through Rehabify, so paying is what confirms it. Ask your physio to send you the payment request.");
    }

    // Update the appointment
    await ctx.db.patch(args.appointmentId, {
      status: "confirmed",
    });
    await ensureVideoRoom(ctx, appointment, `Appointment: ${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim());

    // Get physiotherapist info for notification
    const physiotherapist = await ctx.db.get(appointment.physiotherapistId);
    const patientName = personName(patient, "Your patient");
    const physiotherapistName = personName(physiotherapist, "your physiotherapist");

    // Create notification for physiotherapist
    const notificationId = await insertNotification(ctx, {
      userId: appointment.physiotherapistId,
      type: "appointment_confirmed",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Appointment Confirmed",
        body: `${patientName} confirmed their appointment for ${lagosDateTime(appointment.startTime)}`,
        data: {
          entityId: args.appointmentId,
          entityType: "appointment",
          actionUrl: "/dashboard/physiotherapist/appointments",
        },
      },
      createdAt: Date.now(),
    });

    // Proactively schedule notification delivery via internal notification service
    try {
      await ctx.scheduler.runAfter(0, internal.notifications.service.deliverNotification, {
        notificationId,
      });
    } catch (err) {
      console.error("Failed to schedule notification delivery for appointment confirmation:", err);
    }

    // Email: notify physiotherapist (provider-facing) about confirmation
    const physioEmail = physiotherapist?.email as string | undefined;
    const appointmentTimeStr = lagosTimeRange(appointment.startTime, appointment.endTime);
    if (physioEmail) {
      try {
        await ctx.scheduler.runAfter(0, internal.actions.emails.sendAppointmentConfirmedProviderEmail.sendAppointmentConfirmedProviderEmail, {
          to: physioEmail,
          patientName,
          physiotherapistName,
          appointmentDate: appointment.startTime,
          appointmentTime: appointmentTimeStr,
          viewLink: "/dashboard/physiotherapist/appointments",
          subjectOverride: `Appointment confirmed by ${patientName}`,
        });
      } catch (err) {
        // Don't fail the mutation if email scheduling fails; log for diagnostics
        console.error("Failed to schedule email delivery for confirmation:", err);
      }
    }

    return {
      success: true,
      message: "Appointment confirmed successfully.",
    };
  },
});

/**
 * Request appointment reschedule as patient
 */
export const requestAppointmentReschedule = mutation({
  args: {
    appointmentId: v.id("appointments"),
    newStartTime: v.number(),
    newEndTime: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patient = await getAuthenticatedPatient(ctx);
    return await requestRescheduleAsPatient(ctx, patient, args);
  },
});

/**
 * The patient asks to move their visit (the app, or WhatsApp through Joy: joyOperations
 * patient_reschedule_booking). Every check runs before anything is written, so a ConvexError
 * leaves the visit and the free short-notice move untouched. The physio then confirms.
 */
export async function requestRescheduleAsPatient(
  ctx: MutationCtx,
  patient: Doc<"users">,
  args: { appointmentId: Id<"appointments">; newStartTime: number; newEndTime: number; reason?: string }
) {

    // Get the appointment
    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) {
      throw new Error("Appointment not found");
    }

    // Verify patient owns this appointment
    if (appointment.patientId !== patient._id) {
      throw new Error("Access denied. This is not your appointment.");
    }

    // Check if appointment can be rescheduled
    if (!isOpenAppointment(appointment.status)) {
      throw new ConvexError("This appointment is already completed or cancelled.");
    }
    if (args.newEndTime <= args.newStartTime || args.newEndTime - args.newStartTime > 4 * 60 * 60_000) {
      throw new ConvexError("Please choose a valid session length.");
    }
    if (args.newStartTime < Date.now() - 60_000) {
      throw new ConvexError("Please choose a time in the future.");
    }
    // Check for time conflicts (excluding the current appointment)
    const conflictingAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_physiotherapist_id_and_time", (q) =>
        q.eq("physiotherapistId", appointment.physiotherapistId)
      )
      .filter((q) =>
        q.and(
          q.neq(q.field("_id"), args.appointmentId),
          q.or(
            q.and(q.lte(q.field("startTime"), args.newStartTime), q.gt(q.field("endTime"), args.newStartTime)),
            q.and(q.lt(q.field("startTime"), args.newEndTime), q.gte(q.field("endTime"), args.newEndTime)),
            q.and(q.gte(q.field("startTime"), args.newStartTime), q.lte(q.field("endTime"), args.newEndTime))
          )
        )
      )
      .filter((q) =>
        q.and(
          q.neq(q.field("status"), "cancelled_by_patient"),
          q.neq(q.field("status"), "cancelled_by_therapist")
        )
      )
      .collect();

    if (conflictingAppointments.length > 0) {
      throw new ConvexError("The requested time slot conflicts with another appointment. Please choose a different time.");
    }
    if (await isGoogleBusy(ctx, appointment.physiotherapistId, { start: args.newStartTime, end: args.newEndTime })) {
      throw new ConvexError("That time isn't available any more. Please choose a different time.");
    }

    // Paid Rehabify Care visits: one free move at short notice (Payment Policy 4.3). Spent after
    // every check above, so a refused time never uses it up.
    await useFreeReschedule(ctx, appointment, args.newStartTime);

    // Update the appointment. The patient picked the new time, so the physio confirms it.
    await ctx.db.patch(args.appointmentId, {
      startTime: args.newStartTime,
      endTime: args.newEndTime,
      status: "scheduled", // Reset to scheduled after rescheduling
      requestedBy: "patient",
      rescheduledFromAppointmentId: args.appointmentId,
      ...CLEAR_PROPOSAL,
    });
    await syncGoogleCalendarEvent(ctx, args.appointmentId, { startTime: args.newStartTime, endTime: args.newEndTime });

    // Get physiotherapist info for notification
    const physiotherapist = await ctx.db.get(appointment.physiotherapistId);
    const patientName = personName(patient, "Your patient");
    const physiotherapistName = personName(physiotherapist, "your physiotherapist");

    // Create notification for physiotherapist
    await insertNotification(ctx, {
      userId: appointment.physiotherapistId,
      type: "appointment_rescheduled",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Appointment Rescheduled",
        body: args.reason
          ? `${patientName} asked to move their visit to ${lagosDateTime(args.newStartTime)}: ${args.reason}. Please confirm the new time.`
          : `${patientName} asked to move their visit to ${lagosDateTime(args.newStartTime)}. Please confirm the new time.`,
        data: {
          entityId: args.appointmentId,
          entityType: "appointment",
          actionUrl: "/dashboard/physiotherapist/appointments",
        },
      },
      createdAt: Date.now(),
    });

    // Create notification for patient
    await insertNotification(ctx, {
      userId: patient._id,
      type: "appointment_rescheduled",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Appointment Rescheduled",
        body: `You asked ${physiotherapistName} to move your visit to ${lagosDateTime(args.newStartTime)}. We'll let you know when they confirm.`,
        data: {
          entityId: args.appointmentId,
          entityType: "appointment",
          actionUrl: "/dashboard/patient/appointments",
        },
      },
      createdAt: Date.now(),
    });

    // 📧 EMAIL: Notify physiotherapist about patient-initiated reschedule
    const physioEmail = physiotherapist?.email as string | undefined;
    if (physioEmail) {
      const oldTimeStr = lagosTimeRange(appointment.startTime, appointment.endTime);
      const newTimeStr = lagosTimeRange(args.newStartTime, args.newEndTime);

      try {
        await ctx.scheduler.runAfter(0, internal.actions.emails.sendAppointmentRescheduledProviderEmail.sendAppointmentRescheduledProviderEmail, {
          to: physioEmail,
          patientName: patientName,
          physiotherapistName: physiotherapistName,
          oldDate: appointment.startTime,
          oldTime: oldTimeStr,
          newDate: args.newStartTime,
          newTime: newTimeStr,
          viewLink: "/dashboard/physiotherapist/appointments",
          subjectOverride: `Appointment rescheduled: ${patientName}`,
        });
      } catch (err) {
        console.error("Failed to send reschedule email to physiotherapist:", err);
      }
    }

    // 📧 EMAIL: Notify patient about successful reschedule
    const patientEmail = patient?.email as string | undefined;
    if (patientEmail) {
      const newTimeStr = lagosTimeRange(args.newStartTime, args.newEndTime);

      try {
        await ctx.scheduler.runAfter(0, internal.actions.emails.sendAppointmentRescheduledPatientEmail.sendAppointmentRescheduledPatientEmail, {
          to: patientEmail,
          patientName: patientName,
          physiotherapistName: physiotherapistName,
          oldDate: appointment.startTime,
          oldTime: lagosTimeRange(appointment.startTime, appointment.endTime),
          newDate: args.newStartTime,
          newTime: newTimeStr,
          viewLink: "/dashboard/patient/appointments",
        });
      } catch (err) {
        console.error("Failed to send reschedule confirmation email to patient:", err);
      }
    }

    return {
      success: true,
      message: "Appointment rescheduled successfully. Your physiotherapist has been notified.",
    }
}

/**
 * Get all physiotherapists in a clinic (for multi-provider calendar view)
 */
export const getClinicPhysiotherapists = internalQuery({
  args: {
    clinicId: v.id("clinics"),
  },
  handler: async (ctx, args) => {
    // Get all physiotherapist profiles for this clinic
    const profiles = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", args.clinicId))
      .collect();

    // Get user details for each physiotherapist
    const physiotherapists = await Promise.all(
      profiles.map(async (profile) => {
        const user = await ctx.db.get(profile.userId);
        if (!user) return null;

        return {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          imageUrl: user.imageUrl,
          specializations: profile.specializations || [],
        };
      })
    );

    return physiotherapists.filter(Boolean);
  },
});

/**
 * Get all appointments for a clinic (multi-provider view)
 */
export const getClinicAppointments = internalQuery({
  args: {
    clinicId: v.id("clinics"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("scheduled"),
        v.literal("confirmed"),
        v.literal("completed"),
        v.literal("cancelled_by_patient"),
        v.literal("cancelled_by_therapist"),
        v.literal("no_show")
      )
    ),
  },
  handler: async (ctx, args) => {
    // Get all physiotherapists in the clinic
    const profiles = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", args.clinicId))
      .collect();

    const physiotherapistIds = profiles.map(p => p.userId);

    // Get appointments for all clinic physiotherapists
    const allAppointments = await Promise.all(
      physiotherapistIds.map(async (physioId) => {
        let query = ctx.db
          .query("appointments")
          .withIndex("by_physiotherapist_id_and_time", (q) => q.eq("physiotherapistId", physioId));

        if (args.startDate) {
          query = query.filter((q) => q.gte(q.field("startTime"), args.startDate!));
        }

        if (args.endDate) {
          query = query.filter((q) => q.lte(q.field("startTime"), args.endDate!));
        }

        if (args.status) {
          query = query.filter((q) => q.eq(q.field("status"), args.status!));
        }

        return await query.collect();
      })
    );

    // Flatten and add patient details
    const flatAppointments = allAppointments.flat();
    const appointmentsWithDetails = await Promise.all(
      flatAppointments.map(async (appointment) => {
        const patient = await ctx.db.get(appointment.patientId);
        return {
          ...appointment,
          patient: patient ? {
            firstName: patient.firstName,
            lastName: patient.lastName,
            imageUrl: patient.imageUrl,
          } : null,
        };
      })
    );

    return appointmentsWithDetails;
  },
});

/**
 * Get appointment details for patient
 */
export const getPatientAppointmentDetails = query({
  args: {
    appointmentId: v.id("appointments"),
  },
  handler: async (ctx, args) => {
    const patient = await getAuthenticatedPatient(ctx);

    // Get the appointment
    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) {
      throw new Error("Appointment not found");
    }

    // Verify patient owns this appointment
    if (appointment.patientId !== patient._id) {
      throw new Error("Access denied. This is not your appointment.");
    }

    // Get physiotherapist details
    const physiotherapist = await ctx.db.get(appointment.physiotherapistId);

    // Get physiotherapist profile
    const physiotherapistProfile = physiotherapist?.physiotherapistProfileId
      ? await ctx.db.get(physiotherapist.physiotherapistProfileId)
      : null;

    // Get clinic details if applicable
    const clinic = appointment.clinicId
      ? await ctx.db.get(appointment.clinicId)
      : null;

    // Get session log if exists; patients get the visit summary, not the clinician's working notes
    const sessionLog = await ctx.db
      .query("sessionLogs")
      .withIndex("by_appointment_id", (q) => q.eq("appointmentId", args.appointmentId))
      .first();
    const { notesForTherapist: _privateNotes, ...visibleAppointment } = appointment;

    return {
      appointment: visibleAppointment,
      physiotherapist: physiotherapist ? {
        _id: physiotherapist._id,
        firstName: physiotherapist.firstName,
        lastName: physiotherapist.lastName,
        email: physiotherapist.email,
        imageUrl: physiotherapist.imageUrl,
        specializations: physiotherapistProfile?.specializations || [],
      } : null,
      clinic: clinic ? {
        _id: clinic._id,
        name: clinic.name,
        address: clinic.address,
        contactPhone: clinic.contactPhone,
      } : null,
      sessionLog: sessionLog ? {
        subjectiveAssessment: sessionLog.subjectiveAssessment,
        objectiveAssessment: sessionLog.objectiveAssessment,
        treatmentAdministered: sessionLog.treatmentAdministered,
        planForNextSession: sessionLog.planForNextSession,
      } : null,
    };
  },
});

export const submitPatientFeedback = mutation({
  args: {
    appointmentId: v.id("appointments"),
    rating: v.number(),
    feedback: v.string(),
    categoryRatings: v.object({
      overall_experience: v.number(),
      communication: v.number(),
      treatment_effectiveness: v.number(),
      professionalism: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    const patient = await getAuthenticatedPatient(ctx)

    const appointment = await ctx.db.get(args.appointmentId)
    if (!appointment) throw new Error("Appointment not found")

    // Verify the appointment belongs to this patient
    if (appointment.patientId !== patient._id) {
      throw new Error("You don't have permission to provide feedback for this appointment")
    }

    // Verify the appointment is completed
    if (appointment.status !== "completed") {
      throw new Error("You can only provide feedback for completed appointments")
    }

    // Check if feedback already exists
    const existingFeedback = await ctx.db
      .query("appointmentFeedback")
      .withIndex("by_appointment", (q) => q.eq("appointmentId", args.appointmentId))
      .first()

    if (existingFeedback) {
      throw new Error("Feedback has already been submitted for this appointment")
    }

    // Validate rating values
    const allRatings = [args.rating, ...Object.values(args.categoryRatings)]
    for (const rating of allRatings) {
      if (rating < 1 || rating > 5) {
        throw new Error("Ratings must be between 1 and 5")
      }
    }

    // Create feedback record
    const feedbackId = await ctx.db.insert("appointmentFeedback", {
      appointmentId: args.appointmentId,
      patientId: patient._id,
      physiotherapistId: appointment.physiotherapistId as any, // Cast to handle ID type mismatch
      rating: args.rating,
      feedback: args.feedback,
      categoryRatings: args.categoryRatings,
      submittedAt: Date.now(),
    })

    // Get physiotherapist info for notification
    const physiotherapist = await ctx.db.get(appointment.physiotherapistId)
    if (!physiotherapist) throw new Error("Physiotherapist not found")

    // Create notification for physiotherapist
    await insertNotification(ctx, {
      userId: appointment.physiotherapistId,
      type: "appointment_feedback",
      priority: "medium",
      status: "pending",
      payload: {
        title: "New Patient Feedback",
        body: `${personName(patient, "Your patient")} left ${args.rating}-star feedback for your appointment`,
        data: {
          entityId: args.appointmentId,
          entityType: "appointment_feedback",
          feedbackId,
          patientName: personName(patient, "Your patient"),
          rating: args.rating,
        },
      },
      createdAt: Date.now(),
    })

    return { success: true, feedbackId }
  },
}) 
