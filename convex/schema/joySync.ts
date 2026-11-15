import { defineTable } from "convex/server";
import { v } from "convex/values";

export const joySyncTables = {
  // What Joy last told a WhatsApp patient about a visit (convex/joySync.ts). Every 5 minutes the
  // sync compares upcoming appointments with this row and tells Joy about any new visit, move or
  // cancellation, whichever page or path made it (Nov 2026 audit: most website paths told Joy
  // nothing, so patients weren't told and Joy's reminders went out at the old time).
  joyAppointmentNotices: defineTable({
    appointmentId: v.id("appointments"),
    patientId: v.id("users"),
    startTime: v.number(),
    cancelled: v.boolean(),
    updatedAt: v.number(),
  }).index("by_appointment", ["appointmentId"]),
};
