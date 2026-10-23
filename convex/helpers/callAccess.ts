/**
 * Who may join, end or invite people to a video call. Every call is limited to the people on it
 * (its host, its participant list, the patient/physio it was booked for, anyone invited by email)
 * and admins. A room id alone is not enough: to bring someone in, the host invites them, and only
 * people the host may reach (mayInviteToCall) can be invited.
 */
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

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

/** Joining: the people on the call, or an admin. Knowing the room id is not enough. */
export async function canJoinVideoCall(ctx: Ctx, call: Doc<"videoCalls">, user: Doc<"users">) {
  if (user.role === "admin") return true;
  return isOnCall(ctx, call, user);
}

/** Ending a call for everyone: anyone on an appointment call, the host of an ad-hoc room, or an admin. */
export async function canEndVideoCall(ctx: Ctx, call: Doc<"videoCalls">, user: Doc<"users">) {
  if (user.role === "admin" || call.initiatorId === user._id) return true;
  return isPrivateCall(call) && (await isOnCall(ctx, call, user));
}

/** Everyone on a call, as user ids: host, participants, booked patient/physio and email invitees. */
export async function callMemberIds(ctx: Ctx, call: Doc<"videoCalls">): Promise<Id<"users">[]> {
  const ids = new Set<Id<"users">>([call.initiatorId, ...call.participants]);
  if (call.patientId) ids.add(call.patientId);
  if (call.physiotherapistId) ids.add(call.physiotherapistId);
  if (call.appointmentId) {
    const appointment = await ctx.db.get(call.appointmentId);
    if (appointment?.patientId) ids.add(appointment.patientId);
    if (appointment?.physiotherapistId) ids.add(appointment.physiotherapistId);
  }
  const invited = await ctx.db
    .query("videoCallParticipants")
    .withIndex("by_call_id", (q) => q.eq("callId", call._id))
    .take(50);
  for (const row of invited) ids.add(row.userId);
  return [...ids].filter(Boolean);
}

const CLINIC_TEAM_ROLES = new Set(["clinic_owner", "clinic_staff", "physiotherapist"]);

/** The clinic a team member works in (owner's clinic, or a clinician's/front desk's clinicId). */
export async function staffClinicId(ctx: Ctx, user: Doc<"users">): Promise<Id<"clinics"> | null> {
  if (user.role === "clinic_owner") {
    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .first();
    return clinic?._id ?? null;
  }
  if (user.clinicId && CLINIC_TEAM_ROLES.has(user.role ?? "") && (!user.status || user.status === "active")) {
    return user.clinicId;
  }
  return null;
}

async function hasActiveRelationship(ctx: Ctx, patientId: Id<"users">, physiotherapistId: Id<"users">) {
  const rows = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_patient_and_physiotherapist", (q) => q.eq("patientId", patientId).eq("physiotherapistId", physiotherapistId))
    .take(5);
  return rows.some((r) => r.status === "active");
}

async function haveBookedVisit(ctx: Ctx, patientId: Id<"users">, physiotherapistId: Id<"users">) {
  const visits = await ctx.db
    .query("appointments")
    .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", patientId))
    .order("desc")
    .take(100);
  return visits.some((a) => a.physiotherapistId === physiotherapistId);
}

/**
 * Whether `caller` may put `target` on a call: an admin; a physio and their patient (either way
 * round, with an active care relationship or a booked visit); or a clinic team member and someone
 * in the same clinic (team or patients). Patients can't pull in unrelated people.
 */
export async function mayInviteToCall(ctx: Ctx, caller: Doc<"users">, target: Doc<"users">): Promise<boolean> {
  if (caller._id === target._id || caller.role === "admin") return true;
  if (
    (await hasActiveRelationship(ctx, target._id, caller._id)) ||
    (await hasActiveRelationship(ctx, caller._id, target._id)) ||
    (await haveBookedVisit(ctx, target._id, caller._id)) ||
    (await haveBookedVisit(ctx, caller._id, target._id))
  ) {
    return true;
  }
  const callerClinic = await staffClinicId(ctx, caller);
  const targetClinic = await staffClinicId(ctx, target);
  if (callerClinic && (callerClinic === targetClinic || callerClinic === target.clinicId)) return true;
  if (targetClinic && targetClinic === caller.clinicId) return true;
  return false;
}
