"use client";

import React, { ChangeEvent, DragEvent, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, FileText, CheckCircle2, AlertCircle } from "@/components/icons";

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
    if (files.length === 0) return;

    if (multiple) {
      const existing = Array.isArray(value) ? value : value ? [value] : [];
      onChange([...existing, ...files]);
    } else {
      onChange(files[0] ?? null);
    }
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
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

  const files = Array.isArray(value) ? value : value ? [value] : [];

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-sm font-semibold text-[#002e2c] mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      <motion.div
        layout
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        animate={{
          scale: isDragging ? 1.02 : 1,
          borderColor: isDragging ? "#005b57" : error ? "#ef4444" : "#e5e7eb",
          backgroundColor: isDragging ? "rgba(0, 91, 87, 0.05)" : "rgba(255, 255, 255, 1)",
        }}
        transition={{ duration: 0.2 }}
        className={`
          relative w-full min-h-[160px] rounded-xl border-2 border-dashed
          flex flex-col items-center justify-center text-center
          px-6 py-8 cursor-pointer overflow-hidden group
          ${error ? "border-red-300 bg-red-50/30" : "border-gray-200 bg-white"}
        `}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={onInputChange}
          className="hidden"
        />

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative z-10 flex flex-col items-center"
        >
          <div className={`
            w-12 h-12 rounded-full flex items-center justify-center mb-4
            transition-colors duration-200
            ${isDragging ? "bg-[#005b57] text-white" : "bg-[#005b57]/10 text-[#005b57] group-hover:bg-[#005b57] group-hover:text-white"}
          `}>
            <Upload className="w-6 h-6" />
          </div>

          <p className="text-base font-medium text-gray-900 mb-1">
            <span className="text-[#005b57]">Click to upload</span> or drag and drop
          </p>
          <p className="text-sm text-gray-500">
            {accept ? `${accept.split(',').length > 3 ? 'Supported files' : accept.replace(/application\//g, '').replace(/image\//g, '').toUpperCase()}` : "Any file"}
            {' '}• Max {maxSizeInMB}MB
          </p>
        </motion.div>

        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
          <svg width="100%" height="100%">
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
      </motion.div>

      {helpText && !error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-2 text-sm text-gray-500"
        >
          {helpText}
        </motion.p>
      )}

      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {files.length > 0 && (
          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 space-y-2"
          >
            {files.map((file, i) => (
              <motion.li
                key={`${file.name}-${i}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-xl shadow-sm group hover:border-[#005b57]/30 transition-colors"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-lg bg-[#005b57]/10 flex items-center justify-center flex-shrink-0 text-[#005b57]">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {file.name}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatSize(file.size)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(file);
                    }}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export default FileUpload;
