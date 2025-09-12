"use client";

import React, { ChangeEvent, DragEvent, useRef, useState } from "react";

export interface FileUploadProps {
  id: string;
  label?: string;
  helpText?: string;
  accept?: string;
  multiple?: boolean;
  required?: boolean;
  value?: File | File[] | null;
  onChange: (files: File[] | File | null) => void;
  onError?: (error: string) => void;
  maxSizeInMB?: number;
  className?: string;
}

// Aceternity-inspired FileUpload UI with drag & drop + click to select
export function FileUpload({
  id,
  label,
  helpText,
  accept,
  multiple = false,
  required = false,
  value,
  onChange,
  onError,
  maxSizeInMB = 10,
  className,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const maxBytes = maxSizeInMB * 1024 * 1024;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const validateFile = (file: File): boolean => {
    if (file.size > maxBytes) {
      const msg = `File size must be less than ${maxSizeInMB}MB`;
      setError(msg);
      onError?.(msg);
      return false;
    }
    if (accept) {
      const accepted = accept.split(",").map((t) => t.trim());
      const isOk = accepted.some((t) => {
        if (t.endsWith("/*")) {
          const cat = t.split("/")[0];
          return file.type.startsWith(`${cat}/`);
        }
        return file.type === t;
      });
      if (!isOk) {
        const msg = `File type must be one of: ${accept}`;
        setError(msg);
        onError?.(msg);
        return false;
      }
    }
    setError(null);
    return true;
  };

  const handleFiles = (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) {
      onChange(multiple ? [] : null);
      return;
    }
    const files = Array.from(filesList).filter(validateFile);
    if (multiple) {
      // Merge with existing value if present
      const existing = Array.isArray(value) ? value : value ? [value] : [];
      onChange([...existing, ...files]);
    } else {
      onChange(files[0] ?? null);
    }
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    // Reset to allow re-selecting same file
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const removeFile = (fileToRemove: File) => {
    if (multiple) {
      const list = (Array.isArray(value) ? value : value ? [value] : []).filter(
        (f) => f !== fileToRemove
      );
      onChange(list.length ? list : null);
    } else {
      onChange(null);
    }
  };

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-[#002e2c]">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {helpText && <p className="mt-1 text-sm text-gray-500">{helpText}</p>}

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        className={[
          "mt-2 w-full min-h-40 rounded-lg border border-dashed",
          "bg-white dark:bg-black border-neutral-200 dark:border-neutral-800",
          "flex flex-col items-center justify-center text-center",
          "px-4 py-6 md:py-8 cursor-pointer transition-colors",
          isDragging ? "bg-neutral-50 dark:bg-neutral-900" : "",
        ].join(" ")}
        aria-label="File upload dropzone"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          className="h-8 w-8 text-neutral-500 mb-3"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 16v-8m0 0l-3 3m3-3l3 3M20 16.5v1.125A2.625 2.625 0 0117.375 20.25H6.625A2.625 2.625 0 014 17.625V16.5"
          />
        </svg>
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          Drag and drop files here or <span className="text-[#005b57] font-medium">click to upload</span>
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          {accept ? `Accepted: ${accept}` : "Any file"} • Max {maxSizeInMB}MB
        </p>

        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={onInputChange}
          className="hidden"
          aria-hidden="true"
        />
      </div>

      {error && (
        <div className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </div>
      )}

      {value && (
        <ul className="mt-3 space-y-2" aria-live="polite">
          {Array.isArray(value) ? (
            value.map((file, i) => (
              <li
                key={`${file.name}-${i}`}
                className="flex items-center justify-between rounded-md bg-neutral-50 p-2"
              >
                <div className="flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    className="h-4 w-4 text-[#005b57]"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span className="text-sm truncate max-w-[14rem] sm:max-w-xs">
                    {file.name}
                  </span>
                  <span className="text-xs text-neutral-500">({formatSize(file.size)})</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(file)}
                  className="text-neutral-500 hover:text-red-600 px-2 py-1"
                  aria-label={`Remove ${file.name}`}
                >
                  Remove
                </button>
              </li>)
            )
          ) : (
            <li className="flex items-center justify-between rounded-md bg-neutral-50 p-2">
              <div className="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  className="h-4 w-4 text-[#005b57]"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span className="text-sm truncate max-w-[14rem] sm:max-w-xs">
                  {(value as File).name}
                </span>
                <span className="text-xs text-neutral-500">
                  ({formatSize((value as File).size)})
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeFile(value as File)}
                className="text-neutral-500 hover:text-red-600 px-2 py-1"
                aria-label={`Remove ${(value as File).name}`}
              >
                Remove
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export default FileUpload
