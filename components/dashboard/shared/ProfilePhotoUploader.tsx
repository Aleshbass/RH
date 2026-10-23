"use client";

import React, { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { UploadDropzone } from "@/components/ui/UploadDropzone";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2, Upload } from "@/components/icons";
import { api } from "@/convex/_generated/api";
import { useFileUpload } from "@/lib/hooks/useFileUpload";
import { useMutationUntyped } from "@/lib/convexUntyped";

interface ProfilePhotoUploaderProps {
  currentImageUrl?: string | null;
  title?: string;
  description?: string;
  size?: "sm" | "md" | "lg";
}

// Convert an image File to WebP on the client for faster loading
async function convertImageToWebp(file: File, quality = 0.85): Promise<File> {
  return new Promise<File>((resolve, reject) => {
    try {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("Failed to create WebP blob"));
            const webpFile = new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), {
              type: "image/webp",
              lastModified: Date.now(),
            });
            resolve(webpFile);
          },
          "image/webp",
          quality
        );
      };
      img.onerror = () => reject(new Error("Failed to load image for conversion"));
      img.src = URL.createObjectURL(file);
    } catch (e) {
      reject(e as Error);
    }
  });
}

export function ProfilePhotoUploader({
  currentImageUrl,
  title = "Profile Photo",
  description = "Upload a clear photo. We convert it to WebP for faster loading.",
  size = "md",
}: ProfilePhotoUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const { uploadFile, isUploading, progress } = useFileUpload();

  // Untyped mutation to avoid deep generic instantiation
  const apiAny = api as unknown as Record<string, unknown>;
  const updateProfileImage = useMutationUntyped(
    (apiAny["users"] as Record<string, unknown>)["updateProfileImageFromStorage"]
  ) as (args: { storageId: string }) => Promise<{ imageUrl: string }>;

  const avatarSize = useMemo(() => {
    switch (size) {
      case "sm":
        return "h-16 w-16";
      case "lg":
        return "h-24 w-24";
      default:
        return "h-20 w-20";
    }
  }, [size]);

  const handleUpload = useCallback(
    async (selected: File | null) => {
      if (!selected) return;
      try {
        let toUpload = selected;
        // Only convert if it's an image and browser supports canvas.toBlob
        if (selected.type.startsWith("image/")) {
          try {
            toUpload = await convertImageToWebp(selected, 0.85);
          } catch {
            // Fallback: use the original file if conversion fails
            toUpload = selected;
          }
        }

        const res = await uploadFile(toUpload);
        if (!res?.storageId) throw new Error("Upload failed. No storageId returned.");

        await updateProfileImage({ storageId: res.storageId as unknown as string });
        toast.success("Profile photo updated");
        setFile(null);
      } catch (e) {
        const err = e as Error;
        toast.error(err.message || "Failed to upload profile photo");
      }
    },
    [uploadFile, updateProfileImage]
  );

  return (
    <div className="flex items-center gap-4">
      <div className="shrink-0">
        <Avatar className={`${avatarSize} ring-2 ring-white/70 shadow-sm`}>
          <AvatarImage src={currentImageUrl || undefined} />
          <AvatarFallback>U</AvatarFallback>
        </Avatar>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{title}</p>
            <p className="text-xs text-muted-foreground truncate">
              {description}
            </p>
          </div>
          <div className="hidden sm:block">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploading}
              onClick={() => {
                // Open a hidden file input via the dropzone ref-less approach
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/*";
                input.onchange = (e: Event) => {
                  const target = e.target as HTMLInputElement | null
                  handleUpload(target?.files?.[0] || null)
                };
                input.click();
              }}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading… {progress ? `${progress}%` : ""}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </div>
        </div>
        {/* Mobile friendly dropzone */}
        <div className="sm:hidden mt-3">
          <UploadDropzone
            accept="image/*"
            maxSizeMb={5}
            value={file}
            onFileSelected={(f) => {
              setFile(f);
              if (f) handleUpload(f);
            }}
            label="Tap to upload"
            helperText={isUploading ? `Uploading… ${progress || 0}%` : "PNG, JPG, HEIC up to 5MB"}
            variant="image"
          />
        </div>
      </div>
    </div>
  );
}
