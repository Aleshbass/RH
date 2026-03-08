import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from "@/convex/_generated/api";
import { useConvex } from "convex/react";
import { Id } from "@/convex/_generated/dataModel";
import { useFileUpload } from './useFileUpload';

export type PhysioDocumentType =
  | "licenseDocument"
  | "additionalCertificate"
  | "degreeCertificate"
  | "nyscCertificate"
  | "transcript"
  | "mrtbLicense"
  | "npaMembership"
  | "practicingLicense"
  | "nationalId"
  | "passportPhoto"
  | "proofOfAddress";

interface PhysiotherapistDocument {
  _id: Id<"physiotherapistDocuments">;
  physiotherapistId: Id<"physiotherapistProfiles">;
  storageId: Id<"_storage">;
  documentType: PhysioDocumentType;
  fileName: string;
  fileSize: number;
  contentType: string;
  uploadedAt: number;
  downloadUrl: string;
}

/**
 * Custom hook for managing physiotherapist documents in Convex
 * 
 * @param physiotherapistId The ID of the physiotherapist profile
 * @returns Functions and state for managing physiotherapist documents
 */
export function usePhysiotherapistDocuments(physiotherapistId: Id<"physiotherapistProfiles"> | null) {
  const convex = useConvex();
  const [error, setError] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());

  // Use the file upload hook
  const {
    uploadFile,
    isUploading,
    progress,
  } = useFileUpload({
    onError: (err) => setError(err.message),
  });

  // Fetch all documents for the physiotherapist
  const documentsQuery = useQuery({
    queryKey: ['physiotherapistDocuments', physiotherapistId],
    queryFn: async () => {
      if (!physiotherapistId) return [];

      try {
        const documents = await convex.query(api.files.getPhysiotherapistDocuments, {
          physiotherapistId
        });
        return documents || [];
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch documents';
        setError(errorMessage);
        console.error('Error fetching documents:', err);
        return [];
      }
    },
    enabled: !!physiotherapistId,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // Save document reference in the database
  const saveDocument = useMutation({
    mutationFn: async ({
      storageId,
      documentType,
      fileName,
      fileSize,
      contentType,
      targetPhysiotherapistId
    }: {
      storageId: Id<"_storage">,
      documentType: PhysioDocumentType,
      fileName: string,
      fileSize: number,
      contentType: string,
      targetPhysiotherapistId?: Id<"physiotherapistProfiles">
    }) => {
      const idToUse = targetPhysiotherapistId || physiotherapistId;
      if (!idToUse) {
        throw new Error('Physiotherapist profile ID is required');
      }

      try {
        const result = await convex.mutation(api.files.savePhysiotherapistDocument, {
          physiotherapistId: idToUse,
          storageId,
          documentType,
          fileName,
          fileSize,
          contentType,
        });
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to save document';
        console.error('Error saving document:', err);
        throw new Error(errorMessage);
      }
    },
    onSuccess: () => {
      // Invalidate and refetch the documents query
      documentsQuery.refetch();
    }
  });

  /**
   * Upload a document and save the reference in the database
   */
  const uploadDocument = async (file: File, documentType: PhysioDocumentType, overridePhysiotherapistId?: Id<"physiotherapistProfiles">) => {
    setError(null);
    const fileKey = `${file.name}-${file.size}-${documentType}`;

    const targetPhysiotherapistId = overridePhysiotherapistId || physiotherapistId;

    if (!targetPhysiotherapistId) {
      setError("Physiotherapist profile ID is required");
      return false;
    }

    if (!file) {
      setError("No file provided");
      return false;
    }

    // Validate file size (e.g., 10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setError(`File size too large. Maximum size is ${maxSize / (1024 * 1024)}MB`);
      return false;
    }

    // Validate file type - include both 'image/jpg' and 'image/jpeg'
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file type. Please upload PDF, JPEG, or PNG files only.');
      return false;
    }

    // Track uploading state for this specific file
    setUploadingFiles(prev => new Set(prev).add(fileKey));

    try {
      // Step 1: Upload the file to storage
      const result = await uploadFile(file);

      if (!result || !result.storageId) {
        setError("Failed to upload file to storage");
        return false;
      }

      // Step 2: Save the document reference in the database
      await saveDocument.mutateAsync({
        storageId: result.storageId,
        documentType,
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type,
        targetPhysiotherapistId,
      });

      // Success - the query will automatically refetch due to onSuccess
      return true;
    } catch (err) {
      console.error("Document upload error:", err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload document';
      setError(errorMessage);
      return false;
    } finally {
      // Remove from uploading state
      setUploadingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(fileKey);
        return newSet;
      });
    }
  };

  /**
   * Get documents of a specific type
   */
  const getDocumentsByType = (type: PhysioDocumentType): PhysiotherapistDocument[] => {
    return (documentsQuery.data || []).filter((doc: PhysiotherapistDocument) => doc.documentType === type);
  };

  /**
   * Delete a document
   */
  const deleteDocument = async (documentId: Id<"physiotherapistDocuments">) => {
    try {
      await convex.mutation(api.files.deletePhysiotherapistDocument, {
        documentId
      });
      // Refetch documents after deletion
      await documentsQuery.refetch();
      return true;
    } catch (err) {
      console.error("Document deletion error:", err);
      setError(err instanceof Error ? err.message : 'Failed to delete document');
      return false;
    }
  };

  return {
    documents: documentsQuery.data || [],
    licenseDocument: getDocumentsByType("licenseDocument")[0] || null,
    additionalCertificates: getDocumentsByType("additionalCertificate"),
    uploadDocument,
    deleteDocument,
    isUploading: isUploading || uploadingFiles.size > 0,
    uploadProgress: progress,
    isLoading: documentsQuery.isLoading,
    isFetching: documentsQuery.isFetching,
    error,
    clearError: () => setError(null),
    refreshDocuments: documentsQuery.refetch,
    hasLicenseDocument: getDocumentsByType("licenseDocument").length > 0,
    certificateCount: getDocumentsByType("additionalCertificate").length,
  };
}