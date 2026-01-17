// @ts-nocheck
"use node";

import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import type { GoogleCalendarEvent, CalendarCredentials } from "./types";
import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

export function createOAuthClient() {
  return new OAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export async function getAuthenticatedClient(accessToken: string, refreshToken?: string) {
  const client = createOAuthClient();
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return client;
}

export async function createCalendarEvent(
  client: OAuth2Client,
  calendarId: string,
  event: GoogleCalendarEvent
) {
  const calendar = google.calendar({ version: "v3", auth: client });

  const response = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: event.summary,
      description: event.description,
      start: {
        dateTime: event.start.dateTime,
        timeZone: event.start.timeZone,
      },
      end: {
        dateTime: event.end.dateTime,
        timeZone: event.end.timeZone,
      },
      attendees: event.attendees,
      conferenceData: event.conferenceData,
    },
    conferenceDataVersion: 1,
  });

  return response.data;
}

export async function updateCalendarEvent(
  client: OAuth2Client,
  calendarId: string,
  eventId: string,
  event: Partial<GoogleCalendarEvent>
) {
  const calendar = calendar_v3({ version: "v3", auth: client });

  const response = await calendar.events.update({
    calendarId,
    eventId,
    requestBody: event,
  });

  return response.data;
}

export async function deleteCalendarEvent(
  client: OAuth2Client,
  calendarId: string,
  eventId: string
) {
  const calendar = calendar_v3({ version: "v3", auth: client });

  await calendar.events.delete({
    calendarId,
    eventId,
  });
}

export async function getCalendarEvents(
  client: OAuth2Client,
  calendarId: string,
  timeMin?: string,
  timeMax?: string
) {
  const calendar = calendar_v3({ version: "v3", auth: client });

  const response = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });

  return response.data.items || [];
}

export async function getCalendarList(client: OAuth2Client) {
  const calendar = calendar_v3({ version: "v3", auth: client });

  const response = await calendar.calendarList.list();
  return response.data.items || [];
}

export async function refreshAccessToken(refreshToken: string) {
  const client = createOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });

  const response = await client.refreshAccessToken();
  return response.credentials;
}

// Node actions for OAuth flows and Calendar operations
export const oauthGenerateAuthUrl = action({
  args: { state: v.string(), redirectUri: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ authUrl: string }> => {
    const client = new OAuth2Client(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      args.redirectUri || process.env.GOOGLE_REDIRECT_URI
    );
    const authUrl = client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
      ],
      prompt: "consent",
      state: args.state,
      include_granted_scopes: true,
    });
    return { authUrl };
  },
});

export const oauthExchangeCodeForTokens = action({
  args: { code: v.string(), redirectUri: v.optional(v.string()) },
  handler: async (ctx, args): Promise<any> => {
    const client = new OAuth2Client(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      args.redirectUri || process.env.GOOGLE_REDIRECT_URI
    );
    const { tokens } = await client.getToken(args.code);
    return tokens;
  },
});

export const oauthRefreshAccessToken = action({
  args: { refreshToken: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const client = new OAuth2Client(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    client.setCredentials({ refresh_token: args.refreshToken });
    const response = await client.refreshAccessToken();
    return response.credentials;
  },
});

// List user's calendars
export const listCalendars = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<any> => {
    const client = await getClientForUser(ctx, args.userId);
    return await getCalendarList(client);
  },
});

// Helper: Get authenticated OAuth client for a user
async function getClientForUser(ctx: any, userId: string) {
  console.log("[GET CLIENT] Fetching credentials for user:", userId);
  let credentials = await ctx.runQuery(internal.calendar.oauth.getCredentials, { userId });

  if (!credentials) {
    console.error("[GET CLIENT] NO CREDENTIALS FOUND for user:", userId);
    throw new Error("Calendar credentials not found. Please connect your Google Calendar in Settings.");
  }

  console.log("[GET CLIENT] Credentials found, expiry:", new Date(credentials.expiryDate).toISOString());

  // Refresh if expiring soon (5 min buffer)
  if (credentials.expiryDate < Date.now() + 5 * 60 * 1000) {
    console.log("[GET CLIENT] Token expiring soon, refreshing...");
    await ctx.runAction(internal.calendar.oauth.refreshAccessToken, {
      userId,
    });
    credentials = await ctx.runQuery(internal.calendar.oauth.getCredentials, { userId });
    if (!credentials) throw new Error("Failed to refresh credentials");
    console.log("[GET CLIENT] Token refreshed successfully");
  }

  const client = createOAuthClient();
  client.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
  });

  console.log("[GET CLIENT] OAuth client created successfully");
  return client;
}


// Create a calendar event
export const createEvent = action({
  args: {
    userId: v.id("users"),
    appointmentId: v.id("appointments"),
    summary: v.string(),
    description: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.number(),
    attendees: v.optional(v.array(v.object({
      email: v.string(),
      displayName: v.optional(v.string()),
    }))),
    createMeetLink: v.optional(v.boolean()),
    calendarId: v.optional(v.string()),
    timeZone: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ eventId: string; meetLink?: string }> => {
    console.log("[NODE ACTIONS] createEvent called");
    console.log("[NODE ACTIONS] User ID:", args.userId);
    console.log("[NODE ACTIONS] Create Meet Link:", args.createMeetLink);

    try {
      const client = await getClientForUser(ctx, args.userId);
      console.log("[NODE ACTIONS] Got OAuth client successfully");

      const calendar = google.calendar({ version: "v3", auth: client });

      const requestBody: any = {
        summary: args.summary,
        description: args.description,
        start: {
          dateTime: new Date(args.startTime).toISOString(),
          timeZone: args.timeZone || "Africa/Lagos",
        },
        end: {
          dateTime: new Date(args.endTime).toISOString(),
          timeZone: args.timeZone || "Africa/Lagos",
        },
        attendees: args.attendees?.map((a) => ({
          email: a.email,
          displayName: a.displayName,
          responseStatus: "needsAction",
        })),
        reminders: {
          useDefault: false,
          overrides: [
            { method: "email", minutes: 1440 },
            { method: "popup", minutes: 60 },
            { method: "popup", minutes: 15 },
          ],
        },
      };

      if (args.createMeetLink) {
        requestBody.conferenceData = {
          createRequest: {
            conferenceSolutionKey: { type: "hangoutsMeet" },
            requestId: args.appointmentId.toString(),
          },
        };
      }

      const response = await calendar.events.insert({
        calendarId: args.calendarId || "primary",
        requestBody,
        conferenceDataVersion: 1,
        sendUpdates: "all",
      });

      const eventId = response.data.id!;
      const hangoutLink = response.data.hangoutLink;
      const htmlLink = response.data.htmlLink;

      console.log("[NODE ACTIONS] Event created:", eventId);
      console.log("[NODE ACTIONS] Hangout Link:", hangoutLink);
      console.log("[NODE ACTIONS] Calendar Link:", htmlLink);

      // Save the meet link to the appointment
      if (hangoutLink) {
        await ctx.runMutation(internal.calendar.mutations.updateAppointmentMeetLink, {
          appointmentId: args.appointmentId,
          googleMeetLink: hangoutLink,
          googleCalendarEventId: eventId,
          googleCalendarLink: htmlLink || undefined,
        });
      }

      return {
        id: eventId,
        hangoutLink,
        htmlLink,
        conferenceData: response.data.conferenceData,
      };
    } catch (error) {
      console.error("[NODE ACTIONS] Error creating calendar event:", error);
      throw error;
    }
  },
});

// Update a calendar event
export const updateEvent = action({
  args: {
    userId: v.id("users"),
    eventId: v.string(),
    calendarId: v.optional(v.string()),
    summary: v.optional(v.string()),
    description: v.optional(v.string()),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    attendees: v.optional(v.array(v.object({
      email: v.string(),
      displayName: v.optional(v.string()),
    }))),
    timeZone: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const client = await getClientForUser(ctx, args.userId);
    const calendar = calendar_v3({ version: "v3", auth: client });

    const requestBody: any = {};
    if (args.summary) requestBody.summary = args.summary;
    if (args.description) requestBody.description = args.description;
    if (args.startTime) {
      requestBody.start = {
        dateTime: new Date(args.startTime).toISOString(),
        timeZone: args.timeZone || "Africa/Lagos",
      };
    }
    if (args.endTime) {
      requestBody.end = {
        dateTime: new Date(args.endTime).toISOString(),
        timeZone: args.timeZone || "Africa/Lagos",
      };
    }
    if (args.attendees) {
      requestBody.attendees = args.attendees.map((a) => ({
        email: a.email,
        displayName: a.displayName,
        responseStatus: "needsAction",
      }));
    }

    await calendar.events.patch({
      calendarId: args.calendarId || "primary",
      eventId: args.eventId,
      requestBody,
      sendUpdates: "all",
    });

    return { success: true };
  },
});

// Delete a calendar event
export const deleteEvent = action({
  args: {
    userId: v.id("users"),
    eventId: v.string(),
    calendarId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const client = await getClientForUser(ctx, args.userId);
    const calendar = calendar_v3({ version: "v3", auth: client });
    await calendar.events.delete({
      calendarId: args.calendarId || "primary",
      eventId: args.eventId,
      sendUpdates: "all",
    });
    return { success: true };
  },
});

// Setup a watch channel for Google Calendar push notifications
export const setupWatch = action({
  args: {
    userId: v.id("users"),
    calendarId: v.string(),
    webhookUrl: v.string(),
    channelId: v.string(),
    token: v.optional(v.string()),
    ttlSeconds: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ resourceId: string; expiration: number }> => {
    const client = await getClientForUser(ctx, args.userId);
    const calendar = calendar_v3({ version: "v3", auth: client });

    const watchRequest: any = {
      id: args.channelId,
      type: "web_hook",
      address: args.webhookUrl,
      token: args.token,
      params: {
        ttl: String(args.ttlSeconds ?? 86400),
      },
    };

    const resp = await calendar.events.watch({
      calendarId: args.calendarId || "primary",
      requestBody: watchRequest,
    });

    const resourceId = resp.data.resourceId as string;
    const expirationMs = resp.data.expiration
      ? Number(resp.data.expiration)
      : Date.now() + (args.ttlSeconds ?? 86400) * 1000;
    return { resourceId, expiration: expirationMs };
  },
});

// List calendar events for date range
export const getEvents = action({
  args: {
    userId: v.id("users"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    calendarId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const client = await getClientForUser(ctx, args.userId);
    const calendar = calendar_v3({ version: "v3", auth: client });

    const timeMin = args.startDate
      ? new Date(args.startDate).toISOString()
      : new Date().toISOString();
    const timeMax = args.endDate
      ? new Date(args.endDate).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const response = await calendar.events.list({
      calendarId: args.calendarId || "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
    });

    return response.data.items || [];
  },
});

// Get free/busy information from Google Calendar
// This is used to check for conflicts with personal calendar events
export const getFreeBusy = action({
  args: {
    userId: v.id("users"),
    timeMin: v.number(), // Unix timestamp
    timeMax: v.number(), // Unix timestamp
    calendarId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Array<{ start: number; end: number }>> => {
    try {
      const client = await getClientForUser(ctx, args.userId);
      const calendar = google.calendar({ version: "v3", auth: client });

      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin: new Date(args.timeMin).toISOString(),
          timeMax: new Date(args.timeMax).toISOString(),
          items: [{ id: args.calendarId || "primary" }],
        },
      });

      const calendarId = args.calendarId || "primary";
      const busyBlocks = response.data.calendars?.[calendarId]?.busy || [];

      return busyBlocks.map((block) => ({
        start: new Date(block.start!).getTime(),
        end: new Date(block.end!).getTime(),
      }));
    } catch (error) {
      console.error("[FREEBUSY] Error fetching busy times:", error);
      // Return empty array on error - don't block booking
      return [];
    }
  },
});
