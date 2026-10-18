/**
 * Who may join or end a video call. Calls booked for a patient or an appointment are limited to
 * the people on them (and admins). Ad-hoc rooms with neither stay open to anyone signed in who
 * has the room id, because sharing the id is how those rooms are shared.
 */
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

export function isPrivateCall(call: Doc<"videoCalls">) {
  return Boolean(call.appointmentId || call.patientId || call.callType === "appointment");
}

/** The call for a Stream/legacy room id, by index (room ids are the Stream call ids). */
export async function findCallByRoomId(ctx: Ctx, roomId: string) {
  return (
    (await ctx.db.query("videoCalls").withIndex("by_room_id", (q) => q.eq("roomId", roomId)).first()) ??
    (await ctx.db.query("videoCalls").withIndex("by_stream_call_id", (q) => q.eq("streamCallId", roomId)).first()) ??
    (await ctx.db.query("videoCalls").withIndex("by_daily_room_name", (q) => q.eq("dailyRoomName", roomId)).first())
  );
}

async function isOnCall(ctx: Ctx, call: Doc<"videoCalls">, user: Doc<"users">) {
  if (call.initiatorId === user._id || call.participants.includes(user._id)) return true;
  if (call.patientId === user._id || call.physiotherapistId === user._id) return true;
  if (call.appointmentId) {
    const appointment = await ctx.db.get(call.appointmentId);
    if (appointment && (appointment.patientId === user._id || appointment.physiotherapistId === user._id)) return true;
  }
  // Emailed invitations add a participant row (RSVP "invited") rather than a participants entry
  const invited = await ctx.db
    .query("videoCallParticipants")
    .withIndex("by_call_and_user", (q) => q.eq("callId", call._id).eq("userId", user._id))
    .first();
  return invited !== null;
}

export async function canJoinVideoCall(ctx: Ctx, call: Doc<"videoCalls">, user: Doc<"users">) {
  if (user.role === "admin") return true;
  return (await isOnCall(ctx, call, user)) || !isPrivateCall(call);
}

/** Ending a call for everyone: anyone on an appointment call, the host of an ad-hoc room, or an admin. */
export async function canEndVideoCall(ctx: Ctx, call: Doc<"videoCalls">, user: Doc<"users">) {
  if (user.role === "admin" || call.initiatorId === user._id) return true;
  return isPrivateCall(call) && (await isOnCall(ctx, call, user));
}
