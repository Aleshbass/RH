// @ts-nocheck
import { v } from "convex/values";
import { mutation, action, query } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { api, internal } from "../_generated/api";

const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI!;

export interface OAuthState {
  state: string;
  userId: Id<"users">;
  redirectUri: string;
}

// Generate secure OAuth state
function generateSecureState(): string {
  return Math.random().toString(36).substring(2, 15);
}

// Generate OAuth URL for Google Calendar
export const generateAuthUrl = action({
  args: {
    userId: v.id("users"),
    platform: v.union(v.literal("google"), v.literal("outlook")),
    redirectUri: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
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
      userId: args.userId,
      redirectUri: args.redirectUri || GOOGLE_REDIRECT_URI,
    });

    return { authUrl, state };
  },
});

// Internal: Get stored Google Calendar credentials for a user
export const getCredentials = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const credential = await ctx.db
      .query("googleCalendarCredentials")
      .filter((q: any) => q.eq(q.field("userId"), args.userId))
      .first();
    return credential || null;
  },
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

    if (!storedState) {
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
      const existing = await ctx.runQuery(internal.calendar.oauth.getCredentials, {
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

// Refresh access token
export const refreshAccessToken = action({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx: any, args: any) => {
    const credential = await ctx.runQuery(internal.calendar.oauth.getCredentials, {
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
      throw new Error("Failed to refresh access token");
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
export const storeOAuthState = mutation({
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
export const verifyOAuthState = query({
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
export const storeCredentials = mutation({
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
export const cleanupOAuthState = mutation({
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
