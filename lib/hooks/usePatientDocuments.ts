import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Id } from "@/convex/_generated/dataModel";
import { useFileUpload } from "./useFileUpload";
import { useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";

export type PatientDocumentType =
  | "referralLetter"
  | "medicalRecord"
  | "insuranceCard"
  | "otherDocument";

export interface PatientDocument {
  _id: Id<"patientDocuments">;
  patientProfileId: Id<"patientProfiles">;
  storageId: Id<"_storage">;
  documentType: PatientDocumentType;
  fileName: string;
  fileSize: number;
  contentType: string;
  uploadedAt: number;
  sharedWithPhysiotherapist?: boolean;
  downloadUrl: string;
}

interface UsePatientDocumentsProps {
  patientProfileId?: Id<"patientProfiles">;
}

export function usePatientDocuments({ patientProfileId }: UsePatientDocumentsProps) {
  const queryClient = useQueryClient();
  const convex = useConvex();
  const { uploadFile, isUploading: isFileUploading, progress, error: fileUploadError, resetUpload } = useFileUpload();

  const { data: documents, isLoading: isLoadingDocuments, error: documentsError } = useQuery<
    PatientDocument[],
    Error,
    PatientDocument[],
    [string, Id<"patientProfiles">?]
  >({
    queryKey: ["patientDocuments", patientProfileId],
    queryFn: async () => {
      if (!patientProfileId) return [];
      return await convex.query(api.files.getPatientDocuments, { patientProfileId }) as PatientDocument[];
    },
    enabled: !!patientProfileId,
  });

  const saveDocumentMutation = useMutation<
    Id<"patientDocuments">,
    Error,
    { storageId: Id<"_storage">; documentType: PatientDocumentType; fileName: string; profileIdToSave: Id<"patientProfiles"> },
    unknown
  >({
    mutationFn: async ({ storageId, documentType, fileName, profileIdToSave }) => {
      return await convex.mutation(api.files.savePatientDocument, {
        patientProfileId: profileIdToSave,
        storageId,
        documentType,
        fileName
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patientDocuments", patientProfileId] });
      resetUpload();
    }
  });

  const toggleSharingMutation = useMutation<
    boolean,
    Error,
    { documentId: Id<"patientDocuments">; shared: boolean },
    unknown
  >({
    mutationFn: async ({ documentId, shared }) => {
      return await convex.mutation(api.files.toggleDocumentSharing, { documentId, shared });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patientDocuments", patientProfileId] });
    }
  });

  const handleUploadAndSaveDocument = async (
    file: File,
    documentType: PatientDocumentType,
    profileIdToSave: Id<"patientProfiles"> // Explicitly pass patientProfileId for saving
  ) => {
    if (!profileIdToSave) {
      throw new Error("Your patient profile isn't ready yet. Please refresh and try again.");
    }
    // Errors reach the caller, so the page never reports a failed upload as a success
    const { storageId } = await uploadFile(file);
    if (!storageId) {
      throw new Error("The file didn't upload. Please try again.");
    }
    await saveDocumentMutation.mutateAsync({ storageId, documentType, fileName: file.name, profileIdToSave });
  };

  return {
    documents,
    isLoadingDocuments,
    documentsError,
    uploadPatientDocument: handleUploadAndSaveDocument,
    isUploadingPatientDocument: isFileUploading || saveDocumentMutation.isPending,
    uploadProgress: progress,
    uploadError: fileUploadError || saveDocumentMutation.error,
    resetUpload,
    toggleSharing: toggleSharingMutation.mutateAsync,
    isTogglingSharing: toggleSharingMutation.isPending,
  };
}
