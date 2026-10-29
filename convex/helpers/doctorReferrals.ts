/**
 * Server helpers for referring doctors (partners of type "doctor"): who the doctor is, which
 * progress reports were shared with them, and who is treating their patient. Used by
 * doctorPortal.ts (the portal) and helpers/doctorReferralUpdates.ts (notifications).
 */
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { appLink } from "./appUrl";
import { referralEnv } from "./partnerShared";

type ReadCtx = { db: QueryCtx["db"] };

export async function partnerByCode(ctx: ReadCtx, code: string | undefined | null): Promise<Doc<"partners"> | null> {
  if (!code) return null;
  return ctx.db
    .query("partners")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
}

/** The doctor partner behind a live referral, or null for anything else. */
export async function doctorPartnerForReferral(ctx: ReadCtx, referral: Doc<"inboundReferrals">): Promise<Doc<"partners"> | null> {
  if (!referral.partnerId || referralEnv(referral) !== "live") return null;
  const partner = await partnerByCode(ctx, referral.partnerId);
  return partner?.type === "doctor" ? partner : null;
}

/** The doctor's own account: the partner's owner, else the doctor recorded on the referral. */
export async function doctorUserFor(
  ctx: ReadCtx,
  partner: Doc<"partners">,
  referral?: Pick<Doc<"inboundReferrals">, "referringDoctorId"> | null
): Promise<Doc<"users"> | null> {
  if (partner.ownerClerkId) {
    const owner = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", partner.ownerClerkId!))
      .first();
    if (owner) return owner;
  }
  return referral?.referringDoctorId ? await ctx.db.get(referral.referringDoctorId) : null;
}

/** Every address the doctor is known by (lower case), to recognise reports sent to them. */
export async function doctorEmails(ctx: ReadCtx, partner: Doc<"partners">): Promise<Set<string>> {
  const emails = new Set<string>();
  const add = (value?: string | null) => {
    const email = value?.trim().toLowerCase();
    if (email) emails.add(email);
  };
  add(partner.contactEmail);
  add(partner.ownerEmail);
  add((await doctorUserFor(ctx, partner))?.email);
  return emails;
}

/** The patient's latest live referral: who a physio's progress report names as the referrer. */
export async function latestLiveReferral(ctx: ReadCtx, patientId: Id<"users">): Promise<Doc<"inboundReferrals"> | null> {
  const rows = await ctx.db
    .query("inboundReferrals")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .take(20);
  return rows.filter((r) => referralEnv(r) === "live").sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
}

/**
 * A shared report is the doctor's when it was emailed to one of their addresses, or when it was
 * shared without an email address or another named recipient while they are the patient's
 * referrer (the report then names them as the referrer). The physio confirmed the patient agreed.
 */
export function reportIsForDoctor(
  report: Pick<Doc<"progressReports">, "recipientEmail" | "snapshot">,
  emails: Set<string>,
  doctorIsReferrer: boolean
): boolean {
  const to = report.recipientEmail?.trim().toLowerCase();
  if (to) return emails.has(to);
  return doctorIsReferrer && Boolean(report.snapshot.referrer) && !report.snapshot.preparedFor;
}

export type DoctorReportView = {
  id: Id<"progressReports">;
  kind: "progress" | "discharge";
  sentAt: number;
  physioName: string;
  state: "open" | "expired" | "withdrawn";
  url: string | null;
  expiresAt: number;
};

/** Reports shared with the doctor about this referral's patient, newest first. */
export async function reportsForReferral(
  ctx: ReadCtx,
  partner: Doc<"partners">,
  referral: Doc<"inboundReferrals">,
  emails?: Set<string>
): Promise<DoctorReportView[]> {
  if (!referral.patientId) return [];
  const rows = await ctx.db
    .query("progressReports")
    .withIndex("by_patient", (q) => q.eq("patientId", referral.patientId!).gte("sentAt", referral.createdAt))
    .order("desc")
    .take(30);
  if (rows.length === 0) return [];
  const known = emails ?? (await doctorEmails(ctx, partner));
  const latest = await latestLiveReferral(ctx, referral.patientId);
  const doctorIsReferrer = latest?.partnerId === partner.code;
  const now = Date.now();
  return rows
    .filter((r) => reportIsForDoctor(r, known, doctorIsReferrer))
    .map((r) => {
      const state = r.revokedAt ? ("withdrawn" as const) : r.expiresAt <= now ? ("expired" as const) : ("open" as const);
      return {
        id: r._id,
        kind: r.snapshot.care.completedAt ? ("discharge" as const) : ("progress" as const),
        sentAt: r.sentAt,
        physioName: r.snapshot.physio.name,
        state,
        url: state === "open" ? appLink(`/report/${r.token}`) : null,
        expiresAt: r.expiresAt,
      };
    });
}

/** Who is treating the patient: the matched physio and/or the clinic the referral was routed to. */
export async function careTeamFor(ctx: ReadCtx, referral: Doc<"inboundReferrals">): Promise<{ physio: string | null; clinic: string | null }> {
  let physioId = referral.assignedPhysiotherapistId;
  if (!physioId && referral.bookingId) {
    const booking = await ctx.db.get(referral.bookingId);
    physioId = booking?.physiotherapistId ?? undefined;
  }
  const physio = physioId ? await ctx.db.get(physioId) : null;
  const clinic = referral.assignedClinicId ? await ctx.db.get(referral.assignedClinicId) : null;
  const physioName = physio ? `${physio.firstName ?? ""} ${physio.lastName ?? ""}`.trim() || "Your physiotherapist" : null;
  return { physio: physioName, clinic: clinic?.name?.trim() || null };
}

/** The doctor's portal, opened on one referral. */
export function doctorReferralLink(referralId: Id<"inboundReferrals">): string {
  return appLink(`/partners/portal?referral=${referralId}`);
}
