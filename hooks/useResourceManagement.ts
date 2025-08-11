import { useConvex, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

// Simple types to avoid deep instantiation issues
export interface CreateResourceParams {
  clinicId: Id<"clinics">;
  name: string;
  type: "equipment" | "room" | "staff" | "vehicle";
  description?: string;
  category?: string;
  location?: string;
  capacity?: number;
  specifications?: {
    brand?: string;
    model?: string;
    serialNumber?: string;
    purchaseDate?: string;
    warrantyExpiry?: string;
  };
  operatingHours?: {
    monday?: { start: string; end: string };
    tuesday?: { start: string; end: string };
    wednesday?: { start: string; end: string };
    thursday?: { start: string; end: string };
    friday?: { start: string; end: string };
    saturday?: { start: string; end: string };
    sunday?: { start: string; end: string };
  };
  maintenanceSchedule?: {
    frequency: "daily" | "weekly" | "monthly" | "quarterly" | "annually";
    lastMaintenance?: string;
    nextMaintenance?: string;
  };
  tags?: string[];
}

export interface UpdateResourceParams {
  name?: string;
  description?: string;
  category?: string;
  location?: string;
  capacity?: number;
  specifications?: {
    brand?: string;
    model?: string;
    serialNumber?: string;
    purchaseDate?: string;
    warrantyExpiry?: string;
  };
  operatingHours?: {
    monday?: { start: string; end: string };
    tuesday?: { start: string; end: string };
    wednesday?: { start: string; end: string };
    thursday?: { start: string; end: string };
    friday?: { start: string; end: string };
    saturday?: { start: string; end: string };
    sunday?: { start: string; end: string };
  };
  maintenanceSchedule?: {
    frequency: "daily" | "weekly" | "monthly" | "quarterly" | "annually";
    lastMaintenance?: string;
    nextMaintenance?: string;
  };
  isActive?: boolean;
  tags?: string[];
}

export interface BookResourceParams {
  resourceId: Id<"resources">;
  appointmentId: Id<"appointments">;
  startTime: number;
  endTime: number;
  notes?: string;
}

export interface ResourceFilters {
  clinicId: Id<"clinics">;
  type?: "equipment" | "room" | "staff" | "vehicle";
  isActive?: boolean;
}

export interface AvailabilityParams {
  resourceId: Id<"resources">;
  startDate: string;
  endDate: string;
}

export interface BookingFilters {
  resourceId?: Id<"resources">;
  appointmentId?: Id<"appointments">;
  clinicId?: Id<"clinics">;
  startDate?: string;
  endDate?: string;
}

export function useResourceManagement() {
  // Convex client for imperative queries
  const convex = useConvex();

  // Mutations
  const createResourceMutation = useMutation(api.resourceManagement.createResource);
  const updateResourceMutation = useMutation(api.resourceManagement.updateResource);
  const bookResourceMutation = useMutation(api.resourceManagement.bookResource);
  const cancelBookingMutation = useMutation(api.resourceManagement.cancelResourceBooking);
  const deleteResourceMutation = useMutation(api.resourceManagement.deleteResource);

  // Resource Management Functions
  const fetchResources = (filters: ResourceFilters) => {
    return convex.query(api.resourceManagement.getResources, filters);
  };

  const fetchResourceById = (resourceId: Id<"resources">) => {
    return convex.query(api.resourceManagement.getResourceById, { resourceId });
  };

  const fetchResourceAvailability = (params: AvailabilityParams) => {
    return convex.query(api.resourceManagement.getResourceAvailability, params);
  };

  const fetchResourceBookings = (filters: BookingFilters) => {
    return convex.query(api.resourceManagement.getResourceBookings, filters);
  };

  const createResource = async (params: CreateResourceParams) => {
    try {
      const result = await createResourceMutation(params);
      return result;
    } catch (error) {
      console.error("Failed to create resource:", error);
      throw error;
    }
  };

  const updateResource = async (resourceId: Id<"resources">, updates: UpdateResourceParams) => {
    try {
      const result = await updateResourceMutation({ resourceId, updates });
      return result;
    } catch (error) {
      console.error("Failed to update resource:", error);
      throw error;
    }
  };

  const bookResource = async (params: BookResourceParams) => {
    try {
      const result = await bookResourceMutation(params);
      return result;
    } catch (error) {
      console.error("Failed to book resource:", error);
      throw error;
    }
  };

  const cancelBooking = async (bookingId: Id<"resourceBookings">, reason?: string) => {
    try {
      const result = await cancelBookingMutation({ bookingId, reason });
      return result;
    } catch (error) {
      console.error("Failed to cancel booking:", error);
      throw error;
    }
  };

  const deleteResource = async (resourceId: Id<"resources">) => {
    try {
      const result = await deleteResourceMutation({ resourceId });
      return result;
    } catch (error) {
      console.error("Failed to delete resource:", error);
      throw error;
    }
  };

  // Real-time availability checking
  const checkResourceAvailability = async (params: {
    resourceId: Id<"resources">;
    startTime: number;
    endTime: number;
    excludeAppointmentId?: Id<"appointments">;
  }) => {
    try {
      // Get resource details
      const resource = await fetchResourceById(params.resourceId);
      const r: any = resource;
      if (!r || !r.isActive) {
        return false;
      }

      // Check operating hours
      if (r?.operatingHours) {
        const startDate = new Date(params.startTime);
        const dayOfWeek = startDate.getDay();
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = dayNames[dayOfWeek] as keyof typeof r.operatingHours;
        
        const daySchedule = r.operatingHours[dayName];
        if (!daySchedule) {
          return false; // Not operating on this day
        }

        const startHour = startDate.getHours();
        const startMinute = startDate.getMinutes();
        const startTimeMinutes = startHour * 60 + startMinute;
        
        const [opStartHour, opStartMinute] = daySchedule.start.split(':').map(Number);
        const [opEndHour, opEndMinute] = daySchedule.end.split(':').map(Number);
        const opStartMinutes = opStartHour * 60 + opStartMinute;
        const opEndMinutes = opEndHour * 60 + opEndMinute;
        
        if (startTimeMinutes < opStartMinutes || startTimeMinutes >= opEndMinutes) {
          return false; // Outside operating hours
        }
      }

      // Check for maintenance conflicts
      if (r?.maintenanceSchedule) {
        const next = (r.maintenanceSchedule as any).nextMaintenance as string | undefined;
        if (next) {
          const maintenanceStart = new Date(next).getTime();
          const maintenanceEnd = maintenanceStart + (2 * 60 * 60 * 1000); // Assume 2-hour maintenance
          const overlaps = params.startTime < maintenanceEnd && params.endTime > maintenanceStart;
          if (overlaps) {
            return false;
          }
        }
      }

      // Check for booking conflicts
      const existingBookings = await fetchResourceBookings({
        resourceId: params.resourceId,
        startDate: new Date(params.startTime - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endDate: new Date(params.endTime + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      });

      const hasBookingConflict = existingBookings?.some((booking: any) => {
        // Skip if this is the same appointment being updated
        if (params.excludeAppointmentId && booking.appointmentId === params.excludeAppointmentId) {
          return false;
        }
        
        return (
          booking.status !== 'cancelled' &&
          params.startTime < booking.endTime &&
          params.endTime > booking.startTime
        );
      });

      return !hasBookingConflict;
    } catch (error) {
      console.error("Failed to check resource availability:", error);
      return false;
    }
  };

  // Get multiple resources with availability status
  const getResourcesWithAvailability = async (params: {
    clinicId: Id<"clinics">;
    startTime: number;
    endTime: number;
    type?: "equipment" | "room" | "staff" | "vehicle";
  }) => {
    try {
      const resources = await fetchResources({
        clinicId: params.clinicId,
        type: params.type,
        isActive: true,
      });

      if (!resources) return [];

      const resourcesWithAvailability = await Promise.all(
        resources.map(async (resource: any) => {
          const isAvailable = await checkResourceAvailability({
            resourceId: resource._id,
            startTime: params.startTime,
            endTime: params.endTime,
          });
          
          return {
            ...resource,
            isAvailable,
          };
        })
      );

      return resourcesWithAvailability;
    } catch (error) {
      console.error("Failed to get resources with availability:", error);
      return [];
    }
  };

  // Bulk availability check for multiple resources
  const checkMultipleResourcesAvailability = async (params: {
    resourceIds: Id<"resources">[];
    startTime: number;
    endTime: number;
    excludeAppointmentId?: Id<"appointments">;
  }) => {
    try {
      const availabilityResults = await Promise.all(
        params.resourceIds.map(async (resourceId) => {
          const isAvailable = await checkResourceAvailability({
            resourceId,
            startTime: params.startTime,
            endTime: params.endTime,
            excludeAppointmentId: params.excludeAppointmentId,
          });
          
          return {
            resourceId,
            isAvailable,
          };
        })
      );

      return availabilityResults;
    } catch (error) {
      console.error("Failed to check multiple resources availability:", error);
      return params.resourceIds.map(resourceId => ({
        resourceId,
        isAvailable: false,
      }));
    }
  };

  return {
    // Query functions
    fetchResources,
    fetchResourceById,
    fetchResourceAvailability,
    fetchResourceBookings,
    
    // Mutation functions
    createResource,
    updateResource,
    bookResource,
    cancelBooking,
    deleteResource,
    
    // Availability checking functions
    checkResourceAvailability,
    getResourcesWithAvailability,
    checkMultipleResourcesAvailability,
  };
}

// Utility functions for resource management
export const resourceUtils = {
  // Format resource type for display
  formatResourceType: (type: string): string => {
    const typeMap: Record<string, string> = {
      equipment: "Equipment",
      room: "Room",
      staff: "Staff",
      vehicle: "Vehicle",
    };
    return typeMap[type] || type;
  },

  // Format operating hours for display
  formatOperatingHours: (hours?: any): string => {
    if (!hours) return "Not specified";
    
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    
    const activeDays = days
      .map((day, index) => hours[day] ? `${dayNames[index]} ${hours[day].start}-${hours[day].end}` : null)
      .filter(Boolean);
    
    return activeDays.length > 0 ? activeDays.join(", ") : "Not specified";
  },

  // Check if resource is available at a specific time
  isResourceAvailable: (bookings: any[], startTime: number, endTime: number): boolean => {
    return !bookings.some(booking => 
      booking.status !== "cancelled" &&
      ((startTime >= booking.startTime && startTime < booking.endTime) ||
       (endTime > booking.startTime && endTime <= booking.endTime) ||
       (startTime <= booking.startTime && endTime >= booking.endTime))
    );
  },

  // Get resource utilization percentage
  getUtilizationRate: (bookings: any[], totalHours: number): number => {
    const bookedHours = bookings
      .filter(booking => booking.status === "confirmed")
      .reduce((total, booking) => {
        const duration = (booking.endTime - booking.startTime) / (1000 * 60 * 60); // Convert to hours
        return total + duration;
      }, 0);
    
    return totalHours > 0 ? Math.round((bookedHours / totalHours) * 100) : 0;
  },

  // Validate resource booking
  validateBooking: (startTime: number, endTime: number): string[] => {
    const errors: string[] = [];
    
    if (startTime >= endTime) {
      errors.push("Start time must be before end time");
    }
    
    if (startTime < Date.now()) {
      errors.push("Cannot book resources in the past");
    }
    
    const duration = (endTime - startTime) / (1000 * 60); // Duration in minutes
    if (duration < 15) {
      errors.push("Booking duration must be at least 15 minutes");
    }
    
    if (duration > 8 * 60) { // 8 hours
      errors.push("Booking duration cannot exceed 8 hours");
    }
    
    return errors;
  },

  // Format maintenance schedule
  formatMaintenanceSchedule: (schedule?: any): string => {
    if (!schedule) return "No maintenance scheduled";
    
    const frequencyMap: Record<string, string> = {
      daily: "Daily",
      weekly: "Weekly",
      monthly: "Monthly",
      quarterly: "Quarterly",
      annually: "Annually",
    };
    
    const frequency = frequencyMap[schedule.frequency] || schedule.frequency;
    const next = schedule.nextMaintenance ? ` (Next: ${schedule.nextMaintenance})` : "";
    
    return `${frequency}${next}`;
  },

  // Get resource status based on maintenance and activity
  getResourceStatus: (resource: any): { status: string; color: string; description: string } => {
    if (!resource.isActive) {
      return { status: "Inactive", color: "gray", description: "Resource is currently inactive" };
    }
    
    if (resource.maintenanceSchedule?.nextMaintenance) {
      const nextMaintenance = new Date(resource.maintenanceSchedule.nextMaintenance);
      const now = new Date();
      const daysUntilMaintenance = Math.ceil((nextMaintenance.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilMaintenance <= 0) {
        return { status: "Maintenance Due", color: "red", description: "Maintenance is overdue" };
      } else if (daysUntilMaintenance <= 7) {
        return { status: "Maintenance Soon", color: "yellow", description: `Maintenance due in ${daysUntilMaintenance} days` };
      }
    }
    
    return { status: "Available", color: "green", description: "Resource is available for booking" };
  },
};
