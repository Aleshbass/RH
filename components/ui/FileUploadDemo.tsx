"use client";
import React, { useState } from "react";
import { FileUpload } from "@/components/ui/file-upload";

export function FileUploadDemo() {
  const [, setFiles] = useState<File[]>([]);
  const handleFileUpload = (filesOrFile: File[] | File | null) => {
    const arr = Array.isArray(filesOrFile)
      ? filesOrFile
      : filesOrFile
      ? [filesOrFile]
      : [];
    setFiles(arr);
    console.log(arr);
  };

  return (
    <div className="w-full max-w-4xl mx-auto min-h-96 border border-dashed bg-white dark:bg-black border-neutral-200 dark:border-neutral-800 rounded-lg">
      <FileUpload id="demo-upload" onChange={handleFileUpload} />
    </div>
  );
}
