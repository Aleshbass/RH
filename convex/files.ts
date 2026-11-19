import { ConvexError, v } from "convex/values";
import { mutation, query, action, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getAuthenticatedUser } from "./auth";
import { Doc, Id } from "./_generated/dataModel";
import { findRelationship, isApproved, requireActiveRelationship, requirePhysio } from "./helpers/careAccess";
import { assertPatientInClinic, canUseArea, isClinicAdmin, requireClinicWrite, resolveClinicMember } from "./clinicTools";
import {
  documentRight,
  isShownDocument,
  renamedFileName,
  withDocumentRights,
  type DocumentEditor,
} from "./helpers/patientDocuments";

/**
 * Generate an upload URL for the browser.
 */
export const generateUploadUrl = mutation({
  args: {
    fileType: v.string(), // MIME type
    fileName: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    if (args.fileName.length > 255) {
      throw new Error("File name is too long");
    }

    // Guests may upload before they have an account (physio sign-up photo and
    // licence documents), but only images and PDFs. Linking a stored file to a
    // record is protected by auth in the save/update mutations.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      const type = args.fileType.toLowerCase();
      const guestAllowed =
        (type.startsWith("image/") && type !== "image/svg+xml") || type === "application/pdf";
      if (!guestAllowed) {
        throw new Error("Please sign in to upload this type of file");
      }
    }

    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Get a URL to download a file from storage.
 */
export const getFileUrl = query({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    // Stored files include licences, IDs and patient documents: never hand them out signed out.
    // (Only signed-in screens use this: chat attachments, treatment-plan media.)
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.storage.getUrl(args.storageId);
  },
});

/**
 * Store a file reference in the database to link it with a physiotherapist.
 */
export const savePhysiotherapistDocument = mutation({
  args: {
    physiotherapistId: v.id("physiotherapistProfiles"),
    storageId: v.id("_storage"),
    documentType: v.union(
      v.literal("licenseDocument"),
      v.literal("additionalCertificate"),
      v.literal("degreeCertificate"),
      v.literal("nyscCertificate"),
      v.literal("transcript"),
      v.literal("mrtbLicense"),
      v.literal("npaMembership"),
      v.literal("practicingLicense"),
      v.literal("nationalId"),
      v.literal("passportPhoto"),
      v.literal("proofOfAddress")
    ),
    fileName: v.string(),
    fileSize: v.number(),
    contentType: v.string(),
  },
  returns: v.id("physiotherapistDocuments"),
  handler: async (ctx, args) => {
    // Authenticate the user
    const user = await getAuthenticatedUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Verify this physiotherapist profile belongs to the current user
    const profile = await ctx.db.get(args.physiotherapistId);
    if (!profile || profile.userId !== user._id) {
      throw new Error("Not authorized to upload documents for this profile");
    }

    // Get file metadata to verify file exists
    const fileMetadata = await ctx.storage.getMetadata(args.storageId);
    if (!fileMetadata) {
      throw new Error("File not found in storage");
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/jpg'
    ];

    if (!allowedTypes.includes(args.contentType)) {
      throw new Error("Invalid file type. Only PDF, JPEG, and PNG files are allowed.");
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB in bytes
    if (args.fileSize > maxSize) {
      throw new Error("File size exceeds maximum limit of 10MB");
    }

    try {
      // Store the document reference
      const docId = await ctx.db.insert("physiotherapistDocuments", {
        physiotherapistId: args.physiotherapistId,
        storageId: args.storageId,
        documentType: args.documentType,
        fileName: args.fileName,
        fileSize: args.fileSize,
        contentType: args.contentType,
        uploadedAt: Date.now(),
      });

      return docId;
    } catch (error) {
      console.error("Error saving document reference:", error);
      throw new Error("Failed to save document reference");
    }
  },
});

/**
 * Get all documents for a physiotherapist.
 */
export const getPhysiotherapistDocuments = query({
  args: {
    physiotherapistId: v.id("physiotherapistProfiles"),
  },
  returns: v.array(v.object({
    _id: v.id("physiotherapistDocuments"),
    physiotherapistId: v.id("physiotherapistProfiles"),
    storageId: v.id("_storage"),
    documentType: v.union(
      v.literal("licenseDocument"),
      v.literal("additionalCertificate"),
      v.literal("degreeCertificate"),
      v.literal("nyscCertificate"),
      v.literal("transcript"),
      v.literal("mrtbLicense"),
      v.literal("npaMembership"),
      v.literal("practicingLicense"),
      v.literal("nationalId"),
      v.literal("passportPhoto"),
      v.literal("proofOfAddress")
    ),
    fileName: v.string(),
    fileSize: v.number(),
    contentType: v.string(),
    uploadedAt: v.number(),
    downloadUrl: v.string(),
  })),
  handler: async (ctx, args) => {
    // Authenticate the user
    const user = await getAuthenticatedUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Verify this physiotherapist profile belongs to the current user
    const profile = await ctx.db.get(args.physiotherapistId);
    if (!profile || profile.userId !== user._id) {
      throw new Error("Not authorized to view documents for this profile");
    }

    // Get all documents
    const documents = await ctx.db
      .query("physiotherapistDocuments")
      .withIndex("by_physiotherapist_id", (q) =>
        q.eq("physiotherapistId", args.physiotherapistId)
      )
      .collect();

    // Add download URLs
    return await Promise.all(
      documents.map(async (doc) => {
        const downloadUrl = await ctx.storage.getUrl(doc.storageId) || "";
        // Return only the fields defined in the validator
        return {
          _id: doc._id,
          physiotherapistId: doc.physiotherapistId,
          storageId: doc.storageId,
          documentType: doc.documentType,
          fileName: doc.fileName,
          fileSize: doc.fileSize,
          contentType: doc.contentType,
          uploadedAt: doc.uploadedAt,
          downloadUrl,
        };
      })
    );
  },
});

/**
 * Delete a physiotherapist document and its associated file.
 */
export const deletePhysiotherapistDocument = mutation({
  args: {
    documentId: v.id("physiotherapistDocuments"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    // Authenticate the user
    const user = await getAuthenticatedUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Get the document to verify ownership
    const document = await ctx.db.get(args.documentId);
    if (!document) {
      throw new Error("Document not found");
    }

    // Verify the physiotherapist profile belongs to the current user
    const profile = await ctx.db.get(document.physiotherapistId);
    if (!profile || profile.userId !== user._id) {
      throw new Error("Not authorized to delete this document");
    }

    try {
      // Delete the file from storage
      await ctx.storage.delete(document.storageId);

      // Delete the document record from database
      await ctx.db.delete(args.documentId);

      return true;
    } catch (error) {
      console.error("Error deleting document:", error);
      throw new Error("Failed to delete document");
    }
  },
});

/**
 * Store a clinic document reference in the database.
 */
export const saveClinicDocument = mutation({
  args: {
    clinicId: v.id("clinics"),
    storageId: v.id("_storage"),
    documentType: v.union(
      v.literal("businessLicense"),
      v.literal("taxRegistration"),
      v.literal("insuranceProof"),
      v.literal("ownerIdentification"),
      v.literal("additionalDocument")
    ),
    fileName: v.string(),
  },
  returns: v.id("clinicDocuments"),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Authorization: Check if user has access to the clinic
    const clinic = await ctx.db.get(args.clinicId);
    if (!clinic) {
      throw new Error("Clinic not found");
    }

    // Allow clinic owner or clinic staff (physiotherapists) to upload
    let hasAccess = false;
    if (clinic.ownerId === user._id) {
      hasAccess = true; // Clinic owner
    } else if (user.role === "physiotherapist") {
      // Check if physiotherapist is part of this clinic
      const physiotherapistProfile = await ctx.db
        .query("physiotherapistProfiles")
        .withIndex("by_user_id", (q) => q.eq("userId", user._id))
        .unique();

      if (physiotherapistProfile && physiotherapistProfile.clinicId === args.clinicId) {
        hasAccess = true; // Clinic staff member
      }
    }

    if (!hasAccess) {
      throw new Error("Not authorized to upload documents for this clinic");
    }

    const fileMetadata = await ctx.storage.getMetadata(args.storageId);
    if (!fileMetadata) {
      throw new Error("File not found in storage");
    }

    return await ctx.db.insert("clinicDocuments", {
      clinicId: args.clinicId,
      storageId: args.storageId,
      documentType: args.documentType,
      fileName: args.fileName,
      fileSize: fileMetadata.size,
      contentType: fileMetadata.contentType || "application/octet-stream",
      uploadedAt: Date.now(),
    });
  },
});

/**
 * Get all documents for a clinic.
 */
export const getClinicDocuments = query({
  args: {
    clinicId: v.id("clinics"),
  },
  returns: v.array(v.object({
    _id: v.id("clinicDocuments"),
    _creationTime: v.number(), // Added to match actual document structure
    clinicId: v.id("clinics"),
    storageId: v.id("_storage"),
    documentType: v.union(
      v.literal("businessLicense"),
      v.literal("taxRegistration"),
      v.literal("insuranceProof"),
      v.literal("ownerIdentification"),
      v.literal("additionalDocument")
    ),
    fileName: v.string(),
    fileSize: v.number(),
    contentType: v.string(),
    uploadedAt: v.number(),
    downloadUrl: v.string(),
  })),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Authorization: Check if user has rights to view documents for this clinic
    const clinic = await ctx.db.get(args.clinicId);
    if (!clinic || clinic.ownerId !== user._id) {
      // TODO: Add more sophisticated role-based access for clinic staff
      throw new Error("Not authorized to view documents for this clinic");
    }

    const documents = await ctx.db
      .query("clinicDocuments")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", args.clinicId))
      .collect();

    return await Promise.all(
      documents.map(async (doc) => {
        const downloadUrl = (await ctx.storage.getUrl(doc.storageId)) || "";
        return { ...doc, downloadUrl };
      })
    );
  },
});

/**
 * Store a patient document reference in the database.
 */
export const savePatientDocument = mutation({
  args: {
    patientProfileId: v.id("patientProfiles"),
    storageId: v.id("_storage"),
    documentType: v.union(
      v.literal("referralLetter"),
      v.literal("medicalRecord"),
      v.literal("insuranceCard"),
      v.literal("otherDocument")
    ),
    fileName: v.string(),
  },
  returns: v.id("patientDocuments"),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Authorization: Check if user is the patient or an authorized professional
    const patientProfile = await ctx.db.get(args.patientProfileId);
    if (!patientProfile || patientProfile.userId !== user._id) {
      // TODO: Add logic for physiotherapists or other authorized roles to upload for a patient
      // For now, only the patient themselves can upload to their profile.
      throw new Error("Not authorized to upload documents for this patient profile");
    }

    const fileMetadata = await ctx.storage.getMetadata(args.storageId);
    if (!fileMetadata) {
      throw new Error("File not found in storage");
    }

    // Validate file type and size for patient documents
    const normalizeType = (t: string | null | undefined) => {
      const lower = (t || "").toLowerCase();
      if (lower === "image/jpg") return "image/jpeg";
      if (lower === "application/x-pdf") return "application/pdf";
      if (lower === "image/pjpeg") return "image/jpeg";
      return lower;
    };

    const ext = (args.fileName.split(".").pop() || "").toLowerCase();
    const extToMime: Record<string, string> = {
      pdf: "application/pdf",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    };

    const rawType = fileMetadata.contentType || extToMime[ext] || "application/octet-stream";
    const contentType = normalizeType(rawType);

    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      // Accept common variants
      "image/jpg",
      "application/x-pdf",
    ];
    if (!allowedTypes.includes(contentType)) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError("This file type isn't supported. Upload a PDF, JPEG, PNG or WebP file.");
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (fileMetadata.size > maxSize) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError("This file is larger than 10 MB. Please upload a smaller file.");
    }

    return await ctx.db.insert("patientDocuments", {
      patientProfileId: args.patientProfileId,
      storageId: args.storageId,
      documentType: args.documentType,
      fileName: args.fileName,
      fileSize: fileMetadata.size,
      contentType, // store normalized content type
      uploadedAt: Date.now(),
      uploadedBy: user._id,
      sharedWithPhysiotherapist: true, // Default to shared
    });
  },
});

/**
 * Get all documents for a patient profile.
 */
export const getPatientDocuments = query({
  args: {
    patientProfileId: v.id("patientProfiles"),
  },
  returns: v.array(v.object({
    _id: v.id("patientDocuments"),
    patientProfileId: v.id("patientProfiles"),
    storageId: v.id("_storage"),
    documentType: v.union(
      v.literal("referralLetter"),
      v.literal("medicalRecord"),
      v.literal("insuranceCard"),
      v.literal("otherDocument")
    ),
    fileName: v.string(),
    fileSize: v.number(),
    contentType: v.string(),
    uploadedAt: v.number(),
    sharedWithPhysiotherapist: v.optional(v.boolean()),
    downloadUrl: v.string(),
  })),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Authorization: Check if user is the patient or an authorized professional
    const patientProfile = await ctx.db.get(args.patientProfileId);
    if (!patientProfile || patientProfile.userId !== user._id) {
      // TODO: Add logic for physiotherapists or other authorized roles to view patient documents
      // For now, only the patient themselves can view their documents.
      throw new Error("Not authorized to view documents for this patient profile");
    }

    // Files the care team deleted are kept for the audit trail, not shown
    const documents = (
      await ctx.db
        .query("patientDocuments")
        .withIndex("by_patient_profile_id", (q) =>
          q.eq("patientProfileId", args.patientProfileId)
        )
        .collect()
    ).filter(isShownDocument);

    return await Promise.all(
      documents.map(async (doc) => {
        const downloadUrl = (await ctx.storage.getUrl(doc.storageId)) || "";
        return {
          _id: doc._id,
          patientProfileId: doc.patientProfileId,
          storageId: doc.storageId,
          documentType: doc.documentType,
          fileName: doc.fileName,
          fileSize: doc.fileSize,
          contentType: doc.contentType,
          uploadedAt: doc.uploadedAt,
          sharedWithPhysiotherapist: doc.sharedWithPhysiotherapist,
          downloadUrl,
        };
      })
    );
  },
});

/**
 * Get patient documents for physiotherapist who has an active relationship
 */
export const getPatientDocumentsForPhysio = query({
  args: { patientUserId: v.id("users") },
  returns: v.array(v.object({
    _id: v.id("patientDocuments"),
    patientProfileId: v.id("patientProfiles"),
    storageId: v.id("_storage"),
    documentType: v.union(
      v.literal("referralLetter"),
      v.literal("medicalRecord"),
      v.literal("insuranceCard"),
      v.literal("otherDocument")
    ),
    fileName: v.string(),
    fileSize: v.number(),
    contentType: v.string(),
    uploadedAt: v.number(),
    sharedWithPhysiotherapist: v.optional(v.boolean()),
    downloadUrl: v.string(),
    // Who added it: a name, "Patient", or null for older files that don't say
    uploadedByName: v.union(v.string(), v.null()),
    // Whether this physio may rename, re-type or delete it now (helpers/patientDocuments.ts)
    canEdit: v.boolean(),
    // Set when that right ends 24 hours after the upload
    editableUntil: v.optional(v.number()),
    // Why not, when only the clinic admin can change it
    lockedReason: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "physiotherapist") throw new Error("Access denied");

    // Any relationship with this patient, current or past (records stay readable after care ends)
    const rel = await findRelationship(ctx, user._id, args.patientUserId);

    if (!rel) return [];

    // Patient profile: the user's link, or looked up by user (profiles created by staff)
    const patient = await ctx.db.get(args.patientUserId);
    const profileId =
      patient?.patientProfileId ??
      (await ctx.db
        .query("patientProfiles")
        .withIndex("by_user_id", (q) => q.eq("userId", args.patientUserId))
        .first())?._id;
    if (!profileId) return [];

    const docs = await ctx.db
      .query("patientDocuments")
      .withIndex("by_patient_profile_id", (q) => q.eq("patientProfileId", profileId))
      .filter((q) => q.or(
        q.eq(q.field("sharedWithPhysiotherapist"), true),
        q.eq(q.field("sharedWithPhysiotherapist"), undefined) // Backwards compatibility
      ))
      .collect();

    const editor = await physioDocumentEditor(ctx, user, rel, args.patientUserId);
    const described = await withDocumentRights(ctx, docs.filter(isShownDocument), editor, args.patientUserId, Date.now());

    return await Promise.all(
      described.map(async ({ doc: d, uploadedByName, canEdit, editableUntil, lockedReason }) => ({
        _id: d._id,
        patientProfileId: d.patientProfileId,
        storageId: d.storageId,
        documentType: d.documentType,
        fileName: d.fileName,
        fileSize: d.fileSize,
        contentType: d.contentType,
        uploadedAt: d.uploadedAt,
        sharedWithPhysiotherapist: d.sharedWithPhysiotherapist,
        downloadUrl: (await ctx.storage.getUrl(d.storageId)) || "",
        uploadedByName,
        canEdit,
        editableUntil,
        lockedReason,
      }))
    );
  },
});

/**
 * Toggle document sharing with physiotherapist
 * Allows patients to control visibility of their documents
 */
export const toggleDocumentSharing = mutation({
  args: {
    documentId: v.id("patientDocuments"),
    shared: v.boolean(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Get the document (one the care team deleted is gone from the patient's view too)
    const document = await ctx.db.get(args.documentId);
    if (!document || !isShownDocument(document)) {
      throw new Error("Document not found");
    }

    // Verify the patient profile belongs to the current user
    const patientProfile = await ctx.db.get(document.patientProfileId);
    if (!patientProfile || patientProfile.userId !== user._id) {
      throw new Error("Not authorized to modify this document");
    }

    // Update the sharing status
    await ctx.db.patch(args.documentId, {
      sharedWithPhysiotherapist: args.shared,
    });

    return true;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// The care team changing files on a patient's record: rename, change the type, delete.
// Rules in helpers/patientDocuments.ts; who counts as the care team is checked the same way as
// adding a file (physioCare.attachPatientFile, clinicTools.attachPatientDocument).
// ─────────────────────────────────────────────────────────────────────────────

const patientDocumentType = v.union(
  v.literal("referralLetter"),
  v.literal("medicalRecord"),
  v.literal("insuranceCard"),
  v.literal("otherDocument")
);

/**
 * For the physio workspace's file list: what this physio may do with the patient's files, without
 * throwing. Mirrors requireActiveRelationship (active care, and for a clinic's patient: still on
 * the team, not suspended, a role with Patients). The clinic's billing state isn't checked here;
 * the change itself is checked again when it's made.
 */
async function physioDocumentEditor(
  ctx: QueryCtx,
  physio: Doc<"users">,
  relationship: Doc<"patientPhysiotherapistRelationships">,
  patientUserId: Id<"users">
): Promise<DocumentEditor | null> {
  if (relationship.status !== "active" || !(await isApproved(ctx, physio._id))) return null;
  // An independent physio's own patient: they're their own admin
  if (!relationship.clinicId) return { userId: physio._id, isAdmin: true, patientUserId };
  if (physio.clinicId !== relationship.clinicId || (physio.status && physio.status !== "active")) return null;
  const member = await resolveClinicMember(ctx, physio);
  if (!member || !canUseArea(member, "patients")) return null;
  return { userId: physio._id, isAdmin: isClinicAdmin(member), patientUserId };
}

/**
 * The signed-in care-team member who wants to change this patient's files. Throws (in plain
 * English) when they can't add files for the patient right now, as adding one would.
 */
async function requireDocumentEditor(ctx: MutationCtx, patientUserId: Id<"users">): Promise<DocumentEditor> {
  const user = await getAuthenticatedUser(ctx);
  if (user.role === "physiotherapist") {
    const physio = await requirePhysio(ctx);
    // Active care; for a clinic's patient also the clinic's rules (team, read-only, Patients page)
    const relationship = await requireActiveRelationship(ctx, physio._id, patientUserId);
    if (!relationship.clinicId) return { userId: physio._id, isAdmin: true, patientUserId };
    const member = await resolveClinicMember(ctx, physio);
    const isAdmin = Boolean(member && member.clinic._id === relationship.clinicId && isClinicAdmin(member));
    return { userId: physio._id, isAdmin, patientUserId };
  }
  if (user.role === "clinic_owner" || user.role === "clinic_staff") {
    const member = await requireClinicWrite(ctx, "patients");
    await assertPatientInClinic(ctx, member.clinic, patientUserId);
    return { userId: member.user._id, isAdmin: isClinicAdmin(member), patientUserId };
  }
  throw new ConvexError("Only the patient's care team can change files on their record.");
}

/** The account of the patient a file belongs to, or null when their record is gone. */
async function documentPatient(ctx: MutationCtx, doc: Doc<"patientDocuments">) {
  const profile = await ctx.db.get(doc.patientProfileId);
  return profile?.userId ?? null;
}

/** Rename a file on a patient's record, or change its type. */
export const updatePatientDocument = mutation({
  args: {
    documentId: v.id("patientDocuments"),
    fileName: v.optional(v.string()),
    documentType: v.optional(patientDocumentType),
  },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc || !isShownDocument(doc)) throw new ConvexError("This file has been deleted.");
    const patientUserId = await documentPatient(ctx, doc);
    if (!patientUserId) throw new ConvexError("This patient's record couldn't be found.");
    const editor = await requireDocumentEditor(ctx, patientUserId);
    const now = Date.now();
    const right = documentRight(doc, editor, now, "change");
    if (!right.canEdit) throw new ConvexError(right.reason);

    const patch: { fileName?: string; documentType?: Doc<"patientDocuments">["documentType"] } = {};
    if (args.fileName !== undefined) {
      const fileName = renamedFileName(args.fileName, doc.fileName);
      if (!fileName) throw new ConvexError("Give the file a name.");
      if (fileName !== doc.fileName) patch.fileName = fileName;
    }
    if (args.documentType !== undefined && args.documentType !== doc.documentType) {
      patch.documentType = args.documentType;
    }
    if (Object.keys(patch).length === 0) return { changed: false };

    await ctx.db.patch(doc._id, { ...patch, editedAt: now, editedBy: editor.userId });
    return { changed: true };
  },
});

/**
 * Delete files from a patient's record, several at once. Each file is checked on its own: the ones
 * this person may not delete are skipped with the reason. The stored files are kept (deletedAt)
 * for the audit trail; nobody sees them on the record any more.
 */
export const deletePatientDocuments = mutation({
  args: { documentIds: v.array(v.id("patientDocuments")) },
  returns: v.object({
    deleted: v.number(),
    skipped: v.array(
      v.object({ documentId: v.id("patientDocuments"), fileName: v.string(), reason: v.string() })
    ),
  }),
  handler: async (ctx, args) => {
    const ids = [...new Set(args.documentIds)];
    if (ids.length > 50) throw new ConvexError("Delete up to 50 files at a time.");
    const now = Date.now();
    // One access check per patient: the editor, or why this person can't change their files
    const editors = new Map<Id<"users">, DocumentEditor | string>();
    let deleted = 0;
    const skipped: { documentId: Id<"patientDocuments">; fileName: string; reason: string }[] = [];

    for (const documentId of ids) {
      const doc = await ctx.db.get(documentId);
      if (!doc || !isShownDocument(doc)) {
        skipped.push({ documentId, fileName: doc?.fileName ?? "File", reason: "This file was already deleted." });
        continue;
      }
      const patientUserId = await documentPatient(ctx, doc);
      if (!patientUserId) {
        skipped.push({ documentId, fileName: doc.fileName, reason: "This patient's record couldn't be found." });
        continue;
      }
      let editor = editors.get(patientUserId);
      if (editor === undefined) {
        try {
          editor = await requireDocumentEditor(ctx, patientUserId);
        } catch (error) {
          if (!(error instanceof ConvexError) || typeof error.data !== "string") throw error;
          editor = error.data;
        }
        editors.set(patientUserId, editor);
      }
      if (typeof editor === "string") {
        skipped.push({ documentId, fileName: doc.fileName, reason: editor });
        continue;
      }
      const right = documentRight(doc, editor, now, "delete");
      if (!right.canEdit) {
        skipped.push({ documentId, fileName: doc.fileName, reason: right.reason });
        continue;
      }
      await ctx.db.patch(doc._id, { deletedAt: now, deletedBy: editor.userId });
      deleted += 1;
    }

    return { deleted, skipped };
  },
});
