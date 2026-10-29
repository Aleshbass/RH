/**
 * How people appear to each other in messages and notifications, in one place:
 *
 * - A clinic's owner (and front desk) speak for the clinic: the clinic's name and logo
 *   ("Lighthouse Physiotherapy"), never the personal account that registered it.
 * - A clinic's clinician: their own name with the clinic beside it ("Mary Okafor — Lighthouse
 *   Physiotherapy"), so the patient knows who and where.
 * - Everyone else, patients included: the name on their Rehabify profile (what they confirmed or
 *   saved in Settings), never their Google account's.
 */
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

/** The profile name, or `fallback` when they haven't given one. */
export function personName(user: Pick<Doc<"users">, "firstName" | "lastName"> | null | undefined, fallback = ""): string {
  return [user?.firstName?.trim(), user?.lastName?.trim()].filter(Boolean).join(" ") || fallback;
}

export type SenderIdentity = {
  /** Who it is: the clinic's name for its owner and front desk, the person's name otherwise */
  name: string;
  /** Second line: the clinician's clinic, or what they are ("Clinic", "Physiotherapist"…) */
  subtitle: string | null;
  /** One line for notifications and lists: "Mary Okafor — Lighthouse Physiotherapy" */
  label: string;
  imageUrl: string | null;
  kind: "clinic" | "clinician" | "person";
  clinicId: Id<"clinics"> | null;
};

const ROLE_SUBTITLES: Record<string, string> = {
  physiotherapist: "Physiotherapist",
  patient: "Patient",
  admin: "Rehabify support",
  doctor: "Doctor",
  partner: "Partner",
  family_member: "Family / caregiver",
};

async function ownedClinic(ctx: Ctx, ownerId: Id<"users">) {
  return await ctx.db
    .query("clinics")
    .withIndex("by_owner_id", (q) => q.eq("ownerId", ownerId))
    .first();
}

export async function senderIdentity(ctx: Ctx, user: Doc<"users">): Promise<SenderIdentity> {
  const own = personName(user);

  if (user.role === "clinic_owner" || (user.role === "clinic_staff" && user.clinicId)) {
    const clinic = user.role === "clinic_owner" ? await ownedClinic(ctx, user._id) : await ctx.db.get(user.clinicId!);
    if (clinic) {
      return { name: clinic.name, subtitle: "Clinic", label: clinic.name, imageUrl: clinic.logoUrl ?? null, kind: "clinic", clinicId: clinic._id };
    }
  }

  if (user.role === "physiotherapist" && user.clinicId) {
    const clinic = await ctx.db.get(user.clinicId);
    if (clinic) {
      const name = own || "Your physiotherapist";
      return { name, subtitle: clinic.name, label: `${name} — ${clinic.name}`, imageUrl: user.imageUrl ?? null, kind: "clinician", clinicId: clinic._id };
    }
  }

  const name = own || (user.role === "patient" ? "Patient" : "Your care team");
  return {
    name,
    subtitle: (user.role && ROLE_SUBTITLES[user.role]) ?? null,
    label: name,
    imageUrl: user.imageUrl ?? null,
    kind: "person",
    clinicId: null,
  };
}
