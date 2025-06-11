import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Id } from "@/convex/_generated/dataModel";
import { useFileUpload } from "./useFileUpload";
import { useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";

export type ClinicDocumentType = 
  | "businessLicense"
  | "taxRegistration"
  | "insuranceProof"
  | "ownerIdentification"
  | "additionalDocument";

export interface ClinicDocument {
  _id: Id<"clinicDocuments">;
  clinicId: Id<"clinics">;
  storageId: Id<"_storage">;
  documentType: ClinicDocumentType;
  fileName: string;
  fileSize: number;
  contentType: string;
  uploadedAt: number;
  downloadUrl: string;
}

interface UseClinicDocumentsProps {
  clinicId?: Id<"clinics">;
}

export function useClinicDocuments({ clinicId }: UseClinicDocumentsProps) {
  const queryClient = useQueryClient();
  const convex = useConvex();
  const { uploadFile, isUploading: isFileUploading, progress, error: fileUploadError, resetUpload } = useFileUpload();

  const { data: documents, isLoading: isLoadingDocuments, error: documentsError } = useQuery<
    ClinicDocument[],
    Error,
    ClinicDocument[],
    [string, Id<"clinics">?]
  >({
    queryKey: ["clinicDocuments", clinicId],
    queryFn: async () => {
      if (!clinicId) return [];
      return await convex.query(api.files.getClinicDocuments, { clinicId }) as ClinicDocument[];
    },
    enabled: !!clinicId,
  });

  const saveDocumentMutation = useMutation<
    Id<"clinicDocuments">,
    Error,
    { storageId: Id<"_storage">; documentType: ClinicDocumentType; fileName: string; clinicIdToSave: Id<"clinics"> },
    unknown
  >({
    mutationFn: async ({ storageId, documentType, fileName, clinicIdToSave }) => {
      return await convex.mutation(api.files.saveClinicDocument, { 
        clinicId: clinicIdToSave, 
        storageId, 
        documentType, 
        fileName 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinicDocuments", clinicId] });
      resetUpload(); 
    }
  });

  const handleUploadAndSaveDocument = async (
    file: File,
    documentType: ClinicDocumentType,
    clinicIdToSave: Id<"clinics"> // Explicitly pass clinicId for saving
  ) => {
    if (!clinicIdToSave) {
      console.error("Clinic ID is required to save a document.");
      // Optionally, set an error state here to inform the UI
      return;
    }
    try {
      const { storageId } = await uploadFile(file);
      if (storageId) {
        await saveDocumentMutation.mutateAsync({ storageId, documentType, fileName: file.name, clinicIdToSave });
      }
    } catch (error) {
      console.error("Error uploading and saving document:", error);
      // Error is already handled by useFileUpload and saveDocumentMutation's error state
    }
  };

  return {
    documents,
    isLoadingDocuments,
    documentsError,
    uploadClinicDocument: handleUploadAndSaveDocument,
    isUploadingClinicDocument: isFileUploading || saveDocumentMutation.isPending,
    uploadProgress: progress,
    uploadError: fileUploadError || saveDocumentMutation.error,
    resetUpload, // Expose reset if needed by UI
  };
}
