// Type definitions for calendar tables - used with main schema.ts
// These are defined here for organization but tables are in schema.ts

// Google Calendar OAuth credentials storage
export interface GoogleCalendarCredentials {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number; // Unix timestamp
  scope: string;
  calendarIds: string[];
  createdAt: number;
  updatedAt: number;
}

// Calendar events linked to appointments
export interface CalendarEvent {
  appointmentId: string;
  googleEventId: string;
  googleMeetLink?: string;
  calendarId: string;
  conferenceData?: unknown;
  syncedAt: number;
  createdAt: number;
  updatedAt: number;
}

// User calendar preferences
export interface CalendarPreferences {
  userId: string;
  primaryCalendarId: string;
  selectedCalendarIds: string[];
  syncEnabled: boolean;
  autoCreateMeet: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

// OAuth state for security
export interface OAuthState {
  state: string;
  userId: string;
  redirectUri: string;
  createdAt: number;
  expiresAt: number;
}
