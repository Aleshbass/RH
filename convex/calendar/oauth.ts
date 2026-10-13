// @ts-nocheck
import { v } from "convex/values";
import { mutation, action, query, internalAction, internalMutation, internalQuery } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { api, internal } from "../_generated/api";
import {
  calendarUserFor,
  getCallerOrNull,
  requireCaller,
  requireCalendarUserInAction,
  resolveCalendarCallerHandler,
} from "./access";

const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI!;

export interface OAuthState {
  state: string;
  userId: Id<"users">;
  redirectUri: string;
}

// Generate secure OAuth state. The state is a bearer secret: whoever holds it can attach a
// Google account to the user it was issued for, so it must be unguessable.
function generateSecureState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Generate OAuth URL for Google Calendar
export const generateAuthUrl = action({
  args: {
    // Ignored: the connection is always for the signed-in user. Kept for older clients.
    userId: v.optional(v.id("users")),
    platform: v.union(v.literal("google"), v.literal("outlook")),
    redirectUri: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    // Never honour another userId here, not even from an admin: whoever completes the
    // Google consent screen would attach their Google account to that user's calendar.
    const userId = await requireCalendarUserInAction(ctx, { allowAdminOverride: false });
    const state = generateSecureState();
    const scopes = [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ];

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${process.env.GOOGLE_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(args.redirectUri || GOOGLE_REDIRECT_URI)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scopes.join(" "))}&` +
      `state=${state}&` +
      `access_type=offline&` +
      `prompt=consent`;

    // Store state for verification
    await ctx.runMutation(internal.calendar.oauth.storeOAuthState, {
      state,
      userId,
      redirectUri: args.redirectUri || GOOGLE_REDIRECT_URI,
    });

    return { authUrl, state };
  },
});

// Connection status for the signed-in user (an admin may name another user).
// Never returns OAuth tokens to a browser; server code uses getCredentialsInternal.
// Callers only test truthiness: null when not connected (or signed out).
export const getCredentials = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const caller = await getCallerOrNull(ctx);
    if (!caller) return null;
    const credential = await ctx.db
      .query("googleCalendarCredentials")
      .withIndex("by_user_id", (q: any) => q.eq("userId", calendarUserFor(caller, args.userId)))
      .first();
    if (!credential) return null;
    return { connected: true as const, updatedAt: credential.updatedAt };
  },
});

// Internal: stored Google Calendar credentials (including tokens) for server-side API calls
export const getCredentialsInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const credential = await ctx.db
      .query("googleCalendarCredentials")
      .withIndex("by_user_id", (q: any) => q.eq("userId", args.userId))
      .first();
    return credential || null;
  },
});

// Internal: resolve the signed-in caller for actions (see ./access)
export const resolveCalendarCaller = internalQuery({
  args: {
    clerkId: v.string(),
    requestedUserId: v.optional(v.id("users")),
    allowAdminOverride: v.boolean(),
    appointmentId: v.optional(v.id("appointments")),
  },
  handler: async (ctx, args) => await resolveCalendarCallerHandler(ctx, args),
});

// Exchange authorization code for tokens
export const exchangeCode = action({
  args: {
    code: v.string(),
    state: v.string(),
  },
  handler: async (ctx: any, args: any): Promise<any> => {
    // Verify state and get associated user
    const storedState: any = await ctx.runQuery(internal.calendar.oauth.verifyOAuthState, {
      state: args.state,
    });

    if (!storedState || storedState.expiresAt < Date.now()) {
      throw new Error("Invalid OAuth state");
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code: args.code,
        grant_type: "authorization_code",
        redirect_uri: storedState.redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to exchange authorization code");
    }

    const tokenData = await tokenResponse.json() as { access_token: string; refresh_token?: string; expires_in: number; scope: string };

    // Prepare credentials, handle missing refresh_token by falling back to stored one
    const expiryDate = Date.now() + (tokenData.expires_in * 1000);
    let refreshToken = tokenData.refresh_token;
    if (!refreshToken) {
      const existing = await ctx.runQuery(internal.calendar.oauth.getCredentialsInternal, {
        userId: storedState.userId,
      });
      if (!existing || !existing.refreshToken) {
        throw new Error("No refresh token received and none stored");
      }
      refreshToken = existing.refreshToken;
    }

    await ctx.runMutation(internal.calendar.oauth.storeCredentials, {
      userId: storedState.userId,
      accessToken: tokenData.access_token,
      refreshToken,
      expiryDate,
    });

    // Clean up OAuth state
    await ctx.runMutation(internal.calendar.oauth.cleanupOAuthState, {
      state: args.state,
    });

    return { success: true, redirectUri: storedState.redirectUri, userId: storedState.userId };
  },
});

// Refresh access token (internal: only server code refreshes tokens)
export const refreshAccessToken = internalAction({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx: any, args: any) => {
    const credential = await ctx.runQuery(internal.calendar.oauth.getCredentialsInternal, {
      userId: args.userId,
    });

    if (!credential || !credential.refreshToken) {
      throw new Error("No refresh token available");
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: credential.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("[OAUTH] Token refresh failed:", errorText);
      throw new Error(`Failed to refresh access token: ${errorText}`);
    }

    const newTokens = await tokenResponse.json() as { access_token: string; expires_in: number };
    const expiryDate = Date.now() + (newTokens.expires_in * 1000);

    // Update stored credentials via mutation
    await ctx.runMutation(internal.calendar.oauth.storeCredentials, {
      userId: args.userId,
      accessToken: newTokens.access_token,
      refreshToken: credential.refreshToken,
      expiryDate,
    });

    return { success: true };
  },
});

// Store OAuth state for verification
export const storeOAuthState = internalMutation({
  args: {
    state: v.string(),
    userId: v.id("users"),
    redirectUri: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes

    await ctx.db.insert("oauthState", {
      state: args.state,
      userId: args.userId,
      redirectUri: args.redirectUri,
      createdAt: Date.now(),
      expiresAt,
    });
  },
});

// Verify OAuth state
export const verifyOAuthState = internalQuery({
  args: {
    state: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    const oauthState = await ctx.db
      .query("oauthState")
      .withIndex("by_state", (q: any) => q.eq("state", args.state))
      .unique();

    return oauthState;
  },
});

// Store Google Calendar credentials
export const storeCredentials = internalMutation({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiryDate: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("googleCalendarCredentials")
      .filter((q: any) => q.eq(q.field("userId"), args.userId))
      .first();

    const credentialData = {
      userId: args.userId,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiryDate: args.expiryDate,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, credentialData);
    } else {
      await ctx.db.insert("googleCalendarCredentials", credentialData);
    }
  },
});

// Clean up OAuth state after use
export const cleanupOAuthState = internalMutation({
  args: {
    state: v.string(),
  },
  handler: async (ctx, args) => {
    const oauthState = await ctx.db
      .query("oauthState")
      .filter((q: any) => q.eq(q.field("state"), args.state))
      .first();

    if (oauthState) {
      await ctx.db.delete(oauthState._id);
    }
  },
});

// Disconnect Google Calendar (the signed-in user's own; an admin may name another user)
export const disconnectGoogleCalendar = mutation({
  args: {
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const existing = await ctx.db
      .query("googleCalendarCredentials")
      .withIndex("by_user_id", (q: any) => q.eq("userId", calendarUserFor(caller, args.userId)))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

// Check if the signed-in user has Google Calendar connected (an admin may name another user)
export const hasGoogleCalendarConnected = query({
  args: {
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const caller = await getCallerOrNull(ctx);
    if (!caller) return false;
    const credentials = await ctx.db
      .query("googleCalendarCredentials")
      .withIndex("by_user_id", (q: any) => q.eq("userId", calendarUserFor(caller, args.userId)))
      .first();

    return !!credentials;
  },
});
