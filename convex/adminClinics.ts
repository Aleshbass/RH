import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ensureUserRole } from "./auth";
import { loadClinicFeeConfig } from "./clinicFeeSettings";
import { matchesRehabifyId } from "./helpers/rehabifyIdFormat";

// ─────────────────────────────────────────────────────────────────────────────
// Admin console: clinics. Every function is admin-only. Reads are capped so a big
// clinic can't blow the query limits; a count at its cap is shown as "N+".
// ─────────────────────────────────────────────────────────────────────────────

const CLINIC_SCAN_CAP = 500;
const LIST_STAFF_CAP = 50;
const LIST_PATIENT_CAP = 150;
const DETAIL_CAP = 500;

type ClinicStatus = "active" | "suspended";
type ApprovalStatus = Doc<"accountApprovalStatus">["status"] | "not_submitted";

const fullName = (u: Doc<"users"> | null | undefined) =>
  u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "Unnamed" : null;

const clinicStatus = (clinic: Doc<"clinics">): ClinicStatus => clinic.status ?? "active";

const isTeamRole = (role: Doc<"users">["role"]) => role === "physiotherapist" || role === "clinic_staff";

async function approvalFor(ctx: QueryCtx, userId: Id<"users">) {
  return await ctx.db
    .query("accountApprovalStatus")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .first();
}

/** Clinicians and front-desk staff (owner excluded), from both places a clinic link is kept. */
async function teamUserIds(ctx: QueryCtx, clinic: Doc<"clinics">, cap: number) {
  const [users, profiles] = await Promise.all([
    ctx.db.query("users").withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id)).take(cap * 4),
    ctx.db.query("physiotherapistProfiles").withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id)).take(cap),
  ]);
  const ids = new Set<Id<"users">>();
  for (const u of users) if (isTeamRole(u.role) && u.status !== "terminated") ids.add(u._id);
  for (const p of profiles) ids.add(p.userId);
  ids.delete(clinic.ownerId);
  return ids;
}

/** Patients with a care relationship recorded at this clinic. */
async function clinicPatientCount(ctx: QueryCtx, clinicId: Id<"clinics">, cap: number) {
  const rels = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_clinic", (q) => q.eq("clinicId", clinicId))
    .take(cap);
  return { count: new Set(rels.map((r) => r.patientId)).size, capped: rels.length === cap };
}

/**
 * Clinics for the admin list, newest first, with headline counts.
 * `status`: "all", "active", "suspended", or "pending" (owner not yet approved).
 */
export const listClinics = query({
  args: {
    search: v.optional(v.string()),
    status: v.optional(v.union(v.literal("all"), v.literal("active"), v.literal("suspended"), v.literal("pending"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);

    const clinics = await ctx.db.query("clinics").order("desc").take(CLINIC_SCAN_CAP);
    const base = await Promise.all(
      clinics.map(async (clinic) => {
        const [owner, approval] = await Promise.all([ctx.db.get(clinic.ownerId), approvalFor(ctx, clinic.ownerId)]);
        return { clinic, owner, approvalStatus: (approval?.status ?? "not_submitted") as ApprovalStatus };
      })
    );

    const totals = {
      total: base.length,
      active: base.filter((b) => clinicStatus(b.clinic) === "active").length,
      suspended: base.filter((b) => clinicStatus(b.clinic) === "suspended").length,
      pending: base.filter((b) => b.approvalStatus !== "approved").length,
    };

    const term = args.search?.trim().toLowerCase() ?? "";
    const status = args.status ?? "all";
    const matched = base.filter(({ clinic, owner, approvalStatus }) => {
      if (status === "active" && clinicStatus(clinic) !== "active") return false;
      if (status === "suspended" && clinicStatus(clinic) !== "suspended") return false;
      if (status === "pending" && approvalStatus === "approved") return false;
      if (!term) return true;
      return (
        [clinic.name, clinic.city, clinic.state, clinic.contactEmail, fullName(owner), owner?.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term) || matchesRehabifyId(clinic.clinicNumber, term)
      );
    });

    const limit = Math.min(Math.max(1, Math.floor(args.limit ?? 50)), 200);
    const rows = await Promise.all(
      matched.slice(0, limit).map(async ({ clinic, owner, approvalStatus }) => {
        const [staffIds, patients, payout] = await Promise.all([
          teamUserIds(ctx, clinic, LIST_STAFF_CAP),
          clinicPatientCount(ctx, clinic._id, LIST_PATIENT_CAP),
          ctx.db.query("clinicPayoutAccounts").withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id)).first(),
        ]);
        return {
          _id: clinic._id,
          name: clinic.name,
          clinicNumber: clinic.clinicNumber ?? null,
          logoUrl: clinic.logoUrl ?? null,
          city: clinic.city ?? null,
          state: clinic.state ?? null,
          createdAt: clinic._creationTime,
          status: clinicStatus(clinic),
          approvalStatus,
          owner: owner ? { _id: owner._id, name: fullName(owner), email: owner.email ?? null } : null,
          staffCount: staffIds.size,
          staffCapped: staffIds.size >= LIST_STAFF_CAP,
          patientCount: patients.count,
          patientsCapped: patients.capped,
          payoutConnected: payout !== null,
        };
      })
    );

    return {
      rows,
      totals,
      matched: matched.length,
      hasMore: matched.length > rows.length,
      scanCapped: clinics.length === CLINIC_SCAN_CAP,
    };
  },
});

const DOCUMENT_LABELS: Record<Doc<"clinicDocuments">["documentType"], string> = {
  businessLicense: "Business licence",
  taxRegistration: "Tax registration",
  insuranceProof: "Insurance",
  ownerIdentification: "Owner ID",
  additionalDocument: "Other document",
};

const OPEN_REFERRAL_STATUSES = new Set<Doc<"inboundReferrals">["status"]>([
  "received", "consent_pending", "contacted", "intake_started", "intake_completed", "qualified",
  "booked", "attended", "treatment_active", "pending", "in_treatment",
]);

/** Everything on the clinic overview: profile, owner, approval, payout account, fees and counts. */
export const getClinic = query({
  args: { clinicId: v.id("clinics") },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const clinic = await ctx.db.get(args.clinicId);
    if (!clinic) return null;

    const [owner, approval, ownerProfile, documents, payout, invitations, staffIds, patients, referrals, invoices, feeRow, feeConfig] =
      await Promise.all([
        ctx.db.get(clinic.ownerId),
        approvalFor(ctx, clinic.ownerId),
        ctx.db.query("clinicOwnerProfiles").withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id)).first(),
        ctx.db.query("clinicDocuments").withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id)).take(20),
        ctx.db.query("clinicPayoutAccounts").withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id)).first(),
        ctx.db.query("clinicStaffInvitations").withIndex("by_clinic", (q) => q.eq("clinicId", clinic._id)).take(100),
        teamUserIds(ctx, clinic, 200),
        ctx.db
          .query("patientPhysiotherapistRelationships")
          .withIndex("by_clinic", (q) => q.eq("clinicId", clinic._id))
          .take(DETAIL_CAP),
        ctx.db
          .query("inboundReferrals")
          .withIndex("by_assigned_clinic", (q) => q.eq("assignedClinicId", clinic._id))
          .take(DETAIL_CAP),
        ctx.db
          .query("invoices")
          .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
          .order("desc")
          .take(DETAIL_CAP),
        ctx.db.query("clinicFeeSettings").order("desc").first(),
        loadClinicFeeConfig(ctx),
      ]);

    const suspendedBy = clinic.suspendedBy ? await ctx.db.get(clinic.suspendedBy) : null;
    const [outsideImageUrl, insideImageUrl, documentRows] = await Promise.all([
      clinic.clinicImageOutside ? ctx.storage.getUrl(clinic.clinicImageOutside) : null,
      clinic.clinicImageInside ? ctx.storage.getUrl(clinic.clinicImageInside) : null,
      Promise.all(
        documents.map(async (doc) => ({
          _id: doc._id,
          label: DOCUMENT_LABELS[doc.documentType] ?? "Document",
          fileName: doc.fileName,
          fileSize: doc.fileSize,
          uploadedAt: doc.uploadedAt,
          url: await ctx.storage.getUrl(doc.storageId),
        }))
      ),
    ]);

    // Money across the clinic's most recent invoices. Offline payments (cash, POS, transfer)
    // never pass through Rehabify; online ones held by Rehabify still need a manual transfer.
    const now = Date.now();
    const billing = {
      invoiceCount: invoices.length,
      capped: invoices.length === DETAIL_CAP,
      paidKobo: 0,
      onlinePaidKobo: 0,
      unpaidKobo: 0,
      unpaidCount: 0,
      overdueCount: 0,
      rehabifyFeesKobo: 0,
      heldByRehabifyKobo: 0,
      lastPaidAt: null as number | null,
    };
    for (const inv of invoices) {
      const total = inv.totalAmount || 0;
      if (inv.status === "sent" || inv.status === "overdue" || inv.status === "partial_payment") {
        billing.unpaidKobo += total;
        billing.unpaidCount += 1;
        if (inv.dueDate < now) billing.overdueCount += 1;
      }
      if (inv.status !== "paid") continue;
      billing.paidKobo += total;
      billing.lastPaidAt = Math.max(billing.lastPaidAt ?? 0, inv.paymentDate ?? inv._creationTime);
      const offline = Boolean(inv.paymentMethod && inv.paymentMethod !== "paystack");
      if (offline) continue;
      billing.onlinePaidKobo += total;
      const fee = inv.feeBreakdown?.platformFee ?? inv.platformFeeAmount ?? 0;
      billing.rehabifyFeesKobo += fee;
      if (inv.payoutRoute === "held_by_platform") {
        const clinicShare = inv.feeBreakdown?.physiotherapistEarnings ?? inv.physiotherapistShare ?? total - fee;
        billing.heldByRehabifyKobo += clinicShare - (inv.stampDutyAmount ?? 0);
      }
    }

    const pendingInvitations = invitations.filter((i) => i.status === "pending" && i.expiresAt > now).length;
    const activePatientIds = new Set(patients.filter((r) => r.status === "active").map((r) => r.patientId));

    return {
      clinic: {
        _id: clinic._id,
        name: clinic.name,
        clinicNumber: clinic.clinicNumber ?? null,
        createdAt: clinic._creationTime,
        status: clinicStatus(clinic),
        suspendedReason: clinic.suspendedReason ?? null,
        suspendedAt: clinic.suspendedAt ?? null,
        suspendedByName: fullName(suspendedBy),
        logoUrl: clinic.logoUrl ?? null,
        outsideImageUrl,
        insideImageUrl,
        description: clinic.description ?? null,
        address: clinic.address ?? null,
        location: clinic.location ?? null,
        city: clinic.city ?? null,
        state: clinic.state ?? null,
        country: clinic.country ?? null,
        contactEmail: clinic.contactEmail ?? null,
        contactPhone: clinic.contactPhone ?? null,
        website: clinic.website ?? null,
        registrationNumber: clinic.registrationNumber ?? null,
        clinicType: clinic.clinicType ?? null,
        yearEstablished: clinic.yearEstablished ?? null,
        services: clinic.services ?? [],
        specializations: clinic.specializations ?? [],
        facilities: clinic.facilities ?? [],
        priceList: clinic.priceList ?? [],
      },
      owner: owner
        ? {
            _id: owner._id,
            name: fullName(owner),
            email: owner.email ?? null,
            phoneNumber: owner.phoneNumber ?? null,
            imageUrl: owner.imageUrl ?? null,
            onboarded: owner.onboarded,
          }
        : null,
      ownerProfile: ownerProfile
        ? {
            businessLicense: ownerProfile.businessLicense ?? null,
            taxId: ownerProfile.taxId ?? null,
            businessPhone: ownerProfile.businessPhone ?? null,
            businessEmail: ownerProfile.businessEmail ?? null,
          }
        : null,
      approval: {
        status: (approval?.status ?? "not_submitted") as ApprovalStatus,
        submittedAt: approval?.submittedAt ?? null,
        reviewedAt: approval?.reviewedAt ?? null,
        comments: approval?.comments ?? null,
      },
      documents: documentRows,
      payoutAccount: payout
        ? {
            bankName: payout.bankName,
            accountName: payout.accountName,
            accountNumberLast4: payout.accountNumber.slice(-4),
            subaccountCode: payout.subaccountCode,
            connectedAt: payout.createdAt,
            updatedAt: payout.updatedAt,
          }
        : null,
      // Fees are set once for every clinic; there is no per-clinic override yet
      fees: {
        ...feeConfig,
        isCustom: feeRow !== null,
        updatedAt: feeRow?.updatedAt ?? null,
        updatedBy: feeRow?.updatedBy ?? null,
      },
      billing,
      counts: {
        staff: staffIds.size,
        pendingInvitations,
        patients: new Set(patients.map((r) => r.patientId)).size,
        activePatients: activePatientIds.size,
        patientsCapped: patients.length === DETAIL_CAP,
        referrals: referrals.length,
        openReferrals: referrals.filter((r) => OPEN_REFERRAL_STATUSES.has(r.status)).length,
        referralsCapped: referrals.length === DETAIL_CAP,
      },
    };
  },
});

/** The owner, clinicians and front-desk staff, plus invitations still waiting for an answer. */
export const listClinicStaff = query({
  args: { clinicId: v.id("clinics") },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const clinic = await ctx.db.get(args.clinicId);
    if (!clinic) return null;

    const [ids, roles, invitations] = await Promise.all([
      teamUserIds(ctx, clinic, 200),
      ctx.db.query("clinicRoles").withIndex("by_clinic", (q) => q.eq("clinicId", clinic._id)).take(50),
      ctx.db.query("clinicStaffInvitations").withIndex("by_clinic", (q) => q.eq("clinicId", clinic._id)).order("desc").take(100),
    ]);
    const roleName = new Map(roles.map((r) => [r._id, r.name]));

    const users = await Promise.all([clinic.ownerId, ...ids].map((id) => ctx.db.get(id)));
    const members = await Promise.all(
      users
        .filter((u): u is Doc<"users"> => u !== null)
        .map(async (u) => {
          const isOwner = u._id === clinic.ownerId;
          const approval = u.role === "physiotherapist" || isOwner ? await approvalFor(ctx, u._id) : null;
          return {
            userId: u._id,
            name: fullName(u),
            email: u.email ?? null,
            phoneNumber: u.phoneNumber ?? null,
            imageUrl: u.imageUrl ?? null,
            kind: isOwner ? ("owner" as const) : u.role === "clinic_staff" ? ("front_desk" as const) : ("clinician" as const),
            // Clinic dashboard role (page permissions). None means full access.
            roleName: isOwner ? "Owner" : (u.clinicRoleId && roleName.get(u.clinicRoleId)) || "Full access",
            status: isOwner ? "active" : (u.status ?? "active"),
            approvalStatus: approval ? approval.status : null,
            joinedAt: u.joinedAt ?? u._creationTime,
          };
        })
    );

    const now = Date.now();
    const pending = invitations
      .filter((i) => i.status === "pending")
      .map((i) => ({
        _id: i._id,
        inviteeEmail: i.inviteeEmail,
        inviteeName: i.inviteeName ?? null,
        role: i.role,
        roleName: (i.clinicRoleId && roleName.get(i.clinicRoleId)) || null,
        createdAt: i.createdAt,
        expiresAt: i.expiresAt,
        expired: i.expiresAt < now,
      }));

    const order = { owner: 0, clinician: 1, front_desk: 2 } as const;
    members.sort((a, b) => order[a.kind] - order[b.kind] || (a.name ?? "").localeCompare(b.name ?? ""));
    return { members, invitations: pending };
  },
});

/**
 * Patients of this clinic: every care relationship recorded at the clinic, plus active ones held
 * by its clinicians (the same set the clinic sees on its Patients page). One row per patient.
 */
export const listClinicPatients = query({
  args: { clinicId: v.id("clinics"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const clinic = await ctx.db.get(args.clinicId);
    if (!clinic) return null;

    const profiles = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
      .take(100);
    const clinicianIds = Array.from(new Set([clinic.ownerId, ...profiles.map((p) => p.userId)]));

    const relLists = await Promise.all([
      ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_clinic", (q) => q.eq("clinicId", clinic._id))
        .order("desc")
        .take(DETAIL_CAP),
      ...clinicianIds.map((id) =>
        ctx.db
          .query("patientPhysiotherapistRelationships")
          .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", id))
          .filter((q) => q.eq(q.field("status"), "active"))
          .take(200)
      ),
    ]);
    const capped = relLists[0].length === DETAIL_CAP;

    // One row per patient: the active relationship when there is one, else the latest
    const best = new Map<Id<"users">, Doc<"patientPhysiotherapistRelationships">>();
    for (const rel of relLists.flat()) {
      const current = best.get(rel.patientId);
      if (
        !current ||
        (rel.status === "active" && current.status !== "active") ||
        (rel.status !== "active" && current.status !== "active" && (rel.endDate ?? 0) > (current.endDate ?? 0))
      ) {
        best.set(rel.patientId, rel);
      }
    }
    const sorted = Array.from(best.values()).sort((a, b) =>
      a.status === "active" && b.status !== "active"
        ? -1
        : b.status === "active" && a.status !== "active"
          ? 1
          : b.startDate - a.startDate
    );

    const limit = Math.min(Math.max(1, Math.floor(args.limit ?? 200)), 500);
    const rows = await Promise.all(
      sorted.slice(0, limit).map(async (rel) => {
        const [patient, clinician] = await Promise.all([ctx.db.get(rel.patientId), ctx.db.get(rel.physiotherapistId)]);
        if (!patient) return null;
        return {
          userId: patient._id,
          name: fullName(patient),
          patientNumber: patient.patientNumber ?? null,
          email: patient.email ?? null,
          phoneNumber: patient.phoneNumber ?? null,
          imageUrl: patient.imageUrl ?? null,
          clinicianName: fullName(clinician),
          source: rel.source ?? "clinic_direct",
          careStatus:
            rel.status === "active" ? ("active" as const) : rel.notes === "Care paused" ? ("paused" as const) : ("discharged" as const),
          startDate: rel.startDate,
          endDate: rel.endDate ?? null,
        };
      })
    );

    const patients = rows.filter((r): r is NonNullable<typeof r> => r !== null);
    return { patients, total: sorted.length, hasMore: sorted.length > patients.length || capped };
  },
});

/** Inbound referrals Rehabify has routed to this clinic, newest first. Clinical notes stay out. */
export const listClinicReferrals = query({
  args: { clinicId: v.id("clinics") },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const referrals = await ctx.db
      .query("inboundReferrals")
      .withIndex("by_assigned_clinic", (q) => q.eq("assignedClinicId", args.clinicId))
      .order("desc")
      .take(200);
    return referrals.map((r) => ({
      _id: r._id,
      trackingCode: r.trackingCode ?? null,
      patientName: `${r.patientFirstName} ${r.patientLastName}`.trim(),
      patientId: r.patientId ?? null,
      condition: r.condition ?? r.reason ?? null,
      status: r.status,
      open: OPEN_REFERRAL_STATUSES.has(r.status),
      priority: r.priority ?? null,
      partnerId: r.partnerId ?? null,
      city: r.city ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  },
});

/**
 * Suspend or reactivate a clinic. While suspended, its owner and team can still sign in and
 * see their data, but every change is refused (convex/clinicTools.ts) and admins can't route
 * new referrals to it. The owner is notified either way.
 */
export const setClinicStatus = mutation({
  args: {
    clinicId: v.id("clinics"),
    status: v.union(v.literal("active"), v.literal("suspended")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const clinic = await ctx.db.get(args.clinicId);
    if (!clinic) throw new ConvexError("Clinic not found");
    if (clinicStatus(clinic) === args.status) {
      return { changed: false };
    }

    const reason = args.reason?.trim().slice(0, 500) || undefined;
    const now = Date.now();
    if (args.status === "suspended") {
      await ctx.db.patch(clinic._id, { status: "suspended", suspendedReason: reason, suspendedAt: now, suspendedBy: admin._id });
    } else {
      await ctx.db.patch(clinic._id, { status: "active", suspendedReason: undefined, suspendedAt: undefined, suspendedBy: undefined });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: admin._id,
      action: args.status === "suspended" ? "clinic_suspended" : "clinic_reactivated",
      targetEntityType: "clinic",
      targetEntityId: clinic._id,
      timestamp: now,
      details: { clinicName: clinic.name, reason, previousReason: clinic.suspendedReason },
    });

    await ctx.db.insert("notifications", {
      userId: clinic.ownerId,
      type: args.status === "suspended" ? "clinic_suspended" : "clinic_reactivated",
      priority: "high",
      status: "pending",
      payload:
        args.status === "suspended"
          ? {
              title: "Your clinic has been suspended",
              body: `Rehabify has suspended ${clinic.name}. You can still view your dashboard, but changes are paused.${reason ? ` Reason: ${reason}` : ""} Contact support to resolve this.`,
              data: { entityId: clinic._id, entityType: "clinic", actionUrl: "/dashboard/clinic", metadata: { reason } },
            }
          : {
              title: "Your clinic is active again",
              body: `Rehabify has reactivated ${clinic.name}. Everything in your dashboard works as before.`,
              data: { entityId: clinic._id, entityType: "clinic", actionUrl: "/dashboard/clinic" },
            },
      createdAt: now,
    });

    return { changed: true };
  },
});
