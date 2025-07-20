import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from "@/convex/_generated/api";
import { useConvex } from "convex/react";
import { Id } from "@/convex/_generated/dataModel";

interface FileUploadResult {
  storageId: Id<"_storage"> | null;
  fileName: string | null;
  isUploading: boolean;
  progress: number;
  error: string | null;
}

interface UseFileUploadOptions {
  onSuccess?: (result: { storageId: Id<"_storage">; fileName: string }) => void;
  onError?: (error: Error) => void;
}

/**
 * Custom hook for handling file uploads to Convex storage
 * 
 * @param options Configuration options including success and error callbacks
 * @returns Functions and state for file uploading
 */
export function useFileUpload(options?: UseFileUploadOptions) {
  const convex = useConvex();
  const [result, setResult] = useState<FileUploadResult>({
    storageId: null,
    fileName: null,
    isUploading: false,
    progress: 0,
    error: null,
  });

  // Generate upload URL mutation
  const generateUploadUrl = useMutation({
    mutationFn: async ({ file }: { file: File }) => {
      // Reset state for new upload
      setResult({
        storageId: null,
        fileName: null,
        isUploading: true,
        progress: 0,
        error: null,
      });

      try {
        // Step 1: Get the upload URL from Convex
        const uploadUrl = await convex.mutation(api.files.generateUploadUrl, {
          fileType: file.type,
          fileName: file.name,
        });

        if (!uploadUrl) {
          throw new Error('Failed to generate upload URL');
        }

        // Step 2: Upload the file to the generated URL
        const xhr = new XMLHttpRequest();
        
        // Set up progress tracking
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setResult(prev => ({ ...prev, progress }));
          }
        });

        // Create a promise to track the upload
        const uploadPromise = new Promise<Id<"_storage">>((resolve, reject) => {
          xhr.onreadystatechange = () => {
            if (xhr.readyState === XMLHttpRequest.DONE) {
              if (xhr.status === 200) {
                try {
                  const response = JSON.parse(xhr.responseText);
                  if (!response.storageId) {
                    reject(new Error('No storageId in response'));
                    return;
                  }
                  resolve(response.storageId);
                } catch (err) {
                  reject(new Error('Invalid response format'));
                }
              } else {
                reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.statusText}`));
              }
            }
          };

          xhr.onerror = () => {
            reject(new Error('Network error during upload'));
          };

          xhr.ontimeout = () => {
            reject(new Error('Upload timed out'));
          };
        });

        // Configure and send the request
        xhr.open('POST', uploadUrl, true);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.timeout = 30000; // 30 second timeout
        xhr.send(file);

        // Wait for upload to complete
        const storageId = await uploadPromise;

        // Update state with success
        const finalResult = {
          storageId,
          fileName: file.name,
          isUploading: false,
          progress: 100,
          error: null,
        };
        setResult(finalResult);

        // Call success callback if provided
        if (options?.onSuccess) {
          options.onSuccess({ storageId, fileName: file.name });
        }

        return { storageId, fileName: file.name };
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error during file upload');
        
        // Update state with error
        setResult({
          storageId: null,
          fileName: null,
          isUploading: false,
          progress: 0,
          error: error.message,
        });

        // Call error callback if provided
        if (options?.onError) {
          options.onError(error);
        }

        console.error('File upload error:', error);
        throw error;
      }
    }
  });

  /**
   * Upload a file to Convex storage
   */
  const uploadFile = async (file: File) => {
    try {
      return await generateUploadUrl.mutateAsync({ file });
    } catch (error) {
      console.error('File upload error:', error);
      throw error;
    }
  };

  /**
   * Reset the upload state
   */
  const resetUpload = () => {
    setResult({
      storageId: null,
      fileName: null,
      isUploading: false,
      progress: 0,
      error: null,
    });
  };

  return {
    uploadFile,
    resetUpload,
    ...result,
    isPending: generateUploadUrl.isPending,
  };
}
