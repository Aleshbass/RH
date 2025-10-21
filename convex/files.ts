import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { getAuthenticatedUser } from "./auth";
import { Id } from "./_generated/dataModel";

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
    // Authenticate the user
    const user = await getAuthenticatedUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Generate the upload URL
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
    // Check if file exists
    const exists = await ctx.storage.getUrl(args.storageId);
    return exists;
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
      v.literal("additionalCertificate")
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
      v.literal("additionalCertificate")
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
    };

    const rawType = fileMetadata.contentType || extToMime[ext] || "application/octet-stream";
    const contentType = normalizeType(rawType);

    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      // Accept common variants
      "image/jpg",
      "application/x-pdf",
    ];
    if (!allowedTypes.includes(contentType)) {
      throw new Error("Invalid file type. Only PDF, JPEG, and PNG files are allowed.");
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (fileMetadata.size > maxSize) {
      throw new Error("File size exceeds maximum limit of 10MB");
    }

    return await ctx.db.insert("patientDocuments", {
      patientProfileId: args.patientProfileId,
      storageId: args.storageId,
      documentType: args.documentType,
      fileName: args.fileName,
      fileSize: fileMetadata.size,
      contentType, // store normalized content type
      uploadedAt: Date.now(),
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

    const documents = await ctx.db
      .query("patientDocuments")
      .withIndex("by_patient_profile_id", (q) =>
        q.eq("patientProfileId", args.patientProfileId)
      )
      .collect();

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
    downloadUrl: v.string(),
  })),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "physiotherapist") throw new Error("Access denied");

    // Check active relationship
    const rel = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q)=>
        q.eq("patientId", args.patientUserId).eq("physiotherapistId", user._id))
      .filter((q)=>q.eq(q.field("status"), "active"))
      .unique();

    if (!rel) throw new Error("No access to this patient");

    // Get patient profile
    const patient = await ctx.db.get(args.patientUserId);
    if (!patient?.patientProfileId) return [];

    const docs = await ctx.db
      .query("patientDocuments")
      .withIndex("by_patient_profile_id", (q)=>q.eq("patientProfileId", patient.patientProfileId!))
      .collect();

    return await Promise.all(
      docs.map(async (d) => ({
        _id: d._id,
        patientProfileId: d.patientProfileId,
        storageId: d.storageId,
        documentType: d.documentType,
        fileName: d.fileName,
        fileSize: d.fileSize,
        contentType: d.contentType,
        uploadedAt: d.uploadedAt,
        downloadUrl: (await ctx.storage.getUrl(d.storageId)) || "",
      }))
    );
  },
});