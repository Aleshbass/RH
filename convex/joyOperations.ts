import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { publicAppUrl } from "./helpers/appUrl";
import { missingPolicies, recordMissingPolicyAcceptances } from "./helpers/policyAcceptance";
import { recoveryPlanForJoy } from "./helpers/patientPlans";
import { PATIENT_CONSENT_POLICIES, POLICIES, consentDocumentsForJoy } from "../lib/policies";
import { assertJoyActorPersona } from "../lib/joy-integration/operationPersona";
import { normalizePhone } from "./helpers/partnerShared";
import {
  LINK_CODE_MAX_ATTEMPTS, LINK_CODE_TTL_MS, LINK_REQUESTS_PER_HOUR, emailHint, hashLinkCode,
  isPlaceholderUser, linkableEmail, patientsByPhone, sixDigitCode,
} from "./helpers/whatsappLink";
import { ZONE_CITY_STATE } from "./helpers/startingZones";
import { insertLog, patientProgramView, startOfLagosDay } from "./exercisePrograms";
import { posterUrl } from "./exerciseLibraryCatalog";
import { assertProgramUnlocked } from "./helpers/patientPlans";
import { insertNotification } from "./helpers/pushNotify";
import { recordPatientCheckIn } from "./physioCare";

type Operation =
  | "physio_work_summary" | "physio_update_availability" | "physio_session_note"
  | "physio_visit_event" | "physio_message_patient" | "physio_feedback_request"
  | "family_resolve" | "family_grant" | "family_update_grant" | "family_revoke_grant"
  | "family_care_summary" | "change_physio_request" | "admin_patient"
  | "admin_physio" | "admin_finance_summary" | "admin_escalation"
  | "admin_verify_physio" | "admin_reassign" | "patient_link_referral"
  // Additive (Oct 2026), patient persona, see the comment above executeQuery:
  | "patient_consent_status" | "patient_record_consents" | "patient_recovery_plan"
  // Additive (Nov 2026): link the WhatsApp number to a website account with an emailed code
  | "patient_link_request" | "patient_link_confirm"
  // Additive (Nov 2026): home-visit areas by city, for Joy's area list and sign-up form
  | "service_areas"
  // Additive (Nov 2026): answers from Joy's WhatsApp sign-up form
  | "patient_update_profile"
  // Additive (Nov 2026): the physio's exercise programme on WhatsApp, and DONE replies
  | "patient_programme" | "patient_log_exercise"
  // Additive (Nov 2026): the patient asked Joy for a person ("call me", "talk to someone")
  | "patient_request_callback"
  // Additive (Nov 2026): a pain and progress check-in from WhatsApp, for the physio
  | "patient_check_in";

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
    assertJoyActorPersona(op, data.actor);

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
      // Delivered here so the direct gateway path and the Next route both reach the patient;
      // the event is queued in the outbox first, so the retry cron covers a Joy outage.
      const eventKey = args.requestId && args.requestId !== "unknown" ? args.requestId : `${booking._id}-${Date.now()}`;
      await ctx.scheduler.runAfter(0, (internal as any).joyIntegration.deliverJoyEvent, {
        eventId: `physio-message-${eventKey}`, eventType: "physio.patient_message",
        data: { booking_id: String(booking._id), patient_id: String(booking.patientId), message: body },
      });
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
        const found = await ctx.db.query("users").withIndex("by_phone_number", (q: any) => q.eq("phoneNumber", phone)).collect();
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
    if (op === "patient_link_referral") {
      const trackingCode = String(data.tracking_code ?? data.trackingCode ?? "").trim();
      const phone = String(data.phone ?? "").trim();
      if (!trackingCode || !phone) throw new Error("Tracking code and phone are required");
      return await ctx.runMutation((internal as any).joyIntegration.linkTrackingCodeToWhatsAppInternal, {
        trackingCode,
        phone,
        joyPersonId: data.joy_person_id ? String(data.joy_person_id) : undefined,
        name: data.name ? String(data.name) : undefined,
        email: data.email ? String(data.email) : undefined,
        message: data.message ? String(data.message) : undefined,
      });
    }
    if (op === "patient_record_consents") {
      // Terms and Privacy accepted on WhatsApp at the first chat (a health_data entry from older
      // templates is ignored). data.accepted = { terms: "<version>", privacy: "<version>" } with
      // the versions Joy showed (GET /api/v1/joy/policy/consents). Append-only, channel "whatsapp".
      const patient = await patientForActor(ctx, String(data.patient_id), data.actor);
      const accepted: Record<string, string> = {};
      if (data.accepted && typeof data.accepted === "object" && !Array.isArray(data.accepted)) {
        for (const [key, value] of Object.entries(data.accepted)) if (typeof value === "string") accepted[key] = value;
      }
      const missing = await missingPolicies(ctx, patient._id, PATIENT_CONSENT_POLICIES);
      const current = missing.filter((id) => accepted[id] === POLICIES[id].version);
      const outdated = missing.filter((id) => accepted[id] !== undefined && accepted[id] !== POLICIES[id].version);
      const conversationId = typeof data.conversation_id === "string" ? data.conversation_id.slice(0, 200) : undefined;
      const recorded = current.length
        ? await recordMissingPolicyAcceptances(ctx, {
            user: patient,
            documents: current,
            accepted,
            channel: "whatsapp",
            contextType: "joy_conversation",
            contextId: conversationId,
          })
        : [];
      await audit(ctx, data, op, { patientUserId: patient._id, actorUserId: patient._id, recorded, outdated });
      const stillNeeded = missing.filter((id) => !recorded.includes(id));
      return {
        recorded,
        // Versions Joy sent that are no longer current: show the documents again and resend
        outdated,
        consents_required: consentDocumentsForJoy(stillNeeded, publicAppUrl()),
      };
    }
    if (op === "patient_update_profile") {
      // Answers from Joy's WhatsApp sign-up form. Fills the WhatsApp-only record; on a website
      // account it only fills blanks, so it never overwrites what the owner entered themselves.
      const patient = await patientForActor(ctx, String(data.patient_id), data.actor);
      const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
      const joyRecord = String(patient.clerkId ?? "").startsWith("joy-whatsapp:");
      const firstName = text(data.first_name, 60);
      const lastName = text(data.last_name, 60);
      const email = text(data.email, 120).toLowerCase();
      const userPatch: Record<string, unknown> = {};
      if (firstName && (joyRecord || !patient.firstName || patient.firstName === "Patient")) userPatch.firstName = firstName;
      if (lastName && (joyRecord || !patient.lastName)) userPatch.lastName = lastName;
      // Only a WhatsApp-only record takes the email (a later sign-up with it claims this record)
      if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && joyRecord && !patient.email) userPatch.email = email;
      if (Object.keys(userPatch).length) await ctx.db.patch(patient._id, userPatch);

      const dob = text(data.date_of_birth, 10);
      const gender = ["male", "female", "other", "prefer_not_to_say"].includes(String(data.gender)) ? String(data.gender) : undefined;
      const conditions = Array.isArray(data.health_conditions)
        ? data.health_conditions.map((item: unknown) => text(item, 60)).filter(Boolean).slice(0, 12)
        : [];
      const other = text(data.other_conditions, 600);
      const summary = [conditions.length ? conditions.join(", ") : "", other].filter(Boolean).join(". ");
      const profile: any =
        (patient.patientProfileId ? await ctx.db.get(patient.patientProfileId) : null) ??
        (await ctx.db.query("patientProfiles").withIndex("by_user_id", (q: any) => q.eq("userId", patient._id)).first());
      const fill = (current: unknown, next: unknown) => (next !== undefined && next !== "" && (joyRecord || !current) ? next : undefined);
      const profilePatch: Record<string, unknown> = {};
      const set = (key: string, next: unknown) => { const value = fill(profile?.[key], next); if (value !== undefined) profilePatch[key] = value; };
      if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) { set("dateOfBirth", dob); set("birthdayMonthDay", dob.slice(5, 10)); }
      set("gender", gender);
      set("state", text(data.state, 40) || undefined);
      set("city", text(data.city, 60) || undefined);
      set("area", text(data.area, 80) || undefined);
      if (summary) {
        const noted = `From WhatsApp sign-up: ${summary}`;
        profilePatch.medicalHistorySummary = (
          profile?.medicalHistorySummary && !joyRecord ? `${profile.medicalHistorySummary}\n${noted}` : noted
        ).slice(0, 2000);
      }
      if (profile) { if (Object.keys(profilePatch).length) await ctx.db.patch(profile._id, profilePatch); }
      else {
        const profileId = await ctx.db.insert("patientProfiles", { userId: patient._id, country: "Nigeria", ...profilePatch } as any);
        await ctx.db.patch(patient._id, { patientProfileId: profileId });
      }
      await audit(ctx, data, op, { actorUserId: patient._id, patientUserId: patient._id, fields: [...Object.keys(userPatch), ...Object.keys(profilePatch)] });
      return { updated: true };
    }
    if (op === "patient_check_in") {
      // A pain and progress check-in from WhatsApp, with the app's rules (recordPatientCheckIn: high
      // or rising pain, low mood and notes are flagged, and the physio is alerted).
      // { patient_id, pain_score, exercises_done, mood?, note? }
      const patient = await patientForActor(ctx, String(data.patient_id), data.actor);
      const pain = Number(data.pain_score);
      if (!Number.isFinite(pain)) throw new Error("pain_score is required");
      const exercisesDone: "all" | "some" | "none" = data.exercises_done === "all" || data.exercises_done === "some" ? data.exercises_done : "none";
      const mood = (["great", "good", "okay", "low"] as const).find((m) => m === data.mood);
      let saved: { checkInId: any; flagged: boolean };
      try {
        saved = await recordPatientCheckIn(ctx, patient, {
          painScore: pain, exercisesDone, mood, note: typeof data.note === "string" ? data.note : undefined,
        });
      } catch (error) {
        // The only expected refusal: another check-in in the last 10 minutes
        if (error instanceof ConvexError) return { saved: false, reason: "too_soon" };
        throw error;
      }
      const row: any = await ctx.db.get(saved.checkInId);
      await audit(ctx, data, op, { actorUserId: patient._id, patientUserId: patient._id });
      return { saved: true, flagged: saved.flagged, has_physio: Boolean(row?.physiotherapistId) };
    }
    if (op === "patient_request_callback") {
      // The patient asked Joy for a person ("call me", "I want to speak to someone"). Every admin
      // gets a bell + push saying who to call and what they wrote. { patient_id, text? }
      const patient = await patientForActor(ctx, String(data.patient_id), data.actor);
      const name = [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim() || "A patient";
      const who = patient.rehabifyId ? `${name} (${patient.rehabifyId})` : name;
      const phone = String(data.actor?.sender_phone ?? patient.phoneNumber ?? "").trim();
      const said = String(data.text ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
      const body = `${who} asked on WhatsApp to speak to someone.${phone ? ` Call ${phone}.` : ""}${said ? ` They wrote: "${said}"` : ""}`;
      const admins = await ctx.db.query("users").withIndex("by_role", (q: any) => q.eq("role", "admin")).take(25);
      const now = Date.now();
      for (const admin of admins) {
        await insertNotification(ctx, {
          userId: admin._id,
          type: "joy_callback_requested",
          priority: "high",
          status: "pending",
          payload: { title: "Patient asked for a call", body, link: "/dashboard/admin/users", data: { actionUrl: "/dashboard/admin/users", patientId: patient._id } },
          createdAt: now,
        });
      }
      await audit(ctx, data, op, { actorUserId: patient._id, patientUserId: patient._id });
      return { accepted: true, notified: admins.length };
    }
    if (op === "patient_log_exercise") {
      // The patient replied DONE to an exercise reminder: log today's session, for one exercise
      // (item_index) or every exercise not yet logged today. Same rules as the app (Flex gate,
      // high pain alerts the physio). { patient_id, programme_id?, item_index?, pain_score? }
      const patient = await patientForActor(ctx, String(data.patient_id), data.actor);
      const programs = (await ctx.db.query("exercisePrograms").withIndex("by_patient", (q: any) => q.eq("patientId", patient._id)).order("desc").collect())
        .filter((p: any) => p.status === "active" && (!data.programme_id || p._id === data.programme_id));
      const program = programs[0];
      if (!program) return { logged: 0, reason: "no_programme" };
      try {
        await assertProgramUnlocked(ctx, program, "log");
      } catch {
        return { logged: 0, reason: "locked" };
      }
      const today = await ctx.db.query("exerciseProgramLogs").withIndex("by_program", (q: any) => q.eq("programId", program._id).gt("createdAt", startOfLagosDay())).collect();
      const done = new Set(today.map((log: any) => log.itemIndex));
      const wanted = typeof data.item_index === "number" ? [data.item_index] : program.items.map((_: unknown, index: number) => index);
      const pain = typeof data.pain_score === "number" ? data.pain_score : undefined;
      let logged = 0;
      for (const index of wanted) {
        if (!Number.isInteger(index) || index < 0 || index >= program.items.length) continue;
        if (program.items[index].kind === "education" || (typeof data.item_index !== "number" && done.has(index))) continue;
        try {
          await insertLog(ctx, program, { itemIndex: index, painScore: pain }, "whatsapp");
          logged++;
        } catch {
          // Logged in the last 2 minutes already: not an error for a DONE reply
        }
      }
      await audit(ctx, data, op, { patientUserId: patient._id, actorUserId: patient._id, programId: program._id, logged });
      return { logged, programme_id: program._id, already_done: logged === 0 && wanted.length > 0 };
    }
    if (op === "patient_link_request") {
      // The patient replied LINK: email a one-time code to the website account that uses their
      // WhatsApp number. Proves they control both the number and the account's mailbox.
      const patient = await patientForActor(ctx, String(data.patient_id), data.actor);
      const phone = normalizePhone(String(data.actor?.sender_phone ?? ""));
      if (!phone) return { sent: false, reason: "no_account" };
      const accounts = (await patientsByPhone(ctx, phone)).filter(
        (user) => user._id !== patient._id && !isPlaceholderUser(user) && !user.whatsappLinkedAt,
      );
      if (accounts.length !== 1) return { sent: false, reason: accounts.length ? "ambiguous" : "no_account" };
      const account = accounts[0];
      const email = linkableEmail(account);
      if (!email) return { sent: false, reason: "no_email" };
      const now = Date.now();
      const recent = await ctx.db
        .query("whatsappLinkRequests")
        .withIndex("by_phone", (q) => q.eq("phone", phone).gt("createdAt", now - 3_600_000))
        .collect();
      if (recent.length >= LINK_REQUESTS_PER_HOUR) return { sent: false, reason: "rate_limited" };
      const code = sixDigitCode();
      await ctx.db.insert("whatsappLinkRequests", {
        userId: account._id, placeholderId: patient._id, phone,
        codeHash: await hashLinkCode(account._id, code),
        expiresAt: now + LINK_CODE_TTL_MS, attempts: 0, createdAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.actions.emails.sendPatientCareEmail.sendPatientCareEmail, {
        to: email,
        subject: `${code} is your code to link WhatsApp to Rehabify`,
        greetingName: account.firstName,
        heading: "Link your WhatsApp to your Rehabify account",
        paragraphs: [
          `Your code is ${code}.`,
          "Reply with this code to Joy on WhatsApp to connect your WhatsApp number to this Rehabify account, so your bookings and care are in one place. The code expires in 15 minutes.",
          "If you didn't ask for this, ignore this email. Nothing changes unless the code is sent to Joy.",
        ],
      });
      await audit(ctx, data, op, { actorUserId: patient._id, patientUserId: account._id });
      return { sent: true, email_hint: emailHint(email) };
    }
    if (op === "patient_link_confirm") {
      const patient = await patientForActor(ctx, String(data.patient_id), data.actor);
      const phone = normalizePhone(String(data.actor?.sender_phone ?? ""));
      const code = String(data.code ?? "").replace(/\D/g, "");
      const request = phone
        ? await ctx.db.query("whatsappLinkRequests").withIndex("by_phone", (q) => q.eq("phone", phone)).order("desc").first()
        : null;
      const now = Date.now();
      if (!request || request.usedAt || request.expiresAt < now || request.placeholderId !== patient._id) {
        return { linked: false, reason: "expired" };
      }
      if (request.attempts >= LINK_CODE_MAX_ATTEMPTS) return { linked: false, reason: "too_many_attempts" };
      if (code.length !== 6 || (await hashLinkCode(request.userId, code)) !== request.codeHash) {
        await ctx.db.patch(request._id, { attempts: request.attempts + 1 });
        return { linked: false, reason: "wrong_code", attempts_left: Math.max(0, LINK_CODE_MAX_ATTEMPTS - request.attempts - 1) };
      }
      const account: any = await ctx.db.get(request.userId);
      if (!account || account.role !== "patient") return { linked: false, reason: "no_account" };
      await ctx.db.patch(request._id, { usedAt: now });
      await ctx.db.patch(account._id, { whatsappLinkedAt: now, whatsappLinkedPhone: phone ?? undefined });
      // The audit row is the consent record. Anything Joy already did on the WhatsApp-only
      // record stays there (placeholder_user_id) for an admin to merge if needed.
      await audit(ctx, data, op, {
        actorUserId: account._id, patientUserId: account._id,
        placeholder_user_id: String(patient._id), consent: "whatsapp_link_email_code",
      });
      return { linked: true, patient_id: account._id, display_name: nameOf(account) };
    }
    throw new Error("Unsupported Joy operational mutation");
  },
});

/**
 * Patient operations added in Oct 2026 (additive; Joy's templates live outside this repo):
 *  - patient_consent_status (query) { patient_id } -> { consents_required: [{ policy_id, title,
 *    version, url, acceptance_text }] }: what to ask at the first chat (empty when nothing).
 *  - patient_record_consents (mutation) { patient_id, accepted: { terms, privacy: version },
 *    conversation_id? } -> { recorded, outdated, consents_required }.
 *  - patient_recovery_plan (query) { patient_id } -> { plan: "basic" | "flex" | "flex_max",
 *    flex_max_active, expires_at, flex_max_on_sale, joy_reminders_allowed }: switch on Flex Max
 *    reminders and support when joy_reminders_allowed (helpers/patientPlans.ts recoveryPlanForJoy).
 * All three need actor.persona "patient" with actor.rh_user_id equal to patient_id.
 */
export const executeQuery = internalQuery({
  args: { operation: v.string(), data: v.any() },
  handler: async (ctx, args): Promise<any> => {
    const op = args.operation as Operation; const data = args.data ?? {};
    assertJoyActorPersona(op, data.actor);
    if (op === "service_areas") {
      // Home-visit areas by city (Admin › Travel zones), for Joy's area list and sign-up form.
      // No patient data; the travel charge is shown with the price, not here.
      const zones = (await ctx.db.query("travelZones").collect())
        .filter((zone) => zone.active)
        .sort((x, y) => x.city.localeCompare(y.city) || (x.sortOrder ?? 0) - (y.sortOrder ?? 0) || x.name.localeCompare(y.name));
      const cities = new Map<string, { city: string; state: string; zones: { name: string; areas: string[] }[] }>();
      for (const zone of zones) {
        const entry = cities.get(zone.city) ?? { city: zone.city, state: ZONE_CITY_STATE[zone.city] ?? zone.city, zones: [] };
        entry.zones.push({ name: zone.name, areas: [...zone.areas] });
        cities.set(zone.city, entry);
      }
      return { cities: [...cities.values()] };
    }
    if (op === "patient_programme") {
      // The physio's active exercise programmes as sent (names, doses and their own notes only),
      // for Joy to show on WhatsApp. Joy never writes exercise instructions itself.
      const patient = await patientForActor(ctx, String(data.patient_id), data.actor);
      const programs = (await ctx.db.query("exercisePrograms").withIndex("by_patient", (q: any) => q.eq("patientId", patient._id)).order("desc").collect())
        .filter((p: any) => p.status === "active").slice(0, 3);
      const views = await Promise.all(programs.map((program: any) => patientProgramView(ctx, program)));
      return {
        care_plan_url: `${publicAppUrl()}/dashboard/patient/treatment-plans#today`,
        programmes: views.map((view: any) => ({
          programme_id: view._id,
          title: view.title,
          note: view.note,
          goals: view.goals,
          sender_name: view.senderName,
          updated_at: view.updatedAt,
          locked: Boolean(view.plan?.locked),
          done_today: view.doneToday,
          items: view.items.map((item: any) => ({
            index: item.index, kind: item.kind, name: item.name, sets: item.sets, reps: item.reps,
            hold_seconds: item.holdSeconds, frequency: item.frequency, note: item.note, side: item.side,
            // The library's picture (a WebP poster of the 3D demo, or a photo) and its approved
            // how-to steps, so the exercise can be shown in the chat. Joy adds nothing of its own.
            image_url: item.clipId
              ? `${publicAppUrl()}${posterUrl(item.clipId)}`
              : typeof item.exercise?.imageUrl === "string" && item.exercise.imageUrl.startsWith("https://") ? item.exercise.imageUrl : null,
            steps: Array.isArray(item.exercise?.instructions) ? item.exercise.instructions.slice(0, 5) : [],
          })),
        })),
      };
    }
    if (op === "patient_consent_status") {
      const patient = await patientForActor(ctx, String(data.patient_id), data.actor);
      const missing = await missingPolicies(ctx, patient._id, PATIENT_CONSENT_POLICIES);
      return { consents_required: consentDocumentsForJoy(missing, publicAppUrl()) };
    }
    if (op === "patient_recovery_plan") {
      const patient = await patientForActor(ctx, String(data.patient_id), data.actor);
      return { patient_id: patient._id, ...(await recoveryPlanForJoy(ctx, patient._id)) };
    }
    if (op === "physio_work_summary") {
      const profile = await profileFor(ctx, String(data.physiotherapist_id), data.actor);
      const bookings = await ctx.db.query("marketplaceBookings").withIndex("by_physiotherapist", (q: any) => q.eq("physiotherapistId", profile.userId)).collect();
      const relevant = bookings.filter((b: any) => b.sourceSystem === "joy_ai" && activeBooking(b.bookingStatus));
      return { physiotherapist_id: profile._id, assigned_bookings: relevant.slice(0, 10).map((b: any) => ({ booking_id: b._id, patient_id: b.patientId, start_time: b.sessionDate, provider_response: b.providerResponse, response_due_at: b.providerResponseDueAt })) };
    }
    if (op === "family_resolve") {
      const phone = String(data.family_phone ?? ""); const users: any[] = await ctx.db.query("users").withIndex("by_phone_number", (q: any) => q.eq("phoneNumber", phone)).collect();
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
