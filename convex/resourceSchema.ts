import { defineTable } from "convex/server";
import { v } from "convex/values";

// Resource Management Schema - Clean implementation to avoid deep type instantiation
export const resourceTables = {
  // Resources table: Equipment, rooms, staff, vehicles
  resources: defineTable({
    clinicId: v.id("clinics"),
    name: v.string(),
    type: v.union(
      v.literal("equipment"),
      v.literal("room"),
      v.literal("staff"),
      v.literal("vehicle")
    ),
    description: v.optional(v.string()),
    category: v.optional(v.string()), // "Physical Therapy", "Occupational Therapy", etc.
    location: v.optional(v.string()), // Room number, building, etc.
    capacity: v.optional(v.number()), // Max people/patients for rooms
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
      frequency: v.union(
        v.literal("daily"),
        v.literal("weekly"),
        v.literal("monthly"),
        v.literal("quarterly"),
        v.literal("annually")
      ),
      lastMaintenance: v.optional(v.string()),
      nextMaintenance: v.optional(v.string()),
    })),
    isActive: v.boolean(),
    tags: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_clinic", ["clinicId"])
    .index("by_type", ["type"])
    .index("by_category", ["category"])
    .index("by_active", ["isActive"])
    .index("by_clinic_type", ["clinicId", "type"]),

  // Resource Bookings: Track when resources are allocated to appointments
  resourceBookings: defineTable({
    resourceId: v.id("resources"),
    appointmentId: v.id("appointments"),
    startTime: v.number(),
    endTime: v.number(),
    status: v.union(
      v.literal("confirmed"),
      v.literal("pending"),
      v.literal("cancelled")
    ),
    notes: v.optional(v.string()),
    cancellationReason: v.optional(v.string()),
    cancelledAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_resource_date", ["resourceId"])
    .index("by_appointment", ["appointmentId"])
    .index("by_status", ["status"])
    .index("by_resource_time", ["resourceId", "startTime"]),
};
