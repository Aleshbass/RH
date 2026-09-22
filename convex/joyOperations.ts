import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

type Operation =
  | "physio_work_summary" | "physio_update_availability" | "physio_session_note"
  | "physio_visit_event" | "physio_message_patient" | "physio_feedback_request"
  | "family_resolve" | "family_grant" | "family_update_grant" | "family_revoke_grant"
  | "family_care_summary" | "change_physio_request" | "admin_patient"
  | "admin_physio" | "admin_finance_summary" | "admin_escalation"
  | "admin_verify_physio" | "admin_reassign";

const activeBooking = (status: unknown) => status === "pending" || status === "confirmed" || status === "scheduled";
const nameOf = (user: { firstName?: string; lastName?: string } | null) =>
  `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || "Rehabify user";

async function profileFor(ctx: any, profileId: string, actor?: { rh_user_id?: string }) {
  const profile = await ctx.db.get(profileId as any);
  if (!profile) throw new Error("Physiotherapist profile not found");
  if (!actor?.rh_user_id || String(profile.userId) !== actor.rh_user_id) throw new Error("Physiotherapist actor is not authorized");
  const approval = await ctx.db.query("accountApprovalStatus").withIndex("by_user_id", (q: any) => q.eq("userId", profile.userId)).first();
  if (approval?.status !== "approved") throw new Error("Physiotherapist is not eligible");
  return profile;
}

async function joyBookingForPhysio(ctx: any, bookingId: string, physioUserId: any) {
  const booking = await ctx.db.get(bookingId as any);
  if (!booking || booking.sourceSystem !== "joy_ai" || booking.physiotherapistId !== physioUserId) throw new Error("Booking not found");
  if (booking.paymentStatus !== "completed" || !booking.appointmentId) throw new Error("Booking is not a confirmed Joy appointment");
  return booking;
}

async function patientForActor(ctx: any, patientId: string, actor?: { rh_user_id?: string }) {
  if (!actor?.rh_user_id || actor.rh_user_id !== patientId) throw new Error("Patient actor is not authorized");
  const patient: any = await ctx.db.get(patientId as any);
  if (!patient || patient.role !== "patient") throw new Error("Patient not found");
  return patient;
}

async function adminForActor(ctx: any, actor?: { rh_user_id?: string }) {
  if (!actor?.rh_user_id) throw new Error("Admin actor is not authorized");
  const admin: any = await ctx.db.get(actor.rh_user_id as any);
  if (!admin || admin.role !== "admin") throw new Error("Admin actor is not authorized");
  return admin;
}

async function audit(ctx: any, args: any, operation: Operation, extra: Record<string, unknown> = {}) {
  await ctx.db.insert("joyOperationalAudit", {
    operation, requestId: String(args.request_id ?? "unknown"), createdAt: Date.now(), payload: extra,
    actorUserId: extra.actorUserId as any, patientUserId: extra.patientUserId as any,
    physiotherapistUserId: extra.physiotherapistUserId as any, bookingId: extra.bookingId as any,
    appointmentId: extra.appointmentId as any,
  });
}

/** Fixed allowlist for Phase 4/5 WhatsApp operations. */
export const executeMutation = internalMutation({
  args: { operation: v.string(), data: v.any(), requestId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const op = args.operation as Operation;
    const data = { ...(args.data ?? {}), request_id: args.requestId };

    if (op === "physio_update_availability") {
      const profile = await profileFor(ctx, String(data.physiotherapist_id), data.actor);
      const schedule = data.availability_schedule;
      if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) throw new Error("Invalid availability schedule");
      await ctx.db.patch(profile._id, { availabilitySchedule: schedule });
      await audit(ctx, data, op, { actorUserId: profile.userId, physiotherapistUserId: profile.userId, schedule });
      return { updated: true };
    }
    if (op === "physio_session_note") {
      const profile = await profileFor(ctx, String(data.physiotherapist_id), data.actor);
      const booking = await joyBookingForPhysio(ctx, String(data.booking_id), profile.userId);
      const note = String(data.note ?? "").trim();
      if (!note || note.length > 6000) throw new Error("Invalid session note");
      await ctx.db.patch(booking.appointmentId, { notesForTherapist: note });
      await audit(ctx, data, op, { actorUserId: profile.userId, physiotherapistUserId: profile.userId, patientUserId: booking.patientId, bookingId: booking._id, appointmentId: booking.appointmentId });
      return { saved: true, appointment_id: booking.appointmentId };
    }
    if (op === "physio_visit_event") {
      const profile = await profileFor(ctx, String(data.physiotherapist_id), data.actor);
      const booking = await joyBookingForPhysio(ctx, String(data.booking_id), profile.userId);
      const event = String(data.event ?? "");
      if (!["IN_TRANSIT", "ARRIVED", "DEPARTED"].includes(event)) throw new Error("Invalid visit event");
      const latitude = Number(data.latitude), longitude = Number(data.longitude), accuracy = Number(data.accuracy);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy) || accuracy < 0) throw new Error("Location and accuracy are required");
      const existing = await ctx.db.query("physiotherapistLocations").withIndex("by_physiotherapist", (q: any) => q.eq("physiotherapistId", profile.userId)).first();
      const status: "at_patient" | "in_transit" | "idle" = event === "ARRIVED" ? "at_patient" : event === "IN_TRANSIT" ? "in_transit" : "idle";
      const location = { physiotherapistId: profile.userId, latitude, longitude, accuracy, status, lastUpdated: Number(data.event_time ?? Date.now()) };
      if (existing) await ctx.db.patch(existing._id, location); else await ctx.db.insert("physiotherapistLocations", location);
      await audit(ctx, data, op, { actorUserId: profile.userId, physiotherapistUserId: profile.userId, patientUserId: booking.patientId, bookingId: booking._id, appointmentId: booking.appointmentId, event, consent: Boolean(data.patient_tracking_consent), expires_at: data.expires_at });
      return { recorded: true };
    }
    if (op === "physio_message_patient") {
      const profile = await profileFor(ctx, String(data.physiotherapist_id), data.actor);
      const booking = await joyBookingForPhysio(ctx, String(data.booking_id), profile.userId);
      const body = String(data.message ?? "").trim();
      if (!body || body.length > 2000) throw new Error("Invalid patient message");
      // The body is delivered through the signed event channel, not copied to
      // a broadly queryable operational audit record.
      await audit(ctx, data, op, { actorUserId: profile.userId, physiotherapistUserId: profile.userId, patientUserId: booking.patientId, bookingId: booking._id, appointmentId: booking.appointmentId, message_length: body.length });
      return { accepted: true, delivery_content: body, patient_id: booking.patientId };
    }
    if (op === "physio_feedback_request") {
      const profile = await profileFor(ctx, String(data.physiotherapist_id), data.actor);
      const booking = await joyBookingForPhysio(ctx, String(data.booking_id), profile.userId);
      const appointment: any = await ctx.db.get(booking.appointmentId);
      if (appointment?.status !== "completed") throw new Error("Feedback can only be requested after a completed appointment");
      const previous = await ctx.db.query("joyOperationalAudit").withIndex("by_booking", (q: any) => q.eq("bookingId", booking._id)).collect();
      if (previous.some((row: any) => row.operation === "physio_feedback_request")) return { requested: false, duplicate: true };
      await audit(ctx, data, op, { actorUserId: profile.userId, physiotherapistUserId: profile.userId, patientUserId: booking.patientId, bookingId: booking._id, appointmentId: booking.appointmentId });
      return { requested: true, patient_id: booking.patientId };
    }
    if (op === "family_grant" || op === "family_update_grant" || op === "family_revoke_grant") {
      const patientId = String(data.patient_id); const patient = await patientForActor(ctx, patientId, data.actor);
      let grant: any;
      if (op === "family_grant") {
        const phone = String(data.family_phone ?? "").trim(); if (!phone) throw new Error("Family phone is required");
        const found = await ctx.db.query("users").filter((q: any) => q.eq(q.field("phoneNumber"), phone)).collect();
        let family: any = found[0];
        if (!family) { const id = await ctx.db.insert("users", { clerkId: `joy-family:${phone}`, phoneNumber: phone, role: "family_member", onboarded: false }); family = await ctx.db.get(id); }
        grant = await ctx.db.query("familyAccessGrants").withIndex("by_patient_and_family_member", (q: any) => q.eq("patientUserId", patient._id).eq("familyMemberUserId", family._id)).first();
        const permissions = data.permission_tier === "full_access" ? ["view_progress", "book", "pay"] : ["view_progress"];
        if (grant) await ctx.db.patch(grant._id, { permissions, status: "active", relationship: String(data.relationship ?? "Family"), grantedAt: Date.now() });
        else { const id = await ctx.db.insert("familyAccessGrants", { patientUserId: patient._id, familyMemberUserId: family._id, relationship: String(data.relationship ?? "Family"), permissions, status: "active", grantedAt: Date.now() }); grant = await ctx.db.get(id); }
      } else {
        grant = await ctx.db.get(String(data.grant_id) as any);
        if (!grant || String(grant.patientUserId) !== patientId) throw new Error("Family grant not found");
        if (op === "family_revoke_grant") await ctx.db.patch(grant._id, { status: "revoked" });
        else await ctx.db.patch(grant._id, { permissions: data.permission_tier === "full_access" ? ["view_progress", "book", "pay"] : ["view_progress"], status: "active" });
      }
      await audit(ctx, data, op, { patientUserId: patient._id, payload: { grant_id: grant._id } });
      return { grant_id: grant._id, status: op === "family_revoke_grant" ? "revoked" : "active" };
    }
    if (op === "change_physio_request") {
      const patient = await patientForActor(ctx, String(data.patient_id), data.actor);
      const booking: any = await ctx.db.get(String(data.booking_id) as any);
      if (!booking || booking.sourceSystem !== "joy_ai" || String(booking.patientId) !== String(patient._id)) throw new Error("Booking not found");
      await audit(ctx, data, op, { patientUserId: patient._id, bookingId: booking._id, actorUserId: patient._id, reason: String(data.reason ?? "") });
      return { accepted: true, status: "pending_admin_review" };
    }
    if (op === "admin_escalation" || op === "admin_verify_physio" || op === "admin_reassign") {
      // These operations are intentionally records/workflow requests. They do not
      // bypass RH's existing appointment, payment, or provider-response gates.
      const admin = await adminForActor(ctx, data.actor);
      await audit(ctx, data, op, { patientUserId: data.patient_id, physiotherapistUserId: data.physiotherapist_id, bookingId: data.booking_id, actorUserId: admin._id, reason: String(data.reason ?? "") });
      return { accepted: true, status: "recorded" };
    }
    throw new Error("Unsupported Joy operational mutation");
  },
});

export const executeQuery = internalQuery({
  args: { operation: v.string(), data: v.any() },
  handler: async (ctx, args): Promise<any> => {
    const op = args.operation as Operation; const data = args.data ?? {};
    if (op === "physio_work_summary") {
      const profile = await profileFor(ctx, String(data.physiotherapist_id), data.actor);
      const bookings = await ctx.db.query("marketplaceBookings").withIndex("by_physiotherapist", (q: any) => q.eq("physiotherapistId", profile.userId)).collect();
      const relevant = bookings.filter((b: any) => b.sourceSystem === "joy_ai" && activeBooking(b.bookingStatus));
      return { physiotherapist_id: profile._id, assigned_bookings: relevant.slice(0, 10).map((b: any) => ({ booking_id: b._id, patient_id: b.patientId, start_time: b.sessionDate, provider_response: b.providerResponse, response_due_at: b.providerResponseDueAt })) };
    }
    if (op === "family_resolve") {
      const phone = String(data.family_phone ?? ""); const users: any[] = await ctx.db.query("users").filter((q: any) => q.eq(q.field("phoneNumber"), phone)).collect();
      if (users.length !== 1) return { resolution: "NO_GRANT" };
      const grants = await ctx.db.query("familyAccessGrants").withIndex("by_family_member_user_id", (q: any) => q.eq("familyMemberUserId", users[0]._id)).collect();
      const active = grants.filter((g: any) => g.status === "active" && (!g.expiresAt || g.expiresAt > Date.now()));
      return { resolution: active.length === 1 ? "MATCH" : active.length ? "MULTIPLE" : "NO_GRANT", family_user_id: users[0]._id, grants: await Promise.all(active.map(async (g: any) => ({ grant_id: g._id, patient_id: g.patientUserId, permission_tier: g.permissions.includes("book") ? "full_access" : "view_only", patient_display_name: nameOf(await ctx.db.get(g.patientUserId) as any) }))) };
    }
    if (op === "family_care_summary") {
      const grant: any = await ctx.db.get(String(data.grant_id) as any);
      if (!grant || grant.status !== "active" || !data.actor?.rh_user_id || String(grant.familyMemberUserId) !== data.actor.rh_user_id) throw new Error("Family access is not active");
      const appointments = await ctx.db.query("appointments").withIndex("by_patient_id_and_time", (q: any) => q.eq("patientId", grant.patientUserId)).order("desc").take(3);
      return { patient_id: grant.patientUserId, source_ids: appointments.map((a: any) => a._id), appointments: appointments.map((a: any) => ({ status: a.status, start_time: a.startTime, service_type: a.serviceType, notes_for_patient: a.notesForPatient })) };
    }
    if (op === "admin_patient" || op === "admin_physio" || op === "admin_finance_summary") {
      await adminForActor(ctx, data.actor);
      return { status: "available_via_existing_admin_surface" };
    }
    throw new Error("Unsupported Joy operational query");
  },
});
