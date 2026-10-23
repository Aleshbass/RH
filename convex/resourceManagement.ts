import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

// Simple, flat types to avoid deep instantiation issues
export interface ResourceAvailability {
  resourceId: Id<"resources">;
  date: string;
  timeSlots: Array<{
    startTime: string;
    endTime: string;
    isAvailable: boolean;
    appointmentId?: Id<"appointments">;
  }>;
}

export interface ResourceBooking {
  resourceId: Id<"resources">;
  appointmentId: Id<"appointments">;
  startTime: number;
  endTime: number;
  status: 'confirmed' | 'pending' | 'cancelled';
}

/**
 * The signed-in user if they may use this clinic's resources: an admin, the clinic's owner, or a
 * member of its team (staff or clinician). `manage` (create, update, delete) needs the owner or an admin.
 */
async function requireClinicAccess(ctx: QueryCtx | MutationCtx, clinicId: Id<"clinics">, options: { manage?: boolean } = {}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user) throw new Error("User not found");
  if (user.role === "admin") return user;
  const clinic = await ctx.db.get(clinicId);
  if (!clinic) throw new Error("Clinic not found");
  if (clinic.ownerId === user._id) return user;
  if (!options.manage && user.clinicId === clinicId) return user;
  throw new Error("You don't have access to this clinic's resources");
}

// Resource Management Queries
export const getResources = query({
  args: {
    clinicId: v.id("clinics"),
    type: v.optional(v.union(
      v.literal("equipment"),
      v.literal("room"),
      v.literal("staff"),
      v.literal("vehicle")
    )),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireClinicAccess(ctx, args.clinicId);

    let resourcesQuery = ctx.db
      .query("resources")
      .withIndex("by_clinic", (q) => q.eq("clinicId", args.clinicId));

    if (args.type) {
      resourcesQuery = resourcesQuery.filter((q) => q.eq(q.field("type"), args.type));
    }

    if (args.isActive !== undefined) {
      resourcesQuery = resourcesQuery.filter((q) => q.eq(q.field("isActive"), args.isActive));
    }

    const resources = await resourcesQuery.collect();
    return resources;
  },
});

export const getResourceById = query({
  args: { resourceId: v.id("resources") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const resource = await ctx.db.get(args.resourceId);
    if (!resource) throw new Error("Resource not found");
    await requireClinicAccess(ctx, resource.clinicId);

    return resource;
  },
});

export const getResourceAvailability = query({
  args: {
    resourceId: v.id("resources"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const resource = await ctx.db.get(args.resourceId);
    if (!resource) throw new Error("Resource not found");
    await requireClinicAccess(ctx, resource.clinicId);

    // Get existing bookings for the date range
    const bookings = await ctx.db
      .query("resourceBookings")
      .withIndex("by_resource_date", (q) =>
        q.eq("resourceId", args.resourceId)
      )
      .filter((q) =>
        q.and(
          q.gte(q.field("startTime"), new Date(args.startDate).getTime()),
          q.lte(q.field("endTime"), new Date(args.endDate).getTime())
        )
      )
      .collect();

    const activeBookings = bookings.filter(b => b.status !== 'cancelled');

    return {
      resource,
      bookings: activeBookings,
      availability: generateAvailabilitySlots(resource, activeBookings, args.startDate, args.endDate),
    };
  },
});

export const getResourceBookings = query({
  args: {
    resourceId: v.optional(v.id("resources")),
    appointmentId: v.optional(v.id("appointments")),
    clinicId: v.optional(v.id("clinics")),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    let bookings: Doc<"resourceBookings">[];

    if (args.resourceId) {
      const resource = await ctx.db.get(args.resourceId);
      if (!resource) throw new Error("Resource not found");
      await requireClinicAccess(ctx, resource.clinicId);
    } else if (args.clinicId) {
      await requireClinicAccess(ctx, args.clinicId);
    } else if (args.appointmentId) {
      const appointment = await ctx.db.get(args.appointmentId);
      if (!appointment?.clinicId) return [];
      await requireClinicAccess(ctx, appointment.clinicId);
    } else {
      throw new Error("Choose a resource, clinic or appointment");
    }

    if (args.resourceId) {
      bookings = await ctx.db.query("resourceBookings")
        .withIndex("by_resource_date", (q) =>
          q.eq("resourceId", args.resourceId!)
        )
        .collect();
    } else if (args.appointmentId) {
      bookings = await ctx.db.query("resourceBookings")
        .withIndex("by_appointment", (q) =>
          q.eq("appointmentId", args.appointmentId!)
        )
        .collect();
    } else {
      // A clinic's bookings: through its resources (filtered below)
      const resourceIds = (
        await ctx.db.query("resources").withIndex("by_clinic", (q) => q.eq("clinicId", args.clinicId!)).collect()
      ).map((r) => r._id);
      bookings = (
        await Promise.all(
          resourceIds.map((resourceId) =>
            ctx.db.query("resourceBookings").withIndex("by_resource_date", (q) => q.eq("resourceId", resourceId)).collect()
          )
        )
      ).flat();
    }

    // Filter by date range if provided
    if (args.startDate && args.endDate) {
      const startTime = new Date(args.startDate).getTime();
      const endTime = new Date(args.endDate).getTime();
      bookings = bookings.filter(b =>
        b.startTime >= startTime && b.endTime <= endTime
      );
    }

    // Filter by clinic if provided
    if (args.clinicId) {
      const resourceIds = await ctx.db
        .query("resources")
        .withIndex("by_clinic", (q) => q.eq("clinicId", args.clinicId!))
        .collect()
        .then(resources => resources.map(r => r._id));

      bookings = bookings.filter(b => resourceIds.includes(b.resourceId));
    }

    return bookings;
  },
});

// Resource Management Mutations
export const createResource = mutation({
  args: {
    clinicId: v.id("clinics"),
    name: v.string(),
    type: v.union(
      v.literal("equipment"),
      v.literal("room"),
      v.literal("staff"),
      v.literal("vehicle")
    ),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    location: v.optional(v.string()),
    capacity: v.optional(v.number()),
    specifications: v.optional(v.object({
      brand: v.optional(v.string()),
      model: v.optional(v.string()),
      serialNumber: v.optional(v.string()),
      purchaseDate: v.optional(v.string()),
      warrantyExpiry: v.optional(v.string()),
    })),
    operatingHours: v.optional(v.object({
      monday: v.optional(v.object({ start: v.string(), end: v.string() })),
      tuesday: v.optional(v.object({ start: v.string(), end: v.string() })),
      wednesday: v.optional(v.object({ start: v.string(), end: v.string() })),
      thursday: v.optional(v.object({ start: v.string(), end: v.string() })),
      friday: v.optional(v.object({ start: v.string(), end: v.string() })),
      saturday: v.optional(v.object({ start: v.string(), end: v.string() })),
      sunday: v.optional(v.object({ start: v.string(), end: v.string() })),
    })),
    maintenanceSchedule: v.optional(v.object({
      frequency: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"), v.literal("quarterly"), v.literal("annually")),
      lastMaintenance: v.optional(v.string()),
      nextMaintenance: v.optional(v.string()),
    })),
    isActive: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Verify user has access to clinic
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    const clinic = await ctx.db.get(args.clinicId);
    if (!clinic) throw new Error("Clinic not found");

    await requireClinicAccess(ctx, args.clinicId, { manage: true });

    const resourceId = await ctx.db.insert("resources", {
      ...args,
      isActive: args.isActive ?? true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: user._id,
    });

    return { resourceId, success: true };
  },
});

export const updateResource = mutation({
  args: {
    resourceId: v.id("resources"),
    updates: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      category: v.optional(v.string()),
      location: v.optional(v.string()),
      capacity: v.optional(v.number()),
      specifications: v.optional(v.object({
        brand: v.optional(v.string()),
        model: v.optional(v.string()),
        serialNumber: v.optional(v.string()),
        purchaseDate: v.optional(v.string()),
        warrantyExpiry: v.optional(v.string()),
      })),
      operatingHours: v.optional(v.object({
        monday: v.optional(v.object({ start: v.string(), end: v.string() })),
        tuesday: v.optional(v.object({ start: v.string(), end: v.string() })),
        wednesday: v.optional(v.object({ start: v.string(), end: v.string() })),
        thursday: v.optional(v.object({ start: v.string(), end: v.string() })),
        friday: v.optional(v.object({ start: v.string(), end: v.string() })),
        saturday: v.optional(v.object({ start: v.string(), end: v.string() })),
        sunday: v.optional(v.object({ start: v.string(), end: v.string() })),
      })),
      maintenanceSchedule: v.optional(v.object({
        frequency: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"), v.literal("quarterly"), v.literal("annually")),
        lastMaintenance: v.optional(v.string()),
        nextMaintenance: v.optional(v.string()),
      })),
      isActive: v.optional(v.boolean()),
      tags: v.optional(v.array(v.string())),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const resource = await ctx.db.get(args.resourceId);
    if (!resource) throw new Error("Resource not found");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    const clinic = await ctx.db.get(resource.clinicId);
    if (!clinic) throw new Error("Clinic not found");

    await requireClinicAccess(ctx, resource.clinicId, { manage: true });

    await ctx.db.patch(args.resourceId, {
      ...args.updates,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const bookResource = mutation({
  args: {
    resourceId: v.id("resources"),
    appointmentId: v.id("appointments"),
    startTime: v.number(),
    endTime: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const resource = await ctx.db.get(args.resourceId);
    if (!resource) throw new Error("Resource not found");

    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) throw new Error("Appointment not found");
    await requireClinicAccess(ctx, resource.clinicId);
    if (appointment.clinicId && appointment.clinicId !== resource.clinicId) throw new Error("That appointment belongs to another clinic");

    // Check for conflicts
    const conflicts = await ctx.db
      .query("resourceBookings")
      .withIndex("by_resource_date", (q) =>
        q.eq("resourceId", args.resourceId)
      )
      .filter((q) =>
        q.and(
          q.neq(q.field("status"), "cancelled"),
          q.or(
            q.and(
              q.gte(q.field("startTime"), args.startTime),
              q.lt(q.field("startTime"), args.endTime)
            ),
            q.and(
              q.gt(q.field("endTime"), args.startTime),
              q.lte(q.field("endTime"), args.endTime)
            ),
            q.and(
              q.lte(q.field("startTime"), args.startTime),
              q.gte(q.field("endTime"), args.endTime)
            )
          )
        )
      )
      .collect();

    if (conflicts.length > 0) {
      throw new Error("Resource is not available during the requested time");
    }

    const bookingId = await ctx.db.insert("resourceBookings", {
      resourceId: args.resourceId,
      appointmentId: args.appointmentId,
      startTime: args.startTime,
      endTime: args.endTime,
      status: "confirmed",
      notes: args.notes,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { bookingId, success: true };
  },
});

export const cancelResourceBooking = mutation({
  args: {
    bookingId: v.id("resourceBookings"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");
    const bookedResource = await ctx.db.get(booking.resourceId);
    if (!bookedResource) throw new Error("Resource not found");
    await requireClinicAccess(ctx, bookedResource.clinicId);

    await ctx.db.patch(args.bookingId, {
      status: "cancelled",
      cancellationReason: args.reason,
      cancelledAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const deleteResource = mutation({
  args: { resourceId: v.id("resources") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const resource = await ctx.db.get(args.resourceId);
    if (!resource) throw new Error("Resource not found");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    const clinic = await ctx.db.get(resource.clinicId);
    if (!clinic) throw new Error("Clinic not found");

    await requireClinicAccess(ctx, resource.clinicId, { manage: true });

    // Check for active bookings
    const activeBookings = await ctx.db
      .query("resourceBookings")
      .withIndex("by_resource_date", (q) =>
        q.eq("resourceId", args.resourceId)
      )
      .filter((q) =>
        q.and(
          q.neq(q.field("status"), "cancelled"),
          q.gte(q.field("endTime"), Date.now())
        )
      )
      .collect();

    if (activeBookings.length > 0) {
      throw new Error("Cannot delete resource with active bookings");
    }

    await ctx.db.delete(args.resourceId);
    return { success: true };
  },
});

// Utility Functions
function generateAvailabilitySlots(
  resource: Doc<"resources">,
  bookings: Doc<"resourceBookings">[],
  startDate: string,
  endDate: string
): ResourceAvailability[] {
  const availability: ResourceAvailability[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    const dayOfWeek = current
      .toLocaleDateString('en-US', { weekday: 'long' })
      .toLowerCase() as 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
    
    const dayHours = resource.operatingHours?.[dayOfWeek] as { start: string; end: string } | undefined;
    if (!dayHours || typeof dayHours !== 'object' || !dayHours.start || !dayHours.end) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    const dayBookings = bookings.filter(booking => {
      const bookingDate = new Date(booking.startTime).toISOString().split('T')[0];
      return bookingDate === dateStr;
    });

    const timeSlots = generateTimeSlots(dayHours.start, dayHours.end, dayBookings);

    availability.push({
      resourceId: resource._id,
      date: dateStr,
      timeSlots,
    });

    current.setDate(current.getDate() + 1);
  }

  return availability;
}

function generateTimeSlots(
  startTime: string,
  endTime: string,
  bookings: Doc<"resourceBookings">[]
): Array<{ startTime: string; endTime: string; isAvailable: boolean; appointmentId?: Id<"appointments"> }> {
  const slots = [];
  const slotDuration = 30; // 30-minute slots
  
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  
  let currentHour = startHour;
  let currentMinute = startMinute;
  
  while (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute)) {
    const slotStart = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
    
    // Calculate next slot time
    currentMinute += slotDuration;
    if (currentMinute >= 60) {
      currentHour += Math.floor(currentMinute / 60);
      currentMinute = currentMinute % 60;
    }
    
    const slotEnd = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
    
    // Check if slot overlaps any booking
    const toMinutes = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const slotStartMin = toMinutes(slotStart);
    const slotEndMin = toMinutes(slotEnd);

    const booking = bookings.find(b => {
      const bs = new Date(b.startTime);
      const be = new Date(b.endTime);
      const bookingStartMin = bs.getHours() * 60 + bs.getMinutes();
      const bookingEndMin = be.getHours() * 60 + be.getMinutes();
      // overlap if slot starts before booking end and slot ends after booking start
      return slotStartMin < bookingEndMin && slotEndMin > bookingStartMin;
    });
    
    slots.push({
      startTime: slotStart,
      endTime: slotEnd,
      isAvailable: !booking,
      appointmentId: booking?.appointmentId,
    });
  }
  
  return slots;
}
