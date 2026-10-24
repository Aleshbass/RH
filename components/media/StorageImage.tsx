"use client";

import React from "react";
import Image from "next/image";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface StorageImageProps {
  storageId: Id<"_storage"> | string;
  alt?: string;
  className?: string;
}

export function StorageImage({ storageId, alt = "", className }: StorageImageProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const url = useQuery(api.files.getFileUrl as any, {
    storageId: storageId as Id<"_storage">,
  });

  if (url === undefined) {
    return <div className={`bg-gray-100 animate-pulse ${className || "h-32 w-full"}`} />;
  }

  if (!url) {
    return <div className={`bg-gray-100 text-gray-400 flex items-center justify-center text-sm ${className || "h-32 w-full"}`}>Image unavailable</div>;
  }

  // Signed storage URL: served as is (width/height only reserve space; the class sets the size)
  return <Image src={url} alt={alt} width={800} height={600} unoptimized className={className} />;
}
