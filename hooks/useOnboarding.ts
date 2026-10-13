import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";

export const TOUR_VERSION = 1;

export type TourStep = {
    target: string; // CSS selector or ID
    title: string;
    content: string;
    position?: "top" | "bottom" | "left" | "right";
};

export function useOnboarding() {
    const { isLoaded, isSignedIn } = useUser();
    const onboardingStatus = useQuery(api.users.getOnboardingStatus);
    const completeOnboardingMutation = useMutation(api.users.completeOnboarding);
    // Metrics are written by our server only (CONVEX_SERVER_SECRET), so go through the analytics route
    const recordMetric = (metric: { metric: string; value: number; metadata?: Record<string, unknown> }) =>
        fetch("/api/analytics/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "performance-metric", data: metric }),
        });

    const [showTour, setShowTour] = useState(false);
    const [isCompleted, setIsCompleted] = useState(false);

    useEffect(() => {
        if (!isLoaded || !isSignedIn) return;

        // Check localStorage first for immediate feedback
        const localCompleted = localStorage.getItem("hasCompletedOnboarding");
        const localVersion = localStorage.getItem("onboardingVersion");

        if (localCompleted === "true" && Number(localVersion) === TOUR_VERSION) {
            setIsCompleted(true);
            return;
        }

        // If Convex data is loaded, sync with it
        if (onboardingStatus) {
            if (onboardingStatus.hasCompletedOnboarding && onboardingStatus.onboardingVersion === TOUR_VERSION) {
                setIsCompleted(true);
                // Sync back to localStorage
                localStorage.setItem("hasCompletedOnboarding", "true");
                localStorage.setItem("onboardingVersion", String(TOUR_VERSION));
            } else {
                // User hasn't completed tour (or has old version)
                setShowTour(true);
            }
        }
    }, [isLoaded, isSignedIn, onboardingStatus]);

    const completeTour = async () => {
        setShowTour(false);
        setIsCompleted(true);

        // Optimistic update
        localStorage.setItem("hasCompletedOnboarding", "true");
        localStorage.setItem("onboardingVersion", String(TOUR_VERSION));

        // Persist to backend
        try {
            await Promise.all([
                completeOnboardingMutation({ version: TOUR_VERSION }),
                recordMetric({
                    metric: "onboarding_tour_completed",
                    value: 1,
                    metadata: { version: TOUR_VERSION }
                })
            ]);
        } catch (error) {
            console.error("Failed to save onboarding status:", error);
            // Revert optimistic update? Or just retry later?
            // For now, we keep the local state as truthy to avoid annoying the user
        }
    };

    const skipTour = () => {
        completeTour(); // Treat skip as completion for now (or use separate skipped state if needed)
    };

    return {
        showTour,
        completeTour,
        skipTour,
        isLoading: !isLoaded || onboardingStatus === undefined,
    };
}
