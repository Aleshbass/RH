"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { Map } from "@/components/icons";

/**
 * Dynamically imported PhysioMapView component.
 * Prevents Mapbox GL JS from being included in the initial bundle.
 * SSR is disabled because Mapbox requires browser APIs.
 */
export const DynamicPhysioMapView = dynamic(
    () => import("./PhysioMapView").then((mod) => mod.PhysioMapView),
    {
        ssr: false,
        loading: () => (
            <div className="w-full h-full flex flex-col items-center justify-center bg-white rounded-2xl">
                <div className="animate-pulse flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-rh-canvas flex items-center justify-center">
                        <Map className="w-6 h-6 text-rh-ink" />
                    </div>
                    <div className="space-y-2 w-48">
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-3/4 mx-auto" />
                    </div>
                    <p className="text-xs text-rh-ink/50 mt-1">Loading map…</p>
                </div>
            </div>
        ),
    }
);
