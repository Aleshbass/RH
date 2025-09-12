import { v } from "convex/values";

// Google Calendar OAuth credentials storage
export const googleCalendarCredentials = v.object({
  userId: v.id("users"),
  accessToken: v.string(),
  refreshToken: v.string(),
  expiryDate: v.number(), // Unix timestamp
  scope: v.string(),
  calendarIds: v.array(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

// Calendar events linked to appointments
export const calendarEvents = v.object({
  appointmentId: v.id("appointments"),
  googleEventId: v.string(),
  googleMeetLink: v.optional(v.string()),
  calendarId: v.string(),
  conferenceData: v.optional(v.any()),
  syncedAt: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

// User calendar preferences
export const calendarPreferences = v.object({
  userId: v.id("users"),
  primaryCalendarId: v.string(),
  selectedCalendarIds: v.array(v.string()),
  syncEnabled: v.boolean(),
  autoCreateMeet: v.boolean(),
  notificationPreferences: v.object({
    email: v.boolean(),
    push: v.boolean(),
  }),
});

// OAuth state for security
export const oauthState = v.object({
  state: v.string(),
  userId: v.id("users"),
  redirectUri: v.string(),
  createdAt: v.number(),
  expiresAt: v.number(),
});
