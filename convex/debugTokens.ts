import { query } from "./_generated/server";
import { ensureUserRole } from "./auth";
import { v } from "convex/values";

export const debugCallTokens = query({
  args: { callId: v.id("videoCalls") },
  handler: async (ctx, args) => {
    // Exposes call room details and participant tokens: admins only.
    await ensureUserRole(ctx, ["admin"]);
    console.log("🔍 DEBUG: Checking tokens for call:", args.callId);
    
    // Get the call
    const call = await ctx.db.get(args.callId);
    if (!call) {
      console.log("❌ Call not found");
      return { error: "Call not found" };
    }
    
    console.log("📞 Call found:", {
      id: call._id,
      dailyRoomName: call.dailyRoomName,
      dailyRoomUrl: call.dailyRoomUrl,
      createdAt: call._creationTime
    });
    
    // Get all participants for this call
    const participants = await ctx.db
      .query("videoCallParticipants")
      .withIndex("by_call_id", (q) => q.eq("callId", args.callId))
      .collect();
    
    console.log("👥 Participants found:", participants.length);
    
    const participantDetails = participants.map(p => ({
      id: p._id,
      userId: p.userId,
      role: p.role,
      hasToken: !!p.dailyMeetingToken,
      tokenLength: p.dailyMeetingToken?.length || 0,
      tokenExpiration: p.dailyTokenExpiration,
      createdAt: p._creationTime
    }));
    
    console.log("📊 Participant token details:", participantDetails);
    
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
    
    console.log("🔍 DEBUG: Checking user participation for call:", args.callId);
    console.log("👤 Current user identity:", {
      subject: identity.subject,
      email: identity.email
    });
    
    // Find user in database
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    
    if (!user) {
      console.log("❌ User not found in database");
      return { error: "User not found" };
    }
    
    console.log("✅ User found:", {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName
    });
    
    // Find participant record
    const participant = await ctx.db
      .query("videoCallParticipants")
      .withIndex("by_call_and_user", (q) => 
        q.eq("callId", args.callId).eq("userId", user._id)
      )
      .unique();
    
    if (!participant) {
      console.log("❌ Participant record not found");
      return { error: "Participant record not found" };
    }
    
    console.log("✅ Participant record found:", {
      id: participant._id,
      role: participant.role,
      hasToken: !!participant.dailyMeetingToken,
      tokenLength: participant.dailyMeetingToken?.length || 0,
      tokenExpiration: participant.dailyTokenExpiration
    });
    
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
