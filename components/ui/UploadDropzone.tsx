"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

type UploadDropzoneProps = {
  label?: string;
  helperText?: string;
  accept?: string; // e.g. "image/*" or "application/pdf"
  maxSizeMb?: number;
  value?: File | null;
  onFileSelected: (file: File | null) => void;
  variant?: "image" | "file";
  name?: string;
  id?: string;
};

export function UploadDropzone({
  label,
  helperText,
  accept = "image/*",
  maxSizeMb = 5,
  value = null,
  onFileSelected,
  variant = "image",
  name,
  id,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0); // visual-only for now

  const revoke = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    return () => revoke();
  }, [revoke]);

  useEffect(() => {
    if (value && variant === "image") {
      const url = URL.createObjectURL(value);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [value, variant]);

  const handleFiles = (files: FileList | null) => {
    setError(null);
    if (!files || files.length === 0) {
      onFileSelected(null);
      return;
    }
    const file = files[0];
    const maxBytes = maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`File too large. Max ${maxSizeMb}MB`);
      onFileSelected(null);
      return;
    }
    onFileSelected(file);
    // Fake progress animation for UX
    setProgress(0);
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(95, Math.floor((elapsed / 800) * 100));
      setProgress(pct);
      if (pct >= 95) clearInterval(timer);
    }, 50);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const openFilePicker = () => inputRef.current?.click();

  const removeFile = () => {
    onFileSelected(null);
    setProgress(0);
    setError(null);
    revoke();
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={id} className="block text-base font-semibold text-[#002e2c]">
          {label}
        </label>
      )}

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={openFilePicker}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openFilePicker()}
        aria-label={label || "Upload file"}
        className={`w-full ${variant === "image" ? "h-40" : "h-28"} flex items-center justify-center rounded-lg border-2 border-dashed transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#005b57]/20 focus:border-[#005b57] ${
          dragActive ? "border-[#005b57] bg-[#005b57]/5" : "border-gray-300 bg-gray-50"
        }`}
      >
        <div className="text-center px-4">
          {variant === "image" && previewUrl ? (
            <Image src={previewUrl} alt="Selected preview" width={96} height={96} className="h-24 w-24 rounded-full object-cover mx-auto" />
          ) : (
            <>
              <p className="text-sm text-gray-700">
                Drag & drop or <span className="font-semibold text-[#005b57] underline">browse</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">{accept.includes("image") ? "PNG, JPG up to" : "Max"} {maxSizeMb}MB</p>
            </>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {progress > 0 && (
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden" aria-hidden>
          <div className="h-full bg-[#005b57] transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="flex items-center justify-between">
        {helperText && <p className="text-sm text-gray-600">{helperText}</p>}
        {value && (
          <button type="button" onClick={removeFile} className="text-sm text-red-600 hover:underline">
            Remove
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
