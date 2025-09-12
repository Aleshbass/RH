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
  },
  handler: async (ctx, args) => {
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
      throw new Error("Time slot conflicts with existing appointment");
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

    // Email: confirmation to patient
    const patientEmail = patient?.email as string | undefined;
    if (patientEmail) {
      await ctx.scheduler.runAfter(0, api.actions.emails.sendAppointmentScheduledEmail as any, {
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

    // Notification for physiotherapist
    const calendarEvent = {
      title: `Appointment with ${patientName}`,
      start: new Date(args.startTime),
      end: new Date(args.endTime),
    };
    // Use internal calendar function instead of runAction
    await ctx.scheduler.runAfter(0, api.calendar.nodeActions.createCalendarEvent, {
      userId: user._id,
      event: calendarEvent,
    });

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
    let appointmentsQuery;

    if (user.role === "physiotherapist") {
      // For physiotherapists, get their own appointments
      appointmentsQuery = ctx.db
        .query("appointments")
        .withIndex("by_physiotherapist_id_and_time", (q) => 
          q.eq("physiotherapistId", user._id)
        );
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
        physiotherapistIds.map(physioId =>
          ctx.db
            .query("appointments")
            .withIndex("by_physiotherapist_id_and_time", (q) => 
              q.eq("physiotherapistId", physioId)
            )
            .collect()
        )
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
    } else if (user.role && (user.role as string === "physiotherapist" || user.role as string === "clinic_owner")) {
      // For physiotherapists, get their own appointments
      appointmentsQuery = ctx.db
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

      const appointments = await appointmentsQuery.order("asc").take(limit);

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
      type: "appointment_canceled", // Generic type for now
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
      type: "appointment_scheduled",
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
      await ctx.scheduler.runAfter(0, api.actions.emails.sendAppointmentRescheduledProviderEmail as any, {
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

    return {
      success: true,
      message: "Appointment rescheduled successfully.",
    };
  },
});

/**
 * Get today's schedule for physiotherapist
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
      throw new Error("Time slot is no longer available. Please select a different time.");
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
    });

    const patientName = `${patient.firstName} ${patient.lastName}`;
    const physiotherapistName = `${physiotherapist.firstName} ${physiotherapist.lastName}`;
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
      await ctx.scheduler.runAfter(0, api.actions.emails.sendAppointmentRequestedEmail as any, {
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
      await ctx.scheduler.runAfter(0, api.actions.emails.sendAppointmentScheduledEmail as any, {
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
      type: "appointment_canceled",
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
      type: "appointment_canceled",
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
      await ctx.scheduler.runAfter(0, api.actions.emails.sendAppointmentCanceledProviderEmail as any, {
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
        await ctx.scheduler.runAfter(0, api.actions.emails.sendAppointmentConfirmedProviderEmail, {
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
        console.error("Failed to schedule provider confirmation email:", err);
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

    return {
      success: true,
      message: "Appointment rescheduled successfully.",
    };
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