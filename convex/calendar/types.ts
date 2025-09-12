import { Id } from "../_generated/dataModel";

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
  }>;
  conferenceData?: {
    createRequest?: {
      conferenceSolutionKey: { type: string };
      requestId: string;
    };
  };
  hangoutLink?: string;
}

export interface CalendarCredentials {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  scope: string;
}

export interface CalendarSyncOptions {
  userId: Id<"users">;
  calendarId?: string;
  syncDirection: "bidirectional" | "torehabify" | "tocalendar";
}

export interface AppointmentCalendarData {
  appointmentId: Id<"appointments">;
  patientEmail: string;
  patientName: string;
  physiotherapistEmail: string;
  physiotherapistName: string;
  startTime: Date;
  endTime: Date;
  type: string;
  notes?: string;
}
