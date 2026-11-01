"use client";

import { ReactNode } from "react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
import { OfflineConvexClient } from "@/lib/offline/convexClient";

// Convex's client plus saved answers for offline use (lib/offline/convexClient.ts)
const convex = new OfflineConvexClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
