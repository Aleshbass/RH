/**
 * Signing Rehabify's agreements on the platform (lib/agreements.ts).
 *
 * - Physiotherapists outside a clinic sign by the patients they see: the Network contractor
 *   agreement (Rehabify Care), the Independent platform agreement (own patients), or both.
 * - A clinic's owner signs the Clinic Master SaaS Agreement with its Order Form.
 *
 * Signing is a typed signature (optionally drawn too) plus an "I agree" tick. Each signature
 * stores the details filled in, the version and a SHA-256 of the exact text, and is mirrored in
 * the append-only policyAcceptances log. Rehabify countersigns network and clinic agreements
 * from the admin console. Electronic signatures are valid under the Evidence Act 2011 (s. 93),
 * which each agreement's own clause on electronic execution also records.
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthenticatedUser } from "./auth";
import { getClinicMemberOrNull } from "./clinicTools";
import { requireAdmin } from "./helpers/partnerAccess";
import { sha256Hex } from "./helpers/exerciseCrypto";
import { appLink } from "./helpers/appUrl";
import {
  AGREEMENTS,
  REHABIFY_SIGNATORIES,
  agreementFieldErrors,
  agreementPlainText,
  cleanAgreementValue,
  isAgreementId,
  physioAgreementIds,
  type AgreementId,
} from "../lib/agreements";
import { CLINIC_PLANS } from "../lib/clinicPlans";

type Ctx = QueryCtx | MutationCtx;

export type AgreementState = "not_signed" | "outdated" | "awaiting_countersign" | "active";

const PHYSIO_PAGE = "/dashboard/physiotherapist/settings/agreements";
const CLINIC_PAGE = "/dashboard/clinic/agreement";

const sendEmail = makeFunctionReference<
  "action",
  {
    to: string;
    subject: string;
    greetingName?: string;
    heading: string;
    paragraphs: string[];
    buttonLabel?: string;
    buttonUrl?: string;
    footnote?: string;
  }
>("actions/emails/sendPatientCareEmail:sendPatientCareEmail");

const PROFESSIONAL_FOOTNOTE =
  "You're receiving this because you have a professional account on Rehabify. Questions? Write to hello@myrehabifyhealth.com or support@physioaroundme.com.";

const fullName = (user: Doc<"users"> | null) => (user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : "");

/** The latest signature that hasn't been voided, for a physio's own agreement or a clinic's. */
async function latestSignature(
  ctx: Ctx,
  agreementId: AgreementId,
  owner: { userId: Id<"users"> } | { clinicId: Id<"clinics"> }
): Promise<Doc<"agreementSignatures"> | null> {
  const rows =
    "clinicId" in owner
      ? await ctx.db
          .query("agreementSignatures")
          .withIndex("by_clinic_agreement", (q) => q.eq("clinicId", owner.clinicId).eq("agreementId", agreementId))
          .order("desc")
          .take(20)
      : await ctx.db
          .query("agreementSignatures")
          .withIndex("by_user_agreement", (q) => q.eq("userId", owner.userId).eq("agreementId", agreementId))
          .order("desc")
          .take(20);
  return rows.find((row) => row.status !== "void") ?? null;
}

function stateOf(agreementId: AgreementId, signature: Doc<"agreementSignatures"> | null): AgreementState {
  if (!signature) return "not_signed";
  if (signature.version !== AGREEMENTS[agreementId].version) return "outdated";
  return signature.status === "awaiting_countersign" ? "awaiting_countersign" : "active";
}

/** Signed the current version (Rehabify's countersignature isn't needed for this). */
const hasSigned = (state: AgreementState) => state === "active" || state === "awaiting_countersign";

/** From the admin's date, physios must have signed their agreement(s) to be bookable. */
export async function loadAgreementsEnforcedAt(ctx: Ctx): Promise<number | undefined> {
  const settings = await ctx.db.query("agreementSettings").order("desc").first();
  return settings?.enforcedAt;
}

/** For the physio setup checklist: which agreements this physio signs, and whether all are signed. */
export async function physioAgreementsStatus(
  ctx: Ctx,
  profile: Doc<"physiotherapistProfiles">
): Promise<{ ids: AgreementId[]; done: boolean; required: boolean }> {
  const ids = physioAgreementIds(profile.practiceMode);
  const states = await Promise.all(
    ids.map(async (id) => stateOf(id, await latestSignature(ctx, id, { userId: profile.userId })))
  );
  const enforcedAt = await loadAgreementsEnforcedAt(ctx);
  return {
    ids,
    done: states.every(hasSigned),
    required: typeof enforcedAt === "number" && enforcedAt <= Date.now(),
  };
}

/** Admin views: each agreement this physio signs and where it stands. */
export async function physioAgreementStates(ctx: Ctx, profile: Doc<"physiotherapistProfiles">) {
  return Promise.all(
    physioAgreementIds(profile.practiceMode).map(async (id) => ({
      id,
      shortTitle: AGREEMENTS[id].shortTitle,
      state: stateOf(id, await latestSignature(ctx, id, { userId: profile.userId })),
    }))
  );
}

/** Safe-to-show copy of a signature, for the signer and for admins. */
function signatureView(row: Doc<"agreementSignatures">) {
  return {
    id: row._id,
    agreementId: row.agreementId,
    version: row.version,
    values: row.values,
    signatureName: row.signatureName,
    signatureTitle: row.signatureTitle ?? null,
    signatureDrawing: row.signatureDrawing ?? null,
    signerEmail: row.signerEmail,
    documentHash: row.documentHash,
    signedAt: row.signedAt,
    status: row.status,
    countersignName: row.countersignName ?? null,
    countersignTitle: row.countersignTitle ?? null,
    countersignedAt: row.countersignedAt ?? null,
  };
}

type Signer =
  | { kind: "physio"; user: Doc<"users">; profile: Doc<"physiotherapistProfiles">; ids: AgreementId[] }
  | { kind: "clinic"; user: Doc<"users">; clinic: Doc<"clinics">; isOwner: boolean; ids: AgreementId[] }
  | { kind: "none"; user: Doc<"users">; reason: string };

async function resolveSigner(ctx: Ctx): Promise<Signer> {
  const user = await getAuthenticatedUser(ctx);
  if (user.role === "physiotherapist") {
    const profile = user.physiotherapistProfileId ? await ctx.db.get(user.physiotherapistProfileId) : null;
    if (!profile) return { kind: "none", user, reason: "Finish your application first. Your agreement appears here once your profile exists." };
    if (profile.clinicId) {
      return { kind: "none", user, reason: "You work with a clinic, so your clinic's agreement with Rehabify covers you." };
    }
    return { kind: "physio", user, profile, ids: physioAgreementIds(profile.practiceMode) };
  }
  if (user.role === "clinic_owner" || user.role === "clinic_staff") {
    const member = await getClinicMemberOrNull(ctx);
    if (member) return { kind: "clinic", user, clinic: member.clinic, isOwner: member.isOwner, ids: ["clinic_master_saas"] };
  }
  return { kind: "none", user, reason: "There's no agreement for this account to sign." };
}

/** The signed-in physio's or clinic's agreements, with details to prefill. */
export const getMyAgreements = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const signer = await resolveSigner(ctx);
    if (signer.kind === "none") return { kind: "none" as const, reason: signer.reason, items: [], prefill: {}, canSign: false, enforcedAt: null };

    const owner = signer.kind === "clinic" ? { clinicId: signer.clinic._id } : { userId: signer.user._id };
    const items = await Promise.all(
      signer.ids.map(async (id) => {
        const signature = await latestSignature(ctx, id, owner);
        const spec = AGREEMENTS[id];
        return {
          id,
          title: spec.title,
          shortTitle: spec.shortTitle,
          version: spec.version,
          state: stateOf(id, signature),
          signature: signature ? signatureView(signature) : null,
        };
      })
    );

    const prefill: Record<string, string> =
      signer.kind === "physio"
        ? { signerName: fullName(signer.user), mrtbNumber: signer.profile.licenseNumber ?? "" }
        : {
            clinicLegalName: signer.clinic.name,
            registrationNumber: signer.clinic.registrationNumber ?? "",
            clinicAddress: [signer.clinic.address, signer.clinic.city, signer.clinic.state].filter(Boolean).join(", "),
            signerName: signer.isOwner ? fullName(signer.user) : "",
            billingEmail: signer.clinic.contactEmail ?? signer.user.email ?? "",
          };
    const enforcedAt = await loadAgreementsEnforcedAt(ctx);

    return {
      kind: signer.kind,
      reason: null,
      items,
      prefill,
      canSign: signer.kind === "physio" || signer.isOwner,
      signerEmail: signer.user.email ?? "",
      enforcedAt: signer.kind === "physio" ? enforcedAt ?? null : null,
    };
  },
});

/** Sign the current version of an agreement. */
export const signAgreement = mutation({
  args: {
    agreementId: v.string(),
    values: v.record(v.string(), v.string()),
    signatureName: v.string(),
    signatureDrawing: v.optional(v.string()),
    agreed: v.literal(true),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!isAgreementId(args.agreementId)) throw new ConvexError("That agreement doesn't exist.");
    const id = args.agreementId;
    const spec = AGREEMENTS[id];
    const signer = await resolveSigner(ctx);
    if (signer.kind === "none") throw new ConvexError(signer.reason);
    if (!signer.ids.includes(id)) throw new ConvexError("This agreement isn't the one for your account.");
    if (signer.kind === "clinic" && !signer.isOwner) throw new ConvexError("Only the clinic owner can sign for the clinic.");
    if (!signer.user.email) throw new ConvexError("Add an email address to your account first.");

    const owner = signer.kind === "clinic" ? { clinicId: signer.clinic._id } : { userId: signer.user._id };
    const current = stateOf(id, await latestSignature(ctx, id, owner));
    if (hasSigned(current)) throw new ConvexError("You've already signed this version.");

    // Keep only the agreement's own fields, cleaned the same way the document fills them in
    const values: Record<string, string> = {};
    for (const field of spec.fields) {
      const value = cleanAgreementValue(args.values[field.key]);
      if (value) values[field.key] = value;
    }
    const errors = Object.values(agreementFieldErrors(id, values));
    if (errors.length) throw new ConvexError(errors[0]);

    const typed = cleanAgreementValue(args.signatureName);
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    if (!typed || norm(typed) !== norm(values.signerName ?? "")) {
      throw new ConvexError("Type your full name exactly as entered above to sign.");
    }
    const drawing = args.signatureDrawing?.trim();
    if (drawing && (drawing.length > 20_000 || !/^[MLQCZmlqcz0-9.,\s-]+$/.test(drawing))) {
      throw new ConvexError("That drawn signature couldn't be saved. Clear it and try again.");
    }

    const signedAt = Date.now();
    const documentHash = await sha256Hex(agreementPlainText(id, values, signedAt));
    const signatureId = await ctx.db.insert("agreementSignatures", {
      agreementId: id,
      version: spec.version,
      party: spec.party,
      userId: signer.user._id,
      clinicId: signer.kind === "clinic" ? signer.clinic._id : undefined,
      values,
      signatureName: typed,
      signatureTitle: values.signerTitle,
      signatureDrawing: drawing || undefined,
      signerEmail: signer.user.email,
      documentHash,
      userAgent: args.userAgent?.slice(0, 300),
      signedAt,
      status: spec.countersign ? "awaiting_countersign" : "active",
    });
    await ctx.db.insert("policyAcceptances", {
      userId: signer.user._id,
      name: typed,
      email: signer.user.email,
      document: id,
      version: spec.version,
      channel: "web",
      contextType: "agreement_signature",
      contextId: signatureId,
      acceptedAt: signedAt,
    });

    await ctx.scheduler.runAfter(0, sendEmail, {
      to: signer.user.email,
      subject: `You signed the ${spec.title}`,
      greetingName: signer.user.firstName ?? undefined,
      heading: "Thanks for signing",
      paragraphs: [
        `You signed the ${spec.title} (version ${spec.version}).`,
        spec.countersign
          ? "Rehabify will countersign it shortly and we'll email you when it's done. You can download your copy at any time."
          : "It's in effect now. You can download your copy at any time.",
      ],
      buttonLabel: "View your agreement",
      buttonUrl: appLink(signer.kind === "clinic" ? CLINIC_PAGE : PHYSIO_PAGE),
      footnote: PROFESSIONAL_FOOTNOTE,
    });
    return { signatureId, status: spec.countersign ? "awaiting_countersign" : "active" };
  },
});

// ---------------------------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------------------------

type PartyRow = {
  key: string;
  agreementId: AgreementId;
  party: "physiotherapist" | "clinic";
  userId: Id<"users"> | null;
  clinicId: Id<"clinics"> | null;
  name: string;
  reference: string | null;
  email: string | null;
  detail: string | null;
  state: AgreementState | "void";
  signatureId: Id<"agreementSignatures"> | null;
  signedAt: number | null;
  version: string | null;
  lastRemindedAt: number | null;
};

const MODE_DETAIL: Record<string, string> = {
  network: "Rehabify Care",
  independent: "Own patients",
  both: "Rehabify Care + own patients",
};

/**
 * Everyone who should sign, and where they are: approved physios outside clinics (by the
 * patients they see) and every clinic that isn't suspended. Capped at the most recent 1,000 of each.
 */
export const adminAgreementsOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const signatures = await ctx.db.query("agreementSignatures").withIndex("by_signed").order("desc").take(5000);
    const latest = new Map<string, Doc<"agreementSignatures">>();
    for (const row of signatures) {
      if (row.status === "void") continue;
      const key = row.clinicId ? `clinic:${row.clinicId}:${row.agreementId}` : `user:${row.userId}:${row.agreementId}`;
      if (!latest.has(key)) latest.set(key, row);
    }
    const reminders = await ctx.db.query("agreementReminders").order("desc").take(2000);
    const remindedAt = new Map<string, number>();
    for (const row of reminders) {
      const key = `${row.userId}:${row.agreementId}`;
      if (!remindedAt.has(key)) remindedAt.set(key, row.sentAt);
    }

    const rows: PartyRow[] = [];

    const approved = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .order("desc")
      .take(1000);
    for (const approval of approved) {
      const user = await ctx.db.get(approval.userId);
      if (!user || user.role !== "physiotherapist" || !user.physiotherapistProfileId) continue;
      const profile = await ctx.db.get(user.physiotherapistProfileId);
      if (!profile || profile.clinicId) continue;
      for (const agreementId of physioAgreementIds(profile.practiceMode)) {
        const signature = latest.get(`user:${user._id}:${agreementId}`) ?? null;
        rows.push({
          key: `user:${user._id}:${agreementId}`,
          agreementId,
          party: "physiotherapist",
          userId: user._id,
          clinicId: null,
          name: fullName(user) || user.email || "Physiotherapist",
          reference: user.staffNumber ?? null,
          email: user.email ?? null,
          detail: MODE_DETAIL[profile.practiceMode ?? "network"],
          state: stateOf(agreementId, signature),
          signatureId: signature?._id ?? null,
          signedAt: signature?.signedAt ?? null,
          version: signature?.version ?? null,
          lastRemindedAt: remindedAt.get(`${user._id}:${agreementId}`) ?? null,
        });
      }
    }

    const clinics = await ctx.db.query("clinics").order("desc").take(1000);
    for (const clinic of clinics) {
      if (clinic.status === "suspended") continue;
      const owner = await ctx.db.get(clinic.ownerId);
      const signature = latest.get(`clinic:${clinic._id}:clinic_master_saas`) ?? null;
      rows.push({
        key: `clinic:${clinic._id}:clinic_master_saas`,
        agreementId: "clinic_master_saas",
        party: "clinic",
        userId: owner?._id ?? null,
        clinicId: clinic._id,
        name: clinic.name,
        reference: clinic.clinicNumber ?? null,
        email: owner?.email ?? clinic.contactEmail ?? null,
        detail: CLINIC_PLANS.find((plan) => plan.id === signature?.values.plan)?.name ?? (fullName(owner) || null),
        state: stateOf("clinic_master_saas", signature),
        signatureId: signature?._id ?? null,
        signedAt: signature?.signedAt ?? null,
        version: signature?.version ?? null,
        lastRemindedAt: owner ? remindedAt.get(`${owner._id}:clinic_master_saas`) ?? null : null,
      });
    }

    const count = (state: PartyRow["state"]) => rows.filter((row) => row.state === state).length;
    const settings = await ctx.db.query("agreementSettings").order("desc").first();
    return {
      rows,
      stats: {
        total: rows.length,
        active: count("active"),
        awaitingCountersign: count("awaiting_countersign"),
        notSigned: count("not_signed"),
        outdated: count("outdated"),
      },
      enforcedAt: settings?.enforcedAt ?? null,
      signatories: REHABIFY_SIGNATORIES.map((s) => ({ ...s })),
    };
  },
});

/** One signature in full, with the party's earlier signatures of the same agreement. */
export const adminAgreementSignature = query({
  args: { signatureId: v.id("agreementSignatures") },
  handler: async (ctx, { signatureId }) => {
    await requireAdmin(ctx);
    const row = await ctx.db.get(signatureId);
    if (!row) return null;
    const history = row.clinicId
      ? await ctx.db
          .query("agreementSignatures")
          .withIndex("by_clinic_agreement", (q) => q.eq("clinicId", row.clinicId).eq("agreementId", row.agreementId))
          .order("desc")
          .take(20)
      : await ctx.db
          .query("agreementSignatures")
          .withIndex("by_user_agreement", (q) => q.eq("userId", row.userId).eq("agreementId", row.agreementId))
          .order("desc")
          .take(20);
    const signer = await ctx.db.get(row.userId);
    const countersigner = row.countersignedBy ? await ctx.db.get(row.countersignedBy) : null;
    return {
      ...signatureView(row),
      userAgent: row.userAgent ?? null,
      voidReason: row.voidReason ?? null,
      voidedAt: row.voidedAt ?? null,
      signerAccount: signer ? { id: signer._id, name: fullName(signer), email: signer.email ?? null, reference: signer.staffNumber ?? null } : null,
      countersignedByAccount: countersigner ? fullName(countersigner) || countersigner.email || null : null,
      history: history.map((item) => ({ id: item._id, version: item.version, status: item.status, signedAt: item.signedAt })),
    };
  },
});

/** Rehabify's countersignature, by one of the named signatories. */
export const adminCountersignAgreement = mutation({
  args: { signatureId: v.id("agreementSignatures"), signatory: v.number() },
  handler: async (ctx, { signatureId, signatory }) => {
    const { user: admin } = await requireAdmin(ctx);
    const row = await ctx.db.get(signatureId);
    if (!row) throw new ConvexError("Signature not found.");
    if (row.status !== "awaiting_countersign") throw new ConvexError("This agreement isn't waiting for Rehabify's signature.");
    const person = REHABIFY_SIGNATORIES[signatory];
    if (!person) throw new ConvexError("Choose who is signing for Rehabify.");
    await ctx.db.patch(signatureId, {
      status: "active",
      countersignedBy: admin._id,
      countersignName: person.name,
      countersignTitle: person.title,
      countersignedAt: Date.now(),
    });
    const spec = isAgreementId(row.agreementId) ? AGREEMENTS[row.agreementId] : null;
    await ctx.scheduler.runAfter(0, sendEmail, {
      to: row.signerEmail,
      subject: `Your ${spec?.title ?? "agreement"} is fully signed`,
      heading: "Your agreement is fully signed",
      paragraphs: [
        `${person.name} (${person.title}) has signed the ${spec?.title ?? "agreement"} for Rehabify. It's now in effect.`,
        "Download your signed copy from your dashboard and keep it for your records.",
      ],
      buttonLabel: "Download your copy",
      buttonUrl: appLink(row.party === "clinic" ? CLINIC_PAGE : PHYSIO_PAGE),
      footnote: PROFESSIONAL_FOOTNOTE,
    });
    return { success: true };
  },
});

/** Void a signature signed in error. The signer is asked to sign again. */
export const adminVoidAgreementSignature = mutation({
  args: { signatureId: v.id("agreementSignatures"), reason: v.string() },
  handler: async (ctx, { signatureId, reason }) => {
    const { user: admin } = await requireAdmin(ctx);
    const row = await ctx.db.get(signatureId);
    if (!row) throw new ConvexError("Signature not found.");
    if (row.status === "void") return { success: true };
    const why = reason.trim();
    if (why.length < 5) throw new ConvexError("Say why it's being voided.");
    await ctx.db.patch(signatureId, { status: "void", voidedAt: Date.now(), voidedBy: admin._id, voidReason: why.slice(0, 500) });
    return { success: true };
  },
});

/** Email someone a link to sign. At most one reminder per agreement per person per day. */
export const adminSendAgreementRequest = mutation({
  args: { userId: v.id("users"), agreementId: v.string(), clinicId: v.optional(v.id("clinics")) },
  handler: async (ctx, args) => {
    const { user: admin } = await requireAdmin(ctx);
    if (!isAgreementId(args.agreementId)) throw new ConvexError("That agreement doesn't exist.");
    const spec = AGREEMENTS[args.agreementId];
    const user = await ctx.db.get(args.userId);
    if (!user?.email) throw new ConvexError("This account has no email address.");
    const last = await ctx.db
      .query("agreementReminders")
      .withIndex("by_user_agreement", (q) => q.eq("userId", args.userId).eq("agreementId", args.agreementId))
      .order("desc")
      .first();
    if (last && Date.now() - last.sentAt < 20 * 60 * 60 * 1000) {
      throw new ConvexError("A reminder already went out today. Try again tomorrow.");
    }
    const owner = args.clinicId ? { clinicId: args.clinicId } : { userId: args.userId };
    if (hasSigned(stateOf(args.agreementId, await latestSignature(ctx, args.agreementId, owner)))) {
      throw new ConvexError("They've already signed the current version.");
    }
    await ctx.db.insert("agreementReminders", {
      agreementId: args.agreementId,
      userId: args.userId,
      clinicId: args.clinicId,
      email: user.email,
      sentBy: admin._id,
      sentAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, sendEmail, {
      to: user.email,
      subject: `Please sign the ${spec.title}`,
      greetingName: user.firstName ?? undefined,
      heading: "Your agreement is ready to sign",
      paragraphs: [
        `The ${spec.title} sets out how you and Rehabify work together. It takes about five minutes: check your details, read it, and sign online.`,
        "You can download a signed copy straight after.",
      ],
      buttonLabel: "Review and sign",
      buttonUrl: appLink(spec.party === "clinic" ? CLINIC_PAGE : PHYSIO_PAGE),
      footnote: PROFESSIONAL_FOOTNOTE,
    });
    return { success: true };
  },
});

/** Set or clear the date from which physios must have signed to be bookable. */
export const adminSetAgreementsEnforcement = mutation({
  args: { enforcedAt: v.optional(v.number()) },
  handler: async (ctx, { enforcedAt }) => {
    const { user: admin } = await requireAdmin(ctx);
    await ctx.db.insert("agreementSettings", { enforcedAt, updatedAt: Date.now(), updatedBy: admin._id });
    return { success: true };
  },
});
