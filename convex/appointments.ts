import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";

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
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    appointmentId: Id<"appointments">;
    message: string;
    googleMeetLink?: string;
    googleCalendarLink?: string;
  }> => {
    const user = await getAuthenticatedUser(ctx);

    // Verify user has access to this patient
    const relationship = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q) =>
        q.eq("patientId", args.patientId).eq("physiotherapistId", user._id)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();

    if (!relationship) {
      throw new Error("Access denied. Patient not assigned to you.");
    }

    // Get physiotherapist profile to get clinic info
    const physiotherapistProfile = await ctx.db.get(user.physiotherapistProfileId!);
    if (!physiotherapistProfile) {
      throw new Error("Physiotherapist profile not found");
    }

    // Check for time conflicts
    const conflictingAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_physiotherapist_id_and_time", (q) =>
        q.eq("physiotherapistId", user._id)
      )
      .filter((q) =>
        q.or(
          q.and(q.lte(q.field("startTime"), args.startTime), q.gt(q.field("endTime"), args.startTime)),
          q.and(q.lt(q.field("startTime"), args.endTime), q.gte(q.field("endTime"), args.endTime)),
          q.and(q.gte(q.field("startTime"), args.startTime), q.lte(q.field("endTime"), args.endTime))
        )
      )
      .filter((q) =>
        q.neq(q.field("status"), "cancelled_by_patient") &&
        q.neq(q.field("status"), "cancelled_by_therapist")
      )
      .collect();

    if (conflictingAppointments.length > 0) {
      const sorted = conflictingAppointments.sort((a, b) => a.startTime - b.startTime);
      const details = sorted.slice(0, 3).map((a) => `${new Date(a.startTime).toISOString()} - ${new Date(a.endTime).toISOString()}`).join(", ");
      throw new Error(`Time slot conflicts with existing appointment: ${details}`);
    }

    // Create the appointment
    const appointmentId = await ctx.db.insert("appointments", {
      patientId: args.patientId,
      physiotherapistId: user._id,
      clinicId: (physiotherapistProfile as any)?.clinicId || undefined,
      startTime: args.startTime,
      endTime: args.endTime,
      serviceType: args.serviceType,
      status: "scheduled",
      notesForPatient: args.notesForPatient,
      notesForTherapist: args.notesForTherapist,
      // Enhanced appointment features
      priority: args.priority || "low",
      appointmentType: args.appointmentType || "in-person",
      isPinned: args.isPinned || false,
      colorCode: args.colorCode || "#3B82F6", // Default blue
      manualMeetingLink: args.manualMeetingLink,
    });

    // Create notifications for both patient and therapist
    const patient = await ctx.db.get(args.patientId);
    const patientName = patient ? `${patient.firstName} ${patient.lastName}` : "Patient";
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
    // Precompute a friendly time range string for emails
    const appointmentTimeStr = `${new Date(args.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(args.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    // Notification for patient
    await ctx.db.insert("notifications", {
      userId: args.patientId,
      type: "appointment_scheduled",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Appointment Scheduled",
        body: `Your appointment has been scheduled for ${new Date(args.startTime).toLocaleDateString()}`,
        data: {
          entityId: appointmentId,
          entityType: "appointment",
          actionUrl: "/dashboard/patient/appointments",
        },
      },
      createdAt: Date.now(),
    });

    // Email: confirmation to patient (schedule as action)
    const patientEmail = patient?.email as string | undefined;
    if (patientEmail) {
      await ctx.scheduler.runAfter(0, api["actions/emails/sendAppointmentScheduledEmail"].sendAppointmentScheduledEmail as any, {
        to: patientEmail,
        patientName,
        physiotherapistName,
        appointmentDate: args.startTime,
        appointmentTime: appointmentTimeStr,
        clinicName,
        clinicAddress,
        calendarLink: "/dashboard/patient/appointments",
        rescheduleLink: "/dashboard/patient/appointments",
      });
    }

    // External calendar sync disabled: no Google Calendar events scheduled

    await ctx.db.insert("notifications", {
      userId: user._id,
      type: "appointment_scheduled",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Appointment Created",
        body: `Appointment scheduled with ${patientName}`,
        data: {
          entityId: appointmentId,
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

        if (preferredPlatform === 'stream') {
          // Create Stream video call
          await ctx.scheduler.runAfter(0, api.videoCalls.createVideoCall as any, {
            appointmentId: appointmentId,
            participants: [args.patientId, user._id],
            callType: "appointment" as const,
            title: `Appointment: ${patientName}`,
            settings: {
              recordingEnabled: false,
              chatEnabled: true,
              maxParticipants: 2,
              waitingRoomEnabled: false,
            }
          });
        } else if (preferredPlatform === 'google_meet' || args.manualMeetingLink === 'google_meet') {
          // Schedule Google Meet link generation via Google Calendar API
          console.log("[DEBUG] Scheduling Google Meet link creation for appointment:", appointmentId);
          console.log("[DEBUG] User ID:", user._id);

          await ctx.scheduler.runAfter(0, internal.calendar.service.createCalendarEventAsync, {
            userId: user._id,
            appointmentId: appointmentId,
            summary: `${args.serviceType} - ${patientName}`,
            description: args.notesForTherapist || `Telehealth ${args.serviceType} Appointment`,
            startTime: args.startTime,
            endTime: args.endTime,
            attendees: patient?.email ? [{ email: patient.email, displayName: patientName }] : [],
            createMeetLink: true,
          });

          console.log("[DEBUG] Calendar event creation scheduled");
        }
      } catch (error) {
        console.error('Failed to create video call for appointment:', error);
        // Don't fail appointment creation if video call fails
      }
    }

    return {
      success: true,
      appointmentId,
      message: "Appointment created successfully.",
    };
  },
});

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
      let appointmentsQuery = ctx.db
        .query("appointments")
        .withIndex("by_physiotherapist_id_and_time", (q) =>
          q.eq("physiotherapistId", user._id)
        );

      // Apply date filters if provided
      if (args.startDate) {
        appointmentsQuery = appointmentsQuery.filter((q) =>
          q.gte(q.field("startTime"), args.startDate!)
        );
      }

      if (args.endDate) {
        appointmentsQuery = appointmentsQuery.filter((q) =>
          q.lte(q.field("startTime"), args.endDate!)
        );
      }

      // Apply status filter if provided
      if (args.status) {
        appointmentsQuery = appointmentsQuery.filter((q) =>
          q.eq(q.field("status"), args.status!)
        );
      }

      const appointments = await appointmentsQuery.order("desc").take(limit);

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

    // Update the appointment
    const updateData: any = { status: args.status };
    if (args.cancellationReason) {
      updateData.cancellationReason = args.cancellationReason;
    }

    await ctx.db.patch(args.appointmentId, updateData);

    // Create notification for patient
    const patient = await ctx.db.get(appointment.patientId);
    const patientName = patient ? `${patient.firstName} ${patient.lastName}` : "Patient";

    let notificationTitle = "";
    let notificationMessage = "";

    switch (args.status) {
      case "confirmed":
        notificationTitle = "Appointment Confirmed";
        notificationMessage = "Your appointment has been confirmed";
        break;
      case "completed":
        notificationTitle = "Appointment Completed";
        notificationMessage = "Your appointment has been completed";
        break;
      case "cancelled_by_therapist":
        notificationTitle = "Appointment Cancelled";
        notificationMessage = args.cancellationReason
          ? `Your appointment has been cancelled: ${args.cancellationReason}`
          : "Your appointment has been cancelled";
        break;
      case "no_show":
        notificationTitle = "Missed Appointment";
        notificationMessage = "You missed your scheduled appointment";
        break;
    }

    await ctx.db.insert("notifications", {
      userId: appointment.patientId,
      type: "appointment_cancelled", // Generic type for now
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
        const physiotherapist = await ctx.db.get(appointment.physiotherapistId);
        const physiotherapistName = physiotherapist ? `${physiotherapist.firstName} ${physiotherapist.lastName}` : "your physiotherapist";
        const patientNameForEmail = `${patient.firstName} ${patient.lastName}`;
        const appointmentTimeStr = `${new Date(appointment.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(appointment.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

        await ctx.scheduler.runAfter(0, api["actions/emails/sendAppointmentCanceledPatientEmail"].sendAppointmentCanceledPatientEmail as any, {
          to: patient.email as string,
          patientName: patientNameForEmail,
          physiotherapistName,
          appointmentDate: appointment.startTime,
          appointmentTime: appointmentTimeStr,
          cancellationReason: args.cancellationReason,
          rescheduleLink: "/dashboard/patient/appointments",
        });
      } catch (err) {
        console.error("Failed to schedule patient cancellation email (provider-initiated):", err);
      }
    }

    // AUTOMATED PAYOUT GENERATION
    // If appointment is marked as completed, check for paid invoice and generate payout
    if (args.status === "completed") {
      // Find invoice linked to this appointment
      // Note: Invoices usually link to appointments via relatedAppointmentIds array
      const invoice = await ctx.db
        .query("invoices")
        .withIndex("by_patient_id", (q) => q.eq("patientId", appointment.patientId))
        .filter((q) => q.eq(q.field("status"), "paid"))
        .collect()
        .then((invoices) =>
          invoices.find((inv) => inv.relatedAppointmentIds?.includes(args.appointmentId))
        );

      if (invoice) {
        // Check if payout already exists for this invoice to prevent duplicates
        const existingPayout = await ctx.db
          .query("payouts")
          .withIndex("by_payout_invoice_id", (q) => q.eq("invoiceId", invoice._id))
          .first();

        if (!existingPayout) {
          // Calculate split based on invoice fee breakdown or defaults
          const platformFee = invoice.feeBreakdown?.platformFee || (invoice.platformFeeAmount || 0);
          const physiotherapistEarning = invoice.feeBreakdown?.physiotherapistEarnings || (invoice.physiotherapistShare || 0);

          // 1. Create Platform Fee Payout
          if (platformFee > 0) {
            await ctx.db.insert("payouts", {
              invoiceId: invoice._id,
              paymentId: null as any, // Linked later if needed
              amount: platformFee,
              status: "pending",
              type: "platform_fee",
              userId: (invoice as any).userId, // Technically platform user, using invoice creator for now or system
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
          }

          // 2. Create Physiotherapist Earning Payout
          if (physiotherapistEarning > 0) {
            await ctx.db.insert("payouts", {
              invoiceId: invoice._id,
              paymentId: null as any,
              amount: physiotherapistEarning,
              status: "pending",
              type: "physiotherapist_earning",
              userId: appointment.physiotherapistId,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
          }

          console.log(`Generated payouts for appointment ${args.appointmentId} and invoice ${invoice._id}`);
        }
      }

      // ── Decrement sessionsRemaining on linked package booking ──────────
      // Find the most recent confirmed package booking for this patient+physio pair
      const packageBooking = await ctx.db
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
        .first();

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
        q.neq(q.field("status"), "cancelled_by_patient") &&
        q.neq(q.field("status"), "cancelled_by_therapist")
      )
      .collect();

    if (conflictingAppointments.length > 0) {
      throw new Error("New time slot conflicts with existing appointment");
    }

    // Keep old times for email content before updating
    const oldStart = appointment.startTime;
    const oldEnd = appointment.endTime;

    // Update the appointment
    await ctx.db.patch(args.appointmentId, {
      startTime: args.newStartTime,
      endTime: args.newEndTime,
      status: "scheduled", // Reset to scheduled after rescheduling
      rescheduledFromAppointmentId: args.appointmentId,
    });

    // Create notification for patient
    const patient = await ctx.db.get(appointment.patientId);

    await ctx.db.insert("notifications", {
      userId: appointment.patientId,
      type: "appointment_rescheduled",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Appointment Rescheduled",
        body: `Your appointment has been rescheduled to ${new Date(args.newStartTime).toLocaleDateString()}`,
        data: {
          entityId: args.appointmentId,
          entityType: "appointment",
          actionUrl: "/dashboard/patient/appointments",
        },
      },
      createdAt: Date.now(),
    });

    // Email: notify physiotherapist (provider-facing) about reschedule
    const physiotherapist = await ctx.db.get(appointment.physiotherapistId);
    const physioEmail = physiotherapist?.email as string | undefined;
    const physiotherapistName = physiotherapist ? `${physiotherapist.firstName} ${physiotherapist.lastName}` : "Physiotherapist";
    const patientNameForEmail = patient ? `${patient.firstName} ${patient.lastName}` : "Patient";
    const oldTimeStr = `${new Date(oldStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(oldEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const newTimeStr = `${new Date(args.newStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(args.newEndTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (physioEmail) {
      await ctx.scheduler.runAfter(0, api["actions/emails/sendAppointmentRescheduledProviderEmail"].sendAppointmentRescheduledProviderEmail as any, {
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
      await ctx.scheduler.runAfter(0, api["actions/emails/sendAppointmentRescheduledPatientEmail"].sendAppointmentRescheduledPatientEmail as any, {
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
 * Update appointment status
 */
export const getTodaysSchedule = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx, ["physiotherapist", "clinic_owner"]);

    // Get today's date boundaries
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
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

    // Get session log if exists
    const sessionLog = await ctx.db
      .query("sessionLogs")
      .withIndex("by_appointment_id", (q) => q.eq("appointmentId", args.appointmentId))
      .unique();

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

    await ctx.db.patch(appointmentId, updates as any);
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
    // Ensure the caller is the patient themselves
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const patient = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!patient) throw new Error("User not found");
    if (patient.role !== "patient") throw new Error("Access denied");

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

    const results = await appointmentsQuery.order("asc").take(limit);

    // Get physiotherapist details and feedback status for each appointment
    const appointmentsWithDetails = await Promise.all(
      results.map(async (appointment) => {
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
          physiotherapistName: `${physiotherapist.firstName} ${physiotherapist.lastName}`,
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
      .unique();

    if (!relationship) {
      throw new Error("Access denied. You are not assigned to this physiotherapist.");
    }

    // Parse the date
    const selectedDate = new Date(args.date);
    const startOfDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).getTime();
    const endOfDay = startOfDay + (24 * 60 * 60 * 1000) - 1;

    // Get existing appointments for that day
    const existingAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_physiotherapist_id_and_time", (q) =>
        q.eq("physiotherapistId", args.physiotherapistId)
      )
      .filter((q) =>
        q.and(
          q.gte(q.field("startTime"), startOfDay),
          q.lte(q.field("startTime"), endOfDay),
          q.neq(q.field("status"), "cancelled_by_patient"),
          q.neq(q.field("status"), "cancelled_by_therapist")
        )
      )
      .collect();

    // Generate available time slots (9 AM to 5 PM in 30-minute intervals)
    const slots = [];
    const appointmentDuration = 30 * 60 * 1000; // 30 minutes in milliseconds

    for (let hour = 9; hour < 17; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const slotStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), hour, minute).getTime();
        const slotEnd = slotStart + appointmentDuration;

        // Check if this slot conflicts with existing appointments
        const hasConflict = existingAppointments.some(appointment =>
          (slotStart >= appointment.startTime && slotStart < appointment.endTime) ||
          (slotEnd > appointment.startTime && slotEnd <= appointment.endTime) ||
          (slotStart <= appointment.startTime && slotEnd >= appointment.endTime)
        );

        if (!hasConflict) {
          slots.push({
            startTime: slotStart,
            endTime: slotEnd,
            startTimeFormatted: new Date(slotStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            endTimeFormatted: new Date(slotEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            available: true,
          });
        }
      }
    }

    return slots;
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
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    appointmentId: Id<"appointments">;
    message: string;
    googleMeetLink?: string;
    googleCalendarLink?: string;
  }> => {
    const patient = await getAuthenticatedPatient(ctx);

    // Verify patient has relationship with this physiotherapist
    const relationship = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q) =>
        q.eq("patientId", patient._id).eq("physiotherapistId", args.physiotherapistId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();

    if (!relationship) {
      throw new Error("Access denied. You are not assigned to this physiotherapist.");
    }

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
        q.neq(q.field("status"), "cancelled_by_patient") &&
        q.neq(q.field("status"), "cancelled_by_therapist")
      )
      .collect();

    if (conflictingAppointments.length > 0) {
      const sorted = conflictingAppointments.sort((a, b) => a.startTime - b.startTime);
      const details = sorted.slice(0, 3).map((a) => `${new Date(a.startTime).toISOString()} - ${new Date(a.endTime).toISOString()}`).join(", ");
      throw new Error(`Time slot is no longer available. Please select a different time. Conflicts: ${details}`);
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
      notesForPatient: undefined,
      notesForTherapist: args.notes,
      appointmentType: args.appointmentType || "telehealth", // Default to telehealth for patient booking as per design
    });

    const patientName = `${patient.firstName} ${patient.lastName}`;
    const physiotherapistName = `${physiotherapist.firstName} ${physiotherapist.lastName}`;

    // Generate Google Meet link if telehealth
    let googleMeetLink: string | undefined;
    let googleCalendarLink: string | undefined;

    if (args.appointmentType === 'telehealth' || !args.appointmentType) {
      // Schedule Google Meet link generation
      console.log("[DEBUG] Scheduling Google Meet link creation for patient appointment:", appointmentId);

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

      console.log("[DEBUG] Calendar event creation scheduled for patient appointment");
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
    const appointmentTimeStr = `${new Date(args.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(args.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    // Create notification for physiotherapist
    await ctx.db.insert("notifications", {
      userId: args.physiotherapistId,
      type: "appointment_scheduled",
      priority: "medium",
      status: "pending",
      payload: {
        title: "New Appointment Request",
        body: `${patientName} has requested an appointment for ${new Date(args.startTime).toLocaleDateString()}`,
        data: {
          entityId: appointmentId,
          entityType: "appointment",
          actionUrl: "/dashboard/physiotherapist/appointments",
        },
      },
      createdAt: Date.now(),
    });

    // Create notification for patient
    await ctx.db.insert("notifications", {
      userId: patient._id,
      type: "appointment_scheduled",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Appointment Requested",
        body: `Your appointment with ${physiotherapistName} has been requested for ${new Date(args.startTime).toLocaleDateString()}`,
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
      await ctx.scheduler.runAfter(0, api["actions/emails/sendAppointmentRequestedEmail"].sendAppointmentRequestedEmail as any, {
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

    const patientEmail = patient.email as string | undefined;
    if (patientEmail) {
      await ctx.scheduler.runAfter(0, api["actions/emails/sendAppointmentScheduledEmail"].sendAppointmentScheduledEmail as any, {
        to: patientEmail,
        patientName,
        physiotherapistName,
        appointmentDate: args.startTime,
        appointmentTime: appointmentTimeStr,
        clinicName,
        clinicAddress,
        calendarLink: "/dashboard/patient/appointments",
        rescheduleLink: "/dashboard/patient/appointments",
      });
    }

    return {
      success: true,
      appointmentId,
      message: "Appointment requested successfully. You'll be notified when it's confirmed.",
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

    // Check if appointment can be cancelled
    if (appointment.status === "completed" || appointment.status === "cancelled_by_patient" || appointment.status === "cancelled_by_therapist") {
      throw new Error("Cannot cancel this appointment. It may already be completed or cancelled.");
    }

    // Update the appointment
    await ctx.db.patch(args.appointmentId, {
      status: "cancelled_by_patient",
      cancellationReason: args.cancellationReason,
    });

    // Get physiotherapist info for notification
    const physiotherapist = await ctx.db.get(appointment.physiotherapistId);
    const patientName = `${patient.firstName} ${patient.lastName}`;
    const physiotherapistName = physiotherapist ? `${physiotherapist.firstName} ${physiotherapist.lastName}` : "your physiotherapist";

    // Create notification for physiotherapist
    await ctx.db.insert("notifications", {
      userId: appointment.physiotherapistId,
      type: "appointment_cancelled",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Appointment Cancelled",
        body: args.cancellationReason
          ? `${patientName} cancelled their appointment: ${args.cancellationReason}`
          : `${patientName} cancelled their appointment`,
        data: {
          entityId: args.appointmentId,
          entityType: "appointment",
          actionUrl: "/dashboard/physiotherapist/appointments",
        },
      },
      createdAt: Date.now(),
    });

    // Create notification for patient
    await ctx.db.insert("notifications", {
      userId: patient._id,
      type: "appointment_cancelled",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Appointment Cancelled",
        body: `Your appointment with ${physiotherapistName} has been cancelled`,
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
    const appointmentTimeStr = `${new Date(appointment.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(appointment.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (physioEmail) {
      await ctx.scheduler.runAfter(0, api["actions/emails/sendAppointmentCanceledProviderEmail"].sendAppointmentCanceledProviderEmail as any, {
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
        await ctx.scheduler.runAfter(0, api["actions/emails/sendAppointmentCanceledPatientEmail"].sendAppointmentCanceledPatientEmail as any, {
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
      message: "Appointment cancelled successfully.",
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
      throw new Error("Only scheduled appointments can be confirmed.");
    }

    // Update the appointment
    await ctx.db.patch(args.appointmentId, {
      status: "confirmed",
    });

    // Get physiotherapist info for notification
    const physiotherapist = await ctx.db.get(appointment.physiotherapistId);
    const patientName = `${patient.firstName} ${patient.lastName}`;
    const physiotherapistName = physiotherapist ? `${physiotherapist.firstName} ${physiotherapist.lastName}` : "your physiotherapist";

    // Create notification for physiotherapist
    const notificationId = await ctx.db.insert("notifications", {
      userId: appointment.physiotherapistId,
      type: "appointment_confirmed",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Appointment Confirmed",
        body: `${patientName} confirmed their appointment for ${new Date(appointment.startTime).toLocaleDateString()}`,
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
    const appointmentTimeStr = `${new Date(appointment.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(appointment.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (physioEmail) {
      try {
        await ctx.scheduler.runAfter(0, api["actions/emails/sendAppointmentConfirmedProviderEmail"].sendAppointmentConfirmedProviderEmail as any, {
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
    if (appointment.status === "completed" || appointment.status === "cancelled_by_patient" || appointment.status === "cancelled_by_therapist") {
      throw new Error("Cannot reschedule this appointment. It may already be completed or cancelled.");
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
        q.neq(q.field("status"), "cancelled_by_patient") &&
        q.neq(q.field("status"), "cancelled_by_therapist")
      )
      .collect();

    if (conflictingAppointments.length > 0) {
      throw new Error("The requested time slot conflicts with another appointment. Please choose a different time.");
    }

    // Update the appointment
    await ctx.db.patch(args.appointmentId, {
      startTime: args.newStartTime,
      endTime: args.newEndTime,
      status: "scheduled", // Reset to scheduled after rescheduling
      rescheduledFromAppointmentId: args.appointmentId,
    });

    // Get physiotherapist info for notification
    const physiotherapist = await ctx.db.get(appointment.physiotherapistId);
    const patientName = `${patient.firstName} ${patient.lastName}`;
    const physiotherapistName = physiotherapist ? `${physiotherapist.firstName} ${physiotherapist.lastName}` : "your physiotherapist";

    // Create notification for physiotherapist
    await ctx.db.insert("notifications", {
      userId: appointment.physiotherapistId,
      type: "appointment_rescheduled",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Appointment Rescheduled",
        body: args.reason
          ? `${patientName} rescheduled their appointment to ${new Date(args.newStartTime).toLocaleDateString()}: ${args.reason}`
          : `${patientName} rescheduled their appointment to ${new Date(args.newStartTime).toLocaleDateString()}`,
        data: {
          entityId: args.appointmentId,
          entityType: "appointment",
          actionUrl: "/dashboard/physiotherapist/appointments",
        },
      },
      createdAt: Date.now(),
    });

    // Create notification for patient
    await ctx.db.insert("notifications", {
      userId: patient._id,
      type: "appointment_rescheduled",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Appointment Rescheduled",
        body: `Your appointment with ${physiotherapistName} has been rescheduled to ${new Date(args.newStartTime).toLocaleDateString()}`,
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
      const oldStartTime = new Date(appointment.startTime);
      const oldEndTime = new Date(appointment.endTime);
      const newStartTime = new Date(args.newStartTime);
      const newEndTime = new Date(args.newEndTime);

      const oldTimeStr = `${oldStartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${oldEndTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const newTimeStr = `${newStartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${newEndTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      try {
        await ctx.scheduler.runAfter(0, api["actions/emails/sendAppointmentRescheduledProviderEmail"].sendAppointmentRescheduledProviderEmail as any, {
          to: physioEmail,
          patientName: patientName,
          physiotherapistName: physiotherapistName,
          oldDate: appointment.startTime,
          oldTime: oldTimeStr,
          newDate: args.newStartTime,
          newTime: newTimeStr,
          reason: args.reason || "No reason provided",
          appointmentId: args.appointmentId,
        });
      } catch (err) {
        console.error("Failed to send reschedule email to physiotherapist:", err);
      }
    }

    // 📧 EMAIL: Notify patient about successful reschedule
    const patientEmail = patient?.email as string | undefined;
    if (patientEmail) {
      const newStartTime = new Date(args.newStartTime);
      const newEndTime = new Date(args.newEndTime);
      const newTimeStr = `${newStartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${newEndTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      try {
        await ctx.scheduler.runAfter(0, api["actions/emails/sendAppointmentRescheduledPatientEmail"].sendAppointmentRescheduledPatientEmail as any, {
          to: patientEmail,
          patientName: patientName,
          physiotherapistName: physiotherapistName,
          newDate: args.newStartTime,
          newTime: newTimeStr,
          appointmentId: args.appointmentId,
        });
      } catch (err) {
        console.error("Failed to send reschedule confirmation email to patient:", err);
      }
    }

    return {
      success: true,
      message: "Appointment rescheduled successfully. Your physiotherapist has been notified.",
    }
  },
})

/**
 * Get all physiotherapists in a clinic (for multi-provider calendar view)
 */
export const getClinicPhysiotherapists = query({
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
export const getClinicAppointments = query({
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

    // Get session log if exists
    const sessionLog = await ctx.db
      .query("sessionLogs")
      .withIndex("by_appointment_id", (q) => q.eq("appointmentId", args.appointmentId))
      .unique();

    return {
      appointment,
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
      sessionLog,
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
    await ctx.db.insert("notifications", {
      userId: appointment.physiotherapistId,
      type: "appointment_feedback",
      priority: "medium",
      status: "pending",
      payload: {
        title: "New Patient Feedback",
        body: `${patient.firstName} ${patient.lastName} left ${args.rating}-star feedback for your appointment`,
        data: {
          entityId: args.appointmentId,
          entityType: "appointment_feedback",
          feedbackId,
          patientName: `${patient.firstName} ${patient.lastName}`,
          rating: args.rating,
        },
      },
      createdAt: Date.now(),
    })

    return { success: true, feedbackId }
  },
}) 