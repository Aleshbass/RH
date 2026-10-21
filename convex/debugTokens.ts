import { query } from "./_generated/server";
import { ensureUserRole } from "./auth";
import { v } from "convex/values";

export const debugCallTokens = query({
  args: { callId: v.id("videoCalls") },
  handler: async (ctx, args) => {
    // Exposes call room details and participant tokens: admins only.
    await ensureUserRole(ctx, ["admin"]);
    
    // Get the call
    const call = await ctx.db.get(args.callId);
    if (!call) {
      return { error: "Call not found" };
    }
    
    
    // Get all participants for this call
    const participants = await ctx.db
      .query("videoCallParticipants")
      .withIndex("by_call_id", (q) => q.eq("callId", args.callId))
      .collect();
    
    
    const participantDetails = participants.map(p => ({
      id: p._id,
      userId: p.userId,
      role: p.role,
      hasToken: !!p.dailyMeetingToken,
      tokenLength: p.dailyMeetingToken?.length || 0,
      tokenExpiration: p.dailyTokenExpiration,
      createdAt: p._creationTime
    }));
    
    
    return {
      call: {
        id: call._id,
        dailyRoomName: call.dailyRoomName,
        dailyRoomUrl: call.dailyRoomUrl,
        createdAt: call._creationTime
      },
      participants: participantDetails,
      summary: {
        totalParticipants: participants.length,
        participantsWithTokens: participants.filter(p => p.dailyMeetingToken).length,
        participantsWithoutTokens: participants.filter(p => !p.dailyMeetingToken).length
      }
    };
  },
});

export const debugUserParticipation = query({
  args: { callId: v.id("videoCalls") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { error: "Not authenticated" };
    }
    
    
    // Find user in database
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    
    if (!user) {
      return { error: "User not found" };
    }
    
    
    // Find participant record
    const participant = await ctx.db
      .query("videoCallParticipants")
      .withIndex("by_call_and_user", (q) => 
        q.eq("callId", args.callId).eq("userId", user._id)
      )
      .unique();
    
    if (!participant) {
      return { error: "Participant record not found" };
    }
    
    
    return {
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      participant: {
        id: participant._id,
        role: participant.role,
        hasToken: !!participant.dailyMeetingToken,
        tokenLength: participant.dailyMeetingToken?.length || 0,
        tokenExpiration: participant.dailyTokenExpiration
      }
    };
  },
});
