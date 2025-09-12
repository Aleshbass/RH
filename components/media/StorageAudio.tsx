"use client";

import React from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface StorageAudioProps {
  storageId: Id<"_storage"> | string | null | undefined;
  className?: string;
}

export function StorageAudio({ storageId, className }: StorageAudioProps) {
  const enabled = !!storageId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const url = useQuery(api.files.getFileUrl as any, enabled ? { storageId: storageId as Id<"_storage"> } : "skip");

  if (!enabled) {
    return <div className={`bg-gray-100 text-gray-400 text-xs px-2 py-1 rounded ${className || "w-full"}`}>No audio</div>;
  }

  if (url === undefined) {
    return <div className={`bg-gray-100 animate-pulse rounded ${className || "h-10 w-full"}`} />;
  }

  if (!url) {
    return <div className={`bg-gray-100 text-gray-400 text-xs px-2 py-1 rounded ${className || "w-full"}`}>Audio unavailable</div>;
  }

  return (
    <audio controls className={className || "w-full"} src={url} />
  );
}

export default StorageAudio;
