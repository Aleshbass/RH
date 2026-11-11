/**
 * A physiotherapist adds a patient straight to their list from the physio portal (Patients, or
 * "New patient" while booking). Email is optional: many patients have none.
 *
 * - A new person gets a record now, in this physio's care, so they can be booked straight away.
 *   With an email they're also invited to their own login; signing up with that email claims
 *   the record (users.claimPlaceholderPatient), so nothing is duplicated.
 * - An email that already belongs to a Rehabify patient is only invited: their existing
 *   record (with whatever other clinicians have written) is linked when they accept, never
 *   by typing their email.
 * - A clinic's clinician adds the patient to the clinic (relationship.clinicId), as the clinic
 *   portal does, with the clinic's rules (team, suspension, read-only, role).
 */
import { ConvexError, v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireClinicCareAccess, requirePhysio } from "./helpers/careAccess";
import { ensureUserNumbers } from "./helpers/rehabifyIds";
import { publicAppUrl } from "./helpers/appUrl";
import { schedulePatientInviteEmail } from "./clinicTools";
import { normalizePhone } from "./helpers/partnerShared";

const INVITE_DAYS = 7;

function cleanText(value: string | undefined, max: number) {
  const text = (value ?? "").trim().replace(/\s+/g, " ");
  return text ? text.slice(0, max) : undefined;
}

function physioName(user: Doc<"users">) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email || "Your physiotherapist";
}

/** An invitation to their own login (the physio's own patients; clinics use their clinic invite). */
async function invitePatient(
  ctx: MutationCtx,
  physio: Doc<"users">,
  args: { email: string; name: string; source?: "referred" | "existing_patient"; referredBy?: string; notes?: string }
) {
  const code = Math.random().toString(36).substring(2) + Date.now().toString(36);
  const now = Date.now();
  const expiresAt = now + INVITE_DAYS * 24 * 60 * 60 * 1000;
  await ctx.db.insert("patientInvitations", {
    code,
    physiotherapistId: physio._id,
    patientEmail: args.email,
    patientName: args.name,
    status: "pending",
    createdAt: now,
    expiresAt,
    notes: args.notes,
    source: args.source,
    referredBy: args.source === "referred" ? args.referredBy : undefined,
  });
  await ctx.scheduler.runAfter(0, internal.actions.emails.sendInvitationEmail.sendPatientInvitationEmail, {
    patientEmail: args.email,
    patientName: args.name,
    physiotherapistName: physioName(physio),
    invitationCode: code,
    invitationLink: `${publicAppUrl().replace(/\/$/, "")}/patient-invite/${code}`,
    expiresAt,
  });
}

export const addPatientRecord = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    phoneNumber: v.optional(v.string()),
    email: v.optional(v.string()),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"), v.literal("prefer_not_to_say"))),
    mainComplaint: v.optional(v.string()),
    source: v.optional(v.union(v.literal("referred"), v.literal("existing_patient"))),
    referredBy: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    // A clinic's clinician adds the patient to the clinic
    const clinicId = physio.clinicId ?? undefined;
    const clinic = clinicId ? await ctx.db.get(clinicId) : null;
    if (clinicId) await requireClinicCareAccess(ctx, physio, clinicId, { area: "patients" });

    const firstName = cleanText(args.firstName, 60);
    const lastName = cleanText(args.lastName, 60);
    if (!firstName || !lastName) throw new ConvexError("Enter the patient's first and last name.");
    const email = args.email?.trim().toLowerCase() || undefined;
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      throw new ConvexError("That email address doesn't look right. Check it, or leave it empty.");
    }
    // Required: the patient joins from a WhatsApp message and signs in with this number + a PIN
    const typedPhone = cleanText(args.phoneNumber, 30);
    if (!typedPhone) throw new ConvexError("Enter the patient's phone number. They join and sign in with it.");
    const phoneNumber = normalizePhone(typedPhone);
    if (!phoneNumber) throw new ConvexError("That phone number doesn't look right. Check it, e.g. 0803 123 4567.");
    const referredBy = args.source === "referred" ? cleanText(args.referredBy, 120) : undefined;
    const note = cleanText(args.note, 500);
    const name = `${firstName} ${lastName}`;

    // Already on Rehabify: they accept an invitation, which links their own record
    if (email) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (existing) {
        if (existing.role && existing.role !== "patient") {
          throw new ConvexError("This email belongs to a Rehabify account that isn't a patient's. Check the address.");
        }
        const linked = await ctx.db
          .query("patientPhysiotherapistRelationships")
          .withIndex("by_patient_and_physiotherapist", (q) => q.eq("patientId", existing._id).eq("physiotherapistId", physio._id))
          .collect();
        const active = linked.find((r) => r.status === "active");
        if (active) {
          return { mode: "existing" as const, patientId: existing._id, name: [existing.firstName, existing.lastName].filter(Boolean).join(" ") || name, invited: false };
        }
        await invitePatient(ctx, physio, { email, name, source: args.source, referredBy, notes: note });
        return { mode: "invited" as const, patientId: null, name, invited: true, patientNumber: existing.patientNumber ?? null };
      }
    }

    // No email: the same name and phone already in your care is almost certainly a duplicate
    if (phoneNumber) {
      const samePhone = await ctx.db
        .query("users")
        .withIndex("by_phone_number", (q) => q.eq("phoneNumber", phoneNumber))
        .take(20);
      for (const candidate of samePhone) {
        const sameName =
          (candidate.firstName ?? "").trim().toLowerCase() === firstName.toLowerCase() &&
          (candidate.lastName ?? "").trim().toLowerCase() === lastName.toLowerCase();
        if (!sameName || candidate.role !== "patient") continue;
        const rel = await ctx.db
          .query("patientPhysiotherapistRelationships")
          .withIndex("by_patient_and_physiotherapist", (q) => q.eq("patientId", candidate._id).eq("physiotherapistId", physio._id))
          .first();
        if (rel?.status === "active") {
          return { mode: "existing" as const, patientId: candidate._id, name, invited: false };
        }
      }
    }

    const now = Date.now();
    const prefix = clinicId ? "clinic_patient_" : "physio_patient_";
    const patientId = await ctx.db.insert("users", {
      clerkId: `${prefix}${now}_${Math.random().toString(36).substring(2, 7)}`,
      email,
      firstName,
      lastName,
      phoneNumber,
      role: "patient",
      onboarded: true,
      clinicId,
      status: "active",
      joinedAt: now,
    });
    const { patientNumber } = await ensureUserNumbers(ctx, patientId);
    const profileId = await ctx.db.insert("patientProfiles", {
      userId: patientId,
      clinicId,
      gender: args.gender ?? "prefer_not_to_say",
      city: clinic?.city,
      mainComplaint: cleanText(args.mainComplaint, 300),
    });
    await ctx.db.patch(patientId, { patientProfileId: profileId });

    await ctx.db.insert("patientPhysiotherapistRelationships", {
      patientId,
      physiotherapistId: physio._id,
      clinicId,
      isPrimaryPhysiotherapist: true,
      startDate: now,
      status: "active",
      source: clinicId ? "clinic_direct" : args.source ?? "existing_patient",
      referredBy,
      notes: note,
    });

    let invited = false;
    if (email) {
      const patient = await ctx.db.get(patientId);
      if (clinic && patient) invited = await schedulePatientInviteEmail(ctx, clinic, patient, physio._id);
      else {
        await invitePatient(ctx, physio, { email, name, source: args.source, referredBy, notes: note });
        invited = true;
      }
    }

    return { mode: "added" as const, patientId, name, invited, patientNumber };
  },
});
